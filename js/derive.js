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
 * An attendee's name in the form `rooming[].guest` uses: "First Last".
 *
 * The rooming rows carry a name string rather than an index, so this is the one
 * place that spelling is composed. Exported because the renders and the §12.3
 * check ("room assigned to a name not in the attendee list") need the same one.
 *
 * @param {object} attendee
 * @returns {string} may be empty
 */
export function attendeeName(attendee) {
  if (!attendee) return '';
  return `${attendee.first || ''} ${attendee.last || ''}`.trim();
}

/**
 * Comparison key for a guest name: trimmed, inner whitespace collapsed, cased
 * down. Forgiving about how a name was typed, without matching different people.
 *
 * @param {string} name
 * @returns {string} empty when there is no usable name
 */
function nameKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The attendee a rooming row names, or null if the list has no such guest
 * (validation rule §12.3 — reported there, not here).
 *
 * @param {object} event
 * @param {string} name
 * @returns {object|null}
 */
function findAttendeeByName(event, name) {
  const key = nameKey(name);
  if (!key) return null;
  const attendees = (event && event.attendees) || [];
  return attendees.find((attendee) => nameKey(attendeeName(attendee)) === key) || null;
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
  // No matching attendee still resolves, via the event's own dates.
  const stay = stayWindow(event, findAttendeeByName(event, row.guest) || {});
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
 * §7 — Rooms by building: count of distinct rooms occupied, grouped by building.
 *
 * [v3] Distinct rooms, not rows: a room now turns over mid-event, so the Timber
 * Suite holding Dana one night and Tom the next is one room occupied, not two.
 * Counted across the whole event — for a single night, use `roomOccupancyOn`.
 *
 * Keys are building names exactly as stored on the rooming rows, in order of
 * first appearance. Rows with no building are grouped under `''` so they stay
 * visible to validation rather than vanishing from the total. A `pooled`
 * building's rows all share one key, so it counts 1 while anyone is in it —
 * "rooms occupied" is not a meaningful figure there; its guest count comes from
 * `roomOccupancyOn`.
 *
 * @param {object} event
 * @returns {Object<string, number>}
 */
export function roomsByBuilding(event) {
  const rooming = (event && event.rooming) || [];
  const rooms = new Map();
  for (const row of rooming) {
    const building = row.building || '';
    if (!rooms.has(building)) rooms.set(building, new Set());
    rooms.get(building).add(roomKeyFor(row));
  }
  const counts = {};
  for (const [building, occupied] of rooms) {
    counts[building] = occupied.size;
  }
  return counts;
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
 * never appears here.
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
    const key = nameKey(row.guest);
    if (key) housed.add(key);
  }
  return overnight.filter((attendee) => !housed.has(nameKey(attendeeName(attendee))));
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
