// Reading a list of typed names — BUILD-SPEC §5 (v14 changes).
//
// Nine guests is nine rows opened one at a time, nine fields tabbed into, and
// nine chances to lose the thread of who is still to be added. The names
// usually arrive as a list — a text, an email, a page of a group's own
// paperwork — so they are pasted as a list, one per line.
//
// THE PARSE IS A GUESS AND IS TREATED AS ONE. Two shapes are accepted:
//
//   `Last, First`   the comma says which half is which, and it is right
//   `First Last`    no comma, so the last word is taken as the surname
//
// The second is a heuristic and it is wrong for every compound surname on the
// property's guest lists — Van Der Berg, De La Cruz, St John. It cannot be
// fixed by a longer list of particles either: "Anneke Van Der Berg" and "Mary
// Anne Berg" are the same shape, and only the person typing knows which is
// which. So nothing here commits anything. `parseNameLines` answers what it
// read, the interface shows it as two editable fields per line, and the write
// happens after somebody has looked at it. One wrong guess is a nuisance;
// twenty written in silently is worse than having typed them by hand.
//
// Pure and free of app state — an argument in, a plain answer out — so the
// harness can check the parse without a browser.

/**
 * Split a typed block into the lines that will become guests.
 *
 * Blank lines are dropped rather than becoming blank guests, and every line is
 * trimmed end to end: a list pasted out of an email arrives with trailing
 * spaces on half of it, and a surname with a space on the end sorts and prints
 * wrongly for the rest of the event.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function nameLines(text) {
  return String(text || '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Read one line as a first and last name.
 *
 * A line that yields one word only is a first name with no surname — Cher, or
 * a caterer's contact known to everyone by one name. It is shown parsed that
 * way rather than guessed at, because "Cher" as a surname with no first name
 * prints back to front on the guest list.
 *
 * @param {string} line already trimmed
 * @returns {{first: string, last: string}}
 */
export function parseName(line) {
  const text = String(line || '').trim().replace(/\s+/g, ' ');
  if (!text) return { first: '', last: '' };

  const comma = text.indexOf(',');
  if (comma >= 0) {
    // Split on the *first* comma and no others: "Berg, Anneke, Jr" is a
    // surname and everything the person is otherwise called.
    return {
      last: text.slice(0, comma).trim(),
      first: text.slice(comma + 1).trim()
    };
  }

  const words = text.split(' ');
  if (words.length === 1) return { first: words[0], last: '' };
  return { first: words.slice(0, -1).join(' '), last: words[words.length - 1] };
}

/**
 * One name as a comparable key. Case and spacing are not a difference.
 *
 * @param {string} first
 * @param {string} last
 * @returns {string} '' when there is no name at all
 */
export function nameKey(first, last) {
  const clean = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const key = `${clean(last)}|${clean(first)}`;
  return key === '|' ? '' : key;
}

/**
 * Read a whole block, and say which lines name somebody already on the list.
 *
 * A match is flagged and never blocked. **Two guests genuinely can share a
 * name** — a father and a son, two cousins on the same weekend — which is the
 * reason rows have ids at all (§5 [v4]). What a flag buys is the other case:
 * a list pasted twice, or a name added singly ten minutes ago and forgotten.
 * The interface offers to leave a flagged line out; the answer is the
 * coordinator's.
 *
 * @param {string} text the typed block
 * @param {object[]} [existing] the event's `attendees[]`
 * @returns {{line: string, first: string, last: string, duplicate: boolean}[]}
 */
export function parseNameLines(text, existing = []) {
  const known = new Set((Array.isArray(existing) ? existing : [])
    .filter(Boolean)
    .map((attendee) => nameKey(attendee.first, attendee.last))
    .filter(Boolean));

  return nameLines(text).map((line) => {
    const { first, last } = parseName(line);
    const key = nameKey(first, last);
    return { line, first, last, duplicate: Boolean(key) && known.has(key) };
  });
}

/**
 * Whether a name is already on a list — for a field the coordinator has since
 * corrected, which is no longer the name that was parsed.
 *
 * @param {object[]} existing
 * @param {string} first
 * @param {string} last
 * @returns {boolean}
 */
export function isKnownName(existing, first, last) {
  const key = nameKey(first, last);
  if (!key) return false;
  return (Array.isArray(existing) ? existing : [])
    .filter(Boolean)
    .some((attendee) => nameKey(attendee.first, attendee.last) === key);
}
