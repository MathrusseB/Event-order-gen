// Application state and the file toolbar — BUILD-SPEC §11.
//
// The interface itself lives in shell.js and js/editors/. This module knows
// nothing about them: it holds the event, and everything else subscribes.
//
// WRITE CONVENTION — read this before writing event data anywhere in the app.
// `getEvent()` returns the live event deeply frozen, so an in-place write to it
// throws a TypeError instead of quietly going nowhere. Every mutation goes
// through `update((draft) => { ... })`, which clones the current event into a
// mutable draft, runs the mutator, stores the result, notifies subscribers, and
// schedules the autosave; `setEvent()` is reserved for wholesale replacement —
// Load, New, Load Sample — and is never the way to edit a field. So
// `getEvent().attendees.push(row)` is a hard error by design, and the same edit
// is written `update((draft) => { draft.attendees.push(row); })`. A mutator may
// instead return a replacement event, which is how a self-contained module such
// as `rooming.js` (BUILD-SPEC §9) plugs in: event in, mutated event out.

import { defaultSections } from './sections.js';
import { DEFAULT_BRAND_ID } from './reference.js';
import { nowStamp } from './dates.js';
import { findingsByArea, findingsByRow, validateEvent } from './validate.js';
import {
  loadFromFile,
  saveToFile,
  scheduleAutosave,
  flushAutosave,
  restoreAutosave,
  clearAutosave,
  loadSample
} from './io.js';

/** The one in-memory event, deeply frozen. Null until `init()` settles. */
let event = null;

/** Change listeners, called with the current event after every write. */
const subscribers = new Set();

/**
 * [v12] The §12 findings on the event currently loaded, computed once and held
 * until the next write. BUILD-SPEC §12 [v12].
 *
 * `validate.js` is pure and stateless on purpose — an event in, findings out —
 * so the memo lives here, beside the one thing that knows when the event has
 * changed. Without it every row in every editor would run the whole validator
 * to ask what is wrong with itself, on every keystroke.
 *
 * Null means "not computed since the last write", never "no findings".
 */
let checked = null;

/**
 * [v4] What `migrate()` did to the event currently loaded, or null for one this
 * session created. Held beside the event rather than inside it: it describes
 * the file that was opened, not the document being authored, and must never
 * ride along into the saved JSON.
 */
let lastMigration = null;

/**
 * [v13] Where the event currently loaded came from, and how many events this
 * session has loaded. BUILD-SPEC §10 [v13].
 *
 * Held here for the same reason `lastMigration` is: it is a fact about the
 * session, not about the document, and it must never reach the file. The
 * interface reads it to answer one question — has a *different* event just
 * arrived, and did the user ask for a blank one — because a new order opens on
 * the date fields and a restored autosave must not steal the caret from
 * wherever the coordinator left it.
 *
 * The serial is what makes "a different event" answerable at all: `commit`
 * hands out a new object on every keystroke, so identity says nothing, and only
 * `setEvent` moves this on.
 */
let origin = 'new';
let loadSerial = 0;

/**
 * Freeze an object and everything reachable from it, in place.
 *
 * Freezing before recursing doubles as cycle protection: an already-frozen
 * object is never walked twice.
 *
 * @param {*} value
 * @returns {*} the same value
 */
function freezeDeep(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

/** Store a private, deeply frozen event and notify. The only assignment to `event`. */
function commit(next) {
  event = freezeDeep(next);
  // [v12] Dropped rather than recomputed: the subscribers about to run are the
  // only things that read it, and an event nobody looks at is never validated.
  checked = null;
  notify();
}

/**
 * The event currently loaded — a deeply frozen copy of what was last written.
 *
 * Frozen rather than a fresh clone per call, deliberately. A clone would let
 * `getEvent().attendees.push(row)` succeed against a throwaway object: no
 * notification, no autosave, and the edit gone at the next render, which is the
 * one failure mode this convention exists to prevent. Frozen, that line throws
 * at the moment it is written — ES modules are strict, so the assignment is a
 * TypeError, not a silent no-op. It is also cheaper: one clone per write rather
 * than one per read, and reads are constant (every render, every derive call).
 *
 * @returns {object|null} do not mutate — use `update()`
 */
export function getEvent() {
  return event;
}

/**
 * Replace the event wholesale and notify. Load, New, and Load Sample only —
 * use `update()` to edit an event already in hand.
 *
 * The argument is cloned, so a caller holding the original cannot reach in and
 * change state behind the app's back.
 *
 * @param {object} next
 * @param {object|null} [migrationSummary] the `summary` from `migrate()`, where
 *   the event came from a file, the autosave, or the fixture
 * @param {'new'|'file'|'autosave'|'sample'} [from] [v13] which of the four this
 *   is — see `lastLoad`
 */
export function setEvent(next, migrationSummary = null, from = 'new') {
  lastMigration = migrationSummary;
  origin = from;
  loadSerial += 1;
  commit(structuredClone(next));
}

/**
 * [v13] The event currently loaded, as an arrival rather than as a document.
 *
 * @returns {{origin: string, serial: number}} `serial` moves only when a whole
 *   event is replaced, so a caller that remembers the last one it saw can tell
 *   a new event from the four hundredth keystroke in the old one
 */
export function lastLoad() {
  return { origin, serial: loadSerial };
}

/**
 * [v13] Whether anything has been typed into an event. BUILD-SPEC §10 [v13].
 *
 * The question New and Load sample ask before replacing what is open. "Discard
 * the event in progress?" over an event nobody has touched is the confirmation
 * that teaches people to confirm without reading — and an empty order is the
 * one thing in this app it costs nothing to throw away.
 *
 * The outline counts: a coordinator who has arranged their sections and typed
 * nothing else has still done work. Everything else is content.
 *
 * @param {object} event
 * @returns {boolean} false for a new event nobody has touched
 */
export function hasWork(event) {
  if (!event || typeof event !== 'object') return false;

  const meta = event.meta || {};
  for (const key of ['eventName', 'startDate', 'endDate', 'eventLead', 'revisionDate', 'revisedBy']) {
    if (String(meta[key] || '').trim()) return true;
  }
  for (const key of CONTENT_ARRAYS) {
    if (Array.isArray(event[key]) && event[key].length) return true;
  }
  return outlineSignature(event.sections) !== FRESH_OUTLINE;
}

/** [v13] The arrays that hold what somebody typed. `sections` is asked separately. */
const CONTENT_ARRAYS = ['attendees', 'rooming', 'schedule', 'foodAndBev', 'menu', 'staff',
  'departments', 'buildingsInUse', 'overflowBuildings', 'customActivities'];

/** [v13] An outline as one comparable string — type, title and whether it prints. */
function outlineSignature(sections) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => (section && typeof section === 'object'
      ? `${section.type}:${String(section.title || '')}:${section.enabled !== false}`
      : '?'))
    .join('|');
}

/** [v13] The outline a new event opens with, computed once. */
const FRESH_OUTLINE = outlineSignature(defaultSections());

/**
 * [v4] How the event currently loaded was migrated on the way in, or null.
 *
 * Nothing surfaces this yet — the report exists so a later segment can tell the
 * user that rooming rows came in unmatched, rather than the rows quietly
 * rendering as orphans.
 *
 * @returns {object|null} see `MigrationSummary` in migrate.js
 */
export function getLastMigration() {
  return lastMigration;
}

/**
 * The write path. Hands the mutator a mutable draft of the current event,
 * stores the result, notifies subscribers, and schedules the autosave.
 *
 * @param {(draft: object) => (object|void)} mutate mutates the draft in place,
 *   or returns a replacement event
 * @returns {object} the new frozen event
 * @throws {Error} if no event is loaded yet
 */
export function update(mutate) {
  if (!event) throw new Error('update() called before an event was loaded.');
  const draft = structuredClone(event);
  const returned = mutate(draft);
  // Clone only a foreign object: the draft is already private to this call.
  const next = returned === undefined || returned === draft ? draft : structuredClone(returned);

  // [v12] The edit is recorded here because here is the only place an edit
  // happens. §12.11 asks whether the revision line is older than the most
  // recent edit, and until v12 nothing knew when that was; a stamp written
  // anywhere else would be a stamp some write path could get past. Local wall
  // clock, no zone — see `nowStamp` (dates.js).
  if (!next.meta || typeof next.meta !== 'object') next.meta = {};
  next.meta.touchedAt = nowStamp();

  commit(next);
  return event;
}

/**
 * [v12] The §12 findings on the current event, in rule order.
 *
 * Computed on first ask after each write and held until the next one, so a
 * render that asks twelve times computes once. Frozen state is what makes that
 * safe: the event cannot change under the memo without going through `commit`.
 *
 * @returns {import('./validate.js').Finding[]} empty when no event is loaded
 */
export function findings() {
  return event ? checkedNow().list : [];
}

/**
 * [v12] The findings about one row — what a row asks to mark itself in place.
 *
 * @param {string} rowId
 * @returns {import('./validate.js').Finding[]} empty when there are none
 */
export function findingsFor(rowId) {
  if (!event || !rowId) return [];
  return checkedNow().byRow.get(rowId) || [];
}

/**
 * [v12] The findings belonging to one area — what the navigator marks.
 *
 * @param {string} area see `AREAS` in validate.js
 * @returns {import('./validate.js').Finding[]} empty when there are none
 */
export function findingsIn(area) {
  if (!event || !area) return [];
  return checkedNow().byArea.get(area) || [];
}

/** The memo, filled on demand. */
function checkedNow() {
  if (!checked) {
    // Frozen for the same reason the event is: these arrays are handed to every
    // row in every editor, and one caller sorting the list in place would
    // reorder it for everybody who asked after them. `filter` still works;
    // `sort` and `reverse` throw at the line that wrote them.
    const list = Object.freeze(validateEvent(event));
    const byRow = findingsByRow(list);
    const byArea = findingsByArea(list);
    for (const bucket of byRow.values()) Object.freeze(bucket);
    for (const bucket of byArea.values()) Object.freeze(bucket);
    checked = { list, byRow, byArea };
  }
  return checked;
}

/**
 * Listen for event changes.
 * @param {(event: object|null) => void} listener called immediately with the current event
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  subscribers.add(listener);
  listener(event);
  return () => subscribers.delete(listener);
}

function notify() {
  for (const listener of subscribers) {
    try {
      listener(event);
    } catch (err) {
      // A broken listener must not stop the others.
      console.error('Subscriber failed:', err);
    }
  }
}

/**
 * A new event in the shape of BUILD-SPEC §5.
 *
 * [v6] Seeded with the six sections nearly every private-side order uses
 * (§4, §5 v6 changes) rather than opening on a blank outline. They are ordinary
 * sections from the moment they exist: renamed, reordered, disabled, and
 * removed like any other, so an event that wants none of them discards them.
 *
 * Only *new* events are seeded. A loaded file keeps the outline it was saved
 * with, empty included — `migrate()` adds nothing, because a file saved with no
 * sections was authored that way.
 *
 * @returns {object}
 */
export function emptyEvent() {
  return {
    meta: {
      eventName: '',
      startDate: '',
      endDate: '',
      eventLead: '',
      revisionDate: '',
      revisedBy: '',
      // [v8] Written explicitly rather than left absent, so the field the meta
      // editor writes to already exists and Save round-trips it. `brandFor`
      // would resolve an absent id to the same brand either way (§6).
      brandId: DEFAULT_BRAND_ID,
      // [v9] Both false: the Menu and the Rooming Assignment are their own
      // documents, and an order that also carries them is the exception (§5).
      includeInOrder: { rooming: false, menu: false },
      // [v12] When this event was last edited (§5 [v12]). Empty until the first
      // write, which is the truth: a new event has not been edited. §12.11
      // stays quiet on an empty one rather than guessing.
      touchedAt: ''
    },
    sections: defaultSections(),
    attendees: [],
    rooming: [],
    schedule: [],
    foodAndBev: [],
    menu: [],
    staff: [],
    departments: [],
    buildingsInUse: [],
    // [v9] The buildings held back in case the party grows, named on the order
    // beside the ones in use (§5, §8 A).
    overflowBuildings: [],
    // [v10] The dates already offered meals and itinerary rows (§5, v10
    // changes). Empty on a new event, which has no dates yet; seeding fills it
    // the moment they are set.
    seeded: { meals: [], itinerary: [] },
    // [v10] The event's copy of the activity list, so a custom activity travels
    // with the file to another machine (§6 [v10]).
    customActivities: []
  };
}

// Autosave is a convenience layer over the same state, not a second store.
// Debounced in io.js, because the form writes per keystroke.
subscribe((current) => {
  if (current) scheduleAutosave(current);
});

function wireToolbar() {
  const fileInput = document.getElementById('file-input');

  // [v13] §10 — New is the way into a real order, so it asks nothing when there
  // is nothing to discard. An untouched order is not work in progress.
  document.getElementById('btn-new').addEventListener('click', () => {
    if (hasWork(event)
      && !window.confirm('Discard the event in progress and start a new one?')) return;
    clearAutosave();
    setEvent(emptyEvent(), null, 'new');
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    try {
      const { event: loaded, summary } = await loadFromFile(file);
      setEvent(loaded, summary, 'file');
    } catch (err) {
      window.alert(err.message);
    } finally {
      // Reset so re-selecting the same file fires `change` again.
      fileInput.value = '';
    }
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    if (!event) return;
    saveToFile(event);
  });

  // [v13] §10 — the sample is a sample. It replaces the whole event, and a
  // coordinator halfway through a real order is asked first; the button that
  // does not ask is New, one along.
  document.getElementById('btn-sample').addEventListener('click', async () => {
    if (hasWork(event)
      && !window.confirm('Replace the event in progress with the sample event?')) return;
    try {
      const { event: sample, summary } = await loadSample();
      setEvent(sample, summary, 'sample');
    } catch (err) {
      window.alert(err.message);
    }
  });
}

/**
 * The autosave is debounced, so a tab that closes mid-pause would otherwise
 * lose the last edit. `visibilitychange` to hidden is the reliable signal on
 * mobile; `pagehide` covers desktop navigation away and the back/forward cache.
 */
function wireAutosaveFlush() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutosave();
  });
  window.addEventListener('pagehide', () => {
    flushAutosave();
  });
}

/**
 * Restore the autosave if there is one, otherwise start empty.
 *
 * Deliberately not the sample: opening the tool onto fixture data invites
 * typing over it, and a real document could ship with leftover Illig Party rows
 * in a section nobody scrolled to. The sample stays behind its own button.
 *
 * [v13] The two paths are told apart by their origin rather than by what they
 * hold, because the interface does different things with them: a new order
 * opens on the date fields (§10 [v13]), and a restored autosave opens exactly
 * where it was left, caret included.
 */
async function init() {
  wireToolbar();
  wireAutosaveFlush();

  const restored = restoreAutosave();
  if (restored) {
    setEvent(restored.event, restored.summary, 'autosave');
    return;
  }
  setEvent(emptyEvent(), null, 'new');
}

init();
