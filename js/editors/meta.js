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
//
// [v13] AND ONE THING THIS EDITOR NOW OFFERS TO DO, which is the exception that
// proves the rule above. When both dates move by the same number of days the
// event has been rescheduled rather than corrected, and every row it holds
// belongs on the new days: leaving them behind produced forty-five findings on
// a real order and a coordinator reading none of them (§5, v13 changes). The
// offer names the offset and counts what would travel before anything travels,
// and it is still an offer — a mistyped year and a rescheduled weekend look
// identical from here, so the app does not get to decide which it was.

import { getEvent, update } from '../app.js';
import { attendeeName, includeFlags, roomingWindow } from '../derive.js';
import { dayOffset, datesBetween, formatDateRange, formatDateShort } from '../dates.js';
import { BRANDS, DEFAULT_BRAND_ID, brandFor } from '../reference.js';
import { seedForDates } from '../seed.js';
import { plan, shiftEvent } from '../shift.js';
import { el, reconcile, setChecked, setHidden, setText, setValue } from '../dom.js';

/** How many outside-the-range items are named before the list summarises. */
const MAX_LISTED = 8;

/** [v10] The fields that seed a day when they change. §5 (v10 changes). */
const DATE_FIELDS = new Set(['startDate', 'endDate']);

/**
 * [v13] The date move in progress, or null. BUILD-SPEC §5 (v13 changes).
 *
 * The two date fields are typed one after the other, so a range that moves is
 * never a single edit: Nov 14–16 to Dec 2–4 passes through Dec 2 – Nov 16, and
 * only the second keystroke makes a shift out of it. `from` is therefore the
 * pair as it stood before the first of those edits, and it is held here rather
 * than in the event because it describes an interaction and not a document —
 * the same reason `lastMigration` sits beside the event in app.js instead of
 * inside it.
 *
 *   `from`    the dates before this move began
 *   `offer`   `{days}` when the pair is a same-offset move of `from`, else null
 *   `created` what seeding put down during the move, which an accepted shift
 *             clears rather than moves (js/shift.js)
 *
 * **WHERE THE MOVE ENDS IS THE WHOLE OF THIS.** The first draft let `from`
 * stand until somebody answered an offer, and got both halves of that wrong.
 * A move that never raised an offer never ended, so `from` stayed pinned to the
 * first date keystroke of the session: on an order started with New that pair
 * is two empty strings, `dayOffset` answers null for ever, and the offer could
 * never fire again for the life of that order — dead in the flow §10 [v13]
 * made the way in. And an anchor an hour old is worse than no anchor: correct
 * one end, author against the corrected range all afternoon, nudge the other
 * end, and a pair that lines up with that stale snapshot reads as a move,
 * offering to walk every row off the day it was written for.
 *
 * So the move lasts exactly one interaction with the two date fields: it is
 * dropped by **any write that is not a date write**, which is the render below
 * reading `writingDates`. Typing an itinerary label, adding a guest, loading a
 * file, pressing New — each of them ends it, and the next date edit anchors
 * fresh on the dates as they stand. Two date fields typed one after the other
 * is the interaction this is for, and nothing else is.
 */
let move = null;

/**
 * [v13] Whether the write now in flight is one of this editor's date writes.
 *
 * Set by `writeMeta` immediately before `update()`, read and cleared by the
 * render `update()` runs. Every write in this app renders this editor (shell.js
 * subscribes and calls it), so a render arriving with this false is a render
 * caused by something other than a date — which is where a move ends.
 */
let writingDates = false;

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

/** [v9] The two documents that can be appended to the order. §5, §8. */
const INCLUDES = [
  {
    key: 'rooming',
    label: 'The room grid',
    note: 'Rooms down, nights across, and anyone staying with no room.'
  },
  {
    key: 'menu',
    label: 'The menu blocks',
    note: 'One block per meal service, with its dishes.'
  }
];

/** The event's `meta`, created if a hand-edited file arrived without one. */
function metaOf(draft) {
  if (!draft.meta || typeof draft.meta !== 'object') draft.meta = {};
  return draft.meta;
}

/** Write one meta field. */
function writeMeta(key, value) {
  if (!DATE_FIELDS.has(key)) {
    update((draft) => {
      metaOf(draft)[key] = value;
    });
    return;
  }

  // [v13] A date. Everything below decides one thing — whether this edit has
  // turned into a range that has *moved* — and it is decided before the write
  // rather than inside it, because the render that shows the offer happens
  // inside `update()` and would otherwise be one keystroke behind.
  const meta = (getEvent() || {}).meta || {};
  const before = { start: meta.startDate || '', end: meta.endDate || '' };
  if (!move) move = { from: before, offer: null, created: [] };

  const after = {
    start: key === 'startDate' ? value : before.start,
    end: key === 'endDate' ? value : before.end
  };
  const first = dayOffset(move.from.start, after.start);
  const last = dayOffset(move.from.end, after.end);
  move.offer = first !== null && last !== null && first === last && first !== 0
    ? { days: first }
    : null;

  // An offer with nothing behind it is not an offer. A range moved on an event
  // that has no dated rows yet is just a range being set, and asking about it
  // would train the answer out of somebody before the question ever mattered.
  if (move.offer && plan(getEvent(), move.offer.days, move.created).total === 0) {
    move.offer = null;
  }

  // This write is part of the move — see `move` above. Read and cleared by the
  // render that `update()` is about to run.
  writingDates = true;
  update((draft) => {
    metaOf(draft)[key] = value;
    // [v10] Setting or changing the event dates seeds the days that have not
    // been offered rows yet (§5, v10 changes). Inside the same write, so a date
    // change and the three meals it creates are one edit and one render — and
    // so that an undo of the date, if this ever grows one, takes them with it.
    //
    // [v13] Seeding is NOT held back while an offer is outstanding, and the
    // first draft of this held it back. An offer nobody answers is not a
    // declined offer — it is one that goes down the next time the page is
    // reloaded, taking the deferred seeding with it and leaving three days of
    // an event that could never be seeded again, because `markSeeded` records
    // the range on the way back in. So the days are seeded now, as on any other
    // date change, and an accepted shift takes those rows back off before it
    // moves anything (js/shift.js). Which rows those are is what is recorded
    // here.
    move.created.push(...seedForDates(draft).created);
  });
}

/** "18 days later", "a day earlier" — the offset as a person says it. */
function offsetPhrase(days) {
  const size = Math.abs(days);
  const way = days < 0 ? 'earlier' : 'later';
  return size === 1 ? `a day ${way}` : `${size} days ${way}`;
}

/**
 * [v9] Set one inclusion flag.
 *
 * Written as a whole object rather than by reaching into one that may not be
 * there: a file from before v9 has no `includeInOrder` at all, and a file
 * hand-edited to `"includeInOrder": true` has one that is not an object.
 */
function writeInclude(key, on) {
  update((draft) => {
    if (!draft.meta || typeof draft.meta !== 'object') draft.meta = {};
    const current = includeFlags(draft);
    draft.meta.includeInOrder = { ...current, [key]: Boolean(on) };
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

  // [v9] §8: an addition to the order, never a replacement for the standalone
  // document. The note says so on screen, because the one way to read a control
  // called "include in the order" wrongly is as a move rather than a copy.
  const includeBoxes = new Map();
  const includes = el('fieldset', { class: 'includes' }, [
    el('legend', { class: 'includes__legend', text: 'Also print on the Event Order' }),
    el('div', { class: 'includes__set' }, INCLUDES.map((entry) => {
      const input = el('input', { type: 'checkbox', class: 'check__box' });
      input.addEventListener('change', () => writeInclude(entry.key, input.checked));
      includeBoxes.set(entry.key, input);
      return el('label', { class: 'check check--include' }, [
        input,
        el('span', { class: 'check__label' }, [
          el('span', { class: 'check__text', text: entry.label }),
          el('span', { class: 'check__note', text: entry.note })
        ])
      ]);
    })),
    el('p', {
      class: 'includes__foot',
      text: 'The Menu and the Rooming Assignment are generated either way and still print on '
        + 'their own. This adds them to the end of the order; it does not move them.'
    })
  ]);

  const seededNote = el('p', { class: 'editor__legend editor__legend--seeded' });

  const hint = el('p', { class: 'editor__legend' });

  // [v13] The offer. §5 (v13 changes): the offset in days and what would move,
  // said before anything moves. Inline rather than modal — nothing is blocked
  // and nothing is happening, and a dialog over a date field the user is still
  // typing into is a dialog that gets dismissed to get back to the typing.
  const offerTitle = el('h3', { class: 'notice__title' });
  const offerSummary = el('p', { class: 'notice__summary' });
  const offerList = el('ul', { class: 'notice__list' });
  const offerCleared = el('p', { class: 'notice__more', hidden: true });
  const offerFoot = el('p', { class: 'notice__foot' });
  const offerNo = el('button', {
    type: 'button',
    class: 'btn',
    text: 'Leave the content where it is'
  });
  const offerYes = el('button', { type: 'button', class: 'btn btn--primary' });

  /**
   * [v13] Leave the content where it is — the easy answer of the two, and the
   * only control in this app that answers by doing nothing at all.
   *
   * No write: the days were seeded when the dates were typed, exactly as on any
   * other date change, so declining has nothing to undo and nothing to add.
   * Redrawing directly rather than through `update()` is what keeps it that way
   * — a write here would stamp `meta.touchedAt` (§5 [v12]) on an edit the
   * coordinator explicitly declined to make.
   */
  offerNo.addEventListener('click', () => {
    if (!move) return;
    move = null;
    draw(getEvent());
  });

  /**
   * [v13] Move the content. The move is dropped before the write, so the render
   * `update()` runs draws an editor with no offer in it rather than one that
   * has to be told a second time.
   */
  offerYes.addEventListener('click', () => {
    if (!move || !move.offer) return;
    const { days } = move.offer;
    const created = move.created;
    move = null;
    update((draft) => {
      shiftEvent(draft, days, created);
      // Then seeding, as normal, for the new range: the ledger travelled with
      // the content, so the days that arrived carrying rows are offered none.
      seedForDates(draft);
    });
  });
  const offer = el('div', { class: 'notice notice--offer', role: 'status', hidden: true }, [
    offerTitle,
    offerSummary,
    offerList,
    offerCleared,
    offerFoot,
    el('div', { class: 'notice__actions' }, [offerNo, offerYes])
  ]);

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

  const node = el('div', { class: 'editor editor--meta' },
    [grid, offer, seededNote, includes, hint, notice]);

  /**
   * Draw the editor from an event.
   *
   * Named rather than inlined into the returned object because the offer's
   * decline answers by redrawing and not by writing — see `offerNo` above.
   *
   * @param {object} event
   */
  function draw(event) {
    // [v13] Where a date move ends. Every write in this app renders this
    // editor, so a render that is not this editor's own date write is somebody
    // doing something else — and a move is one interaction with the two date
    // fields and nothing more (see `move`).
    if (!writingDates) move = null;
    writingDates = false;
    if (!event) return;

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

    const flags = includeFlags(event);
    for (const [key, input] of includeBoxes) setChecked(input, flags[key]);

    // [v10] What the dates did, said plainly. Rows appearing in two other
    // editors because a date was typed here is the sort of thing that reads
    // as a bug when it is not explained where it happened.
    const days = datesBetween(meta.startDate, meta.endDate).length;
    setText(seededNote, days
      ? `Each day of the event starts with breakfast, lunch and dinner and three blank `
        + `itinerary rows — ${days} ${days === 1 ? 'day' : 'days'} so far. Edit or delete them `
        + 'like any other row; a day already set up is never set up twice, and narrowing the '
        + 'dates deletes nothing.'
      : 'Set both dates and each day of the event starts with breakfast, lunch and dinner and '
        + 'three blank itinerary rows.');

    // The end date cannot sensibly precede the start; the picker says so,
    // and a range typed backwards is still accepted and warned about below.
    const startInput = inputs.get('startDate');
    const endInput = inputs.get('endDate');
    if (meta.startDate) endInput.setAttribute('min', meta.startDate);
    else endInput.removeAttribute('min');
    if (meta.endDate) startInput.setAttribute('max', meta.endDate);
    else startInput.removeAttribute('max');

    setText(hint, defaultsHint(event));

    // [v13] The offer, drawn from the event in hand rather than from anything
    // remembered: what would move is counted now, on what is there now.
    const moving = move && move.offer ? plan(event, move.offer.days, move.created) : null;
    setHidden(offer, !moving);
    if (moving) {
      const way = offsetPhrase(moving.days);
      setText(offerTitle, `These dates moved the event ${way}. Move its content too?`);
      setText(offerSummary,
        `${formatDateRange(move.from.start, move.from.end)} to `
        + `${formatDateRange(meta.startDate, meta.endDate)}. `
        + `${moving.total} dated ${moving.total === 1 ? 'row' : 'rows'} would move ${way}, `
        + 'keeping the day of the event each one is on.');
      const entries = reconcile(offerList, moving.parts, (part) => part.list,
        () => createOfferRow());
      entries.forEach((entry, index) => entry.update(moving.parts[index]));
      setHidden(offerCleared, moving.cleared === 0);
      setText(offerCleared, `${moving.cleared} blank ${moving.cleared === 1 ? 'row' : 'rows'} `
        + 'put down while the dates were half-typed are cleared first.');
      setText(offerFoot, 'Nothing has moved. If you were correcting a date rather than '
        + 'rescheduling, leave this — the rows stay on the days they were written for, and '
        + 'anything now outside the event is listed below.');
      setText(offerYes, `Move all ${moving.total} ${moving.total === 1 ? 'row' : 'rows'} `
        + way);
    }

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

  return {
    node,

    /**
     * [v13] Put the caret in the start date. §10 [v13] — New is the way into a
     * real order, and the dates are the two fields everything else reads from
     * (§5, v2 changes), so a new order opens on them rather than on a form the
     * coordinator has to choose a starting point in.
     */
    focusDates() {
      const start = inputs.get('startDate');
      if (start) start.focus({ preventScroll: true });
    },

    update: draw
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

/** [v13] One line of what would move: "9 meal services". */
function createOfferRow() {
  const node = el('li', {});
  return {
    node,
    update(part) {
      setText(node, `${part.count} ${part.noun}`);
    }
  };
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
