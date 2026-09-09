// Stand-in for the section editors that arrive in the next build — rooming,
// schedule, food and beverage, menu, staff, and departments.
//
// Four of those are in the seeded section set (BUILD-SPEC §4 [v6]) and one more
// is in the sample file, so this is what a new event mostly shows on first
// open. It has one job beyond holding the space: say plainly that the editor is
// not built, and prove the section's data is intact by counting it. Loading the
// sample and finding an empty-looking Rooming section would read as data loss.

import { el, setText } from '../dom.js';
import { typeInfo } from '../sections.js';

/**
 * A placeholder editor for a section type this build cannot edit yet.
 *
 * @param {object} section
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createPlaceholderEditor(section) {
  const info = typeInfo(section.type);

  const message = el('p', {
    class: 'placeholder__message',
    text: `The ${info.label.toLowerCase()} editor is not built yet.`
  });
  const detail = el('p', { class: 'placeholder__detail' });

  const node = el('div', { class: 'editor editor--placeholder' }, [message, detail]);

  return {
    node,
    update(event, current) {
      const key = typeInfo(current.type).dataKey;
      const rows = key && Array.isArray(event[key]) ? event[key] : [];
      const noun = typeInfo(current.type).noun || 'rows';
      setText(
        detail,
        rows.length
          ? `This file already holds ${rows.length} ${rows.length === 1 ? noun.replace(/s$/, '') : noun}.`
            + ' They are kept exactly as they are, and the section prints once the editor lands.'
          : 'The section is kept in the file and prints once the editor lands. Nothing is in it yet.'
      );
    }
  };
}
