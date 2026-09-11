// Moving an event's whole date range — BUILD-SPEC §5 (v13 changes).
//
// Narrowing the dates deletes nothing (§5, v10 changes) and that is right: an
// item dated outside the event is §12.9's to report, and deleting a guest's
// dinner because somebody corrected a date is the quiet loss this app exists to
// avoid. **Shifting is a different act.** An event moved from November to
// December is the same event on other days, and leaving every row behind
// strands the lot — an order moved to December came back with forty-five
// findings, every one of them for content that had simply not come with it.
//
// So when both dates move by the same number of days, the content is offered
// the same move. Offered, never taken: a coordinator correcting a mistyped year
// is not rescheduling anything, and the two are indistinguishable from the
// data. Nothing here runs unless somebody presses the button that runs it.
//
// Pure, and in the shape `update()` wants: `shiftEvent` takes the mutable draft
// and moves it in place, so a shift and the seeding that follows it are one
// write and one render. `plan` reads an event and answers what would move,
// which is what the offer says out loud before anything happens.
//
// ISO dates, moved with `shiftDate` (dates.js), which walks a *local* date
// rather than adding milliseconds — an event moved across the start of November
// would otherwise arrive a day early, and in the direction that loses somebody
// a bed.

import { shiftDate } from './dates.js';
import { isAsSeeded } from './seed.js';

/**
 * The dated fields, by the array that holds them.
 *
 * Everything in the file that names a day: the itinerary and the meals by
 * `date`, a rooming range and a guest's stay by their two ends, the staff roster
 * by `date`. `meta.revisionDate` is deliberately absent — it dates the paper,
 * not the event, and a revision line that moved itself would be lying about
 * when the order was last touched.
 */
const DATED_FIELDS = [
  { list: 'schedule', fields: ['date'] },
  { list: 'foodAndBev', fields: ['date'] },
  { list: 'rooming', fields: ['from', 'to'] },
  { list: 'attendees', fields: ['arrive', 'depart'] },
  { list: 'staff', fields: ['date'] }
];

/** What each array is called in a sentence, singular and plural. */
const NOUNS = {
  schedule: ['itinerary row', 'itinerary rows'],
  foodAndBev: ['meal service', 'meal services'],
  rooming: ['rooming range', 'rooming ranges'],
  attendees: ['guest stay', 'guest stays'],
  staff: ['staff assignment', 'staff assignments'],
  departments: ['department task', 'department tasks']
};

/** The two ledgers, and the array each of them remembers a seeding of. */
const LEDGERS = [
  { kind: 'meals', list: 'foodAndBev' },
  { kind: 'itinerary', list: 'schedule' }
];

/** Rows of an event array, skipping holes a hand-edited file may carry. */
function rowsOf(event, key) {
  const list = event && event[key];
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

/** A key for one row of one array — two arrays could carry the same id. */
function rowKey(list, id) {
  return `${list}:${id}`;
}

/**
 * The rows seeding put down while the dates were half-typed, and which of them
 * may be taken back off.
 *
 * WHY THIS EXISTS AT ALL. The two date fields are typed one after the other, so
 * every move passes through a half-move — and where that half-move widens the
 * range (moving an event *earlier* does), seeding fills the days it opens up
 * before anybody could have known a shift was coming. Left alone, those blank
 * rows would sit on top of the content arriving from the old dates: two
 * breakfasts on the same morning, one of them nobody typed.
 *
 * So the offer's caller records what seeding created during the move, and an
 * accepted shift clears exactly those rows — app-created, still blank, seconds
 * old — before moving anything. A declined shift clears nothing: those days
 * were seeded, and seeding never takes a row back (§5, v10 changes).
 *
 * @param {object} event
 * @param {{list: string, id: string, date: string}[]} created
 * @returns {Set<string>} `rowKey` for every row that will be cleared
 */
function clearable(event, created) {
  const keys = new Set();
  for (const entry of created || []) {
    if (!entry || !entry.id) continue;
    const row = rowsOf(event, entry.list).find((item) => item.id === entry.id);
    if (row && isAsSeeded(event, entry.list, row)) keys.add(rowKey(entry.list, entry.id));
  }
  return keys;
}

/**
 * What an offset would move, before anything moves.
 *
 * This is the offer, as data: the number of days, what would travel with them,
 * and how much of it. The interface says it out loud — §5 (v13 changes) asks
 * that the offset and the count be named before anything happens, because a
 * coordinator correcting a typo and a coordinator rescheduling an event press
 * the same two date fields.
 *
 * @param {object} event
 * @param {number} days the offset, negative for earlier
 * @param {{list: string, id: string, date: string}[]} [created] rows seeding
 *   put down during the move, which are cleared rather than moved
 * @returns {{days: number, total: number, cleared: number,
 *   parts: {list: string, count: number, noun: string}[]}}
 */
export function plan(event, days, created = []) {
  const skip = clearable(event, created);
  const parts = [];
  let total = 0;

  for (const kind of DATED_FIELDS) {
    let count = 0;
    for (const row of rowsOf(event, kind.list)) {
      if (skip.has(rowKey(kind.list, row.id))) continue;
      if (kind.fields.some((field) => Boolean(row[field]))) count += 1;
    }
    if (!count) continue;
    total += count;
    parts.push({ list: kind.list, count, noun: NOUNS[kind.list][count === 1 ? 0 : 1] });
  }

  let tasks = 0;
  for (const department of rowsOf(event, 'departments')) {
    tasks += (Array.isArray(department.duringEvent) ? department.duringEvent : [])
      .filter((task) => task && task.date).length;
  }
  if (tasks) {
    total += tasks;
    parts.push({ list: 'departments', count: tasks, noun: NOUNS.departments[tasks === 1 ? 0 : 1] });
  }

  return { days, total, cleared: skip.size, parts };
}

/**
 * Move every dated row, and the seeding ledger with them.
 *
 * The ledger moves because the content moves: a day arriving with a full
 * itinerary on it has been offered its rows already, and seeding it a second
 * time is the duplication `seeded` exists to prevent (§5, v10 changes). Which
 * is why `seedForDates` may then be called as normal for the new range — it
 * finds those days already in the ledger and creates nothing, and creates rows
 * for any day the new range holds that the old one did not.
 *
 * A field that is not a date is left exactly as it is: an empty `from` on a
 * rooming row means "follow the guest" (§5, v3 changes) and moving it would
 * turn a defaulted date into a typed one.
 *
 * @param {object} draft the mutable event from `update()`
 * @param {number} days
 * @param {{list: string, id: string, date: string}[]} [created] rows seeding
 *   put down during the move — cleared, with the ledger dates that made them
 * @returns {{days: number, moved: number, cleared: number}}
 */
export function shiftEvent(draft, days, created = []) {
  if (!draft || typeof draft !== 'object' || !Number.isInteger(days) || days === 0) {
    return { days: 0, moved: 0, cleared: 0 };
  }

  const skip = clearable(draft, created);

  // Off first, so nothing blank is carried to a day that is about to receive
  // the real thing.
  for (const kind of LEDGERS) {
    const dropped = (created || []).filter((entry) => entry && entry.list === kind.list
      && skip.has(rowKey(kind.list, entry.id)));
    if (!dropped.length) continue;

    if (Array.isArray(draft[kind.list])) {
      draft[kind.list] = draft[kind.list]
        .filter((row) => !(row && skip.has(rowKey(kind.list, row.id))));
    }

    // A ledger date comes off only when every row seeding made for it that day
    // has come off with it. One row of the three edited into something real
    // means the day was used, and the day stays offered.
    const kept = new Set((created || [])
      .filter((entry) => entry && entry.list === kind.list
        && !skip.has(rowKey(kind.list, entry.id)))
      .map((entry) => entry.date));
    const gone = new Set(dropped.map((entry) => entry.date).filter((date) => !kept.has(date)));
    const ledger = draft.seeded && Array.isArray(draft.seeded[kind.kind])
      ? draft.seeded[kind.kind] : null;
    if (ledger) draft.seeded[kind.kind] = ledger.filter((date) => !gone.has(date));
  }

  let moved = 0;
  for (const kind of DATED_FIELDS) {
    for (const row of rowsOf(draft, kind.list)) {
      let touched = false;
      for (const field of kind.fields) {
        const next = shiftDate(row[field], days);
        if (!next) continue;
        row[field] = next;
        touched = true;
      }
      if (touched) moved += 1;
    }
  }

  for (const department of rowsOf(draft, 'departments')) {
    for (const task of Array.isArray(department.duringEvent) ? department.duringEvent : []) {
      if (!task || !task.date) continue;
      const next = shiftDate(task.date, days);
      if (!next) continue;
      task.date = next;
      moved += 1;
    }
  }

  if (draft.seeded && typeof draft.seeded === 'object') {
    for (const kind of LEDGERS) {
      if (!Array.isArray(draft.seeded[kind.kind])) continue;
      draft.seeded[kind.kind] = draft.seeded[kind.kind]
        .map((date) => shiftDate(date, days) || date)
        .sort();
    }
  }

  return { days, moved, cleared: skip.size };
}
