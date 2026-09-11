// The exported board — BUILD-SPEC §5 [v11].
//
// One HTML file, sent to ownership as an attachment, opened by tapping it. Four
// claims are worth checking and none of them can be checked by reading the
// code:
//
//   1. It opens with no network at all. Not "no network on a good day" — every
//      request that is not the file itself is aborted here, and the board still
//      has to come up and be usable.
//   2. It references nothing outside itself. Checked against the live document
//      rather than against the text: an `href` in a comment is not a reference,
//      and a stylesheet's `url()` is one even though it is nowhere in the HTML.
//   3. It stays under the size §5 [v11] treats as the ceiling for something
//      that travels by text message.
//   4. THE ONE THAT MATTERS. A rearrangement made in the exported file produces
//      the same `rooming[]` the in-app board produces from the same moves.
//
// The fourth is why the export inlines js/rooming.js instead of reimplementing
// it, and it is the check that keeps that true. The same script of moves — a
// move through a stay, a join, a swap, a guest taken out of a room, and one in
// a building the board has folded away — is tapped out twice: once on the board
// in index.html, once on the exported board opened from a file:// URL with the
// network cut. Then the two arrays are compared row for row.
//
// Row ids cannot match across two runs, because a split mints new ones
// (`newId`). Ids the source event already had are compared as themselves, and
// ids created during the run are compared as "new" — which still checks that
// the same original rows survived, were split in the same places, and were
// rejoined the same way.
//
// The printed sheet is compared too. §5 [v11] asks for paper from the board to
// match paper from the app, and both are printed here and read back.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readPages } from '../lib/pdf.mjs';
import { fileAction } from '../lib/bar.mjs';

export const title = 'The exported board — one file, no network, no second implementation';

/** §5 [v11]. The exporter's own constant is read from the module, not repeated. */
const CEILING = 500 * 1024;

/**
 * The rearrangement, said once and tapped out on both boards.
 *
 * Chosen to reach every transform the two share rather than to be realistic: a
 * placement carried through the nights after it, a room joined, a swap, a guest
 * taken off a room and left with none, and a room in a building the exported
 * board folds away — which is the one move whose path through the two
 * interfaces is genuinely different.
 */
const MOVES = [
  { night: 0, guest: 'Dana Reyes', building: 'Winchester', room: '1', scope: 'stay' },
  { night: 0, guest: 'Elise Navarro', building: 'Remington', room: '1', scope: 'night',
    answer: 'add' },
  { night: 0, guest: 'Michael Illig', out: true },
  { night: 1, guest: 'Kim Palmer', building: 'Mallard', room: '3', scope: 'night' },
  { night: 1, guest: 'Tom Whitfield', building: 'Remington', room: '2', scope: 'stay',
    answer: 'swap' },
  { night: 0, guest: 'Charlie Illig', building: 'Clubhouse', room: '6', scope: 'stay' }
];

/* ========================================================================== *
 * The two drivers. Same moves, two interfaces.
 * ========================================================================== */

/** The board in index.html — BUILD-SPEC §9. */
async function driveApp(page, moves) {
  for (const move of moves) {
    await page.click(`.board__night >> nth=${move.night}`);
    await page.click(`.board__scopebtn >> nth=${move.scope === 'night' ? 0 : 1}`);

    if (move.out) {
      const chip = page.locator('.boardparty__item', { hasText: move.guest });
      await chip.locator('[data-control="off"]').click();
      continue;
    }

    await page.click(`.board__panes >> text="${move.guest}"`);
    const room = page.locator('.boardbuilding', { hasText: move.building })
      .locator('.boardroom')
      .filter({ has: page.locator(`.boardroom__name:text-is("${move.room}")`) })
      .locator('.boardroom__target');
    await room.click();

    if (move.answer) await page.click(`.boardask__choice[value="${move.answer}"]`);
    await page.waitForTimeout(60);
  }
}

/** The board ownership is sent — js/ownership.js. */
async function driveBoard(page, moves) {
  for (const move of moves) {
    await page.click(`.ob-night >> nth=${move.night}`);

    await page.click(`.ob-main >> text="${move.guest}"`);
    await page.waitForTimeout(260);

    if (move.out) {
      await page.click('.ob-hand__out');
      await page.waitForTimeout(60);
      continue;
    }

    await page.click(`.ob-scope__btn >> nth=${move.scope === 'night' ? 0 : 1}`);

    // A building this event is not using is folded (§5 [v11]) — nothing is
    // hidden, but it takes two taps to reach a room in one.
    const target = `[data-focus="room:${move.building}:${move.room}"]`;
    if (!await page.locator(target).count()) {
      if (await page.locator('[data-focus="others"][aria-expanded="false"]').count()) {
        await page.click('[data-focus="others"]');
      }
      await page.click(`[data-focus="fold:${move.building}"]`);
    }
    await page.click(target);

    if (move.answer) {
      await page.waitForSelector('.ob-choice');
      await page.click(`.ob-choice[data-answer="${move.answer}"]`);
    }
    await page.waitForTimeout(60);
  }
}

/* ========================================================================== *
 * Comparing
 * ========================================================================== */

/**
 * `rooming[]` as lines, with ids the run minted written as "new".
 *
 * @param {object[]} rooming
 * @param {Set<string>} known the ids the source event carried
 * @returns {string}
 */
function shape(rooming, known) {
  return (rooming || []).map((row) => [
    known.has(row.id) ? row.id : 'new',
    row.building || '',
    row.room || '',
    (row.guestIds || []).join('+') || 'nobody',
    row.from,
    row.to
  ].join(' | ')).join('\n');
}

/** The first line the two disagree on, for a failure that says where. */
function firstDifference(left, right) {
  const a = left.split('\n');
  const b = right.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) return `row ${i + 1}\n      app   ${a[i] || '(none)'}\n      board ${b[i] || '(none)'}`;
  }
  return '';
}

/* ========================================================================== *
 * The run
 * ========================================================================== */

export async function run({ browser, origin, savePdf, check }) {
  const sample = JSON.parse(await fs.readFile(
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'data', 'sample.json'),
    'utf8'
  ));
  const known = new Set((sample.rooming || []).map((row) => row.id));

  /* ---- build it, exactly as the button does ---------------------------- */

  const maker = await browser.newContext();
  const app = await maker.newPage();
  await app.goto(`${origin}/index.html`, { waitUntil: 'networkidle' });
  await fileAction(app, '#btn-sample');
  await app.waitForFunction(() => document.querySelectorAll('.boardbuilding').length > 0);

  const built = await app.evaluate(async () => {
    const io = await import('/js/io.js');
    const xp = await import('/js/export.js');
    const { event } = await io.loadSample();
    const { html, logo } = await xp.buildExport(event);
    return { html, logo: logo.length, name: xp.exportFileName(event), ceiling: xp.SIZE_CEILING };
  });

  const bytes = Buffer.byteLength(built.html, 'utf8');
  check(
    `the file is one document under ${Math.round(CEILING / 1024)}KB — ${Math.round(bytes / 1024)}KB, `
      + `of which the logo is ${Math.round(built.logo / 1024)}KB`,
    bytes <= CEILING && built.ceiling === CEILING,
    `${bytes} bytes against a ceiling of ${built.ceiling}`
  );

  check(
    'the filename comes from the event name and its start date, slugified',
    built.name === 'sample-event-illig-party-opening-weekend-2026-11-14-rooming.html',
    built.name
  );

  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'rooming-')), built.name);
  await fs.writeFile(file, built.html);

  /* ---- open it with the network cut ------------------------------------ */

  const offline = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reached = [];
  await offline.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) {
      return route.continue();
    }
    reached.push(url);
    return route.abort();
  });

  const board = await offline.newPage();
  const broke = [];
  board.on('pageerror', (error) => broke.push(String(error)));
  board.on('console', (message) => {
    if (message.type() === 'error') broke.push(`console: ${message.text()}`);
  });

  await board.goto(`file://${file}`);
  await board.waitForSelector('.ob-night');

  const opened = await board.evaluate(() => ({
    nights: document.querySelectorAll('.ob-night').length,
    rooms: document.querySelectorAll('[data-focus^="room:"]').length,
    guests: document.querySelectorAll('[data-focus^="guest:"]').length,
    folded: document.querySelector('[data-focus="others"]')
      ? document.querySelector('[data-focus="others"]').textContent : ''
  }));

  check(
    'it opens from a file with every other request refused, and comes up whole',
    reached.length === 0 && broke.length === 0
      && opened.nights > 0 && opened.rooms > 0 && opened.guests > 0,
    [reached.length ? `asked for ${reached.join(', ')}` : '',
      broke.length ? broke.join(' / ') : '',
      `${opened.nights} nights, ${opened.rooms} rooms, ${opened.guests} guests`]
      .filter(Boolean).join(' — ')
  );

  const outside = await board.evaluate(() => {
    const bad = [];
    for (const node of document.querySelectorAll('[src], [href], [srcset], [data-src]')) {
      for (const name of ['src', 'href', 'srcset', 'data-src']) {
        const value = node.getAttribute(name);
        if (value === null) continue;
        if (!/^(?:data:|#|$)/.test(value.trim())) bad.push(`<${node.localName} ${name}="${value}">`);
      }
    }
    for (const sheet of document.styleSheets) {
      if (sheet.href) bad.push(`stylesheet ${sheet.href}`);
      let rules = [];
      try {
        rules = [...sheet.cssRules];
      } catch (err) {
        bad.push('a stylesheet that could not be read, which means it came from elsewhere');
      }
      const walk = (list) => {
        for (const rule of list) {
          if (rule.type === CSSRule.IMPORT_RULE) bad.push(`@import ${rule.href}`);
          if (rule.type === CSSRule.FONT_FACE_RULE) bad.push('@font-face');
          if (rule.cssText && /url\((?!['"]?data:)/.test(rule.cssText)) {
            bad.push(rule.cssText.slice(0, 90));
          }
          if (rule.cssRules) walk([...rule.cssRules]);
        }
      };
      walk(rules);
    }
    return bad;
  });

  check(
    'nothing in it points anywhere outside itself — no src, no href, no @import, no font',
    outside.length === 0,
    outside.join('\n      ')
  );

  /* ---- the same rearrangement, on both boards --------------------------- */

  await driveBoard(board, MOVES);
  const fromBoard = await board.evaluate(() => {
    const key = Object.keys(window.localStorage).find((name) => name.startsWith('rooming-board:'));
    return key ? JSON.parse(window.localStorage.getItem(key)).rooming : null;
  });

  await driveApp(app, MOVES);
  const fromApp = await app.evaluate(async () => (await import('/js/app.js')).getEvent().rooming);

  const left = shape(fromApp, known);
  const right = shape(fromBoard, known);

  check(
    `${MOVES.length} moves on both boards write the same rooming[], row for row`,
    Boolean(fromBoard) && left === right,
    fromBoard ? firstDifference(left, right) : 'the exported board kept no working copy to read'
  );

  check(
    'and the moves actually did something — the array is not the one it started as',
    left !== shape(sample.rooming, known),
    'the rearrangement left rooming[] untouched, so the comparison above proves nothing'
  );

  /* ---- and the paper -------------------------------------------------- */

  await board.click('.ob-action >> nth=1');
  await board.waitForFunction(() => document.getElementById('board-paper').children.length > 0);
  await board.waitForFunction(() => [...document.images].every((image) => image.complete));
  const boardPdf = await board.pdf({ preferCSSPageSize: true, printBackground: true });

  await app.click('.viewtab[data-view="rooming"]');
  await app.waitForSelector('.docview[data-view="rooming"] .doc__body');
  await app.waitForFunction(() => [...document.images].every((image) => image.complete));
  const appPdf = await app.pdf({ preferCSSPageSize: true, printBackground: true });

  await savePdf('export-board-rooming.pdf', boardPdf);
  await savePdf('export-app-rooming.pdf', appPdf);

  const boardPages = readPages(boardPdf);
  const appPages = readPages(appPdf);
  const ink = (pages) => pages.map((sheet) => sheet.ink.text).join(',');

  check(
    'Print gives the same Rooming Assignment the generator prints, page for page',
    boardPages.length === appPages.length && ink(boardPages) === ink(appPages),
    `board: ${boardPages.length} pages [${ink(boardPages)}] — `
      + `app: ${appPages.length} pages [${ink(appPages)}]`
  );

  await offline.close();
  await maker.close();
}
