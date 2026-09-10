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

import { findings, getEvent, subscribe } from './app.js';
import { DOCUMENTS, documentById, renderDocument, printRule } from './render.js';
import { findingsForPrint, severityCounts } from './validate.js';
import { el, reconcile, setHidden, setText, toggleClass } from './dom.js';

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
let printButton = null;

/** [v12] The line beside the print control saying what is outstanding (§12). */
let checksLine = null;

/** [v12] The pre-print panel, built once on first use. */
let panel = null;

/**
 * [v12] How to take the user to the thing a finding is about — handed in by
 * shell.js, which owns the navigator, the section blocks and the Board / Rows
 * switch. Passed rather than imported: shell.js already imports this module,
 * and reaching back the other way would close a cycle for one function.
 */
let reveal = null;
let canReveal = null;

/** [v12] The timer that takes the clean line back down again. */
let checksTimer = 0;

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
 *   printTarget: HTMLSelectElement, printButton: HTMLElement,
 *   printChecks: HTMLElement, reveal: (finding: object) => void,
 *   canReveal: (finding: object) => boolean}} refs
 *   [v12] `printChecks` is the line beside the print control; `reveal` takes
 *   the user to the row a finding is about and `canReveal` says whether there
 *   is one to take them to, and both belong to shell.js
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
  printButton = refs.printButton;
  printButton.addEventListener('click', () => requestPrint(printPicker.value));

  // [v12] §12 — what is outstanding, said where the print is started.
  checksLine = refs.printChecks || null;
  reveal = typeof refs.reveal === 'function' ? refs.reveal : null;
  canReveal = typeof refs.canReveal === 'function' ? refs.canReveal : null;

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
  print.addEventListener('click', () => requestPrint(doc.id));

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

/* --------------------------------------------------- [v12] the pre-print check */

/**
 * §12 [v12] — what is outstanding, shown at the moment it is about to become
 * paper.
 *
 * The editor has been saying all of this quietly for as long as the event has
 * been open, beside the rows it is about. This is the other job: printing is
 * the point at which a mistake stops being a field on a screen and starts being
 * a sheet somebody acts on, so the outstanding list is put in front of the
 * person pressing the button, once, deliberately.
 *
 * **It warns and never blocks** (§12). "Print anyway" is not a dare — it is the
 * ordinary way out of this panel, and it is the primary action, because Brian
 * knows things the app does not: a guest with no room is rooming with their
 * parents, a count set by hand came off a phone call, and the paper is right.
 *
 * A clean event never sees the panel at all. It says so on one line and prints
 * — a dialog congratulating somebody for an event with nothing wrong with it is
 * a dialog they will learn to dismiss without reading, and then they will
 * dismiss the one that mattered.
 *
 * @param {string} id the document about to print
 */
function requestPrint(id) {
  const doc = documentById(id);
  if (!doc) return;

  const outstanding = findings();
  if (!outstanding.length) {
    // Said briefly, and then out of the way. §12 [v12].
    sayChecks('Nothing outstanding.', { fades: true });
    printDocument(id);
    return;
  }
  openPanel(doc, outstanding);
}

/** The panel's markup, built once and patched from then on. */
function createPanel() {
  const title = el('h2', { class: 'prepanel__title', id: 'prepanel-title' });
  const lead = el('p', { class: 'prepanel__lead' });
  const groups = el('div', { class: 'prepanel__groups' });

  const back = el('button', { type: 'button', class: 'btn', text: 'Back to the order' });
  const go = el('button', { type: 'button', class: 'btn btn--primary' });

  const box = el('section', {
    class: 'prepanel__box',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'prepanel-title'
  }, [
    el('header', { class: 'prepanel__head' }, [title, lead]),
    groups,
    el('footer', { class: 'prepanel__foot' }, [back, go])
  ]);

  const scrim = el('div', { class: 'prepanel__scrim' });
  const node = el('div', { class: 'prepanel', hidden: true }, [scrim, box]);

  back.addEventListener('click', () => closePanel());
  scrim.addEventListener('click', () => closePanel());

  // Escape and Tab are handled on the document rather than on the panel: a
  // listener on the panel stops working the moment focus leaves it, which is
  // the first Tab, and Escape is expected to work from anywhere while a dialog
  // is up.
  const keys = (event) => {
    if (event.key === 'Escape') {
      closePanel();
      return;
    }
    if (event.key !== 'Tab') return;
    const stops = [...box.querySelectorAll('button')].filter((stop) => !stop.disabled);
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    // Wrap, so focus cannot wander out into the editors underneath a scrim.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!box.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  // A plain element rather than `<dialog>`: `showModal()` would give the trap
  // and Escape for free, but it puts the panel in the top layer, and §8 [v8]
  // is the one rule in this app worth being paranoid about — nothing may reach
  // another document's print output. Appended to `<body>`, this is switched off
  // by print.css's `body > *` rule like everything else, which is a thing that
  // can be read rather than a thing that has to be trusted.
  document.body.append(node);
  return { node, title, lead, groups, back, go, keys };
}

/** Open it on one document's outstanding findings. */
function openPanel(doc, outstanding) {
  if (!panel) panel = createPanel();

  const counts = severityCounts(outstanding);
  panel.title.textContent = `Before the ${doc.label} goes to the printer`;
  panel.lead.textContent = `${countPhrase(counts)}. Nothing here stops the print — this is what `
    + 'is outstanding on the paper you are about to hand over.';
  panel.go.textContent = `Print the ${doc.label} anyway`;

  const groups = findingsForPrint(outstanding);
  const entries = reconcile(panel.groups, groups, (group) => group.severity, createPanelGroup);
  entries.forEach((entry, index) => entry.update(groups[index]));

  panel.go.onclick = () => {
    closePanel();
    printDocument(doc.id);
  };

  setHidden(panel.node, false);
  document.body.classList.add('prepanel-open');
  document.addEventListener('keydown', panel.keys, true);
  panel.go.focus();
}

function closePanel({ restoreFocus = true } = {}) {
  if (!panel) return;
  setHidden(panel.node, true);
  document.body.classList.remove('prepanel-open');
  document.removeEventListener('keydown', panel.keys, true);
  if (restoreFocus && printButton) printButton.focus();
}

/**
 * One severity's worth of findings.
 *
 * Warnings first, which is the order `findingsForPrint` returns them in
 * (§12 [v12]): they are the ones that change what comes out of the printer,
 * and a panel that leads with the notes teaches the reader to scroll.
 */
function createPanelGroup() {
  const heading = el('h3', { class: 'prepanel__grouptitle' });
  const list = el('ul', { class: 'prepanel__list' });
  const node = el('section', { class: 'prepanel__group' }, [heading, list]);

  return {
    node,
    update(group) {
      const warning = group.severity === 'warning';
      node.dataset.severity = group.severity;
      heading.textContent = warning
        ? `${group.findings.length === 1 ? 'One warning' : `${group.findings.length} warnings`} — probably wrong`
        : `${group.findings.length === 1 ? 'One note' : `${group.findings.length} notes`} — deliberate, worth seeing`;

      const entries = reconcile(list, group.findings, (item) => item.key, createPanelItem);
      entries.forEach((entry, index) => entry.update(group.findings[index]));
    }
  };
}

/** One finding — a sentence, and a way into the thing it is about. */
function createPanelItem() {
  const where = el('span', { class: 'prepanel__where' });
  const text = el('span', { class: 'prepanel__text' });
  const button = el('button', { type: 'button', class: 'prepanel__item' }, [where, text]);
  const node = el('li', {}, [button]);
  let current = null;

  button.addEventListener('click', () => {
    // Closing first: `reveal` scrolls, and scrolling behind a scrim is scrolling
    // nobody can see. Focus is not sent back to the print button on the way
    // out, because the whole point of the press was to go somewhere else.
    closePanel({ restoreFocus: false });
    if (reveal && current) reveal(current);
  });

  return {
    node,
    update(item) {
      current = item;
      const label = AREA_LABELS[item.area] || 'This event';
      // A finding can be about a section this order does not carry — §12.1
      // names a meal service, and since v9 an event is not seeded with a Food &
      // Beverage section. The finding is still true and still listed; what is
      // not true is that pressing it goes anywhere, so it says so instead of
      // being a button that does nothing.
      const open = canReveal ? canReveal(item) : true;
      setText(where, open ? label : `${label} · not in this order`);
      setText(text, item.text);
      button.disabled = !open;
      toggleClass(button, 'is-closed', !open);
    }
  };
}

/**
 * What each area is called in a sentence. The panel names where a finding
 * lives, not what type it is: "Rooming", not "rooming".
 */
const AREA_LABELS = {
  meta: 'Event details',
  guests: 'Guests',
  schedule: 'Itinerary',
  foodAndBev: 'Food & Beverage',
  staff: 'Staff',
  departments: 'Departments',
  rooming: 'Rooming',
  menu: 'Menu'
};

/** "Two warnings and one note", "One warning", "Three notes". */
function countPhrase(counts) {
  const parts = [];
  if (counts.warning) parts.push(`${counts.warning} warning${counts.warning === 1 ? '' : 's'}`);
  if (counts.note) parts.push(`${counts.note} note${counts.note === 1 ? '' : 's'}`);
  return parts.join(' and ') || 'Nothing outstanding';
}

/**
 * The line beside the print control. Hidden when it has nothing to say.
 *
 * "Nothing outstanding." is the one thing here that is said and then taken
 * back down: §12 [v12] asks for it briefly and then out of the way, and a line
 * announcing that nothing is wrong, sitting there for the rest of the session,
 * is the celebration that rule exists to prevent. The count line stays as long
 * as the count does.
 */
function sayChecks(text, { fades = false } = {}) {
  if (!checksLine) return;
  if (checksTimer) {
    window.clearTimeout(checksTimer);
    checksTimer = 0;
  }
  setText(checksLine, text);
  setHidden(checksLine, !text);
  toggleClass(checksLine, 'is-clean', fades);
  if (fades) {
    checksTimer = window.setTimeout(() => {
      checksTimer = 0;
      sayChecks('');
    }, CLEAN_LINE_MS);
  }
}

/** Long enough to read at a glance, short enough not to become furniture. */
const CLEAN_LINE_MS = 6000;

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

  // [v12] The count beside the print control, kept current so the panel is
  // never the first anybody hears of it. A clean event says nothing at all
  // until somebody actually presses Print.
  const counts = severityCounts(findings());
  sayChecks(counts.total ? `${countPhrase(counts)} outstanding` : '');
}
