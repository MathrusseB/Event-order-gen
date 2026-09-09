// ISO date helpers.
//
// Dates are ISO `YYYY-MM-DD` strings everywhere in this app, and derive.js
// compares them as strings on purpose: ISO dates sort lexicographically, which
// sidesteps `Date` parsing and timezone drift entirely. Nothing here breaks
// that rule. `Date` appears only to walk a range and to format for display, and
// in both cases the string is split into parts and rebuilt as a *local* date —
// `new Date('2026-11-14')` is parsed as UTC midnight, which renders as the 13th
// anywhere west of Greenwich.

const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A cap on how many days a range may span before it is treated as nonsense.
 * A mistyped year turns an event into a 3,000-row table otherwise.
 */
const MAX_RANGE_DAYS = 400;

const SHORT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const MEDIUM = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const LONG = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/**
 * Whether a value is a real ISO calendar date. Rejects the shape and the
 * impossible alike, so February 30th does not become March 2nd downstream.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isIsoDate(value) {
  const text = String(value || '');
  if (!ISO_SHAPE.test(text)) return false;
  const [year, month, day] = text.split('-').map(Number);
  const probe = new Date(year, month - 1, day);
  return probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
}

/**
 * ISO string to a local `Date` at midnight.
 * @param {string} iso
 * @returns {Date|null}
 */
function toLocalDate(iso) {
  if (!isIsoDate(iso)) return null;
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Local `Date` back to an ISO string.
 * @param {Date} date
 * @returns {string}
 */
function toIso(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Every date from `start` to `end`, inclusive — the days of an event.
 *
 * @param {string} start ISO
 * @param {string} end ISO
 * @returns {string[]} empty when either date is missing, unparseable, or the
 *   range is backwards or implausibly long
 */
export function datesBetween(start, end) {
  const first = toLocalDate(start);
  const last = toLocalDate(end);
  if (!first || !last || first > last) return [];

  const dates = [];
  const cursor = new Date(first);
  while (cursor <= last && dates.length <= MAX_RANGE_DAYS) {
    dates.push(toIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates.length > MAX_RANGE_DAYS ? [] : dates;
}

/**
 * "Sat, Nov 14". For dated rows and tallies.
 * @param {string} iso
 * @returns {string} the input unchanged when it is not a date
 */
export function formatDate(iso) {
  const date = toLocalDate(iso);
  return date ? SHORT.format(date) : String(iso || '');
}

/**
 * "Nov 14". For naming a date inside a sentence.
 * @param {string} iso
 * @returns {string} the input unchanged when it is not a date
 */
export function formatDateShort(iso) {
  const date = toLocalDate(iso);
  return date ? MEDIUM.format(date) : String(iso || '');
}

/**
 * "November 14, 2026".
 * @param {string} iso
 * @returns {string} the input unchanged when it is not a date
 */
function formatDateLong(iso) {
  const date = toLocalDate(iso);
  return date ? LONG.format(date) : String(iso || '');
}

/**
 * An event's dates as one line: "November 14 – 16, 2026", collapsing the parts
 * the two ends share. Half a range still reads, so a half-filled header is not
 * a blank.
 *
 * @param {string} start ISO
 * @param {string} end ISO
 * @returns {string} empty when neither date is set
 */
export function formatDateRange(start, end) {
  const first = toLocalDate(start);
  const last = toLocalDate(end);
  if (!first && !last) return '';
  if (!first) return `Through ${LONG.format(last)}`;
  if (!last) return `From ${LONG.format(first)}`;
  if (first > last) return `${LONG.format(first)} – ${LONG.format(last)}`;
  if (toIso(first) === toIso(last)) return LONG.format(first);
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${MEDIUM.format(first)} – ${last.getDate()}, ${last.getFullYear()}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${MEDIUM.format(first)} – ${MEDIUM.format(last)}, ${last.getFullYear()}`;
  }
  return `${LONG.format(first)} – ${LONG.format(last)}`;
}
