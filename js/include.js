// What the Event Order carries of the other two documents — BUILD-SPEC §5, §8
// [v9].
//
// `meta.includeInOrder` is two booleans, both false by default. When one is
// true, that document's content is appended to the Event Order's own body,
// after every section, under a bar naming it.
//
// THREE THINGS THIS IS NOT, and each of them is a way to get it wrong:
//
//   * It is not a section. Nothing here is reordered, renamed, disabled or
//     removed from the outline, and it always prints last. §4's rule that the
//     outline is the document still holds — this is the order printing more of
//     its own content, decided by a flag on the event.
//   * It is not a replacement. The Menu and the Rooming Assignment are still
//     generated, still previewed and still printed on their own, unchanged,
//     whatever these flags say. Including the menu in the order does not mean
//     the kitchen stops getting a menu.
//   * It is not a second render. Both bodies come from the document that owns
//     them — `renderRoomingBody` and `menuBlocks` — so a grid on the order is
//     the same grid as on the sheet, by construction rather than by care. What
//     is left behind is the page furniture: the running header, the logo and
//     the footer. One document's header inside another is wrong, and a reader
//     who finds a second logo halfway down an order stops believing they are
//     holding one document.
//
// This module exists rather than the two imports living in renders/order.js so
// that the import graph stays acyclic: order.js -> include.js -> {menu.js,
// rooming.js} -> parts.js, and nothing points back up.

import { includeFlags } from './derive.js';
import { menuBlocks } from './renders/menu.js';
import { renderRoomingBody } from './renders/rooming.js';
import { section } from './renders/parts.js';

/**
 * The included documents, in the order they print: the grid, then the menu.
 *
 * The menu goes last because it is the thing a reader leafs to the back for,
 * and because the seed order (§4 [v9]) puts it there.
 *
 * @param {object} event
 * @returns {HTMLElement[]} empty when neither flag is set
 */
export function includedInOrder(event) {
  const flags = includeFlags(event);
  const included = [];

  if (flags.rooming) {
    included.push(section('Rooming Assignment', renderRoomingBody(event), 'included'));
  }
  if (flags.menu) {
    included.push(section('Menu', menuBlocks(event), 'included'));
  }
  return included;
}
