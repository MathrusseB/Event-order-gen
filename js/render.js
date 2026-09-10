// The document shell — BUILD-SPEC §8, §10.
//
// Page furniture, the brand header, and the one thing that decides what a
// printer receives. The bodies live in js/renders/; this wraps them.
//
// HOW THE PAGE FURNITURE WORKS — read this before touching print.css.
//
// Two mechanisms, and they are not interchangeable. Both were chosen by
// printing to PDF and looking at the result, not by preference:
//
//   * The **running header** — logo, event name, date range, event lead — is
//     the `<thead>` of a wrapper table around the whole document. A browser
//     repeats a `thead` at the top of every page *and reserves its height*, so
//     the body never slides underneath it. The obvious alternative, a
//     `position: fixed` header, repeats but reserves nothing, and in Chrome it
//     is dropped from the last page outright — a two-page order prints its
//     header once. The wrapper table is one element of pagination scaffolding
//     and everything inside it stays ordinary semantic HTML.
//
//   * The **running footer** — the page number and the revision line — is
//     `@page` margin boxes, written by `printRule()` below. `counter(page)` and
//     `counter(pages)` resolve only inside a margin box; the same counters in
//     ordinary flow content render as zero. That is why the revision line goes
//     up there with the number instead of sitting in a footer element: the two
//     belong on one line, and only one of them can be anywhere else.
//
// Margin boxes take strings, not markup, so the revision line is escaped into
// generated CSS. That is also why the logo is *not* up there — `content: url()`
// in a margin box does not paint in Chrome.
//
// ONLY THE ACTIVE DOCUMENT PRINTS (§8 [v8]). `printDocument` stamps the chosen
// document on `<html>` and print.css hides everything else — the editors, the
// shell, and the other two documents. Nothing is left in the output collapsed
// or unstyled: a Menu print produces the Menu and nothing around it.

import { eventOrder } from './renders/order.js';
import { menuDocument } from './renders/menu.js';
import { roomingDocument } from './renders/rooming.js';
import { brandFor } from './reference.js';
import { formatDateLong, formatDateRange } from './dates.js';
import { el } from './dom.js';

/**
 * The three documents, in the order they are offered. §8.
 *
 * Each descriptor names its own brand: A and C follow `meta.brandId`, B is
 * always Maple Ranch (§5, v8 changes). The asymmetry lives in the descriptors
 * rather than in a branch here, so there is no single place tempted to make the
 * three agree.
 */
export const DOCUMENTS = [eventOrder, menuDocument, roomingDocument];

/** A document descriptor by id, or null. */
export function documentById(id) {
  return DOCUMENTS.find((doc) => doc.id === id) || null;
}

/**
 * Render one document: page furniture around its body.
 *
 * @param {object} event
 * @param {{id: string, label: string, brandId: Function, body: Function}} doc
 * @returns {HTMLElement}
 */
export function renderDocument(event, doc) {
  const brand = brandFor(doc.brandId(event));
  const body = event ? doc.body(event) : [];

  // The wrapper table is pagination scaffolding, not a data table. It is marked
  // `presentation` so a screen reader walks the document rather than announcing
  // a one-column table around it.
  return el('article', {
    class: `doc doc--${doc.id}`,
    'data-doc': doc.id,
    'data-brand': brand.id
  }, [
    el('table', { class: 'doc__sheet', role: 'presentation' }, [
      el('thead', { class: 'doc__runhead' }, [
        el('tr', {}, [el('td', {}, [runningHeader(event, doc, brand)])])
      ]),
      el('tbody', {}, [
        el('tr', {}, [el('td', { class: 'doc__cell' }, [
          el('div', { class: 'doc__body' }, body)
        ])])
      ])
    ])
  ]);
}

/**
 * The furniture at the head of every page: the brand logo, the event name, the
 * date range, and the event lead. §8 A.
 *
 * The logo sits in a fixed box (§6 [v8]) — the five brands run from a 3.48:1
 * wordmark to a 0.83:1 portrait crest, and the header has to occupy the same
 * height whichever one an event carries, or a Bloody Feather order will not
 * line up against a Maple Ranch one.
 *
 * Placeholders rather than blanks: an order printed a week out is normally half
 * filled, and a header reading nothing at all looks like a broken document
 * rather than an unfinished one.
 */
function runningHeader(event, doc, brand) {
  const meta = (event && event.meta) || {};
  const name = String(meta.eventName || '').trim();
  const dates = formatDateRange(meta.startDate, meta.endDate);
  const lead = String(meta.eventLead || '').trim();

  return el('div', { class: 'runhead' }, [
    el('div', { class: 'runhead__brandbox' }, [
      el('img', {
        class: 'runhead__logo',
        src: brand.logo,
        alt: brand.name,
        // Decoding synchronously keeps the logo from arriving after the print
        // dialog has already snapshotted the page.
        decoding: 'sync'
      })
    ]),
    el('div', { class: 'runhead__ident' }, [
      el('p', { class: 'runhead__kind', text: doc.label }),
      el('h1', { class: 'runhead__event', text: name || 'Untitled event' }),
      el('p', { class: 'runhead__meta' }, [
        el('span', { class: 'runhead__dates', text: dates || 'Dates not set' }),
        el('span', { class: 'runhead__lead' }, [
          el('span', { class: 'runhead__leadlabel', text: 'Event lead' }),
          el('span', { class: 'runhead__leadname', text: lead || 'Not set' })
        ])
      ])
    ])
  ]);
}

/**
 * The revision line. §7 — `meta.revisionDate` + `meta.revisedBy`.
 *
 * Printed at the foot of every page, because the one question asked of a
 * reissued order is which copy somebody is holding.
 *
 * @param {object} event
 * @returns {string}
 */
export function revisionLine(event) {
  const meta = (event && event.meta) || {};
  const date = formatDateLong(meta.revisionDate);
  const by = String(meta.revisedBy || '').trim();
  if (date && by) return `Revised ${date} by ${by}`;
  if (date) return `Revised ${date}`;
  if (by) return `Revised by ${by}`;
  return 'Revision not recorded';
}

/**
 * The `@page` rule for the document about to print.
 *
 * Everything here has to be a CSS string: margin boxes take `content`, not
 * markup. `counter(page)` and `counter(pages)` are the reason the footer is
 * built this way at all — they resolve nowhere else (§10).
 *
 * @param {object} event
 * @returns {string} CSS
 */
export function printRule(event) {
  return `@page {
  size: letter;
  margin: 0.75in;

  @bottom-left {
    content: ${cssString(revisionLine(event))};
    font: 7.5pt/1 "Iowan Old Style", Palatino, Georgia, serif;
    color: #4a5457;
    vertical-align: top;
    padding-top: 0.16in;
  }

  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font: 7.5pt/1 "Iowan Old Style", Palatino, Georgia, serif;
    color: #4a5457;
    vertical-align: top;
    padding-top: 0.16in;
  }
}`;
}

/**
 * A JavaScript string as a CSS string literal.
 *
 * The revision line is `revisedBy`, which is typed by a person: a stray
 * apostrophe or backslash would otherwise end the literal early and take the
 * rest of the rule with it. Newlines are escaped rather than stripped, because
 * a CSS string may not contain a raw one.
 *
 * @param {string} value
 * @returns {string}
 */
function cssString(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\A ');
  return `"${escaped}"`;
}
