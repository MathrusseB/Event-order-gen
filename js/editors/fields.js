// Labelled controls shared by the section editors — BUILD-SPEC §11.
//
// The attendee editor built its own text field, date cell and row button
// because it was the first and only editor. Six more editors need the same
// pieces, and six copies of a control is six places for the focus rules at the
// top of dom.js to be got subtly wrong. So they are here, once. The attendee
// editor keeps its own copies rather than being rewritten in a segment that is
// not about it — it is the worked example the pattern was taken from, and the
// pieces below are that pattern generalised, not a different one.
//
// Every control here follows the same two rules:
//
//   * The node is built once and patched from then on. Nothing rebuilds markup
//     inside an update, so nothing takes a field out from under the caret.
//   * Text commits on `input`, per keystroke, so a count beside the row moves
//     as the row is typed. Dates, times and selects commit on `change`,
//     because a half-typed date or time reports an empty value and an empty
//     value means something — "follow the guest's stay", "no end time" — that
//     the user did not mean to say halfway through typing.

import { autoGrow, el, reconcile, setHidden, setValue } from '../dom.js';

/**
 * A row action button: a glyph where the row is a table row, words where it is
 * a card. Which one shows is a container query in styles.css, not a decision
 * made here.
 *
 * @param {string} control the `data-control` value `focusRowControl` looks up
 * @param {string} label
 * @param {string} glyph
 * @param {string} [extraClass]
 * @returns {HTMLButtonElement}
 */
export function rowButton(control, label, glyph, extraClass = '') {
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

/**
 * A labelled text input in a row cell.
 *
 * @param {object} options
 * @param {string} options.field the `data-field` value, and the cell's modifier
 * @param {string} options.label
 * @param {(value: string) => void} options.onInput called per keystroke
 * @param {string} [options.placeholder]
 * @param {string} [options.autocapitalize] `words` by default — these are names
 *   and titles far more often than they are sentences
 * @param {string} [options.list] a `<datalist>` id for autocomplete
 * @returns {{root: HTMLElement, input: HTMLInputElement}}
 */
export function textField({ field, label, onInput, placeholder, autocapitalize = 'words', list }) {
  const input = el('input', {
    type: 'text',
    class: 'input',
    'data-field': field,
    autocomplete: 'off',
    autocapitalize,
    placeholder: placeholder || null,
    list: list || null
  });
  input.addEventListener('input', () => onInput(input.value));
  const root = el('div', { class: `cell cell--${field}` }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: label }),
      input
    ])
  ]);
  return { root, input };
}

/**
 * A labelled date input in a row cell. Commits on `change`.
 *
 * @param {object} options
 * @param {string} options.field
 * @param {string} options.label
 * @param {(value: string) => void} options.onChange
 * @returns {{root: HTMLElement, input: HTMLInputElement}}
 */
export function dateField({ field, label, onChange }) {
  const input = el('input', {
    type: 'date',
    class: 'input input--date',
    'data-field': field
  });
  input.addEventListener('change', () => onChange(input.value));
  const root = el('div', { class: `cell cell--${field} cell--date` }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: label }),
      input
    ])
  ]);
  return { root, input };
}

/**
 * A labelled time input in a row cell. Commits on `change`.
 *
 * An empty time is a real value everywhere in this app — §5 shows `end: null`
 * all over `schedule[]` and `foodAndBev[]`, and §7 [v7] orders an entry with no
 * `start` last rather than dropping it — so nothing here fills one in.
 *
 * @param {object} options
 * @param {string} options.field
 * @param {string} options.label
 * @param {(value: string) => void} options.onChange
 * @returns {{root: HTMLElement, input: HTMLInputElement}}
 */
export function timeField({ field, label, onChange }) {
  const input = el('input', {
    type: 'time',
    class: 'input input--time',
    'data-field': field
  });
  input.addEventListener('change', () => onChange(input.value));
  const root = el('div', { class: `cell cell--${field} cell--time` }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: label }),
      input
    ])
  ]);
  return { root, input };
}

/**
 * A comparison key for a list of select options.
 *
 * Rebuilding the options under an open select closes it, and these lists are
 * re-offered on every keystroke anywhere in the form, so every select in the
 * app compares before it rebuilds. The separators are the two ASCII ones that
 * exist for this — unit and record — written as escapes, because a raw control
 * byte in a source file makes git read the whole file as binary.
 *
 * @param {{value: string, label: string}[]} options
 * @returns {string}
 */
export function optionSignature(options) {
  return options
    .map((option) => `${option.value}\u001f${option.label}`)
    .join('\u001e');
}

/**
 * A labelled select in a row cell.
 *
 * `setOptions` rebuilds the list only when the offered set actually changed:
 * replacing the options under an open select closes it, and these are re-offered
 * on every keystroke anywhere in the form.
 *
 * @param {object} options
 * @param {string} options.field
 * @param {string} options.label
 * @param {(value: string) => void} options.onChange
 * @returns {{root: HTMLElement, select: HTMLSelectElement,
 *   setOptions: (options: {value: string, label: string}[]) => void}}
 */
export function selectField({ field, label, onChange }) {
  const select = el('select', { class: 'input input--select', 'data-field': field });
  select.addEventListener('change', () => onChange(select.value));

  let signature = '';

  const root = el('div', { class: `cell cell--${field}` }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: label }),
      select
    ])
  ]);

  return {
    root,
    select,
    setOptions(options) {
      const next = optionSignature(options);
      if (next === signature) return;
      signature = next;
      const wanted = select.value;
      select.replaceChildren(...options.map((option) =>
        el('option', { value: option.value, text: option.label })));
      // Keep the current value across a rebuild where it survived the change;
      // the caller writes the stored value in on the same pass either way.
      if (options.some((option) => option.value === wanted)) select.value = wanted;
    }
  };
}

/**
 * A date cell that shows whether the date is the row's own or inherited.
 *
 * BUILD-SPEC §5 (v3 changes) — a rooming row's `from` / `to` "both default to
 * the guest's `arrive` / `depart`, so the common case needs no extra input". A
 * stored empty string *is* that default, not a blank somebody forgot, so the
 * input always shows a real date, greyed and dashed, rather than an empty
 * `mm/dd/yyyy` that reads as a mistake. Same treatment the attendee editor
 * gives `arrive` / `depart` against the event dates.
 *
 * @param {object} options
 * @param {string} options.field
 * @param {string} options.label
 * @param {string} options.defaultLabel what the date follows when it is unset
 * @param {string} options.resetLabel the button that hands it back
 * @param {(value: string) => void} options.onChange
 * @returns {{root: HTMLElement, input: HTMLInputElement,
 *   update: (stored: string, fallback: string) => void}}
 */
export function defaultedDateField({ field, label, defaultLabel, resetLabel, onChange }) {
  const input = el('input', {
    type: 'date',
    class: 'input input--date',
    'data-field': field
  });
  input.addEventListener('change', () => onChange(input.value));

  const mark = el('span', { class: 'datemark__default', text: defaultLabel });
  const reset = el('button', { type: 'button', class: 'linkish', text: resetLabel });
  reset.addEventListener('click', () => {
    onChange('');
    input.focus();
  });

  const root = el('div', { class: `cell cell--${field} cell--date` }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: label }),
      input
    ]),
    el('span', { class: 'datemark' }, [mark, reset])
  ]);

  return {
    root,
    input,
    update(stored, fallback) {
      const defaulted = !stored;
      // The reset only earns its place when pressing it would change something.
      const resettable = !defaulted && Boolean(fallback) && stored !== fallback;
      setValue(input, stored || fallback);
      root.classList.toggle('is-defaulted', defaulted);
      setHidden(mark, !defaulted);
      setHidden(reset, !resettable);
    }
  };
}

/**
 * The line under a row saying what is wrong with it. Hidden when there is
 * nothing to say.
 *
 * BUILD-SPEC §12 warns and never blocks, and this is where that warning is at
 * the moment the edit is made rather than held until print.
 *
 * [v12] It takes two kinds of item and tells them apart on the page:
 *
 *   * a **finding** from `validate.js` — `{severity, text}` — which is a §12
 *     rule, written once there and shown here. A `note` is set apart from a
 *     `warning`, because rule 1's overrides and rule 2's unlisted children are
 *     normal ways to run an event and must not read as faults.
 *   * a plain **string**, which is this editor's own check on its own rows —
 *     "Ends before it starts", "No name on this assignment". Those are not §12
 *     rules and are not in the validator; they are shown as warnings.
 *
 * The list is rebuilt only when what it says changes. It holds nothing
 * focusable, but the form writes on every keystroke and replacing a node under
 * a row sixty times a minute is work nobody asked for — see the note at the top
 * of dom.js.
 *
 * @returns {{node: HTMLElement,
 *   set: (items: Array<string|{severity: string, text: string}>) => void}}
 */
export function warnLine() {
  const list = el('ul', { class: 'rowwarn__list' });
  const node = el('div', { class: 'rowwarn', hidden: true }, [list]);
  let signature = '';

  return {
    node,
    set(items) {
      const lines = (items || [])
        .filter(Boolean)
        .map((item) => (typeof item === 'string'
          ? { severity: 'warning', text: item }
          : { severity: item.severity === 'note' ? 'note' : 'warning', text: item.text }))
        .filter((line) => line.text);

      const next = lines.map((line) => `${line.severity}\u0000${line.text}`).join('\u0001');
      if (next !== signature) {
        signature = next;
        list.replaceChildren(...lines.map((line) => el('li', {
          class: `rowwarn__item rowwarn__item--${line.severity}`,
          text: line.text
        })));
      }
      setHidden(node, lines.length === 0);
    }
  };
}

/**
 * An unlimited list of text lines — a department's prior-to-event items, a
 * menu course's dishes. BUILD-SPEC §4: no character limits, no fixed row
 * counts, and the field is as tall as what is in it, which is why these are
 * textareas and not inputs. A dish line wraps; it never truncates.
 *
 * §5 stores these as arrays of plain strings, so a line has no id to be keyed
 * by and the node at position *n* is the line at position *n*, for the life of
 * the list. That is sound for typing, which never reorders, and the move
 * buttons carry focus to the destination position themselves — the node under
 * the finger holds a different line after a move, so the finger follows the
 * line rather than the node.
 *
 * @param {object} options
 * @param {string} options.addLabel
 * @param {string} options.placeholder
 * @param {string} options.emptyText shown when there are no lines yet
 * @param {string} options.itemLabel what one line is called, for its label
 * @param {(mutate: (lines: string[]) => void) => void} options.write runs the
 *   mutator against the live array inside an `update()` draft
 * @returns {{node: HTMLElement, update: (lines: string[]) => void}}
 */
export function lineList({ addLabel, placeholder, emptyText, itemLabel, write }) {
  const list = el('ul', { class: 'lines' });
  const empty = el('p', { class: 'lines__empty', text: emptyText });

  const add = el('button', { type: 'button', class: 'btn btn--small', text: addLabel });
  add.addEventListener('click', () => {
    let landed = 0;
    write((lines) => {
      lines.push('');
      landed = lines.length - 1;
    });
    focusLine(list, landed);
  });

  const node = el('div', { class: 'lines__wrap' }, [list, empty, add]);

  return {
    node,
    update(lines) {
      const items = Array.isArray(lines) ? lines : [];
      setHidden(empty, items.length > 0);
      const entries = reconcile(list, items, (line, index) => `line-${index}`, (line, key) =>
        createLine(list, key, { placeholder, itemLabel, write }));
      entries.forEach((entry, index) => entry.update(items[index], index, items.length));
    }
  };
}

/** One line of a `lineList`. Keyed by position — see the note above. */
function createLine(list, key, { placeholder, itemLabel, write }) {
  // The position is fixed for the life of this node, and the line at that
  // position is the line this node edits.
  const index = Number(String(key).replace('line-', ''));

  const input = el('textarea', {
    class: 'input textarea textarea--line',
    rows: '1',
    'data-field': 'line',
    spellcheck: 'true',
    placeholder
  });
  input.addEventListener('input', () => {
    autoGrow(input);
    write((lines) => {
      if (index < lines.length) lines[index] = input.value;
    });
  });

  const up = rowButton('line-up', 'Move up', '↑');
  const down = rowButton('line-down', 'Move down', '↓');
  const remove = rowButton('line-remove', 'Delete line', '✕', 'btn--danger');

  up.addEventListener('click', () => {
    write((lines) => moveLine(lines, index, -1));
    focusLine(list, index - 1, ['line-up', 'line-down']);
  });
  down.addEventListener('click', () => {
    write((lines) => moveLine(lines, index, 1));
    focusLine(list, index + 1, ['line-down', 'line-up']);
  });
  remove.addEventListener('click', () => {
    let total = 0;
    write((lines) => {
      if (index < lines.length) lines.splice(index, 1);
      total = lines.length;
    });
    // The node the finger was on is gone when the last line goes.
    focusLine(list, Math.min(index, total - 1), ['line-remove']);
  });

  const node = el('li', { class: 'line', 'data-line': String(index) }, [
    el('label', { class: 'field field--block' }, [
      el('span', { class: 'field__label sr-only', text: itemLabel }),
      input
    ]),
    el('div', { class: 'line__controls' }, [up, down, remove])
  ]);

  return {
    node,
    update(value, position, total) {
      setValue(input, value || '');
      autoGrow(input);
      up.disabled = position === 0;
      down.disabled = position === total - 1;
    }
  };
}

/** Move a line, guarding both ends. */
function moveLine(lines, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= lines.length || to < 0 || to >= lines.length) return;
  const [moved] = lines.splice(index, 1);
  lines.splice(to, 0, moved);
}

/** Focus a control on the line now at `position`, falling back to its field. */
function focusLine(list, position, controls = []) {
  if (position < 0) return;
  const node = list.children[position];
  if (!node) return;
  for (const control of controls) {
    const button = node.querySelector(`[data-control="${control}"]`);
    if (button && !button.disabled) {
      button.focus();
      return;
    }
  }
  const field = node.querySelector('[data-field="line"]');
  if (field) field.focus();
}
