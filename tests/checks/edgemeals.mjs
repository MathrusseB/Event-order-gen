// Meals on arrival and departure days — BUILD-SPEC §5 (v15 changes).
//
// v10 seeded Breakfast, Lunch and Dinner on every day of an event, and on a
// real order the arrival day read: breakfast 09:00, lunch 12:00, guest arrivals
// 16:00, dinner 18:30. Breakfast seven hours before anybody was on the
// property. Departure days had the mirror of it, a dinner for a party that had
// gone home that morning.
//
// The fix is two halves and both are checked here, because either alone is
// wrong:
//
//   * **A rule.** The first day seeds Dinner, the last day Breakfast, every day
//     between all three, and a one-day event all three because it has no
//     arrival or departure to reason from. A rule alone is wrong the weekend a
//     group lands at ten and wants lunch, which is why it is a default that
//     adds nothing anybody has to fight.
//   * **A way to take one off.** Each meal line in the itinerary preview can
//     remove that service. An editable list alone leaves the coordinator
//     deleting the same two rows on every event he builds.
//
// The ledger question is the one worth reading twice, and [v16] moved to
// tests/checks/mealledger.mjs, which is where it is now answered: the ledger
// names the meal, and an existence check is what makes that safe.

import { mealsSeededFor, seedForDates } from '../../js/seed.js';
import { validateEvent } from '../../js/validate.js';

export const title = 'Edge-day meals — what a day is due, and taking one off';

/** A bare event with a range on it, in the shape `seedForDates` wants. */
function range(startDate, endDate) {
  return { meta: { startDate, endDate } };
}

/** Every meal on an event, as `06 Dinner` strings in array order. */
function menuOf(event) {
  return (event.foodAndBev || []).map((row) => `${row.date.slice(8)} ${row.meal}`);
}

/** The meals seeded on one date, in serving order. */
function mealsOn(event, date) {
  return (event.foodAndBev || []).filter((row) => row.date === date).map((row) => row.meal);
}

export async function run({ browser, origin, check }) {
  /* ------------------------------------------------------------- the rule */

  const three = range('2026-11-06', '2026-11-08');
  const threeMade = seedForDates(three);
  check(
    'A THREE-DAY EVENT SEEDS 1 + 3 + 1 — Dinner on the arrival day, Breakfast on the last',
    threeMade.meals === 5
      && mealsOn(three, '2026-11-06').join(',') === 'Dinner'
      && mealsOn(three, '2026-11-07').join(',') === 'Breakfast,Lunch,Dinner'
      && mealsOn(three, '2026-11-08').join(',') === 'Breakfast',
    `${threeMade.meals} meals: ${menuOf(three).join(' | ')}`
  );

  check(
    'and the blank itinerary rows are unchanged — three a day, every day',
    threeMade.itinerary === 9 && three.schedule.length === 9
      && three.schedule.every((row) => !row.start && !row.end && !row.label),
    `${threeMade.itinerary} itinerary rows`
  );

  const one = range('2026-11-06', '2026-11-06');
  const oneMade = seedForDates(one);
  check(
    'a one-day event seeds all three — both rules apply at once and their overlap is nothing',
    oneMade.meals === 3 && mealsOn(one, '2026-11-06').join(',') === 'Breakfast,Lunch,Dinner',
    `${oneMade.meals} meals: ${menuOf(one).join(' | ')}`
  );

  const two = range('2026-11-06', '2026-11-07');
  const twoMade = seedForDates(two);
  check(
    'a two-day event seeds Dinner then Breakfast, and nothing else',
    twoMade.meals === 2 && menuOf(two).join(' | ') === '06 Dinner | 07 Breakfast',
    `${twoMade.meals} meals: ${menuOf(two).join(' | ')}`
  );

  const five = range('2026-11-06', '2026-11-10');
  const fiveMade = seedForDates(five);
  check(
    'a five-day event seeds 1 + 3 + 3 + 3 + 1 — the rule is about the two ends only',
    fiveMade.meals === 11
      && mealsOn(five, '2026-11-06').join(',') === 'Dinner'
      && mealsOn(five, '2026-11-10').join(',') === 'Breakfast'
      && ['2026-11-07', '2026-11-08', '2026-11-09']
        .every((date) => mealsOn(five, date).join(',') === 'Breakfast,Lunch,Dinner'),
    `${fiveMade.meals} meals: ${menuOf(five).join(' | ')}`
  );

  const days = ['2026-11-06', '2026-11-07', '2026-11-08'];
  check(
    'the rule keys on the event dates, and answers "everything" where there is no edge to read',
    mealsSeededFor(days, days[0]).map((m) => m.meal).join(',') === 'Dinner'
      && mealsSeededFor(days, days[2]).map((m) => m.meal).join(',') === 'Breakfast'
      && mealsSeededFor(['2026-11-06'], '2026-11-06').length === 3
      && mealsSeededFor(days, '2027-01-01').length === 3
      && mealsSeededFor([], '2026-11-06').length === 3,
    `${mealsSeededFor(days, days[0]).length} / ${mealsSeededFor(days, days[2]).length}`
  );

  /* ------------------------------------------------------------ the ledger */

  // The failure the ledger exists to prevent, on the path this change opens.
  const byHand = range('2026-11-06', '2026-11-08');
  seedForDates(byHand);
  byHand.foodAndBev.push({
    id: 'hand-lunch', date: '2026-11-06', start: '12:00', end: '14:00',
    meal: 'Lunch', location: '', countBasis: 'present', serves: 'all'
  });
  byHand.meta.endDate = '2026-11-09';
  const afterHand = seedForDates(byHand);

  check(
    'A LUNCH ADDED TO THE ARRIVAL DAY BY HAND IS NOT JOINED BY A SECOND ONE',
    mealsOn(byHand, '2026-11-06').join(',') === 'Dinner,Lunch'
      && byHand.foodAndBev.filter((row) => row.date === '2026-11-06' && row.meal === 'Lunch')
        .length === 1,
    mealsOn(byHand, '2026-11-06').join(',')
  );

  check(
    'and the day added on the end is seeded as the new departure day',
    mealsOn(byHand, '2026-11-09').join(',') === 'Breakfast'
      // [v16] Three new meals, not one: the 9th gets its Breakfast, and the 8th
      // has stopped being the departure day and is owed a middle day's Lunch
      // and Dinner (§5, v16 changes).
      && afterHand.meals === 3
      && mealsOn(byHand, '2026-11-08').sort().join(',') === 'Breakfast,Dinner,Lunch',
    `${afterHand.meals} new meals: ${menuOf(byHand).join(' | ')}`
  );

  // The other direction of the same question: a day whose place in the range
  // changes keeps whatever it already has. Seeding adds; it has never removed.
  const shortened = range('2026-11-06', '2026-11-08');
  seedForDates(shortened);
  shortened.meta.endDate = '2026-11-07';
  seedForDates(shortened);

  check(
    'A MIDDLE DAY THAT BECOMES THE LAST DAY KEEPS ITS DINNER',
    mealsOn(shortened, '2026-11-07').join(',') === 'Breakfast,Lunch,Dinner',
    mealsOn(shortened, '2026-11-07').join(',')
  );

  check(
    'and the day that fell outside the range keeps its breakfast too — narrowing deletes nothing',
    mealsOn(shortened, '2026-11-08').join(',') === 'Breakfast'
      && shortened.foodAndBev.length === 5,
    `${shortened.foodAndBev.length} meals: ${menuOf(shortened).join(' | ')}`
  );

  // [v16] What v15 could not do, and the reason the ledger got finer. The whole
  // case lives in tests/checks/mealledger.mjs; this is the one line of it that
  // used to read the other way round.
  const widened = range('2026-11-06', '2026-11-08');
  seedForDates(widened);
  widened.meta.endDate = '2026-11-09';
  seedForDates(widened);

  check(
    'A LAST DAY THAT BECOMES A MIDDLE DAY IS OWED THE OTHER TWO, AND GETS THEM [v16]',
    mealsOn(widened, '2026-11-08').sort().join(',') === 'Breakfast,Dinner,Lunch'
      && mealsOn(widened, '2026-11-09').join(',') === 'Breakfast',
    `${mealsOn(widened, '2026-11-08').join(',')} on the 8th`
  );

  /* --------------------------------------- taking a meal off the itinerary */

  const context = await browser.newContext();
  const page = await context.newPage();
  const asked = [];

  try {
    page.on('dialog', (dialog) => {
      asked.push(dialog.message());
      dialog.accept();
    });

    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await setDate(page, 'startDate', '2026-11-06');
    await setDate(page, 'endDate', '2026-11-08');
    await page.waitForFunction(() => document.querySelectorAll('.preview__line.is-meal').length === 5);

    const before = await readEvent(page);
    check(
      'the browser agrees: a fresh three-day order opens with five meals on it',
      before.foodAndBev.length === 5
        && before.foodAndBev.map((row) => row.meal).join(',')
          === 'Dinner,Breakfast,Lunch,Dinner,Breakfast',
      before.foodAndBev.map((row) => `${row.date.slice(8)} ${row.meal}`).join(' | ')
    );

    check(
      'every meal line in the itinerary carries the way off the day, and no schedule line does',
      await page.locator('.preview__line.is-meal [data-control="remove-meal"]').count() === 5
        && await page.locator('.preview__line:not(.is-meal) [data-control="remove-meal"]:visible')
          .count() === 0,
      `${await page.locator('.preview__line.is-meal [data-control="remove-meal"]').count()} controls`
    );

    // The middle day's Lunch — a meal with no menu written against it.
    const lunch = before.foodAndBev.find((row) => row.meal === 'Lunch');
    await countWrites(page);
    await page.click(`.preview__line[data-row="${lunch.id}"] [data-control="remove-meal"]`);
    await page.waitForFunction(() => document.querySelectorAll('.preview__line.is-meal').length === 4);

    const afterLunch = await readEvent(page);
    check(
      'REMOVING A MEAL FROM THE ITINERARY TAKES EXACTLY THAT ROW, IN ONE WRITE',
      await writes(page) === 1
        && afterLunch.foodAndBev.length === 4
        && !afterLunch.foodAndBev.some((row) => row.id === lunch.id)
        && afterLunch.foodAndBev.map((row) => row.id).join(',')
          === before.foodAndBev.filter((row) => row.id !== lunch.id)
            .map((row) => row.id).join(','),
      `${await writes(page)} writes, ${afterLunch.foodAndBev.length} meals left`
    );

    check(
      'and the itinerary rows beside it were not touched',
      afterLunch.schedule.length === before.schedule.length,
      `${afterLunch.schedule.length} itinerary rows`
    );

    /* -- a meal with a menu written against it -- */
    asked.length = 0;
    await page.click('#btn-more');
    await page.click('#btn-sample');
    await page.waitForFunction(() =>
      document.getElementById('bar-name').textContent.includes('Illig'));
    await page.waitForSelector('.preview__line.is-meal');

    const sample = await readEvent(page);
    const written = sample.menu.find((block) =>
      (block.dishes || []).filter((dish) => String(dish || '').trim()).length > 1);
    const dishes = written.dishes.filter((dish) => String(dish || '').trim()).length;

    asked.length = 0;
    await page.click(`.preview__line[data-row="${written.fnbId}"] [data-control="remove-meal"]`);
    await page.waitForFunction((id) =>
      !document.querySelector(`.preview__line[data-row="${id}"]`), written.fnbId);

    const afterMeal = await readEvent(page);
    check(
      'REMOVING A MEAL WITH A MENU SAYS SO FIRST, AND NAMES THE DISHES',
      asked.length === 1 && asked[0].includes(`${dishes} dishes`)
        && /menu/i.test(asked[0]),
      asked.join(' / ')
    );

    check(
      'the menu block is left exactly where it was — a dish list is never lost to a click',
      afterMeal.menu.length === sample.menu.length
        && afterMeal.menu.some((block) => block.fnbId === written.fnbId
          && (block.dishes || []).length === written.dishes.length),
      `${afterMeal.menu.length} menu blocks, ${sample.menu.length} before`
    );

    check(
      'and §12.7 reports it as written for a meal that is not there',
      validateEvent(afterMeal).some((finding) => finding.rule === 7
        && (finding.rowIds || []).includes(written.fnbId)),
      validateEvent(afterMeal).filter((finding) => finding.rule === 7)
        .map((finding) => finding.text).join(' / ') || 'no rule 7 finding'
    );

    check(
      'the meal service itself is gone from the F&B array, and nothing else with it',
      !afterMeal.foodAndBev.some((row) => row.id === written.fnbId)
        && afterMeal.foodAndBev.length === sample.foodAndBev.length - 1,
      `${afterMeal.foodAndBev.length} meals, ${sample.foodAndBev.length} before`
    );
  } finally {
    await context.close();
  }
}

/** The event the browser is holding, read out of the module the app is running. */
async function readEvent(page) {
  return page.evaluate(async () => {
    const app = await import('/js/app.js');
    return JSON.parse(JSON.stringify(app.getEvent()));
  });
}

/** Type a date into one of the two fields, exactly as a picker would. */
async function setDate(page, field, value) {
  await page.fill(`#meta-${field}`, value);
  await page.waitForFunction(
    ([id, want]) => document.getElementById(id).value === want,
    [`meta-${field}`, value]
  );
}

/** Start counting writes — `update()` notifies once per call (app.js). */
async function countWrites(page) {
  await page.evaluate(async () => {
    const app = await import('/js/app.js');
    if (window.__stopCounting) window.__stopCounting();
    window.__writes = 0;
    window.__stopCounting = app.subscribe(() => { window.__writes += 1; });
    window.__writes = 0;
  });
}

/** How many writes since `countWrites`. */
async function writes(page) {
  return page.evaluate(() => window.__writes);
}
