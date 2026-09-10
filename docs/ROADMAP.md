# Roadmap

What comes after 1.0. [TODO.md](TODO.md) is what stands between here and a
finished 1.0; once that list is empty, this is where work continues. Nothing
here is scheduled — an item lands when a decision behind it is made and
someone starts it, the same as TODO.md, just on the other side of the line.

## The editor rewrite is not here any more

The "Mandy 2.0" section that used to head this file — hold the document as a
model, render to the DOM, treat contenteditable as an input method — is 1.0
work as of 2026-09-06: TODO 3.1, designed in [REWRITE.md](REWRITE.md), decided
as D6 in [DECISIONS.md](DECISIONS.md). Its escalation rule (a third cluster of
hand-rolled DOM surgery makes it a blocker) fired on tables, which are several
clusters at once, and the arithmetic in D6 says fixing first and rewriting
after costs more than rewriting now. The two constraints the section recorded
— a markdown-shaped model with source spans rather than a rich-text one, and
no new engine dependency — are REWRITE.md's first two constraints, unchanged.

## Markdown constructs held for after 1.0

[MARKDOWN.md](MARKDOWN.md) is the full coverage checklist. Most of it is 1.0
work — tables, task lists, a link editor with explicit heading IDs — but a
batch was explicitly deprioritised on 2026-09-07: **footnotes, definition
lists, `==mark==`, `~sub~`, `^sup^`, and `:emoji:` shortcodes**. Each is one
markdown-it plugin or a small hand-rolled rule in the same style as the
existing `math` and `referenceAwareLink` rules; the decision to hand-roll or
depend is made per-construct when it is picked up, against the project's
standing aversion to extra dependencies.

Footnotes and heading IDs were the two with a real case; heading IDs went into
1.0 with the link editor (TODO 1.1.10), footnotes did not. Syntax highlighting
is also out of scope for 1.0 and sits with "More export options" below as a
library-behind-a-loader question rather than a fidelity one.

Nothing here is lost in the meantime: 3.1's block-granular model round-trips an
untouched block byte-exact through its source span whether or not the parser
understands what is inside it, so an opened file that uses one of these keeps
it — only editing that block risks the serialiser re-escaping it.

### Abbreviation, and a note on subtext (2026-09-10)

The user asked about four from the guide's *Hacks* page. Two are dropped:
**underline** has no markdown spelling and its `_word_` form *is* the `_`
emphasis delimiter (`emDelimiter`), so taking it would re-read every
`_`-italicised file, and doing it any other way means reopening `html: false` /
D0 to emit `<u>`/`<ins>` — which on the web reads as a broken link anyway.
**Center** (`->text<-`) is block-level presentation of the `<div align>` /
`<img width>` kind S1 in [MARKDOWN.md](MARKDOWN.md) settled Mandy will neither
render nor author, and its `->` / `<-` delimiters collide with ordinary typed
text. Neither is worth the decision it would force.

**Abbreviation** stays on the list. `*[HTML]: Hyper Text Markup Language` on its
own line, and every later `HTML` in prose renders as `<abbr title="Hyper Text
Markup Language">HTML</abbr>` — the guide draws it as a dotted-underline `<span>`
with a `title`, but the portable output is `<abbr>` and the underline is one
`app.css` rule, never an inline style (the `--link-hint` reasoning). It is the
only one of the four with broad support: Markdown Extra, Python-Markdown,
`markdown-it-abbr`.

The earlier note called it a fidelity problem; that was overstated. The
**untouched file is free** — the same 3.1 source-span round-trip everything
else gets — with one dependency: the `*[…]:` line renders to no token and so
has no DOM node, so it needs somewhere to live in the model. That somewhere is
the **invisible-block type the reference-link definitions are already forcing
3.1 to add** ([REWRITE.md](REWRITE.md): "definitions get a real home as an
invisible block with `source` in place"). Abbreviation rides on that; it does
not pay for it alone.

The **edited** case is the only real work, and it is bounded:

- A one-line Turndown rule: `<abbr>` → its text content. (Turndown ships none,
  so without this an edited block silently loses the tag — the letters stay, so
  nothing looks wrong.)
- A `scanAbbreviationDefinitions` / re-emit pair mirroring
  `scanReferenceDefinitions` / `appendReferenceDefinitions` — read the raw
  definitions on load, write them back on save. One decision inside it: emit
  every scanned definition, or only those still referenced after the edit (the
  reference-link rule drops unused ones, which here means editing prose can
  delete a definition line elsewhere in the file).
- The part with no precedent: the render-time match is a **whole-document,
  whole-word walk**, not a span the author wrote. It has to visit every prose
  text node and skip the four subtrees `normaliseEditorMarkup` also refuses —
  `pre`, `code`, `.mermaid-wrapper`, `mjx-container` — and it has to decide what
  happens when someone types inside an `<abbr>` so its text no longer matches
  any definition (re-wrap, unwrap, leave stale). That is a `MutationObserver`
  concern like the outline's, not an inline rule.
- `<abbr>` added to `outline.js`'s `copyInline` allowlist, or an abbreviation in
  a heading flattens to text in the outline entry. One line.

Authoring is deferred, not blocked: there is no "select text, apply" gesture
for a document-wide glossary — the nearest thing is a replace-all panel with no
place in the bar or menus yet — so this ships parse-and-render first and author
later, the cut line heading IDs already took.

**Subtext** (`-# line`, Discord's, not any guide's core) is kept only as a
distant maybe. `<small>` is the nearest HTML and at least has a spec meaning,
but it would still need 3.1's block model to carry a presentational attribute —
the thing center's dismissal turns on — and `-# ` joins the line-start markers
`reflowMarkdown` must never strand, needing to be told apart from `- #` (a list
item holding an H1). Thin case; likely to move only if a block-style control is
ever built for its own sake.

The dependency-vs-hand-roll call is S4's: hand-roll as a markdown-it rule in the
`math` / `referenceAwareLink` style unless a plugin saves a week.
`markdown-it-abbr` is small enough that it might.

## More export options

The set today is markdown, HTML, PDF, DOCX and Editable. Decide what else earns
a place — ODT or RTF for word processors that are not Word, plain text, EPUB, a
slide deck, an image of a single diagram. The constraint that used to sit
beside this one is gone: the export group was the most crowded part of the
toolbar, and the Export menu has room for whatever earns it. What remains is
that each format is another heavy library behind an `ensure*` loader in
`lazy-load.js`.

One of today's five has a gap that belongs to the same question. **PDF has no
live links at all**, internal or external: html2pdf rasterises through
html2canvas, so `pdf-export.js` only restyles `A` to blue and nothing survives
as a clickable annotation. Heading ids do not help — it needs a different PDF
path, which is to say a different library, which is the decision this section
is about anyway.

## A desktop build

`deno compile` gets Mandy to a single binary (TODO 6.3). Deno Desktop is that
plus a webview and a native bundler: `deno desktop` produces a `.dmg`, `.msi`,
`.AppImage` or `.deb`, cross-compiled from one machine, with `Deno.autoUpdate()`
for patches. Because Mandy is already a `Deno.serve` server feeding a browser,
the port maps almost directly — the app boots the same server on an ephemeral
port and points the webview at it, and the file API comes along unchanged.

Two things keep it here rather than in TODO, and neither is the macOS
"unidentified developer" warning — that is a signing-certificate cost, and an
acceptable one.

- **It is new and says so.** Deno 2.9, "experimental and subject to change".
  Installer authoring, cross-signing and the auto-update path are all fresh
  surface.
- **The webview is a fourth rendering engine.** The default backend is the OS
  webview — WebKitGTK on Linux, WebView2 on Windows, WebKit on macOS — so the
  packaged app inherits *that* engine's contenteditable behaviour, on top of the
  three [tests/browser-check.html](../tests/browser-check.html) already tracks
  because engine behaviour is folklore here until measured. WebKitGTK is
  historically the roughest of them for contenteditable. The bundled-Chromium
  backend removes the divergence and re-raises the question of why not just
  Electron, at Electron's size.

A packaged app also makes the service worker redundant-to-conflicting — the
assets are already local — so the offline path would need conditioning on the
build.

Underneath all of it is whether this is an audience Mandy is for. The editable
HTML export is already the zero-install answer for someone *receiving* a
document; a desktop build serves a different person, the one who wants a
standing local editor and no terminal. These are the questions a real product
settles before it ships an installer. Mandy is not structured as one yet, which
is why this is here and unscheduled.

## Real collaboration, not send-and-hope

The "collaborative" framing in the README doesn't hold. Collaborative in 2026
means Google Docs — two people editing one document. This is the Word model:
pass a file back and forth by mail. Worse, every hop mints a *new* file,
because the editable export fuses the document and the application into one
artifact, so there is no stable document identity to write back to. You open
X, you export Y, and now which one is current?

Three routes out: both sides run the full Mandy (server + client) and pass
plain `.md`; or the exported file writes back to itself via the File System
Access API (Chromium-only, and needs testing from `file://` before anyone
designs around it); or shared storage both sides can reach. Failing all of
those, the honest fix is to describe today's export as send-for-review, one
hop — which is what TODO 6.1's README rewrite should say. That rewrite no
longer waits on this being decided: send-for-review is what ships today whether
or not one of the three routes above is ever taken, and real collaboration
changing the answer later is a README change later.

## A settings pane

There is no place to put a preference, and two things want one.

The static HTML export's table of contents follows the **outline sidebar's
toggle**, because that toggle is the only switch that exists. It is the wrong
control: the sidebar is chrome for whoever is editing, the export's TOC is
content for whoever receives the file, and there is no reason the two should be
one decision. (`documentBody` in `static-export.js`, gated on `outlineIsOpen`.)
Until a pane exists the coupling is documented rather than fixed — CLAUDE.md's
outline section says so.

**Which heading levels the outline shows** is the second, if that ever stops
being "all of them".

Neither is worth a pane on its own, which is why this waited: one preference
does not justify the surface, and a Settings pane built for one preference
tends to acquire the rest by accident rather than by decision.

## Save fidelity past the point of diminishing returns

Both of these refine a system that already works. D1 holds today — an untouched
file comes back byte-identical and editing one paragraph changes one paragraph —
and neither of these is a case where it does not.

**The source is persisted as a second copy of the document.**
`adoptMarkdownStyle` writes the incoming markdown to the document's `source`
key — `documentKey("source")`, per tab — because the autosave is HTML and
carries no markdown to re-sniff on reload. It roughly doubles what Mandy stores, and a
document that blows the quota keeps editing and saving but loses byte fidelity
across a reload — a `console.warn` and nothing else. Storing the derived style
plus block hashes instead of the whole source would be smaller, and could not
reconstruct the bytes.

What defused this was the tabbed view settling its own version of the question,
and then shipping it that way on 2026-09-07: N tabs is 2N copies, under per-tab
keys, with **no budget, no eviction and no per-tab cap**. A tab that loses the
race keeps editing and saving and degrades to "sniffs to nothing" on its next
reload — a `console.warn` in `adoptMarkdownStyle` and nothing on screen. That
is not data loss, but it is not cosmetic either: the first save after that
reload rewrites the whole file in the defaults, which is the diff D1 exists to
prevent. Once that is the accepted behaviour, shrinking the per-document
footprint is an optimisation that delays hitting a wall nobody has hit, not a
correctness fix. And 3.1 removes the second copy outright — the model's blocks
carry their own bytes, so the model *is* the source, and the `source` key goes
— which makes this paragraph a description of the current core only.

**Segment granularity is block-level.** `markdownSegments` splits on blank
lines, list markers, headings and fences, so a change anywhere in a fenced
block, a table or a multi-line paragraph re-serialises the whole segment.
Finer granularity would need to match at line level, which is a different and
much less safe algorithm — and the cost of not doing it is a slightly larger
diff on a block that genuinely changed. The rewrite keeps this granularity and
makes it structural: a block's source span *is* the segment, and
[REWRITE.md](REWRITE.md) records block granularity as final rather than as a
limit of the matching.

## No module system

Every file in `front/` is a plain `<script>`, so every top-level `const` is a
shared global and collisions are real bugs rather than hypotheticals — `CLOSE`
vs `DOC_CLOSE`, `saveFileAs` vs FileSaver's `saveAs`. Load order is load-bearing
for the same reason: `toolbar.js` must run first because it defines
`onToolbarAction`, which every other module calls at load, and `notify.js`
second because every module below reports through it. Click delegation removed
the silent bound-to-null failure, not the ordering requirement.

The fix is `<script type="module">` with real imports, which browsers support
natively — but it conflicts with the editable export concatenating every JS file
into one inline `<script>`, so it needs import maps or blob URLs. Real work,
needs a decision first.

It is here rather than in TODO.md because nothing a user does touches it, and
because the editor rewrite (TODO 3.1, [REWRITE.md](REWRITE.md)) will settle it
either way: a rewrite that holds the document as a model has a module boundary
problem to solve regardless, and solving it twice would be the waste. If 3.1
lands without settling it, this stays here.
