// Every shape this app has ever written still opens — BUILD-SPEC §5.
//
// The JSON file is the source of truth (§3), and files saved by earlier builds
// are on Brian's machine right now. Five generations of shape have been through
// this app, and `migrate()` is the one place any of them is answered:
//
//   pre-v4  a rooming row naming a guest by name
//   v4      a rooming row carrying one `guestId`
//   v5      a rooming row carrying a `guestIds` party
//   v7      `rooming` and `menu` sections, and rows with no `id`
//   v8      `menu[].courses[]`, `attendees` and `accommodations` sections, and
//           rooms in buildings the v9 registry no longer carries
//   v12     the three buildings v13 renamed — `Lodge Lower Suites` and
//           `Lodge Bunk Rooms` — and the locations v13 retired
//
// Each is checked here on the shape as it was actually written, not on a
// hand-tidied version of it, and the run is checked to be idempotent: a file
// may be opened, saved and opened again without drifting.
//
// The one rule worth stating outright, because it is the tempting thing to get
// wrong: a room that has left the registry is **reported and left alone**.
// Somebody is expecting that room. Remapping it to whichever new room seems
// closest would lose that quietly, and dropping the row would lose it
// completely — §12.6 goes on reporting it until a person moves the guest.

import { migrate } from '../../js/migrate.js';
import { sharesFreely } from '../../js/reference.js';

export const title = 'Migration — every shape this app has written still opens';

/** A file in the pre-v4 shape: guests by name, no ids anywhere. */
function preV4() {
  return {
    meta: { eventName: 'Old file', startDate: '2026-11-14', endDate: '2026-11-16' },
    sections: [
      { id: 's1', type: 'attendees', title: 'Attendee List', enabled: true },
      { id: 's2', type: 'rooming', title: 'Rooming Assignments', enabled: true },
      { id: 's3', type: 'menu', title: 'Menu', enabled: true }
    ],
    attendees: [
      { last: 'Illig', first: 'Brian', arrive: '2026-11-14', depart: '2026-11-16' },
      { last: 'Reyes', first: 'Dana', arrive: '2026-11-14', depart: '2026-11-15' }
    ],
    rooming: [
      { building: 'Lodge', room: "Brian's Suite", guest: 'Brian Illig',
        from: '2026-11-14', to: '2026-11-16' },
      { building: 'Lodge', room: 'Timber Suite', guest: 'Nobody By That Name',
        from: '2026-11-14', to: '2026-11-15' }
    ],
    schedule: [{ date: '2026-11-14', start: '05:00', end: '10:00', label: 'Duck Hunt' }],
    foodAndBev: [{ id: 'f1', date: '2026-11-14', start: '18:30', meal: 'Dinner',
      location: 'The Wheel', countBasis: 'present' }],
    menu: [{ fnbId: 'f1', courses: [
      { heading: 'Starters', items: ['Roasted Squash Soup', 'Wedge Salad'] },
      { heading: 'Mains', items: ['Tenderloin', 'Walleye'] },
      { heading: 'Dessert', items: ['Pecan Tart', 'Sorbet'] }
    ] }],
    staff: [], departments: [], buildingsInUse: ['Lodge']
  };
}

/** The same event as v4 wrote it: one `guestId` per row. */
function v4() {
  return {
    meta: { eventName: 'v4 file', startDate: '2026-11-14', endDate: '2026-11-16' },
    sections: [{ id: 's1', type: 'accommodations', title: 'Accommodations', enabled: true }],
    attendees: [{ id: 'a-1', last: 'Illig', first: 'Brian' }],
    rooming: [
      { building: 'Lodge', room: "Brian's Suite", guestId: 'a-1',
        from: '2026-11-14', to: '2026-11-16' },
      { building: 'Red Leaf Inn', room: null, guestId: null,
        from: '2026-11-14', to: '2026-11-16' }
    ],
    schedule: [], foodAndBev: [], menu: [], staff: [], departments: [], buildingsInUse: []
  };
}

export async function run({ check }) {
  /* ------------------------------------------------------------- pre-v4 */

  const old = migrate(preV4());
  const brian = old.event.attendees.find((guest) => guest.first === 'Brian');

  check(
    'pre-v4: a guest named on a rooming row is resolved to an id',
    old.event.rooming[0].guestIds.length === 1
      && old.event.rooming[0].guestIds[0] === brian.id
      && !('guest' in old.event.rooming[0])
      && old.summary.roomingRowsLinked === 1,
    JSON.stringify(old.event.rooming[0])
  );

  check(
    'pre-v4: a name that matches nobody keeps the name and the room',
    old.event.rooming[1].guest === 'Nobody By That Name'
      && old.event.rooming[1].guestIds.length === 0
      && old.summary.unresolvedRooming.length === 1,
    JSON.stringify(old.event.rooming[1])
  );

  check(
    'pre-v4: every row is given an id, and every attendee',
    old.event.rooming.every((row) => Boolean(row.id))
      && old.event.attendees.every((guest) => Boolean(guest.id))
      && old.summary.attendeeIdsAdded === 2,
    `${old.summary.rowIdsAdded} row ids, ${old.summary.attendeeIdsAdded} attendee ids`
  );

  /* ----------------------------------------------------------------- v7 */

  check(
    'v7: a `rooming` section becomes `guests`, and a `menu` section is dropped',
    old.event.sections.map((entry) => entry.type).join(',') === 'guests'
      && old.event.sections[0].title === 'Guests',
    old.event.sections.map((entry) => `${entry.type}:${entry.title}`).join(' | ')
  );

  /* ----------------------------------------------------------------- v4 */

  const four = migrate(v4());
  check(
    'v4: one `guestId` becomes a party of one, and a null one an empty party',
    four.event.rooming[0].guestIds.join() === 'a-1'
      && four.event.rooming[1].guestIds.length === 0
      && four.event.rooming.every((row) => !('guestId' in row))
      && four.summary.roomingRowsWidened === 2,
    JSON.stringify(four.event.rooming)
  );

  check(
    'v4: a lone `accommodations` section becomes the `guests` section',
    four.event.sections.length === 1 && four.event.sections[0].type === 'guests',
    JSON.stringify(four.event.sections)
  );

  /* ----------------------------------------------------------------- v5 */

  const v5 = migrate({
    meta: {}, sections: [],
    attendees: [{ id: 'a-1', first: 'Nora', last: 'Illig' }, { id: 'a-2', first: 'Charlie', last: 'Illig' }],
    rooming: [{ id: 'r-1', building: 'Lodge', room: 'Bunk Room', guestIds: ['a-1', 'a-2'],
      from: '2026-11-14', to: '2026-11-16' }],
    schedule: [], foodAndBev: [], menu: [], staff: [], departments: [], buildingsInUse: []
  });
  check(
    'v5: a party of two is left exactly as it was',
    v5.event.rooming[0].guestIds.join() === 'a-1,a-2' && v5.summary.roomingRowsWidened === 0,
    JSON.stringify(v5.event.rooming[0])
  );

  /* ----------------------------------------------------------------- v8 */

  check(
    'v8: three courses of two dishes become one list of six, in order',
    old.event.menu[0].dishes.join(' | ')
      === 'Roasted Squash Soup | Wedge Salad | Tenderloin | Walleye | Pecan Tart | Sorbet'
      && !('courses' in old.event.menu[0])
      && old.summary.menusFlattened === 1,
    JSON.stringify(old.event.menu[0])
  );

  check(
    'v8: `attendees` and `accommodations` together become one `guests` section, in place',
    (() => {
      const both = migrate({
        meta: {}, sections: [
          { id: 's1', type: 'schedule', title: 'Event Schedule', enabled: true },
          { id: 's2', type: 'attendees', title: 'Attendee List', enabled: true },
          { id: 's3', type: 'accommodations', title: 'Accommodations', enabled: true },
          { id: 's4', type: 'freeText', title: 'Notes', enabled: true, body: '' }
        ],
        attendees: [], rooming: [], schedule: [], foodAndBev: [], menu: [], staff: [],
        departments: [], buildingsInUse: []
      });
      return both.event.sections.map((entry) => entry.type).join(',')
        === 'schedule,guests,freeText'
        && both.summary.sectionsRetyped === 1 && both.summary.sectionsDropped === 1;
    })(),
    'the pair should collapse to one section in the first one\'s position'
  );

  check(
    'v9: a room in a building the registry has retired keeps its building and room',
    old.event.rooming[0].building === 'Lodge'
      && old.event.rooming[0].room === "Brian's Suite"
      && old.summary.retiredRooms.some((entry) => entry.building === 'Lodge'
        && entry.room === "Brian's Suite" && entry.reason === 'building'),
    JSON.stringify(old.summary.retiredRooms)
  );

  check(
    'v9: a room number a building no longer has is reported as the room, not the building',
    (() => {
      const gone = migrate({
        meta: {}, sections: [], attendees: [],
        rooming: [{ id: 'r-1', building: 'RLI', room: '99', guestIds: [],
          from: '2026-11-14', to: '2026-11-15' }],
        schedule: [], foodAndBev: [], menu: [], staff: [], departments: [], buildingsInUse: []
      });
      return gone.summary.retiredRooms.length === 1
        && gone.summary.retiredRooms[0].reason === 'room'
        && gone.event.rooming[0].room === '99';
    })(),
    'RLI 99 should be reported by room and left on the row'
  );

  /* ---------------------------------------------------------------- v13 */

  /**
   * A v12 file: the two Lodge buildings under their old names, one suite the
   * registry never had, a retired location, and the buildings-in-use list that
   * carries a building name and no room to place it by.
   */
  const v12 = () => ({
    meta: { eventName: 'v12 file', startDate: '2026-11-14', endDate: '2026-11-16' },
    sections: [],
    attendees: [{ id: 'a-1', first: 'Dana', last: 'Reyes' }],
    rooming: [
      { id: 'r-1', building: 'Lodge Lower Suites', room: 'Timber', guestIds: ['a-1'],
        from: '2026-11-14', to: '2026-11-16' },
      { id: 'r-2', building: 'Lodge Bunk Rooms', room: 'Bunk Room', guestIds: [],
        from: '2026-11-14', to: '2026-11-16' },
      // A suite this property never had. Rule 13 keys on the room, so this one
      // is not renamed — it falls through to rule 11 and stays as authored.
      { id: 'r-3', building: 'Lodge Lower Suites', room: 'Cedar', guestIds: [],
        from: '2026-11-14', to: '2026-11-16' }
    ],
    schedule: [],
    foodAndBev: [{ id: 'f-1', date: '2026-11-15', start: '17:00', meal: 'Cocktails',
      location: 'Hummer Bar', countBasis: 'present', serves: 'adults' }],
    menu: [], staff: [], departments: [],
    buildingsInUse: ['Lodge Lower Suites', 'Lodge Bunk Rooms'],
    overflowBuildings: []
  });

  const thirteen = migrate(v12());

  check(
    'v13: a Lodge suite is renamed by its room — the one part that is unambiguous',
    thirteen.event.rooming[0].building === 'Timber'
      && thirteen.event.rooming[0].room === 'Timber'
      && thirteen.event.rooming[0].guestIds.join() === 'a-1',
    JSON.stringify(thirteen.event.rooming[0])
  );

  check(
    'v13: the Bunk Room is renamed the same way, and keeps sharesFreely by its new name',
    thirteen.event.rooming[1].building === 'Bunk Room'
      && thirteen.event.rooming[1].room === 'Bunk Room'
      && sharesFreely(thirteen.event.rooming[1].building),
    JSON.stringify(thirteen.event.rooming[1])
  );

  check(
    'v13: a retired building with a room it never held is LEFT ALONE and reported',
    thirteen.event.rooming[2].building === 'Lodge Lower Suites'
      && thirteen.event.rooming[2].room === 'Cedar'
      && thirteen.summary.retiredRooms.some((entry) => entry.room === 'Cedar'),
    JSON.stringify(thirteen.summary.retiredRooms)
  );

  check(
    'v13: the three renames are reported in the migration summary',
    thirteen.summary.buildingsRenamed.filter((entry) => entry.room).length === 2
      && thirteen.summary.buildingsRenamed.some((entry) => entry.to === 'Timber')
      && thirteen.summary.buildingsRenamed.some((entry) => entry.to === 'Bunk Room'),
    JSON.stringify(thirteen.summary.buildingsRenamed)
  );

  check(
    'v13: a buildings-in-use entry with no room is narrowed by what the event uses',
    thirteen.event.buildingsInUse.join(',') === 'Timber,Bunk Room',
    thirteen.event.buildingsInUse.join(',')
  );

  check(
    'v13: "Lodge Lower Suites" with nothing to narrow it by names both suites',
    (() => {
      const bare = migrate({
        meta: {}, sections: [], attendees: [], rooming: [], schedule: [], foodAndBev: [],
        menu: [], staff: [], departments: [],
        buildingsInUse: ['Lodge Lower Suites'], overflowBuildings: []
      });
      return bare.event.buildingsInUse.join(',') === 'Timber,Wetland';
    })(),
    'the entry named the lower suites, and both of them is the closest true statement'
  );

  check(
    'v13: a retired LOCATION is kept as free text and reported, never rewritten',
    thirteen.event.foodAndBev[0].location === 'Hummer Bar'
      && thirteen.summary.retiredLocations.length === 1
      && thirteen.summary.retiredLocations[0].location === 'Hummer Bar',
    JSON.stringify(thirteen.summary.retiredLocations)
  );

  check(
    'v13: the whole rename is idempotent — a second run changes nothing',
    (() => {
      const again = migrate(structuredClone(thirteen.event));
      return again.summary.changed === false
        && again.summary.buildingsRenamed.length === 0
        && JSON.stringify(again.event) === JSON.stringify(thirteen.event);
    })(),
    'a renamed file must migrate to itself'
  );

  /* --------------------------------------------------------- idempotence */

  const twice = migrate(structuredClone(old.event));
  check(
    'a migrated file migrates again to itself, and reports no second change',
    twice.summary.changed === false
      && JSON.stringify(twice.event) === JSON.stringify(old.event),
    'the second run should be a no-op'
  );

  check(
    'the v9 fields are filled in without being counted as a migration',
    twice.event.overflowBuildings.length === 0
      && twice.event.meta.includeInOrder.rooming === false
      && twice.event.meta.includeInOrder.menu === false,
    JSON.stringify(twice.event.meta.includeInOrder)
  );

  check(
    'migrate never touches the object it is handed',
    (() => {
      const source = preV4();
      const before = JSON.stringify(source);
      migrate(source);
      return JSON.stringify(source) === before;
    })(),
    'the caller\'s event was mutated'
  );
}
