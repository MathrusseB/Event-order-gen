#!/usr/bin/env node
// The harness — BUILD-SPEC §10, "the one thing about printing worth testing by
// printing".
//
//   node tests/run.mjs              run every check
//   node tests/run.mjs --out pdfs   and keep the PDFs it printed
//
// No test framework and no package.json, for the same reason the app has no
// build step: one file to read, nothing to install, and it runs from a clean
// clone. Playwright is borrowed from wherever it is already installed
// (tests/lib/browser.mjs) and the app is served from the repository as-is
// (tests/lib/serve.mjs) — what the browser loads here is what Railway serves.
//
// A check is a module in tests/checks/ exporting `title` and `run(context)`.
// It reports through `check(name, passed, detail)` rather than throwing, so one
// failure does not hide the eight results behind it. The process exits 1 if
// anything failed, which is the whole contract with CI.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './lib/serve.mjs';
import { launch } from './lib/browser.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const outFlag = process.argv.indexOf('--out');
const OUT_DIR = outFlag === -1 ? null : path.resolve(process.argv[outFlag + 1] || 'pdfs');

const results = [];

/**
 * Record one result.
 *
 * @param {string} name what was checked, as a sentence that reads as a claim
 * @param {boolean} passed
 * @param {string} [detail] shown on failure — the measurement, not the advice
 */
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  process.stdout.write(`  ${passed ? '✓' : '✗'} ${name}\n`);
  if (!passed && detail) process.stdout.write(`      ${detail}\n`);
}

/** An absolute path to a fixture. Test data, never data/sample.json. */
function fixture(name) {
  return path.join(HERE, 'fixtures', name);
}

/** Keep a printed PDF, when the run asked for them. */
async function savePdf(name, bytes) {
  if (!OUT_DIR) return;
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, name), bytes);
}

async function main() {
  const checks = (await fs.readdir(path.join(HERE, 'checks')))
    .filter((name) => name.endsWith('.mjs'))
    .sort();

  const server = await serve(ROOT);
  const { browser, close } = await launch();

  try {
    for (const name of checks) {
      const module = await import(path.join(HERE, 'checks', name));
      process.stdout.write(`\n${module.title || name}\n`);
      await module.run({ browser, origin: server.origin, fixture, savePdf, check });
    }
  } finally {
    await close();
    await server.close();
  }

  const failed = results.filter((result) => !result.passed);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed`);
  process.stdout.write(OUT_DIR ? `, PDFs in ${path.relative(ROOT, OUT_DIR)}\n` : '\n');
  if (OUT_DIR) process.stdout.write('');
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n`);
  process.exitCode = 1;
});
