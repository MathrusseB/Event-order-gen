// Staff editor — BUILD-SPEC §5 `staff[]`.
//
// Person, date, daypart, assignment. Private side runs a small crew with
// role-level assignments (§5, v2 changes), and several rows for one person is
// the normal case rather than a mistake: one stew in a duck blind in the
// morning and behind the bar at night is two rows, not one row with two halves.
//
// So the editor is a flat list and stays one. §13 has not settled whether the
// render groups by person or by daypart, and that is a render decision either
// way — grouping the editor would pick the answer early and would make the
// second row for a person harder to add than the first, which is backwards.

import { getEvent, update } from '../app.js';
import { formatDate } from '../dates.js';
import { newId } from '../ids.js';
import { DAYPARTS } from '../reference.js';
import {
  el,
  focusRowControl,
  reconcile,
  rowNode,
  setAttr,
  setHidden,
  setText,
  setValue
} from '../dom.js';
import { dateField, rowButton, selectField, textField, warnLine } from './fields.js';
import { draftList, fieldWriter, moveRow, removeRow } from './rows.js';

const write = fieldWriter('staff');

/** How each daypart reads in the interface. */
const DAYPART_LABELS = { AM: 'AM', PM: 'PM' };

/** A blank staff assignment, in the shape of BUILD-SPEC §5. */
function blankRow(name, date) {
  return { id: newId(), name: name || '', date: date || '', daypart: 'AM', assignment: '' };
}

/**
 * The staff editor.
 *
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createStaffEditor() {
  const summary = el('p', { class: 'tally__total' }, [
    el('span', { text: 'Assignments' }),
    el('span', { class: 'tally__figure', 'data-figure': 'rows' })
  ]);
  const people = el('p', { class: 'tally__people' });
  const tally = el('div', { class: 'tally tally--staff' }, [summary, people]);
  const totalFigure = tally.querySelector('[data-figure="rows"]');

  const columns = el('div', { class: 'rowhead rowhead--table', 'aria-hidden': 'true' }, [
    el('span', { text: 'Who' }),
    el('span', { text: 'Date' }),
    el('span', { text: 'Daypart' }),
    el('span', { text: 'Assignment' }),
    el('span', { class: 'sr-only', text: 'Row actions' })
  ]);

  const list = el('ul', { class: 'rows rows--table rows--staff' });

  const emptyNote = el('p', {
    class: 'rows__empty',
    text: 'No staff assignments yet. One row per person per daypart.'
  });

  const addButton = el('button', { type: 'button', class: 'btn btn--primary', text: 'Add assignment' });
  addButton.addEventListener('click', () => {
    const event = getEvent();
    const rows = (event && event.staff) || [];
    const last = rows.length ? rows[rows.length - 1] : null;
    // The second row for a person is the common case, so a new row starts from
    // the last one's person and day and lands the caret on what differs.
    const row = blankRow(
      last && last.name,
      (last && last.date) || (event && event.meta && event.meta.startDate) || ''
    );
    if (last && last.daypart === 'AM') row.daypart = 'PM';
    update((draft) => {
      draftList(draft, 'staff').push(row);
    });
    const node = rowNode(list, row.id);
    const field = node && node.querySelector('[data-field="assignment"]');
    if (field) field.focus();
  });

  const legend = el('p', {
    class: 'editor__legend',
    text: 'A new row carries over the last one\'s person and day, and flips the daypart, because '
      + 'the same person on both halves of a day is the usual shape. How this prints — grouped by '
      + 'person or by daypart — is the render\'s decision, not this list\'s.'
  });

  const node = el('div', { class: 'editor editor--staff' }, [
    tally,
    el('div', { class: 'editor__table' }, [columns, list, emptyNote]),
    el('div', { class: 'editor__foot' }, [addButton, legend])
  ]);

  return {
    node,
    update(event) {
      const rows = Array.isArray(event.staff) ? event.staff : [];
      setText(totalFigure, String(rows.length));

      const names = new Set(rows
        .map((row) => String((row && row.name) || '').trim())
        .filter(Boolean));
      setHidden(people, names.size === 0);
      setText(people, `${names.size} ${names.size === 1 ? 'person' : 'people'}: ${[...names].join(', ')}.`);

      setHidden(emptyNote, rows.length > 0);
      setHidden(columns, rows.length === 0);

      const entries = reconcile(list, rows, (row) => row.id, (row) => createStaffRow(list, row.id));
      entries.forEach((entry, index) => entry.update(event, rows[index], index, rows.length));
    }
  };
}

/** One staff assignment. Built once per id, patched from then on. */
function createStaffRow(list, id) {
  const name = textField({
    field: 'name',
    label: 'Who',
    placeholder: 'Sara',
    onInput: (value) => write(id, 'name', value)
  });
  const date = dateField({ field: 'date', label: 'Date', onChange: (v) => write(id, 'date', v) });
  const daypart = selectField({
    field: 'daypart',
    label: 'Daypart',
    onChange: (v) => write(id, 'daypart', v)
  });
  const assignment = textField({
    field: 'assignment',
    label: 'Assignment',
    placeholder: 'Duck blind - North',
    autocapitalize: 'sentences',
    onInput: (value) => write(id, 'assignment', value)
  });

  const moveUp = rowButton('up', 'Move up', '↑');
  const moveDown = rowButton('down', 'Move down', '↓');
  const remove = rowButton('remove', 'Delete assignment', '✕', 'btn--danger');

  moveUp.addEventListener('click', () => moveEntry(list, id, -1));
  moveDown.addEventListener('click', () => moveEntry(list, id, 1));
  remove.addEventListener('click', () => {
    update((draft) => removeRow(draftList(draft, 'staff'), id));
  });

  const warn = warnLine();

  const node = el('li', { class: 'row row--staff', 'data-row': id }, [
    name.root,
    date.root,
    daypart.root,
    assignment.root,
    el('div', { class: 'cell cell--actions' }, [moveUp, moveDown, remove]),
    warn.node
  ]);

  return {
    node,
    update(event, row, index, total) {
      const meta = event.meta || {};
      setValue(name.input, row.name || '');
      setValue(date.input, row.date || '');
      setValue(assignment.input, row.assignment || '');

      // A daypart the file carries that this build does not know is offered
      // rather than silently rewritten — the row was authored that way.
      const values = DAYPARTS.includes(row.daypart) || !row.daypart
        ? DAYPARTS
        : [...DAYPARTS, row.daypart];
      daypart.setOptions(values.map((value) => ({ value, label: DAYPART_LABELS[value] || value })));
      setValue(daypart.select, row.daypart || 'AM');

      setAttr(date.input, 'min', meta.startDate);
      setAttr(date.input, 'max', meta.endDate);

      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;

      const messages = [];
      if (meta.startDate && meta.endDate && row.date
        && (row.date < meta.startDate || row.date > meta.endDate)) {
        messages.push(`Dated ${formatDate(row.date)}, outside the event.`);
      }
      if (!String(row.name || '').trim() && String(row.assignment || '').trim()) {
        messages.push('No name on this assignment.');
      }
      warn.set(messages);
    }
  };
}

/** Move a row one place, and keep the finger on the button that moved it. */
function moveEntry(list, id, delta) {
  update((draft) => moveRow(draftList(draft, 'staff'), id, delta));
  focusRowControl(list, id, delta < 0 ? ['up', 'down'] : ['down', 'up']);
}
