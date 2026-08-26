# Roadmap

What comes after 1.0. [TODO.md](TODO.md) is what stands between here and a
finished 1.0; once that list is empty, this is where work continues. Nothing
here is scheduled — an item lands when a decision behind it is made and
someone starts it, the same as TODO.md, just on the other side of the line.

## Marky 2.0

The rewrite that Decision D4 in [DECISIONS.md](DECISIONS.md) only ever treats
rather than cures — read that decision first for the argument against doing
this now. The cure: hold the document as a model in JS, render to the DOM, and
treat contenteditable as an input method whose changes are intercepted and
reinterpreted rather than trusted the way `execCommand`'s output is trusted
today. That retires D4 itself, `undo.js`'s snapshot design, the hard half of
tabs (TODO 4.1), and the reason table cells cannot be edited (TODO 1.4). It is
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

## Real collaboration, not send-and-hope

The "collaborative" framing in the README doesn't hold. Collaborative in 2026
means Google Docs — two people editing one document. This is the Word model:
pass a file back and forth by mail. Worse, every hop mints a *new* file,
because the editable export fuses the document and the application into one
artifact, so there is no stable document identity to write back to. You open
X, you export Y, and now which one is current?

Three routes out: both sides run the full Marky (server + client) and pass
plain `.md`; or the exported file writes back to itself via the File System
Access API (Chromium-only, and needs testing from `file://` before anyone
designs around it); or shared storage both sides can reach. Failing all of
those, the honest fix is to describe today's export as send-for-review, one
hop — which is what TODO 6.1's README rewrite should say once this is decided
either way.
