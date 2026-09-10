// Document destinations and printing — BUILD-SPEC §8, §10.
//
// The shell has four places to be: the editors, and one per document. This
// module owns the switch between them and the print action on each.
//
// NOTHING IS UNMOUNTED WHEN A VIEW CHANGES. The editors stay in the DOM,
// hidden, for the whole session. That is the entire mechanism behind "moving
// between editing and previewing should not lose unsaved work": the event lives
// in app.js and is never touched here, and the editors' own DOM — every caret
// position, every open date picker, every half-typed surname — is still exactly
// where it was when the user left it. Rebuilding the editors on the way back
// would satisfy the letter of that requirement and lose the thing it is
// actually about.
//
// Scroll position is remembered per view rather than shared. The four views are
// different lengths, so one scroll offset carried between them lands somewhere
// arbitrary; and coming back to a form you were halfway down, at the top, is
// the small daily annoyance this exists to prevent. Focus is restored with it,
// for the same reason.
//
// A preview is rebuilt only when it is on screen and the event has changed
// under it. The renders are cheap, but the form writes on every keystroke, and
// rebuilding three documents per character typed would be three documents of
// work nobody is looking at.

import { getEvent, subscribe } from './app.js';
import { DOCUMENTS, documentById, renderDocument, printRule } from './render.js';
import { el, setHidden, toggleClass } from './dom.js';

/** The editing view's id. Not a document — there is nothing to print from it. */
const EDIT = 'edit';

/**
 * What `Ctrl+P` prints when the user has never pressed a print button.
 *
 * Something has to be the answer: print.css leaves exactly one document in the
 * output (§8 [v8]), so an unset target would print a blank page. The Event
 * Order is the document this tool exists to produce, and it is the least
 * surprising thing to receive from a print you did not aim.
 */
const DEFAULT_PRINT = 'order';

const previews = new Map();
const stale = new Set();
const scrollByView = new Map();

/** [v10] The shell's print control — a document to print, and the button. */
let printPicker = null;

let view = EDIT;
let printTarget = DEFAULT_PRINT;
let lastEditFocus = null;
let workbench = null;
let region = null;
let pageStyle = null;

/**
 * Build the view switcher and the previews, and start listening.
 *
 * @param {{nav: HTMLElement, workbench: HTMLElement, region: HTMLElement,
 *   printTarget: HTMLSelectElement, printButton: HTMLElement}} refs
 */
export function mountViews(refs) {
  workbench = refs.workbench;
  region = refs.region;

  // The generated `@page` rule — the running footer, which has to be CSS
  // because `counter(page)` resolves nowhere else (see render.js).
  pageStyle = el('style', { id: 'doc-page-rule', media: 'print' });
  document.head.append(pageStyle);

  refs.nav.append(viewButton(EDIT, 'Edit'));
  for (const doc of DOCUMENTS) {
    refs.nav.append(viewButton(doc.id, doc.label));
    region.append(createPreview(doc));
    stale.add(doc.id);
  }

  // [v10] §10 — print is the primary output and does not require opening a
  // preview first. The select carries the same three documents as the tabs, so
  // there is one list and it cannot come to disagree with what exists.
  printPicker = refs.printTarget;
  printPicker.replaceChildren(...DOCUMENTS.map((doc) =>
    el('option', { value: doc.id, text: doc.label })));
  printPicker.value = printTarget;
  printPicker.addEventListener('change', () => {
    printTarget = printPicker.value;
    document.documentElement.dataset.print = printTarget;
  });
  refs.printButton.addEventListener('click', () => printDocument(printPicker.value));

  document.documentElement.dataset.view = EDIT;
  document.documentElement.dataset.print = printTarget;

  // A print raised from the keyboard, or from the browser's own menu, still has
  // to produce the document the user is looking at.
  window.addEventListener('beforeprint', () => {
    build(printTarget);
  });

  subscribe(onEvent);
}

/** One tab in the switcher. */
function viewButton(id, label) {
  const button = el('button', {
    type: 'button',
    class: 'btn btn--onbar viewtab',
    'data-view': id,
    'aria-pressed': 'false',
    text: label
  });
  button.addEventListener('click', () => setView(id));
  return button;
}

/**
 * One preview: a bar carrying the document's own print action, and the paper.
 *
 * Each document prints on its own — there is no combined print (§8 [v8], §10)
 * — so the action lives with the document rather than once in the toolbar,
 * where it would need to ask which one you meant.
 */
function createPreview(doc) {
  const paper = el('div', { class: 'paper', id: `paper-${doc.id}` });

  const print = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    text: `Print ${doc.label}`
  });
  print.addEventListener('click', () => printDocument(doc.id));

  const node = el('div', { class: 'docview', 'data-view': doc.id, hidden: true }, [
    el('div', { class: 'docview__bar' }, [
      el('div', { class: 'docview__naming' }, [
        el('h2', { class: 'docview__title', text: doc.label }),
        el('p', { class: 'docview__note', text: previewNote(doc.id) })
      ]),
      print
    ]),
    paper
  ]);

  previews.set(doc.id, { node, paper, doc });
  return node;
}

/**
 * The one sentence each preview says about itself.
 *
 * The Menu's is the one that matters: its brand does not follow the event's,
 * and somebody who has just set an event to Bloody Feather and finds a Maple
 * Ranch menu deserves to be told why on the page rather than left to file a bug
 * against it (§5, v8 changes).
 */
function previewNote(id) {
  if (id === 'menu') {
    return 'Always Maple Ranch. The menu is the ranch’s culinary product, not the visiting '
      + 'group’s, so it does not follow the event’s brand.';
  }
  if (id === 'rooming') return 'Carries the event’s brand. Rooms down, nights across.';
  return 'Carries the event’s brand. Prints the sections you have turned on, in outline order.';
}

/**
 * Switch views, keeping everything the last one was holding.
 *
 * @param {string} next `edit`, or a document id
 */
export function setView(next) {
  if (next === view) return;

  scrollByView.set(view, window.scrollY);
  if (view === EDIT) lastEditFocus = focusInside(workbench);

  view = next;
  const editing = view === EDIT;
  document.documentElement.dataset.view = view;

  setHidden(workbench, !editing);
  setHidden(region, editing);
  for (const [id, preview] of previews) setHidden(preview.node, id !== view);

  for (const tab of document.querySelectorAll('.viewtab')) {
    const on = tab.dataset.view === view;
    tab.setAttribute('aria-pressed', String(on));
    toggleClass(tab, 'is-on', on);
  }

  if (!editing) {
    // Printing from a document you are looking at should print that one, with
    // no button press in between.
    printTarget = view;
    document.documentElement.dataset.print = view;
    // [v10] And the shell's print control follows, so the two never disagree
    // about which document the next print will produce.
    if (printPicker) printPicker.value = view;
    build(view);
  }

  // After the swap, so the restored offset is measured against the new height.
  window.scrollTo({ top: scrollByView.get(view) || 0, behavior: 'auto' });
  if (editing && lastEditFocus && lastEditFocus.isConnected) {
    lastEditFocus.focus({ preventScroll: true });
  }
}

/** The focused element, if it is inside `root`. */
function focusInside(root) {
  const active = document.activeElement;
  return active && root && root.contains(active) ? active : null;
}

/**
 * Print one document. §8 [v8] — the other two, and the shell, stay out of it.
 *
 * The stamp on `<html>` is the whole mechanism: print.css hides everything and
 * then shows the one document that matches. Nothing is left in the output
 * collapsed or unstyled, so there are no blank pages where the others were.
 *
 * @param {string} id
 */
export function printDocument(id) {
  if (!documentById(id)) return;
  printTarget = id;
  document.documentElement.dataset.print = id;
  if (printPicker) printPicker.value = id;
  // [v10] Built even when its preview is hidden behind the editing view: print
  // reaches the document through print.css, which shows the one stamped on
  // `<html data-print>` whatever the screen is doing, so the only requirement
  // is that the DOM be there and current.
  build(id);
  window.print();
}

/** Rebuild a preview if the event has moved under it. */
function build(id) {
  const preview = previews.get(id);
  if (!preview || !stale.has(id)) return;
  const event = getEvent();
  preview.paper.replaceChildren(event ? renderDocument(event, preview.doc) : el('div'));
  stale.delete(id);
}

/**
 * The event changed: every preview is now out of date, and the one on screen is
 * rebuilt at once so a preview open beside a second window tracks the edits.
 */
function onEvent(event) {
  if (!event) return;
  for (const doc of DOCUMENTS) stale.add(doc.id);
  if (view !== EDIT) build(view);
  pageStyle.textContent = printRule(event);
}
