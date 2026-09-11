// Seeding the days of an event — BUILD-SPEC §5 (v10 changes).
//
// Setting the event dates puts three meal services and three blank itinerary
// rows on every day in range. Every private-side event has breakfast, lunch and
// dinner; typing them in by hand for a four-day weekend is twelve rows of the
// same three words, and the times are the same times every time.
//
// SEEDING FILLS GAPS AND DOES NOTHING ELSE. That sentence is the whole module,
// and each half of it is a rule somebody could reasonably break later:
//
//   * It never duplicates. A date that has been seeded is not seeded again,
//     even when the range is set a second time, even when the rows for that
//     date have since been deleted.
//   * It never overwrites. A seeded row is an ordinary row from the moment it
//     exists — retimed, renamed, moved, deleted like any other — and nothing
//     here ever looks at one again.
//   * It never resurrects. A row somebody deleted stays deleted, which is why
//     the event has to remember the dates it has already offered rather than
//     inferring them from what is currently there. "Not yet created" and
//     "created and removed" look identical in `foodAndBev[]`; they are
//     different in `seeded`.
//   * It never deletes. Narrowing the range leaves the meals outside it alone.
//     §12.9 already reports an item dated outside the event, and deleting a
//     guest's dinner because somebody corrected a date is exactly the quiet
//     loss this app is built to avoid. Widen the range again and the day comes
//     back untouched, because its date is still in the ledger and it was never
//     seeded twice.
//
// Nothing here is a write path of its own: every function takes the mutable
// draft `update()` hands out and mutates it in place, so a date change and the
// seeding it causes are one write and one render.

import { datesBetween } from './dates.js';
import { newId } from './ids.js';

/**
 * The three services every day gets. BUILD-SPEC §5 (v10 changes).
 *
 * Times are the ranch's, not a guess: breakfast is open for two hours, lunch
 * likewise, and dinner is called at 18:30. A partial arrival or departure day
 * is trimmed by hand, because nothing here knows which end of the day a group
 * is travelling on.
 */
export const SEEDED_MEALS = [
  { meal: 'Breakfast', start: '09:00', end: '11:00' },
  { meal: 'Lunch', start: '12:00', end: '14:00' },
  { meal: 'Dinner', start: '18:30', end: '20:30' }
];

/** How many blank itinerary rows a day starts with. */
export const SEEDED_ITINERARY_ROWS = 3;

/** The two kinds of seeding, and where each keeps its rows and its ledger. */
const KINDS = ['meals', 'itinerary'];

/** The ledger of dates already offered, created if the file arrived without one. */
function ledger(draft) {
  if (!draft.seeded || typeof draft.seeded !== 'object') draft.seeded = {};
  for (const kind of KINDS) {
    if (!Array.isArray(draft.seeded[kind])) draft.seeded[kind] = [];
  }
  return draft.seeded;
}

/** A draft array, created if the file arrived without one. */
function list(draft, key) {
  if (!Array.isArray(draft[key])) draft[key] = [];
  return draft[key];
}

/**
 * Put a row where it belongs by date and time, rather than on the end.
 *
 * Array order is print order for `foodAndBev[]` and the coordinator's to
 * change, so nothing already in the list moves. This only chooses where the new
 * row lands: seeding a day added to the *front* of an event should not put its
 * breakfast after the last night's dinner. A list somebody has deliberately
 * reordered out of date order gets an approximate answer, which is the right
 * trade — it is one row's position, and it is draggable.
 */
function insertByDateAndTime(rows, row) {
  const key = (entry) => `${entry.date || ''} ${entry.start || ''}`;
  const at = rows.findIndex((entry) => entry && key(entry) > key(row));
  if (at < 0) rows.push(row);
  else rows.splice(at, 0, row);
}

/**
 * Seed every day of the event that has not been offered rows yet.
 *
 * Called from the one place the event dates are written. Safe to call at any
 * time and any number of times: a date already in the ledger is skipped.
 *
 * @param {object} draft the mutable event from `update()`
 * @returns {{meals: number, itinerary: number, dates: string[],
 *   created: {list: string, id: string, date: string}[]}} what was created, for
 *   a caller that wants to say so — and [v13] which rows, for the one caller
 *   that may have to take them back off again (js/shift.js)
 */
export function seedForDates(draft) {
  const meta = (draft && draft.meta) || {};
  const dates = datesBetween(meta.startDate, meta.endDate);
  const seeded = ledger(draft);
  const made = { meals: 0, itinerary: 0, dates: [], created: [] };

  for (const date of dates) {
    if (!seeded.meals.includes(date)) {
      const services = list(draft, 'foodAndBev');
      for (const meal of SEEDED_MEALS) {
        const id = newId();
        made.created.push({ list: 'foodAndBev', id, date });
        insertByDateAndTime(services, {
          id,
          date,
          start: meal.start,
          end: meal.end,
          meal: meal.meal,
          // No location: the ranch has three or four, and a guess printed on an
          // order is worse than a blank somebody fills in (§6 [v10]).
          location: '',
          countBasis: 'present',
          serves: 'all'
        });
      }
      seeded.meals.push(date);
      made.meals += SEEDED_MEALS.length;
    }

    if (!seeded.itinerary.includes(date)) {
      const schedule = list(draft, 'schedule');
      for (let index = 0; index < SEEDED_ITINERARY_ROWS; index += 1) {
        // Blank and ready: no time, no activity. A row with a time already in
        // it would have to guess at a day nobody has described yet, and the
        // guess would be typed over every time.
        const id = newId();
        made.created.push({ list: 'schedule', id, date });
        insertByDateAndTime(schedule, { id, date, start: '', end: '', label: '' });
      }
      seeded.itinerary.push(date);
      made.itinerary += SEEDED_ITINERARY_ROWS;
    }

    if (made.dates.length === 0 || made.dates[made.dates.length - 1] !== date) {
      if (made.meals || made.itinerary) made.dates.push(date);
    }
  }

  for (const kind of KINDS) seeded[kind].sort();
  return made;
}

/**
 * Whether a row is still exactly as `seedForDates` made it.
 *
 * The question anything that wants to take a seeded row back off again has to
 * answer first. A seeded row is an ordinary row from the moment it exists (see
 * the note at the top of this module) and **nothing may delete one somebody has
 * touched** — so this is deliberately strict: every field as seeding wrote it,
 * and for a meal, no menu written against it. Anything else is content, and
 * content is never cleared for anybody's convenience.
 *
 * [v14] Lifted here from js/shift.js, which was the only caller when a shift
 * was the only thing that cleared a seeded row. Copying a day onto another one
 * clears them too, and what a seeded row looks like belongs beside the code
 * that makes them rather than beside one of the two things that unmake them.
 *
 * @param {object} event the whole event — a meal is only untouched while no
 *   menu block names it
 * @param {string} list which array the row came from
 * @param {object} row
 * @returns {boolean} false for anything that is not a seeded array
 */
export function isAsSeeded(event, list, row) {
  if (!row || typeof row !== 'object') return false;

  if (list === 'schedule') {
    return !row.start && !row.end && !String(row.label || '').trim();
  }
  if (list !== 'foodAndBev') return false;

  const asSeeded = SEEDED_MEALS.some((meal) => meal.meal === row.meal
    && meal.start === row.start && meal.end === row.end);
  const counted = row.count === undefined || row.count === null || row.count === '';
  const menu = (event && Array.isArray(event.menu)) ? event.menu : [];
  const written = menu.some((block) => block && block.fnbId === row.id);
  return asSeeded && counted && !written
    && !String(row.location || '').trim()
    && row.countBasis === 'present' && row.serves === 'all';
}

/**
 * Mark a date range as already offered, without creating anything.
 *
 * `migrate()` uses this on a file written before v10: it has the meals somebody
 * typed, and seeding over them would be the duplication this module exists to
 * prevent. A file that arrives mid-event and has never seen a seeder is treated
 * as fully seeded, which is the conservative answer — the coordinator can still
 * add any row by hand, and nothing appears in a document they did not put there.
 *
 * @param {object} draft
 * @returns {number} dates marked
 */
export function markSeeded(draft) {
  const meta = (draft && draft.meta) || {};
  const seeded = ledger(draft);
  let marked = 0;

  for (const date of datesBetween(meta.startDate, meta.endDate)) {
    for (const kind of KINDS) {
      if (seeded[kind].includes(date)) continue;
      seeded[kind].push(date);
      marked += 1;
    }
  }
  for (const kind of KINDS) seeded[kind].sort();
  return marked;
}
