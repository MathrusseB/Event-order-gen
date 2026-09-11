// DOM helpers, and the keyed reconciler every editor renders through.
//
// WHY A RECONCILER AND NOT innerHTML — read this before writing an editor.
//
// The form writes on every keystroke: an `input` handler calls `update()`,
// which notifies subscribers, which re-renders. If a render rebuilds its
// markup, the field being typed into is destroyed and replaced between one
// character and the next, and focus lands on `<body>`. Every editor in this app
// therefore renders twice-over: it *builds* its DOM once, keyed by row id, and
// from then on only *patches* the nodes it already has.
//
// Two rules make that safe, and both live here so no editor has to remember
// them:
//
//   1. `reconcile()` keeps one node per key for the life of the row. A node is
//      created when its key first appears, removed when the key goes, and moved
//      only when the order genuinely differs. Typing never changes key order,
//      so typing never moves a node.
//   2. `setValue()` refuses to write to the focused element. The field the user
//      is inside is the one place the DOM is ahead of the state, and copying
//      state back over it is what resets a caret to the end of the line. Every
//      other field on the row is patched normally, so the counts move while the
//      surname is still half-typed.
//
// Nothing here uses `innerHTML`. Text goes in through `textContent`.

/** Per-parent key -> entry maps for `reconcile`. Keyed weakly: no leaks. */
const RECONCILE_CACHE = new WeakMap();

/**
 * Build an element. Attributes are set as attributes, not properties, so the
 * call reads like the markup it produces.
 *
 * `class` and `text` are shorthands; a key starting with `on` is an event
 * listener; `null`, `undefined`, and `false` values are skipped, so a
 * conditional attribute needs no branch at the call site.
 *
 * @param {string} tag
 * @param {Object<string, *>} [attrs]
 * @param {Array<Node|string|null|false>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/**
 * Write a value into a form control without disturbing the user.
 *
 * Skips the focused element outright: while the caret is in a field, the field
 * is the authority and the state is downstream of it. Skips an unchanged value
 * too, because assigning to `.value` resets scroll position and, in some
 * browsers, the selection.
 *
 * @param {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} input
 * @param {*} value null and undefined become ''
 */
export function setValue(input, value) {
  if (!input || input === document.activeElement) return;
  const next = value === null || value === undefined ? '' : String(value);
  if (input.value !== next) input.value = next;
}

/**
 * Set a checkbox. No caret to protect, so a focused box is written like any
 * other — a checkbox the user is tabbed to still shows the truth.
 *
 * @param {HTMLInputElement} input
 * @param {boolean} checked
 */
export function setChecked(input, checked) {
  if (!input) return;
  const next = Boolean(checked);
  if (input.checked !== next) input.checked = next;
}

/**
 * Set text content, only when it differs. Guarding the write keeps the browser
 * from re-laying-out a line of text on every keystroke elsewhere in the form.
 *
 * @param {Node} node
 * @param {*} value
 */
export function setText(node, value) {
  if (!node) return;
  const next = value === null || value === undefined ? '' : String(value);
  if (node.textContent !== next) node.textContent = next;
}

/**
 * Add or remove a class.
 * @param {Element} node
 * @param {string} name
 * @param {boolean} on
 */
export function toggleClass(node, name, on) {
  if (node) node.classList.toggle(name, Boolean(on));
}

/**
 * Show or hide, via the `hidden` attribute so assistive technology agrees with
 * what is on screen.
 * @param {HTMLElement} node
 * @param {boolean} hidden
 */
export function setHidden(node, hidden) {
  if (node) node.hidden = Boolean(hidden);
}

/**
 * Set an attribute, or remove it when the value is empty. `min=""` on a date
 * input is not the same as no `min`, and the difference shows up as a spurious
 * `:invalid`.
 *
 * @param {Element} node
 * @param {string} name
 * @param {*} value
 */
export function setAttr(node, name, value) {
  if (!node) return;
  if (value === null || value === undefined || value === '') node.removeAttribute(name);
  else if (node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
}

/**
 * Grow a textarea to fit its content. BUILD-SPEC §4: no row caps anywhere.
 *
 * Measured against a collapsed height, then written back only when it changed,
 * so a render that touches nothing does not nudge the scroll position.
 *
 * @param {HTMLTextAreaElement} textarea
 */
export function autoGrow(textarea) {
  if (!textarea || !textarea.isConnected) return;
  // [v17] A hidden textarea has no box to measure: its scroll height is zero, and
  // writing that back would set the field to nothing and leave it that way until
  // something grew it again. A section collapsed by hiding (shell.js) is patched
  // on every render like any other, so this is reached with no layout underneath
  // it constantly — keep the last height it had and measure again when it is back.
  if (textarea.offsetParent === null) return;
  const previous = textarea.style.height;
  textarea.style.height = 'auto';
  const wanted = `${textarea.scrollHeight}px`;
  textarea.style.height = wanted === previous ? previous : wanted;
}

/**
 * Reconcile a parent's children against a list of items, one node per key.
 *
 * `create` is called once per key, ever. Its return value — `{ node, update }`
 * — is cached and handed back on every later pass, so the caller patches the
 * node it built rather than replacing it. That node identity is what keeps
 * focus, caret, scroll position, and any open date picker alive across a
 * render.
 *
 * Ordering touches the DOM only where it already disagrees, because moving a
 * node detaches it and a focused element that gets detached is blurred. Rows
 * are only ever moved when the user actually reorders them.
 *
 * The parent must contain nothing but this list — reconcile owns its children.
 *
 * @template T
 * @param {Element} parent
 * @param {T[]} items
 * @param {(item: T, index: number) => string} keyOf
 * @param {(item: T, key: string) => {node: Element, update: Function}} create
 * @returns {{node: Element, update: Function}[]} entries in item order; call
 *   `update` on each yourself, with whatever arguments the editor needs
 */
export function reconcile(parent, items, keyOf, create) {
  let cache = RECONCILE_CACHE.get(parent);
  if (!cache) {
    cache = new Map();
    RECONCILE_CACHE.set(parent, cache);
  }

  const entries = [];
  const live = new Set();

  items.forEach((item, index) => {
    // A duplicate id would otherwise collapse two rows onto one node. Ids are
    // unique by construction (ids.js), but a hand-edited file is not bound by
    // that, and two rows sharing a node is a worse failure than an ugly key.
    const base = String(keyOf(item, index));
    let key = base;
    for (let n = 2; live.has(key); n += 1) key = `${base}#${n}`;
    live.add(key);

    let entry = cache.get(key);
    if (!entry) {
      entry = create(item, key);
      cache.set(key, entry);
    }
    entries.push(entry);
  });

  for (const [key, entry] of cache) {
    if (live.has(key)) continue;
    entry.node.remove();
    cache.delete(key);
  }

  entries.forEach((entry, index) => {
    const current = parent.children[index];
    if (current !== entry.node) parent.insertBefore(entry.node, current || null);
  });

  return entries;
}

/**
 * The child of `parent` carrying `data-row="<id>"`.
 *
 * A scan rather than a selector: row ids are opaque (ids.js) and a selector
 * would have to escape them.
 *
 * @param {Element} parent
 * @param {string} id
 * @returns {Element|null}
 */
export function rowNode(parent, id) {
  if (!parent) return null;
  for (const child of parent.children) {
    if (child.dataset && child.dataset.row === id) return child;
  }
  return null;
}

/**
 * Move focus to a control inside a row, falling back when the preferred one is
 * disabled — pressing "move down" on the second-to-last row disables the button
 * under the finger, and focus must land somewhere sensible rather than on the
 * document.
 *
 * @param {Element} parent the reconciled list
 * @param {string} id row id
 * @param {string[]} controls `data-control` values, best first
 */
export function focusRowControl(parent, id, controls) {
  const row = rowNode(parent, id);
  if (!row) return;
  for (const control of controls) {
    const node = row.querySelector(`[data-control="${control}"]`);
    if (node && !node.disabled) {
      node.focus();
      return;
    }
  }
}

/** Whether the user has asked for less motion. */
export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
