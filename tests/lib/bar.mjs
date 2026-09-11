// The bar's file actions, reached the way a coordinator reaches them.
//
// [v13] New order, Load, Save and the sample were four buttons on the header
// slab and are now four buttons behind the ⋯ menu on it. The buttons kept
// their ids, so a check could still find them with `page.click('#btn-new')` —
// and Playwright would refuse, because the menu they sit in is `hidden` until
// somebody opens it.
//
// Going through the menu is not a workaround for that; it is the path. The
// harness loads events through the app's own controls precisely so that a
// change to those controls is felt here first, and a check that reached past
// the menu would be testing a way in that nobody has.

/**
 * Open the ⋯ menu and press one of its buttons.
 *
 * The menu closes itself on any press inside it, so consecutive calls each
 * start from a closed menu and no caller has to tidy up after the last one.
 *
 * @param {object} page a Playwright page with the app loaded
 * @param {string} selector the button inside the menu, e.g. `#btn-save`
 */
export async function fileAction(page, selector) {
  await page.click('#btn-more');
  await page.click(selector);
}
