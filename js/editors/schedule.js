// Schedule editor — BUILD-SPEC §5 `schedule[]`.
//
// [v7] `schedule[]` carries only what is not a meal: hunts, arrivals, downtime,
// departures. Meals are F&B entries, and the itinerary that prints on the event
// order is the merge of the two arrays in time order (§7 [v7]). That merge is
// the reason this editor shows an itinerary preview above the rows: with meals
// gone from the array being edited, the day would otherwise look like it had
// holes in it where breakfast and dinner used to be.
//
// A label that names a meal already in `foodAndBev` on the same date is
// flagged on the row and nothing more. §12 warns and never blocks (and §12.12
// is the print-time rule for the same thing) — the coordinator may be part way
// through moving a meal across, and an editor that refused the keystroke would
// be wrong about that.

import { getEvent, update } from '../app.js';
import { itineraryFor } from '../derive.js';
import { datesBetween, formatDate, formatTime, formatTimeRange } from '../dates.js';
import { newId } from '../ids.js';
import { SCHEDULE_LABEL_SUGGESTIONS } from '../reference.js';
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
import { dateField, rowButton, textField, timeField, warnLine } from './fields.js';
import { draftList, fieldWriter, moveRow, removeRow } from './rows.js';

const write = fieldWriter('schedule');

/** A blank schedule entry, in the shape of BUILD-SPEC §5. */
function blankEntry(date) {
  return { id: newId(), date: date || '', start: '', end: '', label: '' };
}

/**
 * The comparison key for a meal name.
 *
 * Schedule labels have always been written "Dinner - Wheel" while the F&B entry
 * stores the meal and the location apart, so the location is dropped before the
 * two are compared. Case and inner spacing are not a difference either.
 *
 * @param {string} value
 * @returns {string}
 */
function mealKey(value) {
  return String(value || '')
    .split(/\s+[-–—]\s+/)[0]
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * The F&B entry a schedule label duplicates, if there is one.
 *
 * BUILD-SPEC §12.12 [v7] is the same date and the same time — the pair that
 * will print twice on the merged itinerary. A match at a different time is
 * reported too, more quietly: it is usually a meal half-moved into
 * `foodAndBev`, and the row is what has to go.
 *
 * @param {object} event
 * @param {object} entry a `schedule[]` row
 * @returns {{meal: object, sameTime: boolean}|null}
 */
function mealEcho(event, entry) {
  const key = mealKey(entry && entry.label);
  if (!key || !entry.date) return null;
  const meals = (event && event.foodAndBev) || [];
  let loose = null;
  for (const meal of meals) {
    if (!meal || meal.date !== entry.date || mealKey(meal.meal) !== key) continue;
    if ((meal.start || '') === (entry.start || '')) return { meal, sameTime: true };
    if (!loose) loose = { meal, sameTime: false };
  }
  return loose;
}

/**
 * The schedule editor.
 *
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createScheduleEditor() {
  // One datalist for the whole editor, with an id of its own so a second
  // instance could never collide with this one's.
  const listId = `schedule-labels-${newId()}`;
  const datalist = el('datalist', { id: listId },
    SCHEDULE_LABEL_SUGGESTIONS.map((label) => el('option', { value: label })));

  const previewBody = el('div', { class: 'preview__days' });
  const previewEmpty = el('p', {
    class: 'preview__empty',
    text: 'Set the event dates to see the itinerary.'
  });
  const preview = el('div', { class: 'preview' }, [
    el('h3', { class: 'preview__title', text: 'Itinerary as it will print' }),
    el('p', {
      class: 'preview__lead',
      text: 'Schedule entries and meal services, merged in time order. Meals are edited in Food '
        + '& Beverage; moving one there moves it here, on the menu, and in the F&B table at once.'
    }),
    previewBody,
    previewEmpty
  ]);

  const columns = el('div', { class: 'rowhead rowhead--table', 'aria-hidden': 'true' }, [
    el('span', { text: 'Date' }),
    el('span', { text: 'Start' }),
    el('span', { text: 'End' }),
    el('span', { text: 'What is happening' }),
    el('span', { class: 'sr-only', text: 'Row actions' })
  ]);

  const list = el('ul', { class: 'rows rows--table rows--schedule' });

  const emptyNote = el('p', {
    class: 'rows__empty',
    text: 'Nothing scheduled yet. Hunts, arrivals, downtime and departures go here; meals go in '
      + 'Food & Beverage.'
  });

  const addButton = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    text: 'Add entry'
  });
  addButton.addEventListener('click', () => {
    const event = getEvent();
    const entries = (event && event.schedule) || [];
    // A day is entered a line at a time, so a new row starts on the day the
    // last one is on. An empty list starts on the first day of the event.
    const last = entries.length ? entries[entries.length - 1] : null;
    const row = blankEntry((last && last.date) || (event && event.meta && event.meta.startDate) || '');
    update((draft) => {
      draftList(draft, 'schedule').push(row);
    });
    const node = rowNode(list, row.id);
    const field = node && node.querySelector('[data-field="label"]');
    if (field) field.focus();
  });

  const legend = el('p', {
    class: 'editor__legend',
    text: 'Labels autocomplete from the standing list and accept anything you type. An entry with '
      + 'no start time prints at the end of its day.'
  });

  const node = el('div', { class: 'editor editor--schedule' }, [
    datalist,
    preview,
    el('div', { class: 'editor__table' }, [columns, list, emptyNote]),
    el('div', { class: 'editor__foot' }, [addButton, legend])
  ]);

  return {
    node,
    update(event) {
      const entries = Array.isArray(event.schedule) ? event.schedule : [];
      const meta = event.meta || {};

      const days = datesBetween(meta.startDate, meta.endDate);
      setHidden(previewBody, days.length === 0);
      setHidden(previewEmpty, days.length > 0);
      const dayEntries = reconcile(previewBody, days, (date) => date, () => createPreviewDay());
      dayEntries.forEach((entry, index) => entry.update(event, days[index]));

      setHidden(emptyNote, entries.length > 0);
      setHidden(columns, entries.length === 0);

      const rows = reconcile(list, entries, (entry) => entry.id, (entry) =>
        createScheduleRow(list, entry.id));
      rows.forEach((row, index) => row.update(event, entries[index], index, entries.length));
    }
  };
}

/** One day of the merged itinerary. Read-only: the rows below are the edit. */
function createPreviewDay() {
  const heading = el('h4', { class: 'preview__day' });
  const body = el('ul', { class: 'preview__lines' });
  const empty = el('p', { class: 'preview__none', text: 'Nothing on this day yet.' });
  const node = el('div', { class: 'preview__block' }, [heading, body, empty]);

  return {
    node,
    update(event, date) {
      setText(heading, formatDate(date));
      const items = itineraryFor(event, date);
      setHidden(empty, items.length > 0);
      const lines = reconcile(body, items, (item, index) => `${item.source}:${item.id || index}`,
        () => createPreviewLine());
      lines.forEach((line, index) => line.update(items[index]));
    }
  };
}

/** One merged itinerary line. */
function createPreviewLine() {
  const time = el('span', { class: 'preview__time' });
  const text = el('span', { class: 'preview__text' });
  const where = el('span', { class: 'preview__where' });
  const node = el('li', { class: 'preview__line' }, [time, text, where]);

  return {
    node,
    update(item) {
      setText(time, formatTimeRange(item.start, item.end) || 'No time');
      setText(text, item.text || 'Untitled');
      setText(where, item.location || '');
      setHidden(where, !item.location);
      // Which array a line came from is the one thing the merge hides, and it
      // is what tells the user where to go to change it.
      toggleClass(node, 'is-meal', item.source === 'foodAndBev');
      toggleClass(node, 'is-untimed', !item.start);
    }
  };
}

/** One schedule entry. Built once per id, patched from then on. */
function createScheduleRow(list, id) {
  const date = dateField({
    field: 'date',
    label: 'Date',
    onChange: (value) => write(id, 'date', value)
  });
  const start = timeField({
    field: 'start',
    label: 'Start',
    onChange: (value) => write(id, 'start', value)
  });
  const end = timeField({
    field: 'end',
    label: 'End',
    onChange: (value) => write(id, 'end', value)
  });
  const label = textField({
    field: 'label',
    label: 'What is happening',
    placeholder: 'Duck Hunt',
    onInput: (value) => write(id, 'label', value)
  });

  const moveUp = rowButton('up', 'Move up', '↑');
  const moveDown = rowButton('down', 'Move down', '↓');
  const remove = rowButton('remove', 'Delete entry', '✕', 'btn--danger');

  moveUp.addEventListener('click', () => moveEntry(list, id, -1));
  moveDown.addEventListener('click', () => moveEntry(list, id, 1));
  remove.addEventListener('click', () => {
    update((draft) => removeRow(draftList(draft, 'schedule'), id));
  });

  const warn = warnLine();

  const node = el('li', { class: 'row row--schedule', 'data-row': id }, [
    date.root,
    start.root,
    end.root,
    label.root,
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
      setValue(label.input, entry.label || '');

      // A nudge, not a fence: §12.9 warns about a date outside the event and
      // never blocks it, so a date typed or pasted outside the range is kept.
      setAttr(date.input, 'min', meta.startDate);
      setAttr(date.input, 'max', meta.endDate);

      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;

      warn.set(entryWarnings(event, entry, meta));
      toggleClass(node, 'is-echo', Boolean(mealEcho(event, entry)));
    }
  };
}

/**
 * What is wrong with a schedule entry, in plain sentences. §12.9 for the date,
 * §12.12 [v7] for a meal that is in both arrays.
 */
function entryWarnings(event, entry, meta) {
  const messages = [];

  if (meta.startDate && meta.endDate && entry.date) {
    if (entry.date < meta.startDate || entry.date > meta.endDate) {
      messages.push(`Dated ${formatDate(entry.date)}, outside the event.`);
    }
  }
  if (entry.start && entry.end && entry.end < entry.start) {
    messages.push('Ends before it starts.');
  }

  const echo = mealEcho(event, entry);
  if (echo) {
    const when = formatTime(echo.meal.start) || 'no time set';
    messages.push(echo.sameTime
      ? `"${echo.meal.meal}" is already a meal service at ${when} on this date, so it would print `
        + 'twice on the itinerary. Meals belong in Food & Beverage — delete this entry.'
      : `Food & Beverage already serves "${echo.meal.meal}" at ${when} on this date. Meals are `
        + 'merged into the itinerary from there, so this entry is probably the leftover one.');
  }
  return messages;
}

/** Move an entry one place, and keep the finger on the button that moved it. */
function moveEntry(list, id, delta) {
  update((draft) => moveRow(draftList(draft, 'schedule'), id, delta));
  focusRowControl(list, id, delta < 0 ? ['up', 'down'] : ['down', 'up']);
}
