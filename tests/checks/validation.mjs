// Validation — BUILD-SPEC §12.
//
// Twelve rules, none of which had ever run before v12. Each gets an event that
// trips it and an event that does not, because the negative case is the one
// that matters here: a rule that fires on everything is worse than a rule that
// never fires, since it teaches the coordinator to stop reading the panel, and
// then the one finding that mattered goes past unread.
//
// The cases that must *not* fire are called out by name below and are the
// reason several of these rules have the shape they do:
//
//   * several names on one rooming row — a party sharing a room (§5, v5)
//   * two parties in the Bunk Room on one night — what the Bunk Room is for
//   * an overnight guest deliberately unlisted — spouses and children rooming
//     with family are never on the sheet
//   * a count set on purpose — a note; a count set and then left empty is the
//     one override that is a warning, because it prints 0 covers
//   * a stale `count` on a row switched back to the guest list — nothing
//     deletes the field, and the two selectors are what decide
//   * turnover — two rooms on consecutive nights is ordinary
//   * a room held under no name yet — not an orphan
//
// Plain Node, no browser: `validate.js` takes an event and returns findings,
// and everything it imports is pure.

import { validateEvent } from '../../js/validate.js';
import { assignmentModeFor, sharesFreely } from '../../js/reference.js';
import { LODGING_BUILDINGS } from '../../js/reference.js';

export const title = 'Validation — the twelve rules of §12, and what must not trip them';

const N14 = '2026-11-14';
const N15 = '2026-11-15';
const N16 = '2026-11-16';

/**
 * A clean event: two guests, two rooms, one hunt, one dinner with a menu.
 *
 * Every check below starts here and breaks one thing, so a finding that appears
 * is a finding the change caused. The harness asserts the base is silent first,
 * which is what makes that true.
 */
function base() {
  return {
    meta: {
      eventName: 'Validation check',
      startDate: N14,
      endDate: N16,
      eventLead: 'Brian Mathrusse',
      revisionDate: N14,
      revisedBy: 'Brian Mathrusse',
      brandId: 'maple-ranch',
      includeInOrder: { rooming: false, menu: false },
      touchedAt: ''
    },
    sections: [],
    attendees: [
      { id: 'a-dana', first: 'Dana', last: 'Reyes', arrive: N14, depart: N16, isChild: false },
      { id: 'a-tom', first: 'Tom', last: 'Whitfield', arrive: N14, depart: N16, isChild: false }
    ],
    rooming: [
      { id: 'r-dana', building: 'Lodge Lower Suites', room: 'Timber',
        guestIds: ['a-dana'], from: N14, to: N16 },
      { id: 'r-tom', building: 'Remington', room: '1',
        guestIds: ['a-tom'], from: N14, to: N16 }
    ],
    schedule: [
      { id: 's-hunt', date: N14, start: '05:00', end: '10:00', label: 'Duck Hunting' }
    ],
    foodAndBev: [
      { id: 'f-dinner', date: N14, start: '18:30', end: '20:30', meal: 'Dinner',
        location: 'The Wheel', countBasis: 'present', serves: 'all' }
    ],
    menu: [{ fnbId: 'f-dinner', dishes: ['American Wagyu Beef Tenderloin'] }],
    staff: [],
    departments: [],
    buildingsInUse: [],
    overflowBuildings: [],
    seeded: { meals: [], itinerary: [] },
    customActivities: []
  };
}

/** The base with one thing changed. */
function withEvent(mutate) {
  const event = base();
  mutate(event);
  return event;
}

/** Findings for one rule number. */
function forRule(event, rule) {
  return validateEvent(event).filter((item) => item.rule === rule);
}

/** Every finding as one string, for reading a failure. */
function say(findings) {
  return findings.length
    ? findings.map((item) => `[${item.severity} §12.${item.rule}] ${item.text}`).join(' | ')
    : '(nothing)';
}

export async function run({ check }) {
  /* ------------------------------------------------------------- the base */

  check(
    'the base event is clean — nothing below is a finding that was already there',
    validateEvent(base()).length === 0,
    say(validateEvent(base()))
  );

  check(
    'no event at all is not an error',
    validateEvent(null).length === 0 && validateEvent(undefined).length === 0,
    'a missing event must produce no findings and no throw'
  );

  const frozen = base();
  JSON.parse(JSON.stringify(frozen)); // shape check before freezing
  deepFreeze(frozen);
  let threw = '';
  try {
    validateEvent(frozen);
  } catch (error) {
    threw = error.message;
  }
  check(
    'validating an event does not write to it — the module is pure',
    threw === '',
    threw || 'a frozen event was validated without a throw'
  );

  /* ------------------------------------------------ 1. explicit overrides */

  const override = withEvent((event) => {
    event.foodAndBev[0].countBasis = 'custom';
    event.foodAndBev[0].count = 12;
  });
  const overrideFound = forRule(override, 1);
  check(
    '§12.1 fires on a count set by hand, and names the figure',
    overrideFound.length === 1 && overrideFound[0].text.includes('12'),
    say(overrideFound)
  );

  check(
    '§12.1 — a count set on purpose is a NOTE, not a warning',
    overrideFound.length === 1 && overrideFound[0].severity === 'note',
    overrideFound.length ? overrideFound[0].severity : '(nothing fired)'
  );

  check(
    '§12.1 fires on serves: custom the same way',
    forRule(withEvent((event) => {
      event.foodAndBev[0].serves = 'custom';
      event.foodAndBev[0].count = 8;
    }), 1).length === 1,
    say(forRule(withEvent((event) => { event.foodAndBev[0].serves = 'custom'; }), 1))
  );

  check(
    '§12.1 does not fire on a meal counted from the guest list',
    forRule(base(), 1).length === 0,
    say(forRule(base(), 1))
  );

  const emptyOverride = withEvent((event) => {
    event.foodAndBev[0].countBasis = 'custom';
  });
  check(
    '§12.1 — an override with no number in it is a WARNING: it prints 0 covers [v12]',
    forRule(emptyOverride, 1).length === 1
      && forRule(emptyOverride, 1)[0].severity === 'warning'
      && forRule(emptyOverride, 1)[0].text.includes('0 covers'),
    say(forRule(emptyOverride, 1))
  );

  check(
    '§12.1 does not fire on a stale count left behind by switching back to the guest list',
    forRule(withEvent((event) => {
      event.foodAndBev[0].count = 40;
    }), 1).length === 0,
    'nothing deletes `count`; the two selectors are what decide'
  );

  check(
    '§12.1 does not fire on a mis-cased basis — derive.js reads it strictly, so this must too',
    forRule(withEvent((event) => {
      event.foodAndBev[0].countBasis = 'Custom';
      event.foodAndBev[0].count = 9;
    }), 1).length === 0,
    'a row counted by presence must not be described as counted by hand'
  );

  /* ------------------------------------------------------ 2. unhoused guests */

  const unhoused = withEvent((event) => {
    event.attendees.push({ id: 'a-kim', first: 'Kim', last: 'Palmer',
      arrive: N14, depart: N16, isChild: false });
  });
  const unhousedFound = forRule(unhoused, 2);
  check(
    '§12.2 fires on an overnight guest on no room, once for the guest and not once per night',
    unhousedFound.length === 1
      && unhousedFound[0].text.startsWith('Kim Palmer')
      && unhousedFound[0].text.includes('Nov 14')
      && unhousedFound[0].text.includes('Nov 15'),
    say(unhousedFound)
  );

  check(
    '§12.2 — a guest deliberately off the sheet is a NOTE, and says so in words',
    unhousedFound.length === 1
      && unhousedFound[0].severity === 'note'
      && unhousedFound[0].text.includes('rooming with family'),
    say(unhousedFound)
  );

  check(
    '§12.2 does not fire on a day guest — never overnight, so never unhoused',
    forRule(withEvent((event) => {
      event.attendees.push({ id: 'a-chase', first: 'Chase', last: 'Baldwin',
        arrive: N14, depart: N14, isChild: false });
    }), 2).length === 0,
    say(forRule(withEvent((event) => {
      event.attendees.push({ id: 'a-chase', first: 'Chase', last: 'Baldwin',
        arrive: N14, depart: N14, isChild: false });
    }), 2))
  );

  check(
    '§12.2 does not fire on a guest named on a row covering the night',
    forRule(base(), 2).length === 0,
    say(forRule(base(), 2))
  );

  check(
    '§12.2 — SEVERAL NAMES ON ONE ROW house all of them, and none of them fires',
    forRule(withEvent((event) => {
      event.attendees.push(
        { id: 'a-nora', first: 'Nora', last: 'Illig', arrive: N14, depart: N16, isChild: true },
        { id: 'a-charlie', first: 'Charlie', last: 'Illig', arrive: N14, depart: N16, isChild: true }
      );
      event.rooming.push({ id: 'r-bunk', building: 'Lodge Bunk Rooms', room: 'Bunk Room',
        guestIds: ['a-nora', 'a-charlie'], from: N14, to: N16 });
    }), 2).length === 0,
    'two children on one Bunk Room row are both named on the sheet'
  );

  /* --------------------------------------------------- 3. names that are gone */

  const ghost = withEvent((event) => {
    event.rooming[0].guestIds = ['a-gone'];
  });
  const ghostFound = forRule(ghost, 3);
  check(
    '§12.3 fires on a guestId matching no attendee, and names the room rather than the id',
    ghostFound.length === 1
      && ghostFound[0].severity === 'warning'
      && ghostFound[0].text.includes('Timber')
      && !ghostFound[0].text.includes('a-gone'),
    say(ghostFound)
  );

  check(
    '§12.3 fires on a legacy name a migration could not match, and quotes it',
    forRule(withEvent((event) => {
      event.rooming[1].guest = 'Michael Illig';
    }), 3).some((item) => item.text.includes('Michael Illig')),
    say(forRule(withEvent((event) => { event.rooming[1].guest = 'Michael Illig'; }), 3))
  );

  check(
    '§12.3 — A ROOM HELD UNDER NO NAME YET is not an orphan and fires nothing',
    forRule(withEvent((event) => {
      event.rooming.push({ id: 'r-empty', building: 'Winchester', room: '2',
        guestIds: [], from: N14, to: N16 });
    }), 3).length === 0,
    say(forRule(withEvent((event) => {
      event.rooming.push({ id: 'r-empty', building: 'Winchester', room: '2',
        guestIds: [], from: N14, to: N16 });
    }), 3))
  );

  /* -------------------------------------------------- 4. a room claimed twice */

  const clash = withEvent((event) => {
    event.rooming.push({ id: 'r-clash', building: 'Lodge Lower Suites', room: 'Timber',
      guestIds: ['a-tom'], from: N15, to: N16 });
  });
  const clashFound = forRule(clash, 4);
  check(
    '§12.4 fires when two rows hold the same room on the same night, and names both parties',
    clashFound.length === 1
      && clashFound[0].severity === 'warning'
      && clashFound[0].text.includes('Timber')
      && clashFound[0].text.includes('Dana Reyes')
      && clashFound[0].text.includes('Tom Whitfield')
      && clashFound[0].text.includes('Nov 15'),
    say(clashFound)
  );

  check(
    '§12.4 marks both rows, so the row you are looking at is one of the two',
    clashFound.length === 1
      && clashFound[0].rowIds.includes('r-dana')
      && clashFound[0].rowIds.includes('r-clash'),
    clashFound.length ? clashFound[0].rowIds.join(',') : '(nothing fired)'
  );

  check(
    '§12.4 — TURNOVER is not a clash: out on the 15th, in on the 15th',
    forRule(withEvent((event) => {
      event.rooming[0].to = N15;
      event.rooming.push({ id: 'r-next', building: 'Lodge Lower Suites', room: 'Timber',
        guestIds: ['a-tom'], from: N15, to: N16 });
    }), 4).length === 0,
    say(forRule(withEvent((event) => {
      event.rooming[0].to = N15;
      event.rooming.push({ id: 'r-next', building: 'Lodge Lower Suites', room: 'Timber',
        guestIds: ['a-tom'], from: N15, to: N16 });
    }), 4))
  );

  check(
    '§12.4 — SEVERAL NAMES ON ONE ROW is a party sharing a room, never a conflict',
    forRule(withEvent((event) => {
      event.rooming[0].guestIds = ['a-dana', 'a-tom'];
      event.rooming.splice(1, 1);
    }), 4).length === 0,
    'one row naming two guests is one booking'
  );

  const bunk = withEvent((event) => {
    event.attendees.push(
      { id: 'a-nora', first: 'Nora', last: 'Illig', arrive: N14, depart: N16, isChild: true },
      { id: 'a-kim', first: 'Kim', last: 'Palmer', arrive: N14, depart: N16, isChild: false }
    );
    event.rooming.push(
      { id: 'r-bunk-a', building: 'Lodge Bunk Rooms', room: 'Bunk Room',
        guestIds: ['a-nora'], from: N14, to: N16 },
      { id: 'r-bunk-b', building: 'Lodge Bunk Rooms', room: 'Bunk Room',
        guestIds: ['a-kim'], from: N14, to: N16 }
    );
  });
  const bunkFound = forRule(bunk, 4);
  check(
    '§12.4 — TWO PARTIES IN THE BUNK ROOM is a note, not a warning [v12]',
    bunkFound.length === 1 && bunkFound[0].severity === 'note'
      && bunkFound[0].text.includes('Bunk Room'),
    say(bunkFound)
  );

  check(
    '§12.4 — the same two parties in a suite IS a warning',
    forRule(withEvent((event) => {
      event.attendees.push({ id: 'a-kim', first: 'Kim', last: 'Palmer',
        arrive: N14, depart: N16, isChild: false });
      event.rooming.push({ id: 'r-second', building: 'Lodge Lower Suites', room: 'Timber',
        guestIds: ['a-kim'], from: N14, to: N16 });
    }), 4).every((item) => item.severity === 'warning'),
    'only a sharesFreely room may soften to a note'
  );

  check(
    '§12.4 — three bookings in one room are one finding, not three pairs',
    forRule(withEvent((event) => {
      event.attendees.push(
        { id: 'a-kim', first: 'Kim', last: 'Palmer', arrive: N14, depart: N16, isChild: false },
        { id: 'a-nora', first: 'Nora', last: 'Illig', arrive: N14, depart: N16, isChild: true }
      );
      event.rooming.push(
        { id: 'r-b', building: 'Lodge Lower Suites', room: 'Timber',
          guestIds: ['a-kim'], from: N14, to: N16 },
        { id: 'r-c', building: 'Lodge Lower Suites', room: 'Timber',
          guestIds: ['a-nora'], from: N14, to: N16 }
      );
    }), 4).length === 1,
    'a cluster is reported once, naming everyone in it'
  );

  check(
    'the Bunk Room is the only room that shares freely (§6 [v12])',
    sharesFreely('Lodge Bunk Rooms')
      && LODGING_BUILDINGS.filter((building) => sharesFreely(building)).length === 1,
    LODGING_BUILDINGS.filter((building) => sharesFreely(building)).join(',')
  );

  /* ------------------------------------------ 5. a booking outside the stay */

  const late = withEvent((event) => {
    event.rooming[0].to = '2026-11-17';
  });
  const lateFound = forRule(late, 5);
  check(
    '§12.5 fires when a room runs past the guest, and says which night rather than which date',
    lateFound.length === 1
      && lateFound[0].text.includes('Dana Reyes')
      && lateFound[0].text.includes('the night of Nov 16')
      && lateFound[0].text.includes('leaves on Nov 16'),
    say(lateFound)
  );

  check(
    '§12.5 fires when a room starts before the guest arrives',
    forRule(withEvent((event) => {
      event.rooming[0].from = '2026-11-13';
    }), 5).some((item) => item.text.includes('does not arrive until Nov 14')),
    say(forRule(withEvent((event) => { event.rooming[0].from = '2026-11-13'; }), 5))
  );

  check(
    '§12.5 does not fire on a booking that follows the guest exactly',
    forRule(base(), 5).length === 0,
    say(forRule(base(), 5))
  );

  check(
    '§12.5 reads the WHOLE PARTY, not the first name on the row',
    forRule(withEvent((event) => {
      // The room runs from the 14th. The first name arrives on the 15th; the
      // second is here from the 14th, so the booking is right.
      event.attendees[0].arrive = N15;
      event.rooming[0].guestIds = ['a-dana', 'a-tom'];
      event.rooming.splice(1, 1);
    }), 5).length === 0,
    say(forRule(withEvent((event) => {
      event.attendees[0].arrive = N15;
      event.rooming[0].guestIds = ['a-dana', 'a-tom'];
      event.rooming.splice(1, 1);
    }), 5))
  );

  check(
    '§12.5 stays quiet about a guest whose own dates run backwards — §12.10 is saying it',
    forRule(withEvent((event) => {
      event.attendees[1].arrive = N16;
      event.attendees[1].depart = N14;
    }), 5).length === 0,
    say(forRule(withEvent((event) => {
      event.attendees[1].arrive = N16;
      event.attendees[1].depart = N14;
    }), 5))
  );

  check(
    '§12.5 does not fire on a row with no dates of its own — it takes the guest’s',
    forRule(withEvent((event) => {
      event.rooming[0].from = '';
      event.rooming[0].to = '';
    }), 5).length === 0,
    say(forRule(withEvent((event) => {
      event.rooming[0].from = '';
      event.rooming[0].to = '';
    }), 5))
  );

  /* ----------------------------------------------- 6. a room against the mode */

  const noRoom = withEvent((event) => {
    event.rooming[1].room = null;
  });
  const noRoomFound = forRule(noRoom, 6);
  check(
    '§12.6 fires on a booking with no room in a building assigned room by room',
    noRoomFound.length === 1
      && noRoomFound[0].severity === 'warning'
      && noRoomFound[0].text.includes('Remington')
      && noRoomFound[0].text.includes('Tom Whitfield'),
    say(noRoomFound)
  );

  check(
    '§12.6 does not fire on a room that is set',
    forRule(base(), 6).length === 0,
    say(forRule(base(), 6))
  );

  check(
    '§12.6 — the pooled half is DORMANT: no building is pooled since v9, so it cannot fire',
    LODGING_BUILDINGS.every((building) => assignmentModeFor(building) === 'named'),
    LODGING_BUILDINGS.map((b) => `${b}:${assignmentModeFor(b)}`).join(' ')
  );

  // [v12] The half migrate.js and reference.js always said §12.6 covered.
  const retiredBuilding = withEvent((event) => {
    event.rooming.push({ id: 'r-gone', building: 'Upland', room: '3',
      guestIds: ['a-tom'], from: N14, to: N16 });
  });
  check(
    '§12.6 fires on a building that left the registry, every time the file is opened [v12]',
    forRule(retiredBuilding, 6).length === 1
      && forRule(retiredBuilding, 6)[0].text.includes('Upland')
      && forRule(retiredBuilding, 6)[0].text.includes('kept exactly as it was authored'),
    say(forRule(retiredBuilding, 6))
  );

  const retiredRoom = withEvent((event) => {
    event.rooming[1].room = '9';
  });
  check(
    '§12.6 fires on a room that left the building — Remington has four [v12]',
    forRule(retiredRoom, 6).length === 1
      && forRule(retiredRoom, 6)[0].text.includes('not a room in Remington'),
    say(forRule(retiredRoom, 6))
  );

  check(
    '§12.6 does not fire on a row with no building at all — that is a blank new row',
    forRule(withEvent((event) => {
      event.rooming.push({ id: 'r-blank', building: '', room: null,
        guestIds: [], from: '', to: '' });
    }), 6).length === 0,
    say(forRule(withEvent((event) => {
      event.rooming.push({ id: 'r-blank', building: '', room: null,
        guestIds: [], from: '', to: '' });
    }), 6))
  );

  /* --------------------------------------------------- 7. a menu with no meal */

  const orphan = withEvent((event) => {
    event.menu.push({ fnbId: 'f-gone', dishes: ['Bourbon Pecan Tart'] });
  });
  const orphanFound = forRule(orphan, 7);
  check(
    '§12.7 fires on a menu block pointing at a meal that is gone, and names a dish',
    orphanFound.length === 1 && orphanFound[0].text.includes('Bourbon Pecan Tart'),
    say(orphanFound)
  );

  check(
    '§12.7 does not fire on a block whose meal is there',
    forRule(base(), 7).length === 0,
    say(forRule(base(), 7))
  );

  /* --------------------------------------------------- 8. a meal with no menu */

  const noMenu = withEvent((event) => {
    event.foodAndBev.push({ id: 'f-breakfast', date: N15, start: '09:00', end: '11:00',
      meal: 'Breakfast', location: 'The Wheel', countBasis: 'present', serves: 'all' });
  });
  const noMenuFound = forRule(noMenu, 8);
  check(
    '§12.8 fires on a meal service with no menu written',
    noMenuFound.length === 1 && noMenuFound[0].text === 'Breakfast on Nov 15 has no menu written.',
    say(noMenuFound)
  );

  check(
    '§12.8 does not fire on a meal that has one',
    forRule(base(), 8).length === 0,
    say(forRule(base(), 8))
  );

  /* ------------------------------------------------- 9. dated off the event */

  const outside = withEvent((event) => {
    event.schedule.push({ id: 's-late', date: '2026-11-17', start: '09:00', end: '11:00',
      label: 'Skeet' });
  });
  const outsideFound = forRule(outside, 9);
  check(
    '§12.9 fires on an itinerary row dated after the event, and names the row and the edge',
    outsideFound.length === 1
      && outsideFound[0].text.includes('Skeet')
      && outsideFound[0].text.includes('after the event ends on Nov 16'),
    say(outsideFound)
  );

  check(
    '§12.9 fires on a meal dated before the event starts',
    forRule(withEvent((event) => {
      event.foodAndBev.push({ id: 'f-early', date: '2026-11-13', meal: 'Lunch',
        countBasis: 'present', serves: 'all' });
      event.menu.push({ fnbId: 'f-early', dishes: ['Chili'] });
    }), 9).some((item) => item.text.includes('before the event starts on Nov 14')),
    say(forRule(withEvent((event) => {
      event.foodAndBev.push({ id: 'f-early', date: '2026-11-13', meal: 'Lunch',
        countBasis: 'present', serves: 'all' });
    }), 9))
  );

  check(
    '§12.9 does not fire when the event has no dates to be outside of',
    forRule(withEvent((event) => {
      event.meta.startDate = '';
      event.meta.endDate = '';
    }), 9).length === 0,
    say(forRule(withEvent((event) => {
      event.meta.startDate = '';
      event.meta.endDate = '';
    }), 9))
  );

  check(
    '§12.9 does not fire on a blank seeded row inside the range',
    forRule(withEvent((event) => {
      event.schedule.push({ id: 's-blank', date: N15, start: '', end: '', label: '' });
    }), 9).length === 0,
    say(forRule(withEvent((event) => {
      event.schedule.push({ id: 's-blank', date: N15, start: '', end: '', label: '' });
    }), 9))
  );

  /* ------------------------------------------------------ 10. a backwards stay */

  const backwards = withEvent((event) => {
    event.attendees[1].arrive = N16;
    event.attendees[1].depart = N14;
  });
  const backwardsFound = forRule(backwards, 10);
  check(
    '§12.10 fires on a guest leaving before they arrive',
    backwardsFound.length === 1
      && backwardsFound[0].text.includes('Tom Whitfield')
      && backwardsFound[0].text.includes('leaving on Nov 14'),
    say(backwardsFound)
  );

  check(
    '§12.10 does not fire on a guest with no dates of their own — they take the event’s',
    forRule(withEvent((event) => {
      event.attendees[0].arrive = '';
      event.attendees[0].depart = '';
    }), 10).length === 0,
    say(forRule(withEvent((event) => {
      event.attendees[0].arrive = '';
      event.attendees[0].depart = '';
    }), 10))
  );

  check(
    '§12.10 does not fire on a one-day stay',
    forRule(withEvent((event) => {
      event.attendees[0].arrive = N15;
      event.attendees[0].depart = N15;
    }), 10).length === 0,
    say(forRule(withEvent((event) => {
      event.attendees[0].arrive = N15;
      event.attendees[0].depart = N15;
    }), 10))
  );

  /* ------------------------------------------------ 11. a stale revision line */

  const stale = withEvent((event) => {
    event.meta.touchedAt = '2026-11-15T09:12';
  });
  const staleFound = forRule(stale, 11);
  check(
    '§12.11 fires when the revision line is older than the last edit [v12]',
    staleFound.length === 1
      && staleFound[0].text.includes('Nov 14')
      && staleFound[0].text.includes('Nov 15'),
    say(staleFound)
  );

  check(
    '§12.11 does not fire when the revision line is the day of the edit',
    forRule(withEvent((event) => {
      event.meta.touchedAt = '2026-11-14T23:59';
    }), 11).length === 0,
    say(forRule(withEvent((event) => { event.meta.touchedAt = '2026-11-14T23:59'; }), 11))
  );

  check(
    '§12.11 does not fire on a file saved before v12 — no touchedAt is not a guess',
    forRule(base(), 11).length === 0 && forRule(withEvent((event) => {
      delete event.meta.touchedAt;
    }), 11).length === 0,
    say(forRule(withEvent((event) => { delete event.meta.touchedAt; }), 11))
  );

  check(
    '§12.11 does not fire when no revision line has been written at all',
    forRule(withEvent((event) => {
      event.meta.revisionDate = '';
      event.meta.touchedAt = '2026-11-15T09:12';
    }), 11).length === 0,
    say(forRule(withEvent((event) => {
      event.meta.revisionDate = '';
      event.meta.touchedAt = '2026-11-15T09:12';
    }), 11))
  );

  /* ------------------------------------------------ 12. a meal typed twice */

  const twice = withEvent((event) => {
    event.schedule.push({ id: 's-dinner', date: N14, start: '18:30', end: '20:30',
      label: 'Dinner' });
  });
  const twiceFound = forRule(twice, 12);
  check(
    '§12.12 fires on a meal that is also an itinerary row at the same time',
    twiceFound.length === 1
      && twiceFound[0].text.includes('print twice')
      && twiceFound[0].rowIds.includes('s-dinner')
      && twiceFound[0].rowIds.includes('f-dinner'),
    say(twiceFound)
  );

  check(
    '§12.12 does not fire at a different time — that one does not print twice',
    forRule(withEvent((event) => {
      event.schedule.push({ id: 's-dinner', date: N14, start: '18:00', label: 'Dinner' });
    }), 12).length === 0,
    say(forRule(withEvent((event) => {
      event.schedule.push({ id: 's-dinner', date: N14, start: '18:00', label: 'Dinner' });
    }), 12))
  );

  check(
    '§12.12 does not fire on a blank seeded itinerary row',
    forRule(withEvent((event) => {
      event.schedule.push({ id: 's-blank', date: N14, start: '', end: '', label: '' });
      event.foodAndBev.push({ id: 'f-blank', date: N14, start: '', meal: '',
        countBasis: 'present', serves: 'all' });
      event.menu.push({ fnbId: 'f-blank', dishes: [] });
    }), 12).length === 0,
    'a blank label matches nothing'
  );

  /* ------------------------------------------------------------- all twelve */

  const everything = kitchenSink();
  const tripped = new Set(validateEvent(everything).map((item) => item.rule));
  const missing = [];
  for (let rule = 1; rule <= 12; rule += 1) if (!tripped.has(rule)) missing.push(rule);
  check(
    'every one of the twelve rules can be tripped — one event trips all of them',
    missing.length === 0,
    missing.length ? `never fired: ${missing.map((rule) => `§12.${rule}`).join(', ')}` : ''
  );

  /* ----------------------------------------------------------- the wording */

  const everyFinding = [
    ...validateEvent(everything),
    ...validateEvent(clash),
    ...validateEvent(bunk),
    ...validateEvent(unhoused),
    ...validateEvent(ghost)
  ];

  const isoLeak = everyFinding.filter((item) => /\d{4}-\d{2}-\d{2}/.test(item.text));
  check(
    'no finding prints an ISO date at a person — dates are said the way they are spoken',
    isoLeak.length === 0,
    say(isoLeak)
  );

  const idLeak = everyFinding.filter((item) =>
    /\b(?:a|r|s|f)-[a-z]+\b/.test(item.text) || /\bfnbId\b/.test(item.text));
  check(
    'no finding prints a row id — ids are opaque and are never displayed (§5, v4 changes)',
    idLeak.length === 0,
    say(idLeak)
  );

  const ruleLeak = everyFinding.filter((item) => /rule\s*\d|§12/i.test(item.text));
  check(
    'no finding names its own rule number — it says what is wrong, not which check found it',
    ruleLeak.length === 0,
    say(ruleLeak)
  );

  const shapeless = everyFinding.filter((item) =>
    !item.text || !/[.]$/.test(item.text.trim()) || item.text.trim().length < 20);
  check(
    'every finding is a finished sentence',
    shapeless.length === 0,
    say(shapeless)
  );

  const misfiled = everyFinding.filter((item) =>
    !['meta', 'guests', 'schedule', 'foodAndBev', 'staff', 'departments', 'rooming', 'menu']
      .includes(item.area));
  check(
    'every finding names an area the interface knows how to open',
    misfiled.length === 0,
    misfiled.map((item) => `§12.${item.rule} -> ${item.area}`).join(', ')
  );

  const keys = everyFinding.map((item) => item.key);
  check(
    'a finding carries enough identity to be told from its neighbours',
    keys.every(Boolean),
    `${keys.filter(Boolean).length}/${keys.length} carry a key`
  );
}

/**
 * One event that trips all twelve rules at once.
 *
 * Not a realistic event — it is the check that no rule is silently absent from
 * the module. A rule that is never written and a rule that always passes look
 * identical from outside, and this is the difference.
 */
function kitchenSink() {
  return {
    meta: {
      eventName: 'Everything at once',
      startDate: N14,
      endDate: N16,
      revisionDate: N14,
      revisedBy: 'Brian Mathrusse',
      touchedAt: '2026-11-16T08:30',
      includeInOrder: { rooming: false, menu: false }
    },
    sections: [],
    attendees: [
      // Rule 2: overnight, on no room.
      { id: 'a-kim', first: 'Kim', last: 'Palmer', arrive: N14, depart: N16, isChild: false },
      // Rule 10: leaving before arriving.
      { id: 'a-back', first: 'Elise', last: 'Navarro', arrive: N16, depart: N14, isChild: false },
      { id: 'a-dana', first: 'Dana', last: 'Reyes', arrive: N14, depart: N15, isChild: false },
      { id: 'a-tom', first: 'Tom', last: 'Whitfield', arrive: N14, depart: N16, isChild: false }
    ],
    rooming: [
      // Rules 4 and 5: the Timber twice over, and past Dana's departure.
      { id: 'r-dana', building: 'Lodge Lower Suites', room: 'Timber',
        guestIds: ['a-dana'], from: N14, to: N16 },
      { id: 'r-tom', building: 'Lodge Lower Suites', room: 'Timber',
        guestIds: ['a-tom'], from: N14, to: N16 },
      // Rule 3: a name that is not on the list.
      { id: 'r-ghost', building: 'Remington', room: '1', guestIds: ['a-gone'],
        from: N14, to: N16 },
      // Rule 6: a named building with no room.
      { id: 'r-noroom', building: 'Winchester', room: null, guestIds: [], from: N14, to: N16 }
    ],
    schedule: [
      // Rule 12: the meal below, typed here too.
      { id: 's-dinner', date: N14, start: '18:30', end: '20:30', label: 'Dinner' },
      // Rule 9: dated past the end of the event.
      { id: 's-late', date: '2026-11-18', start: '09:00', label: 'Skeet' }
    ],
    foodAndBev: [
      { id: 'f-dinner', date: N14, start: '18:30', end: '20:30', meal: 'Dinner',
        location: 'The Wheel', countBasis: 'present', serves: 'all' },
      // Rules 1 and 8: counted by hand, and no menu under it.
      { id: 'f-cocktails', date: N15, start: '17:00', meal: 'Cocktails',
        location: 'Hummer Bar', countBasis: 'custom', count: 14, serves: 'adults' }
    ],
    // Rule 7: written for a meal that is not in the file.
    menu: [
      { fnbId: 'f-dinner', dishes: ['Pan-Roasted Walleye'] },
      { fnbId: 'f-gone', dishes: ['Skillet Apple Crisp'] }
    ],
    staff: [],
    departments: [],
    buildingsInUse: [],
    overflowBuildings: [],
    seeded: { meals: [], itinerary: [] },
    customActivities: []
  };
}

/** Freeze an object and everything under it, the way app.js does. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
