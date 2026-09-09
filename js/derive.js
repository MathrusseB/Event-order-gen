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
 * [v5] The guest IDs a rooming row names, always an array.
 *
 * BUILD-SPEC §5 (v5 changes): a row names a *party*, not a person — the guests
 * the room is known by. Spouses are never listed, children only when they have
 * a room of their own, and the Bunk Room routinely carries several names. The
 * array is therefore not a head count and nothing here treats it as one: a room
 * with one name may hold four people, and a room with no names is still booked.
 *
 * Array order is display order.
 *
 * @param {object} roomingRow
 * @returns {string[]} empty when the row names nobody
 */
function guestIdsOf(roomingRow) {
  const ids = roomingRow && roomingRow.guestIds;
  return Array.isArray(ids) ? ids : [];
}

/**
 * [v3] Effective night range for a rooming row — the `stayWindow` of a booking.
 *
 * BUILD-SPEC §5 (v3 changes): `from` / `to` "both default to the guest's
 * `arrive` / `depart`, so the common case needs no extra input", and the
 * attendee's own dates fall back to the event's (see `stayWindow`). [v5] The
 * guest in question is the first resolvable name in `guestIds`. Resolved here
 * so every caller reads the same range for the same row.
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
  // [v5] The first resolvable name in the party: the guest the room is booked
  // under, per §5 (v5 changes). Later names are companions on the same booking,
  // and their own stays may differ — a child arriving a day late does not
  // shorten the room. [v4] Resolution is by ID, so renaming a guest cannot
  // detach their room; a row naming nobody resolvable falls back to the event's
  // own dates.
  const booked = guestIdsOf(row)
    .map((id) => attendeeById(event, id))
    .find(Boolean);
  const stay = stayWindow(event, booked || {});
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
 * [v5] `guests` counts the distinct guests *named* on those rows, not bodies in
 * beds: a row naming one guest may be a couple, and a party of four children
 * sharing the Bunk Room is one row with however many names it carries.
 * Occupancy is not derivable from the rooming sheet and is not meant to be
 * (§5, v5 changes) — meal counts come from the attendee list. An ID that
 * resolves to no attendee still counts: it is a name on the sheet, and
 * validation §12.3 reports it. A row naming nobody at all counts no guests but
 * still occupies its room, so a booked room cannot vanish from the table.
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
      tally.set(building, { rooms: new Set(), guests: new Set() });
    }
    const entry = tally.get(building);
    // Named rooms only: a pooled row's key is empty and is not a room.
    const room = roomKeyFor(row);
    if (room) entry.rooms.add(room);
    for (const id of guestIdsOf(row)) entry.guests.add(id);
  }

  const lodging = {};
  for (const [building, entry] of tally) {
    lodging[building] = {
      mode: assignmentModeFor(building),
      rooms: entry.rooms.size,
      guests: entry.guests.size
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
 * This is validation rule §12.2 and the unassigned pane of the rooming editor
 * (§9), computed once for both. A day guest is never overnight and so never
 * appears here. An attendee carrying no `id` at all is named by no row, so they
 * surface here rather than passing silently.
 *
 * [v5] "Unassigned" means *not named on the sheet*, which is a prompt, not a
 * fault: spouses are never listed and children are listed only when they have a
 * room of their own (§5, v5 changes), so a guest here may well be rooming with
 * family. §12.2 warns; it does not block.
 *
 * @param {object} event
 * @param {string} night ISO `YYYY-MM-DD` — the date the night begins
 * @returns {object[]} attendees, in event order
 */
export function unassignedGuestsOn(event, night) {
  const overnight = overnightAttendeesOn(event, night);
  if (!overnight.length) return [];
  const named = new Set();
  for (const row of (event && event.rooming) || []) {
    if (!coversNight(roomingWindow(event, row), night)) continue;
    for (const id of guestIdsOf(row)) named.add(id);
  }
  // [v4] By ID: two guests who share a name are two people here, and one of
  // them having a room no longer covers for the other.
  return overnight.filter((attendee) => !attendee.id || !named.has(attendee.id));
}

/**
 * §7 [v5] — Dietary notes: attendees with a non-empty `dietary`.
 *
 * The Menu render's allergies block and the buffet labels. Attendees are
 * returned, not the strings alone, because a label needs the name attached —
 * "Kim Palmer — shellfish" is the useful line; "shellfish" on its own is not.
 *
 * BUILD-SPEC §5 (v5 changes): `dietary` is deliberately separate from `note`.
 * A general remark can be skimmed past; an allergy drives what is cooked.
 *
 * @param {object} event
 * @returns {object[]} attendees, in event order
 */
export function dietaryNotes(event) {
  const attendees = (event && event.attendees) || [];
  return attendees.filter((attendee) => String((attendee && attendee.dietary) || '').trim());
}

/**
 * [v5] Who an F&B entry serves. BUILD-SPEC §5 (v5 changes).
 *
 * `all` is the default wherever the field is absent or unrecognised, so an
 * entry authored before v5 keeps counting exactly as it did.
 *
 * @param {object} fnbEntry
 * @returns {'all'|'adults'|'children'|'custom'}
 */
function servesOf(fnbEntry) {
  const serves = fnbEntry && fnbEntry.serves;
  return serves === 'adults' || serves === 'children' || serves === 'custom' ? serves : 'all';
}

/**
 * §7 — F&B attendee count: narrowed by `serves`, then counted per `countBasis`.
 *
 * BUILD-SPEC §5 (v2 changes) — `countBasis` picks *which dates* qualify:
 *   `present`   — attendees whose stay spans the meal date. The default.
 *   `overnight` — attendees staying the night of that date.
 *   `custom`    — the entry's explicit `count`, a deliberate override.
 *
 * [v5] `serves` picks *which people* qualify, independently:
 *   `all`      — everyone. The default.
 *   `adults`   — attendees not flagged `isChild`.
 *   `children` — attendees flagged `isChild`.
 *   `custom`   — the explicit `count` again, for a seating no rule describes.
 *
 * The two compose rather than override: `overnight` + `children` is the
 * children staying that night, and a 17:30 children's seating plus an 18:30
 * `adults` dinner add up to the same total as one `all` sitting. Without this
 * an adult buffet counted every child in the house (§5, v5 changes). Either
 * `custom` short-circuits to the explicit count and validation §12.1 surfaces
 * the override.
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

  const serves = servesOf(fnbEntry);
  if (fnbEntry.countBasis === 'custom' || serves === 'custom') {
    const count = Number(fnbEntry.count);
    return Number.isFinite(count) ? count : 0;
  }

  const dated = fnbEntry.countBasis === 'overnight'
    ? overnightAttendeesOn(event, fnbEntry.date)
    : guestsPresentOn(event, fnbEntry.date);

  if (serves === 'all') return dated.length;
  const wantChildren = serves === 'children';
  return dated.filter((attendee) => Boolean(attendee.isChild) === wantChildren).length;
}

/**
 * §7 [v7] — Itinerary for a date: `schedule[]` and `foodAndBev[]` on that
 * date, merged and ordered by `start`.
 *
 * BUILD-SPEC §5 (v7 changes): a meal used to be typed twice, once in each
 * array, and the two drifted apart the first time somebody moved dinner by half
 * an hour. `schedule[]` now carries only what is not a meal — hunts, arrivals,
 * downtime, departures — and the itinerary is generated by merging the two, so
 * moving dinner moves it on the itinerary, in the F&B table and on the Menu at
 * once.
 *
 * Ordering: by `start` ascending, as ISO `HH:MM` strings, which sort
 * lexicographically for the same reason the dates do. Entries without a `start`
 * come last "in their existing order" (§7) — `sort` is stable, so the merge
 * order is what survives: schedule entries, then F&B entries, each in array
 * order. A schedule entry and a meal sharing a time keep that same order, and
 * §12.12 reports the pair as a meal typed into both arrays.
 *
 * **Times are not formatted here.** The entry carries `start` and `end` exactly
 * as stored; how "18:30" prints is the render's decision (§8), and this module
 * is the one place two renders can be made to agree on the facts rather than on
 * the formatting.
 *
 * @param {object} event
 * @param {string} date ISO `YYYY-MM-DD`
 * @returns {{source: 'schedule'|'foodAndBev', id: string, date: string,
 *   start: string, end: string, text: string, location: string}[]}
 *   `source` and `id` are what a render draws from and an editor links back to
 *   ([v7] every row carries an id, §5); `text` is the display text — a schedule
 *   entry's label, or an F&B entry's meal name — and `location` is the F&B
 *   entry's location, empty on a schedule entry, so a render can set the two in
 *   different type rather than having to split a string.
 */
export function itineraryFor(event, date) {
  if (!date) return [];

  const schedule = (event && event.schedule) || [];
  const foodAndBev = (event && event.foodAndBev) || [];
  const merged = [];

  for (const entry of schedule) {
    if (!entry || entry.date !== date) continue;
    merged.push({
      source: 'schedule',
      id: entry.id || '',
      date,
      start: entry.start || '',
      end: entry.end || '',
      text: entry.label || '',
      location: ''
    });
  }

  for (const entry of foodAndBev) {
    if (!entry || entry.date !== date) continue;
    merged.push({
      source: 'foodAndBev',
      id: entry.id || '',
      date,
      start: entry.start || '',
      end: entry.end || '',
      text: entry.meal || '',
      location: entry.location || ''
    });
  }

  // A missing start sorts after every real one rather than before it: an entry
  // nobody has timed yet belongs at the end of the day, not at the top of it.
  return merged.sort((a, b) => {
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start < b.start ? -1 : (a.start > b.start ? 1 : 0);
  });
}
