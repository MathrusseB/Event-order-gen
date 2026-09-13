// The shape of the printed Event Order — BUILD-SPEC §8 [v18].
//
// Four claims, and none of them can be read off a module: three are about what
// a column or a block is doing on the page, and the fourth is about a computed
// background. So this drives the real app, loads events through the file input
// the way a coordinator does, and reads the documents out of the previews —
// which are the same DOM the printer receives (§10).
//
// WHAT IS CHECKED, and why each one is worth a browser:
//
//   * **The guest list is three columns.** Dietary was a fourth, which on a
//     party of twenty is one filled cell and nineteen blanks. It is a named
//     block under the list now, and `dietaryBlock` prints "None known." where
//     nobody has one (§8 [v8]) — which is the point of moving it: an order with
//     no Food & Beverage section used to carry no dietary information at all.
//     So the block is checked on an event that has dietary needs and on one
//     that has none, and counted, because printing it twice on an order that
//     carries both sections is the obvious way to get this wrong.
//
//   * **Only meals carry a location, and the column is decided once per
//     document.** An itinerary of hunts and downtime has nothing to put in a
//     Location column; a dinner has one cell. Deciding per day would make
//     Friday's table three columns and Saturday's four, so the claim is about
//     *every* day's table at once — and the column arriving is measured by
//     typing a location into the real editor, which is how it arrives in life.
//
//   * **Three ranks of heading, not one.** Inside the order the bar naming an
//     included document and the bars inside it were the same object: filled
//     grey, 0.75pt rule, serif 11.5pt. So "Rooming Assignment" and "Remington"
//     under it read as equals, and nobody can climb a hierarchy drawn in one
//     weight. The fill now belongs to the document bar alone — and the two
//     standalone documents are checked in the same run, because the rule that
//     unfills a building bar on the order must not reach the sheet where that
//     bar is the top rank.

import { openSection } from '../lib/sections.mjs';

export const title = 'Event Order — three columns, one dietary block, three ranks of heading';

/** `--ink-500`, the rule under an included document's building and meal heads. */
const RULE_MIDDLE = 'rgb(102, 112, 116)';

/** `--ink-300`, the lighter hairline under a day. Untouched by [v18]. */
const RULE_DAY = 'rgb(179, 186, 188)';

/** Transparent, however the engine spells it. */
function unfilled(colour) {
  return colour === 'rgba(0, 0, 0, 0)' || colour === 'transparent';
}

/**
 * Load one event and show one document, through the app's own way in.
 *
 * @param {object} page
 * @param {string} file an absolute path to a fixture
 * @param {number} sections how many the file carries — the wait needs a number,
 *   and a number is what tells a slow machine from a broken load
 */
async function open(page, file, sections) {
  await page.setInputFiles('#file-input', file);
  await page.waitForFunction((count) =>
    document.getElementById('section-blocks').children.length === count, sections);
}

/** Click a document's tab and wait for its body. */
async function show(page, id) {
  await page.click(`.viewtab[data-view="${id}"]`);
  await page.waitForSelector(`.docview[data-view="${id}"] .doc__body`);
}

/**
 * Back to the editor. The shell is one view at a time (§10) — the previews and
 * the editing workbench are never both up — so a check that goes to a document
 * and then wants to type has to come back the way a coordinator does.
 */
async function edit(page) {
  await page.click('.viewtab[data-view="edit"]');
  await page.waitForSelector('#section-blocks > .block [data-control="section-open"]',
    { state: 'visible' });
}

/**
 * Every table in one document, as its column labels.
 *
 * @param {object} page
 * @param {string} id a document id
 * @param {string} modifier the `tbl--<modifier>` to read
 * @returns {Promise<string[][]>} one array of labels per table, in document order
 */
function tableHeads(page, id, modifier) {
  return page.evaluate(({ id, modifier }) =>
    [...document.querySelectorAll(`.docview[data-view="${id}"] .tbl--${modifier} thead tr`)]
      .map((row) => [...row.children].map((cell) => cell.textContent.trim())),
  { id, modifier });
}

/**
 * @param {object} context see tests/run.mjs
 */
export async function run({ browser, origin, fixture, check }) {
  await withDietary({ browser, origin, fixture, check });
  await withoutEither({ browser, origin, fixture, check });
}

/* ------------------------------------------- an event with dietary needs on it */

/**
 * `large-event.json`: seven sections including both Guests and Food & Beverage,
 * seven guests with a dietary note between twenty-six, and a location on every
 * one of its twenty meals.
 */
async function withDietary({ browser, origin, fixture, check }) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await open(page, fixture('large-event.json'), 7);
    await show(page, 'order');

    const guests = await tableHeads(page, 'order', 'guests');
    check(
      'THE GUEST LIST IS THREE COLUMNS — Guest, Arrives, Departs [v18]',
      guests.length === 1 && guests[0].join(' | ') === 'Guest | Arrives | Departs',
      guests.map((row) => row.join(' | ')).join(' // ') || '(no guest table)'
    );

    check(
      'and no table on the order carries a Dietary column any more [v18]',
      await page.evaluate(() => ![...document.querySelectorAll(
        '.docview[data-view="order"] .tbl thead th')].some((cell) =>
        cell.textContent.trim() === 'Dietary')),
      await page.evaluate(() => [...document.querySelectorAll(
        '.docview[data-view="order"] .tbl thead th')].map((c) => c.textContent.trim()).join(', '))
    );

    const diet = await page.evaluate(() => {
      const body = document.querySelector('.docview[data-view="order"] .doc__body');
      const blocks = [...body.querySelectorAll('.diet')];
      const first = blocks[0];
      return {
        count: blocks.length,
        section: first ? first.closest('.sec').className : '',
        afterCount: Boolean(first
          && first.previousElementSibling
          && first.previousElementSibling.classList.contains('sec__count')),
        names: first ? [...first.querySelectorAll('.diet__who')].map((n) => n.textContent) : [],
        none: Boolean(first && first.querySelector('.diet__none'))
      };
    });

    check(
      'THE DIETARY BLOCK PRINTS UNDER THE GUEST LIST, WITH NAMES [v18]',
      diet.section.includes('sec--guests') && diet.afterCount
        && diet.names.length === 7 && diet.names.includes('Kim Palmer'),
      `${diet.names.length} names in a ${diet.section || '(none)'} section, `
        + `after the count: ${diet.afterCount}`
    );

    check(
      'and it prints ONCE on an order carrying both Guests and Food & Beverage [v18]',
      diet.count === 1 && !diet.none,
      `${diet.count} dietary blocks on the order`
    );

    const itin = await tableHeads(page, 'order', 'itin');
    check(
      'every day keeps its Location column while one meal has a location [v18]',
      itin.length === 5 && itin.every((row) => row.join(' | ') === 'Time | Item | Location'),
      itin.map((row) => row.join(' | ')).join(' // ')
    );

    const fnb = await tableHeads(page, 'order', 'fnb');
    check(
      'and so does the F&B table',
      fnb.length === 1 && fnb[0].join(' | ') === 'Date | Time | Meal | Count | Location',
      fnb.map((row) => row.join(' | ')).join(' // ')
    );
  } finally {
    await context.close();
  }
}

/* ------------ an event with no dietary needs, no locations, both inclusions on */

/**
 * `order-shape.json`: three days, three guests and none of them with a dietary
 * note, four meals and not a location among them, and `includeInOrder` set on
 * both — so one event answers the "None known." half of the block, the whole of
 * the Location column, and every heading rank on the order and on its own sheet.
 */
async function withoutEither({ browser, origin, fixture, check }) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await open(page, fixture('order-shape.json'), 3);
    await show(page, 'order');

    /* ------------------------------------------------------- the dietary block */

    const none = await page.evaluate(() => {
      const body = document.querySelector('.docview[data-view="order"] .doc__body');
      const blocks = [...body.querySelectorAll('.diet')];
      return {
        count: blocks.length,
        says: blocks[0] ? (blocks[0].querySelector('.diet__none') || {}).textContent || '' : '',
        section: blocks[0] ? blocks[0].closest('.sec').className : ''
      };
    });
    check(
      'AN EVENT WITH NO DIETARY NEEDS STILL SAYS SO, under the guest list [v18]',
      none.count === 1 && none.says === 'None known.' && none.section.includes('sec--guests'),
      `${none.count} blocks saying "${none.says}" in ${none.section || '(none)'}`
    );

    /* ------------------------------------------------------ the Location column */

    const bare = await tableHeads(page, 'order', 'itin');
    check(
      'NO LOCATION COLUMN ON AN ITINERARY WHERE NOTHING HAS A LOCATION [v18]',
      bare.length === 3 && bare.every((row) => row.join(' | ') === 'Time | Item'),
      bare.map((row) => row.join(' | ')).join(' // ')
    );

    check(
      'and none on the F&B table either — no meal has one to print',
      (await tableHeads(page, 'order', 'fnb'))
        .every((row) => row.join(' | ') === 'Date | Time | Meal | Count'),
      (await tableHeads(page, 'order', 'fnb')).map((row) => row.join(' | ')).join(' // ')
    );

    // One location, typed where a coordinator types it. The itinerary reads
    // `foodAndBev[]` (§7 [v7]), so this is the whole way the column arrives.
    await edit(page);
    await openSection(page, '.editor--fnb');
    await page.selectOption('.row--fnb:nth-of-type(2) [data-field="location"]', 'The Lodge');
    await page.waitForFunction(async () => {
      const app = await import('/js/app.js');
      return (app.getEvent().foodAndBev || []).some((row) => row.location === 'The Lodge');
    });
    await show(page, 'order');

    const located = await tableHeads(page, 'order', 'itin');
    check(
      'ONE MEAL WITH A LOCATION PUTS THE COLUMN ON EVERY DAY, not just its own [v18]',
      located.length === 3 && located.every((row) => row.join(' | ') === 'Time | Item | Location'),
      located.map((row) => row.join(' | ')).join(' // ')
    );

    check(
      'and on the F&B table with it',
      (await tableHeads(page, 'order', 'fnb'))
        .every((row) => row.join(' | ') === 'Date | Time | Meal | Count | Location'),
      (await tableHeads(page, 'order', 'fnb')).map((row) => row.join(' | ')).join(' // ')
    );

    /* -------------------------------------------------- three ranks of heading */

    const ranks = await page.evaluate(() => {
      const body = document.querySelector('.docview[data-view="order"] .doc__body');
      const paint = (node) => {
        const style = window.getComputedStyle(node);
        return {
          text: node.textContent.trim().slice(0, 40),
          background: style.backgroundColor,
          size: parseFloat(style.fontSize),
          rule: style.borderBottomColor
        };
      };
      const included = [...body.querySelectorAll('.sec--included')];
      return {
        documents: included.map((node) => paint(node.querySelector(':scope > .sec__title'))),
        buildings: included
          .flatMap((node) => [...node.querySelectorAll('.sec__body .sec--grid > .sec__title')])
          .map(paint),
        meals: included
          .flatMap((node) => [...node.querySelectorAll('.sec__body .meal > .meal__head')])
          .map(paint),
        days: [...body.querySelectorAll('.day__head')].map(paint)
      };
    });

    check(
      'the two document bars on the order keep their fill — that rank is unchanged',
      ranks.documents.length === 2
        && ranks.documents.every((bar) => !unfilled(bar.background)),
      ranks.documents.map((bar) => `${bar.text}: ${bar.background}`).join(' | ')
    );

    const middle = [...ranks.buildings, ...ranks.meals];
    check(
      'A BUILDING HEAD INSIDE THE ORDER HAS NO FILL, and keeps its rule [v18]',
      ranks.buildings.length >= 2
        && ranks.buildings.every((head) => unfilled(head.background) && head.rule === RULE_MIDDLE),
      ranks.buildings.map((h) => `${h.text}: ${h.background} / ${h.rule}`).join(' | ')
    );

    check(
      'A MEAL HEAD INSIDE THE ORDER HAS NO FILL EITHER, AT THE SAME RANK [v18]',
      ranks.meals.length === 4
        && ranks.meals.every((head) => unfilled(head.background) && head.rule === RULE_MIDDLE)
        // One rank means one size: a meal head at 11.5pt beside a building head
        // at 11pt is two ranks again, half a point apart, which reads as a
        // mistake rather than as a hierarchy.
        && new Set(middle.map((head) => head.size)).size === 1,
      middle.map((h) => `${h.text}: ${h.background} / ${h.rule} / ${h.size}px`).join(' | ')
    );

    check(
      'and a day inside the itinerary is the third rank, smaller and lighter — untouched [v18]',
      ranks.days.length === 3
        && ranks.days.every((head) => unfilled(head.background)
          && head.size < middle[0].size
          && head.rule === RULE_DAY),
      ranks.days.map((h) => `${h.text}: ${h.background} / ${h.rule} / ${h.size}px`).join(' | ')
    );

    /* ------------------------------- and the same heads on their own documents */

    await show(page, 'rooming');
    const sheet = await page.evaluate(() =>
      [...document.querySelectorAll(
        '.docview[data-view="rooming"] .sec--grid > .sec__title')]
        .map((node) => window.getComputedStyle(node).backgroundColor));
    check(
      'THE STANDALONE ROOMING ASSIGNMENT STILL FILLS ITS BUILDING BARS [v18]',
      sheet.length >= 2 && sheet.every((colour) => !unfilled(colour)),
      sheet.join(', ') || '(no building bars)'
    );

    await show(page, 'menu');
    const kitchen = await page.evaluate(() =>
      [...document.querySelectorAll('.docview[data-view="menu"] .meal > .meal__head')]
        .map((node) => window.getComputedStyle(node).backgroundColor));
    check(
      'and the standalone Menu still fills its meal heads [v18]',
      kitchen.length === 4 && kitchen.every((colour) => !unfilled(colour)),
      kitchen.join(', ') || '(no meal heads)'
    );
  } finally {
    await context.close();
  }
}
