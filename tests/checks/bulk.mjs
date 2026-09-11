// Copying a day, and adding guests in a list — BUILD-SPEC §5 (v14 changes).
//
// Both of these exist because a coordinator building a real event was typing
// the same thing over and over, and both of them write several rows at once.
// That is what makes them worth checking by machine: a feature that adds one
// row is wrong in front of you, and a feature that adds eleven is wrong three
// days later in a printed order.
//
// The rules each one must not break:
//
//   * A copy never takes away anything somebody typed. It clears the blank rows
//     seeding left on the target day and nothing else, and the day it was
//     copied *from* comes out of it untouched.
//   * Every copied row is a new row. A reused id is two rows sharing one node
//     in `reconcile` (dom.js), which is the second one editing the first.
//   * The name parse is a guess, is wrong for compound surnames, and is shown
//     as editable fields before anything is written.
//   * A name already on the list is flagged and never blocked — two guests can
//     share a name, and that is what ids are for.
//   * Each action is **one** `update()`. Eleven writes is eleven renders, and a
//     half-finished batch if anything throws in the middle.
//
// The first half runs in plain Node against the two modules. The second half
// drives the real interface, because "shown before it is written" and "one
// write" are claims about the interface and cannot be checked anywhere else.

import { copyDayInto, defaultTarget, planCopyDay } from '../../js/copyday.js';
import { isKnownName, nameKey, parseName, parseNameLines } from '../../js/names.js';

export const title = 'Bulk entry — one day copied, and a list of names';

const FRI = '2026-11-13';
const SAT = '2026-11-14';
const SUN = '2026-11-15';

/** Friday written out in full, and whatever the caller wants on Saturday. */
function weekend(saturday = []) {
  return {
    meta: { eventName: 'Copy check', startDate: FRI, endDate: SUN },
    seeded: { meals: [FRI, SAT, SUN], itinerary: [FRI, SAT, SUN] },
    sections: [],
    schedule: [
      { id: 'fri-1', date: FRI, start: '05:00', end: '09:00', label: 'Morning hunt' },
      { id: 'fri-2', date: FRI, start: '11:00', end: '12:00', label: 'Downtime' },
      ...saturday,
      { id: 'sun-1', date: SUN, start: '', end: '', label: '' }
    ],
    foodAndBev: [], menu: [], attendees: [], rooming: [], staff: [], departments: [],
    buildingsInUse: [], overflowBuildings: []
  };
}

/** Three blank rows, exactly as `seedForDates` leaves a day. */
function blanks(date, prefix) {
  return [0, 1, 2].map((n) => ({ id: `${prefix}-${n}`, date, start: '', end: '', label: '' }));
}

/** One day's rows, as `start|label` strings, in array order. */
function dayOf(event, date) {
  return event.schedule.filter((row) => row.date === date)
    .map((row) => `${row.start}|${row.label}`);
}

export async function run({ browser, origin, check }) {
  /* ------------------------------------------ copying onto a seeded day */

  const onSeeded = weekend(blanks(SAT, 'sat'));
  const seededPlan = planCopyDay(onSeeded, FRI, SAT);
  const seededDone = copyDayInto(onSeeded, FRI, SAT);

  check(
    'copying onto three blank seeded rows lands two copies and clears the three blanks',
    seededDone.copied === 2 && seededDone.cleared === 3
      && dayOf(onSeeded, SAT).join(' / ') === '05:00|Morning hunt / 11:00|Downtime',
    `${seededDone.copied} copied, ${seededDone.cleared} cleared: ${dayOf(onSeeded, SAT).join(' / ')}`
  );

  check(
    'and the plan said so before it happened',
    seededPlan.copies === 2 && seededPlan.clears === 3 && seededPlan.keeps === 0,
    JSON.stringify(seededPlan)
  );

  check(
    'the day it was copied from is exactly as it was',
    dayOf(onSeeded, FRI).join(' / ') === '05:00|Morning hunt / 11:00|Downtime'
      && onSeeded.schedule.filter((row) => row.date === FRI).map((row) => row.id).join(',')
        === 'fri-1,fri-2',
    dayOf(onSeeded, FRI).join(' / ')
  );

  check(
    'every copy carries a fresh id and the target date',
    onSeeded.schedule.filter((row) => row.date === SAT)
      .every((row) => row.id && row.id !== 'fri-1' && row.id !== 'fri-2'
        && !row.id.startsWith('sat-'))
      && new Set(onSeeded.schedule.map((row) => row.id)).size === onSeeded.schedule.length,
    onSeeded.schedule.map((row) => `${row.date}:${row.id}`).join(' ')
  );

  check(
    'the blank rows it cleared were on the target day only — nothing else went',
    onSeeded.schedule.filter((row) => row.date === SUN).length === 1,
    `${onSeeded.schedule.filter((row) => row.date === SUN).length} rows left on the last day`
  );

  /* ------------------------------------------- copying onto a written day */

  const written = weekend([
    { id: 'sat-own', date: SAT, start: '14:00', end: '16:00', label: 'Sporting clays' },
    ...blanks(SAT, 'sat')
  ]);
  const writtenPlan = planCopyDay(written, FRI, SAT);
  const writtenDone = copyDayInto(written, FRI, SAT);

  check(
    'A ROW THE COORDINATOR WROTE SURVIVES A COPY ONTO ITS DAY',
    written.schedule.some((row) => row.id === 'sat-own' && row.label === 'Sporting clays'
      && row.start === '14:00' && row.date === SAT),
    dayOf(written, SAT).join(' / ')
  );

  check(
    'and the blanks around it still go',
    writtenDone.copied === 2 && writtenDone.cleared === 3
      && writtenPlan.keeps === 1
      && written.schedule.filter((row) => row.date === SAT).length === 3,
    `${writtenDone.cleared} cleared, ${written.schedule.filter((row) => row.date === SAT).length} left`
  );

  const full = weekend([
    { id: 'sat-a', date: SAT, start: '08:00', end: '09:00', label: 'Skeet' },
    { id: 'sat-b', date: SAT, start: '13:00', end: '15:00', label: 'Fishing' }
  ]);
  const fullDone = copyDayInto(full, FRI, SAT);

  check(
    'copying onto a day with nothing blank on it clears nothing at all',
    fullDone.cleared === 0 && fullDone.copied === 2
      && full.schedule.filter((row) => row.date === SAT).length === 4
      && full.schedule.some((row) => row.id === 'sat-a')
      && full.schedule.some((row) => row.id === 'sat-b'),
    `${fullDone.cleared} cleared, ${full.schedule.filter((row) => row.date === SAT).length} rows`
  );

  check(
    'the copies land with the target day rather than on the end of the array',
    full.schedule.map((row) => row.date).join(',')
      === [FRI, FRI, SAT, SAT, SAT, SAT, SUN].join(','),
    full.schedule.map((row) => row.date).join(',')
  );

  /* ----------------------------------------------- what a copy will not do */

  const same = weekend(blanks(SAT, 'sat'));
  check(
    'copying a day onto itself does nothing, and takes no blank rows with it',
    copyDayInto(same, SAT, SAT).copied === 0
      && same.schedule.filter((row) => row.date === SAT).length === 3,
    JSON.stringify(copyDayInto(same, SAT, SAT))
  );

  const nothing = weekend(blanks(SAT, 'sat'));
  const nothingDone = copyDayInto(nothing, SUN, SAT);
  check(
    'COPYING A DAY NOBODY HAS WRITTEN YET CLEARS NOTHING — an empty copy is not a delete',
    nothingDone.copied === 0 && nothingDone.cleared === 0
      && nothing.schedule.filter((row) => row.date === SAT).length === 3,
    `${nothingDone.copied} copied, ${nothingDone.cleared} cleared, `
      + `${nothing.schedule.filter((row) => row.date === SAT).length} rows left on the target`
  );

  const halfBlank = weekend(blanks(SAT, 'sat'));
  halfBlank.schedule.push({ id: 'sun-2', date: SUN, start: '09:30', end: '', label: 'Departures' });
  const halfDone = copyDayInto(halfBlank, SUN, SAT);
  check(
    'the blank rows on the day being copied stay behind — only what was written travels',
    halfDone.copied === 1
      && dayOf(halfBlank, SAT).join(' / ') === '09:30|Departures'
      && halfBlank.schedule.filter((row) => row.date === SUN).length === 2,
    `${halfDone.copied} copied: ${dayOf(halfBlank, SAT).join(' / ')}`
  );

  check(
    'the default target is the next day of the event, and the last day offers the one before',
    defaultTarget(weekend(), FRI) === SAT && defaultTarget(weekend(), SUN) === SAT,
    `${defaultTarget(weekend(), FRI)} / ${defaultTarget(weekend(), SUN)}`
  );

  /* --------------------------------------------------------- the name parse */

  check(
    '"Reyes, Dana" is read as a surname and a first name',
    parseName('Reyes, Dana').last === 'Reyes' && parseName('Reyes, Dana').first === 'Dana',
    JSON.stringify(parseName('Reyes, Dana'))
  );

  check(
    '"Tom Whitfield" is read as a first name and a surname',
    parseName('Tom Whitfield').first === 'Tom' && parseName('Tom Whitfield').last === 'Whitfield',
    JSON.stringify(parseName('Tom Whitfield'))
  );

  check(
    '"Van Der Berg, Anneke" — the comma says which half is which and the parse is right',
    parseName('Van Der Berg, Anneke').last === 'Van Der Berg'
      && parseName('Van Der Berg, Anneke').first === 'Anneke',
    JSON.stringify(parseName('Van Der Berg, Anneke'))
  );

  check(
    'A COMPOUND SURNAME WITHOUT A COMMA IS PARSED WRONGLY — which is why nothing commits on it',
    parseName('Anneke Van Der Berg').first === 'Anneke Van Der'
      && parseName('Anneke Van Der Berg').last === 'Berg',
    JSON.stringify(parseName('Anneke Van Der Berg'))
  );

  check(
    'one word is a first name with no surname, not a surname with no first name',
    parseName('Cher').first === 'Cher' && parseName('Cher').last === '',
    JSON.stringify(parseName('Cher'))
  );

  const messy = parseNameLines('  Reyes, Dana  \n\n\nTom Whitfield\n   \nCher\n');
  check(
    'blank lines are dropped and every line is trimmed end to end',
    messy.length === 3 && messy[0].last === 'Reyes' && messy[0].first === 'Dana'
      && messy[2].first === 'Cher',
    messy.map((entry) => `${entry.first}/${entry.last}`).join(' ')
  );

  const flagged = parseNameLines('Dana Reyes\nTom Whitfield', [
    { id: 'a-1', first: 'dana', last: 'REYES' }
  ]);
  check(
    'a line naming somebody already on the list is flagged, case and spacing aside',
    flagged[0].duplicate === true && flagged[1].duplicate === false,
    flagged.map((entry) => `${entry.line}:${entry.duplicate}`).join(' ')
  );

  check(
    'a name with nothing in it is nobody, and is never a duplicate of anybody',
    nameKey('', '') === '' && isKnownName([{ first: '', last: '' }], '', '') === false,
    `${nameKey('', '')}`
  );

  /* ------------------------------------------------ and now the interface */

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await setDate(page, 'startDate', FRI);
    await setDate(page, 'endDate', SUN);
    await page.waitForFunction(() => document.querySelectorAll('.row--schedule').length === 9);

    /* -- a day written out, through the fields a coordinator uses -- */
    await writeRow(page, 0, { start: '05:00', end: '09:00' });
    await writeRow(page, 1, { start: '11:00', end: '12:00' });

    const before = await readEvent(page);
    check(
      'the browser agrees: three days seeded, three blank rows each',
      before.schedule.length === 9 && before.seeded.itinerary.length === 3,
      `${before.schedule.length} rows, ${before.seeded.itinerary.length} days seeded`
    );

    await countWrites(page);
    await page.click(`[aria-controls="copyday-${FRI}"]`);
    await page.selectOption(`#copyday-${FRI} [data-field="copy-target"]`, SAT);
    await page.click(`#copyday-${FRI} .btn--primary`);
    await page.waitForFunction((date) =>
      document.getElementById('bar-name') && [...document.querySelectorAll('.row--schedule')]
        .filter((row) => row.querySelector('[data-field="date"]').value === date).length === 2,
      SAT);

    const copied = await readEvent(page);
    const saturday = copied.schedule.filter((row) => row.date === SAT);

    check(
      'COPYING A DAY IS ONE WRITE, NOT ONE PER ROW',
      await writes(page) === 1,
      `${await writes(page)} writes for a copy of two rows over three blanks`
    );

    check(
      'the copies arrived on the target day with fresh ids',
      saturday.length === 2
        && saturday.map((row) => row.start).join(',') === '05:00,11:00'
        && saturday.every((row) => !before.schedule.some((old) => old.id === row.id)),
      saturday.map((row) => `${row.start}:${row.id.slice(0, 6)}`).join(' ')
    );

    check(
      'the interface says how many were copied and how many blanks went',
      /Copied 2 rows/.test(await page.textContent(`#copyday-${FRI} .copyday__said`))
        && /3 rows left blank there were cleared/
          .test(await page.textContent(`#copyday-${FRI} .copyday__said`)),
      await page.textContent(`#copyday-${FRI} .copyday__said`)
    );

    check(
      'and it will not copy the same day onto the same day twice by accident',
      await page.isDisabled(`#copyday-${FRI} .btn--primary`),
      'the copy button is still live after copying'
    );

    /* -- the names -- */
    await page.click('[data-control="add-names"]');
    await page.fill('.input--names', 'Reyes, Dana\n\nTom Whitfield\nAnneke Van Der Berg\nCher');
    await page.click('.batch__stage:not([hidden]) .btn--primary');
    await page.waitForSelector('.batch__row');

    const parsed = await page.evaluate(() => [...document.querySelectorAll('.batch__row')]
      .map((row) => ({
        first: row.querySelector('[data-field="batch-first"]').value,
        last: row.querySelector('[data-field="batch-last"]').value,
        editable: !row.querySelector('[data-field="batch-first"]').disabled
      })));

    check(
      'what was read is shown as editable first and last fields before anything is written',
      parsed.length === 4 && parsed.every((row) => row.editable)
        && (await readEvent(page)).attendees.length === 0,
      `${parsed.length} rows, ${(await readEvent(page)).attendees.length} attendees so far`
    );

    check(
      'and the compound surname is sitting there wrong, ready to be corrected',
      parsed[2].first === 'Anneke Van Der' && parsed[2].last === 'Berg'
        && parsed[3].first === 'Cher' && parsed[3].last === '',
      JSON.stringify(parsed)
    );

    // Correct it the way the coordinator would, and check the correction sticks.
    await page.fill('.batch__row:nth-child(3) [data-field="batch-first"]', 'Anneke');
    await page.fill('.batch__row:nth-child(3) [data-field="batch-last"]', 'Van Der Berg');

    await countWrites(page);
    await page.click('.batch__stage:not([hidden]) .btn--primary');
    await page.waitForFunction(() => document.querySelectorAll('.row--guest, .rows--guests > li')
      .length === 4);

    const added = await readEvent(page);
    check(
      'ADDING A LIST OF GUESTS IS ONE WRITE, NOT ONE PER NAME',
      await writes(page) === 1,
      `${await writes(page)} writes for four guests`
    );

    check(
      'four guests, each with an id of its own and the event dates by default',
      added.attendees.length === 4
        && new Set(added.attendees.map((guest) => guest.id)).size === 4
        && added.attendees.every((guest) => guest.arrive === '' && guest.depart === ''),
      added.attendees.map((guest) => `${guest.first}/${guest.last}`).join(' ')
    );

    check(
      'the correction made before committing is what was written',
      added.attendees[2].first === 'Anneke' && added.attendees[2].last === 'Van Der Berg',
      `${added.attendees[2].first} / ${added.attendees[2].last}`
    );

    /* -- a duplicate, flagged and committed anyway -- */
    await page.click('[data-control="add-names"]');
    await page.fill('.input--names', 'Tom Whitfield');
    await page.click('.batch__stage:not([hidden]) .btn--primary');
    await page.waitForSelector('.batch__row');

    check(
      'a name already on the guest list is flagged, and is still ticked to be added',
      await page.locator('.batch__row.is-duplicate').count() === 1
        && await page.isChecked('.batch__row .check__box'),
      `${await page.locator('.batch__row.is-duplicate').count()} flagged`
    );

    await page.click('.batch__stage:not([hidden]) .btn--primary');
    await page.waitForFunction(() => document.querySelectorAll('.rows--guests > li').length === 5);

    const twice = (await readEvent(page)).attendees
      .filter((guest) => guest.first === 'Tom' && guest.last === 'Whitfield');
    check(
      'COMMITTING IT ANYWAY MAKES TWO GUESTS OF THAT NAME, WITH DIFFERENT IDS',
      twice.length === 2 && twice[0].id !== twice[1].id,
      `${twice.length} of them, ids ${twice.map((guest) => guest.id.slice(0, 6)).join(' and ')}`
    );

    /* -- and one guest is still one button -- */
    await countWrites(page);
    await page.click('.editor--guests .editor__foot .btn--primary');
    await page.waitForFunction(() => document.querySelectorAll('.rows--guests > li').length === 6);
    check(
      'Add guest still adds one guest, in one write, with no list box in the way',
      await writes(page) === 1 && (await readEvent(page)).attendees.length === 6,
      `${await writes(page)} writes, ${(await readEvent(page)).attendees.length} guests`
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

/** Fill one itinerary row's times, through the inputs rather than the array. */
async function writeRow(page, index, { start, end }) {
  const row = `.row--schedule:nth-of-type(${index + 1})`;
  await page.fill(`${row} [data-field="start"]`, start);
  await page.fill(`${row} [data-field="end"]`, end);
  await page.waitForFunction(
    ([selector, want]) => document.querySelector(selector).value === want,
    [`${row} [data-field="end"]`, end]
  );
}

/**
 * Start counting writes.
 *
 * `update()` notifies once per call (app.js), so a subscriber that counts
 * notifications is counting writes. `subscribe` calls back immediately on the
 * way in, which is why the counter is zeroed after it rather than before.
 */
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
