// Row operations shared by the list editors — BUILD-SPEC §5 [v7].
//
// Every list editor does the same four things to an array of rows: find one by
// id, write one field of one row, move a row a place, and remove a row. They
// were written out once per editor in the first two editors; from six editors
// on that is six copies of the same four functions and six chances for one of
// them to close over an index instead of an id.
//
// The rule those functions exist to hold: **a row is addressed by its `id`,
// never by its position.** [v7] gives every row the form creates an opaque id
// (§5, v7 changes) for exactly this reason — rows are added, deleted and
// reordered, and a handler bound to an index edits the wrong row the moment a
// row above it moves.
//
// The draft helpers take the mutable draft `update()` hands out (see the write
// convention at the top of app.js); `fieldWriter` wraps that call so an editor
// writes `write(id, 'label', value)` and cannot accidentally write anywhere
// else.

import { update } from '../app.js';

/**
 * A draft's array under `key`, created if the file arrived without one.
 *
 * Every editor has to survive a hand-edited file that is missing its array
 * outright, and a missing array is not an error — it is an event nobody has
 * put anything in yet.
 *
 * @param {object} container the draft, or any object holding the array
 * @param {string} key
 * @returns {object[]}
 */
export function draftList(container, key) {
  if (!Array.isArray(container[key])) container[key] = [];
  return container[key];
}

/**
 * The row carrying `id`, or null.
 * @param {object[]} list
 * @param {string} id
 * @returns {object|null}
 */
export function rowById(list, id) {
  if (!Array.isArray(list) || !id) return null;
  return list.find((row) => row && row.id === id) || null;
}

/**
 * The position of the row carrying `id`, or -1.
 * @param {object[]} list
 * @param {string} id
 * @returns {number}
 */
export function rowIndex(list, id) {
  if (!Array.isArray(list) || !id) return -1;
  return list.findIndex((row) => row && row.id === id);
}

/**
 * A writer for one field of one row of one event array.
 *
 * @param {string} key the event array — `schedule`, `foodAndBev`, `staff`, ...
 * @returns {(id: string, field: string, value: *) => void}
 */
export function fieldWriter(key) {
  return function write(id, field, value) {
    update((draft) => {
      const row = rowById(draftList(draft, key), id);
      if (row) row[field] = value;
    });
  };
}

/**
 * Move a row one place within an array in place. Silently does nothing at
 * either end, so a held-down button cannot walk a row off the list.
 *
 * @param {object[]} list
 * @param {string} id
 * @param {number} delta -1 up, 1 down
 */
export function moveRow(list, id, delta) {
  const from = rowIndex(list, id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
}

/**
 * Remove a row by id, in place.
 * @param {object[]} list
 * @param {string} id
 */
export function removeRow(list, id) {
  const index = rowIndex(list, id);
  if (index >= 0) list.splice(index, 1);
}

/**
 * Move an entry of a plain array one place, in place — the string lists inside
 * a department block and a menu course, which have no ids of their own because
 * §5 stores them as arrays of strings.
 *
 * The caller is responsible for moving focus to the destination index
 * afterwards: an index is all these have, so the node the finger is on holds a
 * different string after the move.
 *
 * @param {*[]} list
 * @param {number} index
 * @param {number} delta
 * @returns {number} the index the entry landed on, or the original index when
 *   the move was refused
 */
export function moveAt(list, index, delta) {
  const to = index + delta;
  if (!Array.isArray(list) || index < 0 || index >= list.length) return index;
  if (to < 0 || to >= list.length) return index;
  const [moved] = list.splice(index, 1);
  list.splice(to, 0, moved);
  return to;
}
