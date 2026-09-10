// Event header editor — BUILD-SPEC §5 `meta`.
//
// [v8] Seven fields now: the fifth is the event's brand. The ranch hosts groups
// that are not the ranch, and the paperwork handed to a group should identify
// the group (§5, v8 changes). Two of the three documents follow this field; the
// Menu never does, which is the one thing about it worth a line of interface
// text, and it gets one below the control rather than being left to surprise
// somebody at the printer.
//
// The other fields, and one thing that is not a field: the event's start and end
// dates are load-bearing. Guests' `arrive` / `depart` default to them (§5, v2
// changes), so narrowing the range changes who is counted present on a night
// without anyone touching the attendee list. Schedule entries, meal services,
// and rooming ranges dated outside the range are §12.9 warnings.
//
// The rule this editor follows: do not repair, do not block, name what falls
// outside. Silently clamping a schedule entry would lose the time somebody
// typed; blocking the edit would stop a coordinator from correcting a date the
// event genuinely moved. So the edit lands and the consequences are listed
// underneath it, live, in the order the user will have to deal with them. The
// §12 validator is still the authority before print; this is the same truth
// shown at the moment the change is made.

import { update } from '../app.js';
import { attendeeName, roomingWindow } from '../derive.js';
import { formatDateShort } from '../dates.js';
import { BRANDS, DEFAULT_BRAND_ID, brandFor } from '../reference.js';
import { el, reconcile, setHidden, setText, setValue } from '../dom.js';

/** How many outside-the-range items are named before the list summarises. */
const MAX_LISTED = 8;

const FIELDS = [
  { key: 'eventName', label: 'Event name', type: 'text', cell: 'wide', autocapitalize: 'words' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'eventLead', label: 'Event lead', type: 'text', autocapitalize: 'words' },
  // [v8] The brand the Event Order and the Rooming Assignment carry. §5, §6.
  { key: 'brandId', label: 'Brand', type: 'select', options: BRANDS },
  { key: 'revisionDate', label: 'Revision date', type: 'date' },
  { key: 'revisedBy', label: 'Revised by', type: 'text', autocapitalize: 'words' }
];

/** Write one meta field. */
function writeMeta(key, value) {
  update((draft) => {
    if (!draft.meta || typeof draft.meta !== 'object') draft.meta = {};
    draft.meta[key] = value;
  });
}

/**
 * The event header editor.
 *
 * @returns {{node: HTMLElement, update: (event: object) => void}}
 */
export function createMetaEditor() {
  const inputs = new Map();

  // §5 (v8 changes), said once where the choice is made. The asymmetry is
  // deliberate, so it is explained rather than merely observed.
  const brandNote = el('p', { class: 'field__note' });

  const grid = el('div', { class: 'metagrid' }, FIELDS.map((field) => {
    const input = field.type === 'select'
      ? el('select', { class: 'input', id: `meta-${field.key}` },
          field.options.map((option) =>
            el('option', { value: option.id, text: option.name })))
      : el('input', {
          type: field.type,
          class: field.type === 'date' ? 'input input--date' : 'input',
          id: `meta-${field.key}`,
          autocomplete: 'off',
          autocapitalize: field.autocapitalize || 'none'
        });
    // Text commits per keystroke so the header bar tracks the name as it is
    // typed; dates and selects commit on change, because a half-typed date
    // reads as empty and a select has no intermediate state to lose.
    input.addEventListener(field.type === 'text' ? 'input' : 'change', () => {
      writeMeta(field.key, input.value);
    });
    inputs.set(field.key, input);

    return el('div', { class: `cell${field.cell ? ` cell--${field.cell}` : ''}` }, [
      el('label', { class: 'field', for: `meta-${field.key}` }, [
        el('span', { class: 'field__label', text: field.label }),
        input
      ]),
      field.key === 'brandId' ? brandNote : false
    ]);
  }));

  const hint = el('p', { class: 'editor__legend' });

  const warnTitle = el('h3', { class: 'notice__title' });
  const warnSummary = el('p', { class: 'notice__summary' });
  const warnList = el('ul', { class: 'notice__list' });
  const warnMore = el('p', { class: 'notice__more', hidden: true });
  const warnFoot = el('p', {
    class: 'notice__foot',
    text: 'Nothing has been changed for you. Fix the dates, or the entries, whichever is wrong.'
  });
  const notice = el('div', { class: 'notice notice--warn', role: 'status', hidden: true }, [
    warnTitle,
    warnSummary,
    warnList,
    warnMore,
    warnFoot
  ]);

  const node = el('div', { class: 'editor editor--meta' }, [grid, hint, notice]);

  return {
    node,
    update(event) {
      const meta = event.meta || {};
      for (const [key, input] of inputs) {
        // The brand is resolved rather than copied — see below.
        if (key === 'brandId') continue;
        setValue(input, meta[key] || '');
      }

      // [v8] The select shows the brand that will actually print, which for an
      // absent or unrecognised id is Maple Ranch (§6) — not a blank control
      // implying no brand at all. Writing `meta.brandId` through raw would set
      // the select to a value no option carries, which blanks it.
      const brand = brandFor(meta.brandId);
      setValue(inputs.get('brandId'), brand.id);
      setText(brandNote, brand.id === DEFAULT_BRAND_ID
        ? 'On the Event Order and the Rooming Assignment. The Menu is always Maple Ranch.'
        : `${brand.name} on the Event Order and the Rooming Assignment. The Menu stays Maple `
          + 'Ranch — the menu is the ranch\'s, not the group\'s.');

      // The end date cannot sensibly precede the start; the picker says so,
      // and a range typed backwards is still accepted and warned about below.
      const startInput = inputs.get('startDate');
      const endInput = inputs.get('endDate');
      if (meta.startDate) endInput.setAttribute('min', meta.startDate);
      else endInput.removeAttribute('min');
      if (meta.endDate) startInput.setAttribute('max', meta.endDate);
      else startInput.removeAttribute('max');

      setText(hint, defaultsHint(event));

      const problems = outsideEventDates(event);
      setHidden(notice, problems.length === 0);
      setText(warnTitle, problems.length === 1
        ? 'One entry falls outside the event dates'
        : `${problems.length} entries fall outside the event dates`);
      // A run of schedule entries would otherwise fill the list and hide the
      // fact that rooming and guests are affected too, which is the part that
      // changes what the coordinator has to do next.
      setText(warnSummary, summarise(problems));
      const listed = problems.slice(0, MAX_LISTED);
      const entries = reconcile(warnList, listed, (item) => item.key, () => createProblemRow());
      entries.forEach((entry, index) => entry.update(listed[index]));
      setHidden(warnMore, problems.length <= MAX_LISTED);
      setText(warnMore, `And ${problems.length - MAX_LISTED} more.`);
    }
  };
}

/**
 * "6 schedule entries, 2 meal services, 5 rooming ranges, 7 guests." — the
 * shape of the problem before its details.
 *
 * @param {{kind: string}[]} problems
 * @returns {string}
 */
function summarise(problems) {
  const nouns = {
    Schedule: ['schedule entry', 'schedule entries'],
    'Food and beverage': ['meal service', 'meal services'],
    Rooming: ['rooming range', 'rooming ranges'],
    Guest: ['guest stay', 'guest stays']
  };
  const counts = new Map();
  for (const problem of problems) {
    counts.set(problem.kind, (counts.get(problem.kind) || 0) + 1);
  }
  const parts = [];
  for (const [kind, count] of counts) {
    const [one, many] = nouns[kind] || [kind, kind];
    parts.push(`${count} ${count === 1 ? one : many}`);
  }
  return `${parts.join(', ')}.`;
}

function createProblemRow() {
  const kind = el('span', { class: 'notice__kind' });
  const text = el('span', { class: 'notice__text' });
  const node = el('li', {}, [kind, text]);
  return {
    node,
    update(item) {
      setText(kind, item.kind);
      setText(text, item.text);
    }
  };
}

/**
 * A plain sentence about who is relying on the event dates, so that changing
 * them is not a silent act. §5 (v2 changes): a guest with no dates of their own
 * takes the event's, which means a narrowed range moves their stay and every
 * count that reads it.
 *
 * @param {object} event
 * @returns {string}
 */
function defaultsHint(event) {
  const meta = event.meta || {};
  if (!meta.startDate || !meta.endDate) {
    return 'Set both dates. Daily counts, and every guest without dates of their own, read from them.';
  }
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];
  const defaulted = attendees.filter((attendee) => !attendee.arrive || !attendee.depart).length;
  if (!defaulted) return 'Every guest has dates of their own.';
  return `${defaulted} of ${attendees.length} ${defaulted === 1 ? 'guest takes an arrival or departure' : 'guests take an arrival or departure'}`
    + ' from these dates. Moving them moves those stays, and the counts with them.';
}

/**
 * Everything dated outside the event range, named. BUILD-SPEC §12.9 and §12.5,
 * shown live rather than held until print.
 *
 * @param {object} event
 * @returns {{key: string, kind: string, text: string}[]}
 */
export function outsideEventDates(event) {
  const meta = (event && event.meta) || {};
  const start = meta.startDate || '';
  const end = meta.endDate || '';
  if (!start || !end) return [];

  const problems = [];
  const outside = (date) => Boolean(date) && (date < start || date > end);

  (Array.isArray(event.schedule) ? event.schedule : []).forEach((entry, index) => {
    if (!entry || !outside(entry.date)) return;
    problems.push({
      key: `schedule:${index}`,
      kind: 'Schedule',
      text: `${entry.label || 'Untitled entry'} on ${formatDateShort(entry.date)}`
    });
  });

  (Array.isArray(event.foodAndBev) ? event.foodAndBev : []).forEach((entry, index) => {
    if (!entry || !outside(entry.date)) return;
    problems.push({
      key: `fnb:${entry.id || index}`,
      kind: 'Food and beverage',
      text: `${entry.meal || 'Untitled service'} on ${formatDateShort(entry.date)}`
    });
  });

  // Rooming rows are ranges, and a row with no dates of its own inherits the
  // guest's, which inherits the event's — so `roomingWindow` is the only honest
  // way to ask where a row actually sits.
  (Array.isArray(event.rooming) ? event.rooming : []).forEach((row, index) => {
    if (!row) return;
    const window = roomingWindow(event, row);
    if (!window.from || !window.to) return;
    if (window.from >= start && window.to <= end) return;
    const where = [row.building, row.room].filter(Boolean).join(', ') || 'Unassigned room';
    problems.push({
      key: `rooming:${index}`,
      kind: 'Rooming',
      text: `${where}, ${formatDateShort(window.from)} to ${formatDateShort(window.to)}`
    });
  });

  (Array.isArray(event.attendees) ? event.attendees : []).forEach((attendee, index) => {
    if (!attendee) return;
    const notes = [];
    if (outside(attendee.arrive)) notes.push(`arrives ${formatDateShort(attendee.arrive)}`);
    if (outside(attendee.depart)) notes.push(`departs ${formatDateShort(attendee.depart)}`);
    if (!notes.length) return;
    problems.push({
      key: `attendee:${attendee.id || index}`,
      kind: 'Guest',
      text: `${attendeeName(attendee) || 'Unnamed guest'} ${notes.join(' and ')}`
    });
  });

  return problems;
}
