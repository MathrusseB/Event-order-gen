# EVENT-ORDER-GEN — Build Spec v2

Static document generator for Maple Ranch private-side event orders, menus, and rooming lists.

**Repo:** `MathrusseB/EVENT-ORDER-GEN`
**Deploy:** `event-order-gen-production.up.railway.app`

Supersedes v1. Changes are marked **[v2]**.

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
    { "last": "Illig",   "first": "Brian", "arrive": "2026-11-14", "depart": "2026-11-16", "note": "" },
    { "last": "Palmer",  "first": "Kim",   "arrive": "2026-11-15", "depart": "2026-11-16", "note": "Arriving late" },
    { "last": "Baldwin", "first": "Chase", "arrive": "2026-11-14", "depart": "2026-11-14", "note": "Day guest, departing after dinner" }
  ],

  "rooming": [
    { "building": "Lodge",        "room": "Brian's Suite", "guest": "Brian Illig" },
    { "building": "Red Leaf Inn", "room": "8",             "guest": "Kim Palmer" }
  ],

  "schedule": [
    { "date": "2026-11-14", "start": "05:00", "end": "10:00", "label": "Duck Hunt" },
    { "date": "2026-11-14", "start": "10:30", "end": null,    "label": "Breakfast - Wheel" },
    { "date": "2026-11-14", "start": "11:00", "end": "16:00", "label": "Downtime" },
    { "date": "2026-11-14", "start": "18:00", "end": null,    "label": "Dinner - Wheel" }
  ],

  "foodAndBev": [
    { "id": "sat-dinner", "date": "2026-11-14", "start": "18:00", "end": null,
      "meal": "Dinner", "location": "The Wheel", "countBasis": "present" }
  ],

  "menu": [
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

  "departments": [],

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

## 6. Static reference data

Seeded in `js/reference.js`. Not part of event JSON.

**Buildings:** Red Leaf Inn (RLI), The Wheel, Bucket Shop, Lodge, Wood Shop, MRSO,
Dock / Boathouse, Hummer Bar, Food Plot, Lake, Cottage

**Red Leaf Inn rooms**
- King: 2, 4, 6, 8 (Exec Suite), 10, 12, 14, 16, 18, 20 (Exec Suite), 22, 24
- Double Queen: 1, 3, 5, 7, 9, 11 (Suite), 13, 15, 17, 19, 21, 23 (Suite)

**Lodge rooms:** Master Suite, Brian's Suite, Michael's Suite, Timber Suite, Wetland Suite,
Basement Office Suite, Upland Suite, Bunk Room

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
| Rooms by building | count of `rooming[]` grouped by building |
| F&B attendee count | per `countBasis` — `present`, `overnight`, or `custom` |
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

- Two panes — unassigned guests on one side, room grid by building on the other
- Drag a guest onto a room, or tap guest then tap room on touch
- Rooms show occupied / vacant state at a glance
- Dragging onto an occupied room offers swap or replace
- Undo for the last ten moves
- Reflects immediately in the Rooming render and in any derived counts
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
/js/derive.js        derived counts and grouping, pure (see §7)
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

1. Any F&B entry with `countBasis: "custom"` — surface the override explicitly
2. Attendee staying overnight with no room assignment
3. Room assigned to a name not in the attendee list
4. Menu block referencing a nonexistent `fnbId`
5. F&B entry with no menu block
6. Schedule or F&B item dated outside `startDate`–`endDate`
7. Attendee `depart` earlier than `arrive`
8. `revisionDate` older than the most recent edit

## 13. Open items

- Whether `staff` renders grouped by person or by daypart as the default
- Whether allergies live in `meta` or as their own section type

## 14. Resolved

- ~~Which departments exist on the private side~~ — same structure as corporate, but rarely used.
  Now optional and off by default; `staff[]` covers the normal case.
- ~~Additional sample orders needed~~ — not blocking. No boilerplate library is being written;
  every section is authored per event.
- ~~Ownership rooming access~~ — deferred to a later version, but treated as expected. `rooming.js`
  is built as a portable module now so the hosted-state swap is cheap. See §9.
