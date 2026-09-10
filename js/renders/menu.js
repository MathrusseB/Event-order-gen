// The Menu — BUILD-SPEC §8 B.
//
// **Maple Ranch, always.** Whatever brand the event carries, this document
// carries the ranch's (§5, v8 changes). The menu is the ranch's culinary
// product, not the visiting group's: the kitchen writes it and the ranch stands
// behind it. That asymmetry is how the events department already issues these
// documents and the spec asks in as many words that it not be "fixed" into
// consistency — which is why the brand below is a named constant rather than a
// read of `meta.brandId`.
//
// The F&B schedule table is printed here *and* on the Event Order. Also
// deliberate (§5, v7 changes): the Menu leaves the kitchen on its own and has
// to say when each service is. Both read `foodAndBev[]`, so they cannot drift.
//
// The spine is the meal, not the menu block. `mealServices` orders every
// service by date and time and this walks that list, so a meal with nothing
// written for it prints its heading and says so (§12.8, §8 [v8]) instead of
// vanishing between two meals that do have menus. A missing menu should be
// obvious on the page, not discovered at service. The children's seating is an
// ordinary meal here and sorts into place by its own time — hot dogs at 5:30
// above the adult buffet at 6:30, not in a section of its own.

import { fnbCount, mealServices, menuFor } from '../derive.js';
import { formatDate, formatTimeRange } from '../dates.js';
import { MENU_BRAND_ID } from '../reference.js';
import { el } from '../dom.js';
import { emptyNote, joinParts, section, table } from './parts.js';
import { dietaryBlock } from './order.js';

/**
 * The Menu document descriptor. `render.js` wraps `body` in the page furniture.
 */
export const menuDocument = {
  id: 'menu',
  label: 'Menu',
  /** §5 [v8] — always the ranch's own, whatever the event carries. */
  brandId: () => MENU_BRAND_ID,
  body: renderMenuBody
};

/**
 * @param {object} event
 * @returns {Node[]}
 */
function renderMenuBody(event) {
  const services = mealServices(event);

  return [
    section('Food & Beverage', [scheduleTable(event, services)], 'foodAndBev'),
    // §8 [v8]: "None known" rather than an omitted block. This is the block the
    // kitchen checks before it plates anything, and its absence would read as
    // an oversight rather than as an all-clear.
    section('Allergies and Dietary', [dietaryBlock(event, false)], 'diet'),
    ...services.map((service) => renderService(event, service))
  ];
}

/**
 * The same table the Event Order prints, from the same array and the same
 * count. §7 — the menu header count is "the same computed value as the F&B row
 * it references", so both come from `fnbCount` and neither is re-derived.
 */
function scheduleTable(event, services) {
  if (!services.length) return emptyNote('No meal services yet.');
  return table(
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
    'fnb');
}

/**
 * One meal service: its heading, then its courses.
 *
 * The heading carries date, time, location and count so the block stands on its
 * own — a menu block read on a prep bench, away from the schedule table three
 * pages up, still says when and where and for how many.
 *
 * @param {object} event
 * @param {object} service a row of `foodAndBev`
 * @returns {HTMLElement}
 */
function renderService(event, service) {
  const block = menuFor(event, service.id);
  const courses = (block && Array.isArray(block.courses) ? block.courses : [])
    .filter((course) => course && (String(course.heading || '').trim()
      || (Array.isArray(course.items) && course.items.some((item) => String(item || '').trim()))));

  const detail = joinParts([
    formatDate(service.date),
    formatTimeRange(service.start, service.end),
    service.location,
    `${fnbCount(event, service)} covers`
  ]);

  return el('section', { class: 'meal' }, [
    el('h2', { class: 'meal__head' }, [
      el('span', { class: 'meal__name', text: service.meal || 'Untitled service' }),
      detail ? el('span', { class: 'meal__detail', text: detail }) : false
    ]),
    courses.length
      ? el('div', { class: 'meal__courses' }, courses.map(renderCourse))
      // §12.8 — a meal with no menu block. Named on the page, deliberately, so
      // the gap is found here rather than in the kitchen.
      : el('p', { class: 'meal__none', text: 'No menu set for this service.' })
  ]);
}

/**
 * One course: its heading, then its dishes.
 *
 * A course with a heading and no dishes still prints its heading — the same
 * rule as everywhere else in this document, one level down. Somebody wrote
 * "Dessert" and has not decided yet, and that is worth seeing.
 */
function renderCourse(course) {
  const items = (Array.isArray(course.items) ? course.items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return el('div', { class: 'mealcourse' }, [
    el('h3', { class: 'mealcourse__head', text: String(course.heading || '').trim() || 'Course' }),
    items.length
      ? el('ul', { class: 'mealcourse__items' }, items.map((item) =>
          el('li', { class: 'mealcourse__item', text: item })))
      : el('p', { class: 'mealcourse__none', text: 'No dishes written yet.' })
  ]);
}
