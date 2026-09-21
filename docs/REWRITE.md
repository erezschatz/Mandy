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

*   **1. Model and serialiser — done and tested, 2026-09-18**, started
    2026-09-11.
    **→ MERGED TO `main` 2026-09-18, `5322693`** — D8's first of two, in
    [DECISIONS.md](DECISIONS.md), and the safe one: it changed nothing the
    editor does, since `model.js` is in none of the three registries. What it
    carried over is `markdown-parser.js`'s refactor of the live parser
    configuration, slice 3 step 5's change to `wrapMarkdownLine`, TODO 2.3's
    hard-break fix in `markdown-style.js`, the six oracle fixtures, the spike
    page, and an end to the two branches' documents drifting. All of the code
    merged with no conflict, which is what D8 predicted; the documents were
    where the work was, and two of them were hiding a number collision no
    textual merge would have shown — both branches had been allocating D- and
    TODO-numbers from one space for a fortnight, so `main`'s D7 became D9 and
    its 4.6 became 4.12. CHANGELOG.md's entry for the merge is the detail.

    **The branches have been identical since**, so stage 2 is what makes them
    diverge again, and the next merge is stage 4's — the one that cannot be
    taken back.

    **The exit criterion is the estimate table's, and all three clauses are
    met.** Checked against the **living** files rather than the frozen oracle
    copies, once and by hand on 2026-09-18, because that is what the criterion
    names: `CLAUDE.md`, `README.md`, `front/welcome.md` and `docs/TODO.md` all
    round-trip byte-identical through the model with no browser involved, and
    every inline-bearing leaf in each re-emits its own bytes: 279, 107, 34 and
    121 of them. Editing one paragraph changing one paragraph is the
    suite's sweep, now with a real emitter under it. The third clause, *the
    `save-fidelity` suite's cases pass against the model*, is the one that
    needed reading rather than running: that suite's cases are statements about
    constructs the old core has to work to preserve, and about Turndown and the
    DOM, which have no model equivalent. So the constructs are what is
    asserted — twenty of them, each round-tripped and then re-emitted from its
    own tree. That is an interpretation, and it is written down here so it can
    be argued with rather than assumed.

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
        `tests/model.test.mjs`.

    *   **1b. Sub-blocks inside containers — done and tested, 2026-09-12, and it
        was not optional.** All six steps below are in. The mechanism is: a container's children tile
        it exactly, one `modelTouch` at a child clears every container above it,
        and serialisation re-emits that child while handing back every sibling.
        Editing the first bullet in `docs/TODO.md` asks the emitter for 10 lines
        where the same edit used to re-serialise the 267-line list it sits in,
        and a bullet five blocks down costs one emitter call. Every item also
        carries its own marker and continuation indent, which is what slice 3
        emits from. The suite asserts the metric rather than leaving it measured
        by hand: **editing the worst block in the oracle's copy of `docs/TODO.md`
        rewrites a fraction of its lines where the same edit cost the whole
        enclosing list before this slice**, and every block it drives rewrites
        exactly itself when edited one at a time. The live figures are in the
        check labels rather than here. What the slice was argued from, measured
        2026-09-12 on the file as it then stood: `docs/TODO.md` was 708
        lines and **16 blocks**, because a whole section's bullet list is one
        top-level token. The largest was 239 lines — a third of the file — so
        editing one TODO item would re-serialise a third of the file, which is
        exactly the unmergeable diff D1 exists to prevent.

        The sharper number is not the largest block but the share of the file
        that is inside one: **93% of `docs/TODO.md`'s lines sit inside a list,
        a quote or a table**, and so inside a single block each. `REWRITE.md`
        was 49% at the time, `CLAUDE.md` and `README.md` 37%, `welcome.md` 33%.
        Top-level
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

            Measured rather than assumed, in checks driving the function
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
            slice 1 was in: `corpus/todo.md` comes back as dozens of containers
            nesting five deep. Four more things fell out rather than being built:
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
            the file's largest list, and editing it asks the emitter for that
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

            - Editing the worst block in `corpus/todo.md` rewrites a small
              fraction of its lines, asserted under 5%.
            - Its largest **top-level** block is still about a third of it,
              asserted over 25% — the guard that the first number moved because
              of sub-blocks and not because the file got shorter or its lists
              got smaller. That block is still there; what changed is that
              nothing re-serialises it.
            - No file's worst edit is a tenth of it. The label carries the
              per-file percentages, which is the only place they are written
              down: prose that repeated them went stale every time anything was
              edited, and since 2026-09-16 the oracle is a fixture precisely so
              that a number has one home.
            - The exhaustive version of the single-bullet case: **every block
              in the oracle, edited one at a time, rewrites exactly its own
              bytes and nothing else.** It re-parses per block, since
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

    *   **2. The inline model — done and tested, 2026-09-15.** All six steps
        are in: 0 through 5 landed in order (3, 4 and 5 all on the last day),
        and step 6 — the suite growing — was folded into each of them as it
        landed rather than left for last. A paragraph's
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
            nothing to keep; the oracle spells every mark both ways, in numbers the
            check label reports, so that is measured rather than argued. Leaves are text, code span, image, `math`, and the two
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
            `text("") strong text("")`, and a few hundred of the oracle's text
            tokens are these. The fold drops them: they hold no bytes, so
            nothing can be lost, and keeping them would put positions in step
            2's offset space that no caret could tell from their neighbours. It
            is checked *as* an omission, which is the part worth having — every
            token not in the tree is asserted to be an empty text token, so the
            rule cannot quietly grow a second exception.

            The hand-written constructs one at a time, and then
            the oracle, where across every inline-bearing block all the nodes
            are the parser's own tokens, each in the tree exactly once and in
            order. Every kind those files contain is named — the label lists
            them with their counts — with none falling through
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

            Each rule on its own, both directions agreeing on
            every offset of a block holding a mark, an atom and a break, and the
            clamps. Then the oracle, where the property is the fixpoint —
            **every leaf in it, at both edges and its middle, maps to
            an offset that maps back to the same place**, across a quarter of a
            million characters. And one check that is not the
            model marking its own homework: in the blocks whose tree is a
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
            using it does not own those bytes. The hand-written cases —
            each of the four named spellings both ways, the fifth (a break's
            surrounding whitespace), a title in both quote styles, an autolink,
            all three reference-link forms, an image inline and by reference,
            nested marks, and the thrown entity failure — then the oracle: every
            **inline-bearing block in the oracle reconstructs its own source
            exactly**, which given its diet of these constructs
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
            number that matters is smaller still: of the oracle's thousands of
            text nodes, a mere handful actually need a backslash to round-trip, which is
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

            The hand-written cases — each named construct's opening
            delimiter alone, two independent pairs in one run leaving
            everything between them untouched, characters with nowhere to
            pair staying bare, both silent triggers, and the nested case that
            broke the first design — then the oracle: **every text node in it
            escapes to something that decodes back to itself**, run through the real parser rather than trusted
            on the function's own say-so.

        5.  **Links — done and tested, 2026-09-15.** The one construct whose
            spelling is not in `markup` at all: re-emitting the tree naively
            reproduces `inline.content` for 86.8% of blocks, and **every single
            mismatch is a link** — the measurement that was step 3's whole
            argument for recording a tail from source in the first place.
            Step 3 answers that for anything untouched; this is the other
            half, for a link or image with no `tail` because a command built
            it fresh or changed only its destination. Rebuilt from `attrs`
            instead — `modelRebuildTail(token, destAttr)` reads href (or
            `src`), an optional title, and inline-versus-reference off the
            `data-ref-label` stamp `referenceAwareLink` already writes, the
            same read step 3's own tail-parsing does rather than a second
            decision about what the stamp means. CLAUDE.md's existing accepted
            losses are unchanged and need no new argument: a `[text][]` or bare
            `[text]` shortcut rebuilds in the explicit form, because the stamp
            only ever records which label resolved, never which of the three
            spellings asked for it.

            **The destination and title are new markdown, not a spelling put
            back**, and that difference matters: `token.attrGet("href")` is
            already what `normalizeLink` made of whatever was typed —
            percent-encoded, most often — not what a fresh command would type,
            so a bare destination is correct far more often than step 3's own
            measurement of *existing* documents would suggest.
            `modelEscapeLinkDestination` wraps in `<...>` only when the
            resolved string still contains whitespace, a paren, an angle
            bracket, or a control character, escaping `\`, `<` and `>` inside
            in that order — backslash first, so the two escapes this adds for
            `<` and `>` are never mistaken for one the destination already
            had, the same ordering rule `modelEscapeSilentTriggers` follows a
            level down. `modelEscapeLinkTitle` quotes and escapes the same way.

            **What this does not reach, on purpose:** whether a rebuilt
            reference's label still resolves to a definition anywhere in the
            document is a question about the whole document, which a single
            node's own `token` cannot answer — that belongs to whichever
            block-level emitter eventually calls this, the same boundary
            `scanReferenceDefinitions` already draws on the running app.

            The hand-written cases — a bare destination, a title, a title
            holding its own quote and its own backslash, a destination that
            normalises to something bare-safe, a reference link rebuilt from
            each of its three source spellings, an image, and a destination
            that genuinely needs the bracketed form — each verified the same
            way step 3 verifies a link's raw tail: reparse the *rebuilt*
            markdown, definition included where one is needed, and compare its
            `attrs` against the original token's. Nothing in the oracle
            exercises this on its own, since every parsed link already carries
            the tail step 3 recorded; that absence is exactly why every case
            here clears `tail` by hand rather than finding one.

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

    *   **3. The block serialiser — done and tested, 2026-09-18.** All six
        steps are in; 1 and 2 landed on the 16th, 3 to 6 on the 18th. An edited
        block emits markdown in the conventions **its own bytes recorded**,
        falling back to the ones `sniffMarkdownStyle` read off the file it came
        from, and `reflowMarkdown` re-wraps it — the same two layers as today,
        applied to one block instead of to a whole document that then has most
        of itself restored. `indexMarkdownBlocks` and `restoreSourceWrapping`
        are what this replaces, and they stay on `main` until stage 4 removes
        them. It is the last slice of stage 1, and the stage's exit criterion in
        the estimate table — the `save-fidelity` cases holding against the
        model — is this slice's to meet.

        **What a block emitter is actually asked for was measured before this
        was planned** (2026-09-16, across all six oracle files, which became
        fixtures the same day and so are the numbers a rerun gives), the same
        way 1b's tiling table and slice 2's inline table were. The first three rows
        decide the shape of the slice:

        | Measurement | Reading |
        | --- | --- |
        | Leaves — the only blocks that can reach `emit` | 975 of 1,448 blocks |
        | Leaves carrying an inline tree | **861** — 767 paragraphs, 94 headings |
        | Leaves with `inlines === null` | **114** — 72 table rows, 21 gaps, 14 fences, 6 rules, 1 indented code block |
        | Inline-bearing leaves whose `source` is a per-line **prefix** plus the inline source | **851 of 861** |
        | The ten that are not | all headings, all in `torture.md` — 7 setext, 3 with closing hashes. Both are **suffixes** |
        | Leaves inside a blockquote | 20, across 5 quotes nesting 3 deep |
        | Distinct per-line quote chains | 6 shapes, one of them `["> ", ""]` — a lazy continuation carrying no `>` at all |
        | Items where `wrapMarkdownLine` re-derives an indent disagreeing with the recorded one | **1 of 341** |
        | Paragraphs holding a line break the author wrote | 582 of 767 |

        **This is an affix problem rather than a serialisation problem**, and
        that is the finding. Slice 2's step 3 already reconstructs
        `inline.content` byte-exactly for every inline-bearing block; the fourth
        row says a block's `source` is that content with something glued to the
        front of each of its lines. So the emitter's job is not *turn a tree
        into markdown* — that is done — but **put back what markdown-it stripped
        off `inline.content` on the way in**, which is the same sentence 1b's
        step 5 and slice 2's step 3 are both instances of, arriving a third time
        one level up. It also means the slice has almost no new invention in it:
        the thing that writes markdown from nothing already exists and was
        measured at 851 for 861, the ten exceptions being the heading suffixes
        below.

        **Only two of the seven leaf kinds can be emitted at all, and the other
        five are right rather than missing.** A fence, an indented code block, a
        rule, a gap and a table row carry no inline tree, so there is nothing to
        emit *from* — and nothing should be. Their content **is** source and is
        edited as source, so a command sets `source` rather than nulling it and
        `modelEmitBlock` is never reached. That is the answer to the
        `edited <kind> block with no serialiser` throw for five kinds out of
        seven, and it is a constraint on stage 2's input layer rather than work
        for this slice. The table row is the sharpest of them and is 1b's floor
        unchanged: `td_open` carries no `map`, so a cell is not a block and a row
        is edited whole.

        **Six steps, in this order:**

        1.  **The quote chain, recorded per line — done and tested,
            2026-09-16.** `modelQuotePrefix` and the `quotePrefixes` field, one
            string per line of a block's source. The decision
            travelled from slice 2 already made — record at parse, never strip
            and re-apply at emit — and what the measurement added is the
            **unit**.
            It is a line, not a block: one paragraph in `torture.md` has the
            chain `["> ", ""]`, a lazy continuation carrying no `>` at all, and
            another starts at `"  > "`, two columns in. A single per-block
            prefix would rewrite both into something of the same width and
            different bytes, which is exactly the mistake 1b's step 5 made for
            one day with a list item's tab. So a quoted block records the affix
            **each of its own lines carried**, and a line an edit added takes
            the last recorded one.

            **Depth is the number of quote containers a block sits inside**,
            so a block records the chain of the quotes it is *in* and never its
            own: a quote is a container and re-emits from its children, each of
            which carries the chain including that quote's level. A line that
            runs out of chain before the depth is a lazy continuation and keeps
            what it had, which is how `["> ", ""]` falls out rather than being
            special-cased.

            It made the two items `torture.md` has behind a `> ` ordinary, which
            is what it was for: `modelItemPrefix` returned null for both,
            because the marker it scans for sat behind the chain, and the check
            that pinned that through 1b now asserts the opposite — they carry
            the marker the author wrote, and it is the parser's own `markup`.

            **What can go wrong here is not byte-exactness**, and that shaped
            the checks. Whatever this claims as prefix, the rest of the line is
            the remainder, so a block always reassembles; what can be wrong is
            the split landing somewhere markdown-it did not put it, and only
            `inline.content` can say. So the oracle check strips the recorded
            chain off a quoted paragraph's lines and asserts what is left is
            exactly the content — and **a paragraph is the only leaf that
            isolates the chain**, which the check found by failing when it was
            written wider: `> ### A heading inside a quote` has the content
            `A heading inside a quote`, because a heading's own `### ` comes off
            as well. That is not a chain recorded wrongly, it is the next marker
            down, and step 2 is what records it.

        2.  **The heading's shape — done and tested, 2026-09-16.**
            `modelHeadingShape` and the `headingShape` field: the ten exceptions
            above, and the only place in the model where an affix is a suffix.
            Three spellings: ATX with its own `#` run, ATX with a closing run
            (`#### x ####`, 3 in `torture.md`), and setext with an underline
            character and a length (7 more). Recorded rather than derived, for
            the reason everything here is: `======` and `===` are the same
            heading and different bytes, and a heading's `level` — which the
            block has carried since slice 1 — says nothing about which of the
            three wrote it.

            **The branch is taken on the parser's own `markup`** — a hash run
            for ATX, `-` or `=` for setext — rather than on a guess about line
            counts, which is the same rule the rest of the model follows: read
            what markdown-it recorded instead of re-deriving it. And the result
            is **verified against `inline.content` rather than trusted**, so a
            shape that does not line up comes back null and step 3 has nothing
            to emit from, exactly the safe direction `modelItemPrefix` already
            takes. Measured before it was written and again after: all 94
            headings in the oracle resolve, with no unresolved case to leave a
            null behind.

            The check that matters is byte-level and is the one step 3 rests
            on: **the recorded shape reassembles each heading's own source,
            chain included.** An untouched heading re-emits from `source` and
            cannot fail; what this asserts is that an edited one has everything
            it needs, which is the only reason any of it is recorded.

            One thing it makes survive that is worth naming rather than
            discovering later: `torture.md` opens with YAML front matter, and
            the app's parser has no front-matter rule, so `---` / `title: …` /
            `---` arrives as a **setext h2** and re-emits as one. Recording the
            shape makes that byte-correct while leaving it semantically wrong.
            `MODEL_BLOCK_KINDS` already names a `front_matter` kind for whenever
            that is worth fixing; it is not this slice's to fix, and saying so
            is cheaper than meeting it again in slice 3's suite.

        3.  **`modelEmitLeaf` composes — done and tested, 2026-09-18.** Slice
            2's `modelInlineSource` for the content, then the affixes back **in
            the order markdown-it took them off**, which is measured rather than
            assumed: the quote chain sits outside the item marker, because
            `> 1. A list inside a quote.` has content `A list inside a quote.`
            and both were stripped. An item's `marker` goes on the first line
            and its `contentIndent` on the rest — 1b's step 5's two fields,
            finally read by something.

            `modelEmitBlock`'s three cases are unchanged; this is what its
            `emit` argument has been standing in for since slice 1b's step 3.
            It stays an argument rather than becoming a call, because the
            emitter needs the parser — `modelEscapeText` reparses — and a
            serialiser that reached for its own would be the mistake the top of
            `model.js` rules out.

            **The affixes are absolute, and that is what the measurement
            decided.** Only the **nearest** item ancestor contributes, because a
            child's `source` is its lines whole (1b's step 2): the marker
            recorded for `    *   **1.1.6**` already carries the four columns the
            item outside it contributed. Stacking every item above a block
            instead reproduces **707 of the oracle's 861** inline-bearing
            leaves, and every one of the 154 it misses is a bullet inside a
            bullet.

            **Two suppressions, and both are the same failure in different
            clothes: an affix recorded from its own column 0 has already claimed
            the item's indent, so adding it again writes the same columns in
            different bytes** — 1b's step 5's tab bug, one layer along.
            `modelQuotePrefix` matches ` {0,3}>` from the raw line, so for a
            quote **inside** a bullet it claims `"  > "`, indent included; the
            reverse nesting is unaffected and must be, since in `> - item` the
            item sits at the quote's own depth and `modelItemPrefix` read its
            marker off the chain-stripped line. A heading's `open` was recorded
            off the chain-stripped line the same way, which is exactly what step
            2 pinned — the shape plus the chain reassembles the heading's source
            — so a heading takes no item affix at all. Those two are the only
            leaves in the whole oracle that a naive composition gets wrong, and
            they are both in `torture.md`, which is the fixture earning its place
            for the fourth time.

            **Three refusals, each a spelling the model recorded as `null`
            rather than guessing at.** A leaf with no inline tree — a fence, an
            indented code block, a rule, a gap, a table row — has its content
            *as* source and is edited as source, so a command sets `source`
            rather than nulling it and this is never reached; that is five of
            the seven leaf kinds answered, and it is a constraint on stage 2's
            input layer rather than a hole here. A heading whose shape did not
            line up against `inline.content` (step 2) and an item whose first
            line carried no marker this model recognises (1b's step 5) throw the
            same way `modelEmitBlock` already throws for a leaf with no
            serialiser at all.

            Fifteen checks, and **every one of the seven ways the composition
            can be wrong was written as a deliberate break first and confirmed
            to fail** — stacked affixes, either suppression dropped, the marker
            on every line, every block treated as opening its item, the heading
            suffix dropped, one quote prefix for a whole block. Two of them were
            caught only by the oracle sweep on the first pass, which is how a
            hand-written case reaching for the wrong leaf was found. The
            property the step can state exactly is step 6's headline arriving
            early, and it is in: **throw away every inline-bearing leaf's
            `source` and emit it from its tree alone — all 861 come back
            byte-identical**, the 114 without a tree refusing rather than
            guessing.

        4.  **The reference definition a rebuilt link needs — done and tested,
            2026-09-18.**
            Slice 2's step 5 rebuilds `[text][label]` from the `data-ref-label`
            stamp and explicitly declines to ask whether that label still
            resolves, because a single node's token cannot answer a question
            about the whole document — it named "whichever block-level emitter
            eventually calls this" as the owner, and **this is that emitter**.

            The model can answer it where `main` cannot. A definition is a block
            in its own position (slice 1), so the document is a list that
            can be searched and a definition that is still there stays where the
            author put it — where `appendReferenceDefinitions` has no position
            to reason about and collects every definition at the end of the
            file. The cost is a signature: the emitter is handed the document as
            well as the block. That is the one piece of new plumbing in the
            slice, and it is worth it for being the step that retires a named
            accepted loss rather than carrying it across.

            **The plan said `gap` block and the measurement said otherwise**,
            which is the one thing here that was not known in advance.
            `> [b]: u` parses to a **quote** whose only content is the
            definition, so it has no child tokens at all and is a childless leaf
            rather than a container holding a gap; `> > [h]: deep` is the same
            one level down. Scanning the gaps misses both. The rule that holds is
            **a leaf with no inline tree, and nowhere else** — which is exactly
            the set step 3 refuses to emit, and not by coincidence: such a leaf's
            content *is* source, and a definition is content no inline tree ever
            held.

            **`modelReferenceLabels` asks the parser rather than a regex.** Each
            candidate leaf's bytes go back through `md.parse`, whose
            `env.references` is markdown-it's own record of what it just defined
            — the same reuse `modelFirstConstruct` and step 3's link-tail parsing
            already argue for, and it is what makes the retired loss free:
            `scanReferenceDefinitions`'s single-line regex cannot see a
            definition **wrapped onto a second line** at all, and `torture.md`
            carries one saying so in its own prose. The scan is lazy and runs at
            most once per emitted block, never cached across blocks — the answer
            is about the document as it now stands, and an edit to a definition
            is exactly what a cache would go stale on.

            Verified against the parser's answer for the whole file, on all six
            oracle files — **five definitions, every one of them in
            `torture.md`, and none in the other five**, which is the bias that
            fixture exists for arriving a fifth time — and on ten hand-written
            cases either side of the line: a definition in a list item, one in a
            quote, one two quotes deep, two in one block, one wrapped, and the
            four places a definition-shaped line is *not* one (inside a fence,
            inside indented code, inside a table cell, lazily continuing a
            paragraph). Then the emitter itself: a rebuilt reference whose
            definition is still there keeps its label, one whose definition has
            been deleted falls back to the inline form rather than writing a
            reference that renders as literal text, and one emitted with **no
            document handed over** keeps the stamp's spelling — step 5's
            behaviour unchanged, because a caller that was not given the means to
            answer should not materialise a possibly stale href on the strength
            of a guess. Each of the five ways it can be wrong was broken on
            purpose first and confirmed to fail.

            **One limitation is pinned rather than fixed, and it was measured
            here**: `referenceAwareLink` replaces markdown-it's inline `link`
            rule and nothing else, so an **image** resolved through a reference
            carries no `data-ref-label` at all. An untouched one still
            round-trips on the tail step 3 recorded; a rebuilt one can only come
            back inline. Fixing it means copying the `image` rule the way the
            `link` rule was copied, which is a change to the parser
            configuration rather than to this emitter, and belongs wherever
            slice 2's step 0 would be revisited.

        5.  **Re-wrap, and only where the content moved — done and tested,
            2026-09-18.**
            `inline.content` preserves the author's own line breaks — 582 of 767
            paragraphs hold one — so an **unedited** block needs no width at all,
            and an edited one re-wraps only because its text changed.
            `reflowMarkdown` at the width `sniffWrapWidth` read: 80 for three of
            the six oracle files, 79 for two, and **0 for `README.md`**, which is
            not hard-wrapped and where imposing a width would be its own damage.

            **The prefixes are passed in rather than re-derived, and that is a
            change to `markdown-style.js`.** `wrapMarkdownLine` today reads the
            quote chain and the item marker back off the line it was handed, by
            regex, and computes the continuation indent as
            `" ".repeat(marker.length)` — spaces only. Measured against the
            recorded value it disagrees on **1 of 341** items, and that one is
            the marker `"-\t"`, where the file continues under a bare tab and
            the wrapper would write two spaces: the same column, different
            bytes, and precisely the bug 1b's step 5 fixed at parse sitting
            unfixed one layer along. Re-deriving is the second place free to
            disagree that this whole model exists to avoid, so the wrapper takes
            a first-line and a continuation prefix instead of guessing at them.
            It touches a file the app loads, and **D7 in
            [DECISIONS.md](DECISIONS.md) is why that costs nothing** — it
            deletes a workaround rather than carrying one forward, which is the
            work rather than a detour from it.

            **The derivation is now `wrapMarkdownPrefixes`, and it stays as the
            default**: `reflowMarkdown` is handed a document as text and has
            nothing else to consult, so the guess is right there and only there.
            What the measurement adds is *why it was never seen*: a marker only
            ever reaches that path from Turndown's own `listItem` rule, whose pad
            comes from a sniff matching spaces alone
            (`/^(\s*)([-*+])( +)\S/`), so the tab case is unreachable through
            the app. It took reading a file's own bytes to find it at all, which
            is the whole argument for recording rather than deriving. The check
            in `save-fidelity` therefore pins the difference rather than
            reporting a live fault.

            **What is not re-wrapped is most of the value.** A heading never is,
            in either spelling — a wrap turns its tail into a paragraph, and
            `reflowMarkdown` refuses one by looking for a `#`, which misses
            setext entirely where the model simply knows what kind of block it
            holds. A line carrying maths never is, which is the one guard
            structure cannot replace since an equation is inline and can sit
            anywhere. And a line already inside the width is left exactly where
            it was, because `inline.content` keeps the author's own breaks: only
            a line the edit made too long is touched. `reflowMarkdown`'s own
            comment has said it never joins, only breaks, since it was written;
            that is what makes this minimal rather than a re-flow.

            **The metric, on the six oracle files: all 861 inline-bearing leaves
            compose exactly, and re-wrapping each at its own file's width leaves
            783 of them byte-identical.** The 78 that move are blocks holding a
            line the author let run past the width — which is a *guaranteed*
            population rather than a fault, since `sniffWrapWidth` takes the
            95th percentile and so about one prose line in twenty is longer than
            it by construction. Against `main`, where an edited paragraph is one
            Turndown line re-flowed whole, every one of the 861 would move.

            **It found a defect in step 3, which is the honest account rather
            than a footnote.** A paragraph indented one to three spaces is still
            a paragraph, and markdown-it strips that indent off
            `inline.content` exactly as it strips a list marker — so an edited
            one came back flush left, silently. None of the recorded affixes
            carried it, and 861 of 861 passed with it missing because not one
            paragraph in the oracle is indented. `leadingAffix` is the fix:
            **everything markdown-it took off the first line, recorded whole**,
            with the emitter subtracting the item prefix it is putting back and
            keeping the remainder. Whole rather than named because the pieces
            that need naming are named already — a command has to be able to
            change a marker — and one subtraction in the emitter beats a second
            derivation at parse. Verified against `inline.content` the way
            `modelHeadingShape` is, and a shape that does not line up leaves a
            null the emitter refuses on.

            **`model.js` now calls into `markdown-style.js`**, for
            `wrapMarkdownLine` and `hasMathSpan`, rather than carrying a second
            copy of either. That is a real load-order dependency the three
            registries have to honour, and they do as of stage 2's slice 1 — the
            model follows `markdown-style.js` the way `undo.js` follows
            `app.js`. The `model` suite loads the two together for the same
            reason, which is what pinned the order before there was a bundle to
            pin it in.

            Six checks in `model` and three in `save-fidelity`, with each of the
            six ways the composition can be wrong broken on purpose first and
            confirmed to fail. And because this is the first step to change a
            file the app loads on the **save path**, `npm test` is not the
            verification: the real one is
            [tests/fixtures/break-test.md](../tests/fixtures/break-test.md),
            run by hand in the browser on 2026-09-18 and reported in the
            CHANGELOG — the refactored wrapper writes **byte-identical output**
            to the committed one for the same document, editing DELTA re-wraps
            DELTA and nothing else, ALPHA's and BRAVO's hard breaks survive, and
            ECHO comes back byte-identical. CHARLIE still diverges, and still
            for TODO 2.3's reason rather than this step's: the committed
            wrapper produces exactly the same divergence.

        6.  **The suite grows again — done and tested, 2026-09-18.** The
            property this slice can
            state exactly, and it is the sharpest one available — **throw away
            every inline-bearing leaf's `source` and emit it from its tree —
            every one of them comes back byte-identical** — **landed with step 3
            rather than waiting for this one**, the way slice 2 folded its own
            step 6 into each step as it went. The hand-written cases landed the
            same way, one per decision as each step went in.

            So this line is the two claims one level up, which are the
            existing checks with a real emitter under them instead of a
            throw — and the difference is that they go through
            `modelSerialise`, so the emitter sits under the whole recursion (a
            leaf's bytes, its item, its list, the separators between them, the
            document's prefix) rather than being called directly. **Every
            inline-bearing leaf in a file edited at once, and the file still
            serialises byte-identical; and each one edited alone rebuilds the
            file around itself exactly, for exactly one emitter call.** That
            second is 1b's step 6 sweep with a real emitter under it, where
            until now it had only ever measured containers handing back bytes
            that already existed.

            **Both count the emitter's calls, because that is the only way they
            can pass by doing nothing.** A `modelTouch` that failed to clear
            leaves an untouched document, which serialises from its own bytes
            and comes back identical with the emitter never running — so the
            counts are asserted (861 leaves, 861 calls; and one call per
            single-leaf edit, which is 1b's no-sibling-is-re-serialised result
            stated at document scale). Confirmed against a `modelTouch` stubbed
            to a no-op, where both read **0 emitter calls** and fail.

            A third check turns the width on, and the per-file counts match
            step 5's own measurement exactly from the other direction — which
            is worth more than either alone, since the two are computed by
            different code.

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

        **S3's other half has no caller in this slice, and that is the honest
        reading rather than a gap.** The fence character (` ``` ` versus `~~~`)
        joins the sniff set for new content, and a fence is never re-emitted
        here — it is one of the five source-edited kinds above. The first thing
        that can make a fence out of nothing is stage 2's Code command, so the
        sniff lands with the caller that needs it rather than ahead of it.

        **What it deliberately does not reach**: the five leaf kinds with no
        inline tree, which are edited as source by the argument above; a table
        cell, which is 1b's floor and unchanged by anything here; and the
        commands that mutate the tree, which are stage 2. The emitter has to be
        able to write a block the tree describes — it does not have to be the
        thing that changed it.

        **Two to three days, the last of stage 1's one-week line rather than
        additive to it.** Nothing here was discovered late and nothing is a
        second parser: four of the six steps record a spelling at parse the way
        two slices already do, one is a composition, and one is a parameter on a
        function that exists. The genuinely new thing is step 4's document-wide
        reference question, which is small and is the only place the emitter
        needs to know about anything outside its own block.

    *   **4. The suite — done, 2026-09-18, having grown with each slice rather
        than landing once.** `tests/model.test.mjs` drives this repo's
        own files as the oracle; the scaffold, the file oracle and the 39 checks
        covering slice 1 are already in, and every step since has added its own.
        How many there are is what a run prints; it is not written down here,
        for the same reason no count is since 2026-09-16. It imports `npm:markdown-it@13.0.1` the
        way `server/deno.json` already imports `npm:hono` — flagged per
        CLAUDE.md and decided 2026-09-11: the app keeps its CDN tags, the two
        pins have to be kept in step, and `npm test` wants the network once.
        Per-slice coverage was what was left, so this line closed when 3 did.

    What this stage deliberately does not do: edit inside a table cell, or
    reach the inline structure of anything beyond slice 2's tree. Before 1b it
    did not edit inside a list or a quote either — those were one block each,
    holding their source and their token subtree, and 1b is exactly the slice that stops that being true.
    Nothing in `front/` loaded `model.js` through the whole of this stage,
    because until the model could render there was nothing for the app to call.
    **That ended with stage 2's slice 1**, on 2026-09-20, which put it in all
    three registries — earlier than this line used to predict, and the reason is
    in that slice's preamble. It was always how far the model had got rather
    than a rule about what the branch may touch: **D7 in
    [DECISIONS.md](DECISIONS.md)** is there because this sentence used to claim
    the second thing, and slice 2 opens by moving two rules out of `app.js` on
    the strength of it.
*   **2. Core to parity — in progress; planned 2026-09-18, started 2026-09-20.**
    Slices 1 to 5 of seven are done and tested, slices 4 and 5 driven by hand
    in all three engines; slice 6 is a step in. Not a merge point, and neither is any place inside it: build-order steps 2 through 4 are
    render, input and formats, and between a renderer that exists and formats
    at parity there is nowhere to stop. Its end is a real boundary and still
    the wrong merge — `main` would take the whole input layer's risk while the
    save path is still the three-layer restore. D8 has the argument.

    The exit criterion is the estimate table's: **everything the app does
    today, on the new core** — undo, the thirteen formats, lists including the
    two hand-rolled behaviours, paste, links, Mermaid and MathJax. What it
    pointedly does not include is the save path. At the end of this stage
    `file-api.js` still reads `editor.innerHTML`, Turndown still serialises it,
    and a save still goes through `indexMarkdownBlocks` and
    `restoreSourceWrapping`. The model owns *editing*; the file belongs to the
    old core until stage 4. That split is the whole of D8's objection to
    merging here, and it is also what makes the stage survivable: every slice
    below can be wrong without a file on disk being wrong.

    **The criterion has one named exception, decided before the work rather
    than discovered during it: a table refuses edits.** Slice 4 has the
    argument. It means this stage closes *knowingly* short of "everything the
    app does today" by one behaviour — typing into a cell's text — and that is
    written here rather than only in the slice so the stage cannot be reported
    as at parity by someone reading the criterion alone. Stage 3 lifts it, as
    TODO 1.1.8.

    **`model.js` joins the three registries in slice 1, not at stage 4.** Slice
    1 above says stage 4, and that was written when the boundary had not been
    looked at closely: for the editor to draw from the model the file has to be
    in `index.html` and in `SHELL_ASSETS`, and an editable export whose core is
    the model needs it in `ASSETS` too or it ships a dead editor. The sentence
    in slice 1 and the matching one in CLAUDE.md are corrected in the commit
    that lands slice 1 rather than now, so the claim moves when the fact does.

    **The model is built by converting the stored HTML, not from the `source`
    key.** Decided 2026-09-19, and it is the one question that blocks slice 1.
    Five of the places a document arrives hand over markdown and are fine —
    file open, the welcome document, upload, paste markdown, a new blank
    document. **Two hand over HTML**: the restore-from-autosave at boot and
    `adoptActive`'s load from storage, because this stage deliberately leaves
    `content` as HTML. The `source` key looks like the answer and is not: it
    holds the markdown the document *arrived* as, so at boot with unsaved edits
    it has the right bytes and the wrong content, and rendering a model built
    from it would wipe those edits off the screen.

    So those two sites run the stored HTML through Turndown and parse the
    result. It loses the source spans of blocks edited before the reload —
    which is **exactly today's behaviour**, since such a block already misses
    `indexMarkdownBlocks` and is re-wrapped — and it is the same conversion
    stage 4 has to write anyway as its one-time migration, so it gets exercised
    for two stages before it becomes the thing a `git revert` cannot undo. It
    also settles a question the slices would otherwise have to: a tab switch
    re-parses on adopt, so **`tabs.js` needs no model bundle and this stage
    does not touch it**, which is what the replaced-code table already
    promises.

    **The new core sits behind a flag, default off, until the stage 4 merge.**
    Decided 2026-09-19. **And it says so on screen from 2026-09-21**: the
    toolbar carries a `model core` marker, a link back to `?core=legacy`. That
    was not in the plan and should have been, because the flag's whole purpose
    is the hand A/B below and there was no way to tell which half of it you were
    looking at — which is worse than having no comparison, since it invites
    reporting a difference between two runs of the same core. Slice 1's rule is
    that the model renders *identically*, so "it looks the same" is the expected
    answer; what differs is what does not work yet, and the marker's title names
    it. One function, one call site, one CSS rule: it goes at stage 4 with the
    flag. Slice 3's real verification is driving the running app
    — the way `list-indent-check` and `list-empty-item-check` already do it in
    an `<iframe src="/">` — and a flag is also what makes an A/B of the same
    document by hand possible, which is the only way a rendering divergence
    gets *seen* rather than inferred. The cost is two paths in `app.js` for the
    length of the stage and a flag to remove afterwards.

    `main` is not a reason for it: no merge is planned before stage 4's end,
    and if both are wanted running at once the answer is `MANDY_PORT`, since
    the two share one `localStorage` on one origin. The flag is for the
    branch's own usability and for measurement.

    Seven slices. The order is forced — each is unusable without the one before
    it — and the first four are where the estimate's risk is:

    *   **1. Render — done and tested, 2026-09-20.** `modelRender(doc)` builds `#editor`'s
        children; `modelRenderBlock(block)` builds one subtree. Both go through
        **markdown-it's own renderer over the block's tokens**
        (`md.renderer.render`), never a hand-written HTML emitter. Two reasons,
        and the second is the load-bearing one: the output is then identical to
        what `markdownToHtml` produces today, which is what keeps the ~5,300
        untouched lines untouched — `outline.js`'s observer, `headingAnchors`,
        the format bar's geometry, the static export's clone, `renderers.js` —
        and a second renderer would be a second thing free to disagree with the
        parser, which is the mistake `modelInlines` already refuses to make by
        keeping the token on the node.

        A container renders its own open and close with its children between,
        so a touched item re-renders alone. A `gap` block renders to nothing
        and **keeps its place in the model while occupying none in the DOM**,
        which is why the block-to-element correspondence cannot be a positional
        index into `#editor.children`.

        **The check needs no browser, and that is not luck.** markdown-it's
        renderer produces a *string*, so "every block rendered and concatenated
        equals `md.render(file)`" is string equality over the six oracle files
        — the same move slice 1 made when it got byte-identical for free out of
        a concatenation. The DOM half — that assigning that string produces the
        tree the rest of the app expects — is the check page's, below.

        **Identity is a minted id, not an index path.** A path (`3.1.0`) goes
        stale on every splice, so inserting a block would mean re-stamping
        every element after it, and the one thing this stage does constantly is
        splice. Ids come from a counter on the document, never reused, for
        `modelTouch`'s reason — a recycled id inherits whatever of the previous
        block's state was not cleaned up. `data-block` carries it, never `id`:
        ids are what `headingAnchors` stamps on the static export's clone and
        the two must not collide.

        **The spike's step 6 comes across as a permanent assertion.** After
        every render, each block's DOM text is compared against
        `modelInlineText` of its tree; a divergence is the exact failure this
        design can have and it is reported rather than left to be felt. Behind
        a flag, off by default, on in the check page.

        **An empty block renders `<p data-filler><br></p>`.** Decided
        2026-09-19. markdown-it renders an empty paragraph as `<p></p>` —
        measured, not assumed — and in a `contenteditable` that has no height,
        takes no caret and is not there at all, which is why `BLANK_DOCUMENT`
        has always been `<p><br></p>`. So the renderer emits a `<br>` the
        parser never produces, in an empty block and after a trailing break,
        and **marks it** rather than leaving it to be recognised later. The
        alternatives were inferring from position — a `<br>` last in the block
        is a filler — which is a heuristic about DOM shape that is ambiguous on
        exactly the case that matters, and giving empty blocks height in CSS
        instead, which is unmeasured in three engines and would need the check
        page before it could be chosen rather than after.

        **Nothing is at stake in the markup here, and that is what makes the
        mark the cheap answer.** A filler never reaches the file: it is a view
        artifact, the document is the model, and D1 has no opinion about a
        `data-` attribute nobody serialises. This is one of the few places in
        the project with that freedom, so the question is only which is
        simplest for us — and an attribute that states what a node is beats a
        rule that re-derives it.

        One stage-2-only reason it has to be the marked one: the save path
        still reads `editor.innerHTML` through Turndown until stage 4, so a
        filler can reach the serialiser and come back as a spurious hard break
        in an edited block. A marked filler is stripped in one line before
        serialising; an inferred one means running the same heuristic again, in
        a second place, where it can disagree with the first.

        **The outline is told about a document swap rather than inferring
        one.** Decided 2026-09-19. `scheduleOutline` skips its one-second
        debounce when a record's target is `#editor` with `childList`, because
        that is the fingerprint of an `editor.innerHTML` assignment and a tab
        switch must not show the previous document's headings — which was the
        right design against *eight* assignment sites. After this slice there
        is one, and the same fingerprint is also what a block splice produces,
        so from slice 4 onward every Enter in a top-level paragraph would read
        as a document swap and rebuild the whole sidebar synchronously on the
        commonest structural keystroke there is.

        So `modelRender(doc)` — the whole-document path, and the only thing
        that replaces the document now — calls `renderOutline()` itself, and
        the observer keeps the debounce for everything else. A whole-document
        signal is not a new kind of thing in this app; the disk-changed check
        and the file descriptor are the same shape. What goes is the inference,
        rather than the inference getting finer. **Four checks in the `outline`
        suite are pinned to the fingerprint** and change with it: the property
        becomes *a whole-document render redraws the sidebar at once* and
        *every mutation waits behind the debounce*.

        Not this slice: the Mermaid and LaTeX stashes. `stampLatexSource` and
        `.mermaid-source` feed the two Turndown rules on the **save** path,
        which is still the old core's until stage 4, so rendering leaves both
        alone and `renderers.js` is untouched here.

        **Seven things were measured before the work started, and five of them
        changed the slice above.** The order this repo asks for; they are
        written here rather than only in the commit so the plan and the code
        say the same thing.

        1.  **A block is handed the token that precedes it**, which the design
            above does not mention and which the check fails without. Rendered
            from its own token slice alone, every block in five of the six
            oracle files concatenates to `md.render(file)` exactly —
            `torture.md` does not. markdown-it opens a block-level tag on a new
            line when the token *before* it is a hidden one, which is the tight
            list item `<li>Walk the transect.\n<ol>`, and a slice starting at
            its own open token cannot see that. So `hiddenBefore` is recorded at
            parse and prepended when the block is rendered: a hidden token
            renders to `""` by markdown-it's own rule, so it supplies the
            context and emits nothing, and **no rule of markdown-it's is
            re-derived here**. With it, all six match.

        2.  **The filler's mark goes on the `<br>`, not on the `<p>`.** The
            decision above spells it `<p data-filler><br></p>`, and slice 2
            asks for `isFillerBreak(node)` to tell apart the two `<br>`s in
            `<p>foo<br><br></p>` — one a break, one a filler. A mark on the
            parent cannot answer that, because the parent holds both. So it is
            `<p><br data-filler></p>`, and the predicate slice 2 wants is the
            one thing that can read it.

        3.  **The filler belongs to the DOM builder, not to the string
            renderer** — which is what keeps the check exact rather than
            approximate. `md.render("#\n")` is `<h1></h1>`: an empty block is
            *parseable*, not only editable. A string renderer that emitted
            fillers would therefore diverge from `md.render(file)` on any file
            holding a bare `#`, and the equality check is this slice's whole
            instrument. So the string renderer is markdown-it's output and
            nothing else, and the DOM builder puts a filler where a block would
            otherwise have no caret to offer. A document with no blocks at all
            gets one filler paragraph belonging to no block, which is the empty
            editor; whether deleting everything should instead leave the model
            holding an empty paragraph block is slice 4's, where there is an
            edit to decide it from.

        4.  **A block owns an element only when its rendering is exactly one
            element**, whitespace aside, and that is not always. markdown-it
            hides a tight list item's paragraph, so it renders to bare text
            with no element of its own — nothing to stamp `data-block` on and
            nothing to replace. The rule that falls out: **the re-render unit
            is the nearest ancestor that owns an element**, which for a tight
            paragraph is its `<li>`. Cheap, since an item is small, and it is
            not a heuristic — replacing a block's element with the block's
            rendering is correct exactly when that rendering *is* the element.

        5.  **The verify assertion covers atom-free blocks this slice**, and
            the reason is a finding for slice 2 rather than for this one.
            `markdown-parser.js`'s `math` rule re-emits the source verbatim, so
            until MathJax has run an equation is bare text in the DOM — `$x$`,
            indistinguishable from prose — while the model holds one `\uFFFC`.
            An image is an element and can be recognised; un-typeset maths
            cannot. So the assertion skips a block whose tree holds an atom and
            says how many it skipped, rather than reporting a divergence it
            cannot interpret. **Slice 2 inherits the sharp end of this**: its
            offset space says an equation is one character, which is true of
            MathJax's output and false of the text standing in for it before
            MathJax runs — so the DOM walk and the model disagree by the length
            of the TeX for exactly as long as typesetting takes. That is a
            question to answer there, not a gap to find later.

        6.  **The outline's fingerprint is gated on the legacy core rather
            than removed**, which is the paragraph above amended. Removing it
            now regresses the branch's own default path: the flag is off, the
            old core still swaps documents through `editor.innerHTML`, and the
            fingerprint is still the only signal it has. **The property is
            immediacy** — a document arriving redraws the sidebar at once,
            whichever core produced it — and the mechanism is free to differ
            per core, so `modelRender` says so directly and the inference
            survives exactly as long as the core that needs it. It goes at
            stage 4 with `editor.innerHTML`. The four `outline` checks are
            rewritten to the property rather than to the record shape, which is
            what they should have asserted all along.

        7.  **The browser half is measured by a scratch page, not by a check
            page**, and no route is added to `server.ts`. What this slice needs
            watched is our own code in a real DOM — the block-to-element map at
            depth, the filler, the verify — which is a harness. A check page
            measures *the browser*, which is what makes `paste-check` and
            `tab-shortcut-check` worth keeping and what slice 3's input page
            will be. So the harness is `front/render-scratch.html`, untracked,
            served by the static handler that already serves `front/` and
            same-origin with `/model.js`, which is the only thing the `/tests/`
            route was ever buying. It is deleted when the stage is. Noted
            while measuring this: the three pages that *do* need `CHECK_PAGES`
            are the three stage 4 deletes, so `CHECK_PAGES` and `/report` can
            go with them and `server.ts` goes back to being a file server.

        **Two more things this slice does, both consequences of the preamble's
        decisions rather than of the design.** The stored-HTML conversion runs
        the **whole** of `htmlToMarkdown` rather than a bare Turndown pass: the
        preamble says "through Turndown", and a bare pass would hand the model
        a document rewritten in Turndown's house style, where the app's own
        conversion is style-aware and restores unedited blocks from
        `markdownSource`. It is the same call the save path makes, so it is
        exercised rather than invented. And `adoptActive` in `tabs.js` changes
        by **one line** — the content load goes through the shared loader —
        which is what the preamble's "this stage does not touch it" means:
        no model bundle on the tab record, since a switch re-parses.

        **One thing to know while running with the flag on**: `data-block`
        reaches both exports, since they read the live DOM and stripping it is
        stage 4's export work. Nothing produces it with the flag off, which is
        the default.

    *   **2. Selection — done and tested, 2026-09-20.** `(block, offset)` to a DOM `Range` and
        back, over one block's subtree. Slice 2 of stage 1 built the model half
        on purpose — `modelInlineText`, `modelInlineOffset`, `modelInlineAt`,
        with `undo.js`'s boundary rule (`remaining <= length`) kept on purpose
        so this slice ports the caret behaviour instead of re-deciding it. What
        is left is the DOM walk, which is `undoTextOffset` / `undoLocateOffset`
        over a smaller root.

        **The atoms are the whole difficulty.** An image and an equation are
        one `￼` in the model and a whole subtree in the DOM, so the DOM
        walk has to treat those subtrees as one character and never descend —
        and the list of what is an atom has to live in one place used by both
        directions, or the two disagree by exactly the length of some TeX. The
        other three correspondences were chosen in stage 1 to line up and
        should be confirmed rather than assumed: a code span's content counts
        and its backticks are not in the DOM at all, a mark's delimiters are
        zero-width and are not in the DOM either, and a break is one newline
        against one `<br>`.

        **The filler is where the atoms rule has teeth in the other
        direction.** Slice 1 renders a marked `<br>` into an empty block, and
        slice 2's space says a `<br>` *is* one character — a break, counted as
        a newline. Two of them therefore mean different things in the same
        tag, and the case is ordinary rather than exotic: type `foo`, press
        Shift+Enter, and the model holds four characters while the DOM holds
        `<p>foo<br><br></p>`, one break and one filler for the caret to sit on.
        A walk that counts both reports offset 5 in a 4-character block and
        every edit after it in that block lands one character out. So
        `isFillerBreak(node)` is **one predicate used by both the renderer and
        the walk** — the shape `isGhostElement` already has in
        `markdown-style.js`, a pure function separate from the traversal
        because the predicate is the half a suite can drive.

        **Nothing holds a `Range` across a render.** Every model edit records
        the selection it means to leave in model coordinates and the render
        step applies it — the rule that makes the whole design work, and the
        one a stray `getSelection()` cached across a re-render breaks silently.

        **Measured before the work started, 2026-09-20, and four of the five
        findings correct a slice above.**

        1.  **A `<br>` is *zero* characters, not one, and the newline is the
            text node after it.** markdown-it renders a hard break as
            `<br>\n` — measured, and it is why `<p>foo<br>\nbar</p>` has a
            `textContent` of `"foo\nbar"`, which is already exactly what
            `modelInlineText` says. So the walk counts text nodes and nothing
            else, which is what `undoTextOffset` — the function this slice was
            told to port — has always done. The correspondence was right; the
            sentence above describing it was not.

        2.  **`isFillerBreak` is therefore not built, because both of its
            justifications were premises that measurement removed.** It was
            wanted so a walk would not count a filler and a break as two
            characters — but neither counts, so there is nothing to tell
            apart. And slice 1 wanted it so a filler could be stripped before
            the old core serialises: measured, `<p><br data-filler></p>` goes
            through Turndown to `""` and `<p>foo<br><br data-filler></p>` to
            `"foo"`, so nothing reaches the file either way. Building a
            predicate with no caller would be inventing the need for it. The
            mark stays, since it costs nothing and states what a node is; the
            first thing that genuinely has to read it can add the reader.

        3.  **Maths is wrapped in `<span data-math>`, by the parser, for both
            cores.** This is the atom problem and it is sharper than "an
            equation is a subtree": until MathJax has run an equation is
            *bare text* — `a $x = a*b*c$ b` is fifteen characters in the DOM
            where the model says five — because `markdown-parser.js`'s `math`
            rule re-emits the source verbatim so MathJax can find it. There is
            no element to recognise and nothing to not-descend-into, so **the
            same model maps to two different DOMs** and no fixed offset space
            fits both.

            A wrapper fixes it in both states at once, and every objection to
            one was measured away rather than argued away. MathJax typesets
            *inside* the span and leaves it standing, with the
            `<mjx-container>` as its child. `normaliseEditorMarkup` unwraps a
            `<span>` only when it carries a `style`, so this one survives every
            execCommand. Turndown output is **byte-identical** to today in both
            states — `a $x = a\*b\*c$ b` un-typeset and `a $x = a*b*c$ b`
            typeset — so nothing reaches anybody's file differently. Layout is
            pixel-identical, inline and display, so no CSS is needed. And
            MathJax already skips `<code>`, so `` `$HOME` `` is untouched.

            **Both cores, rather than behind the flag**, which was the call to
            make and was the user's. The alternatives were a parser whose
            output depends on a flag — leaving the shape the default path never
            exercises as the one the new core depends on — and not wrapping at
            all, where the walk refuses whenever the DOM does not match the
            model. That last is cheap and catches every kind of drift, but it
            makes a maths paragraph uncaretable until MathJax has typeset it
            (68ms, measured) and *permanently* so when MathJax cannot load at
            all, which is a fresh offline session, since the CDN script is only
            in the runtime cache after a first use. One shape everywhere costs
            one `latex` check that asserts the rule's exact output.

        4.  **Slice 1 left cosmetic whitespace inside a container, and slice 2
            is what could see it.** `(open + close).trim()` on `<ul>\n</ul>\n`
            trims the outer edges and keeps the newline *inside* the tags, as a
            text node no block owns. Nothing counted characters in slice 1 so
            nothing noticed; here a container's text has to be exactly its
            children's, or a child's offset inside its owner is out by every
            stray newline in front of it — and the render verify, once it was
            exact, said so on the first run. Each half is trimmed now.

        5.  **A block owning no element is addressed through the one that
            owns it.** Slice 1 found that markdown-it hides a tight list item's
            paragraph, so it has no element — and most of this repo's documents
            are tight lists, so "the caret cannot go there" is not an edge.
            The answer falls out of the tiling invariant one more level down:
            a container's text is its children's texts concatenated, so a
            child's offset inside its owner is its own offset plus the text
            length of the siblings before it. `modelBlockText` is that
            recursion and it is the only new idea in the slice.

            It also **retires slice 1's two verify skips**. The verify now
            compares `modelDomText(el)` — atom-aware — against
            `modelBlockText(block)` at every block that owns an element, so a
            block holding maths is checked rather than skipped, and one owning
            no element is covered by its owner rather than skipped. What slice
            1 recorded as inherited by this slice is answered here rather than
            carried further.

    *   **3. Input: text and composition — done and tested, 2026-09-20.** `beforeinput` on
        `#editor`, `preventDefault()` on **every** type, handled or not, so the
        DOM can only change through render. `insertText`,
        `insertReplacementText` (autocorrect and spellcheck accept),
        `deleteContentBackward`, `deleteContentForward`, `deleteWordBackward`,
        `deleteWordForward`, `deleteByCut`.

        **The real work is a mutation API the inline tree does not have.**
        Stage 1 only ever read that tree: it can be walked, measured, located
        in and emitted from, and there is no way to change it. This slice adds
        one — splice text between two offsets and hand back the offset the
        caret lands on — and it has to answer the question the read side never
        asked: **text typed at a mark's edge is inside or outside it.** Decided
        2026-09-19 — **inside when the caret was inside.** That is the
        conventional answer, and the thing that knows is already there:
        `modelInlineAt` hands back the mark chain as `path`, so the rule reads
        the chain at the caret rather than inferring one from the offset's
        neighbours. Then `modelTouch`, which walks up, and render.

        **U+00A0 is normalised here, once, at the boundary**, which closes TODO
        1.4 by construction rather than by the caret-preserving text-node
        rewrite that item describes. The other half of 1.4 closes by
        construction too and more quietly: the browser rewriting a trailing
        space to an NBSP behind our back cannot happen when the browser is no
        longer the one writing.

        **Composition is decided rather than discovered**, per the design
        section: `insertCompositionText` cannot be cancelled, so from
        `compositionstart` to `compositionend` the engine owns the one text
        node under the caret and nothing re-renders; `compositionend` diffs
        that node against the model, applies the difference as one
        `insertText`, and renders. The guard that matters is the re-render
        suppression — a render during composition takes the node the IME is
        holding out from under it, which is how CJK input breaks outright.

        **Eight findings. Three were bugs this slice created and its own
        instrument caught; two came back from running the check page by hand in
        an engine this machine does not have, which is the argument for the page
        rather than an aside about it.**

        1.  **An edited block did not render**, and the check page's divergence
            line said so on the first character ever typed into the model core.
            `modelRenderBlock` goes through markdown-it's renderer over the
            block's **tokens** — which is slice 1's rule and what keeps the
            output identical to the app's — while an edit changes the **tree**,
            and nothing put the two back in step. So `modelInlineTokens` is the
            fold run backwards, and the tokens the tree has carried on its nodes
            since slice 2 are what it hands back: they were kept there precisely
            so a link's href and `data-ref-label` would never have to be
            re-derived, and this is the second thing that pays for.

            **Re-parsing was the other candidate and is worse.** Emitting the
            block's inline source and handing it to `md.parseInline` needs no
            new code and keeps one source of truth — but a reference link's
            source is `[text][label]`, and resolving that needs the whole
            document's definitions in the parser's env. An empty env turns every
            reference link in the paragraph into literal text on the first
            keystroke.

        2.  **A range endpoint inside an atom collapsed the range.** Select an
            equation, type over it, and the engine hands over a range whose end
            a browser has normalised to inside the `<span data-math>` — which
            slice 2's walk answers with the atom's *start*, correctly for a
            start and wrongly for an end. The range came back collapsed and the
            typing landed beside the equation instead of replacing it. So the
            walk takes a `bias`: a start clamps to the atom's front edge, an end
            to its back, and a selection covering an atom goes on covering it.

        3.  **An empty heading re-emitted as a paragraph.** markdown-it records
            an empty ATX heading's opener as `#`, because nothing followed it —
            so typing into one produced `#Title`, which CommonMark reads as a
            paragraph. Silent in the worst way: the document looks right on
            screen and the file has stopped holding a heading. The emitter
            supplies the separator when content needs one and takes it back when
            the content goes, and what the suite asserts is not the bytes but
            that they still *parse* as the heading they were.

        4.  **The mark-edge rule needed no code.** The plan calls it the
            question the read side never asked; it turns out the read side had
            already answered it. `modelInlineAt`'s boundary rule — a position
            belongs to the node that *ends* there, kept from `undo.js` in stage
            1 — puts the caret after `**bold**` inside the mark and the one
            before it outside, so typing continues the bold in the first case
            and not in the second, with nothing added. The rule that ships is
            stage 1's, reused rather than restated.

        5.  **A caret *inside* an atom is one position, not a range over it** —
            Gecko, by hand, 2026-09-20, and the sharpest thing the page has
            found. Blink will not put a caret inside a rendered equation and
            Gecko will, so finding 2's outward clamping met a collapsed range
            and biased its two ends *apart*: typing `d` inside `$x = a*b*c$`
            reported `12–13` and replaced the whole equation with a `d`. The
            rule now reads in one sentence rather than two — outward at both
            ends only when there are two ends — and a collapsed caret stays
            collapsed at the atom's front edge, so the character lands beside
            the equation instead of destroying it.

            **Neither the suite nor Blink could have found this**, and that is
            the point of the page. It is per engine, it needs a caret placed
            where only one engine puts it, and the failure is silent in the way
            that matters: the document looks plausible afterwards.

        6.  **`execCommand` fires `input` but never `beforeinput`.** Measured in
            Chrome 152 — three commands, all returning true, none of them
            interceptable — while trying to drive deletions a keyboard could
            not. So `execCommand` is *not* something the input layer can cancel,
            and every remaining call site is a DOM mutation the model can
            neither stop nor hear about. With the new core drawing the document
            that is the exact failure the interception exists to prevent.

            So **`runCommand` refuses under the model core**, which is the same
            rule the input layer follows for a type it does not handle: do
            nothing rather than act behind the model's back. It costs the
            formats, Tab and Clear for as long as the flag is on, and those are
            slices 4, 5 and 7 — at the end of which `execcommand.js` is deleted
            and the guard goes with it. It also settles something the plan left
            implicit: the interception is only total once the last execCommand
            call site is gone, so slice 7 is not merely tidying.

        7.  **A machine cannot drive the deletions.** Measured 2026-09-20 in
            Blink: automation delivers a trusted `keydown` for Backspace and the
            engine performs no editing command for it, so no `beforeinput`
            arrives and the DOM does not change. That is the same gap stage 0's
            spike hit, and it decides the shape of the verification rather than
            being an inconvenience inside it. `execCommand` cannot stand in for
            a keystroke either, per finding 6 — so **the deletions, Enter, undo
            and a real IME are unmeasured in Blink**, and the page's protocol is
            the only thing that will measure them.

        8.  **The cost is measured rather than assumed**: 2.1ms per keystroke
            on a 636-block document, with the verify clean after 200
            consecutive edits. Most of it is `modelElementFor`'s document-wide
            `querySelector`, which is an optimisation available if a real
            document ever makes it matter.

        **The check page is `front/input-check.html`, and it is a check page
        rather than a harness** — the distinction slices 1 and 2 drew, and this
        is the first thing on the other side of it. What it measures is *the
        browser*: whether an engine sends a `beforeinput` for each thing a
        keystroke means, whether it is cancelable, what `getTargetRanges()`
        says, and what a real IME does. Those are per browser and per version,
        and the way an answer changes is a browser release rather than a change
        here — the same reason `paste-check` and `tab-shortcut-check` stay while
        the execCommand pages retire. Finding 5 is what makes it need a human,
        so it carries a numbered protocol the way the spike did.

        **Driven by hand in all three on 2026-09-20, and all three pass.** That
        is the whole protocol — the deletions, the two-block Backspace, the
        accent popup, the mark edges, the atoms, Enter and Ctrl+Z — in Gecko,
        WebKit and Blink, with the divergence line quiet and nothing reported as
        uncancelable. It is the same gate stage 0 set and the same answer:
        an engine will say what it is about to do and let us do it instead.

        The route there is worth keeping, because it is the argument for the
        page. Firefox found the equation bug; Safari reported everything else
        correct and then the same bug; **both confirmed the fix afterwards and
        reported the same three ranges to the character** — `12–12` for a caret
        inside the equation, `13–14` for a selection over it, `28–29` for one
        over the image. Two independent engines agreeing exactly, on the case
        that had been wrong in both, is the strongest form the answer comes in.
        Blink was automated as far as automation goes — typing mid-word, both
        edges of a mark, beside and over an atom, a selection replaced — and the
        rest of it waited on a human, per finding 7, which is precisely what
        having the page made possible.

        **The page is light rather than dark**, since 2026-09-20. The theme was
        never part of what it measures, so it was not a choice the page had any
        business making for whoever has to sit and read it. A check page *about*
        the app's own theme switch would be the exception; this is not one.

        **The page had two faults of its own, and both cost a step.** Its image
        was `![alt](none.png)`, which 404s: Blink and WebKit draw a broken-image
        placeholder and **Gecko draws nothing at all**, so the atom that step is
        about was invisible in one engine out of three. It is a real file now.
        And the step read "try to type inside the equation or the image", which
        is not an instruction anybody can follow — it now says where to click,
        what to type, and what the log should say, with the equation split into
        the two cases whose difference is the whole of finding 5: a caret is one
        position, a selection is a range.

        **It is in `front/` rather than in `tests/` plus `CHECK_PAGES`**, which
        the preamble assumed. The static handler that already serves `front/`
        serves it too and it is same-origin with `/model.js`, which is the only
        thing the `/tests/` route was ever buying — so no route is added and the
        server stays a file server. It installs the input layer itself rather
        than flipping the model core's flag, so running it does not change the
        app's state on the same origin. The untracked scratch harness stays for
        what a machine *can* drive.

    *   **4. Input: structure — done and tested, 2026-09-20; driven clean by
        hand in Blink, Gecko and WebKit on 2026-09-21, after two rounds of
        fixes.** All seven steps below are in, the model half of every one of
        them is covered by the `model` suite against the oracle, and the input
        layer's routing is covered by `model-input`. The half only a human at a
        keyboard can reach is
        [front/input-check.html](../front/input-check.html)'s numbered
        protocol, which this slice grew by eight steps. **All three engines
        have been driven through it and all three pass**, having turned up two
        real bugs, one per-engine fact, one wrong instruction and three faults
        in the page — all below. Same gate stage 0 set, same answer. The edits
        that change how many blocks there are, and the ones that act on a block
        with no inline tree.

        `insertParagraph` splits the block at the caret; `insertLineBreak`
        inserts a hard break node. A **new** break has no recorded spelling, so
        it takes `sniffMarkdownStyle`'s `hardBreak` — which is the residue TODO
        2.3 left behind, now answered from two directions at once: an existing
        break keeps the spelling the model recorded on its node, and only a new
        one asks the document-wide sniff.

        A deletion whose target range spans two blocks is a merge, read off
        `getTargetRanges()` — it falls out rather than being special-cased,
        which is what the spike confirmed. Enter at the end of a heading opens
        a paragraph.

        This is the slice that would have tripped the outline's swap
        fingerprint — a top-level split splices `#editor`'s children, which is
        the record shape that skips the debounce — and does not, because slice
        1 replaced that inference with `modelRender` saying so.

        **The two hand-rolled list clusters move here and stop depending on an
        engine.** Enter and Backspace in an empty `<li>` — today a keydown
        handler in `app.js` doing surgery because contenteditable splits the
        list and strands `<p><br></p>` — and `outdentListItem`, which exists
        because Firefox merges a bullet into the item above and that markup is
        indistinguishable from a deliberate break. As model rules they are one
        implementation with no engine in it, which is what retires
        `list-empty-item-check.html` and `list-indent-check.html` as questions.

        **Leaves edited as source.** A fence, indented code, an HTML block, a
        table row and a `gap` have no inline tree — stage 1 says their content
        *is* source and is edited as source — so the input layer needs a second
        text space, offsets into `block.source` rather than into an inline
        tree. A fence renders as `<pre><code>` holding its body, so the mapping
        is the body's text and the info string is not editable from the
        document, which is also true today.

        **A table refuses edits until stage 3.** Decided 2026-09-19, and it
        was this stage's sharpest question. The model cannot address a cell:
        1b's floor is the row, because `td_open` carries no `map` and there is
        no span to hang a block off. Three answers were on the table — extend
        the tiler below the row by splitting the row's source on unescaped
        pipes, edit a row as source the way a fence is edited, or refuse.

        **Refusing wins on what the other two are.** Splitting on pipes is a
        *second source of spans*, derived by this file rather than taken from
        the parser, so every construct that can hold one becomes ours to get
        right — and it is the worst possible thing to take on under time
        pressure in the middle of the input layer. Editing a row as source is a
        patch that would then have to be unpicked: it shows the user pipes for
        one stage and is replaced by cell structure in the next, so its whole
        cost is paid for a behaviour with a known expiry.

        **And the parity it gives up is smaller than it first looked.** A table
        is already view-only in every way that matters: TODO 1.1.8 records that
        an existing table cannot have a row or a column added or removed, which
        was confirmed by hand on this very file. What survives today is typing
        into a cell's text inside a construct nobody can restructure. Giving
        that up for one stage, explicitly, is cheaper than either alternative —
        the user's call, and the argument is theirs.

        **Refusal is an absence rather than a branch**, which is the other
        reason it is cheap: the handler already calls `preventDefault()` on
        every `beforeinput` whether it handles it or not, so a table needs no
        code in the input layer at all. What it does need is to *say so*, since
        a keystroke that silently does nothing reads as a broken editor rather
        than as a closed door. The signal is the rendering: a table's subtree
        is rendered `contenteditable="false"`, so the engine will not put a
        caret inside it and the user is never in the position of typing into
        something that ignores them. A `notify` would be the wrong answer —
        it would fire per keystroke.

        Three things that follow, and the third is the one to watch:

        - **A whole table can still be deleted.** The refusal is about edits
          whose target is inside the cells; a deletion whose range covers the
          block removes it, the same as any other leaf.
        - **Selection across a table still works** — an uneditable island
          inside an editable root is selectable, so Ctrl+A, copy and the
          static export are unaffected.
        - **A table as the last block must not trap the caret.** This is the
          classic `contenteditable="false"` trap: with nothing after it there
          may be nowhere for the caret to go, and the document becomes
          un-appendable. It cannot happen today because everything is
          editable, so it is new, and it is the first thing to check on the
          input check page rather than something to reason about here.

        **What it found, and none of it was in the plan.**

        **A markdown block cannot carry the whitespace a split leaves at the
        cut.** markdown-it strips a block's leading and trailing whitespace
        before inline parsing runs, so bytes left there are bytes the next parse
        throws away — and three of those are worse than invisible: four leading
        spaces make the tail an **indented code block**, a space before a
        closing `**` stops it being emphasis at all, and a paragraph already
        indented three spaces needs only the split's one to join them.
        `modelInlineTrimEdge` reaches into marks, because that is where the
        space is.

        **Markdown has no empty paragraph, and the separators around one
        doubled.** Enter at the end of a line gives the model a block for the
        caret and gives the file nothing to say about it — but the block still
        sat between two separators, so every Enter not yet typed into put a
        blank line into a document nobody had edited. `modelJoinBlocks` is the
        fold that fixes it: **a block that emits nothing hands on its own
        separator and takes the one before it with it**, which makes Enter at
        either end of a block cost exactly zero bytes. Nothing the parser
        produces emits empty, so an opened-and-saved file is untouched.

        **A container's last child always has an empty separator**, which is the
        tiler's own shape read as an invariant rather than as an accident — a
        container's `map` runs into the blank line after it, so the trailing
        blanks were handed to the container's separator at parse. Every removal
        has to restore it, or the blank line is emitted twice: once inside the
        container and once after it.

        **An empty item's marker has no pad**, because there was nothing after
        it to pad from: `modelItemPrefix` records `-` where a written item
        records `- `. So typing into one produced `-two`, which is a paragraph
        and not a list — the empty-heading bug of slice 3's step 3, one
        construct along and failing the same silent way.

        **An outdent moves every marker beneath it, and a follower does not
        move at all.** The indent is absolute in this model, so a nested
        bullet's marker carries every outer column and an outdent has to shift
        the whole subtree. The followers that come across with an outdented item
        are the exception and it took a wrong answer to see it: they go out one
        level and down one level at the same moment, so they end at the column
        they started at — attached before the move rather than after it, they
        were caught in the subtree and shifted twice.

        **`modelIndentAtCaret` must not ask whether the flag is on.** It did,
        and Tab therefore did nothing on `front/input-check.html` — the one page
        built to measure it, which installs the input layer deliberately without
        flipping the flag for the app on the same origin. The flag belongs at
        the boundary, with the caller that has a fallback to protect; the layer
        does its job once it is installed.

        **The caret trap cost nothing to close.** A table as the last block
        leaves nowhere for the caret to go, so `modelEnsureBlock` keeps an empty
        paragraph after it — and that paragraph is free, because the empty-block
        fold above means it emits no bytes and takes no separator. The same
        function answers the other half, which slice 1 deferred here: deleting
        everything leaves one empty paragraph block rather than a filler
        belonging to none.

        **How it was verified.** 49 new checks in `model` and 22 in
        `model-input`, 1,430 in all. The sharpest is the sweep: **every
        inline-bearing block in the oracle, split in half, rewrites only
        itself** — 861 of them, five of which are a single atom and cannot
        move — which is D1 one step further out, since stage 1 only ever proved
        that an edited block rewrites itself. Its instrument had to be fixed
        before it meant anything: `indexOf` finds the wrong copy of a paragraph
        whose bytes occur twice, and both `claude.md` and `corpus/todo.md` have
        one, so the containment test was quietly about a block nobody had
        edited. The block's position is measured with the sentinel sweep
        instead. Every nested item in the oracle is also outdented — 80 of them
        — and what is asserted there is not the bytes, which an outdent is meant
        to change, but that what it wrote re-parses to itself.

        **The hand runs found three things, and every one of them was invisible
        to the suite for the same reason: the emitted markdown was right.**

        **A deletion at the end of a bullet lost the space before the word, in
        all three engines** — the one that took two passes to catch, because it
        appeared, went away, and was reported as "I got one diverged but I
        missed what step it was". Reproduced in all three and cleared in all
        three. Option+Backspace over a bullet's last word
        leaves the space in front of it, correctly: the engine's target range
        covered the word and not the space, and every editor keeps it. The model
        kept it and the screen did not. The fault is in **slice 1's DOM
        builder**: it `trim()`s a block's rendering to strip markdown-it's
        pretty-printing, which is right exactly while the rendering begins and
        ends with a tag — and markdown-it **hides a tight list item's
        paragraph**, so that block renders as bare text whose edges are its own
        content. `modelTrimRendering` keeps back exactly the edge whitespace the
        block's text has, which is not a heuristic but the invariant
        `modelVerifyRender` checks, applied where the markup is built instead of
        asserted about afterwards. It settled a second case nobody had reached:
        a hidden paragraph ending in a hard break renders `a<br>` plus a
        newline, and that newline **is** the break's one character by
        `modelInlineText`'s own rule, so the `trim()` would have eaten it the
        same way. The **file** still gets no trailing whitespace — markdown
        strips it on the next parse — so the last composed line is trimmed on
        the way out, and never any other, because a hard break's two spaces are
        never on it.

        **A hard break went into the model and never onto the screen.**
        Shift+Enter put a newline in the model and no `<br>` on screen:
        `modelInsertBreak` builds a hardbreak node with `token: null` —
        correctly, since there is no parse behind it — and `modelInlineTokens`
        then left it out of the token list the renderer walks. The **markdown
        was right the whole time**, because the emitter composes from the tree
        and the node carries its own `raw`, which is why 861 oracle splits and
        every affix check passed over it. The suite now asserts the invariant
        that was missing — **no leaf ever vanishes on the way to the renderer**,
        checked by stripping the token off every leaf in the oracle, which is
        exactly the state a node the model built is in — and an atom with no
        token now **throws** rather than disappearing, because its rendering
        *is* its token and there is no honest way to synthesise one. That is the
        rule slices 5 and 7 inherit: a command that creates an image or an
        equation takes its token from the parser.

        **And three things about the page itself, all of which cost evidence.**
        Its document was set in the page's own monospace, so the fenced code
        block step 16 is about was indistinguishable from a paragraph — "the
        code doesn't look like a code at all, so I just guessed". And a
        divergence that fixed itself on the next keystroke left no trace: the
        banner was the only record and it was below the fold. The banner is now
        first and sticky, it keeps a count that survives a recovery, and every
        divergence is written into the log as well. Same lesson `paste-check`
        learned in Safari — a check page that drops evidence quietly is worse
        than none.

        **And one instruction was wrong rather than the code.** The step said to
        drag across *the whole* equation before typing; dragging across part of
        one replaces it too, and the log says `12–13` either way. That is the
        atom rule working — an equation is one character in the offset space, so
        a selection covers it or it does not and there is no half of it to keep
        — and the step now says so, since a protocol that describes a narrower
        behaviour than the code has reads as a bug the first time somebody goes
        off the script.

        **The table's refusal is quieter than it was designed to be, in two
        engines out of three.** The signal was to be the rendering: an engine
        will not put a caret inside a `contenteditable="false"` island, so
        nobody is left typing into something that ignores them. Measured by hand
        in all three on 2026-09-21, **that premise is Blink's behaviour and
        nobody else's** — Gecko and WebKit both let the caret in, and typing
        there does nothing, which is exactly the "reads as a broken editor"
        reading the refusal was chosen to avoid.

        Nothing is lost and the decision stands: the edit is refused either way,
        a selection across the table still works everywhere, and refusing was
        never in question — what failed is the **mitigation**. It is recorded
        rather than patched because TODO 1.1.8 is what makes the caret welcome
        again, so anything built now has a one-stage life. What is left on the
        table, should the silence turn out to matter first, is a
        **once-per-document** notice the first time a keystroke lands inside a
        table: the argument against a `notify` was that it would fire per
        keystroke, which a once-only one does not. Nobody has asked for it.

        **All three engines have since been driven through the whole protocol
        clean** — every step, with the divergence line quiet throughout,
        including the **merge**, which no machine can reach in any engine: a
        constructed `InputEvent` carries no target ranges, so a synthetic
        Backspace at a block's start is a zero-width deletion where a real
        keystroke hands over a range spanning two blocks. Both of the bugs below
        were reproduced in all three and are cleared in all three.

        **And driven by automation**, on `front/input-check.html` in Blink,
        as far as automation reaches: the split, Enter at the end of a heading,
        Tab and Shift+Tab with the nested `<ul>` appearing and going again, the
        empty-item rules, typing into a fence's body, the table refusing the
        caret, and the guard paragraph after it — all with the divergence line
        quiet throughout. The **merge is not among them**, and cannot be: a
        constructed `InputEvent` carries no target ranges, so a synthetic
        Backspace at a block's start is a zero-width deletion where a real one
        hands over a range spanning two blocks. That is the same gap stage 0
        hit, and it is what the page's numbered protocol is for.

        **Seven steps, in this order**, planned 2026-09-20 before any of it was
        built. The first is a primitive with no keystroke behind it and the
        other six are each one behaviour; every one of them needs the one before
        it, which is the same forcing the slices themselves have.

        1.  **The block splice — done and tested.** The mutation the block
            list never had. Stage 1 built the tree and only ever read it;
            slice 3 added `modelInlineSplice`, which changes a block's
            *contents* and cannot change how many blocks there are. What was
            missing is the other half: put a block into the tree, take one out,
            and leave the tiling invariant true on both sides.

            Four things, and each is a decision the steps above it inherit.

            **A new block's tokens come from the parser, never hand-built.**
            `modelRenderBlock` goes through `md.renderer` over a block's own
            tokens, so a block with no tokens does not render at all — and the
            rule that keeps the renderer honest ("never a hand-written HTML
            emitter") has an exact twin here. A fresh paragraph is `md.parse`
            of a one-character template with its inline children replaced;
            everything else is cloned from the block it came from, which is
            where the tokens already are.

            **A new separator is a blank line carrying the quote chain** —
            `"\n"`, the chain with its trailing space trimmed, `"\n"` — which
            is `"\n\n"` outside a quote and `"\n>\n"` inside one. Splitting a
            block hands its own separator to the second half, because that is
            what followed the bytes that are now the second half's.

            **A new block's affixes are computed from its position, never
            copied from the block it came from.** `modelItemAffix` already
            answers *first child or not*, and a split's second half is never
            the first, so it takes the continuation indent where the original
            took the marker. `leadingAffix` is that opener plus whatever the
            original had beyond its own opener — the same one subtraction
            `modelEmitLeaf` does, read in the other direction.
            `quotePrefixes` is inherited whole, because the emitter already
            extends a short chain with its last recorded entry.

            **An ordered item's number follows its own list, and siblings are
            never renumbered.** A new item reads the two items before it: same
            number twice means the document writes all-ones and the new one
            copies it, otherwise it takes the next. That is the document's own
            convention read off the list rather than a document-wide sniff,
            which is the rule slice 2 of stage 1 already set for delimiters.
            Renumbering what follows is refused outright: it would re-emit
            every sibling of an edited block, which is the exact thing slice 1b
            exists to prevent, and CommonMark numbers the rendered list off the
            first marker anyway — so the bytes are untidy and the document is
            not wrong.

        2.  **`insertParagraph` — done and tested.** The split, and the
            question it turns on is *what* splits.

            **The block, and then every ancestor up to and including the
            nearest `item`.** Enter in a top-level paragraph makes a paragraph;
            Enter in a quoted paragraph makes a second quoted paragraph, since
            a quote is not an item and the walk stops; Enter in a bullet makes
            a bullet, because the paragraph's parent is an item and splitting
            the paragraph alone would put two paragraphs inside one bullet —
            which is a thing to be able to do and not what Enter means. The
            walk stops at the first item rather than continuing, so a bullet
            nested in a bullet splits its own list and not the one above it.

            **Enter at the end of a heading opens a paragraph**, which is the
            one place the new block's kind is not the old one's. Anywhere else
            in a heading it splits into two headings of the same level, because
            the text after the caret is still heading text and the alternative
            silently demotes it.

            **Deleting everything leaves one empty paragraph block**, which is
            the question `modelRender` deferred to this slice. An empty
            document is a block the caret can be in rather than a filler
            paragraph belonging to no block, so the model always has somewhere
            to put the next keystroke and the no-block case in `modelRender`
            stops being reachable from the app.

        3.  **The merge — done and tested.** A deletion whose target range
            spans two blocks, which falls out of `getTargetRanges()` rather
            than being special-cased — the spike confirmed that and slice 3
            already refuses exactly this case, so what lands here is the
            handling behind a refusal that is already in the right place.

            The second block's inline tree is appended to the first's, the
            second is removed, and **every container the removal emptied goes
            with it** — an item whose last child left, then the list whose last
            item left. That unwinding is the merge's real content: a list
            holding no items serialises to nothing and renders to an empty
            `<ul>` the caret can sit inside, which is a document that looks
            broken rather than one that is.

            Two leaves with no inline tree cannot merge, and neither can a leaf
            with one into a leaf without — a paragraph and a fence have no
            common text space. Refused, the way slice 3 refuses, rather than
            approximated.

        4.  **`insertLineBreak` — done and tested.** A hardbreak node at the
            caret. **A new break has no recorded spelling**, so it takes
            `sniffMarkdownStyle`'s `hardBreak` — which is the residue TODO 2.3
            left behind, answered here from two directions at once: an existing
            break keeps the spelling its own node recorded, and only a new one
            asks the document-wide sniff. The sniff is read in
            `model-input.js` and handed over, never reached for in `model.js`,
            which is the same boundary the parser injection draws.

        5.  **The list rules — done and tested.** The two hand-rolled clusters
            move here and stop depending on an engine. What they do today is the
            spec: `app.js`'s keydown handler for Enter and Backspace on an empty
            `<li>`, and `outdentListItem` for Shift+Tab.

            As model rules they are `modelIndentItem` and `modelOutdentItem`
            plus the emptiness test, which is one implementation with no engine
            in it — and that is what retires `list-empty-item-check.html` and
            `list-indent-check.html` as open questions. Four behaviours, taken
            from the handler rather than reinvented: a nested empty item
            outdents one level; a top-level empty item leaves the list for a
            paragraph, splitting the list when it had followers; Backspace on
            an empty item with a bullet above it removes the item and puts the
            caret at the end of that bullet; and Tab indents an item that is
            not the first of its list, because markdown cannot write one nested
            under nothing.

            **Tab arrives as a keydown, not as a `beforeinput`**, so this is
            the first thing the input layer binds that is not an `inputType`.
            It has to be, and it is also the shape slice 7's format shortcuts
            take — measured in stage 0, where the key arrives in all three
            engines.

        6.  **Leaves edited as source — done and tested.** A second text space:
            offsets into the block's own source rather than into an inline
            tree. **Scoped to the fence and the indented code block**, which
            are the two leaves whose rendering is a `<pre><code>` holding text
            a caret can enter. A gap renders to nothing and has no DOM to be
            edited through; an `html_block` is arbitrary markup whose text is
            not its source; a table row refuses, which is step 7.

            A fence's editable text is its body — the info string is not
            reachable from the document, which is also true today — so the
            mapping is the body, and the source is recomposed from the body
            plus what the parse recorded in front of each line: the quote
            chain, the item's continuation indent, and the fence's own markers.

            **A source-edited leaf keeps a `source`, and it is the new bytes.**
            That is `modelTouch` inverted and it is the honest shape: the
            contract is *a block whose content changed must not re-emit its old
            bytes*, and for a leaf whose content **is** source the new bytes
            satisfy it directly. So the ancestors are cleared exactly as they
            are for any other edit and the block itself is assigned rather than
            nulled — `modelEmitLeaf` refuses a block with no inline tree, and
            it should go on refusing, because there is nothing for it to
            compose from.

        7.  **A table refuses edits — done and tested.** Decided 2026-09-19,
            above. The refusal itself is an absence: the handler already
            cancels every `beforeinput` whether it handles it or not. What lands
            here is the *saying so* — a table's subtree renders
            `contenteditable="false"`, so the engine never puts a caret inside
            it and nobody is left typing into something that ignores them.

            Its own three consequences are in the design above and the third is
            the one to watch: **a table as the last block must not trap the
            caret**, which is the classic `contenteditable="false"` trap and
            cannot happen today because everything is editable. It is the first
            thing to drive on the check page.

        **Verification is the same two halves slice 3 drew.** The `model` suite
        takes the mutations — split, merge, indent, outdent, the source space —
        against the real tree and the oracle, because they are pure functions
        over it and a re-emit after a structural edit is exactly the D1 claim
        one step further out: a split rewrites its own two blocks and hands back
        every other line. The `model-input` suite takes the routing, with the
        model stubbed, as it already does. And `front/input-check.html` grows
        the steps neither can reach — Enter, Backspace across a block boundary,
        Tab, and the caret trap — because whether an engine sends these at all
        is per browser and per version, and in Blink a machine cannot drive
        them.

    *   **5. Input: paste and drop — done and tested, 2026-09-21; driven clean
        by hand in all three engines.**
        `insertFromPaste` and `insertFromDrop` read `text/html`, run it through
        `sanitisePastedHtml` and `normaliseNbsp` exactly as today, then
        **Turndown to markdown and `modelParse` into blocks**, spliced in at the
        selection. Turndown stays in the bundle for this one path and leaves the
        save path at stage 4; this is the last thing it does.

        `text/plain` inserts as text rather than being parsed as markdown,
        which is today's behaviour and the reason Insert → *Paste markdown* is
        a separate action — that one is the same pipeline without the Turndown
        step. `paste-check.html` measured all three engines offering
        `text/plain` alone on their plain-text binding, so the branch that
        fires does not change and the page stays as the regression check it
        became.

        The splice rule is the conventional one and should be written down
        because it is where pasting feels wrong when it is wrong: pasting into
        the middle of a paragraph splits it, the first pasted block merges into
        the head and the last into the tail, and whole blocks land between.

        **Five steps, in this order**, planned 2026-09-21 before any of it was
        built. The first is the primitive the other four call; the last two are
        the two ways content arrives from outside.

        1.  **Splicing foreign blocks — done and tested.** `modelParse` of the
            pasted markdown produces a **second document**, and nothing about
            it is safe to put into the first as it stands. Three things have to
            be fixed up, and every one of them is a silent corruption if it is
            not.

            **Ids collide.** `modelParse` mints from 1, so a pasted block
            carries an id the target document is already using, and
            `modelElementFor`'s `querySelector` would then answer with whichever
            element it met first. Every adopted block takes a fresh id from the
            target's own counter, which is what that counter is for.

            **Their bytes are unprefixed.** A pasted block's `source` is the
            markdown Turndown produced, written flush left — so dropping it
            into a quote or a list item writes lines that carry no `> ` and no
            indent, and the file stops holding what the screen shows. Adoption
            therefore **clears `source` on every pasted block** and lets the
            emitter compose it, which is the one thing the emitter is for:
            `quotePrefixes` comes from the block it lands beside,
            `leadingAffix` from its new position, and an item's own marker is
            shifted to the column its new container starts at, with slice 4's
            `modelShiftIndent` doing the work.

            **They land as siblings of the block the caret was in**, and that is
            the conservative call rather than the obvious one. Enter promotes to
            the nearest item; a paste does not, so pasting three paragraphs into
            a bullet gives one bullet holding three paragraphs rather than three
            bullets. Nothing is lifted out of the container the caret was in,
            which is the rule that cannot surprise anyone in the destructive
            direction — a paste that moved content *out* of a list would be a
            structural edit nobody asked for.

        2.  **The pipeline — done and tested.** `text/html` through
            `sanitisePastedHtml` and `normaliseNbsp` exactly as today, then
            **Turndown to markdown and `modelParse` into blocks**. Turndown
            stays in the bundle for this one path and leaves the save path at
            stage 4; this is the last thing it does.

            It needs a narrower call than `htmlToMarkdown`, which is a
            *document* function: it appends the reference definitions, re-wraps
            to the sniffed width and restores the opened file's own bytes, none
            of which a fragment from somebody else's clipboard has any business
            going through. `htmlFragmentToMarkdown` is the Turndown half alone,
            extracted in `app.js` so the two cannot drift.

            **The splice rule is the conventional one** and is written down
            because it is where pasting feels wrong when it is wrong: pasting
            into the middle of a paragraph splits it, the first pasted block
            merges into the head and the last into the tail, and whole blocks
            land between. A one-block paste is that rule with nothing in the
            middle, which is the common case and reduces to an inline splice.

        3.  **Plain text is inserted as text, never parsed — done and tested.**
            Today's behaviour, and the reason Insert → *Paste markdown* is a
            separate action: that one is the same pipeline without the Turndown
            step. `paste-check.html` measured all three engines offering
            `text/plain` alone on their plain-text binding, so the branch that
            fires does not change and the page stays the regression check it
            became.

            **Never parsed** has teeth in the model that it does not have
            today: a pasted `*foo*` becomes a text node with `raw` null, so
            `modelEmitLeaf` escapes it on the way out and it stays literal in
            the file. One line falls through to `modelInlineSplice`; several
            become paragraphs, with the line structure inside each kept as
            softbreaks rather than flattened.

        4.  **The paste event, and the three menu items — done and tested.** The
            `paste` event rather than `beforeinput`: it fires first, carries
            `clipboardData` by specification, and cancelling it stops the
            insertion before an `insertFromPaste` is ever raised. `beforeinput`
            goes on cancelling that type anyway, which costs nothing and is what
            the design says to do with a type nobody has claimed.

            Edit → *Paste*, Edit → *Paste without formatting* and Insert →
            *Paste markdown* all route through the model under the flag, the
            way the two list items already do: they reach `runCommand` today,
            which refuses, so they would silently do nothing.

        5.  **Drop — done and tested, and it is the one with a second half.**
            `dataTransfer` reads the same two types and goes through the same
            pipeline, at the position the pointer was over —
            `caretPositionFromPoint` or `caretRangeFromPoint`, which is per
            engine and so is a thing for the check page to report rather than
            for this file to assume.

            **A drag that started inside the editor is a move, not a copy.**
            The engine would raise `deleteByDrag` and `insertFromDrop` as a
            pair; both are cancelled, so doing only the insert duplicates the
            text and leaves the original standing. The source range is recorded
            at `dragstart` in model coordinates, the deletion runs before the
            insertion, and the drop offset is adjusted when the two are in the
            same block and the source came first. A drag spanning two blocks is
            refused rather than approximated, which is the same refusal the
            merge made before slice 4 gave it an implementation.

            **Drop is a no-op under the flag today**, since every `beforeinput`
            is cancelled and nothing else handles it — so this is the one place
            in the slice that is fixing a regression the flag already has rather
            than porting a behaviour.

        **What the hand runs found was one real bug and one gesture.** Drag and
        drop did nothing in Blink and WebKit while working in Gecko: a drag from
        another window landed nowhere, and dragging a selection only extended
        it. The first of those was ours. **There was no `dragover` handler.** An
        element accepts a drop only if something cancels `dragover` over it —
        the spec, not a quirk — and the old core never had to, because a
        `contenteditable` is a drop target the engine handles *natively*. The
        model core suppresses exactly that native handling, so the editor
        becomes an ordinary **scripted** drop target and has to say it accepts
        one. The engines disagree about how much they will still do for a
        `contenteditable` that has stopped behaving like one, and Gecko is the
        generous one.

        `dragenter` is cancelled with it, since an engine that reads the first
        as a refusal never sends the second; and `dropEffect` is set there,
        because the cursor has to promise what will actually happen — a move for
        a drag that started here, a copy for anything from outside.

        **The second was the gesture, and it is worth writing down because it
        cost a round trip.** You have to release the button after selecting and
        then press and hold on the highlight; a drag begun without letting go
        goes on extending the selection. That is every engine's behaviour and
        nothing to do with this editor — the model was driven end to end with a
        multi-word source and moved it exactly, divergence quiet, while the
        engine was still declining to start the drag. Step 22 says the gesture
        now, which is the fix for the next person to read it.

        **The check page logs the whole drag sequence**, because the
        interesting failures are all *missing* events and neither the suite nor
        automation can reach a native drag: no `dragstart` means the engine
        never entered drag mode and the pointer was only extending the
        selection, and a run of `dragover` with no `drop` means nothing told the
        engine the drop was welcome. A step that fails with "it feels like an
        engine thing" is a step that needs a log rather than a theory.

        **Verification is the same two halves as slice 4.** The `model` suite
        takes the splice against the real tree and the oracle, because adopting
        a foreign document's blocks is a pure function over two models and the
        thing that can go wrong — a pasted block re-emitted without the quote
        chain it landed in — is a byte question. `model-input` takes the
        routing, with the clipboard stubbed. And `front/input-check.html` grows
        the steps neither can reach: a real clipboard, a real drag, and whether
        an engine hands over `text/html` at all.

        **What it turned up, none of it in the plan.**

        **A paste must not trim at the cut the way Enter does.** Slice 4 trims
        both edges of a split, because a markdown block cannot carry whitespace
        at its own edge — true of a split that *stays* split. A paste splits
        only to put something in the gap and then rejoins both sides, so the
        whitespace at the cut lands in the middle of a line, where it is
        ordinary text: trimming it ran the two words either side of the paste
        together. `modelSplitLeaf` takes a `trim` flag, false for exactly this
        one caller, and the trim comes back on the tail when nothing joined it
        and it is a block in its own right after all.

        **A pasted fence cannot lose its source.** Adoption clears `source` so
        the emitter can compose the affixes — right for a leaf with an inline
        tree and fatal for one without, whose content *is* source and which the
        emitter refuses outright. Slice 4's inversion arrives here too: a
        source-bearing leaf keeps its bytes and has them **moved** instead,
        every line shifted to its new column and given the quote chain it now
        sits behind.

        **`modelOwnsInput` is a function declaration rather than a `const`.** In
        this shared global scope a `const` sits in its temporal dead zone until
        its own line runs, and the paste listener and the three clipboard
        handlers all sit above it. They only ask from inside a callback, so a
        `const` works by luck; load order is the one thing this codebase does
        not leave to luck.

        **The check page cannot run the HTML branch**, and that is worth stating
        rather than working around: it deliberately does not load `app.js`,
        because what it measures is this layer against a real engine and not the
        application around it — so `sanitisePastedHtml` and
        `htmlFragmentToMarkdown` are feature-tested and the HTML branch falls
        through to the plain text there. The questions that page exists to ask
        are untouched by it: does the engine hand over `text/html` at all, does
        cancelling the event stop the insertion, where does a drop land.

    *   **6. Undo — in progress; planned and started 2026-09-21. Steps 1 to 5
        are done and tested; step 6 is measured and acted on, and its protocol
        is written and not yet run.** A stack of model states with the caret as a model position,
        replacing the whole-document `innerHTML` snapshots.
        Coalescing carries over unchanged — same `inputType`, inside 600 ms,
        merges; everything else starts a step — because the commands now name
        their own `inputType` rather than it being read off an event. **That
        half already works**: `modelInputAnnounce` carries the type on its
        synthetic `input` and `undo.js` reads it, so every model edit since
        slice 3 has been coalescing correctly into a stack nothing could apply.
        `undoReset` / `undoPark` / `undoAdopt` keep their contract and the
        bundle gets smaller.

        **A state is a clone of the document.** Decided 2026-09-19. Blocks are
        mutable and the tree is cyclic through `parent`, so a state had to be
        either a clone or a sharing scheme, and copy-on-write — a command
        replacing the blocks it touches so that a state is a block array with
        untouched blocks shared by reference — was the other candidate. It is
        cheaper per step, and it means rethinking `modelTouch` and the `parent`
        link that lets it walk up.

        **The clone wins because it is not a regression and it is
        reversible.** Everything else in the model stays exactly as it is, and
        the cost is O(document) per coalesced step — against today's undo, which
        snapshots the *entire document as an HTML string* on the same cadence
        and has never been complained about. So this is strictly cheaper than
        what ships, which makes it the safe default rather than the lazy one.
        Copy-on-write stays available and can be taken later on a measurement,
        where rebuilding `modelTouch` in the middle of the input layer could not
        be taken back.

        **But not `structuredClone`, and the correction is the slice's first
        step.** The decision as written on 2026-09-19 said "`structuredClone`
        handles the cycle", which it does — the cycle was never the problem.
        markdown-it's `Token` is a class instance, `structuredClone` returns own
        enumerable properties on a bare object, and the renderer then throws
        `token.attrIndex is not a function` on the first image or fence it
        meets. Measured 2026-09-21 against the pinned markdown-it 13.0.1, not
        argued. The repo already has the idiom the clone needs —
        `modelCloneToken` copies through
        `Object.create(Object.getPrototypeOf(token))` — so what changes is the
        mechanism and not the decision.

        **The savepoint id stays document-scoped and parked with the bundle.**
        Decided 2026-09-19, which is to say: keep what ships. The Undo design
        section above leaves it open between that and globally unique ids,
        which would retire the undo-before-file ordering in `adoptActive`
        altogether. The ordering is proven, the failure it prevents is a dirty
        document reporting clean — which takes the unsaved-work guard and
        `beforeunload` down together, and only when two tabs' edit counts line
        up, so no manual pass finds it — and the riskiest stage in the plan is
        the wrong place to also change the one thing nothing but a suite can
        catch. The `tabs` suite's mutation checks stay the oracle, and they now
        guard a property this stage is not allowed to quietly drop.

        **Two claims this entry made that were wrong about their timing**, both
        corrected here rather than discovered at the landing. `undoRefresh` does
        **not** go in this slice: its only caller is `execcommand.js`, which
        refuses under the flag already and is deleted in slice 7, so the
        function outlives this slice by one. And the `undo` suite's count of
        `editor.innerHTML` assignment sites does **not** retarget to *none
        outside render* here: `app.js`'s three doors each keep a legacy branch
        until stage 4 removes the flag, so the count stays at three and the
        retarget is stage 4's. The property this slice owns is narrower and
        should be asserted as itself — that nothing outside `undo.js` applies a
        state, and that `undo.js` applies one two ways.

        **Ctrl+Z was already doing something, and the stopgap landed first.**
        `undo.js` binds its keydown on `document` and nothing gated it, so under
        the flag an undo assigned an earlier *rendering* back over a model that
        had not moved — a divergence rather than a no-op, and worse than one,
        because it looks like it worked. `undo()` and `redo()` refuse under the
        flag as of 2026-09-21; the guard is written to be deleted by step 2
        below, which replaces the refusal with the branch it stands in for.

        **Six steps, in this order.** The first is the primitive every other one
        calls; the last is the only one a machine cannot run.

        1.  **`modelCloneDocument`, in `model.js` — done and tested.** Pure,
            no DOM, and so measurable in the `model` suite against the oracle: a
            clone serialises to the same bytes, mutating it leaves the original
            alone, and every `parent` link points inside the clone rather than
            back at the document it came from — which is the one that silently
            half-works, since a stale parent only shows up when `modelTouch`
            walks up from an edited block and clears somebody else's ancestors.

            **Aliases are preserved rather than flattened**, which was not in
            the plan and is what the clone's `Map` turned out to be for. A
            block's `inline` *is* one of its own `tokens` — all 861
            inline-bearing leaves in the oracle — and a `hiddenBefore` is a
            token belonging to the block before it, all 12 of them. Copy either
            of those twice and the two copies can disagree about the `hidden`
            flag `modelFillItem` sets through one of them, so the map keyed on
            the original token makes the clone's token graph *isomorphic* to the
            original's rather than merely equivalent. Cheaper than reasoning
            about which aliases exist, and it does not have to be revisited when
            a later slice adds one.

            **Every property was broken on purpose to confirm its check
            fails**, which is the discipline slice 3's affix rules established:
            `structuredClone` in place of the clone throws
            `token.attrIndex is not a function` inside markdown-it's own `fence`
            renderer, sharing the tokens fails the disjointness sweep and both
            fence checks, leaving `parent` pointing at the original fails the
            parent sweep, and flattening the `inline` alias fails the alias
            sweep and the disjointness one with it.

            **Tokens are cloned, not shared. Settled 2026-09-21, measured
            rather than argued.** `modelLeafLike` already shares a block's
            non-inline tokens by reference and clones only the inline one, which
            is correct for two blocks in one live document — any later mutation
            applies to both, and that is the point of it. Sharing across
            *states* is the opposite: a state exists precisely to be immune to
            what happens next.

            The inline tokens were never really in question.
            `modelInlineTokens` reassigns `inline.children` wholesale after
            every edit, at nine call sites, so two states sharing one inline
            token share one edit — which is why a sharing scheme would have
            carved them out and shared only the block-level tokens.

            **That is where it dies, and on shipped code rather than on a
            hypothetical.** `modelSourceSplice` mutates a block-level token in
            place — `token.content = next` on the `fence` or `code_block` token
            — because slice 4's source space edits a fence's body as its own
            text. Share that token and an undo inside a fence gives back a block
            whose `source` holds the old bytes and whose token holds the new
            ones: the screen renders from the token and shows the code the undo
            was supposed to take back, and a save writes `source` and files the
            old code. The screen and the file disagree, with the file right and
            looking wrong. **And `modelVerifyRender` cannot see it** — it skips
            exactly the blocks with no inline tree, which is a fence, indented
            code, a rule, a gap and a table — so the one construct sharing
            breaks is the one the permanent assertion is blind to.

            **The saving it was buying is a quarter of a millisecond.** A
            prototype-preserving copy over every token the model reaches, 50
            runs after warm-up, 2026-09-21:

            | File | Lines | Blocks | Block tokens | Inline tokens | Every token | Inline only |
            | --- | --- | --- | --- | --- | --- | --- |
            | `docs/TODO.md` | 1,063 | 222 | 1,980 | 3,172 | 0.48ms | 0.29ms |
            | `CLAUDE.md` | 2,410 | 512 | 2,504 | 7,505 | 0.93ms | 0.70ms |

            So 0.19ms and 0.23ms, per coalesced step, against a full render
            already measured at 16.8ms and against today's undo serialising the
            whole document to an HTML string on the same cadence. What the
            saving costs is a **rule** — "a command may not mutate a token in
            place" — which every future command would have to remember, which
            the code that ships has already broken once, and whose symptom is
            that silent disagreement in a construct nothing watches. Cloning all
            of them makes the question not arise.

        2.  **Two seams in `undo.js`, and nothing else moves — done and
            tested.** The stack
            machinery is core-independent — coalescing, `UNDO_LIMIT`, the redo
            branch, `nextId`, `breakOnce`, park and adopt — and only two
            operations know what a state is: capture one, and apply one. So the
            file keeps one implementation of the part the `tabs` suite guards
            and grows a branch at exactly those two points, rather than a second
            history living in a second file. **A second file was the other
            candidate and it is worse here**, for the reason the three doors in
            `app.js` exist: `undoReset`, `undoPark`, `undoAdopt` and
            `undoPosition` have seven call sites across `app.js`, `file-api.js`
            and `tabs.js`, and a second owner would make every one of them ask
            which core is running.

            Applying a model state installs a **clone of the stored state**,
            never the stored object itself — the next edit mutates what it
            installs, and a history entry that can be edited in place is not a
            history entry. The way that fails is undo, redo, undo: the second
            visit finds the state the first one left behind.

            **The flag is asked once, in capture, and applying reads the
            state's own shape instead.** That was not in the plan and is the
            stronger property: a state says which core took it, so it can only
            be put back the way it was taken, where asking the flag again would
            make a state's meaning depend on when it is applied rather than on
            what it is. `undoApplyState` therefore branches on `snapshot.model`,
            and the `undo` suite pins both halves — one call site, and the
            branch being on the state.

            **Driven in the running app, on a second origin.** The suite stubs
            the model here on purpose, so what it proves is the seams and not
            the restore; the restore was measured by hand in Blink against a
            real document. Typing three characters and pressing Ctrl+Z brings
            the model and the DOM back together and the whole document
            re-serialises byte-identical; redo returns them; undo-redo-undo
            returns to the same bytes, which is the clone-on-apply rule in the
            real thing. `modelVerifyRender` reports 36 blocks compared and no
            problems after all of it. And `documentIsDirty()` goes false → true
            → **false** across type-then-undo, with `undoPosition()` back at the
            id `markClean` recorded — the savepoint contract working on model
            states, which is TODO 1.6's dot half on the new core.

            **What that run could not reach**: Enter. Automation's synthetic
            keydown raises no `insertParagraph`, the same gap stage 0 hit and
            the reason `front/input-check.html` has a human protocol — so the
            structural path through an undo is step 6's, not verified here.

            **After this step the caret lands at the top of the document**,
            measured rather than assumed: the editor keeps focus, the selection
            has one range, and it is offset 0. The document is right and the
            place in it is not. That is step 3 and it is the shape of TODO
            1.6's caret half rather than a return of it — there is no
            whole-document offset walk left to miscount, there is simply no
            selection in the state yet.

        3.  **The caret, which is a `(blockId, offset)` rather than a block —
            done and tested.**
            `modelReadSelection` hands back a block *reference*, and a state's
            reference has to resolve against that state's own blocks or it
            points into a document nobody is showing. Ids survive the clone, so
            the resolution is a lookup; `modelRender` already takes a selection
            to apply, so the restore is a render with one. `nextId` travels with
            the state, which is safe only because a fresh edit clears the redo
            branch — stated because it is the kind of thing that is true until
            somebody adds a command that mints an id without clearing it.

            **Resolved against the document being installed, never against the
            state.** `undoApplyState` clones the stored state and then resolves
            into the clone, so the caret lands in the tree that is about to be
            rendered; resolving against the state would put it in one nobody
            renders. That is the whole reason for the detour through ids, and
            the `undo` suite asks it directly — the resolved block has to be one
            of the blocks now on screen.

            **A block the document has not got gives null rather than a guess**,
            and an end that has gone leaves the caret that has not, taking a
            range down to a position rather than the whole selection down to
            nothing. Neither can normally happen, since a state's selection is
            read at the same moment its clone is taken; both are answered rather
            than thrown because "cannot normally" is not "cannot". An offset
            past the end of its block needs no such care: `modelDomLocate` has
            clamped to the end since stage 1, which is `undo.js`'s own rule kept
            on purpose.

            **Measured in Blink, on the second origin again.** Caret at block 3
            offset 5, type three characters, Ctrl+Z — the caret comes back to
            block 3 offset 5, the document byte-identical and
            `modelVerifyRender` clean. Then the case most of this repo's prose
            actually is: a block two levels deep whose owning element is its
            `<li>`, because markdown-it hides a tight item's paragraph. Typing
            and undoing there restores the bytes, and a redo puts the caret back
            inside that nested block after the inserted text. So the lookup
            reaches through the recursion and through a block with no element of
            its own.

            **What an undo restores is the caret the restored state was taken
            with**, which is the old core's rule kept rather than re-decided: in
            the ordinary type-then-undo that is where the edit was, and after a
            caret move with no edit between it is where the caret was when that
            state was current. Worth stating because a run that moves the caret
            between two undos reads as wrong until you know which of the two it
            is watching.

        4.  **The engine's own undo gesture — done and tested.**
            `historyUndo` and `historyRedo`
            arrive as `beforeinput` — the macOS trackpad gesture, a context
            menu, a mobile keyboard — and are cancelled and routed nowhere
            today, which is the right default for a type nobody has claimed and
            the wrong one for a type that means exactly what Ctrl+Z means. They
            route to the same two commands. Whether an engine sends them at all
            is a question for the check page rather than for this file.

            **Feature-tested, and that is not defensive coding** — the same
            answer slice 5's converters got. `front/input-check.html`
            deliberately ships no `undo.js`, because undo is the application
            around this layer rather than the layer, so there the route has to
            find nothing and do nothing. Without the test it throws and takes
            the rest of the protocol down with it, which is what breaking it on
            purpose produces.

            **The double-fire was named and left to be measured rather than
            pre-empted, and the measurement came back the same day.** `undo.js`
            binds the keyboard itself and calls `preventDefault`, which should
            stop the engine running the default action these types are raised as
            part of — so a Ctrl+Z should never arrive here as well. *Should* is
            per engine, and slice 4's table mitigation is the reason not to take
            an unmeasured *should* as settled: it was assumed to hold everywhere
            and turned out to be Blink's alone. So the instrument went in and
            the suppression did not.

            **The answer is that no engine raises `historyUndo` at all** — not
            from its own gesture, not after a Ctrl+Z — in Chrome, Firefox and
            Safari, 2026-09-21, **on `front/input-check.html`**. The page is
            named because the mechanism depends on it: it installs the input
            layer itself and is always the model core, flag or no flag, so what
            it reports is this core's behaviour rather than the running one's. **Safari says why, and the reason generalises**:
            its *Edit → Undo* is **disabled**. Every `beforeinput` is cancelled,
            so the engine never edited anything, so its own undo stack is empty
            and there is nothing for it to raise. That is a consequence of this
            design rather than a quirk, which is why all three agree rather than
            disagreeing the way they usually do.

            So there is no suppression to build, and the route is **correct and,
            on the desktop, never taken**. It stays: it costs two lines, it is
            the right handling if one ever arrives, and the plan's other named
            sources — a mobile keyboard's own undo button, an IME — are exactly
            the ones this repo has never measured. That is the same shape
            `paste-check.html` produced, where three engines answered "there was
            never anything to build", and the step becomes a regression check
            for the same reason: the answer is per browser and per version, and
            the way it comes back is a browser release.

            **One user-visible consequence, recorded rather than fixed.** Under
            the model core the browser's own *Edit → Undo* is dead — visibly so
            in Safari. Ctrl+Z is the only route, since `undo.js` binds the key
            itself. Whether the old core's menu item is enabled-but-wrong rather
            than honestly disabled is not measured here, and the honest version
            is arguably the better of the two.

            **Undo's own protocol is an app recipe, not a check-page step**,
            which corrects what this plan said in step 6 and in the stage's
            verification paragraph. The page ships no `undo.js` and should not:
            loading it would drag in `toolbar.js` for `onToolbarAction` and
            most of what the page exists to exclude. What the page *can* answer
            is the one thing that is about the engine rather than about us, and
            its Ctrl+Z step now asks exactly that — does a `historyUndo` arrive
            at all, and does one arrive after a Ctrl+Z. Everything else about
            undo is watched in the running app under `?core=model`.

        5.  **The tab switch, where the model history meets a re-parsed
            document — done and tested, and it needed no code.** This stage re-parses on adopt — the incoming tab's
            `content` key is HTML, converted through `htmlToMarkdown` — so the
            document on screen after a switch is a *different object* from the
            one the parked history's states describe, with different ids. That
            is survivable because a restore re-renders wholesale and never
            compares a state's blocks against the live ones, and it is written
            down because "adopt trusts the bundle to describe what is on screen"
            means something weaker under the model core than it does today. The
            `tabs` suite is where that gets asserted rather than assumed.

            `undoBreak` has one caller, `app.js`'s plain-text paste, and it is
            there because that path goes in through `execCommand("insertText")`
            and so reports the same type a keystroke does. Under the model core
            every paste announces `insertFromPaste`, which does not coalesce, so
            the break is unnecessary on this path and stays for the other core.
            **It is also already unreachable**, which is worth having checked
            rather than assumed: both menu items branch on `modelOwnsInput()`
            before they reach `insertPlainText`, and the editor's own `paste`
            listener returns early under the flag. Had it *not* been, the bug
            would have been quiet and odd — `breakOnce` set by a paste that then
            went somewhere else, and consumed by the next unrelated keystroke,
            which would start its own undo step for no reason anybody could see.

            **What the step turned out to be is an audit**, and the audit passed:
            `tabs.js` parks a bundle and adopts a bundle and never looks inside
            one, so switching did not have to learn that a state changed shape.
            That is now a **source scan** rather than a fact — comments stripped
            first, because this file explains the ordering at length and
            `undoAdopt(null)` and `index.html` both appear in its prose, so a
            scan that counted those would read the argument for the rule as a
            breach of it. The scan pins three things: only `undoPark` and
            `undoAdopt` are called, no state field is ever named, and
            `adoptActive` still loads the content before adopting the history
            and the history before the file.

            **This is where step 3's choice pays.** A state's caret resolves
            inside the state's own clone, so a switch cannot break it. Resolved
            against the *live* document instead — the alternative — the ids
            would be another parse's and the caret would land nowhere, or worse,
            somewhere.

            **Driven in Blink, two tabs.** Type in one, open a second with New,
            type in that, switch both ways: each tab comes back with its own
            content, `modelVerifyRender` clean on both. An undo in each takes
            back that tab's own edit and **reaches neither the other's content
            nor its stack**. And the savepoint survives the round trip: tab
            two's `cleanPosition` stays put, typing moves `undoPosition()` off
            it, and after switching away and back an undo lands on it again and
            the dot clears — which is the undo-before-file ordering working on
            model states, and the failure it prevents is the one nothing but a
            suite or this would catch.

            **One thing chased and found correct**, recorded because the symptom
            is exactly TODO 1.6's: on the *other* tab the dot would not clear
            however far back the undo went. Its `cleanPosition` is null, because
            that document was restored from autosave already dirty and
            `initUndoBaseline` deliberately does not invent a savepoint for one
            — there is no position it was last saved at. Nothing to do with this
            slice, and a trap for whoever drives the protocol next.

            **And one about driving it**: `switchToTab` is async, so two tab
            clicks in one statement race and the second can be lost. A run that
            does that reads as a switch that silently did nothing.

        6.  **The measurement, and the protocol — measured; protocol written,
            not yet run.** The whole clone's cost, because the 2026-09-19
            decision was made against today's HTML-string snapshots and is only
            worth keeping while that comparison holds.

            **On time it holds comfortably.** A clone is about 40% of a parse of
            the same file and nowhere near a render: 0.57ms on
            `corpus/todo.md`, 1.22ms on `corpus/claude.md`, against a 16.8ms
            full render. Nothing about the per-keystroke cadence is in doubt.

            **On memory it does not hold, and the plan's wording was wrong.**
            "Strictly cheaper than what ships" is true of time and false of
            space by an order of magnitude. Measured with `--expose-gc`, three
            runs per file agreeing within a kilobyte:

            | File | Markdown | Rendered HTML | Model state | ×100 states |
            | --- | --- | --- | --- | --- |
            | `corpus/todo.md` | 48KB | 51KB | **743KB** | 73MB |
            | `corpus/claude.md` | 105KB | 119KB | **1,610KB** | 157MB |

            So a model state is **14 to 15 times** the HTML string it replaces,
            and roughly 15KB of state per KB of markdown. `UNDO_LIMIT`'s own
            comment says the cap is there so "a large document cannot run the
            tab out of memory" — that justification was calibrated against
            strings, and at 100 deep **per tab** it no longer does that job.

            **Where it goes, so that any fix aims at the right thing**, on
            `corpus/claude.md`: **tokens 62%**, **inline nodes 32%**, blocks 5%.
            The inline layer is 94% of a state.

            **What follows from it is one change and one question, and they are
            not alternatives.** The change is how deep the stack is allowed to
            be, which is settled below. The question is whether states should
            share structure at all — copy-on-write, which the 2026-09-19
            decision kept available "on a measurement" — and it stays open on
            its own merits rather than as an answer to this, because the cap
            below already bounds the memory and copy-on-write would buy back
            *depth* instead. Nothing here reopens cloning versus sharing: that
            was settled in step 1 on correctness, and a memory number is not the
            kind of argument that unsettles it.

            **So: the count becomes a ceiling and a byte budget becomes the
            cap.** `UNDO_BUDGET` is 64MB per tab, `UNDO_STATE_PER_BYTE` is 16 —
            the measured 15.5 and 15.3, rounded up so the budget is approached
            from below — and `UNDO_FLOOR` is 10, because an undo stack too
            shallow to undo is worse than the memory it saves. `modelParse`
            records `doc.bytes` for it, at the parse rather than by serialising
            later, since this needs an order of magnitude rather than a number.

            | Document | Per state | Steps kept |
            | --- | --- | --- |
            | up to ~40KB | under 640KB | **100**, unchanged |
            | `corpus/todo.md`, 48KB | 743KB | 85 |
            | `corpus/claude.md`, 105KB | 1,610KB | 39 |
            | above ~400KB | — | 10, the floor |

            **This is the constant's original intent in the units that turned
            out to matter**, not a new policy: its comment already asked for
            deep enough that nobody reaches the end in normal editing *and*
            small enough that a large document cannot run the tab out of memory,
            and those stopped being satisfiable by one number when a state
            stopped being a string. It is also why the answer is not simply a
            smaller `UNDO_LIMIT` — that would take depth away from the documents
            that were never the problem.

            Two things it does not do, both stated rather than discovered.
            `doc.bytes` **does not track a document growing under the keyboard**,
            which is fine because this bounds memory rather than allocating it
            and a document that has doubled is still in the right band. And the
            undo and redo stacks need no budget between them: their sum only
            grows on a fresh edit, and a fresh edit clears the redo branch.

            **The protocol.** Not on `front/input-check.html` — see step 4 — but
            in the running app under `?core=model`, because undo is the
            application around the input layer and that page ships none of it.
            Run it in Chrome, Firefox and Safari. What automation could already
            reach is marked, and was clean in Blink on 2026-09-21.

            1.  **A run of typing is one step.** Type a word mid-paragraph, then
                one Ctrl/Cmd+Z: the whole word goes, and the caret is back where
                you started typing. *(Blink: clean.)*
            2.  **A pause splits the run.** Type, wait a second, type again. Two
                Ctrl/Cmd+Z, one per burst.
            3.  **Enter is its own step**, and this is the one no machine can
                drive: automation's synthetic keydown raises no
                `insertParagraph`. Type, Enter, type. Three Ctrl/Cmd+Z take back
                three things, in order.
            4.  **TODO 1.6's reported case**, which is why that item is open:
                **open a file**, put the caret at the end of a bullet, press
                Enter, then Ctrl/Cmd+Z. The caret comes back to the end of that
                bullet rather than to the top of the document, and the tab's
                edited dot clears. *(It has to be an opened file, or a document
                made with New: one restored from autosave that was already dirty
                has no savepoint — `initUndoBaseline` will not invent one — so
                its dot cannot clear and the step would read as a failure.)*
            5.  **Indent and outdent undo whole.** Tab inside a bullet, then
                Ctrl/Cmd+Z: the item and its followers come back, and a redo
                puts them out again. This is a *structural* undo — the block
                count changes — and it is the path Enter would have taken.
                *(Blink: clean, and the file's bytes are identical either way.)*
            6.  **A paste is one step.** Paste several paragraphs into the
                middle of one; a single Ctrl/Cmd+Z takes the whole paste,
                including the rejoin.
            7.  **A composed character is one step.** Hold a vowel for the macOS
                popup, or use a dead key, then Ctrl/Cmd+Z once.
            8.  **The redo branch dies on a fresh edit.** Undo, type something,
                then Ctrl+Shift+Z: nothing comes back. *(Blink: clean.)*
            9.  **Two tabs never reach each other.** Type in one, New, type in
                the second, switch back and forth, undo in each: each takes back
                its own edit only. *(Blink: clean, and the savepoint survives the
                round trip.)*
            10. **The engine's own gesture** is `front/input-check.html`'s
                question rather than this one, and is already answered: no
                engine raises `historyUndo` at all.

            Throughout, `modelVerifyRender` must stay quiet — set
            `modelVerifyEnabled` in the console before starting.

        TODO 1.6's caret half — Ctrl+Z after Enter at the end of a bullet
        putting the caret at the top — goes by construction: it is a
        whole-document offset miscount on a snapshot restore and there is no
        snapshot restore left. The dot half was already fixed in the tabbed
        view's stage 4 and stays unverified against the reported case, which is
        why step 6 runs it rather than assuming it.

    *   **7. Formats and the keyboard — not started.** Every control in
        `TOOLBAR_MENUS` and on the format bar becomes a model command.
        `applyFormat` keeps its role as the single entry point and loses its
        `execCommand` cases; the bar's own logic — when it appears,
        `CARET_FORMATS`, `blocksInRange`, `updateActiveButtons`'s
        all/some/none — reads the rendered DOM and needs little change.
        **`updateActiveButtons` should stay on the DOM this stage** even though
        the model could answer it better: it is tested, it works, and moving it
        is a change with no failure driving it.

        Inline marks toggle over a range in the inline tree, with all/some/none
        deciding add versus remove. A new mark takes the sniffed delimiter;
        existing nodes keep the spelling the model recorded. Block types change
        the block's kind or wrap and unwrap it, and the refusals stay where
        they are — a heading inside a list item, refused at the model now
        rather than in `applyFormat` before a `formatBlock`; inline code across
        blocks, still a `notify` rather than a fallback. Lists get indent and
        outdent as model operations, with D5's list-only rule intact. The
        leaves are the rule, the image and Insert TOC, which writes model
        blocks and keeps `buildNestedList` for the sidebar.

        **TODO 1.7 lands here** — Ctrl/Cmd+B and Ctrl/Cmd+I bound as `keydown`
        on the editable, calling the same commands. Measured 2026-09-10: Blink
        bolds, Gecko on macOS gives the key to its bookmarks sidebar and the
        page never sees it, WebKit does nothing, so bold-by-keyboard has been
        dead in two engines out of three for as long as there has been a format
        bar. The `formatBold` / `formatItalic` / `formatStrikeThrough`
        `beforeinput` types are a **bonus entry point rather than the
        mechanism**, and the handler has to ignore one that arrives after a
        keydown already did the work or the two cancel out. What no script can
        answer — whether `preventDefault` actually suppresses what the browser
        wanted the key for — is 1.7's own measurement.

        `execcommand.js` is deleted when its last caller goes, and
        `normaliseEditorMarkup` with it; the `execcommand` suite's source scan
        changes target from "only this file calls it" to "nothing does".
        Clear — today `runCommand("selectAll")` then `runCommand("delete")`,
        relying on execCommand to raise `input` so it undoes as one step —
        becomes a model command that is one step by construction.

    **What this stage deliberately does not do**, so each is a decision rather
    than a gap found later: the save path, `markdown-style.js`'s index and
    restore, and the Mermaid and LaTeX stashes, all of which are stage 4's and
    all of which keep working meanwhile; blockquote, image and table *insert*
    and table structural editing, which are stage 3's; Android's virtual
    keyboards and in-document drag, which the plan accepts as unmeasured;
    editing inside a table cell as structure, per slice 4's decision.

    **How it is verified, honestly.** The Deno suite can cover more of this
    than it looks: renderer equivalence is string equality, and the inline
    mutation API, the split and merge rules, the paste pipeline down to blocks,
    undo's stack rules and every format command are pure model operations with
    no DOM in them — the same reason the `model` suite needs no `dom.mjs`.
    **What no suite in this repo can see is `beforeinput`**: `dom.mjs` has no
    editing engine and no HTML parser, so a stub can only agree with whatever
    it was told. The input layer's instrument is therefore
    `front/input-check.html` — the stage 0 spike grown into a real check page,
    and in `front/` rather than the `tests/` this line used to name, because the
    static handler already serves it same-origin with `model.js` and that
    same-origin is the only thing the `/tests/` route was ever buying, so it
    needs no `CHECK_PAGES` entry and no server change — and it is **stood up in
    slice 3 rather than at the end**, because until it exists there is nothing
    measuring the part of the stage that can blow the estimate. It runs in
    Chrome, Firefox and Safari, and it carries the verify assertion from slice
    1. `browser-check`, `list-indent-check` and `list-empty-item-check` stop
    being questions at slices 4 and 7 and are deleted at stage 4 with the rest
    of the test work; `paste-check` and `tab-shortcut-check` measure the
    browser rather than the core and stay. Per CLAUDE.md's rule, anything whose
    real verification is type-and-look says so and gives the recipe rather than
    reporting `npm test` as cover.

    **Every open decision was settled 2026-09-19, before any of the work
    started**, which is the order this repo's rules ask for and not the order
    these things usually happen in. Six: four the plan raised, and two more
    found by probing the code while answering them — the empty block and the
    outline, neither of which is visible from the design and both of which
    block a slice. Each is written up where the slice that obeys it lives, with
    what it was decided against:

    - **The model is built by converting the stored HTML** (preamble) rather
      than from the `source` key, which holds the document as it *arrived* and
      would drop unsaved edits at boot.
    - **The new core sits behind a flag, default off** (preamble), so the
      branch stays usable and the input layer can be driven in the running app.
    - **A table refuses edits until stage 3** (slice 4) rather than being given
      a row-as-source stopgap or a tiler that splits on pipes.
    - **An empty block renders a marked filler `<br>`** (slices 1 and 2) rather
      than one recognised by position or replaced by CSS height — and the mark
      is cheap precisely because nothing here reaches the file, so simplicity
      is the only criterion.
    - **The outline is told about a document swap** (slice 1) rather than
      inferring one from a mutation record, now that render is the only thing
      that replaces the document.
    - **An undo state is a clone of the document** (slice 6) rather than
      copy-on-write, on the ground that it is cheaper than the HTML-string
      snapshots that ship today and can be changed later on a measurement. Its
      *mechanism* was corrected on 2026-09-21 — `structuredClone` strips
      markdown-it's `Token` prototype and the renderer throws on the first
      image — which changed how the clone is built and nothing about why.
    - **The savepoint id stays document-scoped and parked** (slice 6) rather
      than going globally unique, keeping `adoptActive`'s undo-before-file
      ordering load-bearing.
    - **Text typed at a mark's edge goes inside when the caret was inside**
      (slice 3).

    None of them is in [DECISIONS.md](DECISIONS.md), and that is a judgement
    rather than an oversight: all but one are implementation choices inside one
    stage's slices, and the table refusal — the only one a user can see — has a
    **named expiry** in stage 3, where TODO 1.1.8 makes cells editable as
    structure. DECISIONS.md records what the project has settled for good; a
    refusal that ends in a fortnight is plan. If the refusal outlives stage 3
    it stops being plan and wants a D number, which is the thing to notice
    rather than a thing to pre-empt.

    **Two decisions inside the rewrite are still open, and neither is this
    stage's**: Enter in a table cell, a no-op or a row insertion, which the
    formats design section leaves to whoever builds it in stage 3; and whether
    `tabsSwitchAllowed()`'s switch lock comes off once a background tab is a
    live model rather than a frozen string, which the tabs section defers to
    stage 4 and keeps by default until then.
*   **3. The 1.1 items — not started.** Not a merge point either, for the same
    reason: reintegration has not happened, so the app around the new core is
    still reading `editor.innerHTML`.

    **It inherits one debt from stage 2, named on both sides so it cannot be
    lost between them:** a table refuses edits from slice 4 onwards, and TODO
    1.1.8's structural editing is what lifts the refusal. Until it does, a
    table is rendered `contenteditable="false"` and is exactly as editable as
    it is today, which is to say not. The item is the place the refusal ends;
    stage 2's exit criterion records that it starts.
*   **4. Reintegration — not started. → MERGE TO `main` WHEN THIS CLOSES** —
    D8, and **this is the merge that cannot be taken back.** Autosave changes
    from HTML to the model's serialised form and the first load after landing
    converts a pre-rewrite `content` key once, through Turndown. That autosave
    may be the only copy of someone's unsaved work, so the conversion is tested
    *before* this lands: a `git revert` does not put the storage back.
*   **5. Fallout — not started.** Happens on `main` by construction — IME,
    autocorrect, spellcheck and Safari's quirks are what only real documents in
    daily use turn up, which is the same reason D8 gives for merging at all.

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
