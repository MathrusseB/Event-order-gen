# EVENT-ORDER-GEN — Build Spec v8

Static document generator for Maple Ranch private-side event orders, menus, and rooming lists.

**Repo:** `MathrusseB/EVENT-ORDER-GEN`
**Deploy:** `event-order-gen-production.up.railway.app`

Supersedes v8. Each change carries the version that introduced it, **[v2]** through **[v9]**;
§5 keeps a change block per version.

---

## 1. Purpose

Replace manual Word/Excel authoring of event paperwork. One structured input produces consistent
documents for handover to ownership. Counts and dates derive from a single source, never re-typed.

**[v2] Design principle: private-side event orders are living documents.** Corporate orders are
built against a guest list known months out. Private-side guest lists fluctuate day to day. The
document captures the plan at issue time and must be fast to amend and reissue.

Reference sample: Loch Lloyd Executive Meeting, Sept 14–15 2026 (Events department version).

## 2. Scope

**In scope for v1**
- Single-page form for event data entry
- **[v2]** Composable section system — every section optional, reorderable, unlimited in length
- **[v2]** Standalone rooming editor for on-the-fly reassignment
- Three print-ready renders: Event Order, Menu, Rooming Assignment — **[v7]** three separate
  documents, not three parts of one
- Event data saved as portable JSON (download / upload)
- Print-to-PDF via browser, styled with CSS `@page`
- Validation that catches count and date mismatches before print

**Out of scope for v1**
- Database, auth, multi-user, shared state
- Guest history across events
- Email or file distribution
- Server-side PDF rendering

## 3. Stack

- HTML / CSS / vanilla JS, no framework, no build step
- Static file serve on Railway
- No external runtime dependencies
- Persistence: JSON file download/upload, with `localStorage` autosave as a convenience only —
  the JSON file is the source of truth

## 4. Section system **[v2]**

This replaces v1's fixed document outline. It is the core structural change.

An event order is an **ordered array of sections**. The user adds, removes, reorders, and disables
sections per event. Nothing is mandatory except the header block.

```json
"sections": [
  { "id": "s1", "type": "schedule",   "title": "Itinerary",           "enabled": true },
  { "id": "s2", "type": "guests",     "title": "Guests",              "enabled": true },
  { "id": "s3", "type": "foodAndBev", "title": "Food & Beverage",     "enabled": true },
  { "id": "s4", "type": "staff",      "title": "Staff Assignments",   "enabled": false },
  { "id": "s5", "type": "freeText",   "title": "Security Notes",      "enabled": true,
    "body": "Range in use Saturday PM. Guest arrivals staggered 1400-1800." },
  { "id": "s6", "type": "freeText",   "title": "Notes",               "enabled": true,
    "body": "" }
]
```

**Rules**
- Array order is print order. Drag to reorder.
- `enabled: false` keeps the content but omits it from the render — never delete to hide.
- `title` is user-editable. The same `type` can appear more than once with different titles.
- `freeText` can be added unlimited times. This covers Security notes, PSO notes, weather,
  transportation, anything not yet anticipated.
- **No length caps anywhere.** No character limits, no fixed row counts, textareas auto-grow.
- **[v7] `sections` is the outline of the Event Order alone.** The Menu and the Rooming
  Assignment are their own documents (§8), always generated, and are not section types. Their
  data is entered once — in the rooming editor and the menu editor — and each document takes
  what it needs. **[v9]** Either may additionally be *included* in the Event Order through
  `meta.includeInOrder` (§5), which appends that document's content to the order and changes
  nothing about the standalone document. Inclusion is not a section: nothing about it is
  reordered or renamed, and it always prints last.
- **[v6]** A new event is **seeded** with **[v9]** three sections — `schedule` titled
  "Itinerary", `guests`, and a `freeText` titled "Notes" — enabled, in that order. `foodAndBev`,
  `staff` and `departments` are not seeded. Seeded sections are ordinary sections: renamed,
  reordered, disabled, and removed like any other.

**Section types**

| Type | Content source | Repeatable |
|---|---|---|
| **[v9]** `guests` | `buildingsInUse[]` and `overflowBuildings[]` as a one-line note, then `attendees[]` as a compact list. Replaces `attendees` and `accommodations`, which are gone | No |
| `schedule` | **[v7]** `schedule[]` and `foodAndBev[]`, merged into one itinerary (§7) | No |
| `foodAndBev` | `foodAndBev[]` — the F&B schedule table, which **[v7]** prints on the Menu as well | No |
| `staff` | `staff[]` | No |
| `departments` | `departments[]` — full corporate-style breakdown, off by default | No |
| `freeText` | inline `body` | Yes, unlimited |

## 5. Data model

```json
{
  "meta": {
    "eventName": "Illig Party - Opening Weekend",
    "startDate": "2026-11-14",
    "endDate": "2026-11-16",
    "eventLead": "Brian Mathrusse",
    "revisionDate": "2026-11-10",
    "revisedBy": "Brian Mathrusse",
    "brandId": "maple-ranch",
    "includeInOrder": { "rooming": false, "menu": false }
  },

  "sections": [ /* see section 4 */ ],

  "attendees": [
    { "id": "a-7f3c", "last": "Illig",   "first": "Brian", "arrive": "2026-11-14", "depart": "2026-11-16",
      "isChild": false, "dietary": "",                 "note": "" },
    { "id": "a-2b91", "last": "Palmer",  "first": "Kim",   "arrive": "2026-11-15", "depart": "2026-11-16",
      "isChild": false, "dietary": "Shellfish allergy", "note": "Arriving late" },
    { "id": "a-c40e", "last": "Baldwin", "first": "Chase", "arrive": "2026-11-14", "depart": "2026-11-14",
      "isChild": false, "dietary": "",                 "note": "Day guest, departing after dinner" },
    { "id": "a-3fa1", "last": "Illig",   "first": "Nora",  "arrive": "2026-11-14", "depart": "2026-11-16",
      "isChild": true,  "dietary": "",                 "note": "" }
  ],

  "rooming": [
    { "id": "r-1", "building": "Remington", "room": "1", "guestIds": ["a-7f3c"],
      "from": "2026-11-14", "to": "2026-11-16" },
    { "id": "r-2", "building": "Lodge Lower Suites", "room": "Timber", "guestIds": ["a-9d22"],
      "from": "2026-11-14", "to": "2026-11-15" },
    { "id": "r-3", "building": "Lodge Lower Suites", "room": "Timber", "guestIds": ["a-5e08"],
      "from": "2026-11-15", "to": "2026-11-16" },
    { "id": "r-4", "building": "Lodge Bunk Rooms", "room": "Bunk Room",
      "guestIds": ["a-3fa1", "a-6b70"], "from": "2026-11-14", "to": "2026-11-16" },
    { "id": "r-5", "building": "RLI", "room": "8", "guestIds": ["a-2b91"],
      "from": "2026-11-15", "to": "2026-11-16" }
  ],

  "schedule": [
    { "id": "s-1", "date": "2026-11-14", "start": "05:00", "end": "10:00", "label": "Duck Hunt" },
    { "id": "s-2", "date": "2026-11-14", "start": "11:00", "end": "16:00", "label": "Downtime" },
    { "id": "s-3", "date": "2026-11-14", "start": "16:00", "end": "17:30", "label": "Range" }
  ],

  "foodAndBev": [
    { "id": "sat-kids-dinner", "date": "2026-11-14", "start": "17:30", "end": null,
      "meal": "Children's Dinner", "location": "The Wheel",
      "countBasis": "present", "serves": "children" },
    { "id": "sat-dinner", "date": "2026-11-14", "start": "18:30", "end": null,
      "meal": "Dinner", "location": "The Wheel",
      "countBasis": "present", "serves": "adults" }
  ],

  "menu": [
    { "fnbId": "sat-kids-dinner",
      "dishes": ["All-Beef Hot Dogs", "Buttered Noodles"] },
    { "fnbId": "sat-dinner",
      "dishes": ["American Wagyu Beef Tenderloin - Carved to Order", "Whipped Potato"] }
  ],

  "staff": [
    { "id": "t-1", "name": "Sara",    "date": "2026-11-14", "daypart": "AM", "assignment": "Duck blind - North" },
    { "id": "t-2", "name": "Sara",    "date": "2026-11-14", "daypart": "PM", "assignment": "Bartend - Wheel" },
    { "id": "t-3", "name": "Tanisha", "date": "2026-11-14", "daypart": "AM", "assignment": "AM duties" },
    { "id": "t-4", "name": "Evie",    "date": "2026-11-14", "daypart": "PM", "assignment": "PM stew" }
  ],

  "departments": [
    { "id": "p-1", "name": "Security",
      "priorToEvent": ["Print attendee list for arrivals"],
      "duringEvent": [
        { "date": "2026-11-14", "time": "07:00", "task": "Front gate for arrivals" }
      ],
      "notes": ["One guest departing after dinner, not returning"] }
  ],

  "buildingsInUse": ["Remington", "Lodge Bunk Rooms", "The Wheel"],
  "overflowBuildings": ["RLI"]
}
```

### Changes from v1

**[v2] `attendees[].overnight` becomes `arrive` / `depart` dates.**
A single overnight boolean cannot express a guest list that changes daily. Arrival and departure
dates handle day guests, late arrivals, and early departures, and let every per-day count derive
correctly. Both default to the event start and end dates, so the common case is still two clicks.

**[v2] `foodAndBev[].countBasis` enum is now:** `present` | `overnight` | `custom`
- `present` — attendees whose stay spans the meal date. This is the new default.
- `overnight` — attendees staying the night of that date
- `custom` — explicit `count` field, shown in the UI as a deliberate override

**[v2] New `staff[]` array.**
Private side runs a small crew with role-level assignments, not room-by-room timelines. The shape
is person + date + daypart + assignment. Renders grouped by person or by daypart. The
corporate-style `departments[]` structure is retained but disabled by default, available when a
larger event warrants it.

**[v2] Security notes, PSO notes, and anything similar are `freeText` sections,** not schema
fields. Unlimited, arbitrarily titled, added as needed.

### Changes from v2

**[v3] `rooming[]` entries carry `from` / `to` night ranges.**
Rooms turn over mid-event on the private side: a guest departs early and an arriving guest takes
that room the same weekend. A room assignment is therefore a booking over a range of nights, not a
property of the guest. Both default to the guest's `arrive` / `depart`, so the common case needs no
extra input. The interval is half-open — `from <= night < to` — matching `overnightCountFor`, so a
guest departing on the 15th does not hold the room the night of the 15th.

**[v3] `rooming[].room` may be `null` for pooled buildings.**
Red Leaf Inn is overflow-only for private events and does not need room-level assignment — "in
RLI" is sufficient detail for the document. Buildings therefore declare an assignment mode (§6).
Named buildings require a room; pooled buildings ignore the field. The Lodge is the only named
building in normal private-side use.

### Changes from v3

**[v4] Attendees carry a stable `id`; `rooming[]` references `guestId`, not a name.**
Matching a rooming row to a guest by name string breaks two ways, both silently. Editing a guest's
name orphans their room — the room renders as held by someone no longer on the guest list while
the guest renders as unhoused. And two attendees with the same name (a junior and a senior, two
cousins) resolve to the same person, so one room appears to house both. IDs are assigned once, on
creation, and never displayed. Names remain free to edit.

**[v4] Building occupancy is reported per mode.**
`named` buildings report rooms occupied. `pooled` buildings have no rooms, so they report guests
accommodated. The Accommodations table reads the figure appropriate to the mode. Reporting
"distinct rooms" for a pooled building yields 1 no matter how many guests are in it.

**[v4] Building occupancy is reported per night.**
The Accommodations table is a dated table — mid-event turnover means a whole-event figure cannot
be right for every night of the event.

### Changes from v4

**[v5] A rooming row names a party, not a person. `guestId` becomes `guestIds: []`.**
Rooms hold whoever they hold. A king room takes one couple; a double queen takes two guests, or two
parents and two children. Only some of those people go on the sheet: spouses are never listed,
children are listed only when they have a room of their own, and the Bunk Room is the one room that
routinely carries several names. Occupancy is therefore not derivable from the rooming sheet and is
not meant to be — the sheet records who the room is *known by*. Array order is display order, and
the first name is the guest the room is booked under, so a row with no dates of its own takes that
guest's.

**[v5] No room capacity, and no occupancy counting.**
Every person at the ranch is on the attendee list and is counted for meals there, so the rooming
sheet never needs to account for bodies. Capacity is not modelled: a row may carry any number of
names. Red Leaf Inn's even rooms are kings and odd rooms are double queens, which is property
knowledge everyone at the ranch already has and does not belong in room titles or in the data.

**[v5] Attendees carry `isChild` and `dietary`.**
Children are flagged, not aged — exact ages are frequently unknown and the ranch does not ask.
`dietary` is a free-text field for allergies and special dining accommodations, separate from
`note`, because it drives the Menu render and buffet labels and cannot be buried in general remarks.

**[v5] F&B entries carry `serves`: `all` | `adults` | `children` | `custom`.**
Children often eat a different menu at a different time — hot dogs at 5:30, adult buffet at 6:30. A
children's seating is an ordinary F&B entry with its own time, location, and menu block; `serves`
narrows who it counts. `custom` uses an explicit `count` as before. This also corrects a live
counting error: without it, an adult buffet counts every child in the house. `serves` and
`countBasis` are independent and compose — `overnight` + `children` is the children staying that
night — and `all` is the default wherever the field is absent.

### Changes from v5

**[v6] A new event is seeded with a default section set.**
`emptyEvent()` produced `sections: []`, so a new event opened as a blank page with no outline and
nothing to type into — the first act of authoring every order was rebuilding the same list by hand.
Nearly every private-side order uses the same sections, and **[v9]** they are three: Itinerary,
Guests, and a free-text Notes section. Those are seeded, enabled, in that order. (**[v7]** it was
five — Attendee List, Accommodations, Event Schedule, Food & Beverage, Notes — before v9 merged the
first two into `guests` and dropped the F&B table from the seed: the itinerary already carries
every meal, and the separate table is wanted on the order less often than not.) Staff and
departments are not seeded — they are the exception, added when a particular event wants them. Rooming and Menu are no longer among them because they are no longer
sections at all: each is its own document, always generated (§8). Sections remain fully removable
and reorderable, so a seeded default costs nothing to discard, and an event that needs none of them
is three taps from empty.

The seed applies to a *new* event only. A loaded file keeps exactly the sections it was saved with,
including none: `migrate()` does not add sections, because a file saved with an empty outline was
authored that way on purpose.

### Changes from v6

**[v7] `sections` is the outline of the Event Order alone.**
The three documents are separate on purpose: nobody should have to scroll past the rooming grid to
reach the menu. v6 listed `rooming` and `menu` as section types, which folded the room grid and the
dish list into the event order and made the separation a matter of what the user remembered to
disable.

- The **Event Order** carries an *Accommodations* summary — guests and rooms per building per
  night, the two-line table in the reference sample — not the room grid.
- The **Rooming Assignment** is its own document: the room grid and the attendee list.
- The **Menu** is its own document: the F&B schedule table, allergies, and the dishes.

Rooming and Menu are always generated and are not sections. The `rooming` section type is replaced
by `accommodations`; the `menu` section type is gone. Both editors remain — the data is entered
once and each document takes what it needs. The F&B schedule table appears on the Event Order and
on the Menu, which is deliberate: the Menu leaves the kitchen on its own and has to say when each
service is.

An inbound file is brought forward rather than left broken: `migrate()` turns a `rooming` section
into an `accommodations` one and drops a `menu` section, and neither `rooming[]` nor `menu[]` is
touched — the data was never in the section.

**[v7] The itinerary merges `schedule[]` and `foodAndBev[]`.**
A meal was typed twice — once as a schedule line, once as an F&B entry — with nothing keeping the
two in step, so a dinner moved from 18:00 to 18:30 moved on one and not the other and the document
contradicted itself. `schedule[]` now carries only what is not a meal: hunts, arrivals, downtime,
departures. The Event Summary itinerary is generated by merging both arrays in time order, so
moving dinner moves it on the itinerary, in the F&B table and on the Menu at once.

**[v7] Every row the form creates carries an opaque `id`.**
`attendees[]` has had one since v4 and `foodAndBev[]` has always had one, because both are
referenced from elsewhere. The rest — `rooming[]`, `schedule[]`, `staff[]`, `departments[]` — were
identified by array position, which is not an identity: the editors add, delete and reorder rows,
and a control bound to an index edits the wrong row the moment a row above it moves. IDs are
assigned once, on creation, never displayed, and never edited, exactly as in v4. `migrate()` mints
them for rows arriving without one, so a file saved before v7 opens with stable rows.

### Changes from v7

**[v8] Events carry a brand, and the three documents do not all use the same one.**
`meta.brandId` selects an entry from the brand registry in `reference.js` (§6), defaulting to
`maple-ranch`. The registry is static property data — a display name and a logo path under
`logos/` per brand — and is never written into the event JSON; the event stores the id alone.

The ranch hosts groups that are not the ranch. A Bloody Feather weekend, an RNT weekend, a KUIU
shoot, a Navy SEALs retreat — each arrives with its own identity, and paperwork handed to that
group should carry it.

- **Event Order** and **Rooming Assignment** carry the **event's** brand. They are operational
  paperwork for the group in the building, and they should identify the group they are for.
- **Menu** always carries **`maple-ranch`**, whatever the event's brand. The menu is the ranch's
  culinary product, not the visiting group's: the kitchen writes it, the ranch stands behind it,
  and it is the one document that leaves as a piece of the ranch rather than a piece of the
  weekend.

**This asymmetry is deliberate and is not to be "fixed" into consistency.** It mirrors how the
events department already issues these documents, and a future reader who makes all three
documents agree will be undoing a decision, not tidying an oversight. `brandId` is read at render
time only; nothing else in the app branches on it.

An unknown or absent `brandId` resolves to `maple-ranch` rather than rendering an empty header, so
a file authored before v8 — and a file hand-edited to a brand this build has never heard of — opens
and prints exactly as it always did.

### Changes from v8

Every change here came from testing the app against how the private side actually runs. Where one
contradicts an earlier decision, the new answer wins and the old reasoning is kept beside it, so
the change reads as a correction rather than as a reversal nobody can account for.

**[v9] The property's lodging is ten buildings, all room-numbered.** The Lodge's named suites and
the pooled Red Leaf Inn were both wrong for the private side. §6's lodging registry is replaced
outright: ten buildings, every one of them `named`, in the display order they are given there.
Master, Brian's, Michael's and Upland are gone. The Bunk Room sleeps twelve and the Clubhouse King
Suite is a master suite down the hall from the six Clubhouse rooms — rarely used, but real.

**[v9] RLI is `named`, not `pooled`.** v3 made Red Leaf Inn pooled on the grounds that "anywhere in
RLI" was detail enough. Testing showed otherwise: when RLI is in use, staff need the room number to
know which room to service. The `pooled` mode stays in the code — it costs nothing and the concept
may return — but no building uses it now.

**[v9] `menu[].courses[]` becomes `menu[].dishes[]`.** A flat, ordered list of strings. Course
headings were the events department's convention; the private side does not want them. A file
carrying courses is flattened on the way in, in the order the dishes appeared, and the headings are
discarded.

**[v9] `accommodations` and `attendees` become one `guests` section.** Two sections about the same
people, printed one after the other, were two headings where one belongs. The `guests` section is a
one-line note naming the buildings in use and those held for overflow, then a compact attendee
list. `overflowBuildings[]` joins `buildingsInUse[]` in the event; both are edited in that section.
The per-night lodging summary is gone from the Event Order — where the whole picture is wanted,
`meta.includeInOrder.rooming` puts the grid itself on the order.

**[v9] `meta.includeInOrder` — `{ rooming: false, menu: false }`.** When either is true, that
document's content is appended to the Event Order: the room grid, the menu blocks. Both documents
still print on their own exactly as before, and nothing about them changes. This is an addition to
the order and never a replacement for the standalone document — including the menu in the order
does not mean the kitchen stops getting a menu.

**[v9] The Rooming Assignment does not repeat the attendee list.** It is the room grid. The guest
list belongs to the Event Order, and the same names printed on two documents drift the moment one
of them is reissued. The unassigned-guest callout stays: that is a warning about the grid, not a
guest list.

## 6. Static reference data

Seeded in `js/reference.js`. Not part of event JSON.

**[v9] Lodging.** Ten buildings, in this display order, which is the order they get used in —
least-assigned first:

| Building | Rooms | Labels |
|---|---|---|
| Remington | 4 | 1–4 |
| Winchester | 4 | 1–4 |
| Mallard | 8 | 1–8 |
| Wigeon | 8 | 1–8 |
| Pintail | 8 | 1–8 |
| Lodge Bunk Rooms | 1 | Bunk Room |
| Lodge Lower Suites | 2 | Timber, Wetland |
| RLI | 24 | 1–24 |
| Clubhouse | 6 | 1–6 |
| Clubhouse King Suite | 1 | King Suite |

Every one of them is `named`: rooms are assigned room by room, and the grid in the editor and on
the Rooming Assignment shows every room in inventory, occupied or vacant. The Bunk Room sleeps
twelve. The Clubhouse King Suite is a master suite down the hall from the six Clubhouse rooms,
rarely used but real, and is its own building here because it is assigned on its own.

**Non-lodging buildings**, which take no assignments and appear as locations: The Wheel, Bucket
Shop, Wood Shop, MRSO, Dock / Boathouse, Hummer Bar, Food Plot, Lake, Cottage. "Lodge" and "Red
Leaf Inn" are no longer building names of their own — the registry above names their parts.

**[v3] Building assignment modes.** Each building declares `mode: "named" | "pooled"`.
- **`named`** — room-level assignment. Every lodging building is this since **[v9]**.
- **`pooled`** — assignment to the building, with no room. **[v9]** Nothing uses it. Red Leaf Inn
  was pooled from v3 on the grounds that "anywhere in RLI" was detail enough; when RLI is in use,
  staff need the room number to know which room to service. The mode stays in the code because it
  costs nothing and the concept may return.
- Buildings absent from the registry are non-lodging and take no assignments.

**[v5]** Bedding is not stored. Even rooms are kings and odd rooms are double queens — property
knowledge everyone at the ranch already has, which belongs in neither the room titles nor the data.
Nothing anywhere models room capacity: **[v9]** every room holds a party of any size, as before.

**[v2] Schedule label suggestions** (autocomplete only, free text always allowed):
Duck Hunt, Upland Hunt, Deer Hunt, Downtime, Breakfast, Lunch, Dinner, Cocktails, Happy Hour,
Guest Arrival, Guest Departure, Range, Skeet

Room inventory is fixed property data — selected from, never typed. **[v9]** So is the building
list the `guests` section draws its buildings-in-use and overflow buildings from.

**[v8] Brand registry.** Each entry is an id, a display name, and a logo path under `logos/`.
`meta.brandId` holds the id alone; nothing here is ever written into the event JSON.

| id | Display name | Logo |
|---|---|---|
| `maple-ranch` | Maple Ranch | `logos/maple-ranch.png` |
| `bloody-feather` | Bloody Feather | `logos/bloody-feather.png` |
| `rnt` | RNT | `logos/rnt.png` |
| `kuiu` | KUIU | `logos/kuiu.png` |
| `navy-seals` | Navy SEALs | `logos/navy-seals.png` |

`maple-ranch` is the default and the fallback: an id matching no entry resolves to it rather than
printing a document with no identity on it.

The five logos differ in proportion by a factor of four — Maple Ranch is a wide wordmark at 3.48:1,
the Navy SEALs crest is portrait at 0.83:1. Each is fitted into one fixed box in the running header
(§10) so the header occupies the same height whichever brand an event carries, and a page of a
Bloody Feather order lines up with a page of a Maple Ranch one.

## 7. Derived fields

| Field | Rule |
|---|---|
| Total guest count | `attendees.length` |
| Guests present on a date | attendees where `arrive <= date <= depart` |
| Overnight count for a night | attendees where `arrive <= date < depart` |
| **[v4]** Lodging by building, per night | for each building with rows covering that night: `mode`, rooms occupied, guests named. Rooms for a `named` building, guests for a `pooled` one. **[v5]** A row naming nobody still occupies its room. **[v9]** No document prints this any more — the `accommodations` section that did is gone — but `eventNights` reads it to decide whether the last day of an event carries a night |
| **[v3]** Room occupancy on a night | `rooming[]` rows where `from <= night < to`, grouped by building and room |
| **[v3]** Unassigned guests on a night | attendees overnight that night named on no covering `rooming[]` row. **[v5]** A guest not on the sheet is not necessarily unhoused — spouses and children rooming with family are never listed |
| F&B attendee count | **[v5]** narrowed by `serves` — `all`, `adults`, `children` — then counted per `countBasis`: `present`, `overnight`, or `custom` |
| **[v7]** Itinerary for a date | `schedule[]` entries and `foodAndBev[]` entries on that date, merged and ordered by `start`, entries without a `start` last in their existing order. An F&B entry contributes its meal name and location; a schedule entry contributes its label. Each merged entry carries the array it came from and its row id, so the render can draw it and the editor can link back to it |
| **[v5]** Dietary notes | attendees with a non-empty `dietary`, for the Menu allergies block and buffet labels |
| **[v9]** Buildings line | `buildingsInUse[]` and `overflowBuildings[]` as one sentence, for the `guests` section. Buildings named on a rooming row but in neither list are still in use, and the sentence says so |
| Menu header count | same computed value as the F&B row it references |
| Footer revision line | `meta.revisionDate` + `meta.revisedBy` |

## 8. Render targets

**[v7]** Three documents, printed separately and never combined. Only **A** has an outline the user
arranges; **B** and **C** are always generated from the same event data and have no sections of
their own.

**[v8] Brand per document.** **A** and **C** carry `meta.brandId`; **B** always carries
`maple-ranch` (§5, v8 changes). The Menu is the ranch's culinary product, not the visiting group's.
Do not make the three agree.

**[v9] Each document is still printed on its own.** `meta.includeInOrder` (§5) appends the room
grid or the menu blocks to the **Event Order's own body** — that is the Event Order printing more
of its own content, not two documents in one print. The included content is the same render as the
standalone document minus its page furniture: one document's running header inside another is
wrong. **B** and **C** print exactly as they did whatever the flags say.

**[v8] Each document is printed on its own.** There is no combined print, and **no document may
appear in another's print output** — not collapsed, not hidden behind a page break, not present in
the DOM and unstyled. Printing the Menu produces the Menu: not the Menu preceded by four blank
pages where the Event Order was, and not a rooming grid the print stylesheet forgot. The editors
and the application shell are equally absent. This is a property of the print stylesheet and it is
the one thing about printing worth testing by printing.

**A. Event Order** — header block, then enabled sections in array order, **[v9]** then whatever
`meta.includeInOrder` asks for, then footer with page number and revision line. **[v7]** Two
section types render something other than their own array: `schedule` prints the merged itinerary
(§7), not `schedule[]` alone; `foodAndBev` prints the F&B schedule table, which the Menu prints
too. **[v9]** `guests` prints the buildings line and the attendee list, and is the only place
either appears.

**B. Menu** — header, F&B schedule table, allergies, per-meal sections grouped by course heading.
**[v7]** Always generated; never a section of the Event Order.

**C. Rooming Assignment** — the room grid by building, showing occupied and vacant rooms, and the
callout naming guests staying with no room that night. **[v7]** Always generated; never a section
of the Event Order. **[v9]** It does **not** repeat the attendee list: that is the `guests`
section's, on the Event Order, and the same names on two documents drift the moment one is
reissued. The unassigned callout is not a guest list — it is a warning about the grid.

**[v8] Absence is printed, not omitted.** A disabled section does not print at all — that is what
disabling is for. But an *enabled* section holding nothing prints its heading and a quiet note
saying so, and a meal with no menu block prints its heading and a note that no menu is set. The
reasoning is the same in both cases and is worth stating once: a heading with "None" under it was
checked, and a heading that is simply missing was forgotten. Ownership cannot tell those apart from
the page, and the kitchen discovers the second one at service. The same rule governs the Menu's
allergies block, which prints "None known" rather than disappearing when nobody has a dietary note.

## 9. Rooming editor **[v2]**

A dedicated view, not a form field. Requirement: ownership can adjust assignments without help.

**[v3] The editor works one night at a time.** A night selector across the top (one control per
night of the event) sets which night is being arranged. This is what makes mid-event turnover
visible — the Timber Suite can show Dana on Saturday and Tom on Sunday, and the conflict of
assigning both to the same night is obvious rather than silent.

- Night selector — one tab per night, current night highlighted
- Two panes — guests present that night and unassigned, against the lodging buildings
- **Lodge** renders as a room grid; drag a guest onto a room, or tap guest then tap room on touch
- **Red Leaf Inn** renders as a single drop area with no rooms — a guest is either in RLI or not
- Rooms show occupied / vacant for the selected night only
- Dropping onto an occupied room offers swap or replace, scoped to that night
- Assigning a guest across consecutive nights creates one `rooming[]` row with a spanning range,
  not one row per night
- Undo for the last ten moves
- Works on tablet — assume it gets used standing up, not at a desk

v1 is local-only: whoever has the app open makes the change.

**Decision:** shared access is deferred but expected. `rooming.js` must therefore be written as a
self-contained module with no reach into `app.js` global state — it takes an event object in,
returns a mutated event object out, and communicates only through that interface. This keeps the
later swap to a hosted backend a change of caller, not a rewrite.

## 10. Print approach

Browser print-to-PDF. CSS `@page { size: letter; margin: 0.75in }`, running header and footer.

**[v2] Correction to v1:** do *not* put `break-inside: avoid` on whole sections. Sections have no
length limit and must be free to flow across pages. Apply `break-inside: avoid` to individual rows,
table rows, and staff blocks only. Section headings get `break-after: avoid` so a heading never
strands at the bottom of a page.

Each render gets its own print button — no combined print (§8 [v8]): the two documents that are
not being printed must be out of the print output entirely, along with the editors and the shell.

**[v8]** Long table headers repeat on continuation pages. Logos are fitted into a fixed box so the
running header keeps one height across the five brands (§6).

Server-side PDF (Hibiscus.dev) is the port path when this becomes a PSO module. Clean semantic HTML
now keeps that port cheap.

## 11. File layout

```
/index.html          application shell
/rooming.html        standalone rooming editor
/css/styles.css      design tokens, screen styles
/css/print.css       @page rules, print-only styles
/js/app.js           form state, event JSON in memory
/js/shell.js         application frame — header, section navigator, editor mounting
/js/sections.js      section add / remove / reorder / enable
/js/editors/         one editor module per section type, plus the event header
/js/dom.js           DOM helpers and the keyed reconciler editors render through
/js/dates.js         ISO date helpers
/js/ids.js           opaque row ids
/js/migrate.js       forward migration of inbound JSON
/js/derive.js        counts and lodging, derived from the event
/js/reference.js     buildings, rooms, static lists
/js/render.js        document shell — page furniture, brand header, print
/js/renders/         one module per document: order, menu, rooming
/js/views.js         edit / document destinations, and the per-document print
/js/rooming.js       drag-and-drop assignment editor
/js/validate.js      pre-print checks
/js/io.js            JSON download / upload, localStorage autosave
/data/sample.json    fixture for development
/logos/              brand logos, one per registry entry (§6)
```

## 12. Validation rules

Run before any print. Warn, do not block.

1. Any F&B entry counted by explicit override — `countBasis: "custom"`, or **[v5]** `serves: "custom"` — surface it
2. Attendee staying overnight named on no room assignment covering that night. **[v5]** A warning, not a fault: spouses and children rooming with family are deliberately off the sheet
3. **[v4]** Rooming row naming a guest it cannot resolve — a `guestIds` entry matching no attendee, or **[v5]** a legacy `guest` name migration could not match. Usually a deleted guest. A row naming nobody at all is not an orphan: it is a room held under no name yet
4. **[v3]** Same named room claimed on the same night by **[v5]** two separate rooming rows. Several names on one row is a party sharing a room, never a conflict
5. **[v3]** Rooming row whose `from`/`to` range falls outside the `arrive`/`depart` of the guest it is booked under
6. **[v3]** Room specified on a `pooled` building, or omitted on a `named` building
7. Menu block referencing a nonexistent `fnbId`
8. F&B entry with no menu block
9. Schedule or F&B item dated outside `startDate`–`endDate`
10. Attendee `depart` earlier than `arrive`
11. `revisionDate` older than the most recent edit
12. **[v7]** A `schedule[]` entry whose label matches an F&B meal on the same date at the same time
    — a meal typed into both arrays, which will now print twice on the merged itinerary (§7)

## 13. Open items

- None outstanding.

## 14. Resolved

- ~~Whether `staff` renders grouped by person or by daypart~~ — **[v8]** by person. A stew in a
  duck blind at dawn and behind the bar at night is one person's day, and grouping by daypart
  splits it across two tables so nobody can see the shape of it. Each person's assignments print
  under their name in time order.
- ~~Which departments exist on the private side~~ — same structure as corporate, but rarely used.
  Now optional and off by default; `staff[]` covers the normal case.
- ~~Additional sample orders needed~~ — not blocking. No boilerplate library is being written;
  every section is authored per event.
- ~~Ownership rooming access~~ — deferred to a later version, but treated as expected. `rooming.js`
  is built as a portable module now so the hosted-state swap is cheap. See §9.
- ~~Whether allergies live in `meta` or as their own section type~~ — **[v5]** neither. They belong
  to the person: `attendees[].dietary`, free text, derived into the Menu allergies block. An event
  level list goes stale the moment the guest list changes.
