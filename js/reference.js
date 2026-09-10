// Static reference data — BUILD-SPEC §6.
// Property facts, not event data. Never written to the event JSON.
// Constants and pure lookups over them: no DOM, no state, no imports.
//
// [v13] THIS FILE WAS WRONG, AND THE WAY IT WAS WRONG IS WORTH KEEPING AT THE
// TOP OF IT. The non-lodging list v9 carried — Bucket Shop, Wood Shop, MRSO,
// Dock / Boathouse, Hummer Bar, Food Plot, Cottage — was transcribed from the
// events department's Loch Lloyd order and never checked against the private
// side. None of those is a private-side location. MRSO is the staff offices;
// the Food Plot is a snack nook in an RLI hallway; the Wood Shop and the Hummer
// Bar are corporate-event spaces; the Bucket Shop is a gift shop whose hours
// belong in a note; and there is no building called Cottage — Mallard, Wigeon
// and Pintail *are* the cottages.
//
// The structure came from a reference document, and taking the structure was
// right. Taking the contents was not: **a reference document is not a property
// inventory.** Anything else in this app lifted from that order is suspect for
// the same reason, and the next thing added here gets asked about rather than
// copied.

/**
 * [v13] The property's lodging, in five groups. BUILD-SPEC §6 [v13].
 *
 * The group is property data, not a layout hint that drifted into the model: a
 * building belongs to exactly one, and every surface that lists buildings can
 * read it. The building picker is why it is here — a two-column grid over a
 * flat list of eleven puts Pintail next to a Lodge room and cuts the cabins in
 * half, and a coordinator looking for "the cottages" finds them in two pieces.
 * Each group lays out on its own instead (§5, v13 changes).
 *
 * Order is the order these get used in — least-assigned first — group by group,
 * so the building somebody reaches for is near the top of the list and the room
 * grid reads the way the property fills up.
 *
 * [v13] The Lodge is three buildings of one room each, named as the rooms are:
 * nobody says "the Lodge Lower Suites Timber", they say "the Timber". A
 * single-room building is how a room assigned on its own is modelled here, and
 * the Clubhouse King Suite has been one since v9.
 */
export const LODGING_GROUPS = [
  { name: 'Cabins', buildings: ['Remington', 'Winchester'] },
  { name: 'Cottages', buildings: ['Mallard', 'Wigeon', 'Pintail'] },
  { name: 'Lodge', buildings: ['Bunk Room', 'Timber', 'Wetland'] },
  { name: 'RLI', buildings: ['RLI'] },
  { name: 'Clubhouse', buildings: ['Clubhouse', 'Clubhouse King Suite'] }
];

/** Every lodging building, in display order. BUILD-SPEC §6. */
export const LODGING_BUILDINGS = LODGING_GROUPS.flatMap((group) => group.buildings);

/**
 * [v13] Every building on property. The same eleven.
 *
 * v9's `BUILDINGS` was the lodging list plus a list of non-lodging "buildings"
 * that turned out not to be buildings (see the head of this file). There is
 * nothing left to add: a place that takes no assignment is a location, and the
 * locations are `MEAL_LOCATIONS` below.
 */
export const BUILDINGS = LODGING_BUILDINGS;

/**
 * [v13] The group a building belongs to. BUILD-SPEC §6 [v13].
 *
 * @param {string} building name as stored on a rooming row or a buildings list
 * @returns {string} empty for a building this registry does not carry
 */
export function groupOf(building) {
  const found = LODGING_GROUPS.find((group) => group.buildings.includes(building));
  return found ? found.name : '';
}

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
 * True for the Bunk Room and nothing else. It is **not** capacity — nothing
 * here models capacity (§5, v5 changes) — and it changes nothing about how a
 * room is assigned, printed, or counted. It says one thing: two separate
 * parties in that room on the same night is the normal use of it.
 *
 * §12.4 is the only reader. "Same named room claimed on the same night by two
 * separate rooming rows" is a warning on a suite and a fact of life in a room
 * that sleeps twelve, so the Bunk Room gets a note naming who else is in there
 * and every other room gets the warning. A second room built the same way would
 * be added here; there is nothing to compute it from.
 *
 * [v13] Keyed by the building's own name, now that the building is called what
 * the room is called. The flag follows the room, never the retired name.
 */
export const BUILDING_SHARES_FREELY = {
  'Bunk Room': true
};

/**
 * [v12] Whether a building's rooms are shared by unrelated parties as a matter
 * of course. BUILD-SPEC §6 [v12].
 *
 * @param {string} building name as stored on a rooming row
 * @returns {boolean} false for every building but the Bunk Room
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
 * [v13] Room inventory by building. BUILD-SPEC §6.
 *
 * Plain strings, in the order they hang on the board. Buildings with no lodging
 * are absent.
 *
 * A single-room building still carries its room: every building is `named`
 * (above), §12.6 warns on a named building with no room set, and the grid has
 * to have something to draw. So the Timber holds the Timber.
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
  'Bunk Room': ['Bunk Room'],
  'Timber': ['Timber'],
  'Wetland': ['Wetland'],
  'RLI': numbered(24),
  'Clubhouse': numbered(6),
  'Clubhouse King Suite': ['King Suite']
};

/** The rooms a building holds, always an array. */
export function roomsIn(building) {
  return ROOMS_BY_BUILDING[building] || [];
}

/**
 * [v13] Buildings this registry has renamed, and how a file's old name is read
 * back. BUILD-SPEC §6 [v13].
 *
 * `migrate()` is the only caller. A rooming row is migrated **by its room**,
 * which is the part that is unambiguous: "Lodge Lower Suites" alone could be
 * either suite, and `Lodge Lower Suites` + `Timber` can only be the Timber. A
 * row naming a retired building and a room it never held is not guessed at — it
 * is left exactly as it was authored and §12.6 reports it, which is the v9 rule
 * and is unchanged.
 */
export const RENAMED_BUILDINGS = [
  { building: 'Lodge Lower Suites', room: 'Timber', becomes: 'Timber' },
  { building: 'Lodge Lower Suites', room: 'Wetland', becomes: 'Wetland' },
  { building: 'Lodge Bunk Rooms', room: 'Bunk Room', becomes: 'Bunk Room' }
];

/**
 * [v13] The building a retired name and room resolve to. BUILD-SPEC §6 [v13].
 *
 * @param {string} building the name as the file carries it
 * @param {string} room the room as the file carries it
 * @returns {string} empty when this is not a rename this registry knows —
 *   a current building included, which is what keeps the migration idempotent
 */
export function renamedBuilding(building, room) {
  const from = String(building || '');
  const which = String(room === null || room === undefined ? '' : room);
  const found = RENAMED_BUILDINGS.find((entry) =>
    entry.building === from && entry.room === which);
  return found ? found.becomes : '';
}

/**
 * [v13] The buildings a retired building name could have meant, for a list that
 * carries no room to disambiguate it — `buildingsInUse[]`, `overflowBuildings[]`.
 *
 * "Lodge Bunk Rooms" can only have meant the Bunk Room. "Lodge Lower Suites"
 * meant one suite or both, and the list has nothing on it that says which; the
 * caller narrows it by what the event's rooming rows actually use, and falls
 * back to both, because "the lower suites are in use" named both of them.
 *
 * @param {string} building
 * @returns {string[]} empty when this registry has not renamed that name
 */
export function renamedBuildingsFor(building) {
  const from = String(building || '');
  return RENAMED_BUILDINGS.filter((entry) => entry.building === from)
    .map((entry) => entry.becomes);
}

/**
 * [v13] Where a meal or an activity happens. BUILD-SPEC §6 [v13].
 *
 * Four places and Other, because it happens in the same few places. `location`
 * stays one string in the file whichever way it was chosen: nothing downstream
 * needs to know that "The Wheel" came from a list and "the north blind" was
 * typed, and storing the difference would be a second field to keep in step
 * with the first.
 *
 * The Clubhouse and the Lodge are on this list and in the lodging registry
 * above. Ordinary, and not a duplication to resolve: a building can be a bed
 * and a dining room in the same weekend. Lake / Dock is one place rather than
 * the two v9 carried, and it is here because fishing gets planned.
 */
export const MEAL_LOCATIONS = ['The Wheel', 'The Clubhouse', 'The Lodge', 'Lake / Dock'];

/**
 * [v13] Locations this registry used to carry and does not. BUILD-SPEC §6 [v13].
 *
 * §12.13 is the only reader, and this list is the reason that rule can exist at
 * all. `location` is free text (`MEAL_LOCATIONS` above): "the north blind"
 * typed into a meal is a perfectly good location, so a rule reading "not in the
 * list" would fire on every deliberate one and teach the coordinator to stop
 * reading the panel. These eight are different — this app offered them, they
 * are on rows somebody authored in good faith, and they are the ones worth
 * saying something about.
 *
 * `becomes` is the current location covering the same ground, where there is
 * one. Nothing is rewritten: the row keeps the words it was authored with, and
 * the finding suggests rather than repairs.
 */
export const RETIRED_LOCATIONS = [
  { name: 'Lake', becomes: 'Lake / Dock' },
  { name: 'Dock / Boathouse', becomes: 'Lake / Dock' },
  { name: 'Bucket Shop', becomes: '' },
  { name: 'Wood Shop', becomes: '' },
  { name: 'MRSO', becomes: '' },
  { name: 'Hummer Bar', becomes: '' },
  { name: 'Food Plot', becomes: '' },
  { name: 'Cottage', becomes: '' }
];

/**
 * [v13] The retired location a stored string names, if it is one.
 *
 * @param {string} location as stored on a meal or an itinerary row
 * @returns {{name: string, becomes: string}|null} null for a current location,
 *   an empty one, and free text somebody typed
 */
export function retiredLocation(location) {
  const text = String(location || '').trim();
  if (!text) return null;
  return RETIRED_LOCATIONS.find((entry) => entry.name === text) || null;
}

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
