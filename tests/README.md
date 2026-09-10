# Harness

```
node tests/run.mjs              run every check
node tests/run.mjs --out pdfs   and keep the PDFs it printed, to look at
```

Needs Playwright and its Chromium, borrowed from a local or global install:

```
npm install -g playwright && npx playwright install chromium
```

Nothing here ships. The application still has no dependencies and no build step
(BUILD-SPEC §3) — this directory has no `package.json`, installs nothing, and
serves the repository exactly as Railway does.

## What is checked

**`checks/pagination.mjs` — every printed page carries body content.**
BUILD-SPEC §10 calls printing the one thing about printing worth testing by
printing, and this is that. Each of the three documents is printed to PDF for
three events — the sample, an event large enough to run every document past one
page, and an empty one — and each page is examined for body content.

A document one line too long for a page paginates, and its second page is
correct. A page carrying the running header, the footer and nothing else is a
defect: it is empty space *below* the last line of the document being pushed
onto a sheet of its own. The Rooming Assignment printed one for the sample
event, from 20px of margin under its final section.

Each document is printed twice: once as it really prints, and once with the
running header made `visibility: hidden` and the footer margin boxes emptied.
The header keeps its box, so the second print paginates identically — which is
itself checked — but nothing on it was drawn by the furniture. Every mark left
on that print came from the document body, so a page with no marks is a page
with an empty body. `lib/pdf.mjs` reads the marks; it decodes no text and needs
no PDF library.

[v12] It also prints the sample event's Event Order twice, once with the
pre-print findings panel open on screen. §12's second destination is a panel
raised at the moment of printing, which makes it the one surface that can be up
while a print is running — a keyboard print reaches `window.print()` without
going near the button that would have closed it — and §8 [v8] says nothing but
the document may be in the output. The two prints are compared page for page and
mark for mark. Reading `display: none` out of print.css would be cheaper and
would prove nothing: the rule is `body > *`, and the risk is a future panel that
stops being a child of `<body>`.

**`checks/rooming.mjs` — the board writes one row per stretch, not one per
night.** BUILD-SPEC §9: assigning a guest across consecutive nights makes one
row with a spanning range, and taking them out of a room for one night in the
middle of a stay splits the row around it. That is a claim about `rooming[]`
rather than about pixels, so it runs against `js/rooming.js` directly, in Node,
with no browser involved — which is possible only because §9's portability
decision means the module takes an event in and hands a new one back.

**`checks/export.mjs` — the board ownership is sent, and the claim that it is
not a second implementation.** BUILD-SPEC §5 [v11]: the rooming board exports as
one self-contained HTML file, opened by tapping an attachment. Four things are
checked, and none of them can be checked by reading the code.

It is built through the same call the button makes, then written to a temporary
file and opened over `file://` **with every request that is not the file itself
aborted** — so "works with no network" is a measurement rather than an
intention. The live document is then walked for anything pointing outside
itself: an `src`, an `href`, an `@import`, a `@font-face`, a `url()` in any
stylesheet rule. The size is checked against §5's 500KB ceiling, with the logo's
share reported beside it.

The fourth is the one that matters. The same six moves — a placement carried
through the nights after it, a room joined, a swap, a guest taken out of a room
and left with none, and a room in a building the exported board has folded away
— are tapped out twice: once on the board in `index.html`, once on the exported
board with the network cut. Then the two `rooming[]` arrays are compared row for
row. Row ids the source event carried are compared as themselves; ids minted
during the run (a split calls `newId`) are compared as `new`, which still checks
that the same rows were split in the same places and rejoined the same way. A
second check confirms the moves changed the array at all, so a pair of boards
that both did nothing cannot pass.

That check is why the export inlines `js/rooming.js` instead of reimplementing
it, and it is the thing that keeps that true. Both boards' Rooming Assignments
are printed and compared too, page count and ink: §5 [v11] asks for paper from
the board to match paper from the app.

**`checks/migration.mjs` — every shape this app has written still opens.**
BUILD-SPEC §5: the JSON file is the source of truth, and files saved by earlier
builds are on the machine right now. Each generation is checked on the shape as
it was actually written — a pre-v4 rooming row naming a guest by name, a v4
`guestId`, a v5 party, v7 `rooming` and `menu` sections, v8 menu courses and
Lodge suites — along with the rule that matters most on the v9 registry change:
a room that has left the property registry is reported and **left alone**, never
remapped and never dropped. The run is checked to be idempotent, and to leave
the caller's event untouched.

**`checks/entry.mjs` — seeding, vacancies, and one guest in one room.** The
three v10 rules that are easy to state and easy to break later. Seeding fills
gaps and does nothing else: the checks cover a second pass, an edited row, a day
trimmed by hand, a narrowed range and a widened one, and a day added to the
front of an event. Vacancies collapse into ranges and a named room never joins
one. And a guest cannot hold two rooms on the same night, while turnover between
two rooms on consecutive nights stays expressible — the difference between
overlap and "assigned anywhere".

**`checks/validation.mjs` — the twelve rules of §12, and what must not trip
them.** BUILD-SPEC §12: every rule had been written down since v2 and none of
them had ever run. Each gets an event that trips it and an event that does not,
against `js/validate.js` directly in Node — an event in, findings out, so there
is nothing to render and no browser to start.

The negative cases are the point. A rule that fires on everything is worse than
a rule that never fires: it teaches the coordinator to stop reading the panel,
and then the finding that mattered goes past unread. So the checks name the
cases that must stay silent — several names on one rooming row, turnover between
two rooms on consecutive nights, a room held under no name yet, a day guest, a
blank seeded itinerary row, a file saved before v12 with no `touchedAt` — and
the two that must fire as *notes* rather than warnings: two parties in the Bunk
Room, and a count set by hand on purpose.

Three checks are about the module rather than about any one rule. One event
trips all twelve, which is how a rule that was never written is told from a rule
that always passes. Validating a deeply frozen event must not throw, which is
what "pure" means here. And every finding is read back as English: no ISO date,
no row id, no rule number, and a finished sentence.

## Fixtures

`fixtures/` is test data and is not `data/sample.json`. The sample is the event
a user loads to see what the tool does; these exist to be printed at sizes
nobody would choose to look at.

- `large-event.json` — five days, 26 guests, a full Lodge, a mid-event turnover
  in the Timber Suite, and every section enabled. Every document runs to several
  pages.
- `empty-event.json` — no dates, no guests, no sections. The degenerate case:
  three documents with nothing to say, which must still be one page each.
