# Decisions

Questions that came up while building Marky, were argued out, and are settled.
They live here rather than in [TODO.md](TODO.md) because they are not work
waiting to happen, and rather than in [CLAUDE.md](CLAUDE.md) because that
describes how the code works — this is why it works that way, and what
changing it would cost. Reopen one by editing it here, not by filing it as a
TODO again.

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
