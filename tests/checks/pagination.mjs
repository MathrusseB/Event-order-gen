// No printed page may carry the furniture and nothing else — BUILD-SPEC §10.
//
// A document one line too long for a page paginates, and the second page is
// correct. A page holding the running header, the footer and no body is not a
// long document, it is a defect: the Rooming Assignment printed one for the
// sample event, because 20px of margin below the last section became 17px of
// overflow past the bottom of Letter (see the trailing-space rule in
// styles.css). Nothing on that sheet told the reader it was an artefact.
//
// The check is deliberately about the printed artefact rather than about the
// margin that caused it. Any future trailing padding, spacer row, border or
// empty block would do the same damage, and this catches all of them by
// printing the thing and looking at what came out.
//
// HOW A PAGE IS JUDGED EMPTY. Each document is printed twice. The first print
// is the real one. The second is printed with the running header made
// `visibility: hidden` and the two footer margin boxes emptied — the header
// keeps its box, so the pagination is identical, but neither leaves any ink.
// On that print every mark on the paper came from the document body, so a page
// with no marks at all is a page with an empty body. The page counts of the two
// prints are compared, which is what makes "identical pagination" a checked
// claim rather than an assumption.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPages } from '../lib/pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The three documents, by the id `views.js` stamps on `<html data-print>`. */
const DOCUMENTS = [
  { id: 'order', label: 'Event Order' },
  { id: 'menu', label: 'Menu' },
  { id: 'rooming', label: 'Rooming Assignment' }
];

/**
 * The events printed. §8 [v8] — every document is generated for every event,
 * so all three are printed for each.
 *
 * The sample is loaded through its own button, the others through the file
 * input: both are the app's real load paths, which keeps the harness from
 * needing a way in that the application does not have.
 */
const EVENTS = [
  {
    name: 'the sample event',
    file: path.join(ROOT, 'data', 'sample.json'),
    open: (page) => page.click('#btn-sample')
  },
  {
    name: 'a large event',
    fixture: 'large-event.json',
    why: 'every document runs past one page'
  },
  {
    name: 'an empty event',
    fixture: 'empty-event.json',
    why: 'no dates, no guests, no sections'
  }
];

/**
 * How many sections the loaded event will show, read from the file itself.
 *
 * The wait below needs a number, and a number written here is a number that
 * goes stale the next time the fixture changes — quietly, as a 30-second
 * timeout rather than as a failed assertion about anything real.
 */
async function sectionCount(file) {
  const event = JSON.parse(await fs.readFile(file, 'utf8'));
  return Array.isArray(event.sections) ? event.sections.length : 0;
}

/** Ink from the furniture, removed so that ink means body. */
const MARKER_CSS = `@media print {
  .doc__runhead { visibility: hidden !important; }
  @page { @bottom-left { content: "" } @bottom-right { content: "" } }
}`;

export const title = 'Pagination — every printed page carries body content';

/**
 * @param {object} context see tests/run.mjs
 */
export async function run({ browser, origin, fixture, savePdf, check }) {
  for (const event of EVENTS) {
    // A context per event, so one event's autosave cannot restore itself over
    // the next one. The app opens on the autosave when there is one.
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      const file = event.file || fixture(event.fixture);
      await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
      if (event.open) await event.open(page);
      else await page.setInputFiles('#file-input', file);

      // The event is in when the outline holds its sections. Waiting on a
      // timer instead would pass on a slow machine by luck.
      await page.waitForFunction(
        (count) => document.getElementById('section-blocks').children.length === count,
        await sectionCount(file)
      );

      for (const document of DOCUMENTS) {
        await page.click(`.viewtab[data-view="${document.id}"]`);
        await page.waitForSelector(`.docview[data-view="${document.id}"] .doc__body`);
        // A logo still loading prints as a gap, and shifts the header height.
        await page.waitForFunction(() => [...window.document.images].every((image) => image.complete));

        const printed = await print(page);
        const marker = await page.addStyleTag({ content: MARKER_CSS });
        const marked = await print(page);
        await page.evaluate((node) => node.remove(), marker);

        const where = `${document.label}, ${event.name}`;
        await savePdf(`${event.fixture || 'sample'}-${document.id}.pdf`, printed.bytes);

        check(
          `${where}: the marked print paginates identically`,
          marked.pages.length === printed.pages.length,
          `${printed.pages.length} pages printed, ${marked.pages.length} with the furniture hidden`
        );

        const blank = marked.pages.filter((sheet) => !sheet.hasInk).map((sheet) => sheet.number);
        const written = marked.pages.filter((sheet) => sheet.hasInk);

        if (!written.length) {
          // A document with nothing to say — the empty event's Menu — prints
          // its header and stops. One sheet of furniture is that document; two
          // is the bug this check exists for.
          check(
            `${where}: an empty document prints one page, not two`,
            marked.pages.length === 1,
            `${marked.pages.length} pages, none of them carrying any body content`
          );
        } else {
          check(
            `${where}: all ${printed.pages.length} page(s) carry body content`,
            blank.length === 0,
            blank.length
              ? `page ${blank.join(', ')} of ${marked.pages.length} carries the running header and `
                + 'footer and nothing else'
              : ''
          );
        }
      }
    } finally {
      await context.close();
    }
  }

  await panelStaysOffThePaper({ browser, origin, check });
}

/**
 * [v12] The pre-print panel is not on the paper — BUILD-SPEC §8 [v8], §12 [v12].
 *
 * §12's second destination is a panel raised at the moment of printing, which
 * makes it the one surface in this app that can be on screen while a print is
 * running: a keyboard print, or the browser's own menu, reaches `window.print()`
 * without going near the button that would have closed it. §8 [v8] is strict —
 * nothing but the document may be in the output, "not collapsed, not behind a
 * page break, not present in the DOM and unstyled" — so this prints the sample
 * event's Event Order twice, once with the panel open, and compares the ink
 * mark for mark.
 *
 * Reading `display: none` out of print.css would be the cheaper check and it is
 * the one that proves nothing: the rule is `body > *`, and the whole risk is a
 * future panel that stops being a child of `<body>`.
 */
async function panelStaysOffThePaper({ browser, origin, check }) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
    await page.click('#btn-sample');
    await page.waitForFunction(
      (count) => document.getElementById('section-blocks').children.length === count,
      await sectionCount(path.join(ROOT, 'data', 'sample.json'))
    );
    await page.click('.viewtab[data-view="order"]');
    await page.waitForSelector('.docview[data-view="order"] .doc__body');
    await page.waitForFunction(() => [...window.document.images].every((image) => image.complete));

    const shut = await print(page);

    // The sample raises §12.8 on every meal with no menu, so the panel opens.
    await page.click('#btn-print');
    await page.waitForSelector('.prepanel:not([hidden])');
    const open = await print(page);

    check(
      'the pre-print panel is open on screen',
      await page.evaluate(() => !document.querySelector('.prepanel').hidden),
      'the sample event must raise findings for this check to mean anything'
    );

    check(
      'the pre-print panel leaves no mark on the printed Event Order',
      open.pages.length === shut.pages.length
        && open.pages.every((sheet, index) => inkOf(sheet) === inkOf(shut.pages[index])),
      `${shut.pages.length} pages shut / ${open.pages.length} open — `
        + `${open.pages.map(inkOf).join(' ')} against ${shut.pages.map(inkOf).join(' ')}`
    );
  } finally {
    await context.close();
  }
}

/** One page's ink as a comparable string. */
function inkOf(sheet) {
  return sheet ? `${sheet.ink.text}/${sheet.ink.images}/${sheet.ink.marks}` : 'missing';
}

/**
 * Print the document currently on screen, exactly as the print button does.
 *
 * `preferCSSPageSize` hands the page box to the `@page` rule in print.css —
 * Letter at 0.75in — rather than to Playwright's own defaults, so the harness
 * cannot pass by printing onto paper the app never asked for.
 */
async function print(page) {
  const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  return { bytes, pages: readPages(bytes) };
}
