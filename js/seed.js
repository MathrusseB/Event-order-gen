// Seeding the days of an event — BUILD-SPEC §5 (v10 changes, v15 changes).
//
// Setting the event dates puts meal services and three blank itinerary rows on
// every day in range. Every private-side event has breakfast, lunch and dinner;
// typing them in by hand for a four-day weekend is twelve rows of the same
// three words, and the times are the same times every time.
//
// [v15] BUT NOT ON THE FIRST AND LAST DAY. Guests arrive in the afternoon and
// leave in the morning, so an arrival day seeded with a 09:00 breakfast puts a
// service on the order seven hours before anybody is on the property, and a
// departure day carries a dinner for a party that went home. The first day
// seeds Dinner, the last day seeds Breakfast, and every day between seeds all
// three. A single-day event seeds all three: both rules apply to it at once and
// their intersection is nothing, which is plainly wrong — with no arrival or
// departure to reason from, seed everything and let it be trimmed.
//
// It is a default and not a constraint. Nothing stops a meal being added to any
// day, nothing here removes one that is already there, and the itinerary
// preview can take one off (js/editors/schedule.js [v15]).
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

/** [v15] The one service an arrival day gets, and the one a departure day gets. */
const ARRIVAL_DAY_MEAL = 'Dinner';
const DEPARTURE_DAY_MEAL = 'Breakfast';

/**
 * [v15] Which of the three a day is offered — BUILD-SPEC §5 (v15 changes).
 *
 * **Keyed on the event's own first and last date, never on guest arrivals.**
 * The dates are the first thing typed into a new order and the attendee list is
 * usually the last, so a rule that read `attendees[].arrive` would be reading an
 * empty array at the only moment it runs and would simply never fire. The dates
 * are also the thing the coordinator is asserting when they set them: this
 * event starts on the 6th, which means people turn up on the 6th.
 *
 * A range of one day gets all three — see the note at the top of this module.
 * So does a date the range does not contain, which `seedForDates` cannot ask
 * about but an outside caller could: with no edge to reason from, the answer is
 * everything.
 *
 * @param {string[]} dates the event's days, in order — `datesBetween` output
 * @param {string} date the day being seeded
 * @returns {{meal: string, start: string, end: string}[]} a subset of
 *   `SEEDED_MEALS`, in serving order
 */
export function mealsSeededFor(dates, date) {
  const days = Array.isArray(dates) ? dates : [];
  if (days.length < 2 || !days.includes(date)) return SEEDED_MEALS;
  if (date === days[0]) {
    return SEEDED_MEALS.filter((service) => service.meal === ARRIVAL_DAY_MEAL);
  }
  if (date === days[days.length - 1]) {
    return SEEDED_MEALS.filter((service) => service.meal === DEPARTURE_DAY_MEAL);
  }
  return SEEDED_MEALS;
}

/** How many blank itinerary rows a day starts with. */
export const SEEDED_ITINERARY_ROWS = 3;

/** The two kinds of seeding, and where each keeps its rows and its ledger. */
const KINDS = ['meals', 'itinerary'];

/* ------------------------------------------------ [v16] the meals ledger */

/**
 * What separates the date from the meal in a meals-ledger entry.
 *
 * A pipe because no ISO date holds one and nothing but this module writes the
 * meal half — the three names come from `SEEDED_MEALS` and never from anything
 * somebody typed.
 */
const LEDGER_SEP = '|';

/**
 * One meals-ledger entry — BUILD-SPEC §5 (v16 changes).
 *
 * **Why a string and not an object or a map.** The ledger was `string[]` and
 * stays `string[]`: the JSON type does not change, `sort()` goes on producing a
 * sensible order (by date, then by meal name), and a v15 file's bare dates and
 * a v16 file's keys can sit in the same array while the upgrade runs. An object
 * keyed by date would have been a different type in the file, a different
 * migration, and a rewrite of everything that walks the ledger — for the same
 * information.
 *
 * @param {string} date ISO
 * @param {string} meal as `SEEDED_MEALS` writes it
 * @returns {string}
 */
export function mealLedgerKey(date, meal) {
  return `${date}${LEDGER_SEP}${meal}`;
}

/**
 * The date half of a ledger entry, whichever ledger and whichever format.
 *
 * The itinerary ledger is bare dates and always will be — there is nothing to
 * name, and the number of rows a day gets does not change with the day's
 * position in the range — so this answers for both.
 *
 * @param {string} entry
 * @returns {string}
 */
export function ledgerEntryDate(entry) {
  const text = String(entry || '');
  const at = text.indexOf(LEDGER_SEP);
  return at < 0 ? text : text.slice(0, at);
}

/**
 * The same entry on another date. For the one caller that moves a whole event
 * (js/shift.js) and must not have to know what an entry is made of.
 *
 * @param {string} entry
 * @param {string} date
 * @returns {string}
 */
export function ledgerEntryOn(entry, date) {
  const text = String(entry || '');
  const at = text.indexOf(LEDGER_SEP);
  return at < 0 ? date : `${date}${text.slice(at)}`;
}

/**
 * A meal name as it compares. Case and spacing are not a difference — a
 * coordinator who typed "breakfast" has put breakfast on the day.
 *
 * @param {string} value
 * @returns {string}
 */
export function mealNameKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Bring a v15 meals ledger up to v16, in place. Idempotent.
 *
 * **A date in the old ledger was offered whatever the rule gave it at the time,
 * and that is not recoverable** — the rule reads the range as it stands, and
 * the range may have moved since. So an old entry is read as every meal having
 * been offered on that date, which is the conservative direction: it can leave
 * a day short of a meal nobody will now be offered, and it cannot resurrect one
 * somebody deleted. A meal is cheap to add and a duplicate on a printed order
 * is not.
 *
 * @param {object} draft an event with `seeded.meals` already an array
 * @returns {{dates: number}} old-format dates expanded by this run, 0 on a
 *   ledger that was already v16 or on an event that has none
 */
export function upgradeMealLedger(draft) {
  const seeded = draft && draft.seeded;
  if (!seeded || typeof seeded !== 'object' || !Array.isArray(seeded.meals)) return { dates: 0 };

  const upgraded = [];
  const seen = new Set();
  let dates = 0;

  const keep = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    upgraded.push(key);
  };

  for (const entry of seeded.meals) {
    const text = String(entry || '');
    if (!text) continue;
    if (text.includes(LEDGER_SEP)) {
      keep(text);
      continue;
    }
    dates += 1;
    for (const service of SEEDED_MEALS) keep(mealLedgerKey(text, service.meal));
  }

  upgraded.sort();
  seeded.meals = upgraded;
  return { dates };
}

/**
 * The ledger of what has already been offered, created if the file arrived
 * without one and brought up to the current shape if it arrived with an old one.
 *
 * The upgrade runs here rather than only in `migrate()` so that every path into
 * seeding gets it — a hand-edited file, a fixture built in a test, an event
 * assembled by a future caller that never met the migrator.
 */
function ledger(draft) {
  if (!draft.seeded || typeof draft.seeded !== 'object') draft.seeded = {};
  for (const kind of KINDS) {
    if (!Array.isArray(draft.seeded[kind])) draft.seeded[kind] = [];
  }
  upgradeMealLedger(draft);
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
 * [v16] THE MEALS LEDGER RECORDS WHICH MEALS, AND THE EXISTENCE CHECK IS WHAT
 * MAKES THAT SAFE. v15 recorded only the date, on the grounds that a finer
 * ledger would offer a former first day its Lunch later and double a Lunch the
 * coordinator had added by hand — which is true of a finer ledger *alone*. Two
 * tests, and the pair holds where neither half does:
 *
 *   * the ledger has not offered that meal on that date, **and**
 *   * no meal of that name is already on that date.
 *
 * The ledger keeps a deliberately deleted meal deleted — it was offered, and
 * seeding never offers twice. The existence check keeps a hand-added one from
 * being doubled — it is there, so nothing is owed. A day whose position in the
 * range changes is now offered what its new position is due, which is the gap
 * v15 left: a two-day event extended to three left the old departure morning
 * carrying breakfast and nothing else, with no warning, until the kitchen asked.
 *
 * The itinerary ledger stays per date. There is nothing to name, and three
 * blank rows is three blank rows wherever the day falls.
 *
 * @param {object} draft the mutable event from `update()`
 * @returns {{meals: number, skipped: number, itinerary: number, dates: string[],
 *   created: {list: string, id: string, date: string, meal?: string}[]}} what
 *   was created, for a caller that wants to say so — [v13] which rows, for the
 *   one caller that may have to take them back off again (js/shift.js), and
 *   [v16] `skipped`, the meals the day was owed and already had
 */
export function seedForDates(draft) {
  const meta = (draft && draft.meta) || {};
  const dates = datesBetween(meta.startDate, meta.endDate);
  const seeded = ledger(draft);
  const made = { meals: 0, skipped: 0, itinerary: 0, dates: [], created: [] };

  const offeredKeys = new Set(seeded.meals);

  for (const date of dates) {
    const services = list(draft, 'foodAndBev');
    // [v15] A subset on the first and last day; [v16] each asked for on its own.
    for (const meal of mealsSeededFor(dates, date)) {
      const key = mealLedgerKey(date, meal.meal);
      // Settled: this date has been offered this meal, whether it was taken or
      // skipped, and whether it is still there. Seeding never asks twice.
      if (offeredKeys.has(key)) continue;

      // [v16] THE EXISTENCE CHECK, and the finer ledger is only safe with it.
      // Nothing in the file tells a hand-added Lunch from a seeded one, so a
      // ledger that knew the day was owed a Lunch would hand over a second.
      const present = services.some((row) => row && row.date === date
        && mealNameKey(row.meal) === mealNameKey(meal.meal));

      offeredKeys.add(key);
      seeded.meals.push(key);

      if (present) {
        made.skipped += 1;
        continue;
      }

      const id = newId();
      made.created.push({ list: 'foodAndBev', id, date, meal: meal.meal });
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
      made.meals += 1;
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
 * [v16] Marks each date's three meals rather than the date alone, and so
 * records as settled the meals that are already on the day — which is what a
 * skipped meal is. A meal on the paper is not a meal that is pending.
 *
 * @param {object} draft
 * @returns {number} ledger entries added — meals and itinerary days together
 */
export function markSeeded(draft) {
  const meta = (draft && draft.meta) || {};
  const seeded = ledger(draft);
  let marked = 0;

  for (const date of datesBetween(meta.startDate, meta.endDate)) {
    // [v16] Every meal, not merely the date. "Fully seeded" is the whole point
    // of this function, and under a per-meal ledger the whole of a day is its
    // three services — a day marked with only the two its position is due would
    // be handed the third the moment the range moved.
    for (const service of SEEDED_MEALS) {
      const key = mealLedgerKey(date, service.meal);
      if (seeded.meals.includes(key)) continue;
      seeded.meals.push(key);
      marked += 1;
    }
    if (!seeded.itinerary.includes(date)) {
      seeded.itinerary.push(date);
      marked += 1;
    }
  }
  for (const kind of KINDS) seeded[kind].sort();
  return marked;
}
