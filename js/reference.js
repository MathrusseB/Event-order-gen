// Static reference data — BUILD-SPEC §6.
// Property facts, not event data. Never written to the event JSON.
// Constants and pure lookups over them: no DOM, no state, no imports.

/**
 * [v9] The property's lodging, in display order. BUILD-SPEC §6.
 *
 * The order is the order these get used in — least-assigned first — so the
 * building somebody reaches for is the building at the top of the list, and the
 * room grid reads the way the property fills up.
 *
 * v3's registry was the Lodge's named suites and a pooled Red Leaf Inn, and
 * both were wrong for the private side. Master, Brian's, Michael's and Upland
 * are gone; the Lodge is here as the two groups that are actually assigned, its
 * bunk rooms and its two lower suites. The Clubhouse King Suite is a building
 * of its own because it is assigned on its own — a master suite down the hall
 * from the six Clubhouse rooms, rarely used but real.
 */
export const LODGING_BUILDINGS = [
  'Remington',
  'Winchester',
  'Mallard',
  'Wigeon',
  'Pintail',
  'Lodge Bunk Rooms',
  'Lodge Lower Suites',
  'RLI',
  'Clubhouse',
  'Clubhouse King Suite'
];

/**
 * Buildings that take no assignments and appear as locations. BUILD-SPEC §6.
 *
 * [v9] "Lodge" and "Red Leaf Inn" are not among them any more: the lodging
 * registry above names their parts, and a location called "Lodge" beside two
 * buildings called "Lodge Bunk Rooms" and "Lodge Lower Suites" is the kind of
 * near-duplicate a coordinator picks wrongly once and then distrusts for ever.
 */
export const VENUE_BUILDINGS = [
  'The Wheel',
  'Bucket Shop',
  'Wood Shop',
  'MRSO',
  'Dock / Boathouse',
  'Hummer Bar',
  'Food Plot',
  'Lake',
  'Cottage'
];

/** Every building on property, lodging first. BUILD-SPEC §6. */
export const BUILDINGS = [...LODGING_BUILDINGS, ...VENUE_BUILDINGS];

/**
 * [v3] Building assignment modes. BUILD-SPEC §6.
 *
 *   `named`  — room-level assignment. `rooming[].room` is required, and the
 *              room grid is drawn in the editor and the render.
 *   `pooled` — assignment is to the building only. `rooming[].room` is null.
 *
 * Buildings absent from this map are non-lodging and take no assignments.
 *
 * [v9] Every lodging building is `named`. RLI was pooled from v3 on the
 * grounds that "anywhere in RLI" was detail enough; testing said otherwise —
 * when RLI is in use, staff need the room number to know which room to service.
 * `pooled` is kept here, in `roomKeyOf`, in the renders and in §12.6 because it
 * costs nothing and the concept may return; nothing currently uses it.
 */
export const BUILDING_ASSIGNMENT_MODES = Object.fromEntries(
  LODGING_BUILDINGS.map((building) => [building, 'named'])
);

/** Mode reported for a building that takes no assignments at all. */
export const ASSIGNMENT_MODE_NONE = 'none';

/**
 * [v12] Rooms built to be shared. BUILD-SPEC §6 [v12].
 *
 * True for the Lodge Bunk Rooms and nothing else. It is **not** capacity —
 * nothing here models capacity (§5, v5 changes) — and it changes nothing about
 * how a room is assigned, printed, or counted. It says one thing: two separate
 * parties in that room on the same night is the normal use of it.
 *
 * §12.4 is the only reader. "Same named room claimed on the same night by two
 * separate rooming rows" is a warning on a suite and a fact of life in a room
 * that sleeps twelve, so the Bunk Room gets a note naming who else is in there
 * and every other room gets the warning. A second room built the same way would
 * be added here; there is nothing to compute it from.
 */
export const BUILDING_SHARES_FREELY = {
  'Lodge Bunk Rooms': true
};

/**
 * [v12] Whether a building's rooms are shared by unrelated parties as a matter
 * of course. BUILD-SPEC §6 [v12].
 *
 * @param {string} building name as stored on a rooming row
 * @returns {boolean} false for every building but the Lodge Bunk Rooms
 */
export function sharesFreely(building) {
  return Object.hasOwn(BUILDING_SHARES_FREELY, building)
    && BUILDING_SHARES_FREELY[building] === true;
}

/**
 * A building's assignment mode. BUILD-SPEC §6 [v3].
 *
 * @param {string} building name as stored on a rooming row
 * @returns {'named'|'pooled'|'none'} `none` for non-lodging or unknown
 *   buildings — including a room in a building this registry no longer carries,
 *   which is left exactly as it was authored (§12.6 reports it)
 */
export function assignmentModeFor(building) {
  return Object.hasOwn(BUILDING_ASSIGNMENT_MODES, building)
    ? BUILDING_ASSIGNMENT_MODES[building]
    : ASSIGNMENT_MODE_NONE;
}

/**
 * Rooms 1..n as strings, which is how `rooming[].room` stores them.
 *
 * Numbers as strings deliberately: a room label is an identifier, not a
 * quantity. Nothing sorts or arithmetics on it, and "8" beside "Bunk Room" in
 * the same field would otherwise be two types in one column.
 */
function numbered(count) {
  return Array.from({ length: count }, (_, index) => String(index + 1));
}

/**
 * [v9] Room inventory by building. BUILD-SPEC §6.
 *
 * Plain strings, in the order they hang on the board. Buildings with no lodging
 * are absent.
 *
 * [v5] Bedding is not stored — even rooms are kings, odd rooms are double
 * queens, and everyone at the ranch knows it. Nothing here models capacity
 * either: the Bunk Room sleeps twelve and the King Suite sleeps two, and both
 * are one room holding a party of whatever size (§5, v5 changes).
 */
export const ROOMS_BY_BUILDING = {
  'Remington': numbered(4),
  'Winchester': numbered(4),
  'Mallard': numbered(8),
  'Wigeon': numbered(8),
  'Pintail': numbered(8),
  'Lodge Bunk Rooms': ['Bunk Room'],
  'Lodge Lower Suites': ['Timber', 'Wetland'],
  'RLI': numbered(24),
  'Clubhouse': numbered(6),
  'Clubhouse King Suite': ['King Suite']
};

/** The rooms a building holds, always an array. */
export function roomsIn(building) {
  return ROOMS_BY_BUILDING[building] || [];
}

/**
 * [v10] Where a meal happens. BUILD-SPEC §6 [v10].
 *
 * Three places and Other, because the meals happen in the same few rooms.
 * `location` stays one string in the file whichever way it was chosen: nothing
 * downstream needs to know that "The Wheel" came from a list and "Food Plot"
 * was typed, and storing the difference would be a second field to keep in step
 * with the first.
 */
export const MEAL_LOCATIONS = ['The Wheel', 'The Clubhouse', 'The Lodge'];

/** The value the location and activity selects use for their free-text option. */
export const OTHER_OPTION = '__other__';

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
 * Section types, in the order they are offered. BUILD-SPEC §4.
 *
 * [v7] `rooming` and `menu` are not here: each is its own document, always
 * generated, never a section of the event order (§4, §8). [v9] Either can be
 * appended to the order through `meta.includeInOrder`, which is a flag on the
 * event and still not a section.
 *
 * [v9] `guests` replaces `attendees` and `accommodations`.
 */
export const SECTION_TYPES = [
  'schedule',
  'guests',
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
