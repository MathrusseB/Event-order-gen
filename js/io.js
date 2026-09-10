// Persistence — BUILD-SPEC §3, §11.
//
// The JSON file is the source of truth. `localStorage` is an autosave
// convenience only and must never be the sole copy of anything: it is one key,
// it fails silently, and nothing here treats its absence as an error.
//
// [v4] Every inbound path runs `migrate()` before handing the event on, so no
// caller ever sees a pre-v4 shape, and each returns migrate's own
// `{ event, summary }` — the summary travels with the event that produced it
// rather than being stashed somewhere and hoped for later.
//
// [v10] They all run `absorbActivities()` too: the activity list a file carries
// joins this machine's list on the way in (§6 [v10]). It happens here rather
// than in `migrate()` because it writes to `localStorage`, and migrate is pure.

import { absorbActivities } from './activities.js';
import { migrate } from './migrate.js';

/** Single autosave key. One event in flight at a time. */
const AUTOSAVE_KEY = 'event-order-gen:autosave';

/**
 * Trailing debounce for the autosave, in ms. The form writes per keystroke;
 * without this, every character serializes the whole event to `localStorage`.
 * Long enough to coalesce typing, short enough that a pause is a save.
 */
const AUTOSAVE_DEBOUNCE_MS = 500;

/** How long a download's object URL is held before it is revoked. */
const OBJECT_URL_LIFETIME_MS = 60000;

/** Resolved from this module, so the app runs from any directory. */
const SAMPLE_URL = new URL('../data/sample.json', import.meta.url);

/**
 * Lowercase, hyphen-joined, filesystem-safe.
 * @param {string} value
 * @returns {string} may be empty
 */
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Download filename, derived from `meta.eventName` and `meta.startDate`.
 * @param {object} event
 * @returns {string}
 */
function fileNameFor(event) {
  const meta = (event && event.meta) || {};
  const parts = [slugify(meta.eventName) || 'event', slugify(meta.startDate)].filter(Boolean);
  return `${parts.join('-')}.json`;
}

/**
 * Read a user-selected `.json` file, migrate it, and return the event.
 *
 * @param {File} file from an `<input type="file">`
 * @returns {Promise<{event: object, summary: object}>}
 * @throws {Error} if there is no file, or the contents are not a JSON object
 */
export async function loadFromFile(file) {
  if (!file) throw new Error('No file selected.');
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file.name} does not contain an event object.`);
  }
  return inbound(migrate(parsed));
}

/**
 * [v10] The last thing every inbound path does.
 *
 * @param {{event: object, summary: object}} result
 * @returns {{event: object, summary: object}} the same result
 */
function inbound(result) {
  absorbActivities(result.event);
  return result;
}

/**
 * Trigger a browser download of the event as JSON.
 *
 * @param {object} event
 * @returns {string} the filename used
 */
export function saveToFile(event) {
  const name = fileNameFor(event);
  const blob = new Blob([`${JSON.stringify(event, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari and iOS can still be reading the blob when `click()` returns, so a
  // synchronous revoke races the download and produces an empty or failed file.
  // Defer it: the URL costs nothing to hold, and the tab reclaims it anyway.
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
  return name;
}

// Debounce state. The pending event is held here, not by the caller, so a
// flush at page-hide time writes the newest edit whoever triggers it.
let autosaveTimer = null;
let pendingEvent = null;

/**
 * Queue an autosave, replacing any write still waiting. The normal write path:
 * `app.js` calls this on every change, and it lands ~500ms after typing stops.
 *
 * @param {object} event
 */
export function scheduleAutosave(event) {
  pendingEvent = event;
  if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(flushAutosave, AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Write any queued autosave now. Wired to page-hide in `app.js` so a closed
 * tab does not eat the last edit. Safe to call with nothing pending.
 *
 * @returns {boolean} whether anything was written
 */
export function flushAutosave() {
  cancelPendingAutosave();
  if (pendingEvent === null) return false;
  const event = pendingEvent;
  pendingEvent = null;
  return autosave(event);
}

/** Drop a queued autosave without writing it. */
function cancelPendingAutosave() {
  if (autosaveTimer !== null) {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

/**
 * Write the event to `localStorage`. Convenience only — a failure here
 * (private mode, quota, storage disabled) is not an error the user needs.
 *
 * @param {object} event
 * @returns {boolean} whether it was stored
 */
export function autosave(event) {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(event));
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Read back the autosaved event, if there is one and it still parses.
 *
 * An autosave written before v4 is migrated on the way out, exactly as a file
 * is: the tab that wrote it may have been open since the old shape.
 *
 * @returns {{event: object, summary: object}|null} null whenever storage is
 *   unavailable, empty, or corrupt
 */
export function restoreAutosave() {
  try {
    const text = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return inbound(migrate(parsed));
  } catch (err) {
    return null;
  }
}

/**
 * Discard the autosave, queued write included — otherwise a debounced save of
 * the discarded event could land after New has cleared it.
 * Silent if storage is unavailable.
 */
export function clearAutosave() {
  cancelPendingAutosave();
  pendingEvent = null;
  try {
    window.localStorage.removeItem(AUTOSAVE_KEY);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Fetch the development fixture, `/data/sample.json`.
 *
 * @returns {Promise<{event: object, summary: object}>}
 * @throws {Error} if the fetch fails — notably on `file://`, where fetch is
 *   blocked and the app must be served.
 */
export async function loadSample() {
  const response = await fetch(SAMPLE_URL);
  if (!response.ok) {
    throw new Error(`Could not load sample.json (${response.status}).`);
  }
  return inbound(migrate(await response.json()));
}
