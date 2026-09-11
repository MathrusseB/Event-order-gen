# EVENT-ORDER-GEN — Build Spec v12

Static document generator for Maple Ranch private-side event orders, menus, and rooming lists.

**Repo:** `MathrusseB/EVENT-ORDER-GEN`
**Deploy:** `event-order-gen-production.up.railway.app`

Supersedes v11. Each change carries the version that introduced it, **[v2]** through **[v12]**;
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
    "includeInOrder": { "rooming": false, "menu": false },
    "touchedAt": "2026-11-10T16:41"
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
    { "id": "r-2", "building": "Timber", "room": "Timber", "guestIds": ["a-9d22"],
      "from": "2026-11-14", "to": "2026-11-15" },
    { "id": "r-3", "building": "Timber", "room": "Timber", "guestIds": ["a-5e08"],
      "from": "2026-11-15", "to": "2026-11-16" },
    { "id": "r-4", "building": "Bunk Room", "room": "Bunk Room",
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

  "buildingsInUse": ["Remington", "Bunk Room"],
  "overflowBuildings": ["RLI"],

  "seeded": { "meals": ["2026-11-14"], "itinerary": ["2026-11-14"] },
  "customActivities": ["Sporting Clays"]
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

### Changes from v9

**[v10] The printed rooming sheet lists occupied rooms; the interactive board shows every room.**
§8 C said every room in inventory prints, occupied or vacant, and that was written when the largest
building had eight rooms. With RLI at twenty-four, the sample event — nine guests in six rooms —
prints thirty-one rows, and one of its pages is fifteen empty RLI rows with a single guest among
them.

The two surfaces have different jobs, and this is the first place they diverge on purpose:

- **On paper**, staff read which rooms are occupied. Empty rows are noise. Occupied rooms print as
  rows; the vacancies follow as one compact line per building, collapsed into ranges —
  `Vacant: 1–7, 9–10, 12–24`. A building holding nobody that night is named with its vacancies and
  no grid at all.
- **On the board** (§9), vacant rooms are what you tap. The full grid stays exactly as it is.

Neither is a defect in the other, and a future reader who makes one match the other will be undoing
this. Both call sites say so.

**[v10] Meal services are seeded for every day of the event.** Three per day — Breakfast
09:00–11:00, Lunch 12:00–14:00, Dinner 18:30–20:30 — created when the event dates are set or
changed, with no location. They are ordinary rows from the moment they exist: edited, retimed,
reordered and deleted like any other. Partial arrival and departure days are trimmed by hand,
because the app cannot know which end of the day a group is travelling on.

Seeding fills gaps and does nothing else. It never duplicates a row, never overwrites an edited
one, and never resurrects one somebody deleted — which means the event has to remember which dates
it has already seeded, so that "not yet created" and "created and removed" are different states.
Narrowing the date range deletes nothing: §12.9 already reports an item dated outside the event,
and deleting a guest's dinner because a date moved is the kind of quiet loss this app exists to
avoid. **[v13]** Still true, and still not the whole answer: a range that *moves* rather than
narrows is one event on other days, and is offered its content (§5, v13 changes). The ledger moves
with the content, so seeding for the new range then finds those days already offered and creates
nothing.

**[v10] Itinerary rows are seeded three per day, blank and ready**, under the same discipline.

`seeded` is that memory: the dates each kind has already been offered for. It is bookkeeping rather
than document content, so it sits beside the arrays instead of in `meta`, and a file arriving
without it is treated as already seeded for its whole range — an event authored before v10 has the
meals somebody typed, and seeding over them would be the duplication this rule exists to prevent.

`customActivities` is the event's copy of the activity list (§6), written on save so the list
travels with the file.

**[v10] A guest cannot hold two rooms on the same night.** In the rooming editor the guest picker
omits anyone already assigned over a night that overlaps the row being filled, and says who it
omitted and why — a name missing from a list with no explanation reads as a bug. **Overlap, not
"assigned anywhere":** a guest in Mallard 3 on Saturday and Wigeon 5 on Sunday is ordinary turnover
and stays expressible. This is the correct behaviour rather than a guard; §12.4 is about a room
claimed twice, and this is the same fault from the guest's side.

**[v10] Printing is the primary output; saving a working copy is secondary.** Documents leave the
building as PDFs printed from the browser, and that is what the tool is for. The JSON stays — it is
still the source of truth (§3) and still the only thing that can reopen an event to amend or
duplicate it, which a PDF cannot — but it is the quieter of the two actions in the interface, and
it says what it is for.

### Changes from v10

**[v11] The rooming board exports as a self-contained file for ownership.** A read-and-rearrange
copy of the rooming sheet, sent as an attachment. It carries its own copy of the event and sends
nothing back. Ownership's changes are read off the screen, not merged. The board marks what changed
against the assignment it was exported with, so the differences are visible without comparing two
sheets by eye.

**[v11] There is no round trip, and that is a decision rather than a gap.** An import, a paste-back
blob and a sync were all considered and declined. Ownership rearranges rooms; Brian reads what they
did and either amends the event order himself or emails the staff. A merge would have to answer
what happens when both sides moved the same guest, and the answer nobody would trust is the one an
automatic merge gives.

**[v11] The exported board and the generator cannot disagree.** It is not a second implementation
of the rooming rules: the export inlines `js/rooming.js` and the pure parts of `js/derive.js`
verbatim, so the same move produces the same `rooming[]` in both. §11 names the files. The harness
checks that claim by making the same rearrangement on both sides and comparing the arrays.

### Changes from v11

Every rule in §12 has been written down since v2 and none of them has ever run. Reading them
against the code as it stands rather than as they were written, three needed correcting and one
needed a decision; the rest were right and are unchanged.

**[v12] Rule 4 distinguishes a room built for sharing from a room that is not.** "Same named room
claimed on the same night by two separate rooming rows" fires on the Bunk Room by design — it
sleeps twelve and routinely holds several unrelated parties, which is what it is for. Two rows on
a suite is worth a look; two rows on the Bunk Room is Tuesday. No capacity is modelled and none
should be (§5, v5 changes), so this cannot be computed from the data: the registry declares it.
`sharesFreely` (§6) is true for Lodge Bunk Rooms and nothing else, and rule 4 words its finding
differently for those rooms — a note saying who else is in there, rather than a warning that
something is wrong.

**[v12] Rule 6's `pooled` half is dormant, and stays.** Every building has been `named` since v9,
so "room specified on a `pooled` building" cannot currently fire — there is no pooled building for
it to fire on. The rule keeps both halves for the same reason `pooled` itself stays in the code
(§6): it costs nothing and the concept may return. The half that can fire — a room omitted on a
`named` building — is the one that matters now.

**[v12] `meta.touchedAt` — when the event was last edited.** Rule 11 asks whether `revisionDate`
is older than the most recent edit, and until now nothing recorded when an edit happened, so the
rule could not run. `update()` (§11, `app.js`) stamps `meta.touchedAt` on every write: it is the
one write path, so there is no edit it can miss.

The stamp is a **local** wall-clock string, `YYYY-MM-DDTHH:MM`, with no zone and no seconds —
the same convention as every other date in this app (§7: ISO strings, compared as strings, never
converted to `Date`). `toISOString()` was rejected outright: it is UTC, and an order revised at
seven in the evening in Missouri would be stamped with tomorrow's date and reported stale the
moment it was saved.

Rule 11 compares the date half against `revisionDate` and warns only when the revision line is
genuinely behind the work. Setting the revision date to today and then typing all afternoon fires
nothing; picking the order up the next morning and printing it without touching the revision line
does. A file arriving without `touchedAt` — anything saved before v12 — has never been edited by a
build that records it, and the rule stays quiet rather than guessing.

**[v12] Two rules were reported wrong against the current model, and are corrected.**
Neither was a change of mind; both were rules that had drifted out from under their own words.

*Rule 5* said "the `arrive`/`depart` of the guest it is booked under". That is v3 language, from
when a rooming row named one person. Since v5 a row names a *party* (§5, v5 changes) and `derive.js`
resolves "booked under" as the first name that happens to resolve, which is an ordering accident.
Read literally the rule warns about correct bookings — the harness fixture's Wetland runs from the
12th, is named by a guest arriving on the 13th and by one who is there from the 12th, and is right.
The rule now reads the party's whole span: a booking is outside the stay only when it holds a night
*nobody* it names is here for, and the sentence names whichever of them comes closest.

*Rule 6* covered a room against a `named` or `pooled` building and nothing else — but `migrate()`
leaves a row in a retired building or room exactly as it was authored on the stated grounds that
"§12.6 goes on reporting it every time the file is opened", and `assignmentModeFor` says the same.
Neither was true: migrate's one-shot summary was the only thing that ever mentioned it. `none` is a
mode, and a room set against it is a room set against its building's mode, so the rule covers it now
and those three comments are true.

**[v12] Findings have severity, and each finding names its subject.** Two levels, and the
difference between them is whether anybody needs to do anything:

- **warning** — something is probably wrong. A room claimed twice, a guest booked into a room
  after they leave, a name on a room that is not on the guest list.
- **note** — something deliberate, worth seeing before it becomes paper. Rule 1's explicit count
  overrides, rule 2's guests who are not on the rooming sheet, rule 4 on the Bunk Room. Each of
  these is a normal way to run an event, and each is also how a mistake looks.

A finding carries the rule number, the severity, one plain-language sentence, and enough identity
for the interface to take you to the thing it is about: which editor, which row ids, and the date
where the finding is about a night or a day. Ids are never shown — the sentence names the guest,
the room, or the meal (§12).

### Changes from v12

v12 shipped and was used against a real December order. Everything below is a correction that came
back off that run rather than a new idea. Four of them are the app being wrong about the property —
which buildings exist, what they are called, where a meal happens. Two are the app being loud about
the wrong things. One is the app handing a coordinator somebody else's event to start from.

**[v13] The location registry was wrong and is replaced.** The non-lodging list below was
transcribed from the events department's Loch Lloyd order in segment 1 and never checked against
the private side. Bucket Shop, Wood Shop, MRSO, Dock / Boathouse, Hummer Bar, Food Plot and Cottage
are not private-side locations. MRSO is the staff offices. The Food Plot is a snack nook in an RLI
hallway. The Wood Shop and the Hummer Bar are corporate-event spaces. The Bucket Shop is a gift
shop, whose hours belong in a note rather than in a location list. And there is no building called
Cottage — Mallard, Wigeon and Pintail *are* the cottages.

That list came out of a reference document, and it was right to take the document's structure. It
was wrong to take its contents: **a reference document is not a property inventory.** The structure
was reusable because every event order names places; the places themselves had to be asked about,
and were not. Anything else lifted from that order is suspect for the same reason.

**[v13] Lodging is grouped, and the Lodge's rooms are named directly.**

| Group | Buildings | Rooms |
|---|---|---|
| Cabins | Remington, Winchester | 1–4 each |
| Cottages | Mallard, Wigeon, Pintail | 1–8 each |
| Lodge | Bunk Room, Timber, Wetland | one room each, named as the building is |
| RLI | RLI | 1–24 |
| Clubhouse | Clubhouse, Clubhouse King Suite | 1–6, and King Suite |

"Lodge Lower Suites" and "Lodge Bunk Rooms" are gone as building names. Those rooms are known by
their own names — nobody says "the Lodge Lower Suites Timber", they say "the Timber" — and the
general description was noise wrapped round a room that already had a name. Each is now a
single-room building, exactly as the Clubhouse King Suite already was. The Bunk Room keeps
`sharesFreely` (§6 [v12]); the flag follows the room, not the old name.

Eleven buildings, then, where there were ten. The Clubhouse King Suite keeps its name: it is not
one of the three being renamed, and the name is what the file already carries.

**The groups are data, not layout.** They exist so that the building picker never splits a set
across a two-column grid. Remington landing beside Winchester, and the three cottages together, is
the whole point; a grid that put Pintail next to a Lodge room is what prompted this. Each group
lays out on its own, so a group of two is a row of two and a group of three is a row of three, and
no group is ever cut in half by a column boundary.

**[v13] Meal and activity locations.** The Wheel, The Clubhouse, The Lodge, Lake / Dock, and
**Other** for free text. The Clubhouse and the Lodge both host meals and both hold rooms; that is
ordinary on the private side and is not a duplication to be resolved — a building can be a bed and
a dining room in the same weekend. Lake / Dock is one place rather than two, and it is kept because
fishing gets planned.

**[v13] A retired name on a row is kept, and reported.** A meal or an itinerary row naming a
location this registry no longer carries keeps the words it was authored with: somebody planned
something there, and the words are the only record of it. A rooming row in a renamed building is
migrated by its room, which is unambiguous — `Lodge Lower Suites` + `Timber` can only be the
Timber. Everything the registry no longer recognises is reported by §12.13 every time the file is
opened, rather than by a migration summary nobody reads twice.

**[v13] Moving an event's whole date range carries its content.** Narrowing dates deletes nothing
(§5, v10 changes), which is right. Shifting is a different act: an event moved from November to
December is the same event on other days, and leaving every row behind strands the lot. An order
moved to December came back with forty-five findings, every one of them for content that had simply
not come with it.

So: when both `startDate` and `endDate` move by the same number of days, offer to shift every dated
row by that offset — schedule entries, meal services, rooming ranges, guest stays, and the seeding
ledger with them, so the days that arrive carrying content are not seeded a second time.

**Offer, never silently.** A coordinator correcting a mistyped year is not rescheduling anything,
and the two are indistinguishable from the data. The offer names the offset in days and counts what
would move before anything happens, and declining is one press and the default outcome: nothing at
all happens unless the offer is accepted. Any other change to the dates — one end alone, both ends
by different amounts — behaves exactly as it does now.

**The move is one interaction with the two date fields, and nothing longer.** The two ends are
typed one after the other, so the range passes through a half-move that is not yet anything; the
pair the offset is measured against is the pair as it stood before that. It is measured against
that pair for exactly as long as the coordinator is working on the dates. Any other edit — an
itinerary label, a guest, a file loaded — ends the move, and the next date edit takes its bearing
from the dates as they stand. An anchor that outlives the interaction is worse than no anchor
twice over: it goes stale, and it never re-takes, so an order whose dates were first typed in this
session could never raise the offer at all.

**Seeding is not held back for an answer.** The days the new range covers are seeded when the
dates are typed, exactly as on any other date change; an accepted shift takes those rows off again
before it moves anything, and it may, because they are blank, seconds old, and were put down by the
app rather than by a person. Holding them back instead would make an offer nobody answers cost the
event three unseeded days — the offer dies with the page, and a file arriving with a range and no
rows is recorded as already seeded (§5, v10 changes) and can never be offered them again.

**[v13] Rule 8 splits by severity.** A meal service with no menu block at all is a **note**. Nobody
writes a dish list for a nightcap, and since v10 every day of an event opens with three meal
services, so a fresh three-day event arrived with nine warnings against it before a word had been
typed — which is how a coordinator learns to stop reading the panel. A menu block that exists and
holds no dishes is the **warning**: that one was started and left unfinished, and it is the one
that prints a heading with nothing under it.

**[v13] A new order is the way in, and the sample is plainly a sample.** Load sample opened a
November event; a coordinator who started there and then typed real dates over it inherited
somebody else's guests, meals and rooms. New is the obvious way to start a real order now — it is
the primary action, it asks nothing when there is nothing to discard, and it lands on the date
fields, which are the two that everything else reads from (§5, v2 changes). The sample stays, says
in its own name that it is a sample, and asks before replacing work in progress.

### Changes from v13

Both of these came back off a real event being built rather than out of a design. Neither adds a
field, a document, or anything to the model: they are two places the tool made somebody type the
same thing over and over, and the correction in each case is a way of saying it once.

**[v14] A day's itinerary can be copied onto another day.** A private-side weekend repeats itself —
hunting out at 05:00 and back by 09:00, downtime 11:00 to 12:00, the same shape on Friday, Saturday
and Sunday. Typed by hand that is one day's rows written three times, and the third time is where
the typo lands. Each day of the itinerary preview carries the action, because the day block is the
only place in that editor where a day exists as a thing to point at; the rows themselves are one
flat list.

Four things that action deliberately does not do:

- **It does not copy meals.** `foodAndBev[]` is seeded for every day in range (§5, v10 changes), so
  copying breakfast across would serve it twice. The interface says so where the action lives, in a
  few words — an omission nobody explains reads as a defect.
- **It copies one day onto one day.** Not "fill the rest of the week". A coordinator who wants three
  days presses it three times and reads three answers; the one who wanted a single day has not had
  two more to undo.
- **It carries what somebody wrote.** The blank rows seeding leaves are not content, so a day nobody
  has written yet copies nothing at all rather than quietly clearing the day it was aimed at.
- **It never overwrites content.** The target day usually holds the three blank rows seeding put
  there, and those are cleared first so the copies do not land underneath them. A row somebody typed
  into stays exactly where it is and the copies go in beside it. The test for "still exactly as
  seeding made it" is the one an accepted date shift already uses (§5, v13 changes), moved into
  `seed.js` beside the code that makes those rows.

Every copy is a new row with a fresh `newId()` — an id is never reused, because two rows sharing one
is two rows sharing one node in the reconciler. The whole copy is a single `update()`: eleven rows
arriving is one step, one render and one entry in the autosave, not eleven. Afterwards the panel
says how many rows were copied and how many blanks were cleared, in those words.

**[v14] Guests can be added as a list of names.** Nine guests was nine rows opened one at a time and
nine sets of fields tabbed through, when the names had arrived as a list in the first place. They
are pasted as a list now — one name a line — and become one attendee row each, with arrivals,
departures, child flags and dietary notes filled in afterwards in the rows that then exist.

**The parse is a guess and is treated as one.** A line with a comma is `Last, First`, which the
comma settles. A line without one is `First Last`, with the last word taken as the surname — and
that is wrong for every compound surname on the property's lists: Van Der Berg, De La Cruz, St John.
A longer list of particles does not fix it, because `Anneke Van Der Berg` and `Mary Anne Berg` are
the same shape and only the person typing knows which is which. So **nothing is written on the
strength of the parse**: what was read is shown as editable first and last fields first, and the
write happens after somebody has looked at it. One wrong guess is a nuisance; twenty committed in
silence is worse than having typed them by hand.

The rest of the rules it follows:

- Blank lines are ignored; every line is trimmed end to end.
- A line yielding one word is a first name with an empty surname — Cher — shown that way to be
  corrected rather than guessed at.
- A line naming somebody already on the guest list is **flagged and never blocked**, and can be
  unticked out of the batch. Two guests genuinely can share a name, which is the reason rows carry
  ids (§5 [v4]); what the flag buys is the other case, a list pasted twice.
- Every row committed gets a fresh `newId()` and the event's default arrive and depart — an empty
  string at each end, which is what "follow the event dates" is stored as (§5, v2 changes) and
  exactly what adding one guest leaves behind.
- The whole batch is a single `update()`.

**Adding one guest is still one button.** Most guests are added one at a time, and a list box is the
wrong amount of ceremony for one name.

## 6. Static reference data

Seeded in `js/reference.js`. Not part of event JSON.

**[v13] Lodging.** Eleven buildings in five groups, in this display order, which is the order
they get used in — least-assigned first, group by group:

| Group | Building | Rooms | Labels |
|---|---|---|---|
| Cabins | Remington | 4 | 1–4 |
| Cabins | Winchester | 4 | 1–4 |
| Cottages | Mallard | 8 | 1–8 |
| Cottages | Wigeon | 8 | 1–8 |
| Cottages | Pintail | 8 | 1–8 |
| Lodge | Bunk Room | 1 | Bunk Room |
| Lodge | Timber | 1 | Timber |
| Lodge | Wetland | 1 | Wetland |
| RLI | RLI | 24 | 1–24 |
| Clubhouse | Clubhouse | 6 | 1–6 |
| Clubhouse | Clubhouse King Suite | 1 | King Suite |

The group is property data and is carried as data: a building belongs to exactly one, and the
building picker draws each group under its own heading and lays it out on its own, so a set is
never split across a column boundary (§5, v13 changes).

Every one of them is `named`: rooms are assigned room by room, and the grid in the editor and on
the Rooming Assignment shows every room in inventory, occupied or vacant. The Bunk Room sleeps
twelve. The three Lodge buildings and the Clubhouse King Suite hold one room each, named as the
building is — a single-room building is how a room that is assigned on its own is modelled here,
and there is nothing else to say about the Timber than that it is the Timber.

**[v13] Renamed, and how a file carrying the old names is answered.** `Lodge Lower Suites` and
`Lodge Bunk Rooms` were building names until v13. A rooming row is migrated by its room, which is
unambiguous — `Lodge Lower Suites` + `Timber` can only be the Timber — and the same row in the
buildings-in-use list is renamed where one name maps to one building and expanded from the rooming
rows where it does not. Anything the registry cannot place is kept exactly as authored and reported
by §12.13, never remapped and never dropped (§5, v9 changes).

**[v12] `sharesFreely`.** One flag, true for **Lodge Bunk Rooms** and nothing else. It is not
capacity — nothing here models capacity (§5, v5 changes) — and it does not change how a room is
assigned or printed. It says only that two separate parties in that room on the same night is the
normal use of it, so §12.4 reports the Bunk Room as a note naming who else is in there, and every
other room as a warning. A second building that shares this way would set the flag; nothing
computes it.

**[v13] There is no separate list of non-lodging buildings.** The one v9 carried was wrong (§5,
v13 changes) and is replaced by the location list below, which is what that list was being used for.
"Lodge" and "Red Leaf Inn" are not building names either — the registry above names their parts.

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

**[v13] Meal and activity locations.** A short list, because it happens in the same few places:
The Wheel, The Clubhouse, The Lodge, Lake / Dock, and **Other**, which takes free text and is
stored as that text. Nothing distinguishes a listed location from a typed one in the file —
`location` is one string either way, which is why §12.13 reports only names the registry has
actually retired and never a location somebody typed.

The Clubhouse and the Lodge are on this list and in the lodging registry above. That is ordinary
and is not a duplication to resolve: a building can be a bed and a dining room in the same weekend.
Lake / Dock is one place rather than the two v9 carried, and it is kept because fishing gets
planned.

**[v10] Activities.** The itinerary's own list: Early Arrivals, Guest Arrivals, Duck Hunting,
Hunting, Late-Night Wheel Use, and **Other**, which takes free text and can be added to the list
for good.

A custom activity outlives the event it was typed into, so it cannot live only in the event JSON.
It is kept in `localStorage` under its own key — separate from the autosave, which is one event and
is overwritten — *and* written into the saved event, so it travels to another machine with the
file. Both are merged on load, deduplicating case-insensitively. Removing a custom activity takes
it off the list and touches no event that used it: the activity is a suggestion, and the events
that used it hold their own copy of the words.

~~**[v2] Schedule label suggestions** (autocomplete only, free text always allowed)~~ — **[v10]**
superseded by the activity list above. The v2 list was thirteen autocomplete hints over a free-text
field, half of them meals that now come from `foodAndBev[]` and appear on the itinerary by
themselves (§7 [v7]). What is left is what an itinerary row actually says, and it is a list rather
than a hint.

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

**C. Rooming Assignment** — **[v10]** the **occupied** rooms by building, rooms down and nights
across, with each building's vacancies on one line beneath it as collapsed ranges, and the callout
naming guests staying with no room that night. A building holding nobody that night is named with
its vacancies and prints no grid. The full inventory grid belongs to the board (§9), where a vacant
room is a thing you tap; on paper it is thirty-one rows to read six. **[v7]** Always generated; never a section
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
- Each building renders as a room grid; drag a guest onto a room, or tap guest then tap room on
  touch. **[v9]** Every lodging building is room-numbered, so every one of them is a grid; the
  single drop area a `pooled` building used to get is unused
- Rooms show occupied / vacant for the selected night only. **[v10] Every room in inventory stays
  on the board**, vacant ones included — they are the targets. This is deliberately *not* what the
  printed sheet does (§8 C), and the divergence is the point rather than a drift to be tidied
- **[v10]** The guest picker in the row editor omits anyone already assigned over an overlapping
  night, and says so
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

**[v10] This is the primary output.** Print is reachable from the shell without opening a document
first, and it names which of the three it is about to print. Saving the JSON is the secondary
action and is worded as what it is: a working copy, for reopening an event to amend or duplicate.

**[v13] The header is one row, and it stays one row.** It is sticky, so its height is rent every
screen pays for as long as the tool is open, and at a third of a phone screen it had stopped being
furniture. The event's name truncates rather than wrapping; the controls are icons with their words
beside them, and it is the words that go as the screen narrows, never the control. Below 960px the
four view destinations take a second full-bleed row of their own and read as tabs. Print still names
its document: the select where there is room for one, and below 640px the button's own caption,
which follows the document tab last opened. What is outstanding (§12) is a line beside Print, and
below 768px an amber dot on it — still announced, never merely switched off.

**[v13] The file actions rank the same way, and New leads them.** An order that begins as a copy of
the sample prints somebody else's guests, so New is the primary action of the four, it asks nothing
when there is nothing to discard, and it puts the caret in the start date. Load sample is the
quietest of the four, names itself a sample, and confirms before it replaces work in progress. The
four sit together in a menu behind one button on the header rather than on the header itself, with
the two notes that explain them — which is what lets the notes be there at every width instead of
being the first thing dropped on a tablet. The app still opens on the autosave where there is one
and on an empty order where there is not — never on the sample.

**[v14] Itinerary rows and guests are entered two ways each, and the single row leads both.** Add
entry and Add guest are unchanged and are still the first control in each editor: one row, one
press, the caret in the field that gets typed into first. Beside each of them is the way in for the
case that was costing a coordinator an afternoon — a day of the itinerary copied onto another day,
and a list of names pasted one to a line and turned into a row each. Both of the second kind say
what they are about to do before they do it: the copy names the day, the row count and how many
blank rows it will clear, and the list shows what it read out of each line as editable first and
last names before a single guest is written. Each is one `update()`, so a batch is one step and not
eleven. §5 (v14 changes) has the reasoning.

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
/index.html          application shell — the board mounts inside it (see below)
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
/js/seed.js          [v10] the meals and itinerary rows a day starts with
/js/shift.js         [v13] a date range that moves, and the rows that move with it
/js/copyday.js       [v14] one day's itinerary copied onto another day
/js/names.js         [v14] a typed list of names read into first and last names
/js/activities.js    [v10] the itinerary's activity list, and where a custom one lives
/js/render.js        document shell — page furniture, brand header, print
/js/renders/         one module per document: order, menu, rooming
/js/include.js       [v9] what meta.includeInOrder appends to the Event Order
/js/views.js         edit / document destinations, and the per-document print
/js/rooming.js       the rooming board — the transforms, and the in-app board
/js/ownership.js     [v11] the board ownership is sent, built on the same transforms
/css/ownership.css   [v11] its own visual system — a screen, not a document
/js/export.js        [v11] the self-contained export: inlining, the logo, the file
/js/validate.js      [v12] the §12 rules — an event in, findings out
/js/io.js            JSON download / upload, localStorage autosave
/data/sample.json    fixture for development
/logos/              brand logos, one per registry entry (§6)
```

**[v11] There is no `/rooming.html`.** v2 listed the board as a standalone page and that was
wrong: §9 puts two ways into `rooming[]` — the board and the typed rows — and a change made in one
has to be in the other with no reload. A second page cannot do that without shared state, which is
the thing v1 explicitly does not have. So the board mounts inside `index.html`, in the rooming
block, behind a **Board / Rows** switch; both are mounted for the life of the session and both are
handed every change. `js/rooming.js` is still self-contained in the sense §9 asks for — an event
in, a new event out — and `js/ownership.js` is the proof of it: a second caller, in a file with no
application state anywhere near it.

## 12. Validation rules

Run before any print. **Warn, do not block** — Brian knows things the app does not.

**[v12] Every finding carries a severity and names its subject.** *warning* is something probably
wrong; *note* is something deliberate that is worth seeing before it becomes paper. Each finding
holds the rule number, the severity, one plain-language sentence, and the identity the interface
needs to take you to it — the editor it belongs to, the row ids concerned, and the date where the
finding is about a night or a day.

**The sentence names the thing, never the rule and never an id.** Not "Rule 5 violation: rooming
row out of range" but "Dana Reyes has the Timber on Nov 16, but she leaves on the 15th." These are
read at speed by somebody about to hand paper to ownership: what is wrong, where, and what would
fix it, in one sentence.

| # | Rule | Severity |
|---|---|---|
| 1 | Any F&B entry counted by explicit override — `countBasis: "custom"`, or **[v5]** `serves: "custom"` — surface it. **[v12]** An override with no usable number on it is not an explicit override, it is one that was started and left: `fnbCount` short-circuits to `Number(count)`, and `Number(null)` is 0, so the order and every menu block print 0 covers | note, or a warning where no usable number is set |
| 2 | Attendee staying overnight named on no room assignment covering that night. **[v5]** Not a fault: spouses and children rooming with family are deliberately off the sheet | note |
| 3 | **[v4]** Rooming row naming a guest it cannot resolve — a `guestIds` entry matching no attendee, or **[v5]** a legacy `guest` name migration could not match. Usually a deleted guest. A row naming nobody at all is not an orphan: it is a room held under no name yet | warning |
| 4 | **[v3]** Same named room claimed on the same night by **[v5]** two separate rooming rows. Several names on one row is a party sharing a room, never a conflict. **[v12]** On a `sharesFreely` room (§6 — the Bunk Room, and nothing else) this is the normal use of the room: a note naming who else is in there | warning, or a note on a `sharesFreely` room |
| 5 | **[v3]** Rooming row whose `from`/`to` range falls outside the `arrive`/`depart` of the guest it is booked under | warning |
| 6 | **[v3]** Room specified on a `pooled` building, or omitted on a `named` building. **[v12]** The `pooled` half cannot currently fire: every building has been `named` since v9 and there is no pooled building for it to fire on. Both halves stay, for the reason `pooled` itself stays (§6). **[v12]** And a building or a room the registry no longer carries is this rule as well — `migrate()` leaves such a row exactly as it was authored on the stated grounds that "§12.6 goes on reporting it every time the file is opened", and until v12 nothing did | warning |
| 7 | Menu block referencing a nonexistent `fnbId` | warning |
| 8 | F&B entry with no menu block, **[v13]** or with one that holds no dishes. The two are different things: nobody writes a dish list for a nightcap, and v10 seeds three services a day, so a fresh event would open with nine warnings on it before a word was typed. A block that exists and is empty was started and left, and prints a heading with nothing under it | **[v13]** note where there is no block, warning where the block is empty |
| 9 | Schedule or F&B item dated outside `startDate`–`endDate` | warning |
| 10 | Attendee `depart` earlier than `arrive` | warning |
| 11 | `revisionDate` older than the most recent edit. **[v12]** The most recent edit is `meta.touchedAt` (§5), stamped by `update()`. A file with no `touchedAt` has never been edited by a build that records one, and the rule stays quiet rather than guessing | warning |
| 12 | **[v7]** A `schedule[]` entry whose label matches an F&B meal on the same date at the same time — a meal typed into both arrays, which will now print twice on the merged itinerary (§7) | warning |
| 13 | **[v13]** A name the property registry no longer carries: a meal or itinerary row whose `location` is one of the locations v13 retired (§6), or a building named in `buildingsInUse[]` or `overflowBuildings[]` that is not in the lodging registry. The row keeps the words it was authored with — somebody planned something there — and this is what goes on saying so. Only retired names are reported for a location, never a typed one: `location` is free text and the file cannot tell the two apart (§6) | note |

**[v12] A rule that cannot fire is still written.** `js/validate.js` holds one function per rule,
whether or not the current model can trip it, each commented with what it is protecting against.
A rule silently absent from the module is indistinguishable from a rule that passes, and the next
reader has no way to tell which of the thirteen were implemented.

**[v12] Findings reach Brian in two places, and they are different jobs.**

- **In the editor**, quietly and continuously. A section holding findings is marked in the
  navigator; the row concerned is marked in place, beside the guest or the room or the meal it is
  about. Nothing modal, nothing that interrupts typing.
- **Before printing**, deliberately. Printing is the moment a mistake becomes paper somebody acts
  on, so the print action shows what is outstanding first — grouped by severity, warnings before
  notes, each item a way into the thing it is about — and then lets the print proceed. A print
  raised from the keyboard cannot be intercepted and is not blocked either; the editor has been
  saying the same thing all along.

Nothing outstanding is said briefly and then got out of the way: no dialog, no summary of what was
checked, and no congratulations. A clean event prints.

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
