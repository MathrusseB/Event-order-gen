// Derived fields — BUILD-SPEC §7.
//
// Pure functions. No DOM access, no module state, and no import but the static
// property data in `reference.js` — itself constants and pure lookups, so
// nothing here depends on application state. Every value the renders show as a
// count comes from here, so a count is computed once and never re-typed
// (BUILD-SPEC §1).
//
// Dates are ISO `YYYY-MM-DD` strings throughout. They are compared as strings:
// ISO dates sort lexicographically, which sidesteps `Date` parsing and
// timezone drift entirely. Never convert these to `Date` for comparison.

import { assignmentModeFor } from './reference.js';

/**
 * Effective stay window for an attendee.
 *
 * BUILD-SPEC §5 (v2 changes): `arrive` / `depart` "both default to the event
 * start and end dates", so a blank or missing value on the attendee falls back
 * to the event's own dates rather than excluding the attendee from every count.
 *
 * @returns {{arrive: string, depart: string}} may be empty strings if the event
 *   has no dates either, in which case no date comparison will match.
 */
function stayWindow(event, attendee) {
  const meta = (event && event.meta) || {};
  return {
    arrive: attendee.arrive || meta.startDate || '',
    depart: attendee.depart || meta.endDate || ''
  };
}

/**
 * An attendee's name for display: "First Last".
 *
 * [v4] Display only. Rooming rows reference `guestId`, not this string, so a
 * name is free to be edited or duplicated without moving anyone's room. One
 * place composes the spelling so every render shows the same one.
 *
 * @param {object} attendee
 * @returns {string} may be empty
 */
export function attendeeName(attendee) {
  if (!attendee) return '';
  return `${attendee.first || ''} ${attendee.last || ''}`.trim();
}

/**
 * [v4] The attendee an ID refers to. BUILD-SPEC §5 (v4 changes).
 *
 * The one way a `rooming[].guestId` becomes a person. IDs are opaque: compared
 * for equality and nothing else, never parsed or ordered. A row whose `guestId`
 * matches nothing is an orphan, reported by validation rule §12.3 — this
 * returns null and leaves the reporting there.
 *
 * @param {object} event
 * @param {string} id
 * @returns {object|null}
 */
export function attendeeById(event, id) {
  if (!id) return null;
  const attendees = (event && event.attendees) || [];
  return attendees.find((attendee) => attendee.id === id) || null;
}

/**
 * [v3] Effective night range for a rooming row — the `stayWindow` of a booking.
 *
 * BUILD-SPEC §5 (v3 changes): `from` / `to` "both default to the guest's
 * `arrive` / `depart`, so the common case needs no extra input", and the
 * attendee's own dates fall back to the event's (see `stayWindow`). Resolved
 * here so every caller reads the same range for the same row.
 *
 * The interval is half-open: `from <= night < to`. A row `from` the 14th `to`
 * the 15th holds the room for the night of the 14th only.
 *
 * @param {object} event
 * @param {object} roomingRow a row from `event.rooming`
 * @returns {{from: string, to: string}} may be empty strings, in which case the
 *   row covers no night
 */
export function roomingWindow(event, roomingRow) {
  const row = roomingRow || {};
  // [v4] Resolved by ID, so renaming a guest cannot detach their room. An
  // orphan row still resolves, via the event's own dates.
  const stay = stayWindow(event, attendeeById(event, row.guestId) || {});
  return {
    from: row.from || stay.arrive,
    to: row.to || stay.depart
  };
}

/**
 * Whether a resolved window covers a night. §7 [v3]: `from <= night < to`.
 *
 * @param {{from: string, to: string}} window
 * @param {string} night ISO `YYYY-MM-DD` — the date the night begins
 * @returns {boolean}
 */
function coversNight(window, night) {
  if (!night || !window.from || !window.to) return false;
  return window.from <= night && night < window.to;
}

/**
 * The key a rooming row groups under within its building.
 *
 * BUILD-SPEC §6 [v3]: a `pooled` building has no room-level assignment, so
 * every one of its rows groups under a single empty key regardless of what the
 * `room` field happens to hold. A `named` building groups by room; a row that
 * is missing its room also lands on the empty key, where it stays visible to
 * validation (§12.6) instead of vanishing.
 *
 * @param {object} roomingRow
 * @returns {string}
 */
function roomKeyFor(roomingRow) {
  const row = roomingRow || {};
  if (assignmentModeFor(row.building || '') === 'pooled') return '';
  return row.room || '';
}

/**
 * §7 — Total guest count: `attendees.length`.
 *
 * Counts every attendee on the list, day guests included.
 *
 * @param {object} event
 * @returns {number}
 */
export function totalGuests(event) {
  const attendees = (event && event.attendees) || [];
  return attendees.length;
}

/**
 * §7 — Guests present on a date: attendees where `arrive <= date <= depart`.
 *
 * Inclusive at both ends. A day guest (`arrive === depart`) is present on that
 * one date and on no other.
 *
 * Returns the attendee objects rather than a count so renders can list them;
 * use `.length` for the count.
 *
 * @param {object} event
 * @param {string} date ISO `YYYY-MM-DD`
 * @returns {object[]} attendees, in event order
 */
export function guestsPresentOn(event, date) {
  const attendees = (event && event.attendees) || [];
  if (!date) return [];
  return attendees.filter((attendee) => {
    const { arrive, depart } = stayWindow(event, attendee);
    if (!arrive || !depart) return false;
    return arrive <= date && date <= depart;
  });
}

/**
 * §7 — Overnight count for a night: attendees where `arrive <= date < depart`.
 *
 * `date` is the night, named by the date it starts on. The upper bound is
 * exclusive: an attendee departing on `date` slept somewhere else that night.
 * A day guest (`arrive === depart`) therefore never counts as overnight, on
 * that date or any other.
 *
 * @param {object} event
 * @param {string} date ISO `YYYY-MM-DD` — the date the night begins
 * @returns {number}
 */
export function overnightCountFor(event, date) {
  return overnightAttendeesOn(event, date).length;
}

/**
 * The attendees behind `overnightCountFor` — same rule, listed rather than
 * counted, so the unassigned check and the count can never disagree.
 *
 * @param {object} event
 * @param {string} date ISO `YYYY-MM-DD` — the date the night begins
 * @returns {object[]} attendees, in event order
 */
function overnightAttendeesOn(event, date) {
  const attendees = (event && event.attendees) || [];
  if (!date) return [];
  return attendees.filter((attendee) => {
    const { arrive, depart } = stayWindow(event, attendee);
    if (!arrive || !depart) return false;
    return arrive <= date && date < depart;
  });
}

/**
 * §7 [v4] — Lodging by building, per night.
 *
 * For each building holding anyone that night: its assignment mode, the number
 * of distinct rooms occupied, and the number of guests accommodated. This is
 * the Accommodations table on the event order, which is a dated table — a
 * whole-event figure cannot be right for every night once rooms turn over
 * mid-event (BUILD-SPEC §5, v4 changes).
 *
 * **Which figure to render:** `rooms` for a `named` building, `guests` for a
 * `pooled` one. `mode` is returned so the caller can pick without knowing the
 * property. A pooled building's rows carry no room, so its `rooms` is 0 — that
 * is the point of the amendment: counting distinct rooms there returned 1
 * however many guests were in the building. Under a `named` building, `rooms`
 * short of `guests` means a row is missing its room (validation §12.6).
 *
 * `guests` counts distinct guests: two rows for one person in one building on
 * one night are one guest. An orphan row (no `guestId`, §12.3) counts as one
 * guest of its own — somebody is in that room, and the row still renders.
 *
 * @param {object} event
 * @param {string} night ISO `YYYY-MM-DD` — the date the night begins
 * @returns {Object<string, {mode: string, rooms: number, guests: number}>}
 *   keyed by building name as stored on the rows, in order of first appearance.
 *   Buildings holding nobody that night are absent.
 */
export function lodgingByBuilding(event, night) {
  const rooming = (event && event.rooming) || [];
  const tally = new Map();

  for (const row of rooming) {
    if (!coversNight(roomingWindow(event, row), night)) continue;
    const building = row.building || '';
    if (!tally.has(building)) {
      tally.set(building, { rooms: new Set(), guests: new Set(), orphans: 0 });
    }
    const entry = tally.get(building);
    // Named rooms only: a pooled row's key is empty and is not a room.
    const room = roomKeyFor(row);
    if (room) entry.rooms.add(room);
    if (row.guestId) entry.guests.add(row.guestId);
    else entry.orphans += 1;
  }

  const lodging = {};
  for (const [building, entry] of tally) {
    lodging[building] = {
      mode: assignmentModeFor(building),
      rooms: entry.rooms.size,
      guests: entry.guests.size + entry.orphans
    };
  }
  return lodging;
}

/**
 * §7 [v3] — Room occupancy on a night: `rooming[]` rows where
 * `from <= night < to`, grouped by building and room.
 *
 * The half-open range is the point of the amendment: a guest departing on the
 * 15th does not hold the room the night of the 15th, so the room is free for
 * the guest arriving that day. Rows are returned rather than names so the
 * render and the editor can show the range they came from.
 *
 * `pooled` buildings (§6) group under a single `''` key — they have no rooms to
 * group by. Under a `named` building, `''` is a row whose room is missing,
 * which validation reports (§12.6).
 *
 * @param {object} event
 * @param {string} night ISO `YYYY-MM-DD` — the date the night begins
 * @returns {Object<string, Object<string, object[]>>} building -> room -> rows,
 *   both levels in order of first appearance; empty when nobody is housed
 */
export function roomOccupancyOn(event, night) {
  const rooming = (event && event.rooming) || [];
  const occupancy = {};
  for (const row of rooming) {
    if (!coversNight(roomingWindow(event, row), night)) continue;
    const building = row.building || '';
    const room = roomKeyFor(row);
    if (!occupancy[building]) occupancy[building] = {};
    if (!occupancy[building][room]) occupancy[building][room] = [];
    occupancy[building][room].push(row);
  }
  return occupancy;
}

/**
 * §7 [v3] — Unassigned guests on a night: attendees overnight that night with
 * no covering `rooming[]` row.
 *
 * This is validation rule §12.2 ("attendee staying overnight with no room
 * assignment covering that night") and the unassigned pane of the rooming
 * editor (§9), computed once for both. A day guest is never overnight and so
 * never appears here. An attendee carrying no `id` at all cannot be housed by
 * any row, so they surface here rather than passing silently.
 *
 * @param {object} event
 * @param {string} night ISO `YYYY-MM-DD` — the date the night begins
 * @returns {object[]} attendees, in event order
 */
export function unassignedGuestsOn(event, night) {
  const overnight = overnightAttendeesOn(event, night);
  if (!overnight.length) return [];
  const housed = new Set();
  for (const row of (event && event.rooming) || []) {
    if (!coversNight(roomingWindow(event, row), night)) continue;
    if (row.guestId) housed.add(row.guestId);
  }
  // [v4] By ID: two guests who share a name are two people here, and one of
  // them having a room no longer covers for the other.
  return overnight.filter((attendee) => !attendee.id || !housed.has(attendee.id));
}

/**
 * §7 — F&B attendee count: per `countBasis` — `present`, `overnight`, or `custom`.
 *
 * BUILD-SPEC §5 (v2 changes):
 *   `present`   — attendees whose stay spans the meal date. The default.
 *   `overnight` — attendees staying the night of that date.
 *   `custom`    — the entry's explicit `count`, a deliberate override
 *                 (surfaced by validation rule §12.1).
 *
 * An unrecognised or missing basis falls back to `present`, the stated default.
 *
 * This is also the menu header count: §7 — "Menu header count: same computed
 * value as the F&B row it references". Resolve the `fnbId` to its F&B entry and
 * call this; do not recompute it another way.
 *
 * @param {object} event
 * @param {object} fnbEntry a row from `event.foodAndBev`
 * @returns {number}
 */
export function fnbCount(event, fnbEntry) {
  if (!fnbEntry) return 0;
  if (fnbEntry.countBasis === 'custom') {
    const count = Number(fnbEntry.count);
    return Number.isFinite(count) ? count : 0;
  }
  if (fnbEntry.countBasis === 'overnight') {
    return overnightCountFor(event, fnbEntry.date);
  }
  return guestsPresentOn(event, fnbEntry.date).length;
}
