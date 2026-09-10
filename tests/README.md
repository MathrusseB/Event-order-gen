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

**`checks/rooming.mjs` — the board writes one row per stretch, not one per
night.** BUILD-SPEC §9: assigning a guest across consecutive nights makes one
row with a spanning range, and taking them out of a room for one night in the
middle of a stay splits the row around it. That is a claim about `rooming[]`
rather than about pixels, so it runs against `js/rooming.js` directly, in Node,
with no browser involved — which is possible only because §9's portability
decision means the module takes an event in and hands a new one back.

## Fixtures

`fixtures/` is test data and is not `data/sample.json`. The sample is the event
a user loads to see what the tool does; these exist to be printed at sizes
nobody would choose to look at.

- `large-event.json` — five days, 26 guests, a full Lodge, a mid-event turnover
  in the Timber Suite, and every section enabled. Every document runs to several
  pages.
- `empty-event.json` — no dates, no guests, no sections. The degenerate case:
  three documents with nothing to say, which must still be one page each.
