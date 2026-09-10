// Validation — BUILD-SPEC §12.
//
// An event in, findings out. Pure: no DOM, no module state, nothing read but
// the event that was handed in and the static property data behind it. The
// interface decides where a finding is shown and when; nothing here knows.
//
// §12 asks for `derive.js` and `reference.js` and this also imports `dates.js`,
// which is worth a line rather than a shrug. Every finding is a finished
// sentence naming a date the way a person says it — "Nov 16", not
// "2026-11-16" — and there is exactly one place in this app that spells a date
// (dates.js), for the same reason there is exactly one place that counts
// covers. A private copy of `formatDateShort` here would be the second spelling
// of a date in an app whose whole argument is that a fact is computed once.
// `dates.js` is pure, imports nothing, and touches no DOM, so the module stays
// what §12 asks it to be.
//
// TWO THINGS THIS MODULE IS NOT.
//
// It is not a gate. §12: *warn, do not block*. Nothing here refuses anything,
// and nothing here repairs anything either — a finding is a sentence, and the
// coordinator decides what to do about it. Brian knows things the app does not,
// and an event that prints with four findings outstanding may be exactly right.
//
// It is not a second implementation of the model. Every count, every stay
// window, every night a room is held comes from `derive.js`, so a rule and the
// document it is checking cannot come to disagree about what the event says.
//
// A RULE THAT CANNOT FIRE IS STILL WRITTEN. §12 [v12]. Two of these cannot trip
// on the model as it stands — 6's `pooled` half, and 11 on a file saved before
// v12 — and both have their function, returning nothing, saying why. A rule
// silently missing from this file is indistinguishable from a rule that passes,
// and the next reader has no way to tell which.
//
// [v13] Thirteen rules now. 13 reports the names v13's registry correction left
// behind, and 8 reports two different things at two severities.
//
// Dates are ISO `YYYY-MM-DD` strings and are compared as strings, exactly as
// derive.js compares them. Never convert one to a `Date` to compare it.

import {
  attendeeById,
  attendeeName,
  eventNights,
  fnbCount,
  menuFor,
  roomingWindow,
  unassignedGuestsOn
} from './derive.js';
import {
  ASSIGNMENT_MODE_NONE,
  LODGING_BUILDINGS,
  assignmentModeFor,
  retiredLocation,
  roomsIn,
  sharesFreely
} from './reference.js';
import { datesBetween, formatDateShort, formatTime } from './dates.js';

/**
 * [v12] The two severities. BUILD-SPEC §12.
 *
 *   `warning` — something is probably wrong.
 *   `note`    — something deliberate, worth seeing before it becomes paper.
 *
 * The difference is whether anybody has to do anything, not how loud it is. A
 * note is not a small warning: rule 1's overrides, rule 2's unlisted spouses
 * and children and rule 4's Bunk Room are all normal ways to run an event, and
 * each of them is also what a mistake looks like from the outside.
 */
export const WARNING = 'warning';
export const NOTE = 'note';

/**
 * Where a finding belongs in the interface.
 *
 * A section type for the six editable section types (§4), plus the two
 * documents that are not sections (§8) and the header block. The interface maps
 * these onto whatever is actually mounted; nothing here assumes any of them is
 * on screen, because every section is optional and the print panel has to list
 * findings about sections this order does not carry.
 */
export const AREAS = ['meta', 'guests', 'schedule', 'foodAndBev', 'staff', 'departments',
  'rooming', 'menu'];

/**
 * One finding.
 *
 * @typedef {object} Finding
 * @property {number} rule the §12 rule number
 * @property {'warning'|'note'} severity
 * @property {string} text one plain sentence — what is wrong, where, and what
 *   would fix it. Names the guest, the room or the meal; never an id, and never
 *   the rule
 * @property {string} area one of `AREAS` — the editor this belongs beside
 * @property {string[]} rowIds the rows to mark in place, in document order. May
 *   be empty for a finding about the event rather than a row
 * @property {string} date ISO, where the finding is about one night or one day.
 *   Empty otherwise
 * @property {string} key unique within one pass, and stable across passes over
 *   an unchanged event — for keying a list, and for telling one finding from
 *   another
 */

/* ------------------------------------------------------------------ helpers */

/** Every row of an event array, skipping holes a hand-edited file may carry. */
function rowsOf(event, key) {
  const list = event && event[key];
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

/** The guest ids a rooming row names, always an array. §5 (v5 changes). */
function guestIdsOf(row) {
  return Array.isArray(row && row.guestIds) ? row.guestIds : [];
}

/**
 * A room as staff say it out loud.
 *
 * The four named rooms on the property — Bunk Room, Timber, Wetland, King Suite
 * — are unique across all eleven buildings, so nobody says "the Timber, Timber";
 * they say "the Timber". [v13] Three of the four are now buildings of their own
 * under those names (§6 [v13]), which is this sentence arriving in the registry.
 * A numbered room needs its building, because there is an 8 in six of them.
 *
 * The registry decides which is which, so a hand-edited file naming a room the
 * property does not have keeps its building on the front and stays findable.
 *
 * @param {object} row a rooming row
 * @returns {string} the building alone when the row carries no room
 */
function roomPhrase(row) {
  const building = String((row && row.building) || '').trim();
  const room = String((row && row.room) || '').trim();
  if (!room) return building || 'a room';
  const named = roomsIn(building).includes(room) && !/^\d+$/.test(room);
  // "the Timber", "the Bunk Room" — a named room takes an article and a
  // numbered one does not, because nobody says "the Remington 1".
  if (named) return `the ${room}`;
  return `${building} ${room}`.trim();
}

/** A phrase that has to start a sentence. */
function startCase(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * Small counts as words. "The Timber is claimed by 2 bookings" is a log line;
 * "claimed twice" is a sentence.
 */
function countWord(n) {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten'][n] || String(n);
}

/**
 * The names a rooming row is known by, as a phrase.
 *
 * Not a head count and never used as one (§5, v5 changes): a row naming one
 * guest may hold a couple, and a row naming nobody is still a booking. An
 * unresolvable id is not spelled out here — §12.3 is the rule about that, and
 * it says so in its own sentence rather than leaking an id into somebody
 * else's.
 *
 * @param {object} event
 * @param {object} row
 * @returns {string} "nobody" when the row names no one this event can resolve
 */
function partyPhrase(event, row) {
  const names = guestIdsOf(row)
    .map((id) => attendeeById(event, id))
    .filter(Boolean)
    .map((attendee) => attendeeName(attendee) || 'an unnamed guest');
  return names.length ? listPhrase(names) : 'nobody';
}

/**
 * "Dana", "Dana and Tom", "Dana, Tom and Kim". Sentence assembly, not domain
 * logic — a finding is read as English or it is not read at all.
 *
 * @param {string[]} items
 * @returns {string}
 */
function listPhrase(items) {
  const kept = items.filter(Boolean);
  if (kept.length <= 1) return kept[0] || '';
  if (kept.length === 2) return `${kept[0]} and ${kept[1]}`;
  return `${kept.slice(0, -1).join(', ')} and ${kept[kept.length - 1]}`;
}

/**
 * One attendee's own stay, defaulted to the event's dates. §5 (v2 changes).
 *
 * Asked of `derive.js` rather than recomputed: `roomingWindow` on a row naming
 * only this guest and carrying no dates of its own *is* the defaulting rule,
 * and there is no second copy of it here to fall out of step.
 *
 * @param {object} event
 * @param {object} attendee
 * @returns {{from: string, to: string}}
 */
function stayOf(event, attendee) {
  return roomingWindow(event, { guestIds: [attendee.id], from: '', to: '' });
}

/**
 * The nights a half-open range covers. §7 [v3]: `from <= night < to`.
 *
 * @param {{from: string, to: string}} window
 * @returns {string[]} ISO dates, ascending; empty when the range is not real
 */
function nightsIn(window) {
  const days = datesBetween(window.from, window.to);
  return days.length ? days.slice(0, -1) : [];
}

/**
 * A run of nights as a reader would say it, naming three and then counting.
 *
 * A guest unlisted for every night of a five-night event is one fact, and
 * printing five dates for it buries the four findings underneath.
 *
 * @param {string[]} nights ISO dates, ascending
 * @returns {string}
 */
function nightsPhrase(nights) {
  if (!nights.length) return '';
  const named = nights.slice(0, 3).map(formatDateShort);
  const rest = nights.length - named.length;
  if (!rest) return listPhrase(named);
  return `${named.join(', ')} and ${rest} more night${rest === 1 ? '' : 's'}`;
}

/** A meal named the way the itinerary names it: "Dinner on Sat, Nov 14". */
function mealPhrase(entry) {
  const meal = String((entry && entry.meal) || '').trim() || 'An untitled meal service';
  const date = entry && entry.date ? ` on ${formatDateShort(entry.date)}` : '';
  return `${meal}${date}`;
}

/** An itinerary row named the way the itinerary names it. */
function activityPhrase(entry) {
  const label = String((entry && entry.label) || '').trim() || 'An itinerary row with no activity';
  const date = entry && entry.date ? ` on ${formatDateShort(entry.date)}` : '';
  return `${label}${date}`;
}

/**
 * Build a finding. The `key` is assembled here so no rule has to remember to.
 *
 * @param {object} parts
 * @returns {Finding}
 */
function finding({ rule, severity, text, area, rowIds = [], date = '' }) {
  return {
    rule,
    severity,
    text,
    area,
    rowIds: rowIds.filter(Boolean),
    date,
    // The sentence is part of the key. Rule 3 can raise two findings about one
    // row — an unresolvable id and a legacy name — and rule 7 two about a menu
    // with no `fnbId` at all; without the text those collide, and a list keyed
    // on it would show one of them. Two findings that agree on all of this
    // *are* the same finding.
    key: `${rule}:${area}:${rowIds.filter(Boolean).join('+')}:${date}:${text}`
  };
}

/* -------------------------------------------------------------------- rules */

/**
 * §12.1 — an F&B entry counted by explicit override.
 *
 * Protecting against: a number that was right last week. Every other count on
 * every document is derived from the guest list and moves when the guest list
 * moves (§7); a hand-set one does not, and it is the one figure on the page
 * that can be quietly stale while everything around it is current.
 *
 * A note, not a warning (§12 [v12]): setting a count by hand is a normal thing
 * to do — a head count phoned in from the house, a service the guest list
 * cannot describe — and the point is to see it before it prints, not to be told
 * off for it.
 *
 * **An override with no usable number in it is a different animal, and it is a
 * warning.** §12's two levels are defined by whether the thing was deliberate,
 * and a row switched to a hand-set count and then left empty is not: `fnbCount`
 * short-circuits to `Number(entry.count)` before it looks at anything else
 * (derive.js), and `Number(null)` is 0 and finite — so the F&B table prints 0
 * and every Menu block for that meal prints "0 covers". That is a service the
 * kitchen is told to cook for nobody, and filing it among the notes is where it
 * would be dismissed along with them.
 *
 * [v5] `serves: "custom"` overrides in exactly the same way as
 * `countBasis: "custom"`, and `fnbCount` treats them as one, so this does too —
 * strictly, with no trimming and no case folding, because that is how derive.js
 * reads them and a rule that disagreed would name a number no document carries.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleOneOverrides(event) {
  const found = [];
  for (const entry of rowsOf(event, 'foodAndBev')) {
    if (entry.countBasis !== 'custom' && entry.serves !== 'custom') continue;

    // The raw field, before `fnbCount` launders it into a number.
    const raw = entry.count;
    const number = Number(raw);
    const usable = raw !== null && raw !== undefined && raw !== ''
      && Number.isFinite(number) && Number.isInteger(number) && number >= 0;

    found.push(usable
      ? finding({
        rule: 1,
        severity: NOTE,
        text: `${mealPhrase(entry)} is counted by hand at ${fnbCount(event, entry)}, not from the `
          + 'guest list — it will not move when the guest list does.',
        area: 'foodAndBev',
        rowIds: [entry.id],
        date: entry.date || ''
      })
      : finding({
        rule: 1,
        severity: WARNING,
        text: `${mealPhrase(entry)} is counted by a number set by hand, and there is no usable `
          + 'number on it — it prints 0 covers on the order and on the menu.',
        area: 'foodAndBev',
        rowIds: [entry.id],
        date: entry.date || ''
      }));
  }
  return found;
}

/**
 * §12.2 — an attendee staying overnight who is named on no room that night.
 *
 * Protecting against: a guest arriving to no bed. That is the fault this
 * catches, and it is a rare one, because the ordinary reason a guest is not on
 * the sheet is that they are not *meant* to be: spouses are never listed and
 * children are listed only when they have a room of their own (§5, v5 changes).
 *
 * So it is a note. §12.2 has said "a warning, not a fault" since v5, and [v12]
 * gives that a name. Naming the guest and the nights is the whole value: Brian
 * reads "Kim Palmer, Nov 15" and knows in one beat whether Kim is with somebody
 * or has been missed.
 *
 * One finding per guest rather than one per night. A guest unlisted across a
 * five-night event is one fact about one guest, and five identical lines is the
 * shape that teaches somebody to stop reading the panel.
 *
 * The nights checked are the event's own (`eventNights`). A guest whose stay
 * runs outside the event dates is a different fault, and the header editor
 * reports it where the dates are typed.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleTwoUnhousedGuests(event) {
  const nightsByGuest = new Map();
  for (const night of eventNights(event)) {
    for (const attendee of unassignedGuestsOn(event, night)) {
      const key = attendee.id || attendeeName(attendee) || 'unknown';
      if (!nightsByGuest.has(key)) nightsByGuest.set(key, { attendee, nights: [] });
      nightsByGuest.get(key).nights.push(night);
    }
  }

  const found = [];
  for (const { attendee, nights } of nightsByGuest.values()) {
    const who = attendeeName(attendee) || 'A guest with no name yet';
    found.push(finding({
      rule: 2,
      severity: NOTE,
      text: `${who} is staying ${nightsPhrase(nights)} and is on no room — spouses and children `
        + 'rooming with family are never listed, so this may be right.',
      area: 'guests',
      rowIds: [attendee.id],
      date: nights[0] || ''
    }));
  }
  return found;
}

/**
 * §12.3 — a rooming row naming a guest it cannot resolve.
 *
 * Protecting against: a room that reads as held by somebody who is not coming.
 * Usually a deleted guest — deleting an attendee deliberately leaves `rooming[]`
 * alone (attendees.js), because quietly emptying a room is how a booking is
 * lost with no trace.
 *
 * Two shapes, both reported the same way and neither of them repaired here:
 * a `guestIds` entry matching no attendee, and [v5] a legacy `guest` name a
 * migration could not match, which is kept verbatim so the row can still be
 * read by the name it was authored with (migrate.js).
 *
 * **A row naming nobody at all is not an orphan** (§12.3) and fires nothing: it
 * is a room held under no name yet, which is an ordinary state on the board.
 *
 * The finding names the *room*, because the guest is exactly what this event
 * cannot name — and an id is never shown (§12).
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleThreeUnresolvedGuests(event) {
  const found = [];
  for (const row of rowsOf(event, 'rooming')) {
    const unresolved = guestIdsOf(row).filter((id) => !attendeeById(event, id));
    if (unresolved.length) {
      found.push(finding({
        rule: 3,
        severity: WARNING,
        text: unresolved.length === 1
          ? `${startCase(roomPhrase(row))} is booked under a name that is not on the guest list — `
            + 'usually a guest who was deleted. The room stays booked; put the guest back, or take '
            + 'the name off.'
          : `${startCase(roomPhrase(row))} is booked under ${countWord(unresolved.length)} names `
            + 'that are not on the guest list. The room stays booked.',
        area: 'rooming',
        rowIds: [row.id],
        date: roomingWindow(event, row).from || ''
      }));
    }
    if (row.guest) {
      found.push(finding({
        rule: 3,
        severity: WARNING,
        text: `${startCase(roomPhrase(row))} came in booked under `
          + `"${String(row.guest).trim()}", and no guest by that name is on the list — add the `
          + 'right guest to the room, then take the old name off.',
        area: 'rooming',
        rowIds: [row.id],
        date: roomingWindow(event, row).from || ''
      }));
    }
  }
  return found;
}

/**
 * §12.4 — the same named room claimed on the same night by two separate rows.
 *
 * Protecting against: two parties sent to one door. Mid-event turnover is the
 * whole reason rooming rows carry ranges (§5, v3 changes), and the fault it
 * introduces is the range that overlaps by a night — Dana out on the 15th, Tom
 * in on the 14th, and the Timber double-booked on a night nobody looked at.
 *
 * **Several names on one row is never this.** A row is a party (§5, v5
 * changes), and a party sharing a room is what a room is. This compares rows,
 * never names.
 *
 * Overlap is tested as ranges rather than night by night — `a.from < b.to &&
 * b.from < a.to`, the same test the guest picker uses (§5, v10 changes) — so
 * the check needs no date arithmetic and the nights it reports come out of the
 * overlap itself.
 *
 * [v12] `sharesFreely` (§6) is the difference between a fault and a Tuesday.
 * The Bunk Room sleeps twelve and routinely holds unrelated parties, so it gets
 * a note naming who else is in there; every other room gets the warning. No
 * capacity is modelled and none should be — the registry declares this, because
 * there is nothing to compute it from.
 *
 * Rows are clustered before reporting: a room holding three overlapping
 * bookings is one finding naming three parties, not three findings naming pairs.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleFourDoubleClaimedRooms(event) {
  const byRoom = new Map();
  for (const row of rowsOf(event, 'rooming')) {
    const room = String(row.room || '').trim();
    // A row with no room is §12.6's, and a `pooled` building has no rooms to
    // claim twice — both land here with an empty key and neither is a clash.
    if (!room || assignmentModeFor(row.building || '') === 'pooled') continue;
    const window = roomingWindow(event, row);
    if (!window.from || !window.to || !(window.from < window.to)) continue;
    // JSON rather than a joined string: "Lodge Bunk" + "Room" and "Lodge" +
    // "Bunk Room" are two different rooms and must not share a key.
    const key = JSON.stringify([row.building || '', room]);
    if (!byRoom.has(key)) byRoom.set(key, []);
    byRoom.get(key).push({ row, window });
  }

  const found = [];
  for (const entries of byRoom.values()) {
    if (entries.length < 2) continue;
    for (const cluster of overlappingClusters(entries)) {
      const rows = cluster.map((entry) => entry.row);
      const nights = clusterNights(cluster);
      const building = rows[0].building || '';
      const parties = listPhrase(rows.map((row) => partyPhrase(event, row)));
      const where = startCase(roomPhrase(rows[0]));
      const when = nights.length ? ` on ${nightsPhrase(nights)}` : '';

      found.push(sharesFreely(building)
        ? finding({
          rule: 4,
          severity: NOTE,
          text: `${where} holds ${countWord(rows.length)} separate bookings${when} — ${parties}. `
            + 'It sleeps twelve, so this is usually deliberate.',
          area: 'rooming',
          rowIds: rows.map((row) => row.id),
          date: nights[0] || ''
        })
        : finding({
          rule: 4,
          severity: WARNING,
          text: rows.length === 2
            ? `${where} is claimed twice${when} — by ${parties}. One of them needs another room.`
            : `${where} is claimed by ${countWord(rows.length)} bookings${when} — ${parties}. `
              + 'Only one of them can have it.',
          area: 'rooming',
          rowIds: rows.map((row) => row.id),
          date: nights[0] || ''
        }));
    }
  }
  return found;
}

/**
 * Rows in one room, grouped so that every row in a group overlaps at least one
 * other in it. Groups of one are dropped — a booking alone in its room is the
 * ordinary case and the whole point of the range.
 *
 * @param {{row: object, window: {from: string, to: string}}[]} entries
 * @returns {{row: object, window: {from: string, to: string}}[][]} in array order
 */
function overlappingClusters(entries) {
  const clusters = [];
  for (const entry of entries) {
    const touching = clusters.filter((cluster) =>
      cluster.some((other) => other.window.from < entry.window.to
        && entry.window.from < other.window.to));
    if (!touching.length) {
      clusters.push([entry]);
      continue;
    }
    // Joining two clusters at once: A and C never met until B arrived.
    const merged = touching.flat().concat([entry]);
    for (const cluster of touching) clusters.splice(clusters.indexOf(cluster), 1);
    clusters.push(merged);
  }
  return clusters.filter((cluster) => cluster.length > 1);
}

/** The nights on which at least two of a cluster's bookings are both live. */
function clusterNights(cluster) {
  const nights = new Set();
  for (let i = 0; i < cluster.length; i += 1) {
    for (let j = i + 1; j < cluster.length; j += 1) {
      const a = cluster[i].window;
      const b = cluster[j].window;
      const from = a.from > b.from ? a.from : b.from;
      const to = a.to < b.to ? a.to : b.to;
      for (const night of nightsIn({ from, to })) nights.add(night);
    }
  }
  return [...nights].sort();
}

/**
 * §12.5 — a rooming row whose range falls outside the stay of the party it
 * names.
 *
 * Protecting against: a room held on a night nobody is in it, and — the half
 * that actually costs money — a guest arriving to a room that was given away.
 *
 * **"The guest it is booked under" is v3 language and reading it literally is
 * wrong now.** A row named one person until v5; since then it names a party
 * (§5, v5 changes), and `roomingWindow` resolves "booked under" as the first
 * name that happens to be resolvable, which is an ordering accident. Read
 * literally, this rule warns about a correct booking: `large-event.json`'s
 * Wetland runs from the 12th and is named by Elise Navarro, who arrives on the
 * 13th, and by Marcus Kane, who is there from the 12th. The room is right and
 * the warning would be noise on the panel beside the one row that is genuinely
 * wrong.
 *
 * So the test is the party's whole span: the row is outside the stay only when
 * it holds a night that *nobody* it names is here for. The sentence then names
 * whichever of them comes closest — the first to arrive, or the last to leave —
 * because that is the guest whose dates would have to change.
 *
 * Said in nights rather than in dates, because `to` is exclusive: a booking
 * `to` the 16th holds the night of the 15th, and "to Nov 16, but she leaves on
 * the 15th" reads as an off-by-one to everybody who has not read §7 [v3].
 *
 * A row with no resolvable name has no stay to be outside of, and §12.3 has
 * already said so. Neither has a guest whose own dates run backwards — §12.10
 * is about them, and saying it three ways is how a panel stops being read.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleFiveBookingOutsideStay(event) {
  const found = [];
  for (const row of rowsOf(event, 'rooming')) {
    const party = guestIdsOf(row)
      .map((id) => attendeeById(event, id))
      .filter(Boolean)
      .map((attendee) => ({ attendee, stay: stayOf(event, attendee) }))
      // A backwards stay spans no night at all, and §12.10 is already saying so.
      .filter(({ stay: window }) => window.from && window.to && window.from <= window.to);
    if (!party.length) continue;

    const held = roomingWindow(event, row);
    // The first to arrive and the last to leave: between them, the nights this
    // room is genuinely wanted for.
    const first = party.reduce((a, b) => (b.stay.from < a.stay.from ? b : a));
    const last = party.reduce((a, b) => (b.stay.to > a.stay.to ? b : a));
    const stay = { from: first.stay.from, to: last.stay.to };
    const where = roomPhrase(row);

    if (held.from && stay.from && held.from < stay.from) {
      const who = attendeeName(first.attendee) || 'The guest this room is booked under';
      found.push(finding({
        rule: 5,
        severity: WARNING,
        text: `${who} has ${where} from the night of ${formatDateShort(held.from)}, but does not `
          + `arrive until ${formatDateShort(stay.from)} — the booking should start on `
          + `${formatDateShort(stay.from)}.`,
        area: 'rooming',
        rowIds: [row.id],
        date: held.from
      }));
    }
    if (held.to && stay.to && held.to > stay.to) {
      const who = attendeeName(last.attendee) || 'The guest this room is booked under';
      const nights = nightsIn(held);
      const lastNight = nights.length ? nights[nights.length - 1] : held.to;
      found.push(finding({
        rule: 5,
        severity: WARNING,
        text: `${who} has ${where} for the night of ${formatDateShort(lastNight)}, but leaves on `
          + `${formatDateShort(stay.to)} — the booking should end on ${formatDateShort(stay.to)}.`,
        area: 'rooming',
        rowIds: [row.id],
        date: lastNight
      }));
    }
  }
  return found;
}

/**
 * §12.6 — a room specified on a `pooled` building, or omitted on a `named` one.
 *
 * Protecting against: a booking that appears on no room's line. A `named`
 * building is drawn room by room, in the editor and on the sheet, and a row
 * with no room groups under an empty key that nothing prints — the booking is
 * in the file and on no piece of paper.
 *
 * **The `pooled` half cannot currently fire, and is written anyway** (§12
 * [v12]). Every lodging building has been `named` since v9 — `pooled` is kept
 * in reference.js because it costs nothing and the concept may return (§6) —
 * so there is no building for that half to fire on. Deleting it would leave the
 * next reader unable to tell an unimplemented rule from a rule that passes.
 *
 * **[v12] A building or a room the registry no longer carries is this rule too.**
 * It is not in §12.6's two clauses as written, but three separate comments in
 * this codebase say it is — `migrate()` leaves such a row exactly as it was
 * authored on the strength of "§12.6 goes on reporting it every time the file
 * is opened" (migrate.js, rule 11 and the `retiredRooms` typedef), and
 * `assignmentModeFor` returns `none` for it "(§12.6 reports it)"
 * (reference.js). Written to the letter, none of that was true: migrate's
 * one-shot summary was the only thing that ever mentioned it, and after the
 * file had been opened once nothing did. `none` is a mode, a room set against
 * it is a room set against its building's mode, and this is the rule about
 * that.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleSixRoomAgainstMode(event) {
  const found = [];
  for (const row of rowsOf(event, 'rooming')) {
    const building = String(row.building || '').trim();
    if (!building) continue;
    const mode = assignmentModeFor(building);
    const room = String(row.room === null || row.room === undefined ? '' : row.room).trim();

    // Dormant since v9: nothing is `pooled`. Kept so the rule is readable.
    if (mode === 'pooled' && room) {
      found.push(finding({
        rule: 6,
        severity: WARNING,
        text: `${building} is assigned by building, so the room "${room}" on this booking is `
          + 'ignored everywhere it is read.',
        area: 'rooming',
        rowIds: [row.id],
        date: roomingWindow(event, row).from || ''
      }));
    }

    if (mode === 'named' && !room) {
      found.push(finding({
        rule: 6,
        severity: WARNING,
        text: `${whosePhrase(event, row, building)} has no room — ${building} is assigned room by `
          + 'room, so this booking appears on no room line and prints nowhere.',
        area: 'rooming',
        rowIds: [row.id],
        date: roomingWindow(event, row).from || ''
      }));
    }

    // [v12] A building this property does not assign rooms in — a venue on a
    // rooming row, or a building that left the registry at v9. The row is kept
    // exactly as it was authored (migrate.js); saying so is this rule's job.
    if (mode === ASSIGNMENT_MODE_NONE) {
      found.push(finding({
        rule: 6,
        severity: WARNING,
        text: `${whoseBooking(event, row)} is in "${building}", which is not a building this `
          + 'property assigns rooms in — the row is kept exactly as it was authored, so move the '
          + 'guest to a building on the list rather than retyping it.',
        area: 'rooming',
        rowIds: [row.id],
        date: roomingWindow(event, row).from || ''
      }));
    }

    // [v12] And a room that has left the building it is in — the other half of
    // what migrate.js reports once and this reports every time.
    if (mode === 'named' && room && roomsIn(building).length && !roomsIn(building).includes(room)) {
      found.push(finding({
        rule: 6,
        severity: WARNING,
        text: `"${room}" is not a room in ${building} any more — the booking is kept as it was `
          + 'authored, so move the guest to a room that exists rather than renaming this one.',
        area: 'rooming',
        rowIds: [row.id],
        date: roomingWindow(event, row).from || ''
      }));
    }
  }
  return found;
}

/** "Kim Palmer's booking in Winchester", or "A booking in Winchester". */
function whosePhrase(event, row, building) {
  const party = partyPhrase(event, row);
  return party === 'nobody'
    ? `A booking in ${building}`
    : `${party}'s booking in ${building}`;
}

/** The same, where the sentence names the building itself further along. */
function whoseBooking(event, row) {
  const party = partyPhrase(event, row);
  return party === 'nobody' ? 'A booking' : `${party}'s booking`;
}

/**
 * §12.7 — a menu block written for a meal service that is not there.
 *
 * Protecting against: an evening's menu lost with no trace. Deleting a meal
 * service deliberately leaves `menu[]` alone (foodandbev.js), exactly as
 * deleting a guest leaves `rooming[]` alone, so the dishes survive the meal and
 * can be pointed at another service.
 *
 * The finding names the dishes, because the meal it was written for is the one
 * thing that cannot be named — it does not exist.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleSevenOrphanMenus(event) {
  const served = new Set(rowsOf(event, 'foodAndBev').map((entry) => entry.id).filter(Boolean));
  const found = [];
  for (const block of rowsOf(event, 'menu')) {
    if (block.fnbId && served.has(block.fnbId)) continue;
    const dishes = (Array.isArray(block.dishes) ? block.dishes : [])
      .map((dish) => String(dish || '').trim())
      .filter(Boolean);
    const opening = dishes.length ? `starting "${dishes[0]}"` : 'with no dishes in it';
    found.push(finding({
      rule: 7,
      severity: WARNING,
      text: `A menu ${opening} is written for a meal service that is no longer in the file — `
        + 'point it at another service, or delete it.',
      area: 'menu',
      rowIds: [block.fnbId],
      date: ''
    }));
  }
  return found;
}

/**
 * §12.8 — a meal service with no menu, and a menu with no dishes.
 *
 * Protecting against: the kitchen finding out at service. §8 [v8] is the same
 * rule seen from the page — a meal with no menu prints its heading and a note
 * saying so, because a heading with "None" under it was checked and a heading
 * that is simply missing was forgotten.
 *
 * **[v13] Two things, at two severities, and the split is the point.** Nobody
 * writes a dish list for a nightcap, and since v10 every day of an event opens
 * with three meal services (§5, v10 changes) — so on the old rule a fresh
 * three-day event carried nine warnings before a word had been typed into it.
 * Nine warnings on an empty event is how a coordinator learns that the panel is
 * noise, and then the warning that mattered goes past unread. A meal with no
 * menu is a **note**: normal, and worth seeing before it becomes paper.
 *
 * A menu that exists and holds no dishes is the **warning**. Somebody opened
 * that one and left it, and it is the one that prints a heading with nothing
 * under it. The editor creates a block with one empty line in it, so this fires
 * the moment "Write a menu" is pressed and stops the moment a dish is typed —
 * which is exactly the window in which the block is unfinished.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleEightMealsWithNoMenu(event) {
  const found = [];
  for (const entry of rowsOf(event, 'foodAndBev')) {
    if (!entry.id) continue;
    const block = menuFor(event, entry.id);

    if (!block) {
      found.push(finding({
        rule: 8,
        severity: NOTE,
        text: `${mealPhrase(entry)} has no menu written.`,
        area: 'menu',
        rowIds: [entry.id],
        date: entry.date || ''
      }));
      continue;
    }

    const dishes = (Array.isArray(block.dishes) ? block.dishes : [])
      .map((dish) => String(dish || '').trim())
      .filter(Boolean);
    if (dishes.length) continue;

    found.push(finding({
      rule: 8,
      severity: WARNING,
      text: `${mealPhrase(entry)} has a menu started with no dishes in it — write them, or `
        + 'delete the menu.',
      area: 'menu',
      rowIds: [entry.id],
      date: entry.date || ''
    }));
  }
  return found;
}

/**
 * §12.9 — a schedule entry or a meal service dated outside the event.
 *
 * Protecting against: a day nobody is looking at. The itinerary prints these
 * where they fall rather than dropping them (§7, `itineraryDates`) precisely so
 * that this warning has something to point at — a silently dropped entry is the
 * one outcome worse than an entry printed in the wrong place.
 *
 * Narrowing the event dates never deletes a row (§5, v10 changes); it produces
 * these instead.
 *
 * A row with no date at all is not reported: a blank seeded itinerary row
 * carries the date of the day it was seeded for, and a row somebody cleared is
 * a row being worked on.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleNineDatedOutsideEvent(event) {
  const meta = (event && event.meta) || {};
  const start = meta.startDate || '';
  const end = meta.endDate || '';
  if (!start || !end) return [];

  const found = [];
  const kinds = [
    { key: 'schedule', area: 'schedule', phrase: activityPhrase },
    { key: 'foodAndBev', area: 'foodAndBev', phrase: mealPhrase }
  ];

  for (const kind of kinds) {
    for (const entry of rowsOf(event, kind.key)) {
      const date = entry.date || '';
      if (!date || (date >= start && date <= end)) continue;
      const side = date < start
        ? `before the event starts on ${formatDateShort(start)}`
        : `after the event ends on ${formatDateShort(end)}`;
      found.push(finding({
        rule: 9,
        severity: WARNING,
        text: `${kind.phrase(entry)} is dated ${side} — move it, or move the event dates.`,
        area: kind.area,
        rowIds: [entry.id],
        date
      }));
    }
  }
  return found;
}

/**
 * §12.10 — an attendee leaving before they arrive.
 *
 * Protecting against: a guest who counts for nothing. A backwards stay spans no
 * date, so every per-day count silently skips them (§7) — they are on the guest
 * list, on no meal count, and in no room, and nothing about the page says why.
 *
 * The defaulted dates are compared, not the stored ones: a blank `arrive` is
 * the event's start date and a blank `depart` its end (§5, v2 changes), so a
 * guest with one date typed and one left blank is judged on the pair that
 * actually counts.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleTenBackwardsStays(event) {
  const meta = (event && event.meta) || {};
  const found = [];
  for (const attendee of rowsOf(event, 'attendees')) {
    const arrive = attendee.arrive || meta.startDate || '';
    const depart = attendee.depart || meta.endDate || '';
    if (!arrive || !depart || depart >= arrive) continue;
    found.push(finding({
      rule: 10,
      severity: WARNING,
      text: `${attendeeName(attendee) || 'A guest with no name yet'} is down as leaving on `
        + `${formatDateShort(depart)} and arriving on ${formatDateShort(arrive)} — they are `
        + 'counted for no meal and no night until that is the other way round.',
      area: 'guests',
      rowIds: [attendee.id],
      date: arrive
    }));
  }
  return found;
}

/**
 * §12.11 — a revision line older than the last edit.
 *
 * Protecting against: paper that misstates its own currency. The revision line
 * is the whole of what ownership has to go on when two copies of an order are
 * on the same table, and an order edited on Friday carrying Tuesday's revision
 * date is worse than one carrying no date at all.
 *
 * [v12] `meta.touchedAt` is what makes this rule runnable — nothing recorded
 * when an event was edited before v12. It is stamped by `update()` (app.js),
 * which is the only write path, so there is no edit it can miss. It is a local
 * wall-clock string, `YYYY-MM-DDTHH:MM`; the date half is what this compares,
 * as a string, like every other date in this app.
 *
 * **On a file saved before v12 this cannot fire**, and that is the right
 * answer rather than a gap: an event with no `touchedAt` has never been edited
 * by a build that records one, and a rule that guessed would report every old
 * file as stale on the day it was opened.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleElevenStaleRevisionDate(event) {
  const meta = (event && event.meta) || {};
  const revised = String(meta.revisionDate || '');
  const touched = String(meta.touchedAt || '');
  if (!revised || !touched) return [];

  const editedOn = touched.slice(0, 10);
  if (!editedOn || revised >= editedOn) return [];

  return [finding({
    rule: 11,
    severity: WARNING,
    text: `The revision line says ${formatDateShort(revised)}, but this event was last edited on `
      + `${formatDateShort(editedOn)} — set the revision date before it goes out.`,
    area: 'meta',
    rowIds: [],
    date: editedOn
  })];
}

/**
 * §12.12 — a meal typed into both arrays.
 *
 * Protecting against: dinner printed twice on one itinerary. Until v7 a meal
 * was typed once as a schedule line and once as an F&B entry, and the two
 * drifted the first time somebody moved it by half an hour; the itinerary is
 * now the merge of both (§7 [v7]), which fixes the drift and makes the
 * duplicate visible instead.
 *
 * Same date, same start, same words. The label is compared case-insensitively
 * and trimmed, because "dinner" and "Dinner " are the same typing mistake; a
 * blank label matches nothing, so the three blank rows every day is seeded with
 * (§5, v10 changes) fire nothing.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleTwelveMealTypedTwice(event) {
  const meals = rowsOf(event, 'foodAndBev');
  const found = [];

  for (const entry of rowsOf(event, 'schedule')) {
    const label = String(entry.label || '').trim().toLowerCase();
    if (!label || !entry.date) continue;
    for (const meal of meals) {
      if (meal.date !== entry.date) continue;
      if (String(meal.meal || '').trim().toLowerCase() !== label) continue;
      if (String(meal.start || '') !== String(entry.start || '')) continue;
      const when = entry.start ? ` at ${formatTime(entry.start)}` : '';
      found.push(finding({
        rule: 12,
        severity: WARNING,
        text: `"${String(entry.label).trim()}" is an itinerary row and a meal service on `
          + `${formatDateShort(entry.date)}${when} — it will print twice on the itinerary. `
          + 'Delete the itinerary row; the meal puts itself there.',
        area: 'schedule',
        rowIds: [entry.id, meal.id],
        date: entry.date
      }));
    }
  }
  return found;
}

/**
 * §12.13 — a name the property registry no longer carries.
 *
 * Protecting against: the quiet half of a registry correction. v13 replaced a
 * list of locations that were never private-side to begin with (§6 [v13]), and
 * the rows that named them are still in files on the machine right now. Nothing
 * rewrites them — somebody planned something at the Hummer Bar, and the words
 * are the only record of it — so this is what goes on saying so, every time the
 * file is opened, exactly as §12.6 does for a room that has left the property.
 *
 * **A location is reported only when the app itself offered it.** `location` is
 * free text (§6 [v13]): "the north blind" typed into a meal is a perfectly good
 * location, and a rule reading "not in the current list" would fire on every
 * deliberate one. `RETIRED_LOCATIONS` is the list of names this app used to
 * offer, and it is the only thing this half reads.
 *
 * **A building is reported whenever it is not in the registry**, which is the
 * opposite test, and the difference is not an inconsistency. Buildings are
 * ticked from the registry and never typed (§6), so the only way an unknown one
 * reaches `buildingsInUse[]` is a file older than the registry — and the
 * buildings line prints that name on the order as a building in use.
 *
 * @param {object} event
 * @returns {Finding[]}
 */
function ruleThirteenRetiredNames(event) {
  const found = [];

  const dated = [
    { key: 'foodAndBev', area: 'foodAndBev', phrase: mealPhrase },
    { key: 'schedule', area: 'schedule', phrase: activityPhrase }
  ];
  for (const kind of dated) {
    for (const entry of rowsOf(event, kind.key)) {
      const retired = retiredLocation(entry.location);
      if (!retired) continue;
      const instead = retired.becomes
        ? `That is ${retired.becomes} now.`
        : 'It is not a place on the private side.';
      found.push(finding({
        rule: 13,
        severity: NOTE,
        text: `${kind.phrase(entry)} is at ${retired.name}, which the property list no longer `
          + `carries. ${instead} It prints as it was typed until somebody changes it.`,
        area: kind.area,
        rowIds: [entry.id],
        date: entry.date || ''
      }));
    }
  }

  const lists = [
    { key: 'buildingsInUse', phrase: 'named as a building in use' },
    { key: 'overflowBuildings', phrase: 'named as a building held back' }
  ];
  for (const list of lists) {
    const names = Array.isArray(event && event[list.key]) ? event[list.key] : [];
    for (const name of names) {
      const text = String(name || '').trim();
      if (!text || LODGING_BUILDINGS.includes(text)) continue;
      found.push(finding({
        rule: 13,
        severity: NOTE,
        text: `${text} is ${list.phrase} and is not a building on the property — it prints on `
          + 'the guests section as it stands.',
        area: 'guests',
        rowIds: [],
        date: ''
      }));
    }
  }

  return found;
}

/* --------------------------------------------------------------------- pass */

/**
 * The rules, in §12's order. Order matters only in that findings come back in
 * it, which is what makes two runs over the same event comparable.
 */
const RULES = [
  ruleOneOverrides,
  ruleTwoUnhousedGuests,
  ruleThreeUnresolvedGuests,
  ruleFourDoubleClaimedRooms,
  ruleFiveBookingOutsideStay,
  ruleSixRoomAgainstMode,
  ruleSevenOrphanMenus,
  ruleEightMealsWithNoMenu,
  ruleNineDatedOutsideEvent,
  ruleTenBackwardsStays,
  ruleElevenStaleRevisionDate,
  ruleTwelveMealTypedTwice,
  ruleThirteenRetiredNames
];

/**
 * Every §12 finding on an event, in rule order.
 *
 * @param {object} event
 * @returns {Finding[]} empty on a clean event, and on no event at all
 */
export function validateEvent(event) {
  if (!event) return [];
  const found = [];
  for (const rule of RULES) found.push(...rule(event));
  return found;
}

/**
 * Findings by the row they are about — the shape an editor wants, so a row can
 * ask what is wrong with it without every row walking the whole list.
 *
 * A finding naming two rows appears under both: rule 4 marks every booking in
 * the clash, and rule 12 marks the itinerary row and the meal.
 *
 * @param {Finding[]} findings
 * @returns {Map<string, Finding[]>}
 */
export function findingsByRow(findings) {
  const byRow = new Map();
  for (const item of findings || []) {
    for (const id of item.rowIds) {
      if (!byRow.has(id)) byRow.set(id, []);
      byRow.get(id).push(item);
    }
  }
  return byRow;
}

/**
 * Findings by area — what the section navigator marks.
 *
 * @param {Finding[]} findings
 * @returns {Map<string, Finding[]>}
 */
export function findingsByArea(findings) {
  const byArea = new Map();
  for (const item of findings || []) {
    if (!byArea.has(item.area)) byArea.set(item.area, []);
    byArea.get(item.area).push(item);
  }
  return byArea;
}

/**
 * How many of each severity. The one number the print control shows before
 * anybody asks for the list.
 *
 * @param {Finding[]} findings
 * @returns {{warning: number, note: number, total: number}}
 */
export function severityCounts(findings) {
  const counts = { warning: 0, note: 0, total: 0 };
  for (const item of findings || []) {
    if (item.severity === WARNING) counts.warning += 1;
    else counts.note += 1;
    counts.total += 1;
  }
  return counts;
}

/**
 * Findings grouped for the pre-print panel: warnings first, then notes, each
 * group in rule order. §12 [v12].
 *
 * Warnings first because they are the ones that change what comes out of the
 * printer; notes are read to be dismissed, and a panel that leads with them
 * teaches the reader to scroll past the top of it.
 *
 * @param {Finding[]} findings
 * @returns {{severity: string, findings: Finding[]}[]} groups holding nothing
 *   are absent
 */
export function findingsForPrint(findings) {
  return [WARNING, NOTE]
    .map((severity) => ({
      severity,
      findings: (findings || []).filter((item) => item.severity === severity)
    }))
    .filter((group) => group.findings.length > 0);
}
