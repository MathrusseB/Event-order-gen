// The Rooming Assignment — BUILD-SPEC §8 C.
//
// Rooms turn over mid-event, so a single flat grid cannot represent a weekend:
// the Timber Suite is Dana's on Saturday and Tom's on Sunday, and a sheet with
// one column per room can only show one of them. This document therefore draws
// **rooms down and nights across**, one grid per lodging building, with the
// party named for that room on that night in the cell.
//
// [v10] ONLY OCCUPIED ROOMS GET A ROW, AND THIS IS NOT WHAT THE BOARD DOES.
// Read this before making the two agree.
//
// Until v10 every room in inventory printed, occupied or vacant, on the
// reasoning that an empty room is information — the answer to "can we put
// somebody else in Wigeon on Sunday?". That was written when the largest
// building had eight rooms. RLI has twenty-four, and the sample event puts nine
// guests in six rooms: thirty-one rows to read six, one page of which was
// fifteen blank RLI lines with a single guest among them.
//
// So the two surfaces diverge on purpose (§5, v10 changes; §8 C):
//
//   * Here, on paper, the rows are the rooms somebody is in. The vacancies
//     follow on one line per building, collapsed — `Vacant: 1-7, 9-10, 12-24`
//     — which is the same information in one line instead of eighteen. A
//     building holding nobody prints its name and that line and no grid.
//   * On the board — js/rooming.js — every room in inventory stays, because
//     there a vacant room is not information, it is the thing you tap.
//
// Neither is a defect in the other. Making this print the full grid again would
// undo v10; making the board hide vacant rooms would leave nowhere to put
// anybody. Both call sites carry this note.
//
// A room occupied on one night and empty on the next keeps its row, with the
// empty night blank: that blank is the turnover, and it is the one kind of
// vacancy worth a row of its own.
//
// `pooled` buildings (§6 [v3]) have no rooms to lay down the side. [v9] Nothing
// is pooled any more, and the branch is kept only because the mode is.
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
  collapseRooms,
  eventNights,
  partyOf,
  roomOccupancyOn,
  roomsOn,
  unassignedGuestsOn
} from '../derive.js';
import { formatDate } from '../dates.js';
import { LODGING_BUILDINGS, assignmentModeFor, roomsIn } from '../reference.js';
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
  const buildings = buildingsOnSheet(event);

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
 * The buildings this sheet is about, in registry order (§6 [v9] — the order
 * they get used in).
 *
 * Three ways onto the sheet: holding a rooming row, being named in
 * `buildingsInUse`, or being held for overflow. [v10] The last two are why a
 * building with nobody in it appears at all, and it is the useful case — the
 * overflow building printing "Vacant: 1-4" is how somebody knows there is still
 * room to grow into. A building nobody has mentioned and nobody is in stays
 * off: the property has ten, and an event uses two.
 *
 * A building named on a row but absent from the registry is appended rather
 * than dropped (§5, v9 changes).
 *
 * @param {object} event
 * @returns {string[]}
 */
function buildingsOnSheet(event) {
  const named = new Set();
  for (const row of event.rooming || []) {
    if (row) named.add(row.building || '');
  }
  for (const key of ['buildingsInUse', 'overflowBuildings']) {
    for (const building of (Array.isArray(event[key]) ? event[key] : [])) {
      const name = String(building || '').trim();
      // Only lodging: The Wheel is on `buildingsInUse` and has no rooms.
      if (name && LODGING_BUILDINGS.includes(name)) named.add(name);
    }
  }

  const ordered = LODGING_BUILDINGS.filter((building) => named.has(building));
  for (const building of named) {
    if (!ordered.includes(building)) ordered.push(building);
  }
  return ordered;
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
  const rooms = occupiedRooms(event, building, nights);
  const vacant = collapseRooms(vacantRooms(event, building, nights));

  // A pooled building has no rooms to lay down the side, so it has no row-label
  // column either — the section bar above already names the building, and a
  // column repeating it would be the same word twice on one line.
  const columns = [
    ...(mode === 'pooled' ? [] : [{ label: 'Room', class: 'col-room' }]),
    ...nights.map((night) => ({ label: formatDate(night), class: 'col-night' }))
  ];

  const rows = mode === 'pooled'
    ? [pooledRow(event, occupancy)]
    : rooms.map((room) => namedRow(event, room, occupancy));

  // [v10] A building holding nobody prints its name and its vacancies. No
  // header row over no rows, which is a table that says nothing twice.
  const grid = rows.length ? table(columns, rows, 'grid') : false;

  return el('section', { class: 'sec sec--grid' }, [
    el('h2', { class: 'sec__title' }, [
      el('span', { text: label }),
      el('span', { class: 'sec__note', text: mode === 'pooled' ? 'Assigned to the building' : '' })
    ]),
    el('div', { class: 'sec__body' }, [
      grid,
      vacancyLine(vacant, nights.length, rows.length > 0),
      mode === 'pooled'
        ? el('p', { class: 'sec__foot', text: 'Assigned to the building, not to a room.' })
        : false
    ])
  ]);
}

/**
 * [v10] The vacancies, in one line.
 *
 * Over more than one night the line is about rooms nobody holds on *any* of
 * them — a room free on Sunday alone is in the grid above with an empty Sunday
 * cell, which says more than a line could. The wording changes with the number
 * of nights rather than staying vague across both, because "Vacant: 1-4" under
 * a three-night grid would be read as tonight.
 *
 * @param {string} ranges from `collapseRooms`
 * @param {number} nights how many the grid covers
 * @param {boolean} hasGrid whether anything is above this line
 * @returns {HTMLElement|false}
 */
function vacancyLine(ranges, nights, hasGrid) {
  if (!ranges) {
    return hasGrid
      ? el('p', { class: 'vacancy vacancy--none', text: 'No vacancies.' })
      : false;
  }
  const lead = nights > 1 ? 'Vacant all nights' : 'Vacant';
  return el('p', { class: 'vacancy' }, [
    el('span', { class: 'vacancy__label', text: `${lead}:` }),
    el('span', { class: 'vacancy__rooms', text: ranges })
  ]);
}

/**
 * The rooms to lay down the side: the ones somebody is in on at least one
 * night, in registry order, with off-registry rooms after them (§5, v9).
 *
 * A row carrying no room at all lands under one final line, where §12.6 can be
 * seen rather than silently swallowed.
 *
 * @param {object} event
 * @param {string} building
 * @param {string[]} nights
 * @returns {{key: string, label: string}[]}
 */
function occupiedRooms(event, building, nights) {
  const seen = new Set();
  for (const night of nights) {
    for (const entry of roomsOn(event, building, night).occupied) seen.add(entry.room);
  }

  const inventory = roomsIn(building);
  const rooms = inventory.filter((room) => seen.has(room)).map((room) => ({ key: room, label: room }));
  for (const room of seen) {
    if (!inventory.includes(room)) rooms.push({ key: room, label: room });
  }

  const roomless = nights.some((night) =>
    ((roomOccupancyOn(event, night)[building] || {})[''] || []).length > 0);
  if (roomless) rooms.push({ key: '', label: 'No room set' });
  return rooms;
}

/** The rooms nobody holds on any night of the event, in registry order. */
function vacantRooms(event, building, nights) {
  if (!nights.length) return roomsIn(building);
  return nights
    .map((night) => roomsOn(event, building, night).vacant)
    .reduce((free, tonight) => free.filter((room) => tonight.includes(room)));
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
