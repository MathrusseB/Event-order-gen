// The board ownership is sent — BUILD-SPEC §9, §5 [v11].
//
// This module runs in exactly one place: the self-contained file js/export.js
// writes. It is never loaded by index.html and it never reaches application
// state — there is none where it runs. It reads the event out of the page it
// was inlined into, mounts a board over it, and hands nothing back to anybody.
//
// WHO OPENS IT. Ownership rearranges rooms. They are not going to open an app,
// find a Load button, or pick a file: they tap an attachment in a text message,
// standing up, on a phone, with one thumb. Everything below follows from that
// sentence. The night is always on screen. The rooms an event actually uses are
// open and the other six buildings are folded, because sixty-six rooms is a
// minute of scrolling to reach the four that matter. Nothing is smaller than a
// thumb.
//
// THERE IS NO ROUND TRIP, AND THAT IS THE DESIGN. Nothing here saves to the
// ranch's system, posts anywhere, or produces a blob to paste back. An import
// was considered and declined: a merge has to answer what happens when both
// sides moved the same guest, and no answer to that is one anybody would trust.
// Brian reads what ownership did off this screen and either amends the event
// order himself or emails the staff. So the board's real job is not to record
// the change — it is to *show* it: what moved, what was added, what was taken
// off, marked in place and listed in one group at the top.
//
// IT IS NOT A SECOND IMPLEMENTATION. Every rule about what a move does to
// `rooming[]` comes from js/rooming.js, inlined verbatim beside this file:
// placeGuest, releaseGuest, which rows hold a room on a night, which rooms to
// lay out, what to call a place, and the question a taken room asks. The
// range-splitting took real work and a second copy of it would drift from the
// first inside a month — so there is one copy, and tests/checks/export.mjs
// makes the same rearrangement on both sides and compares the arrays.
//
// The one thing this file owns outright is the surface: a screen, not a
// document, in a visual system that is nothing like the generator's. See
// css/ownership.css.

import {
  coversNight,
  describeMove,
  nameOf,
  namesAnybody,
  nightsPhrase,
  occupiedQuestion,
  partyOfRow,
  placeGuest,
  placeLabel,
  placeName,
  releaseGuest,
  roomKeyOf,
  roomsToShow,
  rowHolding,
  rowsAt,
  sentenceCase,
  stillInPlay
} from './rooming.js';
import {
  attendeeById,
  attendeeName,
  buildingsFor,
  eventNights,
  roomOccupancyOn,
  unassignedGuestsOn
} from './derive.js';
import { formatDate, formatDateRange, formatDateShort } from './dates.js';
import { LODGING_BUILDINGS, roomsIn } from './reference.js';
import { newId } from './ids.js';
import { el, setHidden, setText, toggleClass } from './dom.js';
import { documentById, printRule, renderDocument } from './render.js';

/** How many moves the board can take back, matching the in-app board (§9). */
const UNDO_DEPTH = 10;

/** Where a working copy lives on ownership's own device. Best effort only. */
const KEEP_PREFIX = 'rooming-board:';

/**
 * The separator inside a place key — the building, then the room.
 *
 * A unit separator: no building name and no room label can contain one. Built
 * from its code point rather than written into the source, so this file stays
 * plain text to every tool that reads it and survives being inlined into HTML.
 */
const SEP = String.fromCharCode(31);

/** A place, as one comparable string. */
function placeKey(building, room) {
  return `${building || ''}${SEP}${room || ''}`;
}

/* ========================================================================== *
 * State. One event, replaced whole; `commit` is the only thing that writes it.
 * ========================================================================== */

/** The assignment the file was exported with. Never written to. */
let baseline = null;
/** The event as it stands. Replaced, never mutated. */
let event = null;
/** The brand logo, inlined by the exporter as a data URI. */
let logoSrc = '';

let night = '';
let picked = '';
let scope = 'stay';
let editing = false;
let restored = false;

/** Buildings the reader has unfolded, plus the overflow control's own state. */
const unfolded = new Set();
let othersOpen = false;
/** The changes group is open by default: it is what Brian opens the file for. */
let changesOpen = true;

/** `rooming[]` and `attendees[]` from before each of the last ten moves. */
const history = [];

/* --------------------------------------------------------------- furniture */

const barTitle = el('span', { class: 'ob-bar__title' });
const nightsBox = el('nav', { class: 'ob-nights', 'aria-label': 'Night' });
const main = el('main', { class: 'ob-main' });
const handWho = el('span', { class: 'ob-hand__who' });
const sheet = el('dialog', { class: 'ob-sheet' });

let root = null;
let bar = null;
let paper = null;
let pageStyle = null;
let paperStale = true;
let undoButton = null;
let outButton = null;
let scopeButtons = [];

/* ========================================================================== *
 * Boot
 * ========================================================================== */

/**
 * Read the event out of the page and mount the board over it.
 *
 * Called by the one line of script js/export.js writes at the foot of the
 * exported file. Everything it needs is already in the document: there is no
 * fetch to make and no network to make it on.
 */
export function startOwnershipBoard() {
  const data = JSON.parse(document.getElementById('board-event').textContent);
  const logo = document.getElementById('board-logo');

  baseline = deepFreeze(data);
  event = JSON.parse(JSON.stringify(data));
  logoSrc = logo ? logo.textContent.trim() : '';

  root = document.getElementById('board');
  paper = document.getElementById('board-paper');
  pageStyle = document.getElementById('board-page-rule');

  const meta = event.meta || {};
  const name = String(meta.eventName || '').trim() || 'Untitled event';
  const dates = formatDateRange(meta.startDate, meta.endDate) || 'Dates not set';
  document.title = `Rooming — ${name}`;
  setText(barTitle, name);

  bar = el('header', { class: 'ob-bar' }, [
    el('div', { class: 'ob-bar__row' }, [
      // Before the title arrives in it, the bar's left half says what the row
      // under it is. After, it carries the event's name.
      el('span', { class: 'ob-bar__hint', text: 'Night' }),
      barTitle,
      barActions()
    ]),
    nightsBox
  ]);

  root.className = 'ob';
  root.append(
    el('div', { class: 'ob-large' }, [
      el('h1', { class: 'ob-large__title', text: 'Rooming' }),
      el('p', { class: 'ob-large__event', text: name }),
      el('p', { class: 'ob-large__dates', text: dates })
    ]),
    el('div', { class: 'ob-sentinel' }),
    bar,
    main,
    handBar(),
    sheet
  );

  night = eventNights(event)[0] || '';
  restored = restore();
  watchScroll();
  guardUnload();
  draw();
}

/** The bar's actions. Two, both text: nothing here needs an icon to be read. */
function barActions() {
  undoButton = el('button', {
    type: 'button',
    class: 'ob-action',
    text: 'Undo',
    onclick: undoLast
  });

  const print = el('button', {
    type: 'button',
    class: 'ob-action',
    text: 'Print',
    onclick: printSheet
  });

  return el('div', { class: 'ob-bar__actions' }, [undoButton, print]);
}

/**
 * The bar that appears between the two taps.
 *
 * Pinned to the bottom rather than the top: the thumb is already down there,
 * and what it holds — who is in hand, and how far the next tap reaches — is the
 * only thing on screen that matters until a room is chosen.
 */
function handBar() {
  const scopeNight = el('button', {
    type: 'button', class: 'ob-scope__btn', text: 'This night',
    onclick: () => { scope = 'night'; draw(); }
  });
  const scopeStay = el('button', {
    type: 'button', class: 'ob-scope__btn', text: 'Rest of their stay',
    onclick: () => { scope = 'stay'; draw(); }
  });
  scopeButtons = [[scopeNight, 'night'], [scopeStay, 'stay']];

  // The way out of a room, rather than into another one. It appears only when
  // the guest in hand is actually in something: "take them out" of nowhere is
  // not an action, and a control that is sometimes inert is worse than one that
  // is sometimes absent.
  outButton = el('button', {
    type: 'button', class: 'ob-hand__out', text: 'Out of the room',
    onclick: () => release(picked)
  });

  return el('div', { class: 'ob-hand' }, [
    el('div', { class: 'ob-hand__row' }, [
      handWho,
      outButton,
      el('button', {
        type: 'button', class: 'ob-hand__cancel', text: 'Cancel',
        onclick: () => { picked = ''; draw(); }
      })
    ]),
    el('div', { class: 'ob-scope', role: 'group', 'aria-label': 'How far the move reaches' },
      [scopeNight, scopeStay])
  ]);
}

/**
 * The large title settles into a compact one. A sentinel one pixel tall at the
 * foot of the title block, and the bar's class follows whether it is on screen
 * — no scroll handler, no measurement, and nothing to jank.
 *
 * Without an observer there is no effect at all, which is the honest fallback:
 * a plain large title reads correctly, and a half-working one does not.
 */
function watchScroll() {
  const sentinel = root.querySelector('.ob-sentinel');
  if (typeof IntersectionObserver !== 'function' || !sentinel) return;
  new IntersectionObserver(([entry]) => {
    toggleClass(bar, 'is-compact', !entry.isIntersecting);
  }).observe(sentinel);
}

/** Ownership's changes are worth a browser's own are-you-sure. */
function guardUnload() {
  window.addEventListener('beforeunload', (leaving) => {
    if (!countChanges(diff())) return;
    leaving.preventDefault();
    leaving.returnValue = '';
  });
}

/* ========================================================================== *
 * Writing. One path in and out, exactly as the in-app board has.
 * ========================================================================== */

function commit(next, description) {
  history.push({
    rooming: [...(event.rooming || [])],
    attendees: [...(event.attendees || [])],
    description
  });
  while (history.length > UNDO_DEPTH) history.shift();
  event = next;
  picked = '';
  paperStale = true;
  keep();
  draw();
}

function undoLast() {
  const last = history.pop();
  if (!last) return;
  event = { ...event, rooming: last.rooming, attendees: last.attendees };
  picked = '';
  paperStale = true;
  keep();
  draw();
}

/**
 * A working copy on ownership's own device, and nothing more than that.
 *
 * This is not a round trip and cannot become one: it never leaves the phone,
 * and the app that made the file cannot read it. It exists because the failure
 * it prevents is the one this whole board is against — a guest lost in the
 * shuffle. A tab evicted by a phone call, twenty minutes of rearranging gone,
 * and nobody the wiser.
 *
 * Silent when storage is unavailable, which for a file opened out of a
 * Downloads folder it often is.
 */
/**
 * Which event this is, and which *sending* of it.
 *
 * The second half matters. Brian amends the order and sends a new file, and
 * without the assignment's own fingerprint in the key the new file would open
 * on the copy ownership left in the old one — their week-old moves restored
 * over an event that has moved on, marked as changes against a baseline they
 * were never made against. A re-export is a different key, and a different key
 * starts clean.
 */
function keepKey() {
  const meta = baseline.meta || {};
  return `${keepPrefix()}${stamp(JSON.stringify([baseline.rooming, baseline.attendees]))}`;
}

/** The event, without the sending. Everything under it is this event's. */
function keepPrefix() {
  const meta = baseline.meta || {};
  return `${KEEP_PREFIX}${meta.eventName || 'event'}|${meta.startDate || ''}|`;
}

/** FNV-1a, as eight hex digits. Not a checksum — a name for one assignment. */
function stamp(text) {
  let hash = 0x811c9dc5;
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function keep() {
  try {
    const key = keepKey();
    window.localStorage.setItem(key, JSON.stringify({
      rooming: event.rooming,
      attendees: event.attendees
    }));
    // An earlier sending of this same event has nothing left to say. Other
    // events keep theirs: ownership may have two boards open in two tabs.
    for (const other of Object.keys(window.localStorage)) {
      if (other !== key && other.startsWith(keepPrefix())) window.localStorage.removeItem(other);
    }
  } catch (err) {
    // Private mode, quota, a file:// origin with storage off. Not an error.
  }
}

function restore() {
  try {
    const text = window.localStorage.getItem(keepKey());
    if (!text) return false;
    const held = JSON.parse(text);
    if (!held || !Array.isArray(held.rooming) || !Array.isArray(held.attendees)) return false;
    event = { ...event, rooming: held.rooming, attendees: held.attendees };
    return countChanges(diff()) > 0;
  } catch (err) {
    return false;
  }
}

function forget() {
  try {
    window.localStorage.removeItem(keepKey());
  } catch (err) {
    // As above.
  }
}

/** Back to the assignment the file was sent with. */
function resetToSent() {
  history.length = 0;
  event = JSON.parse(JSON.stringify(baseline));
  picked = '';
  restored = false;
  paperStale = true;
  forget();
  draw();
}

/* ========================================================================== *
 * Moves. Every one of them goes through js/rooming.js.
 * ========================================================================== */

function pick(guestId) {
  picked = picked === guestId ? '' : guestId;
  draw();
}

/**
 * Place the guest in hand. Which of the three outcomes applies is decided here,
 * because this is the only place that knows what the room looked like when it
 * was tapped — and the wording of the question comes from rooming.js, so both
 * boards ask it the same way.
 */
async function place(building, room) {
  if (!picked || !night) return;

  const rows = event.rooming || [];
  const here = rowsAt(event, rows, building, room, night);
  const occupied = here.filter(namesAnybody);
  const source = rowHolding(event, rows, picked, night);
  const guestId = picked;
  const label = placeLabel(building, room);

  if (source && here.some((row) => row.id === source.id)) {
    picked = '';
    draw();
    return;
  }

  let how = 'move';
  if (occupied.length) {
    how = await askOccupied({ guestId, source, occupied, label });
    if (!how) return;
  }

  const displaced = occupied.flatMap(partyOfRow).filter((id) => id !== guestId);
  const { event: next, nights: covered } = placeGuest(event, {
    guestId, building, room, night, how, through: scope === 'stay'
  });
  commit(next, describeMove({ event, guestId, label, how, covered, displaced, source }));
}

/** Take a guest out of the room they are in, for this night. */
function release(guestId) {
  const row = rowHolding(event, event.rooming || [], guestId, night);
  if (!row) return;
  const where = placeLabel(row.building, roomKeyOf(row));
  const { event: next } = releaseGuest(event, { guestId, night });
  commit(next, `${nameOf(event, guestId)} out of ${where} for ${formatDate(night)}`);
}

/** The three outcomes, as a sheet from the bottom rather than a modal box. */
function askOccupied(question) {
  const { choices, heading, lead } = occupiedQuestion({ ...question, event, night });

  return openSheet((close) => [
    el('h2', { class: 'ob-sheet__head', text: heading }),
    el('p', { class: 'ob-sheet__lead', text: lead }),
    el('div', { class: 'ob-sheet__choices' }, choices.map((choice) => el('button', {
      type: 'button',
      class: 'ob-choice',
      'data-answer': choice.value,
      onclick: () => close(choice.value)
    }, [
      el('span', { class: 'ob-choice__title', text: choice.title }),
      el('span', { class: 'ob-choice__detail', text: choice.detail })
    ]))),
    el('div', { class: 'ob-sheet__actions' }, [
      el('button', { type: 'button', class: 'ob-btn', text: 'Cancel', onclick: () => close(null) })
    ])
  ]);
}

/* ------------------------------------------------------- guests on and off */

/**
 * Put a name on the list.
 *
 * §5 [v11] — a guest added here changes the meal counts on the event order, so
 * the sheet says so before the name is added and the board marks it afterwards.
 * Ownership can add somebody; nobody can add somebody quietly.
 */
function addGuestSheet() {
  const meta = event.meta || {};
  const first = field('First name', 'text', '');
  const last = field('Last name', 'text', '');
  const arrive = field('Arrives', 'date', meta.startDate || '');
  const depart = field('Departs', 'date', meta.endDate || '');
  const child = el('input', { type: 'checkbox' });
  const problem = el('p', { class: 'ob-error', hidden: true });

  openSheet((close) => [
    el('h2', { class: 'ob-sheet__head', text: 'Add a guest' }),
    el('p', {
      class: 'ob-sheet__lead',
      text: 'A name added here changes the meal counts on the event order, so it is marked on the '
        + 'board rather than folded in with the room moves.'
    }),
    problem,
    el('div', { class: 'ob-sheet__fields' }, [first.node, last.node, arrive.node, depart.node]),
    el('label', { class: 'ob-toggle' }, [child, el('span', { text: 'Child' })]),
    el('div', { class: 'ob-sheet__actions' }, [
      el('button', { type: 'button', class: 'ob-btn', text: 'Cancel', onclick: () => close(null) }),
      el('button', {
        type: 'button', class: 'ob-btn ob-btn--go', text: 'Add', onclick: () => {
          const attendee = {
            id: newId(),
            last: last.input.value.trim(),
            first: first.input.value.trim(),
            arrive: arrive.input.value,
            depart: depart.input.value,
            isChild: child.checked,
            dietary: '',
            note: ''
          };
          if (!attendee.first && !attendee.last) {
            setText(problem, 'A guest needs a name.');
            setHidden(problem, false);
            return;
          }
          if (attendee.arrive && attendee.depart && attendee.depart < attendee.arrive) {
            setText(problem, 'They cannot leave before they arrive.');
            setHidden(problem, false);
            return;
          }
          close(attendee);
        }
      })
    ])
  ]).then((attendee) => {
    if (!attendee) return;
    commit(
      { ...event, attendees: [...(event.attendees || []), attendee] },
      `${attendeeName(attendee)} added to the guest list`
    );
  });
}

/**
 * Take a name off the list.
 *
 * Their rooming rows are left exactly where they are — nothing in this app
 * deletes down a chain, and a room quietly emptying itself is how a booking
 * disappears without anybody deciding to cancel it. The board shows the name
 * struck through in the room it still holds, and the change list says so.
 */
function removeGuest(guestId) {
  const guest = nameOf(event, guestId);
  const row = rowHolding(event, event.rooming || [], guestId, night);
  const where = row ? placeLabel(row.building, roomKeyOf(row)) : '';

  openSheet((close) => [
    el('h2', { class: 'ob-sheet__head', text: `Take ${guest} off the list?` }),
    el('p', {
      class: 'ob-sheet__lead',
      text: where
        ? `${sentenceCase(where)} stays booked and is not released — Brian decides what happens `
          + 'to the room. The meal counts change either way.'
        : 'The meal counts on the event order change. Nothing else is deleted.'
    }),
    el('div', { class: 'ob-sheet__actions' }, [
      el('button', { type: 'button', class: 'ob-btn', text: 'Keep', onclick: () => close(false) }),
      el('button', {
        type: 'button', class: 'ob-btn ob-btn--off', text: 'Take off', onclick: () => close(true)
      })
    ])
  ]).then((yes) => {
    if (!yes) return;
    commit(
      { ...event, attendees: (event.attendees || []).filter((a) => a && a.id !== guestId) },
      `${guest} taken off the guest list`
    );
  });
}

/* ------------------------------------------------------------------ sheets */

/**
 * A sheet from the bottom. Resolves with whatever `close` was handed.
 *
 * One `<dialog>`, reused: it takes focus, keeps it, closes on Escape, and comes
 * with a backdrop the platform draws. Everything a hand-built overlay has to be
 * told to do, and nothing left to get wrong.
 */
function openSheet(build) {
  return new Promise((resolve) => {
    let answer = null;
    const close = (value) => {
      answer = value;
      sheet.close();
    };

    sheet.replaceChildren(
      el('div', { class: 'ob-sheet__grip', 'aria-hidden': 'true' }),
      el('div', { class: 'ob-sheet__body' }, build(close))
    );

    const settle = () => {
      sheet.removeEventListener('close', settle);
      resolve(answer);
    };
    sheet.addEventListener('close', settle);
    sheet.showModal();
  });
}

/** One labelled field in a sheet. */
function field(label, type, value) {
  const input = el('input', { class: 'ob-field__input', type, value });
  return {
    input,
    node: el('label', { class: `ob-field${type === 'date' ? '' : ' ob-field--wide'}` }, [
      el('span', { class: 'ob-field__label', text: label }),
      input
    ])
  };
}

/* ========================================================================== *
 * What changed. The reason the file is worth opening twice.
 * ========================================================================== */

/** Where everybody is on one night: guest id -> place key. */
function placesOn(source, date) {
  const places = new Map();
  for (const row of (source && source.rooming) || []) {
    if (!coversNight(source, row, date)) continue;
    const key = placeKey(row.building, roomKeyOf(row));
    for (const id of partyOfRow(row)) places.set(id, key);
  }
  return places;
}

/** A place key back as words. */
function keyLabel(key) {
  if (!key) return 'no room';
  const cut = key.indexOf(SEP);
  return placeLabel(key.slice(0, cut), key.slice(cut + 1));
}

/**
 * The difference between the assignment sent and the one on screen.
 *
 * Three kinds, and they are deliberately not equal. A guest added or taken off
 * changes what the kitchen cooks and what the event order says; a guest who
 * only changed rooms does not. So the first two are named plainly and marked
 * with a filled pill, and the third is a quieter line — see the note about the
 * accent in css/ownership.css.
 *
 * Moves are collapsed by where they went: a guest carried through four nights
 * of a stay is one line reading "Sat through Tue", not four.
 *
 * @returns {{added: object[], removed: object[], moved: object[],
 *   marks: Map<string, string>, nights: string[]}}
 */
function diff() {
  const nights = eventNights(baseline);
  const before = (baseline.attendees || []).filter(Boolean);
  const after = (event.attendees || []).filter(Boolean);
  const wasThere = new Set(before.map((a) => a.id));
  const isThere = new Set(after.map((a) => a.id));

  const added = after.filter((a) => !wasThere.has(a.id));
  const removed = before.filter((a) => !isThere.has(a.id));

  const marks = new Map();
  for (const a of added) marks.set(a.id, 'added');
  for (const a of removed) marks.set(a.id, 'removed');

  const runs = new Map();
  for (const date of nights) {
    const was = placesOn(baseline, date);
    const now = placesOn(event, date);
    for (const id of new Set([...was.keys(), ...now.keys()])) {
      const mark = marks.get(id);
      if (mark === 'added' || mark === 'removed') continue;
      const from = was.get(id) || '';
      const to = now.get(id) || '';
      if (from === to) continue;
      const key = [id, from, to].join(SEP + SEP);
      if (!runs.has(key)) runs.set(key, { id, from, to, nights: [] });
      runs.get(key).nights.push(date);
      marks.set(id, 'moved');
    }
  }

  return { added, removed, moved: [...runs.values()], marks, nights };
}

function countChanges(d) {
  return d.added.length + d.removed.length + d.moved.length;
}

/** The rooms whose party is not the one the file was sent with, on one night. */
function changedPlacesOn(date) {
  const was = placesOn(baseline, date);
  const now = placesOn(event, date);
  const changed = new Set();
  for (const [id, key] of was) if (now.get(id) !== key) changed.add(key);
  for (const [id, key] of now) if (was.get(id) !== key) changed.add(key);
  return changed;
}

/* ========================================================================== *
 * Drawing
 * ========================================================================== */

function draw() {
  const spine = eventNights(event);
  if (!spine.includes(night)) night = spine[0] || '';
  if (picked && !stillInPlay(event, picked, night)) picked = '';

  drawNights(spine);
  drawHand();

  const last = history[history.length - 1];
  undoButton.disabled = !last;
  toggleClass(undoButton, 'is-off', !last);
  undoButton.setAttribute('aria-label', last ? `Undo ${last.description}` : 'Nothing to undo');

  // Focus survives the rebuild: every control that can hold it carries a key,
  // and the same key is focused again on the other side. Without it, a tap on
  // a room from the keyboard would drop the caret back to the top of the page.
  const held = document.activeElement && document.activeElement.dataset
    ? document.activeElement.dataset.focus
    : null;

  main.replaceChildren(...sections());

  if (held) {
    const back = main.querySelector(`[data-focus="${CSS.escape(held)}"]`);
    if (back) back.focus({ preventScroll: true });
  }
}

function drawHand() {
  toggleClass(root, 'is-holding', Boolean(picked));
  handWho.replaceChildren();
  const inRoom = picked ? rowHolding(event, event.rooming || [], picked, night) : null;
  setHidden(outButton, !inRoom);
  if (inRoom) {
    outButton.setAttribute('aria-label',
      `Take ${nameOf(event, picked)} out of ${placeLabel(inRoom.building, roomKeyOf(inRoom))} `
      + `for ${formatDate(night)}`);
  }
  if (picked) {
    // Two lines, each clipped on its own. The scope is not restated here: the
    // control directly below is the statement, and saying it twice is what made
    // this line too long to read on a phone.
    handWho.append(
      el('span', { class: 'ob-hand__name', text: nameOf(event, picked) }),
      el('span', { class: 'ob-hand__what', text: 'Tap a room' })
    );
  }
  for (const [button, value] of scopeButtons) toggleClass(button, 'is-on', scope === value);
}

/** One control per night (§9), and a flag on any night somebody has no bed. */
function drawNights(spine) {
  nightsBox.replaceChildren(...spine.map((date) => {
    const parts = formatDate(date).split(', ');
    const unroomed = unassignedGuestsOn(event, date).length;
    return el('button', {
      type: 'button',
      class: `ob-night${date === night ? ' is-on' : ''}`,
      'aria-pressed': String(date === night),
      'aria-label': `${formatDate(date)}${unroomed ? ` — ${unroomed} with no room` : ''}`,
      onclick: () => { night = date; picked = ''; draw(); }
    }, [
      el('span', { class: 'ob-night__day', text: parts[0] || '' }),
      el('span', { class: 'ob-night__date', text: parts[1] || formatDateShort(date) }),
      unroomed ? el('span', { class: 'ob-night__flag', 'aria-hidden': 'true' }) : null
    ].filter(Boolean));
  }));
}

/** Every group, in the order a phone should meet them. */
function sections() {
  const d = diff();
  return [
    changesGroup(d),
    unassignedNotice(),
    ...guestGroups(d),
    ...buildingGroups(d),
    otherBuildings(),
    el('p', {
      class: 'ob-lead',
      text: 'This is a copy of the rooming sheet, sent as a file. Nothing changed here reaches the '
        + 'ranch — Brian reads it off this screen and updates the event order himself.'
    })
  ].filter(Boolean);
}

/* ------------------------------------------------------------ the changes */

function changesGroup(d) {
  const total = countChanges(d);
  if (!total) return null;

  const parts = [];
  if (d.added.length) parts.push(`${d.added.length} added`);
  if (d.removed.length) parts.push(`${d.removed.length} taken off`);
  if (d.moved.length) parts.push(`${d.moved.length} moved`);

  const rows = [el('li', {}, [el('button', {
    type: 'button',
    class: 'ob-row',
    'data-focus': 'changes-summary',
    'aria-expanded': String(changesOpen),
    onclick: () => { changesOpen = !changesOpen; draw(); }
  }, [
    el('span', { class: 'ob-fold' }, [
      el('span', { class: 'ob-fold__glyph', 'aria-hidden': 'true', text: '>' })
    ]),
    el('span', { class: 'ob-row__main' }, [
      el('span', {
        class: 'ob-row__name',
        text: `${total} change${total === 1 ? '' : 's'} since this was sent`
      }),
      el('span', { class: 'ob-row__note', text: parts.join(' · ') })
    ])
  ])])];

  if (changesOpen) {
    for (const guest of d.added) rows.push(el('li', {}, [changeRow(guest, 'added', addedLine(guest))]));
    for (const guest of d.removed) {
      rows.push(el('li', {}, [changeRow(guest, 'removed', removedLine(guest))]));
    }
    for (const run of d.moved) {
      const guest = attendeeById(event, run.id) || attendeeById(baseline, run.id);
      rows.push(el('li', {}, [changeRow(guest, 'moved',
        `${nightsPhrase(run.nights)}: ${keyLabel(run.from)} to ${keyLabel(run.to)}`)]));
    }
  }

  const counted = d.added.length + d.removed.length;

  return el('section', { class: 'ob-group' }, [
    el('h2', { class: 'ob-group__head', text: 'Changed since this was sent' }),
    el('ul', { class: 'ob-list' }, rows),
    el('p', { class: 'ob-group__foot' }, [
      el('span', {
        text: counted
          ? 'Names added or taken off change the meal counts on the event order. '
          : 'Room moves only — the meal counts are unchanged. '
      }),
      el('button', {
        type: 'button',
        class: 'ob-action ob-action--link',
        'data-focus': 'reset',
        text: 'Reset to what was sent',
        onclick: confirmReset
      })
    ]),
    restored ? el('p', {
      class: 'ob-group__foot',
      text: 'These were restored from this device. The file itself still holds the assignment it '
        + 'was sent with, and Reset goes back to it.'
    }) : null
  ].filter(Boolean));
}

function addedLine(guest) {
  const dates = formatDateRange(guest.arrive, guest.depart);
  return `Not on the list when this was sent${dates ? ` — ${dates}` : ''}`;
}

function removedLine(guest) {
  const rows = (event.rooming || []).filter((row) => partyOfRow(row).includes(guest.id));
  if (!rows.length) return 'Taken off the list. They held no room.';
  const where = placeLabel(rows[0].building, roomKeyOf(rows[0]));
  return `Taken off the list. ${sentenceCase(where)} is still booked under their name.`;
}

function changeRow(guest, kind, what) {
  const label = { added: 'Added', removed: 'Removed', moved: 'Moved' }[kind];
  return el('div', { class: `ob-row ob-change${kind === 'removed' ? ' is-removed' : ''}` }, [
    el('span', { class: 'ob-row__main' }, [
      el('span', { class: 'ob-row__name' }, [
        el('span', { text: attendeeName(guest) || 'Unnamed guest' }),
        el('span', { class: `ob-mark ob-mark--${kind}`, text: label })
      ]),
      el('span', { class: 'ob-change__what', text: what })
    ])
  ]);
}

function confirmReset() {
  openSheet((close) => [
    el('h2', { class: 'ob-sheet__head', text: 'Reset to what was sent?' }),
    el('p', {
      class: 'ob-sheet__lead',
      text: 'Every move, every name added and every name taken off goes back to the assignment '
        + 'this file arrived with. There is no undo for this one.'
    }),
    el('div', { class: 'ob-sheet__actions' }, [
      el('button', {
        type: 'button', class: 'ob-btn', text: 'Keep them', onclick: () => close(false)
      }),
      el('button', {
        type: 'button', class: 'ob-btn ob-btn--off', text: 'Reset', onclick: () => close(true)
      })
    ])
  ]).then((yes) => { if (yes) resetToSent(); });
}

/* --------------------------------------------------------- nobody's room */

/**
 * A guest staying this night with nowhere to sleep. §12.2, and the thing this
 * board was asked for by name.
 *
 * Said plainly, on the night it happens. The other nights are named underneath
 * with a way straight to them, because the guest forgotten in the shuffle is
 * normally forgotten on the night nobody thought to look at.
 */
function unassignedNotice() {
  if (!night) return null;
  const here = unassignedGuestsOn(event, night);
  const elsewhere = eventNights(event)
    .filter((date) => date !== night && unassignedGuestsOn(event, date).length);

  if (!here.length && !elsewhere.length) return null;

  const kids = here.filter((guest) => guest.isChild).length;

  return el('section', { class: 'ob-notice' }, [
    el('h2', {
      class: 'ob-notice__head',
      text: here.length
        ? `${here.length === 1 ? 'One guest has' : `${here.length} guests have`} no room on `
          + formatDate(night)
        : `Everybody has a room on ${formatDate(night)}`
    }),
    el('p', {
      class: 'ob-notice__lead',
      text: here.length
        ? 'Staying that night and named on no room. Tap a name, then tap a room.'
          + (kids ? ' A child rooming with family is often meant to be off the sheet — worth '
            + 'checking before moving anybody.' : '')
        : 'But not on every night of this event.'
    }),
    here.length ? el('ul', { class: 'ob-notice__names' }, here.map((guest) => el('li', {}, [
      el('button', {
        type: 'button',
        class: 'ob-notice__name',
        'data-focus': `unroomed:${guest.id}`,
        text: attendeeName(guest) || 'Unnamed guest',
        onclick: () => pick(guest.id)
      })
    ]))) : null,
    elsewhere.length ? el('div', { class: 'ob-notice__else' }, [
      el('span', { class: 'ob-sr', text: 'Other nights with a guest in no room' }),
      ...elsewhere.map((date) => el('button', {
        type: 'button',
        class: 'ob-notice__jump',
        'data-focus': `jump:${date}`,
        text: `${formatDateShort(date)} — ${unassignedGuestsOn(event, date).length}`,
        onclick: () => {
          night = date;
          picked = '';
          draw();
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      }))
    ]) : null
  ].filter(Boolean));
}

/* ------------------------------------------------------------- the guests */

/** Whether an attendee is staying the night being arranged. §7. */
function stayingOn(guest, date) {
  if (!date) return false;
  if (!guest.arrive || !guest.depart) return true;
  return guest.arrive <= date && date < guest.depart;
}

/**
 * Everybody, in two groups: staying this night, and on the list but not.
 *
 * Both are here because §11 asks for every attendee to be present and
 * tappable, and because a day guest who is quietly missing from the list is
 * indistinguishable from one somebody forgot to invite. What differs is what
 * can be done with them: a guest who is not staying tonight has no room to be
 * put in, so their row states their stay instead of offering a move.
 */
function guestGroups(d) {
  const all = (event.attendees || []).filter(Boolean);
  const staying = all.filter((guest) => stayingOn(guest, night));
  const away = all.filter((guest) => !stayingOn(guest, night));

  const groups = [el('section', { class: 'ob-group' }, [
    el('h2', { class: 'ob-group__head ob-group__head--split' }, [
      el('span', { text: night ? `Guests — ${formatDate(night)}` : 'Guests' }),
      el('button', {
        type: 'button',
        class: 'ob-action ob-action--tiny',
        'data-focus': 'edit-toggle',
        text: editing ? 'Done' : 'Edit',
        onclick: () => { editing = !editing; draw(); }
      })
    ]),
    el('ul', { class: 'ob-list' }, [
      ...staying.map((guest) => el('li', {}, [guestRow(guest, d, false)])),
      ...d.removed.map((guest) => el('li', {}, [guestRow(guest, d, true)])),
      el('li', {}, [el('button', {
        type: 'button',
        class: 'ob-row',
        'data-focus': 'add-guest',
        onclick: addGuestSheet
      }, [
        el('span', { class: 'ob-row__main' }, [
          el('span', { class: 'ob-row__name ob-row__name--go', text: 'Add a guest' })
        ])
      ])])
    ]),
    el('p', {
      class: 'ob-group__foot',
      text: staying.length
        ? 'Tap a name to pick them up, then tap a room. Edit takes a name off the list.'
        : 'Nobody is staying this night.'
    })
  ])];

  if (away.length) {
    groups.push(el('section', { class: 'ob-group' }, [
      el('h2', { class: 'ob-group__head', text: 'Not staying this night' }),
      el('ul', { class: 'ob-list' }, away.map((guest) => el('li', {}, [guestRow(guest, d, false)]))),
      el('p', {
        class: 'ob-group__foot',
        text: 'On the guest list, but not overnight on this night. They need no bed here.'
      })
    ]));
  }

  return groups;
}

function guestRow(guest, d, gone) {
  const id = guest.id;
  const row = gone ? null : rowHolding(event, event.rooming || [], id, night);
  const staying = stayingOn(guest, night);
  const mark = d.marks.get(id);

  const name = el('span', { class: 'ob-row__name' }, [
    el('span', { text: attendeeName(guest) || 'Unnamed guest' }),
    guest.isChild ? el('span', { class: 'ob-mark ob-mark--tag', text: 'child' }) : null,
    mark ? el('span', {
      class: `ob-mark ob-mark--${mark}`,
      text: { added: 'Added', removed: 'Removed', moved: 'Moved' }[mark]
    }) : null
  ].filter(Boolean));

  const stillHolding = gone
    ? (event.rooming || []).find((r) => partyOfRow(r).includes(id))
    : null;

  const value = gone
    ? (stillHolding
      ? `Still in ${placeName(stillHolding.building, roomKeyOf(stillHolding))}`
      : 'Off the list')
    : (row ? placeName(row.building, roomKeyOf(row))
      : (staying ? 'No room' : formatDateRange(guest.arrive, guest.depart) || 'No dates'));

  const body = [
    el('span', { class: 'ob-row__main' }, [name]),
    el('span', {
      class: 'ob-row__value'
        + (!gone && staying && !row ? ' ob-row__value--none' : '')
        + (gone || !staying ? ' ob-row__value--vacant' : ''),
      text: value
    })
  ];

  if (editing) {
    return el('div', { class: `ob-row${gone ? ' is-removed' : ''}` }, [
      ...body,
      el('button', {
        type: 'button',
        class: 'ob-btn ob-btn--off ob-btn--small',
        'data-focus': `remove:${id}`,
        text: gone ? 'Off' : 'Take off',
        disabled: gone,
        onclick: () => removeGuest(id)
      })
    ]);
  }

  if (gone || !staying) return el('div', { class: `ob-row${gone ? ' is-removed' : ''}` }, body);

  return el('button', {
    type: 'button',
    class: `ob-row${picked === id ? ' is-picked' : ''}`,
    'aria-pressed': String(picked === id),
    'data-focus': `guest:${id}`,
    onclick: () => pick(id)
  }, body);
}

/* ---------------------------------------------------------- the buildings */

/**
 * Which buildings open on their own.
 *
 * `buildingsInUse` and `overflowBuildings` are already on the event (§5 [v9])
 * and this is what they are for: ten buildings and sixty-six rooms, of which an
 * event uses four, and on a phone the rest are a minute of scrolling. Anything
 * holding a guest is in as well, ticked or not — `buildingsFor` returns that
 * third list precisely so a building nobody remembered to name is still on the
 * board rather than folded away with somebody asleep in it.
 */
function openBuildings() {
  const { inUse, overflow, alsoAssigned } = buildingsFor(event);
  const wanted = new Set([...inUse, ...overflow, ...alsoAssigned]);
  return LODGING_BUILDINGS.filter((name) => wanted.has(name));
}

function buildingGroups(d) {
  const changed = changedPlacesOn(night);
  const occupancy = night ? roomOccupancyOn(event, night) : {};

  return openBuildings().map((building) => {
    const held = occupancy[building] || {};
    const keys = roomsToShow(event, building, held);
    const free = keys.filter((key) => !(held[key] || []).some(namesAnybody)).length;

    return el('section', { class: 'ob-group' }, [
      el('h2', { class: 'ob-group__head', text: building }),
      el('ul', { class: 'ob-list' },
        keys.map((key) => el('li', {}, [roomRow(building, key, held[key] || [], changed)]))),
      el('p', {
        class: 'ob-group__foot',
        text: `${free} of ${keys.length} free${night ? ` on ${formatDate(night)}` : ''}`
      })
    ]);
  });
}

/**
 * One room.
 *
 * EVERY ROOM IN INVENTORY IS HERE, VACANT ONES INCLUDED, AND THIS IS NOT WHAT
 * THE PRINTED SHEET DOES. §8 C [v10] collapses a building's vacancies into one
 * line of ranges, because on paper eighteen empty RLI rows are eighteen rows to
 * skip. Here a vacant room is not information to compress — it is the thing you
 * tap. The Print action produces the paper version, ranges and all, from the
 * same render the generator uses, so the two differ exactly where they are
 * meant to and nowhere else.
 */
function roomRow(building, key, rows, changed) {
  const roomless = key === '';
  const people = [];
  for (const row of rows) {
    for (const id of partyOfRow(row)) people.push({ key: `${row.id}:${id}`, id });
    if (row.guest) people.push({ key: `${row.id}:named`, id: null, text: String(row.guest) });
  }

  const label = el('span', {
    class: 'ob-row__label',
    text: roomless ? 'No room set' : key
  });
  if (changed.has(placeKey(building, key))) {
    label.append(el('span', { class: 'ob-mark ob-mark--moved', text: 'changed' }));
  }

  const body = [label];

  if (people.length) {
    body.push(el('span', { class: 'ob-party' }, people.map((person) => {
      const here = person.id ? attendeeById(event, person.id) : null;
      const gone = Boolean(person.id) && !here;
      const guest = here || (person.id ? attendeeById(baseline, person.id) : null);
      const name = guest
        ? (attendeeName(guest) || 'Unnamed guest')
        : (person.text || 'Not on the guest list');

      const classes = ['ob-person'];
      if (picked === person.id) classes.push('is-picked');
      if (guest && guest.isChild) classes.push('is-child');
      if (gone) classes.push('is-gone');

      if (!here) return el('span', { class: classes.join(' '), text: name });

      return el('button', {
        type: 'button',
        class: classes.join(' '),
        'data-focus': `in:${person.key}`,
        'aria-label': `${name}, in ${placeLabel(building, key)}. Tap to move them.`,
        text: name,
        onclick: () => pick(person.id)
      });
    })));
  } else {
    body.push(el('span', {
      class: 'ob-row__value ob-row__value--vacant',
      text: rows.length ? 'Held, no name' : 'Vacant'
    }));
  }

  // The `''` key under a named building is not a room: it gathers rows carrying
  // no room at all, so §12.6 is visible instead of swallowed. Nobody is put
  // there — it is a fault to be emptied, and the generator is where it is
  // repaired.
  if (roomless) return el('div', { class: 'ob-row' }, body);

  const ready = Boolean(picked);
  return el('button', {
    type: 'button',
    class: `ob-row${ready ? ' is-target' : ''}`,
    'data-focus': `room:${building}:${key}`,
    'aria-label': ready
      ? `Put ${nameOf(event, picked)} in ${placeLabel(building, key)}`
      : `${placeLabel(building, key)}, ${people.length ? 'occupied' : 'vacant'}`,
    onclick: () => place(building, key)
  }, body);
}

/**
 * The buildings this event is not using.
 *
 * Folded, never hidden. The one control says how many there are and how many
 * rooms are free across them; each building inside says its own name and its
 * own vacancy count before it is opened. Ownership is not being kept from
 * anything — they are being kept from scrolling past fifty rooms nobody is in
 * to reach the four that matter.
 */
function otherBuildings() {
  const open = new Set(openBuildings());
  const rest = LODGING_BUILDINGS.filter((name) => !open.has(name));
  if (!rest.length) return null;

  const occupancy = night ? roomOccupancyOn(event, night) : {};
  const freeIn = (building) => {
    const held = occupancy[building] || {};
    return roomsIn(building).filter((room) => !(held[room] || []).some(namesAnybody)).length;
  };
  const free = rest.reduce((total, building) => total + freeIn(building), 0);

  const rows = [el('li', {}, [el('button', {
    type: 'button',
    class: 'ob-row',
    'data-focus': 'others',
    'aria-expanded': String(othersOpen),
    onclick: () => { othersOpen = !othersOpen; draw(); }
  }, [
    el('span', { class: 'ob-fold' }, [
      el('span', { class: 'ob-fold__glyph', 'aria-hidden': 'true', text: '>' })
    ]),
    el('span', { class: 'ob-row__main' }, [
      el('span', {
        class: 'ob-row__name',
        text: `${rest.length} other building${rest.length === 1 ? '' : 's'}`
      }),
      el('span', {
        class: 'ob-row__note',
        text: `${free} room${free === 1 ? '' : 's'} free — not in use for this event`
      })
    ])
  ])])];

  if (othersOpen) {
    const changed = changedPlacesOn(night);
    for (const building of rest) {
      const isOpen = unfolded.has(building);
      rows.push(el('li', {}, [el('button', {
        type: 'button',
        class: 'ob-row',
        'data-focus': `fold:${building}`,
        'aria-expanded': String(isOpen),
        onclick: () => {
          if (isOpen) unfolded.delete(building);
          else unfolded.add(building);
          draw();
        }
      }, [
        el('span', { class: 'ob-fold' }, [
          el('span', { class: 'ob-fold__glyph', 'aria-hidden': 'true', text: '>' })
        ]),
        el('span', { class: 'ob-row__main' }, [
          el('span', { class: 'ob-row__name', text: building })
        ]),
        el('span', { class: 'ob-row__value ob-row__value--vacant', text: `${freeIn(building)} free` })
      ])]));

      if (!isOpen) continue;
      const held = occupancy[building] || {};
      const keys = roomsToShow(event, building, held);
      rows.push(el('li', {}, [el('ul', { class: 'ob-sub' },
        keys.map((key) => el('li', {}, [roomRow(building, key, held[key] || [], changed)])))]));
    }
  }

  return el('section', { class: 'ob-group' }, [
    el('h2', { class: 'ob-group__head', text: 'The rest of the property' }),
    el('ul', { class: 'ob-list' }, rows),
    el('p', {
      class: 'ob-group__foot',
      text: 'Nothing is hidden here. These are the buildings this event was not given, folded so '
        + 'the ones it was given are reachable with a thumb.'
    })
  ]);
}

/* ========================================================================== *
 * Paper
 * ========================================================================== */

/**
 * The Rooming Assignment — the same document the generator prints, from the
 * same render (js/renders/rooming.js), with the same page furniture, the same
 * break rules and the same collapsed vacancy ranges. Paper from the board
 * matches paper from the app because it is the same code, not because two
 * implementations were kept in step by hand.
 *
 * One thing is swapped: the logo's `src`. There is no `logos/` directory beside
 * a file in a Downloads folder, so the brand mark is the data URI the exporter
 * inlined at the head of the page.
 */
function buildPaper() {
  if (!paperStale) return;
  const rendered = renderDocument(event, documentById('rooming'));
  if (logoSrc) {
    for (const img of rendered.querySelectorAll('img')) img.src = logoSrc;
  }
  paper.replaceChildren(rendered);
  pageStyle.textContent = printRule(event);
  paperStale = false;
}

function printSheet() {
  buildPaper();
  window.print();
}

/* ------------------------------------------------------------------ helper */

/** The assignment as sent, out of reach of every hand on this board. */
function deepFreeze(value) {
  const walk = (node) => {
    if (!node || typeof node !== 'object') return node;
    Object.freeze(node);
    for (const child of Object.values(node)) walk(child);
    return node;
  };
  return walk(JSON.parse(JSON.stringify(value)));
}

// A print raised from the browser's own menu still has to produce the document.
window.addEventListener('beforeprint', buildPaper);
