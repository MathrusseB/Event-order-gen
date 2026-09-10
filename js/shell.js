// The application frame — BUILD-SPEC §11.
//
// Header, section navigator, and the column of editors. This module owns the
// layout and the section builder's controls (§4: add, rename, enable, reorder,
// remove); the section model itself lives in sections.js and the per-type
// editors in js/editors/.
//
// [v8] The three document destinations (§8) are views.js. They sit beside the
// editors rather than inside them: a document is not a section, and the switch
// between editing and previewing is about the frame, not about the outline.
//
// Loaded as its own module script after app.js. It imports app.js, so app.js is
// evaluated first whatever order the tags are in, and the import graph stays
// acyclic: app.js knows nothing about the interface, and the interface reaches
// state only through `getEvent()`, `update()`, and `subscribe()`.
//
// Reordering is by buttons, not by drag. A drag-and-drop reorder that works
// reliably under a thumb, on a tablet, while scrolling, without a library, is
// not a thing this can promise — and the one place this tool gets used standing
// up is the one place a dropped drag costs the most. Move up and move down are
// dull, they are unambiguous, they work with a keyboard, and they keep focus on
// the control that was pressed.

import { getEvent, subscribe, update } from './app.js';
import {
  SEEDED_SECTION_TYPES,
  addSection,
  availableTypes,
  deleteSectionPrompt,
  moveSection,
  removeSection,
  sectionsOf,
  setSectionEnabled,
  setSectionTitle,
  typeInfo
} from './sections.js';
import { mountViews } from './views.js';
import { createMetaEditor } from './editors/meta.js';
import { createMenuEditor } from './editors/menu.js';
import { createRoomingEditor } from './editors/rooming.js';
import { createRoomingBoard } from './rooming.js';
import { editorFor, hasEditor } from './editors/registry.js';
import { formatDateRange } from './dates.js';
import {
  el,
  focusRowControl,
  prefersReducedMotion,
  reconcile,
  rowNode,
  setHidden,
  setText,
  setValue,
  toggleClass
} from './dom.js';

/**
 * The section types offered in the empty state, in seeded order.
 *
 * Taken from the seed rather than listed again, so the empty state and a new
 * event can never offer different sets. [v7] Rooming and Menu are not among
 * them: they are documents of their own (§4, §8), mounted below whatever the
 * outline holds.
 */
const QUICK_ADD = SEEDED_SECTION_TYPES;

const refs = {};
let addTypeSignature = '';

function grab() {
  refs.bar = document.getElementById('bar');
  refs.barName = document.getElementById('bar-name');
  refs.barDates = document.getElementById('bar-dates');
  refs.outline = document.getElementById('outline');
  refs.outlineToggle = document.getElementById('btn-outline');
  refs.outlineList = document.getElementById('outline-list');
  refs.addType = document.getElementById('add-type');
  refs.addButton = document.getElementById('btn-add-section');
  refs.metaBlock = document.getElementById('meta-block');
  refs.metaBody = document.getElementById('meta-body');
  refs.blocks = document.getElementById('section-blocks');
  refs.empty = document.getElementById('empty-state');
  refs.emptyQuick = document.getElementById('empty-quick');
  refs.roomingBody = document.getElementById('rooming-body');
  refs.menuBody = document.getElementById('menu-body');
  refs.viewNav = document.getElementById('view-nav');
  refs.printTarget = document.getElementById('print-target');
  refs.printButton = document.getElementById('btn-print');
  refs.workbench = document.getElementById('workbench');
  refs.previews = document.getElementById('previews');
}

/**
 * Keep `--bar-h` matched to the header's real height. The header is sticky and
 * the blocks scroll under it, so every `scroll-margin-top` and every sticky
 * offset below depends on this being true at whatever width the tablet is held.
 */
function trackBarHeight() {
  const set = () => {
    document.documentElement.style.setProperty('--bar-h', `${refs.bar.offsetHeight}px`);
  };
  set();
  if (typeof ResizeObserver === 'function') new ResizeObserver(set).observe(refs.bar);
  else window.addEventListener('resize', set);
}

/** The navigator is a sidebar when there is room and a disclosure when there is not. */
function wireOutlineToggle() {
  refs.outlineToggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('outline-open');
    refs.outlineToggle.setAttribute('aria-expanded', String(open));
  });
}

function closeOutlineOnNarrow() {
  if (!window.matchMedia('(min-width: 60rem)').matches) {
    document.body.classList.remove('outline-open');
    refs.outlineToggle.setAttribute('aria-expanded', 'false');
  }
}

/** Bring a block into view and put the caret in its title. */
function goToBlock(id) {
  goToNode(id === 'meta' ? refs.metaBlock : rowNode(refs.blocks, id));
}

/**
 * [v7] The document destinations — Rooming and Menu — which have no section id
 * because they are not sections. Wired from `data-goto` in the markup so the
 * navigator holds the list and this holds only the behaviour.
 */
function wireDocLinks() {
  for (const button of document.querySelectorAll('[data-goto]')) {
    button.addEventListener('click', () => goToNode(document.getElementById(button.dataset.goto)));
  }
}

function goToNode(node) {
  if (!node) return;
  closeOutlineOnNarrow();
  node.scrollIntoView({
    block: 'start',
    behavior: prefersReducedMotion() ? 'auto' : 'smooth'
  });
  const field = node.querySelector('[data-field="title"], .input');
  if (field) field.focus({ preventScroll: true });
}

/** Add a section and drop the caret into its title, ready to be renamed. */
function addAndFocus(type) {
  let created = null;
  update((draft) => {
    created = addSection(draft, type);
  });
  if (!created) return;
  const node = rowNode(refs.blocks, created);
  const title = node && node.querySelector('[data-field="title"]');
  if (title) {
    node.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    title.focus({ preventScroll: true });
    title.select();
  }
}

function wireAddSection() {
  refs.addButton.addEventListener('click', () => {
    const type = refs.addType.value;
    if (type) addAndFocus(type);
  });

  for (const type of QUICK_ADD) {
    const button = el('button', {
      type: 'button',
      class: 'btn',
      text: typeInfo(type).defaultTitle
    });
    button.addEventListener('click', () => addAndFocus(type));
    refs.emptyQuick.append(button);
  }

  const all = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    text: `Add all ${QUICK_ADD.length}`
  });
  all.addEventListener('click', () => {
    update((draft) => {
      for (const type of QUICK_ADD) addSection(draft, type);
    });
  });
  refs.emptyQuick.append(all);
}

/**
 * Rebuild the add-section menu only when the offered set actually changed —
 * replacing the options under an open select closes it.
 */
function syncAddMenu(event) {
  const types = availableTypes(event);
  const signature = types.join('|');
  if (signature === addTypeSignature) return;
  addTypeSignature = signature;

  const wanted = refs.addType.value;
  refs.addType.replaceChildren(...types.map((type) =>
    el('option', { value: type, text: typeInfo(type).label })));
  refs.addType.value = types.includes(wanted) ? wanted : (types[0] || '');
}

/* ---------------------------------------------------------------- navigator */

function createOutlineItem(item) {
  const index = el('span', { class: 'outline__index', 'aria-hidden': 'true' });
  const label = el('span', { class: 'outline__label' });
  const state = el('span', { class: 'outline__state' });
  const button = el('button', { type: 'button', class: 'outline__link' }, [index, label, state]);
  button.addEventListener('click', () => goToBlock(item.key));
  const node = el('li', { class: 'outline__item' }, [button]);

  return {
    node,
    update(current) {
      // The header is not a numbered section: it prints on every document.
      setText(index, current.kind === 'meta' ? '' : String(current.index + 1));
      setText(label, current.label);
      const off = current.kind === 'section' && !current.section.enabled;
      // [v7] Every type in §4 has an editor, so this is no longer "not built
      // yet" — it is a file naming a type this build has never heard of.
      const unknown = current.kind === 'section' && !hasEditor(current.section.type);
      setText(state, off ? 'Not printed' : (unknown ? 'Unknown type' : ''));
      setHidden(state, !off && !unknown);
      toggleClass(node, 'is-off', off);
      toggleClass(node, 'is-pending', unknown && !off);
      toggleClass(node, 'is-meta', current.kind === 'meta');
    }
  };
}

/* ------------------------------------------------------------- section block */

/** A section's header controls and the editor mounted beneath them. */
function createSectionBlock(section) {
  const id = section.id;
  const editor = editorFor(section.type)(section);

  const index = el('span', { class: 'block__index', 'aria-hidden': 'true' });

  const titleInput = el('input', {
    type: 'text',
    class: 'input input--title',
    'data-field': 'title',
    id: `title-${id}`,
    autocomplete: 'off',
    autocapitalize: 'words',
    placeholder: 'Section title'
  });
  titleInput.addEventListener('input', () => {
    update((draft) => setSectionTitle(draft, id, titleInput.value));
  });

  const enabledInput = el('input', { type: 'checkbox', class: 'check__box' });
  enabledInput.addEventListener('change', () => {
    update((draft) => setSectionEnabled(draft, id, enabledInput.checked));
  });

  // Namespaced, because a block contains rows that carry their own move and
  // delete controls. `focusRowControl` below looks the control up inside the
  // block, and an unqualified "up" would find whichever came first in the DOM.
  const moveUp = blockButton('section-up', 'Move section up', '↑');
  const moveDown = blockButton('section-down', 'Move section down', '↓');
  const remove = blockButton('section-remove', 'Delete section', '✕', 'btn--danger');

  moveUp.addEventListener('click', () => {
    update((draft) => moveSection(draft, id, -1));
    focusRowControl(refs.blocks, id, ['section-up', 'section-down']);
  });
  moveDown.addEventListener('click', () => {
    update((draft) => moveSection(draft, id, 1));
    focusRowControl(refs.blocks, id, ['section-down', 'section-up']);
  });
  remove.addEventListener('click', () => {
    const event = getEvent();
    const current = sectionsOf(event).find((row) => row && row.id === id);
    if (!current) return;
    if (!window.confirm(deleteSectionPrompt(event, current))) return;
    update((draft) => removeSection(draft, id));
  });

  const typeLabel = el('span', { class: 'block__type' });

  // The difference between disabled and deleted is not in the word, so it is
  // spelled out: the section stays, the content stays, the printed order does
  // not carry it. BUILD-SPEC §4 — never delete to hide.
  const badge = el('p', { class: 'block__badge', hidden: true }, [
    el('strong', { text: 'Kept, not printed.' }),
    el('span', {
      text: ' Everything in this section stays in the file. It is left out of the printed order '
        + 'until you turn it back on.'
    })
  ]);

  const node = el('section', { class: 'block', 'data-row': id, id: `block-${id}` }, [
    el('header', { class: 'block__head' }, [
      index,
      el('div', { class: 'block__naming' }, [
        el('label', { class: 'field', for: `title-${id}` }, [
          el('span', { class: 'field__label sr-only', text: 'Section title' }),
          titleInput
        ]),
        typeLabel
      ]),
      el('label', { class: 'check check--switch' }, [
        enabledInput,
        el('span', { class: 'check__label', text: 'Include in the order' })
      ]),
      el('div', { class: 'block__controls' }, [moveUp, moveDown, remove])
    ]),
    badge,
    el('div', { class: 'block__body' }, [editor.node])
  ]);

  return {
    node,
    update(event, current, position, total) {
      setText(index, String(position + 1));
      setValue(titleInput, current.title || '');
      setText(typeLabel, typeInfo(current.type).label);
      const enabled = current.enabled !== false;
      if (enabledInput.checked !== enabled) enabledInput.checked = enabled;
      toggleClass(node, 'block--off', !enabled);
      setHidden(badge, enabled);
      moveUp.disabled = position === 0;
      moveDown.disabled = position === total - 1;
      editor.update(event, current);
    }
  };
}

function blockButton(control, label, glyph, extraClass = '') {
  return el('button', {
    type: 'button',
    class: `btn btn--row ${extraClass}`.trim(),
    'data-control': control,
    'aria-label': label,
    title: label
  }, [
    el('span', { class: 'btn__glyph', 'aria-hidden': 'true', text: glyph }),
    el('span', { class: 'btn__text', 'aria-hidden': 'true', text: label })
  ]);
}

/* -------------------------------------------------------------- two ways in */

/**
 * The rooming block holds both editors — BUILD-SPEC §9.
 *
 * The board is the direct-manipulation one: a night, the guests nobody has a
 * room for, and the rooms to put them in. The rows are the typed one: every
 * booking at once, with its dates and its warnings. §9's requirement is that
 * ownership can rearrange rooms without help, and the row editor is not that;
 * but neither is the board the place to fix a booking whose dates are wrong,
 * so both are here and both are one press away.
 *
 * Neither owns `rooming[]`. Both are mounted for the life of the session and
 * both are updated on every change, so a move made on the board is already in
 * the rows behind it — there is no reload, no copy, and nothing to keep in
 * step. The board is opened first because it is the one that reads at arm's
 * length, standing up, which is where this gets used.
 *
 * The board reaches nothing: it is handed an event and hands back a mutated
 * one, and this line is the entire connection between it and the application
 * state. When rooming moves to shared state, this is what changes.
 */
function mountRooming() {
  const board = createRoomingBoard({ onEvent: (next) => update(() => next) });
  const rows = createRoomingEditor();

  const panels = [
    { id: 'board', label: 'Board', node: el('div', { class: 'ways__panel' }, [board.node]) },
    { id: 'rows', label: 'Rows', node: el('div', { class: 'ways__panel', hidden: true }, [rows.node]) }
  ];

  const tabs = el('div', { class: 'ways__tabs', role: 'group', 'aria-label': 'How to edit rooming' });
  const buttons = panels.map((panel) => {
    const button = el('button', {
      type: 'button',
      class: 'btn ways__tab',
      'aria-pressed': String(panel.id === 'board'),
      text: panel.label
    });
    button.addEventListener('click', () => {
      panels.forEach((other, index) => {
        const on = other === panel;
        setHidden(other.node, !on);
        buttons[index].setAttribute('aria-pressed', String(on));
        toggleClass(buttons[index], 'is-on', on);
      });
    });
    toggleClass(button, 'is-on', panel.id === 'board');
    tabs.append(button);
    return button;
  });

  refs.roomingBody.append(el('div', { class: 'ways' }, [
    tabs,
    el('p', {
      class: 'ways__note',
      text: 'Two ways into the same assignments. A change in one is in the other at once.'
    })
  ]), ...panels.map((panel) => panel.node));

  return {
    update(event) {
      board.update(event);
      rows.update(event);
    }
  };
}

/* ----------------------------------------------------------------- rendering */

let metaEditor = null;
let roomingBlock = null;
let menuEditor = null;

function render(event) {
  if (!event) return;
  const meta = event.meta || {};
  const name = String(meta.eventName || '').trim();
  const dates = formatDateRange(meta.startDate, meta.endDate);

  setText(refs.barName, name || 'Untitled event');
  toggleClass(refs.barName, 'is-placeholder', !name);
  setText(refs.barDates, dates || 'Dates not set');
  toggleClass(refs.barDates, 'is-placeholder', !dates);
  document.title = name ? `${name} — Event Order` : 'Event Order Generator — Maple Ranch';

  if (!metaEditor) {
    metaEditor = createMetaEditor();
    refs.metaBody.append(metaEditor.node);
  }
  metaEditor.update(event);

  const sections = sectionsOf(event);

  syncAddMenu(event);

  const outlineItems = [
    { key: 'meta', kind: 'meta', label: 'Event details' },
    ...sections.map((section, index) => ({
      key: section.id,
      kind: 'section',
      label: String(section.title || '').trim() || typeInfo(section.type).defaultTitle,
      section,
      index
    }))
  ];
  const outlineEntries = reconcile(refs.outlineList, outlineItems, (item) => item.key, createOutlineItem);
  outlineEntries.forEach((entry, index) => entry.update(outlineItems[index]));

  const blockEntries = reconcile(refs.blocks, sections, (section) => section.id, createSectionBlock);
  blockEntries.forEach((entry, index) => entry.update(event, sections[index], index, sections.length));

  setHidden(refs.empty, sections.length > 0);

  // [v7] The two documents that are always generated. Mounted once, outside the
  // reconciled section list, because nothing in the outline can add or remove
  // them.
  if (!roomingBlock) roomingBlock = mountRooming();
  roomingBlock.update(event);

  if (!menuEditor) {
    menuEditor = createMenuEditor();
    refs.menuBody.append(menuEditor.node);
  }
  menuEditor.update(event);
}

function mount() {
  grab();
  trackBarHeight();
  wireOutlineToggle();
  wireDocLinks();
  wireAddSection();
  subscribe(render);

  // [v8] The three document destinations (§8). Mounted after the editors
  // subscribe, so the first render has already built the workbench by the time
  // a preview can be opened over it.
  mountViews({
    nav: refs.viewNav,
    workbench: refs.workbench,
    region: refs.previews,
    printTarget: refs.printTarget,
    printButton: refs.printButton
  });
}

mount();
