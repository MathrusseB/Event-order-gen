// Shared building blocks for the three documents — BUILD-SPEC §8.
//
// The renders are read-only. Nothing here is a form control, nothing writes to
// the event, and nothing reaches app.js: a render takes an event and returns
// DOM. That is what lets the same functions be called from a print button, from
// a preview, and — when §10's server-side port happens — from a page that has
// no application around it at all.
//
// **Every figure comes from derive.js.** No module under js/renders/ counts,
// sums, sorts by time, or resolves an id itself. A count computed here would be
// a second opinion about the same fact, and the whole point of §1 is that there
// is one (see `fnbCount`, `lodgingByBuilding`, `itineraryFor`). What these
// modules decide is what a fact *looks* like, and nothing more.
//
// ABSENCE IS PRINTED, NOT OMITTED — §8 [v8]. An enabled section holding nothing
// prints its heading and a quiet note; a meal with no menu prints its heading
// and a note. A heading with "None" under it was checked; a heading that is
// simply missing was forgotten, and nobody can tell those apart from the page.
// `emptyNote` below is that note, and it is deliberately the same shape
// everywhere so it reads as a statement about the data rather than a defect in
// the document.

import { attendeeName, dietaryNotes } from '../derive.js';
import { el } from '../dom.js';

/**
 * A document section: a grey header bar, then its body.
 *
 * The bar is the structural language of the reference documents and is the one
 * thing worth copying from them — it is what ownership's eye already uses to
 * find its way down a page.
 *
 * No `break-inside: avoid` reaches this element, ever. BUILD-SPEC §10 is
 * explicit and it is the correction v2 made to v1: sections have no length cap
 * and must be free to flow across pages. Only the rows inside them are held
 * together.
 *
 * @param {string} title
 * @param {Array<Node|string|false|null>} body
 * @param {string} [modifier] appended to the class as `sec--<modifier>`
 * @returns {HTMLElement}
 */
export function section(title, body, modifier = '') {
  return el('section', { class: `sec${modifier ? ` sec--${modifier}` : ''}` }, [
    el('h2', { class: 'sec__title', text: title }),
    el('div', { class: 'sec__body' }, body)
  ]);
}

/**
 * The quiet note an enabled-but-empty section prints instead of its content.
 * §8 [v8].
 *
 * @param {string} text
 * @returns {HTMLElement}
 */
export function emptyNote(text) {
  return el('p', { class: 'sec__empty', text });
}

/**
 * A bordered data table.
 *
 * The header row goes in a real `<thead>`, which is what makes it repeat on
 * continuation pages (§10 [v8]) — a `<tr>` of `<th>` sitting in the `<tbody>`
 * prints once and leaves every page after the first with unlabelled columns.
 *
 * @param {{label: string, class?: string}[]} columns
 * @param {Array<Array<Node|string>>} rows cells in column order
 * @param {string} [modifier] appended to the class as `tbl--<modifier>`
 * @returns {HTMLElement}
 */
export function table(columns, rows, modifier = '') {
  const head = el('tr', {}, columns.map((column) =>
    el('th', { scope: 'col', class: column.class || null, text: column.label })));

  const body = rows.map((cells) => el('tr', {}, cells.map((cell, index) => {
    const column = columns[index] || {};
    return el('td', { class: column.class || null },
      [cell === null || cell === undefined ? '' : cell]);
  })));

  return el('table', { class: `tbl${modifier ? ` tbl--${modifier}` : ''}` }, [
    el('thead', {}, [head]),
    el('tbody', {}, body)
  ]);
}

/**
 * Text with its line breaks preserved, as separate elements rather than as
 * `white-space: pre-wrap`.
 *
 * A free-text section is typed in a textarea and its blank lines are meant:
 * somebody separated two thoughts. Real block elements let each line be a break
 * opportunity, which is what makes a long note flow across a page boundary
 * instead of being held together and pushed whole onto the next page.
 *
 * Runs of blank lines collapse to one paragraph gap. Trailing blank lines — the
 * ones left behind by the Enter key — print nothing at all.
 *
 * @param {string} text
 * @param {string} [className]
 * @returns {HTMLElement[]}
 */
export function lines(text, className = 'para') {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const parts = block.split('\n');
      const children = [];
      parts.forEach((part, index) => {
        if (index > 0) children.push(el('br'));
        children.push(part);
      });
      return el('p', { class: className }, children);
    });
}

/**
 * Join the parts of a one-line summary, dropping the empty ones.
 *
 * A half-filled event is the normal state of an order a week out, and a header
 * reading "Dinner ·  · " tells the reader the document is broken when in fact
 * the location has not been picked yet.
 *
 * @param {Array<string|false|null|undefined>} parts
 * @param {string} [separator]
 * @returns {string}
 */
export function joinParts(parts, separator = ' · ') {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(separator);
}

/**
 * A name with a discreet tag beside it — "Nora Illig  child".
 *
 * BUILD-SPEC §5 (v5 changes): children are flagged, not aged. The tag is small,
 * lower case and grey on purpose. The Event Order goes to ownership, and a
 * guest list that shouts about the children reads like a medical form.
 *
 * @param {string} name
 * @param {string} [tag] omitted when empty
 * @returns {HTMLElement}
 */
export function nameWithTag(name, tag = '') {
  return el('span', { class: 'name' }, [
    el('span', { class: 'name__text', text: name }),
    tag ? el('span', { class: 'name__tag', text: tag }) : false
  ]);
}

/**
 * A list of names as one comma-separated line, marking the ones that resolve to
 * nobody so the page shows what the file actually holds.
 *
 * §12.3 is usually a deleted guest, and the room stays booked either way: the
 * name is printed as unresolved rather than dropped, because a room that goes
 * quiet on the sheet is how somebody ends up without a bed.
 *
 * @param {{text: string, resolved: boolean, isChild: boolean}[]} party from `partyOf`
 * @returns {HTMLElement[]}
 */
export function partyLine(party) {
  const nodes = [];
  party.forEach((person, index) => {
    if (index > 0) nodes.push(', ');
    nodes.push(el('span', {
      class: `party__name${person.resolved ? '' : ' is-unresolved'}`,
      text: person.text
    }));
  });
  return nodes;
}

/**
 * The allergies and dietary block, with names. §7 [v5], §8 [v8].
 *
 * Names, not strings: "Kim Palmer — shellfish" is the useful line, and
 * "shellfish" on its own tells the kitchen nothing about which plate.
 *
 * @param {object} event
 * @param {boolean} [heading] false where the block already sits under a section
 *   bar of its own — on the Menu, where it is a section rather than the tail of
 *   the F&B one, its own heading would only repeat the bar above it
 * @returns {HTMLElement}
 */
export function dietaryBlock(event, heading = true) {
  const notes = dietaryNotes(event);
  return el('div', { class: 'diet' }, [
    heading ? el('h3', { class: 'diet__head', text: 'Allergies and dietary' }) : false,
    notes.length
      ? el('ul', { class: 'diet__list' }, notes.map((attendee) =>
          el('li', { class: 'diet__item' }, [
            el('span', { class: 'diet__who', text: attendeeName(attendee) || 'Unnamed guest' }),
            el('span', { class: 'diet__what', text: String(attendee.dietary || '').trim() })
          ])))
      // §8 [v8]: printed, not omitted. "None known" was checked; a missing
      // block was forgotten, and the kitchen cannot tell which from the page.
      : el('p', { class: 'diet__none', text: 'None known.' })
  ]);
}
