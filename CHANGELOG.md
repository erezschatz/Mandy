# Changelog

Everything done to Marky since it was forked. The fork point is `a01ba0d`
(2026-03-13), the last upstream commit; `7620cbc` below is the first commit of
this line of work and everything after it is ours.

Entries are in the order they happened, oldest first, each with the date and the
commit it landed in. This file is *what changed*. For *why* a design choice was
made, see [docs/DECISIONS.md](docs/DECISIONS.md); for what stands between here
and a finished 1.0, see [docs/TODO.md](docs/TODO.md); for what comes after
that, see [docs/ROADMAP.md](docs/ROADMAP.md).

---

## 2026-08-11 — `7620cbc` — Restructure into `front/` and `server/`

Every browser-facing file moved into `front/`, and `server/` arrived: a Deno +
Hono service that serves `front/` and exposes a local file API (`/api/browse`,
`/api/file`) for reading and writing markdown on disk. The move was
content-preserving — `index.html` already used absolute paths, so `front/`
simply became the web root and nothing needed rewriting. The server binds
`127.0.0.1` only and gates the file API on extension (`.md`, `.markdown`,
`.txt`) rather than on a directory, since reaching the user's own files is the
point of it. It resolves `front/` relative to its own source file, so the
working directory it is launched from does not matter, and `ecosystem.config.cjs`
runs it under pm2.

## 2026-08-11 — `877a964` — Edit local files, drop Firebase, finish the PWA

The frontend wired up to the file server, and the assumptions left over from
being a statically hosted download/upload editor removed. Open and Save replaced
Upload MD and Download MD, backed by the new API; Ctrl+S writes to the current
file and Ctrl+Shift+S saves as. Exported HTML kept its own blob download, since
those documents have no server behind them, and without the server the editor
still loads and simply disables Open/Save.

Firebase went with it — hosting config, the deploy workflow and `.github/` — and
analytics went with Firebase. That last one mattered: it reported every page
view, local ones included, to the upstream project's measurement ID, which flatly
contradicted the "no data sent to servers" claim in the README. The PWA was
finished off at the same time: `manifest.json` had declared `"any maskable"` over
edge-to-edge artwork that launchers would have cropped, so the icons became
purpose-correct alongside a padded maskable SVG, and `sw.js` arrived to precache
the app shell and runtime-cache the CDN libraries. Same-origin requests are
network-first on purpose, so a stale cache never shadows a source file you are
editing.

## 2026-08-12 — `aeb9712` — Unify the toolbar, split HTML export in two, replace the welcome markup

`front/toolbar.js` became the single definition of the toolbar. `index.html` and
`html-export.js` both ship an empty div and it fills them from `TOOLBAR_GROUPS`,
which removed 253 lines from one and 69 from the other — the two had been a
hand-copied duplicate drifting apart. Clicks became delegated: one listener
dispatches by `data-action` and modules register with `onToolbarAction`, so a
button a variant does not render is an unused registration rather than a listener
bound to `null`.

The welcome document became markdown again. `front/welcome.md` replaced two
copies of the welcome text — one hardcoded in `index.html`, one in
`default-content.js` — which had already drifted apart, along with the string
sniffing that tested for its contents.

HTML export split in two. Plain **HTML** now produces the document alone, the
same kind of deliverable as PDF or DOCX; the editor-bundling behaviour was
renamed **Editable**. Exported documents carry the whole export set and are
self-reproducing: both export modules read their own inline `<style>` and
`<script>` when there is no origin to fetch from, so the collaboration chain
survives more than one hop.

## 2026-08-12 — `4136718` — Format bar rewrite

A follow-up carrying the same subject line as the commit before it, but a
different change: `front/format-bar.js` reworked, 89 lines in and 83 out, with a
service worker version bump behind it.

## 2026-08-12 — `d8c61d7` — A dependency-free test suite

`tests/` with no framework and nothing to install. Each suite loads the real
`front/` sources into a scope with a hand-rolled DOM stub and drives them, so a
suite breaks when the source it names changes rather than drifting into agreement
with a copy of it. It runs under Deno — the toolchain the project already
requires — or Node, since nothing uses more than `node:fs`.

Five suites, all covering invariants that fail *silently* rather than loudly.
**toolbar** checks that every button a variant renders has a handler in a script
that variant's bundle ships, parsing both bundle lists out of `index.html` and
`html-export.js` so the test cannot drift from the real ones. **format-bar** is
regression cover for a bug that replaced `#editor` outright, detaching the
editable root and leaving the app looking unstyled and dead until reload.
**self-reproduce** checks that an exported document re-exports without touching
the network and hands its successor byte-identical CSS and JS. **static-export**
and **file-path** cover the document-only export's contents and the persistence
of the open file and last browsed directory. 91 checks.

## 2026-08-12 — `10d7b1b` — Add TODO.md and scale back the collaboration claims

The TODO list started here, and the README stopped describing the project as
collaborative in the sense people now read that word.

## 2026-08-12 — `b7a297f` — One slug for every export filename

`slugifyTitle` moved into `app.js` and the three export modules stopped each
having their own version. Before this, PDF, DOCX and HTML could each name the
same document differently.

## 2026-08-12 — `c119f25` — Stop LaTeX being destroyed on save

MathJax leaves nothing but glyphs behind, so a document with equations
round-tripped to nothing — silently, because it still looked right on screen.
`stampLatexSource` in `renderers.js` now copies the original TeX onto each
`<mjx-container>` as `data-tex` / `data-display`, read out of
`MathJax.startup.document.math` while the two are still associated, and a
`mathjax` Turndown rule in `app.js` turns those attributes back into `$…$` /
`$$…$$`. The stamp is an attribute rather than an element so it survives being
written into an exported file and parsed back, and an existing stamp is never
overwritten, because MathJax re-typesets already-rendered maths on load and
reports MathML the second time. New `tests/latex.test.mjs`.

## 2026-08-15 — `1b3398f` — More tasks recorded

TODO-only: 158 lines of new items.

## 2026-08-15 — `cfd9e6b` — Clickable links and heading anchors

markdown-it does not slug headings — that is GitHub's extension, not CommonMark —
so `[x](#section)` arrived pointing at an element that did not exist. Two
mechanisms fixed it, because the two outputs have different powers: in the editor
`headingAnchors` resolves slugs against the live DOM on every Ctrl/Cmd+click, so
nothing is stamped and an id cannot go stale when a heading is edited; in the
static export, which ships no JS at all, `documentBody()` stamps real `id`
attributes into a *clone*, never the editor, so nothing reaches Turndown.

Two traps came with it and are documented rather than merely fixed. `anchorSlug`
is deliberately not `slugifyTitle` — the filename slug strips non-ASCII and
truncates at 50 characters, so it would never match the link markdown-it wrote —
and the Ctrl+Click hint is a CSS variable drawn by `:hover::after`, never a
`title` attribute, because Turndown serialises a link title into the markdown and
would write the tooltip into the user's file. Also here: `hr: "---"` and a single
trailing newline on save. New `tests/links.test.mjs` and
`tests/save-fidelity.test.mjs`.

## 2026-08-15 — `09a0561` — The `(edited)` marker

A page load restores the document from autosave, never by re-reading the file, so
the two can drift apart. `file-api.js` gained `isDirty`, set from the editor's own
`input` event and persisted alongside the content, and the toolbar started saying
`plan.md (edited)`.

## 2026-08-15 — `9f0574d` — README: test instructions and dependency wording

## 2026-08-16 — `e7d7214` — A remembered directory that no longer exists

A remembered last-browsed directory outlives the folder it names: move or delete
it between sessions and every Open lands on an error about a path the user has no
way to correct from inside the dialog. It now forgets the directory and starts
from home instead, with exactly one retry — the second call passes no path, so a
failure there is the server rather than the folder. `POST /api/file` also stopped
creating directories: the remembered file path outlives its folder too, and
`mkdir -p`-ing the way there would rebuild a tree the user moved or deleted and
file the document somewhere they would never look.

## 2026-08-16 — `aa70963` — Format bar stays in the window, and Tab indents bullets

The format bar jumped because it was measured before `.visible` was added, and a
`display: none` element measures 0×0 — so the old code centred a zero-width bar,
with nothing to clamp against the right edge, and hung it 10px above the top of
the selection, with nothing to sit above, so it covered the text. Measurement
moved after the class, with a horizontal clamp 8px from either window edge and a
vertical flip below the selection when there is no room above — "room" measured
off the live `.toolbar`, because it is sticky and the stylesheet's 69px was a
magic number that went wrong the moment it wrapped.

Tab indenting arrived in the same commit. The guards are the substance: only
inside a list, since Tab is otherwise the way out of a contenteditable; never on
a first item; and Shift+Tab unnests without ever outdenting a top-level bullet
into a paragraph. Nesting is detected in both the spec shape and Chrome's sibling
shape. New `tests/list-indent.test.mjs`.

## 2026-08-16 — `3437817` — The Editable export names itself like the other three

It had been a bare timestamp, which named the document nothing at all and was the
one export inconsistent with the rest. It now slugs the document's own `h1`, with
`-editable-` in the name because the static export produces a filename of exactly
the same form and a recipient with both in their downloads has nothing else to
tell them apart by.

## 2026-08-16 — `9d98275` — Markdown saves preserve the file they came from

The big one. Turndown serialises to its own house style, so a save rewrote every
list, rule, emphasis and line break in the file — spec-legal on both sides, and an
unmergeable diff. `front/markdown-style.js` answers that from the source rather
than from a house style, in three layers, cheapest last: **sniff** the incoming
markdown for the conventions it already follows; **re-wrap** the serialiser's
one-line paragraphs back to the measured width, behind guards for fenced code,
tables and maths and against stranding a block marker at the start of a line; and
**restore** the original bytes for any segment whose text still matches, from an
index keyed on content rather than position — which is the whole trick, because a
source map into the DOM would have to survive contenteditable splitting a node on
Enter and merging two on Backspace, whereas a content key cannot go stale.

Two Turndown rules landed with it and are not optimisations. `table` exists
because Turndown 7 ships no table rule at all — GFM tables live in a plugin this
project does not carry — so a `<table>` fell through to the default and every cell
came back as its own paragraph: opening a file with a table and saving it
destroyed the table, unrecoverably, with nothing wrong on screen either side of
the save. `listItem` overrides a core rule so the pad and the numbering come from
the document instead of Turndown's hardcoded style. See **Decision 1** below for
why byte fidelity rather than rendering equivalence.

## 2026-08-17 — `e4e6ce6` — Reload from disk, split buttons, and disk-change detection

The document and the file can drift from either end, and until now only our end
was tracked. `fileMtime` records the mtime the file had when we last read or wrote
it; `GET /api/file?stat=1` answers with that alone and never reads the file, which
is what `checkDiskChanged` asks on every window `focus`, on `visibilitychange`,
and once at startup — a page load has already missed the `focus` event for the tab
it loads into. `POST` returns the mtime of what it just wrote, so a save
re-baselines from the reply; without that the next check would read our own save
as somebody else's edit. Both marks share one label: `plan.md (edited, disk
changed)`.

The flag has teeth in one place. `confirmOverwrite` re-stats before a save that
would write over the open file, because overwriting a file that moved on destroys
whatever moved it and Marky has no merge to offer. A Save As to any *other* path
is not gated on it — the baseline says nothing about a file we never read. Reload
arrived as the discard path as much as the refresh one, and is the one action that
confirms when there are edits to lose. Split buttons arrived to hold the pairs:
Open/Reload and Save/Save As.

## 2026-08-18 — `ed720cd` — Table padding survives a save

The `table` rule writes its own cell padding and its own three-dash delimiter, so
`|---|---|` and `| --- | --- |` are the same table and would never be the same
index key. `normaliseTableRows` collapses padding around pipes and the delimiter
row's dash runs before the key is taken — but only in a block that holds a
delimiter row, so a `---` rule and a paragraph containing a pipe both stay
literal. An untouched table now restores byte-for-byte. The TODO was restructured
for cross-referencing in the same commit.

## 2026-08-19 — `af9cc07` — Sort the metafiles into tasks, bugs and settled questions

TODO.md reorganised so that an item says what kind of item it is — a suggestion
nobody has ruled on, work waiting on other work, something fixed but not yet
watched happen in a browser — and `DECISIONS.md` created for the questions that
were argued out and settled. Both decisions it held are preserved at the end of
this file; the file itself was folded in here on 2026-08-22.

## 2026-08-19 — `338c1ce` — LaTeX escapes reach MathJax intact

markdown-it has no notion of maths, so `$…$` reached MathJax only by passing
through as text — with every inline rule applied to it en route. `\{` and `\}`
resolved as markdown escapes before MathJax ever saw them, and `$x = a*b*c$` came
back italicised with the asterisks gone. `mathSpan` and the `math` rule in
`app.js` now claim the span ahead of markdown-it's `escape` rule and re-emit the
source verbatim. Two things follow from where it sits: the rule runs before
`backticks` in the chain but positionally after it, so `` `$HOME` `` is still code
rather than maths; and it decides equation-versus-price on two heuristics — an
opening `$` is never followed by whitespace, a closing one never by a digit —
which `hasMathSpan` in `markdown-style.js` deliberately repeats, so the re-wrapper
and the parser cannot disagree about what is an equation.

## 2026-08-19 — `e212f1a` — De-emojified the README

## 2026-08-19 — `f921f64` — Toolbar height, inline code spaces, and two dedents

Three unrelated fixes. `.toolbar`'s `min-height` became a `calc()` over shared
custom properties instead of a hardcoded 69px, so it can no longer go stale when
the padding or font size changes. `docx-export.js` and `theme-manager.js` were
dedented from leftover six-space inline-`<script>` indentation to normal
top-level. And `shieldCodeEdgeSpaces` was added to `app.js` so inline code with
leading or trailing spaces — `` `> ` `` and the like — survives an HTML→Markdown
save instead of losing the space.

## 2026-08-20 — `470c1c5` — Document outline sidebar, with Insert TOC

The sidebar is chrome and lives **outside** `#editor`, and that is the whole
design: everything inside the editor is the document, so a self-updating table of
contents in there would rewrite a block of the user's file every time any heading
changed — and it is exactly the block that can never match the content-keyed
index, because a segment that changed is a segment that misses. Insert TOC is the
honest version of the same idea: it writes a nested markdown list once, and that
list is then ordinary content the author owns.

Depth comes from nesting, not from the heading level. People use headings as a
type scale, so a document may put three H6s under an H1 and follow them with an
H2; indenting by the number in the tag draws that as a five-deep staircase with
four empty rungs. `outlineDepths` runs a monotonic stack of the open levels
instead, so depth is bounded by the number of *distinct* levels in play. The two
visual channels are deliberately independent — indent is relative depth, type
scale is absolute level — so an inconsistent document reads as texture rather than
earning a warning nobody asked for.

## 2026-08-20 — `269054e` — TODO tidy

## 2026-08-22 — `cbf5559` — Replace `alert()`/`confirm()` with an in-app notify/ask module

`front/notify.js`: `notify(message, opts)` is a non-blocking toast, `ask(message,
opts)` a modal resolving to the chosen action's value. Fourteen call sites across
eight files converted, and `tests/notify.test.mjs` scans the sources so one cannot
slip back.

Why it was worth doing rather than living with: `alert()` blocks the page, ignores
the theme, and can say nothing but OK — but the one that forced it is that Chrome
and Firefox both let a user tick "prevent this page from creating additional
dialogs", after which every `alert()` in the app silently does nothing. A save
failure could reach nobody. Three decisions came out of it. Errors do not
auto-dismiss and everything else does, because having just argued that a
suppressible dialog is unacceptable, a four-second one the user was looking away
from is the same bug wearing a nicer hat. `ask()` takes an arbitrary action list
rather than a yes/no, which is the capability `confirm()` never had. And
dismissing is not agreeing: Escape, the backdrop and the close button all resolve
to a falsy default, because getting that backwards would let Escape overwrite the
user's file.

It also made toolbar dispatch asynchronous. Handlers sharing an action are now
awaited in turn, because `app.js`'s Clear stops mid-handler on a dialog and
`file-api.js`'s hook must not run until it resumes — without the await it would
see a document that is not blank yet and leave the file association behind.

## 2026-08-22 — `91fe24d` — Undo and redo on our own stack

`execCommand`'s undo stack is discarded by every assignment to
`editor.innerHTML` — open a file, paste markdown, clear, restore from autosave,
load the welcome document — after which Ctrl+Z silently stops answering for the
rest of the session. `front/undo.js` keeps the history instead, as whole-innerHTML
snapshots with the caret stored as a character offset, since a Range cannot
survive the nodes it points at being replaced. Snapshots rather than a diff
because contenteditable is not a data structure we control, and the failure mode
of modelling it wrong is a corrupted document.

The stack is fed by the editor's own `input` event, which covers typing, deleting,
IME, cut, native paste and every execCommand the format bar runs, so the only call
sites that had to change are the ones that *replace* the document. Those call
`undoReset()`, and that is a deliberate line: history does not cross a document
boundary, because undo handing back the previous file's text would leave it under
the new file's path, one Ctrl+S from being written there. Consecutive edits of the
same kind coalesce inside 600ms, so a typed run is one step, but Enter, a format
button and a programmatic edit each earn their own. Insert TOC became undoable
with no change to `outline.js` at all — it already dispatched a synthetic `input`
event for autosave's benefit, which is exactly what the stack listens to.

## 2026-08-22 — `20b0280` — Replace the button row with a menu bar

Sixteen buttons across two wrapping rows became six words — File, Edit, Insert,
Format, View, Export — with 24 items behind them, fitting one line at 375px where
the row needed three. `TOOLBAR_GROUPS` became `TOOLBAR_MENUS` and `toolbar.js` a
menu renderer over it; the split-button mechanism went with the row. The menus
gained what the row had nowhere to put: Undo and Redo, all nine of the format
bar's formats, and keyboard shortcuts shown beside the labels.

Two consequences that were not in the plan. Every piece of in-button feedback had
to move — "Saved!", "Reloaded!", "Copied!" and both export spinners lived on
buttons that are now menu items, and a menu closes on the click, so all five
became toasts. And `--toolbar-height` turned out to have been describing the wrong
thing all along: the aside had always been taller than the button row, so the
reserved height was short and the page jumped on every load.

The bar then became two rows — the menus, then a document row holding the filename
and the theme toggle, which is where the tab bar goes — and lost the things that
were only taking up space: the `<h1>` reading "Marky Markdown Editor", which
repeated what the browser tab says and was the page's only `h1` when that belongs
to the document, and the GitHub link, which pointed away from the app from a bar
that is about the document. An exported document has neither a file on disk nor a
theme toggle, so it gets one row and a shorter reservation, stamped by its own
inline script before the stylesheet is read. The theme toggle gained a tooltip
that moves with the theme, being the only control left in the bar that is not a
word.

## 2026-08-23 — One door for execCommand, and a browser check behind it

[front/execcommand.js](front/execcommand.js) arrived: `runCommand` is now the
only place in `front/` that calls `document.execCommand`, and a source scan in
the new `execcommand` suite keeps it that way. It sets `styleWithCSS` off once
at load, runs the command, and normalises what the engine left behind.

`styleWithCSS` had never been set. Its default was never specified and is
per-browser, so which of tags-or-styled-spans Marky got was whatever the engine
felt like — and Turndown has no rule for `<span style="font-weight:bold">`, so it
drops the span and keeps the text. Bold would have disappeared on save with
nothing wrong on screen until the file was reopened.

The normalisation covers what markdown cannot absorb, which is a shorter list
than it sounds: `<b>` and `<strong>` are both `**bold**`, so most of what the
engines disagree about never reaches the file. What does: styled spans and
`<font>` retagged to `<strong>`/`<em>`/`<del>` or unwrapped, sublists moved
inside the item they belong to, headings and paragraphs unwrapped from around a
list, an `<li>` nested in an `<li>` made its sibling, and Chrome's `id="null"`
stripped off a rule. Mermaid, MathJax, `<pre>` and `<code>` subtrees are never
touched — each holds the only copy of its own source.

`undoRefresh()` in undo.js is new and exists for one caller. execCommand
dispatches `input` synchronously, so the undo stack has already snapshotted the
un-normalised document by the time `runCommand` gets to fix it. Refreshing
corrects that snapshot in place; dispatching a second `input` would instead make
one action cost two Ctrl+Z, the first of which would appear to do nothing.

**[tests/browser-check.html](tests/browser-check.html) is new, and it is why any
of the above says anything specific.** The Deno suite has no editing engine, so
it can only assert what Marky does with execCommand's output and never what that
output is — that half was always going to be manual. The page runs the real
commands in a real contenteditable and reports the markup before and after
normalisation. Measured in Chrome 139 and Firefox 154, it moved the cases that
produce byte-identical markup in both engines from 6 of 11 to 8 of 11.

Two things everyone knows about execCommand turned out to be false:

- **Neither engine emits styled spans** for bold or italic with `styleWithCSS`
  off. Both give `<b>` / `<i>`. The content-losing case is closed by the one
  line, and the retagging is a backstop for pasted markup rather than the fix.
- **The list-nesting bug is in both engines**, not Chrome's alone. The comment in
  app.js had claimed it for Chrome since it was written; it now says what was
  measured.

It also found a live bug. In Chrome, `formatBlock` run with the caret inside a
bullet wraps the *entire list* in the heading — `<h1><ul>…</ul></h1>` — so
pressing H1 in a list destroyed the list. That is reachable from a shipped
button and is now normalised away.

Three divergences survive and are recorded in TODO 5.1 rather than papered over.
The sharpest is Firefox's: outdenting a nested bullet merges it into the item
above as `<li>one<br>two</li>` instead of making it a sibling, which loses a
bullet. It cannot be normalised — that markup is indistinguishable from a
deliberate hard break in a list item — so it needs a real fix.

## 2026-08-23 — Code formatting tells a span from a block

Two bugs in `format-bar.js`, both of which came from the same missing idea: that
the *extent* of a selection means something.

**Inline code exists now.** Selecting two words and pressing Code turned the
entire paragraph into a fenced block, because Code had only one output. Markdown
has two constructs here and the button reached one of them, so half the format
was unreachable from the UI. `coversWholeBlocks` decides between them: a partial
selection gives `<code>`, a whole block or several gives `<pre><code>`, and a
bare caret counts as the whole block — every other block format acts on a whole
block from a caret, and Code demanding a selection first would read as broken.
Pressing Code inside an existing span unwraps it, so it is a toggle rather than a
one-way conversion.

**`blocksInRange` stops answering with `editor.children`.** A selection inside a
single bullet reported the whole `<ul>`, and Code then replaced the list with one
`<pre>` holding every item run together — destructive, and unrecoverable except
by undo. It walks to the innermost block now, which is the `<li>` the text is in,
and filters nested lists down to the items that hold no others.

A `<pre>` still only ever stands in for a direct child of `#editor`, since one in
place of an `<li>` is invalid markup and the nested-fence version is a separate
feature. A whole bullet therefore falls back to inline; a selection spanning
several bullets declines with a toast, because inline across a block boundary
would have `deleteContents` take the list apart to build a code span markdown
cannot write.

Two things found while in there. The Code branch raised no `input` event, being
the only hand-rolled format — so a code block was invisible to undo and left the
`(edited)` marker unset. And Ctrl+Shift+P is now gated on the PDF item existing,
which it was not before the export set shrank.

Settled while deciding the first of these: **p / h1 / h2 / h3 act on the whole
block from a partial selection, by design.** There is no such thing as half a
heading, `formatBlock` already behaves this way, and the alternative — disabling
them unless the selection covered a whole line — would read as a broken button
rather than a precise one. Code is the only format that reads the extent, because
it is the only one with an inline counterpart to read it for.

## 2026-08-23 — The editable export is a nerfed Marky

PDF and Word left the exported document: `pdf-export.js` and `docx-export.js`
dropped out of `ASSETS`, and their menu items became `variants: ["app"]`. An
exported file now offers markdown, HTML and Editable, and is 12% smaller for it
— about 26KB of JavaScript that was inlined into every copy.

The reasoning is what the export *is*. It ships an editable document, and the
application around it is the means rather than the deliverable, so a module earns
its place by extending the chain the export exists to keep going. Markdown, HTML
and Editable all do: a recipient can open one, edit it and pass it on. PDF and
Word are terminal — nobody edits a PDF and sends it back — so both were weight in
every copy, in service of producing artifacts that can never be exported *from*.

The two halves have to move together, and the suites enforce that from opposite
directions: the toolbar suite fails if an item is rendered whose script the
variant does not ship, and the self-reproduce suite fails if the bundle carries a
script no item reaches. Ctrl+Shift+P is now gated on the PDF item existing, the
way Ctrl+S and Ctrl+O already were, so it no longer swallows the browser's own
binding in a document that cannot answer it.

`ensureHtml2Pdf` and `ensureDocx` stay in `lazy-load.js`, which is shared and has
no variants — unreachable in an export rather than absent from it.

## 2026-08-23 — Invisible whitespace, and the unsaved-work guard

Three TODO items, two of which turned out to be one.

**U+00A0 and empty wrappers no longer reach the file.** A browser rewrites a
trailing space in an edited `contenteditable` text node to a non-breaking space,
so the character appears in documents nobody typed it into. It is invisible, it
copies into other applications as a space, and find-in-page matches it *against*
a space — so searching "hello world" cheerfully finds the "hello\u00a0world" the
user then has no way to locate or delete. `normaliseNbsp` in `app.js` converts
both spellings before Turndown parses, which also fixed the second half of the
same bug: the code-span shield tested for a literal space and so never saw an
NBSP at the edge of a span, while Turndown's own edge-trim did see it (JS `\s`
matches U+00A0) and moved the character outside the backticks and into the file.
One conversion closed both doors, which is why the two items landed together.

**Pasted HTML is sanitised on the way in.** `sanitisePastedHtml` drops empty
`<span>`/`<b>`/`<i>` wrappers and the blank `<p>`/`<div>` blocks that render as a
~1px line and space bullets unevenly. Deliberately targeted rather than the
round-trip through markdown the TODO had proposed: pasting a web page should keep
its bold, its links and its tables, and only what nobody can see should go. The
one rule with any subtlety is the asymmetry over `<br>` — a block whose only
content is one *is* the ghost line, which is exactly the markup Word and Docs
emit for a blank one, while inside an inline element the same tag is a real break
in a real line and saves its parent.

**Every way out of a dirty document now offers to save it.** `confirmDiscard` in
`file-api.js` is the one guard behind Open, Reload and Clear. Open replaced the
document with no check at all while Reload guarded the identical call, and Clear
asked a question whose wording read the same whether it was about to discard an
untouched welcome document or an hour of work. All three ask once, name the file,
and offer Save / Discard / Cancel — the three-way choice `ask()` was built for
and `confirm()` could not express. Dismissing resolves to cancel, never to
discard. The overwrite guard gained a third button of its own, Save as…, which is
the only answer to "your file changed underneath you" that does not require
somebody's work to be thrown away. `beforeunload` is the one that cannot use
`ask()`, since the browser will not wait on a Promise, so it sets `returnValue`
from the dirty flag and takes the browser's own wording.

An exported document ships no `file-api.js` and has no file to be dirty against,
so it gets the plain question rather than a second implementation of the guard.

## 2026-08-24 — The dirty flag follows undo

TODO 1.10. `file-api.js` latched `isDirty` true on the editor's `input` event
and never unlatched it, so undoing an edit back to the document as it was at
the last save still left the toolbar claiming it was edited — the one lie the
flag exists to prevent, reintroduced by the one feature that should have been
immune to it.

Fixed with position equality rather than content equality, the cheaper of the
two the TODO weighed. `undo.js` now mints a monotonic id per state
(`undoNextId`, read back via `undoPosition()`) rather than reusing a stack
index — `UNDO_LIMIT` shifts the stack once it fills, so an index would end up
naming whatever slid into that slot instead of the state that was actually
there, where an id minted once and never reused cannot. Undo and redo hand
back the snapshot's existing id rather than minting a new one, so returning to
a position by undoing is indistinguishable from never having left it. Every
moment the document and its origin come back into step — open, reload, save,
clear — now calls `markClean()` in `file-api.js`, which records that id as
`cleanPosition`; the `input` listener that used to just set the flag now
compares the current position against it instead.

It differs from content equality on one case, on purpose: type a character and
Backspace it, and the position has moved on even though the text is back to
what it was, so the document still reads dirty. Content equality would need a
second copy of the document compared on every keystroke — `markdownSource`
already holds enough to do that after a reload, where undo's own history does
not survive to compare positions against, but doing it continuously is future
work rather than this fix.

A document that carries unsaved edits across a reload has no position to
return to either, for the same reason — undo's stack does not survive one — so
`initUndoBaseline()` only records a clean position at startup when the
restored flag says there is nothing unsaved; otherwise the document stays
dirty until the next real save, same as before this landed.

## 2026-08-24 — The file-server liveness check runs more than once

TODO 5.4. Open/Save/Reload/Save As used to be disabled by a single probe of
`/api/home` in a startup IIFE, and never touched again. A server that died
mid-session left them claiming it was still there, so the next click failed
with a `notify` instead of finding a disabled button; a server brought up
after a dead start left them disabled until a full reload, for no reason the
page itself needed one.

`checkServerAvailable()` in `file-api.js` replaces the IIFE and now runs again
on `window focus` and `visibilitychange` — the same wake points
`checkDiskChanged` already used for the weaker question of whether the open
file changed underneath the app, reused here rather than standing up a second
listener pair. It could not simply be folded into `checkDiskChanged` itself:
that function only runs with a file open (`currentFilePath && fileMtime`), and
liveness has to be checked with none open too — a fresh install, the welcome
document, a file opened before the server died. `setServerAvailable(bool)` is
the part that had to change shape rather than just get called more often: the
original only ever disabled, so it became idempotent in both directions,
guarded the same way `setDirty`/`setDiskChanged` are against writing the DOM
when nothing changed.

## 2026-08-24 — Paste Markdown inserts instead of replacing

TODO 1.8. `onToolbarAction("paste-md")` assigned `editor.innerHTML` outright —
a leftover from the serverless model, where replacing the document from the
clipboard was the closest thing to an Open there was. There is a real Open
now, and no editor anywhere ships a "replace everything from the clipboard"
command under a Paste label; wanting the replacement is Clear followed by
Paste, two deliberate actions rather than one surprising one.

It now goes through `runCommand("insertHTML", html)` — the execCommand door
every other paste in the app already uses — rather than through the
`undoReset()`-or-synthetic-`input` choice every other document-replacing site
has to make. execCommand raises `input` for free, so undo, autosave and the
dirty flag pick it up exactly the way a real paste does, with nothing to wire
up by hand. It also means Paste Markdown is no longer an `editor.innerHTML`
assignment site at all: the `undo` suite's count of them dropped from six to
five, catching a regression to the old behaviour the same way it catches a new
site skipping the choice.

## 2026-08-24 — The format bar reads the whole selection, not just where it started

TODO 3.1. `updateActiveButtons` walked up from `selection.anchorNode` alone,
so which end of the drag the browser happens to call the anchor decided
whether Bold lit up — select a run spanning bold and plain text and the
button's state depended on where the selection started, not on what it
actually covered. Neither "on" nor "off" was true of a mixed selection, and
the button could only ever say one of them.

`updateActiveButtons` now collects every non-blank text node the range
touches (`textNodesInRange`, walking down from `#editor` and filtering on
`range.intersectsNode`) and asks each of nine `FORMAT_PREDICATES` — one per
format-bar button — whether *all*, *some*, or *none* of them carry it
(`formatState`). All keeps the button `.active`, same as before. Some is new:
`.mixed`, styled outlined rather than filled so it reads as its own state
rather than a paler `.active`. Per-text-node is the right granularity to ask
at without a real editing engine to drive: a single text node's own
formatting cannot be partial, which is also what makes this cheaply testable
in the Deno suite — a stub range's `intersectsNode` just names which nodes are
"touched," and `tests/format-bar.test.mjs` builds the mixed/all/none trees
directly rather than simulating a drag.

## 2026-08-24 — Reference-style links survive a save

TODO 2.1. `[text][label]` and `[text](url)` resolve to the identical
`link_open` token once markdown-it has parsed them — same href, same title,
nothing left downstream to say which syntax the author wrote — so every save
rewrote every reference link as inline and dropped its `[label]: url`
definition on the floor, unrecoverably. A document citing one URL twenty
times over a reference arrived with one definition and would have left with
twenty copies of the same link.

Same two-part shape as Mermaid and LaTeX: stash what parsing destroys, read
it back at serialise time. `referenceAwareLink` in `app.js` replaces
markdown-it's own inline `link` rule (`md.inline.ruler.at("link", …)`) with a
near-verbatim copy of markdown-it 13.0.1's own that stamps a reference link's
element with the raw label it resolved through — copied rather than
reimplemented, the same reasoning as D4's for execCommand, since label
matching has its own escaping and nesting rules that
`state.md.helpers.parseLinkLabel` already gets right. `scanReferenceDefinitions`
separately reads the raw markdown for `[label]: destination "title"` lines
and keys their exact source text by label, run alongside the existing style
sniff and block index in `adoptMarkdownStyle` so it shares their lifecycle.
The new `referenceLink` Turndown rule reads the stamp back, confirms the scan
still has that label, and writes `[text][label]`; `appendReferenceDefinitions`
appends each label a save actually used — never a regenerated line, always
the exact original bytes — once at the end of the document. A label used
twice gets one definition; a label nothing points at any more gets none.

Two things this does not reach, both because a definition has no DOM node to
carry information on: one spanning more than one line is invisible to the
scan, and an edited or freshly-written reference — including every `[text][]`
or bare `[text]` shortcut, since the rule always writes the explicit form —
falls out of the byte-for-byte segment restore the same way any edited
paragraph does. Neither loses the link or the definition, both just cost the
perfection an untouched, already-explicit reference gets for free.

Verified against a real markdown-it in the running app rather than only the
Deno suite: the custom inline rule is parser-internal logic the suite's
pass-through Turndown stub cannot exercise, the same gap `tests/browser-check.html`
exists for on the execCommand side. `tests/save-fidelity.test.mjs` covers the
half that is pure string work — the scan, the append, and the Turndown rule
driven directly the way `mathjax`/`mermaid` already are — and
`tests/dom.mjs`'s `markdownitStub` gained `inline.ruler.at` and
`utils.normalizeReference`, plus a fix to its `TurndownService` stub, which
never actually exposed `this.options` and so had never been caught calling
`adoptMarkdownStyle` before now.

This changelog was written, `DECISIONS.md` was removed and its two decisions moved
to the end of it, and TODO.md dropped the seven retired entries it had been
carrying and renumbered what was left. That last one reverses a rule the TODO used
to state — retire a number rather than renumbering, because renumbering breaks
every reference to it — so the references were chased down and updated across
`CLAUDE.md`, `front/app.js`, `front/toolbar.js`, `front/undo.js` and
`tests/toolbar.test.mjs`. What was fixed is recorded here now, which is why the
TODO no longer has to carry it.

---

## 2026-08-25 — A fenced code block inside a list item (TODO 1.1)

The one gap `coversWholeBlocks` left: a whole bullet used to fall back to
inline `<code>`, because a `<pre>` in place of the `<li>` is invalid markup.
The honest version — a fence nested *inside* the item — was already known to
round-trip byte-identically through markdown-it and Turndown, including a full
pass through `normaliseEditorMarkup` and `restoreSourceWrapping`; what was
missing was purely the editing side.

`toggleCode` now special-cases a single, wholly-selected `<li>`: it clears the
item's own content and appends a `<pre><code>` rather than replacing the item,
which stays a direct child of its `<ul>`/`<ol>` the whole time. Toggling back
reverses that in kind — the `<pre>` comes out and the item's text returns
directly, with no `<p>` wrapper, since a bullet never had one. That is a
different revert than the top-level case (`<pre>` swapped for a `<p>`), so the
two now branch on whether the `<pre>`'s parent is an `<li>`.

Multiple bullets selected together, or a partial selection inside one, are
unaffected — those already had their answers (decline with a toast; inline
code) and still do.

---

## 2026-08-26 — Firefox no longer loses a bullet on outdent (TODO 5.1)

The one execCommand divergence TODO 5.1 called out as having teeth: Shift+Tab
on a nested item merged it into the item above in Firefox
(`<li>one<br>two</li>`) instead of unnesting it, silently costing a bullet with
no way back. It could not be normalised after the fact — that markup is
indistinguishable from a deliberate hard break inside a list item — so it
needed a real fix rather than a repair.

`outdentListItem` in `app.js` does the move by hand instead, in both browsers:
`execCommand("outdent")` is no longer called for this case at all, since
neither engine's output was trustworthy enough to build on. The item leaves its
`<ul>`/`<ol>` and becomes a sibling of the `<li>` it was nested under; anything
that followed it in the old list moves with it, becoming its own nested
sublist, the same way outdent behaves everywhere else rather than stranding
those items under the old parent. Chrome's own sibling-nesting shape (the
nested list beside its item rather than inside it, same as `isNested` already
watches for) is folded back to the spec shape first, defensively — normal use
never produces it here since indents already go through normalisation, but
pasted content could. The caret is restored explicitly and a synthetic `input`
event raised, since bypassing execCommand also bypasses the event it raises for
free.

`tests/list-indent.test.mjs` now drives the resulting DOM shape directly rather
than asserting an execCommand name that no longer gets called, and
`tests/dom.mjs` gained the handful of primitives that needed — `nextSibling`,
`nextElementSibling`, `document.createRange`, and `removeAllRanges`/`addRange`
on the stub selection.

## 2026-08-26 — Strikethrough and horizontal rule (TODO 1.4)

Two of the formats TODO 1.4 already knew were cheap: the browser check had
already confirmed `strikeThrough` and `insertHorizontalRule` produce identical
markup in both engines, so neither needed anything from `execcommand.js`
beyond the command itself.

Strikethrough needed one more thing first — Turndown ships no rule for it
either, the same gap the `table` rule exists to close, since GFM strikethrough
lives in `turndown-plugin-gfm` and this project carries neither that plugin
nor a substitute. Without a rule, `<s>`/`<del>`/`<strike>` fell through to
Turndown's default and the text saved back with the formatting silently
dropped. `app.js` now carries a `strikethrough` rule wrapping the content in
`~~…~~`; parsing `~~text~~` back in already worked, since markdown-it's
strikethrough rule is core rather than a plugin.

Both landed through all three registries a new format-bar control or menu
item touches: `format-bar.js` (predicate, `applyFormat` case, the
bar-stays-open list, the menu-registration loop), `toolbar.js`
(`TOOLBAR_MENUS`), and the button markup in both `index.html` and
`html-export.js`'s hand-written copy of the format bar. Horizontal rule only
needed the last two, plus a one-line `onToolbarAction` handler in `app.js` —
it has no toggle state to track, so it lives in Insert rather than the format
bar. `CLAUDE.md`'s format counts (ten now, not nine) and the menu-item count
(26, not 24) were updated alongside it, and TODO 1.4's missing-formats list
dropped both.

## 2026-08-26 — New and Clear are two different weights now (TODO 4.3)

Clear was doing two jobs under one name. `onToolbarAction("clear")` in
`app.js` emptied the editor, dropped the autosave, the sniffed style and the
reference-definition map, and reset undo — and `file-api.js`'s own `"clear"`
hook piled the file association on top (`setFileMtime(null)`,
`setCurrentFile(null)`), on the theory that an empty document should not still
claim to be `notes.md`. That is the right behaviour for starting a document
over, and the wrong one for emptying the document you have open, which should
read like Ctrl+A then Delete: the content goes, the file you're editing, its
undo history and its autosave don't.

The one action split into two. **New** took over Clear's old weight
outright — same guarded dialog, same full reset, same `file-api.js` hook,
renamed rather than rewritten — and **Clear** became an ordinary edit: select
the editor's contents and delete them through `runCommand`, which raises
`input` the same way typing does, so it undoes as one step and needs no
dialog of its own. The selection is built with `Range.selectNodeContents`
rather than `execCommand("selectAll")`, because a menu click can land here
with focus nowhere near the editor — selectAll scopes to wherever focus
already is, and nothing guarantees focus was ever inside `#editor` this
session; `selectNodeContents` pins the range regardless. Clear no longer
touches `file-api.js` at all, since nothing it does can point a filename at
the wrong content.

The weight split reads in the menu placement too: New leads the File menu
([toolbar.js](front/toolbar.js)'s `TOOLBAR_MENUS`), the way New/Open leads in
every other editor, while Clear moved to Edit, beside Undo/Redo and Copy/Paste
markdown, since an ordinary edit is what it now is. `tests/toolbar.test.mjs`'s
shortcut-label check had assumed the File menu's first item was Open; it now
finds Open by its action rather than by position, so a future menu reorder
cannot silently break it the same way. Every comment across `app.js`,
`file-api.js`, `toolbar.js`, `undo.js` and `outline.js` that named Clear as
the document-replacing action now names New instead — the MutationObserver
outline rebuild, the `undoReset()` doc comment, the unsaved-work guard's own
description of itself — since Clear stopped being one. `tests/file-path.test.mjs`'s
`clear()` helper became `newDocument()` and every assertion it drove moved
with it, and a new block confirms Clear now asks nothing and leaves the file
association alone — the exact thing that suite exists to catch drifting back
together. `tests/dom.mjs`'s stub gained nothing new; `tests/undo.test.mjs`'s
site-count comment was relabelled, not the count itself, since renaming an
action is not adding an `editor.innerHTML` assignment site.


## 2026-08-26 — TODO, DECISIONS and ROADMAP move into `docs/`

The 2026-08-24 entry above folded `DECISIONS.md` into this file on the theory
that decisions were few enough to live at the end of it. Four more landed
since — D2, D3 and D4 among them — and the fold stopped paying for itself: a
changelog is history, read newest-first in spirit even though it is filed
oldest-first, and a reader after "what changed recently" had to scroll past a
standing rationale document to get out the bottom. `docs/DECISIONS.md` is
back, holding D0 through D4 verbatim.

The split surfaced a real gap while it was happening: D4 ends with "On Marky
2.0", a sketch of the editor rewrite that would retire it — and that paragraph
was never a decision or a piece of history, it was a plan with nowhere to
live. `docs/ROADMAP.md` is new for exactly that: what comes after 1.0, as
opposed to `docs/TODO.md`'s what stands between here and 1.0. It opens with the
Marky 2.0 sketch, and TODO 6.2 (more export options) and TODO 6.3 (the
"collaborative" framing not holding up) moved in beside it — neither was ever
work that blocks 1.0, they were just filed in the only list that existed at
the time.

Four files now say four different things, on purpose: TODO is *what is left*,
DECISIONS is *why*, CHANGELOG is *what changed*, ROADMAP is *what's next*. The
first three moved into a new `docs/` directory in the same pass — CHANGELOG
stayed at the root, alongside README and CLAUDE.md, since a changelog is the
kind of file people expect to find without going looking. Every `D0`–`D4`
cross-reference pointing at "CHANGELOG.md" was chased down and repointed at
`docs/DECISIONS.md` — `CLAUDE.md`, `docs/TODO.md`, `front/execcommand.js` —
and every bare mention of `TODO.md` in `front/` picked up the `docs/` prefix
too. TODO 6.1's own note that it wants to run after 6.3 now points at the
collaboration question in `docs/ROADMAP.md` instead, since 6.3 no longer
exists to point at. Nothing was renumbered — 6.2 and 6.3 simply stop
appearing, the way any finished item's number does, available to be reused
for something unrelated later exactly as `docs/TODO.md`'s own rule already
allows.
