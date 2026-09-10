// Rooming editor — BUILD-SPEC §5 `rooming[]`.
//
// [v7] Rooming is its own document, not a section of the event order (§4, §8),
// so this editor is mounted beside the outline rather than inside it. What the
// event order carries of this data is the Accommodations summary, which is
// derived from these rows and edited nowhere.
//
// This is the **form** editor: one row per assignment, typed. The drag-and-drop
// room grid of §9 — night selector, two panes, swap on drop — is a separate
// module and a later segment. Both write the same array, and neither is the
// authority: §9's own note says the grid must be self-contained, so the plain
// form has to stand on its own for the person who would rather see all the
// rows at once than arrange one night at a time.
//
// Three rules from §5 (v5 changes) shape the party control below, and all three
// are easy to get wrong in the other direction:
//
//   * A row names a *party*, not a person — `guestIds` is an array. Normally
//     one name; the Bunk Room carries a few.
//   * The names are not a head count. A row naming one guest may hold a couple,
//     and a row naming nobody still occupies its room, so nothing here treats
//     an empty party as an empty room.
//   * Ids are opaque and never displayed. Every name on screen comes from
//     `attendeeName`, and an id that resolves to nobody is shown as an
//     unresolved *name*, not as an id (§12.3).

import { getEvent, update } from '../app.js';
import {
  attendeeById,
  attendeeName,
  overlappingAssignments,
  roomingWindow
} from '../derive.js';
import { datesBetween, formatDateShort } from '../dates.js';
import { newId } from '../ids.js';
import { LODGING_BUILDINGS, assignmentModeFor, roomsIn } from '../reference.js';
import {
  el,
  focusRowControl,
  reconcile,
  rowNode,
  setHidden,
  setText,
  setValue,
  toggleClass
} from '../dom.js';
import { defaultedDateField, optionSignature, rowButton, selectField } from './fields.js';
import { draftList, fieldWriter, moveRow, removeRow, rowById } from './rows.js';

const write = fieldWriter('rooming');

/** Buildings that take assignments at all. BUILD-SPEC §6 [v3], [v9]. */
function lodgingBuildings() {
  return LODGING_BUILDINGS;
}

/** A blank assignment, in the shape of BUILD-SPEC §5. */
function blankRow() {
  return { id: newId(), building: '', room: null, guestIds: [], from: '', to: '' };
}

/**
 * The nights a resolved window covers. §7 [v3]: `from <= night < to`, so the
 * night the guest leaves is not one of them and the room is free that evening
 * for whoever arrives.
 *
 * @param {{from: string, to: string}} window
 * @returns {string[]}
 */
function nightsIn(window) {
  const dates = datesBetween(window.from, window.to);
  return dates.length ? dates.slice(0, -1) : [];
}

/**
 * The rooming editor.
 *
 * @returns {{node: HTMLElement, update: (event: object) => void}}
 */
export function createRoomingEditor() {
  const totalFigure = el('span', { class: 'tally__figure' });
  const unresolvedLine = el('p', { class: 'tally__unresolved', hidden: true });
  const tally = el('div', { class: 'tally tally--rooming' }, [
    el('p', { class: 'tally__total' }, [el('span', { text: 'Assignments' }), totalFigure]),
    unresolvedLine
  ]);

  const columns = el('div', { class: 'rowhead rowhead--table', 'aria-hidden': 'true' }, [
    el('span', { text: 'Building' }),
    el('span', { text: 'Room' }),
    el('span', { text: 'Known by' }),
    el('span', { text: 'From' }),
    el('span', { text: 'To' }),
    el('span', { class: 'sr-only', text: 'Row actions' })
  ]);

  const list = el('ul', { class: 'rows rows--table rows--rooming' });

  const emptyNote = el('p', {
    class: 'rows__empty',
    text: 'No rooms assigned yet. One row per booking: a room, the guests it is known by, and the '
      + 'nights it is held.'
  });

  const addButton = el('button', { type: 'button', class: 'btn btn--primary', text: 'Add assignment' });
  addButton.addEventListener('click', () => {
    const row = blankRow();
    update((draft) => {
      draftList(draft, 'rooming').push(row);
    });
    const node = rowNode(list, row.id);
    const field = node && node.querySelector('[data-field="building"]');
    if (field) field.focus();
  });

  const legend = el('p', {
    class: 'editor__legend',
    text: 'Dates in grey follow the stay of the first guest named on the row. A room is held from '
      + 'the first night through the night before the To date, so a guest leaving on the 16th does '
      + 'not hold the room that night.'
  });

  const node = el('div', { class: 'editor editor--rooming' }, [
    tally,
    el('div', { class: 'editor__table' }, [columns, list, emptyNote]),
    el('div', { class: 'editor__foot' }, [addButton, legend])
  ]);

  return {
    node,
    update(event) {
      const rows = Array.isArray(event.rooming) ? event.rooming : [];
      setText(totalFigure, String(rows.length));

      // §12.3 in one line, above the rows, because an unresolved name is the
      // one thing here that a scroll past the row will not show you.
      const unresolved = rows.reduce((total, row) => {
        const ids = Array.isArray(row && row.guestIds) ? row.guestIds : [];
        const missing = ids.filter((id) => !attendeeById(event, id)).length;
        return total + missing + (row && row.guest ? 1 : 0);
      }, 0);
      setHidden(unresolvedLine, unresolved === 0);
      setText(unresolvedLine, unresolved === 1
        ? 'One row names a guest who is not on the attendee list.'
        : `${unresolved} rows name a guest who is not on the attendee list.`);

      setHidden(emptyNote, rows.length > 0);
      setHidden(columns, rows.length === 0);

      const entries = reconcile(list, rows, (row, index) => row.id || `rooming-${index}`, (row) =>
        createRoomingRow(list, row.id));
      entries.forEach((entry, index) => entry.update(event, rows[index], index, rows.length));
    }
  };
}

/** One assignment. Built once per id, patched from then on. */
function createRoomingRow(list, id) {
  const building = selectField({
    field: 'building',
    label: 'Building',
    onChange: (value) => write(id, 'building', value)
  });

  const room = selectField({
    field: 'room',
    label: 'Room',
    // An empty selection is `null`, the shape §5 uses for a pooled building,
    // rather than an empty string that would read as a room called "".
    onChange: (value) => write(id, 'room', value || null)
  });
  const roomNote = el('p', { class: 'roomnote' });
  room.root.append(roomNote);

  const party = createParty(id);

  const from = defaultedDateField({
    field: 'from',
    label: 'From',
    defaultLabel: "Guest's arrival",
    resetLabel: "Use the guest's dates",
    onChange: (value) => write(id, 'from', value)
  });
  const to = defaultedDateField({
    field: 'to',
    label: 'To',
    defaultLabel: "Guest's departure",
    resetLabel: "Use the guest's dates",
    onChange: (value) => write(id, 'to', value)
  });

  const nights = el('p', { class: 'nightsline' });

  const moveUp = rowButton('up', 'Move up', '↑');
  const moveDown = rowButton('down', 'Move down', '↓');
  const remove = rowButton('remove', 'Delete assignment', '✕', 'btn--danger');

  moveUp.addEventListener('click', () => moveEntry(list, id, -1));
  moveDown.addEventListener('click', () => moveEntry(list, id, 1));
  remove.addEventListener('click', () => deleteRow(id));

  // A warning with its own repairs attached: the two things that go wrong here
  // are both one press to fix, and neither is fixed behind the user's back.
  const warnText = el('span', { class: 'rowwarn__text' });
  const clearRoom = el('button', { type: 'button', class: 'linkish', text: 'Clear the room' });
  const dropLegacy = el('button', { type: 'button', class: 'linkish', text: 'Remove the name' });
  clearRoom.addEventListener('click', () => write(id, 'room', null));
  dropLegacy.addEventListener('click', () => {
    update((draft) => {
      const row = rowById(draftList(draft, 'rooming'), id);
      if (row) delete row.guest;
    });
  });
  const warn = el('p', { class: 'rowwarn', hidden: true }, [warnText, clearRoom, dropLegacy]);

  const node = el('li', { class: 'row row--rooming', 'data-row': id }, [
    building.root,
    room.root,
    party.root,
    from.root,
    to.root,
    el('div', { class: 'cell cell--actions' }, [moveUp, moveDown, remove]),
    nights,
    warn
  ]);

  return {
    node,
    update(event, row, index, total) {
      const stored = String(row.building || '');
      const known = lodgingBuildings();
      // A building the file names that this build does not treat as lodging is
      // offered rather than dropped: the row was authored that way, and §12.6
      // is a warning, not a correction.
      const buildings = stored && !known.includes(stored) ? [...known, stored] : known;
      building.setOptions([
        { value: '', label: 'Choose a building' },
        ...buildings.map((name) => ({ value: name, label: name }))
      ]);
      setValue(building.select, stored);

      const mode = assignmentModeFor(stored);
      const inventory = roomsIn(stored);
      const storedRoom = row.room === null || row.room === undefined ? '' : String(row.room);
      const roomValues = storedRoom && !inventory.includes(storedRoom)
        ? [...inventory, storedRoom]
        : inventory;

      // §6 [v3]: a pooled building has no rooms to choose from — "in RLI" is
      // all the detail the document needs — so the control is not offered at
      // all rather than offered and ignored.
      setHidden(room.root.querySelector('.field'), mode !== 'named');
      setHidden(roomNote, mode === 'named');
      setText(roomNote, mode === 'pooled'
        ? `${stored} is assigned by building, not by room.`
        : 'Choose a building first.');
      if (mode === 'named') {
        room.setOptions([
          { value: '', label: 'Room not set' },
          ...roomValues.map((name) => ({ value: name, label: name }))
        ]);
        setValue(room.select, storedRoom);
      }

      party.update(event, row);

      // What the dates would be if the row carried none of its own: the first
      // resolvable guest's stay (§5, v3 and v5 changes).
      const fallback = roomingWindow(event, { ...row, from: '', to: '' });
      from.update(row.from || '', fallback.from);
      to.update(row.to || '', fallback.to);

      const window = roomingWindow(event, row);
      const covered = nightsIn(window);
      setText(nights, covered.length
        ? `Holds the room the ${covered.length === 1 ? 'night' : 'nights'} of `
          + `${covered.map(formatDateShort).join(', ')}.`
        : 'Holds the room for no nights — the To date is on or before the From date.');
      toggleClass(nights, 'is-empty', covered.length === 0);

      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;

      const { messages, showClearRoom, showDropLegacy } = rowWarnings(event, row, mode, inventory);
      setHidden(warn, messages.length === 0);
      setText(warnText, messages.join(' '));
      setHidden(clearRoom, !showClearRoom);
      setHidden(dropLegacy, !showDropLegacy);
      toggleClass(node, 'has-warning', messages.length > 0);
    }
  };
}

/**
 * The party control: the guests a row is known by, as names.
 *
 * Chips are keyed by guest id, so adding a name never rebuilds the ones already
 * there, and the select offers only guests the row does not already name.
 *
 * [v10] It also omits anyone who already holds a room over a night this row
 * covers — the same guest in two rooms on one night is never right (§5, v10
 * changes) — and says who it omitted and where they are. A name that is simply
 * missing from a list reads as a bug, and the person looking for it has no way
 * to find out otherwise; the line below is the difference between a rule and a
 * glitch. Overlap, not "assigned anywhere": turnover between two rooms on
 * consecutive nights is ordinary and stays offerable.
 *
 * @param {string} id the rooming row
 */
function createParty(id) {
  const chips = el('ul', { class: 'party' });
  const none = el('p', { class: 'party__none', text: 'No name on this room yet.' });
  const taken = el('p', { class: 'party__taken', hidden: true });

  const add = el('select', { class: 'input input--select party__add', 'data-field': 'addGuest' });
  let signature = '';
  add.addEventListener('change', () => {
    const guestId = add.value;
    add.value = '';
    if (!guestId) return;
    update((draft) => {
      const row = rowById(draftList(draft, 'rooming'), id);
      if (!row) return;
      if (!Array.isArray(row.guestIds)) row.guestIds = [];
      if (!row.guestIds.includes(guestId)) row.guestIds.push(guestId);
    });
    add.focus();
  });

  const root = el('div', { class: 'cell cell--party' }, [
    el('span', { class: 'field__label', text: 'Known by' }),
    chips,
    none,
    el('label', { class: 'field field--add' }, [
      el('span', { class: 'field__label sr-only', text: 'Add a guest to this room' }),
      add
    ]),
    taken
  ]);

  return {
    root,
    update(event, row) {
      const ids = Array.isArray(row.guestIds) ? row.guestIds : [];
      setHidden(none, ids.length > 0);

      const entries = reconcile(chips, ids, (guestId, index) => guestId || `blank-${index}`,
        (guestId) => createChip(id, guestId));
      entries.forEach((entry, index) => entry.update(event, ids[index]));

      const named = new Set(ids);
      const window = roomingWindow(event, row);
      const elsewhere = [];

      const attendees = (Array.isArray(event.attendees) ? event.attendees : [])
        .filter((attendee) => attendee && attendee.id && !named.has(attendee.id))
        .filter((attendee) => {
          const clash = overlappingAssignments(event, attendee.id, window, id);
          if (!clash.length) return true;
          elsewhere.push({ attendee, row: clash[0] });
          return false;
        });

      setHidden(taken, elsewhere.length === 0);
      setText(taken, describeTaken(event, elsewhere));

      const options = [
        { value: '', label: ids.length ? 'Add another guest' : 'Add a guest' },
        ...attendees.map((attendee) => ({
          value: attendee.id,
          label: attendeeName(attendee) || 'Unnamed guest'
        }))
      ];
      const next = optionSignature(options);
      if (next !== signature) {
        signature = next;
        add.replaceChildren(...options.map((option) =>
          el('option', { value: option.value, text: option.label })));
      }
      // Always back to the prompt: the select is an action, not a value.
      if (add.value !== '' && document.activeElement !== add) add.value = '';
      add.disabled = attendees.length === 0;
    }
  };
}

/**
 * [v10] The line under the guest picker naming who it left out.
 *
 * Named in full while there are few of them, because "Dana Reyes (Timber, Nov
 * 14 to Nov 15)" is the whole explanation in one clause. Past three it
 * summarises: a fresh row covers the whole event until its dates are narrowed,
 * so on a full house this would otherwise list every guest at the event, and a
 * paragraph of names is read as noise rather than as a reason.
 *
 * @param {object} event
 * @param {{attendee: object, row: object}[]} elsewhere
 * @returns {string}
 */
function describeTaken(event, elsewhere) {
  if (!elsewhere.length) return '';

  const NAMED = 3;
  const named = elsewhere.slice(0, NAMED).map(({ attendee, row }) => {
    const where = [row.building, row.room].filter(Boolean).join(' ') || 'a room';
    const window = roomingWindow(event, row);
    const when = elsewhere.length <= NAMED
      ? `, ${formatDateShort(window.from)} to ${formatDateShort(window.to)}`
      : '';
    return `${attendeeName(attendee) || 'Unnamed guest'} (${where}${when})`;
  });
  const rest = elsewhere.length - named.length;
  const list = rest ? `${named.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`
    : named.join(', ');

  return `Not offered — already in a room on a night this row covers: ${list}. Nobody holds two `
    + "rooms on one night. Set this row's dates to nights they are free and they come back.";
}

/** One name on a room. */
function createChip(rowId, guestId) {
  const name = el('span', { class: 'chip__name' });
  const drop = el('button', {
    type: 'button',
    class: 'chip__drop',
    'data-control': 'drop-guest',
    'aria-label': 'Take this guest off the room',
    title: 'Take this guest off the room'
  }, [el('span', { 'aria-hidden': 'true', text: '✕' })]);

  drop.addEventListener('click', () => {
    update((draft) => {
      const row = rowById(draftList(draft, 'rooming'), rowId);
      if (!row || !Array.isArray(row.guestIds)) return;
      const index = row.guestIds.indexOf(guestId);
      if (index >= 0) row.guestIds.splice(index, 1);
    });
  });

  const node = el('li', { class: 'chip', 'data-chip': guestId }, [name, drop]);

  return {
    node,
    update(event) {
      const attendee = attendeeById(event, guestId);
      // §12.3: usually a deleted guest. The row keeps the name it was booked
      // under and the room stays booked; nothing here removes either.
      setText(name, attendee ? (attendeeName(attendee) || 'Unnamed guest') : 'Not on the guest list');
      toggleClass(node, 'is-unresolved', !attendee);
      toggleClass(node, 'is-child', Boolean(attendee && attendee.isChild));
    }
  };
}

/**
 * What is wrong with a rooming row, in plain sentences, and which of the two
 * one-press repairs to offer. §12.3, §12.5, §12.6.
 */
function rowWarnings(event, row, mode, inventory) {
  const messages = [];
  let showClearRoom = false;
  let showDropLegacy = false;

  const ids = Array.isArray(row.guestIds) ? row.guestIds : [];
  const missing = ids.filter((id) => !attendeeById(event, id)).length;
  if (missing) {
    messages.push(missing === 1
      ? 'One name on this room is not on the attendee list — usually a guest who was deleted. The '
        + 'room stays booked; take the name off, or put the guest back.'
      : `${missing} names on this room are not on the attendee list. The room stays booked.`);
  }

  // [v5] A name migration could not match, kept verbatim so the row can still
  // be read by the name it was authored with (migrate.js, rule 6).
  if (row.guest) {
    messages.push(`This row came in naming "${row.guest}", and no guest by that name was on the `
      + 'list. Add the right guest above, then remove the old name.');
    showDropLegacy = true;
  }

  const storedRoom = row.room === null || row.room === undefined ? '' : String(row.room);
  if (mode === 'pooled' && storedRoom) {
    messages.push(`${row.building} is assigned by building, so the room "${storedRoom}" on this row `
      + 'is ignored everywhere it is read.');
    showClearRoom = true;
  }
  if (mode === 'named' && !storedRoom) {
    messages.push(`${row.building} is assigned room by room, and this row has no room.`);
  }
  if (mode === 'named' && storedRoom && inventory.length && !inventory.includes(storedRoom)) {
    messages.push(`"${storedRoom}" is not a room in ${row.building}.`);
  }

  // §12.5 — the booking sits outside the stay of the guest it is booked under.
  const booked = ids.map((id) => attendeeById(event, id)).find(Boolean);
  if (booked) {
    const stay = roomingWindow(event, { ...row, from: '', to: '' });
    const window = roomingWindow(event, row);
    if (window.from && stay.from && window.from < stay.from) {
      messages.push(`Starts ${formatDateShort(window.from)}, before ${attendeeName(booked) || 'the guest'} arrives.`);
    }
    if (window.to && stay.to && window.to > stay.to) {
      messages.push(`Runs to ${formatDateShort(window.to)}, after ${attendeeName(booked) || 'the guest'} leaves.`);
    }
  }

  return { messages, showClearRoom, showDropLegacy };
}

/** Move a row one place, and keep the finger on the button that moved it. */
function moveEntry(list, id, delta) {
  update((draft) => moveRow(draftList(draft, 'rooming'), id, delta));
  focusRowControl(list, id, delta < 0 ? ['up', 'down'] : ['down', 'up']);
}

/**
 * Delete an assignment. A row naming somebody is worth a question — it is the
 * only record that the room was held — and a blank one is not.
 */
function deleteRow(id) {
  const event = getEvent();
  const row = ((event && event.rooming) || []).find((entry) => entry && entry.id === id);
  if (!row) return;

  const ids = Array.isArray(row.guestIds) ? row.guestIds : [];
  const names = ids
    .map((guestId) => attendeeById(event, guestId))
    .map((attendee) => (attendee ? attendeeName(attendee) : ''))
    .filter(Boolean);
  const where = [row.building, row.room].filter(Boolean).join(', ');

  if (names.length || where) {
    const who = names.length ? names.join(' and ') : 'nobody';
    if (!window.confirm(`Delete the ${where || 'unassigned'} booking, held under ${who}?`)) return;
  }

  update((draft) => removeRow(draftList(draft, 'rooming'), id));
}
