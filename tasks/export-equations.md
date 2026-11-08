# Equations in the PDF and Word exports

## Context

Found 2026-11-08 during the Firefox hand run of TODO 3.1's stage 4 slice 2.
The same document was exported under both cores and both came out the same,
so this was already there before that slice:

- **PDF** draws every equation twice: MathJax's glyphs, plus the plain letters
  of its hidden assistive MathML on top. html2canvas, which draws the page for
  html2pdf, ignores the CSS that hides that copy from sighted readers. It also
  puts CHTML's glyphs a few pixels too high, measured against a baseline marker.
  The glyphs are CSS `::before` content in a web font, and html2canvas places
  that text itself.
- **Word** writes an equation as its plain letters (`x`, `y`).
  `parseInlineContent` takes the container's `textContent`, and that is the
  assistive MathML's text.

The user chose what an equation becomes in Word: **a picture**. It looks the
way it does in the editor, and isn't editable in Word. The other options were
the TeX source as text, or a native Word equation, which needs a TeX-to-OMML
converter.

### Plan

One picture of each equation, used by both exports. Both draw from it, so the
PDF and the Word file show the same thing.

1. **Draw the picture with MathJax's own SVG output, in an isolated frame.**
   Two things were measured first and failed:
   - html2canvas on the CHTML container puts glyphs too high and clips them.
   - Loading `output/svg` into the page's `tex-mml-chtml` MathJax throws.
     The two outputs' font data do not mix.

   What works is `tex-svg.js`, from the same `mathjax@3` package already in
   use, in a hidden same-origin `<iframe>` of its own, with
   `fontCache: "none"`. Its `tex2svgPromise` returns a container holding an
   SVG built from paths, so it needs no web font. An SVG carries exact width, height and depth, and
   an `<img>` draws it without help.

   `ensureMathSvg()` in `lazy-load.js` loads it on first use, memoised like the
   other loaders. This is a new component of an existing dependency, not a new
   dependency. The SVG is sized at the equation's computed font size in the
   editor, drawn onto a canvas at three times that size, and kept as a PNG.
   That is because docx 7.1.0's `ImageRun` takes PNG and not SVG.
2. **`exportEquationImages(clone)` in `renderers.js` replaces each equation in
   an export's clone with that `<img>`.** The `alt` text is the TeX source.
   The image is sized in CSS pixels. An inline one is lowered by its depth, so
   it sits on the text's baseline; a display one becomes a centred block. Equations
   are matched to the editor's by document order, since a detached clone has
   no computed font size.
   - If the SVG renderer cannot load (offline), the clone falls back instead
     of failing. The PDF keeps the CHTML glyphs and drops the assistive copy:
     slightly high, but drawn once. Word gets the TeX source, as text.
3. **PDF**: `generatePDF` calls it on its clone.
4. **Word**: `generateDOCX` calls it on its clone. `parseInlineContent` turns an
   equation `<img>` into an `ImageRun`, lowered by its depth through the run's
   `w:position`. docx 7.1.0 has no option for that, so the element is added to
   the run's properties directly. A paragraph holding only a display equation
   is centred.

Not in scope: ordinary images in the Word export. They are dropped today.
That is a separate gap.

**Verification.** No Deno suite can draw an SVG or a canvas. Two kinds of check
cover it:
- the `latex` suite's stub tests what the clone ends up holding, with the
  rasteriser stubbed.
- `exports.spec.mjs` checks that the PDF and Word hand-overs hold one picture
  per equation and no MathJax markup, and that Word gets an image run for
  each.

The look is checked by rendering both files to images on macOS (`sips` for the
PDF, `qlmanage` for the docx) and looking at them. Word itself is not available
here, so how Word lays out a lowered picture is the user's to check.

<!-- append below, in the same commit as the change; one section per landing -->

## What was done

2026-11-08. **Done and tested**, by machine in all three engines. The steps
landed as planned:
- `ensureMathSvg`
- `exportEquationImages` and `drawEquation`
- the PDF and Word call sites
- `equationRun` with its `w:position`

The `latex` suite covers the picture's attributes, the font size taken from the
editor's counterpart, and both fallbacks. Three of those checks were confirmed
to fail when the code was broken. `exports.spec.mjs` passes in Chromium,
Firefox and WebKit. On the Word side it checks the HTML handed to the converter
and the image runs `equationRun` makes, not the XML. The XML was checked by hand: unzipped, the document holds one
picture per equation and a `w:position` on each one with depth.

After review, two failures that would have stopped the export now degrade
instead: an equation that cannot be drawn falls back on its own, and a renderer
that loads but never starts gives up after 30 seconds. The browser spec gained
a display equation; Word's centring of one is seen in the renders only.

The PDF and docx were rendered and looked at under both cores in all three
engines, the docx through Quick Look. The one thing not seen is Word itself
laying out the lowered picture. The CHANGELOG entry has the detail.
