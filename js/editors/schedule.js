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
//
// [v14] Each day of that preview carries the one action that is about a whole
// day rather than about a row: copy this day onto another one (§5, v14
// changes). A weekend that hunts at the same hour every morning was three
// identical sets of rows typed out by hand, and the day block is the only place
// in this editor where a day exists as a thing to point at — the rows below are
// one flat list.

import { findingsFor, getEvent, update } from '../app.js';
import { itineraryFor } from '../derive.js';
import { datesBetween, formatDate, formatTime, formatTimeRange } from '../dates.js';
import { copyDayInto, defaultTarget, planCopyDay } from '../copyday.js';
import { newId } from '../ids.js';
import { OTHER_OPTION } from '../reference.js';
import {
  activityOptions,
  customActivities,
  forgetActivity,
  isKnownActivity,
  rememberActivity
} from '../activities.js';
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
import { dateField, optionSignature, rowButton, timeField, warnLine } from './fields.js';
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
    text: 'Three blank rows a day, ready to fill in. An entry with no start time prints at the '
      + 'end of its day, and an empty one prints nothing at all.'
  });

  // [v10] The custom activities, and the way off the list. Removing one takes
  // it off this machine's list and off this event's copy; every itinerary row
  // that used it keeps the words, because a row stores the words (§6 [v10]).
  const customList = el('ul', { class: 'activities' });
  const customs = el('div', { class: 'activities__wrap', hidden: true }, [
    el('h4', { class: 'activities__title', text: 'Activities you have added' }),
    customList,
    el('p', {
      class: 'activities__note',
      text: 'Removing one takes it off the list here and in the saved file. Itinerary rows that '
        + 'already say it are not touched.'
    })
  ]);

  const node = el('div', { class: 'editor editor--schedule' }, [
    preview,
    el('div', { class: 'editor__table' }, [columns, list, emptyNote]),
    el('div', { class: 'editor__foot' }, [addButton, legend]),
    customs
  ]);

  return {
    node,
    update(event) {
      const entries = Array.isArray(event.schedule) ? event.schedule : [];
      const meta = event.meta || {};

      const days = datesBetween(meta.startDate, meta.endDate);
      setHidden(previewBody, days.length === 0);
      setHidden(previewEmpty, days.length > 0);
      const dayEntries = reconcile(previewBody, days, (date) => date, (date) =>
        createPreviewDay(date));
      dayEntries.forEach((entry, index) => entry.update(event, days[index]));

      setHidden(emptyNote, entries.length > 0);
      setHidden(columns, entries.length === 0);

      const rows = reconcile(list, entries, (entry) => entry.id, (entry) =>
        createScheduleRow(list, entry.id));
      rows.forEach((row, index) => row.update(event, entries[index], index, entries.length));

      const added = customActivities(event);
      setHidden(customs, added.length === 0);
      const chips = reconcile(customList, added, (name) => name.toLowerCase(), (name) =>
        createActivityChip(name));
      chips.forEach((chip, index) => chip.update(added[index]));
    }
  };
}

/**
 * One day of the merged itinerary.
 *
 * The lines are read-only — the rows below are the edit — and [v14] the one
 * control here is about the day as a whole rather than about any line in it.
 */
function createPreviewDay(date) {
  const heading = el('h4', { class: 'preview__day' });
  const body = el('ul', { class: 'preview__lines' });
  const empty = el('p', { class: 'preview__none', text: 'Nothing on this day yet.' });
  const copy = createDayCopy(date);
  const node = el('div', { class: 'preview__block' }, [heading, body, empty, copy.node]);

  return {
    node,
    update(event, day) {
      setText(heading, formatDate(day));
      const items = itineraryFor(event, day);
      setHidden(empty, items.length > 0);
      const lines = reconcile(body, items, (item, index) => `${item.source}:${item.id || index}`,
        () => createPreviewLine());
      lines.forEach((line, index) => line.update(items[index]));
      copy.update(event);
    }
  };
}

/**
 * [v14] Copy this day onto another day — BUILD-SPEC §5 (v14 changes).
 *
 * Behind a disclosure rather than sitting open on every day: four days of an
 * event is four of these, and a control that is used once a weekend should not
 * be four rows of furniture above the rows that are used all day.
 *
 * The target it offers is the next day of the event, because that is the shape
 * of the thing being solved — Saturday onto Sunday — and any day in the range
 * can be chosen instead. **One day at a time.** There is no "and the rest of
 * the week": a coordinator who wants three days presses this three times and
 * sees the three answers, and the one who wanted one day has not had to undo
 * two.
 *
 * Nothing in here is event state. The target sits in this closure, so a
 * keystroke somewhere else in the form — which re-renders this whole editor —
 * cannot reset a half-made choice back to the default.
 *
 * @param {string} date the day this block is about
 */
function createDayCopy(date) {
  /** The day chosen, once somebody has chosen one. '' means "use the default". */
  let target = '';
  /** The last day this panel copied onto, so a second press cannot double it. */
  let copiedTo = '';
  /** The option list currently drawn, so it is rebuilt only when the days move. */
  let signature = '';

  const panelId = `copyday-${date}`;

  const toggle = el('button', {
    type: 'button',
    class: 'linkish copyday__open',
    'data-control': 'copy-day',
    'aria-expanded': 'false',
    'aria-controls': panelId,
    text: 'Copy this day to another day'
  });

  const select = el('select', { class: 'input input--select', 'data-field': 'copy-target' });
  const go = el('button', { type: 'button', class: 'btn btn--primary', text: 'Copy the day' });
  const close = el('button', { type: 'button', class: 'btn', text: 'Close' });

  // §5 (v14 changes) — said where the action is. Meals are seeded onto every
  // day in range (seed.js), so copying them would serve breakfast twice; an
  // omission nobody explains reads as something that is broken.
  const note = el('p', {
    class: 'copyday__note',
    text: 'Times and what is happening. Meals are not copied — every day already has its own '
      + 'breakfast, lunch and dinner.'
  });
  const said = el('p', { class: 'copyday__said', role: 'status', hidden: true });

  const panel = el('div', { class: 'copyday__panel', id: panelId, hidden: true }, [
    el('div', { class: 'copyday__row' }, [
      el('label', { class: 'field' }, [
        el('span', { class: 'field__label', text: 'Copy to' }),
        select
      ]),
      go,
      close
    ]),
    note,
    said
  ]);

  const node = el('div', { class: 'copyday', hidden: true }, [toggle, panel]);

  /** Open or shut, and say so where a screen reader will hear it. */
  function show(open) {
    setHidden(panel, !open);
    toggle.setAttribute('aria-expanded', String(open));
  }

  /**
   * What the button under this line would do, said before it is pressed.
   *
   * Called from the handlers as well as from the render, because opening the
   * panel and choosing a day are not writes: nothing re-renders this editor,
   * so nothing else would put the sentence up.
   */
  function sayWhatWouldHappen() {
    if (panel.hidden || !select.value || select.value === copiedTo) return;
    const plan = planCopyDay(getEvent(), date, select.value);
    setText(said, plan.copies === 0 ? 'Nothing on this day to copy yet.' : sayPlan(plan));
    setHidden(said, false);
  }

  toggle.addEventListener('click', () => {
    const opening = panel.hidden;
    show(opening);
    if (opening) {
      sayWhatWouldHappen();
      select.focus();
    }
  });
  close.addEventListener('click', () => {
    show(false);
    toggle.focus();
  });

  select.addEventListener('change', () => {
    target = select.value;
    // A different day is a different copy, so the guard against copying the
    // same day twice comes off.
    go.disabled = false;
    sayWhatWouldHappen();
  });

  go.addEventListener('click', () => {
    const to = select.value;
    if (!to || to === date) return;

    let done = { copied: 0, cleared: 0 };
    update((draft) => {
      done = copyDayInto(draft, date, to);
    });

    copiedTo = to;
    target = to;
    go.disabled = true;
    setText(said, sayCopy(done, to));
    setHidden(said, false);
  });

  return {
    node,
    update(event) {
      const meta = (event && event.meta) || {};
      const days = datesBetween(meta.startDate, meta.endDate).filter((day) => day !== date);

      // A one-day event has nowhere to copy to, and a day outside the range is
      // not a day of this event. Either way there is no action, so there is no
      // control — and the panel goes with it, so it cannot be left open over a
      // select with nothing in it.
      setHidden(node, days.length === 0);
      if (!days.length) {
        show(false);
        return;
      }

      const next = optionSignature(days.map((day) => ({ value: day, label: formatDate(day) })));
      if (next !== signature) {
        signature = next;
        select.replaceChildren(...days.map((day) =>
          el('option', { value: day, text: formatDate(day) })));
      }

      // The default is re-asked rather than remembered: the dates move, and
      // "the next day" on a range that has since changed is a different day.
      if (!target || !days.includes(target)) target = defaultTarget(event, date) || days[0];
      setValue(select, target);
      go.disabled = select.value === copiedTo;

      // Kept current while the panel is open: a row typed into either day
      // between opening this and pressing the button changes the answer, and
      // this sentence is what somebody is reading when they decide.
      sayWhatWouldHappen();
    }
  };
}

/** "4 rows" / "one row", for a sentence rather than a count beside a label. */
function rowCount(n) {
  return n === 1 ? 'one row' : `${n} rows`;
}

/** What a copy would do, in one sentence, before it does it. */
function sayPlan(plan) {
  const parts = [`Would copy ${rowCount(plan.copies)} to ${formatDate(plan.to)}`];
  if (plan.clears) parts.push(`clearing ${rowCount(plan.clears)} left blank there`);
  if (plan.keeps) {
    parts.push(`${rowCount(plan.keeps)} already written on that day ${plan.keeps === 1 ? 'stays' : 'stay'}`);
  }
  return `${parts.join(', ')}.`;
}

/** And what it did, afterwards. §5 (v14 changes) asks for both numbers. */
function sayCopy(done, to) {
  const cleared = done.cleared
    ? ` ${rowCount(done.cleared)} left blank there ${done.cleared === 1 ? 'was' : 'were'} cleared first.`
    : ' Nothing was cleared.';
  return `Copied ${rowCount(done.copied)} to ${formatDate(to)}.${cleared}`;
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

/**
 * [v10] What is happening: a select of the activity list, and Other, which
 * takes free text and offers to keep it. BUILD-SPEC §6 [v10].
 *
 * The row stores the words, never an index into the list — which is what lets a
 * custom activity be removed from the list without touching a single itinerary
 * that used it, and what lets a file authored anywhere open here with its
 * labels intact under Other.
 */
function createActivityCell(id) {
  let typed = '';

  const select = el('select', { class: 'input input--select', 'data-field': 'label' });
  const other = el('input', {
    type: 'text',
    class: 'input',
    'data-field': 'labelOther',
    placeholder: 'What is happening',
    autocomplete: 'off',
    autocapitalize: 'words'
  });
  const keep = el('button', {
    type: 'button',
    class: 'linkish',
    'data-control': 'keep-activity',
    text: 'Add to the list'
  });

  select.addEventListener('change', () => {
    if (select.value === OTHER_OPTION) {
      write(id, 'label', typed);
      other.focus();
      return;
    }
    write(id, 'label', select.value);
  });

  other.addEventListener('input', () => {
    typed = other.value;
    write(id, 'label', other.value);
  });

  keep.addEventListener('click', () => {
    const event = getEvent();
    const next = rememberActivity(event, other.value);
    if (!next) return;
    update((draft) => {
      draft.customActivities = next;
    });
    other.focus();
  });

  const root = el('div', { class: 'cell cell--activity' }, [
    el('label', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'What is happening' }),
      select
    ]),
    el('div', { class: 'activity__other' }, [other, keep])
  ]);

  let signature = '';

  return {
    root,
    update(event, entry) {
      const stored = String((entry && entry.label) || '');
      const options = activityOptions(event);

      const next = optionSignature(options.map((name) => ({ value: name, label: name })));
      if (next !== signature) {
        signature = next;
        select.replaceChildren(
          el('option', { value: '', text: 'Not set' }),
          ...options.map((name) => el('option', { value: name, text: name })),
          el('option', { value: OTHER_OPTION, text: 'Other' })
        );
      }

      const listed = options.includes(stored);
      const isOther = Boolean(stored) && !listed;
      if (isOther) typed = stored;

      setValue(select, listed ? stored : (isOther ? OTHER_OPTION : ''));
      const showing = select.value === OTHER_OPTION;
      setHidden(root.querySelector('.activity__other'), !showing);
      setValue(other, showing ? (stored || typed) : '');
      // Nothing to add when the box is empty, and nothing to add when the list
      // already has it — an offer that does nothing is worse than no offer.
      setHidden(keep, !showing || !other.value.trim() || isKnownActivity(event, other.value));
    }
  };
}

/** One custom activity, with the way off the list. */
function createActivityChip(name) {
  const label = el('span', { class: 'chip__name' });
  const drop = el('button', {
    type: 'button',
    class: 'chip__drop',
    'data-control': 'forget-activity',
    'aria-label': `Remove ${name} from the list`,
    title: `Remove ${name} from the list`
  }, [el('span', { 'aria-hidden': 'true', text: '✕' })]);

  drop.addEventListener('click', () => {
    const next = forgetActivity(getEvent(), name);
    update((draft) => {
      draft.customActivities = next;
    });
  });

  const node = el('li', { class: 'chip' }, [label, drop]);

  return {
    node,
    update(current) {
      setText(label, current);
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
  const activity = createActivityCell(id);

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
    activity.root,
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
      activity.update(event, entry);

      // A nudge, not a fence: §12.9 warns about a date outside the event and
      // never blocks it, so a date typed or pasted outside the range is kept.
      setAttr(date.input, 'min', meta.startDate);
      setAttr(date.input, 'max', meta.endDate);

      moveUp.disabled = index === 0;
      moveDown.disabled = index === total - 1;

      // [v12] §12's findings about this row — rule 9's date and rule 12's meal
      // typed into both arrays — written once in validate.js and shown here,
      // then what this editor checks that §12 does not.
      const mine = findingsFor(id).filter((item) => item.area === 'schedule');
      warn.set([...mine, ...entryWarnings(event, entry, meta)]);
      toggleClass(node, 'has-finding', mine.length > 0);
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

  if (entry.start && entry.end && entry.end < entry.start) {
    messages.push('Ends before it starts.');
  }

  // [v12] The exact-time echo is §12.12 and is written once in validate.js.
  // What is left here is the looser one it deliberately does not cover: the
  // same meal on the same date at a *different* time, which will not print
  // twice and so is not a §12 fault, but is almost always the leftover row from
  // before the meal moved.
  const echo = mealEcho(event, entry);
  if (echo && !echo.sameTime) {
    const when = formatTime(echo.meal.start) || 'no time set';
    messages.push(`Food & Beverage already serves "${echo.meal.meal}" at ${when} on this date. `
      + 'Meals are merged into the itinerary from there, so this entry is probably the leftover one.');
  }
  return messages;
}

/** Move an entry one place, and keep the finger on the button that moved it. */
function moveEntry(list, id, delta) {
  update((draft) => moveRow(draftList(draft, 'schedule'), id, delta));
  focusRowControl(list, id, delta < 0 ? ['up', 'down'] : ['down', 'up']);
}
