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

- **toolbar** — every button a variant renders has a handler in a script that
  variant's bundle ships, menu items included. Both bundle lists are parsed out
  of `index.html` and `html-export.js`, so the test cannot drift from the real
  ones. Also drives the split menus the way a browser would — toolbar listener
  first, then the document's, as the event bubbles.
- **format-bar** — formatting never replaces `#editor`. Regression cover for a
  bug that detached the editable root and left the app looking unstyled and
  dead until reload.
- **self-reproduce** — an exported document re-exports without touching the
  network, and hands its successor byte-identical CSS and JS.
- **static-export** / **file-path** — the document-only export's contents, and
  everything the app remembers about the file it has open: the path, the last
  browsed directory, the edited marker, and the mtime baseline that Reload and
  the disk-changed marker measure against. It drives a fake disk, so a reload,
  an outside edit and a save over one all have a real file to disagree with.
- **save-fidelity** — the serialiser options app.js asks for, and then
  `markdown-style.js` directly: the sniffers, and every guard in the re-wrapper.
  That second half is the one that writes into the user's file.

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
  After that: `markdown-style.js` defines `sniffMarkdownStyle`,
  `reflowMarkdown`, `indexMarkdownBlocks` and `restoreSourceWrapping`, which
  `app.js` calls at top level and on every save;
  `app.js` defines `editor`, `markdownToHtml`, `htmlToMarkdown`;
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
   export needs it. Adding a script here without adding its button to the
   `export` variant in `toolbar.js` ships dead weight; adding the button
   without the script ships a dead control.

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

Note the loss that is *not* fixed: markdown-it resolves `\{` and `\}` as
markdown escapes on the way in, before MathJax ever sees them, so those survive
neither rendering nor saving. That is an input-side bug, upstream of both rules.

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

That is a second cross-file dependency on `app.js` alongside `slugifyTitle` —
`static-export.js` must stay after `app.js` in both `index.html` and `ASSETS`.

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

### Save fidelity

Turndown serialises to its own house style, so a save used to rewrite every
list, rule, emphasis and line break in the file — spec-legal on both sides, and
an unmergeable diff. [markdown-style.js](front/markdown-style.js) answers that
from the source rather than from a house style, in three layers, cheapest last:

1.  **Sniff.** `sniffMarkdownStyle` reads the incoming markdown for the
    conventions it already follows — rule character, bullet marker and pad (per
    nesting depth, since alternating by level is common), emphasis delimiters,
    ordered-list delimiter and whether it was numbered all-`1.`, autolinks, and
    the wrap width. `adoptMarkdownStyle` in `app.js` pushes the Turndown-option
    subset onto the live options object; the rest is read by the `listItem` and
    `autolink` rules. Every default is Turndown's own, so a document that sniffs
    to nothing behaves exactly as it did before any of this.
2.  **Re-wrap.** `reflowMarkdown` breaks the serialiser's one-line paragraphs
    back to the sniffed width. Four guards, each of which silently corrupts the
    file if dropped: fenced code and table rows are never touched, and a break
    never strands a `#`, `-`, `1.`, `>` or `---` at the start of a line, where
    it reparses as a block marker. A blockquote's `> ` chain and a list item's
    content indent are re-applied to every continuation line.
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

CLAUDE.md, README.md and welcome.md all round-trip byte-identical. Editing one
word in CLAUDE.md changes exactly the paragraph it was in.

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
  `contenteditable`, and ships no editor JS at all.
- **Editable** ([html-export.js](front/html-export.js)) — bundles the editor
  *with* the document so recipients can edit in-browser and send it back.

**Exported documents are self-reproducing.** They carry the whole export set —
HTML, PDF, DOCX and Editable — so the collaboration chain survives more than one
hop. The trick is that an exported file has no origin to fetch from but is
already carrying everything inline, so both export modules read the document
itself when it can: `static-export.js` takes the stylesheet from
`<style id="app-style">`, and `html-export.js` takes CSS *and* the whole bundle
from `<style id="app-style">` + `<script id="app-script">`, falling back to
`fetch` only when those are absent (i.e. when running in the app). Rename either
id and re-export silently degrades to a fetch of nothing.

Two modules are deliberately excluded from `ASSETS`, both because the thing they
drive does not exist in an exported document:

- `file-api.js` — it drives the server-backed open/save, and an exported
  document has no server. It falls back to blob download instead, which is why
  `app.js` guards `downloadBtn` / `uploadBtn` / `fileInput` with existence
  checks, and why those two buttons are the only real split in the toolbar spec.
- `theme-manager.js` — it binds the theme toggle, which `toolbar.js` only
  renders for the `app` variant. Exported documents follow the reader's OS
  preference via the inline `THEME_SCRIPT` instead.

Both files build `</script>` from a constant rather than writing it literally,
for the reason documented at the top of `html-export.js`. They use *different*
constant names (`CLOSE` vs `DOC_CLOSE`) because top-level `const`s collide in
the shared global scope — see the load-order section above.

### The toolbar

There is no toolbar markup in `index.html` or `html-export.js` — both ship an
empty `<div class="toolbar">` and [toolbar.js](front/toolbar.js) fills it from
`TOOLBAR_GROUPS`. **Add or change a button there and nowhere else.**

Clicks are **delegated**: one listener on `.toolbar` dispatches by
`data-action`. Modules call `onToolbarAction("export-pdf", handler)` rather than
reaching for an element, so a button a variant does not render is an unused
registration instead of a listener bound to `null`. The handler receives the
button, which is what the spinner, disabled and "Saved!" states use. Several
handlers may share an action and run in registration order — that is how
`file-api.js` hooks `"clear"` on top of `app.js`'s own clearing. Use
`toolbarButton(action)` to find a button on demand and `runToolbarAction(action)`
to drive one from a keyboard shortcut.

Each button declares `variants`. The only real split is the file group: the app
talks to the file server (`openBtn` / `saveBtn`), while an exported document has
none and falls back to `uploadBtn` / `downloadBtn`. Everything else is shared,
except the theme toggle — exported documents follow the reader's OS preference
rather than inheriting the author's stored one.

The variant is read from `#editor[data-exported]`, which only exported documents
carry. `app.js` strips that attribute on `window load`, long after `toolbar.js`
has run.

The rule to preserve: **a button must only exist in a variant whose bundle
includes the script that binds it**, or it renders as a dead control. The
editable export's `ASSETS` decide that, and `toolbar.js` must stay first in
that list for the same reason it is first in `index.html`.

#### Split buttons

A spec with a `menu` renders as a `.split-button`: the primary button, a caret
beside it, and the menu itself — Open/Reload and Save/Save As so far. The menu is
built *inside* the wrapper, and therefore inside `.toolbar`, which is the whole
point: its items are ordinary `[data-action]` buttons, so the one delegated
listener already dispatches them and a menu entry needs no wiring beyond the
`onToolbarAction` its module registers anyway. The same rule as above holds over
menu items, and the toolbar test enforces it over both.

The caret carries **`data-menu`, not `data-action`**, because it is not an
action: it belongs to the mechanism in `toolbar.js` rather than to any module.
Give it an action and "every rendered action has a handler in this variant's
bundle" stops being true — the caret's handler lives in `toolbar.js`, which that
check deliberately excludes.

Open state is one attribute, `data-open` on the wrapper, with CSS doing the rest;
`toolbar.js` holds the single open menu in `openSplit` rather than querying for
it. Dismissal is on the document, so a click or Escape anywhere closes it — the
first time `toolbar.js` binds outside `.toolbar`.

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
