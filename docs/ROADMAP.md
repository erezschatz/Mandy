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

**A document's theme** is the third, as of 2026-09-15, and the first with a
per-document scope rather than a per-user one — the section below. Presets can
ship ahead of the pane as a menu; anything past picking a preset by name is
what the pane is for.

**The document's margins** are the fourth, as of the chrome redesign
(`docs/redesign/`, closed out in CHANGELOG.md).
`#editor`'s `max-width: 68ch` is one fixed measured column
for every reader, and the same redesign is what makes that worth a knob at
all: a wide monitor now sits on visibly more spare width beside the column
than the pre-redesign full-bleed editor ever left on screen, which is exactly
the real estate TODO 4.11 wants to let the outline sidebar grow into instead.
Whether the column width is the preference, or the side margins are, is a
decision for whenever this is picked up — either reads as "how much of the
window the prose gets," just anchored from a different edge.

## Split screen

Two open documents side by side rather than one tab at a time, which the
chrome redesign is what makes this worth having: the measured `#editor`
column stopped assuming it owns the full window the moment it capped itself
at `68ch`, and a wide monitor now has room for a second one next to it rather
than the pre-redesign full-bleed editor ever leaving space to.

The document model is already shaped for this — `tabs.js`'s park/adopt pair
moves a whole document's state (content, undo history, file identity,
markdown style) as one bundle per tab, which is exactly the unit a second
visible pane would need, and nothing about it assumes there is only ever one
tab on screen. What is missing is entirely presentational: a second `#editor`
mount point, a way to pick which two tabs are paired, and a split ratio to
remember — plus everything downstream of "the active document" that assumes
there is exactly one (the format bar's positioning, the outline sidebar,
which document Ctrl+S writes to) now has to ask which pane, not just whether
there is one. Wants a decision on the interaction before the layout: does a
tab drag to a side to open the split, is it a toolbar action, or both.

## A tab strip that hides itself on purpose

The chrome redesign's stage 3 (`docs/redesign/`, closed out in
CHANGELOG.md) briefly shipped the tab strip scrolling away with the
document — the design doc's own call, "outside
the sticky toolbar... intended" — and it read as a bug the moment it was
actually used rather than just reviewed: the strip vanished on any downward
scroll and only came back once you scrolled all the way back to the top,
which is not how the mechanism it resembles behaves anywhere else. It was
made sticky instead, pinned under the menu row like the rest of the chrome,
which is correct but plain.

The idea worth building on purpose, later: hide the tab strip going down,
show it again the instant you scroll up even one pixel — a mobile browser's
address bar, not a page element that happens to scroll off. That is a real
feature (scroll-direction tracking, a transform or height transition, a
decision about the threshold and about what happens mid-transition if the
direction reverses), not a CSS property, and it wants building deliberately
rather than falling out of a redesign that was after something else. Same
`.tab-bar` `min-height`/`position: sticky` this stage landed either way — the
strip still needs to reserve its space and sit at a known offset whether it
is always visible or hiding conditionally.

## Document themes, and the HTML question behind them

Recorded 2026-09-15, out of a discussion that kept coming back and had not
reached a resolution on its own. The worry: content increasingly arrives and
leaves as HTML, HTML is a canvas where markdown is a typewriter, and Mandy is a
markdown editor by decision (D0) at the moment the documents people admire are
styled pages. Building gas cars while the market goes electric — there will be
business for years, just not the cool kids' business, and maybe it runs out.
The question put was *can Mandy have both, and what would it take*. The answer
is that "both" means two different things, one of which the rewrite makes
nearly free and the other of which is a second product wearing Mandy's skin.
The refusals are D7 in [DECISIONS.md](DECISIONS.md), which is where they stop
being relitigated; this section keeps the tiers with their costs, and then the
one feature that came out of it.

### Two things called HTML

There is HTML as a *render* of a document, and HTML as a *source* people author
and hand around. 3.1's core move — the model owns the document and the DOM is
a view of it — is what draws the line between them: **design lives in a
renderer, editing lives in a model.** One model with more than one way of
rendering it is cheap. Two models are two products, and nothing converts
between them without loss, which is exactly the two-products-in-one feeling
that made this hard to settle.

Four tiers were on the table. Weeks are [REWRITE.md](REWRITE.md)'s weeks.

- **Import, one way.** TODO 6.4: HTML in, markdown from then on, styling gone.
  It rescues text and structure and says so. Planned, touches no core, lands
  whenever it is picked up.
- **Opaque HTML blocks.** An `html_block` carried on the invisible-block
  mechanism the reference definitions already force 3.1 to add, rendered
  sanitised into the DOM as itself, selected whole like an image, never edited
  inline, bytes preserved on save — what CommonMark calls an HTML block anyway.
  About a week on the new core, plus reopening `html: false` (S1 in
  [MARKDOWN.md](MARKDOWN.md)), plus a sanitiser, which with no dependencies is
  a hand-rolled allowlist and the part that was actually risky. **Refused,
  D7**: an opaque block is a block whose only editing surface is its source,
  which is the source pane D0 refuses, through the back door.
- **A document that carries its own design.** Tokens, not markup: the feature
  below. This is the version of "both" that is not two products.
- **An editable HTML canvas.** A tree model rather than a block list, because a
  `<div class="grid">` nests arbitrarily and markdown-it's block tokens cannot
  hold it. A second fidelity stack, because the browser's own parser does not
  round-trip HTML — it requotes attributes, re-encodes entities and rewrites
  whitespace — so D1 for HTML means a source-preserving HTML parser Mandy would
  own. A second control set, a properties panel rather than a Format menu. A
  second undo shape. And a conversion to markdown that is lossy by definition.
  Months, not weeks, and it is precisely the tree-shaped, normalising model
  REWRITE.md's first constraint rejected, so it would want an engine.
  **Refused, D7**: a second product, not a feature.

So the honest engineering answer is that the third tier is "both" and the
fourth is two products, and the rewrite's block-model choice is what draws the
line. It was drawn on purpose in REWRITE.md, not by omission.

### Where the leg up actually is

A product reading, hedged, because nobody knows where this goes. The thing
driving HTML-as-canvas is models producing one-off deliverables — reports,
pages, dashboards. Those are terminal outputs the way PDF and DOCX are, and
this project already decided terminal outputs do not extend the collaboration
chain (the editable export's `ASSETS` argument in CLAUDE.md). The thing driving
markdown is the same models in the other direction: every spec, README,
CLAUDE.md, skill file and PR description is markdown, and there is more of it
than a year ago. D0 says Mandy exists for that second loop. If a styled page
comes back needing a change, the workflow that survives is *edit the source
and regenerate*, and Mandy is the source editor.

**Import is rescue; export is the product.** Markdown in, designed HTML out,
with nobody writing HTML, is a position the canvas tools cannot hold and is
consistent with everything already recorded. The foot in the electric-car
door, if there is one, is on the export side.

Where this is genuinely uncertain is whether HTML becomes something people
*author again* rather than regenerate. If it does, the fourth tier matters and
Mandy is not that tool — better said now than half-built later. The evidence
that settles it is cheap and should be collected: each time an HTML document
arrives, note whether the edit wanted is to the text or to the layout. If it is
always the text, 6.4 plus the theme below is the whole answer.

### The feature: a theme per document

Purple H1s, green H2s, a different body font, a background — for *this*
document, not every document. Two reasons, and they are the same two the
discussion started from: working in a document should feel like more than a
nice way to read it, and the exports should look like the document did. No
interactive gimmicks; a theme has no script and never will. It looks better
and that is all it does.

**Where the theme lives is the whole design.** Three places, and only one keeps
D0, D1 and `html: false` untouched.

- **Outside the file, keyed by path — chosen for the first version.** The
  `.md` never changes. The theme follows the file across close and reopen, and
  both exports inline it the way they inline `app.css` today, which is where a
  theme pays off: the reader of a static export gets the purple headings. What
  it does not do is travel when the bare `.md` is sent to another Mandy — and
  today nothing travels that way; send-for-review goes through the editable
  export, which carries its CSS. **Not keyed by tab**: the tab store vanishes
  on close, and "this document has purple headings" is a statement about the
  document, so the durable store is a path→theme map. The tab still needs a
  live copy — an unsaved document has no path yet — so the theme is also a
  seventh `documentKey`, `theme`, seeded from the map on open and written back
  to it on save, the same two-store shape `path` and `dir` already have.
  `localStorage` first. A sidecar file beside the `.md` would travel through
  git, which for a repo of specs is genuinely attractive, but it needs the
  server's write gate widened past `MARKDOWN_EXTENSIONS`, which is a security
  property CLAUDE.md records, so it is its own decision and not the first
  version.
- **In the file, as front matter — a later stage, if ever.** It travels with
  the file, and in 3.1's model it is free to preserve: source lines no block
  token covers are kept byte-exact as an invisible block. Against it: a block
  of machine-written configuration at the top of every themed document, which
  other renderers show as a table or as text, and which makes the file no
  longer pure content. There is a D0 irony in it being YAML, and the irony is
  survivable — D0's objection is to a *human* writing it — but it is a
  decision to reopen with the trade in front of you, not to inherit.
- **In the file, as attributes on elements — refused, D7.** `{.callout}` on a
  paragraph, a colour on a span. One-off formatting is how documents rot, it
  is markup in the file, and it is the ceiling named below.

**What a theme is: tokens, not CSS.** `app.css` already runs on custom
properties, in light and dark pairs — `--text-heading`,
`--text-heading-secondary`, `--bg-editor`, `--accent-blue`,
`--border-blockquote` and the rest. A document theme is a set of overrides to
those plus a few tokens the stylesheet does not have yet: a colour per heading
level (today H2 and H3 share `--text-heading-secondary` and H4–H6 have none of
their own), a body font, a heading font and a mono font (today a literal
`"Courier New"` in two places), and probably a measure. Tokens are what let a
purple heading compose with the dark toggle instead of fighting it — the toggle
is the reader's preference, the theme is the document's, and they are
independent axes only if every token carries a light and a dark value. They
are also what keeps the picker small: a colour or a font per token, plus a
handful of built-in presets. **The human picks, the machine writes the CSS**,
which is D0 applied to design. Arbitrary CSS in the picker is refused for the
same reason element attributes are: it is a second authoring surface, and it
is what would make an exported document unpredictable in someone else's
browser.

**How it is applied.** The tokens are set on `#editor`, not on the root, so
chrome stays chrome — the toolbar, the outline and the dialogs keep the app's
own look, and only the document changes. Set by `style.setProperty`, never
written into the document's markup, for the `--link-hint` reason: anything
stamped inside `#editor` reaches Turndown. The two exports each gain a
`<style id="doc-theme">` beside `app-style`, and the editable export reads it
back the way it reads `app-style`, so a themed document re-exports themed —
the self-reproduce suite gets a check for it. PDF comes along for free, since
html2pdf rasterises what is on screen; DOCX ignores it, since `docx-export.js`
carries its own styling, and DOCX is a terminal format anyway. An exported
document shows the *author's* theme to the reader, unlike light and dark, which
follow the reader's OS — the theme is nearer to content than to preference,
and the per-mode pairs are what let both be true at once.

**The ceiling, named.** A theme can say what every H2 looks like. It cannot say
that *this* paragraph is red, or put two columns inside the text, or draw a
card around a list. Those are markup, they are what the canvas tier is for,
and a markdown document has no honest spelling for them. Anyone who needs them
needs a different tool, and Mandy should say so rather than approximate.

**A third layer, later: sniff a theme out of imported HTML.** The same idea as
`sniffMarkdownStyle` — read what the incoming document already does and adopt
the subset the tokens can name. An LLM-generated report's heading colours,
fonts and background are usually class-based and semantic, so most of them
map; its layout, cards and per-element styling do not, and the sniff should
say so with a `notify` rather than approximate. One mechanical caveat decides
its shape: computed styles need a live document, and 6.4's rule is that an
imported string never reaches a live node before conversion. A sandboxed
`<iframe srcdoc>` with scripts refused is the honest way around that, and
whether it is airtight is a measurement question of the browser-check kind,
watched once. It is a heuristic in the `sniffWrapWidth` mould — it gives up
rather than guesses — and it is not designed until 6.4 and the theme store
both exist, because it is nothing but the two of them joined.

**Stages**, each *not started*, none waiting on 3.1 — all of this reads the
rendered DOM and `app.css`, which the rewrite leaves alone.

1. **Tokens.** The per-level heading colours, the three font tokens and the
   measure added to `app.css` in both light and dark, replacing the literals.
   No visible change; the point is that a theme has something to override.
2. **The store.** The path→theme map, the `theme` document key, the seed on
   open and the write on save. The `file-path` suite drives its fake disk
   through open, save and Save As and checks the theme follows the path.
3. **Apply and export.** `setProperty` on `#editor` on every adopt;
   `<style id="doc-theme">` in both exports, read back by the editable one.
   The `static-export` and `self-reproduce` suites each gain a check.
4. **Presets.** A handful of named themes and a way to pick one — an `ask()`
   with actions or a View menu entry is enough for names, so this ships ahead
   of the pane. A theme that is not a preset is what the pane is for.
5. **The picker.** Per-document scope in the settings pane above: a colour or
   a font per token, light and dark, with the current mode edited in place.
6. **Front matter**, if the theme ever needs to ride the `.md` itself. A
   decision, not a stage, until someone asks for it.
7. **Sniff from HTML**, after 6.4 lands. Same status.

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
