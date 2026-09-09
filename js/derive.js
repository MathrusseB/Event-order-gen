// Derived fields — BUILD-SPEC §7.
//
// Pure functions. No DOM access, no module state, no imports. Every value the
// renders show as a count comes from here, so a count is computed once and
// never re-typed (BUILD-SPEC §1).
//
// Dates are ISO `YYYY-MM-DD` strings throughout. They are compared as strings:
// ISO dates sort lexicographically, which sidesteps `Date` parsing and
// timezone drift entirely. Never convert these to `Date` for comparison.

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
  const attendees = (event && event.attendees) || [];
  if (!date) return 0;
  return attendees.filter((attendee) => {
    const { arrive, depart } = stayWindow(event, attendee);
    if (!arrive || !depart) return false;
    return arrive <= date && date < depart;
  }).length;
}

/**
 * §7 — Rooms by building: count of `rooming[]` grouped by building.
 *
 * Keys are building names exactly as stored on the rooming rows, in order of
 * first appearance. Rows with no building are grouped under `''` so they stay
 * visible to validation rather than vanishing from the total.
 *
 * @param {object} event
 * @returns {Object<string, number>}
 */
export function roomsByBuilding(event) {
  const rooming = (event && event.rooming) || [];
  const counts = {};
  for (const row of rooming) {
    const building = row.building || '';
    counts[building] = (counts[building] || 0) + 1;
  }
  return counts;
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
