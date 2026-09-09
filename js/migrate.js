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
 *   2. A rooming row carrying `guest` and no `guestId` is resolved by
 *      normalized name. One match: `guestId` is set and `guest` dropped.
 *   3. No match, or more than one, leaves `guestId` null and **keeps** the
 *      original `guest` string. The row stays visible, still renders, and the
 *      §12.3 orphan rule can report it by the name it was authored with.
 *      Guessing between two same-named guests is the failure v4 exists to end.
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
    unresolvedRooming: []
  };

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { event, summary };
  }

  const next = structuredClone(event);

  // 1. Attendee IDs first: the rooming pass resolves onto them.
  const attendees = Array.isArray(next.attendees) ? next.attendees : [];
  for (const attendee of attendees) {
    if (!attendee || typeof attendee !== 'object') continue;
    if (attendee.id) continue;
    attendee.id = newId();
    summary.attendeeIdsAdded += 1;
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

  // 3. Rooming rows.
  const rooming = Array.isArray(next.rooming) ? next.rooming : [];
  for (const row of rooming) {
    if (!row || typeof row !== 'object') continue;
    if (row.guestId) continue;              // already migrated
    if (!('guest' in row)) continue;        // nothing to resolve from

    const hadGuestId = Object.hasOwn(row, 'guestId');
    const matches = idsByName.get(nameKey(row.guest)) || [];

    if (matches.length === 1) {
      row.guestId = matches[0];
      delete row.guest;
      summary.roomingRowsLinked += 1;
      continue;
    }

    row.guestId = null;
    summary.unresolvedRooming.push({
      guest: row.guest,
      reason: matches.length > 1 ? 'ambiguous' : 'unknown'
    });
    // Only the first run changes the row; later runs re-report it unchanged.
    if (!hadGuestId) summary.changed = true;
  }

  if (summary.attendeeIdsAdded || summary.roomingRowsLinked) summary.changed = true;
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
 * @property {number} roomingRowsLinked rows resolved from `guest` to `guestId`
 * @property {{guest: string, reason: 'ambiguous'|'unknown'}[]} unresolvedRooming
 *   rows left with a null `guestId`. Reported on every load, not just the run
 *   that flagged them: they still need a person picked, and until one is they
 *   are orphans under §12.3.
 */
