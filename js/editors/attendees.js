// Attendee editor — BUILD-SPEC §5 `attendees[]`.
//
// This is the pattern every list editor follows. Three things in it are not
// negotiable and are worth reading before writing the next one:
//
//   * Rows are keyed by `id`, never by index. Rows get reordered and deleted;
//     an index is not an identity, and a handler that closes over one edits the
//     wrong guest the moment a row above it moves.
//   * A row's DOM is built once and patched forever after (see dom.js). Typing
//     writes on every keystroke, so a render that rebuilt markup would take the
//     field out from under the caret.
//   * Deleting a guest does not touch `rooming[]`. BUILD-SPEC §12.3 reports the
//     rows left naming nobody; silently un-rooming someone is a worse outcome
//     than a stale row the validator will point at. The confirmation says how
//     many rows it is about to strand.
//
// [v14] There are two ways in now, and Add guest is still the first of them.
// Nine guests was nine rows opened one at a time, so a list of names can be
// pasted instead and becomes nine rows at once (§5, v14 changes) — but a list
// box is the wrong amount of ceremony for one guest, and one guest is most of
// them. What the batch does *not* do is commit anything on the strength of the
// parse: names.js guesses which half of `Anneke Van Der Berg` is the surname
// and guesses wrongly, so what it read is shown as fields to correct first.

import { findingsFor, getEvent, update } from '../app.js';
import { newId } from '../ids.js';
import { isKnownName, parseNameLines } from '../names.js';
import {
  attendeeName,
  dietaryNotes,
  guestsPresentOn,
  overnightCountFor,
  totalGuests
} from '../derive.js';
import { datesBetween, formatDate, formatDateShort } from '../dates.js';
import {
  el,
  focusRowControl,
  reconcile,
  rowNode,
  setAttr,
  setChecked,
  setHidden,
  setText,
  setValue,
  toggleClass
} from '../dom.js';
// [v12] The one warning line the whole form uses, so a §12 finding reads the
// same beside a guest as it does beside a room. This editor keeps its own
// field controls (see the note at the top of fields.js) but not its own way of
// saying what is wrong.
import { warnLine } from './fields.js';

/** A blank guest, in the shape of BUILD-SPEC §5. */
function blankAttendee() {
  return {
    id: newId(),
    last: '',
    first: '',
    arrive: '',
    depart: '',
    isChild: false,
    dietary: '',
    note: ''
  };
}

/** The draft's attendee array, created if the file arrived without one. */
function draftAttendees(draft) {
  if (!Array.isArray(draft.attendees)) draft.attendees = [];
  return draft.attendees;
}

/** Write one field of one guest. The only write path in this module. */
function writeField(id, field, value) {
  update((draft) => {
    const row = draftAttendees(draft).find((attendee) => attendee && attendee.id === id);
    if (row) row[field] = value;
  });
}

/**
 * The attendee editor.
 *
 * @returns {{node: HTMLElement, update: (event: object) => void}}
 */
export function createAttendeesEditor() {
  const totalValue = el('span', { class: 'tally__figure' });
  const nightsBody = el('tbody');
  const nightsTable = el('table', { class: 'tally__table' }, [
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Day' }),
        el('th', { scope: 'col', class: 'num', text: 'Present' }),
        el('th', { scope: 'col', class: 'num', text: 'Overnight' })
      ])
    ]),
    nightsBody
  ]);
  const nightsEmpty = el('p', {
    class: 'tally__empty',
    text: 'Set the event start and end dates to see the daily counts.'
  });
  const dietaryLine = el('p', { class: 'tally__dietary' });

  const tally = el('div', { class: 'tally' }, [
    el('p', { class: 'tally__total' }, [
      el('span', { text: 'On the list' }),
      totalValue
    ]),
    nightsTable,
    nightsEmpty,
    dietaryLine
  ]);

  const columns = el('div', { class: 'rowhead rowhead--guests', 'aria-hidden': 'true' }, [
    el('span', { text: 'Last name' }),
    el('span', { text: 'First name' }),
    el('span', { text: 'Arrives' }),
    el('span', { text: 'Departs' }),
    el('span', { text: 'Child' }),
    el('span', { text: 'Dietary' }),
    el('span', { text: 'Note' }),
    el('span', { class: 'sr-only', text: 'Row actions' })
  ]);

  const list = el('ul', { class: 'rows rows--guests' });

  const emptyNote = el('p', {
    class: 'rows__empty',
    text: 'No guests yet. Add the first one and the counts start filling in.'
  });

  const addButton = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    text: 'Add guest'
  });
  addButton.addEventListener('click', () => {
    const row = blankAttendee();
    update((draft) => {
      draftAttendees(draft).push(row);
    });
    const node = rowNode(list, row.id);
    const field = node && node.querySelector('[data-field="last"]');
    if (field) field.focus();
  });

  // [v14] The other way in. §5 (v14 changes).
  const batch = createNameBatch();

  const legend = el('p', {
    class: 'editor__legend',
    text: 'A date shown in grey follows the event dates. Type over it to pin that guest to their own.'
  });

  const node = el('div', { class: 'editor editor--guests' }, [
    tally,
    el('div', { class: 'editor__table' }, [columns, list, emptyNote]),
    el('div', { class: 'editor__foot' }, [addButton, batch.toggle, batch.said, legend]),
    batch.node
  ]);

  return {
    node,
    update(event) {
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const meta = event.meta || {};

      setText(totalValue, String(totalGuests(event)));

      // Reconciled even when empty: a hidden table that keeps yesterday's rows
      // is a stale-DOM bug waiting for the day something un-hides it.
      const days = datesBetween(meta.startDate, meta.endDate);
      setHidden(nightsTable, days.length === 0);
      setHidden(nightsEmpty, days.length > 0);
      const dayRows = reconcile(nightsBody, days, (date) => date, () => createTallyRow());
      dayRows.forEach((row, index) => row.update(event, days[index], index === days.length - 1));

      const dietary = dietaryNotes(event);
      setHidden(dietaryLine, dietary.length === 0);
      if (dietary.length) {
        const names = dietary.map((attendee) => attendeeName(attendee) || 'unnamed guest');
        setText(
          dietaryLine,
          `Dietary notes on ${names.length} ${names.length === 1 ? 'guest' : 'guests'}: ${names.join(', ')}.`
        );
      }

      setHidden(emptyNote, attendees.length > 0);
      setHidden(columns, attendees.length === 0);

      const entries = reconcile(list, attendees, (attendee) => attendee.id, (attendee) =>
        createGuestRow(list, attendee.id));
      entries.forEach((entry, index) => entry.update(event, attendees[index], index, attendees.length));

      batch.update(event);
    }
  };
}

/* ------------------------------------------- [v14] a list of names at once */

/**
 * Paste or type names, one per line, and get one row each.
 *
 * BUILD-SPEC §5 (v14 changes). Two stages, and the second one is the point:
 *
 *   1. The names, as a block of text.
 *   2. **What was read from it**, as a first and a last name per line, editable,
 *      with anything already on the guest list flagged.
 *
 * The parse is a heuristic and names.js says so at length: a line without a
 * comma has its last word taken as the surname, which is wrong for every
 * compound surname on the property's lists. Stage two exists so that guess is
 * corrected by the person who knows, before it is written. Nothing here calls
 * `update()` until the button at the end of stage two, and that call writes the
 * whole batch — one write, one render, one step.
 *
 * None of this state is event state, so typing in it re-renders nothing and no
 * caret can be taken out from under anybody.
 */
function createNameBatch() {
  /** 'typing' — the block of text. 'checking' — what was read from it. */
  let stage = 'typing';
  /** One per non-blank line: what was parsed, corrected, and whether to add it. */
  let entries = [];
  /** The event as of the last render, for the duplicate check between renders. */
  let current = null;

  const said = el('p', { class: 'batch__said', role: 'status', hidden: true });

  const toggle = el('button', {
    type: 'button',
    class: 'btn',
    'data-control': 'add-names',
    'aria-expanded': 'false',
    'aria-controls': 'guest-batch',
    text: 'Add a list of names'
  });

  const text = el('textarea', {
    class: 'input input--names',
    rows: 8,
    spellcheck: 'false',
    placeholder: 'Reyes, Dana\nTom Whitfield\nAnneke Van Der Berg'
  });

  const typingNote = el('p', {
    class: 'batch__note',
    text: 'One name a line. A line with a comma is read as Last, First; a line without one has '
      + 'its last word taken as the surname. Nothing is added until you have seen what that '
      + 'produced.'
  });

  const read = el('button', { type: 'button', class: 'btn btn--primary', text: 'Read the names' });
  const cancelTyping = el('button', { type: 'button', class: 'btn', text: 'Cancel' });

  const typing = el('div', { class: 'batch__stage' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Names, one a line' }),
      text
    ]),
    typingNote,
    el('div', { class: 'batch__actions' }, [read, cancelTyping])
  ]);

  const rows = el('ul', { class: 'batch__rows' });
  const checkingNote = el('p', {
    class: 'batch__note',
    text: 'Correct anything read the wrong way round — a compound surname always is. Every guest '
      + 'arrives and departs with the event; set their own dates, child flag and dietary notes in '
      + 'the rows afterwards.'
  });
  const back = el('button', { type: 'button', class: 'btn', text: 'Back to the names' });
  const commit = el('button', { type: 'button', class: 'btn btn--primary' });
  const cancelChecking = el('button', { type: 'button', class: 'btn', text: 'Cancel' });

  const checking = el('div', { class: 'batch__stage', hidden: true }, [
    rows,
    checkingNote,
    el('div', { class: 'batch__actions' }, [commit, back, cancelChecking])
  ]);

  const node = el('div', { class: 'batch', id: 'guest-batch', hidden: true }, [typing, checking]);

  /** Whether a parsed line still names anybody after being edited. */
  const named = (entry) => Boolean(String(entry.first || '').trim()
    || String(entry.last || '').trim());

  /** How many rows the button at the end would write. */
  const chosen = () => entries.filter((entry) => entry.include && named(entry));

  function show(open) {
    setHidden(node, !open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) setHidden(said, true);
  }

  function reset() {
    stage = 'typing';
    entries = [];
    text.value = '';
    draw();
  }

  /** Redraw the parsed rows and the button. Never touches the event. */
  function draw() {
    setHidden(typing, stage !== 'typing');
    setHidden(checking, stage !== 'checking');
    if (stage !== 'checking') return;

    const attendees = (current && current.attendees) || [];
    const built = reconcile(rows, entries, (entry) => entry.key, () => createBatchRow(draw));
    built.forEach((row, index) => row.update(entries[index], attendees));

    const count = chosen().length;
    setText(commit, count === 1 ? 'Add 1 guest' : `Add ${count} guests`);
    commit.disabled = count === 0;
  }

  toggle.addEventListener('click', () => {
    const opening = node.hidden;
    show(opening);
    if (opening) {
      reset();
      text.focus();
    }
  });

  const close = () => {
    show(false);
    reset();
    toggle.focus();
  };
  cancelTyping.addEventListener('click', close);
  cancelChecking.addEventListener('click', close);

  read.addEventListener('click', () => {
    const attendees = (current && current.attendees) || [];
    // Re-read from the text every time, including on the way back from stage
    // two: the text is the source, and a correction made to a field belongs to
    // the reading it was made against.
    entries = parseNameLines(text.value, attendees).map((entry, index) => ({
      ...entry,
      key: `line-${index}`,
      include: true
    }));
    if (!entries.length) return;
    stage = 'checking';
    draw();
    const first = rows.querySelector('input');
    if (first) first.focus();
  });

  back.addEventListener('click', () => {
    stage = 'typing';
    draw();
    text.focus();
  });

  /**
   * Write the batch. One `update()`, so nine guests are one step and not nine.
   *
   * Every row is built from `blankAttendee()` and carries a fresh `newId()` and
   * empty `arrive`/`depart` — which *is* the event's default (§5, v2 changes):
   * a stored empty string means "follow the event dates", and it is exactly
   * what Add guest leaves behind for one guest.
   */
  commit.addEventListener('click', () => {
    const adding = chosen().map((entry) => ({
      ...blankAttendee(),
      first: String(entry.first || '').trim(),
      last: String(entry.last || '').trim()
    }));
    if (!adding.length) return;

    update((draft) => {
      draftAttendees(draft).push(...adding);
    });

    setText(said, adding.length === 1
      ? 'One guest added to the list.'
      : `${adding.length} guests added to the list.`);
    setHidden(said, false);
    show(false);
    reset();
    toggle.focus();
  });

  return {
    node,
    toggle,
    said,
    update(event) {
      current = event;
      // A duplicate is a fact about the guest list, and the guest list moves
      // under this panel while it is open — somebody adds a row singly, or
      // deletes one. Redrawn so the flag on screen is about the list as it is.
      if (!node.hidden && stage === 'checking') draw();
    }
  };
}

/**
 * One parsed line: the two halves as they were read, and whether to add it.
 *
 * A flagged duplicate is not blocked and not unticked for anybody. Two guests
 * can share a name — a father and a son on the same weekend — and that is the
 * reason rows carry ids (§5 [v4]). The tick is there so the other case, a list
 * pasted twice, costs one press instead of nine deletions.
 *
 * @param {() => void} redraw the panel's own redraw, for the count on the button
 */
function createBatchRow(redraw) {
  let entry = null;

  const include = el('input', { type: 'checkbox', class: 'check__box' });
  include.addEventListener('change', () => {
    if (entry) entry.include = include.checked;
    redraw();
  });

  const first = el('input', {
    type: 'text',
    class: 'input',
    'data-field': 'batch-first',
    autocomplete: 'off',
    autocapitalize: 'words'
  });
  const last = el('input', {
    type: 'text',
    class: 'input',
    'data-field': 'batch-last',
    autocomplete: 'off',
    autocapitalize: 'words'
  });
  first.addEventListener('input', () => {
    if (entry) entry.first = first.value;
    redraw();
  });
  last.addEventListener('input', () => {
    if (entry) entry.last = last.value;
    redraw();
  });

  const source = el('span', { class: 'batch__source' });
  const warn = el('p', { class: 'batch__warn', hidden: true });

  const node = el('li', { class: 'batch__row' }, [
    el('label', { class: 'check check--batch' }, [
      include,
      el('span', { class: 'sr-only', text: 'Add this one' })
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'First name' }),
      first
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Last name' }),
      last
    ]),
    source,
    warn
  ]);

  return {
    node,
    update(current, attendees) {
      entry = current;
      setChecked(include, current.include);
      setValue(first, current.first);
      setValue(last, current.last);
      setText(source, current.line);

      // Asked against the fields as they stand rather than against the parse:
      // correcting "Anne Berg" to "Anneke Van Der Berg" can turn a line into a
      // duplicate, and correcting the other way can clear one.
      const dupe = isKnownName(attendees, current.first, current.last);
      setText(warn, dupe
        ? 'Already on the guest list. Two guests can share a name — untick this one if it is the '
          + 'same person twice.'
        : '');
      setHidden(warn, !dupe);
      toggleClass(node, 'is-duplicate', dupe);
      toggleClass(node, 'is-out', !current.include);
    }
  };
}

/**
 * One row of the daily count table. Present and overnight both come from
 * derive.js — BUILD-SPEC §7 — so the figure on screen is the figure that will
 * print.
 */
function createTallyRow() {
  const dayCell = el('th', { scope: 'row' });
  const presentCell = el('td', { class: 'num' });
  const overnightCell = el('td', { class: 'num' });
  const node = el('tr', {}, [dayCell, presentCell, overnightCell]);

  return {
    node,
    update(event, date, isLastDay) {
      setText(dayCell, formatDate(date));
      setText(presentCell, String(guestsPresentOn(event, date).length));
      const overnight = overnightCountFor(event, date);
      // The last day of an event has no night: everyone has gone home, and a
      // bare 0 there reads as a miscount rather than as the end of the event.
      // A figure above zero on that date is real — someone is staying past the
      // end — so it is shown.
      setText(overnightCell, isLastDay && overnight === 0 ? '—' : String(overnight));
      toggleClass(node, 'is-quiet', Boolean(isLastDay) && overnight === 0);
    }
  };
}

/**
 * A date cell: the input, a marker saying whether the date is the guest's own
 * or the event's, and the control that hands it back to the event.
 *
 * BUILD-SPEC §5 (v2 changes) — `arrive` and `depart` "both default to the event
 * start and end dates". A stored empty string *is* the default, not a blank the
 * user forgot: the input therefore always shows a real date, greyed, rather
 * than an empty `mm/dd/yyyy` that reads as a mistake.
 */
function createDateCell(id, field, label, defaultLabel) {
  const input = el('input', {
    type: 'date',
    class: 'input input--date',
    'data-field': field
  });
  // `change`, not `input`: a half-typed date reports an empty value, and an
  // empty value means "follow the event", so writing per keystroke would flip
  // the row in and out of its default while the user was still typing it.
  input.addEventListener('change', () => writeField(id, field, input.value));

  const mark = el('span', { class: 'datemark__default', text: defaultLabel });
  const reset = el('button', {
    type: 'button',
    class: 'linkish',
    text: 'Use event date'
  });
  reset.addEventListener('click', () => {
    writeField(id, field, '');
    input.focus();
  });

  const root = el('div', { class: 'cell cell--date' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: label }),
      input
    ]),
    el('span', { class: 'datemark' }, [mark, reset])
  ]);

  return {
    root,
    input,
    update(stored, fallback, min, max) {
      const defaulted = !stored;
      // The reset only earns its place when pressing it would change something.
      // A saved file pins every guest's dates, and most of them are pinned to
      // the event's own — offering to "use the event date" beside a date that
      // already is the event date is two words of noise on every row.
      const resettable = !defaulted && Boolean(fallback) && stored !== fallback;
      setValue(input, stored || fallback);
      setAttr(input, 'min', min);
      setAttr(input, 'max', max);
      toggleClass(root, 'is-defaulted', defaulted);
      setHidden(mark, !defaulted);
      setHidden(reset, !resettable);
    }
  };
}

/** A labelled text field for a row. */
function createTextField(id, field, label, extra = {}) {
  const input = el('input', {
    type: 'text',
    class: 'input',
    'data-field': field,
    autocomplete: 'off',
    autocapitalize: 'words',
    ...extra
  });
  input.addEventListener('input', () => writeField(id, field, input.value));
  const root = el('div', { class: `cell cell--${field}` }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: label }),
      input
    ])
  ]);
  return { root, input };
}

/** A row action button: a glyph when the row is a table row, words when it is a card. */
function createRowButton(control, label, glyph, extraClass = '') {
  const button = el('button', {
    type: 'button',
    class: `btn btn--row ${extraClass}`.trim(),
    'data-control': control,
    'aria-label': label,
    title: label
  }, [
    el('span', { class: 'btn__glyph', 'aria-hidden': 'true', text: glyph }),
    el('span', { class: 'btn__text', 'aria-hidden': 'true', text: label })
  ]);
  return button;
}

/**
 * One guest. Built once per id, patched from then on.
 *
 * @param {Element} list the reconciled parent, for post-move focus
 * @param {string} id
 */
function createGuestRow(list, id) {
  const last = createTextField(id, 'last', 'Last name');
  const first = createTextField(id, 'first', 'First name');
  const arrive = createDateCell(id, 'arrive', 'Arrives', 'Event start');
  const depart = createDateCell(id, 'depart', 'Departs', 'Event end');

  const childInput = el('input', { type: 'checkbox', class: 'check__box', 'data-field': 'isChild' });
  childInput.addEventListener('change', () => writeField(id, 'isChild', childInput.checked));
  const childCell = el('div', { class: 'cell cell--child' }, [
    el('label', { class: 'check' }, [
      childInput,
      el('span', { class: 'check__label', text: 'Child' })
    ])
  ]);

  // Dietary is its own field, not a corner of `note`: it drives the Menu
  // allergies block and the buffet labels (BUILD-SPEC §5, v5 changes), so it
  // stays in the row where it can be scanned down a column.
  const dietary = createTextField(id, 'dietary', 'Dietary', {
    autocapitalize: 'sentences',
    placeholder: 'Allergy or accommodation'
  });
  const note = createTextField(id, 'note', 'Note', { autocapitalize: 'sentences' });

  const moveUp = createRowButton('up', 'Move up', '↑');
  const moveDown = createRowButton('down', 'Move down', '↓');
  const remove = createRowButton('remove', 'Delete guest', '✕', 'btn--danger');

  moveUp.addEventListener('click', () => moveGuest(list, id, -1));
  moveDown.addEventListener('click', () => moveGuest(list, id, 1));
  remove.addEventListener('click', () => deleteGuest(id));

  const warning = warnLine();

  const node = el('li', { class: 'row row--guest', 'data-row': id }, [
    last.root,
    first.root,
    arrive.root,
    depart.root,
    childCell,
    dietary.root,
    note.root,
    el('div', { class: 'cell cell--actions' }, [moveUp, moveDown, remove]),
    warning.node
  ]);

  return {
    node,
    update(event, attendee, index, total) {
      const meta = event.meta || {};
      setValue(last.input, attendee.last);
      setValue(first.input, attendee.first);
      setChecked(childInput, attendee.isChild);
      setValue(dietary.input, attendee.dietary);
      setValue(note.input, attendee.note);

      // The picker is scoped to the event, which is a nudge, not a fence:
      // BUILD-SPEC §12.9 warns about dates outside the event and never blocks
      // them, and a date typed or pasted outside the range is kept and flagged.
      arrive.update(attendee.arrive, meta.startDate, meta.startDate, meta.endDate);
      depart.update(attendee.depart, meta.endDate, meta.startDate, meta.endDate);

      toggleClass(node, 'has-dietary', Boolean(String(attendee.dietary || '').trim()));
      toggleClass(node, 'is-child', Boolean(attendee.isChild));

      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;

      // [v12] §12's own findings about this guest — rule 2 and rule 10 — written
      // once in validate.js and shown here beside the guest they are about
      // (§12 [v12]), followed by this editor's own checks on the stay, which are
      // not §12 rules and are nobody else's to make.
      const mine = findingsFor(id).filter((item) => item.area === 'guests');
      warning.set([...mine, ...stayWarnings(attendee, meta)]);
      // Marked only where the sentence is: a row marked for a finding filed
      // under another editor is a mark with no explanation under it, which
      // reads as a glitch rather than as a warning.
      toggleClass(node, 'has-finding', mine.length > 0);
    }
  };
}

/**
 * What is wrong with a guest's stay, beyond what §12 says about it.
 *
 * [v12] A stay dated outside the event is *not* a §12 rule — §12.9 is about
 * schedule entries and meal services, and a guest who arrives the day before
 * the event opens is an ordinary thing that the header editor also lists where
 * the dates are typed. §12.10 — departing before arriving — used to be
 * duplicated here and is now written once, in validate.js, and shown above.
 */
function stayWarnings(attendee, meta) {
  const arrive = attendee.arrive || meta.startDate || '';
  const depart = attendee.depart || meta.endDate || '';
  const messages = [];

  if (meta.startDate && arrive && arrive < meta.startDate) {
    messages.push(`Arrives ${formatDateShort(arrive)}, before the event starts.`);
  }
  if (meta.endDate && depart && depart > meta.endDate) {
    messages.push(`Departs ${formatDateShort(depart)}, after the event ends.`);
  }
  if (meta.endDate && arrive && arrive > meta.endDate) {
    messages.push(`Arrives ${formatDateShort(arrive)}, after the event ends.`);
  }
  if (meta.startDate && depart && depart < meta.startDate) {
    messages.push(`Departs ${formatDateShort(depart)}, before the event starts.`);
  }
  return messages;
}

/** Move a guest one place, and keep the finger on the button that moved them. */
function moveGuest(list, id, delta) {
  update((draft) => {
    const attendees = draftAttendees(draft);
    const from = attendees.findIndex((attendee) => attendee && attendee.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= attendees.length) return;
    const [moved] = attendees.splice(from, 1);
    attendees.splice(to, 0, moved);
  });
  // The move detaches and reinserts the row, which blurs whatever was focused
  // inside it. Put focus back on the same control — a row moved three places
  // is three presses, not three presses and two hunts for the button.
  focusRowControl(list, id, delta < 0 ? ['up', 'down'] : ['down', 'up']);
}

/**
 * Delete a guest.
 *
 * `rooming[]` is deliberately left alone. BUILD-SPEC §12.3: a row naming a
 * guest who no longer exists is an orphan, and the validator reports it. The
 * alternative — quietly dropping the room assignment — loses information the
 * coordinator entered, on a sheet ownership reads, with no trace that it
 * happened. So the rooms stay and the confirmation says how many are affected.
 */
function deleteGuest(id) {
  const event = getEvent();
  if (!event) return;
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  const attendee = attendees.find((row) => row && row.id === id);
  if (!attendee) return;

  const name = attendeeName(attendee) || 'this guest';
  const rooms = (Array.isArray(event.rooming) ? event.rooming : []).filter((row) =>
    Array.isArray(row && row.guestIds) && row.guestIds.includes(id));

  let prompt = `Delete ${name} from the attendee list?`;
  if (rooms.length) {
    const where = rooms
      .map((row) => [row.building, row.room].filter(Boolean).join(', '))
      .filter(Boolean);
    prompt += ` ${rooms.length} ${rooms.length === 1 ? 'room assignment names' : 'room assignments name'}`
      + ` them${where.length ? ` (${where.join('; ')})` : ''}. Those rooms stay booked and keep the`
      + ' name, so nothing is lost — the rooming sheet will show the guest as unresolved until you'
      + ' edit it.';
  }

  if (!window.confirm(prompt)) return;

  update((draft) => {
    const rows = draftAttendees(draft);
    const index = rows.findIndex((row) => row && row.id === id);
    if (index >= 0) rows.splice(index, 1);
    // rooming[] is untouched, on purpose. See above.
  });
}
