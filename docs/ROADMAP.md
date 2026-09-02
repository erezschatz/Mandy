# Roadmap

What comes after 1.0. [TODO.md](TODO.md) is what stands between here and a
finished 1.0; once that list is empty, this is where work continues. Nothing
here is scheduled — an item lands when a decision behind it is made and
someone starts it, the same as TODO.md, just on the other side of the line.

## Mandy 2.0

The rewrite that Decision D4 in [DECISIONS.md](DECISIONS.md) only ever treats
rather than cures — read that decision first for the argument against doing
this now. The cure: hold the document as a model in JS, render to the DOM, and
treat contenteditable as an input method whose changes are intercepted and
reinterpreted rather than trusted the way `execCommand`'s output is trusted
today. That retires D4 itself, `undo.js`'s snapshot design, the hard half of
tabs (TODO 4.1), and the reason table cells cannot be edited (TODO 1.1). It is
a rewrite of the editor, not an increment on it.

Two constraints recorded now so a future rewrite starts from them rather than
rediscovering them:

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
`adoptMarkdownStyle` writes the incoming markdown to
`localStorage["markdownSource"]`, because the autosave is HTML and carries no
markdown to re-sniff on reload. It roughly doubles what Mandy stores, and a
document that blows the quota keeps editing and saving but loses byte fidelity
across a reload — a `console.warn` and nothing else. Storing the derived style
plus block hashes instead of the whole source would be smaller, and could not
reconstruct the bytes.

What defused this was the tabs item settling its own version of the question
(TODO 4.1): N tabs is 2N copies, and the answer there is **no budget, no
eviction, no per-tab cap** — a tab that loses the race degrades silently to
"sniffs to nothing" on its next reload, which is cosmetic rather than data
loss, and is not surfaced. Once that is the accepted behaviour, shrinking the
per-document footprint is an optimisation that delays hitting a wall nobody has
hit, not a correctness fix.

**Segment granularity is block-level.** `markdownSegments` splits on blank
lines, list markers, headings and fences, so a change anywhere in a fenced
block, a table or a multi-line paragraph re-serialises the whole segment.
Finer granularity would need to match at line level, which is a different and
much less safe algorithm — and the cost of not doing it is a slightly larger
diff on a block that genuinely changed.

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
because the Mandy 2.0 rewrite above would settle it either way: a rewrite that
holds the document as a model has a module boundary problem to solve regardless,
and solving it twice would be the waste.
