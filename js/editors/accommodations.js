// Accommodations editor — BUILD-SPEC §4 [v7], §7 [v4].
//
// [v7] This is what the *event order* carries of the rooming data: guests and
// rooms per building per night, the two-line table in the reference sample. The
// room grid and the assignments themselves belong to the Rooming Assignment,
// which is its own document — nobody reading an event order should have to
// scroll past a room grid to reach the menu.
//
// So this section has no rows of its own and nothing to type into. Everything
// on screen is derived: `lodgingByBuilding` for the per-building figures and
// `unassignedGuestsOn` for the names the sheet does not carry. It is an editor
// only in the sense that it fills a section's slot; the edit happens in the
// rooming editor, and this is where the coordinator sees what that edit did to
// the document.
//
// **Which figure per building** is §7 [v4] and not a style choice: `rooms` for
// a `named` building, `guests` for a `pooled` one. Counting distinct rooms in
// Red Leaf Inn returns 1 however many guests are in it, because pooled rows
// carry no room at all.

import {
  attendeeName,
  lodgingByBuilding,
  overnightCountFor,
  unassignedGuestsOn
} from '../derive.js';
import { datesBetween, formatDate } from '../dates.js';
import { el, reconcile, setHidden, setText, toggleClass } from '../dom.js';

/**
 * The nights of an event.
 *
 * The last day of an event has no night — everyone has gone home — so it is
 * dropped, unless somebody is in fact staying past the end date, in which case
 * the column is real and showing it is the only way the coordinator finds out.
 *
 * @param {object} event
 * @returns {string[]} ISO dates, each naming the night that begins on it
 */
function nightsOf(event) {
  const meta = (event && event.meta) || {};
  const days = datesBetween(meta.startDate, meta.endDate);
  if (!days.length) return [];
  const last = days[days.length - 1];
  const occupied = Object.keys(lodgingByBuilding(event, last)).length > 0
    || overnightCountFor(event, last) > 0;
  return occupied ? days : days.slice(0, -1);
}

/**
 * Buildings holding anyone on any night of the event, in the order they first
 * appear. A building that empties mid-event keeps its line, with the empty
 * nights shown empty.
 *
 * @param {object} event
 * @param {string[]} nights
 * @returns {string[]}
 */
function buildingsAcross(event, nights) {
  const seen = [];
  for (const night of nights) {
    for (const building of Object.keys(lodgingByBuilding(event, night))) {
      if (!seen.includes(building)) seen.push(building);
    }
  }
  return seen;
}

/**
 * Fill one row of the table: a row label, then one cell per night.
 *
 * The label is the row's first *reconciled* cell rather than a node built
 * alongside them, so `reconcile` owns every child of the `<tr>` — the rule it
 * states about its parent — and a night added to the event adds a column
 * instead of rebuilding the table.
 *
 * @param {HTMLTableRowElement} row
 * @param {string[]} nights
 * @param {string} label
 * @param {(night: string) => {text: string, quiet?: boolean}} cellFor
 * @param {string} [cellTag] `td`, or `th` for the header row
 */
function fillRow(row, nights, label, cellFor, cellTag = 'td') {
  const items = [{ key: 'label' }, ...nights.map((night) => ({ key: night, night }))];
  const cells = reconcile(row, items, (item) => item.key, (item) =>
    (item.key === 'label' ? createLabelCell() : createValueCell(cellTag)));
  cells.forEach((cell, index) => {
    cell.update(index === 0 ? { text: label } : cellFor(items[index].night));
  });
}

/** The row-label cell. */
function createLabelCell() {
  const node = el('th', { scope: 'row' });
  return {
    node,
    update(value) {
      setText(node, value.text);
    }
  };
}

/** One figure cell. */
function createValueCell(tag) {
  const node = el(tag, tag === 'th' ? { scope: 'col', class: 'num' } : { class: 'num' });
  return {
    node,
    update(value) {
      setText(node, value.text);
      toggleClass(node, 'is-quiet', Boolean(value.quiet));
    }
  };
}

/**
 * The accommodations summary.
 *
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createAccommodationsEditor() {
  const headRow = el('tr');
  const body = el('tbody');
  const foot = el('tfoot');
  const table = el('table', { class: 'lodging' }, [el('thead', {}, [headRow]), body, foot]);

  const empty = el('p', {
    class: 'rows__empty',
    text: 'Nothing to summarise yet. Set the event dates, then assign rooms in the Rooming '
      + 'Assignment — this table follows them.'
  });

  const unassignedList = el('ul', { class: 'unassigned__list' });
  const unassigned = el('div', { class: 'unassigned', hidden: true }, [
    el('h4', { class: 'unassigned__title', text: 'Not named on the rooming sheet' }),
    el('p', {
      class: 'unassigned__lead',
      text: 'A prompt, not a fault: spouses are never listed and children are listed only when '
        + 'they have a room of their own, so a guest here may well be rooming with family.'
    }),
    unassignedList
  ]);

  const legend = el('p', {
    class: 'editor__legend',
    text: 'Read-only. Room assignments are made in the Rooming Assignment, which is its own '
      + 'document; this is the summary the event order prints. The Lodge is assigned room by room, '
      + 'so it reports rooms held; Red Leaf Inn is assigned by building, so it reports guests.'
  });

  const node = el('div', { class: 'editor editor--accommodations' }, [
    el('div', { class: 'lodging__wrap' }, [table, empty]),
    unassigned,
    legend
  ]);

  return {
    node,
    update(event) {
      const nights = nightsOf(event);
      const buildings = buildingsAcross(event, nights);

      setHidden(table, nights.length === 0);
      setHidden(empty, nights.length > 0);

      fillRow(headRow, nights, 'Building', (night) => ({ text: formatDate(night) }), 'th');

      const rows = reconcile(body, buildings, (building) => building, () => createBuildingRow());
      rows.forEach((row, index) => row.update(event, buildings[index], nights));

      // The one honest head count on this table: everybody staying that night,
      // from the attendee list rather than from the rooming sheet, which names
      // parties and not bodies (§5, v5 changes).
      const totals = reconcile(foot, [{ key: 'overnight' }], (item) => item.key,
        () => createTotalRow());
      totals.forEach((row) => row.update(event, nights));

      const nightsWithGuests = nights
        .map((night) => ({ night, guests: unassignedGuestsOn(event, night) }))
        .filter((entry) => entry.guests.length > 0);
      setHidden(unassigned, nightsWithGuests.length === 0);
      const notes = reconcile(unassignedList, nightsWithGuests, (entry) => entry.night,
        () => createUnassignedRow());
      notes.forEach((row, index) => row.update(nightsWithGuests[index]));
    }
  };
}

/** One building's line: the mode-appropriate figure for each night. */
function createBuildingRow() {
  const node = el('tr');
  return {
    node,
    update(event, building, nights) {
      fillRow(node, nights, building || 'Building not set', (night) => {
        const lodging = lodgingByBuilding(event, night)[building];
        if (!lodging) return { text: '—', quiet: true };
        // §7 [v4]: rooms for a named building, guests for a pooled one.
        const pooled = lodging.mode === 'pooled';
        const figure = pooled ? lodging.guests : lodging.rooms;
        const noun = pooled
          ? (figure === 1 ? 'guest' : 'guests')
          : (figure === 1 ? 'room' : 'rooms');
        return { text: `${figure} ${noun}` };
      });
    }
  };
}

/** The overnight-guest line under the buildings. */
function createTotalRow() {
  const node = el('tr', { class: 'lodging__total' });
  return {
    node,
    update(event, nights) {
      fillRow(node, nights, 'Overnight guests', (night) => ({
        text: String(overnightCountFor(event, night))
      }));
    }
  };
}

/** One night's unhoused names. §7 [v3], §12.2. */
function createUnassignedRow() {
  const night = el('span', { class: 'unassigned__night' });
  const names = el('span', { class: 'unassigned__names' });
  const node = el('li', {}, [night, names]);

  return {
    node,
    update(entry) {
      setText(night, formatDate(entry.night));
      setText(names, entry.guests
        .map((attendee) => attendeeName(attendee) || 'Unnamed guest')
        .join(', '));
    }
  };
}
