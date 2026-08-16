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
  variant's bundle ships. Both bundle lists are parsed out of `index.html` and
  `html-export.js`, so the test cannot drift from the real ones.
- **format-bar** — formatting never replaces `#editor`. Regression cover for a
  bug that detached the editable root and left the app looking unstyled and
  dead until reload.
- **self-reproduce** — an exported document re-exports without touching the
  network, and hands its successor byte-identical CSS and JS.
- **static-export** / **file-path** — the document-only export's contents, and
  the persistence of the open file and last browsed directory.

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
  After that: `app.js` defines `editor`, `markdownToHtml`, `htmlToMarkdown`;
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

### Server

[server/src/server.ts](server/src/server.ts) is the whole thing. Routes:
`/api/home`, `GET /api/browse`, `GET|POST /api/file`, then a catch-all static
handler for `front/`.

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
