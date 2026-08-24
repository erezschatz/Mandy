# Changelog

Everything done to Marky since it was forked. The fork point is `a01ba0d`
(2026-03-13), the last upstream commit; `7620cbc` below is the first commit of
this line of work and everything after it is ours.

Entries are in the order they happened, oldest first, each with the date and the
commit it landed in. The decisions at the end used to live in a separate
`DECISIONS.md`; they are standing rationale rather than history, which is why
they sit apart from the dated entries rather than inside one of them.

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

# Decisions

Questions that came up while building Marky, were argued out, and are settled.
They are here rather than in [TODO.md](TODO.md) because they are not work waiting
to happen, and rather than in [CLAUDE.md](CLAUDE.md) because that describes how
the code works — this is why it works that way, and what changing it would cost.
Reopen one by editing it here, not by filing it as a TODO again.

D0 is the exception to that description: it is not a question that was argued
out but the position the rest of them follow from. It is numbered zero because
it was written last and belongs first.

## D0. Humans should not be writing markup

Markup, data and configuration formats — HTML, CSS, JSON, XML, INI, markdown —
should never have been things people typed by hand. They are source. They are
written for a machine to read, and the only reason a human ever edits one
directly is that nobody built the other half of the tool.

Every other domain worked this out long ago. Nobody writes the binary of a
spreadsheet, or hand-edits the internal representation of an image, or types the
XML inside a `.docx`. There is a document, and there is what the document is
stored as, and the person works on the document. Markup formats are the holdout,
and the holdout has been rationalised into a virtue: we call these formats
"human-readable" and treat that as the end of the discussion.

YAML is what happens when the rationalisation is taken seriously enough to
design around. It was invented to be the friendly one, and it ended up the worst
of both worlds — not genuinely comfortable to read at any real size, and carrying
all the fragility of human text: significant indentation, half a dozen ways to
spell a string, and values that change type depending on how they are written.
It is neither reliably machine-safe nor actually pleasant, and it exists because
the problem was taken to be "the syntax is unfriendly" rather than "a person is
being asked to write source at all".

The answer is a clean separation of source and presentation. The human works on
a graphical, usable document. The machine handles the source. Neither one has to
compromise for the other, which is exactly what every "human-readable format"
asks them both to do.

**Where this stopped being an opinion and became the reason for this project:**
moving `.md` files back and forth with an LLM, and noticing that a real share of
the time was going into editing the *markdown* rather than the *text*. Fixing a
list marker. Re-wrapping a paragraph. Repairing a table whose columns no longer
lined up. None of that is writing, and none of it is work a person should be
doing — it is the machine's job, handed to a human because the editor was
missing.

The response is not a new format. Inventing a friendlier syntax is what produced
YAML, and there is no reason to expect the next attempt to go differently. The
response is to double down on the separation: leave markdown exactly as it is,
as the machine's artifact, and put a real editing surface in front of it.

Two things follow, and they are why the rest of this file is as long as it is:

- **The document must be edited as a document, not as text with a preview beside
  it.** A source pane with a live rendering is still a person editing markup —
  it just gives them a nicer view of the consequences. That is the cheap version
  and it would dissolve most of section 2 of the TODO at a stroke; it is refused
  because it solves the wrong problem.
- **The bytes it saves have to be the bytes it was given.** An editor that
  silently rewrites the file has not taken the source off the human's hands, it
  has just moved the work: now they read a diff of several hundred lines to find
  the one sentence they changed. D1 is that argument in full, and this is where
  it comes from.

Marky was the starting point because it was already open, web-based and small
enough to bend to this. The preference for open source, JavaScript and near-zero
dependencies is real but secondary — it decided *what to start from*, not what
to build.

## D1. A saved file gets its own bytes back

The consequence of D0, worked out in detail.

Markdown is loosely specified, so the same document has many legal spellings:
`-`, `*` or `+` bullets, `---`, `***` or `___` rules, setext or atx headings,
`_emph_` or `*emph*`, prose hard-wrapped at 80 columns or run onto one long
line. A serialiser has to choose one of each, and Turndown chooses its own —
which means the question is not whether a save is correct but what correct
means: does the file have to come back as the bytes it arrived as, or only as a
document that renders the same?

Nothing in a markdown file has to keep its original spelling for the file to
render identically, and for a personal document nothing much is lost when it
does not. Rewrite every bullet in a private note and the note still reads the
same; nobody is looking at the difference.

That stops being true the moment the file is under version control, which in a
software project it always is — and increasingly so when working with LLMs,
where markdown *is* the project documentation and the interface to it. Then the
diff is the artifact. An editor that re-spells the whole file on every save
turns a one-word change into several hundred rewritten lines, and that cost
lands on whoever reads the diff rather than on whoever made the edit. Rendering
equivalence is no comfort at that point: the reviewer cannot see what changed,
and neither can anything reading the history.

So: the bytes. An unedited document must come back unchanged, and editing one
paragraph must change one paragraph, wherever we can manage it.
[front/markdown-style.js](front/markdown-style.js) is the implementation — see
the save fidelity section of [CLAUDE.md](CLAUDE.md) for how its three layers
fit together.

"Wherever we can manage it" has one real boundary. A block that has actually
changed cannot be recovered from the source, so it goes through the serialiser
and comes back in Turndown's spelling. Three of those differences are ones we
chose and would not undo; the fourth is a bug, filed as TODO 2.1.

| Opened as | An edited block saves as | Why |
| --- | --- | --- |
| Setext `===` / `---` headings | `#` / `##` | chosen: `headingStyle: "atx"` |
| `~~~` fences | ` ``` ` | chosen |
| Indented code | fenced | chosen: `codeBlockStyle: "fenced"` |
| `[x][1]` + a definition block | inlined `[x](http://example.com)` | bug — TODO 2.1 |

Measured by hand, opening and saving this repo's own files through the running
app: README.md and welcome.md come back byte-identical, CLAUDE.md and TODO.md
one character short apiece. Before this, all four came back wholly rewritten.
That measurement predates D3 and the inline-code fix that came with it, and has
not been re-taken in a browser since.

D3 is the one deliberate exception to all of the above.

## D2. Blockquotes render as CommonMark defines them, not as GitHub does

In CommonMark `>` opens a container, not a line. Consecutive `>` lines are one
paragraph inside one blockquote, so the newline between them renders as a
space: `> one\n> two` is a single line on screen. People who write markdown in
GitHub comment boxes expect two lines, and ask why Marky disagrees.

GitHub gets that by setting markdown-it's `breaks: true`, which is an extension
rather than CommonMark. Taking it would apply to every paragraph in the
document, not just quoted ones: every newline becomes a `<br>`, and the first
save of any hard-wrapped file would therefore append two trailing spaces to
every line in it — a rewrite of the whole file, which is exactly what D1 exists
to prevent.

So `markdownit()` in app.js keeps the default `breaks: false`. One vendor's
chat widget is not worth the file.

## D3. Byte fidelity stops at whitespace nobody can see

D1 says an unedited file comes back as the bytes it arrived as. There is one
category it does not extend to, and the decision is to break fidelity rather
than preserve it: U+00A0 where a space was meant, and elements with nothing in
them.

The argument is that the user has no move available. A trailing space is at
least visible in the sense that you can put the caret past it and press
Backspace, and a stray `<b>` is visible in the rendering. A non-breaking space
is none of those things. It looks like a space, it copies out as a space, and
find-in-page matches it against a space — so a document containing one cannot be
searched for the thing it appears to contain, and the user cannot find what they
cannot see. Worse, they did not put it there: the browser wrote it while they
were editing something nearby. The same goes for the blank `<p>` a paste leaves
behind, which renders as a hairline and spaces bullets unevenly with nothing on
screen to grab.

Preserving those bytes faithfully is preserving damage. So the promise is
narrowed and stated rather than quietly hedged: Marky gives a file back byte for
byte *except* for invisible whitespace and empty elements, which it removes.

Two things keep the exception from eating D1. The normalisation runs on the HTML
before Turndown rather than on the markdown after `restoreSourceWrapping`, so a
U+00A0 an author genuinely wrote survives in any block they have not touched —
only edited text is normalised. And the paste sanitiser is targeted at empty
wrappers rather than being a round-trip through markdown, so pasting a web page
still keeps everything markdown can express.

It is worth saying out loud in the README rather than burying: this is a feature,
not a fidelity bug.

## D4. execCommand stays, and Marky normalises after it

Deprecated is a worse position than removed, and that is the right way round to
worry about it. Removed would be a migration with a deadline. Deprecated means
the spec that defined it was abandoned, so nothing obliges any two engines to
agree about what a command produces, and no process exists to make them.

What keeps them honest instead is web compatibility, which is a harder constraint
than a spec ever was: spec compliance is voluntary, breaking a decade of editors
is not. The commands are frozen legacy code in engines nobody is funding to
change them. So the risk is not that they drift apart from here — it is that they
are *already* apart and nobody is going to fix it. Both halves of that were
measured rather than assumed; see the browser check below.

Three options were on the table.

**Reimplement the commands.** Own every mutation, drop execCommand entirely. The
argument against is not cost, it is aim: the half that would be replaced is the
frozen, predictable half. What actually moves underneath Marky is contenteditable
— selection behaviour, IME, touch handles, autocorrect, mobile keyboards — and
that is under active development and would be untouched by the exercise. It is
expensive and pointed at the wrong target.

**Carry on and fix things as they surface.** What Marky did until now, which
produced exactly one workaround (`isNested` in app.js) and a comment
misattributing a shared bug to one vendor for months.

**Normalise.** Let execCommand do the work, then fix what it left behind, in one
place, and only for the differences markdown cannot absorb. That is the choice,
and the last clause is what makes it cheap. Turndown flattens most vendor
disagreement on the way out — `<b>` and `<strong>` are both `**bold**`; whatever
an engine does to build an `<h2>`, it is `## ` — so the list of things that have
to be fixed is short and stays short. `front/execcommand.js` is the one door, and
a source scan in the `execcommand` suite is what stops a later call site skipping
it.

The boundary rule for new work, which is the operative part of this decision:

- A format with no execCommand behind it is written bespoke. There is no choice,
  and Marky has been doing it since inline code.
- A format that has one uses it, unless the browser check puts it on the list of
  divergences that survive to the file.
- Existing call sites stay until they demonstrate a problem. Migrating on
  principle buys nothing that normalising has not already bought.

`applyFormat` is a single switch statement, which is what makes all of this
reversible: converting a case is a local change. That is also the answer to
whether this had to be settled before TODO 1.4 adds ten more controls. It did
not — but *deciding* was nearly free and discovering later would have cost 1.4
twice, which is why it was decided anyway.

**The check is the load-bearing part.** [tests/browser-check.html](tests/browser-check.html)
runs the real commands in a real contenteditable and reports what came out. The
Deno suite structurally cannot do this — it has no editing engine, so it can only
assert what Marky does with the output — which means every engine-specific claim
in the codebase is either measured by that page or is folklore. Two long-standing
beliefs died the first time it ran. Re-run it when adding a format, and when a
browser does something surprising.

**On Marky 2.0.** Everything above is a treatment rather than a cure, and the
cure is known: hold the document as a model in JS, render to the DOM, and treat
contenteditable as an input method whose changes are intercepted and
reinterpreted rather than accepted. That retires this decision, `undo.js`'s
snapshot design, the hard half of tabs, and the reason table cells cannot be
edited. It is a rewrite of the editor and it is not on the 1.0 route.

Two constraints are recorded now so a future rewrite starts from them rather
than rediscovering them:

- **The model must be a markdown CST with source spans, not a generic rich-text
  document model.** ProseMirror, Lexical and Slate all normalise on the way in —
  which is precisely what destroys the information markdown-style.js exists to
  preserve. Ported naively onto one of those, D1 stops being true. Built
  markdown-shaped from the start, source spans on nodes are *better* than
  today's content-keyed matching, because a span cannot be defeated by two
  identical paragraphs.
- **The near-zero-dependency stance decides whether it is feasible at all.**
  Building a model, schema, transactional undo, selection mapping and renderer
  from scratch is where most editor projects die; adopting an existing engine
  makes it tractable and contradicts what this project is. That is a call to make
  deliberately, not to discover three months in.

The reason none of this becomes "just edit the markdown in a textarea with a
preview" — which would dissolve all of section 2 of the TODO at a stroke — is a
product position, not an oversight. Humans should not be editing markup by hand;
markdown files are used as code in real projects, so their diffs need the highest
signal-to-noise a tool can give them, ideally nothing but the actual change. A
WYSIWYG surface that saves byte-faithful markdown is the thing worth building.
Everything expensive in this repo follows from taking both halves of that
seriously.
