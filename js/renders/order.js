// The Event Order — BUILD-SPEC §8 A.
//
// The document ownership actually reads. Its body is the enabled `sections` in
// **array order** and nothing here is pinned to a position: if the outline puts
// Notes first, Notes prints first. That is the whole of §4 — the outline is the
// document — and the moment one section type is special-cased to the top, the
// coordinator's arrangement stops being trustworthy.
//
// Three section types render something other than the array they are named
// after (§8 [v7], [v9]), and all three are easy to get wrong:
//
//   * `schedule` prints the **merged itinerary** from `itineraryFor`, not
//     `schedule[]`. Meals are on it because they come from `foodAndBev[]`, and
//     that merge is the point: dinner moved by half an hour moves here, in the
//     F&B table and on the Menu at once, because all three read one array.
//   * `guests` prints the buildings line — `buildingsInUse[]`,
//     `overflowBuildings[]`, and any building the rooming sheet is using that
//     neither names — and then `attendees[]`. It is the only place either
//     appears on any document (§8 [v9]).
//   * `foodAndBev` prints the F&B schedule table, which the Menu prints too.
//     The repetition is deliberate: the Menu leaves the kitchen on its own and
//     has to say when each service is. [v18] It prints the dietary block only
//     where no enabled `guests` section has — that block rides with the guest
//     list now (§8 [v18]), and no order prints it twice.
//
// Disabled sections do not print at all — that is what disabling is for (§4).
// An *enabled* section holding nothing prints its heading and a quiet note
// (§8 [v8]): a section left blank should be visible on the page rather than
// silently missing.
//
// [v9] After the sections come the inclusions: `meta.includeInOrder` can put
// the room grid and the menu blocks on the end of the order. They are not
// sections — nothing about them reorders or renames, and they always print
// last — and they change nothing about the two standalone documents, which are
// still generated and still printed on their own (§8 [v9]).

import {
  attendeeName,
  buildingsSentence,
  fnbCount,
  itineraryDates,
  itineraryFor,
  staffByPerson
} from '../derive.js';
import { formatDate, formatDateFull, formatDateShort, formatTimeRange } from '../dates.js';
import { typeInfo } from '../sections.js';
import { el } from '../dom.js';
import { dietaryBlock, emptyNote, lines, nameWithTag, section, table } from './parts.js';
import { includedInOrder } from '../include.js';

/**
 * The Event Order document descriptor. `render.js` wraps `body` in the page
 * furniture; everything below the header is decided here.
 */
export const eventOrder = {
  id: 'order',
  label: 'Event Order',
  /** §5 [v8] — operational paperwork carries the group it is for. */
  brandId: (event) => ((event && event.meta) || {}).brandId,
  body: renderOrderBody
};

/**
 * The enabled sections, in array order.
 *
 * @param {object} event
 * @returns {Node[]}
 */
function renderOrderBody(event) {
  const sections = (Array.isArray(event.sections) ? event.sections : [])
    .filter((entry) => entry && entry.enabled !== false);
  const included = includedInOrder(event);

  if (!sections.length && !included.length) {
    return [emptyNote('This order has no sections turned on, so it has no body to print.')];
  }
  return [...sections.map((entry) => renderSection(event, entry)), ...included];
}

/**
 * One section: its user-given title, and whatever its type draws.
 *
 * A type this build has never heard of still prints its heading and says so,
 * rather than leaving a gap where the coordinator put something. A file naming
 * an unknown type is a file from a newer build, and the honest response is to
 * name the gap.
 *
 * @param {object} event
 * @param {object} entry a row of `sections`
 * @returns {HTMLElement}
 */
function renderSection(event, entry) {
  const title = String(entry.title || '').trim() || typeInfo(entry.type).defaultTitle;
  const render = SECTIONS[entry.type];
  if (!render) {
    return section(title, [
      emptyNote(`This section is a "${entry.type}" section, which this version cannot print.`)
    ], 'unknown');
  }
  return section(title, render(event, entry), entry.type);
}

/* ------------------------------------------------------------------ schedule */

/**
 * §8 A — the merged itinerary, grouped by day under a heading per date.
 *
 * The days come from `itineraryDates`, which is the event's own range widened
 * by any date carrying an entry: §12.9 warns about an entry dated outside the
 * event and does not block it, and a document that printed only the range would
 * drop that entry silently.
 */
function renderSchedule(event) {
  const scheduled = (event.schedule || []).length + (event.foodAndBev || []).length;
  if (!scheduled) {
    return [emptyNote('Nothing scheduled yet. Schedule entries and meal services both print here.')];
  }

  const dates = itineraryDates(event);
  if (!dates.length) {
    return [emptyNote('Set the event dates to lay the itinerary out by day.')];
  }

  // [v18] One decision for the whole itinerary, not one per day. Only meals
  // carry a location (§8 [v18] — `foodAndBev` rows have one, schedule rows do
  // not, and that is the model, not an omission), so a day of hunts and
  // downtime has nothing to put in the column and a day with dinner on it has
  // one cell. Deciding per day would mean Friday's table is three columns wide
  // and Saturday's four, and a reader turning the page reads shifted columns as
  // a different table rather than the same one continued.
  const days = dates.map((date) => ({ date, entries: itineraryFor(event, date) }));
  const located = days.some(({ entries }) =>
    entries.some((entry) => String(entry.location || '').trim()));

  const columns = [
    { label: 'Time', class: 'col-time' },
    { label: 'Item', class: 'col-item' },
    ...(located ? [{ label: 'Location', class: 'col-where' }] : [])
  ];

  return days.map(({ date, entries }) => el('div', { class: 'day' }, [
    el('h3', { class: 'day__head', text: formatDateFull(date) }),
    entries.length
      ? table(
          columns,
          entries.map((entry) => [
            formatTimeRange(entry.start, entry.end),
            entry.text,
            ...(located ? [entry.location] : [])
          ]),
          'itin')
      : emptyNote('Nothing scheduled this day.')
  ]));
}

/* ---------------------------------------------------------------- foodAndBev */

/**
 * §8 A — the F&B schedule table, and the dietary block where nothing else
 * carries it.
 *
 * The count is `fnbCount` and is never recomputed here: it composes `serves`
 * with `countBasis` (§7), and a children's seating at 17:30 plus an adults'
 * dinner at 18:30 add up to one sitting only because both read the same rule.
 *
 * [v18] The dietary block moved to the guest list (§8 [v18]), which is the
 * section an order is actually seeded with — so this section prints it only
 * where there is no enabled `guests` section above to have printed it. Either
 * way it prints "None known" rather than disappearing (§8 [v8]): its absence
 * would read as an oversight, and this is the block the kitchen checks before
 * it plates anything.
 */
function renderFoodAndBev(event) {
  const services = event.foodAndBev || [];
  // [v18] The same rule as the itinerary above: a column no service has anything
  // to put in is 1.5in of ruled white space.
  const located = services.some((service) => String(service.location || '').trim());

  const schedule = services.length
    ? table(
        [
          { label: 'Date', class: 'col-date' },
          { label: 'Time', class: 'col-time' },
          { label: 'Meal', class: 'col-item' },
          { label: 'Count', class: 'col-count' },
          ...(located ? [{ label: 'Location', class: 'col-where' }] : [])
        ],
        services.map((service) => [
          formatDate(service.date),
          formatTimeRange(service.start, service.end),
          service.meal || 'Untitled service',
          String(fnbCount(event, service)),
          ...(located ? [service.location || ''] : [])
        ]),
        'fnb')
    : emptyNote('No meal services yet.');

  // [v18] Once per order. The dietary block now rides with the guest list, which
  // is the section that is actually in the outline (§8 [v18]), so this prints it
  // only where there is no guests section to have carried it — an order with
  // Food & Beverage on and Guests off must still tell the kitchen.
  return hasEnabledSection(event, 'guests')
    ? [schedule]
    : [schedule, dietaryBlock(event)];
}

/**
 * Whether the outline holds an enabled section of a type.
 *
 * Asked of the outline rather than of the data, because the question is what
 * this order is printing and not what the event holds: §4's rule is that the
 * outline is the document, and a disabled `guests` section prints nothing at all
 * (§8) — so it has not carried the dietary block anywhere.
 *
 * @param {object} event
 * @param {string} type
 * @returns {boolean}
 */
function hasEnabledSection(event, type) {
  return (Array.isArray(event.sections) ? event.sections : [])
    .some((entry) => entry && entry.type === type && entry.enabled !== false);
}

/* -------------------------------------------------------------------- guests */

/**
 * §8 A [v9] — the buildings line, then the guest list.
 *
 * One section where there were two. The line above the list is the thing an
 * order was always missing: which buildings this event is in, and which are
 * being held back in case it grows. It is one sentence and it is derived, so it
 * cannot disagree with the rooming sheet about a building holding guests.
 *
 * The list is deliberately dense. A guest list is read to find one name, not
 * studied, and a normal party should not cost a page of an order that people
 * have to carry around. Dates are short — "Nov 14", not "Sat, Nov 14" — because
 * the weekday is on the itinerary above and repeating it here buys nothing but
 * width. Children are indicated discreetly (§5, v5 changes): a small grey tag
 * beside the name, never a column of its own.
 *
 * [v18] THREE COLUMNS, AND THE DIETARY NOTES AS A BLOCK UNDER THEM (§8 [v18]).
 * Dietary was a fourth column, which is the wrong shape twice over: on a party
 * of twenty it is one filled cell and nineteen blanks that the eye has to read
 * past on every row, and on the guest whose cell is filled it is an allergy in
 * six-word column width. As a block it is the line the kitchen wants — "Kim
 * Palmer — shellfish" — and `dietaryBlock` prints "None known." when nobody has
 * one (§8 [v8]), which is the point of putting it here: an order with no Food &
 * Beverage section used to carry no dietary information at all, and the guests
 * section is the one the outline actually has. The width the column gave up
 * goes to the names, where a long one was wrapping.
 */
function renderGuests(event) {
  const attendees = event.attendees || [];
  const sentence = buildingsSentence(event);

  const line = sentence
    ? el('p', { class: 'sec__lead', text: sentence })
    : el('p', { class: 'sec__lead is-quiet', text: 'No buildings named for this event yet.' });

  if (!attendees.length) return [line, emptyNote('No guests on the list yet.')];

  return [
    line,
    table(
      [
        { label: 'Guest', class: 'col-name' },
        { label: 'Arrives', class: 'col-date' },
        { label: 'Departs', class: 'col-date' }
      ],
      attendees.map((attendee) => [
        nameWithTag(attendeeName(attendee) || 'Unnamed guest', attendee.isChild ? 'child' : ''),
        formatDateShort(attendee.arrive) || followsEvent(event, 'startDate'),
        formatDateShort(attendee.depart) || followsEvent(event, 'endDate')
      ]),
      'guests'),
    el('p', { class: 'sec__count', text: `${attendees.length} on the list.` }),
    dietaryBlock(event)
  ];
}

/**
 * A guest with no dates of their own takes the event's (§5, v2 changes). The
 * document prints the date that will actually apply rather than a blank, since
 * a blank arrival on a guest list reads as missing information.
 */
function followsEvent(event, key) {
  return formatDateShort(((event && event.meta) || {})[key]) || '—';
}

/* --------------------------------------------------------------------- staff */

/**
 * §8 A, §14 [v8] — grouped by person, each person's assignments in time order.
 *
 * One stew in a duck blind at dawn and behind the bar at night is one person's
 * day. Grouping by daypart splits that across two tables and nobody can see the
 * shape of it.
 */
function renderStaff(event) {
  const people = staffByPerson(event);
  if (!people.length) return [emptyNote('No staff assignments yet.')];

  return people.map((person) => el('div', { class: 'block-person' }, [
    el('h3', { class: 'block-person__name', text: person.name || 'Unnamed' }),
    table(
      [
        { label: 'Date', class: 'col-date' },
        { label: 'Daypart', class: 'col-part' },
        { label: 'Assignment', class: 'col-item' }
      ],
      person.assignments.map((row) => [
        formatDate(row.date),
        row.daypart || '',
        row.assignment || ''
      ]),
      'staff')
  ]));
}

/* --------------------------------------------------------------- departments */

/**
 * §8 A — the corporate-style breakdown: name, prior-to-event items, timed
 * during-event tasks, and notes. Off by default (§4); when an event is large
 * enough to want it, it prints in full.
 */
function renderDepartments(event) {
  const departments = event.departments || [];
  if (!departments.length) return [emptyNote('No departments yet.')];

  return departments.map((department) => {
    const during = (department.duringEvent || []).filter(Boolean);
    return el('div', { class: 'block-dept' }, [
      el('h3', { class: 'block-dept__name', text: department.name || 'Unnamed department' }),
      listBlock('Prior to event', department.priorToEvent),
      during.length
        ? el('div', { class: 'block-dept__part' }, [
            el('h4', { class: 'block-dept__head', text: 'During event' }),
            table(
              [
                { label: 'Date', class: 'col-date' },
                { label: 'Time', class: 'col-time' },
                { label: 'Task', class: 'col-item' }
              ],
              during.map((task) => [
                formatDate(task.date),
                formatTimeRange(task.time, ''),
                task.task || ''
              ]),
              'dept')
          ])
        : false,
      listBlock('Notes', department.notes)
    ]);
  });
}

/** A titled list, omitted entirely when the department carries no such items. */
function listBlock(heading, items) {
  const rows = (Array.isArray(items) ? items : []).filter((item) => String(item || '').trim());
  if (!rows.length) return false;
  return el('div', { class: 'block-dept__part' }, [
    el('h4', { class: 'block-dept__head', text: heading }),
    el('ul', { class: 'plainlist' }, rows.map((item) => el('li', { text: String(item) })))
  ]);
}

/* ------------------------------------------------------------------ freeText */

/**
 * §8 A — the section's own `body`, with its line breaks preserved.
 *
 * The title is drawn by the section wrapper, so this is the body alone. A
 * `freeText` section is where Security notes, PSO notes, weather and
 * transportation live (§5, v2 changes), and the breaks somebody typed are the
 * only structure that text has.
 */
function renderFreeText(event, entry) {
  const body = lines(entry.body);
  if (!body.length) return [emptyNote('Nothing written here yet.')];
  return body;
}

/**
 * The section renderers, by type. §4.
 *
 * A map rather than a switch so an unknown type is a lookup miss with a
 * printed explanation, not a silent fall-through to nothing.
 */
const SECTIONS = {
  guests: renderGuests,
  schedule: renderSchedule,
  foodAndBev: renderFoodAndBev,
  staff: renderStaff,
  departments: renderDepartments,
  freeText: renderFreeText
};
