// The editor's sections, reached the way a coordinator reaches them.
//
// [v17] The sections are a disclosure set: one is open and the rest are
// collapsed to their headers (BUILD-SPEC §10 [v17]). A collapsed section keeps
// every node it had — that is the whole point of hiding rather than unmounting —
// so `querySelectorAll` still finds its rows and `page.evaluate` still reads
// them, while `page.click` and `page.fill` will wait for a field that is never
// going to be visible and then time out.
//
// Opening the section first is not a workaround for that. It is the path: the
// coordinator presses the header, or chooses the section in the navigator, and a
// check that reached past the disclosure would be checking a way in that nobody
// has. The same reasoning as tests/lib/bar.mjs, one version later.

/**
 * Open the section holding something, if it is not already open.
 *
 * Idempotent, and cheap when the section is already open: the header says which
 * it is in `aria-expanded`, so a caller can ask for the section it is about to
 * type into without tracking which one was open last.
 *
 * @param {object} page a Playwright page with the app loaded
 * @param {string} inside a selector for anything inside the section — an
 *   editor's own class is the clearest one, e.g. `.editor--guests`
 */
export async function openSection(page, inside) {
  const toggle = page.locator('#section-blocks > .block', { has: page.locator(inside) })
    .locator('[data-control="section-open"]');
  await toggle.waitFor({ state: 'visible' });
  if (await toggle.getAttribute('aria-expanded') === 'true') return;
  await toggle.click();
  await page.waitForFunction(
    (selector) => {
      const node = document.querySelector(selector);
      const body = node && node.closest('.block__body');
      return Boolean(body) && !body.hidden;
    },
    inside
  );
}
