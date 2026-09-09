// Application state and shell — BUILD-SPEC §11.
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
 * [v4] What `migrate()` did to the event currently loaded, or null for one this
 * session created. Held beside the event rather than inside it: it describes
 * the file that was opened, not the document being authored, and must never
 * ride along into the saved JSON.
 */
let lastMigration = null;

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
 */
export function setEvent(next, migrationSummary = null) {
  lastMigration = migrationSummary;
  commit(structuredClone(next));
}

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
  commit(returned === undefined || returned === draft ? draft : structuredClone(returned));
  return event;
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
 * An empty event in the shape of BUILD-SPEC §5. No sections: the section
 * builder adds them.
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
      revisedBy: ''
    },
    sections: [],
    attendees: [],
    rooming: [],
    schedule: [],
    foodAndBev: [],
    menu: [],
    staff: [],
    departments: [],
    buildingsInUse: []
  };
}

// Autosave is a convenience layer over the same state, not a second store.
// Debounced in io.js, because the form writes per keystroke.
subscribe((current) => {
  if (current) scheduleAutosave(current);
});

function wireToolbar() {
  const fileInput = document.getElementById('file-input');

  document.getElementById('btn-new').addEventListener('click', () => {
    if (event && !window.confirm('Discard the event in progress and start a new one?')) return;
    clearAutosave();
    setEvent(emptyEvent());
  });

  document.getElementById('btn-load').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    try {
      const { event: loaded, summary } = await loadFromFile(file);
      setEvent(loaded, summary);
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

  document.getElementById('btn-sample').addEventListener('click', async () => {
    try {
      const { event: sample, summary } = await loadSample();
      setEvent(sample, summary);
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
 * in a section nobody scrolled to. The sample stays behind the Load Sample button.
 */
async function init() {
  wireToolbar();
  wireAutosaveFlush();

  const restored = restoreAutosave();
  if (restored) {
    setEvent(restored.event, restored.summary);
    return;
  }
  setEvent(emptyEvent());
}

init();
