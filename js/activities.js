// The itinerary's activity list — BUILD-SPEC §6 [v10].
//
// Six options in the editor: five the ranch runs — Early Arrivals, Guest
// Arrivals, Duck Hunting, Hunting, Late-Night Wheel Use — and Other, which
// takes free text and can be added to the list for good.
//
// WHERE A CUSTOM ACTIVITY LIVES, and why it is in two places at once. It
// outlives the event it was typed into: somebody who runs a sporting clays
// morning once will run it again next season, and retyping it every event is
// the thing the list exists to stop. So it cannot live only in the event.
//
//   * `localStorage`, under a key of its own — not the autosave, which holds
//     one event and is overwritten by the next one. This is what makes the
//     activity survive to the next event on the same machine.
//   * the saved event JSON, in `customActivities[]` — which is what carries it
//     to another machine, or to the same machine after the browser has been
//     cleared. The file is the source of truth for everything else (§3) and
//     there is no reason for this to be the exception.
//
// Both are merged on load, deduplicating case-insensitively, so the same
// activity added on two machines converges to one entry with whichever spelling
// was seen first rather than to "Sporting Clays" and "sporting clays".
//
// Removing a custom activity takes it off the list and off the current event's
// copy. It touches no event that used it: a schedule row holds the words
// themselves, not a reference, so an itinerary that says "Sporting Clays" goes
// on saying it after the suggestion is gone. That is the whole reason the rows
// store text rather than an id.
//
// Storage failure is not an error here. Private mode, a full quota, storage
// switched off — the list falls back to the built-ins and the event's own copy,
// and the app carries on.

/** The one key. Separate from `event-order-gen:autosave` on purpose. */
const STORAGE_KEY = 'event-order-gen:activities';

/** The activities the ranch runs. BUILD-SPEC §6 [v10]. */
export const BUILT_IN_ACTIVITIES = [
  'Early Arrivals',
  'Guest Arrivals',
  'Duck Hunting',
  'Hunting',
  'Late-Night Wheel Use'
];

/** The select's escape hatch. Not an activity — a value the control uses. */
export const OTHER_ACTIVITY = '__other__';

/** Comparison key: trimmed, inner whitespace collapsed, cased down. */
function key(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Clean a typed activity. Empty means "nothing was typed". */
function tidy(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

/** Read the custom list. Never throws; an unreadable store is an empty list. */
export function storedActivities() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(tidy).filter(Boolean) : [];
  } catch (err) {
    return [];
  }
}

/** Write the custom list. Silent when storage is unavailable. */
function writeStored(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Merge lists, keeping the first spelling of each and the given order.
 *
 * @param {...string[]} lists
 * @returns {string[]}
 */
function merge(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const entry of Array.isArray(list) ? list : []) {
      const name = tidy(entry);
      if (!name || seen.has(key(name))) continue;
      seen.add(key(name));
      out.push(name);
    }
  }
  return out;
}

/**
 * The custom activities on this machine and in this event, merged.
 *
 * Built-ins are not included: the caller shows those first and this second, so
 * that the five the ranch runs stay in their own order at the top of the list
 * however many customs accumulate under them.
 *
 * @param {object} event
 * @returns {string[]}
 */
export function customActivities(event) {
  const own = (event && Array.isArray(event.customActivities)) ? event.customActivities : [];
  const merged = merge(storedActivities(), own);
  // Built-ins never appear twice: somebody typing "hunting" as an Other and
  // adding it should not produce a second Hunting under the first.
  const builtIn = new Set(BUILT_IN_ACTIVITIES.map(key));
  return merged.filter((name) => !builtIn.has(key(name)));
}

/**
 * Every activity the select offers, in order: the built-ins, then the customs.
 *
 * @param {object} event
 * @returns {string[]}
 */
export function activityOptions(event) {
  return [...BUILT_IN_ACTIVITIES, ...customActivities(event)];
}

/**
 * Whether a name is already on the list — the test behind "Add to the list",
 * which should not offer to add something that is on it.
 *
 * @param {object} event
 * @param {string} name
 * @returns {boolean}
 */
export function isKnownActivity(event, name) {
  const wanted = key(name);
  if (!wanted) return true;
  return activityOptions(event).some((entry) => key(entry) === wanted);
}

/**
 * Add a custom activity to this machine's list, and hand back the list to write
 * into the event so it travels with the file.
 *
 * @param {object} event
 * @param {string} name
 * @returns {string[]|null} the event's new `customActivities`, or null when
 *   there was nothing to add
 */
export function rememberActivity(event, name) {
  const tidied = tidy(name);
  if (!tidied || isKnownActivity(event, tidied)) return null;
  const next = merge(storedActivities(), [tidied]);
  writeStored(next);
  return merge(customActivities(event), [tidied]);
}

/**
 * Take a custom activity off this machine's list, and hand back the list to
 * write into the event.
 *
 * Nothing in any event's `schedule[]` is touched: those rows carry the words.
 *
 * @param {object} event
 * @param {string} name
 * @returns {string[]} the event's new `customActivities`
 */
export function forgetActivity(event, name) {
  const gone = key(name);
  writeStored(storedActivities().filter((entry) => key(entry) !== gone));
  return customActivities(event).filter((entry) => key(entry) !== gone);
}

/**
 * Take an inbound event's activities into this machine's list. Called on every
 * load (io.js), which is the "merge both on load" half of §6 [v10].
 *
 * @param {object} event
 */
export function absorbActivities(event) {
  const own = (event && Array.isArray(event.customActivities)) ? event.customActivities : [];
  if (!own.length) return;
  const builtIn = new Set(BUILT_IN_ACTIVITIES.map(key));
  writeStored(merge(storedActivities(), own).filter((name) => !builtIn.has(key(name))));
}
