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
import { dietaryBlock, emptyNote, joinParts, section, table } from './parts.js';

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
    ...menuBlocks(event)
  ];
}

/**
 * [v9] The per-meal menu blocks alone, without the schedule table or the
 * allergies block above them.
 *
 * This is what `meta.includeInOrder.menu` appends to the Event Order (§8 [v9]).
 * The blocks, and not the whole document: the order carries the F&B schedule
 * and the allergies in its own Food & Beverage section, and printing either of
 * them twice in one document is how a reader learns to stop trusting that two
 * tables of the same thing agree.
 *
 * @param {object} event
 * @returns {Node[]}
 */
export function menuBlocks(event) {
  return mealServices(event).map((service) => renderService(event, service));
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
 * One meal service: its heading, then its dishes.
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
  // [v9] A flat list of dishes, in the order they were written. The course
  // headings were the events department's convention (§5, v9 changes); the
  // private side wants the dishes and nothing between them.
  const dishes = (block && Array.isArray(block.dishes) ? block.dishes : [])
    .map((dish) => String(dish || '').trim())
    .filter(Boolean);

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
    dishes.length
      ? el('ul', { class: 'meal__dishes' }, dishes.map((dish) =>
          el('li', { class: 'meal__dish', text: dish })))
      // §12.8 — a meal with no menu block, and a block with nothing written in
      // it, which read the same way from the kitchen. Named on the page,
      // deliberately, so the gap is found here rather than at service.
      : el('p', { class: 'meal__none', text: 'No menu set for this service.' })
  ]);
}
