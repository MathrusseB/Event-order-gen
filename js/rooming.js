// The rooming board — BUILD-SPEC §9.
//
// The second way into `rooming[]`. js/editors/rooming.js is the first: one
// typed row per booking, every field visible at once, which is what a
// coordinator wants when they are reconciling a sheet. This is the other thing
// — a night, two panes, and rooms you move people between — and §9's
// requirement for it is a sentence about people rather than about data:
// ownership can adjust assignments without help.
//
// NEITHER EDITOR OWNS THE ARRAY. Both write the same `rooming[]` and a change
// in one is visible in the other on the next render, because neither holds a
// copy. That is the whole reason this module is written the way it is.
//
// PORTABILITY — §9's decision, and the constraint that shapes every function
// below. Shared access is deferred but expected, so this module has no reach
// into application state: it imports no `getEvent`, no `update`, and no
// `subscribe`. An event goes in, a new event comes out, and the caller decides
// what to do with it. Everything it does import — derive, dates, reference,
// ids, dom — is either a pure function or a DOM helper, none of which knows an
// event exists. When this runs against hosted state, the change is the caller.
//
// HOW A MOVE IS SHAPED. Every operation is scoped to one night, because that is
// the only scope the data supports without guessing: the Timber Suite is Dana's
// on Saturday and Tom's on Sunday, and a move that silently spanned both would
// have to decide which of them was wrong. Ranges are then a *consequence*
// rather than an input:
//
//   * A row covers the nights `from <= night < to` (§7 [v3]). Assigning the
//     same guest to the same room on consecutive nights produces one row with
//     a spanning range, because the new night merges into the row beside it.
//   * Taking a guest out of one night in the middle of a stay splits the row in
//     two, around the night they are gone.
//   * Within one named room the rows never overlap: a room's rows partition its
//     nights, and each row names whoever is in the room over that stretch. That
//     is what §12.4 asks for — two rows on one named room on one night is a
//     clash, several names on one row is a party — and it is why joining an
//     occupied room splits the row it joins rather than adding a second one
//     beside it.
//
// A guest can be taken off a party without disturbing the rest of it: the row
// is split around that night and the others stay named on all three pieces.

import {
  attendeeById,
  attendeeName,
  eventNights,
  roomOccupancyOn,
  roomingWindow,
  unassignedGuestsOn
} from './derive.js';
import { formatDate, formatDateShort, nextDate } from './dates.js';
import { LODGING_BUILDINGS, assignmentModeFor, roomsIn } from './reference.js';
import { newId } from './ids.js';
import { el, reconcile, setHidden, setText, toggleClass } from './dom.js';

/** How many moves the board can take back. §9. */
const UNDO_DEPTH = 10;

/** A hard stop on walking a stay forward, matching the cap in dates.js. */
const MAX_NIGHTS = 400;

/* ========================================================================== *
 * The transforms. Pure: an event in, a new event out, nothing else touched.
 * ========================================================================== */

/** The guest ids a row names, always an array. */
function partyOfRow(row) {
  return Array.isArray(row && row.guestIds) ? row.guestIds : [];
}

/**
 * The key a row groups under within its building. §6 [v3] — a `pooled`
 * building has no rooms, so every one of its rows shares the empty key.
 */
function roomKeyOf(row) {
  if (assignmentModeFor((row && row.building) || '') === 'pooled') return '';
  return (row && row.room) || '';
}

/** Whether a row is at this place. */
function isAt(row, building, room) {
  return (row.building || '') === building && roomKeyOf(row) === roomKeyOf({ building, room });
}

/** Whether a row holds its room on this night. §7 [v3]: `from <= night < to`. */
function coversNight(event, row, night) {
  const window = roomingWindow(event, row);
  if (!night || !window.from || !window.to) return false;
  return window.from <= night && night < window.to;
}

/** Whether a row still names somebody — an id, or a name a migration kept. */
function namesAnybody(row) {
  return partyOfRow(row).length > 0 || Boolean(row.guest);
}

/**
 * Replace the one night of a row with a row naming `party`, leaving the nights
 * either side of it exactly as they were.
 *
 * This is the only function in this module that writes a range, and every
 * split and every join goes through it. The row becomes up to three: the
 * nights before, the night itself, and the nights after. The first piece keeps
 * the original row's id, so a booking edited here is still the same row to the
 * form editor; the others are new rows and get new ids.
 *
 * A middle piece naming nobody is dropped rather than kept — the room is empty
 * that night, and an unnamed row would print as a room held under no name (§8
 * C). A row that came in carrying a legacy `guest` string keeps it on every
 * piece: the booking is the same booking, and the name it was authored with
 * belongs on all of it (§5, v5 changes).
 *
 * @param {object} event
 * @param {object[]} rows the working `rooming[]`
 * @param {string} rowId
 * @param {string} night ISO
 * @param {string[]} party guest ids for that night
 * @returns {{rows: object[], touched: string[]}}
 */
function repartyNight(event, rows, rowId, night, party) {
  const index = rows.findIndex((row) => row && row.id === rowId);
  if (index < 0) return { rows, touched: [] };

  const row = rows[index];
  const { from, to } = roomingWindow(event, row);
  const after = nextDate(night);
  const pieces = [];

  if (from && from < night) pieces.push({ ...row, from, to: night });
  if (party.length || row.guest) pieces.push({ ...row, guestIds: [...party], from: night, to: after });
  if (to && after && after < to) pieces.push({ ...row, from: after, to });

  pieces.forEach((piece, position) => {
    piece.id = position === 0 ? row.id : newId();
  });

  const next = rows.slice();
  next.splice(index, 1, ...pieces);
  return { rows: next, touched: pieces.map((piece) => piece.id) };
}

/** Whether two rows are the same booking either side of a boundary. */
function joinable(event, before, after) {
  if ((before.building || '') !== (after.building || '')) return false;
  if (roomKeyOf(before) !== roomKeyOf(after)) return false;
  if ((before.guest || '') !== (after.guest || '')) return false;

  const first = roomingWindow(event, before);
  const second = roomingWindow(event, after);
  if (!first.to || !second.from || first.to !== second.from) return false;

  const left = partyOfRow(before);
  const right = partyOfRow(after);
  if (left.length !== right.length) return false;
  const named = new Set(right);
  return left.every((id) => named.has(id));
}

/**
 * Join rows that a move left contiguous — the other half of "one row with a
 * spanning range, not one row per night".
 *
 * Only chains involving a row this move touched are considered. Two rows the
 * user has kept apart for their own reasons are not quietly merged because
 * somebody rearranged a different room.
 *
 * @param {object} event
 * @param {object[]} rows
 * @param {Set<string>} touched row ids the move created or rewrote
 * @returns {object[]}
 */
function joinTouched(event, rows, touched) {
  let working = rows.slice();
  let joined = true;

  while (joined) {
    joined = false;
    outer:
    for (let index = 0; index < working.length; index += 1) {
      for (let other = 0; other < working.length; other += 1) {
        if (index === other) continue;
        const before = working[index];
        const after = working[other];
        if (!touched.has(before.id) && !touched.has(after.id)) continue;
        if (!joinable(event, before, after)) continue;

        const start = roomingWindow(event, before);
        const end = roomingWindow(event, after);
        working[index] = { ...before, from: start.from, to: end.to };
        working.splice(other, 1);
        touched.add(working[index].id);
        joined = true;
        break outer;
      }
    }
  }
  return working;
}

/** The row holding this guest on this night, or null. */
function rowHolding(event, rows, guestId, night) {
  return rows.find((row) => row && coversNight(event, row, night)
    && partyOfRow(row).includes(guestId)) || null;
}

/** The rows at a place on a night, in array order. */
function rowsAt(event, rows, building, room, night) {
  return rows.filter((row) => row && coversNight(event, row, night) && isAt(row, building, room));
}

/**
 * Apply one move, on one night, to a working set of rows.
 *
 * `how` is the outcome the caller chose, and the caller is the one that knows
 * what the room looked like when it was dropped on:
 *
 *   `move`    — the room is free, or held under no name. The guest goes in.
 *   `add`     — the room is taken and both parties stay. Rooms hold parties (§5
 *               v5): a couple in a suite, four in the Bunk Room. This is the
 *               ordinary case, not the exception.
 *   `replace` — the guest goes in and whoever was there comes off the sheet for
 *               that night. They are not deleted from anywhere else.
 *   `swap`    — the guest goes in and whoever was there takes the room the
 *               guest came from.
 *
 * @returns {{rows: object[], touched: Set<string>}}
 */
function applyMove(event, rows, { guestId, building, room, night, how }) {
  const touched = new Set();
  let working = rows.slice();

  const source = rowHolding(event, working, guestId, night);
  const targets = rowsAt(event, working, building, room, night);
  const occupied = targets.filter(namesAnybody);

  // Already in the room this night: there is no move to make.
  if (source && targets.some((row) => row.id === source.id)) return { rows: working, touched };

  const step = (rowId, party) => {
    const result = repartyNight(event, working, rowId, night, party);
    working = result.rows;
    for (const id of result.touched) touched.add(id);
  };

  if (how === 'swap' && source && occupied.length) {
    const target = occupied[0];
    const displaced = partyOfRow(target);
    const staying = partyOfRow(source).filter((id) => id !== guestId);
    step(source.id, [...staying, ...displaced.filter((id) => !staying.includes(id))]);
    step(target.id, [guestId]);
    return { rows: joinTouched(event, working, touched), touched };
  }

  if (source) step(source.id, partyOfRow(source).filter((id) => id !== guestId));

  if (how === 'replace') {
    occupied.forEach((target, position) => step(target.id, position === 0 ? [guestId] : []));
    if (!occupied.length) working = addTo(working, touched, { guestId, building, room, night });
    return { rows: joinTouched(event, working, touched), touched };
  }

  if (how === 'add' && occupied.length) {
    const target = occupied[0];
    const party = partyOfRow(target);
    step(target.id, party.includes(guestId) ? party : [...party, guestId]);
    return { rows: joinTouched(event, working, touched), touched };
  }

  // `move`: a free room, or one held under no name — which is a room waiting
  // for exactly this, so the held row takes the guest rather than being left
  // beside them.
  const held = targets.find((row) => !namesAnybody(row));
  if (held && assignmentModeFor(building) !== 'pooled') step(held.id, [guestId]);
  else working = addTo(working, touched, { guestId, building, room, night });

  return { rows: joinTouched(event, working, touched), touched };
}

/** A new one-night booking, in the shape of §5. */
function addTo(rows, touched, { guestId, building, room, night }) {
  const pooled = assignmentModeFor(building) === 'pooled';
  const row = {
    id: newId(),
    building,
    // §5: `room` is null on a pooled building — "in RLI" is the whole detail.
    room: pooled ? null : (room || null),
    guestIds: [guestId],
    from: night,
    to: nextDate(night)
  };
  touched.add(row.id);
  return [...rows, row];
}

/**
 * Put a guest in a room for a night, and — where the caller asked for it — for
 * the nights after it.
 *
 * The night itself takes whichever outcome the caller chose. The nights after
 * it are the ones that make this worth having: a coordinator arranging a
 * four-night event should not have to make the same move four times, and one
 * row spanning the stay is what the rooming sheet is supposed to read like.
 *
 * The walk forward is careful about what it will disturb, and the two rules are
 * the whole of it. It goes on to the next night only if
 *
 *   * the target is free that night — it never evicts anybody it was not asked
 *     about, and
 *   * the guest is either in nobody's room, or still in the room this move just
 *     took them out of — so it follows somebody out of one room and stops dead
 *     at a turnover, rather than emptying every room they were ever in.
 *
 * It stays inside `eventNights`, which is the same spine the renders lay their
 * grids out on (§9), so the board cannot quietly write a night it has no tab
 * for.
 *
 * @param {object} event
 * @param {{guestId: string, building: string, room: string|null, night: string,
 *   how: 'move'|'add'|'replace'|'swap', through: boolean}} move
 * @returns {{event: object, nights: string[]}} the nights actually changed
 */
export function placeGuest(event, move) {
  const held = rowHolding(event, event.rooming || [], move.guestId, move.night);
  const cameFrom = held ? { building: held.building || '', room: roomKeyOf(held) } : null;

  const first = applyMove(event, event.rooming || [], move);
  let next = { ...event, rooming: first.rows };
  const nights = [move.night];

  if (!move.through) return { event: next, nights };

  const spine = eventNights(event);
  let cursor = nextDate(move.night);
  for (let step = 0; step < MAX_NIGHTS && cursor && spine.includes(cursor); step += 1) {
    if (!placeIsFree(next, move.building, move.room, cursor)) break;
    if (!followsOn(next, move.guestId, cursor, cameFrom)) break;
    const result = applyMove(next, next.rooming || [], { ...move, night: cursor, how: 'move' });
    next = { ...next, rooming: result.rows };
    nights.push(cursor);
    cursor = nextDate(cursor);
  }

  return { event: next, nights };
}

/**
 * Whether a placement may carry on into this night: the guest is staying and in
 * nobody's room, or is still in the room the move came out of.
 */
function followsOn(event, guestId, night, cameFrom) {
  const held = rowHolding(event, event.rooming || [], guestId, night);
  if (!held) return unassignedGuestsOn(event, night).some((guest) => guest.id === guestId);
  if (!cameFrom) return false;
  return (held.building || '') === cameFrom.building && roomKeyOf(held) === cameFrom.room;
}

/**
 * Take a guest off a room for one night. §9 — a guest in a party comes off
 * without disturbing the others, which is what `repartyNight` does by splitting
 * around the night and leaving the rest of the party on all of it.
 *
 * @param {object} event
 * @param {{guestId: string, night: string}} move
 * @returns {{event: object, nights: string[]}}
 */
export function releaseGuest(event, { guestId, night }) {
  const rows = event.rooming || [];
  const row = rowHolding(event, rows, guestId, night);
  if (!row) return { event, nights: [] };

  const result = repartyNight(event, rows, row.id, night,
    partyOfRow(row).filter((id) => id !== guestId));
  const touched = new Set(result.touched);
  return { event: { ...event, rooming: joinTouched(event, result.rows, touched) }, nights: [night] };
}

/** Whether a place is unoccupied on a night — vacant, or held under no name. */
function placeIsFree(event, building, room, night) {
  if (assignmentModeFor(building) === 'pooled') return true;
  return !rowsAt(event, event.rooming || [], building, room, night).some(namesAnybody);
}

/* ========================================================================== *
 * The board. DOM, and the only place selection and undo live.
 * ========================================================================== */

/**
 * Build the board.
 *
 * @param {{onEvent: (event: object, description: string) => void}} options
 *   `onEvent` receives the mutated event and a sentence describing the move.
 *   This module never writes anywhere itself — that is §9's portability
 *   decision, and it is the one thing that has to stay true when this runs
 *   against shared state.
 * @returns {{node: HTMLElement, update: (event: object) => void}}
 */
export function createRoomingBoard({ onEvent }) {
  /** The event as last seen. Read-only here; every write goes out through `onEvent`. */
  let event = null;
  /** The night being arranged. §9 — the editor works one night at a time. */
  let night = '';
  /** The guest picked up, waiting for a room. */
  let picked = '';
  /** Whether a placement fills the rest of the guest's stay or just this night. */
  let scope = 'stay';
  /** The last ten moves, newest last: the `rooming[]` from *before* each one. */
  const history = [];
  /** What the board last knew `rooming[]` to be — see `update` at the bottom. */
  let known = null;

  /* --------------------------------------------------------------- furniture */

  const nights = el('div', { class: 'board__nights', role: 'group', 'aria-label': 'Night' });
  const noNights = el('p', {
    class: 'board__none',
    text: 'Set the event dates and this lays itself out one night at a time.'
  });

  const scopeNight = scopeButton('night', 'This night');
  const scopeStay = scopeButton('stay', 'The rest of their stay');

  const undo = el('button', {
    type: 'button',
    class: 'btn board__undo',
    'data-control': 'undo'
  });
  undo.addEventListener('click', undoLast);

  const say = el('p', { class: 'board__say', role: 'status', 'aria-live': 'polite' });

  const guests = el('ul', { class: 'boardguests' });
  const guestsNone = el('p', { class: 'board__none' });
  const guestsHead = el('h3', { class: 'boardpane__head' });

  const buildings = el('div', { class: 'board__buildings' });

  const dialog = el('dialog', { class: 'boardask' });

  const node = el('div', { class: 'board' }, [
    // Sticky, under the application header: on a four-night event the rooms run
    // well past a tablet screen, and which night you are arranging — and who is
    // in your hand — are the two things you must not have to scroll back for.
    el('div', { class: 'board__head' }, [
      el('div', { class: 'board__bar' }, [
        el('div', { class: 'board__nightsbox' }, [
          el('span', { class: 'board__label', text: 'Night' }),
          nights,
          noNights
        ]),
        el('div', { class: 'board__scope' }, [
          el('span', { class: 'board__label', id: 'board-scope-label', text: 'A move covers' }),
          el('div', { class: 'board__scopes', role: 'group', 'aria-labelledby': 'board-scope-label' },
            [scopeNight, scopeStay])
        ]),
        el('div', { class: 'board__undobox' }, [undo])
      ]),
      say
    ]),
    el('div', { class: 'board__panes' }, [
      el('section', { class: 'boardpane boardpane--guests' }, [guestsHead, guests, guestsNone]),
      el('section', { class: 'boardpane boardpane--rooms' }, [
        el('h3', { class: 'boardpane__head', text: 'Lodging' }),
        buildings
      ])
    ]),
    el('p', {
      class: 'board__legend',
      text: 'Tap a guest, then tap a room. Dragging works with a mouse; on a tablet the two taps '
        + 'are the whole thing. Day guests are not listed — they need no bed.'
    }),
    dialog
  ]);

  /* ------------------------------------------------------------------ moves */

  /** A fingerprint of `rooming[]`, to notice an edit made somewhere else. */
  function fingerprint(rows) {
    return (rows || []).map((row) => [
      row.id, row.building, row.room, (row.guestIds || []).join(','), row.from, row.to, row.guest
    ].join('|')).join(';');
  }

  /**
   * Hand a mutated event to the caller, and remember what it replaced.
   *
   * Undo keeps `rooming[]` alone rather than a whole event, so taking a move
   * back cannot also take back a surname somebody typed into the attendee
   * editor in between.
   */
  function commit(next, description) {
    history.push({ rooming: [...(event.rooming || [])], description });
    while (history.length > UNDO_DEPTH) history.shift();
    known = fingerprint(next.rooming);
    picked = '';
    setText(say, `${sentenceCase(description)}.`);
    onEvent(next, description);
  }

  function undoLast() {
    const last = history.pop();
    if (!last || !event) return;
    const next = { ...event, rooming: last.rooming };
    known = fingerprint(next.rooming);
    picked = '';
    setText(say, `Undone — ${last.description}.`);
    onEvent(next, `Undo — ${last.description}`);
  }

  /** Pick a guest up, or put them back down. */
  function pick(guestId) {
    picked = picked === guestId ? '' : guestId;
    setText(say, picked
      ? `${nameOf(event, picked)} is in hand. Tap a room to place `
        + `${nightPhrase([night], scope)}.`
      : 'Nothing in hand.');
    render();
  }

  /** Take a guest off a room for the selected night. */
  function release(guestId) {
    const row = rowHolding(event, event.rooming || [], guestId, night);
    if (!row) return;
    const where = placeLabel(row.building, roomKeyOf(row));
    const { event: next } = releaseGuest(event, { guestId, night });
    commit(next, `${nameOf(event, guestId)} out of ${where} for ${formatDate(night)}`);
  }

  /**
   * Place the guest in hand. The three outcomes §9 asks for are decided here,
   * because this is the only place that knows what the room looked like when it
   * was dropped on.
   */
  async function place(building, room) {
    if (!night) return;
    if (!picked) {
      setText(say, 'Pick a guest first — tap a name, then tap a room.');
      return;
    }

    const guestId = picked;
    if (assignmentModeFor(building) !== 'pooled' && !room) {
      setText(say, 'That line is the rows with no room on them. Pick a room to move somebody into.');
      return;
    }

    const rows = event.rooming || [];
    const here = rowsAt(event, rows, building, room, night);
    const occupied = here.filter(namesAnybody);
    const source = rowHolding(event, rows, guestId, night);
    const label = placeLabel(building, room);

    if (source && here.some((row) => row.id === source.id)) {
      setText(say, `${nameOf(event, guestId)} is already in ${label} for ${formatDate(night)}.`);
      return;
    }

    let how = 'move';
    if (assignmentModeFor(building) !== 'pooled' && occupied.length) {
      how = await askOccupied({ guestId, source, occupied, label });
      if (!how) return;
    }

    const displaced = occupied.flatMap(partyOfRow).filter((id) => id !== guestId);
    const { event: next, nights: covered } =
      placeGuest(event, { guestId, building, room, night, how, through: scope === 'stay' });
    commit(next, describeMove({ event, guestId, label, how, covered, displaced, source }));
  }

  /**
   * The three outcomes, as a question rather than a confirm box.
   *
   * `window.confirm` can ask two things and this has to ask three: a room is
   * often *meant* to hold more than one person, so joining is the ordinary
   * answer and has to be offered as plainly as the other two.
   */
  function askOccupied({ guestId, source, occupied, label }) {
    const guest = nameOf(event, guestId);
    const holders = occupied.flatMap((row) => partyOfRow(row).map((id) => nameOf(event, id)));
    const held = holders.length ? namesPhrase(holders) : 'somebody';
    const many = holders.length > 1;
    const from = source ? placeLabel(source.building, roomKeyOf(source)) : '';

    const choices = [
      ['add', `Add ${guest} to the room`,
        `${namesPhrase([...holders, guest])} share ${label} that night.`],
      source && ['swap', 'Swap them',
        `${guest} takes ${label}; ${held} ${many ? 'take' : 'takes'} ${from}.`],
      ['replace', `Replace ${held}`,
        `${guest} takes ${label}; ${held} ${many ? 'come' : 'comes'} off the sheet for that night `
          + `and ${many ? 'are' : 'is'} not deleted.`]
    ].filter(Boolean);

    return new Promise((resolve) => {
      const form = el('form', { method: 'dialog', class: 'boardask__form' }, [
        ...choices.map(([value, title, detail]) => el('button', {
          type: 'submit',
          class: 'boardask__choice',
          value
        }, [
          el('span', { class: 'boardask__title', text: title }),
          el('span', { class: 'boardask__detail', text: detail })
        ])),
        el('button', { type: 'submit', class: 'btn boardask__cancel', value: '', text: 'Cancel' })
      ]);

      dialog.replaceChildren(
        el('h2', {
          class: 'boardask__head',
          text: sentenceCase(`${label} is taken on ${formatDate(night)}`)
        }),
        el('p', { class: 'boardask__lead', text: `${held} ${many ? 'have' : 'has'} it. Rooms hold `
          + `parties, so ${choices.length === 3 ? 'all three' : 'both'} of these are ordinary `
          + 'answers.' }),
        form
      );

      const settle = () => {
        dialog.removeEventListener('close', settle);
        resolve(dialog.returnValue || null);
      };
      dialog.addEventListener('close', settle);
      dialog.returnValue = '';
      dialog.showModal();
    });
  }

  /* ----------------------------------------------------------------- drawing */

  function scopeButton(value, label) {
    const button = el('button', {
      type: 'button',
      class: 'btn board__scopebtn',
      'aria-pressed': 'false',
      text: label
    });
    button.addEventListener('click', () => {
      scope = value;
      render();
    });
    return button;
  }

  /** One night. §9 — one control per night, the current one highlighted. */
  function createNightTab(date) {
    const button = el('button', {
      type: 'button',
      class: 'btn board__night',
      'aria-pressed': 'false'
    });
    button.addEventListener('click', () => {
      night = date;
      picked = '';
      setText(say, `Arranging the night of ${formatDate(date)}.`);
      render();
    });
    return {
      node: button,
      update(current) {
        setText(button, formatDate(current));
        const on = current === night;
        button.setAttribute('aria-pressed', String(on));
        toggleClass(button, 'is-on', on);
      }
    };
  }

  /** One unassigned guest. */
  function createGuestChip(guestId) {
    const name = el('span', { class: 'boardchip__name' });
    const button = el('button', { type: 'button', class: 'boardchip boardchip--guest' }, [name]);
    button.addEventListener('click', () => pick(guestId));
    makeDraggable(button, guestId);
    const node = el('li', { class: 'boardguests__item' }, [button]);

    return {
      node,
      update(current) {
        const attendee = attendeeById(current, guestId);
        setText(name, attendeeName(attendee) || 'Unnamed guest');
        toggleClass(button, 'is-picked', picked === guestId);
        toggleClass(button, 'is-child', Boolean(attendee && attendee.isChild));
        button.setAttribute('aria-pressed', String(picked === guestId));
      }
    };
  }

  /**
   * One name in a room, with the way off it. §9 — a guest in a party is
   * removable on their own, without disturbing the others on the row.
   *
   * `guestId` is null for a name a migration could not match (§5, v5 changes).
   * It is shown, because the room is still booked under it and a name that goes
   * quiet on the sheet is how somebody ends up without a bed — but there is
   * nobody for the board to move, so both controls are off. The form editor is
   * where that row gets repaired.
   */
  function createOccupant(guestId, text) {
    const name = el('span', { class: 'boardchip__name' });
    const pickButton = el('button', { type: 'button', class: 'boardchip boardchip--in' }, [name]);
    const off = el('button', {
      type: 'button',
      class: 'boardchip__off',
      'data-control': 'off'
    }, [el('span', { 'aria-hidden': 'true', text: '✕' })]);

    if (guestId) {
      pickButton.addEventListener('click', () => pick(guestId));
      off.addEventListener('click', () => {
        // This button is about to be removed from the page along with the name
        // on it, so focus is handed to the room it was in before that happens.
        // Otherwise the next tab press starts again at the top of the document.
        const room = node.closest('.boardroom');
        release(guestId);
        const target = room && room.querySelector('.boardroom__target');
        if (target && !target.disabled) target.focus();
      });
      makeDraggable(pickButton, guestId);
    }

    const node = el('li', { class: 'boardparty__item' }, [pickButton, off]);

    return {
      node,
      update(current) {
        const attendee = guestId ? attendeeById(current, guestId) : null;
        const label = guestId
          ? (attendee ? (attendeeName(attendee) || 'Unnamed guest') : 'Not on the guest list')
          : text;
        setText(name, label);
        toggleClass(pickButton, 'is-picked', picked === guestId);
        toggleClass(pickButton, 'is-child', Boolean(attendee && attendee.isChild));
        toggleClass(node, 'is-unresolved', !attendee);
        pickButton.disabled = !attendee;
        off.disabled = !attendee;
        pickButton.setAttribute('aria-pressed', String(picked === guestId));
        off.setAttribute('aria-label', `Take ${label} out of this room for ${formatDate(night)}`);
        off.title = off.getAttribute('aria-label');
      }
    };
  }

  /**
   * One room in a `named` building, or the single drop area of a `pooled` one.
   *
   * [v10] EVERY ROOM IN INVENTORY IS HERE, VACANT ONES INCLUDED, AND THIS IS
   * NOT WHAT THE PRINTED SHEET DOES. The Rooming Assignment prints the occupied
   * rooms and collapses the rest into one line per building, because on paper
   * eighteen empty RLI rows are eighteen rows to skip (§8 C [v10], and the note
   * at the top of js/renders/rooming.js). Here a vacant room is not information
   * to be compressed — it is the target you tap to put somebody in it, and a
   * board that hid the empties would leave nowhere to drop anybody. The two
   * surfaces have different jobs and are meant to differ.
   *
   * The `''` key is two different things and both are drawn here: a pooled
   * building, which has no rooms to be assigned to (§6 [v3]), and — under a
   * named building — the line that gathers rows carrying no room at all, so
   * §12.6 is visible instead of swallowed. Nobody can be dropped onto that
   * second one: it is a fault to be emptied, not a room.
   */
  function createRoom(building, room, mode) {
    const roomless = mode !== 'pooled' && room === '';
    const label = el('span', { class: 'boardroom__name' });
    const state = el('span', { class: 'boardroom__state' });
    const target = el('button', { type: 'button', class: 'boardroom__target' }, [label, state]);
    const party = el('ul', { class: 'boardparty' });
    const node = el('li', { class: `boardroom${roomless ? ' boardroom--roomless' : ''}` },
      [target, party]);

    if (!roomless) {
      // Focus comes back here after the move, and after the question that a
      // taken room asks: a modal takes focus, and giving it back to the room
      // that was tapped is what lets the next placement start from a keyboard.
      target.addEventListener('click', async () => {
        await place(building, room);
        target.focus();
      });
      makeDropTarget(node, () => place(building, room));
    }

    setText(label, mode === 'pooled' ? 'In the building' : (roomless ? 'No room set' : room));

    return {
      node,
      update(current, rows) {
        const people = [];
        for (const row of rows) {
          for (const id of partyOfRow(row)) people.push({ key: `${row.id}:${id}`, id, text: '' });
          if (row.guest) people.push({ key: `${row.id}:named`, id: null, text: String(row.guest) });
        }

        const entries = reconcile(party, people, (person) => person.key,
          (person) => createOccupant(person.id, person.text));
        entries.forEach((entry) => entry.update(current));

        const held = rows.length > 0 && people.length === 0;
        setText(state, people.length ? '' : (held ? 'Held, no name' : 'Vacant'));
        target.disabled = roomless;
        toggleClass(node, 'is-vacant', rows.length === 0);
        // §12.4 — two rows on one named room on one night. Both are shown: a
        // clash hidden is somebody arriving to a bed already made up.
        toggleClass(node, 'is-contested', mode === 'named' && rows.length > 1);
        toggleClass(node, 'is-ready', Boolean(picked) && !roomless);
        target.setAttribute('aria-label', targetLabel(current, building, room, mode, people.length));
      }
    };
  }

  /** What the room's own control announces, which changes with what is in hand. */
  function targetLabel(current, building, room, mode, occupants) {
    const where = mode === 'pooled' ? building : (room || 'no room set');
    if (!picked) return `${where}, ${occupants ? `${occupants} named` : 'vacant'}`;
    return `Put ${nameOf(current, picked)} in ${where} for ${formatDate(night)}`;
  }

  /** One building: a room grid, or a single area for a pooled building. */
  function createBuilding(building) {
    const heading = el('h4', { class: 'boardbuilding__name' });
    const note = el('p', { class: 'boardbuilding__note' });
    const rooms = el('ul', { class: 'boardrooms' });
    const node = el('section', { class: 'boardbuilding' }, [heading, note, rooms]);

    return {
      node,
      update(current, occupancy) {
        const mode = assignmentModeFor(building);
        setText(heading, building);
        setText(note, mode === 'pooled'
          ? 'Assigned to the building, not to a room.'
          : 'Every room, occupied or vacant, on the night above.');
        toggleClass(node, 'boardbuilding--pooled', mode === 'pooled');

        const keys = mode === 'pooled' ? [''] : roomsToShow(current, building, occupancy);
        const entries = reconcile(rooms, keys, (key) => `room:${key}`,
          (key) => createRoom(building, key, mode));
        entries.forEach((entry, index) => entry.update(current, occupancy[keys[index]] || []));
        toggleClass(rooms, 'boardrooms--pooled', mode === 'pooled');
      }
    };
  }

  /* ------------------------------------------------------------------ render */

  function render() {
    if (!event) return;

    const spine = eventNights(event);
    if (!spine.includes(night)) night = spine[0] || '';

    setHidden(noNights, spine.length > 0);
    setHidden(nights, spine.length === 0);
    const nightEntries = reconcile(nights, spine, (date) => date, createNightTab);
    nightEntries.forEach((entry, index) => entry.update(spine[index]));

    for (const [button, value] of [[scopeNight, 'night'], [scopeStay, 'stay']]) {
      button.setAttribute('aria-pressed', String(scope === value));
      toggleClass(button, 'is-on', scope === value);
    }

    const last = history[history.length - 1];
    undo.disabled = !last;
    setText(undo, last ? `Undo — ${last.description}` : 'Nothing to undo');
    undo.title = last ? `Undo ${last.description}` : '';

    const unassigned = night ? unassignedGuestsOn(event, night) : [];
    if (picked && !stillInPlay(event, picked, night)) picked = '';

    setText(guestsHead, night
      ? `In nobody's room — ${formatDate(night)}`
      : "In nobody's room");
    setHidden(guestsNone, unassigned.length > 0);
    setText(guestsNone, night
      ? 'Everybody staying that night has a room.'
      : 'No nights to arrange yet.');

    const guestEntries = reconcile(guests, unassigned, (guest, index) => guest.id || `row-${index}`,
      (guest) => createGuestChip(guest.id));
    guestEntries.forEach((entry) => entry.update(event));

    const occupancy = night ? roomOccupancyOn(event, night) : {};
    const lodging = LODGING_BUILDINGS;
    const buildingEntries = reconcile(buildings, lodging, (name) => name, createBuilding);
    buildingEntries.forEach((entry, index) =>
      entry.update(event, occupancy[lodging[index]] || {}));
  }

  // The sticky head wraps differently at every width, and the guests pane below
  // it sticks under it. Measured rather than guessed, exactly as shell.js
  // measures the application header for the same reason.
  const trackHead = () => {
    const head = node.querySelector('.board__head');
    if (head) node.style.setProperty('--board-head-h', `${head.offsetHeight}px`);
  };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(trackHead).observe(node.querySelector('.board__head'));
  } else {
    window.addEventListener('resize', trackHead);
  }

  return {
    node,
    update(next) {
      // Somebody edited the rows somewhere else — the form editor, a fresh
      // file, an undo of their own. The board's history describes a different
      // array now, so it is dropped rather than left to restore rows over the
      // top of an edit it never saw.
      const print = fingerprint(next.rooming);
      if (known !== null && print !== known) history.length = 0;
      known = print;
      event = next;
      render();
    }
  };
}

/* ------------------------------------------------------------------ helpers */

/**
 * The rooms to lay out for a `named` building: every room in inventory (§9),
 * plus any room the file names that inventory does not, plus one line for rows
 * carrying no room at all so §12.6 is visible rather than swallowed.
 */
function roomsToShow(event, building, occupancy) {
  const rooms = [...roomsIn(building)];
  let roomless = false;

  for (const row of event.rooming || []) {
    if (!row || (row.building || '') !== building) continue;
    const key = roomKeyOf(row);
    if (!key) roomless = true;
    else if (!rooms.includes(key)) rooms.push(key);
  }
  for (const key of Object.keys(occupancy)) {
    if (key === '') roomless = true;
    else if (!rooms.includes(key)) rooms.push(key);
  }
  if (roomless) rooms.push('');
  return rooms;
}

/** Whether a picked-up guest is still someone this night can place. */
function stillInPlay(event, guestId, night) {
  if (!attendeeById(event, guestId)) return false;
  if (unassignedGuestsOn(event, night).some((guest) => guest.id === guestId)) return true;
  return Boolean(rowHolding(event, event.rooming || [], guestId, night));
}

/** A guest's name, never an id. Ids are opaque and are never displayed (§5 v4). */
function nameOf(event, guestId) {
  const attendee = attendeeById(event, guestId);
  return attendeeName(attendee) || 'Unnamed guest';
}

/**
 * "the Timber Suite", "Brian's Suite", "Red Leaf Inn".
 *
 * The article is dropped in front of a room named after somebody, because half
 * the Lodge is: "out of the Brian's Suite" is the sort of sentence that makes a
 * reader stop and re-read the thing they were being told.
 */
function placeLabel(building, room) {
  if (assignmentModeFor(building) === 'pooled' || !room) return building || 'no building';
  return /['’]s\b/.test(room) ? room : `the ${room}`;
}

/** "Dana", "Dana and Tom", "Dana, Tom and Nora". */
function namesPhrase(names) {
  if (names.length < 3) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Nov 14", "Nov 14 and Nov 15", "Nov 14 through Nov 16". */
function nightsPhrase(dates) {
  const parts = dates.map(formatDateShort);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]} through ${parts[parts.length - 1]}`;
}

/** What a placement is about to cover, said before it happens. */
function nightPhrase(dates, scope) {
  if (scope !== 'stay') return `for ${nightsPhrase(dates)}`;
  return `for ${nightsPhrase(dates)} and the free nights after it`;
}

/** The sentence a move is remembered by — in the undo button, and out loud. */
function describeMove({ event, guestId, label, how, covered, displaced, source }) {
  const guest = nameOf(event, guestId);
  const when = nightsPhrase(covered);
  const others = namesPhrase(displaced.map((id) => nameOf(event, id)));

  if (how === 'swap') {
    return `${guest} and ${others} swapped rooms for ${when}`;
  }
  if (how === 'replace') {
    return `${guest} into ${label} for ${when} — ${others} off the sheet`;
  }
  if (how === 'add') {
    return `${guest} into ${label} with ${others} for ${when}`;
  }
  const from = source ? ` out of ${placeLabel(source.building, roomKeyOf(source))}` : '';
  return `${guest}${from} into ${label} for ${when}`;
}

/** First letter up, for a sentence that begins with a name or a verb alike. */
function sentenceCase(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * Drag, as the enhancement it is.
 *
 * §9 wants this to work on a tablet, and HTML5 drag-and-drop does not fire from
 * a touch: a `touchstart` never becomes a `dragstart` on iOS or Android. Making
 * it work would mean a pointer-event drag implementation, and a half-working
 * one on the device the tool is actually held on is worse than none — so tap to
 * pick up and tap to place is the whole interaction, everywhere, and this is
 * what a mouse gets on top of it. Dragging routes through the same selection
 * the taps use, so there is one code path to be right.
 */
function makeDraggable(node, guestId) {
  node.draggable = true;
  node.addEventListener('dragstart', (drag) => {
    drag.dataTransfer.setData('text/plain', guestId);
    drag.dataTransfer.effectAllowed = 'move';
    node.classList.add('is-dragging');
    // The drop handler reads the selection rather than the payload, so a drag
    // and a pair of taps end in exactly the same call.
    if (!node.classList.contains('is-picked')) node.click();
  });
  node.addEventListener('dragend', () => node.classList.remove('is-dragging'));
}

/** The other half of the enhancement. */
function makeDropTarget(node, drop) {
  node.addEventListener('dragover', (drag) => {
    drag.preventDefault();
    drag.dataTransfer.dropEffect = 'move';
    node.classList.add('is-over');
  });
  node.addEventListener('dragleave', () => node.classList.remove('is-over'));
  node.addEventListener('drop', (drag) => {
    drag.preventDefault();
    node.classList.remove('is-over');
    drop();
  });
}
