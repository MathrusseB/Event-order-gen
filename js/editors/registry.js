// Section type -> editor. The one place the shell learns what can edit what.
//
// Adding an editor in the next segment is a line here and a module beside this
// one; nothing in shell.js changes. Every editor honours the same contract:
//
//   create(section) -> { node, update(event, section) }
//
// `create` runs once per section, `update` on every change. An editor that
// rebuilds its markup inside `update` breaks focus — see the note at the top of
// dom.js.

import { createAttendeesEditor } from './attendees.js';
import { createFreeTextEditor } from './freetext.js';
import { createPlaceholderEditor } from './placeholder.js';

const EDITORS = {
  attendees: createAttendeesEditor,
  freeText: createFreeTextEditor
};

/**
 * The editor factory for a section type, or the placeholder for a type this
 * build cannot edit yet.
 *
 * @param {string} type
 * @returns {(section: object) => {node: HTMLElement, update: Function}}
 */
export function editorFor(type) {
  return EDITORS[type] || createPlaceholderEditor;
}

/**
 * Whether a real editor exists for a type. The shell uses it to mark the
 * section in the navigator rather than letting the user find out by scrolling.
 *
 * @param {string} type
 * @returns {boolean}
 */
export function hasEditor(type) {
  return Object.hasOwn(EDITORS, type);
}
