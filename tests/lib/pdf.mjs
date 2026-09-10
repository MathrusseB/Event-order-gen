// Just enough PDF to answer one question: does this page have anything on it?
//
// The check this serves — no printed page may carry the furniture and nothing
// else — needs to know which pages carry ink and which are blank. That is a
// smaller question than "what does this page say", and it is answered without
// decoding a single glyph: PDF page content is a stream of drawing operators,
// and a page nobody drew on has none of them.
//
// Two things make this tractable. Chromium's PDF writer emits classic,
// uncompressed indirect objects with `Flate`d content streams — no
// cross-reference streams, no object streams — and the harness prints with the
// running header made `visibility: hidden` and the footer margin boxes emptied,
// so every operator left on a page came from the document body. Ink therefore
// means body, and no ink means an empty body.
//
// White is not ink. Chrome paints the page's own white background as a filled
// rectangle on every sheet including the blank ones, so a fill is only counted
// when the colour it was filled with is not white.

import zlib from 'node:zlib';

/** Operators that show text. */
const TEXT_OPERATORS = new Set(['Tj', 'TJ', "'", '"']);

/** Operators that paint a path with the current fill colour. */
const FILL_OPERATORS = new Set(['f', 'F', 'f*', 'B', 'B*', 'b', 'b*']);

/** Operators that paint a path with the current stroke colour. */
const STROKE_OPERATORS = new Set(['S', 's']);

/** Whitespace and the characters that end a token. */
const DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);
const WHITESPACE = new Set([' ', '\n', '\r', '\t', '\f', '\0']);

/**
 * The pages of a PDF, in document order, each with what was drawn on it.
 *
 * @param {Buffer} bytes
 * @returns {{number: number, ink: {text: number, images: number, marks: number},
 *   hasInk: boolean}[]}
 */
export function readPages(bytes) {
  const raw = bytes.toString('latin1');
  const objects = indexObjects(raw, bytes);
  const pages = pageObjects(objects);

  return pages.map((page, index) => {
    const content = contentOf(page, objects);
    const ink = scanInk(content);
    return {
      number: index + 1,
      ink,
      hasInk: ink.text > 0 || ink.images > 0 || ink.marks > 0
    };
  });
}

/* ------------------------------------------------------------ file structure */

/**
 * Every `N 0 obj ... endobj` in the file, by object number.
 *
 * The dictionary is read by balancing `<<` and `>>` rather than by searching
 * for `endobj`, because a compressed stream may contain that word by chance.
 *
 * @returns {Map<number, {dict: string, stream: Buffer|null}>}
 */
function indexObjects(raw, bytes) {
  const objects = new Map();
  const header = /(\d+)\s+\d+\s+obj\b/g;
  let match;

  while ((match = header.exec(raw)) !== null) {
    const number = Number(match[1]);
    let cursor = skipSpace(raw, match.index + match[0].length);

    let dict = '';
    if (raw.startsWith('<<', cursor)) {
      const end = matchDictionary(raw, cursor);
      dict = raw.slice(cursor, end);
      cursor = skipSpace(raw, end);
    }

    let stream = null;
    if (raw.startsWith('stream', cursor)) {
      let start = cursor + 'stream'.length;
      if (raw[start] === '\r') start += 1;
      if (raw[start] === '\n') start += 1;
      const declared = /\/Length\s+(\d+)/.exec(dict);
      const end = declared
        ? start + Number(declared[1])
        : raw.indexOf('endstream', start);
      stream = bytes.subarray(start, end);
    }

    objects.set(number, { dict, stream });
  }

  return objects;
}

/** The index just past the `>>` that closes the dictionary opening at `from`. */
function matchDictionary(raw, from) {
  let depth = 0;
  let index = from;
  while (index < raw.length) {
    if (raw.startsWith('<<', index)) {
      depth += 1;
      index += 2;
    } else if (raw.startsWith('>>', index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
    } else if (raw[index] === '(') {
      index = skipLiteralString(raw, index);
    } else {
      index += 1;
    }
  }
  return index;
}

/** The index just past the `)` closing the string opening at `from`. */
function skipLiteralString(raw, from) {
  let index = from + 1;
  let depth = 1;
  while (index < raw.length && depth > 0) {
    const char = raw[index];
    if (char === '\\') index += 2;
    else {
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
  }
  return index;
}

function skipSpace(raw, from) {
  let index = from;
  while (index < raw.length && WHITESPACE.has(raw[index])) index += 1;
  return index;
}

/**
 * The page objects, in the order the page tree puts them.
 *
 * Reading order matters: "the last page is blank" is a claim about position,
 * and object numbers are not positions. Chromium happens to write pages in
 * order, and this walks `/Kids` anyway so that it stays true if it stops
 * happening.
 */
function pageObjects(objects) {
  const catalog = [...objects.values()].find((object) => /\/Type\s*\/Catalog\b/.test(object.dict));
  const rootRef = catalog && /\/Pages\s+(\d+)\s+\d+\s+R/.exec(catalog.dict);
  const pages = [];

  const walk = (number, seen) => {
    if (seen.has(number)) return;
    seen.add(number);
    const node = objects.get(number);
    if (!node) return;
    if (/\/Type\s*\/Page\b(?!s)/.test(node.dict)) {
      pages.push(node);
      return;
    }
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(node.dict);
    if (!kids) return;
    for (const ref of kids[1].matchAll(/(\d+)\s+\d+\s+R/g)) walk(Number(ref[1]), seen);
  };

  if (rootRef) walk(Number(rootRef[1]), new Set());

  // A file with no readable page tree is a failure of this parser, not a pass
  // for the document. Fall back to every page object in file order.
  if (!pages.length) {
    for (const object of objects.values()) {
      if (/\/Type\s*\/Page\b(?!s)/.test(object.dict)) pages.push(object);
    }
  }
  return pages;
}

/** A page's content streams, inflated and concatenated. */
function contentOf(page, objects) {
  const single = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(page.dict);
  const array = /\/Contents\s*\[([^\]]*)\]/.exec(page.dict);
  const numbers = single
    ? [Number(single[1])]
    : (array ? [...array[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((ref) => Number(ref[1])) : []);

  return numbers
    .map((number) => {
      const object = objects.get(number);
      if (!object || !object.stream) return '';
      if (!/\/Filter\s*\/FlateDecode/.test(object.dict)) return object.stream.toString('latin1');
      try {
        return zlib.inflateSync(object.stream).toString('latin1');
      } catch {
        try {
          return zlib.inflateRawSync(object.stream).toString('latin1');
        } catch {
          // An unreadable stream is treated as ink: a page this parser cannot
          // read must not be reported as blank.
          return '(unreadable) Tj';
        }
      }
    })
    .join('\n');
}

/* ------------------------------------------------------------------- the ink */

/**
 * Count what a content stream actually paints.
 *
 * The tokenizer is the small part of PDF that operator classification needs:
 * operands are skipped, operators are read, and the colour operators are
 * tracked so a white fill can be told from a grey one.
 *
 * @param {string} content
 * @returns {{text: number, images: number, marks: number}}
 */
function scanInk(content) {
  const ink = { text: 0, images: 0, marks: 0 };
  let operands = [];
  let fill = null;
  let stroke = null;
  let textMode = 0;
  let index = 0;

  while (index < content.length) {
    const char = content[index];

    if (WHITESPACE.has(char)) {
      index += 1;
      continue;
    }
    if (char === '%') {
      while (index < content.length && content[index] !== '\n') index += 1;
      continue;
    }
    if (char === '(') {
      const end = skipLiteralString(content, index);
      operands.push({ kind: 'string', value: content.slice(index + 1, end - 1) });
      index = end;
      continue;
    }
    if (content.startsWith('<<', index)) {
      const end = matchDictionary(content, index);
      operands.push({ kind: 'dict' });
      index = end;
      continue;
    }
    if (char === '<') {
      const end = content.indexOf('>', index);
      operands.push({ kind: 'string', value: content.slice(index + 1, end < 0 ? undefined : end) });
      index = end < 0 ? content.length : end + 1;
      continue;
    }
    if (char === '/') {
      let end = index + 1;
      while (end < content.length && !WHITESPACE.has(content[end]) && !DELIMITERS.has(content[end])) {
        end += 1;
      }
      operands.push({ kind: 'name', value: content.slice(index + 1, end) });
      index = end;
      continue;
    }
    if (char === '[' || char === ']' || char === '{' || char === '}') {
      operands.push({ kind: 'bracket', value: char });
      index += 1;
      continue;
    }

    let end = index;
    while (end < content.length && !WHITESPACE.has(content[end]) && !DELIMITERS.has(content[end])) {
      end += 1;
    }
    const token = content.slice(index, end === index ? index + 1 : end);
    index = end === index ? index + 1 : end;

    if (/^[-+.\d]/.test(token) && !Number.isNaN(Number(token))) {
      operands.push({ kind: 'number', value: Number(token) });
      continue;
    }

    // An operator: everything before it was its operands.
    const numbers = operands.filter((operand) => operand.kind === 'number').map((o) => o.value);

    if (['g', 'rg', 'k', 'sc', 'scn'].includes(token)) fill = numbers;
    else if (['G', 'RG', 'K', 'SC', 'SCN'].includes(token)) stroke = numbers;
    else if (token === 'Tr') textMode = numbers[numbers.length - 1] ?? 0;
    // Text render modes 3 and 7 paint nothing — they are the invisible modes.
    else if (TEXT_OPERATORS.has(token) && textMode !== 3 && textMode !== 7) ink.text += 1;
    else if (token === 'Do') ink.images += 1;
    else if (token === 'sh') ink.marks += 1;
    else if (FILL_OPERATORS.has(token) && !isWhite(fill)) ink.marks += 1;
    else if (STROKE_OPERATORS.has(token) && !isWhite(stroke)) ink.marks += 1;

    operands = [];
  }

  return ink;
}

/**
 * Whether a colour is white in the space its operand count implies.
 *
 * An unset or unrecognised colour is *not* white: an unknown colour that turns
 * out to be black would hide a page full of text, and the harness must fail
 * loudly rather than quietly pass.
 */
function isWhite(colour) {
  if (!Array.isArray(colour) || !colour.length) return false;
  if (colour.length === 1) return colour[0] === 1;
  if (colour.length === 3) return colour.every((channel) => channel === 1);
  if (colour.length === 4) return colour.every((channel) => channel === 0);
  return false;
}
