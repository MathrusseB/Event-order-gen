// The section system — BUILD-SPEC §4.
//
// An event order is an ordered array of sections. This module owns the model:
// what types exist, what a new event starts with, and every add, rename,
// enable, reorder, and remove. The operations take a *draft* — the mutable
// clone `update()` hands out in app.js — and mutate it in place. They never
// import app.js, so they stay callable from a test, from the shell, and later
// from rooming.js.
//
// One rule worth stating outright, because the word "delete" hides it:
// removing a section removes the section, not the data behind it. A `rooming`
// section deleted from the outline leaves `rooming[]` in the file untouched,
// and adding the section back shows the same rows. Only `freeText` carries its
// own content — `body` lives on the section object — so only `freeText` loses
// anything when it goes. The confirmation the shell raises says which case it
// is, because the user cannot be expected to know.

import { newId } from './ids.js';
import { SECTION_TYPES } from './reference.js';

/**
 * What each section type is called, where its content lives, and whether it may
 * appear more than once. BUILD-SPEC §4.
 *
 * `label` names the type in the interface; `defaultTitle` is what a new section
 * of that type is called before the user renames it, and matches the titles in
 * the §4 example. `dataKey` is the event array the section renders — null for
 * `freeText`, which holds its own `body`. `noun` names those rows in a sentence.
 */
export const SECTION_TYPE_INFO = {
  attendees: {
    label: 'Attendee list',
    defaultTitle: 'Attendee List',
    dataKey: 'attendees',
    noun: 'guests',
    repeatable: false
  },
  rooming: {
    label: 'Rooming',
    defaultTitle: 'Rooming Assignments',
    dataKey: 'rooming',
    noun: 'room assignments',
    repeatable: false
  },
  schedule: {
    label: 'Schedule',
    defaultTitle: 'Event Schedule',
    dataKey: 'schedule',
    noun: 'schedule entries',
    repeatable: false
  },
  foodAndBev: {
    label: 'Food and beverage',
    defaultTitle: 'Food & Beverage',
    dataKey: 'foodAndBev',
    noun: 'meal services',
    repeatable: false
  },
  menu: {
    label: 'Menu',
    defaultTitle: 'Menu',
    dataKey: 'menu',
    noun: 'menu blocks',
    repeatable: false
  },
  staff: {
    label: 'Staff',
    defaultTitle: 'Staff Assignments',
    dataKey: 'staff',
    noun: 'staff assignments',
    repeatable: false
  },
  departments: {
    label: 'Departments',
    defaultTitle: 'Department Breakdown',
    dataKey: 'departments',
    noun: 'department blocks',
    repeatable: false
  },
  freeText: {
    label: 'Free text',
    defaultTitle: 'Notes',
    dataKey: null,
    noun: null,
    repeatable: true
  }
};

/**
 * [v6] The sections a new event starts with. BUILD-SPEC §4, §5 (v6 changes).
 *
 * The six nearly every private-side order uses. Staff and departments are
 * deliberately absent: they are the exception, and an outline that lists
 * sections the event will not use is noise the coordinator has to clear before
 * starting.
 */
export const SEEDED_SECTION_TYPES = [
  'attendees',
  'rooming',
  'schedule',
  'foodAndBev',
  'menu',
  'freeText'
];

/**
 * Section types in the order they are offered.
 * @returns {string[]}
 */
export function sectionTypes() {
  return SECTION_TYPES.filter((type) => Object.hasOwn(SECTION_TYPE_INFO, type));
}

/**
 * Type metadata, with a usable shape for a type this build does not know.
 * @param {string} type
 * @returns {{label: string, defaultTitle: string, dataKey: string|null, noun: string|null, repeatable: boolean}}
 */
export function typeInfo(type) {
  return SECTION_TYPE_INFO[type] || {
    label: String(type || 'Section'),
    defaultTitle: String(type || 'Section'),
    dataKey: null,
    noun: null,
    repeatable: true
  };
}

/**
 * A new section, with a fresh opaque id. `freeText` gets an empty `body`;
 * the others draw their content from the event arrays and carry none.
 *
 * @param {string} type
 * @param {string} [title] defaults to the type's own title
 * @returns {object}
 */
export function makeSection(type, title) {
  const info = typeInfo(type);
  const section = {
    id: newId(),
    type,
    title: title || info.defaultTitle,
    enabled: true
  };
  if (type === 'freeText') section.body = '';
  return section;
}

/**
 * [v6] The seeded section set, with fresh ids. BUILD-SPEC §4.
 * @returns {object[]}
 */
export function defaultSections() {
  return SEEDED_SECTION_TYPES.map((type) => makeSection(type));
}

/**
 * The sections of an event, always an array.
 * @param {object} event
 * @returns {object[]}
 */
export function sectionsOf(event) {
  const sections = event && event.sections;
  return Array.isArray(sections) ? sections : [];
}

/**
 * A section by id.
 * @param {object} event
 * @param {string} id
 * @returns {object|null}
 */
export function sectionById(event, id) {
  return sectionsOf(event).find((section) => section && section.id === id) || null;
}

/**
 * Types the user may add right now. BUILD-SPEC §4: `freeText` is unlimited,
 * every other type appears once, so a type already in the outline is not
 * offered again.
 *
 * @param {object} event
 * @returns {string[]}
 */
export function availableTypes(event) {
  const used = new Set(sectionsOf(event).map((section) => section && section.type));
  return sectionTypes().filter((type) => typeInfo(type).repeatable || !used.has(type));
}

/** The draft's sections array, created if the file arrived without one. */
function draftSections(draft) {
  if (!Array.isArray(draft.sections)) draft.sections = [];
  return draft.sections;
}

/**
 * Append a section. Refuses a second copy of a non-repeatable type, so a stale
 * menu cannot add one behind the interface's back.
 *
 * @param {object} draft
 * @param {string} type
 * @param {string} [title]
 * @returns {string|null} the new section's id, or null if it was refused
 */
export function addSection(draft, type, title) {
  const sections = draftSections(draft);
  if (!typeInfo(type).repeatable && sections.some((section) => section && section.type === type)) {
    return null;
  }
  const section = makeSection(type, title);
  sections.push(section);
  return section.id;
}

/**
 * Remove a section from the outline. Content in the event arrays is left alone
 * — see the note at the top of this module.
 *
 * @param {object} draft
 * @param {string} id
 */
export function removeSection(draft, id) {
  const sections = draftSections(draft);
  const index = sections.findIndex((section) => section && section.id === id);
  if (index >= 0) sections.splice(index, 1);
}

/**
 * Move a section by one place. Silently does nothing at either end, so a
 * held-down button cannot walk a row off the list.
 *
 * @param {object} draft
 * @param {string} id
 * @param {number} delta -1 up, 1 down
 */
export function moveSection(draft, id, delta) {
  const sections = draftSections(draft);
  const from = sections.findIndex((section) => section && section.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sections.length) return;
  const [moved] = sections.splice(from, 1);
  sections.splice(to, 0, moved);
}

/**
 * Rename a section. The title is user-facing and free (BUILD-SPEC §4) — it is
 * stored exactly as typed, trailing spaces and all, because trimming while
 * someone is mid-word deletes the space they just pressed.
 *
 * @param {object} draft
 * @param {string} id
 * @param {string} title
 */
export function setSectionTitle(draft, id, title) {
  const section = sectionById(draft, id);
  if (section) section.title = title;
}

/**
 * Enable or disable a section. BUILD-SPEC §4: `enabled: false` keeps the
 * content and omits it from the render — never delete to hide.
 *
 * @param {object} draft
 * @param {string} id
 * @param {boolean} enabled
 */
export function setSectionEnabled(draft, id, enabled) {
  const section = sectionById(draft, id);
  if (section) section.enabled = Boolean(enabled);
}

/**
 * Set a `freeText` section's body.
 * @param {object} draft
 * @param {string} id
 * @param {string} body
 */
export function setSectionBody(draft, id, body) {
  const section = sectionById(draft, id);
  if (section) section.body = body;
}

/**
 * What a section is holding, for the delete confirmation.
 *
 * `destroys` is the part that matters: true only when the content lives on the
 * section itself and would go with it. Everything else is a detach — the rows
 * stay in the file and come back with the section.
 *
 * @param {object} event
 * @param {object} section
 * @returns {{count: number, noun: string, destroys: boolean}}
 */
export function sectionContent(event, section) {
  if (!section) return { count: 0, noun: '', destroys: false };

  if (section.type === 'freeText') {
    const body = String(section.body || '');
    return { count: body.length, noun: 'characters of text', destroys: true };
  }

  const info = typeInfo(section.type);
  const rows = info.dataKey && Array.isArray(event[info.dataKey]) ? event[info.dataKey] : [];
  return { count: rows.length, noun: info.noun || 'rows', destroys: false };
}

/**
 * The confirmation for deleting a section — the sentence, not the dialog.
 *
 * Empty sections still ask: the button sits beside a rename field, and an
 * outline is cheap to rebuild but annoying to rebuild by surprise.
 *
 * @param {object} event
 * @param {object} section
 * @returns {string}
 */
export function deleteSectionPrompt(event, section) {
  const title = String((section && section.title) || 'this section').trim() || 'this section';
  const { count, noun, destroys } = sectionContent(event, section);

  if (destroys && count > 0) {
    return `Delete "${title}"? Its text goes with it — ${count} characters, and there is no undo. `
      + 'To keep the text but leave it off the printed order, turn off "Include in the order" instead.';
  }
  if (count > 0) {
    return `Remove "${title}" from this order? The ${count} ${noun} stay in the file and come back `
      + 'if you add the section again. To keep it in the file but off the printed order, turn off '
      + '"Include in the order" instead.';
  }
  return `Remove "${title}" from this order? It is empty, and you can add it back at any time.`;
}
