// Free text editor — BUILD-SPEC §4, `freeText` sections.
//
// Security notes, PSO notes, weather, transportation: anything the schema does
// not anticipate. §4 is explicit — no character limits, no fixed row counts,
// textareas auto-grow — so there is no counter, no cap, and no scrollbar. The
// field is as tall as what is in it.
//
// The section's title is edited in the block header alongside every other
// section's, not duplicated here. One title field per section, in the same
// place for every type.

import { update } from '../app.js';
import { setSectionBody } from '../sections.js';
import { autoGrow, el, setValue } from '../dom.js';

/**
 * The free text editor for one section.
 *
 * @param {object} section the section this editor is mounted for
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createFreeTextEditor(section) {
  const id = section.id;

  const textarea = el('textarea', {
    class: 'input textarea',
    rows: '3',
    'data-field': 'body',
    spellcheck: 'true',
    placeholder: 'Type the note as it should read on the printed order.'
  });

  textarea.addEventListener('input', () => {
    autoGrow(textarea);
    update((draft) => {
      setSectionBody(draft, id, textarea.value);
    });
  });

  const node = el('div', { class: 'editor editor--text' }, [
    el('label', { class: 'field field--block' }, [
      el('span', { class: 'field__label sr-only', text: 'Section text' }),
      textarea
    ])
  ]);

  return {
    node,
    update(event, current) {
      // Line breaks are stored exactly as typed and the render prints them as
      // written (BUILD-SPEC §4) — nothing here normalises whitespace.
      setValue(textarea, (current && current.body) || '');
      autoGrow(textarea);
    }
  };
}
