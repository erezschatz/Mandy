# The editing-core rewrite

TODO 3.1. Decided 2026-09-06 — D6 in [DECISIONS.md](DECISIONS.md) is the
decision, this file is the design and the plan. It used to be the "Mandy 2.0"
section of [ROADMAP.md](ROADMAP.md), an option kept for after 1.0; it is 1.0
work now, and the reason is in the first section below.

Read D0, D1 and D4 in [DECISIONS.md](DECISIONS.md) first. D0 is what the
rewrite must not compromise (the user edits a document, never markup), D1 is
what it must preserve (a saved file gets its own bytes back), and D4 is what it
retires (execCommand plus normalisation, the treatment this is the cure for).

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

TODO 1.6 — Ctrl+Z after Enter at the end of a bullet leaving `(edited)` lit and
the caret at the top — is a whole-document offset miscount on a snapshot
restore. It does not get fixed; the design that produces it is removed.

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
- `formatBold`, `formatItalic`, `formatStrikeThrough` — the engine's own
  shortcuts arrive as these, and route to the same commands the Format menu
  calls. Nothing goes through `execCommand`.
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
| `toolbar.js`, `notify.js`, `file-api.js`, `outline.js`, both exports, PDF, DOCX, theme, lazy-load, `sw.js`, `server/`, `app.css` | ~5,300 | Untouched or near it. They read the rendered DOM, which still exists |
| `tests/` | 6,200 | About 2,800 lines rewritten; the core's tests no longer need `dom.mjs` |

The line to notice: the ~5,300 untouched lines are the product. This replaces
the editing core, not the application around it.

`file-api.js`'s eight `editor.innerHTML` assignments become model loads. The
autosave key changes from HTML to the model's serialised form — which is to say
markdown plus the per-block `source`, so `localStorage["markdownSource"]` stops
being a second copy: the model *is* the source. That is the tabs item's "2N
copies" question (TODO 4.1) answered by construction.

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
| **4. Reintegration** | `file-api.js`, outline, both exports, tabs-ready autosave; tests rewritten; one input-layer check page run in three engines | 1 to 2 |
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
5. **Reintegrate** `file-api.js`, `undo.js`'s new shape, outline, exports.
6. **Tests.** The `undo`, `execcommand`, `format-bar`, `save-fidelity`,
   `list-indent`, `latex` and `links` suites are rewritten against the model;
   the source scans in `execcommand` and `notify` change targets (no
   `execCommand` call site at all; no `innerHTML` assignment outside render).
   The four browser check pages become one that drives the input layer.
7. **Docs.** D4 is marked retired in DECISIONS.md rather than deleted.
   CLAUDE.md's "Document state", "Save fidelity", "execCommand", "Undo" and
   "The format bar" sections are rewritten; "The browser check" shrinks to the
   one page. TODO 1.1.6, 1.1.7, 1.1.8, 1.4, 1.6 and 2.1 close as part of the
   stages above; 1.5 and 4.1 become straightforward.

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
