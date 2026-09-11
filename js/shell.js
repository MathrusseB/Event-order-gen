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
// [v17] The column of editors is a disclosure set — one section open, the rest
// collapsed to their headers (§10 [v17]) — and which one is open lives here, in
// this module, as a variable. It is not on the event: the choice is about the
// screen somebody is looking at, not about the weekend they are planning, and a
// file that carried it would be a file that opens differently depending on who
// saved it. Collapsing hides a body and never unmounts it, for the reason
// dom.js gives at length: these nodes are the rows' identity.
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

import { findingsIn, getEvent, lastLoad, subscribe, update } from './app.js';
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
import { mountViews, setView } from './views.js';
import { sectionSummary } from './summary.js';
import { createMetaEditor } from './editors/meta.js';
import { createMenuEditor } from './editors/menu.js';
import { createRoomingEditor } from './editors/rooming.js';
import { createRoomingBoard } from './rooming.js';
import { SIZE_CEILING, exportRoomingBoard } from './export.js';
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

/**
 * [v17] Which section is open. BUILD-SPEC §10 [v17].
 *
 * The sections are a disclosure set — one open, the rest collapsed to their
 * headers — and this is the whole of that state. It lives here rather than on
 * the event because it is not a fact about the event: it is not saved, not
 * autosaved, not migrated, and an order opened on another machine opens on its
 * own first enabled section rather than on whoever last pressed Save.
 *
 * `openId` is a section id, or null for none open. `openResolved` separates
 * "nobody has chosen yet", which asks for the first enabled section, from
 * "everything is deliberately shut", which asks for nothing. `focusOnOpen` is
 * off for the one press that is going somewhere more specific than the field a
 * section was last typed into — the navigator and a revealed finding both place
 * the caret themselves, and two of them fighting over it is a flicker.
 */
let openId = null;
let openResolved = false;
let focusOnOpen = true;

function grab() {
  refs.bar = document.getElementById('bar');
  refs.barName = document.getElementById('bar-name');
  refs.barDates = document.getElementById('bar-dates');
  refs.outline = document.getElementById('outline');
  refs.outlineToggle = document.getElementById('btn-outline');
  refs.moreToggle = document.getElementById('btn-more');
  refs.moreMenu = document.getElementById('bar-menu');
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
  refs.printChecks = document.getElementById('print-checks');
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

/**
 * [v13] The file actions, behind one button on the bar.
 *
 * The menu is `position: absolute`, which is the whole reason it can exist:
 * `trackBarHeight()` writes `--bar-h` from the header's measured height and the
 * navigator, the tallies and the rooming board's head all sit at that offset,
 * so a panel that opened *inside* the bar would shove the page down by its own
 * height every time somebody looked for Save.
 *
 * It closes on a press outside itself, on Escape, and after any of its own
 * buttons has been pressed. That last one listens on the menu rather than on
 * each button, so app.js's handlers — which own what New, Load, Save and the
 * sample actually do — have already run by the time this sees the click, and a
 * `window.confirm` they raise is answered before anything moves.
 */
function wireMoreMenu() {
  const button = refs.moreToggle;
  const menu = refs.moreMenu;
  if (!button || !menu) return;

  const close = ({ restoreFocus = false } = {}) => {
    if (menu.hidden) return;
    setHidden(menu, true);
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  };

  button.addEventListener('click', () => {
    const open = menu.hidden;
    setHidden(menu, !open);
    button.setAttribute('aria-expanded', String(open));
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('button')) close();
  });

  // `pointerdown`, not `click`: a press that starts outside the menu should
  // dismiss it whether or not it finishes on something clickable.
  document.addEventListener('pointerdown', (event) => {
    if (menu.hidden || event.target.closest('.bar__more')) return;
    close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close({ restoreFocus: true });
  });
}

function closeOutlineOnNarrow() {
  if (!window.matchMedia('(min-width: 60rem)').matches) {
    document.body.classList.remove('outline-open');
    refs.outlineToggle.setAttribute('aria-expanded', 'false');
  }
}

/**
 * [v17] Open one section and close the rest, or close them all with null.
 *
 * Draws straight away rather than through `update()`: nothing about the event
 * changed, and routing view state through the one write path would stamp
 * `meta.touchedAt` (§12.11) every time somebody looked at a section.
 *
 * @param {string|null} id the section to open, or null for none
 * @param {{restoreFocus?: boolean}} [options] `restoreFocus: false` when the
 *   caller is about to place the caret itself
 */
function setOpenSection(id, { restoreFocus = true } = {}) {
  if (openId === id) return;
  openId = id;
  openResolved = true;
  focusOnOpen = restoreFocus;
  try {
    redraw();
  } finally {
    focusOnOpen = true;
  }
}

/** Draw the event again. A view-state change, so nothing is written. */
function redraw() {
  render(getEvent());
}

/**
 * [v17] Settle which section is open, after a change that may have taken it.
 *
 * Called on every render, because a section can leave the outline between two
 * of them — removed here, or replaced wholesale by a file that arrived over
 * this one. The first *enabled* section is the one to open: a disabled section
 * is one the order is not carrying (§4), and opening it first would be opening
 * the one thing on the page that will not print.
 *
 * @param {object[]} sections
 */
function resolveOpen(sections) {
  if (openId && sections.some((section) => section && section.id === openId)) return;

  // The section that was open is gone, so the choice is open again. An outline
  // that is deliberately all shut stays shut.
  if (openId) openResolved = false;
  openId = null;
  if (openResolved) return;

  const first = sections.find((section) => section && section.enabled !== false)
    || sections[0] || null;
  // No sections yet: leave the choice unresolved so the first one added opens.
  if (!first) return;
  openId = first.id;
  openResolved = true;
}

/**
 * Bring a block into view and put the caret in its title.
 *
 * [v17] §10 — and open it on the way, closing the rest. Choosing a section in
 * the navigator is the way between them now, so choosing one has to be enough.
 */
function goToBlock(id) {
  if (id === 'meta') {
    goToNode(refs.metaBlock);
    return;
  }
  setOpenSection(id, { restoreFocus: false });
  goToNode(rowNode(refs.blocks, id));
}

/**
 * The section block a node sits inside, when it sits inside one.
 *
 * The direct child of `#section-blocks` rather than a class match: the blocks
 * are reconciled children of that one parent, and a row deep inside an editor
 * is found by walking to the top of its block rather than by hoping no editor
 * ever names something `.block`.
 *
 * @param {Node} node
 * @returns {Element|null}
 */
function sectionBlockOf(node) {
  for (let at = node; at; at = at.parentElement) {
    if (at.parentElement === refs.blocks) return at;
  }
  return null;
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
  // [v12] A menu block has neither a title nor a field — its one control is the
  // offer to write a menu, which is exactly what somebody arriving from §12.8
  // came to press. The list is in preference order and is asked for one at a
  // time: `querySelector` with a selector list answers in *document* order, and
  // a row's move button would win over the field beside it.
  for (const want of ['[data-field="title"]', '.input', '.btn--primary']) {
    const field = node.querySelector(want);
    if (field) {
      field.focus({ preventScroll: true });
      return;
    }
  }
}

/** Add a section and drop the caret into its title, ready to be renamed. */
function addAndFocus(type) {
  let created = null;
  update((draft) => {
    created = addSection(draft, type);
  });
  if (!created) return;
  // [v17] A section somebody just added is the section they are about to type
  // into, so it is the one open — whatever was open before it closes.
  setOpenSection(created);
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
  // [v12] §12 — a section holding findings says so from the navigator, so what
  // is outstanding is visible without scrolling the form looking for it.
  const checks = el('span', { class: 'outline__checks', hidden: true });
  const button = el('button', { type: 'button', class: 'outline__link' },
    [index, label, state, checks]);
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

      // The area a section's findings are filed under is its type; the header
      // block's is `meta`. A `freeText` section has no rule about it and so
      // never carries one.
      markChecks(checks, current.kind === 'meta' ? 'meta' : current.section.type);
    }
  };
}

/**
 * [v12] The count on a navigator entry. §12 — quietly and continuously.
 *
 * Words rather than a glyph: "2 warnings" is read at a glance and "⚠ 2" is
 * read twice. Hidden entirely when there is nothing, because a navigator of
 * zeroes is a navigator nobody looks at.
 *
 * @param {HTMLElement} node the span to fill
 * @param {string} area see `AREAS` in validate.js
 */
function markChecks(node, area) {
  const found = area ? findingsIn(area) : [];
  const warnings = found.filter((item) => item.severity === 'warning').length;
  const notes = found.length - warnings;

  const parts = [];
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  if (notes) parts.push(`${notes} note${notes === 1 ? '' : 's'}`);

  setText(node, parts.join(', '));
  setHidden(node, parts.length === 0);
  toggleClass(node, 'is-warning', warnings > 0);
}

/**
 * [v12] The same mark on the two document destinations, which are static markup
 * rather than reconciled entries (index.html) because nothing in the outline can
 * add or remove them.
 */
function markDocChecks() {
  for (const node of document.querySelectorAll('[data-checks]')) {
    markChecks(node, node.dataset.checks);
  }
}

/**
 * [v12] Take the user to the thing a finding is about. §12 [v12] — "each item
 * taking you to the thing it is about".
 *
 * Handed to views.js at mount rather than imported by it: this module already
 * imports views.js, and everything below is knowledge this module has and that
 * one does not — where a section block is, which document block holds the
 * rooming rows, and that they are behind a Board / Rows switch.
 *
 * A finding whose row is not on screen still lands somewhere useful: an event
 * with no Guests section in its outline has no attendee rows to scroll to, and
 * §12.2 still has something to say about it, so the fall-back is the area's own
 * block and then nothing at all rather than a dead button.
 *
 * @param {object} finding
 */
function revealFinding(finding) {
  // Inside the finding's own area first. A meal service and its menu block both
  // carry the same row id — the meal is the thing they are both about — and
  // §12.8 is filed under the Menu because writing the menu is what fixes it.
  const target = revealTarget(finding);
  if (!target) return;
  setView('edit');

  // The rooming rows are one of two panels behind a switch, and a row inside a
  // hidden panel cannot be scrolled to.
  if (finding.area === 'rooming' && roomingBlock) roomingBlock.showRows();

  // [v17] §10 — and the same is now true of the sections: all but one are shut
  // at any moment, and a scroll to a row inside a shut one lands on nothing. The
  // section opens first. The node itself survives that — blocks
  // are reconciled, so opening one patches it rather than rebuilding it — which
  // is why this target, found before the open, is still the right node after.
  const block = sectionBlockOf(target);
  if (block) setOpenSection(block.dataset.row, { restoreFocus: false });

  goToNode(target);
}

/**
 * [v12] Whether there is anywhere to take somebody, and where.
 *
 * Every section is optional (§4), and `validate.js` reports on areas this
 * order's outline may not carry — §12.1 names a meal service on an event whose
 * outline has no Food & Beverage section, which since v9 is the normal case.
 * The print panel asks this so that an item it cannot open is drawn as an item
 * it cannot open, rather than as a button that does nothing when pressed.
 *
 * @param {object} finding
 * @returns {Element|null}
 */
export function revealTarget(finding) {
  if (!finding) return null;
  const block = areaNode(finding.area);
  return finding.rowIds.map((id) => findRowNode(id, block)).find(Boolean)
    || finding.rowIds.map((id) => findRowNode(id)).find(Boolean)
    || block;
}

/**
 * The node carrying `data-row="<id>"` anywhere in the workbench.
 *
 * A scan rather than a selector, for the reason `rowNode` gives in dom.js: row
 * ids are opaque and a hand-edited file's id is not bound to be selector-safe.
 *
 * @param {string} id
 * @param {Element} [within] where to look — the finding's own block, before
 *   the whole workbench
 * @returns {Element|null}
 */
function findRowNode(id, within) {
  const root = within || refs.workbench;
  if (!id || !root) return null;
  for (const node of root.querySelectorAll('[data-row]')) {
    if (node.dataset.row === id) return node;
  }
  return null;
}

/** The block an area lives in, when there is one in this event's outline. */
function areaNode(area) {
  if (area === 'meta') return refs.metaBlock;
  if (area === 'rooming') return document.getElementById('rooming-block');
  if (area === 'menu') return document.getElementById('menu-block');
  const section = sectionsOf(getEvent()).find((row) => row && row.type === area);
  return section ? rowNode(refs.blocks, section.id) : null;
}

/* ------------------------------------------------------------- section block */

/**
 * A section's header controls and the editor behind its disclosure.
 *
 * [v17] The header is the disclosure. Its left column is a button carrying
 * `aria-expanded` and pointing at the body it opens, and everything else on the
 * header — the title, the include-in-the-order switch, move up, move down,
 * remove — stays where it was and keeps working with the section shut. Turning a
 * section off is not a reason to open it.
 *
 * Shut means **hidden**, never unmounted. `dom.js` keys these rows by id and
 * patches them in place; rebuilding a section's DOM on the way back in would
 * throw that identity away and everything attached to it with it. So the body
 * keeps every node, and a half-typed surname comes back exactly as it was — as
 * does the scroll offset of anything that scrolls as a block.
 *
 * Two things hiding does *not* keep, and this carries both: the browser blurs
 * whatever held focus and does not hand it back, and a text field throws away
 * its own scroll offset when it is blurred. So the block remembers where the
 * caret was and how far the field was scrolled to it, and puts both back.
 */
function createSectionBlock(section) {
  const id = section.id;
  const editor = editorFor(section.type)(section);
  const bodyId = `body-${id}`;
  const toggleId = `disclose-${id}`;

  const index = el('span', { class: 'block__index', 'aria-hidden': 'true' });
  const chevron = el('span', { class: 'block__chevron', 'aria-hidden': 'true' });
  // The button's whole accessible name, and the only place a screen reader takes
  // the summary and the count from: the visible ones are `aria-hidden`, because
  // a header that reads its own summary twice is a header read twice.
  const spoken = el('span', { class: 'sr-only' });
  const toggle = el('button', {
    type: 'button',
    class: 'block__toggle',
    id: toggleId,
    'data-control': 'section-open',
    'aria-expanded': 'false',
    'aria-controls': bodyId
  }, [index, chevron, spoken]);

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

  // [v17] What is inside, for a header standing in for it, and the §12 count its
  // rows cannot show while they are hidden. Both are decoration for a screen
  // reader — `spoken` above already carries the words — and both go when the
  // section opens: then the content is the summary, and the rows mark themselves.
  const summary = el('span', { class: 'block__summary', 'aria-hidden': 'true', hidden: true });
  const checks = el('span', { class: 'block__checks', 'aria-hidden': 'true', hidden: true });

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

  // `role="region"`, named by the button that opens it: a disclosure whose panel
  // can be found again once somebody has scrolled away from its header.
  const body = el('div', {
    class: 'block__body',
    id: bodyId,
    role: 'region',
    'aria-labelledby': toggleId,
    hidden: true
  }, [editor.node]);

  const head = el('header', { class: 'block__head' }, [
    toggle,
    el('div', { class: 'block__naming' }, [
      el('label', { class: 'field', for: `title-${id}` }, [
        el('span', { class: 'field__label sr-only', text: 'Section title' }),
        titleInput
      ]),
      typeLabel,
      el('span', { class: 'block__state' }, [summary, checks])
    ]),
    el('label', { class: 'check check--switch' }, [
      enabledInput,
      el('span', { class: 'check__label', text: 'Include in the order' })
    ]),
    el('div', { class: 'block__controls' }, [moveUp, moveDown, remove])
  ]);

  // Built shut, and the class says so from the start: `setOpen` below only moves
  // the DOM when the state actually changes, so the first render of a section
  // that stays shut must find it already drawn that way.
  const node = el('section', { class: 'block block--shut', 'data-row': id, id: `block-${id}` },
    [head, badge, body]);

  let open = false;
  /**
   * Where the caret was, the last time it was inside this body. Read on the way
   * out rather than on the way in: by the time a press on another section's
   * header has closed this one, focus has already moved to that header.
   */
  let caret = null;
  /**
   * How far the focused field was scrolled, caught while it was still scrolling.
   *
   * A text field resets its own scroll offset when it loses focus, and does it
   * *before* `focusout` fires, so the value is already gone by the time the caret
   * is being remembered below. Capture phase, because `scroll` does not bubble.
   */
  let scrolled = null;

  body.addEventListener('scroll', (event) => {
    if (event.target === document.activeElement) {
      scrolled = { node: event.target, left: event.target.scrollLeft, top: event.target.scrollTop };
    }
  }, true);

  /** The caret in a control, with the scroll offset that blurring it took away. */
  const remember = (node) => {
    const at = caretIn(node);
    if (at && scrolled && scrolled.node === node) {
      at.scrollLeft = scrolled.left;
      at.scrollTop = scrolled.top;
    }
    return at;
  };

  body.addEventListener('focusout', (event) => {
    caret = remember(event.target);
  });

  /** Show or hide the body, and carry focus across the gap. */
  const setOpen = (want) => {
    if (want === open) return;
    // A section shut while the caret is still inside it — from its own header,
    // from the navigator — has had no `focusout` yet.
    if (!want && body.contains(document.activeElement)) {
      caret = remember(document.activeElement);
    }
    open = want;
    setHidden(body, !want);
    toggle.setAttribute('aria-expanded', String(want));
    toggleClass(node, 'block--shut', !want);
    if (want) restoreCaret();
  };

  /** Put the caret back where hiding the body took it from. */
  const restoreCaret = () => {
    const at = caret;
    caret = null;
    scrolled = null;
    if (!focusOnOpen || !at || !body.contains(at.node)) return;
    at.node.focus({ preventScroll: true });
    if (at.start !== null) {
      try {
        at.node.setSelectionRange(at.start, at.end);
      } catch {
        // A control with no text selection to set. Focus was the point anyway.
      }
    }
    // Last, because setting a selection can scroll the field itself. A block that
    // scrolls keeps its offset across being hidden and needs none of this; a text
    // field does not — its horizontal scroll is drawn from the caret and comes
    // back at zero — so a surname typed past the right-hand edge of its box would
    // reappear showing its first word rather than the word being typed.
    //
    // The read is not dead code: `hidden = false` above does not lay the body out
    // on the spot, and a scroll offset written to a box the browser has not
    // measured yet is clamped to zero.
    void at.node.scrollWidth;
    at.node.scrollLeft = at.scrollLeft;
    at.node.scrollTop = at.scrollTop;
  };

  toggle.addEventListener('click', () => {
    // The header the user pressed stays under their finger. Closing a tall
    // section above this one takes its height out of the page, and without this
    // the header being pressed slides up the screen by that much. Measured
    // before and after and corrected at once — a smooth correction here reads as
    // a page that has decided to drift on its own.
    const was = head.getBoundingClientRect().top;
    setOpenSection(open ? null : id);
    const moved = head.getBoundingClientRect().top - was;
    if (moved) window.scrollBy(0, moved);
  });

  return {
    node,
    update(event, current, position, total, wantOpen) {
      setText(index, String(position + 1));
      setValue(titleInput, current.title || '');
      setText(typeLabel, typeInfo(current.type).label);
      // The faint line under the title is the type while the section is open and
      // what is inside it while the section is shut — one line either way, which
      // is what keeps a collapsed header two lines tall on a phone.
      setHidden(typeLabel, !wantOpen);

      const enabled = current.enabled !== false;
      if (enabledInput.checked !== enabled) enabledInput.checked = enabled;
      toggleClass(node, 'block--off', !enabled);
      setHidden(badge, enabled);
      moveUp.disabled = position === 0;
      moveDown.disabled = position === total - 1;

      // [v17] §5 — from the event, never from the rows on screen. A shut section
      // still holds every node it had, and counting those would call a blank
      // seeded itinerary row an entry.
      const line = wantOpen ? '' : sectionSummary(event, current);
      setText(summary, line);
      setHidden(summary, !line);

      // [v12] §12 — the area a section's findings are filed under is its type.
      // [v17] Carried on the header only while the rows that would carry it are
      // hidden; an empty area hides it, which is what the empty string asks for.
      markChecks(checks, wantOpen ? '' : current.type);

      setText(spoken, [
        String(current.title || '').trim() || typeInfo(current.type).defaultTitle,
        line,
        checks.hidden ? '' : checks.textContent
      ].filter(Boolean).join(' — '));

      // Before the editor, not after: `autoGrow` measures a textarea against its
      // own scroll height, and a textarea in a hidden body measures nothing.
      setOpen(wantOpen);
      editor.update(event, current);
    }
  };
}

/**
 * [v17] A control and the caret inside it, ready to be handed back.
 *
 * `selectionStart` is not readable on every kind of input — a date, a number, a
 * checkbox — and the ones it is not readable on have no caret to keep. Null
 * means "focus it and leave the caret alone".
 *
 * The field's own scroll offsets ride along, because they are the part hiding
 * does not keep: a `<div>` that scrolls comes back exactly where it was, and a
 * text field scrolled sideways to the word being typed comes back at zero.
 *
 * @param {Element} node
 * @returns {{node: Element, start: number|null, end: number|null, scrollLeft: number,
 *   scrollTop: number}|null}
 */
function caretIn(node) {
  if (!node || typeof node.focus !== 'function') return null;
  let start = null;
  let end = null;
  try {
    start = node.selectionStart;
    end = node.selectionEnd;
  } catch {
    start = null;
  }
  return {
    node,
    start: start === undefined ? null : start,
    end: end === undefined ? null : end,
    scrollLeft: node.scrollLeft,
    scrollTop: node.scrollTop
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
 *
 * [v11] And a third thing, which is not a way in: the export. Ownership does
 * not open this app, so the board goes to them instead — one file, the event
 * baked into it, sent as an attachment. See js/export.js.
 */
function mountRooming() {
  const board = createRoomingBoard({ onEvent: (next) => update(() => next) });
  const rows = createRoomingEditor();

  const panels = [
    { id: 'board', label: 'Board', node: el('div', { class: 'ways__panel' }, [board.node]) },
    { id: 'rows', label: 'Rows', node: el('div', { class: 'ways__panel', hidden: true }, [rows.node]) }
  ];

  const tabs = el('div', { class: 'ways__tabs', role: 'group', 'aria-label': 'How to edit rooming' });

  /** Show one of the two panels and press its tab. */
  const show = (id) => {
    panels.forEach((panel, index) => {
      const on = panel.id === id;
      setHidden(panel.node, !on);
      buttons[index].setAttribute('aria-pressed', String(on));
      toggleClass(buttons[index], 'is-on', on);
    });
  };

  const buttons = panels.map((panel) => {
    const button = el('button', {
      type: 'button',
      class: 'btn ways__tab',
      'aria-pressed': String(panel.id === 'board'),
      text: panel.label
    });
    button.addEventListener('click', () => show(panel.id));
    toggleClass(button, 'is-on', panel.id === 'board');
    tabs.append(button);
    return button;
  });

  refs.roomingBody.append(el('div', { class: 'ways' }, [
    tabs,
    el('p', {
      class: 'ways__note',
      text: 'Two ways into the same assignments. A change in one is in the other at once.'
    }),
    sendToOwnership()
  ]), ...panels.map((panel) => panel.node));

  return {
    update(event) {
      board.update(event);
      rows.update(event);
    },
    // [v12] A rooming finding names a row, and the rows are the panel that is
    // not open by default. Showing them is the difference between "take me to
    // it" and a scroll to a hidden node.
    showRows() {
      show('rows');
    }
  };
}

/**
 * The export — BUILD-SPEC §5 [v11].
 *
 * The board goes to ownership rather than ownership coming to the board. What
 * this hands over is one HTML file with the event inside it: they tap it in a
 * text message and it opens, with no network, no app and no file to find.
 *
 * The size is said out loud rather than assumed. §5 [v11] treats 500KB as the
 * ceiling for something that travels by text message, and a build that has
 * quietly grown past it is worth knowing about here rather than on a phone with
 * one bar of signal.
 */
function sendToOwnership() {
  const said = el('p', { class: 'ways__sent', role: 'status', 'aria-live': 'polite' });

  const button = el('button', {
    type: 'button',
    class: 'btn btn--primary ways__send',
    text: 'Export for ownership'
  });

  button.addEventListener('click', async () => {
    button.disabled = true;
    setText(said, 'Building the board — inlining the event, the styles and the logo.');
    toggleClass(said, 'is-over', false);
    try {
      const { name, bytes } = await exportRoomingBoard(getEvent());
      setText(said, `${name} — ${Math.round(bytes / 1024)}KB. One file, nothing beside it: `
        + 'text it to ownership and they tap it. Their changes stay on their screen.');
      toggleClass(said, 'is-over', bytes > SIZE_CEILING);
    } catch (err) {
      setText(said, `The board could not be built: ${err.message}`);
      toggleClass(said, 'is-over', true);
    } finally {
      button.disabled = false;
    }
  });

  return el('div', { class: 'ways__export' }, [
    el('div', { class: 'ways__exportline' }, [
      button,
      el('p', {
        class: 'ways__note',
        text: 'A read-and-rearrange copy of this sheet for ownership. It carries its own copy of '
          + 'the event and sends nothing back — what they change, they change on their screen.'
      })
    ]),
    said
  ]);
}

/* ----------------------------------------------------------------- rendering */

let metaEditor = null;
let roomingBlock = null;
let menuEditor = null;

/**
 * [v13] The last whole event this shell has drawn. BUILD-SPEC §10 [v13].
 *
 * `render` runs on every keystroke; only a *new* event should move the caret,
 * and only when the user asked for a blank one. `lastLoad().serial` is the one
 * thing that separates those two, and this is what it is compared against.
 */
let drawnLoad = 0;

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

  // [v13] §10 — a new order lands on the date fields. Not a loaded file and not
  // a restored autosave: those open where the coordinator left them, and taking
  // the caret off whatever they were typing is the focus loss this app does not
  // do anywhere else either.
  const load = lastLoad();
  if (load.serial !== drawnLoad) {
    drawnLoad = load.serial;
    // [v17] A different event has a different outline, so which section is open
    // is decided again from the file that just arrived rather than carried over
    // from the one it replaced (§10 [v17]).
    openId = null;
    openResolved = false;
    if (load.origin === 'new') metaEditor.focusDates();
  }

  const sections = sectionsOf(event);
  resolveOpen(sections);

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
  blockEntries.forEach((entry, index) => entry.update(
    event, sections[index], index, sections.length, sections[index].id === openId));

  setHidden(refs.empty, sections.length > 0);

  // [v7] The two documents that are always generated. Mounted once, outside the
  // reconciled section list, because nothing in the outline can add or remove
  // them.
  if (!roomingBlock) roomingBlock = mountRooming();
  roomingBlock.update(event);

  // [v12] The two documents are not sections, so their navigator entries are
  // markup rather than reconciled entries — marked here, from the same count.
  markDocChecks();

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
  wireMoreMenu();
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
    printButton: refs.printButton,
    // [v12] §12 — the outstanding count beside the print control, and the way
    // from a finding in the pre-print panel to the row it is about.
    printChecks: refs.printChecks,
    reveal: revealFinding,
    canReveal: (finding) => Boolean(revealTarget(finding))
  });
}

mount();
