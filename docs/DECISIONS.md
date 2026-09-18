# Decisions

Questions that came up while building Mandy, were argued out, and are settled.
They are here rather than in [TODO.md](TODO.md) because they are not work
waiting to happen, and rather than in [CLAUDE.md](../CLAUDE.md) because that
describes how the code works — this is why it works that way, and what
changing it would cost. Reopen one by editing it here, not by filing it as a
TODO again. Where a decision points forward rather than at the current code,
that part lives in [TODO.md](TODO.md) or [ROADMAP.md](ROADMAP.md) instead — D4,
D6, D7 and D8 all point at [REWRITE.md](REWRITE.md), and D9 at the theme section
of [ROADMAP.md](ROADMAP.md).

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

**On the rewrite.** Everything above is a treatment rather than a cure, and the
cure is known: hold the document as a model in JS, render to the DOM, and treat
contenteditable as an input method whose changes are intercepted and
reinterpreted rather than accepted. That retires this decision, `undo.js`'s
snapshot design, and the reason table cells cannot be edited — not tabs, which
this sentence once counted: the tabbed view shipped on this core on
2026-09-07, and what the rewrite changes for it is the swap and, possibly, the
switch lock, per [REWRITE.md](REWRITE.md). It was a rewrite kept off the 1.0
route; as of D6 it is on it, as TODO 3.1, designed there. Until it lands, everything in this
decision describes the running code and the boundary rule above still governs
any change to `front/` — with one amendment: a *new* format is not written
against contenteditable at all, since the work would be discarded with the
core. D4 is marked retired, not deleted, when 3.1 ships.

The reason none of this becomes "just edit the markdown in a textarea with a
preview" — which would dissolve all of section 2 of the TODO at a stroke — is a
product position, not an oversight. Humans should not be editing markup by hand;
markdown files are used as code in real projects, so their diffs need the highest
signal-to-noise a tool can give them, ideally nothing but the actual change. A
WYSIWYG surface that saves byte-faithful markdown is the thing worth building.
Everything expensive in this repo follows from taking both halves of that
seriously.

## D5. A block control only ever makes the block it's named for

TODO 1.1.5 measured that execCommand's own `indent` does something beyond
indenting a list item: applied outside a list, it turns the current block into
a `<blockquote>`, with Chrome adding inline styles Firefox does not. That path
is not reachable today — `app.js` guards Tab, and the indent control TODO 1.1.3
added, to lists only — but 1.1.6 (blockquotes, written by hand rather than
through execCommand) was going to have to decide whether to meet it: should
indenting outside a list stay a no-op, or should it double as a way to make a
quote?

Settled: **it stays a no-op.** Tab and the indent control never touch a block
that isn't a list item, in either direction, permanently — not just until 1.1.6
ships. A blockquote is reachable only through its own control.

This is the same call TODO 1.1.5's other bullet already made for a heading
inside a list, generalised: a control that quietly does two different things
depending on context is a worse control than two controls that each do one
thing, even when both things are individually expressible in markdown. "Press
Tab enough times and a paragraph turns into a quote" is a discovery, not a
feature — nothing advertises it, nothing explains why it happens outside a
list but not inside one, and it would make indent's meaning depend on the
block it's pointed at rather than on the key that was pressed. The
Chrome/Firefox styling divergence never had to enter into it; the answer would
be the same if both engines agreed.

Nothing changes in `front/` for this — the guard that makes the path
unreachable already existed for lists, this decision is what keeps it that way
on purpose rather than by accident of scope. 1.1.6 is free to build blockquotes
however it needs to without reconciling itself against `indent`'s native
behaviour at all.

## D6. The editing core is rewritten before 1.0, not after

ROADMAP.md kept the rewrite D4 describes as a post-1.0 option, with a rule for
when it stopped being one: twice a cluster of contenteditable bugs had forced a
piece of the engine's behaviour to be replaced by hand-rolled DOM surgery
(`outdentListItem`, then the empty-`<li>` Enter/Backspace handler), and a third
such cluster would make the rewrite a 1.0 blocker, on the argument that past
that point the hand-rolls are the input-layer spec being discovered a keystroke
at a time.

The question put on 2026-09-06 was whether to finish the remaining editing
items on the current core first — blockquotes, images, tables, the invisible-
whitespace leak, the undo caret bug, search — and rewrite after, or to rewrite
now. The framing was arithmetic: two weeks of fixes then two of rewrite is a
toss-up; two of fixes, two of rewrite and two re-implementing the fixes is a
no; the trouble was that nobody had built the other side to estimate it.

Settled: **rewrite now.** Three reasons, in order of weight.

- **The arithmetic double counts.** The fix work is mostly discarded by the
  rewrite — every one of those items targets the layer the rewrite deletes —
  and the rewrite does not re-implement them, it makes them trivial: a table
  row is an array element, U+00A0 never enters the model, undo restores a
  small object rather than walking the whole editor for an offset. What the
  rewrite costs is the core, which has no counterpart today and costs the same
  whenever it is built. So fix-first is the rewrite plus two to three weeks
  that mostly evaporate.
- **The rule had already fired.** Tables are not a third cluster; they are
  cell navigation, row and column surgery, Enter and Backspace at cell edges,
  paste into a cell and a truce with each engine's native table editing, in
  three engines. Starting TODO 1.1.8 on the old core *was* the third cluster.
  Fix-first meant blockquotes and images, then the wall at tables, a week
  further on.
- **No date is waiting on 1.0.** That is the one case where fix-first wins: it
  ships a 1.0 in two to three weeks where the rewrite ships one in five to
  eight. Nobody is waiting, and `main` keeps working while the rewrite lives
  on a branch.

What the decision does *not* settle, deliberately: whether the rewrite can be
built without an engine dependency. [REWRITE.md](REWRITE.md) keeps that
constraint and puts a three-day spike in front of it as a gate — pass and the
plan proceeds, fail and the constraint is the first thing reopened. The
decision here is the order of work, not the feasibility, and it is made with
the estimate's tail (the input layer, one to two weeks of fallout on top of
four to six) stated rather than hoped away.

The consequence for open work: TODO 1.1.6, 1.1.7, 1.1.8, 1.4, 1.6 and 1.8 are
not started on the current core, because everything written there is discarded
with it. Section 2 is the exception: its items are pure serialiser work in
`markdown-style.js`, which lives through the rewrite and is called per block
rather than per document afterwards, so they can be fixed on `main` today and
the fix carries over. 2.2 was one and was fixed that way on 2026-09-13; 2.1's
table formatter is the one still open.

## D7. The rewrite simplifies the engine; the live editor changes when that helps

Decided 2026-09-13, when a question about where two markdown-it rules should
live was argued on a premise that turned out to be invented: that the `rewrite`
branch must not touch the running editor.

It must not *replace* it — `main` keeps a working editor until parity, and
nothing ships in between. That is **sequencing**, and it is the whole of what
D6 settled. It had hardened, in CLAUDE.md, in REWRITE.md and in `model.js`'s own
header, into something stronger and unearned: that the running editor was a
thing to be preserved, and that a slice touching a file the app loads had spent
something. It had not. Read that way, the constraint argues for exactly the
moves the rewrite exists to stop — leaving code where it does not belong,
because moving it would disturb something.

**What the rewrite is for.** The current core needs the document in two forms at
once, markdown and DOM, and most of the machinery around it exists to keep the
two in step: `normaliseEditorMarkup` after every command, the hand-rolled list
surgery where an engine could not be normalised at all, the content-keyed block
index and the sniff-and-restore layers, the copies in `localStorage`, the stashes
that keep Mermaid and LaTeX source alive through a render. None of that is
markdown being difficult. It is the cost of not owning the document. The rewrite
stores the markdown alone, renders it into the editor, and reads it back — and
the machinery goes with the second copy.

**So the rule for touching the live editor is not "don't", it is "for what".**

- A change that **fixes something, or makes a workaround unnecessary**, is the
  work. Make it.
- A change that **preserves current behaviour cheaply** is worth having; if
  preserving it means bending over backwards, it is not.
- A change that exists to stay **bug-compatible with the DOM or with an engine**
  is the thing this decision refuses. Markdown is a messy enough specification
  on its own; nothing is served by carrying the browser's mess forward into a
  core built to be free of it.

**And the order of repair is model first.** If a change to the engine breaks
something in the browser, that is what the suite is for — and a correct model
makes the browser fix simpler, where the reverse has been this project's
experience twice over. A working model with a broken browser is a bad state; a
plausible model reached by hacking the browser back into agreement with it is a
worse one, because it is the state the old core was already in.

The immediate consequence, and the question that produced this: the two custom
markdown-it rules in `app.js` — `math` and `referenceAwareLink` — move into a
file of their own as the first step of stage 1's slice 2. The model is defined
as *markdown parsed by this parser*, so the parser's configuration is part of
the model layer and is in `app.js` by accident of history rather than by design.
That the move touches a file the app loads is not a cost to be weighed.

## D8. The branch merges to `main` twice: at the end of stage 1, and at the end of stage 4

Decided 2026-09-16, asking whether `rewrite` could go back to `main` at each
stage boundary. It can at two of them, and the stage boundary turns out not to
be the unit — the useful seams are one finer and one coarser than the stage
list.

**Two reasons to merge at all, and neither is risk management.** The branch
exists to be finished, not to be safe. What merging buys is that **the work gets
exercised in the editor actually in daily use** rather than only in a suite, and
that **the two branches stop drifting**. The second is measured rather than
feared: the one merge taken so far in the other direction, `d4e52de` on
2026-09-13, merged **every line of code with no conflict at all** — and every
single conflict was in prose, all of them artefacts of the same item having
reached `main` as an adapted cherry-pick rather than by merging, plus one
duplicate git could not match and that had to be removed by hand. The code
converges. The documents are what diverge, and they diverge with time.

### Stage 1 — merge

It changes nothing the editor does. `model.js` is in none of the three
registries, so nothing loads it; what lands is a file the app never calls, a
suite, and a `deno.json`.

**Which means the first of the two reasons above does not apply to it, and that
is worth saying rather than glossing.** An inert model is not exercised by being
on `main`. What *is* exercised is the rest of what the stage carried:
`markdown-parser.js` — slice 2's step 0 — is a real refactor of the running
editor's parser configuration, in all three registries, and it is the kind of
change D7 says to make rather than defer. It does the editor good on `main` and
none on a branch. Stage 1 is therefore merged for the refactors and for the
drift, and the model comes along inert.

### Stages 2 and 3 — no

**The unusable window is not a stage, it is build-order steps 2 through 4** —
render, then input, then formats. Between a renderer that exists and formats at
parity the editor draws a document it cannot properly be edited in, and there is
no stopping point inside that.

End of stage 2 is a genuine boundary — "everything the app does today, on the
new core" — and it is still the wrong merge, though **not because the app would
break**. It would not: the replaced-code table records that the ~5,300 untouched
lines read the rendered DOM, which still exists. `file-api.js` would go on
reading `editor.innerHTML`, Turndown would go on serialising it, and a save
would work *the old way*. That is the objection. Merging there takes the whole
of the input layer's risk onto `main` while the save path is still the
three-layer restore, which is the thing the rewrite is for — all of the exposure,
none of the fidelity.

### Stage 4 — merge, and it cannot be taken back

This is the one that is irreversible, and the hazard is data rather than code.
Autosave changes from HTML to the model's serialised form, the `source` key
leaves `DOCUMENT_KEYS`, and the first load after landing has to recognise a
pre-rewrite `content` key and convert it once through Turndown. **That autosave
may be the only copy of unsaved work.** Once `main` has run the conversion, a
`git revert` does not put the storage back, so this merge wants the conversion
tested before it lands and not after.

### What it costs, named rather than hoped away

**Stage 5 is by construction what only real documents turn up** — IME beyond the
accent popup, autocorrect, spellcheck, Safari's quirks. Merging at the end of
stage 4 means `main` carries that tail for one to two weeks. That is the trade
taken deliberately: a rough `main` for a fortnight, against a branch that has
diverged for eight weeks and whose documents conflict every time either side is
edited. The first reason for merging at all is the same reason the tail gets
found — the editor in daily use is the only place stage 5's list comes from.

### This does not reopen D6 or D7

Both say `main` keeps a working editor until parity and nothing ships in
between. Neither merge contradicts it. Stage 1 **replaces nothing** — it is
inert by construction, which is what D7 already distinguishes from sequencing.
Stage 4 **is** parity: that is what reintegration means, and the point where the
sentence stops applying rather than being broken.

## D9. Mandy holds a document, never a page

The question, put on 2026-09-15 after being put several times before without
sticking: the documents people admire now are styled HTML pages, markdown next
to them is a typewriter, and Mandy is a markdown editor by conviction. Is that
building gas cars while the market goes electric? Can Mandy have both — edit
markdown as it does, and also hold, style and edit HTML — and what would it
take?

Settled: **no, and not for want of a plan.** The road is not taken because
every version of it ends with a person editing markup again, one level up from
where D0 found them. This entry says why, road by road, because the question
will be asked again and the answer has to be the same each time.

### A document is what it says; a page is how it looks

That is the whole distinction, and D0 already contains it. A document is
content with structure — headings, paragraphs, lists, tables, emphasis, links.
A page is a document plus a rendering: the colours, the type, the measure, the
layout. HTML conflates them, which is its power as a delivery format and its
disease as a source one, and it is why nobody should be editing it by hand any
more than they should be editing markdown by hand.

Mandy holds the first. It *makes* the second, twice already — the static export
and the editable export are pages, rendered from the document through a
stylesheet — and can make it better-looking than it does today, which is the
half of the question that gets a yes. What it will not do is hold a page as the
thing being edited, because a page's source is markup, and the moment the
editor's document *is* markup the separation D0 exists to enforce has been
given back.

The seam between the two is not a metaphor. [REWRITE.md](REWRITE.md) puts the
document in a model and makes the DOM a view of it, which places design in the
renderer and editing in the model by construction. One model, rendered as many
ways as anyone likes, is cheap. Two models is two products, and nothing
converts between them without loss — which is exactly the "two products in one
skin" unease that kept this question from settling on its own.

### The three roads, and why each one is closed

**Raw HTML inside the document.** The cheapest road and the most tempting: keep
an HTML block as an opaque island — bytes preserved, rendered as itself,
selected whole like an image, never edited inline. It would cost about a week
on the new core and sit on the invisible-block mechanism the reference
definitions already need. It is closed because of what an opaque block *is*: a
block whose only editing surface is its source. The person who needs to change
a word inside it opens the markup, which is the source pane D0 refuses, arrived
at through the back door. `html: false` in the parser is not a setting, it is
D0 in one line, and reopening it for this would be reopening D0. The same
ground that dropped underline and center ([ROADMAP.md](ROADMAP.md)), and it
holds regardless of the sanitiser question, which would have been the
dangerous part on its own.

**Styling on elements.** `{.callout}` on a paragraph, a colour on a span, an
alignment on an image. This is one-off formatting, the thing every word
processor learned to regret: direct formatting is how documents rot, because
nothing about the document says *why* this paragraph is red, so nothing can
keep it red for a reason or make it not-red for one. It is also markup in the
file — a spelling no CommonMark renderer knows and GitHub shows as literal
text — and inventing a friendlier spelling for it is precisely the move D0
names as the one that produced YAML. Closed. The document gets styles, in the
word-processor sense of named ones that apply to a kind of thing; it never gets
formatting that applies to one thing.

**An editable page.** The full road: Mandy as a canvas, the HTML held and
edited with its layout, its cards and its columns, and markdown as one export
among several. Closed as a second product rather than a feature, on three
grounds that do not depend on each other.

- *D1 has no HTML implementation and cannot get one cheaply.* The browser's own
  parser does not round-trip HTML — it requotes attributes, re-encodes
  entities, rewrites whitespace and closes what it finds open — so "a saved
  file gets its own bytes back" would need a source-preserving HTML parser
  Mandy owned outright. That is a fidelity stack the size of the one it has,
  for a second format.
- *The model is the wrong shape on purpose.* A `<div class="grid">` nests
  arbitrarily; a document is a list of blocks. REWRITE.md's first constraint
  rejects the tree-shaped, normalising model for the markdown document because
  normalising destroys what D1 keeps. A page would need exactly that model, so
  a page editor inside Mandy is the rejected design built alongside the chosen
  one, with an engine dependency the rewrite refused as its price of entry.
- *The controls are a different application.* A Format menu says what a thing
  is. A page needs a properties panel that says where it goes and what it
  looks like. That is Webflow with a markdown export, and Webflow exists.

### What is taken instead

**Design lives in the renderer, and the document carries a theme.** A theme is
a set of tokens — a colour per heading level, three fonts, a background, a
measure, each in a light and a dark value — that a document owns and both
exports inline. The human picks, the machine writes the CSS: D0 applied to
design. The ceiling is named rather than hidden: a theme can say what every H2
looks like and cannot say that this one paragraph is red, and anyone who needs
the second needs a different tool. The design is the theme section of
[ROADMAP.md](ROADMAP.md).

**Import is rescue; export is the product.** TODO 6.4 takes HTML in and keeps
markdown from then on — prose and structure, never the page. The way out is
where Mandy earns its place: markdown in, a designed page out, with nobody
having written a line of HTML. That is a position a canvas tool cannot hold,
and it is the one this project has held since D0.

### The gas cars

The analogy fails at the axle, and it is worth saying where. What is driving
HTML-as-canvas is models producing one-off deliverables — reports, pages,
dashboards — and those are terminal outputs, the way PDF and DOCX are terminal:
nobody edits one and sends it back, they edit the source and regenerate. What
is driving markdown is the same models in the other direction, and the
specs, READMEs, skill files and PR descriptions they read and write are more
numerous than a year ago, not fewer. Mandy is the source editor for that loop.
The electric cars are the deliverables; Mandy is not competing with them, it is
upstream of them.

Hedged where it should be: nobody knows whether HTML becomes something people
*author again* rather than regenerate. If it does, the third road matters and
Mandy is not that tool — a conclusion, not a loss, and better reached now than
after half of it is built. The evidence that would reopen this entry is cheap
and should be collected: each time an HTML document arrives for editing, note
whether the change wanted is to the text or to the layout. A run of layout is
the signal. A run of text is this decision confirmed.
