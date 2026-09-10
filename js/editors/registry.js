// Section type -> editor. The one place the shell learns what can edit what.
//
// Every editor honours the same contract:
//
//   create(section) -> { node, update(event, section) }
//
// `create` runs once per section, `update` on every change. An editor that
// rebuilds its markup inside `update` breaks focus — see the note at the top of
// dom.js.
//
// [v7] Every section type in §4 now has one, so there is no placeholder to fall
// back to any more. What is left below is not that placeholder: it is the case
// of a *file* naming a type this build has never heard of, which is a
// hand-edited file or one written by a later version, and the only wrong answer
// there is to throw and take the whole form down with it. The section keeps its
// place, its title and its data, and says what it is.
//
// Rooming and Menu are deliberately absent. [v7] they are not section types —
// each is its own document (§4, §8) — and the shell mounts their editors
// itself, beside the outline rather than in it.

import { el, setText } from '../dom.js';
import { createDepartmentsEditor } from './departments.js';
import { createFoodAndBevEditor } from './foodandbev.js';
import { createFreeTextEditor } from './freetext.js';
import { createGuestsEditor } from './guests.js';
import { createScheduleEditor } from './schedule.js';
import { createStaffEditor } from './staff.js';

const EDITORS = {
  departments: createDepartmentsEditor,
  foodAndBev: createFoodAndBevEditor,
  freeText: createFreeTextEditor,
  // [v9] One editor where `attendees` and `accommodations` were two. The
  // attendee rows are the same rows, mounted by the guests editor.
  guests: createGuestsEditor,
  schedule: createScheduleEditor,
  staff: createStaffEditor
};

/**
 * The editor factory for a section type.
 *
 * @param {string} type
 * @returns {(section: object) => {node: HTMLElement, update: Function}}
 */
export function editorFor(type) {
  return EDITORS[type] || createUnknownTypeEditor;
}

/**
 * Whether this build knows the type at all. The shell marks the section in the
 * navigator with it, so an unknown type is visible from the outline rather than
 * found by scrolling.
 *
 * @param {string} type
 * @returns {boolean}
 */
export function hasEditor(type) {
  return Object.hasOwn(EDITORS, type);
}

/**
 * A section whose `type` this build does not know.
 *
 * Nothing is thrown, nothing is dropped, and nothing is rewritten: the section
 * stays in the file exactly as it arrived, and the user is told plainly why
 * there is nothing to type into.
 *
 * @param {object} section
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
function createUnknownTypeEditor(section) {
  const message = el('p', { class: 'unknown__message' });
  const detail = el('p', {
    class: 'unknown__detail',
    text: 'This build has no editor for that type. The section and anything it refers to are kept '
      + 'in the file untouched, and saving will not change them. Delete the section if it does not '
      + 'belong to this order.'
  });
  const node = el('div', { class: 'editor editor--unknown' }, [message, detail]);

  return {
    node,
    update(event, current) {
      const type = String((current && current.type) || (section && section.type) || 'unknown');
      setText(message, `This section is of type "${type}".`);
    }
  };
}
