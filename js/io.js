// Persistence — BUILD-SPEC §3, §11.
//
// The JSON file is the source of truth. `localStorage` is an autosave
// convenience only and must never be the sole copy of anything: it is one key,
// it fails silently, and nothing here treats its absence as an error.

/** Single autosave key. One event in flight at a time. */
const AUTOSAVE_KEY = 'event-order-gen:autosave';

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
 * Read a user-selected `.json` file and return the parsed event object.
 *
 * @param {File} file from an `<input type="file">`
 * @returns {Promise<object>}
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
  return parsed;
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
  URL.revokeObjectURL(url);
  return name;
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
 * @returns {object|null} null whenever storage is unavailable, empty, or corrupt
 */
export function restoreAutosave() {
  try {
    const text = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

/** Discard the autosave. Silent if storage is unavailable. */
export function clearAutosave() {
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
 * @returns {Promise<object>}
 * @throws {Error} if the fetch fails — notably on `file://`, where fetch is
 *   blocked and the app must be served.
 */
export async function loadSample() {
  const response = await fetch(SAMPLE_URL);
  if (!response.ok) {
    throw new Error(`Could not load sample.json (${response.status}).`);
  }
  return response.json();
}
