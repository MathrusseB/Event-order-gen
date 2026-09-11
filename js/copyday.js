// Copying one day's itinerary onto another — BUILD-SPEC §5 (v14 changes).
//
// A private-side weekend repeats itself. Hunting goes out at 05:00 and is back
// by 09:00, downtime is 11:00 to 12:00, and the shape is the same on Friday,
// Saturday and Sunday. Typed out by hand that is the same four rows three
// times, and the third time is where the typo lands.
//
// So one day's `schedule[]` rows are copied onto another day, rebased. What
// that sentence deliberately does not say:
//
//   * **It does not copy meals.** `foodAndBev[]` is seeded for every day in
//     range already (seed.js), so copying breakfast onto a day that has one
//     serves it twice. The interface says this where the action lives, because
//     an omission nobody explains reads as a bug.
//   * **It copies what somebody wrote.** The blank rows seeding leaves are not
//     content, so they are not carried and a day nobody has written yet copies
//     nothing — which is also what keeps an aimless press from clearing the day
//     it was aimed at.
//   * **It does one day.** Not "fill the rest of the week": a coordinator who
//     wanted Saturday on Sunday and Monday presses the button twice, and the
//     one who wanted it only on Sunday is not undoing four days of rows.
//   * **It never overwrites content.** The target day usually holds the three
//     blank rows seeding put there, and those come off first so the copies do
//     not land underneath them. A row somebody typed into stays exactly where
//     it is, and the copies go in beside it. `isAsSeeded` (seed.js) is the
//     whole of the test, and it is the same one an accepted date shift uses.
//
// Every copy gets a fresh `newId()`. Two rows sharing an id is the one thing
// `reconcile` (dom.js) cannot survive: it keeps one node per key, so the second
// row of a duplicated pair would edit the first one's node.
//
// In the shape `update()` wants — `copyDayInto` takes the mutable draft and
// changes it in place, so a copy of eleven rows is one write, one render, one
// autosave and one `touchedAt` stamp rather than eleven of each. There is no
// undo in this app to be one press of; what this buys is that the copy either
// happened or did not, and that an undo, if one is ever added, takes the whole
// copy back rather than the last row of it. `planCopyDay` reads a frozen event
// and answers what would happen, which is what the interface says before and
// after.

import { datesBetween } from './dates.js';
import { newId } from './ids.js';
import { isAsSeeded } from './seed.js';

/** Rows of an event array, skipping holes a hand-edited file may carry. */
function rowsOf(event, key) {
  const list = event && event[key];
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

/** The itinerary rows on one date, in the order the array holds them. */
function rowsOn(event, date) {
  return date ? rowsOf(event, 'schedule').filter((row) => row.date === date) : [];
}

/**
 * The rows on one date that somebody has put something in.
 *
 * What a copy carries. The blank rows seeding leaves are not content and are
 * not worth carrying: the target day has three of its own, and a copy that
 * moved placeholders around would clear three blanks to put one back. It is
 * also what makes a copy from a day nobody has written yet do nothing at all,
 * rather than quietly clearing the day it was aimed at.
 */
function writtenOn(event, date) {
  return rowsOn(event, date).filter((row) => !isAsSeeded(event, 'schedule', row));
}

/**
 * The day a copy offers by default.
 *
 * The next day of the event, because a weekend that repeats itself repeats
 * forwards. The last day of an event has no next day, so it offers the one
 * before it rather than offering nothing — copying Sunday back onto Saturday is
 * a real thing to want and a target of "" is a control that cannot be used.
 *
 * @param {object} event
 * @param {string} from the source date
 * @returns {string} an ISO date in range, or '' when there is nowhere to go
 */
export function defaultTarget(event, from) {
  const meta = (event && event.meta) || {};
  const days = datesBetween(meta.startDate, meta.endDate);
  const at = days.indexOf(from);
  if (at < 0) return '';
  return days[at + 1] || days[at - 1] || '';
}

/**
 * What a copy would do, before it does it.
 *
 * Also what it did, afterwards: the interface asks for the same three numbers
 * in both directions, and computing them in one place is what stops the
 * sentence after a copy from disagreeing with the button that caused it.
 *
 * @param {object} event
 * @param {string} from the source date
 * @param {string} to the target date
 * @returns {{from: string, to: string, copies: number, clears: number,
 *   keeps: number}} `clears` is blank seeded rows that would come off the
 *   target, `keeps` is rows on the target that would stay because somebody
 *   wrote them
 */
export function planCopyDay(event, from, to) {
  const copies = from && to && from !== to ? writtenOn(event, from) : [];
  const landing = to ? rowsOn(event, to) : [];
  const clears = landing.filter((row) => isAsSeeded(event, 'schedule', row));
  return {
    from: from || '',
    to: to || '',
    copies: copies.length,
    clears: clears.length,
    keeps: landing.length - clears.length
  };
}

/**
 * Copy one day's itinerary onto another, in place.
 *
 * The copies land where the target day's rows already sit rather than on the
 * end of the array, so the flat list of rows below the preview stays in the
 * order the days are in. Array order is the coordinator's to change from there.
 *
 * The seeding ledger is deliberately untouched. `seeded.itinerary` records the
 * dates that have been *offered* rows, and the target day was — replacing its
 * blanks with real content does not un-offer it, and a day taken back out of
 * the ledger would be seeded three more blank rows the next time the dates were
 * touched.
 *
 * @param {object} draft the mutable event from `update()`
 * @param {string} from the source date
 * @param {string} to the target date
 * @returns {{copied: number, cleared: number}}
 */
export function copyDayInto(draft, from, to) {
  if (!draft || typeof draft !== 'object') return { copied: 0, cleared: 0 };
  if (!from || !to || from === to) return { copied: 0, cleared: 0 };

  if (!Array.isArray(draft.schedule)) draft.schedule = [];
  const schedule = draft.schedule;

  const copies = writtenOn(draft, from)
    .map((row) => ({
      id: newId(),
      date: to,
      start: row.start || '',
      end: row.end || '',
      label: row.label || ''
    }));
  if (!copies.length) return { copied: 0, cleared: 0 };

  // Taken before anything is removed, so it is the position of the target day's
  // block as the coordinator sees it. Every clearable row is on the target date
  // and so at or after this index, which is why removing them cannot move it.
  let at = schedule.findIndex((row) => row && row.date === to);
  if (at < 0) at = schedule.findIndex((row) => row && String(row.date || '') > to);
  if (at < 0) at = schedule.length;

  // Held by identity rather than by id: the draft rows are the objects being
  // filtered, and a hand-edited file can carry a row with no id at all — a set
  // of ids would then hold `undefined` and take every other id-less row in the
  // array with it.
  const doomed = new Set(schedule
    .filter((row) => row && row.date === to && isAsSeeded(draft, 'schedule', row)));

  if (doomed.size) {
    draft.schedule = schedule.filter((row) => !doomed.has(row));
  }
  draft.schedule.splice(at, 0, ...copies);

  return { copied: copies.length, cleared: doomed.size };
}
