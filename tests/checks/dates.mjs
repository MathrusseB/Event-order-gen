// Moving the dates, and the way into a new order — BUILD-SPEC §5, §10 [v13].
//
// Two v13 rules that are easy to state and easy to break later, and one of them
// cannot be checked without a browser.
//
// **A range that moves carries its content.** Narrowing deletes nothing (§5,
// v10 changes) and that stays true; shifting is a different act, and an order
// moved from November to December came back with forty-five findings for
// content that had simply not come with it. The offer is the whole feature:
// what moves, how far, said before anything moves, and nothing happening unless
// somebody presses the button. So the three cases are the three answers —
// accepted, declined, and an edit that is not a shift at all — and each is
// tapped out on the real editor, because the thing being checked is an offer
// and an offer only exists on a screen.
//
// The transform underneath is checked in plain Node first: `js/shift.js` takes
// an event and moves it, and the awkward parts of that (the seeding ledger
// travelling with the content, and the blank rows seeding puts down while the
// dates are half-typed) are arithmetic rather than interface.
//
// **A new order is the way in.** §10 [v13]: New asks nothing when there is
// nothing to discard and lands on the date fields, and the sample is behind its
// own quieter button. A coordinator who starts from the sample and types real
// dates over it inherits somebody else's guests, which is the thing this is
// here to stop happening again.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, shiftEvent } from '../../js/shift.js';
import { dayOffset, shiftDate } from '../../js/dates.js';
import { seedForDates } from '../../js/seed.js';
import { fileAction } from '../lib/bar.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.resolve(HERE, '..', '..', 'data', 'sample.json');

export const title = 'The dates — a range that moves, and the way into a new order';

/** Where the checks below move the sample's November weekend to. */
const TO = { start: '2026-12-02', end: '2026-12-04' };
const OFFSET = 18;

/** [v16] The dates a meals ledger covers — its entries are `date|Meal` now. */
function ledgerDates(event) {
  return [...new Set(((event.seeded && event.seeded.meals) || [])
    .map((entry) => String(entry).split('|')[0]))].sort();
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

/** Open the sample and wait for it to be the event on screen. */
async function openSample(page, origin) {
  await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await fileAction(page, '#btn-sample');
  await page.waitForFunction(() => document.getElementById('meta-startDate').value === '2026-11-14');
  return readEvent(page);
}

/** Every date on an event, as one comparable string. */
function datesOf(event) {
  return [
    ...event.schedule.map((row) => row.date),
    ...event.foodAndBev.map((row) => row.date),
    ...event.rooming.flatMap((row) => [row.from, row.to]),
    ...event.attendees.flatMap((row) => [row.arrive, row.depart]),
    ...event.staff.map((row) => row.date)
  ].join(',');
}

/**
 * Every date on an event, by the row that carries it.
 *
 * Row order is not stable across a seeding — a day added to the front of an
 * event lands at the front (seed.js) — so a check about rows that did *not*
 * move has to ask them one at a time rather than compare two lists.
 */
function datesById(event) {
  const byId = new Map();
  const put = (list, row, dates) => byId.set(`${list}:${row.id}`, dates.join(','));
  for (const row of event.schedule) put('schedule', row, [row.date]);
  for (const row of event.foodAndBev) put('foodAndBev', row, [row.date]);
  for (const row of event.rooming) put('rooming', row, [row.from, row.to]);
  for (const row of event.attendees) put('attendees', row, [row.arrive, row.depart]);
  for (const row of event.staff) put('staff', row, [row.date]);
  return byId;
}

/** Whether every row `before` carries is still on the day it was on. */
function nothingMoved(before, after) {
  const now = datesById(after);
  return [...datesById(before)].every(([key, dates]) => now.get(key) === dates);
}

export async function run({ browser, origin, check }) {
  const sample = JSON.parse(await fs.readFile(SAMPLE, 'utf8'));

  /* ------------------------------------------------- the transform, in Node */

  check(
    'a date moved by a whole number of days is that many days later',
    shiftDate('2026-11-14', 18) === '2026-12-02'
      && shiftDate('2026-12-02', -18) === '2026-11-14'
      && dayOffset('2026-11-14', '2026-12-02') === 18
      && dayOffset('2026-12-02', '2026-11-14') === -18,
    `${shiftDate('2026-11-14', 18)} / ${dayOffset('2026-11-14', '2026-12-02')}`
  );

  check(
    'a move across the end of daylight saving is still a whole number of days',
    // US daylight saving ends on 1 November 2026. A millisecond arithmetic
    // would land a day early here, in the direction that loses somebody a bed.
    shiftDate('2026-10-30', 7) === '2026-11-06'
      && dayOffset('2026-10-30', '2026-11-06') === 7
      && shiftDate('2026-11-06', -7) === '2026-10-30',
    `${shiftDate('2026-10-30', 7)} / ${dayOffset('2026-10-30', '2026-11-06')}`
  );

  const counted = plan(sample, OFFSET);
  check(
    'the plan counts every dated row on the sample, by what it is',
    counted.total > 0
      && counted.parts.some((part) => part.list === 'schedule')
      && counted.parts.some((part) => part.list === 'foodAndBev')
      && counted.parts.some((part) => part.list === 'rooming')
      && counted.parts.some((part) => part.list === 'attendees')
      && counted.total === counted.parts.reduce((sum, part) => sum + part.count, 0),
    counted.parts.map((part) => `${part.count} ${part.noun}`).join(', ')
  );

  check(
    'shifting moves every dated row and the seeding ledger with it',
    (() => {
      const moved = structuredClone(sample);
      moved.meta.startDate = TO.start;
      moved.meta.endDate = TO.end;
      shiftEvent(moved, OFFSET);
      const before = datesOf(sample).split(',');
      const after = datesOf(moved).split(',');
      const every = after.every((date, index) => !before[index]
        || date === shiftDate(before[index], OFFSET));
      return every && moved.seeded.meals.join(',') === '2026-12-02,2026-12-03,2026-12-04';
    })(),
    'the ledger has to travel, or the new days are seeded on top of the content'
  );

  check(
    'seeding after a shift creates nothing — the days that arrived are already offered',
    (() => {
      const moved = structuredClone(sample);
      moved.meta.startDate = TO.start;
      moved.meta.endDate = TO.end;
      shiftEvent(moved, OFFSET);
      const made = seedForDates(moved);
      return made.meals === 0 && made.itinerary === 0;
    })(),
    'a day carrying an itinerary must not be handed three more blank rows'
  );

  check(
    'an accepted shift clears the blank rows seeding put down mid-edit, and only those',
    (() => {
      // What happens when an event is moved *earlier*: the half-typed range is
      // wider than either end of the move, and seeding fills the days it opens
      // before anybody could know a shift was coming.
      const event = structuredClone(sample);
      event.meta.startDate = '2026-11-10';
      const made = seedForDates(event);
      const created = made.created;
      // One of them is edited into something real before the offer is answered.
      const edited = event.schedule.find((row) => row.id === created
        .find((entry) => entry.list === 'schedule').id);
      edited.label = 'Early Arrivals';

      const before = event.foodAndBev.length + event.schedule.length;
      event.meta.endDate = '2026-11-12';
      const result = shiftEvent(event, -4, created);
      const after = event.foodAndBev.length + event.schedule.length;

      return result.cleared === created.length - 1
        && before - after === created.length - 1
        && event.schedule.some((row) => row.label === 'Early Arrivals');
    })(),
    'a row somebody has touched is a row, and moves with the rest'
  );

  check(
    'nothing is shifted by an offset of nothing',
    (() => {
      const event = structuredClone(sample);
      const before = datesOf(event);
      shiftEvent(event, 0);
      return datesOf(event) === before;
    })(),
    'zero is not a move'
  );

  /* ---------------------------------------------------- the offer, on screen */

  const accepted = await browser.newContext();
  try {
    const page = await accepted.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    const before = await openSample(page, origin);

    await setDate(page, 'startDate', TO.start);
    await page.waitForSelector('.notice--offer[hidden]', { state: 'attached' });
    check(
      'one date alone is not a shift — the offer stays down until both ends have moved',
      await page.evaluate(() => document.querySelector('.notice--offer').hidden),
      'Dec 2 to Nov 16 is a range typed halfway, not an event that has moved'
    );

    await setDate(page, 'endDate', TO.end);
    await page.waitForSelector('.notice--offer:not([hidden])');

    const said = await page.evaluate(() => ({
      title: document.querySelector('.notice--offer .notice__title').textContent,
      summary: document.querySelector('.notice--offer .notice__summary').textContent,
      lines: [...document.querySelectorAll('.notice--offer .notice__list li')]
        .map((node) => node.textContent),
      yes: document.querySelector('.notice--offer .btn--primary').textContent,
      no: document.querySelector('.notice--offer .btn:not(.btn--primary)').textContent
    }));
    const expected = plan(before, OFFSET);

    check(
      'the offer names the offset in days before anything happens',
      said.title.includes('18 days later') && said.yes.includes('18 days later'),
      `${said.title} / ${said.yes}`
    );

    check(
      'the offer counts what would move, by what it is',
      said.yes.includes(String(expected.total))
        && expected.parts.every((part) =>
          said.lines.includes(`${part.count} ${part.noun}`)),
      `${said.yes} — ${said.lines.join(' | ')}`
    );

    check(
      'the offer says where the event is going, in dates a person reads',
      said.summary.includes('Nov 14')
        && said.summary.includes('Dec 2')
        && !said.summary.includes('2026-12')
        && !said.summary.includes('2026-11'),
      said.summary
    );

    check(
      'declining is one press, and it is the first of the two',
      said.no.toLowerCase().includes('leave'),
      said.no
    );

    check(
      'nothing has moved while the offer is up',
      nothingMoved(before, await readEvent(page)),
      'the offer must be an offer'
    );

    check(
      'and the days the range now covers are seeded, as on any other date change',
      ledgerDates(await readEvent(page)).includes('2026-12-02'),
      'seeding is not held back for an answer — an accepted shift clears those rows instead, '
        + 'because an offer nobody answers must not cost the event three unseeded days'
    );

    await page.click('.notice--offer .btn--primary');
    await page.waitForSelector('.notice--offer[hidden]', { state: 'attached' });
    const after = await readEvent(page);

    check(
      'ACCEPTED: every dated row is 18 days later, and the event kept its shape',
      datesOf(after) === datesOf(before).split(',')
        .map((date) => (date ? shiftDate(date, OFFSET) : date)).join(','),
      `${datesOf(after)}\n      ${datesOf(before)}`
    );

    check(
      'ACCEPTED: nothing was duplicated — the new days were not seeded over the content',
      after.foodAndBev.length === before.foodAndBev.length
        && after.schedule.length === before.schedule.length
        // [v16] The ledger travelled with the content and names the meals it
        // carried: the sample's three days each held all three services.
        && ledgerDates(after).join(',') === '2026-12-02,2026-12-03,2026-12-04'
        && after.seeded.meals.length === 9,
      `${after.foodAndBev.length} meals, ${after.schedule.length} rows, `
        + `seeded ${after.seeded.meals.join(',')}`
    );

    check(
      'ACCEPTED: the meals came with it — every service on the new days [v15]',
      after.foodAndBev.length === before.foodAndBev.length
        && after.foodAndBev.every((row) => row.date >= TO.start && row.date <= TO.end)
        && after.foodAndBev.map((row) => row.meal).join(',')
          === before.foodAndBev.map((row) => row.meal).join(','),
      after.foodAndBev.map((row) => `${row.date} ${row.meal}`).join(' | ')
    );

    check(
      'ACCEPTED: nothing is left outside the event dates',
      await page.evaluate(() => document.querySelector('.notice--warn').hidden),
      'the forty-five findings are the thing this feature exists to prevent'
    );
  } finally {
    await accepted.close();
  }

  const declined = await browser.newContext();
  try {
    const page = await declined.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    const before = await openSample(page, origin);

    await setDate(page, 'startDate', TO.start);
    await setDate(page, 'endDate', TO.end);
    await page.waitForSelector('.notice--offer:not([hidden])');
    await page.click('.notice--offer .btn:not(.btn--primary)');
    await page.waitForSelector('.notice--offer[hidden]', { state: 'attached' });
    const after = await readEvent(page);

    check(
      'DECLINED: every row stays on the day it was written for',
      nothingMoved(before, after),
      'a coordinator correcting a typo has not rescheduled anything'
    );

    check(
      'DECLINED: seeding then runs for the new range, exactly as it does on any date change',
      // [v15] Five meals for three days, not nine: Dinner on the arrival day,
      // all three in the middle, Breakfast on the departure day (§5, v15).
      after.foodAndBev.length === before.foodAndBev.length + 5
        && after.schedule.length === before.schedule.length + 9
        && ledgerDates(after).includes('2026-12-02')
        && ledgerDates(after).includes('2026-11-14'),
      `${after.foodAndBev.length} meals, ${after.schedule.length} rows`
    );

    check(
      'DECLINED: and it is not asked again',
      await page.evaluate(() => document.querySelector('.notice--offer').hidden),
      'an offer that comes back is an offer that gets pressed to make it go away'
    );
  } finally {
    await declined.close();
  }

  const narrowed = await browser.newContext();
  try {
    const page = await narrowed.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    const before = await openSample(page, origin);

    // Correcting one end. §5 [v13]: any other change to the dates behaves
    // exactly as it did.
    await setDate(page, 'endDate', '2026-11-18');
    const after = await readEvent(page);

    check(
      'NOT A SHIFT: correcting one end raises no offer at all',
      await page.evaluate(() => document.querySelector('.notice--offer').hidden),
      'a widened range is not an event that has moved'
    );

    check(
      'NOT A SHIFT: the two new days are seeded there and then, as before',
      // [v15] The 17th is a middle day now and gets three; the 18th is the new
      // departure day and gets Breakfast. Four, not six.
      after.foodAndBev.length === before.foodAndBev.length + 4
        && after.schedule.length === before.schedule.length + 6
        && nothingMoved(before, after),
      `${after.foodAndBev.length} meals, ${after.schedule.length} rows`
    );
  } finally {
    await narrowed.close();
  }

  /* ------------------------------- the move belongs to ONE interaction [v13] */

  // The first draft of this feature let the anchor stand until somebody
  // answered an offer, which meant it never stood down on an order that never
  // raised one. Both halves of that are checked here, because both were live
  // bugs and neither is visible from the three answers above.

  const authored = await browser.newContext();
  try {
    const page = await authored.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });

    // A real order, started with New — the way in (section 10 [v13]) — rather
    // than the sample. The dates are typed first, as they are on a new order.
    await setDate(page, 'startDate', '2026-11-14');
    await setDate(page, 'endDate', '2026-11-16');
    await page.fill('#meta-eventName', 'Opening weekend');
    await page.waitForFunction(() => document.getElementById('meta-eventName').value !== '');
    const before = await readEvent(page);

    check(
      'an order started with New seeds its days when the dates are typed',
      before.foodAndBev.length === 5 && before.schedule.length === 9,
      `${before.foodAndBev.length} meals, ${before.schedule.length} rows`
    );

    // Now the event moves — the second date interaction of the session, on an
    // order whose dates were typed in this same session.
    await setDate(page, 'startDate', TO.start);
    await setDate(page, 'endDate', TO.end);

    check(
      'THE OFFER FIRES ON AN ORDER WHOSE DATES WERE TYPED IN THIS SESSION [v13]',
      await page.evaluate(() => !document.querySelector('.notice--offer').hidden),
      'the anchor has to re-take from the dates as they stand, or the offer is dead after '
        + 'the first date interaction of a session'
    );

    await page.click('.notice--offer .btn--primary');
    await page.waitForSelector('.notice--offer[hidden]', { state: 'attached' });
    const after = await readEvent(page);

    check(
      'and accepting moves the order without leaving the seeded December days behind it',
      after.foodAndBev.length === before.foodAndBev.length
        && after.schedule.length === before.schedule.length
        && datesOf(after) === datesOf(before).split(',')
          .map((date) => (date ? shiftDate(date, OFFSET) : date)).join(','),
      `${after.foodAndBev.length} meals, ${after.schedule.length} rows`
    );
  } finally {
    await authored.close();
  }

  const stale = await browser.newContext();
  try {
    const page = await stale.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    const before = await openSample(page, origin);

    // Correct one end. No offer, correctly — but this is the edit that used to
    // leave an anchor lying about for the rest of the session.
    await setDate(page, 'startDate', '2026-11-15');
    check(
      'correcting one end raises no offer',
      await page.evaluate(() => document.querySelector('.notice--offer').hidden),
      'one end alone is not a move'
    );

    // Author against the corrected range, which is what makes the old anchor a
    // lie: these rows belong to the days they are on now.
    await page.fill('#meta-eventLead', 'Brian Mathrusse');
    await page.waitForFunction(() => document.getElementById('meta-eventLead').value !== '');

    // A pure one-day extension. Against the anchor as it stands (Nov 15-16)
    // this is one end alone; against the stale one (Nov 14-16) it read as a
    // same-offset move and offered to walk every row a day forward.
    await setDate(page, 'endDate', '2026-11-17');
    const after = await readEvent(page);

    check(
      'A DATE EDIT AFTER OTHER WORK ANCHORS AFRESH — no offer off a stale pair [v13]',
      await page.evaluate(() => document.querySelector('.notice--offer').hidden),
      'Nov 15-16 to Nov 15-17 is one end alone, whatever the dates were an hour ago'
    );

    check(
      'and nothing moved',
      nothingMoved(before, after),
      'a one-day extension must not walk the order forward a day'
    );
  } finally {
    await stale.close();
  }

  const unanswered = await browser.newContext();
  try {
    const page = await unanswered.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    const before = await openSample(page, origin);

    await setDate(page, 'startDate', TO.start);
    await setDate(page, 'endDate', TO.end);
    await page.waitForSelector('.notice--offer:not([hidden])');
    const withOfferUp = await readEvent(page);

    check(
      'AN OFFER NOBODY ANSWERS STILL LEAVES THE NEW RANGE SEEDED [v13]',
      ledgerDates(withOfferUp).includes('2026-12-02')
        && ledgerDates(withOfferUp).includes('2026-12-04')
        // [v15] One meal on the 2nd, because the 2nd is the arrival day.
        && withOfferUp.foodAndBev.filter((row) => row.date === '2026-12-02')
          .map((row) => row.meal).join(',') === 'Dinner',
      'holding seeding back for an answer loses it when the tab closes, and markSeeded '
        + 'then records the range on the way back in — three days that can never be seeded'
    );

    check(
      'and the offer still counts only what would move, not the rows it would clear',
      (await page.evaluate(() =>
        document.querySelector('.notice--offer .btn--primary').textContent))
        .includes(String(plan(before, OFFSET).total)),
      await page.evaluate(() =>
        document.querySelector('.notice--offer .btn--primary').textContent)
    );

    await page.click('.notice--offer .btn--primary');
    await page.waitForSelector('.notice--offer[hidden]', { state: 'attached' });
    const after = await readEvent(page);

    check(
      'and accepting clears those seeded days rather than piling the order on top of them',
      after.foodAndBev.length === before.foodAndBev.length
        && after.schedule.length === before.schedule.length
        && ledgerDates(after).join(',') === '2026-12-02,2026-12-03,2026-12-04',
      `${after.foodAndBev.length} meals, ${after.schedule.length} rows, `
        + `seeded ${after.seeded.meals.join(',')}`
    );
  } finally {
    await unanswered.close();
  }

  /* ------------------------------------------------------ the way in [v13] */

  const opening = await browser.newContext();
  try {
    const page = await opening.newPage();
    let asked = 0;
    page.on('dialog', (dialog) => {
      asked += 1;
      dialog.accept();
    });

    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });

    check(
      'a first run opens on an empty order, never on the sample',
      await page.evaluate(async () => {
        const app = await import('/js/app.js');
        const event = app.getEvent();
        return !event.meta.eventName && !event.meta.startDate && event.attendees.length === 0;
      }),
      'opening the tool onto fixture data invites typing over it'
    );

    check(
      'and it lands on the start date, with nothing in the way',
      await page.evaluate(() => document.activeElement.id) === 'meta-startDate',
      await page.evaluate(() => document.activeElement.id)
    );

    await fileAction(page, '#btn-new');
    check(
      'New over an untouched order asks nothing — there is nothing to discard',
      asked === 0,
      `${asked} confirmations for an event nobody has typed into`
    );

    // A note typed into the seeded Notes section and nothing else. Its body is
    // the only place that content lives, and New used to throw it away without
    // a word — and clearAutosave() took the last copy with it.
    await page.fill('.editor--text textarea', 'Gate code changes Friday.');
    await page.waitForFunction(() =>
      document.querySelector('.editor--text textarea').value !== '');
    check(
      'A NOTE TYPED INTO A FREE-TEXT SECTION COUNTS AS WORK [v13]',
      await page.evaluate(async () => {
        const app = await import('/js/app.js');
        return app.hasWork(app.getEvent());
      }),
      'a section body is content, and meta.touchedAt says so whatever the field was'
    );

    await fileAction(page, '#btn-new');
    check(
      'and New asks before discarding it',
      asked === 1,
      `${asked} confirmations after a note was typed`
    );

    await fileAction(page, '#btn-sample');
    await page.waitForFunction(() => document.getElementById('meta-startDate').value === '2026-11-14');
    check(
      'the sample says in its own name that it is a sample',
      (await page.evaluate(() => document.getElementById('meta-eventName').value))
        .toLowerCase().includes('sample'),
      await page.evaluate(() => document.getElementById('meta-eventName').value)
    );

    await fileAction(page, '#btn-new');
    check(
      'New over an event with work in it does ask',
      asked === 2,
      `${asked} confirmations`
    );

    check(
      'and the new order lands on the start date too',
      await page.evaluate(() => document.activeElement.id) === 'meta-startDate',
      await page.evaluate(() => document.activeElement.id)
    );
  } finally {
    await opening.close();
  }
}
