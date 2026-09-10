// Forward migration of inbound event JSON — BUILD-SPEC §5 (v4 changes).
//
// The JSON file is the source of truth (§3), and files already saved use the
// pre-v4 shape: attendees without `id`, rooming rows carrying a guest name in
// `guest`. Those files must keep opening, so every inbound event goes through
// `migrate()` — `loadFromFile`, `restoreAutosave`, and `loadSample` in io.js.
//
// This is the last place in the app that matches a guest by name, and it does
// so once, to mint the IDs. Nothing downstream falls back to names: a fallback
// would reintroduce exactly the ambiguity the IDs remove.
//
// [v5] Two generations of rooming shape now arrive here: pre-v4 rows carrying a
// `guest` name, and v4 rows carrying a single `guestId`. Both become a v5
// `guestIds` array. Every rule below stays idempotent, so a file may be loaded,
// saved, and loaded again without drifting.
//
// [v7] Two more: rows that carry no `id` are given one (§5, v7 changes), and
// the two section types that became documents of their own are brought forward
// — `rooming` becomes `accommodations`, `menu` goes. Neither `rooming[]` nor
// `menu[]` is touched by that: the data was never in the section, and both
// documents are generated from it as before.

import { attendeeName } from './derive.js';
import { newId } from './ids.js';
import { assignmentModeFor, roomsIn } from './reference.js';
import { markSeeded } from './seed.js';

/**
 * Bring an event up to the current shape. Pure: the argument is not touched.
 *
 * Idempotent — running it on an already-migrated event changes nothing and
 * reports `changed: false`.
 *
 * Rules, in order:
 *   1. An attendee with no `id` is given one (§5 v4).
 *   2. [v5] An attendee with no `isChild` or `dietary` is given the defaults,
 *      `false` and `""`. This alone does not count as a change: filling in a
 *      field the shape has always implied is not a migration, and reporting it
 *      as one would make every load look like a rescue.
 *   3. [v5] A rooming row already carrying `guestIds` is left alone.
 *   4. [v5] A row carrying a v4 `guestId` becomes `guestIds: [id]`, or `[]`
 *      where that id is null.
 *   5. A pre-v4 row carrying `guest` and no usable `guestId` is resolved by
 *      normalized name. One match: `guestIds` is set and `guest` dropped.
 *   6. No match, or more than one, leaves `guestIds` empty and **keeps** the
 *      original `guest` string. The row stays visible, still occupies its room,
 *      and the §12.3 orphan rule can report it by the name it was authored
 *      with. Guessing between two same-named guests is the failure v4 exists to
 *      end. A v4 row left unresolved by an earlier run is retried here, so
 *      re-adding a deleted guest heals it.
 *
 *   7. [v7] A row of `rooming[]`, `schedule[]`, `staff[]` or `departments[]`
 *      with no `id` is given one. The editors address rows by id, and a row
 *      without one cannot be edited safely once the list can be reordered.
 *   8. [v7] A `rooming` section becomes an `accommodations` section — the
 *      summary the event order now carries — unless the file already has one,
 *      in which case the stale section is dropped rather than duplicated. A
 *      `menu` section is dropped outright. A title the user chose is kept; one
 *      left at the old default is renamed, because "Rooming Assignments" over a
 *      two-line summary table would be a lie.
 *
 *   9. [v9] A menu block's `courses[]` becomes a flat `dishes[]`, in the order
 *      the dishes appeared, headings discarded (§5, v9 changes).
 *  10. [v9] `attendees` and `accommodations` sections become one `guests`
 *      section, in the position of whichever came first. The second is dropped
 *      rather than duplicated, and a file that already has a `guests` section
 *      keeps it.
 *  12. [v10] A file with no seeding ledger is marked as already seeded for its
 *      whole date range. It has the meals somebody typed, and seeding over them
 *      would be the duplication the ledger exists to prevent (§5, v10 changes).
 *      Like the v5 attendee defaults, this is a shape being filled in rather
 *      than a migration, so it does not set `changed`.
 *  11. [v9] Rooming rows in a building or room the registry no longer carries
 *      are **reported and left exactly as they are**. Not remapped and not
 *      dropped: an assignment to a room that is gone is information — somebody
 *      is expecting that room — and §12.6 goes on reporting it every time the
 *      file is opened. Guessing which of the new rooms was meant is the one
 *      thing that would lose it.
 *
 * `foodAndBev[].serves` needs no rule: it defaults to `all` where it is read
 * (`fnbCount`), so a pre-v5 entry counts exactly as it always did.
 *
 * @param {object} event as parsed from a file, `localStorage`, or the fixture
 * @returns {{event: object, summary: MigrationSummary}} the migrated event and
 *   what happened, for a later segment to surface — no UI is raised here
 */
export function migrate(event) {
  const summary = {
    changed: false,
    attendeeIdsAdded: 0,
    roomingRowsLinked: 0,
    roomingRowsWidened: 0,
    unresolvedRooming: [],
    rowIdsAdded: 0,
    sectionsRetyped: 0,
    sectionsDropped: 0,
    menusFlattened: 0,
    retiredRooms: [],
    datesMarkedSeeded: 0
  };

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { event, summary };
  }

  const next = structuredClone(event);

  // 1-2. Attendee IDs first: the rooming pass resolves onto them. The v5
  //      defaults ride along, deliberately without touching `changed`.
  const attendees = Array.isArray(next.attendees) ? next.attendees : [];
  for (const attendee of attendees) {
    if (!attendee || typeof attendee !== 'object') continue;
    if (!attendee.id) {
      attendee.id = newId();
      summary.attendeeIdsAdded += 1;
      summary.changed = true;
    }
    if (!Object.hasOwn(attendee, 'isChild')) attendee.isChild = false;
    if (!Object.hasOwn(attendee, 'dietary')) attendee.dietary = '';
  }

  // 2. Name -> IDs. Every ID under a name, so a duplicate is detectable rather
  //    than resolved to whichever attendee happens to come first.
  const idsByName = new Map();
  for (const attendee of attendees) {
    if (!attendee || typeof attendee !== 'object' || !attendee.id) continue;
    const key = nameKey(attendeeName(attendee));
    if (!key) continue;
    if (!idsByName.has(key)) idsByName.set(key, []);
    idsByName.get(key).push(attendee.id);
  }

  // 3-6. Rooming rows, oldest shape last.
  const rooming = Array.isArray(next.rooming) ? next.rooming : [];
  for (const row of rooming) {
    if (!row || typeof row !== 'object') continue;
    if (Array.isArray(row.guestIds)) continue;        // 3. already v5

    if (row.guestId) {                                // 4. v4, one guest
      row.guestIds = [row.guestId];
      delete row.guestId;
      summary.roomingRowsWidened += 1;
      summary.changed = true;
      continue;
    }

    if ('guest' in row) {                             // 5-6. pre-v4, by name
      const matches = idsByName.get(nameKey(row.guest)) || [];
      if (matches.length === 1) {
        row.guestIds = [matches[0]];
        delete row.guest;
        delete row.guestId;
        summary.roomingRowsLinked += 1;
      } else {
        row.guestIds = [];
        delete row.guestId;
        summary.unresolvedRooming.push({
          guest: row.guest,
          reason: matches.length > 1 ? 'ambiguous' : 'unknown'
        });
      }
      summary.changed = true;
      continue;
    }

    if (Object.hasOwn(row, 'guestId')) {              // 4. v4, id already null
      row.guestIds = [];
      delete row.guestId;
      summary.roomingRowsWidened += 1;
      summary.changed = true;
    }
    // A row naming nobody in any shape is left as it is: still a booked room.
  }

  // 7. [v7] Row identity, on the arrays that were positional until now.
  for (const key of ROW_ID_ARRAYS) {
    const rows = Array.isArray(next[key]) ? next[key] : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      if (row.id) continue;
      row.id = newId();
      summary.rowIdsAdded += 1;
      summary.changed = true;
    }
  }

  // 8. [v7] The two section types that became documents of their own.
  if (Array.isArray(next.sections)) {
    const kept = [];
    let hasAccommodations = next.sections.some(
      (section) => section && section.type === 'accommodations');

    for (const section of next.sections) {
      if (!section || typeof section !== 'object') {
        kept.push(section);
        continue;
      }
      if (section.type === 'menu') {
        summary.sectionsDropped += 1;
        summary.changed = true;
        continue;
      }
      if (section.type === 'rooming') {
        if (hasAccommodations) {
          summary.sectionsDropped += 1;
          summary.changed = true;
          continue;
        }
        section.type = 'accommodations';
        if (OLD_ROOMING_TITLES.has(String(section.title || '').trim())) {
          section.title = 'Accommodations';
        }
        hasAccommodations = true;
        summary.sectionsRetyped += 1;
        summary.changed = true;
      }
      kept.push(section);
    }
    next.sections = kept;
  }

  // 9. [v9] Courses become a flat list of dishes.
  for (const block of Array.isArray(next.menu) ? next.menu : []) {
    if (!block || typeof block !== 'object') continue;
    if (Array.isArray(block.dishes)) {
      delete block.courses;
      continue;
    }
    if (!Array.isArray(block.courses)) continue;
    block.dishes = block.courses.flatMap((course) =>
      (course && Array.isArray(course.items) ? course.items : [])
        .map((item) => String(item == null ? '' : item)));
    delete block.courses;
    summary.menusFlattened += 1;
    summary.changed = true;
  }

  // 10. [v9] Two sections about the same people become one.
  if (Array.isArray(next.sections)) {
    const kept = [];
    let hasGuests = next.sections.some((entry) => entry && entry.type === 'guests');

    for (const entry of next.sections) {
      if (!entry || typeof entry !== 'object' || !MERGED_INTO_GUESTS.has(entry.type)) {
        kept.push(entry);
        continue;
      }
      if (hasGuests) {
        summary.sectionsDropped += 1;
        summary.changed = true;
        continue;
      }
      entry.type = 'guests';
      if (OLD_GUEST_TITLES.has(String(entry.title || '').trim())) entry.title = 'Guests';
      hasGuests = true;
      summary.sectionsRetyped += 1;
      summary.changed = true;
      kept.push(entry);
    }
    next.sections = kept;
  }

  // 11. [v9] Rooms the registry no longer carries. Reported, never touched.
  for (const row of Array.isArray(next.rooming) ? next.rooming : []) {
    if (!row || typeof row !== 'object') continue;
    const building = String(row.building || '');
    const room = row.room === null || row.room === undefined ? '' : String(row.room);
    if (!building) continue;
    if (assignmentModeFor(building) === 'none') {
      summary.retiredRooms.push({ building, room, reason: 'building' });
      continue;
    }
    // An empty room under a named building is §12.6 — a row nobody has finished
    // — and not a room that has been retired from the property.
    if (room && !roomsIn(building).includes(room)) {
      summary.retiredRooms.push({ building, room, reason: 'room' });
    }
  }

  // [v9], [v10] Fields the shape has always implied, filled in without counting
  // as a change — the same rule as the v5 attendee defaults above. The editors
  // write through these, and Save round-trips them.
  if (next.meta && typeof next.meta === 'object'
      && (!next.meta.includeInOrder || typeof next.meta.includeInOrder !== 'object')) {
    next.meta.includeInOrder = { rooming: false, menu: false };
  }
  if (!Array.isArray(next.overflowBuildings)) next.overflowBuildings = [];
  if (!Array.isArray(next.customActivities)) next.customActivities = [];

  // 12. [v10] A file that has never met a seeder is treated as fully seeded for
  //     its own range, so opening it adds nothing to any document.
  const hadLedger = next.seeded && typeof next.seeded === 'object';
  markSeeded(next);
  if (!hadLedger) summary.datesMarkedSeeded = next.seeded.meals.length;

  return { event: next, summary };
}

/** [v9] The section types that became `guests`. */
const MERGED_INTO_GUESTS = new Set(['attendees', 'accommodations']);

/**
 * [v9] Titles those two sections carried by default, renamed on the way to
 * `guests`. Anything else was chosen by a person and is kept — "Who is coming"
 * over a guest list is still true.
 */
const OLD_GUEST_TITLES = new Set([
  'Attendee List', 'Attendees', 'Attendee list', 'Guest List', 'Guests', 'Accommodations'
]);

/** [v7] The arrays whose rows were identified by position before v7. */
const ROW_ID_ARRAYS = ['rooming', 'schedule', 'staff', 'departments'];

/**
 * [v7] Titles a `rooming` section carried by default, which are renamed on the
 * way to `accommodations`. Anything else was chosen by a person and is kept.
 */
const OLD_ROOMING_TITLES = new Set(['Rooming', 'Rooming Assignments', 'Rooming Assignment']);

/**
 * Comparison key for a guest name: trimmed, inner whitespace collapsed, cased
 * down. Forgiving about how a name was typed in the old shape, without
 * collapsing two different people into one.
 *
 * @param {string} name
 * @returns {string} empty when there is no usable name
 */
function nameKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * @typedef {object} MigrationSummary
 * @property {boolean} changed whether this run modified the event
 * @property {number} attendeeIdsAdded attendees given an `id`
 * @property {number} roomingRowsLinked pre-v4 rows resolved from a `guest` name
 * @property {number} roomingRowsWidened v4 rows whose `guestId` became a party
 * @property {{guest: string, reason: 'ambiguous'|'unknown'}[]} unresolvedRooming
 *   rows whose `guest` name could not be matched, left with an empty
 *   `guestIds` and their name kept. Reported by the run that migrated them;
 *   from then on the row is in the current shape and validation §12.3 is what
 *   keeps reporting it, until someone picks the person.
 * @property {number} rowIdsAdded [v7] rows given an `id`
 * @property {number} sectionsRetyped [v7] `rooming` sections that became
 *   `accommodations`, [v9] and `attendees` or `accommodations` sections that
 *   became `guests`
 * @property {number} sectionsDropped [v7] `menu` sections, and duplicate
 *   `rooming` sections, removed from the outline. [v9] Also the second of an
 *   `attendees` / `accommodations` pair, once the first has become `guests`
 * @property {number} menusFlattened [v9] menu blocks whose `courses[]` became a
 *   flat `dishes[]`
 * @property {number} datesMarkedSeeded [v10] dates a pre-v10 file was marked as
 *   already seeded, so that opening it creates nothing
 * @property {{building: string, room: string, reason: 'building'|'room'}[]}
 *   retiredRooms [v9] rooming rows naming a building or a room the registry no
 *   longer carries. Reported and left alone: the row still holds its room, and
 *   §12.6 keeps reporting it until somebody moves that guest themselves
 */
