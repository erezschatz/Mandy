# Markdown coverage

Every construct in the two [Markdown Guide](https://www.markdownguide.org)
cheat sheets — [basic](https://www.markdownguide.org/basic-syntax/) and
[extended](https://www.markdownguide.org/extended-syntax/) — plus the two Mandy
adds on top, with where each one stands today and what the rewrite
([REWRITE.md](REWRITE.md)) is expected to do about it.

**This is a checklist for 3.1, not a description of the running app.** The
running app is CLAUDE.md's "Document state" and "Save fidelity" sections. This
file exists so the rewrite can be measured against a list drawn up in advance
rather than one discovered a keystroke at a time — the same reason
[REWRITE.md](REWRITE.md) exists. When 3.1 lands, the "after 3.1" column is what
its stage-1 and stage-2 exit criteria have to satisfy.

## How to read it

Three axes, because a feature can be present on one and absent on another, and
the gaps that matter are the asymmetric ones:

- **Render** — imported markdown displays right. This is `markdownit()` in
  `app.js` and the custom rules around it. `markdownit()` takes no options and
  no plugins, so it is CommonMark plus markdown-it's "default" preset — which
  turns on GFM **tables** and **strikethrough** and nothing else. `html`,
  `linkify` and `typographer` are all at their `false` default.
- **Author** — a toolbar or menu control creates it without typing markdown.
  The inventory is in CLAUDE.md's "menu bar" and "format bar" sections; the
  short version is thirteen formats, a horizontal rule, a link, and a table of
  contents.
- **Round-trip** — `htmlToMarkdown` in `app.js` (Turndown 7.1.2, no gfm
  plugin, plus the rules `app.js` adds) followed by the three
  [markdown-style.js](../front/markdown-style.js) layers. "Byte-exact" means an
  untouched block returns its own bytes via the content-keyed index; "lossy"
  means it serialises to Turndown's house style; "breaks" means the construct
  does not survive a save.

`✓` full · `~` partial or conditional · `✗` none. The rewrite column is `=`
when 3.1 changes nothing, an arrow when it should improve things, and a note
when there is a decision owed first.

---

## Basic syntax

| Construct | Render | Author | Round-trip | After 3.1 |
| --- | --- | --- | --- | --- |
| **Headings**, ATX `#`–`######` | ✓ | ✓ h1–h3 on the bar, h4–h6 in the Format menu | ✓ byte-exact | = |
| **Headings**, Setext (`===` / `---` underline) | ✓ | ✗ | ~ byte-exact untouched; an edited setext heading re-emits as ATX | → model keeps `source`; edited still normalises to ATX (block granularity, [REWRITE.md](REWRITE.md)) |
| **Paragraphs** | ✓ | ✓ (Enter) | ✓ | = |
| **Line breaks** (two trailing spaces, or `\`) | ✓ | ~ Shift+Enter inserts `<br>` | ~ untouched byte-exact; edited emits Turndown's `  \n`, no sniff of which spelling the file used | → **settled**: sniff the break spelling (S3 below) |
| **Bold** `**` / `__` | ✓ | ✓ | ✓ delimiter sniffed (`strongDelimiter`) | = |
| **Italic** `*` / `_` | ✓ | ✓ | ✓ delimiter sniffed (`emDelimiter`) | = |
| **Bold + italic** `***` | ✓ | ✓ (apply both) | ✓ | = |
| **Blockquote** `>` | ✓ CommonMark semantics — see [D2](DECISIONS.md#d2-blockquotes-render-as-commonmark-defines-them-not-as-github-does) | ✗ | ✓ Turndown core rule; `> ` chain re-applied by `reflowMarkdown` | → **TODO 1.1.6**: block type + wrap/unwrap control |
| **Nested blockquote** | ✓ | ✗ | ✓ | → 1.1.6 |
| **Blockquote containing other blocks** | ✓ | ✗ | ✓ for the blocks Turndown handles | → 1.1.6 (the container), plus whatever the inner block scores |
| **Ordered list** | ✓ | ✓ | ✓ delimiter, `1.`-vs-increment and pad all sniffed (`listItem` rule) | = |
| **Unordered list** `-` / `*` / `+` | ✓ | ✓ | ✓ marker sniffed per nesting depth | = |
| **Nested lists** | ✓ | ✓ (Tab / Shift+Tab, Format-menu indent/outdent) | ✓ pad per depth; sublist-inside-`<li>` enforced by `normaliseEditorMarkup` | → list surgery becomes model ops; the check pages retire |
| **List items with child paragraphs** (loose list) | ✓ | ~ Enter inside an item | ✓ tight-vs-loose carried on the segment separator (`markdownSegments`) | = mechanism, cleaner in the model |
| **List items with child blockquote / code / image** | ✓ | ✗ (no control puts a block inside an item) | ~ Turndown serialises the block; indent re-applied by `reflowMarkdown` | → falls out of block-type controls being model ops |
| **Heading inside a list item** | ✓ | ✗ **refused on purpose** in `applyFormat` — see [D5](DECISIONS.md#d5-a-block-control-only-ever-makes-the-block-its-named-for) | ✓ if imported | = still refused |
| **Inline code** `` ` `` | ✓ | ✓ (Code, partial selection) | ✓ edge spaces shielded (`shieldCodeEdgeSpaces`) | = |
| **Inline code with literal backtick** (`` `` `x` `` ``) | ✓ | ✗ | ~ Turndown picks a fence length; untouched byte-exact | = |
| **Indented code block** (4 spaces) | ✓ | ✗ (Code produces a fence) | ~ untouched byte-exact; edited re-emits as a fence (`codeBlockStyle: "fenced"`) | → model keeps `source`; edited still normalises to a fence |
| **Horizontal rule** `---` / `***` / `___` | ✓ | ✓ (Insert → Horizontal rule) | ✓ rule char sniffed (`hr`); Chrome's `id="null"` normalised | = |
| **Link**, inline `[text](url)` | ✓ | ✓ (Insert → Link…, `Ctrl+K`) | ✓ | → **settled: full link editor** (S2 below) — text + href, optional title, a heading picker for inner links |
| **Link title** `[text](url "title")` | ✓ | ✗ the Link dialog takes an href only | ✓ Turndown preserves an imported title | → **settled**: the link editor takes an optional title field (S2) |
| **Reference-style link** `[text][id]` + `[id]: url "title"` | ✓ `referenceAwareLink` stamps the label | ✗ (typing works, no control) | ~ preserved by `scanReferenceDefinitions` / `referenceLink` / `appendReferenceDefinitions`, but: single-line definitions only; edited or shortcut (`[text][]`, `[text]`) forms fall back to explicit inline-collected-at-end; multi-line definitions break | → definitions get a real home as an invisible block with `source` in place ([REWRITE.md](REWRITE.md)); multi-line still not scanned unless the parser is asked |
| **Autolink** `<https://…>` / `<user@host>` | ✓ | ✗ | ~ `autolink` Turndown rule is **gated on the sniff** — only kept if the file already uses them — plus a scheme check so `<notes.md>` stays literal | = |
| **Formatted link** (bold/italic inside link text) | ✓ | ~ apply the inline format to a selection that is already a link | ✓ | = |
| **Escaping** `\*`, `\#`, … | ✓ | ✗ | ~ untouched byte-exact; edited text is re-escaped by Turndown's own rules, which do not always match the source's choices | = (bounded by block granularity) |
| **Inline / block HTML** (`<div>`, `<details>`, `<sub>`, `<img>` with attrs, …) | ✗ `html: false` — raw HTML is escaped and shown as literal text | ✗ | ✗ round-trips as escaped text, i.e. mangled | → **settled 2026-09-07: `html: false` stays** (rendering or authoring raw HTML breaks the WYSIWYG premise), **and** an imported HTML block/span is kept as opaque `source` — byte-exact round-trip, rendered inert as today, never editable |

## Extended syntax

| Construct | Render | Author | Round-trip | After 3.1 |
| --- | --- | --- | --- | --- |
| **Table** (GFM pipe) | ✓ default preset | ✗ no insert; an **existing** table cannot be structurally edited either (rows/cols) — typing in a cell is all contenteditable allows | ~ untouched byte-exact (`normaliseTableRows` takes cell padding + the delimiter row out of the key); an edited table re-emits in the `table` rule's house style — **TODO 2.1** | → **settled: must-have — it is what drives the rewrite. TODO 1.1.8**: insert + row/column ops as index arithmetic on `rows[][]`; **2.1** formatter serialises an edited one |
| **Table alignment** `:--` / `:-:` / `--:` | ✓ | ✗ | ~ alignment preserved through the `table` rule; exact delimiter spacing normalised for the key | → 1.1.8 control + 2.1 formatter |
| **Fenced code block** ` ``` ` / `~~~` | ✓ | ✓ (Code, whole-block or bare caret) | ~ always emitted as ` ``` `; untouched byte-exact via the index; the fence char is not sniffed | → **settled**: sniff the fence char (S3 below) |
| **Syntax highlighting** (language on the fence) | ~ the class `language-x` is set but **nothing highlights it** — no highlight.js / Prism is loaded (Mermaid is special-cased in `renderers.js`) | n/a | ✓ the language token survives (it's on the class) | → **settled 2026-09-07: out of scope for 1.0.** The language token still survives on the class; revisit post-1.0 |
| **Footnotes** `[^1]` … `[^1]: …` | ✗ not parsed (needs `markdown-it-footnote`) — renders as literal text | ✗ | ✗ mangled if the block is edited; an **untouched** block round-trips byte-exact via its source span | → **roadmap, not 1.0** (2026-09-07) — see [ROADMAP.md](ROADMAP.md) |
| **Heading IDs** `## Title {#custom-id}` | ✗ the `{#id}` is shown literally. Mandy resolves GitHub-style *auto* slugs for `[x](#title)` links (`headingAnchors`) but honours no explicit id | ✗ | ✗ the `{#id}` text round-trips into the heading | → **settled: in scope for 1.0, with a caveat** — part of the link editor (S2 below). Four parts: parse `{#id}`, `headingAnchors` honours it over the auto-slug, a UI to set one, re-emit on an *edited* heading. Fallback if it bogs down: the first two only |
| **Definition list** `Term` / `: def` | ✗ not parsed (needs `markdown-it-deflist`) | ✗ | ✗ | → **roadmap, not 1.0** — niche |
| **Strikethrough** `~~text~~` | ✓ default preset | ✓ (bar + menu) | ✓ custom `strikethrough` Turndown rule → `~~` | = |
| **Task list** `- [ ]` / `- [x]` | ✗ renders as a list item containing the literal text `[ ]` (needs `markdown-it-task-lists`) | ✗ | ✗ the checkbox text round-trips as text, usually intact but never as a checkbox | → **settled: in scope for 1.0 (priority).** Render a **live** checkbox, not the plugin's disabled one; toggling it is an undoable edit; click/select + a button or menu action makes a list item a task item; sniff the `[x]` / `[X]` spelling per the file. Likely a hand-rolled rule (S4) |
| **Emoji** shortcode `:joy:` | ✗ not parsed (needs `markdown-it-emoji`). Pasted Unicode emoji are just text and work | ✗ | ~ shortcode round-trips as text; Unicode emoji fine | → **roadmap, not 1.0** — low stakes |
| **Highlight** `==text==` | ✗ not parsed (needs `markdown-it-mark`) | ✗ | ✗ | → **roadmap, not 1.0** — low stakes |
| **Subscript** `~text~` | ✗ not parsed (needs `markdown-it-sub`; also collides with `~~` strikethrough). `outline.js`'s `copyInline` allowlist passes `<sub>` through if it already exists as HTML | ✗ | ✗ from markdown | → **roadmap, not 1.0** — low stakes |
| **Superscript** `^text^` | ✗ not parsed (needs `markdown-it-sup`) | ✗ | ✗ | → **roadmap, not 1.0** — low stakes |
| **Automatic URL linking** (bare `https://…` in text) | ✗ `linkify: false` — a bare URL stays text | ✗ | ✓ (it's just text) | → **settled: `linkify: true` on import.** No new dependency — `linkify-it` already ships inside markdown-it. The D1 cost of serialising a linkified bare URL back to bare text is accepted (S2) |
| **Disabling automatic URL linking** (inside a code span, or `\`-escaped) | ✓ once `linkify` is on, markdown-it already honours both | n/a | — | → covered by the line above |

### From the guide's *Hacks* page / non-standard

Two the user asked to record — **underline** and **center** were considered and
dropped (2026-09-10): underline has no markdown spelling and its `_word_` form
collides with the `_` emphasis delimiter, and center is block-level presentation
of the `<div align>` kind S1 refuses. Neither remaining one is in markdown-it's
default preset or has a Turndown rule, so both render literally today and, once
parsed, an untouched block round-trips byte-exact via its 3.1 source span while
an edited one is where the work is. The argument is in [ROADMAP.md](ROADMAP.md).

| Construct | Render | Author | Round-trip | After 3.1 |
| --- | --- | --- | --- | --- |
| **Abbreviation** `*[HTML]: Hyper Text Markup Language` (Markdown Extra; `markdown-it-abbr`, ~1 KB; widely supported) | ✗ not parsed — renders literally | ✗ | ✗ from markdown; an untouched block byte-exact via its source span | → **roadmap, not 1.0** (2026-09-10). Untouched file is fine — *once the model has the invisible-block type the reference-link definitions are already adding*, which is where the nodeless `*[…]:` line parks. Editing a block that carries an occurrence is the only real work: a one-line Turndown rule unwrapping `<abbr>` to its text, a `scanAbbreviationDefinitions` + re-emit-at-end pair mirroring the reference-link one, and a whole-document whole-word match walk that skips the four opaque subtrees (`pre`, `code`, `.mermaid-wrapper`, `mjx-container`) |
| **Subtext** `-# smaller and greyed out` | ✗ not parsed (Discord's, not any guide's core) — renders literally | ✗ | ✗ | → **roadmap, not 1.0** — would need 3.1's block model to carry a presentational attribute; `-# ` joins the line-start markers `reflowMarkdown` must never strand and needs telling apart from `- #` (a list item holding an H1). Thinnest case here |

## Mandy's own two

Not in either guide; both work by stashing the source where the renderer cannot
destroy it. CLAUDE.md's "Document state" section is the detail.

| Construct | Render | Author | Round-trip | After 3.1 |
| --- | --- | --- | --- | --- |
| **Math** `$…$` / `$$…$$` | ✓ `mathSpan` + `math` rule feed MathJax the verbatim source; `hasMathSpan` keeps the re-wrapper in step | ✗ | ✓ `stampLatexSource` writes `data-tex`; the `mathjax` Turndown rule reads it back. Display math split across a blank line is not handled (a TeX error anyway) | → the model holds the TeX; the stamp and the Turndown rule go |
| **Mermaid** ` ```mermaid ` | ✓ `renderers.js` swaps in the SVG + a hidden `.mermaid-source` | ✗ | ✓ the `mermaid` Turndown rule reconstructs the fence from `.mermaid-source` | → the model holds the fence body; `.mermaid-source` and the rule go |

---

## What the rewrite must not regress

The `✓` round-trip cells above are the D1 promise
([DECISIONS.md](DECISIONS.md#d1-a-saved-file-gets-its-own-bytes-back)). Stage 1
of [REWRITE.md](REWRITE.md) says `CLAUDE.md`, `README.md`, `welcome.md` and
`docs/TODO.md` round-trip byte-identical through the model with no browser
involved — those four files between them exercise: ATX headings, both list
markers at several depths, tight and loose lists, nested lists, fenced code,
pipe tables with alignment, inline code with edge spaces, reference links with
single-line definitions, autolinks, blockquotes, horizontal rules, bold/italic
in both delimiters, and hard-wrapped prose at a measured width. A green stage 1
is most of this table's "byte-exact" column proven at once.

The ones **not** covered by those four fixtures, and therefore needing their own
stage-1 or stage-2 cases:

- Setext headings (normalise-to-ATX is allowed, but only for an *edited* block).
- Indented code blocks (same: `source` for untouched, fence for edited).
- Link titles, and an inner link `[text](#slug)` written by the heading picker.
- `~~` strikethrough round-trip.
- Task lists — `[ ]` / `[x]` with the sniffed spelling, tight and loose, mixed
  with plain items in one list.
- Explicit heading IDs — `## Title {#id}` survives an untouched heading and an
  edited one, and `headingAnchors` resolves a link to `#id` over the auto-slug.
- Linkified bare URLs serialise back to bare text, not to `[url](url)`.
- Math and Mermaid source survival — already have suites (`latex`,
  `self-reproduce`); point them at the model.

## Decisions

Settled as of 2026-09-07 unless marked open. The settled ones still want a line
in [DECISIONS.md](DECISIONS.md) when the rewrite implements them; the open ones
want an answer first.

### Settled

- **Raw HTML stays off, but a file that has it keeps it.** `html: false` is
  kept: rendering or authoring raw HTML breaks the WYSIWYG premise this project
  is built on (D0), so Mandy neither draws `<details>`/`<div align>`/`<img
  width>` nor gives a way to type them. An imported HTML block or inline span is
  kept as an opaque block with its own `source`, round-tripped byte-exact,
  rendered inert (escaped text, as today), never editable. That closes the D1
  hole where an opened file's HTML was escaped to text and written back
  mangled (was S1, settled 2026-09-07).
- **Tables are a must, not a question** — the driver of the whole rewrite.
  TODO 1.1.8 (structural editing) + 2.1 (the formatter). No decision, only work.
- **Task lists are in scope for 1.0**, priority. Live checkbox, undoable toggle,
  a button/menu action to make a list item a task item, sniffed `[x]`/`[X]`.
- **A full link editor is in scope for 1.0.** Mandy is a web page; links are
  first-class. Text + href, optional title, a heading picker that inserts an
  inner link to either an auto-slug or an explicit id. `linkify: true` on
  import — bare URLs become links, and the D1 cost of serialising them back to
  bare text is accepted.
- **Explicit heading IDs are in scope for 1.0, with a caveat.** Four parts:
  parse `{#id}`, honour it in `headingAnchors` over the auto-slug, a UI to set
  one (in the link editor), and re-emit it on an *edited* heading. If the
  rewrite bogs down, the last two are the cut line — parse-and-resolve ships,
  authoring waits. An untouched heading keeps its `{#id}` via its source span
  regardless.
- **Syntax highlighting is out of scope for 1.0.** Not a fidelity question —
  the language token survives on the class. Revisit post-1.0; a highlighter is
  a library behind an `ensure*` loader when it happens.
- **Footnotes, definition lists, `==mark==`, `~sub~`, `^sup^`, `:emoji:` are
  roadmap, not 1.0.** Each is one markdown-it plugin or a small hand-rolled
  rule, decided per-construct when it is picked up — see
  [ROADMAP.md](ROADMAP.md). Until then an untouched block containing one
  round-trips byte-exact via its source span; only an edited block risks
  re-escaping.
- **Abbreviation and subtext are roadmap, not 1.0** (added 2026-09-10);
  **underline and center were considered and dropped** the same day — underline
  has no markdown and its `_word_` form is the `_` emphasis delimiter, center is
  `<div align>`-family presentation S1 refuses. Abbreviation is the one with
  broad ecosystem support; its untouched-file round-trip is free once the model
  grows the invisible-block type reference-link definitions already need, and
  the edited case is a small, bounded piece of work — not the scope question the
  batch above mostly is. Subtext is a distant maybe. [ROADMAP.md](ROADMAP.md)
  has the argument.
- **The small serialiser sniffs get done.** Fence character (` ``` ` vs `~~~`)
  and hard-break spelling (two trailing spaces vs `\`) join the
  `sniffMarkdownStyle` set. The rewrite's whole point is better sniffing, so
  these are not a special case (S3).

### Open

- **S2 — link editor mechanics.** Agreed in principle. Left to settle when it
  is built: whether the heading picker is a searchable list or a plain
  `<select>`; whether editing an existing link pre-fills all three fields;
  whether `linkify` also applies inside the editor's own href field.
- **S4 — hand-roll vs plugin, decided when it is built.** The rule agreed
  2026-09-07: hand-roll the task-list and `{#id}` parse rules as markdown-it
  `inline`/`core` rules — the pattern the `math` and `referenceAwareLink` rules
  in `app.js` already follow — *unless* a plugin saves real time (a week, not an
  hour). `markdown-it-task-lists` and especially `markdown-it-attrs` bring a
  broad surface (`{.class #id key=val}` on many element types) that would then
  be ours to support and round-trip, which tilts the sum toward hand-rolling.
  `linkify` needs nothing either way. A tomorrow problem, recorded so it is a
  choice and not a default.

(S1 and S3 are settled and listed above; their numbers are kept so the table
cells that point at them still resolve.)
