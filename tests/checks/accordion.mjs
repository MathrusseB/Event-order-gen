// One section open at a time — BUILD-SPEC §5, §10 (v17 changes).
//
// The editor became a disclosure set, and almost every claim in §10 [v17] is a
// claim about the interface rather than about the data: what is open, what a
// shut header says, whether a control on a shut header still works, and where
// the caret is when a section comes back. None of that can be read off a
// module, so most of this drives the real app.
//
// The two that can be read off a module are read off it: the summary lines are
// `js/summary.js` with an event in and a sentence out, checked in plain Node
// for a populated section and an empty one of every type, because that is nine
// browser round-trips that do not need a browser.
//
// What must not go wrong, in the order it is checked:
//
//   * One body visible. Not "the last one pressed is open" — one, counted.
//   * A half-typed surname survives its section being shut and reopened, with
//     the caret where it was and the field scrolled where it was. This is what
//     hiding rather than unmounting is supposed to buy, and it is measured
//     rather than assumed — which is how the two parts it does *not* buy were
//     found. Chromium keeps the value, the selection, and the scroll offset of
//     anything that scrolls as a block; it takes focus away without giving it
//     back, and a text field throws away its own scroll offset on blur before
//     anything can read it. shell.js carries those two itself.
//   * A shut header's own controls work shut. Include in the order, move up,
//     move down, remove — pressing any of them must not open the section, and
//     must not disturb the one that is open.
//   * A shut section's §12 count is on its header, at its severity. A finding
//     nobody can see is a finding that does not exist.
//   * Reveal from the pre-print panel opens the section it is going to before
//     it scrolls there, and lands with the row on screen.
//   * `--bar-h` still measures the header, and the header is still sticky.

import { sectionSummary } from '../../js/summary.js';

export const title = 'One open section — the disclosure set, its summaries, its findings';

/** The fixture's sections, in order. Seven, every one of them enabled. */
const SECTIONS = ['Itinerary', 'Guests', 'Food & Beverage', 'Staff Assignments',
  'Department Breakdown', 'Security Notes', 'Notes'];

/**
 * @param {object} context see tests/run.mjs
 */
export async function run({ browser, origin, fixture, check }) {
  summaries(check);
  await theSet({ browser, origin, fixture, check });
}

/* ------------------------------------------------------------- the summaries */

/**
 * The line a shut section shows in place of its contents.
 *
 * Every type twice — with something in it and with nothing in it — because the
 * empty case is the one that goes wrong quietly: a section that reports "0
 * guests" reads as a broken count rather than as a section nobody has filled in.
 *
 * @param {Function} check
 */
function summaries(check) {
  const event = {
    meta: { startDate: '2026-11-14', endDate: '2026-11-16' },
    attendees: [
      { id: 'a1', first: 'Brian', last: 'Illig' },
      { id: 'a2', first: 'Nora', last: 'Illig', isChild: true },
      { id: 'a3', first: 'Charlie', last: 'Illig', isChild: true }
    ],
    schedule: [
      { id: 's1', date: '2026-11-14', start: '17:00', label: 'Arrivals' },
      { id: 's2', date: '2026-11-15', start: '05:30', label: 'Morning hunt' },
      // A seeded row nobody has filled in: on the itinerary this is nothing at
      // all (§5, v10 changes), and it must not be counted as an entry.
      { id: 's3', date: '2026-11-15', start: '', end: '', label: '' }
    ],
    // Two meals, which are itinerary entries as well as services: the section
    // renders the merged itinerary (§7), so its summary counts what it shows.
    foodAndBev: [
      { id: 'f1', date: '2026-11-14', meal: 'Dinner' },
      { id: 'f2', date: '2026-11-15', meal: 'Breakfast' }
    ],
    // One cook working three dayparts is one cook, not three.
    staff: [
      { id: 't1', name: 'Dana Reyes', date: '2026-11-14', daypart: 'AM' },
      { id: 't2', name: 'Dana Reyes', date: '2026-11-14', daypart: 'PM' },
      { id: 't3', name: 'Tom Whitfield', date: '2026-11-15', daypart: 'AM' }
    ],
    departments: [{ id: 'd1', name: 'Kitchen' }]
  };
  const bare = { meta: {}, attendees: [], schedule: [], foodAndBev: [], staff: [], departments: [] };

  const cases = [
    ['guests', 'guests', '3 guests, 2 children', 'No guests yet'],
    ['the itinerary', 'schedule', '2 days, 4 entries', 'Nothing on the itinerary yet'],
    ['food and beverage', 'foodAndBev', '2 services', 'No meal services yet'],
    ['staff', 'staff', '2 people', 'Nobody assigned yet'],
    ['departments', 'departments', '1 department', 'No departments yet']
  ];

  for (const [what, type, full, empty] of cases) {
    const said = sectionSummary(event, { type });
    check(
      `a shut ${what} section says what is in it — "${full}"`,
      said === full,
      `it says "${said}"`
    );
    const nothing = sectionSummary(bare, { type });
    check(
      `and an empty one says it is empty rather than showing a zero — "${empty}"`,
      nothing === empty && !/\b0\b/.test(nothing),
      `it says "${nothing}"`
    );
  }

  const note = sectionSummary(event, {
    type: 'freeText',
    body: 'Range in use Saturday PM.\nGuest arrivals staggered 1400-1800.'
  });
  check(
    'a shut free-text section says the first few words of the note',
    note.startsWith('Range in use Saturday PM. Guest') && note.endsWith('…'),
    `it says "${note}"`
  );
  check(
    'and an empty one says so',
    sectionSummary(event, { type: 'freeText', body: '   ' }) === 'Empty',
    `it says "${sectionSummary(event, { type: 'freeText', body: '   ' })}"`
  );
  check(
    'a type this build has never heard of claims to summarise nothing',
    sectionSummary(event, { type: 'seatingChart' }) === '',
    `it says "${sectionSummary(event, { type: 'seatingChart' })}"`
  );

  // One line on a phone is the requirement; the width it has to fit in is about
  // forty characters after the title and the controls have taken theirs.
  const longest = [
    ...cases.map(([, type]) => sectionSummary(event, { type })),
    ...cases.map(([, type]) => sectionSummary(bare, { type })),
    sectionSummary({ ...event, attendees: Array.from({ length: 120 }, (_, n) => ({ id: `a${n}`, isChild: n % 2 === 0 })) }, { type: 'guests' }),
    sectionSummary(event, { type: 'freeText', body: 'x'.repeat(400) }),
    note
  ].sort((a, b) => b.length - a.length)[0];
  check(
    'every line is short enough to sit on one line at phone width',
    longest.length <= 48,
    `the longest is ${longest.length} characters: "${longest}"`
  );
}

/* ---------------------------------------------------------------- the set */

/**
 * @param {{browser: object, origin: string, fixture: Function, check: Function}} context
 */
async function theSet({ browser, origin, fixture, check }) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const asked = [];

  try {
    page.on('dialog', (dialog) => {
      asked.push(dialog.message());
      dialog.accept();
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page.setInputFiles('#file-input', fixture('large-event.json'));
    await page.waitForFunction((count) =>
      document.getElementById('section-blocks').children.length === count, SECTIONS.length);

    const bar = await barState(page);

    /* -- what is open on the way in -- */
    const opened = await headers(page);
    check(
      'THE EDITOR OPENS ON ONE SECTION — the first, with the rest on their headers',
      opened.filter((row) => row.open).length === 1 && opened[0].open
        && opened.map((row) => row.title).join(' | ') === SECTIONS.join(' | '),
      opened.map((row) => `${row.title}:${row.open ? 'open' : 'shut'}`).join(' ')
    );
    check(
      'and exactly one body is visible — counted, not assumed',
      await visibleBodies(page) === 1,
      `${await visibleBodies(page)} visible`
    );
    check(
      'every shut header says what is inside it',
      opened.slice(1).every((row) => row.summary),
      opened.slice(1).map((row) => `${row.title}: ${row.summary || '(nothing)'}`).join(' | ')
    );
    check(
      'and the open one does not — its contents are right there',
      opened[0].summary === '',
      `it says "${opened[0].summary}"`
    );
    check(
      'A SHUT SECTION CARRIES ITS §12 FINDINGS ON ITS HEADER',
      opened[1].checks === '2 notes' && opened[1].warning === false,
      `Guests says "${opened[1].checks}", warning=${opened[1].warning}`
    );

    /* -- none of this is in the file -- */
    const untouched = JSON.stringify(await readEvent(page));
    await press(page, 'Staff Assignments');
    await press(page, 'Security Notes');
    await press(page, 'Guests');
    check(
      'WHICH SECTION IS OPEN IS NOT WRITTEN TO THE EVENT — three sections opened, nothing changed',
      JSON.stringify(await readEvent(page)) === untouched,
      'the event moved under a press that was only ever about the view'
    );

    /* -- opening one closes the other -- */
    const swapped = await headers(page);
    check(
      'OPENING A SECTION CLOSES THE ONE THAT WAS OPEN',
      swapped[1].open && !swapped[0].open
        && swapped.filter((row) => row.open).length === 1
        && await visibleBodies(page) === 1,
      swapped.map((row) => `${row.title}:${row.open ? 'open' : 'shut'}`).join(' ')
    );
    check(
      'the section that opened stops summarising itself, and the one that shut starts',
      swapped[1].summary === '' && swapped[0].summary === '5 days, 40 entries',
      `open: "${swapped[1].summary}" | shut: "${swapped[0].summary}"`
    );
    check(
      'and its findings go back to the rows, which can be seen again',
      swapped[1].checks === '',
      `the open section still says "${swapped[1].checks}" on its header`
    );

    /* -- the header pressed stays under the finger -- */
    const moved = await pressAndMeasure(page, 'Notes');
    check(
      'THE HEADER BEING PRESSED DOES NOT MOVE — a tall section closing above it takes its own '
        + 'height out of the page, not the press',
      Math.abs(moved) <= 2,
      `it moved ${moved}px`
    );

    /* -- a half-typed surname, its caret, and where the field was scrolled -- */
    await press(page, 'Guests');
    const field = page.locator('.rows--guests > li').first().locator('[data-field="last"]');
    await field.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Van Der Berg-Mathrusse of Amoret');
    for (let back = 0; back < 3; back += 1) await page.keyboard.press('ArrowLeft');
    const typing = await caretState(page);

    await press(page, 'Staff Assignments');
    const away = await caretState(page);
    check(
      'a section shut with the caret inside it keeps the half-typed value in the field',
      away.value === typing.value && away.focused === false,
      `"${away.value}", focused=${away.focused}`
    );

    await press(page, 'Guests');
    const back = await caretState(page);
    check(
      'A HALF-TYPED SURNAME COMES BACK WHOLE WHEN ITS SECTION REOPENS, CARET INCLUDED',
      back.value === typing.value && back.focused === true
        && back.start === typing.start && back.end === typing.end,
      `"${back.value}" caret ${back.start}-${back.end}, wanted ${typing.start}-${typing.end}, `
        + `focused=${back.focused}`
    );
    check(
      'AND THE FIELD IS SCROLLED WHERE IT WAS — the word being typed, not the first word',
      back.scrollLeft === typing.scrollLeft && typing.scrollLeft > 0,
      `${back.scrollLeft}px, was ${typing.scrollLeft}px on a field that had to scroll to be typed`
    );
    check(
      'and what came back is what the event holds — nothing was typed into a node the state lost',
      (await readEvent(page)).attendees[0].last === typing.value,
      `the event says "${(await readEvent(page)).attendees[0].last}"`
    );

    /* -- the controls on a shut header -- */
    await (await blockFor(page, 'Food & Beverage')).locator('.check__box').click();
    const toggled = await headers(page);
    check(
      'INCLUDE IN THE ORDER WORKS ON A SHUT HEADER, AND DOES NOT OPEN IT',
      (await readEvent(page)).sections[2].enabled === false
        && !toggled[2].open && toggled[1].open
        && toggled.filter((row) => row.open).length === 1,
      `enabled=${(await readEvent(page)).sections[2].enabled}, `
        + `F&B ${toggled[2].open ? 'open' : 'shut'}, Guests ${toggled[1].open ? 'open' : 'shut'}`
    );

    await (await blockFor(page, 'Food & Beverage')).locator('[data-control="section-up"]').click();
    const reordered = await headers(page);
    check(
      'SO DO MOVE UP AND MOVE DOWN, with the open section carried along rather than changed',
      reordered.map((row) => row.title).join(' | ') === 'Itinerary | Food & Beverage | Guests | '
        + 'Staff Assignments | Department Breakdown | Security Notes | Notes'
        && reordered[2].open && reordered[2].title === 'Guests'
        && reordered.filter((row) => row.open).length === 1,
      reordered.map((row) => `${row.title}:${row.open ? 'open' : 'shut'}`).join(' ')
    );

    asked.length = 0;
    await (await blockFor(page, 'Food & Beverage')).locator('[data-control="section-remove"]').click();
    await page.waitForFunction((count) =>
      document.getElementById('section-blocks').children.length === count, SECTIONS.length - 1);
    const removed = await headers(page);
    check(
      'AND SO DOES REMOVE, which asks first and leaves the open section open',
      asked.length === 1 && removed.length === SECTIONS.length - 1
        && removed[1].title === 'Guests' && removed[1].open
        && removed.filter((row) => row.open).length === 1,
      `${asked.length} asked, ${removed.map((row) => row.title).join(' | ')}`
    );

    /* -- a warning, on a shut header, in the warning's own colour -- */
    const guest = (await readEvent(page)).attendees[0];
    await page.locator(`.rows--guests > li[data-row="${guest.id}"] [data-field="depart"]`)
      .fill('2026-11-12');
    await page.waitForFunction(async () => {
      const app = await import('/js/app.js');
      return app.getEvent().attendees[0].depart === '2026-11-12';
    });
    await press(page, 'Itinerary');
    const warned = (await headers(page)).find((row) => row.title === 'Guests');
    check(
      'A SHUT SECTION WITH A WARNING IN IT SAYS SO, AT THE WARNING’S OWN SEVERITY',
      /^1 warning\b/.test(warned.checks) && warned.warning === true,
      `it says "${warned.checks}", warning=${warned.warning}`
    );

    /* -- reveal, from the panel, into a section that is shut -- */
    await page.click('#btn-print');
    await page.waitForSelector('.prepanel:not([hidden])');
    const item = page.locator('.prepanel__item', { hasText: 'arriving on' }).first();
    check(
      'the pre-print panel lists that warning as a way into the row it is about',
      await item.count() === 1 && !await item.isDisabled(),
      `${await page.locator('.prepanel__item').count()} items in the panel`
    );

    await item.click();
    await page.waitForSelector('.prepanel', { state: 'hidden' });
    await page.waitForTimeout(800);
    const landed = await page.evaluate((id) => {
      const row = [...document.querySelectorAll('.row--guest')].find((node) => node.dataset.row === id);
      const block = row && row.closest('.block');
      const box = row && row.getBoundingClientRect();
      const barBox = document.getElementById('bar').getBoundingClientRect();
      return {
        open: Boolean(block) && block.querySelector('[data-control="section-open"]')
          .getAttribute('aria-expanded') === 'true',
        onScreen: Boolean(box) && box.height > 0
          && box.bottom > barBox.bottom && box.top < window.innerHeight,
        section: block ? block.querySelector('[data-field="title"]').value : null,
        bodies: [...document.querySelectorAll('#section-blocks > .block .block__body')]
          .filter((body) => !body.hidden).length
      };
    }, guest.id);
    check(
      'REVEAL OPENS THE SECTION THE FINDING IS IN BEFORE IT SCROLLS, AND LANDS ON THE ROW',
      landed.open && landed.onScreen && landed.section === 'Guests' && landed.bodies === 1,
      `section ${landed.section} ${landed.open ? 'open' : 'shut'}, `
        + `row on screen=${landed.onScreen}, ${landed.bodies} bodies visible`
    );

    /* -- the navigator is the way between them -- */
    await page.click('.outline__list .outline__item:nth-child(5) .outline__link');
    await page.waitForTimeout(400);
    const navigated = await headers(page);
    check(
      'CHOOSING A SECTION IN THE NAVIGATOR OPENS IT AND CLOSES THE REST',
      navigated[3].open && navigated[3].title === 'Department Breakdown'
        && navigated.filter((row) => row.open).length === 1
        && await visibleBodies(page) === 1,
      navigated.map((row) => `${row.title}:${row.open ? 'open' : 'shut'}`).join(' ')
    );

    await page.setViewportSize({ width: 420, height: 860 });
    await page.click('#btn-outline');
    await page.waitForFunction(() => document.body.classList.contains('outline-open'));
    await page.click('.outline__list .outline__item:nth-child(2) .outline__link');
    await page.waitForTimeout(400);
    const narrow = await headers(page);
    const navigatorOpen = await page.evaluate(() =>
      document.body.classList.contains('outline-open'));
    check(
      'and below the breakpoint it closes itself once one is chosen — getting somewhere was the '
        + 'point of tapping it',
      narrow[0].open && narrow[0].title === 'Itinerary' && !navigatorOpen,
      `${narrow[0].title} ${narrow[0].open ? 'open' : 'shut'}, `
        + `navigator ${navigatorOpen ? 'still open' : 'shut'}`
    );

    /* -- the header, which none of this was allowed to touch -- */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(300);
    const after = await barState(page);
    check(
      '--bar-h still measures the header, and the header is still sticky',
      after.sticky === 'sticky' && after.sticky === bar.sticky
        && Math.abs(after.varH - after.height) <= 1 && Math.abs(bar.varH - bar.height) <= 1,
      `${after.varH}px written for a ${after.height}px header, position ${after.sticky}`
    );

    /* -- the first ENABLED section, on the way back in -- */
    await (await blockFor(page, 'Itinerary')).locator('.check__box').click();
    await page.waitForFunction(async () => {
      const app = await import('/js/app.js');
      return app.getEvent().sections[0].enabled === false;
    });
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction((count) =>
      document.getElementById('section-blocks').children.length === count, SECTIONS.length - 1);
    const reopened = await headers(page);
    check(
      'AN ORDER WHOSE FIRST SECTION IS NOT PRINTED OPENS ON THE FIRST ONE THAT IS',
      !reopened[0].open && reopened[1].open && reopened[1].title === 'Guests'
        && reopened.filter((row) => row.open).length === 1,
      reopened.map((row) => `${row.title}:${row.open ? 'open' : 'shut'}`).join(' ')
    );
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ reading */

/** Every section header, as the coordinator would read it. */
function headers(page) {
  return page.evaluate(() => [...document.querySelectorAll('#section-blocks > .block')]
    .map((block) => {
      const toggle = block.querySelector('[data-control="section-open"]');
      const summary = block.querySelector('.block__summary');
      const checks = block.querySelector('.block__checks');
      return {
        title: block.querySelector('[data-field="title"]').value,
        open: toggle.getAttribute('aria-expanded') === 'true',
        summary: summary.hidden ? '' : summary.textContent,
        checks: checks.hidden ? '' : checks.textContent,
        warning: checks.classList.contains('is-warning')
      };
    }));
}

/** Bodies actually on screen. The claim is "one", so it is counted. */
function visibleBodies(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#section-blocks > .block .block__body')]
      .filter((body) => !body.hidden && body.offsetParent !== null).length);
}

/** The first guest's surname field: its value, its caret, and where it is scrolled. */
function caretState(page) {
  return page.evaluate(() => {
    const input = document.querySelector('.rows--guests > li [data-field="last"]');
    return {
      value: input.value,
      focused: document.activeElement === input,
      start: input.selectionStart,
      end: input.selectionEnd,
      scrollLeft: Math.round(input.scrollLeft)
    };
  });
}

/** `--bar-h`, the height it is meant to be, and how the header is positioned. */
function barState(page) {
  return page.evaluate(() => {
    const bar = document.getElementById('bar');
    return {
      varH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')),
      height: bar.offsetHeight,
      sticky: getComputedStyle(bar).position
    };
  });
}

/** The event the browser is holding. */
function readEvent(page) {
  return page.evaluate(async () => {
    const app = await import('/js/app.js');
    return JSON.parse(JSON.stringify(app.getEvent()));
  });
}

/* ------------------------------------------------------------------ pressing */

/**
 * A section block, found by the title on its header.
 *
 * By position, looked up afresh each time: a section title is an input's
 * *value*, which is a property and not an attribute, so there is no selector for
 * it — and `hasText` would match the same words in the summary beside it. The
 * outline is re-read on every call because these presses reorder and remove.
 */
async function blockFor(page, title) {
  const titles = (await headers(page)).map((row) => row.title);
  const at = titles.indexOf(title);
  if (at === -1) {
    throw new Error(`No section titled ${title} — the outline holds ${titles.join(', ')}`);
  }
  return page.locator('#section-blocks > .block').nth(at);
}

/** Press a section's own header, the way a thumb does, and wait for it to open. */
async function press(page, title) {
  const toggle = (await blockFor(page, title)).locator('[data-control="section-open"]');
  if (await toggle.getAttribute('aria-expanded') === 'true') return;
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await page.waitForFunction((want) => {
    const block = [...document.querySelectorAll('#section-blocks > .block')]
      .find((node) => node.querySelector('[data-field="title"]').value === want);
    return block && !block.querySelector('.block__body').hidden;
  }, title);
}

/**
 * Press a header and report how far it moved on screen.
 *
 * Pressed with a tall section open above it: that section's whole height comes
 * out of the page between the two measurements, and a header that slid up by it
 * is a header that got away from the finger that pressed it.
 */
async function pressAndMeasure(page, title) {
  const toggle = (await blockFor(page, title)).locator('[data-control="section-open"]');
  await toggle.evaluate((node) =>
    window.scrollBy(0, node.getBoundingClientRect().top - window.innerHeight * 0.6));
  await page.waitForTimeout(250);
  const was = await toggle.evaluate((node) => node.getBoundingClientRect().top);
  await toggle.click();
  await page.waitForTimeout(250);
  return toggle.evaluate((node, top) => Math.round(node.getBoundingClientRect().top - top), was);
}
