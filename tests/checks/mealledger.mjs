// A ledger that knows which meals — BUILD-SPEC §5 (v16 changes).
//
// v15 recorded that a date had been offered meals, not which ones, and chose
// that deliberately: a finer ledger would offer a former first day its Lunch
// later and duplicate a Lunch the coordinator had added by hand, because
// nothing in the file tells one from the other.
//
// It left a gap, and the gap is ordinary:
//
//   two-day event      11-06 Dinner  |  11-07 Breakfast
//   extend to three    11-06 Dinner  |  11-07 Breakfast  |  11-08 Breakfast
//
// The 7th is a full middle day carrying breakfast and nothing else. No lunch,
// no dinner, no warning. A group adds a night, the end date moves, and the old
// departure morning is two meals short until the kitchen asks.
//
// **The ledger does not have to be the only test.** Record per date and meal
// name, and before seeding a meal also check whether a meal of that name is
// already on that date. Then:
//
//   | case                        | finer ledger alone | with the check |
//   | day becomes a middle day    | offered — fixed    | offered — fixed |
//   | Lunch was added by hand     | offered — DOUBLE   | skipped, marked |
//   | seeded Lunch was deleted    | marked, stays gone | marked, stays gone |
//
// All three hold, which is what this file is for. The two that matter most are
// the ones nothing else in the harness can catch: a duplicate meal on a printed
// order, and a meal somebody deleted coming back.

import { migrate } from '../../js/migrate.js';
import {
  ledgerEntryDate,
  markSeeded,
  mealLedgerKey,
  mealNameKey,
  seedForDates,
  upgradeMealLedger
} from '../../js/seed.js';

export const title = 'The meals ledger — which meals, not merely which days';

/** A bare event with a range on it, in the shape `seedForDates` wants. */
function range(startDate, endDate) {
  return { meta: { startDate, endDate } };
}

/** The meals on one date, sorted so a check is about the set and not the order. */
function mealsOn(event, date) {
  return (event.foodAndBev || []).filter((row) => row.date === date)
    .map((row) => row.meal).sort().join(',');
}

/** Every meal on an event, as `06 Dinner` strings in array order. */
function menuOf(event) {
  return (event.foodAndBev || []).map((row) => `${row.date.slice(8)} ${row.meal}`);
}

/** How many rows of one meal name sit on one date. */
function countOn(event, date, meal) {
  return (event.foodAndBev || [])
    .filter((row) => row.date === date && mealNameKey(row.meal) === mealNameKey(meal)).length;
}

export async function run({ check }) {
  /* ------------------------------------------------------ the reproduction */

  const extended = range('2026-11-06', '2026-11-07');
  seedForDates(extended);
  const twoDay = menuOf(extended).join(' | ');

  extended.meta.endDate = '2026-11-08';
  const grew = seedForDates(extended);

  check(
    'A TWO-DAY EVENT EXTENDED TO THREE GIVES THE MIDDLE DAY ALL THREE MEALS',
    twoDay === '06 Dinner | 07 Breakfast'
      && mealsOn(extended, '2026-11-06') === 'Dinner'
      && mealsOn(extended, '2026-11-07') === 'Breakfast,Dinner,Lunch'
      && mealsOn(extended, '2026-11-08') === 'Breakfast',
    `was ${twoDay} — now ${menuOf(extended).join(' | ')}`
  );

  check(
    'and it was three new meals: the 7th owed two, the 8th owed its breakfast',
    grew.meals === 3 && grew.skipped === 0,
    `${grew.meals} created, ${grew.skipped} skipped`
  );

  /* ----------------------------------- what the existence check is holding */

  // The hand-added meal has to be on a day whose *entitlement* changes, or the
  // existence check never runs: the arrival day is never offered a Lunch at
  // all, so a Lunch typed onto one is in no danger from seeding. The departure
  // day that becomes a middle day is the case — it is owed a Lunch the moment
  // the range grows, and it already has one.
  const byHand = range('2026-11-06', '2026-11-08');
  seedForDates(byHand);
  byHand.foodAndBev.push({
    id: 'hand-lunch', date: '2026-11-08', start: '12:30', end: '14:00',
    meal: 'Lunch', location: 'The Wheel', countBasis: 'present', serves: 'all'
  });
  byHand.meta.endDate = '2026-11-09';
  const afterHand = seedForDates(byHand);

  check(
    'A LUNCH ADDED BY HAND IS NOT DOUBLED WHEN ITS DAY BECOMES ONE THAT IS OWED A LUNCH',
    countOn(byHand, '2026-11-08', 'Lunch') === 1
      && mealsOn(byHand, '2026-11-08') === 'Breakfast,Dinner,Lunch',
    `${countOn(byHand, '2026-11-08', 'Lunch')} lunches: ${menuOf(byHand).join(' | ')}`
  );

  check(
    'the one that survived is the one somebody typed, with the time and place they gave it',
    byHand.foodAndBev.some((row) => row.id === 'hand-lunch' && row.start === '12:30'
      && row.location === 'The Wheel'),
    JSON.stringify(byHand.foodAndBev.find((row) => row.id === 'hand-lunch'))
  );

  check(
    'and the ledger says that Lunch is settled rather than pending',
    byHand.seeded.meals.includes(mealLedgerKey('2026-11-08', 'Lunch'))
      && afterHand.skipped === 1 && afterHand.meals === 2,
    `${afterHand.skipped} skipped, ${afterHand.meals} created; ledger has `
      + `${byHand.seeded.meals.filter((entry) => entry.startsWith('2026-11-08')).join(' ')}`
  );

  // The proof that "settled" means settled: touch the dates again, and the day
  // that already answered for its Lunch is not asked a second time.
  byHand.meta.endDate = '2026-11-10';
  seedForDates(byHand);
  check(
    'and it stays one lunch however many times the dates are touched afterwards',
    countOn(byHand, '2026-11-08', 'Lunch') === 1,
    `${countOn(byHand, '2026-11-08', 'Lunch')} lunches after a second date change`
  );

  // The other half of the same sentence: a meal the rule never offers is never
  // in danger from seeding, whatever the ledger says about the day.
  const onArrival = range('2026-11-06', '2026-11-08');
  seedForDates(onArrival);
  onArrival.foodAndBev.push({
    id: 'arrival-lunch', date: '2026-11-06', start: '12:00', end: '14:00',
    meal: 'Lunch', location: '', countBasis: 'present', serves: 'all'
  });
  onArrival.meta.endDate = '2026-11-09';
  seedForDates(onArrival);
  check(
    'a Lunch on the arrival day is left alone — an arrival day is never offered one',
    countOn(onArrival, '2026-11-06', 'Lunch') === 1
      && mealsOn(onArrival, '2026-11-06') === 'Dinner,Lunch',
    mealsOn(onArrival, '2026-11-06')
  );

  const lowerCase = range('2026-11-06', '2026-11-08');
  lowerCase.foodAndBev = [{
    id: 'typed', date: '2026-11-07', start: '08:30', end: '10:00',
    meal: '  breakfast ', location: 'The Wheel', countBasis: 'present', serves: 'all'
  }];
  const lowerMade = seedForDates(lowerCase);
  check(
    'A MEAL TYPED "breakfast" IS THE SAME MEAL — case and spacing are not a difference',
    countOn(lowerCase, '2026-11-07', 'Breakfast') === 1
      && lowerCase.foodAndBev.filter((row) => row.date === '2026-11-07').length === 3
      && lowerMade.skipped === 1,
    `${lowerMade.skipped} skipped: ${menuOf(lowerCase).join(' | ')}`
  );

  check(
    'and the one that was typed is the one that is still there, untouched',
    lowerCase.foodAndBev.some((row) => row.id === 'typed' && row.start === '08:30'
      && row.location === 'The Wheel'),
    JSON.stringify(lowerCase.foodAndBev.find((row) => row.id === 'typed'))
  );

  /* ------------------------------------ what the ledger alone is holding */

  const deleted = range('2026-11-06', '2026-11-08');
  seedForDates(deleted);
  deleted.foodAndBev = deleted.foodAndBev
    .filter((row) => !(row.date === '2026-11-07' && row.meal === 'Lunch'));
  seedForDates(deleted);

  check(
    'A SEEDED LUNCH SOMEBODY DELETED STAYS DELETED WHEN THE DATES ARE TOUCHED',
    mealsOn(deleted, '2026-11-07') === 'Breakfast,Dinner',
    mealsOn(deleted, '2026-11-07')
  );

  // And when the day's position changes, which is the case the finer ledger
  // exists for. It must not become a reason to hand the meal back.
  deleted.meta.endDate = '2026-11-09';
  seedForDates(deleted);
  check(
    'AND STAYS DELETED WHEN THAT DAY STOPS BEING A MIDDLE DAY OR STARTS BEING ONE',
    mealsOn(deleted, '2026-11-07') === 'Breakfast,Dinner'
      // The 8th did change position, was owed two, and got them.
      && mealsOn(deleted, '2026-11-08') === 'Breakfast,Dinner,Lunch',
    `7th: ${mealsOn(deleted, '2026-11-07')} — 8th: ${mealsOn(deleted, '2026-11-08')}`
  );

  const deletedEnd = range('2026-11-06', '2026-11-08');
  seedForDates(deletedEnd);
  deletedEnd.foodAndBev = deletedEnd.foodAndBev
    .filter((row) => !(row.date === '2026-11-08' && row.meal === 'Breakfast'));
  deletedEnd.meta.endDate = '2026-11-09';
  seedForDates(deletedEnd);
  check(
    'a departure breakfast deleted, then made a middle day, gets lunch and dinner and no breakfast',
    mealsOn(deletedEnd, '2026-11-08') === 'Dinner,Lunch',
    mealsOn(deletedEnd, '2026-11-08')
  );

  /* --------------------------------------------------------- the migration */

  const old = {
    meta: { eventName: 'A v15 file', startDate: '2026-11-06', endDate: '2026-11-08' },
    sections: [],
    seeded: {
      meals: ['2026-11-06', '2026-11-07', '2026-11-08'],
      itinerary: ['2026-11-06', '2026-11-07', '2026-11-08']
    },
    foodAndBev: [
      { id: 'm1', date: '2026-11-06', start: '18:30', end: '20:30', meal: 'Dinner',
        location: '', countBasis: 'present', serves: 'all' }
    ],
    schedule: [], menu: [], attendees: [], rooming: [], staff: [], departments: [],
    buildingsInUse: [], overflowBuildings: []
  };

  const first = migrate(old);
  check(
    'A PRE-v16 FILE LOADS WITH ITS DATE-ONLY LEDGER READ AS ALL THREE MEALS',
    first.summary.mealLedgerUpgraded === 3
      && first.event.seeded.meals.length === 9
      && first.event.seeded.meals.includes(mealLedgerKey('2026-11-07', 'Lunch'))
      && [...new Set(first.event.seeded.meals.map(ledgerEntryDate))].length === 3,
    `${first.summary.mealLedgerUpgraded} dates upgraded, `
      + `${first.event.seeded.meals.length} entries`
  );

  check(
    'and it is not seeded over — the one meal it carries is the only meal it has',
    (() => {
      const made = seedForDates(first.event);
      return made.meals === 0 && made.skipped === 0 && first.event.foodAndBev.length === 1;
    })(),
    menuOf(first.event).join(' | ') || 'nothing'
  );

  const twice = migrate(first.event);
  check(
    'MIGRATING TWICE CHANGES NOTHING — the upgrade is idempotent',
    twice.summary.mealLedgerUpgraded === 0
      && twice.event.seeded.meals.join(',') === first.event.seeded.meals.join(','),
    `${twice.summary.mealLedgerUpgraded} upgraded on the second pass`
  );

  check(
    'a file with no ledger at all is still marked fully seeded, and counted in dates',
    (() => {
      const none = migrate({
        meta: { startDate: '2026-11-06', endDate: '2026-11-08' },
        foodAndBev: [], schedule: [], attendees: [], rooming: [], menu: [], staff: [],
        departments: [], sections: []
      });
      return none.summary.datesMarkedSeeded === 3
        && none.summary.mealLedgerUpgraded === 0
        && none.event.seeded.meals.length === 9;
    })(),
    'a file that has never met a seeder must not be seeded over'
  );

  /* ----------------------------------------------- the shapes of the thing */

  check(
    'upgrading a ledger that is already v16 leaves it exactly as it was',
    (() => {
      const already = { seeded: { meals: [mealLedgerKey('2026-11-06', 'Dinner')], itinerary: [] } };
      const result = upgradeMealLedger(already);
      return result.dates === 0 && already.seeded.meals.join(',') === '2026-11-06|Dinner';
    })(),
    'idempotence is the whole contract of a migration that runs on every load'
  );

  check(
    'a ledger half upgraded — a hand-edited file — comes out whole and without duplicates',
    (() => {
      const mixed = {
        seeded: {
          meals: ['2026-11-06', mealLedgerKey('2026-11-06', 'Dinner')],
          itinerary: []
        }
      };
      upgradeMealLedger(mixed);
      return mixed.seeded.meals.join(',')
        === '2026-11-06|Breakfast,2026-11-06|Dinner,2026-11-06|Lunch';
    })(),
    'the date expands to three and the entry it already had is not written twice'
  );

  check(
    'markSeeded settles every meal of a day, not merely the day',
    (() => {
      const marked = range('2026-11-06', '2026-11-07');
      markSeeded(marked);
      const made = seedForDates(marked);
      return marked.seeded.meals.length === 6 && marked.seeded.itinerary.length === 2
        && made.meals === 0 && made.itinerary === 0;
    })(),
    'a day marked with only the meals its position is due would be handed the rest on a move'
  );
}
