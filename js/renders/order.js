// The Event Order — BUILD-SPEC §8 A.
//
// The document ownership actually reads. Its body is the enabled `sections` in
// **array order** and nothing here is pinned to a position: if the outline puts
// Notes first, Notes prints first. That is the whole of §4 — the outline is the
// document — and the moment one section type is special-cased to the top, the
// coordinator's arrangement stops being trustworthy.
//
// Three section types render something other than the array they are named
// after (§8 [v7]), and all three are easy to get wrong:
//
//   * `schedule` prints the **merged itinerary** from `itineraryFor`, not
//     `schedule[]`. Meals are on it because they come from `foodAndBev[]`, and
//     that merge is the point: dinner moved by half an hour moves here, in the
//     F&B table and on the Menu at once, because all three read one array.
//   * `accommodations` prints the per-night **summary** from
//     `lodgingByBuilding` — rooms for a named building, guests for a pooled one
//     — and never the room grid. The grid is the Rooming Assignment's, and
//     nobody reading an order should have to scroll past it to reach the menu.
//   * `foodAndBev` prints the F&B schedule table, which the Menu prints too.
//     The repetition is deliberate: the Menu leaves the kitchen on its own and
//     has to say when each service is.
//
// Disabled sections do not print at all — that is what disabling is for (§4).
// An *enabled* section holding nothing prints its heading and a quiet note
// (§8 [v8]): a section left blank should be visible on the page rather than
// silently missing.

import {
  attendeeName,
  dietaryNotes,
  eventNights,
  fnbCount,
  itineraryDates,
  itineraryFor,
  lodgingByBuilding,
  staffByPerson
} from '../derive.js';
import { formatDate, formatDateFull, formatTimeRange } from '../dates.js';
import { typeInfo } from '../sections.js';
import { el } from '../dom.js';
import { emptyNote, lines, nameWithTag, section, table } from './parts.js';

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

  if (!sections.length) {
    return [emptyNote('This order has no sections turned on, so it has no body to print.')];
  }
  return sections.map((entry) => renderSection(event, entry));
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

  const days = itineraryDates(event);
  if (!days.length) {
    return [emptyNote('Set the event dates to lay the itinerary out by day.')];
  }

  return days.map((date) => {
    const entries = itineraryFor(event, date);
    return el('div', { class: 'day' }, [
      el('h3', { class: 'day__head', text: formatDateFull(date) }),
      entries.length
        ? table(
            [
              { label: 'Time', class: 'col-time' },
              { label: 'Item', class: 'col-item' },
              { label: 'Location', class: 'col-where' }
            ],
            entries.map((entry) => [
              formatTimeRange(entry.start, entry.end),
              entry.text,
              entry.location
            ]),
            'itin')
        : emptyNote('Nothing scheduled this day.')
    ]);
  });
}

/* ------------------------------------------------------------ accommodations */

/**
 * §8 A [v7] — the per-night lodging summary. Date, figure, building.
 *
 * **Which figure** is §7 [v4] and not a style choice: rooms for a `named`
 * building, guests for a `pooled` one. Counting distinct rooms in Red Leaf Inn
 * returns 1 however many guests are in it, because pooled rows carry no room.
 */
function renderAccommodations(event) {
  const nights = eventNights(event);
  const rows = [];

  for (const night of nights) {
    const lodging = lodgingByBuilding(event, night);
    for (const [building, entry] of Object.entries(lodging)) {
      rows.push([formatDate(night), figureFor(entry), building || 'No building set']);
    }
  }

  if (!rows.length) {
    return [emptyNote('Nobody is housed yet. Assign rooms in the Rooming Assignment and this '
      + 'summary follows them.')];
  }

  return [
    table(
      [
        { label: 'Night', class: 'col-date' },
        { label: 'Occupied', class: 'col-figure' },
        { label: 'Building', class: 'col-where' }
      ],
      rows,
      'lodging'),
    el('p', { class: 'sec__foot', text: 'Rooms are counted where rooms are assigned, guests where '
      + 'the building is pooled. Room-by-room detail is on the Rooming Assignment.' })
  ];
}

/** "4 rooms" or "2 guests", per the building's mode. §7 [v4]. */
function figureFor(entry) {
  const pooled = entry.mode === 'pooled';
  const count = pooled ? entry.guests : entry.rooms;
  const noun = pooled ? 'guest' : 'room';
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/* ---------------------------------------------------------------- foodAndBev */

/**
 * §8 A — the F&B schedule table, then the allergies and dietary block.
 *
 * The count is `fnbCount` and is never recomputed here: it composes `serves`
 * with `countBasis` (§7), and a children's seating at 17:30 plus an adults'
 * dinner at 18:30 add up to one sitting only because both read the same rule.
 *
 * The dietary block prints "None known" rather than disappearing (§8 [v8]).
 * Its absence would read as an oversight, and this is the block the kitchen
 * checks before it plates anything.
 */
function renderFoodAndBev(event) {
  const services = event.foodAndBev || [];

  const schedule = services.length
    ? table(
        [
          { label: 'Date', class: 'col-date' },
          { label: 'Time', class: 'col-time' },
          { label: 'Meal', class: 'col-item' },
          { label: 'Count', class: 'col-count' },
          { label: 'Location', class: 'col-where' }
        ],
        services.map((service) => [
          formatDate(service.date),
          formatTimeRange(service.start, service.end),
          service.meal || 'Untitled service',
          String(fnbCount(event, service)),
          service.location || ''
        ]),
        'fnb')
    : emptyNote('No meal services yet.');

  return [schedule, dietaryBlock(event)];
}

/**
 * The allergies and dietary block, with names. §7 [v5], §8 [v8].
 *
 * Names, not strings: "Kim Palmer — shellfish" is the useful line, and
 * "shellfish" on its own tells the kitchen nothing about which plate.
 *
 * @param {object} event
 * @param {boolean} [heading] false where the block already sits under a section
 *   bar of its own — on the Menu, where it is a section rather than the tail of
 *   the F&B one, its own heading would only repeat the bar above it
 * @returns {HTMLElement}
 */
export function dietaryBlock(event, heading = true) {
  const notes = dietaryNotes(event);
  return el('div', { class: 'diet' }, [
    heading ? el('h3', { class: 'diet__head', text: 'Allergies and dietary' }) : false,
    notes.length
      ? el('ul', { class: 'diet__list' }, notes.map((attendee) =>
          el('li', { class: 'diet__item' }, [
            el('span', { class: 'diet__who', text: attendeeName(attendee) || 'Unnamed guest' }),
            el('span', { class: 'diet__what', text: String(attendee.dietary || '').trim() })
          ])))
      // §8 [v8]: printed, not omitted. "None known" was checked; a missing
      // block was forgotten, and the kitchen cannot tell which from the page.
      : el('p', { class: 'diet__none', text: 'None known.' })
  ]);
}

/* ----------------------------------------------------------------- attendees */

/**
 * §8 A — the guest list, with arrival and departure.
 *
 * Children are indicated, discreetly (§5, v5 changes). This document goes to
 * ownership, not to a nurse: a small grey tag beside the name, and no column of
 * its own.
 */
function renderAttendees(event) {
  const attendees = event.attendees || [];
  if (!attendees.length) return [emptyNote('No guests on the list yet.')];

  return [
    table(
      [
        { label: 'Guest', class: 'col-name' },
        { label: 'Arrives', class: 'col-date' },
        { label: 'Departs', class: 'col-date' }
      ],
      attendees.map((attendee) => [
        nameWithTag(attendeeName(attendee) || 'Unnamed guest', attendee.isChild ? 'child' : ''),
        formatDate(attendee.arrive) || followsEvent(event, 'startDate'),
        formatDate(attendee.depart) || followsEvent(event, 'endDate')
      ]),
      'guests'),
    el('p', { class: 'sec__count', text: `${attendees.length} on the list.` })
  ];
}

/**
 * A guest with no dates of their own takes the event's (§5, v2 changes). The
 * document prints the date that will actually apply rather than a blank, since
 * a blank arrival on a guest list reads as missing information.
 */
function followsEvent(event, key) {
  return formatDate(((event && event.meta) || {})[key]) || '—';
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
  attendees: renderAttendees,
  accommodations: renderAccommodations,
  schedule: renderSchedule,
  foodAndBev: renderFoodAndBev,
  staff: renderStaff,
  departments: renderDepartments,
  freeText: renderFreeText
};
