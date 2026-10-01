# Changelog

Everything done to Mandy since it was forked. The fork point is `a01ba0d`
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
whatever moved it and Mandy has no merge to offer. A Save As to any *other* path
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
were only taking up space: the `<h1>` reading "Mandy Markdown Editor", which
repeated what the browser tab says and was the page's only `h1` when that belongs
to the document, and the GitHub link, which pointed away from the app from a bar
that is about the document. An exported document has neither a file on disk nor a
theme toggle, so it gets one row and a shorter reservation, stamped by its own
inline script before the stylesheet is read. The theme toggle gained a tooltip
that moves with the theme, being the only control left in the bar that is not a
word.

## 2026-08-23 — `c66d7a5` — One door for execCommand, and a browser check behind it

[front/execcommand.js](front/execcommand.js) arrived: `runCommand` is now the
only place in `front/` that calls `document.execCommand`, and a source scan in
the new `execcommand` suite keeps it that way. It sets `styleWithCSS` off once
at load, runs the command, and normalises what the engine left behind.

`styleWithCSS` had never been set. Its default was never specified and is
per-browser, so which of tags-or-styled-spans Mandy got was whatever the engine
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
it can only assert what Mandy does with execCommand's output and never what that
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

## 2026-08-23 — `c66d7a5` — Code formatting tells a span from a block

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

## 2026-08-23 — `58d4dca` — The editable export is a nerfed Mandy

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

## 2026-08-23 — `21d9699` — Invisible whitespace, and the unsaved-work guard

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

## 2026-08-24 — `aaa42a6` — The dirty flag follows undo

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

## 2026-08-24 — `f18bea8` — The file-server liveness check runs more than once

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

## 2026-08-24 — `5125a43` — Paste Markdown inserts instead of replacing

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

## 2026-08-24 — `0f23b0a` — The format bar reads the whole selection, not just where it started

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

## 2026-08-24 — `0f23b0a` — Reference-style links survive a save

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

## 2026-08-25 — `2e05e10` — A fenced code block inside a list item (TODO 1.1)

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

## 2026-08-26 — `7bf7172` — Firefox no longer loses a bullet on outdent (TODO 5.1)

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

## 2026-08-26 — `7a5968c` — Strikethrough and horizontal rule (TODO 1.4)

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

## 2026-08-26 — `362c30f` — New and Clear are two different weights now (TODO 4.3)

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


## 2026-08-26 — `f316439` — TODO, DECISIONS and ROADMAP move into `docs/`

The 2026-08-24 entry above folded `DECISIONS.md` into this file on the theory
that decisions were few enough to live at the end of it. Four more landed
since — D2, D3 and D4 among them — and the fold stopped paying for itself: a
changelog is history, read newest-first in spirit even though it is filed
oldest-first, and a reader after "what changed recently" had to scroll past a
standing rationale document to get out the bottom. `docs/DECISIONS.md` is
back, holding D0 through D4 verbatim.

The split surfaced a real gap while it was happening: D4 ends with "On Mandy
2.0", a sketch of the editor rewrite that would retire it — and that paragraph
was never a decision or a piece of history, it was a plan with nowhere to
live. `docs/ROADMAP.md` is new for exactly that: what comes after 1.0, as
opposed to `docs/TODO.md`'s what stands between here and 1.0. It opens with the
Mandy 2.0 sketch, and TODO 6.2 (more export options) and TODO 6.3 (the
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

## 2026-08-26 — `323fcca` — TODO audited against 1.0, six items moved to ROADMAP

The `docs/` split gave the four files four jobs, and this is the first pass
that actually held TODO.md to its own: *what stands between here and a finished
1.0*, nothing else. Read end to end with one question asked of every item —
does full-time use of Mandy wait on this — six answered no.

Moved as-is: **5.2/5.3** (no module system, load order still load-bearing),
where nothing a user does touches it and the Mandy 2.0 rewrite settles it
either way; **2.4** (block-level segment granularity), whose own text says the
finer version is "a different and much less safe algorithm"; and **2.2** (the
source persisted as a second copy in `localStorage`), which 4.1 had quietly
defused already — once tabs settled on *no budget, no eviction, no per-tab cap*
for its own 2N copies, shrinking the per-document footprint is an optimisation
against a wall nobody has hit rather than a fix. The two save-fidelity items
went into one ROADMAP section that says so out loud: both refine a system that
already works, and D1 holds today.

Moved as concepts, where the item was really a feature in disguise. **4.2** —
the static export's TOC following the outline sidebar's toggle — always
answered itself with "the right home is a Settings pane, which does not exist";
that pane is now a ROADMAP entry with the two preferences that want it, and the
coupling stays documented in CLAUDE.md. **1.5's third bullet** — PDF has no
live links, and needs a different PDF path, which is to say a different
library — folded into *More export options*, which is the decision it was
waiting on anyway.

**1.6 was deleted rather than moved.** A source view had sat as *(undecided)*
since it was filed, and D0 already refuses it at length — a source pane with a
live rendering is still a person editing markup. Parking it in ROADMAP would
have kept alive an idea the project's founding decision rules out, so the
closure went into D0 itself, which is where DECISIONS.md says a reopened
question belongs. It mattered more than a tidy-up: **1.4's header offered 1.6
as the escape hatch for table editing** (*"tables also need 2.3, or 1.6
instead"*), which pointed the most urgent item in the file at the one answer D0
forbids — the reason a table cannot be edited structurally is that the editing
surface is missing, and answering that with "type the pipes yourself" hands
back exactly the work this project exists to take off the user.

**5.1 dissolved into 1.4 except for what is genuinely unverified.** Its first
divergence — Firefox losing a bullet on outdent — landed on 2026-08-26 and the
item had not noticed. It is not deleted, because *tested* and *verified* are
not the same thing here: `tests/list-indent.test.mjs` drives four DOM shapes
plus the synthetic `input`, and that is real cover since bypassing execCommand
makes the logic ours rather than an engine's — but it is also exactly why
`tests/browser-check.html` cannot confirm it, as the check page measures what
execCommand produces and this path no longer calls it. Nobody has watched
Shift+Tab unnest a bullet in a real Firefox. So 5.1 became the file's first
*(fixed, unverified)* item, a marker the legend had been documenting with no
user, and it keeps the standing re-run instruction. The other two divergences
were already marked "deferred to 1.4" and moved there in full, since both are
questions about what a block control does when a list is involved.

**6.1 stopped being unstartable.** It wanted the collaboration question settled
first — a 1.0 item waiting on an explicitly unscheduled post-1.0 one, which it
could never get. ROADMAP already supplies the honest description of what ships
today (send-for-review, one hop), so the README rewrite can say that now and
change later if real collaboration ever lands.

Four stale cross-references fell out of the audit. D1's table still listed
reference-style links as *bug — TODO 2.1* eleven days after they were fixed and
2.1 left the file; the row now says what actually happens, alongside a new one
for the residual cost (an edited `[x][]` or bare `[x]` saves as the explicit
`[x][1]`, since the collapsed forms have no DOM node to survive on). D1 also
still named `TODO.md` at its pre-`docs/` path, and `tests/browser-check.html`
still pointed at "Decision D4 in CHANGELOG.md" — both missed by the move that
created `docs/`. CLAUDE.md's execCommand section still opened "Three
divergences survive it" and named the outdent bug as the one to know about.

TODO.md is 11 items from 15, and every one of them is markdown support, tables,
tabs, stability or the README.

## 2026-08-26 — `323fcca` — TODO items renumbered to close the gaps

The audit above left section 1 running 1.4, 1.5, 1.7, 1.9, 1.10, 1.11 and
section 2 holding a lone 2.3 — every gap a scar from an item that had been
finished or moved. The numbers are labels rather than an order, so the gaps
cost nothing except the constant suggestion that something is missing.

| Was | Is | |
| --- | --- | --- |
| 1.4 | **1.1** | the markup the UI cannot author yet, tables worst |
| 1.5 | **1.2** | the two remaining link gaps |
| 1.7 | **1.3** | paste without formatting, and the Edit menu reorg |
| 1.9 | **1.4** | invisible whitespace the cleanup does not reach |
| 1.10 | **1.5** | no format bar at a bare caret |
| 1.11 | **1.6** | no search-and-replace |
| 2.3 | **2.1** | an edited table re-emitted in house style |
| 6.4 | **6.2** | Mermaid keeps the light palette in the static export |

4.1, 5.1 and 6.1 were already the first of their sections and did not move.
Section 3 stays empty rather than being closed up: sections are categories, not
queue positions, and renaming *Interface* from 4 to 3 would shift every item
under it for no gain.

References were chased down in the same commit, as `docs/TODO.md`'s own rule
requires — `CLAUDE.md`, `docs/DECISIONS.md`, `docs/ROADMAP.md`,
`front/app.js`, `front/execcommand.js`, `front/format-bar.js` and
`tests/browser-check.html`. The rewrite was a single pass over each file rather
than one replacement per number, because 1.4 → 1.1 and 1.9 → 1.4 would
otherwise tread on each other. It also needed watching: a naive `\d+\.\d+`
sweep caught the `font: 14px/1.5` line-height in `tests/browser-check.html` and
turned it into `14px/1.2`, which is the kind of edit that lands silently and
reads as a styling tweak six months later.

This changelog is history and keeps the numbers it was written with. Entries
above this line mean the items as numbered at the time — most visibly the
2026-08-25 entry titled "(TODO 1.1)", which is the fenced-code-in-a-list-item
work and has nothing to do with today's 1.1.

Two pointers left dangling by the ROADMAP moves surfaced while renumbering, both
inside 4.1: its note that the sniffed source is already a second copy of the
document pointed at the retired 2.2, and its aside about edit/preview/source
tabs pointed at the deleted 1.6. They now point at ROADMAP's save-fidelity
section and at D0 respectively.

## 2026-08-28 — `7a8876c` — Shift+Tab watched in three engines, and the bug that was waiting there (TODO 5.1 closed)

TODO 5.1 had been the file's one *(fixed, unverified)* item since 2026-08-26:
`outdentListItem` stopped calling `execCommand("outdent")` and did the move by
hand, and nobody had watched it happen. The checking is done, and it was worth
doing — it found a second bug in the same function.

The verification needed a page of its own.
[tests/browser-check.html](tests/browser-check.html) could not answer this one,
for the reason 5.1 gave: it measures what execCommand *produces*, and this path
deliberately no longer calls execCommand. So
[tests/list-indent-check.html](tests/list-indent-check.html) joins it. It drives
the running app in an iframe rather than restaging its parts, so the handler,
the guards and the DOM surgery under test are the ones the user gets, and it
ends with a control: raw `execCommand("outdent")` on the same list, reported
without a verdict, so a green run is measured against the bug still being there
rather than against nothing.

The control earns its place. All three engines still mangle that list, three
different ways:

| | raw `execCommand("outdent")` on `<ul><li>one<ul><li>two</li></ul></li></ul>` |
| --- | --- |
| Firefox 154 | `<ul><li>one<br>two</li></ul>` — the bullet is gone |
| Chrome 148 | `<ul><li>one<li><span style="font-family: …">two</span></li></li></ul>` |
| Safari 26.6 | `<ul><li>one<li>two<br></li></li></ul>` |

Firefox is the one with teeth and it has not moved: two bullets go in, one comes
out, and the markup it leaves is indistinguishable from a deliberate hard break,
which is why `normaliseEditorMarkup` cannot repair it after the fact. The other
two are the `<li>`-inside-`<li>` shape that normalisation does unpick. Through
Shift+Tab as the app binds it, all three engines produce `<ul><li>one</li>
<li>two</li></ul>` — and Safari is measured here for the first time.

**The bug the suite could not see: an outdented item's followers came back
reversed.** Outdent the first of three nested bullets and `b`, `c`, `d` became
`b` with `d`, `c` under it. The loop collected the following siblings in
document order and then prepended each one, which reverses a run — and puts them
in front of the item's own sublist, when they belong after it. It is one word's
worth of fix, `appendChild` for `insertBefore(node, subList.firstChild)`, and it
was invisible to `tests/list-indent.test.mjs` because that suite's follower case
had exactly one follower. One follower cannot show an order. It has two now, and
a second case for an item that already had children of its own.

Two gaps in the test stub were what let it hide, both now closed:
`document.createElement` answered DIV to every tag, so a suite could not tell an
`<ol>` that stayed an `<ol>` from one that did not, and `querySelector` answered
null to everything, so the "does this item already have a sublist" branch was
never the one under test. [tests/dom.mjs](tests/dom.mjs) now honours the tag and
understands the one selector form the sources actually use on an element,
`:scope > ul, :scope > ol` — and refuses anything else rather than guessing.

## 2026-08-28 — `7a8876c` — An exported document hands on its bundle byte-for-byte

The self-reproduce suite's stated property is a fixpoint: what generation N+1
hands its successor must be byte-identical to what generation N handed it. In a
real browser it was not. Each hop added six bytes to the CSS and six to the JS.

The template writes each payload between a newline and an indented closing tag,
so `textContent` gives back `\n` + bundle + `\n    ` — and that was inlined
verbatim into the next generation, which read it back with another layer of
template around it, forever. Harmless whitespace, but the invariant the suite
existed to defend was false, and the suite could not see it: its stub handed
`getElementById("app-style").textContent` back as a clean string, with no
template around it to give back.

`unwrapInline` in [front/html-export.js](front/html-export.js) takes off exactly
the bytes the template adds. Deliberately not a `trim()`: the bundle ends with
the trailing newline of the last file concatenated into it, so trimming would
eat that too and settle the chain one hop later than it should. The stub now
wraps its payload the way the template does, so the check is against what a DOM
really returns; measured in the browser afterwards, generation N+1's CSS and JS
match generation N's exactly, with zero network calls on the way.

## 2026-08-28 — `7a8876c` — The welcome document and the README catch up with the menu bar

Both still described the row of buttons the menu bar replaced, which made the
first thing a new user reads a tour of an interface that is not there. The
welcome document told them to click a **Clear** button to start fresh — and
Clear had since been split in two, so the one action it named now does the other
thing: **New document** starts over, **Clear document** empties the text and
leaves the file alone. It also talked about "the caret beside Open" and "the
caret beside Save", which were split buttons that no longer exist, and named
**Copy MD**, **Paste MD**, **HTML**, **PDF**, **DOCX** and **Editable** as
buttons rather than as items in Edit and Export.

[front/welcome.md](front/welcome.md) now walks the six menus, in the labels
`TOOLBAR_MENUS` actually renders, and mentions the two things it never did: the
filename line under the menus with its *(edited)* and *(disk changed)* marks,
and that the Format menu is how you format with nothing selected — which is the
answer to TODO 1.5's gap that exists today. It still round-trips through the
app byte-identically, which is the property that lets it be edited as an
ordinary document rather than as markup.

The README had the same button-era language in eight places, plus three counts
that had drifted: it said the suite runs "all eight" when there are thirteen,
listed eight of them in its table, and described "six libraries from CDN" with
`docx` missing from the list of seven. All corrected. What it does *not* do is
the rewrite TODO 6.1 wants — that one is about the case the README makes for
the project, argued in D0 and still absent from it, rather than about which
buttons exist.

## 2026-08-28 — `7a8876c` — A third check page, for the one question a machine cannot answer

[tests/paste-check.html](tests/paste-check.html) settles the question TODO 1.3
opens with: on Ctrl/Cmd+Shift+V, does the browser still put a `text/html`
flavour in the paste event? It matters because app.js's paste handler prefers
`text/html` whenever the clipboard offers one, so if the flavour survives that
binding the app overrides the very thing the user asked for.

It needs a person, and not for the usual reason. A synthetic `ClipboardEvent`
carries whatever `DataTransfer` you build for it, so driving this from script
measures the script — the thing under test is what the *browser* puts in the
event, which takes a real clipboard and a real keystroke. So the page reports
rather than asserts: the flavours offered, which of app.js's two branches would
take them, and a verdict per browser.

It also measures the second half of 1.3's proposed fix. The plan there is a flag
set from a `keydown` on `#editor` and read by the next `paste`, which assumes
the keydown arrives at all — a browser that swallows Shift+V as a chrome-level
binding would leave the flag nothing to hang off. The page says which happened,
so the shape can be checked before it is built rather than after.

Unlike [tests/browser-check.html](tests/browser-check.html) and
[tests/list-indent-check.html](tests/list-indent-check.html), it needs no server
and no app — it reads the clipboard, not `front/`, so it opens from the file
itself.

## 2026-08-29 — `305a1a5` — The format bar at a bare caret (TODO 1.5)

`showFormatBar` bailed on `selection.isCollapsed`, so "make this line an H3"
with nothing selected had no route but the Format menu. That was always a
discoverability gap rather than a functional one — `applyFormat` never required
a selection, and `formatBlock` and the list commands act fine on a collapsed
one — which is why 1.5 sat as *(undecided)*: what it needed first was a ruling
on which buttons a caret should get, since the obvious answer of "all of them"
is wrong.

The ruling, and it is the whole design: **the caret bar is a row control.** It
appears when the caret is ahead of its row's text and offers only the formats
that have a row to act on — Paragraph, H1, H2, H3, Bullet list, Numbered list
and Code block. Bold, italic, strikethrough and an inline code span wait for a
selection, because at a caret they could only toggle *typing state*, which is a
different affordance wearing the same button. Paragraph is in the list although
the ruling stopped at the headings, the lists and code: it is the only way back
out of a heading, and a bar that could make one but not unmake it would send
the user to the Format menu for the return trip, which is the gap being closed.

A caret in the *middle* of a row raises nothing. A bar that trailed the caret
around the document would have no way to be dismissed, and it would be offering
the block formats the Format menu already reaches from exactly there — so the
row-start rule is what keeps the new bar from being the old one with the
restraint taken off. `atBlockStart` decides it, and asks about text rather than
nodes: a caret inside a `<strong>` that opens the line is at the start of the
row, and leading whitespace does not count, because nothing on screen tells it
apart from nothing at all. It is a position, not a gesture — the same caret
always gets the same bar, however it got there.

Code needed nothing new. `coversWholeBlocks` has read a collapsed range as the
whole block since the day it was written, so the one Code button already means
the fenced block at a caret and the inline span across a partial selection,
which is exactly the split the ruling asks for.

Four mechanics, all of which show on screen when they are wrong:

- **The dropped buttons are hidden, not removed**, and `collapseSeparators`
  takes the rules that no longer divide anything with them. Dropping the inline
  group strands *both* of the bar's separators, which render as a double gap
  rather than as a divider — the same problem `visibleItems` solves for the menu
  bar, and the same answer. Hidden rather than removed because the bar's markup
  is hand-written in `index.html` and again in `html-export.js`; rebuilding it
  in JS would make `format-bar.js` a third copy to keep in step.
- **`app.css` spells out `.format-bar [hidden]`**, because `.format-btn`'s own
  `display: flex` beats the browser's `[hidden] { display: none }`. Without it
  the property sets an attribute and changes nothing on screen.
- **`setBarMode` runs inside the measure-after-showing window**, between
  `classList.add("visible")` and the `offsetWidth` read. Hiding three buttons
  changes the width every positioning line below it depends on.
- **An empty row has no geometry to hang off.** A collapsed range is zero-width
  by definition, and in the `<p><br></p>` a browser leaves after Enter it
  measures 0×0 at the document origin — measured in Chrome rather than assumed.
  `barRect` falls back to the block's own rect, which is exact rather than a
  guess: the caret is at the block's start, so the block's left edge is the
  caret's. The caret bar is left-aligned to the row for the related reason, since
  centring on a zero-width rect would clamp it to the window edge and leave it
  in the same place whichever row the caret was in.

`updateActiveButtons` needed its own version of the split. A collapsed range
touches no text node — `intersectsNode` asks a boundary question there and the
engines do not agree — so the selection-side walk reported nothing and every
button read dark, including the one naming the block the caret was sitting in.
`caretNodes` hands it the node the caret is in instead, or the block itself when
the row is empty and there is no text node to be in; `hasAncestorTag` took an
element as well as a text node to make that work, which is what lights H2 on an
empty heading.

Last, **the caret bar stays up after a format where the selection bar closes.**
Its formats compose — H2, then a bullet — and the caret has not moved, so the
condition that raised it still holds. It is re-shown rather than merely left
alone, because the row it points at has just changed height and its active
states have changed with it. If the command left the caret somewhere that is no
longer a row start, `showFormatBar` hides it, so there is still one rule about
when the bar is up rather than two.

Twenty checks in the `format-bar` suite cover it: the row-start rule including
the inline-element and leading-whitespace cases, the empty-row fallback and its
arithmetic, which buttons each mode renders, that exactly one rule survives the
filter and that it is the one between the block formats and the lists, the
left-alignment, and the active states at a caret. The selection path is checked
alongside each of them, because the thing most likely to break here is the bar
that already worked. Watched in Chrome as well: the empty row really does report
a 0×0 rect, which is the measurement the fallback exists for.

What this does not close is the rest of 1.5's neighbourhood. Touch has no caret
to speak of and no hover, so it is still served by the Format menu alone — the
same gap TODO 1.2 records for following a link.


## 2026-08-30 — `2ab7a88` — Paste without formatting, measured rather than predicted (TODO 1.3)

TODO 1.3 opened with a question rather than a task: browsers already implement
Ctrl/Cmd+Shift+V in a `contenteditable` as paste-as-plain-text, but the `paste`
handler in `app.js` intercepts every paste and prefers `text/html` whenever the
clipboard offers one — so if the browser still handed over an HTML flavour on
that binding, the app was overriding the very thing the user asked for.

[tests/paste-check.html](tests/paste-check.html) was built to answer it and sat
unrun until now. **Chrome 152 and Firefox 154 both offer `text/plain` alone on
that binding**, so the plain branch already fired and the paste already arrived
bare in both. Nothing to build. That is the opposite of what the item predicted
— it expected Chrome to be clean and named Firefox as the case that would need
the work — which is the whole argument for having a page that measures instead
of a paragraph that reasons. The item also never mentioned Safari, though three
engines had been available since the list-indent check; WebKit is still
unmeasured and is all that keeps 1.3 open.

The second half of the page earned its place too. Both engines deliver the
`keydown` for Shift+V to the page, so the fallback shape 1.3 proposed — a flag
set from a `keydown` on `#editor` and consumed by the next `paste` event — is
known to be workable if WebKit turns out to differ, rather than assumed.

### The undo stack could not tell a paste from typing

The measurement is what promoted this from a bug waiting for a feature to a bug
in the shipping app: since Ctrl+Shift+V already worked in both engines, the
plain branch was live. It inserts through `execCommand("insertText")`, which
raises `input` reporting the same `insertText` a keystroke reports — there is no
flavour of that event that says "this came from the clipboard". So a plain paste
in the middle of a sentence coalesced into the typing around it, and one Ctrl+Z
took back both.

`undoBreak()` in [undo.js](front/undo.js) is the fix, and it is the caller
saying what the event cannot. It sets a one-shot flag that the next `input`
consumes: that edit does not merge into what came before it, and — because a
broken step reports no type at all afterwards — nothing typed after it merges
into the paste either. Isolated on both sides, spent immediately, so it costs
exactly one step rather than turning every subsequent keystroke into its own
undo.

Three checks in the `undo` suite cover both sides and the spending, and a fourth
scans `app.js` for the call, because the way this regresses is not a broken flag
but a paste path that quietly stops asking for it.

### Edit is the selection's menu

The third part of 1.3, and the reason the first two came with a menu change at
all. Edit held *Copy markdown* and *Paste markdown*, which act on the whole
document; adding an ordinary Cut, Copy and Paste beside them would have given
two pairs of near-identical names meaning entirely different things, in one
menu, four lines apart.

So the actions moved rather than being renamed, and where each one went is the
argument for it. **Edit** gets Cut, Copy, Paste and Paste without formatting —
everything here now acts on the selection. *Copy markdown* went to **Export**,
where copying the document as markdown is an export to the clipboard rather
than to a file, which is what it always was. *Paste markdown* went to
**Insert**, which reads honestly since it stopped replacing the document and
started inserting at the caret. The menu each one sits in is what tells them
apart; the labels never needed to change.

Cut and Copy are `execCommand` and needed nothing else — `mousedown` is already
prevented over the bar, so the click does not blur the editor and take the
selection with it, and Cut raises `input` so undo, autosave and the dirty flag
pick it up for free.

**Paste is the exception, and it is a browser restriction rather than a
choice.** `execCommand("paste")` is refused in web content, so the two Paste
items read `navigator.clipboard` themselves — the same thing *Paste markdown*
has always had to do. Rather than a second sanitise-and-insert path beside the
`paste` listener's, the listener's body was pulled out into
`insertPastedContent` and `insertPlainText` and both routes now share it: the
menu differs from the keyboard only in where the clipboard comes from, and
cannot drift into pasting differently. Reading the clipboard is a permission the
app may not have, and both items report a failure by pointing at the keystroke,
which never needed it.

The toolbar suite picked up eight checks with no new test code, since it derives
them from the spec and both bundle lists — every one of the four new actions has
a handler in a script each variant ships.

## 2026-08-30 — `725a5b0` — Links can be authored, not just imported (TODO 1.1.1)

The first slice of TODO 1.1. Links rendered when a document was opened and
Ctrl/Cmd+click already followed them, but there was no way to make one — the
README advertised a feature the UI could not reach. **Insert → Link…**
(`Ctrl/Cmd+K`) is that way now.

The dialog is `askForInput` in [notify.js](front/notify.js), a new sibling to
`ask()`: a modal with one text field, resolving to the trimmed string on
confirm or to `null` when it is dismissed. It is a second copy of the modal
scaffold rather than an option on `ask()`, because the return contracts differ
— `ask()` resolves to an action's `value`, this to what was typed — and
notify.js is already the one place the app's dialogs are built. Escape, the
backdrop and the × back out; Enter in the field confirms; Tab cycles the field
and the two buttons and never escapes the modal.

`insertLink` in [app.js](front/app.js) has four cases and only the first uses
execCommand:

- **text selected** → `runCommand("createLink", href)`. The browser check
  already measured this identical in Chrome and Firefox (it has a `createLink`
  case), so it needs no normalisation of its own.
- **a bare caret** → `insertHTML` of an `<a>` whose text is the address, since
  `createLink` on a collapsed selection does nothing useful in either engine.
- **caret inside a link** → set `href` directly. `createLink` inside an
  existing `<a>` is the one combination the browser check does *not* cover and
  the engines disagree on — Chrome nests a second anchor — so this and the
  next case are hand-rolled and dispatch a synthetic `input`, the convention
  `insertToc` and the Code branch already follow.
- **caret inside a link, address left empty** → unwrap the `<a>`.

`normaliseLinkHref` makes exactly one transformation: a bare `example.com`
gains an `https://` scheme, because at a caret it would otherwise save as a
relative link nobody meant. Anything already carrying a scheme, an `#anchor`
or a path is passed through untouched — markdown puts no other constraint on
an href. It is a pure function and the `links` suite covers it directly (ten
checks); the toolbar suite picked up the handler-exists checks from the spec
with no new code.

`sw.js` is at `v1.23`. Still open in 1.1: images, tables, blockquotes, h4–h6,
inline code and indent/outdent controls.

## 2026-08-31 — `0da618a` — A new icon and logo, and the menubar goes teal

The hand-drawn "M" favicon was replaced with the project's actual mark — a teal
blob with a gold dot, traced to vector, transparent, on a `0 0 1095 1095`
viewBox. `favicon.svg` and `icon-maskable.svg` took the new art, and the three
`favicon-*.png` sizes were re-rasterised from it (and fell to about a third of
their weight on the way).

**The OS window chrome and the in-app menu bar are two different surfaces, and
they were being conflated.** `<meta name="theme-color">` and the manifest's
`theme_color` tint the browser/OS title bar; `--bg-toolbar` in `app.css`
colours the menu row inside the page. The title bar went to white (`#ffffff`)
so the new transparent icon's dark-teal mark stays visible against it, and the
menu row — light theme only — went to the brand teal `#0c4c4a`. The dark
theme's toolbar stays near-black.

`icon-maskable.svg` was rebuilt with a full-bleed background, and that
background is **white rather than the brand teal**: the mark is itself `#0c4c4a`
and would disappear on it. The art is left full-size; the mobile safe-zone
question waits for the tab work.

**The welcome document leads with the banner lockup now**, and its headings lost
their emoji. The image ships as a 480px-wide raster rather than the icon SVG, so
`#editor img { max-width: 100% }` controls its size — an SVG with a viewBox but
no intrinsic dimensions renders at the browser's ~300px default, which is
enormous at the top of the page. It is theme-swapped: `welcome-banner-dark.png`,
a light-cyan recolour of the lockup on `#1a1a1a`, is shown under
`[data-theme="dark"]` by a CSS `content: url()` rule keyed on the `src`.
markdown-it runs with `html: false`, so there is no class hook and no
`<picture>` to reach for; the swap stays presentational and the document keeps a
single `<img>`. The dark file's background matches `--bg-editor` so it blends
rather than sitting in a card.

`sw.js` is at `v1.24`, with `welcome-banner.png` and `welcome-banner-dark.png`
added to `SHELL_ASSETS`.

## 2026-08-31 — `8f166fc` — Undo history becomes a detachable bundle (TODO 4.1)

The first slice of tabbed view, and nothing changes for a single document —
this is groundwork.

[undo.js](front/undo.js) kept its history in seven module-level variables, and
`undoReset()` was the only thing that could end one. It is called at every site
that assigns `editor.innerHTML`, and the `undo` suite counts those sites so a
new one cannot skip the choice between forgetting the history and raising an
`input` event to stay undoable. A tab switch is neither: the document leaving
the screen is not replaced or edited, only set aside, and its history has to
come back untouched when the user returns to it.

So the seven variables collapsed into one `history` object, and two functions
join `undoReset()`:

- **`undoPark()`** detaches the current `history`, leaves a fresh one in its
  place, and hands the old one back for the caller to keep on the outgoing tab.
- **`undoAdopt(bundle)`** installs a bundle as the live history.
  `undoAdopt(null)` is exactly `undoReset()` — a fresh baseline from whatever is
  in the editor — for a tab with no history of its own yet.

The bundle moves as a unit and the two stacks are never merged, so an undo in
one tab cannot reach another tab's content. One ordering rule: the caller swaps
`editor.innerHTML` to the incoming document before calling `undoAdopt`, because
adopt trusts the bundle matches what is on screen and never re-snapshots — the
same constraint `undoReset()` already carries against running before the content
settles.

Every existing caller — [file-api.js](front/file-api.js),
[execcommand.js](front/execcommand.js), [app.js](front/app.js) — uses a
signature that did not change. The `undo` suite picked up eleven checks in a new
park/adopt group: parking carries the stack out and leaves an empty one,
adopting restores exact depth and the position ids `file-api.js` reads to follow
the dirty flag, and draining one tab's history never surfaces another's markup.

`sw.js` is at `v1.25`.

## 2026-08-31 — `8f166fc` — Two workflow rules, and the cache bump that missed

[CLAUDE.md](CLAUDE.md) gained a "Making a change" section with two rules: every
change goes in this file as part of itself — hash-less first, header backfilled
once committed — and tests are not run for a change that touches no code, and
otherwise only the suite naming the touched file rather than the whole
`npm test`.

The undo change above edited `undo.js`, a `SHELL_ASSETS` entry, without moving
`VERSION`, so `sw.js` goes to `v1.25` here to retire the stale cached copy.
(This entry named that change as `d604beb`, which is not an object in this
repository: the two were amended together and both are `8f166fc`, so the hash
written here was the pre-amend one. Found and corrected on 2026-09-18 — it was
the only dangling hash in any metafile.) The
CHANGELOG entry for `0da618a` — the icon/logo commit, which had gone in without
one — was written at the same time.

## 2026-09-02 — `f022926` — Rebrand: Marky becomes Mandy

Every user-facing and in-source occurrence of "Marky"/"marky" became
"Mandy"/"mandy": window titles, the manifest `name`/`short_name`, PWA meta tags,
the welcome document, README and the `docs/` prose, every code comment, the
`package.json`/`package-lock.json` name, `ecosystem.config.cjs`, and the pm2
process name. The `MARKY_PORT` environment variable is now `MANDY_PORT`
(`server/`, `deno.json`, `ecosystem.config.cjs`, and both READMEs).

Three things carry state and so change behaviour, not just spelling: the
`localStorage` keys (`marky-theme`, `marky-outline`, `marky-current-file`,
`marky-last-dir`, `marky-dirty`, `marky-file-mtime`) are now `mandy-*`, so an
existing user loads once with their stored theme, outline state and file
association reset; the service-worker cache prefixes (`marky-shell-*`,
`marky-runtime-*`) are now `mandy-*`, retired on `activate` like any renamed
cache; and `VERSION` goes to `v1.26` to force that retirement. The test suites
that assert those key names moved with them.

References to the upstream project keep the name Marky: the `Tommertom/marky`
GitHub URL, and D0 in [docs/DECISIONS.md](docs/DECISIONS.md) ("Marky was the
starting point"). The README now says so explicitly — "Originally forked from
Tommertom/marky and retains much of that code, mostly at conversion and
rendering engine level". The GitHub remote URL and branch are left untouched for
now — that move happens separately.

[LICENSE.md](LICENSE.md) keeps Tommertom's `Copyright (c) 2025 Tommertom` line,
as MIT requires, and adds `Copyright (c) 2026 Erez Schatz` below it for the work
in this line of commits.

The README's "Check out the GitHub repository" link — the one for bug reports,
feature requests and contributions — pointed at `Tommertom/marky`, the upstream
fork source, rather than at this project's own repo; it now points at
`erezschatz/mandy`.

The README's intro gained a line on the rename itself — "Marky was where this
started. Mandy is where it learned to give your files back exactly as it found
them. The new name is a promise, not a coat of paint." — sitting under the fork
attribution.

The two welcome banners (`welcome-banner.png`, `welcome-banner-dark.png`) were
regenerated with the new wordmark — the logo mark, teal/mint/amber palette and
480×273 dimensions are unchanged, only "Marky" became "Mandy". The wordmark is
set in Poppins ExtraBold, the closest match to the original; the banners are now
flat vector renders rather than the previous textured raster, so they are also
about a tenth of the file size.

## 2026-09-02 — `2964f26` — Packaging Mandy: two items recorded, no code

[docs/TODO.md](docs/TODO.md) gained **6.3** — ship Mandy as a single executable
via `deno compile`, the binary starting the server and opening the browser. The
item spells out the parts that are not the `compile` call: baking in the
permission set, carrying `front/` with `--include` and keeping `FRONT_DIR`
resolvable inside the binary, and opening the browser. Packaging, not
architecture.

[docs/ROADMAP.md](docs/ROADMAP.md) gained **A desktop build** — Deno Desktop,
which is `deno compile` plus a webview and a native bundler (`.dmg` / `.msi` /
`.AppImage` / `.deb`). Recorded as post-1.0 for two reasons: it is a Deno 2.9
feature still marked experimental, and its default OS-webview backend is a
fourth rendering engine to reconcile against the contenteditable folklore
`browser-check.html` exists to measure. The "unidentified developer" warning is
explicitly *not* one of the blockers.

## 2026-09-02 — `62d8cc7` — Run the tests on push, show the result on the README

`.github/workflows/ci.yml` runs the two checks that were previously local-only
on every push to `main` and every pull request: `tests/run.mjs` (which already
exits non-zero on a failed check) and `deno task check` on the server. It
installs Deno and nothing else — no Node, no `npm ci` — since the npm scripts
are only wrappers and Deno fetches Hono itself.

The README gained one badge under the title, `ci.yml/badge.svg`, which reflects
that workflow's last run on `main`: green when the suite passes, red when it
does not, and a click through to the run either way. No test count, no coverage
percentage — nothing that stays green by not measuring anything.

## 2026-09-03 — `c0b8f8a` — The block Enter leaves behind

Pressing Enter to exit a heading or a list made Chrome and Safari synthesise a
`<div>` — there is no block of the same kind to split, so the browser fell back
to the `defaultParagraphSeparator`, which was never set and defaults to `div`.
Nothing in `front/` recognised that `<div>` as a block: `blockAncestor` in
`format-bar.js` lists `P`/`H1`–`H3`/`LI`/`PRE` and nothing else, so `atBlockStart`
returned false for the line after a heading and the caret format bar stopped
appearing there — a bare caret or a click on that line raised nothing, though
selecting its text still brought up the selection bar, which does not go through
`blockAncestor`. The same fallback is what produced the occasional indented line
on leaving a bulleted list: Chrome's list-exit strands the new block as a direct
child of the `<ul>`, sometimes inside leftover nesting.

Two changes, both in `execcommand.js`:

- `defaultParagraphSeparator` is set to `p` at load, next to `styleWithCSS`.
  Chrome and Safari now create `<p>` on heading- and list-exit; Firefox already
  did. This is what actually restores the caret bar.
- `normaliseEditorMarkup` gained a backstop for paste and for any engine that
  ignores the hint: a bare `<div>` that is a direct child of `#editor` is
  retagged to `<p>`, and a `<div>` or `<p>` stranded as a direct child of
  `<ul>`/`<ol>` is retagged if needed and lifted out to sit after the list.
  `DIV` joined `UNWRAPPABLE_AROUND_LIST` so a `<div>` wrapped around a list is
  unwrapped like a `<p>` around one already was — the only `<div>` that
  legitimately holds a list is a mermaid wrapper, which `isProtectedNode`
  excuses first. Deeper `<div>`s, inside an `<li>` or a `<blockquote>`, are
  left alone: there they can be loose-list markup the structure needs.

Verified by hand in Firefox 154: the line after a heading now raises the caret
bar, and leaving a bulleted list no longer lands indented. Documents already
carrying the old `<div>` soup need one reopen to clear it — the normalisation
only runs on `runCommand`, not on load. Chrome and Safari unverified.

The non-deterministic *indent* on list-exit — which would need a hand-rolled
Enter handler for an empty `<li>`, the way `outdentListItem` already hand-rolls
Shift+Tab — is left for a follow-up if `defaultParagraphSeparator` plus the
backstop do not settle it in Chrome and Safari too.

## 2026-09-03 — `c0b8f8a` — The bullet a cross-list paste strands

Cutting two bullets from one list and pasting them into another left one item
unindented and frozen: Enter and Backspace both did nothing on it, and only a
save and reload put it right. `execCommand("insertHTML")` splicing an `<li>` (or
a bare `<ul>` fragment) into an existing `<li>` is one of the most
engine-divergent things there is, and a common result is an `<li>` orphaned
outside any list — a direct child of `#editor` or of a stray wrapper. There it
renders at the wrong indent, and contenteditable's Enter and Backspace no-op on
it because they cannot find a list context; the recovery on reload is Turndown
flattening it to a plain list item and markdown-it rebuilding a clean
`<ul><li>`. `normaliseEditorMarkup` repaired an `<li>` inside an `<li>` but had
no rule for one outside a list at all.

It has one now, in `execcommand.js`: an `<li>` whose parent is neither a list
nor an `<li>` is adopted into an adjacent sibling `<ul>`/`<ol>` — the one it was
just cut away from — or, failing that, wrapped in a fresh `<ul>`. A run of
orphans coalesces in order, because the walk reaches them one at a time and each
sees the list the previous one just joined or created as its own previous
sibling.

Not verified in a browser — the exact markup a cross-list paste produces is
engine-specific and was not captured — so this is a sound backstop rather than a
confirmed fix for the reported case. `tests/browser-check.html` does not cover
paste; confirming it wants the post-paste DOM from a real repro.

## 2026-09-03 — `6981344` — Enter and Backspace on an empty bullet, done by hand

Enter at the end of a bullet to make a new one, Backspace to remove it, Enter
again — and the caret dropped *two* lines instead of one, cyclically. Two
captured `#editor` snapshots showed the cause: contenteditable's own handling of
an empty `<li>` is a lottery. At the end of a list Chrome leaves an empty
`<ul></ul>` behind; in the middle it *splits* the `<ul>` into two and strands a
`<p><br></p>` between the halves, then the next Enter adds its own. Backspace
also lands the caret at the start of the *next* item rather than the end of the
one before.

The first attempt at this — `pruneEmptyLists`, an `input` listener that dropped
empty `<ul>`/`<ol>` — was reverted: it fixed neither reported case, because the
visible damage is the stray `<p><br></p>` blocks, not the empty list beside
them, and those are byte-identical to a blank line somebody wanted.

So the same call `outdentListItem` made for Shift+Tab: stop asking
contenteditable and do the move by hand. `app.js` gained a `keydown` handler for
Enter and Backspace on an empty `<li>`:

- **Backspace with a bullet directly above** — the empty item is removed and the
  caret goes to the end of that bullet. No split, no stray paragraph.
- **A nested empty item** — Enter, and a first-item Backspace, outdent it one
  level through `outdentListItem` rather than leaving the list outright.
- **Top level** — Enter splits the list at the caret around a single new
  paragraph (bullets above stay, bullets below become a fresh list after it);
  Backspace lifts the paragraph above the list and leaves the rest intact. Empty
  halves are dropped.

Each path raises a synthetic `input`, so autosave, the dirty flag, undo and the
outline all see it, and one keystroke stays one undo step.

Covered by the `list-indent` Deno suite (47 checks) for the DOM outcome, and by
the new [tests/list-empty-item-check.html](tests/list-empty-item-check.html) —
served through `server.ts`'s `CHECK_PAGES` route, same shape as
`list-indent-check.html` — for the caret landing and the stray-block count in a
real engine.

**Unverified in any browser.** Deferred to hand-testing on macOS (Chrome,
Firefox, Safari) via the check page and the reported repro. The Deno suite
pins the DOM surgery; whether a real engine keeps the caret where the handler
puts it, and whether `preventDefault` fully suppresses the native split, is
still unmeasured.

That is the fourth contenteditable list-editing bug (after the Enter `<div>`,
the cross-list paste orphan and this one's own two faces). The line drawn with
the user: if a fifth turns up, the fix is one caret-aware list normaliser, not
another per-symptom rule.

## 2026-09-03 — `6981344` — Record the undo/`(edited)` bug — TODO 1.6

Reported alongside the empty-bullet work but a separate fault: open a file, one
edit (an Enter at the end of an `<li>`), Ctrl+Z — and `(edited)` stays lit while
the caret jumps to the top of the document. Both symptoms point at undo not
landing back on the baseline snapshot / miscounting the caret offset for a caret
at the end of a list item. [docs/TODO.md](docs/TODO.md) gained **1.6** with the
detail; not reproduced in isolation yet, and it is an `undo.js` question rather
than a list-markup one.

## 2026-09-03 — `faf13bb` — An escalation rule for the Mandy 2.0 rewrite

[docs/ROADMAP.md](docs/ROADMAP.md)'s "Mandy 2.0" section gained one: twice now a
cluster of contenteditable bugs has forced a piece of its behaviour to be
replaced with hand-rolled DOM surgery (`outdentListItem`, then the empty-`<li>`
handler). Recorded as an option, not a commitment — **a third such cluster
reclassifies the model rewrite from a roadmap item to a 1.0 blocker**, on the
argument that past that point the hand-rolls are the input-layer spec rather
than a way of deferring it. No code.

## 2026-09-05 — `2baad56` — Cross-reference the escalation rule and a bundled fix, so scoped work can't miss them

Two near-misses, closed the same way. Asking for "1.1.2" alone would not have
surfaced that 1.1.5's heading-in-list refusal was cheap enough to land with it
rather than wait for 1.1.6 — the two items had no link between them. And the
escalation rule `faf13bb` recorded in [docs/ROADMAP.md](docs/ROADMAP.md) had no
forward pointer from the two TODO slices (1.1.6, 1.1.8) it exists to gate, so
"do 1.1.6" alone could have landed a third hand-rolled DOM-surgery cluster
without anyone re-reading the rule first.

[docs/TODO.md](docs/TODO.md) 1.1.2 now names the bundled fix explicitly, and
1.1.5 gained a standing check pointing at 1.1.6 and 1.1.8, spelling out what to
verify (the current cluster count) before writing either. ROADMAP.md's
escalation-rule paragraph gained a line back to that check. No code.

## 2026-09-05 — `2baad56` — Six heading levels, a list indent control, and the heading-in-list refusal (TODO 1.1.2, 1.1.3, 1.1.5)

Three slices from [docs/TODO.md](docs/TODO.md)'s markdown-authoring list, taken
together because the third was cheap enough to bundle with the first rather
than wait for 1.1.6, per the note added above.

**1.1.2 (h4-h6).** Same `formatBlock` call h1-h3 already made — no new engine
behaviour, so no new case in `applyFormat`'s switch, just three more names in
its registration loop. They land in the Format menu only, not the floating
format bar: six heading buttons on the smaller bar was the layout question
1.1.2 left open, and this answers it by not growing the bar at all.

**1.1.3 (indent / outdent controls).** The engine-side move was already there —
`outdentListItem` and `runCommand("indent")`, bound to Tab / Shift+Tab — with no
control reaching it outside a keypress, so touch had no way to nest a bullet.
The two guards Tab already used (`item.previousElementSibling` for indent,
`isNested(item)` for outdent) came out of the keydown handler into
`canIndentListItem` / `canOutdentListItem`, so the new **Indent list item** /
**Outdent list item** menu items ask the identical question a keypress does
rather than re-deriving it, and the keydown handler now calls the same two
functions instead of inlining the checks.

**1.1.5, first bullet (heading-in-list refusal).** Settled but unfixed until
now: a heading inside a list item is expressible in both HTML and markdown, but
not something the editor should offer a way to make by accident, so both
engines should no-op rather than Chrome unwrapping the list (already fixed by
`normaliseEditorMarkup`) or Firefox nesting the heading in the `<li>` (which
round-trips fine and was exactly the problem). `applyFormat` now refuses any
`h1`-`h6` format whose range lands inside an `<li>`, before calling
`formatBlock` at all — where the selection still exists, per the decision's own
argument for not fixing this in `normaliseEditorMarkup` after the fact. The
second bullet (`indent` outside a list producing a stray `<blockquote>`) stays
open in 1.1.5 for 1.1.6 to meet.

No new engine behaviour anywhere in this — h4-h6 is the same `formatBlock` path
already measured for h1-h3, indent/outdent reuse code already watched by
[tests/list-indent-check.html](tests/list-indent-check.html), and the heading
refusal is a guard ahead of a call that, when it fires at all now, is on formats
already measured. [tests/browser-check.html](tests/browser-check.html) was not
re-run for this reason; TODO 1.1's standing instruction still applies to
whichever slice next introduces something new to measure.

`front/welcome.md` and [CLAUDE.md](CLAUDE.md) updated to match: the "ten
formats" counts become twelve-of-thirteen (Code stays hand-rolled), and the
welcome document's own description of the Format menu and caret bar.

## 2026-09-05 — `7b210d7` — TODO 1.1.4 closed: inline code verified, not rebuilt

Asked first, rather than guessed: 1.1.4's own text called for "a dedicated
control" for inline code, but [CLAUDE.md](CLAUDE.md) already documents Code as
deliberately a *single* button whose inline-vs-block choice comes from the
selection, "rather than from a second button" — a two-button version of this
existed once and was the bug ("the button used to get it wrong, turning the
whole paragraph into a fenced block over two selected words"). Adding a real
second control would have quietly reopened that decision. Confirmed with the
user first: read as verification only, no new control.

Every case 1.1.4 named — caret, whole-block and partial selection — was driven
for real against the running app rather than the Deno stub, since `toggleCode`
is hand-rolled DOM surgery with no execCommand to fall back on and the stub has
no editing engine to catch what only a real `Range`/`Selection` would: a caret
converts its own block, a partial selection wraps only the selected text in
inline `<code>` without disturbing the rest of the paragraph, a whole-paragraph
selection converts the block, the same three shapes hold inside a bullet
(inline in place, or a `<pre>` nested in the `<li>` rather than replacing it),
toggling either shape back off restores plain text, and selecting across two
bullets declines with the "Select inside a single block" notice rather than
collapsing the list. All matched the documented behaviour; nothing in
`front/` changed. `docs/TODO.md` drops 1.1.4 and its "missing: … inline code"
mention accordingly — the gap was discoverability of an existing capability,
not a missing one, and no code closes that kind of gap.

## 2026-09-05 — `ae44638` — D5: indent stays list-only, and TODO 1.1.5 closes

The last open question from TODO 1.1.5 was never a coding task — it was the
"settle before or alongside 1.1.6" decision the item said it was. Measured
behaviour: execCommand's own `indent`, used outside a list, turns the current
block into a `<blockquote>` (with Chrome adding inline styles Firefox does
not). Not reachable today — `app.js` guards Tab, and the indent control added
in 1.1.3, to lists only — but 1.1.6 (blockquotes, hand-written) would have had
to decide whether to meet that native behaviour or bury it.

Asked the user rather than picked a side, since [DECISIONS.md](docs/DECISIONS.md)
entries are meant to stay settled rather than get reopened later. Settled:
**indent stays list-only, permanently** — [docs/DECISIONS.md](docs/DECISIONS.md)
gained **D5**, generalising the same call already made for a heading inside a
list (TODO 1.1.5's other, already-fixed bullet): a control that quietly does
two different things depending on context is worse than two controls that
each do one thing, even when both are individually expressible in markdown.
No code changes — the guard that makes the path unreachable already existed
for lists, D5 is what keeps it that way on purpose.

[docs/TODO.md](docs/TODO.md) closes 1.1.5 entirely. Its standing check against
ROADMAP.md's third-cluster escalation rule — which named 1.1.6 and 1.1.8 —
moved up to 1.1's own overview rather than into either slice, so closing 1.1.5
doesn't strand it the way it nearly got stranded once already (see the
2026-09-05 cross-referencing entry above). 1.1.6's own text drops the "wants
that answer settled first" blocker, since D5 supplies it.

Three stale references to "TODO 1.1.5" as still-open work followed it down:
[CLAUDE.md](CLAUDE.md)'s browser-check and execCommand sections both said the
list-control divergences were still waiting on it, and
[front/execcommand.js](front/execcommand.js)'s comment on the heading-unwrap
backstop still pointed at 1.1.5 as future work rather than at
`headingTargetsListItem` in `format-bar.js`, which already does the real
refusal. All three now point at what's actually there. No behaviour changed;
811-check Deno suite still green.

## 2026-09-06 — `b3645a3` — The editor rewrite becomes 1.0 work (TODO 3.1, D6, REWRITE.md)

The question was put as arithmetic: finish the remaining editing items on the
current core and rewrite after, or rewrite now — with the rewrite's own cost
unknown because nothing like it had been built here. Answered by measuring the
code rather than guessing. About 1,500 lines go (`undo.js`, `execcommand.js`,
the list surgery and the Turndown save rules in `app.js`), about 1,300 are
modified, and about 5,300 — menus, notify, file API, outline, both exports,
server, CSS — are untouched, because they read a rendered DOM that still
exists. Against this repo's own pace since 2026-08-11, five to eight weeks,
with the whole tail in the one layer that has no counterpart today: the
`beforeinput` interception that turns contenteditable into an input method.

The arithmetic double counts. The fix work is mostly discarded by the rewrite,
and the rewrite does not re-implement those items — a table row becomes an
array element, U+00A0 never enters a model, the undo caret bug belongs to a
snapshot design that stops existing. And the roadmap's own escalation rule had
already fired: tables are several clusters of hand-rolled DOM surgery at once,
so starting TODO 1.1.8 on the old core *was* the third cluster.

**[docs/REWRITE.md](docs/REWRITE.md) is new**: the design (a block-granular
markdown model with source spans from markdown-it's own token `map`, no new
parser and no engine dependency, per-block render, `beforeinput` by type,
composition handed to the engine and read back on `compositionend`, Turndown
kept for paste only), the file-by-file fate table, the estimate by stage, a
three-day spike as a gate with pass and fail criteria spelled out, the build
order, and what is accepted (the core is owned forever; Android and in-document
drag unmeasured on the first pass; block granularity final).

**[docs/DECISIONS.md](docs/DECISIONS.md) gained D6** with the argument, and D4's
closing paragraph now points at 3.1 rather than at the roadmap, with one
amendment to its boundary rule: no new format is written against
contenteditable in the meantime, since the work would be discarded with the
core. **[docs/TODO.md](docs/TODO.md) gained section 3** with 3.1 as the item to
start from; 1.1's third-cluster standing check is replaced by the rule having
fired; 1.1.6, 1.1.7 and 1.1.8 become model commands marked *(needs 3.1)*, 1.4
and 1.6 are *(closed by 3.1)* rather than fixed on the old core, 1.5 is *(best
after 3.1)*, 2.1 is marked as the one item that survives both cores, and 4.1
notes that its document model is 3.1's and its 2N-copies count becomes N.
**[docs/ROADMAP.md](docs/ROADMAP.md)** loses its "Mandy 2.0" section to a
pointer, and its module-system and save-fidelity entries say what 3.1 changes
for them. [CLAUDE.md](CLAUDE.md)'s "Document state" section says it describes
the design being replaced. No code.

## 2026-09-07 — `948e350` — Markdown coverage checklist and feature decisions for the rewrite

**[docs/MARKDOWN.md](docs/MARKDOWN.md) is new.** Every construct in the two
Markdown Guide cheat sheets — basic and extended — plus Mandy's own math and
Mermaid, each scored on three axes that can disagree: whether imported markdown
*renders*, whether a control *authors* it, and whether a save *round-trips* it
(byte-exact via the content-keyed index, lossy to Turndown's house style, or
broken). The point of the list is the asymmetries and the gaps.

The gaps it names, none currently rendered by `markdownit()`'s default preset
and none authorable: raw inline/block HTML (`html: false` escapes it — the
largest gap against real README files), task lists `- [ ]`, footnotes, explicit
heading IDs `{#id}`, definition lists, `linkify` for bare URLs, syntax
highlighting (the `language-x` class is set but nothing highlights it), and the
low-stakes `==mark==` / `~sub~` / `^sup^` / emoji shortcodes. Each carries a
decision the rewrite has to make rather than inherit by omission; the file lists
them so they land in [docs/DECISIONS.md](docs/DECISIONS.md) before 3.1's stage 2
calls a feature done. It also flags two small serialiser sniffs not yet done
(fence character, hard-break spelling) and the constructs that need their own
stage-1 fidelity cases because the four byte-identical fixture files don't
exercise them (setext headings, indented code blocks, link titles, `~~`).

**[docs/REWRITE.md](docs/REWRITE.md)** and **[docs/TODO.md](docs/TODO.md)** item
1.1 both gained a pointer to it. No code.

Then those decisions were taken and folded back in. **Settled:** `html: false`
stays — rendering or authoring raw HTML breaks the WYSIWYG premise; tables are a
must and already drive the rewrite; task lists are 1.0 (priority) with a live
checkbox and an undoable toggle; a full link editor is 1.0 (text + href +
optional title, a heading picker for inner links, `linkify: true` on import with
the D1 cost of serialising bare URLs back to bare text accepted — no new
dependency, `linkify-it` ships inside markdown-it); explicit heading IDs are
1.0 as part of that editor, with authoring as the cut line if the work overruns;
syntax highlighting is out of scope for 1.0; footnotes, definition lists,
`==mark==`, `~sub~`, `^sup^` and `:emoji:` are roadmap, not 1.0; the fence-char
and hard-break-spelling sniffs get done with the rest. An imported raw-HTML
block or inline span is kept as opaque `source` — byte-exact round-trip,
rendered inert as today, never editable — closing the D1 hole where opened
HTML was escaped to text and written back mangled. **Still open:** the link
editor's UI details (S2), and hand-rolled rule vs plugin for task lists and
`{#id}` (S4) — decided when it is built, hand-rolled unless a plugin saves real
time and its broad attribute surface is worth owning.

**[docs/TODO.md](docs/TODO.md)** gained items **1.1.9** (task lists) and
**1.1.10** (link editor, `linkify`, explicit heading IDs), both *(needs 3.1)*.
**[docs/ROADMAP.md](docs/ROADMAP.md)** gained a "Markdown constructs held for
after 1.0" section for the deprioritised batch. **[docs/MARKDOWN.md](docs/MARKDOWN.md)**'s
per-construct "After 3.1" column and its Decisions section now carry the
settled calls and the three open threads. No code.

## 2026-09-07 — `8dbbc95` — Tabs are unblocked, and the four ways they lose a file (TODO 4.1)

**TODO 4.1 loses its *(needs 3.1)* marker and gains no replacement.** It went on
in the 2026-09-06 pass that re-marked the whole file for the rewrite, and it did
not survive being asked for its reasons. The two written down are not blockers:
the `localStorage` count falling from 2N to N is a constant factor against a
quota nobody has hit, and a question 4.1 had already settled its own way; and
"every item marked *(needs 3.1)* waits" restates the marker rather than
justifying it. Counting the per-tab state instead, most of the item is
core-independent — `currentFilePath`, `isDirty`, `fileMtime`, `diskChanged` and
the last-browsed directory are all in `file-api.js`, which REWRITE.md's own fate
table leaves untouched, and the tab bar, the per-tab dot, the `beforeunload`
compensation and restore-on-load never reach the core. What 3.1 discards is the
per-tab `markdownSource` maps and swapping HTML strings where a model would swap
a reference: days of throwaway work. Tabs are built on the current core on
`main`; the rewrite stays on its branch and absorbs them when it merges.

**A marker now states a blocking relationship and nothing else.** *(best after
…)* was a recommendation wearing the same costume as a gate, and it read as one
— which is how 4.1 came to be treated as waiting on work it does not need. The
preamble's definition is rewritten to say so, and the three items carrying an
ordering preference lose the label while keeping the argument in their prose,
where it can be read and disagreed with: **1.5** (search-and-replace, whose body
already explains why it is cheaper written once, after the model exists),
**6.1** (the README rewrite) and **3.1**, whose marker keeps *(unblocks …)* — a
fact about other items — and drops the "best before" clause. *(no urgency)* on
**6.3** is left alone: it is a priority, not an ordering.

**What replaces the marker on 4.1 is the hazard it was standing in front of.**
Tabs open one class of bug that is new rather than merely bigger: every `await`
between deciding *which document* and reading *the bytes*. It is unreachable
today because there is one document to be wrong about, and each instance writes
the wrong document somewhere the user cannot undo — `saveFile` reads
`editor.innerHTML` after awaiting `confirmOverwrite` and possibly the entire
`saveFileAs` browser, so tab B's content lands on tab A's file under a toast
saying "Saved"; `openFile` assigns after its `await fetch`; autosave's single
`saveTimer` and fixed key drop the outgoing tab's last second of edits; and
`beforeunload` persists the active document alone. Settled: **the switch is
refused while a file operation is in flight**, one rule rather than four capture
sites, and capturing early would save the document as of the Save click rather
than the confirm. `.notify-backdrop` and `.file-dialog` already do half of it for
a mouse, being full-viewport `inset: 0` overlays; the gap is the four
`document`-level `keydown` listeners that fire straight through an open dialog,
which the Ctrl+Tab binding has to check for itself.

**3.1 does not close that**, and the item now says so: the awaits stay, the
single active-document global stays, and the same late read is the same bug with
a new variable name. What the rewrite changes is the fix on offer — a background
tab today is a frozen HTML string, so "serialise tab A right now" has no answer,
while N live models make it `tabs[tabId].model` and the lock comes off. The lock
is correct on both cores and worth building either way.

**The undo bullet was describing shipped work as future work** and now describes
`undoPark` / `undoAdopt` as landed, with the two things left at the call site:
adopt after the content swap, never before, and `cleanPosition` moving into the
tab record to park with the bundle. That second one is the sharpest silent
failure in the item — `nextId` counts from zero inside each bundle, so a global
`cleanPosition` reads tab A's id 7 as tab B's id 7, a dirty document reports
clean, and the unsaved-work guard and the `beforeunload` warning go down
together. It only misfires when two tabs' edit counts line up, so no manual pass
finds it.

**[docs/REWRITE.md](docs/REWRITE.md)'s Undo section carries the same requirement
forward**, because a new history with new ids does not produce it by accident:
the replacement counter has to be document-scoped and parked with the bundle, or
globally unique. Written there rather than under "What is accepted", which is for
costs taken on rather than requirements to meet. No code.

## 2026-09-07 — `7791121` — Per-tab state boundaries: filePark/fileAdopt and markdownStylePark/markdownStyleAdopt (TODO 4.1)

First landing of the tabbed view, and deliberately an inert one: two new pairs
of functions, nothing calling them, no second document possible yet. A tab is a
whole document, so the state one is made of has to be movable as a unit, and
`undo.js` already showed the shape — `undoPark()` hands the outgoing history
back and `undoAdopt()` installs the incoming one, with persistence left to
whoever owns the tab. The alternative was one new module reaching into four
others' globals, which the shared scope permits and which would put file state's
invariants somewhere that does not own them.

**`filePark()` / `fileAdopt(bundle)` in [file-api.js](front/file-api.js)** move
`currentFilePath`, `isDirty`, `fileMtime`, `diskChanged`, `cleanPosition` and
`dialogDir`. `fileAdopt(null)` is a document with nothing behind it on disk —
what a fresh tab starts as and what closing the last one will leave — and it
resets the dialog directory with the rest, so a switch cannot leave the incoming
tab's Open starting from the outgoing tab's folder. Seeding a new tab's
directory from the tab that spawned it is a different question and belongs to
whoever creates tabs.

**They have to be called in the same swap as undo.js's pair**, and the comment
says so, because `cleanPosition` is an id minted inside one history bundle:
`nextId` counts from zero per bundle, so tab A's id 7 and tab B's id 7 name
different states. A `cleanPosition` adopted without the history it came from
reports a dirty document clean, which switches off the unsaved-work guard on
Open and Reload *and* the `beforeunload` warning together — and only when two
tabs' edit counts happen to line up, so no manual pass finds it. The suite's
two fixtures share a `cleanPosition` of 7 for exactly that reason.

**`markdownStylePark()` / `markdownStyleAdopt(bundle)` in
[app.js](front/app.js)** move the three things `adoptMarkdownStyle` builds
together — the sniffed style, the block index and the reference definitions —
and the four Turndown options with them. That last part is the one with teeth:
one shared `TurndownService` serialises every document, so a swap that carried
the new tab's block index but left the outgoing document's bullet marker on the
service would write `*` into a file written with `+`, in a block nobody had
edited. The four option assignments moved into `pushMarkdownStyleOptions()` so
the two callers cannot drift apart.

**[tests/tabs.test.mjs](tests/tabs.test.mjs) is new**, 20 checks: park returns
what it found and leaves the module blank, adopt restores every field, adopting
nothing is a blank document rather than a half-cleared one, a document parked
while another was adopted comes back whole, the toolbar label follows the swap
(it is the only thing on screen naming the file Ctrl+S writes to, and it lives
in `toolbar.js` rather than in the module holding the path), Turndown's options
follow the style, and **neither pair writes to storage** — which key a tab is
persisted under belongs to the tab list, not to the modules the state lives in.
Registered in `tests/run.mjs`; 831 checks green.

CLAUDE.md is not updated yet. It describes the running code, and nothing calls
either pair until the tab list exists; the architecture section is rewritten
when tabs are real rather than describing two functions with no callers.

## 2026-09-07 — `b35b8da` — Per-tab storage, and the migration onto it (TODO 4.1)

Stage two of the tabbed view. Still one document, still nothing on screen that
was not there before — what changed is where the open document is persisted, and
that there is now a file whose job is to know.

**[front/tabs.js](front/tabs.js) is new.** It owns which documents are open,
which one is showing, and where each is stored. None of the state itself lives
there: `filePark`/`fileAdopt`, `markdownStylePark`/`markdownStyleAdopt` and
`undoPark`/`undoAdopt` already keep it in the modules that own it. It joins
`index.html` and `SHELL_ASSETS` and deliberately **not** `ASSETS` — an exported
document holds one document and has no file API. `sw.js` goes to `v1.27`.

**Its place in the load order is load-bearing in both directions.** After
`app.js`, which defines `DOCUMENT_KEYS`; and before `file-api.js`, which reads
the open file's path, dirty flag, mtime baseline and last-browsed directory out
of storage at its own load time and so has to be handed the active tab's key by
then. That is the whole reason it sits at index.html line 220 rather than at the
end.

**Six key literals became one indirection.** `documentKey(name)` in `app.js`
resolves `content`, `source`, `path`, `dirty`, `mtime` and `dir`; `DOCUMENT_KEYS`
holds the flat names they had while Mandy could only hold one document, and
`tabDocumentKey` in `tabs.js` scopes them to the active tab when that file is
loaded. Without it — an exported document, and every test suite that boots these
modules without `tabs.js` — the flat names are what everything resolves to, so
the single-document path is the fallback rather than a second implementation of
the same thing. `file-api.js` lost its four `*_KEY` constants to it, and the
three `"markdownContent"` write sites scattered across `app.js`, `file-api.js`
and `format-bar.js` go through it too.

**The migration is the part that can destroy something.** Moving a document from
the flat names onto `mandy-tab-1-*` copies, reads each value back under its new
name, and only then deletes the originals. `localStorage` offers no transaction,
and a blown quota does not always announce itself by throwing — Safari's private
mode has historically accepted the write and stored nothing, which is why the
read-back is there rather than a bare `try`. A failure anywhere rolls the
partial copies back and leaves every original where it was, and the session then
runs on the flat names exactly as it did before tabs existed: one document, no
list, nothing lost. Better than a tab list pointing at storage the document is
not under. Ids are never reused, for the same reason `cleanPosition` had to
become per-tab: a recycled id inherits whatever of the previous tab's keys was
not cleaned up.

**21 more checks in [tests/tabs.test.mjs](tests/tabs.test.mjs)**, 854 green. The
migration moves every key and deletes the flat ones; a session that already has
a list does not migrate again; a stored active id outside the order falls back
to the first tab; a corrupt list is treated as no list rather than throwing
during load; and both ways a write fails — throwing, and reporting success while
storing nothing — leave every flat key intact, no half-migrated tab keys behind,
no list written, and the document still on the toolbar with its filename. The
harness gained a `quiet` option so those deliberate failures stop printing
warnings that read like a suite going wrong.

**[CLAUDE.md](CLAUDE.md)** gains the `documentKey` rule, what `tabs.js` owns and
where it has to sit, and why the migration is shaped the way it is. The two
places naming `markdownContent`, `mandy-dirty` and `mandy-file-mtime` as literal
keys now name the roles instead.

## 2026-09-07 — `bbd0aa2` — TODO 4.1 gets its stages, and a rule about writing them down first

The two tabs commits already landed said "first landing of the tabbed view" and
"stage two of the tabbed view", referring to a sequence that existed only in the
conversation that produced them. 3.1 has had the right shape all along —
[REWRITE.md](docs/REWRITE.md)'s stage table, one exit criterion per row — and
4.1 had nothing equivalent, so the CHANGELOG was pointing at something no reader
could resolve.

**TODO 4.1 now carries five numbered stages** with an exit criterion and a
standing each: state boundaries and storage are done and tested, the hazards, N
tabs and the bar are not started. It also records the ordering claim that was
only ever spoken aloud — **stage 3 before stage 4 is a safety property rather
than a preference**, because the four late-read sites are unreachable with one
document and go live the moment there are two, so they close before a second tab
can exist rather than after one could already have written the wrong file.

**Three behavioural calls are recorded with it**, having also lived nowhere.
Open replaces the current tab's document as it does today and stays behind
`confirmDiscard`; New makes a tab instead of resetting the document in place,
which drops it out of that guard's callers and leaves the guard covering Open
and Reload; closing the last tab leaves one blank untitled tab rather than a
no-document state that five modules have no null case for. New's current body
survives the change of role — blanking the document and dropping the autosave,
the sniffed style and the file association is exactly what closing the last tab
has to do, so it becomes a reset primitive with two callers rather than a
handler with one. Clear is untouched either way.

**[CLAUDE.md](CLAUDE.md)'s "Making a change" section gains the general rule.**
Anything more than trivial gets written down before it is built — what is
changing, what the stages are, what each entails — and each stage's standing is
updated as part of the landing rather than afterwards. Work does not start
before the plan is written. No code.

## 2026-09-07 — `b9b7d4e` — The switch lock, and a flushable autosave (TODO 4.1, stage 3)

Stage 3 of the tabbed view: the four late-read hazards closed before stage 4
makes a second tab possible, so they are never reachable rather than fixed after
one could already have written the wrong file. No behaviour change — there is
still one tab, and nothing yet calls the gate that landed.

**`fileOperationInFlight()` in [file-api.js](front/file-api.js)** answers
whether the document may be swapped right now. Every file operation has an await
between naming a path and touching the bytes, and the worst is `saveFile`: it
takes a path, awaits `confirmOverwrite` and possibly the entire save browser,
and only then reads `editor.innerHTML`. A counter rather than a flag, because
the operations nest — `saveCurrentOrPrompt` calls `saveFileAs` calls `saveFile`
— and a boolean would be cleared by the innermost one's exit while the outer was
still running, which is exactly the window this exists for. It is also true
while the file dialog is open in its own right: `showOpenDialog` returns as soon
as the dialog is rendered and the pick arrives later on a click, so the counter
alone would leave the whole picking phase unguarded. `openFile` still takes its
own turn regardless, because the entry click closes the dialog *before* calling
it and does not await it.

`checkDiskChanged` and `checkServerAvailable` are deliberately outside it. They
run on every window focus and every `visibilitychange`, so locking on them would
refuse switches at moments with nothing on screen to explain why.

The five operations keep their bodies in a `…Body` function behind a two-line
wrapper rather than taking the turn inline: the guard stays visible at the top
of each, and an inline `try`/`finally` would have re-indented all five and
buried the guard inside the thing it guards. The `finally` is not decoration —
`openFile` awaits both renderers outside its own `try`, so a renderer that
throws throws out of the operation, and a turn left behind would refuse every
switch for the rest of the session.

**`tabsSwitchAllowed()` in [tabs.js](front/tabs.js)** is the single gate stage
4's switch and stage 5's Ctrl+Tab both call, so there is one answer to "may the
document be swapped" rather than one per entry point. It is where the keyboard
gap gets closed: `.notify-backdrop` and `.file-dialog` are both full-viewport
`inset: 0` overlays, so a mouse cannot reach a tab bar behind one, but four
`document`-level `keydown` listeners fire straight through an open dialog.

**`flushAutosave()` in [app.js](front/app.js)** makes the 1s debounce forcible,
which the lock cannot help with because autosave is not a file operation. The
timer resolves `documentKey("content")` when it *fires*, so a switch inside that
second would write the incoming tab's content under the incoming tab's key —
correctly — and the outgoing tab's last edits would be written nowhere at all.
Autosave is the only thing carrying unsaved work across a browser reload, so
that is real loss. `format-bar.js`'s own 100ms `saveSoon` needs no equivalent:
after a flush it rewrites the incoming tab's content under the incoming tab's
key, redundant rather than wrong.

**The four late-read sites are untouched, and that is the settled answer** — the
lock rather than per-site capture. One rule in one place beats four, and
capturing early would write the document as of the Save click rather than as of
the confirm.

**16 more checks**, 870 green. Each of the three additions was mutation-tested
rather than assumed: breaking the predicate, dropping the `clearTimeout` and
replacing the `finally` with a trailing decrement each had to fail something.
The third one initially failed nothing — the "does not leak its turn" check was
driving an operation that *returns* early rather than one that throws, so it
proved nothing about the `finally`. It now drives a renderer that throws, and
the check is renamed to say which of the two it covers.

## 2026-09-07 — `801db70` — Two documents, and the swap between them (TODO 4.1, stage 4)

Stage 4 of the tabbed view: the list operations, and the state hydration behind
them. Two documents can now be open at once and switched between — from the
suite, which is the only thing that calls any of it. Nothing in the app makes a
second tab yet, for the same reason stage 3 changed no behaviour: a tab the user
can neither see nor get back from is worse than no tabs, so New is rewired in
stage 5, in the landing that makes a tab visible.

**`switchToTab(id)` in [tabs.js](front/tabs.js), and the order inside it.**
`tabsSwitchAllowed()` first; then `flushAutosave()`, while `documentKey` still
resolves to the outgoing tab — the whole reason stage 3 built it, since a flush
on the far side of the flip would write the outgoing document under the incoming
tab's key and the outgoing tab's last edits would be written nowhere; then park
all three bundles onto the outgoing record; then flip `activeTabId`; and only
then swap `editor.innerHTML` and adopt. Two orderings inside the adopt are
load-bearing. **Content before adopt, always**: `undoAdopt` trusts the bundle to
describe what is on screen and never re-snapshots, and `undoAdopt(null)` takes
its fresh baseline from whatever is in the editor at that moment. **Undo before
file, always**: `cleanPosition` is an id minted inside one history bundle, so
the file state has to land on top of the history it was measured against — get
it backwards and a dirty document reports clean, which switches off the
unsaved-work guard and the `beforeunload` warning together, and only when two
tabs' edit counts line up, so no manual pass would ever find it.

**`newTab()`** parks the active document and appends a blank one. Named for what
New does rather than as the opposite of `closeTab`, because `openTab` sitting one
letter from the `openTabs` list it pushes onto is a line nobody should have to
read twice. Appended rather than inserted beside the active tab: the bar has no
other ordering to offer yet.

**`closeTab(id)`** forgets the tab's six storage keys and drops the record, so a
close leaves no orphans under an id nothing will resolve to again. It
deliberately does not flush and does not park — the document is being thrown
away, and flushing would write it straight back under the key just removed.
Closing the last tab leaves one blank untitled tab on a *fresh* id, never the
one just closed, for the same reason ids are never reused anywhere here. It asks
nothing: `confirmDiscard` reads the *active* document's dirty flag and filename
and cannot ask about a background tab at all, so guarding a close belongs to the
close control, exactly as Open and Reload guard at their own call sites rather
than inside what they call. That control is stage 5 and the guard arrives with
it.

**Hydration, for a tab this session has never shown.** A tab restored from a
page load is an id and six storage keys: no parked bundle, and no undo history,
which does not survive a reload. So an adopt with no bundle reads storage
instead — `fileAdoptStored()` in [file-api.js](front/file-api.js) and
`markdownStyleAdoptStored()` in [app.js](front/app.js). Both are the load-time
restore *reused* rather than a second reading of the same keys:
`restoreCurrentFile` stopped being an IIFE and became a function with two
callers, and the window-load path now goes through the markdown one. A clean
restored tab gets a savepoint minted in the history that is now live; a dirty one
gets none, because there is no state left to undo back to — which is precisely
what a page load already does with the one document it brings back.

**`beforeunload` asks whether anything would be lost, not whether the document
on screen would be.** `tabsBackgroundDirty()` reads a background tab's unsaved
edits out of its parked bundle, or out of its own `dirty` key when this session
has never shown it. Their *content* needed no new work: parking flushes it under
the tab's own key before the swap, so a background document is already written
by the time the window closes. Which tab it is still cannot be named — the
browser shows its own string and will not wait on us — and that stays accepted
rather than solved.

**A real bug, found by making the suite drive the real undo stack.**
`applyUndoSnapshot` in [undo.js](front/undo.js) dispatched its synthetic `input`
event *before* moving `history.current`, and `file-api.js`'s own input listener
asks `undoPosition()` from inside that handler — so it was told the document was
still in the state undo had just left. Undoing back to the last save went on
reporting `plan.md (edited)`, and the unsaved-work guard went on asking about a
document that matched its file byte for byte. The position moves first now. It
could not surface before: [tests/file-path.test.mjs](tests/file-path.test.mjs)
stubs `undoPosition` and drives file-api.js's half of the savepoint correctly,
and [tests/undo.test.mjs](tests/undo.test.mjs) drove the real stack but had no
listener asking where the document was — the failure lived exactly in the seam
between the two suites, which is what stage 4 needed closed.

**One drive-by fix, using the primitive stage 1 added.** New cleared the three
markdown globals by hand and never called `pushMarkdownStyleOptions`, so
Turndown kept the previous document's bullet marker and emphasis delimiter into
the next file saved. `markdownStyleAdopt(null)` is what those three assignments
were trying to be. `focusDocumentStart()` came out of the same handler, since
every route that replaces the document wholesale now ends there.

Driven by hand in Chrome as well, from the console, since nothing in the app
reaches these yet: a second tab made, edited, switched away from and back to,
undone in — the undo handing back that tab's own text rather than the other's —
and closed, leaving no key behind and, at the last one, a blank untitled tab on
a fresh id.

**57 more checks, 927 green** — and the tabs suite now loads `undo.js` for real
rather than stubbing it, because what is under test is an ordering and a stub
would have agreed with any order at all. Nine mutations, each of which had to
fail something: swapping the adopt order, parking without the flush, dropping
the gate, adopting a missing bundle instead of hydrating, reusing a closed tab's
id, leaving its storage behind, dropping the background-dirty fallback, dropping
the `beforeunload` clause, and putting the undo dispatch back before the
position. All nine were caught.

## 2026-09-07 — `1f0bffd` — The tab bar (TODO 4.1, stage 5)

The stage where the previous four become reachable. `.toolbar-content` — the
row that has held nothing but a filename since the menu bar split the toolbar
in two — is the tab bar, and New makes a tab.

**The bar is a container from [toolbar.js](front/toolbar.js) and a fill from
[tabs.js](front/tabs.js)**, the same arrangement `.toolbar` itself has and for
the same reason: `html-export.js` hand-writes its own copy of the page shell, so
markup in `index.html` would be a second copy to keep in step. `buildFileLabel()`
became `buildTabBar()` and ships an empty `#tabBar`; an exported document still
gets no second row at all.

**`renderCurrentFile()` in [file-api.js](front/file-api.js) delegates to it.**
That function was already the single "the active document's identity changed"
hook — every `setDirty`, `setDiskChanged`, `setCurrentFile` and adopt ends there
— so the bar redraws from the one place the text label used to, and the dot
cannot fall out of step with the flags without every other consumer falling out
with them. The module hands over three fields through the new
`fileDescriptor()`; `tabDescriptor` in `tabs.js` reads those for the document on
screen, the parked bundle for a tab this session has shown, and the tab's own
storage keys for one restored by a page load. Three sources, one shape, one
drawing function.

**The `(edited, disk changed)` text became a dot**: `var(--notify-error)` for
edited whether or not the disk also moved, `var(--text-toolbar)` for
disk-changed-only, nothing when clean. Colour is never the only channel — the
whole sentence is the tab's `aria-label`, and its `title` carries the full path
with it, which is where a path goes now that a tab shows the basename alone.

**The dot says "edited" for an untitled document, which the label did not.**
That gate was one condition covering two questions. With no filename on screen
there was nothing for "(edited)" to attach to, so both marks were gated on a
path; a tab supplies the subject and the questions come apart. Disk-changed
really is meaningless with no file open, but unsaved work in a document that was
never saved anywhere is the *most* urgent version of edited — and
`beforeunload` has always agreed, since `documentIsDirty()` never cared whether
there was a path. Left as inherited, the bar and the close-the-window warning
would have disagreed about the same document.

**New makes a tab.** Nothing is discarded, so nothing is asked, and New drops
out of `confirmDiscard`'s callers — leaving that guard covering Open, Reload and
now closing a tab. Its old body survives as `resetDocument()` in
[app.js](front/app.js), which an exported document's New still calls: an export
ships no `tabs.js` and has nowhere to put a second document. `file-api.js`'s own
`"new"` hook returns early when `tabs.js` is loaded, since it exists to drop the
file association after an in-place reset and there is no in-place reset left for
it to follow.

**Closing asks by switching first.** `confirmDiscard` reads the *active*
document's dirty flag and filename, so a background tab is a subject it cannot
name. `requestCloseTab` makes the dirty tab the active one and then asks the
question unchanged — which is why this needed no extra parameter on the guard
and no second implementation of it. A clean tab closes with neither a switch nor
a dialog.

**Ctrl+Tab and Ctrl+1–9, and what is actually known about them.** The bindings
cycle and pick by position (Ctrl+9 is the last, the convention every browser tab
strip teaches), with Left/Right along the strip while focus is in it, since
`role="tablist"` promises them. All of them go through `switchToTab`, so stage
3's gate covers them without any of them testing its own conditions — which is
what that gate was built for, four `document`-level `keydown` listeners firing
straight through an open dialog.

Every one of these is a binding some browser claims for its own tab strip, and
two separate things have to be true before ours works: the keydown has to reach
the page, and `preventDefault` has to suppress the browser's own action. So
this stage also ships **[tests/tab-shortcut-check.html](tests/tab-shortcut-check.html)**,
in the shape of `paste-check.html` — no server, no app, open the file. Measured:
Chrome 148 on macOS delivers all of them and reports each as cancelable, which
is unsurprising there, since macOS switches browser tabs on Cmd+1–9. Not
measured: Windows and Linux, where Ctrl+1–9 *is* the browser's binding, and
Firefox and Safari anywhere. The shipped set is provisional and TODO 4.1 says so
rather than the code implying otherwise.

**`--toolbar-height` follows the row.** `--content-height` is now a `max()` of
the toggle and `--tab-height`, itself derived from the tab's padding and font
size. The toolbar ships empty and paints before `toolbar.js` runs, so a
reservation still computed from the old filename's font size would have settled
into a different shape and jumped everything below it.

**The DOM stub learned that `innerHTML` drops children.** [tests/dom.mjs](tests/dom.mjs)
kept it as a plain property, so `el.innerHTML = ""` — how `front/` empties a
container it rebuilds — left every child in place. The bar redraws that way on
every state change, and a suite reading the result would have seen each document
several times over, each row a different age.

**46 more checks, 975 green.** `file-path.test.mjs` stopped reading a rendered
label and now reads the state behind it: that suite drives when each mark is
true, and the tabs suite drives what is made of it. Thirteen mutations, each of
which had to fail something: reversing the dot's precedence, ungating the marks,
appending on redraw, letting a close click also select, asking without switching
first, ignoring the answer, making Ctrl+9 the ninth, unscoping the arrows,
making New reset in place, drawing nothing for an unlisted document, dropping
the marks from the label, cutting the delegation out of `renderCurrentFile`, and
putting the old height arithmetic back. All thirteen were caught.

Driven by hand in Chrome as well: New made a second tab, the bar switched by
click and by Ctrl+2, an edit raised the dot, closing the edited tab asked the
three-way question and Escape backed out of it, and closing the clean one went
straight out — with the session's own document put back afterwards.

## 2026-09-07 — `6a076ae` — Retire the tabbed-view item, and keep the one thread that outlives it

All five stages have landed and been driven in a browser, so TODO 4.1 leaves
[docs/TODO.md](docs/TODO.md) the way a finished item is supposed to: what was
done and why is in the six entries above this one, which is the better place to
read it, and a list of open work reads better without a 380-line closed item in
the middle of it.

**What survives it is not a tabbed-view thread at all.** The bar's keyboard
bindings — Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1–9 — are measured in exactly one
browser on one platform, and the platform is the one that cannot settle the
question: macOS switches browser tabs on Cmd+1–9, leaving Ctrl+1–9 free, while
Windows and Linux use Ctrl+1–9 for precisely what we bind. So that becomes
**TODO 4.2**, a measurement item pointing at
[tests/tab-shortcut-check.html](tests/tab-shortcut-check.html), which says what
is known (Chrome 148 on macOS delivers all of them and reports each cancelable),
what is not (every other platform, Firefox and Safari anywhere, and whether the
browser's own strip actually stays put, which no script can see), and what the
fallback would be if a binding turns out to be unavailable. Keeping a five-stage
feature alive to hold one measurement is what makes a TODO file unreadable.

**Numbered 4.2 rather than reusing 4.1.** Reuse is this file's documented norm
and normally costs nothing, but a dozen dated entries above say "TODO 4.1"
meaning the tabbed view, and minting a different 4.1 in the same week would make
every one of them ambiguous to whoever reads them next.

**Twenty-four references chased**, which is the part of retiring an item that
[CLAUDE.md](CLAUDE.md) warns about: numbers get reused, so a comment pointing at
one becomes a comment pointing at somebody else's work. Every live `TODO 4.1` in
`front/`, `tests/`, [docs/REWRITE.md](docs/REWRITE.md),
[docs/ROADMAP.md](docs/ROADMAP.md) and CLAUDE.md now names the thing instead of
the number — "the tabbed view", "New makes a tab" — which is what those comments
were actually about and cannot go stale. The dated CHANGELOG entries keep
theirs: they are a record of what was true when they were written.

**One stale comment fixed while chasing them.** `buildToolbar` in
[toolbar.js](front/toolbar.js) still described the second row as "the filename
today, a tab bar once there is more than one document open", sitting directly
above the code that builds the tab bar — and it overlapped an older sentence
about a filename's auto margin holding the aside right, which stopped being true
when the row gained `space-between`. Both are now one comment that describes
what is there.

**Three headers backfilled** with the hashes their commits turned out to have —
stage 3's had been missed as well as stages 4 and 5.

No behaviour change, and the suite is untouched at 975 green — nothing in
`tests/` reads a comment, but the source-scanning suites do read those files, so
it was worth the run.

## 2026-09-08 — `222f967` — The docs re-read against the tabbed view, before the rewrite starts

A spec-only pass over `docs/`, CLAUDE.md and the README, asking of each claim
whether it survived the six tabs entries above. Most did. What did not, and what
was ambiguous enough to be read either way:

**[docs/REWRITE.md](docs/REWRITE.md) was written the day before tabs landed and
still spoke of them as future.** The Undo section's savepoint requirement said
"whichever lands first pays for it once" — tabs landed first and paid, so it now
records how (`cleanPosition` travels in the file bundle, `adoptActive` adopts
undo before file) and what the new history therefore has to keep: either
document-scoped ids parked with the bundle, which is what makes that ordering
load-bearing, or global ids, which retire it. The fate table gains `tabs.js`, and
a new passage under it says what the rewrite changes for tabs and nothing else:
the swap moves a model reference rather than an HTML string, so "content before
adopt" is re-derived rather than inherited; the switch lock stays by default,
with the model-handle alternative named and left to reintegration; hydration
loses its markdown half. It also settles something the old text glossed: the
`content` key holds HTML today, per tab, and the first load after the rewrite
lands has to convert it once through Turndown rather than discard an autosave
that may be the only copy of unsaved work. Smaller: "`file-api.js`'s eight
`innerHTML` assignments" was eight across four files, and says so; the
`markdownSource` literal became the `source` key; the "four check pages become
one" count was wrong twice over, since only the three that watch the core retire
and `paste-check` and `tab-shortcut-check` stay; and "1.5 and 4.1 become
straightforward" named an item that no longer exists.

**TODO 1.6's edited-marker half may already be fixed.** Stage 4 found and fixed
`applyUndoSnapshot` dispatching `input` before moving `history.current`, which
produces exactly "undo to the savepoint, marker stays lit". The item now says so,
unverified against its reported case, and keeps the caret half as the part 3.1
closes. **TODO 1.2** changed shape too: following a relative link opens a tab
now, so the unsaved-work guard it said it lacked is not needed, and what is
missing is path resolution and a new tab inheriting its parent's directory. The
preamble's example marker read *(needs 4.1)*, pointing at nothing.

**D4 still counted "the hard half of tabs" among what the rewrite retires**; it
does not, and the sentence says what it does change instead. **ROADMAP.md's
save-fidelity section** described the 2N-copies answer as a settlement rather
than shipped code, called losing the source copy "cosmetic" when the cost is a
whole-file rewrite on the next save, and named the storage key by its old
literal.

**CLAUDE.md's test list and the README's had no `tabs` row**, and the README
still said New asks about unsaved work, the filename says `(disk changed)`, and
Paste and Copy markdown live in Edit — three things the running app has not
done for some time. Fixed in place; TODO 6.1 still owns the rewrite.

**`front/welcome.md` told a new user the bar "says *(edited)*" beside the
filename.** It now describes the tab bar — one tab per document, the two dots,
the full path on hover — and the shortcut list gains Ctrl+Tab, Ctrl+Shift+Tab
and Ctrl+1–9, Ctrl on the Mac as well since the binding excludes the Command
key on purpose. `welcome.md` is a shell asset, so `sw.js` goes to `v1.30`; the
`undo` and `notify` suites are the two that read that file, and both stay
green.

**TODO 4.3 is new, and undecided:** a tab is named by its basename alone, so
two open files with the same name draw two identical tabs, and a long name is
cut at the end, which is where the extension is. The item records the scheme
to try — disambiguate only on collision with the shortest trailing directory,
truncate in the middle, count untitled documents — and that all of it is
`buildTab` over the paths `openTabs` already holds, with the `title` and
`aria-label` keeping the full path whatever is drawn. Nothing in it touches
the core.

## 2026-09-09 — `f3080e7` — TODO 6.4, and the sentence the README was missing

**TODO 6.4 is new: open HTML, save markdown.** Prompted by a search that turned
up the "HTML is the new markdown" argument — that a 3,000-word agent-written
spec is an unreadable wall of markup, and the fix is to generate HTML instead.
The premise is right and the conclusion inverts D0. A wall of markup is a
presentation problem, and answering it with a second, heavier markup is the move
D0 already diagnoses in YAML: treating "the syntax is unfriendly" as the
question when the question is why a person is reading source at all. What
follows from the argument is not a format change; it is an editor, which is this
project.

What does follow is import. If specs arrive as HTML, Mandy should take them, and
the item scopes that deliberately narrowly: **one way in, markdown from then
on.** Not a second document format — `markdown-style.js` is markdown-specific
top to bottom, so D1 has no HTML implementation and could not get one cheaply,
and MARKDOWN.md settled on 2026-09-07 that raw HTML is neither rendered nor
authored. Opening HTML as an editable format would need a second fidelity stack
*and* contradict that. The way back out already exists twice, in
`static-export.js` and `html-export.js`, and needs nothing.

The entry records the two findings that make it small. The conversion is
`htmlToMarkdown` then `markdownToHtml` — two functions already in `app.js` —
with `markdownStyleAdopt(null)` between them, which already exists and is
already documented as "a document that has never had markdown read into it",
exactly what an import is. And sanitising is free rather than a component to
build: Turndown parses into a detached document, markdown-it runs `html: false`,
so the pipeline escapes what it cannot convert, provided the imported string
never reaches a live node before conversion. Four stages, all *not started*: the
server's single extension gate splits so that **reading widens and writing does
not**, the branch in `openFileBody`, the decision that an imported file is
*imported rather than opened* (`setCurrentFile(null)`, so Ctrl+S becomes Save As
under a `.md` name), and a case in the `file-path` suite.

It reaches nothing in the core, so it neither waits on 3.1 nor is discarded by
it — after the rewrite the same conversion is REWRITE.md's paste path with a
file instead of a clipboard.

**The README gained one sentence**, first in the "Why Mandy?" list, because the
argument above is the project's thesis and the file made the case nowhere: the
answer to a wall of markdown is an editor that renders it, not a heavier format
to write it in. TODO 6.1 still owns the full rewrite; this is one line of it
that was worth not waiting for.

No code changed, so nothing was run — `tests/` reads none of these three files.

## 2026-09-09 — `6400cb4` — TODO 4.4: right-to-left documents

**A View toggle that puts `dir="rtl"` on `#editor`, and nothing else.** The
document flips; the toolbar, the outline's side and the dialogs stay where they
are. Mirroring the application is a different and much larger feature, and the
entry says so rather than leaving the scope to be discovered.

The design question is not the CSS, which is three physical declarations inside
`#editor` becoming logical ones. It is that **markdown cannot hold direction**,
and the item treats that as the design rather than as a gap. There is no
CommonMark syntax for it; `<div dir="rtl">` in the file would contradict the
`html: false` position MARKDOWN.md settled on 2026-09-07; frontmatter is a
concept this project does not have. So direction is Mandy's opinion about the
file rather than the file's content — a per-document preference, with a flipped
document saving to a `.md` byte-identical to its unflipped self. Per-document
rather than global like the theme, because tabs make the global answer wrong
immediately: two files open side by side can want different answers. The
asymmetry is recorded rather than left to be found — `dir` is an HTML attribute,
so both exports can carry the setting and the markdown never will.

Two things the entry pins down because they are the ones that bite. The key is
named `direction`, not `dir`: `DOCUMENT_KEYS.dir` is already the last browsed
*directory*, which is exactly the collision class CLAUDE.md's load-order section
warns about. And **code stays left-to-right** — under bidi, `const x = 1;` in an
RTL block renders with its punctuation in the wrong place, so one `direction:
ltr` rule on `pre` and `code` is the difference between flipping the document and
flipping it correctly.

Six stages, all *not started*, and the last of them is a measurement rather than
code: the format bar positions itself from `offsetWidth` and a `left`, and a
caret rect inside an RTL block is a thing to look at rather than reason about. A
check page if it misbehaves, not before. `tabs.js` turns out to need nothing —
it iterates `Object.keys(DOCUMENT_KEYS)` at all three places that matter, so a
seventh key is picked up rather than enumerated a fourth time.

It reaches nothing in the core, so it neither waits on 3.1 nor is discarded by
it. No code changed, so nothing was run.

## 2026-09-09 — `a79d10a` — The rewrite starts: stage 0, the block-model spike

**TODO 3.1 begins, on branch `rewrite`, with the stage the plan calls a gate
rather than a first step.** REWRITE.md gained a "Where each stage stands"
section — one line per stage, *done and tested* / *done, untested* / *not
started*, updated as part of each landing — and TODO 3.1 points at it, so the
failure CLAUDE.md warns about (a CHANGELOG entry announcing "stage two" of a
sequence nobody can find) has somewhere to not happen.

[spike/block-model.html](spike/block-model.html) is the stage itself: one
self-contained page, no server and no app, holding a block array parsed by the
same markdown-it 13.0.1 the app loads, rendering one block to one child of
`#editor`, intercepting `beforeinput` and mapping `(block, offset)` both ways.
Throwaway code, and the header comment says so — it is not the first draft of
`front/`, it exists to be typed into in three engines and then thrown away.

Three things in it are the design rather than the prototype. **Every
`beforeinput` is cancelled**, the implemented ones and the rest alike, so the
DOM can only change through render — which is what makes the divergence check
mean anything: after every render the page compares each block's DOM text to
its model text and says so on screen. **Deletions are read from
`getTargetRanges()`**, so graphemes, word deletion and "a deletion spanning two
blocks is a merge" are one path rather than three reimplementations. **A
composition is handed to the engine whole** and read back at `compositionend`
by a prefix/suffix diff, which is the accent popup's shape as much as an IME's.

Everything but paragraphs and headings is kept whole as its source and rendered
read-only. A schema is stage 1; the input layer can be measured without one.

Measured in Blink (Chrome 152, macOS): typing, typing over a selection, a word
selection that survives a re-render still selected, the bold toggle, and a
refused edit inside a read-only block — all through real input, all with the DOM
matching the model. Enter and Backspace went through synthesised `beforeinput`,
because the automation to hand delivers a trusted keydown and no editing command
for either, so the split, the merge back onto its original offset, the heading
opening a paragraph and the composition read-back are proven in the model and
unmeasured in any engine. The fixture round-trips byte-identical, and one typed
character leaves exactly one block off its source — D1 in miniature.

**The gate is half open, and the entry says which half.** Chrome, Firefox and
Safari still have to be driven by a person's hands before stage 1 starts. The
spike also turned up one question for stage 2 to decide rather than inherit:
typing over a fully-bold selection currently gives plain text, because a new run
inherits the marks to its left.

Nothing in `front/` or `server/` changed and no suite reads the spike, so
nothing was run.

## 2026-09-10 — `9abe7ba` — Abbreviation on the roadmap; underline and center dropped

**Of four extended-syntax constructs the user asked about, abbreviation is
recorded as a post-1.0 nice-to-have, subtext as a distant maybe, and underline
and center are dropped.** A row in [docs/MARKDOWN.md](docs/MARKDOWN.md)'s
extended-syntax table under a *Hacks page / non-standard* heading, a decision
bullet beside the existing deprioritised batch, and the argument in a new
[docs/ROADMAP.md](docs/ROADMAP.md) subsection.

**Underline** has no markdown spelling and its `_word_` form is the `_`
emphasis delimiter, so taking it would re-read every `_`-italicised file; any
other route means reopening `html: false` / D0 for a `<u>` that reads as a
broken link on the web. **Center** (`->text<-`) is `<div align>`-family
block presentation S1 already refuses, with delimiters that collide with typed
text. Neither earns the decision it would force.

**Abbreviation** (`*[HTML]: …`) stays — the one with broad ecosystem support
(Markdown Extra, Python-Markdown, `markdown-it-abbr`). The first draft called
it a fidelity problem; corrected here. An untouched file round-trips for free
via the 3.1 source span, contingent only on the invisible-block model type the
reference-link definitions are already adding — where the nodeless `*[…]:` line
parks. The edited case is bounded work: a one-line Turndown rule unwrapping
`<abbr>` to text, a `scanAbbreviationDefinitions` + re-emit pair mirroring the
reference-link one, and a whole-document whole-word match walk that skips the
four opaque subtrees. Authoring is deferred, parse-and-render first, the cut
line heading IDs took. **Subtext** (Discord's `-# text`) is kept only as a
distant maybe: it needs the same block-presentational-attribute the model
lacks, plus another line-start marker `reflowMarkdown` must not strand.

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-10 — `4293b6c` — TODO 6.5 and 6.6: what breaks when Mandy is not on loopback

**Two bugs found fitting Mandy behind Atrium as a chamber, recorded rather than
fixed.** 6.5: [sw.js](front/sw.js) answers navigations, and re-issuing one with
`fetch()` drops `Sec-Fetch-Mode` from `navigate` to `cors`, so an auth gate in
front reads a page load as an XHR and returns a bare 401 where the login
redirect belongs — no login page, and no document loaded to notice. The fix
costs the offline boot, which is why it is not one line; guarding on
`navigator.onLine` buys most of it back, and whether the header really is erased
on every engine wants a check page before either version lands.

**6.6:** `/tests/:name` and `/report` exist in every deployment. Neither is a
hole — the check pages match a literal set, and `/report` ignores its body — but
`/report` writes unbounded request text to the process log, and 6.3's binary and
any hosted instance put both on something other than loopback. They should not
exist rather than be guarded: register them only under `MANDY_DEV`.

No code changed, so nothing was run.

## 2026-09-10 — `9c92604` — TODO 4.5: the reopened PWA never asks about the file

**A file that changed while the installed PWA was closed is not reported when
the app comes back**, recorded rather than fixed. Nothing is lost — Reload
still takes the newer file — so what goes missing is the reason to press it,
which is the entire job of the mark.

[file-api.js](front/file-api.js) has three wake points, and one of them, the
startup IIFE, exists for exactly this shape of launch, so the interesting
question is which of three it is: the relaunch is a restore rather than a page
load, so neither the IIFE nor — per engine, per platform —
`focus`/`visibilitychange` runs; or it is a page load whose `mtime` key did not
come back; or the file server was not up yet, which gates the startup check and
then leaves it waiting on a `focus` that a window which already has focus never
fires. `checkDiskChanged` swallows its errors on purpose, so all three look
identical from outside — the item is a measurement before it is a fix, and not
one a check page can make: an installed PWA, an OS-level close and a file
edited in between are not things a page can arrange for itself.
`checkServerAvailable` shares those listeners and the same gap, so one fix
covers both, and both checks are already idempotent — which is the argument for
adding wake points rather than hunting the one true event.

No code changed, so nothing was run.

## 2026-09-10 — `529ee82` — The spike says what to do with it

The stage-0 page measured the right things and never said what a person was
supposed to press, which left the pass criterion in `docs/REWRITE.md` and the
tester in a browser. It now carries the protocol itself: six numbered actions
with checkboxes — type, Enter, Backspace, Ctrl/Cmd+B on a word, the accent
popup, and an edit refused inside the read-only list — and what decides it,
including the failure that is easy to miss because nothing visibly happens, an
action that produces no Events row at all. A criterion belongs where the person
judging it is standing.

Only the page's intro markup and three CSS rules changed; the model, the input
layer and the checks are untouched, and no suite reads this file, so nothing
was run.

## 2026-09-10 — `73f4078` — The spike passes in three engines, and finds a live bug on `main`

**Stage 0's gate is open.** Typing, Enter, Backspace, the accent popup and the
refusal inside a read-only block were driven by hand in Blink, Gecko and WebKit,
and all three behave with the divergence line quiet. That is the question the
spike existed to ask — will an engine say what it is about to do and let us do
it instead — and the answer is yes everywhere, so REWRITE.md's stages proceed in
order and stage 1 may start.

**One of the six failed, and chasing it found something older.** Ctrl/Cmd+B
bolds in Blink; Gecko on macOS gives the key to its own bookmarks sidebar and
the page never sees it; WebKit does nothing at all. That is keyboard routing
upstream of `beforeinput` rather than a hole in the interception — and it turns
out `main` has the same gap today: `app.js` binds Ctrl+S, Ctrl+O, Ctrl+Shift+P
and Ctrl+K and never binds a format shortcut, so bold-by-keyboard has been dead
in two engines out of three, silently, for as long as there has been a format
bar. It took a spike measuring something else to notice, which is the argument
for the check pages in one sentence.

So three things changed. REWRITE.md's input-layer section no longer claims the
engine's shortcuts *arrive* as `formatBold` — they do where they do, and the
shortcut is bound as a `keydown` where they do not, with the `format*` handler
ignoring an event that lands after a keydown already did the work, or the two
cancel out. The spike binds it that way and reports whether the key reached the
page at all. And **TODO 1.7** records the bug, the fix's home in 3.1 stage 2,
and the half no script can answer: whether `preventDefault` actually suppresses
what the browser wanted the key for. It is 4.2's shape, with one difference
worth stating — 4.2 has Alt+1–9 to fall back to and 1.7 has nothing, because
Cmd+B *is* the convention.

`front/` is untouched, so nothing was run; the spike is not read by any suite.

## 2026-09-11 — `ade3cde` — Stage 1 begins: the model parses, and hands back exactly what it read

**`front/model.js` and `tests/model.test.mjs`, and nothing in `front/` loads
either.** The model joins none of the three registries until stage 4, so the
running editor is untouched by this and by every slice after it.

What the model is: an ordered list of blocks, each carrying the exact bytes it
arrived with and the exact bytes that followed it. Serialising concatenates
them, so **a file that is opened and saved unedited comes back byte for byte
because nothing ever threw the bytes away** — not because a restore pass got
most of it back. That is the inversion the whole rewrite is for: today Turndown
rewrites the document and `restoreSourceWrapping` matches content to put it
back, and content-matching is defeated by two identical paragraphs in a way a
source span cannot be.

Two things fall out that used to be work. **Reference definitions get a home**:
markdown-it consumes a `[label]: url` line and emits no token, which is why
`appendReferenceDefinitions` has to collect them all at the end of the file
regardless of where the author put them — here the line is simply a block that
renders to nothing, in its own position, and a definition wrapped onto a second
line (invisible to `scanReferenceDefinitions` today) is just a taller one. And
**a container's `map` runs to the blank line after it**, so the trailing blanks
are handed back to the separator; without that an edited list would lose or
double that line depending on which side of the seam the emitter thought it was
on.

The suite is the first with no DOM in it at all, and the first with a
dependency: it parses `CLAUDE.md`, `README.md`, `welcome.md`, `docs/TODO.md` and
`docs/REWRITE.md` with a real markdown-it, pinned in a new root `deno.json` the
way `server/deno.json` already pins Hono. Flagged per CLAUDE.md and chosen over
vendoring, with the cost written down: **that pin and `front/index.html`'s CDN
tag are two halves of one version and move together**. `npm test` needs no new
flags and is 1016 checks.

Two of its checks exist only to stop the round trip passing by doing nothing. A
parse that found no blocks would leave the whole file in the prefix and hand it
back unchanged — byte-identical, and worthless.

**And it immediately found the thing that would have sunk the stage.**
`docs/TODO.md` is 584 lines and sixteen blocks, because a section's bullet list
is one top-level token; the largest is 239 lines, 41% of the file. Editing one
TODO item would rewrite 41% of the file — the unmergeable diff D1 exists to
prevent, and *worse* than the three-layer restore this replaces, which splits on
list markers for exactly this reason. REWRITE.md gains slice 1b: containers get
children that tile their span the way blocks tile the file, recursively. Not
started, and recorded as not optional.

## 2026-09-11 — `2ed418f` — CLAUDE.md catches up with the branch it is on

Someone opening this file on `rewrite` could read all fourteen hundred lines of
it and not learn that a second document model exists in `front/`. Six additions
fix that, and the first one is the one that matters.

**A "This branch" section, before anything else.** It says what a reader has to
know before they trust a single line below it: the rewrite has replaced nothing,
everything here still governs changes to the running editor, and what the branch
has added — `model.js`, the spike, the model suite, a root `deno.json` — sits
beside that editor rather than inside it. It points at REWRITE.md's "Where each
stage stands" for status, because a status kept in two places is a status kept
in neither.

**A section for the model itself**, in the same shape as every other
architecture note: the invariant that every character lands in exactly one of
`prefix`, a `source` or a `separator`; the parser being injected rather than
reached for, which is what makes the suite possible at all; `modelTouch` as the
only door to `source = null`, because that assignment *is* the contract with D1.
It ends with what the model cannot do yet, including the list-granularity
regression measured on 2026-09-11 — the section says 41% of `docs/TODO.md` in
the same breath as it says the model is byte-perfect, which is the honest pair.

**The three-registries rule gains its one deliberate exception.** `model.js`
joins none of them, and that is what keeps the running editor untouched while
the model is built beside it. Skipping a registry is otherwise a bug, so the
exception is written down next to the rule rather than discovered.

**TODO 1.7 reaches the format-bar section**, where it belongs: no format has a
shortcut of Mandy's, bold-by-keyboard is dead in two engines out of three, and
it has been for as long as there has been a format bar. That is a fact about the
*shipped* editor and had no home in this file at all.

Plus the spike page listed with the five check pages it is a sibling of, with
which of them it replaces when the rewrite lands, and a note that `npm test`
now wants the network once.

No code changed — this is one metafile — so nothing was run, per this file's own
rule about it.

## 2026-09-12 — `a3bd2b8` — `main`'s three docs-only commits merged into `rewrite`

**Nothing in `main` had touched code since the branch left it, and the merge
confirms it: `CHANGELOG.md`, `docs/TODO.md`, `docs/ROADMAP.md` and
`docs/MARKDOWN.md`, no `front/` and no `server/`.** The only conflict was the
CHANGELOG's tail, where both sides had appended; the two runs are interleaved by
commit time rather than concatenated, so `main`'s three 2026-09-10 entries sit
where they happened — before the spike's two evening entries, not after stage 1.
The last of them was also still missing its hash, which is backfilled here to
`9c92604`.

**Three of the four additions survive 3.1 untouched, as they say they do.** TODO
4.5 is `file-api.js`'s wake points and the rewrite never reaches them; 6.5 is
`sw.js` answering navigations, which is the service worker's business and not
the core's. 6.6 is the one that turns out to interact, and not in the direction
its own note assumed — see below.

**The abbreviation roadmap item's stated dependency is already discharged.**
[ROADMAP.md](docs/ROADMAP.md) and [MARKDOWN.md](docs/MARKDOWN.md) were written
on 2026-09-10 against an invisible-block type "the reference-link definitions
are already forcing 3.1 to add", in the future tense, quoting REWRITE.md's own
future tense back. Stage 1 slice 1 landed it the next day: every source line no
top-level token covers becomes a block of kind `gap`, in its own position,
carrying its own bytes. Both files now say so. The tense was the whole of the
error — nothing about the item's shape changes, and it costs the model nothing
further, because an unparsed `*[…]:` line is an ordinary paragraph today and
only becomes a `gap` if `markdown-it-abbr` is ever the parser consuming it,
which is the case `gap` already handles.

**TODO 6.6 may be answered by deletion rather than by the env var it proposes**,
which is worth knowing before the var is built. `CHECK_PAGES` holds exactly
three names, and those same three are the only pages that `POST /report`. All
three retire with execCommand. So the rewrite empties the set and orphans the
sink in one move, and two endpoints that serve nothing are removed rather than
gated — unless 3.1's own input-layer check page wants a sink back, which the
precedent argues against, since the spike, `paste-check` and `tab-shortcut-check`
all run off disk with no server. Recorded in the item.

**One status line was stale and is corrected**: REWRITE.md's "Where each stage
stands" still headed stage 0 *done, measured in one engine of three*, two
paragraphs above its own body saying it was driven by hand in Blink, Gecko and
WebKit on 2026-09-10 and the gate passes. The headline is the part that section
exists for, so it is the part that has to be right.

No code changed — the merge carried none and this entry adds none — so nothing
was run.

## 2026-09-12 — `4878171` — Stage 1 slice 1b gets its plan, and the slice list gets its markers

**TODO 3.1's next piece is written down before it is built, per this file's own
rule about it.** [REWRITE.md](docs/REWRITE.md)'s "Where each stage stands" had
slice 1b as a paragraph of argument with no plan under it; it now carries six
numbered steps, a measurement that decides what the steps can reach, what it
deliberately does not, and an estimate.

**The measurement first, because it is what the steps are shaped by.** Child
tokens have to carry a `map` for the recursion to have anything to tile with,
and not all of them do: `list_item_open` does at every depth (19 at level 1 and
23 at level 3 in `docs/TODO.md`), `tr_open` and `thead_open`/`tbody_open` do,
and **`td_open` does not at all** — so the row is the floor for a table and a
cell cannot be made a sub-block from the token stream. Recorded as a table in
the entry.

**The numbers behind 1b are re-measured and one of them is new.** `docs/TODO.md`
is 708 lines now rather than the 584 the entry was written against — `main`'s
three items and 6.6's note landed in it — so the largest block is a third of the
file rather than 41% of it. The sharper figure is the one that was not there
before: **93% of that file's lines sit inside a list, a quote or a table**, and
so inside one block each. `REWRITE.md` is 49%, `CLAUDE.md` and `README.md` 37%.
Top-level granularity does not mostly work and fail at the edges; on the
planning documents it barely works at all.

**The six steps, in short:** generalise `modelTopLevelSpans` to a token slice
and a level, with today's behaviour as its level-0 case; children tile a
container's `source` the way blocks tile the file; `modelSerialise` recurses, so
an edited item re-emits itself and its ancestors re-emit as a concatenation
around it and **no sibling is ever re-serialised**; `modelTouch` walks up and
clears ancestors, which buys a parent link and costs the model being
`JSON.stringify`-able; each item records its marker and content indent at parse
for slice 3's emitter; and the suite asserts the share-of-file metric, not only
the round trips. Two to three days, additive to the stage's one-week line rather
than inside it, since 1b was found after that table was written.

**Three gaps in the same section, one of them worse than it looked.** Slices 2,
3 and 4 carried no status marker, though one per line is what that section is
for — they now read *not started*, *not started*, and *scaffolded 2026-09-11 and
grows with each slice*, which is the honest state of slice 4: the scaffold, the
file oracle, the `npm:markdown-it` pin and 39 checks landed with slice 1, and
only per-slice coverage is left, so that line closes when 3 does.

**The third was a rendering bug.** `1b.` is not a number markdown can count to,
so the slice list was parsing as two ordered lists — one item, then 2/3/4
restarting — and the six paragraphs indented under `1b.` were an **indented code
block**, not prose, because an 8-space continuation under a 4-space non-marker
is four spaces too deep. The slices are bullets now, with their numbers in the
bold lead where markdown cannot misread them, and the section says why so the
next inserted slice does not repeat it. A scan of all six metafiles found this
was the only instance.

**One cross-reference written and withdrawn in the same pass:** a note in slice 2
pointing at the typing-over-a-bold-selection question. The spike turned that up
and assigned it to *stage* 2, core-to-parity, explicitly as a model-command
decision rather than an input-layer one — not to stage 1's slice 2, which is the
data structure and not the commands over it. Removed rather than reworded.

No code changed — `front/model.js` is untouched and this is one metafile plus
this entry — so nothing was run, per this file's rule about it. The
measurements above were taken by driving the existing `modelParse` and
markdown-it over the repo's own files, not by changing either.

## 2026-09-12 — `bdd89c7` — Tile any nesting level, not only the file's own

TODO 3.1 stage 1, slice 1b, step 1 of six — the plan is in
[docs/REWRITE.md](docs/REWRITE.md)'s "Where each stage stands" and landed in the
entry above this one.

`modelTopLevelSpans(tokens)` is now `modelSpansAtLevel(tokens, level)`. That is
the whole change: the filter that read `token.level !== 0` reads
`token.level !== level`, the scan for a container's closing token matches that
level rather than 0, and `modelParse` asks for level 0 — so the model the app
does not load yet behaves exactly as it did, and a container is still one block.
What it buys is that the same function, handed a container's token slice and its
level plus one, tiles that container into its children: a list into its items, a
quote into the ordinary blocks inside it, a table into its head and body and
then into rows. Step 2 is what turns those spans into blocks.

**The reason this is a day's work and not a second slice 1** is that a `map` is
an absolute line range in the file at every depth, so `modelLineOffsets`,
`startOf` and `endOf` are untouched and there is no coordinate translation
anywhere to get wrong. Measured rather than assumed: twelve checks in
`tests/model.test.mjs` drive the function directly, since nothing in the model
reaches a second level yet, and they pin the spans at each depth by exact file
line numbers — 51 checks in the suite now, up from 39.

**Two of those twelve are for step 2 rather than for this step.** A line inside
a container can belong to none of its children — a table's delimiter row and a
blockquote's bare `>` are both unclaimed — so step 2 has to reuse `takeGap`
inside a container rather than assume the children cover the span; and children
nest inside their parent and never overlap each other at any depth, which is the
invariant step 2 rests on, since two siblings claiming the same bytes would write
those bytes into the file twice. Both are true today and are asserted now so that
the step that depends on them cannot land on an assumption.

**One clause is belt-and-braces rather than measurement.** An `inline` token is
skipped by type as well as by level. markdown-it puts it one level below the
block that carries it, so a container's children are never inlines and the clause
never fires today — but an inline treated as a span would overlap its own
parent's and emit those bytes twice, while with the guard the worst case is a
`gap` block holding them exactly once. The same trade the rest of this file
keeps making: a wrong shape beats a destroyed file.

Ran the `model` suite alone rather than `npm test`, per the rule in CLAUDE.md:
`front/model.js` is loaded by that suite and by nothing else in the repo. 51
checks, no failures.

## 2026-09-12 — `bdd89c7` — A container's children tile its own bytes

TODO 3.1 stage 1, slice 1b, step 2 of six. Step 1 generalised the tiler; this
turns what it finds into blocks, so a list now holds its items, an item holds
the blocks inside it, a quote holds its paragraphs and a table holds its head,
its body and their rows — recursively, to a depth of five on `docs/TODO.md`.

**The invariant is slice 1's, one level down**: `leading` plus every child's
`source` and `separator`, in order, is the parent's own `source`. It holds at
every depth on all five repo files the suite drives. Two further checks exist
because that loop passes vacuously on a model with no children anywhere — which
is precisely the state slice 1 was in — so the suite also asserts that
`docs/TODO.md` comes back as 53 containers nesting five deep.

**One refactor rather than a second parser.** `modelParse`'s body is now
`modelTileRange(ctx, spans, from, to)`, which tiles *a* line range; the file is
that function over `[0, lines.length)` at level 0, and a container is the same
call over its own span at its own level plus one. `prefix` and a container's
`leading` turn out to be the same field one level apart, and `takeGap` and the
trailing-blank trim needed no change at all, having always been written against
a line range rather than against the file. Recursion is on *having children*
rather than on a list of container kinds: a paragraph's only child token is its
`inline`, which the tiler skips, so leaves fall out instead of being enumerated
and there is no kind list to update when a construct gains a level.

**A child's `source` is its lines, whole, so it carries its own container's
marker.** The paragraph inside `- one` has `- one` for its source, and a
paragraph inside a quote starts at `> `. That is what byte-exactness wants —
nothing else claims those characters — and it is asserted rather than left
implicit, so step 5, which records the marker and the content indent as data for
the emitter, cannot quietly change it.

**Four behaviours fell out of the tiling rather than being built for:**

- **A tight list stays tight and a loose one loose.** The blank line between two
  items is the first item's separator, which is the same information
  `markdownSegments` carries today and for the same reason.
- **A table's delimiter row and a blockquote's bare `>` are gap blocks** in their
  own position, by the mechanism reference definitions already used — step 1
  found both lines unclaimed and said step 2 would need it.
- **A reference definition inside a list item stays inside that item**, indent
  and all, where `appendReferenceDefinitions` on `main` hoists every definition
  to the end of the file regardless of where the author wrote it.
- **An empty item or quote is a leaf holding its own marker**, not a container
  with nothing in it. Leaves carry `children: null` rather than an empty array,
  because "has children" is the test step 3 serialises on and an empty array
  answers yes.

Four kinds arrived with the children — `item`, `table-head`, `table-body` and
`row` — and the suite now asserts no block at any depth in CLAUDE.md is of an
unknown kind, not just the top-level ones. The row is the floor, per the plan:
`td_open` carries no `map`, so a cell is not a sub-block.

**What has not changed yet is the output.** `modelSerialise` does not recurse —
that is step 3 — so a container still emits its own `source` and an edited one
would still re-emit whole. The granularity is in the model and not yet in the
file, which is why the share-of-file metric stays step 6's to assert.

Ran the `model` suite alone per CLAUDE.md's rule, `front/model.js` being loaded
by that suite and by nothing else: 74 checks, no failures, up from 51. The five
round trips and every edge case in the suite pass unchanged with the recursion
on, which is the thing to check hardest — children that did not tile their
parent would show up there first.

## 2026-09-12 — `bdd89c7` — An edited block inside a list re-emits, and its siblings do not

TODO 3.1 stage 1, slice 1b, step 3 of six, and the payoff of the slice.
`modelSerialise` now delegates to `modelEmitBlock(block, emit)`, which has three
cases in a load-bearing order: a block that still has its `source` emits those
bytes; an edited block **with children** emits `leading` and then each child and
the separator that followed it; an edited leaf goes to `emit`, which is stage 1's
slice 3 and still throws until that exists.

The middle case is the whole change, and it is literally the inverse of step 2's
tiling invariant rather than anything arranged on top of it. Because case 1 is
first, every untouched child on the way down is handed back as bytes, so **no
sibling of an edited block is ever re-serialised, at any depth**.

**The measurement, on `docs/TODO.md`:** the first bullet in the file is a 10-line
paragraph, inside a 97-line item, inside the file's largest top-level block — the
239-line list. Editing it asks the emitter for that paragraph **once**, rewrites
exactly its bytes, and hands back the other 698 lines of the file untouched.
Before slice 1b the same edit re-serialised all 239 lines, which is a third of
the file and the unmergeable diff D1 exists to prevent. The suite asserts the
bytes *and* the call count, because a serialiser that re-emitted a sibling
correctly would pass the byte check and have thrown the guarantee away.

**Two consequences worth naming.** An edited container needs no emitter at all —
it is a concatenation of bytes that already exist — so only a leaf can reach
slice 3, the only part of this that has to invent markdown. And an item is never
the block that emits: it holds a paragraph, so the paragraph is what is asked
for, and the bytes it owns start at the item's own marker.

**One thing is deliberately still broken, with a check pinning it.** Touch a
child and nothing else and the container above it still carries its own bytes,
so case 1 hands those back and the edit is simply gone. That is the same
silent-wrong-file failure `modelTouch` exists to prevent one level up, and step 4
— `modelTouch` walking up to clear ancestors — is what fixes it; the check here
is the thing that step gets to flip. **Nothing may edit a child until it lands**,
which is why this entry does not claim the model can edit a list.

`leading` is emitted because the invariant includes it, not because any document
produces one: a container's first child starts on the container's own first line,
and all 420 containers across this repo's markdown files have it empty. Measured
and asserted rather than assumed, since an emitter that dropped it would be right
on every file here and wrong on the first one that was not.

Ran the `model` suite alone per CLAUDE.md's rule: 81 checks, no failures, up from
74. The five round trips matter most here — a recursion that emitted a child
twice, or dropped a separator, shows up there before anywhere else.

## 2026-09-12 — `bdd89c7` — Touching a block clears the containers above it

TODO 3.1 stage 1, slice 1b, step 4 of six, and the step that makes the three
before it safe to use. `modelTouch` now walks up: every block carries a `parent`,
set by the tiler where the children are attached, and touching a block clears its
`source` and every ancestor's.

**Why it is not an optimisation.** `modelEmitBlock`'s first case emits a block
that still has its `source` and never looks at its children, so an edited item
under an untouched list re-emitted into nothing: the edit lost, the document right
on screen, the old bullet in the file. That is the same silent-wrong-file failure
`modelTouch` exists to prevent one level up, one level out. Step 3 pinned it with
a check precisely so this step had something to flip, and flipping it is what the
suite shows.

**It clears the whole chain rather than stopping at the first ancestor already
cleared.** Depth is five on this repo's deepest document, and a stop condition
would be a second rule about when an ancestor may keep its bytes — there is no
such case, and inviting one costs the file.

**The cost is named rather than hidden: the model is cyclic now**, so it is not
`JSON.stringify`-able, which the suite asserts so the limit is discovered here
rather than from a stack trace later. Nothing has ever needed to serialise the
model as JSON, and the alternative was searching the tree for a parent on every
keystroke.

Six checks. One touch at a child clears every container above it and **nothing
beside it** — a sibling item keeps its own bytes; a top-level block has no parent
to walk to; and every child's parent throughout `docs/TODO.md` is the container
whose `children` it is in, a link to the wrong block being the one failure in this
step that writes into the file. The sharpest case is the deepest: a bullet nested
in a bullet, five blocks down, unique in the file — one `modelTouch`, one emitter
call, exactly that block's bytes replaced, and the other 700-odd lines the bytes
that were read. The step-3 test lost its by-hand ancestor walk in the process and
now touches the leaf alone, which is what any real edit will do.

The slice's mechanism is complete with this. What is left is step 5, recording an
item's marker and content indent as data for slice 3's emitter, and step 6, the
share-of-file metric the suite should assert rather than a human measuring it
once.

Ran the `model` suite alone per CLAUDE.md's rule: 87 checks, no failures, up from
81 — with the one deliberate failure in between being step 3's pinned hazard,
which this step inverted.

## 2026-09-12 — `bdd89c7` — Every list item carries its own marker

TODO 3.1 stage 1, slice 1b, step 5 of six. Nothing in the round trips needs this:
an item's `source` is its lines whole and already carries the marker it was
written with. It is recorded for slice 3's emitter, which has to write the marker
and the continuation indent back when the item is edited — and reading them off
the source at emit time would be a second place that can disagree with this one,
about the pad above all, which is a document's own convention
(`sniffMarkdownStyle` reads it for exactly that reason) rather than something to
regenerate.

`modelItemPrefix(firstLine)` is a pure function over one line, so the suite drives
the rules directly instead of through a document — the same split `isGhostElement`
has from its traversal in `markdown-style.js`. It returns the marker exactly as
written, indent and pad included (`- `, `*   `, `    - `, `1.  `, `10) `), and
the continuation indent as **the marker with every character but a tab replaced by
a space**. One rule rather than two: the width is right by construction, and a tab
survives as a tab instead of being counted as one column.

**Measured on the five files the suite drives.** All **273** items carry a marker.
Every one agrees with what markdown-it itself reported as that item's `markup`
(plus `info` for an ordered item's number), so a pattern that had drifted from
what the parser saw would fail here rather than in somebody's file. And of the 197
items that have a continuation line, all 197 carry exactly the indent that line
actually uses — the claim `contentIndent` rests on, asserted rather than assumed.
The counts are thresholds in the suite and exact only here: the oracle is five
files this project edits by hand.

A `null` marker means a line markdown-it called a list item does not start with
one this pattern recognises. The fields stay null there, so slice 3 has nothing to
emit from rather than the model inventing a marker the file never had.

**One thing is left open rather than decided, and written down as open.** A
blockquote's `> ` chain is the same problem — a paragraph inside a quote has
`> quoted` for its source, and slice 3 has to put that back too. Either record a
prefix at parse the way this records a marker, which is symmetric and keeps one
place to be wrong, or strip and re-apply the chain at emit time, which keeps 1b
scoped at the cost of the second disagreeing place this step exists to avoid. The
shapes differ — a marker is a first line plus an indent, a quote's prefix is on
every line and nests — and **there is nothing in this repo to measure it on: all
nine of its markdown files contain zero blockquotes.** So it goes to whoever
writes slice 3, with the measurement taken first; REWRITE.md's step 5 carries both
sides, and its slice 3 entry points at them.

Ran the `model` suite alone per CLAUDE.md's rule: 102 checks, no failures, up from
87.

## 2026-09-12 — `bdd89c7` — The suite owns the number, and slice 1b is done

TODO 3.1 stage 1, slice 1b, step 6 of six, and with it the slice. The cases in the
five entries above say the mechanism works on the shapes we thought of; this says
what it is worth on the files this project is written in, and says it in the suite
rather than in a CHANGELOG entry somebody measured once.

The unit is a **leaf**: a container re-emits as its children, so what reaches
slice 3's emitter always has none. Four checks, with the numbers in their labels
so a run reads as a report rather than a row of ticks:

- **Editing the worst block in `docs/TODO.md` rewrites 15 of its 708 lines
  (2.1%)**, asserted under 5%. Before this slice the same edit cost 239 lines.
- **Its largest top-level block is still 239 lines (34%)**, asserted over 25%.
  That is the guard on the first number: it has to have moved because of
  sub-blocks, not because the file got shorter or its lists got smaller. The
  block is still sitting there in the model; what changed is that nothing
  re-serialises it.
- **No file's worst edit is a tenth of it** — CLAUDE.md 1.9%, README.md 2.8%,
  welcome.md 7.4%, TODO.md 2.1%, REWRITE.md 2.2%.
- **All 697 blocks across those five files, edited one at a time, rewrite exactly
  their own bytes and nothing else.** The exhaustive version of the single-bullet
  case from step 3. It re-parses per block, because `modelTouch` clears ancestors
  and a second measurement on the same document would be measuring a document with
  an edit already in it — 0.6s for the sweep, the most expensive thing in the
  suite and the strongest claim in it.

**One thing that sweep taught on its first run, and is now a comment next to it:**
the sentinel it edits with must share no character with the files at either end. A
sentinel beginning with a space let the common prefix run one character into the
replacement against the indented continuation paragraphs inside list items, so the
region measured came back a byte shorter than the block — a check weakening
without failing, which is the failure mode worth naming.

**And one check from step 5 became a threshold, having failed for the right
reason.** "Every item in those five files has a marker" asserted the exact count,
269, and the entry describing that check added four bullets to REWRITE.md — so
documenting the work broke the test about it. The oracle here is five files this
project edits by hand; an exact count makes every documentation change a failing
test about list items. The count is in the check's label, where a human reads it,
and the assertion is `> 200`.

Ran the whole `npm test` this time rather than the one suite, since this is the
slice landing rather than a step inside it: **1083 checks, no failures**, of which
`model` is 106, up from 102. Nothing outside `front/model.js` changed in the
slice, and the fourteen other suites confirm it — `model.js` is still loaded by
nothing but its own suite, which is what keeps `main`'s editor untouched until
stage 4.

**Where slice 1b leaves stage 1.** Slices 2 and 3 are next: the inline model a
block is edited *through*, and the emitter that turns an edited leaf into markdown
in the conventions its file uses. The one thing 1b hands slice 3 and the one thing
it deliberately does not are both recorded in REWRITE.md's step 5 — an item's
marker and content indent, and a blockquote's `> ` chain, which is open with both
options argued and nothing in this repo to measure either on.

## 2026-09-13 — `1e35a14` — Plan stage 1 slice 2, the inline model

No code. [docs/REWRITE.md](docs/REWRITE.md)'s stage-1 entry gets slice 2's plan
before the slice is built, the way 1b got one — six steps, what it deliberately
does not reach, and three open questions with both sides argued.

**The plan is written on a measurement, and the measurement changed the plan.**
Across all nine of this repo's markdown files: **no inline child token carries a
`map` — zero of 11,644.** The obvious move after 1b is to tile one level down
again, and that reading is what says not to. 1b tiled because a list was one
block and editing an item rewrote a third of the file, which was a *fidelity*
failure a source span fixed. There is no such failure here: an edited paragraph
re-serialising whole is what *What is accepted* already promised, and every
untouched paragraph is covered by its block's own `source`. So the absence costs
nothing, and deriving inline spans would mean a second parser free to disagree
with the first, bought for a guarantee nobody asked for. **Slice 2 is about
editability, not fidelity** — a structure addressable by offset, mutable by a
command, emittable by slice 3.

What else that pass turned up, all of it now in the plan:

- **Every mark's delimiter is in `markup` as the author wrote it** — `_` against
  `*`, `__` against `**`, one backtick against two. So emphasis fidelity is
  per-node here, which is strictly better than the per-document guess
  `sniffMarkdownStyle` has to make, and free.
- **Four spellings markdown-it discards**: a code span's padding (`` ` a ` ``
  and `` `a` `` both give `a`, and the padding is *required* when the content
  opens or closes with a backtick), an escape (`\*not em\*` gives the text
  `*not em*`), a link's angle-bracket destination (`[t](<u v>)` gives `u%20v`),
  and a hard break's spelling (two trailing spaces and a trailing backslash both
  give a bare `hardbreak`). **The answer to all four is the same and it is the
  reason for the rewrite: back the way it was written.** The parser threw the
  spelling away, the model still has the bytes, so the model records what the
  parser discarded — at parse, on the node, exactly as 1b's step 5 already does
  for a list item's marker. Only genuinely new content has nothing recorded, and
  that follows the document's own convention, which MARKDOWN.md's **S3** already
  settled for these two in particular. Record first, sniff second, house style
  never — so the target stays byte-identity, as everywhere else in the model.
- **Escaping is narrow and silent**: 117 of 11,377 text tokens, 1.0%. The two
  properties that put a thing in this repo's suite.
- **Links are the only construct whose spelling is not in `markup` at all.**
  Re-emitting the tree naively reproduces `inline.content` for 86.8% of blocks
  and *every* mismatch is a link, so step 5 rebuilds them from `attrs` plus the
  `data-ref-label` stamp.
- **`inline.content` is the block's source with the list marker and continuation
  indent already stripped**, wrapping preserved as `\n`. So slice 3's three
  transforms compose and each already belongs to somebody: the tree emits
  `content`, `reflowMarkdown` re-wraps, 1b's `marker` and `contentIndent` go
  back in front.

**Three constructs have no oracle in this repo at all** — strikethrough, hard
breaks and reference definitions occur exactly zero times in nine files, beside
the blockquotes 1b already found none of. The plan names them rather than
letting the coverage look uniform; they need hand-written fixtures, which is a
weaker kind of evidence than the file oracle and should be read as one.

**One open question, not three.** Whether to extract `math` and
`referenceAwareLink` out of `app.js` so the suite's bare parser can see what
ships, or stub them — the better option is not the smaller one, and the deciding
question is whether stage 4 has to extract them anyway. The other two were not
open on inspection: the hard-break spelling is **S3 in MARKDOWN.md, settled**,
and 1b's blockquote question is answered by the same "back the way it was
written" rule as everything in step 3 — the work still lands in slice 3, the
choice does not travel with it.

**Two live figures in 1b's own entry moved, and were corrected rather than left
standing**: the five files now hold **728** leaves, not 697, and `REWRITE.md`'s
worst edit is **1.8%** of it, not 2.2% — both because this entry's own plan made
`REWRITE.md` 180 lines longer. The CHANGELOG entries above keep the readings
they landed with, being a record of a day rather than a description of now.

`npm test` run despite this touching no code, for the one reason that applies
here: **`docs/REWRITE.md` is one of the five files the `model` suite drives as
its oracle**, so writing a plan into it really can fail a test about list items
— which is exactly what 1b's step 5 note records happening. **1083 checks, no
failures**, `model` still 106.

## 2026-09-13 — `1e35a14` — A torture fixture, because the repo's own prose is a biased oracle

[tests/fixtures/torture.md](tests/fixtures/torture.md), 364 lines, and the
`model` suite now drives it as a sixth oracle file alongside the five documents
this project maintains by hand.

**Why the five were not enough.** They are the right files to test against —
they are what a regression would actually damage — but they are a biased sample
and the bias runs one way. Every one of them was written or reformatted in a
single voice, so they are uniformly well-formed; and between them they contain
**no blockquote, no hard break, no strikethrough and no reference definition at
all**. A suite driving only those reports full marks on constructs it has never
once parsed, which is what it had been doing.

The fixture reads as a field report and is a torture test underneath: at least
one of everything in [docs/MARKDOWN.md](docs/MARKDOWN.md), six levels of list
nesting, three levels of blockquote, a fence inside a longer fence, markdown
inside code that must not be parsed, ragged table padding with all four
alignment spellings, both hard-break spellings, all three fence characters, all
three rule characters, setext *and* ATX headings at every level, mixed `-`/`*`/`+`
and `.`/`)` markers changing per depth, tabs beside spaces, escaped everything,
and the constructs markdown-it does not parse yet — task lists, heading ids,
footnotes, definition lists, front matter — which have to round-trip as literal
text until they do. It is legal markdown everywhere and consistent nowhere.

It round-trips byte-identical, tiles at every depth — **85 containers, 13 deep,
where the deepest real file here reaches 5** — and every one of its 163 leaves,
edited alone, rewrites exactly itself with one emitter call.

**It found two things on its first run, and neither was reachable from any file
in this repo.** Both are pinned as checks rather than quietly fixed, the way 1b's
step 3 pinned a hazard for step 4 to flip:

- **A list item inside a blockquote gets no marker.** A child's source is its
  lines whole, so such an item's first line starts `> 1. `, and
  `modelItemPrefix` looks for a marker at the *start* of the line. It returns
  null rather than inventing one, which is the safe direction — and it leaves
  slice 3 with nothing to emit from. This is 1b's step-5 blockquote question
  turning up as a measurement instead of an argument, and it settles it:
  recording the `> ` chain at parse makes these items ordinary, while stripping
  and re-applying at emit time leaves them broken at parse where the emitter
  cannot reach.
- **A tab-marked item derives a continuation indent the file does not use.**
  `modelItemPrefix` builds `contentIndent` by replacing every character of the
  marker but a tab with a space, so `"-\t"` gives `" \t"` where the file itself
  continues under a bare `"\t"`. Both land on column 4, so nothing looks wrong;
  they are different bytes, which is the only currency this model deals in. The
  fix is not a cleverer derivation but not deriving — an item with a
  continuation line states its own indent — and that reverses a rule 1b's step 5
  argued for in writing, so it is recorded and left to be decided rather than
  changed in passing.

`ORACLE_FILES` replaces the file list that had been written out five times, so
there is one place to add the next one.

**And today's slice 2 plan was corrected where it had got this backwards.** Step
3 had argued that because markdown-it discards a code span's padding, an escape,
an angle-bracket destination and a hard break's spelling, re-emission should aim
at a fixpoint rather than at bytes. That is the wrong answer to the question this
whole rewrite exists to answer: **the parser threw the spelling away, the model
still has the bytes, so the model records what the parser discarded** — at parse,
on the node, exactly as 1b's step 5 already does for a list item's marker. Only
genuinely new content has nothing to put back, and that follows the document's
own convention, which MARKDOWN.md's S3 settled for the hard break in as many
words: "the rewrite's whole point is better sniffing, so these are not a special
case." Two of the three questions the plan recorded as open were therefore not
open — one was already settled in MARKDOWN.md and the other is answered by the
same rule. One remains: whether to extract `math` and `referenceAwareLink` out of
`app.js` so the suite tests what ships.

`npm test`: **1087 checks, no failures**, `model` 110, up from 106.

## 2026-09-13 — `1e35a14` — An item's continuation indent is read, not reconstructed

`modelItemPrefix` in [front/model.js](front/model.js) takes the item's first
non-blank continuation line as a second argument and records **that line's own
indent**, falling back to deriving one from the marker only where the item has
no continuation line. The bug this fixes was found by
[tests/fixtures/torture.md](tests/fixtures/torture.md) hours after it was added,
and no file in this repo could have found it: not one of the five documents the
suite drove before indents a list with a tab.

Deriving replaced every character of the marker but a tab with a space, so the
marker `"-\t"` produced the indent `" \t"` — while a file that indents with tabs
continues under a bare `"\t"`. Both land on column 4, so the document renders
identically and nothing looks wrong on screen. They are different **bytes**,
which is the only currency this model deals in, and slice 3 would have written
an edited item back into the file under an indent its author never used. That is
the whole failure mode D1 exists to prevent, arriving through the one field in
1b that was reconstructed rather than recorded.

**The fix is not a cleverer derivation, it is not deriving.** An item with a
continuation line has already stated its indent; reading a fact beats
reconstructing it, which is the rule the rest of the model already runs on. 1b's
step 5 argued the other way in writing — that reading the indent at *emit* time
would be a second place free to disagree with the first — and that argument
survives untouched, because this reads it at parse, where there is still exactly
one place.

**A written indent is believed only when it lands on the marker's own content
column**, tab stops at four per CommonMark (`modelIndentColumn`). A lazy
continuation carrying no indent at all, or a line the author pushed further in,
is not a plainer spelling of the same indent but a different one, and the derived
value stands. So the new rule can only ever swap one indent for another of the
same width — which is exactly the bug and nothing else.

Five checks replace the one that was pinned this morning: the oracle sweep now
asserts that **every** continued item carries the indent its own lines use, tabs
included, plus the tab case that used to be wrong and the three that must not
become wrong in the fixing — a lazy continuation, a continuation pushed past the
marker's column, and an item with no continuation line at all. The comment above
them records that the same assertion passed before the fixture existed, which is
the point of the fixture.

Left open deliberately: **a list item inside a blockquote still gets no marker**,
because a child's source is its lines whole and the marker sits behind a `> `.
That is not a bug in the pattern but slice 3's blockquote-prefix question, and
the fixture's two such items stay pinned as a check until it is answered.

`npm test`: **1091 checks, no failures**, `model` 114, up from 110.

## 2026-09-13 — `1e35a14` — D7, and the parser question closed

A question about where two markdown-it rules should live turned out to rest on a
premise nobody had ever decided, so the premise is now a decision and the
question is closed with it.

**The premise.** `math` and `referenceAwareLink` are registered on the
markdown-it instance `app.js` builds, so the model suite — which builds a bare
one — can see neither a `math` token nor a `data-ref-label` stamp. Slice 2's
steps 3 and 5 are exactly the two that need them. Three ways were on the table,
and the one that nearly won did so on the argument that moving the rules would
"touch a file the app loads", during a branch that had touched none.

**That property was never a goal.** `main` keeping a working editor until parity
is sequencing — it is the whole of what D6 settled — and it had hardened in
CLAUDE.md, in REWRITE.md and in `model.js`'s own header into something stronger
and unearned: that the running editor was a thing to be preserved, and that a
slice reaching a file the app loads had spent something. Read that way it argues
for exactly what the rewrite exists to stop — leaving code where it does not
belong because moving it would disturb something.

**D7 in [docs/DECISIONS.md](docs/DECISIONS.md)** records what the rule actually
is. The current core needs the document in two forms at once, markdown and DOM,
and nearly everything around it exists to keep the two in step: the
normalisation after every command, the hand-rolled list surgery, the
content-keyed index and the sniff-and-restore layers, the copies in
`localStorage`, the stashes that keep Mermaid and LaTeX source alive. None of
that is markdown being difficult; it is the cost of not owning the document. So:
a change that fixes something or makes a workaround unnecessary **is** the work;
preserving current behaviour is worth having when it is cheap and not when it
means bending over backwards; and a change that exists to stay bug-compatible
with the DOM or an engine is refused outright. Markdown is a messy enough
specification without carrying the browser's mess into a core built to be free
of it. The order of repair is model first — that is what the suite is for, and a
correct model makes a browser fix simpler, which is the opposite of this
project's experience twice over.

**So the rules move into a file of their own, as step 0 of slice 2.** The model
is defined as *markdown parsed by this parser*, which makes the parser's
configuration part of the model layer; it sits in `app.js` by accident of
history, in among the Turndown rules, the editor bootstrap and the keyboard
handling. The other two options are recorded in REWRITE.md with why they lost:
a copy of the rules written for the suite is **not a test at all**, and having
the suite borrow the real rules through `tests/dom.mjs` — measured today, and it
does work — still leaves the app building its parser one way and the suite
assembling it another, with the configuration in the wrong file.

**And slice 2 now has nothing open.** The blockquote question closed the same
day on the fixture's measurement, and what is left in that section is the
reasoning rather than the debate, because a decision with its reasons deleted is
one that gets reopened.

The framing pass that followed: CLAUDE.md's branch note and its `model.js`
section, `model.js`'s own header, REWRITE.md's stage-1 note, and TODO 3.1 — which
was also **eleven days stale**, still saying the stage-0 gate was half open and
that no engine had been driven by hand, three days after all three were.

`npm test`: **1091 checks, no failures.**

## 2026-09-13 — `627f3cb` — TODO 1.8 and 2.2: line breaks, which nothing makes and the save path eats
Two items filed after a question that had a worse answer than expected: is there
any way in Mandy to put a line break inside a paragraph, without starting a new
one? No — and it turns out that even the browser's own answer does not survive a
save.

**TODO 1.8 — nothing in Mandy inserts a line break.** All thirty menu items were
checked; there is no control, no format-bar button, and no binding. `app.js`
binds Ctrl+S, Ctrl+O, Ctrl+Shift+P and Ctrl+K and never Shift+Enter, and the
hand-rolled empty-`<li>` Enter handler explicitly bails out when `shiftKey` is
set. A break is reachable today only because `contenteditable` inserts a `<br>`
on Shift+Enter on its own — the engine's behaviour, not Mandy's, and unmeasured
here like every engine claim that has not been through a check page. Same shape
as 1.7 and the same answer: `insertLineBreak` is already in REWRITE.md's
input-layer table, so it is a binding and a model command in 3.1 stage 2.

**TODO 2.2 — and an edited paragraph's break is destroyed on save.** Turndown's
`br` option is left at its default, the two-trailing-spaces spelling.
`reflowMarkdown` then hands any over-length line to `wrapMarkdownLine`, which
splits on whitespace — so the two spaces are consumed as ordinary spacing
between words and the break is gone from the file, with the paragraph still
reading correctly on screen. Measured by driving `reflowMarkdown` directly at
width 80:

| Case | Result |
| --- | --- |
| Two-space break, line short enough not to wrap | survives |
| Two-space break, line long enough to wrap | **lost** |
| Backslash break, either length | survives |

The backslash survives because it is a non-space character and stays attached to
the word in front of it — **a second argument for that spelling, independent of
the one S3 settled on**: it is not only harder for someone else's editor to
trim, it is the one spelling this editor cannot eat.

Scoped to an edited block: the re-wrap runs before `restoreSourceWrapping` and
the block key ignores whitespace, so an untouched paragraph carrying a break
gets its own bytes back and never reaches the wrapper.

The fix is two halves, and the second is needed whichever spelling wins — sniff
the break spelling and set Turndown's `br` from it, which is S3's settled work,
**and** make `wrapMarkdownLine` treat a break as a boundary it cannot cross
rather than whitespace to collapse, the way the five existing guards treat a
fence, a table row and a maths span.

**Why nobody caught it**: not one of this repo's nine markdown files contains a
hard break, so no round trip has ever carried one.
[tests/fixtures/torture.md](tests/fixtures/torture.md) now does, in both
spellings — though this was found by hand rather than by the fixture, since
nothing in the suite drives the save path over it yet. That gap is worth closing
on its own.
**1.8 needs 2.2, rather than merely relating to it.** A control that makes a
break the save path then destroys is worse than no control: it turns an obscure
gap into a data-loss path the user was invited down. 2.2 is pure serialiser work
in `markdown-style.js`, which lives through the rewrite — so like 2.1 it can be
fixed on `main` today and the fix carries over, and D6's "consequence for open
work" paragraph now says so for the whole of section 2 rather than for 2.1
alone. MARKDOWN.md's line-break row was also overstating things in two columns
at once, claiming Shift+Enter as an authoring route and calling the round trip
partial when it is a loss; both corrected.

## 2026-09-13 — `569358a` — The round-trip test nobody can write, recorded where it belongs

**No suite opens a document, edits it and saves it** — not through the code that
runs when a user presses Save. The pieces are covered; the chain they form is
not, so a bug can sit in the seam between two steps that each pass their own
test. TODO 2.2 is one that did, and it was found by calling a single step by
hand.

Two things stop it, neither an oversight: `tests/dom.mjs` is a hand-built page
stand-in with **no HTML parser**, so there is nothing to feed in, and the
Turndown in it is a recorder that hands back what it was given. Fixing either
means a real DOM implementation as a dependency.

It is in **[docs/ROADMAP.md](docs/ROADMAP.md) rather than TODO.md**, deliberately
and on the user's call: user-facing behaviour inside somebody else's application
needs a person or a real engine to observe it and report back, and **a full
frontend harness is not being planned**. That is accepted rather than carried as
a gap waiting on tooling — the same position the spike was driven under, by hand,
in three engines.

Two things the entry says that are more useful than the item itself.

**The model suite is the counter-example, and it is the interesting half.** It
does take a file, edit one block, serialise it back and compare — 728 blocks
across six files, byte for byte — and it can only do that because the model goes
markdown to markdown with no browser in the middle. The running editor has to go
markdown → HTML → an editing engine → HTML → markdown. So this item is partly
answered by 3.1 rather than by anything on the roadmap: the more the model owns,
the more of the round trip is testable with no browser at all.

**And what is within reach is a check page**, which is a genre this repo already
has five of — `browser-check`, `list-indent-check`, `list-empty-item-check`,
`paste-check`, `tab-shortcut-check`, plus the stage-0 spike. Every one is the
same answer to the same problem: only a real engine can say what happens, so the
page carries its own protocol, a person drives it, and it reports rather than
leaving the result to be felt. The save path has no such page; one would load the
app in an `<iframe src="/">` the way two of them already do, edit a block, save,
and diff — with `tests/fixtures/torture.md` as the document, since it is the only
file here carrying a hard break at all.

**The standing consequence is the point, and it is now a rule in CLAUDE.md's
Tests section**: when a change's real verification is open-edit-save in a browser
and no suite can reach it, say so and give the recipe — which file, what to
change, what to look at. Never report such a change as verified because
`npm test` passed, because it did not test the thing. TODO 2.2 now carries its
own recipe on that basis.

## 2026-09-13 — `8ed18df` — TODO 2.2: the hard break the re-wrapper was eating

Both halves of 2.2, in [front/markdown-style.js](front/markdown-style.js).

**The data loss first.** `wrapMarkdownLine` splits its line on whitespace, so
the two trailing spaces that spell a hard break were swallowed as ordinary
spacing between words the moment the line was long enough to wrap — the
paragraph still read correctly on screen, and the break was gone from the file.
The wrapper now holds a trailing run of spaces back before the split and
re-applies it to the **last** line it produces, which is where the break belongs
however many lines the wrap makes. The exact run is preserved rather than
normalised to two. The backslash spelling needed no guard and never did: it is a
non-space character, so it rides through the split attached to the word in front
of it — now checked, so a future change to the wrapper cannot quietly break the
half that works by construction.

Measured against this change on a file written at 78 columns with two hard
breaks, one of them on a 153-column line: **the old code returns one break, the
new code returns two.**

**Then S3, the spelling.** `hardBreak` joins the sniffed style, defaulting to
Turndown's own `"  "` so a document that sniffs to nothing serialises exactly as
it did before — the rule every other sniffed option follows. Both spellings only
mean a break when a line of the same paragraph follows, so trailing spaces before
a blank line are untidiness rather than evidence and do not vote; fenced code is
already blanked out of the lines the sniffer reads, so a code block cannot vote
either. `app.js` hands the result to Turndown as `br`, in the constructor and in
`pushMarkdownStyleOptions`, which is the pair that must not drift.

Fifteen checks, in `save-fidelity`: the wrapper in isolation at both lengths,
both spellings, the exact run of spaces, a break inside a list item and inside a
blockquote, that the wrap still respects its width around a break, the five
sniffer cases including the two that must *not* count, and — separately, in the
options block — that the spelling actually reaches Turndown. That last one is
not redundant: a sniffer that read the spelling perfectly and never handed it
over would have passed every check in the reflow section and changed nothing.
**990 checks, no failures**, up from 975.

**Unverified in a browser, and it has to be.** No suite opens a document, edits
it and saves it — the stub has no HTML parser and its Turndown hands back
whatever it was given — so nothing above tests the path a user actually takes.
TODO 2.2 is marked *(fixed, unverified in a browser)* and carries the recipe.
This is the first change to land under the rule added to CLAUDE.md's Tests
section today, and it is exactly the case that rule is for: `npm test` passing
says the pieces are right, not that the bug is gone.

## 2026-09-13 — `5d96619` — TODO 2.2 verified in the running app, and the service worker bumped

2.2 was marked *(fixed, unverified in a browser)* this morning because no suite
opens a document, edits it and saves it. It has now been watched doing exactly
that, in Chrome, through the real app: file opened through the Open dialog,
three paragraphs edited by typing into the editor, saved through File → Save,
and the bytes on disk checked against a pristine copy.

**Every check passes.** The paragraph whose break used to be eaten was really
edited, really re-wrapped — four lines out of one — and its break is still
there. Two other paragraphs prove the path was genuinely exercised rather than
passing by default: one with no break at all was re-wrapped, which is what says
the wrapper ran, and a short-line control plus two untouched blocks came back
byte-identical through the restore layer. **Three hard breaks in the file before
the save, three after.**

**One thing the run turned up, and it is a behaviour rather than a bug.** The
fixture deliberately mixes both spellings — two two-space breaks and one
backslash — and the backslash came back as two spaces. That is the sniff working
as designed: `hardBreak` is a **document-wide** option like `emDelimiter`, so the
majority spelling wins and an edited block is written in it. The break itself is
never lost, which is the guarantee that matters; only its spelling moves, and
only in a block the user was already editing. Left alone deliberately — no real
document alternates break spellings on purpose — and now pinned by a check so
nobody later reads it as the sniffer being broken.

> **Correction, 2026-09-13.** The last two sentences of that paragraph are
> wrong, and it is a bug. The spelling moves in **every** block holding the
> minority one, not only an edited one: Turndown writes the sniffed spelling
> document-wide before layer 3 runs, and `markdownBlockKey` does not normalise
> style spellings, so such a block no longer keys to its own source, misses the
> index and is re-wrapped as well as rewritten. Measured by opening a document
> and serialising it with no edit at all. It reaches the emphasis delimiter the
> same way. **TODO 2.3** carries it; this run saw only the edited-block half
> because that is the half it was inspecting.

**And a step this morning's fix skipped: `VERSION` in
[front/sw.js](front/sw.js) was never bumped**, though the fix changed
`markdown-style.js` and `app.js`, both shell assets. CLAUDE.md requires the bump
whenever the shell changes, and without it an offline session keeps the cached
copies — the fix would simply not be there. v1.30 to v1.31. It is not what made
the first manual attempt inconclusive, since same-origin requests are
network-first and a running server wins, but it was a real omission and it would
have bitten a user who was offline.

The fixture that did the work is not in the repo: it is a generated document
whose filler exists only to give the width sniffer enough ordinary lines to
report a real number, and it lives beside the manual recipe rather than in
`tests/`. What belongs in the repo is what a machine can re-run, and that is the
sixteen checks in `save-fidelity`. **991 checks, no failures.**

> **Correction, 2026-09-13.** It is in the repo now, as
> [tests/fixtures/break-test.md](../tests/fixtures/break-test.md). Leaving it
> outside meant it was deleted as scratch the same day and existed only in one
> browser's `localStorage` by the time anything wanted it again — which is not
> what "what belongs in the repo is what a machine can re-run" was meant to
> buy. A fixture a person re-runs still has to survive between the runs.

2.2 is closed and leaves [docs/TODO.md](docs/TODO.md); 1.8 loses its dependency
on it and is now only about the authoring control, which still waits for 3.1
stage 2. MARKDOWN.md's line-break row goes from a loss to a tick, with the
mixed-spelling note on it, and D6's section-2 paragraph now names 2.1 as the one
still open.

## 2026-09-13 — `d4e52de` — `main`'s hard-break fix merged into `rewrite`

A plain `git merge main`. **All the code merged with no conflict at all** —
`markdown-style.js`'s break guard and sniff, `app.js`'s `br` option, `sw.js` at
v1.31, and the sixteen new `save-fidelity` checks all landed untouched. Every
conflict was in prose, and every one of them was the same artefact: the 1.8/2.2
item exists on both branches under two different hashes, because it reached
`main` as an adapted cherry-pick (`627f3cb` here, `d744ddd` there) rather than
by merging.

How each was settled, since "resolved conflicts" is not a description of
anything:

- **CHANGELOG** — `main`'s copy of the 1.8/2.2 entry was dropped rather than
  kept beside this branch's. It is one change recorded twice, and the version
  here is the accurate one: it cites `tests/fixtures/torture.md`, which exists
  on this branch and not on `main`, which is exactly why the cherry-pick had to
  be adapted in the first place. The three entries that are genuinely distinct —
  the round-trip ROADMAP note, the fix, and the browser verification — are all
  kept, in the order they were committed.
- **DECISIONS** — `main`'s newer D6 paragraph (2.2 fixed, 2.1 the one still
  open) over this branch's older one, with **D7 preserved**: it exists only
  here, and the conflict swept it in only because it sits directly under D6.
- **TODO** — **1.7 kept** (it exists only here, for the same reason D7 does),
  `main`'s newer 1.8 marker and its "the serialiser side is already done"
  paragraph taken, and the paragraph that names 1.7 kept in this branch's
  wording, since on this branch that reference resolves.
- **MARKDOWN** — `main`'s line-break row, which is a tick rather than a loss.
  Resolved as one block rather than by taking the file, because this branch had
  edited two other rows and taking `main`'s copy wholesale would have silently
  reverted them.

**And one duplicate the merge could not see.** TODO 2.2 was deleted on `main`
when it closed, but this branch's copy had diverged enough that git could not
match the deletion, so the merged file carried the item twice over — once as
`main`'s absence and once as this branch's live entry, still marked *(bug, data
loss)*. Removed by hand. That is the failure mode of cherry-picking a docs
change between branches and then merging: the content converges, the diffs do
not, and git resolves what it can match rather than what was meant.

Two stale references went with it: CLAUDE.md's Tests section pointed at TODO 2.2
as the bug that proved a seam can hide one, and now describes the bug instead of
citing an item that has left the file. CLAUDE.md also gains what the merge
brought — the hard-break spelling in the sniffed-style list, with the note that
it is document-wide like the emphasis delimiters, and the new checks in the
`save-fidelity` description.

`npm test`: **1107 checks, no failures** — this branch's 1091 plus the sixteen
that came with the fix. `model` is unchanged at 114, which is the thing to look
at: nothing in the merge touched the rewrite.

## 2026-09-13 — `df1be92` — The empty-bullet check runs in three engines, and finds TODO 2.3 on the way past

[tests/list-empty-item-check.html](tests/list-empty-item-check.html) had been
carrying "Not yet run in a browser" since it was written on 2026-09-03, which is
the whole of the time the hand-rolled Enter/Backspace handler has been shipping.
Run now in **Chrome 152, Firefox 155 and Safari 26.6.2 — no problems in any of
the three**, all six cases, caret included. The handler is verified.

**The page measures less than it claimed, and the missing half was measured
separately.** It presses its keys with `new KeyboardEvent(...)`, and a browser
runs no default action for an untrusted event — so there is no native Enter for
`preventDefault` to suppress, and the `prevented` it reports says only that the
handler called it. The CHANGELOG entry that introduced the page named that
suppression as one of the two things it would answer, and it cannot. Answered
instead by driving the running app with trusted keystrokes: `beforeinput` never
fired in any of the six, so the native action is fully suppressed and every
change in the DOM is the handler's own surgery. CLAUDE.md now says which half
the page can do.

**And the thing that was not being looked for.** Recovering the app's state
after the run meant opening a document and serialising it with no edit at all —
which is how a block nobody had touched turned out to come back changed. A
minority hard-break spelling (`Charlie one\` → `Charlie one  `) and a minority
emphasis delimiter (`_underscored_` → `*underscored*`) are both rewritten
document-wide by Turndown before layer 3 runs, and `markdownBlockKey` does not
normalise style spellings — so such a block no longer keys to its own source,
misses the index, and is handed to the re-wrapper, coming back rewritten *and*
re-wrapped. Layer 3's promise is that an untouched block is byte-identical, and
for these two options it is not.

Filed as **TODO 2.3**, and it is a bug rather than the behaviour `5d96619`
recorded it as: that entry saw the rewrite in an edited block and concluded the
spelling moves "only in a block the user was already editing". It now carries a
correction, as does the sentence in CLAUDE.md that said the same thing.
**Closed by 3.1 and needing no work of its own there** — slice 2 step 3 records
each node's spelling at parse and slice 3 emits it back, so an untouched block is
never re-emitted and an edited one keeps its own spelling instead of inheriting a
document-wide guess. No fix on the old core unless it turns up in daily use;
making the key style-insensitive is one normalisation per sniffed option and a
second place that can disagree with the serialiser.

**The 2.2 fixture is in the repo**, as
[tests/fixtures/break-test.md](tests/fixtures/break-test.md). `5d96619` argued it
should stay out on the grounds that what belongs in the repo is what a machine
can re-run — and it was then deleted as scratch the same day and survived only in
one browser's `localStorage`, which is where it had to be recovered from. A
fixture a person re-runs still has to survive between the runs. CLAUDE.md gains
what each of its five labelled paragraphs is for, why its filler is load-bearing
rather than padding, and the run protocol: **Save As to a scratch name, diff,
delete** — never save over the fixture, which is the pristine copy the diff is
taken against.

No code changed, so no suite was run: nothing in `tests/` loads a CHANGELOG
entry, a doc or a fixture nobody imports.

## 2026-09-14 — `38cc4d7` — Fix the close on a background tab

**Clicking the × on a tab that was not the one on screen removed the document
and left the tab drawn.** The list was shorter, its storage keys were gone and
the next page load showed the document really was closed — but until then the
tab sat there, and clicking it again resolved to a tab that no longer existed,
so nothing happened at all. From the outside the close read as broken on every
tab but the active one.

The cause is in how the bar gets redrawn. `renderTabBar()` has exactly one
caller — `renderCurrentFile()` in [front/file-api.js](front/file-api.js) — which
is deliberate: that function is already the single "the active document's
identity changed" hook, so the tab's name and dot cannot fall out of step
without every other consumer falling out of step too. Closing a background tab
is the one operation in `tabs.js` that changes the bar while changing nothing
about the document on screen, so it is the one operation that reaches that hook
along no path. It returned early after `persistTabList()` and drew nothing.

One line: the background-close branch in `closeTab` now calls `renderTabBar()`
before returning. The active-tab branch already gets there through
`adoptActive`, and needs no change.

The `tabs` suite had this covered from both sides and still missed it, which is
worth recording. Stage 4's close checks assert on the *list* — the ids that are
left, the keys that are gone, the persisted JSON — and stage 5's bar checks
build a bar and read it, but never after a close. A redraw that never ran fell
exactly between them. The new check closes a background tab and then asks the
bar what it is showing; it fails on the old code with the fix reverted, and
passes with it. **155 checks in the suite, no failures.**

`VERSION` in [front/sw.js](front/sw.js) goes v1.31 to v1.32, since `tabs.js` is
a shell asset.

## 2026-09-14 — `030be5c` — Slice 2 step 0: the parser configuration moves out of `app.js`

The two markdown-it rules that decide what this project's markdown *means* —
`math` and `referenceAwareLink` — are out of `app.js` and in
[front/markdown-parser.js](front/markdown-parser.js). D7 and the argument for
the move landed yesterday; this is the move.

**One door.** `configureMarkdownParser(md)` registers both rules on an instance
handed to it. `app.js` calls it on the CDN parser it builds, one line under the
`window.markdownit()` that builds it; the model suite calls it on the `npm:`
one. The parser is injected rather than reached for — the same rule `modelParse`
already followed — so nothing in the file touches the DOM and the suite can load
it with no stub at all.

**Why it had to happen before slice 2's six steps.** The suite built a bare
markdown-it, so it could see neither a `math` token nor a `data-ref-label`
stamp, and steps 3 and 5 are exactly the two about constructs the parser
discards. A suite driving a parser the app does not use would have reported full
marks on markdown the app never hands it.

**The move itself is verbatim**: the rules and their comments unchanged, with
the three registration lines collected into the new function. Nothing about what
the app parses changed, and the model suite's existing 114 checks passed on the
configured parser before either new check was written — which is the reassurance
worth having, since the maths rule claims spans inside every file the suite
round-trips.

**What it cost is registry rather than logic.** The file joins all three
registries — `index.html`, `SHELL_ASSETS`, and the editable export's `ASSETS`,
which it belongs in because an exported document renders markdown too — and
`sw.js`'s `VERSION` goes to `v1.32`. Four suites that assemble their own bundles
list it ahead of `app.js`, and `loadApp` in `tests/dom.mjs` loads it, which is
what keeps `mathSpan` reachable for the `latex` suite: these share one scope the
way `<script>` tags do.

**Six checks were added rather than only moved.** Two in `model` say what step 0
was for: its parser emits a `math` token for `$x = a*b*c$` while leaving
`$5 and $10` as prose, and stamps a reference link with `data-ref-label` and an
inline one with nothing. Three in `latex` are the load order — before `app.js`
in `index.html`, before it in the export bundle, present in `SHELL_ASSETS` —
because `app.js` calls `configureMarkdownParser` at its own top level, so a
bundle in the wrong order throws on load and takes the editor with it. That
first one was run against a deliberately broken order and fails there, rather
than being trusted to be testing something. The sixth is in `self-reproduce`,
where the export's fetch count was the literal `13`; it now reads `ASSETS` out
of `html-export.js`, so adding a module to the bundle cannot fail that check for
the wrong reason — the cannot-drift rule the toolbar suite's two bundle lists
already follow.

**Verified in the running app as well**, because a load-order break is invisible
to a suite that loads the same files in an order it chose itself: the editor
boots with no console errors, and its own CDN parser hands back
`\mathbb{N} = \{ a \}` intact — the exact escape damage the maths rule exists to
stop — along with the `data-ref-label` stamp.

`npm test`: **1114 checks, no failures.**

## 2026-09-14 — `4c3ac08` — Slice 2 step 1: a block's inline content is a tree

`modelInlines(block)` folds markdown-it's flat inline stream — `+1` opens, `-1`
closes, `0` is a leaf — into the tree the markup describes, and every paragraph
and heading block now carries it in `inlines` as it is built. This is what an
edited block will be re-emitted from (slice 3) and what stage 2's format
commands act on; addressing it by offset is step 2 and does not exist yet.

**The fold is on `nesting`, never on a list of mark kinds**, which is the rule
the block tiler already follows one level up: a construct this file has never
heard of still nests correctly, and `MODEL_INLINE_KINDS` only names it. Nothing
in the oracle falls through to `"unknown"`, and the suite says so rather than
assuming it.

**A mark carries the delimiter as the author wrote it.** `_a_` and `*a*` are
both em and are told apart on the node; so are `__a__` and `**a**`, and a code
span's backtick run. `sniffMarkdownStyle` can only make one guess for a whole
document, and these files spell every mark both ways — em 149/2, strong 507/2,
code spans 1,491/6 — so per-node fidelity here is measured rather than argued,
and it costs nothing, because the parser had already recorded it.

**The token stays on the node**, because a link's href, title and
`data-ref-label` stamp and an image's `src` are on it already, and steps 3 and 5
read them there rather than re-deriving them from the source — which would be
the second parser this slice's plan refused when it was written. **An image is
one node rather than its alt text**: markdown-it parses the alt into the token's
own children and those are deliberately not folded in.

**One kind of token is dropped, and the measurement found it rather than the
plan.** markdown-it's emphasis rule leaves a zero-length text token on each side
of every mark it converts — `**a**` arrives as `text("") strong text("")`, and
410 of the 6,303 text tokens in the oracle files are these. They hold no bytes,
so dropping them cannot lose one, and keeping them would put positions in step
2's offset space that no caret could tell from their neighbours. It is checked
**as** an omission: every token not in the tree is asserted to be an empty text
token, so the rule cannot quietly grow a second exception.

**Eighteen checks**, the hand-written constructs one at a time and then the
oracle: across 819 inline-bearing blocks, all 10,705 nodes are the parser's own
tokens, each in the tree exactly once and in order. Every kind those files
contain is named — text 5,723, softbreak 2,677, code span 1,497, strong 509, em
151, link 136, image 5, math 4, hardbreak 2, strike 1 — and the last four come
from `tests/fixtures/torture.md` alone. The `math` and `data-ref-label` checks
are only possible because step 0 moved the parser configuration this morning.

`npm test`: **1132 checks, no failures.**

## 2026-09-14 — `7d39191` — Slice 2 step 2: the text coordinate

A model position is `(blockIndex, offset)`, and this is what the offset counts
in. `modelInlineText(nodes)` renders a block's inline tree to the text the space
is over; `modelInlineOffset` and `modelInlineAt` are the two pure functions in
and out of it. No renderer is involved, which is the point of doing it in stage
1: the caret arithmetic stage 2 depends on is testable with no DOM anywhere.

**The four rules the plan named are decided as it named them**: a code span's
content counts and its backticks do not, a mark's delimiters are zero-width, a
soft break is one character, an image is one atom rather than its alt text.
**Three more the plan did not say**, each settled here:

- **A break's one character is a newline**, for every soft break and both
  spellings of a hard one. Which spelling it was is on the node for step 3; here
  it is one position the caret can be on either side of.
- **An equation is an atom too**, by the image's own argument and not by
  analogy: the reader sees a typeset formula, so counting the TeX would count
  characters nobody can see and put the model's offsets and the DOM's out of
  step by the length of some maths. Both atoms are one U+FFFC, which is what
  that character is for — one rather than zero, so a caret can sit on either
  side of an image and a delete over it is one character wide.
- **Characters means UTF-16 code units**, because a DOM `Range` counts those and
  mapping to one is the entire purpose.

**The boundary rule is `undo.js`'s, kept rather than re-decided.** A position at
a boundary belongs to the node that *ends* there — `undoLocateOffset`'s own
`remaining <= length` — out of range clamps to the end, which is what a restore
onto text that got shorter needs, and a node that is not in the tree gets null
the way `undoTextOffset` gives one. Stage 2 then ports the caret behaviour
instead of inventing a second set of rules for it. The same left bias is what
"a new run inherits the marks to its left" means, and `modelInlineAt` hands the
mark chain back as `path`, which is how the tree answers what marks a position
carries — the question stage 0 left open for stage 2's typing rule.

**Seventeen checks.** Each rule on its own; both directions agreeing on every
offset of a block holding a mark, an atom and a break; the clamps; and a node
borrowed from another tree. Then the oracle, where the property is the fixpoint:
**every one of 10,086 leaves, at both edges and its middle, maps to an offset
that maps back to the same place**, across 230,189 characters of which 9 are
atoms. And one check that is not the model marking its own homework — in the 204
blocks whose tree is a single text node there is no markup to render, so the
text the model produces has to be exactly the content markdown-it recorded, and
it is.

`npm test`: **1149 checks, no failures**, and the whole suite still runs in
about a second and a half.

## 2026-09-15 — `6a3dfc9` — Document themes on the roadmap; editable HTML refused

**The HTML question is settled in writing rather than relitigated again.** A
new "Document themes, and the HTML question behind them" section in
[docs/ROADMAP.md](docs/ROADMAP.md) records the discussion whole: the worry that
a markdown editor is late to a party moving to styled HTML, the question of
whether Mandy can have both, and the answer — that "both" names two different
things. HTML as a *render* of a document is nearly free once 3.1's model owns
the document, because design lives in a renderer and editing in a model; HTML
as a *source* people author is a second product, a tree model with its own
fidelity stack, its own controls and a lossy conversion between the two.

Four tiers are recorded with their cost and fate. Import, one way, is TODO 6.4
as planned. **Opaque HTML blocks are refused**, not on cost but on D0: they put
raw markup into the document a person is editing, the same ground that dropped
underline and center. **An editable HTML canvas is refused** as not a feature
of Mandy at all. The one that survives is a document that carries its own
design, and it is the feature the section then specifies.

**A theme per document**: heading colours per level, fonts, a background, for
this document rather than every document. Three decisions carry it. The theme
lives *outside the file*, in a path-keyed map with a seventh `theme` document
key as its live copy, so the `.md` never changes and D0, D1 and `html: false`
stay untouched — front matter is named as a later decision, element attributes
as refused. It is *tokens, not CSS*: overrides to `app.css`'s custom properties
plus a few the stylesheet does not have yet, in light and dark pairs so the
document's theme and the reader's mode stay independent axes, with the human
picking and the machine writing. And it is applied on `#editor` by
`setProperty`, never stamped into the markup, and inlined into both exports as
a `<style id="doc-theme">` the editable export reads back. The ceiling is
named — a theme cannot make one paragraph red — and a third layer, sniffing a
theme out of imported HTML the way `sniffMarkdownStyle` sniffs bullets, is
sketched for after 6.4 with its one mechanical caveat, that computed styles
need a live document and 6.4 forbids one. Seven stages, all *not started*,
none waiting on 3.1.

The product reading is recorded too, hedged: import is rescue, export is the
product, and the evidence that would settle the gas-cars worry is to note, each
time an HTML document arrives, whether the edit wanted is to the text or to the
layout.

The settings-pane section gains the theme picker as the third thing that wants
a pane, and TODO 6.4 gains a pointer to the section, since it is the other half
of the same page.

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-15 — `6a3dfc9` — D7: Mandy holds a document, never a page

> **Renumbered to D9 on 2026-09-18**, when the `rewrite` branch merged back.
> Both branches had allocated D7 independently, and the branch's — *the rewrite
> simplifies the engine* — claimed it two days earlier, on 2026-09-13. This
> heading and the body below keep the number they were written with, the way
> every entry here does; the decision itself is **D9** in
> [docs/DECISIONS.md](docs/DECISIONS.md).

**The three refusals the morning's roadmap entry carried are promoted to a
decision.** [docs/DECISIONS.md](docs/DECISIONS.md) gains D7, and it is argued
rather than copied: the decisions file is the manifesto, so the entry says why
each road *cannot* be taken instead of listing that it was not. The spine is
one sentence — a document is what it says, a page is how it looks — and D0
already contains it: HTML conflates the two, which is its power as a delivery
format and its disease as a source one.

Three roads, each closed on its own ground. **Raw HTML inside the document**,
because an opaque block is a block whose only editing surface is its source —
the source pane D0 refuses, through the back door — and `html: false` is D0 in
one line, not a parser setting. **Styling on elements**, because direct
formatting is how documents rot and inventing a spelling for it is the move
that produced YAML. **An editable page**, on three independent grounds: D1 has
no HTML implementation and the browser's parser cannot give it one, the model
is block-shaped on purpose where a page needs the tree-shaped normalising one
REWRITE.md rejected, and the controls are a different application. What is
taken instead is the theme — design in the renderer, D0 applied to design —
with import as rescue and export as the product. The gas-cars analogy is
answered at the axle: the electric cars are the deliverables, and Mandy is
upstream of them. The entry ends with what would reopen it.

The roadmap section's refusals now point at D7 with a clause each rather than
carrying the argument twice, and the decisions file's header names D7 among
the entries that point forward.

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-15 — `c89bd5f` — Slice 2 step 3: put back what was written

markdown-it discards four spellings on the way from source to token: a code
span's padding, a backslash escape, a link's angle-bracket destination, and
which of two hard-break spellings was used. The model still has the bytes, so
`modelInlines` now carries a raw cursor through a block's inline content
alongside the token walk it already did for step 1, and a leaf records what the
parser threw away — a mark's own delimiters, a link or image's destination
tail — as the cursor reaches it. `modelInlineSource`, the new inverse of
`modelInlines`, is the check: an inline tree back to the raw text it was folded
from, which on an untouched tree has to equal the block's own `inline.content`
byte for byte.

A fifth thing surfaced that the plan did not name: CommonMark strips the
whitespace around a line break on both sides of it — a trailing run before, the
next line's own indent after — and both are invisible to rendering, not to the
file. Missing the second half doesn't just misrender one break, it leaves
every sibling after it reading from the wrong cursor position for the rest of
the block, which is how `tests/fixtures/torture.md`'s HTML-block paragraph (an
indented line inside a raw `<div>`, kept as prose since `html: false`) found
it — the first oracle file with an indented continuation line at all.

A link's destination-and-title tail calls `md.helpers.parseLinkDestination` /
`parseLinkTitle` directly, the same reuse `referenceAwareLink` already argues
for rather than re-deriving that grammar by hand. Images get the same
treatment as links even though they are not one of the plan's four named
spellings: an untouched image beside an edited sibling still has to
reconstruct exactly, and nothing else on the node says how.

One failure mode is a thrown error rather than a guess: an HTML entity or
numeric character reference is decoded the way an escape is, but with no
fixed-width pattern to scan back through, so a wrong guess would leave every
later node's cursor wrong for the rest of the block — the same silent-wrong-file
failure `modelTouch` and `modelEmitBlock`'s own throw already guard one level
up. Accepted rather than worked around: no oracle file carries a live entity,
`docs/MARKDOWN.md` does not track them as a construct, and the one literal
`&nbsp;` in CLAUDE.md sits inside a code span, which never reaches this path.

Fourteen hand-written cases, then the oracle: every one of **830 inline-bearing
blocks reconstructs its own source exactly**, against the repo's own diet of
these constructs — 1,538 code spans (7 padded), 2 hard breaks (one of each
spelling), 1 soft break with whitespace to strip, 4 escaped characters, 131
links (1 with an angle-bracket destination), 5 images.

`npm test`: **1164 checks, no failures.**

## 2026-09-15 — `217daaa` — Slice 2 step 4: escaping

`modelEscapeText` is the fallback `modelInlineSource` reaches for on a text
node with nothing recorded — genuinely new content, typed fresh or built by a
command. The rule is minimal escape: a backslash only where leaving a
character bare would change what it parses as, verified by reparsing through
the real parser rather than by re-deriving CommonMark's emphasis-flanking
rules by hand. `modelFirstConstruct` finds the first real construct in a
candidate's reparse and escapes its opening delimiter, one at a time, until
nothing is left to find — which is what keeps the result minimal: `*a*`
escapes only its opening `*`, because once that one is gone the second has no
partner left to pair with.

The obvious version of that search — one global question per character, *does
everything from here on reparse as plain?* — is wrong, and `torture.md`'s own
adversarial prose found it directly: one real emphasis pair anywhere in a
sentence failed that question for every character to its left, so a colon and
a comma with nothing to do with the pair got escaped along with it. Safe, but
not minimal, and minimal was the point. The fix asks a narrower question,
localized to where a construct actually begins.

Two things decode silently, with no delimiter pair to find and remove — a
backslash already in plain text sitting in front of punctuation, and an
entity-shaped run after an `&` — and hunting for which one to blame by
reparsing forward from the start of the string never converges: escaping the
wrong backslash only grows a longer run of them in the same place. Measured
directly against `already \*escaped\*`, a case `torture.md` also carries.
`modelEscapeSilentTriggers` fixes both in one static pass first, since neither
answer depends on anything else in the string, before the construct search
ever runs.

Twelve hand-written cases, then the oracle: precisely measured rather than
proxied by "contains a markdown-special character," only **2 of the oracle's
5,994 text nodes** actually need an escape to round-trip, and both do.

`npm test`: **1177 checks, no failures.**

## 2026-09-15 — `c98df2e` — Slice 2 step 5: links

The one construct whose spelling never lived in `markup` at all, which is why
it was the whole argument for step 3 recording a tail from source in the first
place: re-emitting the tree naively reproduced `inline.content` for 86.8% of
blocks, and every single mismatch was a link. Step 3 answers that for anything
untouched. This is the other half — a link or image with no `tail` because a
command built it fresh or changed only its destination — rebuilt from
`attrs` instead: `modelRebuildTail` reads href (or `src`), an optional title,
and inline-versus-reference off the `data-ref-label` stamp `referenceAwareLink`
already writes, the same read step 3's own tail-parsing does. CLAUDE.md's
existing accepted loss is unchanged: a `[text][]` or bare `[text]` shortcut
rebuilds in the explicit form.

The destination and title are new markdown, not a spelling put back, and that
cuts the other way from step 3's own measurement: `attrGet("href")` is already
what `normalizeLink` made of whatever was typed, usually percent-encoded, so a
bare destination is correct far more often here than in real documents.
`modelEscapeLinkDestination` wraps in `<...>` only when the resolved string
still has whitespace, a paren, an angle bracket, or a control character in it,
escaping `\` before `<` and `>` so the escapes this adds are never mistaken for
one the destination already had.

Eight hand-written cases, each verified by reparsing the *rebuilt* markdown —
definition included where one is needed — and comparing its `attrs` against
the original token's, the same discipline step 3 already holds for its own
raw tail. Nothing in the oracle exercises this on its own, since every parsed
link already carries the tail step 3 recorded — which is exactly why each case
here clears `tail` by hand rather than finding one.

Slice 2 is done: all six steps (0 through 5, with 6 — the suite growing — folded
into each as it landed) are in.

`npm test`: **1185 checks, no failures.**

## 2026-09-16 — `7af84ee` — Three tab/file-browser items added to the TODO

**4.6, 4.7 and 4.8** in [docs/TODO.md](docs/TODO.md), all *(undecided)*: New
is one action today — `newTab()` in [front/tabs.js](front/tabs.js) always
blanks the tab, never opens the file browser — with no second entry point for
"new tab, then pick a file"; the Open dialog's starting directory is per-tab
rather than hardcoded to home, but a fresh tab has none stored so its first
Open lands there anyway, and there is no recent-files list at all
(`grep -rn recent front/` is empty); and nothing in `tabs.js` supports
reordering tabs by drag, though `openTabs` already drives `renderTabBar()`
from a single array, so the redraw side is free.

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-16 — `fa4fba3` — Visual redesign approved; TODO 4.9 and stage 0 of its plan

**The chrome/document restyle in
[docs/redesign/design_handoff_mandy_chrome/README.md](docs/redesign/design_handoff_mandy_chrome/README.md)
is approved for staged implementation.** TODO 4.9 in
[docs/TODO.md](docs/TODO.md) records the seven-stage plan and stage 0 —
this entry — is checking the doc against `main` before any of it lands.

The doc's claims about today's code held throughout: `toolbar.js`'s two-row
structure, `tabs.js`'s indifference to where `#tabBar` lives,
`format-bar.js`'s live toolbar-height measurement, and the 16 call sites
`--accent-blue` alone has in `app.css`. Two amendments came out of the review
and are recorded in the design doc as well as the TODO entry:

- **A layout bug, caught before it shipped.** Moving the tab strip out of
  `.toolbar` to a sibling inside `.container`, as the doc's structural-changes
  section calls for, collides with the outline sidebar's CSS grid — `.toolbar`
  spans both columns there, the tab-strip sibling would not, and the outline
  and editor would each land one grid cell out of place for as long as the
  sidebar is open. The fix (`grid-column: 1 / -1` on the tab strip too) is
  folded into stage 3 rather than discovered mid-implementation.
- **Fonts stay a remote Google Fonts dependency rather than being
  self-hosted**, reversing the doc's own recommendation, so a future typeface
  change is a one-line edit rather than a repo full of font files to replace.
  Accepted rather than solved: offline boot and the editable export both lose
  the serif face with no network reachable, falling back to the `Georgia`
  stack `app.css` already names.

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-16 — `f7b0afb` — Redesign stage 1: tokens

**`front/app.css`'s two `:root` / `[data-theme="dark"]` blocks are replaced**
with the token set from
[docs/redesign/design_handoff_mandy_chrome/README.md](docs/redesign/design_handoff_mandy_chrome/README.md),
and every `var()` in the file that pointed at the old names now points at the
new ones — TODO 4.9's stage 1. Colors only: no rule's shape, size or markup
changed, so the app looks half-restyled until stage 2 lands, exactly as the
doc's suggested order expects.

The five dead variables it calls out (`--accent-blue`/`-hover`,
`--bg-editor-focus`, `--bg-format-bar`, `--bg-tooltip`/`--text-tooltip`, and
`--notify-info`'s use as a blue) are gone rather than renamed, and their
handful of consumers were fixed in place: `#editor:focus`'s background flash
and the `#editor tr:nth-child(even)` zebra stripe are deleted outright (both
named for removal elsewhere in the doc), and the rest — the format bar's
background, the Ctrl+Click hint, the default notify-icon color — took the
value the doc gives their final state, since a placeholder would just be
extra churn for a one-line fix. Every other old token got the nearest
same-shaped new token (`--bg-secondary` split by role into `--bg-page`,
`--tint`, `--tint-accent` or `--paper-sunken` depending on which of its
eleven call sites it was) rather than the doc's exact final value where that
would have meant restructuring a rule — that is later stages' work, not
this one's.

Fonts load from a Google Fonts `<link>` — the remote-dependency amendment —
added to `index.html`, `html-export.js`'s hand-written export shell, and
`static-export.js`'s document-only export, all three sharing the same
Source Serif 4 weights. `--font-serif` is defined in the token block but not
yet consumed; stage 2 wires it into `#editor`.

`--accent-ring`, `--accent-bright` and `--selection` are the other three
tokens declared and not yet used, all consumed starting stage 3 or 6.

`npm test` (992 checks, all suites) and `deno task check` both pass. Not
watched in a real browser this round — no headless-Chromium driver was
available in this session; verified instead by static checks (brace count,
every `var()` resolves to a declared custom property except the
intentionally-external `--link-hint`, no old token name left in the file) and
a smoke-served copy of `app.css` and `index.html` over `npm run serve`.

## 2026-09-16 — `9ab7910` — Redesign stage 2: document typography

**`#editor` is now the measured column the doc describes** — TODO 4.9's
stage 2. No inner wrapper: `#editor` itself gets `max-width: 68ch; margin: 0
auto`, loses its border, its 1rem margin box and (already gone since stage 1)
its `:focus` background flash, and every size in the "Document typography"
table lands — 35/25/20px headings with the border-bottom off h1, a flat 18px
body at 1.7 line-height in `--font-serif`, and the two differentiations that
table calls for that stage 1 deliberately left as a single interim token:
inline code moves off `--code-bg` onto `--tint` (`pre` keeps `--code-bg`),
and table headers switch to the chrome's sans stack in small caps rather than
the document serif, with cell borders dropped to hairline bottom rules and
the zebra stripe (already gone since stage 1) staying gone.

The old rem-based responsive font shrinking at the 768px and 480px
breakpoints is retired rather than carried forward — the doc specifies one
flat pixel scale for every heading and only one narrower padding value below
768px, and since a 480px query is already inside a 768px one, dropping the
narrower override just lets the 768px padding cascade the rest of the way
down.

**Watched in a real browser this time.** No headless-Chromium driver was
available for stage 1; this round, `npx playwright install chromium`
(without `--with-deps`, since the sandbox has no sudo) pulled one down
cleanly. Screenshotted light, dark, phone width, and a table/blockquote/code
sample against a live `npm run serve` — headings, the hairline table, the
non-italic blockquote, and inline code all match the doc, the Google Fonts
serif loads and renders, and the console raised nothing. `npm test` (992
checks, all suites) still passes.

**One gap in the doc, found by eye rather than against the spec:**
`--selection` ("text selection highlight") sits in the token table but no
rule in any of the six sections consumes it, so selecting text still showed
the browser's default blue. `#editor ::selection { background:
var(--selection) }` closes it, scoped to `#editor` since the chrome has
nothing worth selecting. Screenshotted a selected paragraph in both themes —
teal tint in light, the darker teal in dark, no blue left anywhere.

## 2026-09-16 — `3e96526` — Redesign stage 3: one-row toolbar, tab strip moved out

**The menu row is one fixed 40px row now, in both the app and an exported
document, and the tab strip is a sibling of `.toolbar` rather than a second
row inside it** — TODO 4.9's stage 3, with stage 4 (tab shapes, dot, close
button) folded in rather than left for later: shipping "moved out" separately
from "restyled" would have landed `.tab`'s color still assuming the teal
background it no longer sits on.

`toolbar.js`'s `buildToolbar()` now builds `.toolbar-left` (the app mark,
white via `filter: brightness(0) invert(1)`, and the menus) and, app variant
only, `.toolbar-right` (a new `.toolbar-path` span plus the theme toggle,
rebuilt as a two-segment sun/moon switch replacing the sliding pill) as
`.toolbar`'s two direct children, then appends the tab bar right after
`.toolbar` as a true sibling. `file-api.js` gained `renderToolbarPath()`,
tilde-collapsing the open file's directory against a `homeDir` now cached
from the `/api/home` probe, wired into the existing `renderCurrentFile()`
hook alongside the tab bar's own redraw. The whole `--toolbar-height`
arithmetic block — padding and font-size custom properties summed across two
rows — is gone in favor of a flat `40px` shared by both variants, since
neither carries the tab strip inside `.toolbar` any more and the
`:root[data-variant="export"]` override that used to shorten it had nothing
left to say.

**Three gaps found building this, on top of the grid-column bug stage 0
already caught reviewing the doc** — all three recorded in the design doc's
amendments and TODO 4.9, and fixed rather than shipped:

- The tab strip, now a sibling, renders empty before `tabs.js` populates it —
  the same jump `.toolbar`'s own reserved height was built to prevent, just
  moved to a second element that used to be covered by the first. `.tab-bar`
  now carries its own `min-height`, measured against the real rendered row in
  a browser (44px) rather than derived from a formula the way `.toolbar`'s
  used to be.
- The one-row bar does not fit six menu triggers at 375px once they share
  the row with the toggle — CLAUDE.md's documented "fits one line at 375px"
  was true of the old two-row bar, which never had to make room for anything
  else on the menu row. `.menu-trigger` keeps a real narrow-width override
  below 768px (`padding: 5px 4px; font-size: 12px`), measured rather than
  guessed. `justify-content: center` on `.menubar`, kept from the old
  override on the assumption it was now harmless, turned out to make the
  overflow worse — clipping "File" and "Export" symmetrically instead of
  just the last item — and is gone.
- `CLAUDE.md`'s own "Menu bar" section described the mechanism this stage
  retired (two rows, `.toolbar-content`, the per-variant height override, the
  sliding-pill toggle) as current architecture. The three paragraphs making
  now-false claims are corrected; the rest of the file's redesign-adjacent
  prose (colors, exact styling elsewhere) is deliberately left for a single
  sync pass once the whole redesign lands, rather than touched stage by
  stage.

`tests/toolbar.test.mjs` and `tests/tabs.test.mjs` both needed their DOM
stubs updated: the fake `.toolbar` now sits inside a fake `.container`, since
`document.getElementById` has to be able to find a sibling of `.toolbar`, not
just a descendant, to find the tab bar at all — plus the structural
assertions themselves, rewritten for the new shape. `npm test` (994 checks,
all suites) passes.

**Watched in a real browser**, including a real click on the theme toggle
rather than a stamped attribute — the first attempt at a dark-mode screenshot
stamped `data-theme` on `<html>` directly and silently tested nothing, since
the toggle reads its own separate attribute that only `theme-manager.js`
sets. Screenshotted: light and dark, the outline sidebar open in both
(confirming the grid-column fix), two tabs (active vs. inactive), and 375px
width before and after the narrow-width fix, with the tab-bar reservation and
the menu-row overflow measured directly (`getBoundingClientRect`,
`scrollWidth` vs `clientWidth`) rather than eyeballed.

## 2026-09-16 — `cd5f89d` — Redesign stage 3 follow-up: the tab strip stays put

**The tab strip scrolling away with the document — stage 3's implementation
of the design doc's own explicit "intended" — read as a bug the moment it was
used rather than reviewed.** Reported: it vanished on any downward scroll and
only came back at the very top, and made the browser's own scrollbar look
like it was cutting across the now-shorter sticky chrome. `.tab-bar` is
sticky now too, pinned right under `.toolbar`.

That brought back one thing this stage had just retired: a per-variant CSS
override, though for a different value than before. `--toolbar-height` still
does not differ between app and export — the new `--tab-bar-height` does
(`44px` in the app, `0px` in export, which has no tab bar at all), and
`.outline`'s sticky `top` now reads both so the sidebar sits below the tab
strip rather than under it. Watched in a browser: scrolled a document with
both bars staying pinned, and scrolled the outline open to confirm its offset
follows the new total rather than just `--toolbar-height` alone.

The better version of this — hide the strip going down, bring it back the
instant you scroll up, the way a mobile browser's address bar does, rather
than always visible — is deliberately not what shipped here. Recorded in
[docs/ROADMAP.md](docs/ROADMAP.md) as its own feature to build on purpose.

`npm test` (994 checks) passes — nothing in `tests/` reads computed sticky
positioning, so none of it needed updating for this.

## 2026-09-16 — `2f13479` — TODO 4.10: the native scrollbar still runs the full page

**Making the tab strip sticky did not fix everything reported against it.**
The browser's own scrollbar still spans the whole viewport, its track
visibly passing behind `.toolbar` and `.tab-bar` rather than starting below
them — because both are `position: sticky` *inside* the page's own scroll,
and a native scrollbar always represents the scrolling box's full extent
regardless of what is sticky-pinned inside it. No CSS property changes where
a native scrollbar's track begins within one scrolling container.

The real fix is an inner scroll container — stop the page itself from
scrolling, move `.toolbar`/`.tab-bar` to plain normal flow above it, and give
everything below the chrome its own `overflow-y: auto`, the way Gmail or
Notion do it. Recorded as TODO 4.10 rather than fixed now: it reaches past
the redesign's CSS into two tested call sites that read window-level scroll
position today (`format-bar.js`'s bar positioning, `app.js`'s heading-anchor
scroll), and the user asked for it to wait until after TODO 4.9 finishes
rather than land mid-stream.

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-16 — `4f5d609` — Redesign stage 5: format bar, menu panel

**Pure restyle — TODO 4.9's stage 5, and the first stage with no structural
change at all.** Every rule in the design doc's §02 lands directly:
`.menu-panel`, `.menu-item`, `.menu-check`, `.menu-shortcut`,
`.menu-separator`, `.format-bar`, `.format-btn` and its `.active`/`.mixed`
states, the inline-group `.separator`.

`.format-btn` drops its border and goes from a fixed 32×32 box to
`min-width: 30px; padding: 0 8px` — square for the six icon buttons, wider
for the four text ones (P, H1, H2, H3) — which fell out of letting content
size win over a fixed width rather than needing any markup change. Icon SVGs
shrink from 16px to 15px through a `.format-btn svg` CSS override instead of
editing the SVGs themselves in both `index.html` and `html-export.js`.

One pickup from §03 while in the area rather than its own stage: the dark
menu row's `1px solid #1e2729` bottom border — "the one place the teal steps
back" — had not landed with stage 3's dark tokens, since it is new geometry
rather than a value substitution the token pass would have caught.

`npm test` (994 checks) passes untouched — nothing in this stage changed DOM
shape, so nothing in `tests/` needed updating, the first stage since 1 where
that has been true. Watched in a real browser: the File menu open in both
themes, and the format bar in selection, caret, active and mixed states,
confirming the mixed state's outline ring reads distinctly from the active
fill rather than just in the spec's prose.

## 2026-09-16 — `02b6b0d` — Two redesign bugs fixed, three more recorded

**The outline sidebar's `border-right` used to stop where its last entry
did, not at the sidebar's own bottom.** `:root[data-outline="open"] .outline`
sized itself with `max-height`, which shrinks to fit short content instead of
filling the column it was given. Changed to `height`, so the border always
runs the full reserved height; `overflow-y: auto` still handles a heading
list too tall to fit. Confirmed against a 2-heading document: the border now
reaches the bottom of a 750px viewport instead of stopping at ~275px.

**The chrome's directory display was rendering `~/dev/Saar/docs` as
`dev/Saar/docs/~`.** `renderToolbarPath()` set `direction: rtl` on the
element holding the text itself (to clip from the left), which lets the
browser's bidi algorithm reorder neutral characters — `~`, `/` — by its own
rules once the container is RTL, not just move where the ellipsis falls. The
file dialog's own path bar solved this already: an inner `dir="ltr"` span
around the text keeps it in logical order while only the ellipsis position
answers to the outer `direction: rtl`. `renderToolbarPath()` now builds the
same inner span instead of setting `textContent` directly. Confirmed:
`currentFilePath` set to a deep path renders `~/dev/Saar/docs`, not reversed.

`npm test` (994 checks) passes; both fixes watched in a real browser.

**Three related items recorded rather than built:**

- **TODO 4.11** — the outline sidebar's `16rem` width is fixed, but the
  redesign's `max-width: 68ch` `#editor` column leaves real unused width
  beside it on anything wider than a laptop, with nowhere for it to go and
  no way to widen the sidebar to use it even when a heading is ellipsised.
  Wants a drag handle on the sidebar's own `border-right`, persisted the way
  the open/closed state already is.
- **ROADMAP.md, "A settings pane"** — a document's margins/column-width as a
  fourth preference candidate, for the same reason 4.11 exists: the
  redesign is what makes "how much of the window the prose gets" a question
  worth asking at all.
- **ROADMAP.md, "Split screen"** — two open tabs visible side by side, which
  `tabs.js`'s existing park/adopt-a-whole-document-as-one-bundle model is
  already shaped for; what is missing is presentational (a second mount
  point, a split ratio) and deciding what "the active document" means to
  the format bar and the outline once there can be two on screen at once.

## 2026-09-16 — `941247b` — TODO 6.7: register as a file handler for .md/.markdown

**A new capability, not a gap in an existing one** — `front/manifest.json`
has no `file_handlers` member at all, so an installed Mandy has never shown
up in the OS's own "Open with" for a markdown file. Recorded as TODO 6.7
rather than built: declaring `file_handlers` is the easy half, but the
launch arrives through the File Handling API's `window.launchQueue`, which
hands back a `FileSystemFileHandle` — not a path — and every part of the
document model (`currentFilePath`, the server's mtime staleness check,
`.toolbar-path`'s directory display) is path-shaped. Two ways to resolve
that are written down, genuinely undecided between: read/write the handle
directly via the File System Access API and accept the tab has no path to
show, or use the handle only to prompt the user back into the existing
server-backed open flow. Chromium-only support for the API as of this
writing may settle which is worth building at all.

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-16 — `48c5caf` — Redesign stage 6: dialogs, notify, and the outline's own restyle

**The file dialog's header is paper now, not a teal band** — TODO 4.9's
stage 6. The current directory moved into it as a second line under the
title, and hit the exact bug `renderToolbarPath()` already had: the old
`.file-dialog-path` strip clipped with `direction: rtl`, which reorders
neutral characters, not just where the text truncates. Fixed the same way —
tilde-collapse the string instead of clipping it — rather than carrying the
bug into its new home. The save row gained a real Cancel beside Save, both
now wearing `notify.js`'s own button classes instead of a third button style
existing only for this one row; entries dropped their row borders for
hover/radius; the parent entry reads "↑ parent directory" now, not "../".

**`notify.js`'s severity icon becomes a tinted disc in a dialog header,
staying a plain colored icon in a toast** — one shared `notifyIcon()`
function in JS, split by an ancestor selector in CSS rather than forked.
Toasts drop their left accent bar. Danger buttons go from filled to
outlined, which is the one change here with real stakes: an outlined
Discard next to a filled Save is what keeps the destructive option from
outshouting the safe one in the unsaved-changes dialog, the exact case
`ask()` exists for.

**One thing in the doc deliberately not built**: a "selected" dialog-entry
state distinct from hover. Nothing tracks which row is selected today —
clicking a file acts on it immediately rather than leaving it selected — so
there is no state for the rule to key off without adding a real feature
first. Left undone rather than shipping a CSS class nothing ever applies.

**A third pickup while in the area, after stage 3's dark toolbar border and
stage 5's format-bar/menu-panel**: the outline sidebar's own restyle from
§03, which the doc's suggested order never assigned to a stage at all —
248px width, a new "Outline" section label, item padding/radius, and the
six-level type scale. `outline.js` gained one element (`.outline-label`,
rebuilt each render alongside the list rather than kept static, since a
second code path to keep in step costs more than rebuilding one `<p>` on a
debounced mutation).

`npm test` (994 checks) passes — the new `dialogSaveCancel` button needed
adding to two test stubs' `DIALOG_IDS` lists so `getElementById` could find
it, no assertion changed. Watched in a real browser: Open and Save As in
both themes, `ask()` at warn and error severity, `askForInput`, all four
toast severities, and the outlined danger button in both themes — the one
place doc and screenshot disagreeing would have mattered.

## 2026-09-16 — `599695c` — Redesign stage 7: print block, and the whole thing closes out

**The `@media print` block forces the redesign's light tokens now**, the
last piece of `docs/redesign/design_handoff_mandy_chrome/README.md` (TODO
4.9, which this entry closes) still on the old palette. Every literal is the
light-theme value spelled out again rather than a `var()` — this block's
whole job is forcing light regardless of theme, and a custom property would
still resolve to dark mode's value when printed from a dark session, since
`@media print` does not leave the page's own cascade. Confirmed directly:
`#editor`'s printed background is `rgb(255, 255, 255)` even when captured
from a session that had just been switched to dark.

Two things not in the doc's own list, added because leaving them would have
shipped a visible regression or a dead rule:

- **`#editor`'s `max-width: 68ch`** is a screen concession the doc's
  fidelity list never mentions resetting, because it postdates the doc — it
  is stage 2's own addition. Without `max-width: none` in print, a
  printed page would have kept the narrow reading column and turned a third
  of the sheet into blank margin. Confirmed: `#editor`'s printed width now
  equals the full available width, not 68 characters of it.
- **`#editor h1`'s `border-bottom-color` override** had nothing left to
  color — stage 2 removed the border-bottom itself from the live view weeks
  before this stage, and the print override for its color was never retired
  alongside it. Gone now rather than left setting a color on a border that
  does not exist.

`th`'s print-only shaded background is also gone, matching the live table's
own hairline-only redesign from stage 2 — the doc's list did not call this
out explicitly, but leaving it would have meant print and screen disagreeing
about whether tables are striped.

**Full `npm test` (994 checks, all suites) and `deno task check` both
pass.** The closing browser pass TODO 4.9 asked for: light and dark up and
down every stage's surface, the outline open with two tabs in both themes,
375px and 768px width with no horizontal overflow at either (`scrollWidth`
measured, not eyeballed), and the print block itself rendered via
`page.emulateMedia({ media: "print" })` in both a light and a dark session.

**TODO 4.9 is done.** Seven stages, three bugs caught in the design doc
before any code landed (grid-column collision, the narrow-width menu-row
overflow, the tab-strip layout jump), one caught only by using the shipped
result (the tab strip scrolling away read as broken, not as the doc's
stated intent — see the follow-up two entries below stage 3's), one still
open on purpose (TODO 4.10, the native scrollbar, deferred past this item
on request), and three related features written down rather than built
(TODO 4.11, and the two ROADMAP.md entries for document margins and split
screen). The full stage-by-stage record stays in this file rather than in
`docs/TODO.md`, which drops the finished item now — every reference to
"TODO 4.9" elsewhere in the repo (`CLAUDE.md`, `app.css`, `index.html`,
`ROADMAP.md`, the design doc itself) is repointed to
`docs/redesign/design_handoff_mandy_chrome/README.md` in this same commit,
since the number itself stops meaning anything once the item it named is
gone.

## 2026-09-16 — `edfa01a` — Two post-ship tweaks to the redesign

**The outline sidebar's "Outline" section label is gone** — user feedback
given after the redesign had already closed out. `renderOutline()` in
`outline.js` no longer builds `.outline-label`, and the now-unused CSS rule
went with it.

**The tab strip is roughly 2mm shorter.** `.tab`'s padding drops from the
design doc's `7px 11px 8px` to `3px 11px 4px` — split off the top and
bottom, sides untouched — which trims about 7.5px (2mm at the standard 96dpi
CSS reference) off the row's overall height. `--tab-bar-height`, the
reservation that keeps an empty `#tabBar` from jumping once `tabs.js`
populates it, moved from the measured `44px` to a freshly measured `36px` to
match — confirmed empty and populated still agree exactly, so the layout-jump
fix from the redesign's stage 3 follow-up still holds. `.outline`'s sticky
offset reads `--tab-bar-height` already, so it follows without its own
change.

Both amendments recorded as the fifth note in
[docs/redesign/design_handoff_mandy_chrome/README.md](docs/redesign/design_handoff_mandy_chrome/README.md),
alongside a stray `--tab-bar-height` literal in `CLAUDE.md` (`44px`, now
`36px`) caught and fixed while in the area.
`npm test` (994 checks) passes untouched; watched in a real browser, light
and dark, with the outline open.

## 2026-09-16 — `8233e3b` — ROADMAP: the app mark doubled by a Windows PWA titlebar

**Recorded rather than fixed**: installed as a PWA on Windows, `.app-mark`
(the white Mandy mark `buildAppMark()` puts at the left of the menu row)
sits directly under the OS's own titlebar, which already shows the app's
icon from the manifest — reported as looking doubled there, not as a
problem on macOS, where an installed PWA's titlebar does not repeat the
icon the same way.

Answers a question asked first: detecting "is this a PWA on Windows" is a
heuristic, not one clean check. `@media (display-mode: standalone)` reliably
answers "installed app window, not a browser tab" but not which OS — macOS
reports `standalone` too — so telling them apart means pairing it with a
platform sniff, for which `toolbar.js`'s `IS_MAC` (used today only for ⌘
versus Ctrl in shortcut labels) is already the precedent. The sturdier fix
doesn't hide the mark at all: Window Controls Overlay
(`"display_override": ["window-controls-overlay"]`) is the Chromium/Windows
API that lets the app draw its own content into the titlebar space instead
of the OS repeating the icon there, which is one icon in one bar rather than
one hidden and one left in place. Chromium/Windows-only, and wants measuring
in an actual installed Windows PWA before it ships — recorded in
[docs/ROADMAP.md](docs/ROADMAP.md) under "The app mark, doubled by a Windows
PWA's own titlebar".

No code changed, so nothing was run — `tests/` reads none of these files.

## 2026-09-16 — `8c255b7` — The real Mandy logo replaces the placeholder banner

**`front/welcome-banner.png` and `front/welcome-banner-dark.png` are the
actual logo now**, not the placeholder swapped in when the welcome document
was renamed from Marky to Mandy. Source was a transparent, tightly-cropped
4200×1232 PNG — trimmed of its remaining transparent margin, resized to
960×274 (2x for a retina display at the old file's implied width), and
shipped transparent rather than flattened onto a baked-in background the way
the placeholder was.

Transparent means no background color to keep in sync with the theme at
all: dropping the old cream/near-black rectangles was a deliberate
simplification, not just a side effect of the source being transparent — the
mark now sits directly on `#editor`'s own `--paper`, so it can never drift
from whatever that token is. Dark mode still needs a distinct file, since
the source's brand teal has real contrast against white and almost none
against `--paper` dark — `welcome-banner-dark.png` is the same crop with the
teal (`#004c4c`-ish, sampled from the source rather than assumed) recolored
to the existing mint `#7fd3c6` via `magick -fuzz 35% -fill ... -opaque ...`,
leaving the brand orange untouched, the same treatment the placeholder's
dark variant already used. The `[data-theme="dark"] #editor
img[src$="welcome-banner.png"] { content: url(...) }` swap in `app.css`
needed no change — same two filenames, same mechanism.

No code changed. Watched in a real browser: light, dark, and 420px width,
confirming the new (much wider, shallower — the old file's aspect ratio
included padding the source crop doesn't have) proportions still read well
scaled down.
## 2026-09-16 — `0d35912` — Slice 3 planned: the block serialiser

Written before it is built, per CLAUDE.md. `docs/REWRITE.md`'s slice 3 entry
was three paragraphs of intent; it is now the plan — a measurement table, six
steps in order, and the decisions argued where they are made rather than left
to whoever starts.

The measurement came first, the way 1b's tiling table and slice 2's inline
table did, across all six oracle files. Two readings shape the slice. **Of the
975 leaves — the only blocks that can reach the emitter — just 861 carry an
inline tree**, and the other 114 (72 table rows, 21 gaps, 14 fences, 6 rules,
1 indented code block) have nothing to emit *from*: their content is source and
is edited as source, so a command sets `source` rather than nulling it and the
emitter is never reached. That answers `modelEmitBlock`'s existing throw for
five kinds out of seven, and makes it a constraint on stage 2's input layer
rather than work for this slice.

The second is the one that decides the shape: **851 of those 861 blocks have a
`source` that is a per-line prefix plus the inline source slice 2's step 3
already reconstructs byte-exactly.** So the block emitter is an affix problem
rather than a serialisation problem — put back what markdown-it stripped off
`inline.content`, which is the same sentence 1b's step 5 and slice 2's step 3
are each an instance of, arriving a third time one level up. The ten exceptions
are all headings, all in the torture fixture, and all **suffixes**: 7 setext and
3 with closing hashes.

Three more measurements settled things the plan would otherwise have guessed.
A quote chain is recorded **per line, not per block** — `torture.md` has a
paragraph whose chain is `["> ", ""]`, a lazy continuation carrying no `>` at
all, and another starting at `"  > "`. The quote chain sits **outside** the item
marker, because `> 1. A list inside a quote.` has the content
`A list inside a quote.` with both stripped. And `wrapMarkdownLine` re-derives
a continuation indent that disagrees with the recorded one on **1 of 341**
items — the marker `"-\t"`, where it would write two spaces over the file's own
tab, which is 1b's step 5 bug sitting unfixed one layer along. So the wrapper
gains first-line and continuation prefixes instead of guessing at them; D7 is
why touching a file the app loads costs nothing.

Two things the plan picks up that were already owed to it. Slice 2's step 5
declined to say whether a rebuilt reference label still resolves, naming
"whichever block-level emitter eventually calls this" as the owner — this is
that emitter, and the model can answer it where `main` cannot, because a
definition is a `gap` block in its own position rather than something
`appendReferenceDefinitions` collects at the end of the file. And S3's fence
character sniff turns out to have **no caller in this slice**, since a fence is
one of the five source-edited kinds and is never re-emitted; it lands with
stage 2's Code command, the first thing that can make a fence out of nothing.

Slice 2's own status line was still reading "in progress" here while the
2026-09-15 entry above already recorded it done; it now says what happened.

No code changed, so no suite covers this — but `docs/REWRITE.md` is one of the
six files the `model` suite drives as its oracle, so a documentation change to
it is a change under test. `npm test`: **1185 checks, no failures.**

## 2026-09-16 — `0d35912` — The quoted metrics catch up with the suite

`docs/TODO.md` grew from 708 lines to 794 and `docs/REWRITE.md` gained the slice
3 plan above, so most of the figures quoted in prose were a reading from an
earlier day. The suite never drifted — its thresholds held and its labels
carried the live numbers throughout, which is exactly the arrangement 1b's step
6 chose so that a documentation change could not turn into a failing test about
list items. The prose is what went stale, and CLAUDE.md states these in the
present tense rather than as a dated reading, so there it was simply wrong.

Refreshed from the suite's own labels rather than from a fresh hand count:
`docs/TODO.md` is **794 lines, still sixteen top-level blocks, the largest 267**
(was 708 / 239); the worst edit in it rewrites 15 lines, **1.9%** (was 2.1%);
per-file worst edits are CLAUDE.md 2.6%, README.md 2.8%, welcome.md 7.4%,
TODO.md 1.9%, REWRITE.md 1.2% and the torture fixture 2.7%; the exhaustive
sweep is **975 blocks across six files** (was 728 across five — the fixture
joined the oracle on 2026-09-13 and that sentence had not noticed). Slice 2's
inline figures likewise: **861 inline-bearing blocks, 12,060 nodes, 423 empty
text tokens, 11,190 leaves over 255,119 characters, 6,412 text nodes**, and the
per-kind and per-spelling counts with them. `docs/TODO.md` now tiles into 58
containers rather than 53, still five deep.

**Two figures were deliberately left alone**, and the rule is worth stating
because it will come up again: a measurement that is *dated and attached to why
a decision was taken* stays as it was taken. 1b's tiling table, slice 2's inline
token table and step 3's construct diet are evidence for choices already made,
and refreshing them would rewrite the record a decision rests on — the same
argument the file already makes for keeping a decision's reasons rather than
deleting them. What gets refreshed is a present-tense claim about the current
state, or a description of what the suite asserts, because those have a live
label to be checked against. Step 3's `7 of them padded` and `4 escaped
characters` also stay because the only counts available for them were my own
re-derivation, which disagreed with the recorded ones — a second measurement
free to disagree with the first is the thing this whole model exists to avoid,
and publishing one as a correction would be worse than leaving a stale number.

Two **check labels** were stale in a way prose cannot be, since a label claims
to be a live report: one hardcoded "nothing else in 708 lines" against a file
that is now 794 — it reads its length from the source now — and one still
calling the blockquote chain "slice 3's open question" when slice 2 settled it
on 2026-09-15. That second one now says what slice 3 will do about it.

The refresh is self-referential — these files are the suite's own oracle, so
writing a number into one moves it. It converged by making every replacement after the first digit-for-digit, which
changes no line, node or character count — three passes in the end, because
recording D8 below moved them again.

`npm test`: **1185 checks, no failures.**

## 2026-09-16 — `0d35912` — D8: the branch goes back to `main` twice, and the two points are marked

The question was whether `rewrite` could merge back at each stage boundary.
It can at two of them, and the stage boundary is not the unit — the useful
seams are one finer and one coarser than the stage list. **D8** in
[docs/DECISIONS.md](docs/DECISIONS.md) records it.

**Why merge at all**, and neither reason is risk management: the work gets
exercised in the editor that is actually in daily use rather than only in a
suite, and the two branches stop drifting. The second is measured rather than
feared — `d4e52de`, the one merge taken so far in the other direction, merged
every line of *code* with no conflict at all, and every single conflict was in
prose, plus one duplicate git could not match at all. The code converges; the
documents are what diverge, and they diverge with time.

**Stage 1 merges**, and changes nothing the editor does: `model.js` is in none
of the three registries. Which means the first reason does not apply to it, and
D8 says so rather than glossing — an inert model is not exercised by sitting on
`main`. What is exercised is `markdown-parser.js`, slice 2's step 0, a real
refactor of the running editor's parser configuration that does the editor good
on `main` and none on a branch.

**Stages 2 and 3 do not**, and the unusable window is not a stage but
build-order steps 2 through 4 — render, input, formats — with nowhere to stop
inside it. The end of stage 2 is a genuine boundary and still the wrong merge,
though not because the app would break: the ~5,300 untouched lines read the
rendered DOM, which still exists, so a save would work *the old way*. That is
the objection rather than the reassurance — all of the input layer's risk, none
of the fidelity, because the save path is still the three-layer restore.

**Stage 4 merges and cannot be taken back**, and the hazard is data rather than
code: autosave changes format and the first load after landing converts a
pre-rewrite `content` key once, through Turndown. That autosave may be the only
copy of someone's unsaved work, so the conversion is tested before the merge,
not after — `git revert` does not put the storage back.

Neither merge reopens D6 or D7. Stage 1 replaces nothing, which is exactly the
distinction D7 already draws between sequencing and preservation; stage 4 *is*
parity, which is the point where "nothing ships in between" stops applying
rather than being broken. Stage 5 then happens on `main` by construction, since
IME, autocorrect and Safari's quirks are what only real documents turn up.

**The reminders are on the stage lines in [docs/REWRITE.md](docs/REWRITE.md)**,
not on a calendar: a stage closes when it closes, and that file's "Where each
stage stands" is already updated as part of every landing, so it is the one
place the note cannot be missed at the moment it applies. Stages 2, 3 and 5 say
why they are *not* merge points, so the absence reads as a decision rather than
an oversight. CLAUDE.md's branch note points at D8 for the same reason it points
at D7.

`npm test`: **1185 checks, no failures.**

## 2026-09-16 — `0d35912` — The oracle becomes a fixture, and the counts leave the prose

Two problems with one cause, fixed together. The `model` suite read five living
project documents as its test data, and those same documents described the
suite — so each held the other hostage.

**A living file cannot be written for the test.** Nobody is going to put a
quote inside a list in `README.md` to cover a construct, so coverage was
hostage to whatever the prose happened to need to say. That is exactly why
`tests/fixtures/torture.md` had to be invented on 2026-09-13: the five held no
blockquote, no hard break, no strikethrough and no reference definition between
them, and no amount of writing about markdown was going to change that.

**And every count quoted in one moved the moment the other was edited.** This
was not theoretical and it was not cheap: a documentation change had already
turned into a failing test about list items, and refreshing the stale figures
earlier the same day took three convergence passes — the last one done entirely
in digit-for-digit replacements so that writing a number would stop changing it.
Reading the documents under test was fine while this was a fork being hacked on.
It is not a practice to carry forward.

So `tests/fixtures/corpus/` now holds frozen copies — `claude.md`, `readme.md`,
`welcome.md`, `todo.md`, `rewrite.md`, taken today and byte-identical to their
originals at the moment of copying. **Copies rather than invention**, because
what makes the oracle worth having is that a human wrote these to be read: they
carry the conventions real prose carries, and a file written to exercise the
parser would prove only that the model round-trips what the model finds easy.
Copies rather than references, because a copy can be edited to cover a case and
cannot be moved by editing the original. Anything in `corpus/` is oracle —
there is no README in there and nothing outside the list — so adding a file is
deliberate, and so is refreshing one: copy the living file over it and expect
the labels to move.

Verified rather than asserted: appending to `CLAUDE.md` and `docs/REWRITE.md`
and rerunning now leaves every count byte-identical, where an hour ago it moved
six of them.

**The counts came out of the prose at the same time**, which is the other half
of the same fix. CLAUDE.md and REWRITE.md quoted the block, node, leaf,
character and text-node totals, the per-kind and per-spelling lists, the
per-file worst-edit percentages and the running check count; all of it now
reads qualitatively and points at the labels, which compute it. Two classes were
deliberately kept: **thresholds**, which are the assertion rather than a
reading (under 5%, over 25%), and **dated measurements that justify a decision**
— 1b's tiling table, slice 2's inline-token table, slice 3's own — since
refreshing those would rewrite the evidence a choice rests on. Where such a
measurement was phrased in the present tense it now says what it is: 1b's
argument reads "`docs/TODO.md` **was** 708 lines when this was measured on
2026-09-12" rather than quoting today's length.

CLAUDE.md's Tests section carries both as a standing rule now, so the next suite
does not have to rediscover either.

Two check labels also stopped being reports and started being claims, and were
fixed with the rest: one hardcoded `708 lines` against a file that had grown to
794 — it reads the length from the source now — and one still calling the
blockquote chain "slice 3's open question" after slice 2 settled it.

`npm test`: **1185 checks, no failures** — the same 187 in `model`, on the
fixtures.

## 2026-09-16 — `31ce38b` — Slice 3 step 1: the blockquote chain, recorded per line

`modelQuotePrefix` and a `quotePrefixes` field: one string per line of a
block's source, filled at parse where the bytes are, alongside the list-item
marker 1b's step 5 already records there. The decision arrived already made —
slice 2 settled recording over strip-and-re-apply, because `inline.content` has
the chain stripped exactly as it has a list marker stripped, so the two are one
problem. What was left to build was the shape.

**Per line, not per block**, which the measurement decided rather than the plan.
`torture.md` has a quoted paragraph whose chain is `["> ", ""]` — its second
line is a lazy continuation with no `>` on it at all — and another that starts
at `"  > "`, two columns in. One prefix for the whole block would rewrite both
into something of the same width and different bytes, which is precisely the
mistake 1b's step 5 made for a day with the marker `"-\t"`.

**Depth is the number of quote containers a block sits inside**, threaded
through `modelTileRange` the way the token level already was. So a block records
the chain of the quotes it is *in* and never its own: a quote is a container and
re-emits from its children, each of which carries the chain including that
quote's level. A line that runs out of chain before the depth keeps what it had,
so a lazy continuation falls out rather than being special-cased.

It did the job it was for. The two items `torture.md` has behind a `> ` are
ordinary items now — `modelItemPrefix` scans the line with the chain already
claimed, where before the marker sat behind it and the function returned null.
The check that pinned that absence through the whole of 1b now asserts the
opposite, and cross-checks the recovered marker against the parser's own
`markup` rather than against itself.

**What can go wrong here is not byte-exactness, and that shaped the checks.**
Whatever the function claims as prefix, the rest of the line is the remainder,
so a block always reassembles; what can be wrong is the split landing somewhere
markdown-it did not put it, and only `inline.content` can say. So the oracle
check strips the recorded chain off a quoted paragraph's lines and asserts what
is left is exactly the content.

**A paragraph is the only leaf that isolates the chain**, and the check found
that by failing when it was written wider: `> ### A heading inside a quote` has
the content `A heading inside a quote`, because a heading's own `### ` comes off
as well. Not a chain recorded wrongly — the next marker down, and step 2 is what
records it. The check is narrowed to paragraphs and says why, since that is the
step boundary showing up as a measurement.

Nine checks: the four shapes by hand (two lines of chain, three levels of
nesting, an indented chain, the lazy continuation), a block outside a quote
recording `null` rather than an array of empty strings, a quote recording no
chain of its own while its child carries the level, then the oracle — every line
starts with the chain recorded for it, a recorded chain is only ever indent and
`>`, and the content check above.

`npm test`: **1195 checks, no failures**, 197 of them in `model`.

## 2026-09-16 — `c418f52` — Slice 3 step 2: the heading's shape

`modelHeadingShape` and a `headingShape` field — `{ open, close, underline }`,
recorded at parse beside the quote chain step 1 landed this morning and the
list-item marker 1b's step 5 records in the same place.

A heading's `level` has been on the block since slice 1 and says nothing about
how the heading was written. `# Title`, `# Title #` and `Title` over `=====` are
all level 1; `======` and `===` are the same heading in different bytes. So the
spelling is recorded rather than derived, for the reason everything in this
model is: the file said it, and reconstructing it at emit time would be a second
place free to disagree with the first.

**It is the model's one suffix.** Everything else markdown-it strips sits in
front of the content — a list marker, a quote's chain, an indent — while a
closing hash run and a setext underline sit behind it. That is exactly why the
ten blocks in the oracle whose source is *not* a per-line prefix plus their
inline source are all headings, which is the row in slice 3's measurement table
that this step exists to answer. Step 1 produced the same finding independently,
from the other side: its content check failed when written wide, on
`> ### A heading inside a quote`, because the `### ` comes off the content as
well as the chain.

Two things it does rather than trust. **The branch is taken on the parser's own
`markup`** — a hash run for ATX, `-` or `=` for setext — rather than on a guess
about line counts, which is the same rule the rest of the model runs on: read
what markdown-it recorded. And **the result is verified against
`inline.content`**, with `null` when it does not line up, the safe direction
`modelItemPrefix` already takes — step 3 then has nothing to emit from rather
than the model inventing a spelling the file never had. Measured before writing
it and again after: all 94 headings in the oracle resolve, 86 plain ATX, 3 with
a closing run, 7 setext, and nothing left unresolved.

Eleven checks. Eight by hand, one per spelling and per edge: each of the three,
a closing run of a length that differs from the opening one (`### x #` is not
`### x ###`, and the difference is only bytes the renderer throws away), a
setext underline that is not normalised to a canonical length, a heading inside
a quote recording the hashes rather than the chain in front of them, and an
empty ATX heading being a shape rather than a null. Then the oracle, where the
property is byte-level and is the one step 3 rests on: **the recorded shape
reassembles each heading's own source, chain included, 94 of 94.** An untouched
heading re-emits from `source` and cannot fail; what this asserts is that an
edited one has everything it needs. A third check keeps the other two honest by
asserting the oracle actually holds all three spellings, so none of it is
passing untested.

One consequence worth naming rather than meeting again later: `torture.md` opens
with YAML front matter, and the app's parser has no front-matter rule, so the
`---` / `title: …` / `---` block arrives as a setext h2 and now re-emits as one.
Byte-correct, semantically wrong. `MODEL_BLOCK_KINDS` already names a
`front_matter` kind for whenever that is worth fixing; it is not this slice's.

`npm test`: **1206 checks, no failures**, 208 of them in `model`.

## 2026-09-18 — `0684ef3` — Record the sidecar idea in the roadmap

A new section in [docs/ROADMAP.md](docs/ROADMAP.md), *Annotations beside the
file, not in it*: highlights and per-document preferences kept in a `.mandy`
file next to the document, holding Mandy's opinion about the file rather than
anything of the file's own — the line TODO 4.4 already draws for direction,
generalised from a localStorage key to disk. Written before anything is built,
per the rule in CLAUDE.md, and it is roadmap rather than TODO because it waits
on 3.1: the running core cannot render a mark that is not in the document,
and after the rewrite a decoration pass at render time can, with the file
unreachable by construction.

The section records what makes it a feature rather than a file format. A
preference is a scalar and is trivial; a highlight is a range, and the file
changes under it from both ends, so the work is in what a highlight *points
at* — a block anchor plus the quoted text, with an orphaned state reported
rather than hidden, which is the content-key trick `indexMarkdownBlocks` uses
today given a second life after the rewrite retires it. Five decisions are
left open with both sides argued: sibling file versus central store, a derived
server route versus a fourth allowed extension, the fallback for a document
with no path, drift against the file's mtime and hash, and whether the sidecar
autosaves and whether a highlight undoes. The held-constructs section gained a
sentence keeping `==mark==` — the author's emphasis, in the file — apart from
the reader's marker beside it.

No code changed, so no suite ran.

## 2026-09-18 — `4a45f48` — The outline follows a tab switch at once, TODO 4.6

The sidebar used to keep the previous document's headings for a second after a
tab switch, a new tab, Open, Reload or New. The whole delay was
`OUTLINE_DEBOUNCE` in [front/outline.js](front/outline.js): the rebuild hangs
off a `MutationObserver`, debounced by a second so it does not flicker while a
heading is being typed, and a document swap is one `innerHTML` assignment and
so one observer batch that waited the full second behind it. Measured before
changing anything, in the running app with a second observer on `#editor` and
one on `#outline`: a new tab and a switch back each produced exactly one
record — target `#editor`, type `childList` — at 6ms and one render at 1007ms,
so nothing was re-arming the timer and the fix is the constant's shape rather
than a second cause.

`scheduleOutline` now reads the records it is handed. One whose target is the
editor itself with `childList` is a top-level structural change — a swap, or
an Enter or Backspace at the top level — and renders at once; anything inside
the subtree, or a text change, keeps the second. The shape is read off the
record rather than off a flag, so `tabs.js`, `file-api.js` and the welcome
fetch are all covered without any of them learning that the outline exists.

Filed as **TODO 4.6** rather than under 3.1: `outline.js` is in the row of
modules REWRITE.md leaves alone because they read the rendered DOM, and the
observer survives per-block re-render, so the rewrite neither changes this nor
waits on it. The `outline` suite now hands the observer's callback both record
shapes — its stub's `setTimeout` fires at once, so what it asserts is whether
the timer was armed at all, and that the nav has been redrawn by the time a
swap-shaped call returns. CLAUDE.md's outline section says the same.

## 2026-09-18 — `5e59026` — Compose an edited leaf from its affixes, slice 3's step 3

`modelEmitLeaf` in [front/model.js](front/model.js), and with it the thing
`modelEmitBlock`'s `emit` argument has been standing in for since slice 1b's
step 3 gave it somewhere to be called from: an edited leaf back to markdown.
Slice 2's `modelInlineSource` for the content, then the affixes back in the
order markdown-it took them off — per line, the quote chain slice 3's step 1
recorded, then the item marker or continuation indent 1b's step 5 recorded, and
for a heading the `open` and closing run or setext underline step 2 recorded.

It is small because the slice was measured before it was planned: a block's
`source` is `inline.content` with something glued to the front of each of its
lines, and slice 2 already reconstructs that content byte for byte. So this
puts back what markdown-it stripped on the way in, which is the same sentence
1b's step 5 and slice 2's step 3 are each an instance of, arriving a third time
one level up.

**The affixes are absolute, which the measurement decided rather than the
plan.** Only the nearest item ancestor contributes: a child's source is its
lines whole, so the marker recorded for a nested bullet already carries every
outer indent. Stacking each item above a block instead reproduces 707 of the
oracle's 861 inline-bearing leaves, and all 154 misses are a bullet inside a
bullet.

**Two suppressions, and both are 1b's tab bug one layer along** — an affix
recorded from its own column 0 has already claimed the item's indent, so adding
it again writes the same columns in different bytes. `modelQuotePrefix` matches
` {0,3}>` from the raw line, so a quote *inside* a bullet claims the bullet's
indent with it; a heading's `open` was read off the chain-stripped line the same
way, which is exactly what step 2 pinned. The reverse nesting is untouched and
has to be: in `> - item` the item sits at the quote's own depth and both affixes
are needed. Those two are the only leaves in the whole oracle a naive
composition gets wrong, and both are in `tests/fixtures/torture.md`.

Three refusals, each a `null` something recorded on purpose rather than a gap. A
leaf with no inline tree — a fence, an indented code block, a rule, a gap, a
table row — has its content *as* source and is edited as source, so a command
sets `source` rather than nulling it and this is never reached; that answers
five of the seven leaf kinds, and it is a constraint on stage 2's input layer.
A heading whose shape did not line up against `inline.content`, and an item
whose first line carried no marker, throw the way `modelEmitBlock` already
throws for a leaf with no serialiser at all.

Fifteen checks in the `model` suite, 208 to 223, and **every one of the seven
ways the composition can be wrong was written as a deliberate break first and
confirmed to fail** — stacked affixes, either suppression dropped, the marker on
every line, every block treated as opening its item, the heading suffix dropped,
one prefix for a whole block. Two were caught only by the oracle sweep on the
first pass, which is how a hand-written case reaching for the wrong leaf was
found and fixed. Step 6's headline property landed here rather than waiting, the
way slice 2 folded its own step 6 into each step: throw away every
inline-bearing leaf's `source` and emit it from its tree alone, and all 861 come
back byte-identical, the 114 without a tree refusing rather than guessing.

`npm test` is green at 1225 checks. Nothing in `front/` loads `model.js`, so
there is nothing to verify in a browser: the model is pure string and token work
and the suite is the whole of its verification. REWRITE.md's step 3 line, the
slice 3 header and step 6's line say where this leaves the slice; CLAUDE.md's
model section gains the emitter and loses the paragraph claiming an edited leaf
cannot be serialised at all.

## 2026-09-18 — `dc7ec93` — The definition a rebuilt reference needs, slice 3's step 4

`modelReferenceLabels` in [front/model.js](front/model.js), and a third
argument on `modelEmitLeaf`: the document. Slice 2's step 5 rebuilds
`[text][label]` off the `data-ref-label` stamp and explicitly declines to ask
whether that label still resolves, because a single node's token cannot answer
a question about the whole document — it named whichever block-level emitter
eventually called it as the owner, and this is that emitter. A label the
document no longer defines now falls back to the inline form instead of writing
a reference that renders as literal text.

The model can answer this where the running editor cannot: a definition is an
ordinary block in its own position (slice 1), so the document is a list that can
be searched, and one that is still there stays where the author put it — where
`appendReferenceDefinitions` has no position to reason about and collects every
definition at the end of the file.

**The plan said `gap` block and the measurement said otherwise.** `> [b]: u`
parses to a quote whose only content is the definition, so it has no child
tokens at all and is a childless leaf rather than a container holding a gap;
`> > [h]: deep` is the same one level down, and scanning the gaps misses both.
The rule that holds is a **leaf with no inline tree, and nowhere else** — which
is exactly the set step 3 refuses to emit, and not by coincidence: such a leaf's
content *is* source, and a definition is content no inline tree ever held.

**It asks the parser rather than a regex.** Each candidate leaf's bytes go back
through `md.parse`, whose `env.references` is markdown-it's own record of what
it just defined — the same reuse `modelFirstConstruct` and step 3's link-tail
parsing already argue for. That is what makes the retired loss free:
`scanReferenceDefinitions`'s single-line regex cannot see a definition wrapped
onto a second line at all, and `tests/fixtures/torture.md` carries one saying so
in its own prose. The scan is lazy — at most once per emitted block, and not at
all unless a link in it actually needs rebuilding — and never cached across
blocks, since an edit to a definition is exactly what a cache would go stale on.

Eight checks, 223 to 231. The search is checked against the parser's own answer
for the whole file rather than against itself: on all six oracle files, where
**all five definitions are in `torture.md` and the other five files hold none** —
the bias that fixture exists for, arriving a fifth time — and on ten
hand-written cases either side of the line, a definition in a list item, in a
quote, two quotes deep, two in one block, wrapped, and the four places a
definition-shaped line is not one. Then the emitter: a rebuilt reference whose
definition is still there keeps its label, one whose definition has been deleted
falls back to inline, one emitted with no document handed over keeps the stamp's
spelling (step 5's behaviour unchanged, since a caller not given the means to
answer should not materialise a possibly stale href on a guess), and editing a
paragraph that uses a reference leaves the definition where it was. Each of the
five ways it can be wrong was broken on purpose first and confirmed to fail.

**One limitation is pinned rather than fixed, and measuring it turned up an
accepted loss on `main` that was not written down.** `referenceAwareLink`
replaces markdown-it's inline `link` rule and nothing else, so `![alt][label]`
carries no stamp — and the `referenceLink` Turndown rule filters on
`nodeName !== "A"` besides. In the model an untouched reference image still
round-trips on the tail step 3 recorded and only a rebuilt one comes back
inline; in the running editor it always serialises inline, and if it was the
only use of that label the definition is dropped with it. Reaching it means
copying the `image` rule the way the `link` rule was copied, which belongs under
3.1's parser configuration rather than bolted onto this. CLAUDE.md's
reference-links section now records it as the third of that family.

`npm test` is green at 1233 checks. Nothing in `front/` loads `model.js`, so
the suite is the whole of this step's verification. REWRITE.md's step 4 line and
the slice 3 header say where this leaves the slice; step 5, re-wrapping, is what
is left of it.

## 2026-09-18 — `cddd1c9` — Re-wrap an edited block, slice 3's step 5

`modelEmitLeaf` takes a width, and `wrapMarkdownLine` in
[front/markdown-style.js](front/markdown-style.js) takes the prefixes to put
back rather than reading them off the line it was handed. The derivation moved
into `wrapMarkdownPrefixes` and stays as the default, because `reflowMarkdown`
is handed a document as text and has nothing else to consult.

**The difference is the tab.** Derived, a continuation indent is spaces, so the
marker `"-\t"` continues under two of them — the same column and different bytes
from the bare tab the file used, on 1 item in 343 across the oracle, and exactly
the bug 1b's step 5 fixed at parse sitting unfixed one layer along. Measuring it
also explains why nobody saw it: a marker only ever reaches that path from
Turndown's own `listItem` rule, whose pad comes from a sniff matching spaces
alone, so the case is unreachable through the app. It took reading a file's own
bytes to find at all, which is the argument for recording rather than deriving,
made once more.

**Most of the value is in what is not re-wrapped.** Never a heading, in either
spelling — a wrap turns its tail into a paragraph, and `reflowMarkdown` refuses
one by looking for a `#`, which misses setext entirely where the model knows
what kind of block it is holding. Never a line carrying maths, the one guard
structure cannot replace. And never a line already inside the width, because
`inline.content` keeps the author's own breaks: only a line the edit made too
long is touched. A width of 0 stays a real answer meaning *this file is not
hard-wrapped*, which `corpus/readme.md` is.

The metric on the six oracle files: **all 861 inline-bearing leaves compose
exactly, and re-wrapping each at its own file's width leaves 783 byte-identical.**
The 78 that move hold a line the author let run past the width — a guaranteed
population rather than a fault, since `sniffWrapWidth` takes the 95th percentile
and about one prose line in twenty is longer than it by construction. On `main`,
where an edited paragraph is one Turndown line re-flowed whole, all 861 would
move.

**It found a defect in step 3.** A paragraph indented one to three spaces is
still a paragraph, and markdown-it strips that indent off `inline.content`
exactly as it strips a list marker — so an edited one came back flush left,
silently, and 861 of 861 passed with it missing because not one paragraph in the
oracle is indented. `leadingAffix` is the fix: everything markdown-it took off
the first line, recorded whole, with the emitter subtracting the item prefix it
is putting back. Whole rather than named because the pieces worth naming already
are, and one subtraction in the emitter beats a second derivation at parse.

`model.js` now calls into `markdown-style.js` for `wrapMarkdownLine` and
`hasMathSpan` rather than carrying a second copy of either — a real load-order
dependency the three registries will have to honour when it joins them at stage
4, and why the `model` suite loads the two together.

Six checks in `model` and three in `save-fidelity`, 1233 to 1246, each of the six
ways the composition can be wrong broken on purpose first and confirmed to fail.

**`npm test` is not the verification here, and this is the first step where that
matters**: the change lands in `markdown-style.js`, on the save path, and no
suite opens a document, edits it and saves it. So the recipe was run by hand, in
Chrome, against [tests/fixtures/break-test.md](tests/fixtures/break-test.md) —
opened through the real `openFile`, saved through the real `saveFile` to a
scratch path outside the repo, diffed, scratch deleted, the fixture never
written over.

- The refactored wrapper writes **byte-identical output to the committed one**
  for the same document, checked by stashing the change, saving again and
  diffing the two saves against each other.
- Editing DELTA re-wraps DELTA at the sniffed width of 78 and moves no other
  paragraph.
- ALPHA's and BRAVO's two-space hard breaks survive, and ECHO comes back
  byte-identical.
- CHARLIE still diverges — its backslash break is rewritten to two spaces and
  its line re-wrapped. That is **TODO 2.3**, which this fixture exists to find,
  and the committed wrapper produces exactly the same divergence.

## 2026-09-18 — `6289e11` — Teach the paste check Safari's keyboard, TODO 1.3

[tests/paste-check.html](tests/paste-check.html) could not measure the one
browser it was still waiting on. Reported by hand in Safari: the plain-text
paste logged as `menu or unknown`, with the meaning "use the keyboard rather
than a menu" — when the keyboard was exactly what had been used.

**The cause is one line.** The keydown matcher was `e.key !== "v" && e.key !==
"V"`, and `e.key` is the character *produced*. On macOS the Option key composes
characters, so Option and V together make `√`. Safari's binding is
Cmd+Shift+Option+V, so `e.key` is never `"v"` while it is held, the handler
returned early, and the keydown was thrown away. `e.code` is the physical key
and is immune to both the layout and the modifiers, so that is what it reads
now.

**Reproduced and then re-run against the fix**, by driving the page's own
script with synthetic events carrying `key: "√"`, `code: "KeyV"`: the committed
page logs that keystroke as `menu or unknown`, and the fixed one logs it as
`Cmd+Shift+Option+V` and classifies it as a plain-text paste. Cmd+V,
Cmd+Shift+V and Ctrl+Shift+V all still classify as they did.

**Doing that turned up a worse failure in the same family, now closed too.** A
dropped keydown left the *previous* one sitting in `lastKey`, so a second paste
inside the two-second window was silently attributed to it — Safari's binding
reported as `Ctrl/Cmd+V`, a wrong measurement rather than a missing one, and
visible only because the tester happened to take longer than two seconds. A
keystroke is now consumed once a paste has used it, so one keystroke explains
one paste and no more.

Three smaller changes follow from the same root cause, which is that the page
had a fixed idea of the keyboard:

- **The binding is named from the modifiers actually pressed**, so the table and
  the summary read `Cmd+Shift+Option+V` in Safari and `Cmd+Shift+V` in Chrome
  rather than a constant the reader has to translate.
- **Plain-text paste is Ctrl/Cmd+V with any extra modifier**, not Shift alone,
  which covers both bindings without the page carrying a table of which browser
  binds what.
- **Every keydown that reaches the page is logged**, matched or not, above the
  table. That line is what would have answered this in one run instead of two:
  a keystroke listed there and marked ignored says the page has the wrong idea
  about the keyboard, where silence says the browser swallowed it — and those
  are opposite conclusions for 1.3, whose proposed fix hangs off that keydown.

The instructions now name both bindings and say to try the other if nothing
happens. Nothing in `front/` changed and no suite loads this page, so `npm test`
proves nothing about it and was not run for it; the verification is the harness
above plus a real Safari, which is still TODO 1.3's remaining measurement.

## 2026-09-18 — `1361fd6` — Safari answers it too, and TODO 1.3 closes

Run in Safari 26.6.2 on macOS (`Version/26.6.2 Safari/605.1.15`) with a real
clipboard and a real keyboard, which is the only way this question can be asked:

| Paste | Flavours offered | Mandy would take |
| --- | --- | --- |
| Cmd+V | `text/html` `text/plain` | the text/html branch |
| Cmd+Shift+Option+V | `text/plain` | the plain text branch |

**WebKit strips `text/html` on its plain-text binding, exactly as Blink and
Gecko do.** So `app.js`'s plain branch already fires in every engine, the
paste arrives bare, and there is nothing to build — in any of the three. The
item predicted the opposite for all three, and was wrong three times, which is
the whole argument for the check pages: it opened as a task and turned out to be
a measurement.

The second half came back too. **The `keydown` for Cmd+Shift+Option+V does reach
the page**, so the shape 1.3 proposed — a flag set from a `keydown` on `#editor`
and consumed by the next `paste` — is workable in WebKit as well, and stays
available if a browser ever changes its mind. Nothing needs it today.

**TODO 1.3 therefore leaves [docs/TODO.md](docs/TODO.md)** rather than staying in
it struck through, per that file's own rule, and the number is free for reuse. So
every live reference was chased in this commit: `CLAUDE.md`'s paste-check
paragraph, and four in [tests/paste-check.html](tests/paste-check.html) itself.
Historical CHANGELOG entries keep the number — they record what the item was
called when they were written, and this file is a record rather than an index.
`tests/fixtures/corpus/claude.md` keeps it too, deliberately: it is a frozen
oracle copy, and refreshing one is its own act that moves the `model` suite's
counts.

**The page stays, and its framing changes with the answer.** It is a regression
check now rather than an open question — the answer is per browser and per
version, and the way it comes back is a browser release rather than a change
here. Its report strings no longer name a dead item: a browser that *did* keep
the flavour is now told it "needs the app to notice the binding itself — which
no browser has needed so far", which is the same instruction without the dangling
reference.

No code in `front/` changed, so `npm test` proves nothing about this and was not
run for it. The verification is the Safari run above.

## 2026-09-18 — `bd9c84d` — Fix the hard-break half of TODO 2.3

**The condition on that item was the wrong test, and removing it is most of
this change.** 2.3 read *no fix on the old core unless it turns up in daily
use*, which makes the bug's existence depend on whether the maintainer's own
documents happen to mix spellings. That is exactly the bias
[tests/fixtures/torture.md](tests/fixtures/torture.md) was created to remove,
and the same reasoning the model's oracle stopped being living documents to
escape. The fixture already carries both minority spellings — one backslash
break, one `_underscored_` — so the construct was covered and nothing tested it.

So the only real question is what the fix costs, and measured across all six
oracle files the two halves answer differently.

**The break half is cheap and is now fixed.** `markdownBlockKey` drops a
trailing backslash before it collapses whitespace, so the two spellings of a
hard break land on one key. A block written the minority way now matches its own
source, the restore layer hands back its bytes, and neither the spelling nor the
wrapping moves. The hazard that matters is not whether it fixes the case but
whether it makes two *different* blocks key alike, and that was measured
directly: **no collisions in any of the six files.**

**The emphasis half stays for 3.1, and that is measured rather than deferred.**
The only normalisation available without parsing is folding `_` into `*`, and on
`torture.md` that keys the horizontal rules `***` and `___` identically — two
different blocks, so the restore could hand back the wrong bytes, which is worse
than the bug it fixes. Doing it safely means knowing which `_` and `*` are
delimiters and which are inside a code span or a `snake_case` identifier, and
that is a second parser free to disagree with the first. The model already
records each node's spelling as written, so the wait is for something that
exists.

Five checks in `save-fidelity`, 1246 to 1251: both directions of the break (which
spelling is the minority is per document), that a block differing after the break
still misses, that a backslash mid-line is still left alone — and one that pins
the emphasis half as *not* fixed, so a reader does not have to wonder. Each was
confirmed to fail with the change reverted; the mid-line check was rewritten
after the first version passed against a deliberately broken key, which is the
whole reason for breaking it on purpose.

**`npm test` is not the verification — this lands on the save path.** Run by
hand against [tests/fixtures/break-test.md](tests/fixtures/break-test.md),
opened and saved through the real file API to a scratch path outside the repo:

- **The whole fixture now round-trips byte-identical, CHARLIE included.** That
  paragraph has diverged on every previous run of this recipe; it is the case
  the fixture exists to find.
- Editing DELTA still moves DELTA and nothing else, so the restore layer has
  not been blunted.
- Editing CHARLIE *itself* still converts its backslash to two spaces. That is
  the residue and it is 3.1's: Turndown has one setting for the whole document,
  and only a per-node spelling fixes an edited block. The break survives; just
  its spelling does not.

One correction to a reading taken during that run: editing CHARLIE first
appeared to delete the break outright, which was the test method rather than the
app — assigning `textContent` replaces a paragraph's children and takes the
`<br>` with it. Editing only the first text node leaves the break in place.

## 2026-09-18 — `9b321b7` — Close slice 3's step 6, and with it stage 1 of the rewrite

Four checks in the `model` suite, 1251 to 1255, and stage 1 of TODO 3.1 is done.

**The new checks go through `modelSerialise` rather than calling the emitter
directly**, which is the difference between this step and everything above it:
the emitter now sits under the whole recursion — a leaf's bytes, its item, its
list, the separators between them, the document's prefix — which is the
arrangement the app will actually use and the one a per-leaf check cannot reach.

- **Every inline-bearing leaf in a file edited at once, and the file still
  serialises byte-identical** — 861 leaves across the six oracle files.
- **Each one edited alone rebuilds the file around itself exactly, for exactly
  one emitter call.** That is slice 1b's step 6 sweep with a real emitter under
  it, where until now it had only ever measured containers handing back bytes
  that already existed. Re-parsed per leaf, since `modelTouch` clears ancestors
  and a second measurement on the same document would be measuring one that has
  already been edited.
- **The same with each file's own width on**, and the per-file counts match slice
  3 step 5's measurement exactly from the other direction — worth more than
  either alone, since the two are computed by different code.

**Both of the first two count the emitter's calls, because that is the only way
they can pass by doing nothing.** A `modelTouch` that failed to clear leaves an
untouched document, which serialises from its own bytes and comes back identical
with the emitter never running. Confirmed against a `modelTouch` stubbed to a
no-op: both read `0 emitter calls` and fail. One more break was tried and
correctly caught nothing — a container that recurses into its children even when
it still holds its own source produces the same bytes, because the tiling
invariant says `leading` plus the children *is* the source. That is an
equivalent implementation rather than a bug, and nothing should have flagged it.

**Stage 1's exit criterion is the estimate table's, and all three clauses are
met** — checked against the **living** files rather than the frozen oracle
copies, once and by hand, because that is what the criterion names:
`CLAUDE.md`, `README.md`, `front/welcome.md` and `docs/TODO.md` all round-trip
byte-identical through the model with no browser involved, and every
inline-bearing leaf in each re-emits its own bytes — 279, 107, 34 and 121 of
them. Editing one paragraph changing one paragraph is the sweep above.

The third clause — *the `save-fidelity` suite's cases pass against the model* —
needed reading rather than running, and the reading is written into
[docs/REWRITE.md](docs/REWRITE.md) so it can be argued with rather than assumed.
That suite's cases are partly statements about Turndown and the DOM, which have
no model equivalent, and partly statements about constructs the old core has to
work to preserve. The constructs are what is asserted: twenty of them — a break
inside a list item and inside a blockquote, both break spellings and a document
mixing them, a wrapped item's content indent, three-deep nesting, an all-ones
ordered list, a padded table and an aligned one, each rule character, a setext
heading that is not a rule, `snake_case` that is not emphasis, a fenced block, a
single-line and a titled reference definition, a definition inside a fence that
is not one, inline and display maths, an autolink, and a code span holding a
delimiter — each round-tripped and then re-emitted from its own tree.

**So stage 1 closes and this branch goes back to `main`**, per D8. It changes
nothing the editor does, since `model.js` is in none of the three registries.
What it carries over is `markdown-parser.js`'s refactor of the live parser
configuration, slice 3 step 5's new third argument on `wrapMarkdownLine`, TODO
2.3's hard-break fix in `markdown-style.js`, and an end to the two branches'
documents drifting.

Stage 2 — render, input, the formats — is next, and it is the first stage that
touches what the editor does.

## 2026-09-18 — `5322693` — `rewrite` merges back: stage 1 of the editing-core rewrite

D8's first of two merges, at the end of stage 1. **It changes nothing the editor
does** — `model.js` is in none of the three registries — which is the whole
reason this is the safe one of the pair.

What crosses over: the model itself and its suite,
[front/markdown-parser.js](front/markdown-parser.js) with the parser
configuration `app.js` used to carry inline, `wrapMarkdownLine`'s new
first-line/continuation prefixes, TODO 2.3's hard-break fix in
`markdown-style.js`, the six oracle fixtures, the spike page, and an end to the
two branches' documents drifting apart.

**All the code merged with no conflict. All four metafiles did, and two of them
were hiding a number collision that no textual merge would have shown.** Both
branches had been allocating from the same numbering space for a fortnight:

- **D7 was two different decisions.** `main`'s *Mandy holds a document, never a
  page* (2026-09-15) and the branch's *The rewrite simplifies the engine*
  (2026-09-13). The branch had it first by two days, and is referenced from
  `front/model.js` and `front/markdown-parser.js` as well as four documents, so
  **`main`'s becomes D9** and the four ROADMAP references move with it. The
  2026-09-15 CHANGELOG entry keeps the heading it was written with, the way
  every entry here does, and now carries a note saying where the decision went —
  without that a reader following D7 backwards lands on the wrong one.
- **TODO 4.6 was two different items**, and *git merged it silently*: `main`'s
  *`newTab()` is undecided* against the branch's *the outline is a second late*.
  Nothing flagged it, and one would simply have replaced the other. The
  branch's is referenced from `front/outline.js`, so **`main`'s becomes 4.12**.

TODO.md's own rule is what both follow: a number is chased through the code and
CLAUDE.md in the same commit, and the CHANGELOG keeps the number an entry was
written with because it is a record rather than an index.

Three smaller reconciliations, each a place where the two sides wrote about the
same thing without seeing each other:

- **CHANGELOG** — 18 entries from `main` and 23 from the branch, interleaved by
  commit time rather than appended, since the file is oldest-first. Fifteen of
  `main`'s carry no commit hash; the redesign run never backfilled them, so
  their order came from `main`'s own commit sequence instead. Worth fixing
  separately.
- **ROADMAP** — both sides added a section (document themes, and the annotation
  sidecar). Both kept. The branch's says a per-document theme "would be the same
  shape" as the sidecar, which was true when it was written and is not now:
  that is D9, decided three days earlier on the other branch. The sentence now
  points at the decision and says why it was phrased as a guess.
- **TODO** — `main`'s 4.7, 4.8, 4.10, 4.11 and 6.7 and the branch's 4.6, 1.7 and
  2.3 all land; 1.3 stays closed and 4.9 stays closed.

`npm test` is green at 1258 checks on the merged tree — `toolbar` and `tabs`
carry `main`'s new ones, `model` the branch's 245 — and `deno task check` passes
in `server/`.

**One thing this merge deliberately does not do.** TODO 4.6, the branch's, has
all three of its stages marked done and should have left the file when it was
fixed on 2026-09-18, per TODO.md's own rule. It is still listed as an open bug.
That is a pre-existing gap rather than merge work, and folding it in would mean
chasing `front/outline.js` and CLAUDE.md in a commit that is meant to be a
merge.

## 2026-09-18 — `a1eba4b` — TODO 4.6 leaves the file, and its number with it

The outline's one-second lag was fixed on 2026-09-18 in `4a45f48`, with all
three of its stages — measure, fix, verify in a browser — marked done. The item
stayed in [docs/TODO.md](docs/TODO.md) anyway, still reading *(bug, survives
3.1)*, which is forty-four lines of finished work sitting in a list of open
work. The merge one entry above named it as something it was deliberately not
doing; this is that.

TODO.md's own rule is what this follows: a finished item leaves rather than
staying struck through, because what was done and why is better looked for here,
and a list of open work reads better without closed items in the way. **The
number goes back into circulation with it**, so the two live references were
chased in the same commit — [CLAUDE.md](CLAUDE.md)'s outline section and a
comment in [front/outline.js](front/outline.js). Neither lost anything: both
already carried the measurement date and the reasoning, and the number was the
only part that could go stale.

CHANGELOG entries keep it, the way they kept TODO 1.3's: this file is a record
of what things were called when they happened, not an index of what they are
called now.

Nothing but a comment changed in `front/`, and the `outline` suite — the one
that names that file — is green.

## 2026-09-18 — `d4f5b0f` — Every entry in this file now carries its commit

Twenty-one entries had no hash in the header, spread from 2026-08-30 to
2026-09-16 — the convention lapsed twice, once for a handful of entries in
early September and once across the whole chrome-redesign run. The merge two
entries above worked around the gap by ordering those entries from `main`'s own
commit sequence; this closes it.

**Derived rather than guessed.** For each one, the commit that *added its
heading line to this file* is the commit it describes: these were never
backfilled, so the entry landed in the same commit as its change. `git log -S`
on the heading answers that exactly, and every one of the twenty-one resolved to
exactly one commit. Two are worth naming because they look wrong and are not:
`2baad56` carries two entries, which is a thing this file already does
elsewhere, and `b3645a3`'s subject is the terse "moving to the rewrite" rather
than anything resembling its entry.

**Checking the result turned up a dangling hash that had been there for weeks.**
Every backticked hash-shaped token in this file and in the other metafiles was
resolved against the object database — 125 distinct in this file alone — and
exactly one did not exist: `d604beb`, mentioned three times around 2026-08-31.
The entries it named are both `8f166fc`, so the two changes were amended
together after the entry was written and the hash recorded was the pre-amend
one. Both entries now carry `8f166fc`, and the sentence that referred to the
other change by hash refers to it by name instead, with a parenthesis recording
what happened — the hash is wrong history rather than an entry to rewrite
silently.

145 entries, all with a hash, all resolving. No code changed, so nothing ran.

## 2026-09-18 — `b56af06` — The tab switch's lost position is written down as TODO 4.13

Reported from use: coming back to a tab lands at the same place every time,
wherever you were in the document. That is exactly what the code does, and
nothing in it was ever decided — `parkActive()` in
[front/tabs.js](front/tabs.js) parks `undo`, `file` and `md`, the caret and the
scroll offset are among neither, and `adoptActive()` ends on
`focusDocumentStart()`, which puts the caret at the first child and lets
`editor.focus()` scroll the editor into view. That ending is right for its other
caller, `resetDocument()`, where the document is blank; the tab switch inherited
it.

Filed rather than fixed, because the shape of the fix is a real question and not
a missing line. **It is two restorations**: a document being edited wants its
caret back and gets the scroll for free from `focus()`, while one being read
never moved its caret off the start and wants `scrollY` — do the first alone and
the case that prompted this behaves exactly as it does now. **The undo bundle's
`selection` is not the source**, since snapshots are taken on `input` and that
caret is the last edit's rather than the last position's. And **whether the
position survives a page load is undecided**, argued both ways in the item: a
seventh document key, written on the autosave's cadence, against a scroll offset
being a session habit rather than part of the document. The in-session half
needs no answer either way and can land on its own.

The item also carries the two reuses it should make rather than re-derive —
`undoTextOffset` / `undoLocateOffset` for the offset conversion, since
`adoptActive` assigns `editor.innerHTML` and a `Range` would not survive it —
and an ordering note against 4.10, which moves the scroll off the window
entirely and already names the two call sites that would have to be repointed.

Numbered 4.13 rather than reusing 4.6 or 4.9, both freed earlier today: 4.2's
argument against minting a number whose old entries are this week's.

No code changed, so nothing ran.

## 2026-09-18 — `d6c34d8` — Stage 1's merge is recorded as done

**[docs/REWRITE.md](docs/REWRITE.md)'s stage 1 line still read "→ MERGE TO
`main` NOW".** The merge landed in `5322693` on 2026-09-18 and the line was
never updated, so the file carried a pending instruction for something a week's
worth of commits old — against its own rule that the status is updated as part
of the landing.

It now records the merge with its date and hash, what crossed over, and the two
number collisions the merge turned up that no textual merge would have shown.
The matching sentence in [CLAUDE.md](CLAUDE.md)'s branch note said the same
thing in the same tense and is fixed with it: the first of D8's two merges has
happened, the irreversible one has not, and the branches have been identical
since.

Correcting the record before planning on top of it, which is why this is its own
commit and the plan is the next one.

No code changed, so nothing ran.

## 2026-09-19 — `a51566a` — Stage 2 is planned, and its open decisions settled

**Stage 2 was one paragraph saying why it is not a merge point, and nothing
about what it is.** Stage 1 had five slices written before any of it was built;
this had none, and CLAUDE.md's rule is that the plan comes first — the failure
it names is a CHANGELOG entry announcing "stage two" of a sequence that exists
nowhere a reader can find. It now carries the exit criterion, seven slices in a
forced order — render, selection, input/text, input/structure, paste, undo,
formats — and, for each, what it entails and what it is allowed to leave alone.

Two corrections fell out of writing it. **`model.js` joins the three registries
at slice 1, not at stage 4** — for the editor to draw from the model it has to
be in `index.html` and `SHELL_ASSETS`, and an editable export whose core is the
model needs it in `ASSETS` or it ships a dead editor. Slice 1's own line and
CLAUDE.md both still say stage 4; they are corrected in the commit that lands
slice 1, so the claim moves when the fact does. And **the input layer's check
page is stood up in slice 3 rather than at the end**, because `dom.mjs` has no
editing engine and no HTML parser, so until that page exists nothing is
measuring the one part of the stage that can blow the estimate.

**Then every decision the plan raised was settled, before any of the work
starts.** Six of them: four the plan itself left open, and two more found by
probing the code while answering those. Each is written up where the slice that
obeys it lives. Deciding them first is the order this repo's rules ask for and
not the order these things usually happen in.

**A table refuses edits until stage 3**, rather than the row-as-source stopgap
that was recommended. Two arguments beat the recommendation. It is *a patch that
would then be unpicked* — showing the user raw pipes for one stage, at full
cost, for a behaviour with a known expiry. And **the parity it gives up is
smaller than the plan claimed**: TODO 1.1.8 already records that an existing
table cannot have a row or column added or removed, confirmed by hand on
`docs/TODO.md` itself, so what actually stops working is typing into a cell's
text inside a construct nobody can restructure. Tables are view-only in every
way that matters; they now say so.

Three things follow, written into slice 4 because none of them is obvious from
the decision. **Refusal is an absence, not a branch** — the handler already
calls `preventDefault()` on every `beforeinput` whether it handles it or not, so
a table needs no input-layer code at all. It does need to *say so*, since a
keystroke that silently does nothing reads as a broken editor: the signal is
rendering the subtree `contenteditable="false"`, so no caret goes in, rather
than a `notify` that would fire per keystroke. And **a table as the last block
must not trap the caret** — the classic `contenteditable="false"` trap, which
cannot happen today because everything is editable, so it is new and it is the
first thing the input check page has to answer.

The other three, each against what it beat:

- **An undo state is a clone of the document** (`structuredClone`, which handles
  the `parent` cycle) rather than copy-on-write blocks. It is not a regression —
  today's undo snapshots the whole document as an HTML string on the same
  cadence — and it is reversible, where rebuilding `modelTouch` mid-input-layer
  would not be.
- **The savepoint id stays document-scoped and parked with the bundle** rather
  than going globally unique, so `adoptActive`'s undo-before-file ordering stays
  load-bearing and the `tabs` suite's mutation checks go on guarding it.
- **Text typed at a mark's edge goes inside when the caret was inside**, read
  off the mark chain `modelInlineAt` already returns as `path`.

**None of the four goes in DECISIONS.md, and that is a judgement rather than an
oversight.** Three are implementation choices inside one stage's slices. The
table refusal is the only one a user can see, and it has a named expiry in stage
3 — DECISIONS.md records what the project has settled for good, and a refusal
that ends in a fortnight is plan. If it outlives stage 3 it stops being plan and
wants a D number, which is written down as the thing to notice.

**Two more decisions came out of checking whether anything else was open, and
both block a slice.** Neither is visible from the design; both were found by
probing rather than reading.

**An empty block renders a marked filler `<br>`.** markdown-it renders an empty
paragraph as `<p></p>` — measured — and in a `contenteditable` that has no
height and takes no caret, which is why `BLANK_DOCUMENT` has always been
`<p><br></p>`. So the renderer has to emit a `<br>` the parser never produces,
and the DOM then holds a node the model has no character for, against a slice 2
rule that says a `<br>` *is* one character. The collision is an ordinary
keystroke: type `foo`, press Shift+Enter, and the model holds four characters
while the DOM holds `<p>foo<br><br></p>` — one break and one filler — so a walk
counting both lands every later edit in that block one character out. The filler
is marked rather than recognised by position or replaced with CSS height, on the
user's framing: nothing here reaches the file, D1 has no opinion about an
attribute nobody serialises, so the only criterion is which is simplest — and an
attribute that states what a node is beats a rule that re-derives it.
`isFillerBreak` is one predicate shared by the renderer and the walk, the shape
`isGhostElement` already has.

**The outline is told about a document swap rather than inferring one.**
`scheduleOutline` skips its debounce when a record's target is `#editor` with
`childList`, which is the fingerprint of an `editor.innerHTML` assignment — and
also what a top-level block splice produces, so from slice 4 every Enter would
rebuild the whole sidebar synchronously. `modelRender(doc)` calls
`renderOutline()` instead, and the inference goes rather than getting finer. The
reasoning it replaces was sound against eight assignment sites; after slice 1
there is one. A whole-document signal is not a new kind of thing here — the
disk-changed check is the same shape. Four checks in the `outline` suite are
pinned to the fingerprint and change with it.

And the two the plan itself had left implicit, both blocking slice 1. **The
model is built by converting the stored HTML** at the two places a document
arrives as HTML — the boot restore and `adoptActive` — because the `source` key
holds the document as it *arrived* and would drop unsaved edits. That loses the
source spans of blocks edited before a reload, which is exactly today's
behaviour, and it exercises stage 4's one-time migration for two stages before
it becomes irreversible. It also settles that **`tabs.js` is untouched this
stage**: a switch re-parses on adopt, so there is no model bundle to park.
**The new core sits behind a flag, default off** until the stage 4 merge, so the
branch stays usable and the input layer can be driven in the running app the way
the two list check pages already drive it in an iframe.

Two consequences recorded away from the slice, so the refusal cannot fall
between the two stages that share it. **Stage 2's exit criterion now carries the
exception explicitly** — this stage closes knowingly short of "everything the app
does today" by one behaviour — and **stage 3's line and TODO 1.1.8 both say the
item is what lifts it**. Two decisions inside the rewrite remain open and neither
belongs to stage 2: Enter in a table cell, and whether the tab switch lock comes
off at stage 4. Nothing else is open before slice 1 can start.

No code changed, so nothing ran.

## 2026-09-20 — `ff3d5c4` — Stage 2, slice 1: the model renders

TODO 3.1's stage 2 starts. The model can draw itself: `modelRenderBlock` is a
block's HTML out of markdown-it's own renderer, `modelRenderDocument` is the
document's, `modelRender` builds `#editor`'s children from them, and
`modelRerenderBlock` replaces one subtree. `model.js` joined all three
registries — `index.html`, `sw.js`'s `SHELL_ASSETS` (`VERSION` to `v1.33`) and
`html-export.js`'s `ASSETS` — because for the editor to draw from the model the
app has to load the model.

**Loading it is not running it.** `modelCoreEnabled()` is off until the stage 4
merge; `?core=model` and `?core=legacy` set it and it sticks. With it off the
editor is byte-for-byte the one that shipped yesterday. With it on the model
renders and the save path is *still* the old core's — `file-api.js` reads
`editor.innerHTML`, Turndown serialises it, `restoreSourceWrapping` runs — which
is the split stage 2 was planned around: the model owns editing, the file
belongs to the old core until stage 4.

Seven things measured before the work started, five of which changed the plan.
They are in [docs/REWRITE.md](docs/REWRITE.md)'s slice 1, written there before
any of this was built; the three worth repeating here:

**A block is rendered with the token that precedes it.** Rendered from its own
token slice alone, every block in five of the six oracle files concatenates to
`md.render` of that file — and `torture.md` does not. markdown-it opens a
block-level tag on a new line when the token before it is hidden, which is the
tight list item `<li>Walk the transect.\n<ol>`, and a slice starting at its own
open token cannot see that. So `hiddenBefore` is recorded at parse and
prepended: a hidden token renders to the empty string by markdown-it's own rule,
so it supplies the context and emits nothing, and no rule of markdown-it's is
re-derived. With it, all six match, and that equality is the slice's instrument.

**The filler's mark goes on the `<br>`, not the `<p>`.** The plan spelled it
`<p data-filler><br></p>`, and slice 2 needs `isFillerBreak(node)` to tell apart
the two `<br>`s in `<p>foo<br><br></p>` — one a break, one a filler — which a
mark on the parent cannot do. It is also the DOM builder's rather than the
renderer's, because `md.render("#\n")` is `<h1></h1>`: an empty block is
parseable and not only editable, so a renderer that filled one in would diverge
from `md.render` on any file holding a bare `#`.

**A block owns an element only when its rendering is exactly one.** markdown-it
hides a tight list item's paragraph, so it renders to bare text with nothing to
stamp `data-block` on — and the re-render unit is therefore the nearest ancestor
that does own an element, which for such a paragraph is its `<li>`. Not a
heuristic: replacing an element with a block's rendering is correct exactly when
that rendering *is* the element.

Blocks are built one at a time into their real parent rather than as one string
assigned to `#editor`, which is what makes the block-to-element map fall out
instead of having to be reconstructed, and gets the fragment parsing context
right for free — an `<li>` goes into its `<ul>` and a `<tr>` into its `<tbody>`,
where the same markup parsed detached would be thrown away. Measured on a
2,399-line document of 1,325 blocks: 16.8ms against 13.4ms for one `innerHTML`.

**The outline's property is immediacy, and the mechanism is now per core.**
`scheduleOutline` skipped its one-second debounce on a `childList` record
targeting `#editor`, which is an `editor.innerHTML` assignment's fingerprint —
and from slice 4 is also what every top-level Enter produces, so the commonest
structural keystroke there is would rebuild the whole sidebar synchronously. So
`modelRender` calls `renderOutline` itself and the fingerprint is skipped
whenever `modelCoreEnabled()`. The plan removed the fingerprint outright; that
would have regressed the branch's own default path, where the old core is still
swapping documents and the record is the only signal there is. It goes at stage
4 with `editor.innerHTML`. The four `outline` checks pinned to the record shape
are rewritten to the property and now drive both cores.

**Seven routes into the document became three doors.** `loadDocumentMarkdown`,
`loadDocumentHtml` and `loadBlankDocument` in `app.js`, each one branch on the
flag, so Open, Reload, welcome, upload, New, the boot restore and a tab adopt
pick a core in one place rather than seven. The `undo` suite's count of
`editor.innerHTML` assignment sites goes from 5/1/1 to **3/0/0** — the zeroes
being assertions rather than absences. The two HTML routes convert with the
whole of `htmlToMarkdown` rather than a bare Turndown pass, which is the same
call the save path already makes: style-aware, and restoring unedited blocks
from `markdownSource`, where a bare pass would hand the model a document
rewritten in Turndown's house style. `tabs.js` changed by one line, plus moving
the markdown-style adopt above the content — the one adopt in `adoptActive` with
no ordering constraint of its own. Content before undo and undo before file are
untouched.

`isBlankContent` learnt to strip `data-block` and `data-filler` before
comparing, since a blank document has to read blank whichever core drew it;
`beforeunload`'s open-coded copy of the same four comparisons was replaced by a
call to it, which is how that bug would otherwise have shipped twice.

**How it was verified.** The Deno suite covers the string half and nothing else:
`tests/dom.mjs` has no HTML parser, so a stub could only agree with whatever it
was told. Thirteen new checks in `model` — the six-file equality, the tight-list
newline pinned on its own, a gap rendering to nothing, a container as its own
tags around its children, unique minted ids, four filler cases and the flag
reading off outside a browser — and four rewritten in `outline`. 1,272 checks
pass.

The DOM half was measured in a **scratch harness**, `front/render-scratch.html`,
which is deliberately untracked and adds no route to `server.ts`: a check page
measures the *browser* and earns its keep by being re-run when a browser
changes, and this measures our own code in a real DOM. It lives in `front/` only
so the static handler that already serves `front/` serves it too, same-origin
with `/model.js` — which is the only thing the `/tests/` route was ever buying.
Run with `npm run serve`, then `http://localhost:9130/render-scratch.html`.
**Green in Chrome 152 on macOS**, on a sample covering every branch and on
`welcome.md`: the block-to-element map at every depth, `<li>`s and `<tr>`s
surviving as real elements inside their parents, gaps occupying nothing,
re-rendering a block twice adding no nodes and putting back identical markup,
the three filler cases, and the verify quiet throughout. **Gecko and WebKit are
not measured** — the same page, the same recipe, and nothing here depends on an
engine the way the execCommand pages did.

`modelVerifyRender` is the spike's step 6 kept as a permanent assertion rather
than a question that retired: after a render, each block's DOM text against the
text its tree says it holds. Off by default. It reports what it *compared* as
well as what it skipped, which was a bug caught while running it — counting only
skips and failures made a document where everything passed read as a document
where nothing was checked. It skips a block holding an image or an equation, and
counts those apart from the blocks owning no element, because the two are
different news: un-typeset maths is bare text in the DOM while the model holds
one `￼` for it, and **slice 2 inherits that** — its offset space says an
equation is one character, which is true of MathJax's output and false of the
text standing in for it until MathJax has run.

## 2026-09-20 — `7092835` — Stage 2, slice 2: the selection mapping

`(block, offset)` to a DOM position and back. The model half was built in stage
1 on purpose — `modelInlineText`, `modelInlineOffset`, `modelInlineAt`, written
to `undo.js`'s boundary rule — so what lands here is `modelDomText`,
`modelDomOffset` and `modelDomLocate`, which are `undoTextOffset` /
`undoLocateOffset` over one block's subtree, plus `modelApplySelection` and
`modelReadSelection` in the browser's own terms. `modelRender` and
`modelRerenderBlock` now take a selection and apply it, because **nothing holds
a `Range` across a render**: every node the old one pointed at has just been
thrown away.

Five things were measured before the work started; four corrected a slice.

**A `<br>` is zero characters, not one.** markdown-it renders a hard break as
`<br>\n`, so the newline is the text node *after* it — which is why
`<p>foo<br>\nbar</p>` has a `textContent` of `"foo\nbar"`, exactly what the
model already says. The plan had it as one character. `undoTextOffset`, the
function the plan said to port, has always counted it as zero, and it was right.

**`isFillerBreak` is not built, because measurement removed both of its
reasons.** It was wanted so a walk would not count a break and a filler as two
characters — neither counts, so there is nothing to tell apart. And slice 1
wanted it so a filler could be stripped before the old core serialises:
`<p><br data-filler></p>` goes through Turndown to `""` and
`<p>foo<br><br data-filler></p>` to `"foo"`, so nothing reaches the file either
way. The mark stays — it costs nothing and states what a node is — and the first
thing that genuinely has to read it can add the reader.

**Maths is wrapped in `<span data-math>`, by the parser, for both cores.** This
is the atom problem and it was sharper than "an equation is a subtree": until
MathJax has run an equation is *bare text*, because the `math` rule re-emits the
source verbatim so MathJax can find it — `a $x = a*b*c$ b` is fifteen characters
in the DOM where the model says five. The same model mapped to two different
DOMs and no fixed offset space fits both. Every objection to a wrapper was
measured rather than argued: MathJax typesets inside the span and leaves it
standing with the `<mjx-container>` as its child; `normaliseEditorMarkup`
unwraps a `<span>` only when it carries a `style`, so this one survives every
execCommand; Turndown's output is byte-identical to before in both states, so
nothing reaches anybody's file differently; layout is pixel-identical inline and
display, so there is no CSS for it; and MathJax already skips `<code>`. Both
cores rather than behind the flag, so the parser's output does not depend on one
and the shape the new core rests on is the shape everything exercises. It cost
one `latex` check that asserts the rule's exact output.

**A block owning no element is addressed through the one that owns it.**
markdown-it hides a tight list item's paragraph, so it has none — and most of
this repo's documents are tight lists, so "the caret cannot go there" would not
have been an edge. The answer falls out of the tiling invariant one more level
down: a container's text is its children's concatenated, so a child's offset
inside its owner is its own plus the text of the siblings before it.
`modelBlockText` is that recursion, and it is the only new idea in the slice.

**And slice 1 left cosmetic whitespace inside every container, which slice 2 is
what could see.** `(open + close).trim()` on `<ul>\n</ul>\n` trims the outer
edges and keeps the newline *inside* the tags, as a text node no block owns.
Nothing counted characters in slice 1, so nothing noticed; here a container's
text has to be exactly its children's or a child's offset is out by every stray
newline in front of it. Each half is trimmed now, and the render verify — once
it was exact — reported it on the first run.

That verify is the other half of the slice. It compares atom-aware DOM text
against `modelBlockText` at every block owning an element, so slice 1's two
kinds of skip are both retired: a block holding an image or an equation is
*checked*, and one owning no element is covered by its container. What it still
does not measure is a block bearing no inline tree anywhere — a fence, a rule, a
gap, and **a table**, whose floor is the row because `td_open` carries no `map`.
That is the same statement slice 4 makes out loud, that a table is not editable
as text, rather than an exception carved for the verify.

**How it was verified.** Twenty-six new checks in `model`, driving node trees
built by hand — which is a different thing from slice 1's DOM building and is
why they belong there: what is under test is a walk over nodes, and `makeEl` /
`makeText` answer `nodeType`, `textContent`, `childNodes` and `hasAttribute` the
way a real tree does, with no HTML parser in the loop to disagree with. The
trees are the ones markdown-it actually renders, measured in a browser rather
than assumed. The suite now loads `markdown-parser.js`, `markdown-style.js` and
`model.js` in one scope, matching the real bundle order, instead of loading the
parser separately. 1,298 checks pass.

In the scratch harness, **green in Chrome 152 on macOS**, before and after
MathJax: every position of every text-bearing leaf maps to a DOM position that
maps back to itself — exhaustively, not sampled, because the cheap version would
miss exactly the boundaries the boundary rule exists for — a tight item's
paragraph is addressable and maps back to itself rather than to its `<li>`, a
model position becomes a real caret that reads back as itself, and a render
reapplies the selection it was given. Swept over a 645-block document in the
running app with the flag on: **40,578 positions, every one a fixpoint**, and
439 blocks compared by the verify with nothing to report.

## 2026-09-20 — `a4f19ac`, `49afd3a` — Stage 2, slice 3: the model takes input

`beforeinput` on `#editor`, cancelled unconditionally, so the DOM can only
change through `modelRender`. That is D4's treatment reversed — contenteditable
is an input method whose intentions are intercepted, rather than a data
structure whose mutations are cleaned up afterwards — and it is the question
stage 0's spike was built to ask, answered yes by all three engines on
2026-09-11. [front/model-input.js](front/model-input.js) is its own file
because it is an event layer rather than the model, and because slices 4 and 5
grow it.

Cancelled **first and unconditionally**, before anything is looked at, which is
the property the rest rests on: an `inputType` this slice has never heard of is
a keystroke that does nothing, rather than one the engine gets to act on behind
the model's back. What it handles is text — `insertText`,
`insertReplacementText`, and the five delete types, which are **one
implementation** because the engine has already decided what a word is and says
so in `getTargetRanges()`. A deletion whose range spans two blocks is a merge
and is refused until slice 4, which falls out of reading the target ranges
rather than being special-cased.

`modelInlineSplice` is the mutation the inline tree never had. The contract it
keeps was already written down in `modelInlineSource`: every leaf emits
`raw ?? <rebuilt from content>`, so an edit sets `content` and clears `raw` —
which is `modelTouch`'s rule one level down and means the same thing. U+00A0 is
normalised there, once, at the boundary, closing TODO 1.4 by construction; its
other half closes more quietly still, since the browser cannot rewrite a
trailing space behind our back when it is not the one writing.

**Eight findings. Three were bugs this slice created and its own instrument
caught on the first try; two more came back from running the check page by hand
in engines this machine does not have.**

**An edited block did not render at all.** The check page's divergence line said
so on the first character ever typed into the model core: `modelRenderBlock`
goes through markdown-it's renderer over the block's *tokens*, an edit changes
the *tree*, and nothing put the two back in step — so the model held the new
text and the DOM went on showing the old. `modelInlineTokens` is the fold run
backwards, handing back the tokens the tree has carried on its nodes since slice
2. They were kept there so a link's href and `data-ref-label` would never have
to be re-derived, and this is the second thing that pays for. Re-parsing the
emitted source was the other candidate and is worse: a reference link's source
is `[text][label]`, and resolving it needs the whole document's definitions in
the parser's env — an empty one turns every reference link in the paragraph into
literal text on the first keystroke.

**A range endpoint inside an atom collapsed the range.** Select an equation,
type over it, and the engine hands over a range whose end a browser has
normalised to inside the `<span data-math>` — which slice 2's walk answers with
the atom's *start*, correctly for a start and wrongly for an end. The range came
back collapsed and the typing landed beside the equation instead of replacing
it. The walk takes a `bias` now: a start clamps to the atom's front edge, an end
to its back.

**An empty heading re-emitted as a paragraph.** markdown-it records an empty ATX
heading's opener as `#`, because nothing followed it, so typing into one
produced `#Title` — which CommonMark reads as a paragraph. Silent in the worst
way: the document looks right on screen and the file has stopped holding a
heading. The emitter supplies the separator when content needs one and takes it
back when the content goes, and what the suite asserts is not the bytes but that
they still *parse* as the heading they were.

**The mark-edge rule needed no code.** The plan called it the question the read
side never asked; the read side had already answered it. `modelInlineAt`'s
boundary rule — a position belongs to the node that *ends* there, kept from
`undo.js` in stage 1 — puts the caret after `**bold**` inside the mark and the
one before it outside, so typing continues the bold in the first case and not in
the second, with nothing added.

**`execCommand` fires `input` but never `beforeinput`.** Measured in Chrome 152
— three commands, all returning true, none interceptable — while trying to drive
deletions a keyboard could not. So `execCommand` is *not* something the input
layer can cancel, and every remaining call site is a DOM mutation the model can
neither stop nor hear about. `runCommand` therefore **refuses under the model
core**, which is the same rule the input layer follows for a type it does not
handle: do nothing rather than act behind the model's back. It costs the
formats, Tab and Clear for as long as the flag is on, and those are slices 4, 5
and 7 — at the end of which `execcommand.js` is deleted and the guard goes with
it. It also settles something the plan left implicit: the interception is only
total once the last execCommand call site is gone, so slice 7 is not tidying.

**A machine cannot drive the deletions.** Measured in Blink: automation delivers
a trusted `keydown` for Backspace and the engine performs no editing command for
it, so no `beforeinput` arrives and the DOM does not change. That is the same
gap stage 0's spike hit, and `execCommand` cannot stand in for a keystroke
either. It decides the shape of the verification rather than being an
inconvenience inside it.

**And the cost is measured rather than assumed**: 2.1ms per keystroke on a
636-block document, with the verify clean after 200 consecutive edits. Most of
it is `modelElementFor`'s document-wide `querySelector`, available to optimise
if a real document ever makes it matter.

Composition is decided rather than discovered, per the design:
`insertCompositionText` cannot be cancelled, so from `compositionstart` to
`compositionend` the engine owns the one text node under the caret and nothing
re-renders — a render there takes that node away from the IME, which is how CJK
input breaks outright. On `compositionend` the block's DOM text is diffed
against the model's and the difference applied as one edit, which is one undo
step for one composed word. Every edit ends by dispatching a synthetic `input`,
because `preventDefault()` means the engine will not, and autosave, the dirty
flag, the outline and the undo stack all hang off exactly that.

**How it was verified.** A new `model-input` suite, 23 checks, driving the
dispatcher with hand-built events against a stubbed model — the opposite of the
usual arrangement here and deliberate: `modelInlineSplice` and the render are
covered against the real thing in `model`, so stubbing them is what lets this
suite assert *routing*. What it pins is that every inputType is cancelled
whether handled or not, that a cross-block deletion is refused rather than
half-applied, that a splice which refuses stops the edit rather than rendering
anyway, and that nothing renders during a composition. Plus 33 new checks in
`model` for the splice, the unfold and the bias. 1,354 checks pass.

**[front/input-check.html](front/input-check.html)** is the other half, and it
is a check page rather than a harness — the first thing on that side of the
distinction slices 1 and 2 drew. It measures *the browser*, which is per browser
and per version, and it needs a human at a keyboard, so it carries a numbered
protocol the way the spike did. It is in `front/` rather than `tests/` plus
`CHECK_PAGES`: the static handler already serves it same-origin with
`/model.js`, which is the only thing the `/tests/` route was ever buying, so no
route is added and the server stays a file server. Driven as far as automation
allows in **Chrome 152 on macOS**: typing mid-word, typing at both edges of a
bold run — inside at the end, outside at the start — typing beside an atom and
typing over a selected equation, all with the model, the DOM, the caret and the
emitted markdown agreeing and the divergence line quiet throughout. **The
deletions, Enter, undo and a real IME are not measured in Blink**, because
neither a keystroke nor `execCommand` can drive them there.

**Run by hand in Safari and Firefox, and it earned its keep immediately.**
Safari: everything correct except one bug. Firefox: the same bug, and it is the
sharpest thing found in this slice — **a caret placed *inside* a rendered
equation replaced the whole equation with the typed character.** Blink will not
put a caret in there and Gecko will, so the outward clamping above met a
collapsed range and biased its two ends apart: `12–13` where it should have
been `12–12`. Outward at both ends only when there are two ends, now, and a
collapsed caret stays collapsed at the atom's front edge — so the character
lands beside the equation instead of destroying it. Neither the suite nor Blink
could have found it, which is the argument for the page rather than an aside
about it.

**Both engines confirmed the fix, and reported the same three ranges to the
character** — `12–12` for a caret inside the equation, `13–14` for a selection
over it, `28–29` for one over the image. Two independent engines agreeing
exactly, on the case that had been wrong in both, is the strongest form the
answer comes in.

**The whole protocol has since been driven by hand in all three engines, and all
three pass** — the deletions, the two-block Backspace, the accent popup, the
mark edges, the atoms, Enter and Ctrl+Z, with the divergence line quiet and
nothing reported as uncancelable. Same gate stage 0 set, same answer. Blink was
automated as far as automation goes and the rest of it waited on a human, which
is precisely what having the page made possible.

The page is light rather than dark now. The theme was never part of what it
measures, so it was not a choice the page had any business making for whoever
sits and reads it.

The page also had two faults of its own, both costing a step. Its image was a
404, and where Blink and WebKit draw a broken-image placeholder **Gecko draws
nothing at all**, so the atom that step is about was invisible in one engine out
of three; it is a real file now. And a step read "try to type inside the
equation or the image", which is not an instruction anybody can follow — it now
says where to click, what to type and what the log should say, with the equation
split into the two cases whose difference is the whole of the bug above.

## 2026-09-20 — `8b7ee61` — Plan stage 2's slice 4, the structural input layer

Slice 4 had a design and no build order. Stage 1's slices 1b and 3 each carried
six numbered steps written before any of them was built, and this is the slice
where that matters most: it is the one that changes how many blocks there are,
so every mistake in it is a mistake in the tree the file is emitted from.

Seven steps now, in a forced order — the block splice, `insertParagraph`, the
merge, `insertLineBreak`, the list rules, leaves edited as source, and the
table's refusal. The first has no keystroke behind it and exists so the other
six have something to call.

**Four decisions inside the first step**, because everything after it inherits
them. A new block's **tokens come from the parser, never hand-built**, which is
the exact twin of the rule that keeps `modelRenderBlock` honest — a fresh
paragraph is `md.parse` of a one-character template with its inline children
replaced, and everything else is cloned from the block it came from. A new
**separator is a blank line carrying the quote chain**, so it is `"\n\n"` at top
level and `"\n>\n"` inside a quote. A new block's **affixes are computed from
its position rather than copied**, since a split's second half is never its
item's first child and so takes the continuation indent where the original took
the marker. And **an ordered item's number follows its own list** — read off the
two items before it, so a document written all-`1.` stays that way — with
**siblings never renumbered**, which is refused on D1's own grounds: renumbering
what follows would re-emit every sibling of an edited block, which is the one
thing slice 1b exists to prevent, and CommonMark numbers a rendered list off its
first marker anyway.

**What Enter splits is the slice's real question**, and the answer is the block
and then every ancestor up to and including the nearest item. So Enter in a
top-level paragraph makes a paragraph, Enter in a quoted paragraph makes a
second quoted paragraph — a quote is not an item, and the walk stops — and Enter
in a bullet makes a bullet rather than a second paragraph inside one. At the end
of a heading it opens a paragraph; anywhere else in a heading it splits into two
headings of the same level, because the text after the caret is still heading
text and the alternative silently demotes it.

It also settles the question `modelRender` deferred: **deleting everything
leaves the model holding one empty paragraph block**, so there is always a block
for the next keystroke to land in and the filler paragraph belonging to no block
stops being reachable from the app.

**A source-edited leaf keeps a `source`, and it is the new bytes.** That is
`modelTouch` read inverted, and it is the honest shape rather than an exception:
the contract is that a block whose content changed must not re-emit its old
bytes, and for a leaf whose content *is* source the new bytes satisfy it
directly. Its ancestors are cleared exactly as any other edit clears them.
Scoped to the fence and the indented code block, which are the two leaves whose
rendering is a `<pre><code>` a caret can enter — a gap renders to nothing, an
`html_block`'s text is not its source, and a table row refuses.

**Tab is the first thing the input layer binds that is not an `inputType`**, and
it has to be, since a keydown is where Tab arrives. That is also the shape
slice 7's format shortcuts take, measured in stage 0 as arriving in all three
engines.

No code changed, so nothing ran — the rule in CLAUDE.md is that a change
touching no code proves nothing by running the suites. `npm test` was green at
1,354 checks before it, which is the tree this was written against.

## 2026-09-20 — `7ff2d8b` — Stage 2, slice 4: the model takes structure

The edits that change how many blocks there are, and the ones that act on a
block with no inline tree. Stage 1 built the tree and only ever read it; slice 3
added `modelInlineSplice`, which changes what is *inside* a block and cannot
change how many there are. This is the other half — put a block in, take one
out, split one in two, join two into one — with the tiling invariant left true
on both sides of every one of them.

Seven steps, all in. The ones worth knowing from outside:

**What Enter splits is the block, and then its container when that container is
an item.** Enter in a top-level paragraph makes a paragraph; Enter in a quoted
paragraph makes a second quoted paragraph, because a quote is not an item and
the walk stops there; Enter in a bullet makes a bullet rather than two
paragraphs inside one, which is a thing to be able to do and not what Enter
means. At the end of a heading it opens a paragraph; anywhere else in a heading
it splits into two headings of the same level, since the text after the caret is
still heading text and the alternative silently demotes it.

**A new block's tokens come from the parser, never hand-built** — the exact twin
of the rule that keeps `modelRenderBlock` honest. A fresh paragraph is
`md.parse` of a one-character template with its inline children replaced, and
everything else is cloned off the block it came from, which is where the tokens
already are. Its affixes are **computed from its position rather than copied**,
because a split's second half is never its item's first child and so takes the
continuation indent where the original took the marker; copying would write a
second bullet into the file.

**An ordered item's number follows its own list** — read off the two items
before it, so a document written all-`1.` stays that way — and **siblings are
never renumbered**, refused on D1's own grounds: renumbering what follows would
re-emit every sibling of an edited block, which is what slice 1b exists to
prevent, and CommonMark numbers a rendered list off its first marker anyway.

**The two hand-rolled list clusters are model rules now, with no engine in
them.** Enter and Backspace on an empty `<li>`, and `outdentListItem`. What
`app.js`'s keydown handler does is the specification, because it is what users
have; what changes is that there is no DOM surgery for three browsers to
disagree about. `tests/list-indent-check.html` and
`tests/list-empty-item-check.html` are therefore questions about the **old core
only** from today, and they retire with it at stage 4 rather than now, because
`main` still runs the code they watch. **Tab is the first thing the input layer
binds that is not an `inputType`**, and it has to be: a keydown is where Tab
arrives, and no engine reports it as an editing intention. That is also the
shape slice 7's format shortcuts take.

**A fence and an indented code block are edited as source**, which is the second
text space the slice needed: offsets into the block's own body rather than into
an inline tree, with the per-line prefix the file put in front of each body line
read off the block's own bytes and put back. **Such a leaf keeps a `source`, and
it is the new bytes** — `modelTouch` read inverted, and the honest shape rather
than an exception carved out of it, since the contract is that a block whose
content changed must not re-emit its *old* bytes. A gap renders to nothing, an
`html_block`'s text is not its source, and a table refuses.

**A table refuses edits until stage 3, and the rendering is how it says so.**
Its subtree is `contenteditable="false"`, so the engine never puts a caret
inside it and nobody is left typing into something that ignores them.

**Four things it found, none of them in the plan.**

**A markdown block cannot carry the whitespace a split leaves at the cut.**
markdown-it strips a block's leading and trailing whitespace before inline
parsing runs, so bytes left there are bytes the next parse throws away — and
three of those are worse than invisible: four leading spaces make the tail an
**indented code block**, a space before a closing `**` stops it being emphasis
at all, and a paragraph already indented three spaces needs only the split's one
to join them. The trim reaches into marks, because that is where the space is.

**Markdown has no empty paragraph, and the separators around one doubled.**
Enter at the end of a line gives the model a block for the caret and gives the
file nothing to say about it — but the block still sat between two separators,
so every Enter not yet typed into put a blank line into a document nobody had
edited. `modelJoinBlocks` is the fold that fixes it, and it is now both the
document's and a container's: **a block that emits nothing hands on its own
separator and takes the one before it with it**, which makes Enter at either end
of a block cost exactly zero bytes. Nothing the parser produces emits empty, so
a file that was opened and saved is untouched.

**An empty item's marker has no pad**, because there was nothing after it to pad
from: `modelItemPrefix` records `-` where a written item records `- `. So typing
into one produced `-two`, which is a paragraph and not a list — the empty-ATX-
heading bug of slice 3's step 3, one construct along and failing the same silent
way. An empty item is also a childless *leaf* in this model, which is right for
the file and useless for a caret, so the first keystroke in one turns it into
the container it is about to be — with its paragraph's tokens hidden when a
sibling's are, or a tight list would go loose on screen without a byte changing.

**A follower that comes across with an outdented item does not move at all.**
The indent is absolute here, so an outdent shifts every marker and continuation
indent beneath the item — but a follower goes out one level and down one level
at the same moment, so it ends at the column it started at. Attached before the
move rather than after it, the followers were caught in the item's subtree and
shifted twice. And `modelIndentAtCaret` must **not** ask whether the core's flag
is on: it did, and Tab therefore did nothing on `front/input-check.html`, the
one page built to measure it, which installs the layer deliberately without
flipping the flag for the app on the same origin. The flag belongs at the
boundary, with the caller that has a fallback to protect.

**The caret trap cost nothing to close.** A table as the last block leaves
nowhere for the caret to go — the classic `contenteditable="false"` trap, new
here because today everything is editable — so `modelEnsureBlock` keeps an empty
paragraph after it, and that paragraph is **free**, because of the fold above.
The same function answers the other half slice 1 deferred here: deleting
everything leaves one empty paragraph block rather than a filler belonging to
none.

**How it was verified.** 49 new checks in `model` and 22 in `model-input`,
1,430 in all. The sharpest is the sweep, and it is **D1 one step further out**:
every inline-bearing block in the oracle, split in half, rewrites only itself —
861 of them, five of which are a single atom and cannot move. Its instrument had
to be fixed before it meant anything: `indexOf` finds the wrong copy of a
paragraph whose bytes occur twice, and both `claude.md` and `corpus/todo.md`
have one, so the containment test was quietly about a block nobody had edited.
The block's position is measured with the sentinel sweep instead. Every nested
item in the oracle is also outdented — 80 of them — and what is asserted there
is not the bytes, which an outdent is meant to change, but that what it wrote
re-parses to itself.

**And driven in a real browser**, on `front/input-check.html` in Blink, as far
as automation reaches: the split, Enter at the end of a heading, Tab and
Shift+Tab with the nested `<ul>` appearing and going again, the empty-item
rules, typing into a fence's body, the table refusing the caret, and the guard
paragraph after it — all with the divergence line quiet throughout, and the
document round-tripping byte-identical on load *including* the guard paragraph.
The app itself boots on both cores: 252 blocks with `?core=model`, 432 blocks
verified, divergence quiet.

**The merge is not among those, and cannot be.** A constructed `InputEvent`
carries no target ranges, so a synthetic Backspace at a block's start is a
zero-width deletion where a real one hands over a range spanning two blocks.
That is the same gap stage 0 hit and slice 3 measured again, and it is what the
page's numbered protocol is for — which slice 4 grew by eight steps: the split,
the merge across a block boundary, Tab and Shift+Tab, the empty-item rules, a
fence edited as source, the table refusing the caret, and the trailing-table
trap. **Nobody has driven those by hand yet**, in any engine, and until somebody
does, the merge and every real keystroke in this slice are untested in the only
place that can test them.

`sw.js`'s `VERSION` goes to `v1.35`: `model.js`, `model-input.js` and `app.js`
all changed, and all three are shell assets.

## 2026-09-21 — `7c7d97c` — Slice 4's first hand run, in Gecko: one real bug and three faults in the page

The protocol on [front/input-check.html](front/input-check.html) had never been
driven. Firefox was the first engine through it, and it earned its keep on the
first pass — which is the whole argument for having the page rather than an
aside about it.

**A hard break went into the model and never onto the screen.** Shift+Enter
reported a divergence: the model held `"…at the st\nart of."` and the DOM held
`"…at the start of."`. `modelInsertBreak` builds a `hardbreak` node with
`token: null` — correctly, since there is no parse behind a node the model
created — and `modelInlineTokens` fell through its `else if (node.token)` and
left the node out of the token list the renderer walks. The **markdown was right
the whole time**, because `modelEmitLeaf` composes from the tree and the node
carries its own `raw`; only the *rendering* goes through markdown-it. That is
why 861 oracle splits, every affix check and every emitter check passed straight
over it, and why nothing but a human at a keyboard was ever going to see it.

Breaks are synthesised now — markdown-it's `hardbreak` and `softbreak` rules
read nothing off the token but its type — and **the class of bug is closed
rather than the instance**. The suite asserts what was missing: **no leaf ever
vanishes on the way to the renderer**, checked by stripping the token off every
leaf in the oracle, which is exactly the state a node the model built is in.
That sweep immediately found two more kinds in the same position, and they get
the opposite treatment: **an atom with no token throws.** An image's rendering
*is* its `src`, alt and title and an equation's *is* its delimiters and TeX, all
of which live on the parser's token — which is why slice 2 kept the token on the
node instead of re-deriving it — so there is no honest way to synthesise one
here. A throw states the rule slices 5 and 7 inherit: **a command that creates
an image or an equation takes its token from the parser**, never hand-builds
one. It is unreachable today, and a crash beats the alternative, which is what
the hard break just did.

**Gecko puts a caret inside the uneditable table.** Slice 4's refusal was
designed so that the *rendering* carries the signal — an engine will not put a
caret inside a `contenteditable="false"` island, so nobody is left typing into
something that ignores them. Blink does that. Firefox lets the caret in and
typing there does nothing, which is exactly the "reads as a broken editor"
reading the refusal was chosen to avoid. Nothing is lost and nothing is wrong:
the edit is refused either way, and a selection across the table still works.
Recorded against TODO 1.1.8 — the item that makes the caret welcome again — and
in the step's own text, rather than papered over with a second mechanism for a
behaviour with a one-stage life. The step now says what each engine does and
asks which you got.

**Three faults in the page, and each one cost evidence.**

Its document was set in the page's own monospace, so the fenced code block that
step 16 is entirely about was indistinguishable from a paragraph — reported as
"the code doesn't look like a code at all, so I just guessed." The document is
set in prose now and a code block has a background, a border and a rule down its
left edge.

The divergence banner sat below the protocol list, which put it under the fold —
so the one thing on the page you have to see at the moment it changes was the
one thing off screen. It is first now, and sticky.

And **a divergence that fixed itself left no trace at all**: the banner was the
only record of one, and the next keystroke overwrote it. One was hit and then
lost — "I got one diverged but I missed what step it was." The banner now keeps
a count that survives a recovery rather than going back to a clean green, and
every divergence is written into the event log as well, where nothing overwrites
it. Same lesson `paste-check.html` learned in Safari, in the same words: a check
page that drops evidence quietly is worse than no check page.

1,435 checks. Blink and WebKit have still not been driven through the protocol,
so the merge and every real keystroke there remain untested in the only place
that can test them.

## 2026-09-21 — `f5dd78f` — The bullet's missing space, and Gecko through the whole protocol

The second hand run of slice 4's protocol, and the one that caught the
divergence the first run saw and lost. Option+Backspace over the last word of a
bullet, in **all three engines**:

    want: "a list itemanother onea third, to nest under the one "
    got:  "a list itemanother onea third, to nest under the one"

The model held the space before the deleted word and the screen did not. The
model is right: the engine's target range covered the word and not the space,
and every editor keeps it.

**The fault was in slice 1's DOM builder**, not in the edit. `modelBuildBlock`
`trim()`s a block's rendering to strip markdown-it's pretty-printing — the
newline after a closing tag, the one between two siblings, the one
`hiddenBefore` puts in front of an opening one. That is right exactly while a
block's rendering begins and ends with a tag, and it does not always:
**markdown-it hides a tight list item's paragraph**, so that block renders as
*bare text* whose edges are its own content, and the trim took a character of
the document with it.

`modelTrimRendering` replaces it, and keeps back exactly the edge whitespace the
block's own text has. That is not a heuristic — it is the invariant
`modelVerifyRender` checks, applied where the markup is built instead of
asserted about afterwards, so the two cases need no telling apart: for a block
whose rendering is tags at both ends it is precisely a `trim()`, and for a
hidden tight-item paragraph it is precisely a no-op. It settles a second case
nobody had reached, which would have failed the same way: a hidden paragraph
ending in a hard break renders `a<br>` plus a newline, and that newline **is**
the break's one character by `modelInlineText`'s own rule.

**The file still gains no trailing whitespace.** Markdown strips it on the next
parse, so writing it out is bytes in a diff that mean nothing. `modelEmitLeaf`
trims the **last** composed line and only ever the last, because a hard break's
spelling is two trailing spaces and it never sits there — a block ending in one
leaves an empty line behind it.

Both halves are pinned. `modelTrimRendering` is driven directly, the way
`isGhostElement` is, because `tests/dom.mjs` has no HTML parser and the decision
is a pure function over two strings: six cases, one per shape, including the
hard break and a trailing space after a mark. And the keystroke itself is driven
end to end — the model keeps the space, the file does not.

**One instruction was wrong rather than the code.** The equation step said to
drag across *the whole* equation before typing. Dragging across part of one
replaces it too, and the log reports the same `12–13` either way — which is the
atom rule working: an equation is one character in the model's offset space, so
a selection covers it or it does not and there is no half of it to keep. The
step says so now. A protocol that describes a narrower behaviour than the code
has reads as a bug the moment somebody goes off the script, which is exactly
what a check page must not do.

**And the table's two engines are both confirmed at the keyboard now**: Blink
keeps the caret out of the `contenteditable="false"` island, Gecko lets it in.
That was recorded yesterday from automation on one side and a report on the
other; it is measured on both now.

**Gecko passes the whole protocol.** Every step, divergence quiet throughout.
Blink and WebKit have run only the deletion case and the table step, so the
merge and most of the real keystrokes there remain unmeasured. 1,443 checks.

## 2026-09-21 — `2361bdd` — Blink passes the whole protocol, and the table's mitigation is Blink's alone

Chrome ran slice 4's protocol end to end and came out green, which makes two
engines through it clean. Safari has run the deletion case and the table step.

**The table finding inverts.** Yesterday's note read as a Firefox quirk against
a Chrome baseline; Safari behaves as Firefox does, so the picture is the other
way round. The refusal's signal was to be the rendering — an engine will not put
a caret inside a `contenteditable="false"` island, so nobody is left typing into
something that ignores them — and measured by hand in all three, **that premise
is Blink's behaviour and nobody else's**. Gecko and WebKit both let the caret
in, and typing there does nothing, which is exactly the "reads as a broken
editor" reading the refusal was chosen to avoid.

Nothing is lost and the decision stands: the edit is refused either way, a
selection across the table still works everywhere, and refusing was never the
part in question. What failed is the **mitigation**, and saying so plainly
matters more than the mitigation did — slice 4 argued that refusal was cheap
*because* the rendering would carry the signal, and in two engines out of three
it does not.

It stays recorded rather than patched, because TODO 1.1.8 is what makes the
caret welcome again and anything built now has a one-stage life. What is left on
the table, should the silence turn out to matter first, is a
**once-per-document** notice the first time a keystroke lands inside a table:
the original argument against a `notify` was that it would fire per keystroke,
which a once-only one does not. Nobody has asked for it, so nobody has built it.

The check page's own step says all three answers now, and asks which you get.
No code changed, so nothing ran; `npm test` was green at 1,443 checks before
it, which is the tree this was written against.

## 2026-09-21 — `cc62974` — All three engines pass slice 4's protocol

Safari closed it out. Both of the bugs the hand runs found — the hard break the
renderer dropped and the bullet's trailing space the DOM builder's `trim()` ate
— were reproduced in all three engines and are cleared in all three, and all
three have now been driven through the whole protocol with the divergence line
quiet throughout.

That includes the **merge**, which is the one path no machine can reach in any
engine: a constructed `InputEvent` carries no target ranges, so a synthetic
Backspace at a block's start is a zero-width deletion where a real keystroke
hands over a range spanning two blocks. It was the riskiest thing in the slice
and it is measured now, three times, by hand.

Same gate stage 0 set — will an engine announce what it is about to do and let
us do it instead — and the same answer, one layer further in: the structural
edits go through the model in Blink, Gecko and WebKit alike.

Slice 4 is *done and tested* rather than *done and measured as far as a machine
reaches*, and stage 2 stands at four slices of seven. No code changed, so
nothing ran; `npm test` was green at 1,443 checks before it.

## 2026-09-21 — `2e3510b` — Plan stage 2's slice 5, paste and drop

Five steps, written before any of it was built: splicing foreign blocks, the
HTML pipeline, plain text, the paste event and the menu items, and drop.

**The first step is the one with teeth, and it is about a second document.**
`modelParse` of the pasted markdown produces one, and nothing in it is safe to
put into the target as it stands. Its **ids collide**, since `modelParse` mints
from 1 and `modelElementFor` is a `querySelector` — so every adopted block takes
a fresh id from the target's own counter, which is what that counter is for. And
its **bytes are unprefixed**: a pasted block's `source` is markdown written
flush left, so dropping it into a quote or a list item would write lines
carrying no `> ` and no indent, and the file would stop holding what the screen
shows. Adoption therefore clears `source` on every pasted block and lets the
emitter compose it, which is the one thing the emitter is for — the quote chain
from the block it lands beside, the leading affix from its new position, and an
item's own marker shifted to the column its new container starts at.

**Pasted blocks land as siblings of the block the caret was in**, which is the
conservative call rather than the obvious one. Enter promotes to the nearest
item; a paste does not, so pasting three paragraphs into a bullet gives one
bullet holding three paragraphs rather than three bullets. Nothing is lifted out
of the container the caret was in — a paste that moved content *out* of a list
would be a structural edit nobody asked for, and that is the direction worth
being cowardly in.

**The pipeline needs a narrower call than `htmlToMarkdown`.** That one is a
*document* function: it appends the reference definitions, re-wraps to the
sniffed width and restores the opened file's own bytes, none of which a fragment
from somebody else's clipboard has any business going through.
`htmlFragmentToMarkdown` will be the Turndown half alone, extracted so the two
cannot drift.

**Plain text is never parsed, and that has teeth in the model it does not have
today.** A pasted `*foo*` becomes a text node with `raw` null, so `modelEmitLeaf`
escapes it on the way out and it stays literal in the file.

**The paste event rather than `beforeinput`.** It fires first, carries
`clipboardData` by specification, and cancelling it stops the insertion before
an `insertFromPaste` is ever raised. `beforeinput` goes on cancelling that type
anyway, which costs nothing.

**Drop is the one with a second half.** A drag that started inside the editor is
a *move*: the engine raises `deleteByDrag` and `insertFromDrop` as a pair, both
are cancelled, and doing only the insert would duplicate the text and leave the
original standing. The source range is recorded at `dragstart` in model
coordinates, the deletion runs first, and the drop offset is adjusted when the
two are in the same block. Drop is also the one place in the slice fixing a
regression the flag already has rather than porting a behaviour — contenteditable
handles it natively today and nothing in `front/` touches it, so under the model
core it does nothing at all.

No code changed, so nothing ran. `npm test` was green at 1,443 checks before it,
which is the tree this was written against.

## 2026-09-21 — `4ff7929` — Stage 2, slice 5: the model takes paste and drop

Content arriving from outside the document, which is the one thing the model
cannot produce for itself — and so the one place Turndown survives into the new
core, converting somebody else's HTML on the way in. It leaves the save path at
stage 4; this is the last thing it does.

**A paste parses to a second document, and nothing in it is safe as it stands.**
`modelParse` mints ids from 1, so every pasted block wears an id the target is
already using — and `modelElementFor` is a `querySelector`, which would answer
with whichever element it met first. And a pasted block's bytes were written
flush left, so dropping them into a quote or a list item would write lines
carrying no `> ` and no indent, and the file would stop holding what the screen
shows. `modelAdoptBlocks` re-mints every id and **clears every `source`**,
letting the emitter compose the quote chain from the block it lands beside, the
leading affix from its new position, and an item's marker shifted to the column
its new container starts at.

**The splice rule is the conventional one**, written down because it is where
pasting feels wrong when it is wrong: the block splits at the caret, the first
pasted block merges into the head, the last merges into the tail, and whole
blocks land between. A one-block paste is that with nothing in the middle, which
is the common case and reduces to an inline splice. A pasted *container* — a
whole list — joins neither end and sits between them.

**Pasted blocks land as siblings of the block the caret was in**, which is the
conservative call rather than the obvious one. Enter promotes to the nearest
item; a paste does not, so pasting three paragraphs into a bullet gives one
bullet holding three rather than three bullets. Nothing is lifted out of the
container the caret was in — a paste that moved content *out* of a list would be
a structural edit nobody asked for.

**Plain text is never parsed, and that is stronger in the model than it is
today.** A pasted `*foo*` becomes a text node whose `raw` is null, so
`modelEmitLeaf` escapes it on the way out and it stays literal in the file
rather than becoming emphasis the moment the document is saved. One line is an
ordinary splice; several become paragraphs, with single newlines kept as
softbreaks rather than flattened.

**The `paste` and `drop` events rather than `beforeinput`.** Both fire first,
both carry their data by specification, and cancelling either stops the
insertion before an `insertFromPaste` or `insertFromDrop` is ever raised.
`beforeinput` goes on cancelling those types anyway, which costs nothing — so a
browser that raised one without the event before it still changes nothing behind
the model's back.

**A drag that started inside the editor is a move, not a copy.** The engine
raises `deleteByDrag` and `insertFromDrop` as a pair; both are cancelled, so
doing only the insert would duplicate the text and leave the original standing,
which is the worst of the three possible answers because it looks like it
worked. The source range is recorded at `dragstart` in model coordinates, the
deletion runs first, and the drop offset moves back by what was taken out when
the two are in the same block. A drag spanning two blocks is refused rather than
approximated, and one dropped inside itself does nothing. Drop is also the one
place in the slice fixing a regression the flag already had rather than porting
a behaviour: contenteditable handles it natively today and nothing in `front/`
touches it, so under the model core it did nothing at all.

**`htmlFragmentToMarkdown` is the Turndown half alone.** `htmlToMarkdown` is a
*document* function — it appends the reference definitions, re-wraps to the
sniffed width and restores the opened file's own bytes — and none of that means
anything for a fragment from somebody else's clipboard: there is no file for it
to be restored against, and re-wrapping would impose this document's width on
text the user has not put anywhere yet. Extracted rather than copied so the two
cannot drift.

**Three things it turned up that were not in the plan.**

**A paste must not trim at the cut the way Enter does.** Slice 4 trims both
edges of a split, because a markdown block cannot carry whitespace at its own
edge — which is true of a split that *stays* split. A paste splits only to put
something in the gap and then rejoins both sides, so the whitespace at the cut
lands in the middle of a line where it is ordinary text, and trimming it ran the
two words either side of the paste together. `modelSplitLeaf` takes a `trim`
flag, false for exactly this one caller, and the trim comes back on the tail
when nothing joined it and it is a block in its own right after all.

**A pasted fence cannot lose its source.** Adoption clears `source` so the
emitter can compose the affixes, which is right for a leaf with an inline tree
and fatal for one without — a fence's content *is* source and the emitter
refuses it outright, so clearing it left nothing able to write the fence back.
Slice 4's inversion arrives here too: a source-bearing leaf keeps its bytes and
has them **moved** instead, every line shifted to its new column and given the
quote chain it now sits behind.

**`modelOwnsInput` is a function declaration rather than a `const`.** In this
shared global scope a `const` sits in its temporal dead zone until its own line
runs, and the paste listener and the three clipboard handlers all sit above it.
They only ask from inside a callback, so a `const` works by luck — and load
order is the one thing this codebase does not leave to luck.

**How it was verified.** 21 new checks in `model` and 17 in `model-input`, 1,481
in all. The `model` half drives the splice against the real tree: ten cases, one
per shape, including a paste into a quote carrying the chain onto every line, a
pasted list reindented to the column it lands at, and a fence keeping its own
bytes. It also pins the re-minting — that no adopted id collides with anything
in the document — because that is the failure with no symptom until two blocks
claim one element. The `model-input` half pins the routing with the clipboard
stubbed: which branch runs, that HTML sanitising to nothing falls through to the
plain text, that plain text never reaches the parser while Paste markdown never
reaches Turndown, and all four drag cases.

Driven in Blink as far as automation reaches — a plain-text paste of several
paragraphs and a markdown-shaped one staying literal on the check page, and the
whole HTML pipeline in the app under `?core=model`, where a fragment carrying
bold, a link and a list came through as markdown with the divergence line quiet.
**The three-engine protocol has not been run**, and slice 5 grew it by seven
steps: the two pastes, rich HTML, the drag that moves, the two drags that do
nothing, and a drop from another window.

`sw.js`'s `VERSION` goes to `v1.36`.

## 2026-09-21 — `ba517a7` — The model core says so, and the menus stop giving way to the path

**You could not tell which core was drawing the document.** The flag's whole
purpose is a hand A/B — it is the only way a rendering divergence gets *seen*
rather than inferred — and with no marker you could compare two documents and
not know you had been on the same core both times. That is worse than having no
comparison. It went unnoticed because slice 1's rule is that the model renders
*identically* to `markdownToHtml`, so "it looks the same" is the expected answer
and not evidence of anything; what actually differs is a list of things that do
**not** work yet — the thirteen formats and Ctrl+Z do nothing, a table refuses
the caret.

So the toolbar carries a `model core` marker under the flag, and it is a link
back to `?core=legacy`: one click is what makes the comparison worth doing, and
the autosave carries unsaved edits across the reload, so the switch costs
nothing. Its `title` names what is missing rather than leaving the reader to
find out by pressing Bold. It sits before the theme toggle rather than at the
head of the right group, so its place is the same whatever the open file's path
is — a marker that moved with the directory would be a marker you have to look
for. One function in `model.js`, one call site and one CSS rule, because it goes
at stage 4 along with the flag and the second core.

**And it turned up a layout bug that was already there.** `.toolbar-left` and
`.toolbar-right` were both shrinkable, so a deep directory took width from the
*menubar*: at 1024px with a 60-character path, *Insert* read *Inser*. The menus
are controls and the directory is information, and `.toolbar-path` already knew
how to ellipsise — it could not, because its parent was not allowed to shrink
below its content. Both halves are needed: `min-width: 0` on the right group so
the path can give way, and `flex-shrink: 0` on the left so the menubar does not.
Measured on both cores; it is not a marker bug, the marker only made it 75px
worse.

**Which then needed the marker to get out of the way at phone width.** Six
menus, the marker and the theme toggle do not fit 375px together — measured:
without the marker the row ends at 361px of 375, and the marker's 75px put the
toggle off the end of a sticky bar that cannot be scrolled back into view.
Below 480px it keeps its colour and its title and loses its words. A dot is a
weaker signal than two words and a much better one than an unreachable toggle,
and this is the only place the marker competes with a control for room.

Verified on both cores at 1024px and 375px, light and dark: menus unclipped, no
row overflow, the toggle on screen, and no marker at all under `?core=legacy`.
1,481 checks unchanged — this is CSS and one DOM insert, and no suite reads
either. `sw.js`'s `VERSION` goes to `v1.37`.

## 2026-09-21 — `6b25efc` — The input check says it is always the model core

Somebody went looking for yesterday's `model core` marker on
[front/input-check.html](front/input-check.html) and did not find one, which is
correct and unhelpful in equal measure. The page has no toolbar, and it installs
the input layer **itself** rather than reading `modelCoreEnabled()` — deliberately,
so that running it does not flip the flag for the app on the same origin. So
there is no marker there and there should not be: the marker answers *which of
the two cores drew this document*, and on that page there is only one.

Nothing on the page said so, though — only a comment in its source. It now says
it in the first line of prose you read, with the marker drawn inline so it is
recognisable, and points at `/?core=model` for the place the question is real.

The flag is also per browser, since it lives in `localStorage`, which is worth
saying out loud: setting it in one browser says nothing about another.

No code changed, so nothing ran. `npm test` was green at 1,481 checks before it.

## 2026-09-21 — `e485c38` — Drag and drop needed a `dragover` handler, and nobody wrote one

Slice 5's step 22 did nothing in Blink and WebKit while working in Gecko:
dragging a selection only extended the highlight, and a drag from another window
landed nowhere. Reported as "feels like an engine thing", and it is — but the
engines were disagreeing about something we got wrong rather than about drag and
drop.

**There was no `dragover` handler.** An element accepts a drop only if something
cancels `dragover` over it. That is the specification, not a quirk, and the old
core never had to obey it, because a `contenteditable` is a drop target the
engine handles **natively** — no script involved. The model core suppresses
exactly that native handling, so the editor becomes an ordinary *scripted* drop
target, and a scripted drop target that never says it accepts anything gets no
`drop` event at all. Gecko is the generous one here: it keeps doing more for a
`contenteditable` that has stopped behaving like one than the other two will.

`dragenter` is cancelled alongside it, because an engine that reads the first as
the refusal never sends the second. And `dropEffect` is set there rather than
left at its default, because the cursor has to promise what will actually
happen: a **move** for a drag that started in this editor — the source range is
deleted before the insert — and a **copy** for anything from outside, which we
cannot remove from wherever it came from.

**The check page now logs the whole drag sequence**, which is the part worth
keeping. The interesting failures here are all *missing* events, and neither the
suite nor automation can reach a native drag — so the page names each of
`dragstart`, `dragenter`, `dragleave`, `drop` and `dragend`, counts the
`dragover`s between them, and reports the `dataTransfer` types each carried. No
`dragstart` means the engine never entered drag mode and the pointer was only
extending the selection; a run of `dragover` with no `drop` means nothing told
the engine the drop was welcome. Step 22 says so in its own text now: a step
that fails with "it feels like an engine thing" is a step that needs a log
rather than a theory.

Four new checks in `model-input`, 1,485 in all: that `dragover` is cancelled,
that the effect reads copy from outside and move from inside, and that with no
document open the drop is **not** claimed — saying otherwise would take it away
from whatever else might have wanted it. Confirmed in the pane that the editor
now cancels both events; the drag itself still needs a human, which is what the
new logging is for. `sw.js`'s `VERSION` goes to `v1.38`.

## 2026-09-21 — `bb87dc2` — A drag that never begins now says so

Yesterday's `dragover` fix got drag and drop working in Blink and WebKit, and
then only for a single word: a multi-word selection still could not be dragged,
while one word could.

**The model is not what fails.** Driven end to end in the pane — a fifteen-
character, multi-word source dropped into another paragraph — the source loses
exactly those characters, the target gains them at the drop point, and the
divergence line stays quiet. So whatever is happening is upstream of anything
the model ever sees: the engine is not entering drag mode.

That is a thing the check page could not report, because **a drag that never
starts fires no events at all** — the log stayed empty and read as having no
opinion, which is the same silent failure the divergence banner had before it
learnt to keep a count. Pressing *inside* an existing selection is the gesture
that should begin a drag, so that is what the page reports now, and then whether
a `dragstart` followed it. A red line when none did says "the engine did not
enter drag mode, so the pointer only moved the selection" — which distinguishes
that from "you never pressed on the selection", and those are the only two
things it can be.

Step 22 also now says to try one word and then several, and — if they differ —
to try the same pair in the app at `/?core=legacy`. That control is what tells a
model-core regression apart from something an engine does to every
`contenteditable`, and it is cheap enough that guessing instead is not worth
anybody's time.

Only the check page changed, so no shell asset moved and `sw.js`'s `VERSION`
stays at `v1.38`. No suite reads that page; `npm test` was green at 1,485 checks
before it.

## 2026-09-21 — `5da7b60` — Slice 5 passes in all three engines; the drag was a gesture

Drag and drop works everywhere. What remained after the `dragover` fix was not a
bug: a drag needs the button **released** after selecting, and then a fresh
press and hold on the highlight. Begun without letting go, the pointer goes on
extending the selection — which is every engine's behaviour and nothing to do
with this editor.

Worth writing down because it cost a round trip, and because the page now says
it: step 22 spells the gesture out rather than assuming it. The instrumentation
added to chase it stays, and it earned its keep on the way — "the engine did not
enter drag mode" is exactly the line that would have ended this in one reading,
and it is still the line that tells a future engine change apart from a missing
`dragover`.

**And a note on proportion, since it was raised and it is right.** Drag and drop
is a feature hardly anybody uses. It got this attention because it was
*broken* — silently, and in two engines out of three — not because it is
important, and the residue is one handler in `model-input.js` and some logging
on a page that exists to log things. Slices 6 and 7 are undo and the formats,
which is where the traffic actually is.

Slice 5 is *done and tested* rather than *done, protocol not run*, and stage 2
stands at five slices of seven with both of the hand-driven ones clean in Blink,
Gecko and WebKit. No code changed, so nothing ran; `npm test` was green at 1,485
checks.

## 2026-09-21 — `e99a928` — Ctrl+Z under the model core was not doing nothing

The `model core` marker's title has said since yesterday that the formats and
Ctrl+Z do nothing under the flag. The formats do nothing — `runCommand` refuses,
and that refusal was written down with the measurement behind it. **Ctrl+Z was
doing something**, and it was the worst available something.

`undo.js` binds its keydown on `document` and nothing ever gated it, and its
stack is fed by the synthetic `input` every model edit raises — so under the
flag the history was fully populated with snapshots of the *rendering*. Pressing
Ctrl+Z assigned one of them back over `editor.innerHTML` while the model stood
exactly where it was. The document visibly went back, which is the trouble: it
reads as an undo that worked. What follows is a divergence rather than a
recovery — the next inline edit patches one block out of the unreverted model
into the reverted DOM, and `modelReadSelection` maps the caret through DOM text
that no longer describes the document, so a keystroke after an undo lands at an
offset measured in content the model never had.

So `undo()` and `redo()` return false while `modelCoreEnabled()`, and the marker
is telling the truth. Two things the guard deliberately does *not* do. The
keydown still calls `preventDefault`: falling through would hand the key to the
browser's native stack, which mutates the DOM behind the model's back, which is
the one thing the whole design forbids — the refusal has to be a refusal, not a
fall-through. And **the stack goes on recording**. `file-api.js` reads
`undoPosition()` from inside its own `input` listener to decide whether the
document has come back to the last save, so a history that stopped advancing
would report every model edit as clean — which switches off the unsaved-work
guard and the `beforeunload` warning together, and is a far larger bug than the
one being fixed.

It is a stopgap with a named end: slice 6 replaces the snapshots with a stack of
model states and this guard goes with them. It lands now rather than there
because it is a live divergence sitting on the branch, and because the thing the
flag exists for is a hand A/B — a reviewer pressing Ctrl+Z to compare the two
cores would have been reading a corrupted document and had no way to know.

Ten new checks in `undo`, 1,495 in all: that the stack still records and still
reports a position under the flag, that undo and redo refuse and leave the
document, the stacks and the position exactly where they were, that both keys
are still taken from the browser, and — because a refusal is only worth having
if it is the flag's and not a new rule about the stack — that with the flag off
undo works as it always did. The harness grew a `modelCore` option to inject the
flag, absent by default so every other check here loads the file the way an
exported document's bundle does. `sw.js`'s `VERSION` goes to `v1.39`.

## 2026-09-21 — `761ba3d` — Plan stage 2's slice 6, undo on the model

Written before any of it is built, which is this repo's rule and not the order
these things usually happen in. The slice's entry in
[docs/REWRITE.md](docs/REWRITE.md) grows six steps, and four corrections to what
it said before.

**`structuredClone` does not do what the decision said it does.** A state is a
clone of the document — decided 2026-09-19, against copy-on-write, on the ground
that it is strictly cheaper than the whole-document HTML strings that ship today
and can be revisited on a measurement. That reasoning stands. The sentence
"`structuredClone` handles the cycle" does not: it handles the cycle perfectly
well, and then returns markdown-it's `Token` as a bare object with no prototype,
after which the renderer throws `token.attrIndex is not a function` on the first
image or fence in the document. Measured against the pinned markdown-it 13.0.1
rather than argued. The repo already has the idiom — `modelCloneToken` copies
through `Object.create(Object.getPrototypeOf(token))` — so the mechanism changes
and the decision does not.

**Two of the slice's claims were wrong about their timing**, and both are
corrected in the plan rather than at the landing. `undoRefresh` does not go
here: its only caller is `execcommand.js`, which refuses under the flag already
and is deleted in slice 7, so the function outlives this slice by one. And the
`undo` suite's count of `editor.innerHTML` assignment sites does not retarget to
*none outside render* here either — `app.js`'s three doors each keep a legacy
branch until stage 4 removes the flag, so the count stays at three. The property
this slice actually owns is narrower and is asserted as itself: nothing outside
`undo.js` applies a state, and `undo.js` applies one two ways.

**And the check page has not been in `tests/` since slice 3.** The stage's
verification paragraph still said `tests/input-check.html`, "added to
`CHECK_PAGES` in `server.ts`" — a sentence written before the page existed. It
lives in `front/`, where the static handler already serves it same-origin with
`model.js`, which is the only thing the `/tests/` route was ever buying.

The six steps, in the order they have to happen: the clone, as a pure function
in `model.js` measurable against the oracle; two seams in `undo.js` — capture a
state and apply one — with everything else in that file left alone, because the
stack machinery is core-independent and a second history in a second file would
make all seven callers of `undoReset` / `undoPark` / `undoAdopt` /
`undoPosition` ask which core is running; the caret as a `(blockId, offset)`
resolved against the state's own blocks; routing `historyUndo` and `historyRedo`,
which are cancelled and routed nowhere today; the tab switch, where a parked
model history meets a document this stage re-parses on adopt and so describes
different block objects than the ones on screen; and the measurement plus the
protocol steps, including TODO 1.6's exact reported case, which that item says
it stays open until the new undo is watched doing correctly.

No code changed, so nothing ran.

## 2026-09-21 — `e135a1d` — Slice 6 clones tokens rather than sharing them

Step 1 of yesterday's plan left the token policy to step 6's measurement. The
measurement is in, and it settles it the other way round from how these usually
go: the cheaper option loses on a fact rather than on the timing.

**Sharing dies on shipped code.** The scheme was to clone the block structure
and the inline tree but let two states point at the same `Token` objects. The
inline tokens were never really in question — `modelInlineTokens` reassigns
`inline.children` wholesale after every edit, at nine call sites, so two states
sharing one inline token share one edit — which is why the scheme would have
carved those out and shared only the block-level tokens. But `modelSourceSplice`
mutates a block-level token in place, `token.content = next` on the `fence` or
`code_block` token, because slice 4's source space edits a fence's body as its
own text. Share that and an undo inside a fence hands back a block whose
`source` holds the old bytes and whose token holds the new ones: the screen
renders from the token and shows the code the undo was meant to take back, and a
save writes `source` and files the old code. The screen and the file disagree,
with the file right and looking wrong.

**And it is the one case nothing watches.** `modelVerifyRender` skips blocks
with no inline tree — a fence, indented code, a rule, a gap, a table — so the
single construct sharing breaks is the one the permanent assertion cannot see.

**The saving was a quarter of a millisecond.** A prototype-preserving copy over
every token the model reaches, 50 runs after warm-up: `docs/TODO.md` (1,063
lines, 222 blocks, 1,980 block and 3,172 inline tokens) copies every token in
0.48ms against 0.29ms for the inline ones alone; `CLAUDE.md` (2,410 lines, 512
blocks, 2,504 and 7,505) 0.93ms against 0.70ms. So 0.19ms and 0.23ms per
coalesced step, against a full render already measured at 16.8ms and against
today's undo serialising the whole document to an HTML string on the same
cadence. What that buys is a **rule** — "a command may not mutate a token in
place" — which every future command would have to remember, which the shipped
code has already broken once, and whose symptom is the silent disagreement
above. Cloning all of them makes the question not arise.

Step 6 keeps the half that is still owed: the whole clone's cost on
`docs/TODO.md`, which is the blocks, the inline nodes and the `parent` rebuild
around the tokens, and which is what the 2026-09-19 decision to clone at all is
measured against.

No code changed, so nothing ran.

## 2026-09-21 — `2bda96e` — Slice 6, step 1: an undo state is a clone of the document

`modelCloneDocument` in [front/model.js](front/model.js), and nothing else —
the one piece of slice 6 that is pure model, with no DOM and no stack in it, so
the `model` suite can drive it against the whole oracle. The undo state itself
is the next step.

**Not `structuredClone`**, which is what the decision of 2026-09-19 said and
what step 1 of yesterday's plan corrected. It handles the cycle `parent` makes
perfectly well; what it does not handle is markdown-it's `Token`, a class
instance the structured clone algorithm returns as a bare object. Putting it
back in place of the clone throws `token.attrIndex is not a function` inside
markdown-it's own `fence` renderer — reproduced rather than reasoned about.

**Every token is cloned and none is shared**, settled yesterday on the
measurement. The block-level tokens look shareable and are not:
`modelSourceSplice` writes `token.content` on a fence, so a shared fence token
hands back an undo whose `source` holds the old bytes and whose token holds the
new ones — the screen rendering the code the undo was meant to take back while a
save files the code it did — and `modelVerifyRender` skips exactly the blocks
with no inline tree, so nothing would report it.

**Aliases are preserved rather than flattened, and that was not in the plan.**
It is what the clone's `Map` turned out to be for. A block's `inline` *is* one of
its own `tokens` — all 861 inline-bearing leaves in the oracle — and a
`hiddenBefore` is a token belonging to the block before it, all 12 of them.
Copy either twice and the two copies can disagree about the `hidden` flag
`modelFillItem` sets through one of them. Keying on the original token makes the
clone's token graph *isomorphic* to the original's rather than merely
equivalent, which is one allocation, is cheaper than reasoning about which
aliases exist, and does not have to be revisited when a later slice adds one.

**`modelCloneToken`'s own comment was wrong and is fixed.** It claimed
block-level tokens are "read-only to everything here", which slice 4 stopped
being true. The sharing it does is still right — its callers only ever share
between blocks of one live document, where a later write is meant to reach both,
and none of them hands it a fence, since a fence is never split — but the reason
is the caller rather than the token, and now says so.

Twenty-six new checks in `model`, 1,521 in all. The sweep runs over the whole
oracle rather than a hand-written case, because every way this can be wrong is
silent and the token that matters is whichever one the next edit happens to
touch: each file's clone round-trips byte-identical and renders identically,
no token is shared between a document and its clone (17,946 cloned, 0 shared),
every alias inside it is preserved, every `parent` points inside the clone, and
no token in the oracle carries a `meta` — which is the check that keeps the one
field carried by reference honest, so a parser upgrade that starts using it
fails here rather than quietly sharing whatever it holds. Then both directions
of independence, the fence case specifically, and that `nextId` and the prefix
come across.

**Every one of those properties was broken on purpose first**, the way slice 3's
affix rules were: `structuredClone` throws in the renderer, sharing the tokens
fails the disjointness sweep and both fence checks, a `parent` left pointing at
the original fails the parent sweep, and a flattened `inline` alias fails the
alias sweep and the disjointness one with it. `sw.js`'s `VERSION` goes to
`v1.40`.

## 2026-09-21 — `1016e67` — Slice 6, step 2: Ctrl+Z works on the model

The two seams. `undoCaptureState` says what the document is right now in
whichever shape this core keeps it, `undoApplyState` puts one back, and
**everything else in `undo.js` is untouched** — coalescing, `UNDO_LIMIT`, the
redo branch, the ids `file-api.js` reads, `breakOnce`, park and adopt are all
core-independent and stay one implementation. A second history in a second file
was the other candidate and is worse for the reason `app.js` has three doors
rather than a branch at seven call sites.

**The flag is asked once, in capture, and applying reads the state's own shape.**
Not in the plan, and the stronger property: a state carries exactly one of
`html` and `model`, so it says which core took it and can only be put back the
way it was taken. Asking the flag again would make a state's meaning depend on
when it is applied rather than on what it is.

**Applying installs a clone of the stored state**, never the entry itself. The
next edit mutates what it installs, so handing over the entry edits the history
— and the way that shows is undo, redo, undo, where the second visit finds what
the first one left behind.

`modelRestoreDocument` is the model's half of it, in `model.js` because
`modelDocument` is that file's variable and reaching in from outside would make
"which document is open" a question with two answers. It deliberately does not
call `modelEnsureBlock`: every state came from a document that had already been
through it, so calling it again could only append a block the state never had —
a document the user never saw and cannot undo back out of.

**The refusal landed earlier today is gone**, replaced by the branch it was
standing in for. Its reason is kept in the source, because the failure it
describes — an undo writing an earlier *rendering* over a model that had not
moved — is exactly what the two seams exist to prevent.

Twenty new checks in `undo`, 1,531 in all, and the suite **stubs the model
here**, which is the opposite of this file's usual arrangement and the same call
`model-input` makes: what is under test is the stack, the clone itself is
covered against the real tree and the real oracle in `model`, and a stub is what
lets these assert the seams rather than re-assert that. They pin both seams,
capture-is-a-clone and apply-is-a-clone in both directions, the undo-redo-undo
case by name, and then a re-run of the stack's own rules — coalescing, the
pause, Enter as its own step, the redo branch, the id a round trip returns to,
park and adopt — with a model state in place of an HTML one, because "nothing
else moves" is a claim about this file and not a plan. Each of the three new
properties was broken on purpose first.

**And it was driven in the running app, which is the half no suite can reach.**
On a second origin via `MANDY_PORT`, so nothing touched the session already
open: typing three characters and pressing Ctrl+Z brings the model and the DOM
back together and the whole document re-serialises byte-identical; redo returns
them; undo-redo-undo returns to the same bytes. `modelVerifyRender` reports 36
blocks compared and no problems after all of it. And `documentIsDirty()` goes
false → true → **false** across type-then-undo with `undoPosition()` back at the
id `markClean` recorded, which is the savepoint contract working on model states
— TODO 1.6's dot half on the new core.

**What that run could not reach is Enter**: automation's synthetic keydown
raises no `insertParagraph`, the same gap stage 0 hit, which is why
`front/input-check.html` has a human protocol. The structural path through an
undo is step 6's and is not verified here.

**The caret lands at the top of the document after an undo**, measured rather
than assumed — the editor keeps focus, the selection has one range, and it is
offset 0. The document is right and the place in it is not. That is step 3, and
it is the *shape* of TODO 1.6's caret half rather than a return of it: there is
no whole-document offset walk left to miscount, there is simply no selection in
the state yet. `sw.js`'s `VERSION` goes to `v1.41`.

## 2026-09-21 — `5bc54c0` — Slice 6, step 3: the caret travels as an id

An undo now puts the caret back where it was, which step 2 left at the top of
the document. A state's selection is a `(blockId, offset)` rather than a block,
because a block reference points into the document the state is a copy of — the
one the restore is about to throw away — so keeping it would pin the caret to
nodes nobody will render, and hold the live tree alive besides.

`modelRecordSelection` and `modelResolveSelection` in `model.js` are the two
ends, with `modelBlockById` between them — a walk rather than `modelFlatten`,
which builds an array of every block in the document to find one.

**Resolved against the document being installed, never against the state.**
`undoApplyState` clones the stored state and then resolves into that clone, so
the caret lands in the tree about to be rendered; resolving against the state
would put it in one nobody renders. That is the whole reason for the detour
through ids, and it is asked directly rather than inferred — the resolved block
has to be one of the blocks now on screen.

**A block the document has not got gives null rather than a guess**, and an end
that has gone leaves the caret that has not, taking a range down to a position
rather than the whole selection down to nothing. Neither can normally happen,
since a state's selection is read at the same moment its clone is taken; both
are answered rather than thrown because "cannot normally" is not "cannot". An
offset past the end of its block needs no such care — `modelDomLocate` has
clamped to the end since stage 1, which is `undo.js`'s own rule kept on purpose.

Seventeen new checks, 1,548 in all: thirteen in `model`, where record and
resolve are pure functions over a real tree and a real clone — the round trip,
both ends of a range, the offsets untouched, a missing id, an end that has gone,
and the lookup reaching a nested block and finding *the clone's* copy of it in
the clone — and four in `undo`, where what a stub can see is the seam: that an
undo asks for the caret the state was taken with, resolved against the document
it installed, in an object that was not on screen before it, and that a state
taken with no caret asks for none. Each property was broken on purpose first;
resolving against the state instead of the clone fails exactly one check, and
capture keeping the block reference fails one and throws on another.

**And driven in Blink on the second origin.** Caret at block 3 offset 5, type
three characters, Ctrl+Z — the caret comes back to block 3 offset 5, the
document byte-identical, `modelVerifyRender` reporting 36 blocks compared and no
problems. Then the case most of this repo's prose actually is: a block two
levels deep whose *owning element is its `<li>`*, because markdown-it hides a
tight item's paragraph. Typing and undoing there restores the bytes, the dirty
flag clears, and a redo puts the caret back inside that nested block after the
inserted text — so the lookup reaches through the recursion and through a block
with no element of its own.

**What an undo restores is the caret the restored state was taken with**, which
is the old core's rule kept rather than re-decided: in the ordinary
type-then-undo that is where the edit was, and after a caret move with no edit
between it is where the caret was when that state was current. Written down
because a run that moves the caret between two undos reads as wrong until you
know which of the two it is watching.

**TODO 1.6 is not closed by this.** Its caret half is the design that produced
it being gone, and that much is now true — there is no whole-document offset
walk left to miscount. But the item says it stays open until the new undo is
watched doing its reported case correctly, and that case is Enter at the end of
a bullet, which automation cannot raise: a synthetic keydown produces no
`insertParagraph`. It belongs to step 6's protocol, with a human at the
keyboard. `sw.js`'s `VERSION` goes to `v1.42`.

## 2026-09-21 — `a138703` — Slice 6, step 4: the engine's own undo gesture

`historyUndo` and `historyRedo` are what an engine raises for the macOS
trackpad swipe, a context menu's Undo, or a mobile keyboard's own button. They
were cancelled and routed nowhere — the right default for a type nobody has
claimed, and the wrong one for a pair that means exactly what Ctrl+Z means.
They now reach `undo()` and `redo()`.

**Feature-tested, and that is not defensive coding**, which is the same answer
slice 5's converters got. `front/input-check.html` deliberately ships no
`undo.js`: undo is the application around the input layer rather than the layer,
and loading it would drag in `toolbar.js` for `onToolbarAction` and most of what
that page exists to exclude. So there the route has to find nothing and do
nothing. Taking the test out is one of the breaks below, and it throws — which
would take the rest of the protocol down with it.

**The double-fire is named and left to be measured rather than pre-empted.**
`undo.js` binds Ctrl+Z itself, on `document`, and calls `preventDefault` — which
should stop the engine running the default action these types are raised as part
of, so a Ctrl+Z should never arrive here as well. *Should* is a per-engine fact,
and slice 4's table mitigation is the reason not to bank an unmeasured one: it
was assumed to hold everywhere and turned out to be Blink's alone. So the
instrument goes in and the suppression does not, because the shape of any
suppression depends on which engine needs one. If it happens the symptom is two
steps back for one press — confusing, and recoverable with a redo.

**`front/input-check.html`'s Ctrl+Z step is now the instrument.** It used to
read "Cancelled, and nothing moves: undo is slice 6", which is still what
happens on that page and is no longer the interesting part. It now asks for the
engine's own undo gesture as well as the keystroke, and says what to look for in
the log: whether a `historyUndo` arrives **at all** — every `beforeinput` there
is cancelled, so the engine's own stack should be empty and it may well raise
nothing — and whether one arrives **after a Ctrl+Z**, which is the finding that
would buy the suppression. It stayed one step rather than becoming two, so no
later step's number moved.

**And it corrects where undo's own protocol lives.** The plan said the steps
would go on the check page; they cannot, for the reason above. What the page can
answer is the engine question, and everything else about undo is watched in the
running app under `?core=model` — which is where steps 2 and 3 were already
driven. REWRITE.md's step 6 and the stage's verification paragraph now say so.

Seven new checks in `model-input`, 1,555 in all, and the stub here is `undo.js`
rather than the model: that `historyUndo` undoes and `historyRedo` redoes, that
both are cancelled like everything else, that neither reaches the model's edit
paths — a history operation that spliced would put a step on the stack it is
walking back through — that with no `undo.js` in the bundle the route does
nothing and still cancels, and that a gesture arriving mid-composition is
ignored, because the engine owns the caret's text node until `compositionend`
and an undo would pull it out from under the IME. Each property was broken on
purpose first. `sw.js`'s `VERSION` goes to `v1.43`.

## 2026-09-21 — `ecf40ec` — No engine raises `historyUndo`, and Safari says why

Step 4 built the instrument and refused to build the suppression, on the grounds
that an unmeasured "should" is what slice 4's table mitigation turned out to be.
Driven the same day in Chrome, Firefox and Safari — **on
`front/input-check.html`**, which is named because the mechanism below depends
on it: that page installs the input layer itself and is always the model core,
flag or no flag, so what it reports is the new core's behaviour and not the old
one's. The answer is cleaner
than the question: **no engine raises `historyUndo` at all** — not from its own
undo gesture, not after a Ctrl/Cmd+Z.

**Safari supplies the mechanism, and it generalises.** Its *Edit → Undo* is
**disabled**. Every `beforeinput` under the model core is cancelled, so the
engine never edited anything, so its own undo stack is empty and there is
nothing for it to raise. That is a consequence of the design rather than a
quirk, which is why all three agree here where they usually disagree — and it is
the sort of reason worth having, because it says what would have to change for
the answer to change.

So there is no double-fire and no suppression to build. **The route stays**: it
is two lines, it is the correct handling if one ever arrives, and the plan's
other named sources — a mobile keyboard's own undo button, an IME — are exactly
the ones this project has never measured and explicitly accepted as unmeasured.
Correct and never taken is a fine state for a branch to be in when the
alternative is dropping an intention on the floor.

**That is the second time a check page has answered "there was never anything to
build"**, after `paste-check.html` found all three engines offering `text/plain`
alone on their plain-text binding. The step turns into a regression check for
the same reason: the answer is per browser and per version, and the way it comes
back is a browser release, not a change here.

**One user-visible consequence, recorded rather than fixed.** Under the model
core the browser's own *Edit → Undo* is dead — visibly so in Safari, where it is
greyed out — and Ctrl/Cmd+Z is the only route to undo, since `undo.js` binds the
key itself. Whether the old core leaves that menu item enabled-but-pointing-at-a
-discarded-stack rather than honestly disabled is not measured, and honest is
arguably the better of the two.

No code changed, so nothing ran.

## 2026-09-21 — `2194d76` — Slice 6, step 5: the switch, and it needed no code

A parked history bundle used to hold whole-innerHTML strings and now holds model
clones, and `tabs.js` did not have to change a line — because it never looks
inside one. It parks a bundle and adopts a bundle, and what is in there is
`undo.js`'s business. So the step turned out to be an audit, and the audit
passed.

**It is a source scan now rather than a fact**, because the way this regresses
is not a broken switch: it is somebody reading a state's field to answer a
question in `tabs.js`, after which the tab bar has an opinion about which core
is running and two shapes have to be kept in step in two files. The scan pins
that only `undoPark` and `undoAdopt` are called, that no state field is ever
named, and that `adoptActive` still loads the content before adopting the
history and the history before the file — the two orderings whose failure is a
dirty document reporting clean.

**Comments are stripped before it scans**, which is not incidental: `tabs.js`
explains that ordering at length, so `undoAdopt(null)` and `index.html` both
appear in its prose. A scan that counted those would be reading the argument for
the rule as a breach of it.

**`undoBreak`'s one caller is already unreachable under the flag**, checked
rather than assumed. Both paste menu items branch on `modelOwnsInput()` before
they reach `insertPlainText`, and the editor's own `paste` listener returns
early. Had it not been, the bug would have been quiet and odd: `breakOnce` set
by a paste that then went somewhere else and consumed by the next unrelated
keystroke, which would start its own undo step for no reason anybody could see.

**This is where step 3's choice pays.** The stage re-parses on adopt, so after a
switch the document on screen is a different *object* from the one the parked
bundle's states describe, with its own ids. A state's caret resolves inside the
state's own clone, so that cannot matter. Resolved against the live document
instead — the alternative — the ids would be another parse's.

Twelve new checks, 1,567 in all: seven in `undo`, where the fake model grew a
`reparse` so a check can put a *different document* on screen between a park and
an adopt, and five in `tabs` for the scan and the ordering. They cover a tab
with no bundle taking its baseline from what is there, a bundle adopted back
restoring its own state with its caret resolved inside its own clone, and the
property the whole park/adopt design exists for asked with model states in it —
an undo in one tab cannot reach another's content, and the parked bundle still
has its step.

**And driven in Blink, two tabs.** Type in one, open a second with New, type in
that, switch both ways: each comes back with its own content and
`modelVerifyRender` clean. An undo in each takes back that tab's own edit and
reaches neither the other's content nor its stack. The savepoint survives the
round trip — tab two's `cleanPosition` stays put, typing moves `undoPosition()`
off it, and after switching away and back an undo lands on it again and the dot
clears.

**One thing chased and found correct**, recorded because the symptom is exactly
TODO 1.6's: on the other tab the dot would not clear however far back the undo
went. That tab's `cleanPosition` is null, because its document was restored from
autosave already dirty and `initUndoBaseline` deliberately does not invent a
savepoint for one — there is no position it was last saved at. Nothing to do
with this slice, and a trap for whoever drives the protocol next.

**And one about driving it**: `switchToTab` is async, so two tab clicks in one
statement race and the second can be lost. A run that does that reads as a
switch that silently did nothing, which cost a round trip here.

## 2026-09-21 — `0cd8616` — Slice 6, step 6: the measurement, and a claim that did not survive it

The whole clone's cost, which the 2026-09-19 decision to clone at all is owed —
it was made against today's HTML-string snapshots and is only worth keeping
while that comparison holds. It half holds.

**On time it holds comfortably.** A clone is about 40% of a parse of the same
file and a fraction of a render: 0.57ms on `corpus/todo.md`, 1.22ms on
`corpus/claude.md`, against the 16.8ms a full render already measured. Nothing
about the per-keystroke cadence is in doubt.

**On memory it does not, and "strictly cheaper than what ships" was wrong.**
Measured with `--expose-gc`, three runs per file agreeing within a kilobyte: a
state is **743KB** for `corpus/todo.md` (48KB of markdown, 51KB rendered) and
**1,610KB** for `corpus/claude.md` (105KB, 119KB). That is **14 to 15 times**
the HTML string it replaces, or roughly 15KB of state per KB of markdown — so
`UNDO_LIMIT = 100` is **73MB and 157MB per tab**. The constant's own comment
says it is sized so "a large document cannot run the tab out of memory", and
that was calibrated against strings.

**Where it goes**, so any fix aims at the right thing, on `corpus/claude.md`:
tokens **62%**, inline nodes **32%**, blocks 5%. The inline layer is 94% of a
state.

**That re-opens step 1 honestly rather than settling it.** Step 1 chose to clone
every token on a *time* measurement — the saving was 0.19ms and 0.23ms, and what
it bought was the absence of a rule every future command would have to remember.
Those inputs have changed. The three ways out are different sizes: a smaller
`UNDO_LIMIT` under the flag (one constant, trades undo depth for memory),
sharing the tokens nothing mutates (62%, and reinstates the rule step 1
refused), or copy-on-write, which the 2026-09-19 decision explicitly kept
available "on a measurement". **This is that measurement, and the choice is not
made here** — it trades a user-visible amount of undo against memory, which is
not a decision to take inside a slice's last step.

**The protocol is written and not yet run.** Ten steps in REWRITE.md's step 6,
in the running app under `?core=model` rather than on the check page, for the
reason step 4 recorded: undo is the application around the input layer and that
page ships none of it. Steps 1, 5, 8 and 9 were driven in Blink and are clean —
a typing run undoing as one step with the caret returning to where typing
started, **Tab's indent undoing and redoing whole with the file's bytes
identical either way**, a fresh edit killing the redo branch, and two tabs
reaching neither each other's content nor each other's stack, with the savepoint
surviving the round trip. `modelVerifyRender` stayed quiet throughout.

The indent case is the valuable one, because it is a **structural** undo — the
block count goes 36, 37, 36 — and so it is the path Enter would take. Enter
itself is what no machine can drive: a synthetic keydown raises no
`insertParagraph`, which is why steps 3 and 4 need a human, and step 4 is
**TODO 1.6's reported case**, which that item stays open until somebody watches.

**One trap written into the protocol rather than left to be rediscovered**: step
4 has to be run on an opened file or a document made with New. A document
restored from autosave that was already dirty has no savepoint, because
`initUndoBaseline` will not invent one for it — so its dot cannot clear however
far back an undo goes, which reads exactly like the bug being tested for. That
cost a detour here.

No code changed, so nothing ran; `npm test` is green at 1,567.

## 2026-09-21 — `9a8c9f3` — The undo stack is capped by bytes, not by count

Step 6 measured a model state at fifteen to sixteen times the markdown's bytes,
so `UNDO_LIMIT = 100` is 73MB for a 48KB document and 157MB for a 105KB one,
per tab. That constant's own comment asks for two things — deep enough that
nobody reaches the end of it in normal editing, small enough that a large
document cannot run the tab out of memory — and they stopped being satisfiable
by one number the moment a state stopped being an innerHTML string.

**So the count is a ceiling and a budget is the cap.** `UNDO_BUDGET` is 64MB per
tab, because a parked bundle is per tab and they add up. `UNDO_STATE_PER_BYTE`
is 16: measured at 15.5 and 15.3 on two documents differing by more than twice
in size, which is why one coefficient is honest, and **rounded up** so the
budget is a ceiling the estimate approaches from below rather than a target it
straddles. `UNDO_FLOOR` is 10, which bites above about 400KB of markdown — four
times the largest file here — on the reasoning that an undo stack too shallow to
undo is worse than the memory it saves, at a size where memory is already the
smaller problem.

| Document | Per state | Steps kept |
| --- | --- | --- |
| up to ~40KB | under 640KB | **100**, unchanged |
| `corpus/todo.md`, 48KB | 743KB | 85 |
| `corpus/claude.md`, 105KB | 1,610KB | 39 |
| above ~400KB | — | 10, the floor |

**This is the original intent in the units that turned out to matter, not a new
policy** — and it is why the answer is not simply a smaller `UNDO_LIMIT`, which
would take depth away from the documents that were never the problem. A small
document loses nothing, which is the property worth holding on to.

`modelParse` records `doc.bytes`, at the parse rather than by serialising later,
because a cap needs an order of magnitude and a serialise is an expensive way to
ask for one. Two things it deliberately does not do: it **does not track a
document growing under the keyboard**, which is fine because this bounds memory
rather than allocating it and a document that has doubled since it was opened is
still in the right band; and the undo and redo stacks need no budget between
them, because their sum only grows on a fresh edit and a fresh edit clears the
redo branch.

The trim is a `while` rather than an `if`, because the limit is computed from
the open document and can be lower than it was last time — one shift would leave
the stack over budget until something else pushed.

Ten new checks, 1,577 in all: seven in `undo` — that the old core keeps the
count it always had, that a document with no byte count does too, that a small
document keeps every step, the two measured sizes with their depths in the check
labels, the floor, and that a stack already over a tightened budget is cut to it
in one go — and three in `model`, that a document records the bytes it was
parsed from, that every oracle file agrees, and that a clone carries it. Each
property was broken on purpose first; dropping `doc.bytes` from `modelParse`
passed every check in the repo until those three existed, which is why they do.
`sw.js`'s `VERSION` goes to `v1.44`.

## 2026-09-21 — `327ea55` — The byte cap comes out again, and step 1's argument is qualified

Built this morning, removed this afternoon, and recorded rather than quietly
reverted because the reason is the useful part.

The cap bounded memory by taking undo depth away from large documents —
`corpus/claude.md` dropped from 100 steps to 39. Slice 6's step 7, planned
below, removes the *memory* instead: a state becomes a copy of the document's
outline with each paragraph's contents shared, at 84KB rather than 1,610KB. A
64MB budget against 84KB states is a ceiling nothing can reach, so it would be
code that never runs.

**The decision is not to carry a guard sized for a case nobody has met.** If
states get heavy again, that is the moment to measure against whatever made them
heavy — a guard chosen now would be sized for today's shape of the problem and
would most likely be wrong for the next one. `doc.bytes` goes with it, since the
cap was its only consumer, and `UNDO_LIMIT`'s comment now says where the
reasoning went.

**And step 1's write-up is qualified**, because it claimed more than it
established. It chose to clone rather than share on two grounds. The first was
correctness: `modelSourceSplice` writes into a token in place, so a shared token
lets a later edit reach backwards into an older state — and `modelVerifyRender`
skips exactly the blocks where that shows. The second was a **time**
measurement: sharing saved two tenths of a millisecond.

Both were true. Neither covered the option step 7 takes — share, **and copy a
paragraph's contents before anything writes to it**. A write barrier is exactly
what removes the hazard the first ground named, and the second ground weighed
the wrong axis, because nobody had measured space until step 6. The entry read
as settled ("measured rather than argued") on a measurement that covered one of
the two costs. Step 7's plan says so where step 1 is recorded, rather than
leaving a reader to find the contradiction.

`sw.js`'s `VERSION` goes to `v1.45`, and the check count returns to 1,567.

## 2026-09-21 — `327ea55` — Plan slice 6's step 7: a state shares what the edit did not touch

A seventh step in a six-step slice, written before any of it is built. What a
state is today is a full copy of the document, so typing one character copies
four hundred paragraphs. What it becomes is a copy of the **outline** — which
paragraphs exist, in what order, nested in what — with each paragraph's
**contents** shared with the state before it and copied only when something is
about to write to that paragraph.

Measured on `corpus/claude.md`: **84KB per state against 1,610KB**, and 0.07ms
against 1.22ms. A hundred states go from 157MB to 8.2MB, which is smaller than
the 11.6MB of HTML strings the old core keeps — the thing the 2026-09-19
decision claimed and, until now, was not.

**The outline is deliberately still copied.** Sharing it too would take a state
to almost nothing, but the outline is where each block records the container it
sits in, and one block shared between two states cannot answer that for both: it
is the third bullet in one and a top-level paragraph in the other. Sharing it
means removing `parent` and rewriting the 42 places that ask it, plus most of
the 98 in-place mutations. **That is the expensive half, and it buys 5%** — the
contents are 94% of a state. The first change takes this from a problem to not a
problem; the second from not a problem to not a problem. It stays available and
wants its own argument rather than this one.

**The barrier goes where the door already is.** `modelTouch` is already the
single door every content change passes through — D1's contract, since a path
that changes a block's content without it leaves the file's old bytes under new
content — so it gains one job: if this block's contents are shared, give it a
private copy first. Capture marks them shared on the way past, which is free,
because it is already walking the outline to copy it.

**The ordering at the 27 `modelTouch` call sites has to be checked rather than
assumed**, and at least one is already wrong for this: `modelSourceSplice`
writes `token.content` and calls `modelTouch` *after*, so a barrier inside
`modelTouch` would fire too late. Every site has to touch before it writes, and
that is the part most likely to be larger than it looks.

**Verification is why this is safe to do at all.** The suite can ask the whole
property directly: take a state, edit the document, and that state must still
serialise to exactly what it did before — over every file in the oracle, for
every kind of edit slices 3 to 5 built. A write that escapes the barrier changes
an older state, and nothing else in the repo would notice; this notices all of
them at once. Step 6's by-hand protocol is re-run afterwards, because the layer
underneath the input layer has moved.

No code changed, so nothing ran.

## 2026-09-21 — `5ad3fd3` — Slice 6, step 7: a state shares what the edit did not touch

An undo state stops being a copy of the document. `modelForkDocument` copies the
**outline** — which blocks exist, nested in what, and every affix each one
records — and **shares the contents**, the inline tree and the parser's tokens,
marking every block it walks `shared` on the way past. `modelUnshare` is the
other half: before anything writes to a block's contents, that block gets its
own.

**84KB per state where the copy was 1,610KB**, and 0.068ms where it was 1.22ms.
A hundred states of this repo's largest file go from 157MB to **8.2MB**, against
11.6MB for the HTML strings the old core keeps — so the 2026-09-19 claim that
this is cheaper than what ships is true at last, having been false in the
direction that mattered since the day it was written.

**The barrier is a rule with six exceptions.** `modelTouch` is where every
content change is supposed to pass, so the barrier goes there and rides on D1's
contract rather than on a list somebody had to find. Six functions write to a
block's contents *before* calling it — `modelInlineSplice`, `modelSplitLeaf`,
`modelInsertBreak`, `modelMergeBlocks`, `modelSourceSplice`, `modelInsertBlocks`
— so those carry their own. Every one was confirmed by removing it on its own
and watching the sweep fail; `modelTouch`'s is the only one whose removal fails
nothing, and it stays for the path nobody has written yet. The better fix is to
make those six touch before they write and leave `modelTouch` the only barrier,
which reorders six edit paths hand-verified in three engines — a separate change
with its own argument.

**The outline is deliberately still copied**, and that is the step's boundary.
Sharing it would take a state to almost nothing, but `parent` is in it, and one
block cannot be the third item of a list in one state and a top-level paragraph
in another. Sharing it means removing `parent` and rewriting the 42 places that
ask it, for 5% of a state.

**And it supersedes what step 1 recorded as settled**, which is said where step
1 is recorded rather than left for a reader to notice. Step 1 chose to clone on
two grounds: correctness — `modelSourceSplice` writes into a token in place, so
a shared token lets a later edit reach backwards into a state nobody is looking
at — and a *time* measurement. Both were true. Neither covered sharing with a
copy-before-write barrier, which is exactly what removes the hazard the first
named.

**The check that proves all of this had to be fixed twice, and that is the part
worth keeping.** It was written as *serialise the state and compare the bytes*,
which is **vacuous**: an untouched block emits its `source` and never consults
its contents, so the file comes back identical whatever has happened to the
shared tree behind it. The sweep passed with the barrier removed entirely. It
compares the state's **rendering** now — which goes through the tokens, the
thing actually shared — and with the barrier disabled it fails 861 blocks out of
861.

Then two of its edits were doing nothing: `modelMergeBlocks` was never called at
all, and `modelInsertBreak` was called with the wrong arity and silently
returned null, so two barriers looked redundant when they were merely
unexercised. The sweep now **checks that each edit changed its own document**
before checking that it left the state alone. Both turned out to be
load-bearing.

Thirteen new checks, 1,580 in all: that a fork shares 17,946 tokens and copies
none of them while every one of its 1,448 blocks is its own object with the same
id and its parent inside the fork; that forking marks both documents, that
unsharing gives a block its own contents, clears the mark, leaves the other
document's alone, keeps the alias between `inline` and `tokens`, keeps the
prototypes markdown-it's renderer needs, and is idempotent; that every edit in
the sweep changes its document and that a state survives all 36 of them; that a
state survives a fence edited as source; and that all 861 inline-bearing blocks
in the oracle, edited one at a time, leave the state untouched.

Driven in Blink afterwards, because the layer underneath the input layer moved:
typing and undo with the caret returning to the character it was typed at, an
indent plus a second edit taken back by two undos to byte-identical and put back
by two redos, `modelVerifyRender` quiet throughout. Step 6's protocol still
wants a human in all three engines. `sw.js`'s `VERSION` goes to `v1.46`.

## 2026-09-23 — `4a84638` — The check page says when a drop is refused, and why

Found driving `front/input-check.html` in Chrome: a drag spanning two
paragraphs did nothing, which is exactly what the protocol asks of it — and the
log showed `dragstart`, 154 `dragover`s and a `drop` with `dropEffect=move`,
then silence. A refused drop and a broken one look the same on screen and, until
now, the same in the log. Firefox read identically, so both engines pass the
step; the page simply could not say so.

`modelInputDrop` now announces each of its two deliberate refusals as a
`modeldroprefused` event on the editor carrying the reason — *spans two blocks*
or *dropped onto itself* — and the check page logs it. The app listens to
nothing, so it costs nothing there. The reason is the input layer's own rather
than something the page works out from the selection, because a page carrying
its own copy of the rule would agree with itself whatever the code did. The
`model-input` suite checks both refusals are announced with the right reason,
two checks on top of the existing two that nothing is moved.

The protocol's typography has one rule now, said in a comment above the list:
**bold is what you do**, *italics is what should (or should not) happen*, and
nothing else is emphasised. It used bold for both, and for asides besides, so a
glance down the list could not tell an action from an outcome. While in there,
the paste step stopped claiming Ctrl+Z does nothing under the flag — true until
slice 6's step 2. `sw.js`'s `VERSION` goes to `v1.47`.

## 2026-09-23 — `4a84638` — Slice 6's undo protocol as a document to open

Slice 6's hand check lived only in `docs/REWRITE.md`, as prose to be read in one
window and carried out in another, with the reader making up their own text to
type into — and asking what "a pause" was. It is now
[tests/fixtures/undo-check.md](tests/fixtures/undo-check.md): the protocol and
the document it runs on in one file, opened in the app under `?core=model`, with
a paragraph or list written for each step to be typed into right there.

Three things it settles that the prose left to the reader. A pause is defined —
more than 0.6 seconds between keystrokes, `UNDO_COALESCE_MS`, measured from the
last keystroke rather than the first. TODO 1.6's case goes **first**, because it
needs the tab's edited dot to clear, which only happens while the file still has
a save point to return to. And the console line is the function that exists,
`modelVerifySetEnabled(true)`; REWRITE.md said to set `modelVerifyEnabled`,
which works from a console but is not the door. Same typography as the check
pages: bold is what you do, italics what should happen.

Like `break-test.md`, it is never saved over — File → Reload discards a run.
Nothing in `tests/` reads it; the model suite's oracle is an explicit list.

## 2026-09-23 — `4a84638` — Undo puts the caret back where the edit began, and an accent undoes with its letter

The first hand run of `tests/fixtures/undo-check.md`, in Firefox, passed six of
its nine steps and found two bugs behind the other three.

**The caret.** A state carried the caret it was *taken* with — just after the
edit before it — and an undo restored that. Right only when the caret never
moved in between. Step 1 is TODO 1.6's reported case: the state an Open mints
has no caret at all, so undoing the first edit put it nowhere — invisible in
Gecko, with the arrow keys starting from the top. Step 3 hit the other side: a
click and then an edit, and the undo sent the caret to wherever the previous
edit had left it. Now the current state **follows the caret on
`selectionchange`** until the next edit pushes it, so an undo restores where the
caret was when the undone edit began. `undoFollowCaret` reads the state's own
shape rather than asking the core flag, the same principle `undoApplyState`
already follows, so it is one rule for both cores and the flag is still asked
in exactly one place. A caret outside the editor is ignored, so clicking the
toolbar does not wipe the one being held, and so is one while an IME holds the
text. This fixes the old core too, which had the same rule.

**The accent.** Holding a vowel for the macOS popup types the vowel as an
ordinary keystroke, waits while the user picks — far past the 600ms coalescing
window — and then replaces it by composition. Different type, long gap: two
undo steps, and one Cmd+Z left a bare `e` nobody typed. `undoJoin()` is
`undoBreak()`'s opposite, merging the next edit whatever its type and timing,
and `modelInputCompositionEnd` calls it when its diff **replaced** text rather
than only inserting it. A dead key only inserts, so it stays its own step. A
break wins over a join.

Seven new checks, each confirmed to fail with its fix removed: in `undo`, that
the caret comes back from where the edit began, that a selection outside the
editor leaves it alone, and that a join merges across type and pause, undoes
whole, is spent on one edit, and loses to a break; in `model-input`, that a
replacing composition joins and an inserting one does not. Driven in Blink
afterwards: a caretless baseline, a click, typing, Cmd+Z — the caret back at
the click, `modelVerifyRender` quiet. **Firefox wants a re-run** of steps 1, 3
and 7, which is what found this. Step 1's edited dot **cleared** in that same
Firefox run, which confirms TODO 1.6's other half — fixed by `801db70`'s
ordering and unverified until now.
`sw.js`'s `VERSION` goes to `v1.48`.

## 2026-09-28 — `4a84638` — Tab moves one item, not its followers

`tests/fixtures/undo-check.md`'s step 5 said that pressing Tab in the second of
three bullets would carry the third along with it, and that one undo would
bring both back. Tab does nothing of the kind: `modelIndentItem` nests the one
item under the item above it and leaves everything below where it was. Carrying
followers is **Shift+Tab**'s rule — `modelOutdentItem` brings the items below
the outdented one *in its own sublist* out with it, nested under it — and the
wording had crossed the two. Reported by the person running the fixture. The code
was right; the protocol was wrong.

The step now runs both. Tab on the middle of three bullets, undo and redo, with
the third item marked as never moving. Then Shift+Tab on the first of three
nested items, where the other two are the followers and one undo has to put all
three back. REWRITE.md's protocol and `front/input-check.html`'s Tab step had the
same loose wording and say the same thing now.

## 2026-09-28 — `4a84638` — The accent undoes with its letter, the way Firefox actually sends it

The fix in the entry above that for step 7 of `tests/fixtures/undo-check.md`
was built on a deduction, and the re-run in Firefox said it was wrong: still two
Cmd+Z to take back one accented letter. The deduction was that press-and-hold
replaces the vowel through a composition. `front/input-check.html`'s log of the
real gesture says otherwise — **there is no composition at all**. Hold `e` and
Firefox sends `insertText "e"`; pick `é` from the popup and it sends a second
`insertText "é"` whose target range covers the `e` (`23–24`), with the caret
collapsed after it the whole time. The composition hook was never reached.

`modelInputRevises` recognises that shape: a non-empty target range **while the
live selection is collapsed** is the engine rewriting behind the caret, and
`modelInputWrite` calls `undoJoin()` for it — after the splice succeeds, so a
refused edit never announces and leaves no join standing for some later one.
Typing over a selection hands over the same range with the selection covering
it, which is a new edit and stays its own step. The composition hook stays, for
an engine that does deliver the accent that way; nothing has measured one yet.

Four new checks in `model-input`, the first built from the Firefox log itself:
the rewrite replaces the letter and joins, an ordinary keystroke does not, typing
over a selection does not, and a refused rewrite leaves no join behind. The join
check was confirmed to fail with the call removed. The lesson is the check
pages' own: this was the second fix for step 7, and the first one could have
been skipped by asking the log before writing it. `sw.js`'s `VERSION` goes to
`v1.49`. **Firefox wants step 7 once more**; Chrome and Safari may send the
accent differently again, and their logs are what would say.

## 2026-09-28 — `4a84638` — Safari's accent erased the letter; the join keys on the model

Two results from running step 7 of `tests/fixtures/undo-check.md` again, and
both came with `front/input-check.html` logs, which is what made them fixable.

**Safari erased the letter outright.** Its accent popup sends
`insertReplacementText` with `data` null. The text is in `event.dataTransfer`,
which is where the specification puts it for that type, and nothing read it:
`modelInputBeforeInput` took `event.data || ""`, and a text edit with an empty
string over a range is a deletion, which is exactly what the log showed —
`input deleteContentBackward`. It now reads `dataTransfer` when `data` is
empty, and **a text edit that still carries no text is refused** rather than
turned into a deletion nobody asked for. That also covers spell-check
replacement, which uses the same type.

**Firefox still needed two Cmd+Z**, so the previous entry's rule — a non-empty
range while the selection is collapsed — was a second wrong guess. The likeliest
reason is that macOS marks the vowel while the popup is up, so the selection is
not a caret at that moment; the page did not log the selection, so that stays a
likelihood. Rather than guess a third time about the selection, the rule no
longer reads it. `modelInputRevises` asks the model instead: **does the range
sit inside what the last keystroke typed, ending where it ended?** That record
is set by each text edit and replaced on every announcement, so any other edit
in between clears it, and an undo's fresh block objects can never match a stale
one. Both engines' logs satisfy it — Firefox `e` at 23 then `23–24`, Safari `e`
at 42 then `42–43` — and typing over a word typed earlier does not.

`input-check.html` now logs `dataTransfer` text and the selection state on every
`beforeinput`, so the next surprise of this kind names itself. Six checks in
`model-input` replace the three the previous entry added: each engine's log
replayed as two events, the empty text edit, typing over text the last keystroke
did not type, an edit in between, and a refused rewrite. Each was confirmed to
fail with its fix removed. `sw.js`'s `VERSION` goes to `v1.50`. **Firefox and
Safari both want step 7 again**, after a hard reload; Chrome has not been run.

## 2026-09-28 — `4a84638` — Slice 6's undo protocol is clean in Firefox

Step 7 passed in Firefox after the fix above — one Cmd+Z takes back the accented
letter — and with it every step of `tests/fixtures/undo-check.md`. Recorded on
the protocol in `docs/REWRITE.md`. Safari and Chrome are still to run it.

## 2026-09-28 — `4a84638` — Step 5 says what you see

The previous rewrite of `tests/fixtures/undo-check.md`'s step 5 still said the
items below a Shift+Tabbed item "come out with it, together". True of the
structure and false on screen: they become the moved item's children, going out
a level and in a level at once, so **only the one item visibly moves**, in both
directions and on undo and redo. Pointed out by the person running it. The step
now describes what is seen, with the structural fact as one parenthetical
explaining why the items below stay put. REWRITE.md and `front/input-check.html`
said the same thing the same muddled way and are corrected with it.

## 2026-09-28 — `4a84638` — Safari passes the undo protocol; New in Safari opened an unusable page

**Safari is clean** on every step of `tests/fixtures/undo-check.md`, recorded on
the protocol in `docs/REWRITE.md`. Chrome is the one left.

The same session found a bug that has nothing to do with undo. **File → New in
Safari opened what looked like an empty page**: no tab bar, no caret, and
typing did nothing — until a scroll up brought the tab row back and a click
made the document editable. Blink does not reproduce it, and measuring why is
what explains Safari. After New from far down a long document, Blink clamps the
scroll to the one-paragraph document that replaced it, and repairs the
selection into the new first block by itself — so it had been leaving a caret
there without anything here asking. WebKit keeps the old scroll offset, showing
empty space below the page with the header out of view, and keeps a selection
pointing at nodes that no longer exist, so there is nowhere for a keystroke to
go. Nothing in the app had ever placed a caret after New: it was one engine's
kindness, relied on without knowing.

`showDocumentStart()` in `app.js` now does it on purpose — scroll to the top,
focus the editor without scrolling, and place a collapsed caret at the start of
the first block — and `newTab()` calls it after adopting the blank document. It
is core-agnostic DOM, so it holds for the old core too. Two checks in the `tabs`
suite, both confirmed to fail with the call removed: New scrolls to the top, and
places the caret at the start of the first block itself. Every suite that loads
`app.js` still passes. Driven in Blink afterwards: New from the bottom of the
welcome document lands at `scrollY` 0 with the model reading the caret at block
1, offset 0, and typing goes in. **Confirmed in Safari** the same day: New opens
at the top with a caret. A tab *switch* swaps the document the same way and was
tried there too — it needed nothing, so `switchToTab` is left alone.
`sw.js`'s `VERSION` goes to `v1.51`.

## 2026-09-28 — `4a84638` — Slice 6 is done: the undo protocol is clean in all three engines

Chrome ran `tests/fixtures/undo-check.md` clean, with nothing to fix, which
makes three: Firefox, Safari and Chrome all pass every step. That closes step
6's protocol and with it **slice 6**, undo on the model core — recorded on its
line and on stage 2's in `docs/REWRITE.md`, which now reads slices 1 to 6 done
and slice 7, the formats, next.

## 2026-09-28 — `e306b7a` — Slice 6's closing left four claims behind, and TODO 1.6 closes

A read-through of where the rewrite stands, before planning slice 7, found the
documents and one piece of the UI still describing the branch as it was before
slice 6.

**The `model core` marker's tooltip was wrong on screen.** It said the formats
and Ctrl+Z do nothing under the flag. Ctrl+Z has worked since slice 6's step 2,
and it is the tooltip's whole job to say what differs between the two cores, so
a stale one points the person doing the A/B at the wrong thing. It now names
what really does nothing — the formats and Clear, which are slice 7 — and the
table's refusal of the caret, which is stage 3's. `sw.js`'s `VERSION` goes to
`v1.52`.

**CLAUDE.md, three places.** The model section still opened slice 6 as having
*begun*; it says it is done, and names the protocol that closed it. The flag's
paragraph repeated the tooltip's Ctrl+Z claim. And its last paragraph said
there was **no input layer yet**, so the model went stale the moment anything
was typed — true before slice 3 and false for a week. It now says what is true:
the model owns editing and the DOM changes only through `modelRender`, while a
save still serialises the rendered DOM rather than the model until stage 4.

**TODO 1.6 leaves [docs/TODO.md](docs/TODO.md).** Its last line said what was
left was Chrome and Safari re-running the fixture, and both have — clean, the
same day. Both halves are confirmed: the dot by `801db70`'s ordering, the caret
by `undoFollowCaret`, which fixed it in both cores. The number is free, so the
live references were chased in the same commit: CLAUDE.md, a comment in
`front/undo.js`, one in `tests/undo.test.mjs`, the heading of step 1 in
`tests/fixtures/undo-check.md`, 3.1's *unblocks* list, and the three places
`docs/REWRITE.md` described the item as open. The corpus copy of REWRITE.md
keeps the number, being a frozen oracle.

## 2026-09-28 — `782da50` — Plan stage 2's slice 7: formats, the keyboard, and the renderers

Written into `docs/REWRITE.md` before any of it is built. Nine steps, four
decisions settled first, and four corrections to what the slice's entry said.

**The corrections.** `execcommand.js` is not deleted in this slice. Its last
caller goes when the legacy branch does, which is stage 4, so
`normaliseEditorMarkup`, `undoRefresh` and the `execcommand` scan's retarget
all move there. Indent and outdent were already model operations as of slice 4.
There is no image to insert, because the app has no such item, so that is TODO
1.1.7's in stage 3. And the one that matters: **Mermaid and MathJax are not
rendered after a model render.** Measured in Blink on the welcome document:
after `modelRender`, which is what every Enter, undo and paste runs, the
diagram is back to its fence and both equations are back to TeX. The renderers
are only called from the load paths, which is all the old core ever needed.
Nothing reaches a file wrongly, and `modelVerifyRender` is right to say nothing
since the text is correct. But stage 2's exit criterion names both, and no slice
owned them, so this one does, as step 2.

**Three doors are open under the flag today**, found in the same reading:
`toggleCode`, `insertToc`, and the retarget and unlink branches of `insertLink`
write to the editor without going through `runCommand`, so its refusal never
reaches them. It is the same class of bug as the Ctrl+Z one on 2026-09-21: the
screen changes and the model does not. Shutting them is step 1.

**The decisions**, all user-facing and all taken as recommended: a mark at a
bare caret is pending until the next keystroke, as every engine does it today;
bullet ↔ numbered switches the whole list, because markdown cannot mix the two
in one; a paragraph made into code gets its rendered text, per D0; and
retargeting a reference link changes that link only. The last one also names a
live bug on `main`: the old core leaves `data-ref-label` on a retargeted link,
and the `referenceLink` rule writes `[text][label]` without reading the href,
so the new address is lost on save.

Two latent emitter faults are recorded where their steps fix them: an edited
code span is written with its old backtick run whatever it now contains, and a
new `_` mark mid-word would come back as literal underscores. Neither reaches a
file before stage 4, because the save path is still Turndown over the DOM.

## 2026-09-28 — `f2cfbcc` — Retargeting a reference link no longer loses the new address

Found planning TODO 3.1's slice 7 on `rewrite`, where the model core had to
decide what Link… does to a `[text][label]` link. The question led back here,
where the answer was already wrong. `insertLink` set the new `href` on the
`<a>` and left its `data-ref-label` stamp in place. The `referenceLink` Turndown
rule writes `[text][label]` off that stamp **and never reads the href**, so
the save wrote the old reference and the new address was gone. Nothing looked
wrong on screen until the file was reopened.

`retargetLink` in `app.js` now drops the stamp when the address actually
changes. The link saves inline as `[text](new)`, and the definition stays for any
other link that uses the label, or is dropped if no link uses it any more, the
same way an unused label always was. This was a decision rather than the only
fix: rewriting the definition would move every link using the label at once,
from a dialog that names one link. An Update that keeps the same address keeps
the stamp and the author's reference form.

Five checks in the `links` suite drive the real `insertLink` through a stubbed
dialog, and ask the `referenceLink` rule's own filter rather than the attribute
alone, since the rule is what decides the syntax the file gets. The one that
matters fails with the fix removed. `tests/dom.mjs`'s `loadApp` gains the
dialog stub, `Node`'s two constants, and `insertLink` in what it hands back.
CLAUDE.md's reference-links section says the rule never reads the href and what
follows from that. `sw.js`'s `VERSION` goes to `v1.33`.

## 2026-09-28 — `63d39c6` — Slice 7's plan says the reference-link bug is fixed on `main`

The plan written earlier today named the old core's reference-link retarget as
a live bug on `main`. It has been fixed there since, in `f2cfbcc`, and merged
back in `c53aafe`. `docs/REWRITE.md`'s decision bullet now says so, and points at
`retargetLink`, so step 4 builds the model's half knowing the two cores already
agree on the answer. Checked through the real save path in Blink with the old
core: a retargeted `[the docs][docs]` saves as `[the docs](https://new.example)`,
and a second link on the same label keeps the reference and its definition.

## 2026-09-28 — `004967b` — Slice 7, step 1: three edits the model never heard about are shut

Under `?core=model`, three controls changed the document on screen without the
model knowing. The next render put the old content back, so each one looked as
if it had worked and then quietly didn't. **Code** (the format bar's button and
Format → Code block) built its `<pre>` or `<code>` by hand. **Insert → Table of
contents** put its list straight into the editor. **Link…** on an existing link
set the `href` or unwrapped the `<a>` directly. `runCommand` has refused under
the flag since slice 3, but none of these three goes through it, so the refusal
never reached them. It is the same shape as the Ctrl+Z bug found on 2026-09-21.

Each now does nothing under the flag, until the step that builds it as a model
command replaces the refusal: Code at step 5, the link at step 4, the table of
contents at step 7. Link… refuses before its dialog rather than after it.
Before shutting them, every write to the editor outside the model files was
listed, to confirm these three are the only ones; every other site is detached,
is chrome, or is already guarded.

Nine checks across `format-bar`, `outline` and `links`, each confirmed to fail
with its guard removed. The `format-bar` suite loads that file without `app.js`,
so it supplies `modelOwnsInput` itself. `loadApp` in `tests/dom.mjs` takes a
`{ modelCore }` option that stands in for model.js's flag. Driven in Blink under
`?core=model`: all three leave the DOM and the model's serialisation untouched,
with no `input` and no dialog. The same actions under `?core=legacy` still edit.

The `model core` marker's tooltip now names Insert's link, rule and table of
contents alongside the formats and Clear, and CLAUDE.md's flag paragraph says
the same. `sw.js`'s `VERSION` goes to `v1.54`.

## 2026-09-29 — `5e6efad` — Reloading a document with maths no longer piles up copies of every equation

Found starting TODO 3.1's slice 7, step 2, on `rewrite`, where the model core
re-renders and so typesets far more often than this core does. That made the
question visible: what happens when `renderLatex` runs over maths that is
already typeset? Here it happens on **every reload**, because the boot restores
the autosaved HTML, which is typeset, and then calls `renderLatex` over it. It
also happens on every **Paste markdown**, which re-runs it over the whole editor.

The answer was that MathJax typesets it again. The app loads the `tex-mml-chtml`
bundle, which reads MathML as input as well as TeX, and every typeset container
carries a hidden copy of its equation as MathML for screen readers. A second
pass found that copy, typeset it, and nested a new container inside the old
one. Measured in Blink: one equation was three containers after a single
reload, and a document typeset three times over had nine containers for three
equations. The autosave kept every copy and the next reload added more.
Nothing showed on screen, since the copies sit inside hidden markup, and saves
were unaffected, because `stampLatexSource` never stamps a nested container.

`renderLatex` now puts every stamped container back to its `$…$` or `$$…$$`
source, clears MathJax's record of the old ones, and typesets afresh, so a
second pass has nothing typeset to find. Any nesting a document already carries
goes with its outer container on the next load. It turned out that the second
pass had been doing a job nobody asked of it: typesetting is what makes MathJax
write its stylesheet, and restored maths had been getting one only through that
accident. Typesetting afresh now does it on purpose. Switching the bundle to
`tex-chtml` was considered and rejected for exactly that reason.
The un-typeset waits until MathJax has loaded, so offline the stamped containers
stay as they are and a save still reads the TeX off them. The editable export
loads its own MathJax with its own configuration and is untouched.

Five checks in the `latex` suite: that stamped maths reaches MathJax as source,
that MathJax's record is cleared while the old containers are still there to be
found, and that a nested copy goes with its outer container. The first three
fail against the old `renderLatex`. The other two guard what must not change:
offline the containers stay, and a document with no maths never loads MathJax.
Driven in Blink on this branch's own checkout: three real reloads of a
three-equation document gave three containers each time, none nested, the
stylesheet present, and a save that writes the TeX back byte for byte.
A document carrying nine containers came back to three. CLAUDE.md's LaTeX
bullet says what the stamp is now also for. `sw.js`'s `VERSION` goes to
`v1.34`.

## 2026-09-29 — `304e9b9` — Slice 7, step 2: diagrams and maths survive a render

Under `?core=model` every Enter, undo and paste re-renders the whole document,
and every keystroke re-renders its block. Each render put Mermaid diagrams
back to their fenced code and equations back to raw TeX, because the renderers
were only ever called when a document loaded. Nothing reached a file wrongly,
and `modelVerifyRender` rightly said nothing, since the text was correct.

`modelRender` and `modelRerenderBlock` now hand what they built to
`renderAfterModel` in `renderers.js`, after the build and before the selection
is put back. What an earlier render drew is kept by source — a copy of the
stamped `mjx-container`, and a diagram's SVG — and put back before anything is
awaited, so the render and the drawing land in the same task and no frame shows
source. Only what is new is typeset or drawn: synchronously for maths when
MathJax is loaded, asynchronously for Mermaid, which has no other form. Measured
first, in Blink. A diagram costs 15–22 ms and an equation 0.3 ms, so fifty
equations cost 13–17 ms on every Enter, against 1 ms to reuse all fifty.

Four more things the measuring turned up. Mermaid's wrapper replaced the `<pre>`
and dropped its `data-block`, so the model could no longer find the fence; the
wrapper copies it now. MathJax's list of typeset maths grew by one entry per
equation per render and never shrank; entries whose container has left the page
are pruned. A diagram Mermaid rejects is cached as its error, message included,
or it would flash its code on every Enter; a library that failed to load is not
cached. And typesetting twice nested a copy of every equation, which turned out
to be a live bug on `main`. It was fixed there first (`5e6efad`) and merged in,
and the model's asynchronous path typesets only the equations still pending, so
it never undoes what the cache restored.

Nine checks in the `latex` suite and one in `outline`, each confirmed to fail
with its rule broken. Driven in Blink with real keystrokes and a sampler on
every animation frame, about 2,300 frames across typing, Enter, undo and redo:
none showed a fence, TeX or a broken diagram's code. The caret stayed right
through typing on both sides of an equation and arrowing across it.

**`tests/fixtures/format-check.md`** is new: slice 7's hand protocol and the
document it runs on, in the shape of `undo-check.md`. It holds step 2's eight
steps and will grow with the slice. It has not been run in any engine by a
person yet, and step 3 waits until it has been run in all three. REWRITE.md and
CLAUDE.md's model section say where the step stands. `sw.js`'s `VERSION` goes
to `v1.56`.

## 2026-09-29 — `d863bca` — The render check says which console errors to expect

`tests/fixtures/format-check.md` contains a deliberately broken diagram, and
opening the file logs Mermaid's parse error for it once or twice: once for the
model render, and once for the Open path's own renderer call before the first
answer is back. The protocol never said so, so the first run in Firefox came
back asking whether those errors were a failure. Step 3 of "Before you start"
now names the error, says why it appears, and says it is the only one expected.
Step 8 now says an Enter must add no further line: the rejection is cached, and
another line would mean the diagram is being drawn again on every render.
Firefox showed exactly that, no new error on Enter. A protocol states every
expected observation, console included, rather than leaving the tester to
guess which output is noise.

## 2026-09-29 — `9fe5dd1` — An equation is one step for the caret, and nothing typed into it is lost

Found in Firefox running `rewrite`'s slice 7 render check. Pressing Left from
just after an inline equation did not cross it: the caret vanished for several
presses and then came out on the other side. MathJax's output is a tree of its
own inline elements, and Gecko walked the caret through them one invisible stop
at a time. The same happens in this core, and here it loses work. Letters typed
while the caret was invisible **did not appear**, because they went inside the
container, and a save writes the container from its `data-tex` stamp without
reading what is in it, so they were thrown away. `rewrite`'s model core put them
in front of the equation instead, which is how the bug was noticed at all.
Blink stepped over the equation in one press all along, which is why it went
unseen.

`stampLatexSource` now marks every outermost typeset container
`contenteditable="false"`, in the same pass as the stamp, so every engine treats
an equation as one indivisible thing, the way it treats an image. It is set
before the has-it-been-stamped check, so maths stamped before this existed, from
an autosave or an exported file, gets it too. A nested copy (MathJax's own
assistive MathML) is left alone. The static export strips nothing new: the
attribute has no effect on a page that is not editable.

Four checks in the `latex` suite. The two that matter fail with the attribute
removed, and the one for older stamps also fails with it moved after the check.
Driven in Blink on this branch's own checkout: one Left press crosses the
equation, letters typed on either side land there, one Backspace deletes it
whole, and a save writes exactly what is on screen. **The Firefox half, the
reason for the change, is still to be confirmed by hand.** CLAUDE.md's LaTeX
bullet says why the container is uneditable. `sw.js`'s `VERSION` goes to
`v1.35`.

## 2026-09-29 — `6106383` — The render check covers the caret beside an uneditable equation

`tests/fixtures/format-check.md`'s step 4 was the step that found the Firefox
caret bug fixed on `main` in `9fe5dd1`. It now says what the fix promises, not
just what it hoped for: one Left press crosses the equation, the caret never
disappears, and a letter typed after it lands before the equation. It also
records what happened before the fix. Two checks join it. One Backspace deletes
the whole equation, and an undo brings it back drawn. And a line that starts and
ends with an equation takes a letter at both edges. That second one is a
question rather than a formality: Gecko is known to leave no room for a caret
beside an uneditable element at the edge of a line, and the fix has just made
every equation one.

## 2026-10-01 — `f6f3e5d` — Backspace after an equation deletes it in Firefox

Found running `tests/fixtures/format-check.md` in Firefox under the model core,
in the check added two days ago: one Backspace just after an equation was meant
to delete it, and instead the caret jumped to before it. Logging the
`beforeinput` showed why. Firefox describes that deletion as a range from the
equation's own `<span data-math>`, offset 0, to the same span, offset 1, which
is precisely "before it" to "after it". `modelDomOffset` handled a position
*inside* an atom by clamping, but had no case for the atom element being the
container itself, so it counted neither offset. Both ends mapped to the
equation's front edge, the deletion was zero characters wide, nothing went, and
the caret was put at the range's start. Blink describes the same range through
the text nodes either side of the equation, which is why it never showed there.

Offset 0 on the atom now maps to its front edge and its last offset to its back
edge. A position strictly between still clamps to whichever edge the caller
asks for, as before. Three checks in the `model` suite, two of which fail
without the fix. Needs Firefox again: step 4 of the fixture, the Backspace.
`sw.js`'s `VERSION` goes to `v1.58`.

## 2026-10-01 — `d53426c` — A check page for the caret beside an uneditable equation

Since `9fe5dd1` every typeset equation is uneditable. Firefox then leaves no
easy caret position beside one at a line's edge: before an equation that starts
a line takes a precise click, and after one that ends a line is unreachable.
Found running `tests/fixtures/format-check.md`. The decision, taken the same
day, is an invisible caret stop beside such an equation, under the model core
only: the model draws the DOM, so the stop can be a marked node it owns and a
save drops. `main` keeps the edge problem until stage 4, and loses no text.

Which kind of stop Firefox accepts is a measurement, so
[tests/caret-guard-check.html](tests/caret-guard-check.html) makes it one. It
offers four copies of one line: no stop as the control, a trailing `<br>`,
zero-width characters either side, and a zero-width character in front with a
hidden image and a `<br>` behind. The tester clicks at each line's edges and
types, and the page reports where each letter landed. It replaces a
forty-line console snippet that was too long to call one. It needs no server.
Checked in Blink that it loads and typesets all eight equations; the
measurement itself is Firefox's, by hand.

## 2026-10-01 — `2d781e8` — Firefox's caret at a line's edge, measured, and the plan for it

`tests/caret-guard-check.html` answered the question it was written for. **The
end of a line:** with nothing after a trailing equation there is no caret and no
typing; a trailing `<br>` gives both, as do the two other stops. **The start:**
the mouse cannot reach it on any line, stop or not. The keyboard can, with Left
from after the equation, but only where a zero-width character sits in front.
With nothing there, Left does not reach it either.

The plan is written into `docs/REWRITE.md`, under step 2, before any of it is
built. The model's DOM builder adds a stop beside an equation at a line's edge:
`<br data-filler>` after one, and a zero-width character in a
`<span data-filler>` before one. The selection walks count both as nothing, a
caret at a line's start is placed inside the stop where Firefox can draw it, a
Turndown rule drops both on save, and the format bar's start-of-row test skips
them. The span wrapper is needed because a bare text node cannot carry the mark
that lets the model ignore it, and the check page had not tested it, so it gains
line E: the stop exactly as the model will build it. Checked in Blink that the
page now draws all ten equations.

## 2026-10-01 — `9f1263b` — Firefox's caret reaches both sides of an equation at a line's edge

The plan written earlier today, built. Under the model core an equation that
starts a line now has a zero-width character in a `<span data-filler>` in front
of it, and one that ends a line a `<br data-filler>` behind it. A hard break
counts as a line's edge. Firefox needs both measured stops, and line E of
`tests/caret-guard-check.html` confirmed in Firefox that the wrapping span does
not cost the start its caret. `modelPlaceStops` is called by `modelBuildBlock`
for each leaf block, so the stops are rebuilt with every render and vanish once
an equation no longer touches an edge.

Every walk between the DOM and the model now counts a filler as nothing.
`modelDomText` skips it, `modelDomOffset` maps any position in one to where it
stands, and `modelDomLocate` puts a line's first offset *inside* the start stop,
the one place Firefox draws a caret there. So `modelVerifyRender` sees no
difference. A Turndown rule in `app.js`, `modelFiller`, drops every
`data-filler` node on save, since the save is still Turndown over the DOM until
stage 4. Without it the character would reach the file and a trailing stop
would become a hard break. It also makes explicit what the empty-block filler
had been getting by accident. `atBlockStart` in `format-bar.js` ignores
zero-width characters for the reason it already ignores whitespace.

Nine checks in `model` and two in `latex`. Each fails with its rule broken,
except the call in `modelBuildBlock`, which the `model` suite cannot build a
block to reach, so the browser covers it. Driven in Blink on the fixture: the
stops sit where planned, `S` and `E` typed at the two edges land there, the
stops come back on undo with the caret inside the front one, the render check
is clean, and a save of the untouched fixture is the file's own length with no
zero-width character. Not measured: an equation straight after a hard break.
The fixture's edge step now says what was measured: the keyboard, not the
mouse, reaches the start. `sw.js`'s `VERSION` goes to `v1.59`.

## 2026-10-01 — `82022e7` — The equation's wrapper is uneditable too, so a click after one lands after it

In Firefox, clicking after an equation that ends a line and typing put the
letter in front of the equation. Logged by hand: Firefox had placed the caret
*inside* MathJax's output, on a glyph element (`MJX-C`, offset 0). The model
reads any position inside an atom as its front edge, so the letter went in
front. The check page that measured the caret stops had shown the same click
working, and the difference was one level of nesting. There, MathJax's
uneditable container sat directly in the line. In the app it sits inside the
`<span data-math>` wrapper, which was still editable, so the click landed in the
editable wrapper and Firefox descended from there.

`modelPlaceStops` now marks every equation's wrapper `contenteditable="false"`
as well, which gives the app the shape the check page measured. The wrapper is
an atom to the model, one character never edited inside, so nothing is lost.
Model core only, since `main` has no wrapper. One check in `model`, which fails
without the attribute. Driven in Blink, since an uneditable wrapper changes
what every engine does beside an equation: typing after an equation mid-line
and at a line's end, Left crossing it in one press, and Delete before it and
Backspace after it each deleting it whole. The render check was clean
throughout. Firefox has to confirm the click. `sw.js`'s `VERSION` goes to
`v1.60`.

## 2026-10-01 — `981b59e` — Mermaid diagrams are removed

Mermaid came with the project when it was forked, and nothing here ever made it
something a person could use. A diagram could only be created by typing a
` ```mermaid ` fence by hand. That is dropping into code, which is the one
thing this editor exists to spare people, and nobody could say whether anyone
used it. It was also about to cost real work: the model core on `rewrite`
re-renders constantly, and keeping diagrams alive through that had just needed
a render cache, a block-id fix and a cached error for broken diagrams.

**Files are unaffected.** A ` ```mermaid ` fence is now an ordinary code block
showing its source, and saves back as exactly the fence it was. Gone: the 3.4 MB
lazy loader and its MathJax `ignoreHtmlClass` entry, `renderMermaidDiagrams` and
the theme re-render, the editable export's Mermaid tag and dark-mode retheme
script, the static export's diagram backdrop and source stripping, the PDF
export's SVG scaling, the DOCX export's SVG-to-PNG conversion and its diagram
branch, the diagram CSS, the welcome document's section and sample, README's
example and dependency row, and TODO 6.2, whose subject no longer exists.

**One piece of compatibility stays, because dropping it would lose data.** A
document drawn before today still sits in a browser's autosave or tab storage as
the old wrapper: the SVG, plus the source in a hidden `.mermaid-source`. Saved
without help, that would write the SVG's text in place of the diagram.
`unwrapMermaidDiagrams` in `renderers.js` turns each wrapper back into its
fenced code block wherever stored HTML enters the editor, which is the boot
restore and a tab swap. The `mermaid` Turndown rule stays as the backstop for
any wrapper that reaches a save another way. Open, upload and Paste markdown
start from markdown and never meet a wrapper, so their render calls simply go.
`execcommand.js`'s guard against a wrapper is now inert and goes with that file.

Tests: the `latex` suite checks that an old wrapper comes back as a
`language-mermaid` code block holding its source, with the newline markdown-it
gives a fence's body. The `static-export` sample document loses its diagram and
the three checks about it. The `tabs` suite's failing-render case now fails
through `renderLatex`, the renderer Open still calls, so it still exercises the
same `finally`. CLAUDE.md, MARKDOWN.md and the load-order notes say what is
left. `sw.js`'s `VERSION` goes to `v1.36`.

## 2026-10-01 — `d2e5c92` — Mermaid's removal reaches `rewrite`, along with what step 2 built for it

`main`'s removal merged in, and on this side it took more with it. Slice 7's
step 2 had built Mermaid's part of the render cache: diagrams kept by source
and theme, the wrapper carrying its fence's `data-block`, a guard against
duplicate SVG ids, a guard against a late render drawing over its successor,
and a cached rejection for broken diagrams. All of that is gone.
`renderAfterModel` hands a render to MathJax alone. The cache keeps its maths
half, and its comment says so.

Where stored HTML enters on this branch, `loadDocumentHtml` is the one door, so
that is where the unwrap went rather than `main`'s two call sites. The old core
unwraps right after assigning the HTML. The model core needs no call, because
`htmlToMarkdown` meets the wrapper first and the kept `mermaid` Turndown rule
turns it back into its fence. Checked in Blink under `?core=model`: a stored
document holding an old drawn diagram restored as a ` ```mermaid ` code block,
with maths still typeset, the render check clean, and a save writing the fence.

`tests/fixtures/format-check.md` loses its two diagrams and the steps about
them: the theme switch and the broken diagram's error. It now expects no
console errors at all. It gains the one edge the machine runs did not reach: an
equation starting a line after a hard break. The `latex` suite keeps its
maths-cache checks and drops the five about diagrams, which are now `main`'s
single unwrap check. REWRITE.md's step 2 and stage 2's exit criterion, and
CLAUDE.md's slice 7 paragraph, say Mermaid is gone. `sw.js`'s `VERSION` goes to
`v1.61`.

## 2026-10-01 — `a091375` — Plan slice 7's step 10: equations by typing, on probation

Written into `docs/REWRITE.md` before any of it is built. Under the model core,
typed text is literal by design: a typed `$x^2$` is written to the file as
`\$x^2$` (measured), so from stage 4 there would be no way to create an
equation at all. The old core only gets one by accident, when the file is
reopened. Decided with the user: **live typing**, not an Insert → Equation
dialog. **On probation:** maths is inherited rather than core to the project. If
the step's hand runs need more than two rounds of fixes, or a fix has to reach
into the input layer's routing, removal gets proposed in place of the next fix,
the same way Mermaid went.

The decisions: the parser's own `mathSpan` says what is an equation, so typing
and reopening cannot disagree. The decision waits for the character after the
closing `$`, an Enter, or the caret leaving the block, because at the end of
the text `mathSpan` cannot yet see that `$5 and $` is about to become
`$5 and $10`. The atom's token comes from the parser. A conversion is its own
undo step, and stays declined once undone. Backspace into an equation reveals
its `$…$` source rather than deleting it, which reverses `f6f3e5d`'s
one-press delete on purpose. Display maths follows the same rule, and
composition is left alone. It is checked mostly in the Deno `model` suite, since
the decision is pure model work, and by hand in all three engines through
`format-check.md`.

## 2026-10-01 — `b81b35c` — Typing an equation is built before the formats

Slice 7's step 10, typing an equation, is on probation: if it turns into a side
project, maths is removed. So it is cheaper to find out before the remaining
steps (the formats, links, block kinds, lists, inserts and the keyboard) have
built anything more on equations. Decided with the user: it is built straight
after the step that keeps maths typeset through a render closes, and ahead of
bold, italic and strikethrough. `docs/REWRITE.md` records the order in the
slice's step list and on the step itself. The numbering is unchanged, because
code comments refer to the other steps by number.

## 2026-10-01 — `e735625` — A fresh page no longer typesets every equation twice

Found by the reload check in `rewrite`'s render fixture, run by hand in Firefox,
and then reproduced in this core. MathJax's default is to typeset the whole
page by itself as soon as it starts, and the app always typesets explicitly
straight afterwards with `renderLatex`. On a fresh page whose autosave held
maths with its TeX still raw, which is what an edit before the first typeset
leaves, MathJax's own pass got there first. `renderLatex` then found that
output unstamped, so it typeset it again, and the second pass nested a copy of
every equation inside its own assistive MathML. Measured in Blink: three
equations, three nested copies, after one reload. `5e6efad` never saw it,
because its reload test restored maths that was already typeset and stamped,
which `renderLatex` puts back to source first.

`ensureMathJax` now sets `startup: { typeset: false }`, so MathJax only ever
typesets when the app asks. Two fresh reloads of the same document gave three
equations, each typeset once and stamped, nothing nested, and a save that
writes the TeX back byte for byte. The editable export loads its own MathJax
with its own configuration, and relies on that startup pass; it is untouched.
`lazy-load.js` has no suite, so the browser is the check. `sw.js`'s `VERSION`
goes to `v1.37`.

## 2026-10-01 — Under the model core, only the render step typesets

Firefox's reload check in `tests/fixtures/format-check.md` found 30 nested
copies of 15 equations after one reload under `?core=model`, and Blink
reproduced it. There were two second passes. One was MathJax's own startup
typeset, a bug on `main` as well, fixed there first in `e735625` and merged.
The other belonged to this branch: the load paths still call `renderLatex`
over the whole editor after a model render. On a fresh page that raced the
render step's typesetting, which was still waiting for MathJax to arrive.
`renderLatex` looked for stamped maths, found none yet, and queued a pass that
landed on the render step's output. `renderLatex` now does nothing under the
model core, where `renderAfterModel` is the one owner of typesetting. Step 2's
notes in REWRITE.md had called those calls "redundant, harmless", and now say
they were not.

Checked by machine in Blink. Three reloads of the fixture each gave 15
equations typeset once, nothing nested, and the render check clean. Then
MathJax's download was held back by 1.5 s while the document was rendered twice
in the meantime, and all 15 came out typeset once with nothing nested. That
covers what the fixture's step 6 asked of a person, pressing Enter in the
moment MathJax is loading, which nobody can time on purpose. The step is gone,
and the reload step says what it now covers. `sw.js`'s `VERSION` goes to
`v1.63`.
