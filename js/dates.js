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
const FULL = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

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
 * [v8] "Saturday, November 14". The heading over a day of the itinerary.
 *
 * The weekday is spelled out because that is how a weekend is talked about at
 * the ranch — "Saturday's hunt", not "the 14th's hunt" — and the year is left
 * off because the header above it already carries the date range.
 *
 * @param {string} iso
 * @returns {string} the input unchanged when it is not a date
 */
export function formatDateFull(iso) {
  const date = toLocalDate(iso);
  return date ? FULL.format(date) : String(iso || '');
}

/**
 * "November 14, 2026". The revision line's date, among others.
 * @param {string} iso
 * @returns {string} the input unchanged when it is not a date
 */
export function formatDateLong(iso) {
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

/** "6:30 PM". Times are ISO `HH:MM` strings, as stored. */
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * A stored `HH:MM` as a readable clock time.
 *
 * BUILD-SPEC §7 [v7] is explicit that `itineraryFor` does not format times —
 * that is the render's job, and this is where the renders and the editors come
 * to agree on one spelling of "18:30".
 *
 * @param {string} value ISO `HH:MM`
 * @returns {string} the input unchanged when it is not a time
 */
export function formatTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return String(value || '');
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return String(value);
  return TIME.format(new Date(2000, 0, 1, hours, minutes));
}

/**
 * "6:30 PM" or "5:00 - 6:00 PM". An entry with no end time is a moment, not a
 * span — §5 shows `end: null` throughout `schedule[]` and `foodAndBev[]` — so
 * a missing end prints nothing rather than an empty dash.
 *
 * @param {string} start ISO `HH:MM`
 * @param {string} end ISO `HH:MM`
 * @returns {string} empty when there is no start and no end
 */
export function formatTimeRange(start, end) {
  const from = formatTime(start);
  const to = formatTime(end);
  if (from && to) return `${from} - ${to}`;
  return from || to || '';
}
