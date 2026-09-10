// Entry ergonomics — BUILD-SPEC §5 (v10 changes), §6 [v10], §8 C [v10].
//
// Three rules from v10 that are easy to state and easy to break later, checked
// against the functions themselves in plain Node:
//
//   * Seeding fills gaps and does nothing else — never duplicates, never
//     overwrites, never resurrects, never deletes.
//   * The printed sheet collapses vacancies into ranges; nothing collapses a
//     named room into one.
//   * A guest cannot hold two rooms on one night, but turnover between two
//     rooms on consecutive nights is ordinary and must stay expressible.

import { collapseRooms, overlappingAssignments, roomsOn } from '../../js/derive.js';
import { markSeeded, seedForDates } from '../../js/seed.js';

export const title = 'Entry — seeding, vacancies, and one guest in one room';

/** Three nights, two guests, and a room in each of two buildings. */
function event() {
  return {
    meta: { eventName: 'Entry check', startDate: '2026-11-13', endDate: '2026-11-16' },
    sections: [],
    attendees: [
      { id: 'a-dana', first: 'Dana', last: 'Reyes', arrive: '2026-11-13', depart: '2026-11-16' },
      { id: 'a-tom', first: 'Tom', last: 'Whitfield', arrive: '2026-11-13', depart: '2026-11-16' }
    ],
    rooming: [
      { id: 'r-1', building: 'Mallard', room: '3', guestIds: ['a-dana'],
        from: '2026-11-13', to: '2026-11-14' },
      { id: 'r-2', building: 'Wigeon', room: '5', guestIds: ['a-dana'],
        from: '2026-11-14', to: '2026-11-15' }
    ],
    schedule: [], foodAndBev: [], menu: [], staff: [], departments: [],
    buildingsInUse: [], overflowBuildings: []
  };
}

const N1 = '2026-11-13';
const N2 = '2026-11-14';

export async function run({ check }) {
  /* ------------------------------------------------------------ vacancies */

  check(
    'runs of numbered rooms collapse and a pair collapses too',
    collapseRooms(['1', '2', '3', '4', '5', '6', '7', '9', '10', '12', '13', '14', '15', '16',
      '17', '18', '19', '20', '21', '22', '23', '24']) === '1–7, 9–10, 12–24',
    collapseRooms(['1', '2', '3', '9', '10'])
  );

  check(
    'a named room is a name and never joins a range',
    collapseRooms(['Timber', 'Wetland']) === 'Timber, Wetland'
      && collapseRooms(['1', 'Bunk Room', '2']) === '1, Bunk Room, 2',
    collapseRooms(['1', 'Bunk Room', '2'])
  );

  const rli = roomsOn({
    ...event(),
    rooming: [
      { id: 'r-a', building: 'RLI', room: '8', guestIds: ['a-dana'], from: N1, to: '2026-11-16' },
      { id: 'r-b', building: 'RLI', room: '11', guestIds: ['a-tom'], from: N1, to: '2026-11-16' }
    ]
  }, 'RLI', N1);

  check(
    'RLI with two guests reports two occupied rooms and twenty-two vacancies',
    rli.occupied.map((entry) => entry.room).join(',') === '8,11'
      && rli.vacant.length === 22
      && rli.vacantRanges === '1–7, 9–10, 12–24',
    `${rli.occupied.length} occupied, ${rli.vacant.length} vacant: ${rli.vacantRanges}`
  );

  check(
    'an empty building is all vacancies and no occupied rooms',
    roomsOn(event(), 'Remington', N1).vacantRanges === '1–4',
    roomsOn(event(), 'Remington', N1).vacantRanges
  );

  /* -------------------------------------------------------------- seeding */

  const fresh = { meta: { startDate: '2026-11-14', endDate: '2026-11-16' } };
  const made = seedForDates(fresh);
  check(
    'setting the dates seeds three meals and three itinerary rows a day',
    made.meals === 9 && made.itinerary === 9
      && fresh.foodAndBev.map((row) => row.meal).join(',')
        === 'Breakfast,Lunch,Dinner,Breakfast,Lunch,Dinner,Breakfast,Lunch,Dinner'
      && fresh.foodAndBev[0].start === '09:00' && fresh.foodAndBev[2].end === '20:30'
      && fresh.schedule.every((row) => !row.label && !row.start),
    `${made.meals} meals, ${made.itinerary} itinerary rows`
  );

  check(
    'seeded meals have no location: a guess printed on an order is worse than a blank',
    fresh.foodAndBev.every((row) => row.location === ''),
    JSON.stringify(fresh.foodAndBev[0])
  );

  check(
    'seeding the same dates again creates nothing',
    seedForDates(fresh).meals === 0 && fresh.foodAndBev.length === 9,
    `${fresh.foodAndBev.length} meals after a second pass`
  );

  const edited = structuredClone(fresh);
  edited.foodAndBev[0].meal = 'Late Breakfast';
  edited.foodAndBev[0].start = '10:30';
  seedForDates(edited);
  check(
    'an edited row is never overwritten and never joined by a replacement',
    edited.foodAndBev.length === 9 && edited.foodAndBev[0].meal === 'Late Breakfast'
      && edited.foodAndBev[0].start === '10:30',
    JSON.stringify(edited.foodAndBev[0])
  );

  const trimmed = structuredClone(fresh);
  trimmed.foodAndBev = trimmed.foodAndBev.filter((row) => row.date !== '2026-11-15');
  seedForDates(trimmed);
  check(
    'a day trimmed by hand stays trimmed — nothing is resurrected',
    trimmed.foodAndBev.length === 6,
    `${trimmed.foodAndBev.length} meals after re-seeding a day that was cleared`
  );

  const narrowed = structuredClone(fresh);
  narrowed.meta.endDate = '2026-11-15';
  seedForDates(narrowed);
  check(
    'narrowing the range deletes nothing — §12.9 reports it, this does not remove it',
    narrowed.foodAndBev.length === 9,
    `${narrowed.foodAndBev.length} meals after narrowing`
  );

  narrowed.meta.endDate = '2026-11-16';
  seedForDates(narrowed);
  check(
    'and widening it again brings nothing back twice',
    narrowed.foodAndBev.length === 9,
    `${narrowed.foodAndBev.length} meals after widening again`
  );

  const front = structuredClone(fresh);
  front.meta.startDate = '2026-11-13';
  seedForDates(front);
  check(
    'a day added to the front of an event lands at the front, not on the end',
    front.foodAndBev.slice(0, 3).every((row) => row.date === '2026-11-13')
      && front.foodAndBev.length === 12,
    front.foodAndBev.map((row) => `${row.date.slice(5)} ${row.meal}`).join(' | ')
  );

  const old = { meta: { startDate: '2026-11-14', endDate: '2026-11-16' },
    foodAndBev: [{ id: 'f1', date: '2026-11-14', meal: 'Dinner' }], schedule: [] };
  markSeeded(old);
  seedForDates(old);
  check(
    'a file that predates seeding is marked, not seeded over',
    old.foodAndBev.length === 1 && old.seeded.meals.length === 3,
    `${old.foodAndBev.length} meals, ${old.seeded.meals.length} dates marked`
  );

  /* ------------------------------------------------- one guest, one room */

  const staying = event();

  check(
    'a guest already in a room over the same night is reported as a clash',
    overlappingAssignments(staying, 'a-dana', { from: N1, to: N2 }, 'r-new')
      .map((row) => `${row.building} ${row.room}`).join() === 'Mallard 3',
    JSON.stringify(overlappingAssignments(staying, 'a-dana', { from: N1, to: N2 }, 'r-new'))
  );

  check(
    'turnover is not a clash: two rooms on consecutive nights is ordinary',
    overlappingAssignments(staying, 'a-dana', { from: N2, to: '2026-11-15' }, 'r-2').length === 0,
    'the second night should clash with nothing but the row being filled'
  );

  check(
    'a row does not clash with itself',
    overlappingAssignments(staying, 'a-dana', { from: N1, to: N2 }, 'r-1').length === 0,
    'r-1 should be excluded by its own id'
  );

  check(
    'a guest with no room anywhere clashes with nothing',
    overlappingAssignments(staying, 'a-tom', { from: N1, to: '2026-11-16' }, '').length === 0,
    'Tom holds no room'
  );
}
