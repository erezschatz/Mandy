# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run serve   # deno task start — server on http://localhost:9130
npm run dev     # same, with --watch auto-restart
npm test        # deno run --allow-read tests/run.mjs
```

Type-check the server: `cd server && deno task check`.
`MARKY_PORT` overrides the port. `pm2 start ecosystem.config.cjs` runs it supervised.

There is no linter and no build step, and no installable dependencies —
`package.json` exists only to hold the scripts, and Deno fetches Hono itself.
Flag it before adding any dependency, npm or Deno.

### Tests

[tests/](tests/) has no framework and no dependencies. Each suite loads the real
`front/` sources into a scope with a hand-rolled DOM stub ([tests/dom.mjs](tests/dom.mjs))
and drives them, so a suite breaks when the source it names changes. Run one
suite by importing it directly; `tests/run.mjs` runs them all.

They cover the invariants that fail *silently* rather than loudly:

- **toolbar** — every item a variant renders has a handler in a script that
  variant's bundle ships. Both bundle lists are parsed out of `index.html` and
  `html-export.js`, so the test cannot drift from the real ones. Also drives the
  menus the way a browser would — toolbar listener first, then the document's,
  as the event bubbles — plus arrow-key navigation, hover-to-switch, and
  `visibleItems` directly, since the real spec strands no separator today.
- **format-bar** — formatting never replaces `#editor`. Regression cover for a
  bug that detached the editable root and left the app looking unstyled and
  dead until reload. Also every branch of Code, which is the only format that
  reads the selection's *extent*: partial versus whole-block versus bare caret,
  and the three ways a list can be involved. Its stub ranges report intersecting
  the `<ul>` as well as the `<li>`, the way a real range does — a range that
  claimed only the `<li>` would quietly excuse the bug the test exists for.
- **self-reproduce** — an exported document re-exports without touching the
  network, and hands its successor byte-identical CSS and JS.
- **static-export** / **file-path** — the document-only export's contents, and
  everything the app remembers about the file it has open: the path, the last
  browsed directory, the edited marker, and the mtime baseline that Reload and
  the disk-changed marker measure against. It drives a fake disk, so a reload,
  an outside edit and a save over one all have a real file to disagree with.
  It also drives the unsaved-work guard, where the property under test is not
  that a dialog appears but that every answer except Discard leaves the document
  where it was — including a Save the user backed out of halfway.
- **outline** — the depth algorithm, the inline allowlist, and the shape of the
  list Insert TOC writes. The depths are a pure function over heading levels, so
  the pathological document is a table rather than a fixture; the list shape is
  there because a sublist placed beside its parent `<li>` instead of inside it
  serialises to a flat list, into the user's file, looking fine on screen.
- **notify** — that no `front/` file has slipped back to `alert()` or
  `confirm()`, that every bundle holding a module which calls `notify`/`ask`
  also ships `notify.js` ahead of it, and that dismissing a dialog does not
  resolve to the same thing as agreeing with it. The source scan is the half
  that matters: an `alert()` looks fine from inside the app right up until the
  user has silenced dialogs and their save failure disappears.
- **execcommand** — the normalisation between execCommand and the file, and the
  source scan that stops a new call site skipping it. It deliberately does not
  test what any browser *produces*: the stub has no editing engine, so a suite
  can only assert what we do with the output. That half is
  [tests/browser-check.html](tests/browser-check.html), which is not part of
  `npm test` — see below.
- **undo** — the coalescing rules, the redo branch, and above all that history
  does not survive `undoReset()`. Also counts the `editor.innerHTML` assignment
  sites, because the way this regresses is not a broken stack but a new
  assignment that never tells the stack about it.
- **save-fidelity** — the serialiser options app.js asks for, and then
  `markdown-style.js` directly: the sniffers, and every guard in the re-wrapper.
  That second half is the one that writes into the user's file. It also covers
  the invisible-whitespace rules: that U+00A0 is normalised in both spellings,
  and the ghost-element predicate, including the `<br>` asymmetry that decides
  whether a block is a blank line or an inline is a real one. Only the predicate
  — the traversal around it needs an HTML parser the stub does not have, which
  is why the decision lives in one pure function.

### The browser check

[tests/browser-check.html](tests/browser-check.html) is not part of `npm test`
and cannot be: it needs a real editing engine. Serve the repo, open it in each
browser, and it runs the real execCommand cases in a real `contenteditable`,
reporting the markup each engine produces before and after
`normaliseEditorMarkup`. Loaded over HTTP it also POSTs the report to `/report`,
which is how a headless run collects it.

**It is the only thing in the repo that can tell measurement from folklore.**
Every engine-specific claim in `front/` and in the metafiles either came from
this page or is a guess — and the first run killed two long-standing ones: that
`styleWithCSS` was needed to stop styled spans (neither engine emits them for
bold or italic once it is off) and that the list-nesting bug was Chrome's (both
engines do it). It also found a live bug, where `formatBlock` in a bullet
destroyed the list in Chrome.

Re-run it when adding a format, and when a browser does something surprising.
TODO 5.1 records what it currently measures.

## Architecture

Two halves:

- `front/` — the editor. Vanilla JS, no bundler, no modules.
- `server/` — Deno + Hono. Serves `front/` and exposes the local file API.

### Frontend: one shared global scope

Every file in `front/` is a plain `<script>` tag in [index.html](front/index.html),
so all top-level `const`s and functions are globals shared across files. There
are no imports. Consequences that bite:

- **Load order in `index.html` is load-bearing.** `toolbar.js` must come
  **first**: it defines `onToolbarAction`, which every other module calls at
  top level. Toolbar *buttons* no longer need to exist by then — clicks are
  delegated (see below) — but non-toolbar elements are still grabbed at load,
  so `#editor`, `#formatBar` and the file dialog must be in the markup.
  `notify.js` comes next and is depended on the same way: every module below
  reports its failures through `notify` / `ask`, so it must be defined before
  any of their handlers run.
  After that: `markdown-style.js` defines `sniffMarkdownStyle`,
  `reflowMarkdown`, `indexMarkdownBlocks` and `restoreSourceWrapping`, which
  `app.js` calls at top level and on every save;
  `app.js` defines `editor`, `markdownToHtml`, `htmlToMarkdown`;
  `undo.js` binds to `editor` and so must follow `app.js`;
  `execcommand.js` defines `runCommand`, which `app.js` and `format-bar.js` both
  call — at click time rather than at load, so it only has to be *present* in
  the bundle, but it reads `editor` and calls `undoRefresh` and so sits after
  both;
  `outline.js` defines `outlineIsOpen`, `outlineEntries` and `buildNestedList`,
  which `static-export.js` calls at export time;
  `renderers.js` defines `renderMermaidDiagrams` / `renderLatex`;
  `lazy-load.js` defines the `ensure*` loaders. Later files call these freely.
- **Global-name collisions are real bugs, not hypotheticals.** `file-api.js`
  names its function `saveFileAs` rather than `saveAs` because FileSaver.js
  claims that global. Check for collisions before naming anything at top level.
- `theme-manager.js` and `docx-export.js` are indented as if still inside
  `<script>` blocks — they were extracted from `index.html`. Leave the
  indentation alone unless reformatting the whole file.

### The three registries a new `front/` file must join

Adding a file to `front/` means touching three places, and forgetting one fails
in a way that only shows up later:

1. `<script>` tag in [index.html](front/index.html) — in the right order,
   after `toolbar.js`.
2. `SHELL_ASSETS` in [sw.js](front/sw.js) — or it is missing offline.
3. `ASSETS` in [html-export.js](front/html-export.js) — only if the editable
   export needs it. Adding a script here without adding its menu item to the
   `export` variant in `toolbar.js` ships dead weight; adding the item without
   the script ships a dead control.

Bump `VERSION` in [sw.js](front/sw.js) when the shell changes; `activate` deletes
caches whose names don't match.

### Document state

The document lives in `editor.innerHTML` as HTML, always. Markdown is a
boundary format: markdown-it parses on the way in, Turndown serialises on the
way out. Nothing keeps a markdown copy in memory.

The `#editor` div in `index.html` ships **empty**. The welcome document is
[front/welcome.md](front/welcome.md), fetched and rendered by `app.js` when
there is no non-blank `localStorage["markdownContent"]` to restore. Edit the
markdown, not the markup — and note `welcome.md` is a shell asset, so it needs
its `sw.js` entry to survive offline.

Mermaid and LaTeX are the two exceptions worth knowing, and they are the same
problem solved twice: both renderers destroy the source they render from, so
each has to stash it somewhere Turndown can find it again. Break either and the
content round-trips to nothing — silently, because the document still looks
right on screen.

- **Mermaid** — `renderers.js` replaces the `<pre><code class="language-mermaid">`
  with a `.mermaid-wrapper` holding both the rendered SVG and a hidden
  `.mermaid-source` element. A Turndown rule in `app.js` reads that hidden
  source to reconstruct the fenced block.
- **LaTeX** — MathJax leaves nothing but glyphs behind, so `stampLatexSource`
  in `renderers.js` copies the original TeX onto each `<mjx-container>` as
  `data-tex` / `data-display`, reading it out of `MathJax.startup.document.math`
  while the two are still associated. The `mathjax` Turndown rule in `app.js`
  turns those attributes back into `$…$` / `$$…$$`. The stamp is an attribute
  rather than an element so it survives being written into an exported file and
  parsed back; an existing stamp is never overwritten, because MathJax
  re-typesets already-rendered maths on load and reports MathML the second time.

There is a third rule, and it is on the way *in* rather than the way out.
markdown-it has no notion of maths, so `$…$` used to reach MathJax only by
passing through as text — with every inline rule applied to it en route.
`\{` and `\}` resolved as markdown escapes before MathJax ever saw them, and
`$x = a*b*c$` came back italicised with the asterisks gone. `mathSpan` and the
`math` rule in `app.js` claim the span ahead of markdown-it's `escape` rule and
re-emit the source verbatim, so the parser now hands MathJax what the author
wrote. Two things follow from where it sits: the rule runs before `backticks`
in the chain but positionally after it, so `` `$HOME` `` is still code, not
maths; and it decides equation-versus-price on two heuristics — an opening `$`
is never followed by whitespace, a closing one never by a digit — which
`hasMathSpan` in `markdown-style.js` deliberately repeats, so the re-wrapper
and the parser cannot disagree about what is an equation.

Display maths broken across a blank line is still not handled. It does not need
to be: a blank line inside `$$…$$` is an error in TeX itself, and markdown-it
has split the paragraph in two before any inline rule runs.

### Links and heading anchors

markdown-it does not slug headings — that is GitHub's extension, not CommonMark
— so `[x](#section)` arrives pointing at an element that does not exist. Two
different mechanisms fix that, because the two outputs have different powers:

- **In the editor** (and the editable export), `headingAnchors(root)` in
  `app.js` resolves slugs against the live DOM on every Ctrl/Cmd+click. Nothing
  is stamped, so an id cannot go stale when a heading is edited.
- **In the static export**, there is no JS at all, so `documentBody()` in
  `static-export.js` calls `headingAnchors(clone, true)` to write real `id`
  attributes into the markup. It stamps the *clone*, never the editor, so
  nothing reaches Turndown.

`outline.js` is a third consumer: it builds both the sidebar and the inserted
TOC out of `headingAnchors`, rather than slugging headings a second time, so the
outline and the editor's own Ctrl+click resolution cannot disagree about what a
heading is called.

That is a second cross-file dependency on `app.js` alongside `slugifyTitle` —
`static-export.js` must stay after `app.js` in both `index.html` and `ASSETS`,
and after `outline.js` for the same reason.

Two traps here, both of which write into the user's file if you get them wrong:

- **`anchorSlug` is not `slugifyTitle`.** The filename slug strips non-ASCII and
  truncates at 50 characters, so it would slug `## Ünïcode Heading` to
  `ncode-heading` and never match the `#ünïcode-heading` link markdown-it wrote.
  They look interchangeable and are not.
- **The Ctrl+Click hint is a CSS variable, never a `title` attribute.** Turndown
  serialises a link title into the markdown as `[text](href "title")`, so
  stamping tooltips onto links would write them into the document on save.
  `app.js` sets `--link-hint` on `documentElement` and `app.css` draws it with a
  `:hover::after`, which never enters the DOM. The rule is scoped to
  `#editor[contenteditable="true"]` so the static export — where links are
  ordinary links needing no modifier — does not advertise a shortcut.

Autosave writes `editor.innerHTML` to `localStorage["markdownContent"]` on a 1s
debounce — separate from, and unaware of, the file on disk.

### The document versus the file

A page load restores the document from autosave, never by re-reading the file,
so the two can drift apart from either end. `file-api.js` tracks both directions
and reports them in the same toolbar label: `plan.md (edited, disk changed)`.

- **Our edits** are `isDirty`, set from the editor's own `input` event.
- **Everybody else's** are `fileMtime`, the mtime the file had when we last read
  or wrote it. `GET /api/file` returns it; `?stat=1` returns *only* it, which is
  the call `checkDiskChanged` makes on window `focus`, on `visibilitychange`, and
  once at startup — a page load has already missed the `focus` event for the tab
  it loads into.

Both flags are persisted (`marky-dirty`, `marky-file-mtime`) and restored only
alongside the content, for the same reason the path is: autosave carries unsaved
edits across a browser reload, and a baseline that reset to null would make the
first check call a file nobody has touched changed.

Setting a new baseline always clears the changed flag, because `openFile`,
`reloadFile` and `saveFile` are exactly the three moments the document and the
file are back in step. A document restored from before this shipped has no
baseline, and `checkDiskChanged` stays silent rather than inventing one — we do
not know when that document was read.

The flag has teeth in one place: `confirmOverwrite` re-stats before a save that
would write over the open file, because overwriting a file that moved on destroys
whatever moved it and Marky has no merge to offer. A Save As to any *other* path
is not gated on it — the baseline says nothing about a file we never read.

`reloadFile` is the discard path as much as the refresh one, so it is the one
action that confirms when there are edits to lose. It has no keyboard shortcut:
Ctrl+R, Ctrl+Shift+R and F5 all belong to the browser.

### The unsaved-work guard

`confirmDiscard` in [file-api.js](front/file-api.js) is the single gate in front
of every action that throws the open document away — Open, Reload and Clear.
Before it, the three disagreed: Reload asked, Open replaced the document with no
check at all despite calling the identical function, and Clear asked a question
whose wording read the same whether it was about to discard an untouched welcome
document or an hour of work. The presence of a dialog was therefore a bad signal
about how much was at stake, which is worse than no dialog.

Four things about it that are decisions rather than details:

- **Three buttons, not two.** A yes/no asks the user to choose between losing
  their work and abandoning what they were doing, when what they want is almost
  always neither. This is the case `ask()`'s arbitrary action list was built for.
- **Dismissing is cancelling.** `dismiss: "cancel"` is passed explicitly, so
  Escape, the backdrop and the close button all abandon the action rather than
  agreeing to discard. Get it backwards and a stray keypress destroys the work
  the guard exists to protect.
- **Save must report whether it saved.** `saveCurrentOrPrompt` and `saveFileAs`
  return booleans for this reason alone: an unnamed document opens the save
  dialog, an overwrite of a file that moved asks again, and the write itself can
  fail. In each of those the edits are still unsaved, so the action waiting on
  the save must not go ahead either. The `file-path` suite drives exactly that
  path with a queue of dialog answers.
- **Clear picks one dialog or the other, never both.** The guard's question
  already says everything the plain one does and adds the filename and a Save
  button, so a dirty document gets the guard and a clean one gets the plain
  question. Asking twice would only teach the user to click through the first.

Two of the four guards do not go through it. `confirmOverwrite` is about
somebody *else's* work rather than the user's, so it asks its own question — but
it gained the same third button, Save as…, which is the only answer to "your file
changed underneath you" that does not require someone's work to be lost. It
cannot recurse: the new path is not `currentFilePath`, so the staleness check
returns early. And `beforeunload` in `app.js` cannot use `ask()` at all, because
the browser will not wait on a Promise — it sets `returnValue` from
`documentIsDirty()` and takes the browser's own wording.

An exported document ships no `file-api.js`, and has no file to be dirty against.
Both call sites in `app.js` therefore feature-test (`typeof confirmDiscard ===
"function"`) and fall back to the plain question. That is an honest absence
rather than a second implementation of a flag with nothing behind it.

### Save fidelity

Turndown serialises to its own house style, so a save used to rewrite every
list, rule, emphasis and line break in the file — spec-legal on both sides, and
an unmergeable diff. [markdown-style.js](front/markdown-style.js) answers that
from the source rather than from a house style, in three layers, cheapest last
(Decision 1 in [CHANGELOG.md](CHANGELOG.md) records why, and what it deliberately does
not cover):

1.  **Sniff.** `sniffMarkdownStyle` reads the incoming markdown for the
    conventions it already follows — rule character, bullet marker and pad (per
    nesting depth, since alternating by level is common), emphasis delimiters,
    ordered-list delimiter and whether it was numbered all-`1.`, autolinks, and
    the wrap width. `adoptMarkdownStyle` in `app.js` pushes the Turndown-option
    subset onto the live options object; the rest is read by the `listItem` and
    `autolink` rules. Every default is Turndown's own, so a document that sniffs
    to nothing behaves exactly as it did before any of this.
2.  **Re-wrap.** `reflowMarkdown` breaks the serialiser's one-line paragraphs
    back to the sniffed width. Five guards, each of which silently corrupts the
    file if dropped: fenced code, table rows and maths — a `$$` display block,
    read as fence-like state, and any line carrying a `$…$` span — are never
    touched, and a break never strands a `#`, `-`, `1.`, `>` or `---` at the
    start of a line, where it reparses as a block marker. A blockquote's `> ` chain and a list item's
    content indent are re-applied to every continuation line.

    The width itself is measured rather than assumed, and has to be exact:
    wrapping is greedy, so a file wrapped at 80 reproduces its own breaks only
    if 80 is what comes back — guess 82 and every break in the document moves.
    `sniffWrapWidth` therefore takes the **95th percentile** of prose line
    lengths rather than the longest line, which one unbreakable URL would
    otherwise set, and gives up entirely (width 0, no re-wrap) on a file with
    fewer than three wrapped paragraphs, fewer than ten prose lines, or a
    result outside 40–120 columns. It stays a heuristic: a file that mixes
    one-sentence-per-line with wrapped prose has no single width and gets
    whichever wins. The cost of a bad guess is bounded by layer 3, which only
    lets the width near blocks that actually changed.
3.  **Restore.** The one that actually does the work. Re-wrapping only ever
    guesses at how the author broke their lines, and measured against this
    repo's own files it guesses badly — they break after a sentence, or let a
    line run long rather than split a link. So `indexMarkdownBlocks` indexes
    every segment of the opened file under a whitespace-insensitive key, and
    `restoreSourceWrapping` gives back the original bytes for any segment whose
    text still matches. An edited segment misses and falls through to layer 2.

The index is keyed on **content, not position**, and that is the whole trick.
A source map into the DOM would have to survive contenteditable splitting a node
on Enter, merging two on Backspace and restoring stale markup on undo; a content
key cannot go stale, because a segment that changed is exactly the segment that
should miss. Segments are consumed as matched, so a repeated paragraph gets each
original back in turn.

The segment boundaries in `markdownSegments` are load-bearing and non-obvious:
they split on list markers, headings and fences as well as blank lines, because
the two sides disagree about blank lines. A tight list whose items contain
sub-paragraphs is *loose* by CommonMark's definition, so markdown-it wraps each
item in `<p>` and Turndown puts a blank line back between items the author wrote
flush. Match whole blank-line-separated blocks and every such list fails to
match — which in this repo's own `TODO.md` is most of the file. Each segment
also carries the separator that followed it, so a restored run comes back tight
or loose the way the author had it.

The key ignores whitespace, but a pipe table needs more than that: the `table`
rule writes its own cell padding and its own three-dash delimiter, so `|---|---|`
and `| --- | --- |` are the same table and would never be the same key.
`normaliseTableRows` collapses padding around pipes and the delimiter row's dash
runs before the key is taken — but only in a block that holds a delimiter row, so
a `---` rule and a paragraph containing a pipe both stay literal.

CLAUDE.md, README.md and welcome.md all round-trip byte-identical. Editing one
word in CLAUDE.md changes exactly the paragraph it was in.

**One category is deliberately exempt: whitespace nobody can see.** Decision D3
in [CHANGELOG.md](CHANGELOG.md) is the argument; the mechanics are two functions
and where they sit.

`normaliseNbsp` converts U+00A0 — and the `&nbsp;` entity, which is how
`innerHTML` gives the character back — to a plain space. It runs *before*
Turndown and on the HTML, which is load-bearing in both respects. On the
markdown after `restoreSourceWrapping` it would strip a U+00A0 the author really
wrote out of a block nobody touched, destroying exactly the fidelity D1 promises;
running it here means only edited text is normalised. And the code-span shield
below it tests for a literal space, so converting first is also what lets the
shield see a trailing one at the edge of a span — an unconverted NBSP was
invisible to the shield's `/ $/` while Turndown's own edge-trim saw it perfectly
well (JS `\s` matches U+00A0) and moved the character outside the backticks and
into the file. One conversion, two bugs.

`sanitisePastedHtml` handles the way in. It drops empty inline wrappers and the
blank `<p>`/`<div>` blocks a paste leaves behind, which render as a hairline and
space bullets unevenly. Two things about it:

- **It is targeted, not a round-trip through markdown.** Pasting a web page
  should keep its bold, its links and its tables; only what nobody can see goes.
- **`isGhostElement` treats `<br>` asymmetrically, and that is the point.** A
  `<p>` or `<div>` whose only content is one *is* the ghost line — that is the
  markup Word and Docs emit for a blank one. Inside an inline element the same
  tag is a real break in a real line, and removing its parent would take the
  break with it. The predicate is a separate pure function from the traversal
  because the test stub has no HTML parser, so the decision is testable and the
  walk over it is not.

Neither reaches the live DOM in between, so a U+00A0 the browser writes while you
type still travels if you select that text and paste it into another application.
That is TODO 1.9 and is known rather than overlooked.

Two Turndown rules in `app.js` exist for the same reason. **`table`** (with
`tableCell` / `tableRow` / `tableSection`) is not an optimisation: Turndown 7
ships no table rule at all — GFM tables live in `turndown-plugin-gfm`, which
this project does not carry — so a `<table>` fell through to the default and
every cell came back as its own paragraph. Opening a file with a table and
saving it destroyed the table, unrecoverably, with nothing wrong on screen
either side of the save. **`listItem`** overrides a core rule to make the pad and
the numbering come from the document instead of Turndown's hardcoded `*   one` /
`1.  one`.

`autolink` is the one rule gated on a sniff, and it needs the scheme check it
carries: `[notes](notes.md)` also has matching text and href, and `<notes.md>`
is not an autolink — CommonMark renders it as literal text.

### Lazy loading

Mermaid (3.4 MB), MathJax, html2pdf, docx and FileSaver load on first actual
use via the memoised loaders in [lazy-load.js](front/lazy-load.js). Only
markdown-it and Turndown load eagerly. Never add a top-level `<script>` for a
heavy library — add an `ensure*` loader.

### The two HTML exports

There are two, and they are different deliverables:

- **HTML** ([static-export.js](front/static-export.js)) — the document alone as
  a standalone page, the same kind of artifact as PDF or DOCX. Inlines
  `app.css`, copies MathJax's runtime-generated `<style id="MJX…">` so maths
  lays out without MathJax present, strips `.mermaid-source` and
  `contenteditable`, and ships no editor JS at all. It is also the one place a
  table of contents is written into the document rather than drawn beside it:
  this file never goes back through Turndown, so nothing added here can reach
  anyone's `.md`. See the outline section below.
- **Editable** ([html-export.js](front/html-export.js)) — bundles the editor
  *with* the document so recipients can edit in-browser and send it back.

**Exported documents are self-reproducing.** They carry the export set a
document can travel on in — markdown, HTML and Editable — so the collaboration
chain survives more than one hop. The trick is that an exported file has no origin to fetch from but is
already carrying everything inline, so both export modules read the document
itself when it can: `static-export.js` takes the stylesheet from
`<style id="app-style">`, and `html-export.js` takes CSS *and* the whole bundle
from `<style id="app-style">` + `<script id="app-script">`, falling back to
`fetch` only when those are absent (i.e. when running in the app). Rename either
id and re-export silently degrades to a fetch of nothing.

**The exported document is a nerfed Marky, not Marky.** What ships is an editable
*document*; the application around it is the means, not the deliverable. Four
modules are deliberately excluded from `ASSETS`, for two different reasons.

The first two are excluded because the thing they drive does not exist in an
exported document:

- `file-api.js` — it drives the server-backed open/save, and an exported
  document has no server. It falls back to blob download instead, which is why
  `app.js` guards `downloadBtn` / `uploadBtn` / `fileInput` with existence
  checks, and why those two buttons are the only real split in the toolbar spec.
- `theme-manager.js` — it binds the theme toggle, which `toolbar.js` only
  renders for the `app` variant. Exported documents follow the reader's OS
  preference via the inline `THEME_SCRIPT` instead.

The other two are excluded because the formats they produce are dead ends:

- `pdf-export.js` and `docx-export.js` — nobody edits a PDF or a Word file and
  sends it back, so neither format extends the chain the editable export exists
  to keep going. They were 12% of the bundle inlined into every exported copy to
  produce artifacts that can never be exported *from*. Their `export-pdf` /
  `export-docx` items are `variants: ["app"]` for the same reason, and the two
  halves have to move together: drop the scripts alone and the items become dead
  controls, drop the items alone and the bundle carries dead weight. The toolbar
  suite catches the first, the self-reproduce suite the second.

  `ensureHtml2Pdf` and `ensureDocx` stay in `lazy-load.js`, which is a shared
  file with no variants — unreachable in an export rather than absent from it.

`outline.js` *is* in `ASSETS` — the sidebar needs no server — but an exported
document opens with it closed regardless of the author's stored preference, for
the same reason it ignores the author's theme: it is the reader's copy.

Both files build `</script>` from a constant rather than writing it literally,
for the reason documented at the top of `html-export.js`. They use *different*
constant names (`CLOSE` vs `DOC_CLOSE`) because top-level `const`s collide in
the shared global scope — see the load-order section above.

### execCommand

Eight of the nine formats, plus paste and Tab-indent, go through
`document.execCommand`. [execcommand.js](front/execcommand.js) is the only file
allowed to call it — `runCommand(command, value)` is the door, and the
`execcommand` suite scans `front/` to keep it the only one, because the way this
regresses is not a broken fix but a new call site that never reaches it.

Decision D4 in [CHANGELOG.md](CHANGELOG.md) is why execCommand stays rather than
being reimplemented, and carries the boundary rule for new formats. What the code
does:

- **`styleWithCSS` is turned off once, at load.** Its default was never specified
  and is per-browser. Turndown has no rule for `<span style="font-weight:bold">`,
  so it drops the span and keeps the text — bold would vanish on save with
  nothing wrong on screen until the file was reopened. This one line is what
  actually closes that; the retagging below is a backstop for pasted markup.
- **`normaliseEditorMarkup` fixes what markdown cannot absorb, and only that.**
  Most vendor disagreement never reaches the file: `<b>` and `<strong>` are both
  `**bold**`. What does reach it is styled spans and `<font>`, sublists placed
  beside their item instead of inside it, headings or paragraphs wrapped around a
  list, an `<li>` nested directly in an `<li>`, and Chrome's `id="null"` on a
  rule.
- **Retagging moves the children, it does not copy the text.** A selection points
  at a text node; rebuilding the text would drop the caret on every command that
  needed normalising.
- **Four subtrees are never touched** — `pre`, `code`, `.mermaid-wrapper` and
  `mjx-container`. The last two hold the only copy of their own source, and
  rewriting one breaks the round-trip to markdown irrecoverably with the document
  still looking right on screen.
- **It reports whether it changed anything, and that drives `undoRefresh()`.**
  execCommand dispatches `input` synchronously, so the undo stack snapshotted the
  un-normalised document before `runCommand` got to fix it. Refreshing corrects
  that snapshot in place. Dispatching a second `input` would work and would be
  wrong: one action would cost two Ctrl+Z, the first appearing to do nothing.

Three divergences survive it, all measured rather than assumed, all in TODO 5.1.
The one to know about is Firefox merging a bullet into the item above on outdent
— it cannot be normalised, because that markup is indistinguishable from a
deliberate hard break in a list item.

### The menu bar

There is no toolbar markup in `index.html` or `html-export.js` — both ship an
empty `<div class="toolbar">` and [toolbar.js](front/toolbar.js) fills it from
`TOOLBAR_MENUS`. **Add or change an item there and nowhere else.**

It was a row of sixteen buttons until it stopped fitting: four groups plus the
theme toggle, wrapping onto a second line below about 900px, with split buttons
bolted on where two actions had to share one slot. Six words — File, Edit,
Insert, Format, View, Export — hold 24 items and fit one line at 375px.

**The bar is two rows in the app, one in an exported document.** The menus have
the first to themselves. The second is `.toolbar-content`, the document row: the
filename on the left, the theme toggle on the right. It is a row rather than the
filename being a toolbar child in its own right because that is where the tab
bar goes once more than one document can be open (TODO 4.1) — the filename is
standing in for it. An exported document has neither a file on disk nor a theme
toggle, so it gets no second row at all rather than an empty band.

There is no GitHub link. It pointed away from the app from a bar that should be
about the document, and it was the tallest thing in that bar.

**There is no app title.** It was an `<h1>` reading "Marky Markdown Editor", it
cost a third of the bar's width to repeat what the tab already says, and it was
the page's only `<h1>` — which belongs to the document, not to the chrome.

Clicks are **delegated**: one listener on `.toolbar` dispatches by
`data-action`. Modules call `onToolbarAction("export-pdf", handler)` rather than
reaching for an element, so an item a variant does not render is an unused
registration instead of a listener bound to `null`. The handler receives the
item, and several handlers may share an action and run in registration order,
**each awaited before the next starts** — that is how `file-api.js` hooks
`"clear"` on top of `app.js`'s own clearing, and the await is what keeps that
working now that `app.js`'s handler stops on an `ask()` dialog. Drop it and
`file-api.js` runs while the question is still on screen, sees a document that
is not blank yet, and leaves the file association behind — pointing Ctrl+S at a
filename with nothing under it. Use `toolbarButton(action)` to find an item on
demand and `runToolbarAction(action)` to drive one from a keyboard shortcut.

Six things that are decisions rather than details:

- **The trigger carries `data-menu`, not `data-action`.** It is not an action:
  it belongs to the mechanism in `toolbar.js` rather than to any module. Give it
  an action and "every rendered action has a handler in this variant's bundle"
  stops being true — the trigger's handler lives in `toolbar.js`, which that
  check deliberately excludes. Same rule the old split caret followed.
- **`mousedown` is prevented over the bar.** Formatting acts on the editor's
  live selection, and a click that moved focus would take the selection with it,
  so every Format item would return having done nothing. The format bar's own
  buttons have always done this; the menu bar had to learn it. The click still
  fires — only the focus change is suppressed.
- **A `separator: true` entry is filtered by variant like any other**, and
  `visibleItems` collapses the leading, trailing and doubled rules left behind.
  Today's spec happens to filter cleanly in both variants, so nothing rendered
  exercises it — the toolbar suite drives the function directly instead, because
  the next app-only item added at the top of a menu strands a rule in the export
  variant and nobody would see it until they opened that file.
- **In-button feedback does not survive a menu.** "Saved!", "Reloaded!",
  "Copied!" and the two export spinners all used to live on the button that was
  clicked, and a menu closes on the click — so they are `notify` toasts now, and
  `flashButton` is gone. Anything new that wants to report on a click has the
  same problem and the same answer.
- **`--toolbar-height` is the sum of the rows**, not a `max()` of what is in
  them: the menu row, the gap, and the document row, whose own height is the
  taller of the two things on it. The toolbar ships empty and the two
  render-blocking CDN scripts sit above `toolbar.js`, so there is a real window
  in which the page paints with nothing in it — the reserved height is what
  stops everything below jumping when the script runs. It measures exactly at
  every width, which it never did while the bar was one row that wrapped, and
  everything the arithmetic reads is a custom property so changing a size makes
  the reservation follow.
- **The export's shorter bar is stamped, not detected.** `:root[data-variant]`
  redefines `--toolbar-height` to the menu row alone, and the variant is written
  by the same inline script in the export's `<head>` that sets the theme —
  before the stylesheet is read. It cannot be a rule keyed on `.toolbar-content`
  being absent, however tempting `:has()` looks: the row is equally absent in
  the app until `toolbar.js` runs, which is the exact window the reservation
  exists for, so such a rule would reserve the short bar for everyone and then
  jump. That makes `THEME_SCRIPT` in `html-export.js` and the
  `:root[data-variant="export"]` block in `app.css` two halves of one thing with
  no import between them; the toolbar suite checks both.
- **The theme toggle carries a `title`, and `theme-manager.js` moves it.** It is
  a sliding pill with no label, so without one nothing on screen says what it
  does — and it is the only control left in the bar that is not a word. The
  title and the `aria-label` say the same sentence and are updated together in
  `updateToggleButton`; stamp one and not the other and the tooltip ends up
  claiming the opposite of what the switch will do.
- **`tocBtn` is the only stateful item.** `outline.js` writes `aria-pressed` on
  it by action, exactly as it did to the old toggle button, and `app.css` draws
  the checkmark from that attribute. Every item reserves the checkmark's gutter
  so the labels line up in a column.

Each item declares `variants`. There are three splits. The file group: the app
talks to the file server (`open-file` / `save-file` / `reload-file` /
`save-as-file`), while an exported document has none and falls back to
`upload-md` / `download-md`. The theme toggle, since exported documents follow
the reader's OS preference rather than inheriting the author's stored one. And
PDF / DOCX, which are app-only because the formats are terminal — see the two
exports section above.

The variant is read from `#editor[data-exported]`, which only exported documents
carry. `app.js` strips that attribute on `window load`, long after `toolbar.js`
has run.

The rule to preserve: **an item must only exist in a variant whose bundle
includes the script that binds it**, or it renders as a dead control. The
editable export's `ASSETS` decide that, and `toolbar.js` must stay first in that
list for the same reason it is first in `index.html`.

Keyboard: arrows move along the bar and within a panel, both wrapping; Escape
closes and hands focus back to the trigger, and is a no-op when no menu is open
so a `notify.js` dialog still gets it. Hovering switches menus only while one is
already open — hovering a closed bar must not spring menus at you.

### The format bar

`applyFormat` in [format-bar.js](front/format-bar.js) is the one entry point —
the bar's own buttons and the Format menu both go through it, so the menu is a
second way to reach nine formats rather than a second implementation of them.
Eight of the nine are `execCommand` calls. Code is the exception, and everything
interesting here is about Code.

**Code is the only format with both a block and an inline spelling**, and
markdown draws that line as sharply as HTML does: ` ``` ` fences a block, single
backticks span text inside a line. There is no `execCommand` for either, so the
choice has to be made here — and it is made from the selection rather than from a
second button:

- **A partial selection** inside one block gives inline `<code>`. This is the
  common case and the button used to get it wrong, turning the whole paragraph
  into a fenced block over two selected words.
- **A whole block, or several** gives `<pre><code>`. Several collapse into one
  fenced block joined by newlines, because there is no inline construct that
  spans a block boundary to offer instead.
- **A bare caret** counts as the whole block. Every other block format acts on
  the whole block from a caret, and Code being the one that made you select the
  line first would read as broken rather than as precise.

**`blocksInRange` answers with the innermost blocks, not `editor.children`.**
That distinction is load-bearing and it was destructive to get wrong: a selection
inside one bullet reported the whole `<ul>`, so Code replaced the list with a
single `<pre>` and ran every item together. The innermost block is the `<li>` the
text is actually in. Nested lists report both `<li>`s, so the result is filtered
to those containing none of the others.

**A `<pre>` only ever stands in for a direct child of `#editor`.** Putting one
where an `<li>` was is invalid markup, and the honest version — a fence nested
inside the list item — is a separate feature with a save-fidelity question behind
it. So a whole bullet falls back to inline, and a selection covering several
bullets declines with a `notify` rather than falling back: inline across two
blocks would have `deleteContents` pull the blocks themselves apart to build a
code span markdown cannot write anyway.

**p / h1 / h2 / h3 act on the whole block from a partial selection, by design.**
There is no such thing as half a heading. The alternative on the table was
disabling them unless the selection covered a whole line, which would have read
as a broken button; `formatBlock` already behaves this way and so does every
editor people arrive from. Code is the only one that reads the extent, because
it is the only one with somewhere else to go.

**The Code branch dispatches a synthetic `input` event.** Every `execCommand`
raises one for free, and autosave, the dirty flag, the outline and the undo stack
all hang off exactly that — so the hand-rolled branch was invisible to Ctrl+Z and
left the toolbar claiming the document still matched the file on disk. Same
convention as `insertToc` and the undo section below.

`updateActiveButtons` still reads only `selection.anchorNode`, so the active
states reflect where the selection started rather than the whole of it. That is
TODO 3.1 and is untouched by any of the above.

### The outline

The sidebar is chrome and lives **outside `#editor`**, and that is the whole
design. Everything inside the editor is the document — Turndown serialises it on
every save — so a self-updating table of contents in there would rewrite a block
of the user's file every time any heading changed, and it is exactly the block
that can never match `indexMarkdownBlocks`, because a segment that changed is a
segment that misses. A live TOC inside the document would be a feature whose
only output is the diff noise `markdown-style.js` exists to eliminate. It would
also sit inside a `contenteditable`, where regeneration fights the caret.

**Insert TOC** is the honest version of the same idea, and it is a different
feature: it writes a nested markdown list once, and that list is then ordinary
content the author owns. It does not recognise a list it inserted before — a
marker class does not survive a save and reload, since Turndown drops it — so a
second invocation inserts a second list rather than guessing. Taking one back
is Ctrl+Z, which works: see the Undo section.

**Depth comes from nesting, not from the heading level.** People use headings as
a type scale, so a document may put three H6s under an H1 and follow them with
an H2; indenting by the number in the tag draws that as a five-deep staircase
with four empty rungs. `outlineDepths` runs a monotonic stack of the open
levels instead: a heading closes every heading open at its own level or deeper
and nests inside what is left. The stack is strictly increasing, so depth is
bounded by the number of *distinct* levels in play rather than by 6 — that
document maxes out at 2 — and nothing is invented, so one that opens on an H3
starts at 0. Equal levels are siblings; treating a repeat as a child would nest
a flat run of H2s forever. The outline reports structure and cannot divine
intent.

The two visual channels are deliberately independent: **indent is the relative
depth, type scale is the absolute level**. A stray H6 one rung under an H1
renders small beside a large one, so an inconsistent document reads as texture
rather than earning a warning nobody asked for.

`copyInline` decides what survives from a heading into an entry, by
**allowlist** — `em`/`strong`/`code`/`del`/`sub`/`sup` pass through, everything
else flattens to its text. The exclusions are the reason it exists: an `<a>`
inside a heading would nest anchors, which is invalid, and the browser unnests
them until the entry stops being a link at all. Maths in a heading flattens to
MathJax's rendered glyphs, which reads correctly and whose slug will not
resolve — a known limit, left alone.

Three more things worth knowing:

- **The nav element is built in JS, not written into markup.**
  `html-export.js` hand-writes the whole `.container` block too, so markup added
  to `index.html` would be a fourth registry that drifts silently. Same
  reasoning as the toolbar.
- **The open/closed state is stamped before the stylesheet loads**, in the same
  inline `<script>` in `index.html` that sets the theme, and the grid column is
  sized from `--outline-width` rather than from the nav's content. Both exist so
  the editor does not render full-width and then shift once `outline.js` runs —
  the same problem `.toolbar`'s `min-height` solves.
- **Rebuilds hang off a debounced `MutationObserver` on `#editor`**, not an
  `input` listener, because the document also changes from Open, Reload, Clear,
  paste and the welcome fetch. The click handler captures the heading *element*
  rather than looking it up by slug, since a slug goes stale the moment its
  heading is edited and the rebuild is a second behind.

The static export's TOC is gated on `outlineIsOpen()`. That is a placeholder for
a Settings pane, not a design — the sidebar is chrome for the author and the
export's TOC is content for the reader, and they should not be one switch
(TODO 4.2).

### Undo

[undo.js](front/undo.js) keeps the document's history, because the browser's own
does not survive this app. `execCommand("undo")` works right up until something
assigns `editor.innerHTML` — open, reload, clear, paste markdown, upload, the
restore-or-welcome path at startup — at which point the native stack is thrown
away and Ctrl+Z quietly stops answering for the rest of the session.

Snapshots of the whole `innerHTML`, not a diff or a command log. Contenteditable
is not a data structure we control: the browser splits nodes on Enter, merges
them on Backspace, normalises markup on paste and rewrites a trailing space to
an NBSP behind our back. Anything finer-grained would have to model all of that,
and getting it wrong corrupts the document.

Four things worth knowing:

- **`undoReset()` is the only API, and it marks a document boundary.** History
  never crosses one. Undo after an Open must not hand back the previous file's
  text, because that text would then be sitting under the new file's path, one
  Ctrl+S away from being written there. Every site that assigns
  `editor.innerHTML` picks a side — reset, or raise an `input` event and be
  undoable — and the `undo` suite counts those sites so a new one cannot skip
  the choice.
- **A programmatic edit announces itself with a synthetic `input` event.** That
  was already the convention for autosave and the dirty flag, which is why
  `insertToc` needed no change at all to become undoable.
  `paste-md` gained the dispatch, which also fixed it never marking the document
  edited.
- **The caret is stored as a character offset, not a Range.** A Range points at
  nodes that restoring a snapshot destroys. `undoTextOffset` counts characters
  across element boundaries, and `undoLocateOffset` walks back to a text node —
  landing at the end rather than nowhere when the content got shorter.
- **Coalescing is by `inputType`, not just by time.** Consecutive `insertText`
  or `deleteContentBackward` inside 600ms collapse into one step; everything
  else — Enter, a format button, a paste, a synthetic event with no `inputType`
  at all — starts its own. Time alone would merge two Enters into one step.

Applying a snapshot dispatches `input` so autosave, the dirty flag and the
outline all hear it, and does so behind a re-entrancy guard so the undo does not
record itself as an edit. `onToolbarAction("undo"/"redo")` are registered with
no buttons behind them until the menu bar gave them somewhere to go, which was a
spec entry rather than new wiring.

### Notifications

[notify.js](front/notify.js) is the only way `front/` talks to the user outside
the document. There is no `alert()` and no `confirm()` left, and the `notify`
test suite scans the sources to keep it that way.

- `notify(message, { severity, actions, timeout })` — a toast in the bottom
  right. Non-blocking, returns a function that dismisses it.
- `ask(message, { title, severity, actions, dismiss })` — a modal, resolving to
  the chosen action's `value` or to `dismiss` (default `null`).

Why it exists at all is worth keeping: `alert()` blocks the page, ignores the
theme, and can say nothing but OK. The one that forced the issue is that Chrome
and Firefox both let a user tick "prevent this page from creating additional
dialogs", after which every `alert()` in the app silently does nothing — so a
save failure could reach nobody.

Four things about it that are decisions rather than details:

- **Errors do not auto-dismiss; everything else does.** A toast that vanishes is
  right for "Saved!" and wrong for "Failed to save file". Having just argued
  that a suppressible dialog is unacceptable, a four-second one the user was
  looking away from would be the same bug wearing a nicer hat. Hovering also
  holds a toast open, since a message worth reading can outlast its own timer.
- **`ask()` takes an arbitrary action list, not a yes/no.** That is the whole
  reason it is not a `confirm()` wrapper, and the unsaved-work guards are what
  it was built for: Save / Discard / Cancel, and Cancel / Overwrite / Save as….
  Actions render in array order; the one marked `default: true` takes focus, so
  the destructive dialogs mark Cancel and Enter does the safe thing.
- **Dismissing is not agreeing.** Escape, the backdrop and the close button all
  resolve to `dismiss`, which defaults to `null` so a two-way caller testing the
  result for truthiness reads it as no. Get this backwards and Escape overwrites
  the user's file.
- **It returns a Promise, which made toolbar dispatch asynchronous.** See the
  toolbar section: handlers sharing an action are now awaited in turn, because
  `app.js`'s Clear stops mid-handler and `file-api.js`'s hook must not run until
  it resumes.

The DOM is built in JS, like the toolbar and the outline nav, because
`html-export.js` hand-writes its own copy of the page shell — markup in
`index.html` would be a second copy to keep in step. Escape is bound to the
backdrop rather than the document, so with two dialogs open only the one holding
focus answers it, and there is no stack to maintain.

`notify.js` is in `ASSETS`: exported documents raise most of the same failures
the app does, since every export path can fail in one.

### Server

[server/src/server.ts](server/src/server.ts) is the whole thing. Routes:
`/api/home`, `GET /api/browse`, `GET|POST /api/file`, then a catch-all static
handler for `front/`.

Both `/api/file` methods report the file's mtime, which is what lets the editor
notice a file changing underneath it. `GET` with `stat=1` answers with that
alone and never reads the file: the editor asks on every window focus while a
file is open. `POST` returns the mtime of what it just wrote, so a save
re-baselines from the reply — without it the next check reads our own save as
somebody else's edit.

Two security properties to preserve:

- The server binds `127.0.0.1` only. The file API reads and writes anywhere the
  user can, so it must never be network-reachable.
- The static handler resolves inside `FRONT_DIR` and verifies the result stays
  there. The file API intentionally does *not* have that restriction — it is
  gated on extension (`.md`, `.markdown`, `.txt`) instead, which is the point of
  the tool.

`POST /api/file` writes only into a directory that already exists — it does not
`mkdir -p` its way there. The editor's remembered file path outlives the folder
it names, so creating the parent would rebuild a tree the user moved or deleted
and file the document somewhere they would never look. The dialog can only pick
directories it browsed, so the check costs nothing on the normal path.

`FRONT_DIR` resolves relative to `import.meta.dirname`, so cwd doesn't matter.
The service worker never touches `/api/*` — those are live reads and writes.

### Degrading without the server

`file-api.js` probes `/api/home` at startup and disables Open/Save if it doesn't
get well-formed JSON back (a static host answering 200 with `index.html` does
not count). The editor still boots from the service-worker cache; clipboard and
all three exports keep working.
