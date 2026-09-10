// The export — BUILD-SPEC §5 [v11], §11.
//
// One HTML file, with the event baked into it, that ownership opens by tapping
// an attachment in a text message. No network, no Load button, no folder of
// assets beside it: markup, styles, script, the event and the brand mark, all
// in one document that works in aeroplane mode out of a Downloads folder.
//
// WHY THIS ASSEMBLES RATHER THAN GENERATES. Everything the exported board runs
// is ordinary source in this repository — js/ownership.js, js/rooming.js,
// js/derive.js, the renders — fetched here and inlined verbatim. Nothing below
// writes JavaScript. That is the whole point: the range-splitting rules in
// rooming.js took real work, and a second implementation of them written into a
// template string would drift from the first inside a month. The harness makes
// the same rearrangement on both sides and compares the arrays, which is a
// check worth having only because there is one implementation to check.
//
// HOW ES MODULES BECOME ONE SCRIPT. The app has no build step (§3) and this
// does not add one — the rewrite happens in the browser, at export time, and is
// the smallest one that can work:
//
//   * `import { a, b } from './x.js';`  ->  `const { a, b } = __need('x.js');`
//   * `export function f`               ->  `function f`, plus one assignment
//                                            at the foot of the module.
//
// Each module becomes a function that runs once, in dependency order, in strict
// mode — which is what a module body is anyway. Nothing else about the source
// is touched, and anything the rewrite does not understand throws rather than
// shipping a file that fails silently in somebody's hand. There are no import
// cycles in the graph and `walk` refuses to build one.
//
// WHY NOT MODULES IN THE EXPORTED FILE. A `<script type="module">` inlined into
// a page opened from `file://` cannot import its siblings — the specifiers have
// nowhere to resolve to, and blob URLs from an opaque origin are refused by
// some browsers and not others. One classic script always runs.
//
// THE STYLES ARE TWO SYSTEMS, DELIBERATELY. css/ownership.css is the screen and
// applies always. css/styles.css and css/print.css are the *paper*, and are
// wrapped in `@media print` here: the exported file never shows a document on
// screen, so the generator's look cannot leak into the board, and what comes
// out of the printer is styled by exactly the rules that style it in the app.

import { brandFor } from './reference.js';
import { downloadBlob, slugify } from './io.js';

/** The entry module of the exported board. */
const ENTRY = 'ownership.js';

/** Where the module sources live, relative to this file. */
const JS_ROOT = new URL('./', import.meta.url);

/** Where the stylesheets and the logos live. */
const ROOT = new URL('../', import.meta.url);

/**
 * How tall the inlined logo is, in pixels.
 *
 * The sources are ~360px tall because §10 prints them into a 0.52in box, which
 * is over 500 dpi — far more than a phone header needs, and base64 adds a third
 * again on top. 160px is still 300 dpi in that box, which is print resolution
 * by any measure, and it is the difference between a 460KB wordmark and one
 * that costs a few tens of KB.
 */
const LOGO_HEIGHT = 160;

/** What §5 [v11] asks the whole file to stay under. Reported, never enforced. */
export const SIZE_CEILING = 500 * 1024;

/* ========================================================================== *
 * The module graph
 * ========================================================================== */

/** Resolve `./x.js` or `../x.js` against the importing module's id. */
function resolveId(fromId, specifier) {
  const parts = fromId.split('/').slice(0, -1);
  for (const step of specifier.split('/')) {
    if (step === '.' || step === '') continue;
    if (step === '..') parts.pop();
    else parts.push(step);
  }
  return parts.join('/');
}

/** Every `from '...'` in a module, in source order. */
function importsIn(source) {
  const found = [];
  for (const match of source.matchAll(/^import\s*(?:[^'"]*?from\s*)?'([^']+)'\s*;?/gm)) {
    found.push(match[1]);
  }
  return found;
}

/**
 * Fetch the entry and everything it reaches, depth first, so a module is always
 * emitted after the modules it needs.
 *
 * @param {string} entry module id relative to `js/`
 * @returns {Promise<{id: string, source: string}[]>} in dependency order
 */
async function walk(entry) {
  const done = new Map();
  const open = new Set();
  const order = [];

  const visit = async (id) => {
    if (done.has(id)) return;
    if (open.has(id)) {
      // Nothing in this app imports in a circle, and the rewrite below cannot
      // express one: a module body runs to completion before its exports are
      // readable. Saying so here means the export fails loudly on the day
      // somebody writes one, rather than shipping a file that is undefined.
      throw new Error(`Import cycle through ${id} — the export cannot inline it.`);
    }
    open.add(id);

    const response = await fetch(new URL(id, JS_ROOT));
    if (!response.ok) throw new Error(`Could not read js/${id} (${response.status}).`);
    const source = await response.text();

    for (const specifier of importsIn(source)) await visit(resolveId(id, specifier));

    open.delete(id);
    done.set(id, source);
    order.push({ id, source });
  };

  await visit(entry);
  return order;
}

/* ========================================================================== *
 * The rewrite
 * ========================================================================== */

/**
 * One module, as the body of a function.
 *
 * Two substitutions and a guard. The guard is the important one: an `import` or
 * an `export` the patterns did not understand would otherwise become a syntax
 * error inside somebody's attachment, discovered on a phone, in a lodge, on the
 * evening it was needed.
 *
 * @param {string} id
 * @param {string} source
 * @returns {string}
 */
function toFactory(id, source) {
  const exported = [];
  let body = source;

  body = body.replace(
    /^import\s*\{([^}]*)\}\s*from\s*'([^']+)'\s*;?/gm,
    (whole, names, specifier) => {
      const bindings = names.split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => {
          const [outer, inner] = name.split(/\s+as\s+/);
          return inner ? `${outer}: ${inner}` : outer;
        });
      return `const { ${bindings.join(', ')} } = __need(${JSON.stringify(resolveId(id, specifier))});`;
    }
  );

  // A side-effect import: run it for what it does, take nothing from it.
  body = body.replace(/^import\s*'([^']+)'\s*;?/gm,
    (whole, specifier) => `__need(${JSON.stringify(resolveId(id, specifier))});`);

  body = body.replace(
    /^export\s+(?=(?:async\s+)?(?:function\b|const\b|let\b|var\b|class\b))/gm,
    ''
  );
  for (const match of source.matchAll(
    /^export\s+(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm
  )) {
    exported.push(match[1]);
  }

  const left = body.match(/^\s*(?:import|export)\b.*$/m);
  if (left) throw new Error(`js/${id}: the export cannot rewrite "${left[0].trim()}"`);

  const tail = exported.map((name) => `  __out.${name} = ${name};`).join('\n');
  return `'use strict';\n${body}\n${tail}\n`;
}

/**
 * The module graph as one classic script.
 *
 * `</script` inside a source string would end the block early — the only thing
 * an inlined script has to be careful about, and it is careful about it here
 * rather than hoping no comment ever mentions one.
 *
 * @param {{id: string, source: string}[]} modules in dependency order
 * @returns {string}
 */
function bundle(modules) {
  const factories = modules.map(({ id, source }) =>
    `__mod[${JSON.stringify(id)}] = function (__out, __need) {\n${toFactory(id, source)}};`
  ).join('\n\n');

  const script = `(function () {
  var __mod = {};
  var __made = {};
  function __need(id) {
    if (__made[id]) return __made[id];
    var out = {};
    __made[id] = out;
    __mod[id](out, __need);
    return out;
  }

${factories}

  __need(${JSON.stringify(ENTRY)}).startOwnershipBoard();
}());`;

  return script.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

/* ========================================================================== *
 * The pieces that are not script
 * ========================================================================== */

/** A stylesheet, read as text. */
async function readCss(name) {
  const response = await fetch(new URL(`css/${name}`, ROOT));
  if (!response.ok) throw new Error(`Could not read css/${name} (${response.status}).`);
  return (await response.text()).replace(/<\/style/gi, '<\\/style');
}

/**
 * The brand mark, downscaled and inlined as a data URI.
 *
 * WebP first and PNG behind it, whichever comes back smaller: a wordmark at
 * this size is a few KB as WebP and tens of KB as PNG, and a browser that
 * cannot encode WebP silently hands back a PNG from `toDataURL`, which is why
 * the result is checked rather than assumed.
 *
 * An image that will not load is not an error worth stopping an export for —
 * the sheet prints with the header's box and no mark in it, which is a document
 * missing a logo rather than a coordinator missing a rooming sheet.
 *
 * @param {string} brandId
 * @returns {Promise<string>} a data URI, or '' when the logo could not be read
 */
async function inlineLogo(brandId) {
  const brand = brandFor(brandId);
  try {
    const image = new Image();
    image.decoding = 'sync';
    image.src = new URL(brand.logo, ROOT).href;
    await image.decode();

    const scale = Math.min(1, LOGO_HEIGHT / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = canvas.toDataURL('image/png');
    const webp = canvas.toDataURL('image/webp', 0.92);
    const usable = webp.startsWith('data:image/webp') && webp.length < png.length;
    return usable ? webp : png;
  } catch (err) {
    return '';
  }
}

/**
 * JSON safe to sit inside a `<script>` block.
 *
 * Only `<` needs escaping, and only because `</script` in a guest's note would
 * close the block early. The line separators that have to be escaped when JSON
 * is pasted into JavaScript are ordinary characters here: this is a data block
 * the parser hands back as text, and `JSON.parse` reads them.
 */
function embeddable(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** `illig-party-opening-weekend-2026-11-14-rooming.html`. §11 [v11]. */
export function exportFileName(event) {
  const meta = (event && event.meta) || {};
  const parts = [slugify(meta.eventName) || 'event', slugify(meta.startDate)].filter(Boolean);
  return `${parts.join('-')}-rooming.html`;
}

/* ========================================================================== *
 * The file
 * ========================================================================== */

/**
 * Build the exported board as one string of HTML.
 *
 * Nothing in the result references anything outside itself: no `src`, no
 * `href`, no `@import`, no font, no favicon over the network. That is checked
 * by tests/checks/export.mjs rather than promised here.
 *
 * @param {object} event
 * @returns {Promise<{html: string, logo: string}>}
 */
export async function buildExport(event) {
  const [modules, board, screen, paper, logo] = await Promise.all([
    walk(ENTRY),
    readCss('ownership.css'),
    readCss('styles.css'),
    readCss('print.css'),
    inlineLogo((event.meta || {}).brandId)
  ]);

  const name = String((event.meta || {}).eventName || '').trim() || 'Untitled event';

  const html = `<!DOCTYPE html>
<html lang="en" data-print="rooming">
<head>
<meta charset="utf-8">
<!-- viewport-fit=cover is what makes env(safe-area-inset-*) non-zero, which is
     what keeps the night tabs out from under the notch. -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Rooming — ${escapeHtml(name)}</title>
<!-- Inline, so the tab asks the network for nothing at all. -->
<link rel="icon" href="data:,">
<style>
${board}
</style>
<!-- The paper. The board never shows a document on screen, so the generator's
     styles are scoped to print: what comes out of the printer is styled by the
     same rules that style it in the app, and nothing of the app's look reaches
     the board. -->
<style media="print">
@media print {
${screen}
}
</style>
<style media="print">
${paper}
</style>
<!-- The running footer's @page rule, written by js/render.js at print time
     because counter(page) resolves nowhere but a margin box (§10). -->
<style id="board-page-rule" media="print"></style>
</head>
<body>
<div id="board"></div>

<!-- The same shape the app's previews have, so css/print.css does the same
     thing here as it does there and the printed sheet is the printed sheet. -->
<div id="previews">
  <div class="docview" data-view="rooming">
    <div class="paper" id="board-paper"></div>
  </div>
</div>

<script type="application/json" id="board-event">${embeddable(event)}</script>
<script type="text/plain" id="board-logo">${logo}</script>
<script>
${bundle(modules)}
</script>
</body>
</html>
`;

  return { html, logo };
}

/**
 * Build the board and hand it to the browser as a download.
 *
 * @param {object} event
 * @returns {Promise<{name: string, bytes: number, logoBytes: number}>} what was
 *   written, for the caller to say out loud — §5 [v11] asks for the size to be
 *   reported rather than assumed
 */
export async function exportRoomingBoard(event) {
  const { html, logo } = await buildExport(event);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const name = exportFileName(event);
  downloadBlob(name, blob);
  return { name, bytes: blob.size, logoBytes: logo.length };
}

/** Text that is going into markup rather than into a script. */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
