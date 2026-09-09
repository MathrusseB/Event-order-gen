// Application state and shell — BUILD-SPEC §11.
//
// Holds the in-memory event object and nothing else. Later segments read it
// through `getEvent()`, write it through `setEvent()`, and react through
// `subscribe()`. Nothing here renders.

import {
  loadFromFile,
  saveToFile,
  autosave,
  restoreAutosave,
  clearAutosave,
  loadSample
} from './io.js';

/** The one in-memory event. Null until `init()` settles. */
let event = null;

/** Change listeners, called with the current event after every `setEvent`. */
const subscribers = new Set();

/**
 * The event currently loaded.
 * @returns {object|null}
 */
export function getEvent() {
  return event;
}

/**
 * Replace the event and notify subscribers.
 * @param {object} next
 */
export function setEvent(next) {
  event = next;
  notify();
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
subscribe((current) => {
  if (current) autosave(current);
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
      setEvent(await loadFromFile(file));
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
      setEvent(await loadSample());
    } catch (err) {
      window.alert(err.message);
    }
  });
}

/** Restore the autosave if there is one, otherwise load the sample. */
async function init() {
  wireToolbar();

  const restored = restoreAutosave();
  if (restored) {
    setEvent(restored);
    return;
  }

  try {
    setEvent(await loadSample());
  } catch (err) {
    console.error(err);
    setEvent(emptyEvent());
  }
}

init();
