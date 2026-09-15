# The editing-core rewrite

TODO 3.1. Decided 2026-09-06 — D6 in [DECISIONS.md](DECISIONS.md) is the
decision, this file is the design and the plan. It used to be the "Mandy 2.0"
section of [ROADMAP.md](ROADMAP.md), an option kept for after 1.0; it is 1.0
work now, and the reason is in the first section below.

Read D0, D1 and D4 in [DECISIONS.md](DECISIONS.md) first. D0 is what the
rewrite must not compromise (the user edits a document, never markup), D1 is
what it must preserve (a saved file gets its own bytes back), and D4 is what it
retires (execCommand plus normalisation, the treatment this is the cure for).

[MARKDOWN.md](MARKDOWN.md) is the feature checklist the stages below are
measured against: every construct in both Markdown Guide cheat sheets, where it
stands today on render / author / round-trip, and the decisions the rewrite has
to make rather than inherit by omission.

## Why now rather than after 1.0

The rewrite was parked behind 1.0 on a rule ROADMAP.md recorded on 2026-09-03:
twice a cluster of contenteditable bugs had forced a piece of the engine's
behaviour to be replaced with hand-rolled DOM surgery — `outdentListItem`, then
the empty-`<li>` Enter/Backspace handler — and **a third such cluster would
reclassify the rewrite from a roadmap item to a 1.0 blocker**, because past
that point the hand-rolls are the input-layer spec being discovered one
keystroke at a time, in the worst possible order.

Three things made the rule fire before a third cluster landed.

**Tables are not a third cluster, they are five.** TODO 1.1.8 needs cell
navigation, row and column insertion and deletion, Enter and Backspace at a
cell edge, paste into a cell, and a way to coexist with each engine's native
table editing — Firefox has its own resize handles and cell behaviour inside a
`contenteditable` table, Chrome lets Backspace at a cell boundary delete cells.
Every one of those is DOM surgery on a structure contenteditable does not
understand, measured in three engines. Starting 1.1.8 on the old core *is* the
rule firing, so "finish 1.0 first" really meant "blockquotes and images, then
hit the wall at tables having gained a week".

**The two paths are not additive.** The obvious arithmetic — a fortnight of
fixes, then a fortnight of rewrite, then a fortnight re-implementing the fixes —
double counts. The fix work is mostly discarded by the rewrite: a blockquote
hand-roll, table grid surgery inside contenteditable, the caret-preserving
U+00A0 normalisation TODO 1.4 wants, the undo offset bug in 1.6, and any further
list surgery all target a layer the rewrite deletes. And the rewrite does not
*re-implement* those features, it makes them trivial: in a model a table row is
an array element, a blockquote is a block type, and U+00A0 never exists. What
the rewrite costs is the core — model, render, input interception, selection
mapping — which has no counterpart today and costs the same whether it is built
now or later. So fix-first is the rewrite's cost plus two to three weeks that
mostly evaporate, in exchange for a 1.0 that ships on a foundation about to be
replaced.

**Nobody is waiting on a dated 1.0.** That is the one case where fix-first
wins: it gets a shippable 1.0 in two to three weeks and the rewrite means five to
eight without one. With no release date, that advantage is worth nothing, and
`main` keeps working throughout because the rewrite lives on a branch.

## What it is

Hold the document as a model in JS. Render the model to the DOM. Treat
contenteditable as an **input method** whose intentions are intercepted and
reinterpreted as model edits, rather than as a data structure whose mutations
are trusted and cleaned up afterwards.

Today's design, for contrast, is in CLAUDE.md's "Document state" section: the
document *is* `editor.innerHTML`, markdown-it produces it on the way in,
Turndown reads it on the way out, and everything between — execCommand,
`normaliseEditorMarkup`, `undo.js`'s innerHTML snapshots, the Turndown rules
that reconstruct Mermaid and LaTeX source from stashed copies, the content-keyed
block index in `markdown-style.js` — exists to compensate for the fact that the
browser owns the document and does what it likes with it.

After the rewrite the model owns the document. The DOM is a view of it. The
browser's editing engine still supplies the caret, selection, IME, autocorrect,
spellcheck and the platform's keyboard conventions — the half D4 correctly said
was moving and worth keeping — but what it *does* to the document is asked for,
not accepted.

## The model

Three constraints, two from the old roadmap entry and one new.

**It is markdown-shaped, with source spans.** Not a generic rich-text document
model. ProseMirror, Lexical and Slate all normalise on the way in, and
normalising is precisely what destroys the information D1 exists to preserve;
ported onto one of those, D1 stops being true. Built markdown-shaped from the
start, a source span on each node is *better* than today's content-keyed
matching, because a span cannot be defeated by two identical paragraphs.

**It carries no new engine dependency.** Building a model, schema,
transactional undo, selection mapping and renderer from scratch is where most
editor projects die; adopting an existing engine makes it tractable and
contradicts what this project is. That call is made here, deliberately: **no
engine.** The scope that makes this survivable is in the next constraint. If
the spike below fails, this is the constraint to reopen first — not the model
shape.

**It is block-granular, and it keeps markdown-it as the parser.** This is the
new one, and it is what keeps the estimate at weeks rather than months. The
model is an ordered list of blocks. Each block holds:

- `source` — the exact bytes the block arrived with, or `null` once it has been
  edited or if it was created in the editor.
- The parsed content: markdown-it's token tree for that block, held as the
  editable structure — paragraph inlines, list items and their children,
  table rows and cells, a fence's language and body.
- The separator that followed it in the source (one blank line, none, two), for
  the same tight-versus-loose reason `markdownSegments` carries it today.

Block boundaries come from markdown-it's own block tokens, whose `map` gives
the source line range of every top-level block. That is a source span for free,
at exactly the granularity ROADMAP.md's "Save fidelity past the point of
diminishing returns" section already accepted as final: an edit anywhere in a
paragraph re-serialises that paragraph. Nothing finer was ever promised. No
CommonMark parser is written; markdown-it 13.0.1 stays, with the `math` and
`referenceAwareLink` rules it already carries.

Serialising is then two cases per block. Untouched: emit `source`. Edited: emit
the serialiser's output for that block, in the sniffed style — the same
`sniffMarkdownStyle` conventions and the same `reflowMarkdown` that exist today,
now applied to one block rather than to a whole document that then has most of
itself restored. `indexMarkdownBlocks` and `restoreSourceWrapping` go: the
content-keyed index was a way to find a block's source without a source map,
and the model has one.

Three consequences that used to be problems:

- **Reference definitions get a home.** markdown-it consumes `[label]: url`
  lines and emits no token for them, which is why today they have no DOM node
  to survive on and are collected once at the end of the file. In the model,
  any source line no block token's `map` covers is kept as an invisible block
  with its own `source`, in its own position, rendered to nothing. The
  definition stays where the author put it, byte for byte. The
  `referenceAwareLink` stamp is still needed so an *edited* paragraph
  re-emits `[text][label]` rather than an inline link.
- **Mermaid and LaTeX stop needing a stash.** The model holds the fence body
  and the TeX. Rendering is one-directional: the DOM view of a mermaid fence is
  the SVG, the view of maths is MathJax's output, and nothing ever has to be
  read back out of either. `renderers.js` loses `stampLatexSource` and the
  `.mermaid-source` element; the two Turndown rules go with them.
- **Invisible whitespace cannot enter the file.** `insertText` carrying U+00A0
  is normalised at the model boundary, once. TODO 1.4's live-DOM leak is closed
  by construction rather than by a caret-preserving text-node rewrite.

## Rendering

Each block renders to one DOM subtree under `#editor`, tagged with the block's
index (a `data-` attribute, never an id — ids are what `headingAnchors` stamps
on the static export's clone, and the two must not collide). A model change
re-renders **only the blocks it touched**, via `innerHTML` on that block's
element from markdown-it's renderer, then restores the caret.

That is what keeps the rest of the app intact: `outline.js`'s
`MutationObserver`, `headingAnchors`, the format bar's positioning, the static
export's clone and the Mermaid and MathJax renderers all read a DOM that still
exists and still looks the same. They were written against the rendered
document, not against contenteditable's behaviour, and they survive.

`#editor` stays a single `contenteditable="true"` element rather than one per
block. A single root keeps the native selection, IME and drag behaviours whole
across block boundaries; per-block roots would put a focus boundary at every
paragraph.

## Selection

A model position is `(blockIndex, offset)`, offset counted in characters of
the block's rendered text. Mapping to a DOM `Range` walks that block's text
nodes; mapping back walks from the node the browser's selection points at. Both
directions already exist in spirit: `undoTextOffset` and `undoLocateOffset` in
`undo.js` do exactly this walk over the whole editor, and the block-scoped
version is the same code over a smaller subtree.

Every model edit records the selection it should leave behind, in model
coordinates. The render step applies it. Nothing ever holds a `Range` across a
render.

## Undo

A stack of model states, each a small JS object rather than a whole-document
`innerHTML` string, with the caret as a model position. The command that made
the edit names its `inputType`, so the coalescing rules in `undo.js` — same
type inside 600 ms merges, everything else starts a step — carry over
unchanged. `undoReset` / `undoPark` / `undoAdopt` keep their contract; the
history object they move is smaller. The `input`-event convention for
programmatic edits stays too: a model command dispatches one synthetic `input`
so autosave, the dirty flag and the outline hear it, and `undoRefresh` is gone
because there is nothing to correct after the fact.

TODO 1.6 — Ctrl+Z after Enter at the end of a bullet leaving the edited dot lit
and the caret at the top — is two symptoms. The caret half is a whole-document
offset miscount on a snapshot restore, and it does not get fixed; the design
that produces it is removed. The dot half may already be gone: stage 4 of the
tabbed view found `applyUndoSnapshot` dispatching its `input` event before
moving `history.current`, which produces exactly that symptom, and fixed it —
unverified against the reported case, which TODO 1.6 records.

**One requirement the new history has to be told, because it does not fall out
of being new:** a savepoint id is per-document and is never compared across
documents. `cleanPosition` in `file-api.js` holds one to answer "has undo
brought this back to the last save", and `nextId` counts from zero inside each
bundle, so two documents both own an id 7 standing for different states. The
tabbed view met this on the current core when it landed on 2026-09-07:
`cleanPosition` travels inside the file bundle `filePark` / `fileAdopt` move,
and `adoptActive` in `tabs.js` adopts the history *before* the file state, so
the id lands on top of the bundle it was minted in. Get either wrong and a dirty
document reports clean, which takes the unsaved-work guard and the
`beforeunload` warning down together — and only when two tabs' edit counts line
up, so no manual pass finds it. The replacement counter has to keep one of the
two properties that make that safe: document-scoped and parked with the bundle,
which is what ships and is what keeps the undo-before-file ordering
load-bearing, or globally unique, which retires the ordering. A choice, not an
accident, and the `tabs` suite's mutation checks are the oracle either way.

## The input layer

This is the part with no counterpart in the repo and the only part that can
blow the estimate. Everything above is data-structure work of a kind this
codebase already does well.

`beforeinput` fires on the editable root before the engine mutates anything,
with an `inputType` and, for most types, the data or the target ranges. The
handler maps each type to a model command and calls `preventDefault()`, so the
DOM never changes except through render:

- `insertText`, `insertReplacementText` (autocorrect / spellcheck accept),
  `deleteContentBackward`, `deleteContentForward`, `deleteWordBackward`,
  `deleteWordForward`, `deleteByCut` — text edits inside or across blocks.
  A deletion whose target range spans two blocks is a merge.
- `insertParagraph`, `insertLineBreak` — split the block at the caret. Enter in
  an empty list item outdents or leaves the list; Enter at the end of a
  heading opens a paragraph. These are the hand-rolled list behaviours
  `app.js` carries today, as model rules, in one place, engine-independent.
- `formatBold`, `formatItalic`, `formatStrikeThrough` — where the engine's own
  shortcuts arrive as these, they route to the same commands the Format menu
  calls. Nothing goes through `execCommand`. **Where they do not, and stage 0
  found that is two engines out of three, the shortcut is bound as a `keydown`
  on the editable and calls the same command** — Gecko on macOS gives Cmd+B to
  its bookmarks sidebar and sends no `formatBold` at all, and WebKit sent
  nothing measurable either. So this row is a bonus entry point rather than the
  mechanism, and the `format*` handler has to ignore an event that arrives
  after a `keydown` already did the work, or the two cancel out. TODO 1.7
  carries the part no script can answer: whether `preventDefault` actually
  suppresses what the browser wanted the key for.
- `insertFromPaste`, `insertFromDrop` — read the clipboard's `text/html` or
  `text/plain`, and go through **Turndown to markdown, then markdown-it into
  blocks**. Turndown stays in the bundle for this one path, with its table and
  list rules; it is no longer on the save path. The "paste markdown" action is
  the same thing without the Turndown step.
- `historyUndo`, `historyRedo` — routed to `undo.js`, which already owns Ctrl+Z.

**Composition is the exception, and it is decided up front rather than
discovered.** `insertCompositionText` cannot be cancelled: an IME needs to
write into the DOM while composing. The rule is that during a composition
(`compositionstart` to `compositionend`) the engine owns the *one text node*
under the caret, and on `compositionend` the model reads that node's text back
as a single `insertText` and re-renders. Dead keys and the macOS accent popup
are compositions and follow the same path. This is the approach every model
editor ends up at; the alternative — cancelling and re-rendering per
composition update — breaks CJK input outright.

Two things are explicitly *not* built on the first pass, recorded here so they
are a decision rather than a gap found later:

- **Android's virtual keyboards**, which report `insertCompositionText` for
  ordinary typing and `deleteContentBackward` with no target range. Mandy's
  audience edits spec files in a desktop browser. Android gets whatever the
  composition path gives it, unmeasured.
- **Drag and drop within the document**, which needs `deleteByDrag` paired
  with `insertFromDrop` across two ranges. Cut and paste covers it.

What the browser still does for free: caret drawing and blinking, click and
drag selection, Shift+arrow extension, word and line navigation, double and
triple click, the platform's spellcheck underlines, the native context menu,
touch selection handles, and IME candidate windows. That is the half D4 argued
was worth keeping, and it is kept.

## Formats and structure as model commands

Every control in `TOOLBAR_MENUS` and on the format bar becomes a call on the
model over the current selection. `applyFormat` in `format-bar.js` keeps its
role as the single entry point and loses its `execCommand` cases; the bar's
own logic — when it appears, the caret variant, `updateActiveButtons`'s
all/some/none — reads the rendered DOM as it does now and needs little change.

- **Inline:** bold, italic, strikethrough, inline code, link. Toggle a mark
  over a range within one block's inline tree. The refusal rules stay:
  no inline code across blocks, notify rather than fall back.
- **Block type:** paragraph, h1–h6, fenced code (Code's whole-block branch),
  blockquote, ordered and unordered list. Change the block's kind, or wrap or
  unwrap it. A heading inside a list item is still refused at the model.
- **Lists:** indent, outdent, Enter and Backspace on an empty item — the two
  hand-rolled clusters, and D5's list-only rule, as model operations. The three
  `tests/*-check.html` pages that watch these in real engines become
  unnecessary: the behaviour no longer depends on an engine.
- **Leaves:** horizontal rule, image (src and alt from `askForInput`), table
  of contents.
- **Tables:** insert a table; add or delete a row or column at the caret; Tab
  and Shift+Tab move between cells; Enter in a cell is a no-op or a row
  insertion, to be decided when it is built. All of TODO 1.1.8's structural
  editing is index arithmetic on `rows[][]`. The 2.1 formatter — measure the
  columns, re-emit in the source's convention — is what serialises an edited
  table, and it is a pure function that can be written on the old core today.

## What it replaces, and what it does not touch

| Code | Lines | Fate |
| --- | --- | --- |
| `undo.js`, `execcommand.js`, the list surgery and Turndown save rules in `app.js` | ~1,500 | Deleted |
| `markdown-style.js` | 542 | Half survives: the sniffers, `reflowMarkdown` and `normaliseTableRows`. `indexMarkdownBlocks` and `restoreSourceWrapping` go |
| `format-bar.js`, `renderers.js`, the rest of `app.js` | ~1,300 | Modified: the bar UI, links and anchors, welcome, paste UI stay; commands move onto the model; the two source-stash hacks go |
| `tabs.js` | 583 | Modified: the list, the bar, park/adopt and the switch lock stay; `adoptActive`'s `innerHTML` load from storage becomes a model load, and hydration loses its markdown half, since the model is the source |
| `toolbar.js`, `notify.js`, `file-api.js`, `outline.js`, both exports, PDF, DOCX, theme, lazy-load, `sw.js`, `server/`, `app.css` | ~5,300 | Untouched or near it. They read the rendered DOM, which still exists |
| `tests/` | ~6,700 | About 2,800 lines rewritten, plus the `tabs` suite's swap and hydration checks; the core's tests no longer need `dom.mjs` |

Counts as measured on 2026-09-06, except `tabs.js` and `tests/`, which were
re-measured after the tabbed view landed the next day. The line to notice: the
~5,300 untouched lines are the product. This replaces the editing core, not the
application around it.

The eight `editor.innerHTML` assignment sites the `undo` suite counts — five in
`app.js`, one each in `file-api.js`, `tabs.js` and `undo.js` — become model
loads, and the suite's count goes to zero outside render. The autosave changes
from HTML to the model's serialised form, which is to say markdown plus the
per-block `source`, so the `source` key in `DOCUMENT_KEYS` goes: the model *is*
the source, and `markdownStyleAdoptStored` has nothing left to rebuild. That is
the "second copy" paragraph in ROADMAP.md's save-fidelity section answered by
construction, for every tab, since the keys are per-tab. One thing the change
of format owes on the way in: a `content` key written before the rewrite holds
HTML — per tab, and under the flat name in an exported document — and the first
load after landing has to recognise it and convert it once, through Turndown
with today's rules, the last time it runs on anything but the paste path. That
autosave may be the only copy of unsaved work, and a save would have serialised
it the same way.

**Tabs landed on the current core**, on 2026-09-07, and the rewrite absorbs
them rather than the other way round — the CHANGELOG entry of that date
("Tabs are unblocked") has the argument, and it holds: the file state, the bar,
the per-tab dot and restore-on-load never reach the core. Three things change
at reintegration and nothing else does:

- **The swap moves a model reference, not an HTML string.** `switchToTab`
  parks three bundles, flips the id, then loads the incoming content and
  adopts — with "content before adopt" load-bearing because `undoAdopt` trusts
  what is on screen. With a model, the incoming tab's model *is* the content
  and its history describes it directly, so that ordering is re-derived rather
  than carried over on faith. Undo-before-file stays unless savepoint ids go
  global (see Undo above).
- **The switch lock stays, by default.** `tabsSwitchAllowed()` and
  `fileOperationInFlight()` exist because every file operation awaits between
  naming a path and reading `editor.innerHTML`, and that late read is the same
  bug on a model with a new variable name. What the model adds is an
  alternative: a background tab is a live model rather than a frozen string,
  so the late-read sites could take a model handle at the start and the lock
  could come off. Decided at stage 4; the lock is kept unless the handle turns
  out to be the smaller change.
- **Hydration halves.** `fileAdoptStored` reads a tab's file keys and stays;
  `markdownStyleAdoptStored` re-sniffs a `source` key that no longer exists,
  and goes.

## Estimate

Calibrated against this repo's own pace — the run from 2026-08-11 to
2026-09-05 produced the menu bar, `notify.js`, undo, the outline, the
three-layer save fidelity, reference links, the caret bar, the list surgery,
four browser check pages and CI. Weeks below are that kind of week.

| Stage | Exit criterion | Weeks |
| --- | --- | --- |
| **0. Spike** | Block model, per-block render, `beforeinput`, caret mapping. Type, split, merge and bold a word in Chrome, Firefox and Safari; type an accented character through the macOS popup | 0.5 |
| **1. Model and serialiser** | `CLAUDE.md`, `README.md`, `welcome.md` and `docs/TODO.md` round-trip byte-identical through the model with no browser involved; editing one paragraph changes one paragraph. The `save-fidelity` suite's cases pass against the model | 1 |
| **2. Core to parity** | Undo, the thirteen formats, lists including the two hand-rolled behaviours, paste, links, Mermaid and MathJax rendering — everything the app does today, on the new core | 1.5 to 2 |
| **3. The 1.1 items** | Blockquote, image, table insert and structural editing, the 2.1 formatter | 1 |
| **4. Reintegration** | `file-api.js`, `tabs.js` — the swap moves a model reference, the stored-HTML conversion, the lock decision above — outline, both exports; tests rewritten; one input-layer check page run in three engines | 1 to 2 |
| **5. Fallout** | IME beyond the accent popup, autocorrect, spellcheck replacement, Safari's quirks, anything the first real documents turn up | 1 to 2 |
| | | **5 to 8** |

The right tail is stage 5 and it is all input layer. Stages 1 through 4 are
data-structure and integration work of a kind this repo has done repeatedly;
their estimates are the confident ones.

## The spike is the decision

Three days, on a branch, throwaway code. A bare page with a block array,
markdown-it rendering per block, a `beforeinput` handler for `insertText`,
`deleteContentBackward`, `insertParagraph` and `formatBold`, and the two
selection mappings. No toolbar, no file, no undo.

**Pass:** typing feels native in all three engines — no dropped characters, no
caret jumps, the accent popup works, a paragraph splits and merges cleanly.
Then the rest of this plan is engineering the repo knows how to do, and it
proceeds in the stage order above.

**Fail:** the input layer cannot be made to feel right in three days, or one
engine's `beforeinput` is missing something the design depends on. Then three
days were spent, the reason is known, and there are two honest moves — reopen
the no-engine constraint (ProseMirror as the input and selection layer *only*,
with a markdown-shaped schema and the block model kept as the source of truth
beside it, which is a different and smaller project than adopting its document
model) or return the rewrite to the roadmap and take 1.1.6 and 1.1.7 on the old
core with the information the spike bought. Either is decided then, not now.

## Build order

1. **Model and serialiser, no browser.** Pure JS, testable in the Deno suite
   without `dom.mjs`. The existing byte-identical files are the oracle. D1 is
   proven to survive before anything is at risk.
2. **Render.** One block to one subtree, re-render on change, caret restore.
3. **Input.** `beforeinput` by type, composition, paste through Turndown.
4. **Formats**, then **lists**, then **tables**, each as model commands driven
   from the existing `applyFormat` and `TOOLBAR_MENUS` entries.
5. **Reintegrate** `file-api.js`, `tabs.js`, `undo.js`'s new shape, outline,
   exports.
6. **Tests.** The `undo`, `execcommand`, `format-bar`, `save-fidelity`,
   `list-indent`, `latex` and `links` suites are rewritten against the model,
   and the half of `tabs` that drives the swap and hydration with them; the
   source scans in `execcommand` and `notify` change targets (no `execCommand`
   call site at all; no `innerHTML` assignment outside render). The three check
   pages that watch the core in a real engine — `browser-check`,
   `list-indent-check`, `list-empty-item-check` — become one that drives the
   input layer; `paste-check` and `tab-shortcut-check` measure the browser
   rather than the core, and stay.
7. **Docs.** D4 is marked retired in DECISIONS.md rather than deleted.
   CLAUDE.md's "Document state", "Save fidelity", "execCommand", "Undo" and
   "The format bar" sections are rewritten; "The browser check" shrinks to the
   one page. TODO 1.1.6, 1.1.7, 1.1.8, 1.4, 1.6 and 2.1 close as part of the
   stages above; 1.5 becomes straightforward. 4.2 is a measurement of the
   browser's tab strip and is not touched by any of this.

## Where each stage stands

Started 2026-09-09, on branch `rewrite`. The stage numbers are the estimate
table's. Each line says where it stands — *done and tested*, *done, untested*,
*not started* — and is updated as part of the landing, not afterwards.

*   **0. Spike — done and tested, in all three engines.**
    [spike/block-model.html](../spike/block-model.html), a single self-contained
    page: block model, per-block render, `beforeinput` interception, both
    selection mappings, and the composition path. Throwaway code that answers
    a question — it is not the first draft of `front/`, and nothing in it is
    meant to be moved there. What it entails, in the order it was built:

    1.  **Parse.** markdown-it 13.0.1 from the same CDN the app uses, `md.parse`,
        top-level tokens split into blocks by their `map`. Paragraphs and
        headings become editable runs; every other block kind — lists, fences,
        rules, tables — is kept whole as its source, rendered read-only, and
        refuses edits. Stage 0 needs the input layer measured, not a schema.
    2.  **Render.** One block to one child of `#editor`, tagged `data-block`,
        `innerHTML` from the runs. Only touched blocks re-render; a split or a
        merge splices the children rather than rebuilding the list.
    3.  **Map.** `(block, offset)` in characters of the block's rendered text,
        both directions, over one block's text nodes.
    4.  **Intercept.** `beforeinput` by `inputType`, `preventDefault` on every
        one it handles *and* on every one it does not, so the DOM can only
        change through render. Deletions are read from `getTargetRanges()`,
        which is what makes "a deletion whose target range spans two blocks is
        a merge" fall out rather than being special-cased.
    5.  **Compose.** `compositionstart` hands the block to the engine;
        `compositionend` diffs the block element's text against the model,
        applies the difference as one edit, and re-renders.
    6.  **Verify.** After every render and every stray `input`, each block's DOM
        text is compared against its model text; a divergence is the exact
        failure mode the spike exists to find, so it is reported on the page
        rather than left to be felt.

    The page reports what it was asked to report: every `beforeinput` the engine
    sent, whether it was cancelable, what was done with it, and any divergence
    between the DOM and the model. It needs no server and no app — open the file
    itself, the way `paste-check.html` is run.

    **Measured in Blink (Chrome 152, macOS) on 2026-09-09, and only in part.**
    Through real input: typing, typing over a selection, a double-click word
    selection surviving a re-render still selected, the bold toggle, and an edit
    refused inside a read-only block — all with the DOM matching the model
    throughout and nothing dropped. Through synthesised `beforeinput` and
    composition events, because the automation to hand delivers a trusted
    keydown but no editing command for Enter or Backspace: the split, the merge
    landing back on the exact offset it started from, Enter at the end of a
    heading opening a paragraph rather than a second heading, and the accent
    popup's shape — the engine replacing the character under the caret, the
    model reading the block back at `compositionend`. The fixture also
    round-trips byte-identical through the model, and one typed character leaves
    exactly one block off its source, which is D1 in miniature.

    **Driven by hand in all three engines on 2026-09-10, and the gate passes.**
    Typing, Enter, Backspace, the accent popup and the refusal inside the
    read-only block behave in Blink, Gecko and WebKit alike, with the divergence
    line quiet throughout. That is the question the spike was built to ask —
    whether an engine will say what it is about to do and let us do it instead —
    and all three do.

    **One of the six failed, and it is not one the design rests on.** Ctrl/Cmd+B
    bolds in Blink; in Gecko on macOS the browser takes the key for its
    bookmarks sidebar and the page never sees it; in WebKit nothing happened at
    all. That is keyboard routing upstream of `beforeinput`, not a hole in the
    interception — and it is a gap `main` already has, since `app.js` binds
    Ctrl+S, Ctrl+O, Ctrl+Shift+P and Ctrl+K and never binds a format shortcut,
    leaving all thirteen to whatever the engine does natively. The input-layer
    section above now says the shortcut is bound as a `keydown` rather than
    awaited as a `format*`; the spike binds it that way and the page reports
    whether the key arrives, which is the half a script can see — and it does
    arrive, in all three, so the ordinary binding is enough and nothing exotic
    has to be invented. **TODO 1.7** carries what is left: whether Gecko opens
    its sidebar as well as handing us the key.

    One thing it turned up for stage 2 to decide rather than inherit: typing
    over a fully-bold selection gives plain text here, because a new run
    inherits the marks to its left and the left edge of a selection sits outside
    the bold. Every editor people arrive from keeps the bold. The rule wants to
    be "inherit from the range that was deleted when there was one, from the
    left when there was not", and it is a model-command decision rather than an
    input-layer one.

*   **1. Model and serialiser — in progress, started 2026-09-11.**
    Pure JS in `front/model.js`, no browser and no `dom.mjs`: this is the stage
    that proves D1 survives before anything is at risk. The exit criterion is
    the estimate table's — `CLAUDE.md`, `README.md`, `welcome.md` and
    `docs/TODO.md` round-trip byte-identical, editing one paragraph changes one
    paragraph, and the `save-fidelity` cases hold against the model. Five
    slices, each landing on its own — 1b was added after the first landed, for
    the reason its own entry gives. They are bullets rather than a numbered
    list because `1b` is not a number markdown can count to: written as one it
    broke the list in two and turned six paragraphs of this section into an
    indented code block, which is what a 4-space marker does to the 8-space
    continuations under it.

    *   **1. Parse and reconstruct — done and tested, 2026-09-11.** markdown-it's
        top-level block tokens, whose `map` is the source span, become blocks
        carrying their exact bytes and the exact text that followed them. Lines
        no token covers — reference definitions above all, which markdown-it
        consumes silently — become blocks of their own in their own position
        rather than being collected at the end the way
        `appendReferenceDefinitions` has to today. Reconstruction is then a
        concatenation, so byte-identical is structural rather than something
        the serialiser has to get right. `front/model.js` and
        `tests/model.test.mjs`, 39 checks.

    *   **1b. Sub-blocks inside containers — done and tested, 2026-09-12, and it
        was not optional.** All six steps below are in. The mechanism is: a container's children tile
        it exactly, one `modelTouch` at a child clears every container above it,
        and serialisation re-emits that child while handing back every sibling.
        Editing the first bullet in `docs/TODO.md` asks the emitter for 10 lines
        where the same edit used to re-serialise the 239-line list it sits in,
        and a bullet five blocks down costs one emitter call. Every item also
        carries its own marker and continuation indent, which is what slice 3
        emits from. The suite asserts the metric rather than leaving it measured
        by hand: **editing the worst block in `docs/TODO.md` rewrites 15 of its
        708 lines, 2.1%, where the same edit cost 239 lines before this slice**,
        and all 728 blocks across the five files it drives rewrite exactly
        themselves when edited one at a time. Measured as soon as slice 1 could
        count, and again on
        2026-09-12 after `main`'s items landed in it: `docs/TODO.md` is 708
        lines and **16 blocks**, because a whole section's bullet list is one
        top-level token. The largest is 239 lines — a third of the file — so
        editing one TODO item would re-serialise a third of the file, which is
        exactly the unmergeable diff D1 exists to prevent.

        The sharper number is not the largest block but the share of the file
        that is inside one: **93% of `docs/TODO.md`'s lines sit inside a list,
        a quote or a table**, and so inside a single block each. `REWRITE.md`
        is 49%, `CLAUDE.md` and `README.md` 37%, `welcome.md` 33%. Top-level
        granularity does not mostly work on this repo's documents and then fail
        at the edges; on the planning documents it barely works at all.

        This is not a surprise so much as a thing the current design already
        knew: `markdownSegments` splits on list markers, headings and fences
        precisely *because* matching whole blank-line-separated blocks fails on
        this repo's own files. A model at top-level granularity alone would
        therefore ship **worse** fidelity than the three-layer restore it
        replaces, on the exact documents this project is written in.

        The fix is the same algorithm one level down: `list_item_open` carries a
        `map` like everything else, so a container block gets children that tile
        its span the way blocks tile the file, recursively.

        **What can be tiled was measured before it was planned** (2026-09-12,
        against `docs/TODO.md`, `docs/MARKDOWN.md` and `README.md`), because the
        whole approach depends on child tokens carrying a `map` and not all of
        them do:

        | Container | Child carrying a `map` | Floor |
        | --- | --- | --- |
        | list | `list_item_open` — 19 at level 1 and 23 at level 3 in `docs/TODO.md`, so depth is not a limit | the item, then recursively whatever is inside it |
        | quote | the ordinary block tokens inside it, `paragraph_open` and the rest | the same kinds the file itself has |
        | table | `tr_open`, and `thead_open` / `tbody_open` | **the row.** `td_open` carries no `map` at all, so a cell is not a sub-block and cannot be made one from the token stream |

        Fences, rules, indented code and HTML blocks have no children and stay
        leaves. **Six steps, in this order:**

        1.  **Generalise the tiler — done and tested, 2026-09-12.**
            `modelTopLevelSpans` filtered on `token.level !== 0`; it is now
            `modelSpansAtLevel(tokens, level)`, a function of a token slice and
            a level, with the old behaviour as its level-0 case — which is what
            `modelParse` still asks for and all it asks for until step 2. A
            `map` is an absolute line range in the file at every depth, so
            `modelLineOffsets`, `startOf` and `endOf` are reused untouched and
            there is no coordinate translation anywhere — which is what makes
            this a day rather than a second slice 1.

            Measured rather than assumed, in twelve checks driving the function
            directly, since nothing in the model reaches a second level yet: a
            list tiles into items and those into a paragraph and a nested list,
            a quote into ordinary blocks, and a table into head and body and
            then rows. Two of them are for step 2 rather than this one. **A
            line inside a container can belong to none of its children** — a
            table's delimiter row and a quote's bare `>` are both unclaimed —
            so step 2 has to reuse `takeGap` at depth rather than assume the
            children cover the span. And children nest and never overlap at
            every depth, which is the invariant step 2 rests on: two siblings
            claiming the same bytes would write those bytes into the file
            twice.

            One clause is belt-and-braces rather than measurement: an `inline`
            token is skipped by type as well as by level. markdown-it puts it
            one level below the block carrying it, so a container's children
            are never inlines and the clause never fires today — but if that
            changed, an inline's span would overlap its own parent's, and the
            worst case with the guard is a `gap` block holding those bytes
            exactly once.

        2.  **Children tile the parent exactly — done and tested, 2026-09-12.**
            Slice 1's invariant one level down: every character of a
            container's `source` is in exactly one of a child's `source`, a
            child's `separator`, or the container's own leading text. `takeGap`
            and the trailing-blank trim came along unchanged, since both were
            already written against a line range rather than against the file.

            What it took was one refactor rather than a second parser:
            `modelParse`'s body became `modelTileRange(ctx, spans, from, to)`,
            which tiles *a* line range, and the file is that function over
            `[0, lines.length)` at level 0. A container is the same call over
            its own span at its own level plus one, and `prefix` and a
            container's `leading` are the same field one level apart.
            Recursion is on *having children* rather than on a list of
            container kinds — a paragraph's only child token is its `inline`,
            which the tiler skips — so leaves fall out instead of being
            enumerated, and there is no kind list to update when a construct
            gains a level.

            **A child's `source` is its lines, whole, so it carries its own
            container's marker**: the paragraph inside `- one` has `- one` as
            its source, and a paragraph inside a quote starts at `> `. That is
            what byte-exactness wants, since nothing else claims those
            characters — step 5 is what records the marker as data for the
            emitter, and the suite pins the behaviour so it cannot drift
            silently when step 5 lands.

            Measured on the five repo files the suite already used, and the
            invariant holds at every depth on all of them — with two checks
            that the loop is not passing vacuously, since a model with no
            children anywhere tiles trivially and that is exactly the state
            slice 1 was in: `docs/TODO.md` comes back as 53 containers nesting
            five deep. Four more things fell out rather than being built:
            **a tight list stays tight and a loose one loose**, because the
            blank line between two items is the first item's separator, which
            is the same information `markdownSegments` carries today; a
            **table's delimiter row** and a **blockquote's bare `>`** are gap
            blocks in their own position, by the mechanism reference
            definitions already used; a **reference definition inside a list
            item** stays inside that item, where `appendReferenceDefinitions`
            would hoist it to the end of the file; and an **empty item or
            quote** is a leaf holding its own marker rather than a container
            with nothing in it. Leaves carry `children: null` rather than an
            empty array, because "has children" is the test step 3 serialises
            on and an empty array answers yes.

        3.  **Serialisation recurses — done and tested, 2026-09-12.** A block
            whose `source` is null *and* which has children emits its children
            instead of calling `emit`. An edited item re-emits itself, its
            ancestors re-emit as the concatenation of untouched siblings around
            it, and **no sibling is ever re-serialised**. That is the whole
            result of the slice, and it fell out of the invariant rather than
            being arranged on top of it: the new case is literally the inverse
            of step 2's tiling, `leading` plus each child's emission and
            separator.

            Three cases now, and the order is the contract —
            `modelEmitBlock(block, emit)` takes `source` first, children
            second, `emit` last. The measurement: the first bullet in
            `docs/TODO.md` is a 10-line paragraph inside a 97-line item inside
            the file's 239-line list, and editing it asks the emitter for that
            paragraph **once**, rewrites exactly its bytes, and hands back the
            other 698 lines untouched. The suite asserts both the bytes and the
            call count, since a serialiser that re-emitted a sibling correctly
            would pass the first and still have thrown away the guarantee.

            Two consequences worth naming. **An edited container needs no
            emitter at all** — it is a concatenation of bytes that already
            exist, so only a leaf can reach slice 3, which is the only part of
            this that invents markdown. And **an item is never the block that
            emits**: it holds a paragraph, so the paragraph is what is asked
            for, and its bytes start at the item's marker.

            One thing the step deliberately leaves broken, with a check pinning
            it so step 4 has something to flip: touch a child and nothing else
            and the container above it still carries its own bytes, so case 1
            hands those back and **the edit is simply gone**. That is the same
            silent-wrong-file failure `modelTouch` exists to prevent one level
            up, which is why step 4 is not optional either.

        4.  **`modelTouch` clears ancestors — done and tested, 2026-09-12.** An
            item edited under a container still claiming its own original bytes
            is re-emitted from those bytes and never consulted about its
            children, so the edit is lost with the document looking right on
            screen — the same silent-wrong-file failure `modelTouch` exists to
            prevent one level up. So touching walks up, which needed a parent
            link on every block, set by the tiler where the children are
            attached. The cost is that the model is cyclic and no longer
            `JSON.stringify`-able — named rather than hidden, and worth paying:
            nothing has needed to serialise the model as JSON, and the
            alternative is searching the tree for a parent on every keystroke.

            It walks the whole chain rather than stopping at the first ancestor
            already cleared. Depth is five on this repo's deepest document, and
            a stop condition would be a second rule about when an ancestor may
            keep its bytes — there is no such case, and inviting one costs the
            file.

            This is the step that flipped step 3's pinned hazard, which is why
            that check was written: the suite now asserts that one touch at a
            child clears every container above it and **nothing beside it**, that
            a top-level block has no parent to walk to, and that every child's
            parent throughout `docs/TODO.md` is the container whose `children` it
            is in — a link to the wrong block being the one failure here that
            writes into the file. The sharpest case is the deepest: a bullet
            nested in a bullet, five blocks down, one touch, one emitter call,
            and the other 700-odd lines the bytes that were read.

        5.  **Record the marker and the content indent on each item — done and
            tested, 2026-09-12.** At parse, where the bytes are in hand.
            Byte-exactness needs neither — an item's `source` includes its own
            marker — but slice 3's emitter has to put both back when the item is
            edited, and re-deriving them from the source at emit time would be a
            second place that can disagree with the first, about the pad above
            all, which is a document's own convention `sniffMarkdownStyle`
            already reads for exactly that reason.

            `modelItemPrefix(firstLine, continuationLine)` is a pure function
            over one or two lines, which is what lets the suite drive the rules
            directly rather than through a document — the same split
            `isGhostElement` has from its traversal in `markdown-style.js`. It
            returns the marker exactly as written, indent and pad included
            (`"- "`, `"*   "`, `"    - "`, `"1.  "`, `"10) "`), and the
            continuation indent **as the item's own continuation line writes
            it**, falling back to the marker with every character but a tab
            replaced by a space when there is no such line.

            **That fallback was the whole rule until 2026-09-13, and it was
            wrong in one place** — found by `tests/fixtures/torture.md` on its
            first run, because not one of the five hand-maintained files indents
            a list with a tab. Deriving turns the marker `"-\t"` into `" \t"`,
            while a file that indents with tabs continues under a bare `"\t"`.
            Both land on column 4, so the document renders identically and
            nothing looks wrong; they are different *bytes*, which is the only
            currency this model deals in, and an edited item would have gone
            back into the file under an indent its author never used. The fix is
            not a cleverer derivation but not deriving: an item with a
            continuation line has already stated its indent. A written indent is
            believed only when it lands on the marker's own content column, so a
            lazy continuation carrying none, or a line pushed further in, still
            gets the derived value — this can only ever swap one indent for
            another of the same width.

            Measured against the files the suite drives, and re-measured on
            2026-09-13 with the fixture among them: every item **outside a
            blockquote** carries a marker, every one agrees with what markdown-it
            itself reported as the item's `markup` (plus `info` for an ordered
            item's number), and every item with a continuation line carries
            exactly the indent that line actually uses — tabs included, which is
            the half that was not true a day earlier. Those counts
            are **thresholds** in the suite and exact only in this sentence — the
            oracle is five files this project edits, and an exact count turns a
            documentation change into a failing test about list items. Which it
            did, in this slice, on the entry describing this check. A `null` marker would
            mean a line markdown-it called an item does not start with one this
            pattern recognises; the fields stay null in that case, so slice 3 has
            nothing to emit from rather than the model inventing a marker the
            file never had.

            **A blockquote's `> ` chain is the same problem and is deliberately
            not answered here.** A paragraph inside a quote has `> quoted` for
            its source, so slice 3 has to put that back too, and there are two
            ways to do it. *Record a prefix at parse*, the way an item's marker
            is recorded: symmetric, one place to be wrong. *Strip and re-apply
            the chain at emit time*: keeps 1b scoped, at the cost of the second
            disagreeing place this step exists to avoid. The reason it is open
            rather than decided is that the shapes differ — an item's marker is
            a first line plus an indent, while a quote's prefix is on **every**
            line and nests (`> > `) — and there is no measurement to settle it
            on: all nine markdown files in this repo contain **zero**
            blockquotes, so the only evidence available would be invented. It
            belongs to whoever writes slice 3, with the quote's own
            `tests/browser-check.html`-style measurement taken first.

        6.  **The suite gets the metric, not only the cases — done and tested,
            2026-09-12.** The number this slice exists to move is the share of a
            file an edit re-serialises, so the suite asserts it on `docs/TODO.md`
            directly, alongside the round trips, the tiling invariant at every
            depth, and that editing one list item rewrites that item and nothing
            else.

            The unit is a **leaf**, because a container re-emits as its children
            and what reaches the emitter always has none. Four checks, and the
            numbers are in their labels so a run reads as a report rather than as
            a row of ticks:

            - Editing the worst block in `docs/TODO.md` rewrites **15 of its 708
              lines (2.1%)**, asserted under 5%.
            - Its largest **top-level** block is still **239 lines (34%)**,
              asserted over 25% — the guard that the first number moved because
              of sub-blocks and not because the file got shorter or its lists
              got smaller. That block is still there; what changed is that
              nothing re-serialises it.
            - No file's worst edit is a tenth of it: CLAUDE.md 1.9%, README.md
              2.8%, welcome.md 7.4%, TODO.md 2.1%, REWRITE.md 1.8%. The labels
              carry the live numbers, so the figures here are the day's reading
              and the suite is the thing that keeps them honest.
            - The exhaustive version of the single-bullet case: **all 728 blocks
              across those five files, edited one at a time, rewrite exactly
              their own bytes and nothing else.** It re-parses per block, since
              `modelTouch` clears ancestors and a second measurement on the same
              document would be measuring a document with an edit already in it —
              0.6s for the sweep, which is the most expensive thing in the suite
              and the strongest claim in it.

            The sentinel the sweep edits with shares no character with anything
            in any of the files, at either end: one that did would let the common
            prefix run into the replacement, so the region measured would be
            smaller than the block and the check would weaken without failing.
            That is not a hypothetical — it happened on the first run of this
            sweep, with a sentinel that began with a space, against the indented
            continuation paragraphs inside list items.

        **Two to three days, and additive to the stage's one-week line in the
        estimate table rather than inside it** — 1b was found after that table
        was written, by the slice that table's first line paid for. Nothing in
        it is new machinery: it is slice 1's tiler, invariant and serialiser
        applied one level down, and the one genuinely new rule, ancestor
        invalidation, is a thing the suite can pin directly.

        **What it deliberately does not reach**: a table cell, per the floor
        above, and the inline structure inside any of these — that is slice 2,
        and is unchanged by this.

        **"Block-granular is final" in *What is accepted* below is unchanged by
        this.** That sentence is about an edited paragraph re-serialising whole,
        and a list item is a block in every sense that matters here.

    *   **2. The inline model — in progress: steps 0 through 4 done and
        tested (steps 3 and 4 both on 2026-09-15), steps 5 and 6 not started.**
        A paragraph's
        or heading's markdown-it inline tokens become the editable structure:
        text, the three marks, code spans, links, images, and the `math` token
        `app.js`'s own rule pushes. It fills the `inlines` field every block has
        carried since slice 1, and it is what an edited block is re-emitted from
        and what stage 2's format commands act on.

        **What the inline tokens carry was measured before this was planned**
        (2026-09-13, across all nine of this repo's markdown files), the same
        way 1b's tiling table was — and the first row is what decides the shape
        of the slice:

        | Measurement | Reading |
        | --- | --- |
        | Inline child tokens carrying a `map` | **0 of 11,644** |
        | Marks whose delimiter is recorded in `markup` | all of them — strong 1,654, em 500, code span 3,128, autolink 6 |
        | `softbreak` / `hardbreak` | 4,895 / **0** |
        | Text tokens holding a markdown-active character | 117 of 11,377 — **1.0%** |
        | Deepest inline nesting | **2** |
        | Constructs with no occurrence anywhere in the repo | strikethrough, hard break, `html_inline`, reference definition |

        **No inline token carries a `map`, and — this is the finding — that
        costs nothing.** The obvious move after 1b is to do 1b again one level
        down, and it is the wrong one. 1b tiled because a list was one block and
        editing an item rewrote a third of the file: that was a *fidelity*
        failure and a source span was the fix. There is no such failure here. An
        edited paragraph re-serialising whole is not a regression to be
        engineered away — it is exactly what *What is accepted* below promised,
        and every paragraph nobody touched is already covered by the block's own
        `source`. So slice 2 is not about fidelity at all. Its job is
        **editability**: a structure that can be addressed by offset, mutated by
        a command, and handed to slice 3.

        That is also why the absence is not worth fighting. Deriving inline
        spans would mean re-scanning each block's source against its own token
        stream — a second parser, free to disagree with the first, bought for a
        guarantee nothing asked for.

        **What `inline.content` is, measured**: the block's source with the list
        marker and the continuation indent already stripped, and the author's
        wrapping preserved as `\n`. The paragraph inside the `- ` bullet at the
        top of *The model* above has content starting at its first backtick, not
        at the dash. So slice 3's three transforms compose in one direction and
        each already belongs to somebody: the inline tree emits `content`,
        `reflowMarkdown` re-wraps it, and 1b's step 5 `marker` and
        `contentIndent` go back in front of it.

        **Step 0 is the parser move settled below — done and tested
        2026-09-14.** `math` and `referenceAwareLink` are out of `app.js` and in
        [front/markdown-parser.js](../front/markdown-parser.js), behind one door,
        `configureMarkdownParser(md)`: the app hands it the CDN instance it
        builds, the suite the `npm:` one, and the two now parse with the same
        configuration. It came first because steps 3 and 5 cannot be honestly
        tested without it. The move was verbatim — the rules and their comments,
        unchanged, with the registrations collected into the new function — so
        nothing about what the app parses changed, and the suite's 114 checks
        passed on the configured parser before either new check was written.

        What it cost, and all of it is registry rather than logic: the file
        joins all three registries (it is in the editable export's `ASSETS`
        because an exported document renders markdown too), `sw.js`'s `VERSION`
        goes to `v1.32`, four suites that build their own bundles list it ahead
        of `app.js`, and `loadApp` in `tests/dom.mjs` loads it — which is what
        keeps `mathSpan` reachable for the `latex` suite, since these share one
        scope the way `<script>` tags do.

        Six checks were added rather than only moved. Two in the `model` suite
        say what step 0 was *for*: its parser emits a `math` token for
        `$x = a*b*c$` while leaving `$5 and $10` as prose, and stamps a
        reference link with `data-ref-label` and an inline one with nothing.
        Three in `latex` are the load order — before `app.js` in `index.html`,
        before it in the export bundle, and present in `SHELL_ASSETS` — because
        `app.js` calls `configureMarkdownParser` at its own top level and a
        bundle in the wrong order throws on load and takes the editor with it.
        That first one was checked against a deliberately broken order and
        fails there, rather than being trusted to be testing something. The
        sixth is in `self-reproduce`, where the export's fetch count was the
        literal `13` and is now read out of `ASSETS` — the same
        cannot-drift rule the toolbar suite's two bundle lists already follow.

        Verified in the running app as well as in the suite, since a load-order
        break is invisible to a suite that loads the same files in an order it
        chose itself: the editor boots with no console errors, and its own CDN
        parser returns `\mathbb{N} = \{ a \}` intact — the exact escape damage
        the maths rule exists to stop — and the `data-ref-label` stamp.
        **Then six:**

        1.  **The node tree — done and tested, 2026-09-14.**
            `modelInlines(block)` folds markdown-it's flat `_open`/`_close`
            stream into a tree, and `modelBlockFromSpan` fills `inlines` from it
            as each block is built — eagerly, because the fold is a walk over
            tokens the parser has already produced and a field filled at one
            moment cannot be half-filled when the emitter reads it. Marks carry
            their delimiter **as the author wrote it** — `_` and `*`, `__` and
            `**` are all distinguished in `markup` — so emphasis fidelity is
            per-node here rather than the per-document guess
            `sniffMarkdownStyle` has to make, which is strictly better and costs
            nothing to keep; the oracle files spell every mark both ways (em
            149/2, strong 507/2, code spans 1,491/6), so that is measured rather
            than argued. Leaves are text, code span, image, `math`, and the two
            breaks. Recursion is on nesting, not on a list of mark kinds, for
            the same reason 1b's tiler recursed on *having children* — an
            unmapped construct still nests, and `MODEL_INLINE_KINDS` only names
            it.

            Two things the step decided rather than inherited. **The token stays
            on the node**: a link's href, title and `data-ref-label` stamp and an
            image's `src` are already on it, and steps 3 and 5 read them there
            rather than re-deriving them from the source, which would be the
            second parser this slice's plan already refused. **An image is one
            node, not its alt text** — markdown-it parses the alt into the
            token's own children and those are deliberately not folded in, which
            is step 2's "an image is one atom" arriving a step early because the
            tree is where it has to be true.

            **And one omission, which the measurement found rather than the
            plan.** markdown-it's emphasis rule leaves a zero-length text token
            on each side of every mark it converts — `**a**` arrives as
            `text("") strong text("")`, and 410 of the 6,303 text tokens in the
            oracle files are these. The fold drops them: they hold no bytes, so
            nothing can be lost, and keeping them would put positions in step
            2's offset space that no caret could tell from their neighbours. It
            is checked *as* an omission, which is the part worth having — every
            token not in the tree is asserted to be an empty text token, so the
            rule cannot quietly grow a second exception.

            Eighteen checks: the hand-written constructs one at a time, and then
            the oracle, where across 819 inline-bearing blocks all 10,705 nodes
            are the parser's own tokens, each in the tree exactly once and in
            order. Every kind those files contain is named — text 5,723,
            softbreak 2,677, code span 1,497, strong 509, em 151, link 136,
            image 5, math 4, hardbreak 2, strike 1 — with none falling through
            to `"unknown"`, and the last four of those come from
            `tests/fixtures/torture.md` alone, which is the fixture earning its
            place again. The `math` token and the `data-ref-label` stamp in
            those checks exist only because step 0 moved the parser
            configuration first.

        2.  **The text coordinate — done and tested, 2026-09-14.** *Selection*
            above names a model position as `(blockIndex, offset)` in characters
            of the block's rendered text; this is the step that defines that
            offset space. `modelInlineText(nodes)` is the space itself, and
            `modelInlineOffset` and `modelInlineAt` are the two pure functions
            in and out of it. Doing it here rather than in stage 2 is
            deliberate — with no renderer in the way it is testable with no DOM,
            which is the whole reason stage 1 comes first.

            The four rules the plan named are decided as it named them: a code
            span's content counts and its backticks do not, a mark's delimiters
            are zero-width, and an image is one atom rather than its alt text.
            Three things the step had to settle that the plan did not say:

            - **A break is one character and that character is a newline** —
              every soft break and both spellings of a hard one. Which spelling
              it was is on the node for step 3; here it is one position the
              caret can be on either side of.
            - **An equation is an atom too**, by the image's own argument rather
              than by analogy: what the reader sees is a typeset formula, so
              counting the TeX would count characters nobody can see and put the
              model's offsets and the DOM's out of step by the length of some
              maths. Both atoms are one U+FFFC, which is what that character is
              for. One rather than zero, so a caret can sit on either side of an
              image and a delete over it is one character wide.
            - **Characters means UTF-16 code units**, because a DOM `Range`
              counts those and mapping to one is the entire purpose. An astral
              character is two, here and there alike, and the two directions
              agree about it.

            **The boundary rule is `undo.js`'s, deliberately.** A position at a
            boundary belongs to the node that *ends* there, which is
            `undoLocateOffset`'s own `remaining <= length`; out of range clamps
            to the end, which is what a restore onto text that got shorter
            needs, and `undoTextOffset`'s null for a node that is not in the
            tree is kept too. Stage 2 then ports the caret behaviour rather than
            re-deciding it. It is also the same left bias as "a new run inherits
            the marks to its left", and `modelInlineAt` returns the mark chain
            as `path` — which is how the tree answers *what marks does this
            position carry*, the question stage 0 left for stage 2's typing
            rule.

            Seventeen checks: each rule on its own, both directions agreeing on
            every offset of a block holding a mark, an atom and a break, and the
            clamps. Then the oracle, where the property is the fixpoint —
            **every one of 10,086 leaves, at both edges and its middle, maps to
            an offset that maps back to the same place**, across 230,189
            characters of which 9 are atoms. And one check that is not the
            model marking its own homework: in the 204 blocks whose tree is a
            single text node there is no markup to render, so the model's text
            has to be exactly the content markdown-it recorded, and it is.

        3.  **Re-emission puts back what was written — done and tested,
            2026-09-15.** markdown-it discards four spellings, and the
            measurement is what found them — a code span's padding (`` ` a ` ``
            and `` `a` `` both give the content `a`, and the padding is
            *required* when the content opens or closes with a backtick), an
            escape (`\*not em\*` gives the text `*not em*`), a link's
            angle-bracket destination (`[t](<u v>)` gives `u%20v`), and a hard
            break's spelling (two trailing spaces and a trailing backslash both
            give a bare `hardbreak`).

            **The answer to each is the same, and it is the reason this rewrite
            exists: back the way it was written.** The parser threw the spelling
            away; the model still has the bytes, so the model records what the
            parser discarded, at parse, on the node — exactly what 1b's step 5
            already does for a list item's marker. There is no house style to
            pick and no spelling to prefer. `modelInlines` now carries a raw
            cursor through `inline.content` alongside the token walk it already
            did for slice 2's step 1, so this landed as one pass rather than a
            second walk over the tree: a leaf records its own `raw` (a mark's
            open and close, its delimiters) and a link or image its `tail` —
            the parenthesised destination, the reference `[label]`, or nothing
            for a shortcut — as the cursor reaches it, in source order, which
            is the same order the fold already visits nodes in.

            **A fifth thing surfaced that the plan did not name, and it is not
            optional the way it looks.** CommonMark strips the whitespace
            around a line break twice over — a trailing run of spaces before
            it, the next line's own leading indent after it — and both are
            invisible to rendering, not to the file. Missing the second half
            doesn't just misrender one break: it leaves every sibling after it
            reading from the wrong cursor position for the rest of the block,
            which is exactly how `tests/fixtures/torture.md`'s HTML-block
            paragraph (an indented `<strong>` line inside a raw `<div>`, kept
            as prose because `html: false`) found it — the first oracle file
            with a continuation line indented at all. Both halves are recorded
            together in a break's own `raw`, newline included, so `modelInlines`
            never has to explain the character twice.

            **Reused rather than reimplemented for the same reason
            `referenceAwareLink` was copied instead of hand-rolled (D4's
            argument, one level in): a link's destination-and-title tail calls
            `md.helpers.parseLinkDestination` / `parseLinkTitle` directly**,
            mirroring that rule's own skip–parse–skip–parse–skip loop rather
            than re-deriving the escaping and angle-bracket rules by hand. The
            reference-label tail (`[label]`) does not reach for
            `parseLinkLabel`, which needs a live inline-parser state to skip
            nested tokens correctly — measured against this repo's own files,
            no reference label nests anything, so a plain search for the next
            `]` is the sufficient version rather than the fully general one.
            **Images get the same treatment as links, one level down from the
            plan's own list**: not one of the four named spellings, but an
            untouched image sitting beside an edited sibling still has to
            reconstruct exactly, and nothing else on the node says how — so an
            image's alt text and destination tail are recorded the same way a
            link's are.

            **One failure mode is a thrown error rather than a guess.** An HTML
            entity or numeric character reference is decoded by markdown-it the
            same way an escape is, but with no fixed-width pattern to scan back
            through — so where an escape's raw-text scan can always resolve, an
            entity's cannot, and guessing at a length would leave the cursor
            wrong for every node after it in the block: the exact
            silent-wrong-file failure `modelTouch` and `modelEmitBlock`'s own
            throw already exist to prevent one level up. Thrown and accepted
            rather than worked around, since it is unmeasured in the sense that
            matters — none of this repo's own markdown files carry a live
            entity, `docs/MARKDOWN.md` does not track them as a construct at
            all, and the one literal `&nbsp;` in CLAUDE.md sits inside a code
            span, which never reaches this path.

            So the target here is what it is everywhere else in the model —
            **byte-identity** — and the check is `modelInlineSource`, the
            inverse of `modelInlines`: an inline tree back to the raw text it
            was folded from, checked against the block's own `inline.content`
            rather than against the caller's whole input, since a reference
            link's definition line is a `gap` block of its own and the paragraph
            using it does not own those bytes. Fourteen hand-written cases —
            each of the four named spellings both ways, the fifth (a break's
            surrounding whitespace), a title in both quote styles, an autolink,
            all three reference-link forms, an image inline and by reference,
            nested marks, and the thrown entity failure — then the oracle: every
            one of **830 inline-bearing blocks reconstructs its own source
            exactly**, which given the repo's own diet of these constructs
            (1,538 code spans, 7 of them padded; 2 hard breaks, one of each
            spelling; 1 soft break with whitespace to strip; 4 escaped
            characters; 131 links, 1 with an angle-bracket destination; 5
            images) is a claim about `tests/fixtures/torture.md` covering
            exactly the same gap it closed for slice 2's steps 0 through 2.

            Only genuinely *new* content — a hard break the user just typed, a
            code span they just made — has nothing recorded to put back, and
            that case is already answered too: it follows the document's own
            convention, which is `sniffMarkdownStyle`'s job and which
            MARKDOWN.md's **S3** settled for these two in particular ("the
            rewrite's whole point is better sniffing, so these are not a special
            case"). Record first, sniff second, house style never —
            `modelInlineSource` already falls through to plain `content` for a
            node with nothing recorded, which is what makes that the emitter
            steps 4 and 5 build on rather than a separate mechanism.

        4.  **Escaping — done and tested, 2026-09-15.** 1.0% of text tokens
            hold a character that *looks* markdown-active — narrow, and
            silent, which are the two properties that put a thing in this
            repo's suite. Measured precisely rather than by that proxy, the
            number that matters is smaller still: of the oracle's 5,994 text
            nodes, only **2** actually need a backslash to round-trip, which is
            what "narrow" turns out to mean once the question is "does leaving
            this bare change what it parses as" rather than "does this
            character appear at all." The rule is **minimal escape**: a
            backslash only where leaving the character alone would change what
            it parses as, so an edited paragraph does not come back wearing a
            rash of them the author never wrote.

            **Verified by asking the real parser, not by re-deriving
            CommonMark's flanking rules by hand** — the same reuse step 3's
            link-tail parsing already argues for, and for a sharper reason
            here: whether `*a*` is emphasis depends on what sits on both sides
            of each delimiter, which is exactly the kind of rule a hand-rolled
            version is most likely to get subtly wrong in a case nobody wrote
            down. `modelFirstConstruct` reparses a candidate through
            `md.parseInline` and walks the result in source order — the same
            token-consumption arithmetic `modelLeafInline` already does for
            step 3 — stopping at the first token that is not a plain top-level
            `text`: a mark's delimiter, a code span's backticks, a link's `[`,
            wherever a stray `$` paired into maths. `modelEscapeText` escapes
            that one character, reparses, and repeats until nothing is left to
            find, which is what makes the result minimal rather than merely
            correct: `*a*` escapes only its opening delimiter, because once it
            is gone the second `*` has no partner left and the very next check
            already comes back flat.

            **The obvious version of that search is wrong, and it was tried
            first.** Asking one global question per character — *does
            everything from here on reparse as plain text?* — is blind to
            which construct is actually responsible, so one real pair anywhere
            in the string fails the check for every character to its left,
            including punctuation with nothing to do with it.
            `tests/fixtures/torture.md`'s own adversarial prose found this
            directly: that version escaped a colon and a comma in front of two
            *unrelated* emphasis pairs later in the same sentence — safe,
            since escaping only ever removes a meaning, but not minimal, and
            minimal was the entire point. `modelFirstConstruct`'s narrower
            question — where does the *first* real construct begin, judged
            from its own position rather than the whole string's — was the
            fix.

            **Two things decode silently, with no delimiter pair to find and
            remove, and both needed a different mechanism entirely.** A
            backslash already sitting in plain text in front of punctuation,
            and an entity-shaped run after an `&`, both collapse into an
            ordinary flat `text` token when reparsed — the structural check
            step 3's consumption arithmetic relies on cannot see that the
            *content* is nonetheless wrong, and hunting for which backslash to
            blame by reparsing forward from the start of the string never
            converges: escaping the wrong one only grows a longer run of
            backslashes in the same place, forever — measured directly against
            `already \*escaped\*`, a nested case `torture.md` also carries.
            `modelEscapeSilentTriggers` runs first and fixes both statically,
            with no reparsing at all, because neither answer depends on
            anything else in the string: a backslash before an escapable
            character always needs a second one in front of it to stay
            literal, and an entity-shaped run always needs its `&` escaped.
            `modelFirstConstruct` only ever has to run after that pass has
            already made its one guarantee true.

            Twelve hand-written cases — each named construct's opening
            delimiter alone, two independent pairs in one run leaving
            everything between them untouched, characters with nowhere to
            pair staying bare, both silent triggers, and the nested case that
            broke the first design — then the oracle: **every one of 5,994
            text nodes across the oracle escapes to something that decodes
            back to itself**, run through the real parser rather than trusted
            on the function's own say-so.

        5.  **Links.** The one construct whose spelling is not in `markup` at
            all: re-emitting the tree naively reproduces `inline.content` for
            86.8% of blocks, and **every single mismatch is a link**. Rebuilt
            from `attrs` instead — href, optional title, and inline-versus-
            reference off the `data-ref-label` stamp `referenceAwareLink`
            already writes. CLAUDE.md's existing accepted losses are unchanged
            and need no new argument: a `[text][]` or bare `[text]` shortcut
            re-emits in the explicit form.

        6.  **The suite grows again**, the way it did across 1b's six steps, and
            the numbers go in the check labels so a run reads as a report. It
            now drives a sixth file: `tests/fixtures/torture.md`, added
            2026-09-13 because the other five are a biased oracle — written in
            one voice, uniformly well-formed, and between them holding no
            blockquote, no hard break, no strikethrough and no reference
            definition at all. A suite driving only those would have reported
            full marks on constructs it had never once parsed, and steps 3 and 5
            are mostly about constructs in that list.

        **What it deliberately does not reach**: a table cell, which is 1b's
        floor and unchanged by anything here; the block emitter itself, which is
        slice 3; and the commands that mutate the tree, which are stage 2. The
        tree has to be able to *express* a mark toggle over a range — it does
        not have to perform one.

        **Nothing here is open any more. Two questions were closed by argument
        and one by measurement**; what is left below is the reasoning, because a
        decision with its reasons deleted is a decision that gets reopened.

        **Settled: the parser configuration moves out of `app.js`, and that is
        step 0 of this slice — landed 2026-09-14.** `math` and
        `referenceAwareLink` were registered on the markdown-it instance `app.js`
        builds at its own top level, so the suite — which built a bare one —
        could see neither a `math` token nor a `data-ref-label` stamp, and steps
        3 and 5 are exactly the two that need them. Three ways were on the table and two of them were bad for reasons
        worth keeping:

        - *Write a copy of the rules for the suite to use.* Rejected outright: a
          test that carries its own copy of the logic is not testing anything.
          The two would drift, and the drift would show up as a green run over a
          broken editor — the precise failure the suite exists to prevent.
        - *Have the suite borrow the real rules from `app.js` through
          `tests/dom.mjs`.* This does work — measured 2026-09-13, the captured
          rules mount on a real markdown-it and produce both the stamp and the
          `math` token. It tests the real rules, so it is honest. It was still
          rejected: the app would build its parser one way and the suite assemble
          it another, and the configuration would stay in the wrong file.
        - **Move the two rules into a file of their own.** Taken. The model is
          defined as *markdown parsed by this parser*, so the parser's
          configuration is part of the model layer; it lives in `app.js` by
          accident of history, in among the Turndown rules, the editor bootstrap
          and the keyboard handling.

        The argument that nearly carried the day for the second option was that
        the first would "touch a file the app loads", during a branch that had
        touched none. **That premise was invented and is now refused in writing
        — D7 in [DECISIONS.md](DECISIONS.md).** `main` keeping a working editor
        until parity is sequencing; it was never a rule against improving the
        editor, and read as one it argues for leaving code where it does not
        belong.

        **Settled: a blockquote's `> ` chain is recorded at parse**, by the same
        rule as everything in step 3 and as 1b's step 5 marker. 1b left it open
        between recording the prefix and stripping-and-re-applying at emit time,
        for want of anything to measure — this repo contains no blockquote at
        all. `tests/fixtures/torture.md` supplied the measurement and it decides
        the question twice over. First, `inline.content` has the `> ` chain
        **already stripped**, exactly as it has the list marker stripped, so the
        two are the same problem and want the same answer. Second, and harder:
        **`modelItemPrefix` returns `null` for every list item inside a quote**,
        because a child's source is its lines whole and the marker it looks for
        sits behind a `> `. The fixture has two such items and the suite pins
        them. Recording the prefix makes them ordinary; stripping at emit time
        leaves them broken at parse, where slice 3 cannot reach. The work lands
        in slice 3; the choice does not travel with it.

        **Inherited: stage 0's mark-inheritance rule is expressible here and
        decided in stage 2.** Typing over a fully-bold selection gave plain text
        in the spike, because a new run inherits the marks to its left and the
        left edge of a selection sits outside the bold. The rule wanted —
        inherit from the range that was deleted when there was one, from the
        left when there was not — belongs to a command rather than to the tree,
        but the tree has to be able to say what marks a position carries, and
        step 2 is where that falls out.

        **Two to three days, inside stage 1's one-week line rather than
        additive to it.** Unlike 1b, nothing here was discovered late: the
        `inlines` field has been on every block since slice 1 and this is the
        slice that fills it. The genuinely new machinery is the escaper and the
        link rebuilder; the rest is a tree fold and two offset functions.

    *   **3. The block serialiser — not started.** An edited block emits
        markdown in the conventions `sniffMarkdownStyle` read off the file it
        came from, then `reflowMarkdown` re-wraps it — the same two layers as
        today, applied to one block instead of to a whole document that then has
        most of itself restored. `indexMarkdownBlocks` and
        `restoreSourceWrapping` are what this replaces, and they stay on `main`
        until stage 4 removes them. 1b's step 5 is what hands it a list item's
        marker and indent — and what it does **not** hand it is a blockquote's
        `> ` chain, which that step's entry leaves open with both options
        argued.

        **It closes TODO 2.3 by construction, and that is worth stating because
        the wording above understates it.** "The conventions `sniffMarkdownStyle`
        read off the file" is the old core's rule, and 2.3 is what that rule
        costs: a document-wide sniff rewrites a block spelling a mark the
        minority way, the rewrite changes the block's content key, the restore
        layer misses, and a block nobody edited comes back rewritten and
        re-wrapped. Here the sniff is the **fallback**, not the source of truth —
        slice 2 step 3 records each node's spelling as written, so an edited
        block emits what its own bytes said and only genuinely new content asks
        the sniffer anything. An untouched block is not re-emitted at all, which
        is the same guarantee one level up. Record first, sniff second, per
        MARKDOWN.md's **S3**.

    *   **4. The suite — scaffolded 2026-09-11, and it grows with each slice
        rather than landing once.** `tests/model.test.mjs` drives this repo's
        own files as the oracle; the scaffold, the file oracle and the 39 checks
        covering slice 1 are already in, and 1b's six steps added twelve,
        twenty-three, seven, six, fifteen and four more; the torture fixture and
        the tab-indent fix took it to 114. It imports `npm:markdown-it@13.0.1` the
        way `server/deno.json` already imports `npm:hono` — flagged per
        CLAUDE.md and decided 2026-09-11: the app keeps its CDN tags, the two
        pins have to be kept in step, and `npm test` wants the network once.
        What is left is per-slice coverage, so this line closes when 3 does.

    What this stage deliberately does not do: edit inside a table cell, or
    reach the inline structure of anything beyond slice 2's tree. Before 1b it
    did not edit inside a list or a quote either — those were one block each,
    holding their source and their token subtree, and 1b is exactly the slice that stops that being true.
    Nothing in `front/` loads `model.js` yet, because until the model can render
    and be edited there is nothing for the app to call — it joins the three
    registries at stage 4. That is how far the model has got and not a rule about
    what the branch may touch: **D7 in [DECISIONS.md](DECISIONS.md)** is there
    because this sentence used to claim the second thing, and slice 2 opens by
    moving two rules out of `app.js` on the strength of it.
*   **2. Core to parity — not started.**
*   **3. The 1.1 items — not started.**
*   **4. Reintegration — not started.**
*   **5. Fallout — not started.**

## What is accepted

- **The core is owned forever.** execCommand gave IME, mobile keyboards and
  accessibility for free, badly. After this they are Mandy's to keep working,
  and a browser update can change what `beforeinput` reports. That is the
  price of a document the app controls, and for this app's audience it is the
  right trade — but it is a permanent maintenance surface, not a one-time cost.
- **Android and in-document drag are unmeasured** on the first pass, above.
- **Block granularity is final.** An edited paragraph re-serialises whole. This
  was already the roadmap's position and the model makes it structural.
- **No 1.0 until this lands.** `main` keeps the working editor; the branch
  carries the rewrite; nothing ships in between.
