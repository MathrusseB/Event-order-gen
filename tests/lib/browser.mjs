// Chromium, borrowed rather than depended on.
//
// BUILD-SPEC §3: the app has no runtime dependencies and no build step, and
// nothing here changes that — this directory is a development tool that never
// ships. There is deliberately no package.json: Playwright is resolved from
// wherever it already exists (a local install, or a global one), and if it is
// nowhere the harness says how to get it instead of failing with a stack trace.
//
// Chromium is the browser the documents are designed against: §10's print
// approach is browser print-to-PDF, and the print quirks the renders work
// around — margin boxes for the page counter, `table-header-group` for the
// running header — are Chrome's. Printing in another engine would be a
// different test.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);

/**
 * `require('playwright')`, looking in the global module root as well.
 *
 * @returns {object} the playwright module
 * @throws {Error} with the install line, when it is not installed anywhere
 */
function loadPlaywright() {
  const attempts = ['playwright', 'playwright-core'];
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    if (globalRoot) attempts.push(`${globalRoot}/playwright`, `${globalRoot}/playwright-core`);
  } catch {
    // No npm on the path is not fatal — a local install may still answer.
  }

  for (const specifier of attempts) {
    try {
      return require(specifier);
    } catch {
      // Try the next one.
    }
  }

  throw new Error(
    'Playwright is not installed.\n'
    + '  npm install -g playwright && npx playwright install chromium\n'
    + 'It is a development dependency of this harness only. The app itself has none.'
  );
}

/**
 * Launch headless Chromium. `page.pdf()` is headless-only, and printing is the
 * whole point of this harness.
 *
 * @returns {Promise<{browser: object, close: () => Promise<void>}>}
 */
export async function launch() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  return { browser, close: () => browser.close() };
}
