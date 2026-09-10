// Derived fields — BUILD-SPEC §7.
//
// Pure functions. No DOM access, no module state, and nothing imported but
// `reference.js` (static property data) and `dates.js` (ISO helpers) — both
// constants and pure lookups, so nothing here depends on application state.
// Every value the renders show as a count comes from here, so a count is
// computed once and never re-typed (BUILD-SPEC §1).
//
// Dates are ISO `YYYY-MM-DD` strings throughout. They are compared as strings:
// ISO dates sort lexicographically, which sidesteps `Date` parsing and
// timezone drift entirely. Never convert these to `Date` for comparison.

import { assignmentModeFor, roomsIn } from './reference.js';
import { datesBetween } from './dates.js';

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
 * [v10] The rooms a guest already holds over a range. BUILD-SPEC §5 (v10).
 *
 * A guest cannot hold two rooms on the same night, and this is how the rooming
 * editor knows not to offer one. **Overlap, not "assigned anywhere":** the same
 * guest in Mallard 3 on Saturday and Wigeon 5 on Sunday is ordinary turnover
 * and has to stay expressible, so the test is whether the two half-open ranges
 * share a night — `a.from < b.to && b.from < a.to` — and not whether the guest
 * appears somewhere else in the array.
 *
 * The row being filled is excluded by id: a row does not clash with itself, and
 * without that every guest already on a row would be barred from the row they
 * are already on.
 *
 * @param {object} event
 * @param {string} guestId
 * @param {{from: string, to: string}} window the range being filled
 * @param {string} [exceptRowId] the row being filled
 * @returns {object[]} the rows that overlap, in array order
 */
export function overlappingAssignments(event, guestId, window, exceptRowId) {
  if (!guestId || !window || !window.from || !window.to) return [];
  return ((event && event.rooming) || []).filter((row) => {
    if (!row || (exceptRowId && row.id === exceptRowId)) return false;
    if (!guestIdsOf(row).includes(guestId)) return false;
    const held = roomingWindow(event, row);
    if (!held.from || !held.to) return false;
    return held.from < window.to && window.from < held.to;
  });
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
 * [v10] A building's rooms on one night, split into the occupied and the
 * vacant. BUILD-SPEC §8 C [v10].
 *
 * The printed sheet needs both halves and treats them differently: occupied
 * rooms are rows, vacancies are one line. Computed here rather than in the
 * render because it is a fact about the event — which rooms are held that
 * night — and because the same split is worth having wherever else it is
 * wanted.
 *
 * Rooms outside the registry are included among the occupied ones when
 * somebody is in them, in the order they appear on the rows: a hand-edited
 * file naming a room that no longer exists still has to print that booking
 * (§5, v9 changes). They are never counted as vacant — a room the property
 * does not have cannot be offered to anybody.
 *
 * @param {object} event
 * @param {string} building name as stored on the rows
 * @param {string} night ISO `YYYY-MM-DD` — the date the night begins
 * @returns {{occupied: {room: string, rows: object[]}[], vacant: string[],
 *   vacantRanges: string}} `occupied` in registry order, with any off-registry
 *   rooms after it; `vacant` is room labels in registry order, and
 *   `vacantRanges` is the same list collapsed for printing. A caller looking at
 *   more than one night unions the occupied rooms itself and collapses once at
 *   the end — collapsing per night and joining would print the same range twice
 */
export function roomsOn(event, building, night) {
  const held = roomOccupancyOn(event, night)[building] || {};
  const inventory = roomsIn(building);

  const occupied = [];
  for (const room of inventory) {
    if (held[room] && held[room].length) occupied.push({ room, rows: held[room] });
  }
  for (const room of Object.keys(held)) {
    if (inventory.includes(room)) continue;
    // The empty key is a row carrying no room at all (§12.6), which is a fault
    // to report and not a room to print a line for.
    if (!room) continue;
    occupied.push({ room, rows: held[room] });
  }

  const taken = new Set(occupied.map((entry) => entry.room));
  const vacant = inventory.filter((room) => !taken.has(room));
  return { occupied, vacant, vacantRanges: collapseRooms(vacant) };
}

/**
 * [v10] Room labels as a reader would say them: `1–7, 9–10, 12–24`.
 *
 * Runs of consecutive numbers collapse; a named room — Bunk Room, Timber,
 * Wetland, King Suite — is a name and never joins a range, however it happens
 * to sort. The input order is kept, so the line reads in the order the rooms
 * hang on the board.
 *
 * A pair collapses to `8–9` rather than staying `8, 9`: it is the same length
 * and the eye reads one shape down the page instead of two.
 *
 * @param {string[]} rooms
 * @returns {string} empty for an empty list
 */
export function collapseRooms(rooms) {
  const parts = [];
  let run = null;

  const flush = () => {
    if (!run) return;
    parts.push(run.from === run.to ? run.from : `${run.from}\u2013${run.to}`);
    run = null;
  };

  for (const label of rooms) {
    const room = String(label);
    const number = /^\d+$/.test(room) ? Number(room) : null;
    if (number === null) {
      flush();
      parts.push(room);
      continue;
    }
    if (run && run.next === number) {
      run.to = room;
      run.next = number + 1;
      continue;
    }
    flush();
    run = { from: room, to: room, next: number + 1 };
  }
  flush();

  return parts.join(', ');
}

/**
 * [v9] What `meta.includeInOrder` asks the Event Order to carry. §5 (v9).
 *
 * Both default to false, and an absent object, a stray string, a file written
 * before v9 — all of them read as false. The flags add content to the Event
 * Order and take nothing away from anything: the Menu and the Rooming
 * Assignment are still generated and still print on their own whatever these
 * say, which is the whole of §8 [v9] and the one thing about this feature worth
 * being careful with.
 *
 * @param {object} event
 * @returns {{rooming: boolean, menu: boolean}}
 */
export function includeFlags(event) {
  const include = ((event && event.meta) || {}).includeInOrder;
  const flags = include && typeof include === 'object' ? include : {};
  return { rooming: flags.rooming === true, menu: flags.menu === true };
}

/**
 * [v9] The buildings an event is using, for the `guests` section. §7.
 *
 * Three lists, and the third is the one that earns this function: the
 * buildings somebody has actually assigned a room in that nobody put on either
 * list. `buildingsInUse` is typed by a coordinator early and the rooming sheet
 * moves afterwards, so the two drift, and the drift is worth printing — a
 * building holding guests that the order does not mention is how a building
 * goes unopened.
 *
 * Order is the order each list was authored in; the assigned extras come in the
 * order they first appear on the rooming sheet.
 *
 * @param {object} event
 * @returns {{inUse: string[], overflow: string[], alsoAssigned: string[]}}
 */
export function buildingsFor(event) {
  const clean = (list) => (Array.isArray(list) ? list : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean);

  const inUse = clean(event && event.buildingsInUse);
  const overflow = clean(event && event.overflowBuildings);
  const named = new Set([...inUse, ...overflow]);

  const alsoAssigned = [];
  for (const row of (event && event.rooming) || []) {
    const building = String((row && row.building) || '').trim();
    if (!building || named.has(building) || alsoAssigned.includes(building)) continue;
    alsoAssigned.push(building);
  }

  return { inUse, overflow, alsoAssigned };
}

/**
 * [v9] The same three lists as one sentence, for the `guests` section (§7, §8).
 *
 * A string rather than markup, so the editor can show the coordinator exactly
 * the line the order will print rather than an approximation of it. Empty when
 * there is nothing to say at all, which the render answers with its own note.
 *
 * @param {object} event
 * @returns {string}
 */
export function buildingsSentence(event) {
  const { inUse, overflow, alsoAssigned } = buildingsFor(event);
  const parts = [];
  if (inUse.length) parts.push(`In use: ${listPhrase(inUse)}.`);
  if (overflow.length) parts.push(`Held for overflow: ${listPhrase(overflow)}.`);
  if (alsoAssigned.length) {
    parts.push(`Also holding guests on the rooming sheet: ${listPhrase(alsoAssigned)}.`);
  }
  return parts.join(' ');
}

/** "A", "A and B", "A, B and C". */
function listPhrase(names) {
  if (names.length < 3) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
    // [v10] A row with no activity and no time is a seeded blank nobody has
    // filled in (§5, v10 changes) — three of them start every day. It is a
    // waiting row in the editor and nothing at all on the itinerary: an empty
    // line on a printed order reads as a mistake, and an empty line in the
    // preview would teach the coordinator to ignore the preview.
    if (!String(entry.label || '').trim() && !entry.start && !entry.end) continue;
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

/**
 * [v8] The nights of an event. BUILD-SPEC §7 [v3].
 *
 * The last day of an event has no night — everyone has gone home — so it is
 * dropped, unless somebody is in fact staying past the end date, in which case
 * the night is real and showing it is the only way the coordinator finds out.
 * A three-day event is therefore normally two nights wide.
 *
 * This is the spine of the Accommodations summary and of the Rooming
 * Assignment's grid, and the two must agree about how many nights there are, so
 * the rule is written once here rather than once per reader.
 *
 * @param {object} event
 * @returns {string[]} ISO dates, each naming the night that begins on it
 */
export function eventNights(event) {
  const meta = (event && event.meta) || {};
  const days = datesBetween(meta.startDate, meta.endDate);
  if (!days.length) return [];
  const last = days[days.length - 1];
  const occupied = Object.keys(lodgingByBuilding(event, last)).length > 0
    || overnightCountFor(event, last) > 0;
  return occupied ? days : days.slice(0, -1);
}

/**
 * [v8] The dates the itinerary covers: the event's own days, plus any date
 * carrying a schedule entry or a meal service.
 *
 * The union rather than the event range alone, because §12.9 warns about an
 * entry dated outside the event and does not block it. A document that printed
 * only the range would drop that entry silently, which is the one outcome worse
 * than printing it in the wrong place — the warning tells the coordinator to
 * fix it, and the page has to show the thing being complained about.
 *
 * @param {object} event
 * @returns {string[]} ISO dates, ascending
 */
export function itineraryDates(event) {
  const meta = (event && event.meta) || {};
  const dates = new Set(datesBetween(meta.startDate, meta.endDate));
  for (const key of ['schedule', 'foodAndBev']) {
    for (const entry of (event && event[key]) || []) {
      if (entry && entry.date) dates.add(entry.date);
    }
  }
  // ISO dates sort lexicographically — see the note at the top of this module.
  return [...dates].sort();
}

/**
 * [v8] Meal services in the order they are served: by date, then by start time,
 * untimed entries last within their day.
 *
 * The Menu's spine (§8 B). A children's seating is an ordinary entry here and
 * sorts into place by its own time — hot dogs at 17:30 print above the adult
 * buffet at 18:30 rather than in a section of their own (§5, v5 changes).
 *
 * @param {object} event
 * @returns {object[]} rows of `foodAndBev`, not copies
 */
export function mealServices(event) {
  const services = [...((event && event.foodAndBev) || [])].filter(Boolean);
  return services.sort((a, b) => {
    const date = String(a.date || '').localeCompare(String(b.date || ''));
    if (date !== 0) return date;
    if (!a.start && !b.start) return 0;
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start < b.start ? -1 : (a.start > b.start ? 1 : 0);
  });
}

/**
 * [v8] The menu block written for a meal, or null. BUILD-SPEC §5 `menu[]`.
 *
 * Blocks are addressed by `fnbId` and never by position — a block is added when
 * a menu is written and removed when one is deleted, so an index would be
 * pointing at a different meal by the second edit.
 *
 * Null is a real answer, not a missing one: §12.8 is a meal with no menu block,
 * and the Menu prints that meal's heading with a note rather than skipping it.
 *
 * @param {object} event
 * @param {string} fnbId
 * @returns {object|null}
 */
export function menuFor(event, fnbId) {
  if (!fnbId) return null;
  const blocks = (event && event.menu) || [];
  return blocks.find((block) => block && block.fnbId === fnbId) || null;
}

/**
 * [v8] Staff assignments grouped by person, each person's in time order.
 *
 * BUILD-SPEC §14: by person, not by daypart. One stew in a duck blind at dawn
 * and behind the bar at night is one person's day, and splitting that across an
 * AM table and a PM table is what makes it unreadable.
 *
 * People appear in the order they first appear in `staff[]`, so the order the
 * coordinator typed is the order that prints. Assignments sort by date, then by
 * daypart with AM before PM; rows carrying neither keep their array order,
 * because `sort` is stable.
 *
 * @param {object} event
 * @returns {{name: string, assignments: object[]}[]}
 */
export function staffByPerson(event) {
  const rows = (event && event.staff) || [];
  const people = new Map();

  for (const row of rows) {
    if (!row) continue;
    const name = String(row.name || '').trim();
    // An unnamed row is its own person rather than joining the first blank one:
    // two blanks are two rows somebody has yet to name, not one person's day. The
    // sentinel is written as an escape and not as a literal control character: a
    // raw NUL in the source makes this file binary to every text tool that reads
    // it, and an HTML parser rewrites it to U+FFFD when the module is inlined
    // (js/export.js), which would silently change what this key is.
    const key = name || `\u0000unnamed:${row.id || people.size}`;
    if (!people.has(key)) people.set(key, { name, assignments: [] });
    people.get(key).assignments.push(row);
  }

  for (const person of people.values()) {
    person.assignments.sort((a, b) => {
      const date = String(a.date || '').localeCompare(String(b.date || ''));
      if (date !== 0) return date;
      return daypartRank(a.daypart) - daypartRank(b.daypart);
    });
  }
  return [...people.values()];
}

/** AM before PM; anything else keeps its place between them rather than jumping an end. */
function daypartRank(daypart) {
  if (daypart === 'AM') return 0;
  if (daypart === 'PM') return 2;
  return 1;
}

/**
 * [v8] The names a rooming row is known by, ready to print. §5 (v5 changes).
 *
 * Not a head count — a row naming one guest may hold a couple, and a row naming
 * nobody still occupies its room. Array order is display order, and the first
 * name is the guest the room is booked under.
 *
 * An id resolving to no attendee is reported as an unresolved *name*, never as
 * an id: ids are opaque and are never displayed. §12.3 is usually a deleted
 * guest, and the room stays booked either way.
 *
 * @param {object} event
 * @param {object} roomingRow
 * @returns {{text: string, resolved: boolean, isChild: boolean}[]}
 */
export function partyOf(event, roomingRow) {
  const ids = (roomingRow && Array.isArray(roomingRow.guestIds)) ? roomingRow.guestIds : [];
  const party = ids.map((id) => {
    const attendee = attendeeById(event, id);
    return {
      text: attendee ? (attendeeName(attendee) || 'Unnamed guest') : 'Not on the guest list',
      resolved: Boolean(attendee),
      isChild: Boolean(attendee && attendee.isChild)
    };
  });
  // [v5] A name a migration could not match is kept verbatim so the row can
  // still be read by the name it was authored with (migrate.js, rule 6).
  if (roomingRow && roomingRow.guest) {
    party.push({ text: String(roomingRow.guest), resolved: false, isChild: false });
  }
  return party;
}
