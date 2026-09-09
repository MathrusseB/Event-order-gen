// Menu editor — BUILD-SPEC §5 `menu[]`, §8 B.
//
// [v7] The Menu is its own document, not a section of the event order, so this
// editor is mounted beside the outline rather than in it. It is the only editor
// here that is not addressed by a row of its own array: a menu block is
// addressed by `fnbId` — the meal it is written for — and the meals are the
// spine of this view.
//
// That is why the list below is one block per **meal service**, in F&B order,
// whether or not a menu has been written for it. The two ways this data goes
// wrong are both §12 rules, and both are invisible if the view is a list of
// menu blocks instead:
//
//   * §12.8 — a meal with no menu block. It shows here as a meal with nothing
//     written under it, which is the state the kitchen needs to see now rather
//     than at print time.
//   * §12.7 — a block whose `fnbId` no longer resolves, usually because the
//     meal it was written for was deleted or re-timed. It shows at the end,
//     with its dishes intact, and can be pointed at another meal in one press.
//     Nothing deletes it: an evening's menu is not something to lose quietly.

import { getEvent, update } from '../app.js';
import { attendeeName, fnbCount } from '../derive.js';
import { formatDate, formatTimeRange } from '../dates.js';
import {
  el,
  reconcile,
  setHidden,
  setText,
  setValue,
  toggleClass
} from '../dom.js';
import { lineList, optionSignature, rowButton, textField } from './fields.js';
import { draftList } from './rows.js';

/** The menu blocks of an event, always an array. */
function blocksOf(event) {
  return Array.isArray(event && event.menu) ? event.menu : [];
}

/** The F&B services of an event, always an array. */
function servicesOf(event) {
  return Array.isArray(event && event.foodAndBev) ? event.foodAndBev : [];
}

/** The block written for a meal, or null. */
function blockFor(event, fnbId) {
  return blocksOf(event).find((block) => block && block.fnbId === fnbId) || null;
}

/**
 * Run a mutator against one menu block, inside an `update()`.
 *
 * Blocks are found by `fnbId`, never by position: a block is added when a menu
 * is written and removed when one is deleted, so an index would be addressing
 * a different meal by the second edit.
 *
 * @param {string} fnbId
 * @param {(block: object, blocks: object[]) => void} mutate
 */
function writeBlock(fnbId, mutate) {
  update((draft) => {
    const blocks = draftList(draft, 'menu');
    const block = blocks.find((entry) => entry && entry.fnbId === fnbId);
    if (!block) return;
    if (!Array.isArray(block.courses)) block.courses = [];
    mutate(block, blocks);
  });
}

/**
 * The menu editor.
 *
 * @returns {{node: HTMLElement, update: (event: object) => void}}
 */
export function createMenuEditor() {
  const missingLine = el('p', { class: 'tally__missing', hidden: true });
  const orphanLine = el('p', { class: 'tally__orphan', hidden: true });
  const dietaryLine = el('p', { class: 'tally__dietary', hidden: true });

  const tally = el('div', { class: 'tally tally--menu' }, [
    el('p', { class: 'tally__total' }, [
      el('span', { text: 'Menus written' }),
      el('span', { class: 'tally__figure', 'data-figure': 'written' })
    ]),
    missingLine,
    orphanLine,
    dietaryLine
  ]);
  const writtenFigure = tally.querySelector('[data-figure="written"]');

  const list = el('div', { class: 'menublocks' });

  const emptyNote = el('p', {
    class: 'rows__empty',
    text: 'No meal services yet. Add them in Food & Beverage and each one shows up here to be '
      + 'written.'
  });

  const legend = el('p', {
    class: 'editor__legend',
    text: 'One block per meal service, named by the meal, its date and its time, so it is always '
      + 'obvious which service is being written. Times and covers come from Food & Beverage — '
      + 'move a meal there and it moves here.'
  });

  const node = el('div', { class: 'editor editor--menu' }, [
    tally,
    list,
    emptyNote,
    legend
  ]);

  return {
    node,
    update(event) {
      const services = servicesOf(event);
      const blocks = blocksOf(event);
      const served = new Set(services.map((service) => service && service.id));

      const written = services.filter((service) => blockFor(event, service.id)).length;
      setText(writtenFigure, `${written} of ${services.length}`);

      const missing = services.length - written;
      setHidden(missingLine, missing === 0);
      setText(missingLine, missing === 1
        ? 'One meal service has no menu written.'
        : `${missing} meal services have no menu written.`);

      // §12.7 — blocks pointing at a meal that is not there any more.
      const orphans = blocks.filter((block) => !block || !served.has(block.fnbId));
      setHidden(orphanLine, orphans.length === 0);
      setText(orphanLine, orphans.length === 1
        ? 'One menu is written for a meal service that is no longer in the file. It is at the '
          + 'bottom, with its dishes.'
        : `${orphans.length} menus are written for meal services that are no longer in the file.`);

      // The allergies block prints on this document (§8 B), and it is the one
      // thing that changes what gets cooked (§5, v5 changes).
      const dietary = (Array.isArray(event.attendees) ? event.attendees : [])
        .filter((attendee) => String((attendee && attendee.dietary) || '').trim());
      setHidden(dietaryLine, dietary.length === 0);
      if (dietary.length) {
        setText(dietaryLine, `Allergies and accommodations: ${dietary
          .map((attendee) => `${attendeeName(attendee) || 'unnamed guest'} (${attendee.dietary.trim()})`)
          .join('; ')}.`);
      }

      setHidden(emptyNote, services.length > 0 || orphans.length > 0);

      const items = [
        ...services.map((service, index) => ({
          key: `meal:${service.id || index}`,
          kind: 'meal',
          service
        })),
        ...orphans.map((block, index) => ({
          key: `orphan:${(block && block.fnbId) || index}`,
          kind: 'orphan',
          block
        }))
      ];

      const entries = reconcile(list, items, (item) => item.key, (item) =>
        (item.kind === 'meal'
          ? createMealBlock(item.service.id)
          : createOrphanBlock((item.block && item.block.fnbId) || '')));
      entries.forEach((entry, index) => entry.update(event, items[index]));
    }
  };
}

/** One meal service, with its menu under it or an offer to write one. */
function createMealBlock(fnbId) {
  const name = el('h4', { class: 'menublock__meal' });
  const when = el('p', { class: 'menublock__when' });
  const covers = el('span', { class: 'menublock__covers' });

  const courses = el('div', { class: 'courses' });

  const addCourse = el('button', { type: 'button', class: 'btn btn--small', text: 'Add a course' });
  addCourse.addEventListener('click', () => {
    let landed = 0;
    writeBlock(fnbId, (block) => {
      block.courses.push({ heading: '', items: [] });
      landed = block.courses.length - 1;
    });
    const course = courses.children[landed];
    const field = course && course.querySelector('[data-field="heading"]');
    if (field) field.focus();
  });

  const removeMenu = el('button', {
    type: 'button',
    class: 'btn btn--small btn--danger',
    text: 'Delete this menu'
  });
  removeMenu.addEventListener('click', () => deleteMenu(fnbId));

  const startMenu = el('button', {
    type: 'button',
    class: 'btn btn--primary',
    text: 'Write a menu'
  });
  startMenu.addEventListener('click', () => {
    update((draft) => {
      const blocks = draftList(draft, 'menu');
      if (blocks.some((block) => block && block.fnbId === fnbId)) return;
      blocks.push({ fnbId, courses: [{ heading: '', items: [] }] });
    });
    const field = courses.querySelector('[data-field="heading"]');
    if (field) field.focus();
  });

  const none = el('div', { class: 'menublock__none' }, [
    el('p', {
      class: 'menublock__nonetext',
      text: 'No menu written for this service. The pre-print check lists it; the kitchen would '
        + 'rather know now.'
    }),
    startMenu
  ]);

  const written = el('div', { class: 'menublock__written' }, [
    courses,
    el('div', { class: 'menublock__foot' }, [addCourse, removeMenu])
  ]);

  const node = el('section', { class: 'menublock', 'data-row': fnbId }, [
    el('header', { class: 'menublock__head' }, [name, when, covers]),
    none,
    written
  ]);

  return {
    node,
    update(event, item) {
      const service = item.service || {};
      setText(name, String(service.meal || '').trim() || 'Untitled meal service');
      const parts = [
        formatDate(service.date),
        formatTimeRange(service.start, service.end),
        String(service.location || '').trim()
      ].filter(Boolean);
      setText(when, parts.join(' · '));

      const count = fnbCount(event, service);
      // §7: "Menu header count: same computed value as the F&B row it
      // references" — so it is asked for, never recomputed another way.
      setText(covers, `${count} ${count === 1 ? 'cover' : 'covers'}`);

      const block = blockFor(event, fnbId);
      setHidden(none, Boolean(block));
      setHidden(written, !block);
      toggleClass(node, 'is-unwritten', !block);

      const list = block && Array.isArray(block.courses) ? block.courses : [];
      const entries = reconcile(courses, list, (course, index) => `course-${index}`,
        (course, key) => createCourse(courses, fnbId, key));
      entries.forEach((entry, index) => entry.update(list[index], index, list.length));
    }
  };
}

/**
 * One course: a heading and an unlimited list of dish lines.
 *
 * §5 stores courses as a plain array, so — as in `lineList` — the node at
 * position *n* is the course at position *n*, and the move buttons carry focus
 * to the destination position.
 */
function createCourse(parent, fnbId, key) {
  const position = Number(String(key).replace('course-', ''));

  const heading = textField({
    field: 'heading',
    label: 'Course',
    placeholder: 'Entrees',
    onInput: (value) => {
      writeBlock(fnbId, (block) => {
        const course = block.courses[position];
        if (course) course.heading = value;
      });
    }
  });

  const dishes = lineList({
    addLabel: 'Add a dish',
    placeholder: 'American Wagyu Beef Tenderloin - Carved to Order',
    emptyText: 'No dishes in this course yet.',
    itemLabel: 'Dish',
    write: (mutate) => {
      writeBlock(fnbId, (block) => {
        const course = block.courses[position];
        if (!course) return;
        if (!Array.isArray(course.items)) course.items = [];
        mutate(course.items);
      });
    }
  });

  const moveUp = rowButton('course-up', 'Move course up', '↑');
  const moveDown = rowButton('course-down', 'Move course down', '↓');
  const remove = rowButton('course-remove', 'Delete course', '✕', 'btn--danger');

  const moveCourse = (delta) => {
    writeBlock(fnbId, (block) => {
      const to = position + delta;
      if (position < 0 || position >= block.courses.length || to < 0 || to >= block.courses.length) return;
      const [moved] = block.courses.splice(position, 1);
      block.courses.splice(to, 0, moved);
    });
    focusCourse(parent, position + delta, delta < 0 ? ['course-up', 'course-down'] : ['course-down', 'course-up']);
  };
  moveUp.addEventListener('click', () => moveCourse(-1));
  moveDown.addEventListener('click', () => moveCourse(1));
  remove.addEventListener('click', () => {
    const dishCount = countDishes(fnbId, position);
    if (dishCount > 0) {
      const label = headingOf(fnbId, position) || 'this course';
      if (!window.confirm(`Delete ${label}? Its ${dishCount} ${dishCount === 1 ? 'dish' : 'dishes'} `
        + 'go with it, and there is no undo.')) return;
    }
    let total = 0;
    writeBlock(fnbId, (block) => {
      if (position < block.courses.length) block.courses.splice(position, 1);
      total = block.courses.length;
    });
    focusCourse(parent, Math.min(position, total - 1), ['course-remove']);
  });

  const node = el('section', { class: 'course' }, [
    el('header', { class: 'course__head' }, [
      heading.root,
      el('div', { class: 'course__controls' }, [moveUp, moveDown, remove])
    ]),
    dishes.node
  ]);

  return {
    node,
    update(course, index, total) {
      setValue(heading.input, (course && course.heading) || '');
      dishes.update(course && course.items);
      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;
    }
  };
}

/** A course's heading, read from the live event for a confirmation. */
function headingOf(fnbId, position) {
  const event = getEvent();
  const block = event ? blockFor(event, fnbId) : null;
  const course = block && Array.isArray(block.courses) ? block.courses[position] : null;
  return course ? String(course.heading || '').trim() : '';
}

/** How many dishes a course holds, for a confirmation. */
function countDishes(fnbId, position) {
  const event = getEvent();
  const block = event ? blockFor(event, fnbId) : null;
  const course = block && Array.isArray(block.courses) ? block.courses[position] : null;
  return course && Array.isArray(course.items) ? course.items.length : 0;
}

/** Focus a control on the course now at `position`. */
function focusCourse(parent, position, controls) {
  if (position < 0) return;
  const node = parent.children[position];
  if (!node) return;
  for (const control of controls) {
    const button = node.querySelector(`[data-control="${control}"]`);
    if (button && !button.disabled) {
      button.focus();
      return;
    }
  }
  const field = node.querySelector('[data-field="heading"]');
  if (field) field.focus();
}

/**
 * A menu block whose meal is gone — §12.7.
 *
 * Shown with its dishes, because the dishes are what identify it: the meal it
 * names does not exist to be named. It can be pointed at any service that has
 * no menu of its own, which is the repair in one press, or deleted outright,
 * which asks first.
 */
function createOrphanBlock(fnbId) {
  const summary = el('p', { class: 'orphan__summary' });

  const attach = el('select', { class: 'input input--select', 'data-field': 'attach' });
  let signature = '';
  attach.addEventListener('change', () => {
    const target = attach.value;
    attach.value = '';
    if (!target) return;
    update((draft) => {
      const blocks = draftList(draft, 'menu');
      const block = blocks.find((entry) => entry && entry.fnbId === fnbId);
      if (!block) return;
      if (blocks.some((entry) => entry && entry.fnbId === target)) return;
      block.fnbId = target;
    });
  });

  const remove = el('button', {
    type: 'button',
    class: 'btn btn--small btn--danger',
    text: 'Delete this menu'
  });
  remove.addEventListener('click', () => deleteMenu(fnbId));

  const node = el('section', { class: 'menublock menublock--orphan' }, [
    el('header', { class: 'menublock__head' }, [
      el('h4', { class: 'menublock__meal', text: 'Written for a meal that is gone' }),
      el('p', {
        class: 'menublock__when',
        text: 'The meal service this menu was written for is no longer in the file. Point it at '
          + 'another service, or delete it.'
      })
    ]),
    summary,
    el('div', { class: 'orphan__controls' }, [
      el('label', { class: 'field' }, [
        el('span', { class: 'field__label', text: 'Attach to' }),
        attach
      ]),
      remove
    ])
  ]);

  return {
    node,
    update(event, item) {
      const block = item.block || {};
      const courses = Array.isArray(block.courses) ? block.courses : [];
      const dishes = courses.reduce((total, course) =>
        total + ((course && course.items) || []).length, 0);
      const preview = courses
        .map((course) => {
          const items = ((course && course.items) || []).filter(Boolean);
          const label = String((course && course.heading) || '').trim() || 'Untitled course';
          return items.length ? `${label}: ${items.join(', ')}` : label;
        })
        .join(' · ');
      setText(summary, `${dishes} ${dishes === 1 ? 'dish' : 'dishes'}${preview ? ` — ${preview}` : ''}`);

      // Only services with no menu of their own: attaching to one that already
      // has a menu would put two blocks on one meal, which is the state §12.7
      // exists to end rather than a second way into it.
      const free = servicesOf(event).filter((service) =>
        service && service.id && !blockFor(event, service.id));
      const options = [
        { value: '', label: free.length ? 'Choose a meal service' : 'No service is free' },
        ...free.map((service) => ({
          value: service.id,
          label: `${String(service.meal || 'Untitled').trim()} — ${[formatDate(service.date),
            formatTimeRange(service.start, service.end)].filter(Boolean).join(', ')}`
        }))
      ];
      const next = optionSignature(options);
      if (next !== signature) {
        signature = next;
        attach.replaceChildren(...options.map((option) =>
          el('option', { value: option.value, text: option.label })));
      }
      attach.disabled = free.length === 0;
    }
  };
}

/** Delete a menu block, with its dish count named first. */
function deleteMenu(fnbId) {
  const event = getEvent();
  const block = event ? blockFor(event, fnbId) : null;
  if (!block) return;

  const dishes = (Array.isArray(block.courses) ? block.courses : [])
    .reduce((total, course) => total + ((course && course.items) || []).length, 0);
  const prompt = dishes
    ? `Delete this menu? Its ${dishes} ${dishes === 1 ? 'dish' : 'dishes'} go with it, and there `
      + 'is no undo.'
    : 'Delete this menu? Nothing is written in it.';
  if (!window.confirm(prompt)) return;

  update((draft) => {
    const blocks = draftList(draft, 'menu');
    const index = blocks.findIndex((entry) => entry && entry.fnbId === fnbId);
    if (index >= 0) blocks.splice(index, 1);
  });
}
