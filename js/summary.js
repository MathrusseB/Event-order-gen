// What a closed section says about itself — BUILD-SPEC §5, §10 (v17 changes).
//
// The editor opens one section at a time, so five of the six headers on screen
// are the only thing standing in for their contents. A header carrying nothing
// but a title would make the coordinator open each section in turn to find the
// one they wanted, which is the scroll this replaced.
//
// One line, from the event. **Not from the rows on screen** — a closed section
// still holds every node it had, and counting those nodes would report a blank
// seeded itinerary row as an entry (§5, v10 changes) and a staff assignment as a
// person. Every number here is the number the section is about, taken from the
// same derivations the documents print from, so a summary cannot disagree with
// the paper.
//
// An empty section says it is empty. "No guests yet" reads as a section nobody
// has filled in; "0 guests" reads as a broken count, and a broken count is the
// one thing a summary must not look like.
//
// Everything here fits one line on a phone: the counted lines are short by
// construction and the free-text preview is cut at a word. css/styles.css
// truncates whatever still does not fit, so a long line degrades rather than
// wrapping the header out of shape.

import { itineraryDates, itineraryFor, staffByPerson } from './derive.js';

/**
 * How much of a note the header shows. Cut at the last word boundary before
 * this, so the preview never breaks mid-word.
 */
const PREVIEW_MAX = 40;

/**
 * The one line a collapsed section shows in place of its contents.
 *
 * @param {object} event the whole event — every count is derived, not stored
 * @param {object} section the section being summarised
 * @returns {string} empty for a type this build does not know, which has no
 *   contents it can claim to have counted
 */
export function sectionSummary(event, section) {
  if (!section) return '';

  switch (section.type) {
    case 'guests':
      return guestLine(event);
    case 'schedule':
      return itineraryLine(event);
    case 'foodAndBev':
      return countLine(rows(event, 'foodAndBev').length,
        'service', 'services', 'No meal services yet');
    case 'staff':
      // People, not assignments: one cook working three dayparts is one cook.
      return countLine(staffByPerson(event).length,
        'person', 'people', 'Nobody assigned yet');
    case 'departments':
      return countLine(rows(event, 'departments').length,
        'department', 'departments', 'No departments yet');
    case 'freeText':
      // The only type whose content lives on the section itself (§4).
      return previewLine(section.body);
    default:
      return '';
  }
}

/** The rows of one event array, blanks in the file skipped. */
function rows(event, key) {
  return ((event && event[key]) || []).filter(Boolean);
}

/** "9 services", "1 service", or the empty sentence. */
function countLine(count, one, many, empty) {
  if (!count) return empty;
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * "9 guests, 2 children" — the list, and the part of it that is not adults.
 *
 * The children are named only when there are some: "9 guests, 0 children" spends
 * half the line saying nothing happened.
 */
function guestLine(event) {
  const attendees = rows(event, 'attendees');
  if (!attendees.length) return 'No guests yet';

  const guests = countLine(attendees.length, 'guest', 'guests', '');
  const children = attendees.filter((attendee) => attendee.isChild).length;
  if (!children) return guests;
  return `${guests}, ${countLine(children, 'child', 'children', '')}`;
}

/**
 * "3 days, 17 entries" — the merged itinerary the section actually shows (§7).
 *
 * Days that carry something, not days in the range: a five-day event with one
 * afternoon written down has one day of itinerary, and saying five would be
 * counting the calendar rather than the work.
 */
function itineraryLine(event) {
  let days = 0;
  let entries = 0;

  for (const date of itineraryDates(event)) {
    const count = itineraryFor(event, date).length;
    if (!count) continue;
    days += 1;
    entries += count;
  }

  if (!entries) return 'Nothing on the itinerary yet';
  return `${countLine(days, 'day', 'days', '')}, ${countLine(entries, 'entry', 'entries', '')}`;
}

/**
 * The first few words of a note.
 *
 * Whitespace is collapsed for the preview only — the body is stored exactly as
 * typed and printed as written (§4), and this reads it without touching it. The
 * cut lands on a word boundary and takes any punctuation it stranded with it, so
 * the line ends "…arrivals…" rather than "…arrivals.…".
 *
 * @param {*} body
 * @returns {string}
 */
function previewLine(body) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Empty';
  if (text.length <= PREVIEW_MAX) return text;

  // One character past the limit, so a cut that lands exactly on a word boundary
  // keeps that word instead of dropping it for being next to the edge.
  const cut = text.slice(0, PREVIEW_MAX + 1);
  const space = cut.lastIndexOf(' ');
  const kept = space > 0 ? cut.slice(0, space) : cut.slice(0, PREVIEW_MAX);
  return `${kept.replace(/[\s,.;:—-]+$/, '')}…`;
}
