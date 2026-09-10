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
//
// [v5] Bedding is not stored. Even rooms are kings and odd rooms are double
// queens — property knowledge everyone at the ranch already has, which belongs
// in neither the room titles nor the data (BUILD-SPEC §6). Nothing here models
// room capacity: a rooming row names the party a room is known by, never a head
// count (§5, v5 changes).

/** Red Leaf Inn rooms, 1 through 24. Retained but unused while pooled. §6. */
export const RED_LEAF_INN_ROOMS = [
  { room: '1',  suite: null },
  { room: '2',  suite: null },
  { room: '3',  suite: null },
  { room: '4',  suite: null },
  { room: '5',  suite: null },
  { room: '6',  suite: null },
  { room: '7',  suite: null },
  { room: '8',  suite: 'Exec Suite' },
  { room: '9',  suite: null },
  { room: '10', suite: null },
  { room: '11', suite: 'Suite' },
  { room: '12', suite: null },
  { room: '13', suite: null },
  { room: '14', suite: null },
  { room: '15', suite: null },
  { room: '16', suite: null },
  { room: '17', suite: null },
  { room: '18', suite: null },
  { room: '19', suite: null },
  { room: '20', suite: 'Exec Suite' },
  { room: '21', suite: null },
  { room: '22', suite: null },
  { room: '23', suite: 'Suite' },
  { room: '24', suite: null }
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

/** F&B count bases — which dates qualify. BUILD-SPEC §5 (v2 changes). */
export const COUNT_BASES = ['present', 'overnight', 'custom'];

/**
 * [v5] F&B `serves` — which people qualify. BUILD-SPEC §5 (v5 changes).
 * Independent of the count basis: the two compose.
 */
export const SERVES_OPTIONS = ['all', 'adults', 'children', 'custom'];

/** Staff dayparts. BUILD-SPEC §5 staff[]. */
export const DAYPARTS = ['AM', 'PM'];

/**
 * Section types. BUILD-SPEC §4.
 *
 * [v7] `rooming` and `menu` are not here: each is its own document, always
 * generated, never a section of the event order (§4, §8). What the order
 * carries of the rooming data is `accommodations`, the per-night summary.
 */
export const SECTION_TYPES = [
  'attendees',
  'accommodations',
  'schedule',
  'foodAndBev',
  'staff',
  'departments',
  'freeText'
];

/**
 * [v8] Brand registry. BUILD-SPEC §6.
 *
 * The ranch hosts groups that are not the ranch, and the paperwork handed to a
 * group should identify the group. `meta.brandId` holds one of these ids; the
 * event JSON never carries the name or the logo path, which are property data
 * and live here.
 *
 * `ratio` is the logo's own width/height, recorded so the print stylesheet can
 * be reasoned about rather than guessed at: these five span a factor of four,
 * from a 3.48:1 wordmark to a 0.83:1 portrait crest. Nothing reads it at
 * runtime — each logo is fitted into one fixed box (§6, §10) so the running
 * header keeps the same height whichever brand an event carries.
 */
export const BRANDS = [
  { id: 'maple-ranch',    name: 'Maple Ranch',    logo: 'logos/maple-ranch.png',    ratio: 3.48 },
  { id: 'bloody-feather', name: 'Bloody Feather', logo: 'logos/bloody-feather.png', ratio: 2.29 },
  { id: 'rnt',            name: 'RNT',            logo: 'logos/rnt.png',            ratio: 2.72 },
  { id: 'kuiu',           name: 'KUIU',           logo: 'logos/kuiu.png',           ratio: 1.18 },
  { id: 'navy-seals',     name: 'Navy SEALs',     logo: 'logos/navy-seals.png',     ratio: 0.83 }
];

/**
 * [v8] The default brand, and the fallback for an id matching no entry.
 *
 * Also the Menu's brand, always. BUILD-SPEC §5 (v8 changes): the Event Order
 * and the Rooming Assignment carry the event's brand, but the menu is the
 * ranch's culinary product and not the visiting group's, so it carries this one
 * whatever the event says. That asymmetry is deliberate — the spec asks that it
 * not be "fixed" into consistency — which is why the Menu render reaches for a
 * named constant rather than for whatever `meta.brandId` happens to hold.
 */
export const DEFAULT_BRAND_ID = 'maple-ranch';

/** [v8] The Menu's brand. Named separately from the default so the two can be read apart. */
export const MENU_BRAND_ID = DEFAULT_BRAND_ID;

/**
 * [v8] The brand an id names. BUILD-SPEC §6.
 *
 * Never null: an absent, empty, or unrecognised id resolves to Maple Ranch,
 * because a document with no identity on it is a worse outcome than a document
 * carrying the wrong one — and the wrong one here is the ranch's own, which is
 * where every event was branded before v8 anyway.
 *
 * @param {string} id `meta.brandId`
 * @returns {{id: string, name: string, logo: string, ratio: number}}
 */
export function brandFor(id) {
  return BRANDS.find((brand) => brand.id === id)
    || BRANDS.find((brand) => brand.id === DEFAULT_BRAND_ID);
}
