// The rooming board's ranges — BUILD-SPEC §9.
//
// "Assigning a guest across consecutive nights produces one `rooming[]` row
// with a spanning range, not one row per night. Moving a guest out of a room
// for one night in the middle of their stay splits the row." That is the
// difference between a rooming sheet somebody can read and forty single-night
// rows, and it is a claim about data rather than about pixels — so it is
// checked here, against the transforms themselves, in plain Node with no
// browser in the way.
//
// js/rooming.js can be imported like this precisely because of §9's
// portability decision: it reaches into no application state, so an event goes
// in and a new event comes out, and a test is just another caller.

import { placeGuest, releaseGuest } from '../../js/rooming.js';

export const title = 'Rooming board — one row per stretch, not one per night';

/** Three nights at the Lodge, and a party in the Bunk Room. */
function event() {
  return {
    meta: {
      eventName: 'Range check', startDate: '2026-11-13', endDate: '2026-11-16',
      eventLead: '', revisionDate: '', revisedBy: '', brandId: 'maple-ranch'
    },
    sections: [],
    attendees: [
      { id: 'a-dana', first: 'Dana', last: 'Reyes', arrive: '2026-11-13', depart: '2026-11-16',
        isChild: false, dietary: '', note: '' },
      { id: 'a-tom', first: 'Tom', last: 'Whitfield', arrive: '2026-11-13', depart: '2026-11-16',
        isChild: false, dietary: '', note: '' },
      { id: 'a-nora', first: 'Nora', last: 'Illig', arrive: '2026-11-13', depart: '2026-11-16',
        isChild: true, dietary: '', note: '' }
    ],
    rooming: [
      { id: 'r-timber', building: 'Lodge', room: 'Timber Suite', guestIds: ['a-dana'],
        from: '2026-11-13', to: '2026-11-16' },
      { id: 'r-bunk', building: 'Lodge', room: 'Bunk Room', guestIds: ['a-tom', 'a-nora'],
        from: '2026-11-13', to: '2026-11-16' }
    ],
    schedule: [], foodAndBev: [], menu: [], staff: [], departments: [], buildingsInUse: []
  };
}

const N1 = '2026-11-13';
const N2 = '2026-11-14';
const N3 = '2026-11-15';

/** Rows as `Room [guest+guest] from..to`, sorted, for comparing against a shape. */
function shape(next) {
  return next.rooming
    .map((row) => `${row.room || row.building} [${row.guestIds.join('+') || 'nobody'}] `
      + `${row.from.slice(5)}..${row.to.slice(5)}`)
    .sort();
}

export async function run({ check }) {
  const start = event();

  // The headline claim, in both directions.
  const middleOut = releaseGuest(start, { guestId: 'a-dana', night: N2 }).event;
  check(
    'out of a room for the middle night of three: the row splits in two',
    shape(middleOut).filter((row) => row.startsWith('Timber')).join(' | ')
      === 'Timber Suite [a-dana] 11-13..11-14 | Timber Suite [a-dana] 11-15..11-16',
    shape(middleOut).join('\n')
  );

  const elsewhere = placeGuest(middleOut, {
    guestId: 'a-dana', building: 'Lodge', room: 'Master Suite', night: N2,
    how: 'move', through: false
  }).event;
  check(
    'and moving them somewhere else for that night makes three rows, not five',
    shape(elsewhere).filter((row) => row.includes('a-dana')).length === 3
      && shape(elsewhere).includes('Master Suite [a-dana] 11-14..11-15'),
    shape(elsewhere).join('\n')
  );

  // Put it back: the two halves and the middle night rejoin into the one row
  // they came from, rather than staying as three abutting rows for ever.
  const rejoined = placeGuest(
    releaseGuest(elsewhere, { guestId: 'a-dana', night: N2 }).event,
    { guestId: 'a-dana', building: 'Lodge', room: 'Timber Suite', night: N2, how: 'move', through: false }
  ).event;
  check(
    'putting them back rejoins the row: one row, the original range',
    shape(rejoined).filter((row) => row.startsWith('Timber')).join(' | ')
      === 'Timber Suite [a-dana] 11-13..11-16',
    shape(rejoined).join('\n')
  );

  // One night at a time, three times, is still one row.
  let nightly = { ...start, rooming: [start.rooming[1]] };
  for (const night of [N1, N2, N3]) {
    nightly = placeGuest(nightly, {
      guestId: 'a-dana', building: 'Lodge', room: 'Wetland Suite', night, how: 'move', through: false
    }).event;
  }
  check(
    'three separate one-night placements merge into one spanning row',
    shape(nightly).filter((row) => row.startsWith('Wetland')).join(' | ')
      === 'Wetland Suite [a-dana] 11-13..11-16',
    shape(nightly).join('\n')
  );

  // Or one placement, said once.
  const throughStay = placeGuest({ ...start, rooming: [start.rooming[1]] }, {
    guestId: 'a-dana', building: 'Lodge', room: 'Wetland Suite', night: N1,
    how: 'move', through: true
  });
  check(
    'or one placement through the stay, which writes the same single row',
    shape(throughStay.event).filter((row) => row.startsWith('Wetland')).join(' | ')
      === 'Wetland Suite [a-dana] 11-13..11-16' && throughStay.nights.length === 3,
    `${shape(throughStay.event).join('\n')} — nights ${throughStay.nights.join(', ')}`
  );

  // §9 — a guest in a party comes off on their own.
  const bunkSplit = releaseGuest(start, { guestId: 'a-tom', night: N2 }).event;
  check(
    'a guest leaves a party for one night and the rest of the party is undisturbed',
    shape(bunkSplit).filter((row) => row.startsWith('Bunk')).join(' | ')
      === 'Bunk Room [a-nora] 11-14..11-15 | Bunk Room [a-tom+a-nora] 11-13..11-14 '
        + '| Bunk Room [a-tom+a-nora] 11-15..11-16',
    shape(bunkSplit).join('\n')
  );

  // Joining an occupied room is the ordinary case (§9), and it splits the row
  // it joins rather than sitting beside it — two rows on one named room on one
  // night is §12.4's clash.
  const joined = placeGuest(start, {
    guestId: 'a-tom', building: 'Lodge', room: 'Timber Suite', night: N2, how: 'add', through: false
  }).event;
  check(
    'joining an occupied room for one night splits it into three, never overlaps',
    shape(joined).filter((row) => row.startsWith('Timber')).join(' | ')
      === 'Timber Suite [a-dana+a-tom] 11-14..11-15 | Timber Suite [a-dana] 11-13..11-14 '
        + '| Timber Suite [a-dana] 11-15..11-16',
    shape(joined).join('\n')
  );

  const unjoined = releaseGuest(joined, { guestId: 'a-tom', night: N2 }).event;
  check(
    'and taking them out again leaves the room exactly as it was',
    shape(unjoined).filter((row) => row.startsWith('Timber')).join(' | ')
      === 'Timber Suite [a-dana] 11-13..11-16',
    shape(unjoined).join('\n')
  );

  // Swap and replace, scoped to the one night §9 asks for.
  const swapped = placeGuest(start, {
    guestId: 'a-tom', building: 'Lodge', room: 'Timber Suite', night: N2, how: 'swap', through: false
  }).event;
  check(
    'a swap exchanges the two rooms for that night and no other',
    shape(swapped).includes('Timber Suite [a-tom] 11-14..11-15')
      && shape(swapped).includes('Bunk Room [a-nora+a-dana] 11-14..11-15')
      && shape(swapped).includes('Bunk Room [a-tom+a-nora] 11-13..11-14'),
    shape(swapped).join('\n')
  );

  const replaced = placeGuest(start, {
    guestId: 'a-tom', building: 'Lodge', room: 'Timber Suite', night: N2,
    how: 'replace', through: false
  }).event;
  check(
    'a replace takes the room and leaves the other guest in no room that night',
    shape(replaced).includes('Timber Suite [a-tom] 11-14..11-15')
      && !shape(replaced).some((row) => row.includes('a-dana') && row.includes('11-14..11-15'))
      && replaced.attendees.length === 3,
    shape(replaced).join('\n')
  );

  // A pooled building has no rooms and no clash: several rows on one night is
  // the building doing its job (§6 [v3], §12.4).
  const pooled = placeGuest(start, {
    guestId: 'a-dana', building: 'Red Leaf Inn', room: null, night: N2, how: 'move', through: false
  }).event;
  check(
    'a pooled building takes a guest with no room on the row',
    pooled.rooming.some((row) => row.building === 'Red Leaf Inn' && row.room === null
      && row.guestIds.join() === 'a-dana' && row.from === N2 && row.to === N3),
    shape(pooled).join('\n')
  );

  // Nothing above may have touched what it was given: §9's portability
  // decision is only worth anything if the caller's event is still theirs.
  check(
    'every transform leaves the event it was handed untouched',
    JSON.stringify(start) === JSON.stringify(event()),
    'the input event was mutated'
  );
}
