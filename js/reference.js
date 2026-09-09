// Static reference data — BUILD-SPEC §6.
// Property facts, not event data. Never written to the event JSON.
// Constants and pure lookups over them: no DOM, no state, no imports.

/** Buildings on property. BUILD-SPEC §6. */
export const BUILDINGS = [
  'Red Leaf Inn',
  'The Wheel',
  'Bucket Shop',
  'Lodge',
  'Wood Shop',
  'MRSO',
  'Dock / Boathouse',
  'Hummer Bar',
  'Food Plot',
  'Lake',
  'Cottage'
];

/** Short forms, where one is in use. */
export const BUILDING_ABBREVIATIONS = {
  'Red Leaf Inn': 'RLI'
};

/**
 * [v3] Building assignment modes. BUILD-SPEC §6.
 *
 *   `named`  — room-level assignment. `rooming[].room` is required, and the
 *              room grid is drawn in the editor and the render.
 *   `pooled` — assignment is to the building only. `rooming[].room` is null;
 *              "in RLI" is all the detail the document needs.
 *
 * Buildings absent from this map are non-lodging and take no assignments.
 * Red Leaf Inn is pooled because it is backup overflow on the private side; its
 * room inventory is kept below so the mode can be flipped if that ever changes.
 */
export const BUILDING_ASSIGNMENT_MODES = {
  'Lodge': 'named',
  'Red Leaf Inn': 'pooled'
};

/** Mode reported for a building that takes no assignments at all. */
export const ASSIGNMENT_MODE_NONE = 'none';

/**
 * A building's assignment mode. BUILD-SPEC §6 [v3].
 *
 * @param {string} building name as stored on a rooming row
 * @returns {'named'|'pooled'|'none'} `none` for non-lodging or unknown buildings
 */
export function assignmentModeFor(building) {
  return Object.hasOwn(BUILDING_ASSIGNMENT_MODES, building)
    ? BUILDING_ASSIGNMENT_MODES[building]
    : ASSIGNMENT_MODE_NONE;
}

// Red Leaf Inn room inventory. Room numbers are strings to match rooming[].room.
// `suite` is the suite label where one applies, otherwise null.

/** Red Leaf Inn — king rooms. BUILD-SPEC §6. */
export const RED_LEAF_INN_KING_ROOMS = [
  { room: '2',  suite: null },
  { room: '4',  suite: null },
  { room: '6',  suite: null },
  { room: '8',  suite: 'Exec Suite' },
  { room: '10', suite: null },
  { room: '12', suite: null },
  { room: '14', suite: null },
  { room: '16', suite: null },
  { room: '18', suite: null },
  { room: '20', suite: 'Exec Suite' },
  { room: '22', suite: null },
  { room: '24', suite: null }
];

/** Red Leaf Inn — double queen rooms. BUILD-SPEC §6. */
export const RED_LEAF_INN_DOUBLE_QUEEN_ROOMS = [
  { room: '1',  suite: null },
  { room: '3',  suite: null },
  { room: '5',  suite: null },
  { room: '7',  suite: null },
  { room: '9',  suite: null },
  { room: '11', suite: 'Suite' },
  { room: '13', suite: null },
  { room: '15', suite: null },
  { room: '17', suite: null },
  { room: '19', suite: null },
  { room: '21', suite: null },
  { room: '23', suite: 'Suite' }
];

/** Every Red Leaf Inn room, carrying its bedding type. */
export const RED_LEAF_INN_ROOMS = [
  ...RED_LEAF_INN_KING_ROOMS.map((r) => ({ ...r, bedding: 'King' })),
  ...RED_LEAF_INN_DOUBLE_QUEEN_ROOMS.map((r) => ({ ...r, bedding: 'Double Queen' }))
];

/** Lodge rooms. BUILD-SPEC §6. */
export const LODGE_ROOMS = [
  { room: 'Master Suite',          suite: 'Suite' },
  { room: "Brian's Suite",         suite: 'Suite' },
  { room: "Michael's Suite",       suite: 'Suite' },
  { room: 'Timber Suite',          suite: 'Suite' },
  { room: 'Wetland Suite',         suite: 'Suite' },
  { room: 'Basement Office Suite', suite: 'Suite' },
  { room: 'Upland Suite',          suite: 'Suite' },
  { room: 'Bunk Room',             suite: null }
];

/**
 * Room inventory keyed by building. Buildings with no lodging are absent.
 * Red Leaf Inn's rooms are retained but unused while it is `pooled` (§6 [v3]).
 */
export const ROOMS_BY_BUILDING = {
  'Red Leaf Inn': RED_LEAF_INN_ROOMS,
  'Lodge': LODGE_ROOMS
};

/** Schedule label autocomplete. Free text is always allowed. BUILD-SPEC §6. */
export const SCHEDULE_LABEL_SUGGESTIONS = [
  'Duck Hunt',
  'Upland Hunt',
  'Deer Hunt',
  'Downtime',
  'Breakfast',
  'Lunch',
  'Dinner',
  'Cocktails',
  'Happy Hour',
  'Guest Arrival',
  'Guest Departure',
  'Range',
  'Skeet'
];

/** F&B count bases. BUILD-SPEC §5 (v2 changes). */
export const COUNT_BASES = ['present', 'overnight', 'custom'];

/** Staff dayparts. BUILD-SPEC §5 staff[]. */
export const DAYPARTS = ['AM', 'PM'];

/** Section types. BUILD-SPEC §4. */
export const SECTION_TYPES = [
  'attendees',
  'rooming',
  'schedule',
  'foodAndBev',
  'menu',
  'staff',
  'departments',
  'freeText'
];
