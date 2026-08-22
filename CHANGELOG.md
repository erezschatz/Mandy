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

## 2026-08-22 — Fold `DECISIONS.md` into this file, renumber TODO.md

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

## D1. A saved file gets its own bytes back

Markdown is loosely specified, so the same document has many legal spellings:
`-`, `*` or `+` bullets, `---`, `***` or `___` rules, setext or atx headings,
`_emph_` or `*emph*`, prose hard-wrapped at 80 columns or run onto one long
line. A serialiser has to choose one of each, and Turndown chooses its own —
which means the question is not whether a save is correct but what correct
means: does the file have to come back as the bytes it arrived as, or only as a
document that renders the same?

Marky's own files are project documentation, kept in git. An editor that
re-spells the whole file on every save turns a one-word change into a diff of
several hundred rewritten lines, and that cost lands on whoever reviews it
rather than on whoever made the edit. Rendering equivalence is no comfort at
that point.

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
one character short apiece (TODO 2.2). Before this, all four came back wholly
rewritten.

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
