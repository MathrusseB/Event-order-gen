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

import { getEvent, update } from '../app.js';
import { newId } from '../ids.js';
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

  const legend = el('p', {
    class: 'editor__legend',
    text: 'A date shown in grey follows the event dates. Type over it to pin that guest to their own.'
  });

  const node = el('div', { class: 'editor editor--guests' }, [
    tally,
    el('div', { class: 'editor__table' }, [columns, list, emptyNote]),
    el('div', { class: 'editor__foot' }, [addButton, legend])
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

  const warning = el('p', { class: 'rowwarn', hidden: true });

  const node = el('li', { class: 'row row--guest', 'data-row': id }, [
    last.root,
    first.root,
    arrive.root,
    depart.root,
    childCell,
    dietary.root,
    note.root,
    el('div', { class: 'cell cell--actions' }, [moveUp, moveDown, remove]),
    warning
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

      const messages = stayWarnings(attendee, meta);
      setHidden(warning, messages.length === 0);
      setText(warning, messages.join(' '));
    }
  };
}

/**
 * What is wrong with a guest's stay, in plain sentences. Warnings only —
 * BUILD-SPEC §12 warns and never blocks, and validation proper arrives in its
 * own module.
 */
function stayWarnings(attendee, meta) {
  const arrive = attendee.arrive || meta.startDate || '';
  const depart = attendee.depart || meta.endDate || '';
  const messages = [];

  if (arrive && depart && depart < arrive) {
    messages.push('Departs before arriving.');
  }
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
