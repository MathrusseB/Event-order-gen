// Departments editor — BUILD-SPEC §5 `departments[]`, §4.
//
// The corporate-style breakdown: one block per department, what it does before
// the event, what it does during, and its standing notes. §5 (v2 changes) keeps
// this shape but turns it off by default — `staff[]` covers the normal private
// side, and this comes out for the larger event that warrants it.
//
// Rarely used, so it is plain: a card per department rather than a grid, and no
// derived figures. Rarely used is not the same as small, though, and every
// array here is unbounded and every text field uncapped (§4) — a security
// department at a shoot weekend runs to a page on its own.

import { getEvent, update } from '../app.js';
import { newId } from '../ids.js';
import {
  el,
  focusRowControl,
  reconcile,
  rowNode,
  setAttr,
  setHidden,
  setValue
} from '../dom.js';
import { dateField, lineList, rowButton, textField, timeField } from './fields.js';
import { draftList, moveRow, removeRow, rowById } from './rows.js';

/** A blank department, in the shape of BUILD-SPEC §5. */
function blankDepartment() {
  return { id: newId(), name: '', priorToEvent: [], duringEvent: [], notes: [] };
}

/**
 * Run a mutator against one of a department's arrays, inside an `update()`.
 *
 * @param {string} id the department
 * @param {string} key `priorToEvent`, `duringEvent`, or `notes`
 * @param {(list: *[]) => void} mutate
 */
function writeList(id, key, mutate) {
  update((draft) => {
    const department = rowById(draftList(draft, 'departments'), id);
    if (!department) return;
    if (!Array.isArray(department[key])) department[key] = [];
    mutate(department[key]);
  });
}

/**
 * The departments editor.
 *
 * @returns {{node: HTMLElement, update: (event: object, section: object) => void}}
 */
export function createDepartmentsEditor() {
  const list = el('div', { class: 'departments' });

  const emptyNote = el('p', {
    class: 'rows__empty',
    text: 'No departments. Most private-side orders use Staff Assignments instead; this is the '
      + 'fuller breakdown for an event that needs one.'
  });

  const addButton = el('button', { type: 'button', class: 'btn btn--primary', text: 'Add department' });
  addButton.addEventListener('click', () => {
    const department = blankDepartment();
    update((draft) => {
      draftList(draft, 'departments').push(department);
    });
    const node = rowNode(list, department.id);
    const field = node && node.querySelector('[data-field="name"]');
    if (field) field.focus();
  });

  const node = el('div', { class: 'editor editor--departments' }, [
    list,
    emptyNote,
    el('div', { class: 'editor__foot' }, [addButton])
  ]);

  return {
    node,
    update(event) {
      const departments = Array.isArray(event.departments) ? event.departments : [];
      setHidden(emptyNote, departments.length > 0);

      const entries = reconcile(list, departments,
        (department, index) => department.id || `department-${index}`,
        (department) => createDepartmentCard(list, department.id));
      entries.forEach((entry, index) =>
        entry.update(event, departments[index], index, departments.length));
    }
  };
}

/** One department. Built once per id, patched from then on. */
function createDepartmentCard(list, id) {
  const name = textField({
    field: 'name',
    label: 'Department',
    placeholder: 'Security',
    onInput: (value) => {
      update((draft) => {
        const department = rowById(draftList(draft, 'departments'), id);
        if (department) department.name = value;
      });
    }
  });

  const moveUp = rowButton('up', 'Move up', '↑');
  const moveDown = rowButton('down', 'Move down', '↓');
  const remove = rowButton('remove', 'Delete department', '✕', 'btn--danger');

  moveUp.addEventListener('click', () => moveDepartment(list, id, -1));
  moveDown.addEventListener('click', () => moveDepartment(list, id, 1));
  remove.addEventListener('click', () => deleteDepartment(id));

  const prior = lineList({
    addLabel: 'Add an item',
    placeholder: 'Print attendee list for arrivals',
    emptyText: 'Nothing to do before the event yet.',
    itemLabel: 'Prior-to-event item',
    write: (mutate) => writeList(id, 'priorToEvent', mutate)
  });

  const duringList = el('ul', { class: 'rows rows--table rows--during' });
  const duringEmpty = el('p', { class: 'rows__empty', text: 'Nothing timed during the event yet.' });
  const duringAdd = el('button', { type: 'button', class: 'btn btn--small', text: 'Add a task' });
  duringAdd.addEventListener('click', () => {
    let landed = 0;
    writeList(id, 'duringEvent', (tasks) => {
      const last = tasks.length ? tasks[tasks.length - 1] : null;
      tasks.push({ date: (last && last.date) || '', time: '', task: '' });
      landed = tasks.length - 1;
    });
    const row = duringList.children[landed];
    const field = row && row.querySelector('[data-field="task"]');
    if (field) field.focus();
  });

  const notes = lineList({
    addLabel: 'Add a note',
    placeholder: 'One guest departing after dinner, not returning',
    emptyText: 'No notes.',
    itemLabel: 'Department note',
    write: (mutate) => writeList(id, 'notes', mutate)
  });

  const node = el('section', { class: 'department', 'data-row': id }, [
    el('header', { class: 'department__head' }, [
      name.root,
      el('div', { class: 'department__controls' }, [moveUp, moveDown, remove])
    ]),
    el('div', { class: 'department__part' }, [
      el('h4', { class: 'department__label', text: 'Before the event' }),
      prior.node
    ]),
    el('div', { class: 'department__part' }, [
      el('h4', { class: 'department__label', text: 'During the event' }),
      el('div', { class: 'editor__table' }, [duringList, duringEmpty]),
      duringAdd
    ]),
    el('div', { class: 'department__part' }, [
      el('h4', { class: 'department__label', text: 'Notes' }),
      notes.node
    ])
  ]);

  return {
    node,
    update(event, department, index, total) {
      setValue(name.input, department.name || '');
      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;

      prior.update(department.priorToEvent);
      notes.update(department.notes);

      const tasks = Array.isArray(department.duringEvent) ? department.duringEvent : [];
      setHidden(duringEmpty, tasks.length > 0);
      const rows = reconcile(duringList, tasks, (task, position) => `task-${position}`,
        (task, key) => createTaskRow(duringList, id, key));
      rows.forEach((row, position) => row.update(event, tasks[position], position, tasks.length));
    }
  };
}

/**
 * One timed task inside a department.
 *
 * §5 gives these no id of their own, so — exactly as in `lineList` — the node at
 * position *n* is the task at position *n* for the life of the list, and the
 * move buttons carry focus to the destination position rather than staying on
 * the node, which now holds a different task.
 */
function createTaskRow(list, departmentId, key) {
  const position = Number(String(key).replace('task-', ''));

  const writeTask = (field, value) => {
    writeList(departmentId, 'duringEvent', (tasks) => {
      if (position < tasks.length && tasks[position]) tasks[position][field] = value;
    });
  };

  const date = dateField({ field: 'date', label: 'Date', onChange: (v) => writeTask('date', v) });
  const time = timeField({ field: 'time', label: 'Time', onChange: (v) => writeTask('time', v) });
  const task = textField({
    field: 'task',
    label: 'Task',
    placeholder: 'Front gate for arrivals',
    autocapitalize: 'sentences',
    onInput: (value) => writeTask('task', value)
  });

  const moveUp = rowButton('up', 'Move up', '↑');
  const moveDown = rowButton('down', 'Move down', '↓');
  const remove = rowButton('remove', 'Delete task', '✕', 'btn--danger');

  const moveTask = (delta) => {
    writeList(departmentId, 'duringEvent', (tasks) => {
      const to = position + delta;
      if (position < 0 || position >= tasks.length || to < 0 || to >= tasks.length) return;
      const [moved] = tasks.splice(position, 1);
      tasks.splice(to, 0, moved);
    });
    focusTask(list, position + delta, delta < 0 ? ['up', 'down'] : ['down', 'up']);
  };
  moveUp.addEventListener('click', () => moveTask(-1));
  moveDown.addEventListener('click', () => moveTask(1));
  remove.addEventListener('click', () => {
    let total = 0;
    writeList(departmentId, 'duringEvent', (tasks) => {
      if (position < tasks.length) tasks.splice(position, 1);
      total = tasks.length;
    });
    focusTask(list, Math.min(position, total - 1), ['remove']);
  });

  const node = el('li', { class: 'row row--during' }, [
    date.root,
    time.root,
    task.root,
    el('div', { class: 'cell cell--actions' }, [moveUp, moveDown, remove])
  ]);

  return {
    node,
    update(event, entry, index, total) {
      const meta = event.meta || {};
      setValue(date.input, (entry && entry.date) || '');
      setValue(time.input, (entry && entry.time) || '');
      setValue(task.input, (entry && entry.task) || '');
      setAttr(date.input, 'min', meta.startDate);
      setAttr(date.input, 'max', meta.endDate);
      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;
    }
  };
}

/** Focus a control on the task now at `position`. */
function focusTask(list, position, controls) {
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
  const field = node.querySelector('[data-field="task"]');
  if (field) field.focus();
}

/** Move a department one place, and keep the finger on the button that moved it. */
function moveDepartment(list, id, delta) {
  update((draft) => moveRow(draftList(draft, 'departments'), id, delta));
  focusRowControl(list, id, delta < 0 ? ['up', 'down'] : ['down', 'up']);
}

/** Delete a department, with everything in it named first. */
function deleteDepartment(id) {
  const event = getEvent();
  const department = ((event && event.departments) || []).find((row) => row && row.id === id);
  if (!department) return;

  const name = String(department.name || '').trim() || 'this department';
  const counts = [
    [(department.priorToEvent || []).length, 'prior-to-event item'],
    [(department.duringEvent || []).length, 'timed task'],
    [(department.notes || []).length, 'note']
  ].filter(([count]) => count > 0)
    .map(([count, noun]) => `${count} ${count === 1 ? noun : `${noun}s`}`);

  const prompt = counts.length
    ? `Delete ${name}? Its ${counts.join(', ')} go with it, and there is no undo.`
    : `Delete ${name}? It is empty.`;
  if (!window.confirm(prompt)) return;

  update((draft) => removeRow(draftList(draft, 'departments'), id));
}
