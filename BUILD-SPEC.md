# EVENT-ORDER-GEN — Build Spec v5

Static document generator for Maple Ranch private-side event orders, menus, and rooming lists.

**Repo:** `MathrusseB/EVENT-ORDER-GEN`
**Deploy:** `event-order-gen-production.up.railway.app`

Supersedes v4. Each change carries the version that introduced it, **[v2]** through **[v5]**;
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
- Three print-ready renders: Event Order, Menu, Rooming Assignment
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
  { "id": "s1", "type": "attendees",  "title": "Attendee List",       "enabled": true },
  { "id": "s2", "type": "rooming",    "title": "Rooming Assignments", "enabled": true },
  { "id": "s3", "type": "schedule",   "title": "Event Schedule",      "enabled": true },
  { "id": "s4", "type": "foodAndBev", "title": "Food & Beverage",     "enabled": true },
  { "id": "s5", "type": "staff",      "title": "Staff Assignments",   "enabled": false },
  { "id": "s6", "type": "freeText",   "title": "Security Notes",      "enabled": true,
    "body": "Range in use Saturday PM. Guest arrivals staggered 1400-1800." },
  { "id": "s7", "type": "freeText",   "title": "Notes",               "enabled": true,
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

**Section types**

| Type | Content source | Repeatable |
|---|---|---|
| `attendees` | `attendees[]` | No |
| `rooming` | `rooming[]` | No |
| `schedule` | `schedule[]` | No |
| `foodAndBev` | `foodAndBev[]` | No |
| `menu` | `menu[]` | No |
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
    "revisedBy": "Brian Mathrusse"
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
    { "building": "Lodge", "room": "Brian's Suite", "guestIds": ["a-7f3c"],
      "from": "2026-11-14", "to": "2026-11-16" },
    { "building": "Lodge", "room": "Timber Suite",  "guestIds": ["a-9d22"],
      "from": "2026-11-14", "to": "2026-11-15" },
    { "building": "Lodge", "room": "Timber Suite",  "guestIds": ["a-5e08"],
      "from": "2026-11-15", "to": "2026-11-16" },
    { "building": "Lodge", "room": "Bunk Room",     "guestIds": ["a-3fa1", "a-6b70"],
      "from": "2026-11-14", "to": "2026-11-16" },
    { "building": "Red Leaf Inn", "room": null, "guestIds": ["a-2b91"],
      "from": "2026-11-15", "to": "2026-11-16" }
  ],

  "schedule": [
    { "date": "2026-11-14", "start": "05:00", "end": "10:00", "label": "Duck Hunt" },
    { "date": "2026-11-14", "start": "10:30", "end": null,    "label": "Breakfast - Wheel" },
    { "date": "2026-11-14", "start": "11:00", "end": "16:00", "label": "Downtime" },
    { "date": "2026-11-14", "start": "18:00", "end": null,    "label": "Dinner - Wheel" }
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
      "courses": [
        { "heading": "Mains", "items": ["All-Beef Hot Dogs", "Buttered Noodles"] }
      ] },
    { "fnbId": "sat-dinner",
      "courses": [
        { "heading": "Entrees", "items": ["American Wagyu Beef Tenderloin - Carved to Order"] }
      ] }
  ],

  "staff": [
    { "name": "Sara",    "date": "2026-11-14", "daypart": "AM", "assignment": "Duck blind - North" },
    { "name": "Sara",    "date": "2026-11-14", "daypart": "PM", "assignment": "Bartend - Wheel" },
    { "name": "Tanisha", "date": "2026-11-14", "daypart": "AM", "assignment": "AM duties" },
    { "name": "Evie",    "date": "2026-11-14", "daypart": "PM", "assignment": "PM stew" }
  ],

  "departments": [
    { "name": "Security",
      "priorToEvent": ["Print attendee list for arrivals"],
      "duringEvent": [
        { "date": "2026-11-14", "time": "07:00", "task": "Front gate for arrivals" }
      ],
      "notes": ["One guest departing after dinner, not returning"] }
  ],

  "buildingsInUse": ["Red Leaf Inn", "The Wheel", "Lodge"]
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

## 6. Static reference data

Seeded in `js/reference.js`. Not part of event JSON.

**Buildings:** Red Leaf Inn (RLI), The Wheel, Bucket Shop, Lodge, Wood Shop, MRSO,
Dock / Boathouse, Hummer Bar, Food Plot, Lake, Cottage

**[v3] Building assignment modes.** Each building declares `mode: "named" | "pooled"`.
- **Lodge — `named`.** The working venue for private events. Room-level assignment, room grid in
  the editor and the render.
- **Red Leaf Inn — `pooled`.** Backup overflow only. Guests are assigned to the building, not to a
  room; the render lists them under "Red Leaf Inn" with no room numbers. Full room inventory is
  retained below so the mode can be flipped if a private event ever needs it.
- All other buildings are non-lodging and take no assignments.

**Lodge rooms (`named`):** Master Suite, Brian's Suite, Michael's Suite, Timber Suite,
Wetland Suite, Basement Office Suite, Upland Suite, Bunk Room

**Red Leaf Inn rooms (retained, unused while `pooled`):** 1 through 24, with Exec Suites at 8 and
20 and Suites at 11 and 23.

**[v5]** Bedding is not stored. Even rooms are kings and odd rooms are double queens — property
knowledge everyone at the ranch already has, which belongs in neither the room titles nor the data.
Nothing anywhere models room capacity.

**[v2] Schedule label suggestions** (autocomplete only, free text always allowed):
Duck Hunt, Upland Hunt, Deer Hunt, Downtime, Breakfast, Lunch, Dinner, Cocktails, Happy Hour,
Guest Arrival, Guest Departure, Range, Skeet

Room inventory is fixed property data — selected from, never typed.

## 7. Derived fields

| Field | Rule |
|---|---|
| Total guest count | `attendees.length` |
| Guests present on a date | attendees where `arrive <= date <= depart` |
| Overnight count for a night | attendees where `arrive <= date < depart` |
| **[v4]** Lodging by building, per night | for each building with rows covering that night: `mode`, rooms occupied, guests named. The Accommodations table shows rooms for `named`, guests for `pooled`. **[v5]** A row naming nobody still occupies its room. |
| **[v3]** Room occupancy on a night | `rooming[]` rows where `from <= night < to`, grouped by building and room |
| **[v3]** Unassigned guests on a night | attendees overnight that night named on no covering `rooming[]` row. **[v5]** A guest not on the sheet is not necessarily unhoused — spouses and children rooming with family are never listed |
| F&B attendee count | **[v5]** narrowed by `serves` — `all`, `adults`, `children` — then counted per `countBasis`: `present`, `overnight`, or `custom` |
| **[v5]** Dietary notes | attendees with a non-empty `dietary`, for the Menu allergies block and buffet labels |
| Menu header count | same computed value as the F&B row it references |
| Footer revision line | `meta.revisionDate` + `meta.revisedBy` |

## 8. Render targets

**A. Event Order** — header block, then enabled sections in array order, then footer with page
number and revision line.

**B. Menu** — header, F&B schedule table, allergies, per-meal sections grouped by course heading.

**C. Rooming Assignment** — room grid by building showing occupied and vacant rooms, per-building
totals, attendee list with arrival/departure and notes.

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

Each render gets its own print button — no combined print.

Server-side PDF (Hibiscus.dev) is the port path when this becomes a PSO module. Clean semantic HTML
now keeps that port cheap.

## 11. File layout

```
/index.html          form + section builder
/rooming.html        standalone rooming editor
/css/styles.css      design tokens, screen styles
/css/print.css       @page rules, print-only styles
/js/app.js           form state, event JSON in memory
/js/sections.js      section add / remove / reorder / enable
/js/reference.js     buildings, rooms, static lists
/js/render.js        JSON -> document renders
/js/rooming.js       drag-and-drop assignment editor
/js/validate.js      pre-print checks
/js/io.js            JSON download / upload, localStorage autosave
/data/sample.json    fixture for development
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

## 13. Open items

- Whether `staff` renders grouped by person or by daypart as the default

## 14. Resolved

- ~~Which departments exist on the private side~~ — same structure as corporate, but rarely used.
  Now optional and off by default; `staff[]` covers the normal case.
- ~~Additional sample orders needed~~ — not blocking. No boilerplate library is being written;
  every section is authored per event.
- ~~Ownership rooming access~~ — deferred to a later version, but treated as expected. `rooming.js`
  is built as a portable module now so the hosted-state swap is cheap. See §9.
- ~~Whether allergies live in `meta` or as their own section type~~ — **[v5]** neither. They belong
  to the person: `attendees[].dietary`, free text, derived into the Menu allergies block. An event
  level list goes stale the moment the guest list changes.
