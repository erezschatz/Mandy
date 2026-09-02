# Decisions

Questions that came up while building Mandy, were argued out, and are settled.
They are here rather than in [TODO.md](TODO.md) because they are not work
waiting to happen, and rather than in [CLAUDE.md](../CLAUDE.md) because that
describes how the code works — this is why it works that way, and what
changing it would cost. Reopen one by editing it here, not by filing it as a
TODO again. Where a decision points forward rather than at the current code,
that part lives in [ROADMAP.md](ROADMAP.md) instead — D4 is the one example
today.

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
  and it would dissolve the whole save-fidelity problem at a stroke; it is
  refused because it solves the wrong problem.

  This is where the source-view proposal is closed rather than in TODO.md, where
  it sat for a while as an undecided item and as the suggested cheap escape
  hatch for table editing. Both readings are the same mistake: the reason a
  table cannot be edited structurally is that the editing surface is missing,
  and answering that with "type the pipes yourself" hands the user back exactly
  the work this project exists to take off them. A read-only source view is a
  different and much smaller question — it makes markdown visible without making
  it a second seat of truth — and nobody has asked for one.
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
[front/markdown-style.js](../front/markdown-style.js) is the implementation — see
the save fidelity section of [CLAUDE.md](../CLAUDE.md) for how its three layers
fit together.

"Wherever we can manage it" has one real boundary. A block that has actually
changed cannot be recovered from the source, so it goes through the serialiser
and comes back in Turndown's spelling. Three of those differences are ones we
chose and would not undo; the fourth used to be a bug and is now a much smaller
cost.

| Opened as | An edited block saves as | Why |
| --- | --- | --- |
| Setext `===` / `---` headings | `#` / `##` | chosen: `headingStyle: "atx"` |
| `~~~` fences | ` ``` ` | chosen |
| Indented code | fenced | chosen: `codeBlockStyle: "fenced"` |
| `[x][1]` + a definition block | `[x][1]`, definition intact | fixed |
| `[x][]` or bare `[x]` + a definition | the explicit `[x][1]` | accepted: the collapsed forms have no DOM node to survive on |

Measured by hand, opening and saving this repo's own files through the running
app: README.md and welcome.md come back byte-identical, CLAUDE.md and
docs/TODO.md one character short apiece. Before this, all four came back
wholly rewritten. That measurement predates D3 and the inline-code fix that
came with it, and has not been re-taken in a browser since.

D3 is the one deliberate exception to all of the above.

## D2. Blockquotes render as CommonMark defines them, not as GitHub does

In CommonMark `>` opens a container, not a line. Consecutive `>` lines are one
paragraph inside one blockquote, so the newline between them renders as a
space: `> one\n> two` is a single line on screen. People who write markdown in
GitHub comment boxes expect two lines, and ask why Mandy disagrees.

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
narrowed and stated rather than quietly hedged: Mandy gives a file back byte for
byte *except* for invisible whitespace and empty elements, which it removes.

Two things keep the exception from eating D1. The normalisation runs on the HTML
before Turndown rather than on the markdown after `restoreSourceWrapping`, so a
U+00A0 an author genuinely wrote survives in any block they have not touched —
only edited text is normalised. And the paste sanitiser is targeted at empty
wrappers rather than being a round-trip through markdown, so pasting a web page
still keeps everything markdown can express.

It is worth saying out loud in the README rather than burying: this is a feature,
not a fidelity bug.

## D4. execCommand stays, and Mandy normalises after it

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
frozen, predictable half. What actually moves underneath Mandy is contenteditable
— selection behaviour, IME, touch handles, autocorrect, mobile keyboards — and
that is under active development and would be untouched by the exercise. It is
expensive and pointed at the wrong target.

**Carry on and fix things as they surface.** What Mandy did until now, which
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
  and Mandy has been doing it since inline code.
- A format that has one uses it, unless the browser check puts it on the list of
  divergences that survive to the file.
- Existing call sites stay until they demonstrate a problem. Migrating on
  principle buys nothing that normalising has not already bought.

`applyFormat` is a single switch statement, which is what makes all of this
reversible: converting a case is a local change. That is also the answer to
whether this had to be settled before TODO 1.1 adds ten more controls. It did
not — but *deciding* was nearly free and discovering later would have cost 1.1
twice, which is why it was decided anyway.

**The check is the load-bearing part.** [tests/browser-check.html](../tests/browser-check.html)
runs the real commands in a real contenteditable and reports what came out. The
Deno suite structurally cannot do this — it has no editing engine, so it can only
assert what Mandy does with the output — which means every engine-specific claim
in the codebase is either measured by that page or is folklore. Two long-standing
beliefs died the first time it ran. Re-run it when adding a format, and when a
browser does something surprising.

**On Mandy 2.0.** Everything above is a treatment rather than a cure, and the
cure is known: hold the document as a model in JS, render to the DOM, and treat
contenteditable as an input method whose changes are intercepted and
reinterpreted rather than accepted. That retires this decision, `undo.js`'s
snapshot design, the hard half of tabs, and the reason table cells cannot be
edited. It is a rewrite of the editor and it is not on the 1.0 route — see
[ROADMAP.md](ROADMAP.md) for what it would need to preserve.

The reason none of this becomes "just edit the markdown in a textarea with a
preview" — which would dissolve all of section 2 of the TODO at a stroke — is a
product position, not an oversight. Humans should not be editing markup by hand;
markdown files are used as code in real projects, so their diffs need the highest
signal-to-noise a tool can give them, ideally nothing but the actual change. A
WYSIWYG surface that saves byte-faithful markdown is the thing worth building.
Everything expensive in this repo follows from taking both halves of that
seriously.
