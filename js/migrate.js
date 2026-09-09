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

import { attendeeName } from './derive.js';
import { newId } from './ids.js';

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
    unresolvedRooming: []
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

  return { event: next, summary };
}

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
 */
