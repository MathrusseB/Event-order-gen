// The Rooming Assignment — BUILD-SPEC §8 C.
//
// Rooms turn over mid-event, so a single flat grid cannot represent a weekend:
// the Timber Suite is Dana's on Saturday and Tom's on Sunday, and a sheet with
// one column per room can only show one of them. This document therefore draws
// **rooms down and nights across**, one grid per lodging building, with the
// party named for that room on that night in the cell.
//
// A vacant cell stays visibly empty. An empty room is information — it is the
// answer to "can we put somebody else in the Lodge on Sunday?" — so `named`
// buildings show every room in inventory whether or not anybody is in it, and
// the blanks are the point rather than a gap in the data.
//
// `pooled` buildings (§6 [v3]) have no rooms to lay down the side. Red Leaf Inn
// is a single row listing who is in the building each night; "in RLI" is all
// the detail the document needs.
//
// Nothing here counts heads. §5 (v5 changes): a rooming row names the party a
// room is *known by* — spouses are never listed, children only when they have a
// room of their own — so a cell reading one name may hold four people. That is
// why the unassigned list below is worded as a prompt and not as a fault.
//
// [v9] The attendee list is gone from this document. It belongs to the Event
// Order's `guests` section, and the same names printed on two documents drift
// the moment one of them is reissued — the rooming sheet is the one that gets
// reprinted at four in the afternoon when somebody swaps rooms. What is left is
// the grid and the callout naming anyone staying with no room that night, which
// is a warning *about* the grid and not a guest list (§8 C [v9]).

import {
  attendeeName,
  eventNights,
  partyOf,
  roomOccupancyOn,
  unassignedGuestsOn
} from '../derive.js';
import { formatDate } from '../dates.js';
import { assignmentModeFor, roomsIn } from '../reference.js';
import { el } from '../dom.js';
import { emptyNote, partyLine, section, table } from './parts.js';

/**
 * The Rooming Assignment document descriptor.
 */
export const roomingDocument = {
  id: 'rooming',
  label: 'Rooming Assignment',
  /** §5 [v8] — operational paperwork carries the group it is for. */
  brandId: (event) => ((event && event.meta) || {}).brandId,
  body: renderRoomingBody
};

/**
 * The Rooming Assignment's body — the grids, and the callout under them.
 *
 * Exported because `meta.includeInOrder.rooming` prints exactly this on the
 * Event Order (§8 [v9]): the same render, wrapped in the order's own section
 * bar instead of in this document's page furniture. One function, so the grid
 * on the order cannot come to differ from the grid on the sheet.
 *
 * @param {object} event
 * @returns {Node[]}
 */
export function renderRoomingBody(event) {
  const nights = eventNights(event);
  const buildings = buildingsWithRows(event);

  const grids = !nights.length
    ? [emptyNote('Set the event dates to lay the grid out by night.')]
    : (buildings.length
      ? buildings.map((building) => renderBuilding(event, building, nights))
      : [emptyNote('Nobody is housed yet. Every room assignment on this event will appear here.')]);

  return [
    ...grids,
    renderUnassigned(event, nights)
  ];
}

/**
 * The buildings that hold any rooming row, in the order they first appear.
 *
 * Buildings with no rows at all are left out: printing the Lodge's eight empty
 * rooms for an event nobody is staying at is noise, not information. A building
 * that empties *mid-event* keeps its grid, because its blank nights are exactly
 * the kind of empty worth seeing.
 *
 * @param {object} event
 * @returns {string[]}
 */
function buildingsWithRows(event) {
  const seen = [];
  for (const row of event.rooming || []) {
    if (!row) continue;
    const building = row.building || '';
    if (!seen.includes(building)) seen.push(building);
  }
  return seen;
}

/**
 * One building's grid: rooms down the side, nights across the top.
 *
 * @param {object} event
 * @param {string} building name as stored on the rows
 * @param {string[]} nights
 * @returns {HTMLElement}
 */
function renderBuilding(event, building, nights) {
  const mode = assignmentModeFor(building);
  const occupancy = nights.map((night) => (roomOccupancyOn(event, night)[building] || {}));
  const label = building || 'No building set';

  // A pooled building has no rooms to lay down the side, so it has no row-label
  // column either — the section bar above already names the building, and a
  // column repeating it would be the same word twice on one line.
  const columns = [
    ...(mode === 'pooled' ? [] : [{ label: 'Room', class: 'col-room' }]),
    ...nights.map((night) => ({ label: formatDate(night), class: 'col-night' }))
  ];

  const rows = mode === 'pooled'
    ? [pooledRow(event, occupancy)]
    : roomsOf(building, occupancy).map((room) => namedRow(event, room, occupancy));


  return el('section', { class: 'sec sec--grid' }, [
    el('h2', { class: 'sec__title' }, [
      el('span', { text: label }),
      el('span', { class: 'sec__note', text: mode === 'pooled' ? 'Assigned to the building' : '' })
    ]),
    el('div', { class: 'sec__body' }, [
      table(columns, rows, 'grid'),
      mode === 'pooled'
        ? el('p', { class: 'sec__foot', text: 'Red Leaf Inn is overflow on the private side. '
            + 'Guests are assigned to the building, not to a room.' })
        : false
    ])
  ]);
}

/**
 * The rooms to lay down the side of a `named` building.
 *
 * Every room in inventory, occupied or not (§8 C). Any room named on a row but
 * absent from inventory is appended rather than dropped — a hand-edited file
 * naming "Loft" should print "Loft", not lose the booking — and a row carrying
 * no room at all lands under one final line, where §12.6 can be seen rather
 * than silently swallowed.
 *
 * @param {string} building
 * @param {Object<string, object[]>[]} occupancy one per night
 * @returns {{key: string, label: string}[]}
 */
function roomsOf(building, occupancy) {
  const rooms = roomsIn(building).map((room) => ({ key: room, label: room }));
  const known = new Set(rooms.map((room) => room.key));

  let hasRoomless = false;
  for (const night of occupancy) {
    for (const key of Object.keys(night)) {
      if (key === '') {
        hasRoomless = true;
        continue;
      }
      if (known.has(key)) continue;
      known.add(key);
      rooms.push({ key, label: key });
    }
  }
  if (hasRoomless) rooms.push({ key: '', label: 'No room set' });
  return rooms;
}

/** One room's line: its name, then one cell per night. */
function namedRow(event, room, occupancy) {
  return [
    el('span', { class: 'grid__room', text: room.label }),
    // Two rows on one *named* room on one night is a genuine clash (§12.4).
    ...occupancy.map((night) => cell(event, night[room.key] || [], true))
  ];
}

/** A pooled building's single line: who is in the building each night. */
function pooledRow(event, occupancy) {
  // §6 [v3]: every pooled row groups under one empty key — there is no room to
  // group by, so this is the whole building's occupancy for that night.
  //
  // Which is also why nothing here can clash: several rows in Red Leaf Inn on
  // one night is the building doing its job, not two guests sent to one bed.
  // §12.4 is about a *named* room claimed twice, and marking these as contested
  // would put a conflict rule through the ordinary case.
  return occupancy.map((night) => cell(event, night[''] || [], false));
}

/**
 * One cell: the party or parties holding this room on this night.
 *
 * More than one row on the same named room on the same night is §12.4, a real
 * conflict, and both are printed: hiding one is how somebody arrives to find a
 * bed already made up for a stranger. Several names on *one* row is a party
 * sharing a room and is not a conflict at all.
 *
 * An empty cell is left genuinely empty rather than filled with a dash. A dash
 * reads as a value; a blank reads as a vacancy, which is what it is.
 *
 * @param {object} event
 * @param {object[]} rows the rooming rows covering this room on this night
 * @param {boolean} exclusive whether two rows here would be a clash — true for a
 *   named room, false for a pooled building, where several is the normal case
 */
function cell(event, rows, exclusive) {
  if (!rows.length) return el('span', { class: 'grid__vacant' });

  const contested = exclusive && rows.length > 1;
  return el('span', { class: `grid__parties${contested ? ' is-contested' : ''}` },
    rows.map((row) => {
      const party = partyOf(event, row);
      return el('span', { class: 'grid__party' },
        party.length ? partyLine(party) : [el('span', { class: 'grid__unnamed', text: 'Held' })]);
    }));
}

/* ------------------------------------------------------------- unassigned */

/**
 * Guests staying overnight with no room that night. §12.2, §8 C.
 *
 * Plainly, and as a warning rather than a fault: spouses and children rooming
 * with family are deliberately unlisted (§5, v5 changes), so most of this list
 * is normally fine. It is printed anyway because the one name on it that is
 * *not* fine is the one nobody would otherwise notice.
 *
 * @param {object} event
 * @param {string[]} nights
 * @returns {HTMLElement|false}
 */
function renderUnassigned(event, nights) {
  const byNight = nights
    .map((night) => ({ night, guests: unassignedGuestsOn(event, night) }))
    .filter((entry) => entry.guests.length);

  if (!byNight.length) return false;

  return section('Not Named on the Sheet', [
    el('p', { class: 'sec__lead', text: 'A prompt, not a fault. Spouses are never listed and '
      + 'children are listed only when they have a room of their own, so a guest here may well be '
      + 'rooming with family.' }),
    el('div', { class: 'unroomed' }, byNight.map((entry) => el('div', { class: 'unroomed__night' }, [
      el('h3', { class: 'unroomed__head', text: formatDate(entry.night) }),
      el('p', { class: 'unroomed__names', text: entry.guests
        .map((guest) => attendeeName(guest) || 'Unnamed guest')
        .join(', ') })
    ])))
  ], 'unroomed');
}
