// Food and beverage editor — BUILD-SPEC §5 `foodAndBev[]`.
//
// Every meal service at the event: what it is, when, where, and who it counts.
// Two things about this array are load-bearing elsewhere and are treated
// accordingly here.
//
//   * **`id` is stable.** Menu blocks reference an F&B entry by `fnbId` (§5),
//     so regenerating an id on edit would silently detach a written menu from
//     the meal it belongs to. Nothing in this module writes `id`: a new row
//     gets one from `newId()` at creation and keeps it for life, and deleting a
//     row leaves its menu block alone for the menu editor and §12.7 to report.
//   * **The count is derived, never typed** — except where it is, which is the
//     point of the override. `fnbCount` (§7) is shown live beside every row
//     together with the rule that produced it, so "12" is never a number of
//     unknown provenance, and a `custom` basis is drawn as the deliberate
//     override §12.1 calls it rather than as just another figure.

import { findingsFor, getEvent, update } from '../app.js';
import { attendeeName, fnbCount } from '../derive.js';
import { formatDate, formatTime } from '../dates.js';
import { newId } from '../ids.js';
import { COUNT_BASES, MEAL_LOCATIONS, OTHER_OPTION, SERVES_OPTIONS } from '../reference.js';
import {
  el,
  focusRowControl,
  reconcile,
  rowNode,
  setAttr,
  setHidden,
  setText,
  setValue,
  toggleClass
} from '../dom.js';
import { dateField, rowButton, selectField, textField, timeField, warnLine } from './fields.js';
import { draftList, fieldWriter, moveRow, removeRow } from './rows.js';

const write = fieldWriter('foodAndBev');

/**
 * How each count basis reads in the interface. BUILD-SPEC §5 (v2 changes).
 * Short enough to read inside the select rather than being clipped by it — the
 * column above them says "Counted by", so these do not have to.
 */
const BASIS_LABELS = {
  present: 'Present that day',
  overnight: 'Staying that night',
  custom: 'A number I set'
};

/** The same, short enough to sit under a figure. */
const BASIS_SHORT = {
  present: 'present that day',
  overnight: 'staying that night',
  custom: 'set by hand'
};

/** How each `serves` reads. BUILD-SPEC §5 (v5 changes). */
const SERVES_LABELS = {
  all: 'Everyone',
  adults: 'Adults only',
  children: 'Children only',
  custom: 'A number I set'
};

const SERVES_SHORT = {
  all: 'everyone',
  adults: 'adults',
  children: 'children',
  custom: 'set by hand'
};

/** A blank meal service, in the shape of BUILD-SPEC §5. */
function blankEntry(date) {
  return {
    id: newId(),
    date: date || '',
    start: '',
    end: '',
    meal: '',
    location: '',
    countBasis: 'present',
    serves: 'all'
  };
}

/**
 * Whether a row's count comes from a number somebody typed.
 *
 * `fnbCount` short-circuits to the explicit `count` when *either* selector is
 * `custom` (§7, §5 v5 changes), so the field appears for either — showing it
 * only for `countBasis` would leave a `serves: custom` row counting from a
 * field the editor never offered.
 *
 * @param {object} entry
 * @returns {boolean}
 */
function isOverride(entry) {
  return (entry && entry.countBasis === 'custom') || (entry && entry.serves === 'custom');
}

/**
 * The food and beverage editor.
 *
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createFoodAndBevEditor() {
  const overrideLine = el('p', { class: 'tally__override', hidden: true });
  const dietaryLine = el('p', { class: 'tally__dietary', hidden: true });
  const tally = el('div', { class: 'tally tally--fnb' }, [
    el('p', { class: 'tally__total' }, [
      el('span', { text: 'Meal services' }),
      el('span', { class: 'tally__figure', 'data-figure': 'services' })
    ]),
    overrideLine,
    dietaryLine
  ]);
  const totalFigure = tally.querySelector('[data-figure="services"]');

  const columns = el('div', { class: 'rowhead rowhead--table', 'aria-hidden': 'true' }, [
    el('span', { text: 'Date' }),
    el('span', { text: 'Start' }),
    el('span', { text: 'End' }),
    el('span', { text: 'Meal' }),
    el('span', { text: 'Location' }),
    el('span', { text: 'Counted by' }),
    el('span', { text: 'Serves' }),
    el('span', { text: 'Count' }),
    el('span', { class: 'sr-only', text: 'Row actions' })
  ]);

  const list = el('ul', { class: 'rows rows--table rows--fnb' });

  const emptyNote = el('p', {
    class: 'rows__empty',
    text: 'No meal services yet. Every meal, including the ones that used to be typed into the '
      + 'schedule, belongs here.'
  });

  const addButton = el('button', { type: 'button', class: 'btn btn--primary', text: 'Add meal service' });
  addButton.addEventListener('click', () => {
    const event = getEvent();
    const entries = (event && event.foodAndBev) || [];
    const last = entries.length ? entries[entries.length - 1] : null;
    const row = blankEntry((last && last.date) || (event && event.meta && event.meta.startDate) || '');
    update((draft) => {
      draftList(draft, 'foodAndBev').push(row);
    });
    const node = rowNode(list, row.id);
    const field = node && node.querySelector('[data-field="meal"]');
    if (field) field.focus();
  });

  const legend = el('p', {
    class: 'editor__legend',
    text: 'Counts come from the attendee list. Counted by and Serves compose — staying that night '
      + 'plus children is the children staying that night — and either set to a number of your own '
      + 'is an override the pre-print check will point at.'
  });

  const node = el('div', { class: 'editor editor--fnb' }, [
    tally,
    el('div', { class: 'editor__table' }, [columns, list, emptyNote]),
    el('div', { class: 'editor__foot' }, [addButton, legend])
  ]);

  return {
    node,
    update(event) {
      const entries = Array.isArray(event.foodAndBev) ? event.foodAndBev : [];
      setText(totalFigure, String(entries.length));

      const overrides = entries.filter(isOverride).length;
      setHidden(overrideLine, overrides === 0);
      setText(overrideLine, overrides === 1
        ? 'One service is counted by a number set by hand.'
        : `${overrides} services are counted by a number set by hand.`);

      // The kitchen reads this editor. An allergy that only shows on the
      // attendee list is an allergy nobody cooking has seen (§5, v5 changes).
      const dietary = (Array.isArray(event.attendees) ? event.attendees : [])
        .filter((attendee) => String((attendee && attendee.dietary) || '').trim());
      setHidden(dietaryLine, dietary.length === 0);
      if (dietary.length) {
        setText(dietaryLine, `Dietary: ${dietary
          .map((attendee) => `${attendeeName(attendee) || 'unnamed guest'} (${attendee.dietary.trim()})`)
          .join('; ')}.`);
      }

      setHidden(emptyNote, entries.length > 0);
      setHidden(columns, entries.length === 0);

      const rows = reconcile(list, entries, (entry, index) => entry.id || `fnb-${index}`, (entry) =>
        createFnbRow(list, entry.id));
      rows.forEach((row, index) => row.update(event, entries[index], index, entries.length));
    }
  };
}

/**
 * [v10] Where the meal is: a select of the three places the ranch serves in,
 * and Other, which takes free text. BUILD-SPEC §6 [v10].
 *
 * `location` stays one string in the file. The select shows the listed value
 * when the stored one matches, and Other with the text beside it when it does
 * not — so a file that says "Food Plot" opens with Food Plot in the box rather
 * than with a blank select and a lost location.
 *
 * The typed text is remembered for the life of the row: picking The Wheel and
 * then Other again brings back what was there, because the alternative is
 * retyping a location because you looked at the list.
 */
function createLocationCell(id) {
  let typed = '';

  const select = el('select', { class: 'input input--select', 'data-field': 'location' });
  const other = el('input', {
    type: 'text',
    class: 'input',
    'data-field': 'locationOther',
    placeholder: 'Where',
    autocomplete: 'off',
    autocapitalize: 'words'
  });

  select.addEventListener('change', () => {
    if (select.value === OTHER_OPTION) {
      write(id, 'location', typed);
      other.focus();
      return;
    }
    write(id, 'location', select.value);
  });

  other.addEventListener('input', () => {
    typed = other.value;
    write(id, 'location', other.value);
  });

  const root = el('div', { class: 'cell cell--location' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Location' }),
      select
    ]),
    other
  ]);

  select.replaceChildren(
    el('option', { value: '', text: 'Not set' }),
    ...MEAL_LOCATIONS.map((place) => el('option', { value: place, text: place })),
    el('option', { value: OTHER_OPTION, text: 'Other' })
  );

  return {
    root,
    update(entry) {
      const stored = String((entry && entry.location) || '');
      const listed = MEAL_LOCATIONS.includes(stored);
      const isOther = Boolean(stored) && !listed;
      if (isOther) typed = stored;

      setValue(select, listed ? stored : (isOther ? OTHER_OPTION : ''));
      // The select is the authority for whether the box is showing; the box is
      // the authority for what is in it while somebody is typing (`setValue`
      // skips the focused element).
      const showing = select.value === OTHER_OPTION;
      setHidden(other, !showing);
      setValue(other, showing ? (stored || typed) : '');
    }
  };
}

/** One meal service. Built once per id, patched from then on. */
function createFnbRow(list, id) {
  const date = dateField({ field: 'date', label: 'Date', onChange: (v) => write(id, 'date', v) });
  const start = timeField({ field: 'start', label: 'Start', onChange: (v) => write(id, 'start', v) });
  const end = timeField({ field: 'end', label: 'End', onChange: (v) => write(id, 'end', v) });
  const meal = textField({
    field: 'meal',
    label: 'Meal',
    placeholder: 'Dinner',
    onInput: (v) => write(id, 'meal', v)
  });
  const location = createLocationCell(id);

  const basis = selectField({
    field: 'countBasis',
    label: 'Counted by',
    onChange: (v) => write(id, 'countBasis', v)
  });
  basis.setOptions(COUNT_BASES.map((value) => ({ value, label: BASIS_LABELS[value] || value })));

  const serves = selectField({
    field: 'serves',
    label: 'Serves',
    onChange: (v) => write(id, 'serves', v)
  });
  serves.setOptions(SERVES_OPTIONS.map((value) => ({ value, label: SERVES_LABELS[value] || value })));

  const countInput = el('input', {
    type: 'number',
    class: 'input input--number',
    'data-field': 'count',
    min: '0',
    step: '1',
    inputmode: 'numeric'
  });
  // Per keystroke, so the figure beside the row tracks the number as it is
  // typed. An empty box is not zero — it is a number nobody has given yet, and
  // `fnbCount` reads a missing count as 0 without this module inventing one.
  countInput.addEventListener('input', () => {
    const value = countInput.value === '' ? null : Number(countInput.value);
    write(id, 'count', value);
  });
  const countCell = el('div', { class: 'cell cell--count' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Count' }),
      countInput
    ])
  ]);

  const figure = el('span', { class: 'fnbcount__figure' });
  const rule = el('span', { class: 'fnbcount__rule' });
  const figureCell = el('div', { class: 'cell cell--figure' }, [
    el('span', { class: 'fnbcount' }, [figure, rule])
  ]);

  const moveUp = rowButton('up', 'Move up', '↑');
  const moveDown = rowButton('down', 'Move down', '↓');
  const remove = rowButton('remove', 'Delete meal service', '✕', 'btn--danger');

  moveUp.addEventListener('click', () => moveEntry(list, id, -1));
  moveDown.addEventListener('click', () => moveEntry(list, id, 1));
  remove.addEventListener('click', () => deleteEntry(id));

  const warn = warnLine();

  const node = el('li', { class: 'row row--fnb', 'data-row': id }, [
    date.root,
    start.root,
    end.root,
    meal.root,
    location.root,
    basis.root,
    serves.root,
    countCell,
    figureCell,
    el('div', { class: 'cell cell--actions' }, [moveUp, moveDown, remove]),
    warn.node
  ]);

  return {
    node,
    update(event, entry, index, total) {
      const meta = event.meta || {};
      setValue(date.input, entry.date || '');
      setValue(start.input, entry.start || '');
      setValue(end.input, entry.end || '');
      setValue(meal.input, entry.meal || '');
      location.update(entry);
      setValue(basis.select, entry.countBasis || 'present');
      setValue(serves.select, entry.serves || 'all');
      setValue(countInput, entry.count === null || entry.count === undefined ? '' : entry.count);

      setAttr(date.input, 'min', meta.startDate);
      setAttr(date.input, 'max', meta.endDate);

      const override = isOverride(entry);
      setHidden(countCell, !override);

      // The live count, and the rule that produced it, side by side: §7's
      // figure is the figure that prints, and an override says so in words.
      const count = fnbCount(event, entry);
      setText(figure, String(count));
      setText(rule, override
        ? 'set by hand'
        : `${BASIS_SHORT[entry.countBasis] || BASIS_SHORT.present}, ${SERVES_SHORT[entry.serves] || SERVES_SHORT.all}`);
      toggleClass(figureCell, 'is-override', override);
      toggleClass(node, 'is-override', override);

      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;

      // [v12] §12's findings about this service — rule 1's override and rule
      // 9's date — beside the row they are about, then this editor's own checks
      // on the row's shape, which are not §12 rules. Rule 8's "no menu written"
      // and rule 12's duplicate both name this row too and mark it below; their
      // sentences belong beside the menu block and the itinerary row, which is
      // where the fix is.
      const mine = findingsFor(id).filter((item) => item.area === 'foodAndBev');
      warn.set([...mine, ...entryWarnings(event, entry, meta, override)]);
      toggleClass(node, 'has-finding', mine.length > 0);
    }
  };
}

/**
 * What is wrong with a meal service, beyond what §12 says about it.
 *
 * [v12] §12.1 and §12.9 used to be spelled out here as well as in the spec;
 * they are now written once in validate.js and shown above, and what is left is
 * this editor's own: a service that ends before it starts, an override with no
 * number in it, and a service with no name. None of those is a §12 rule.
 */
function entryWarnings(event, entry, meta, override) {
  const messages = [];

  if (entry.start && entry.end && entry.end < entry.start) {
    messages.push('Ends before it starts.');
  }
  if (override && (entry.count === null || entry.count === undefined || entry.count === '')) {
    messages.push('Counted by a number set by hand, and no number is set — this counts nobody.');
  }
  if (!String(entry.meal || '').trim()) {
    messages.push('No meal name, so nothing names this service on the itinerary or the menu.');
  }
  return messages;
}

/** Move a service one place, and keep the finger on the button that moved it. */
function moveEntry(list, id, delta) {
  update((draft) => moveRow(draftList(draft, 'foodAndBev'), id, delta));
  focusRowControl(list, id, delta < 0 ? ['up', 'down'] : ['down', 'up']);
}

/**
 * Delete a meal service.
 *
 * `menu[]` is deliberately left alone, exactly as the attendee editor leaves
 * `rooming[]` alone: §12.7 reports a menu block whose `fnbId` no longer
 * resolves, and the menu editor shows it with its dishes intact and offers to
 * re-point it. Quietly deleting a written menu because a time changed would
 * lose an evening's work with no trace.
 */
function deleteEntry(id) {
  const event = getEvent();
  if (!event) return;
  const entry = ((event && event.foodAndBev) || []).find((row) => row && row.id === id);
  if (!entry) return;

  const name = String(entry.meal || '').trim() || 'this meal service';
  const when = [formatDate(entry.date), formatTime(entry.start)].filter(Boolean).join(', ');
  const block = ((event && event.menu) || []).find((row) => row && row.fnbId === id);

  let prompt = `Delete ${name}${when ? ` (${when})` : ''}?`;
  if (block) {
    const dishes = (Array.isArray(block.dishes) ? block.dishes : [])
      .filter((dish) => String(dish || '').trim()).length;
    prompt += ` Its menu — ${dishes} ${dishes === 1 ? 'dish' : 'dishes'} — stays in the file and`
      + ' shows up in the menu editor as written for a meal that is gone, so nothing is lost. You'
      + ' can point it at another meal or delete it there.';
  }

  if (!window.confirm(prompt)) return;

  update((draft) => {
    removeRow(draftList(draft, 'foodAndBev'), id);
    // menu[] is untouched, on purpose. See above.
  });
}
