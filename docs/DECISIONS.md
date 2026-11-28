# Decisions

Questions that came up while building Mandy, were argued out, and are settled.
They are here rather than in a task file under [tasks/](../tasks/) because they
are not work waiting to happen, and rather than in [CLAUDE.md](../CLAUDE.md) because that
describes how the code works — this is why it works that way, and what
changing it would cost. Where a decision points forward rather than at the current code,
that part lives in a task file or [ROADMAP.md](ROADMAP.md) instead — D4,
D6, D7 and D8 all point at [REWRITE.md](REWRITE.md), and D9 at the theme section
of [ROADMAP.md](ROADMAP.md).

D0 is the exception to that description: it is not a question that was argued
out but the position the rest of them follow from. It is numbered zero because
it was written last and belongs first.

**Since 2026-11-14 this file is compiled below its marker line.** D0–D9 above
it were written here by hand and stay as they are, numbers and all. A decision
taken since is written in the task file of the work that made it, under
`## Decisions`, and `deno task record` (`scripts/compile-record.mjs`) numbers it
and copies it below the marker — so nothing here is edited by hand any more,
and a decision is reopened by a new entry carrying `Supersedes: D<n>`, never by
changing the old one. [tasks/README.md](../tasks/README.md) has the format.

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

<!-- Compiled from tasks/ by scripts/compile-record.mjs. Do not edit below this line by hand. -->

## D10 · 2026-11-14 · Strict staging, with the end-of-turn check reporting only

**Decision** — The commit is the scene: `git commit` refuses an incomplete one,
through the `PreToolUse` hook and `.githooks/pre-commit`. The `Stop` hook
reports what the tree is missing and never sends a turn back. Chosen
2026-10-19 and recorded here, when the procedure first asked for it by name.
**Rejected** — Adapted staging, where the pull request is the scene: this is
one developer, and `rewrite` reaches `main` by merge (D8), not through pull
requests. Strict's refusing `Stop` hook: a turn here often stops mid-change on
purpose, to argue a design before writing it or to hand over a browser recipe,
and a hook that sent those turns back would be fought rather than followed.
**Why** — The commit already is a complete unit here, so strict costs nothing at
the commit. At the end of a turn the scene is often not meant to be finished yet.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D11 · 2026-11-14 · CHANGELOG.md stays hand-written

**Decision** — One dated entry per commit, in prose, with the hash backfilled by
the next commit. It counts as a change's doc line and is not a protected file.
The procedure's changelog compiler (its Appendix F), its marker and the release
check are not installed.
**Rejected** — Compiling CHANGELOG.md from the task records at release.
**Why** — That compiler stops several developers colliding in one file at
release. This is one developer with no tags and no release schedule, and the
hand-written entries carry the reasoning a compiled one would not. Revisit if
either changes. First deferred 2026-10-19.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D12 · 2026-11-14 · The record compiler reads the hand-written D0–D9 numbers

**Decision** — `scripts/compile-record.mjs` is the procedure's Appendix K, with
its number search accepting `D9.` as well as `D9 ·`. D0–D9 stay where and as
they are, above the marker, and the first compiled decision is D10.
**Rejected** — The appendix verbatim. It recognises only `D<n> ·`, would see no
number above the marker, and would number the next decision D1, which collides
with an entry cited across CLAUDE.md and the code.
**Rejected** — Renumbering or retitling D0–D9 to the compiled form. That edits
ten settled entries to suit a regular expression.
**Why** — The procedure says the old entries keep their numbers. This is what
it takes for the compiler to see them.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D13 · 2026-11-14 · A task is done when its last record says Status: done

**Decision** — The compiled plan reads three states: no `## What was done` is
open, sections without the closing line are in progress, and a last section
carrying a `Status: done` line is done. The three tasks already closed (1.6, 2.1
and export-equations) each got a short appended section carrying that line, and
so did this one.
**Rejected** — The appendix's rule that any `## What was done` section means
done. Seven task files have one, and 3.1 has seventeen and is not finished, so
the plan would have reported the rewrite as done.
**Rejected** — Reading "closed" or "done" out of the prose. Wording that cannot
be checked mechanically drifts.
**Why** — A task here gathers one section per landing, which tasks/README.md
already said. Done has to be a line someone writes on purpose.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D14 · 2026-11-14 · The check script stays Deno-native and strict-only

**Decision** — `.claude/hooks/check-unit.mjs` keeps its own Deno form and its
two modes (`--staged` refuses, `--tree` reports). It gains the procedure's new
checks: the compiled record current and staged, its hand-written head
untouched, a compiled decision never removed, a `Reviewed by:` line on every
record a commit adds, acceptance boxes that are checks rather than outcomes,
the shape of review items, and a tombstone that may be deleted though not
edited. Its tests are `.claude/hooks/check-unit.test.mjs` (`deno task
hooks:test`), cut from the procedure's Appendix J to this staging.
**Rejected** — The procedure's Appendix A script verbatim. It is written for
Node, and under Deno its `node:child_process` calls need `--allow-env`, which
is how the first attempt's hook silently failed on every turn in October. Its
`--pr` gate, release check and adapted mode serve nothing in this staging.
**Why** — Same rules, in the runtime the repo already uses, without the parts
this staging has no use for.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D15 · 2026-11-14 · CI checks the compiled record; no pull-request gate

**Decision** — `.github/workflows/ci.yml` runs `compile-record.mjs --check`, so a
commit that reached a push without the hook (`--no-verify`, a clone without
`deno task hooks`) is caught there.
**Rejected** — The procedure's full pull-request gate (`check-unit.mjs --pr`):
the check script has no `--pr` mode here, see the decision above, and in strict
staging the gate is an optional backstop.
**Why** — The cheap half of the backstop catches the one thing a bypassed hook
would let through silently, a record out of step with its task files. A missing
doc line or task record shows up in review of the commit itself.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D16 · 2026-11-14 · docs/SPEC.md is short and points at CLAUDE.md

**Decision** — `docs/SPEC.md` holds why Mandy exists, what 1.0 is and is not, a
two-paragraph architecture and the stack table. For everything about how the
code works it points to CLAUDE.md's Architecture section and docs/REWRITE.md.
**Rejected** — A full spec that restates the architecture.
**Why** — CLAUDE.md already records the how at length, with the why for each
mechanism. A second copy would drift, and a fresh session needs the what in one
page and a pointer to the rest.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D17 · 2026-11-14 · No developer's guide

**Decision** — `docs/working-on-a-task.md` is not written. CLAUDE.md's Unities
section does not point to one.
**Rejected** — Writing the guide the procedure's 4.8 describes.
**Why** — It is for people who receive tasks, and there is one developer, who
also wrote the rules. tasks/README.md is the format and CLAUDE.md is the working
practice. Write the guide the day a second person works here.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D18 · 2026-11-14 · A paste writes a reference link inline

**Decision** — The `referenceLink` Turndown rule moves to `front/legacy-storage.js` with the old save path, and fires only while stored HTML is being converted with its own source. A pasted or dropped fragment, and the table of contents, are converted without it, so a link carrying a `data-ref-label` stamp comes out inline. The `mermaid` rule moves and is gated the same way.
**Rejected** — Keeping `referenceLink` on the shared Turndown service, so a link copied within a document would paste back in its reference form.
**Why** — A fragment is parsed by `modelParse` with no reference definitions, so `[text][label]` came back as literal brackets rather than a link. The inline form always resolves. The model's own emitter already chooses the reference form for an edited link when the document still defines the label, so nothing about a document's own references is lost.

Source: [tasks/3.1-editing-core-rewrite.md](../tasks/3.1-editing-core-rewrite.md)

## D19 · 2026-11-14 · D4 is retired: no execCommand edits the document

**Decision** — D4 ("execCommand stays, and Mandy normalises after it") no longer describes anything that runs. The editing core is the model; every edit is a model command made from a cancelled `beforeinput`, and the one `execCommand` left in `front/` is the Edit menu's `copy`, which edits nothing. D4 stays in docs/DECISIONS.md as written, as the record of why the old core was built that way; this entry is what marks it retired.
**Rejected** — Editing D4's text to say it is retired, which the record's rule forbids for the hand-written D0–D9; and deleting it, which loses the reasoning the rewrite answered.
**Why** — D4's own text said it would be "marked retired, not deleted, when 3.1 ships", and the compiled record's only way to reverse a decision is a new one that names it. execCommand fires `input` and never `beforeinput`, so it cannot coexist with a core that owns every mutation.
Supersedes: D4

Source: [tasks/3.1-editing-core-rewrite.md](../tasks/3.1-editing-core-rewrite.md)

## D20 · 2026-11-19 · An empty paragraph is written as a blank line

**Decision** — An empty paragraph between two others is saved as one more
blank line, and extra blank lines in a file are read back as empty
paragraphs, so a gap typed with Enter survives save, reopen and copy.
**Rejected** — Drawing an empty paragraph with no height or with a marker, so
the screen never shows what the file cannot keep; and leaving the behaviour
alone while making Shift+Enter easier to discover.
**Why** — The user chose it on 2026-11-19. It is the only option of the three where the gap the user typed is the
gap they get, and the file still reads correctly as plain text. The cost is
that other markdown renderers collapse the gap, and that existing files with
stray double blank lines will show them.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D21 · 2026-11-19 · Claude Code is the only agent here

**Decision** — Nobody works in this repository with another agent, so the
procedure's 4.10 is not installed: the instructions stay in CLAUDE.md, and
there is no `AGENTS.md`, no `.codex/hooks.json` and no Codex reader. The check
script's `doc` role names `AGENTS.md` anyway, as the procedure's does, so the
file counts as a doc line the day it exists.
**Rejected** — Installing 4.10: moving CLAUDE.md to `AGENTS.md` behind a
one-line import and adding the Codex bindings, which nobody here would run and
nobody could verify.
**Why** — Asked once, as the procedure says for a repository adopted before
0.5.0, and answered by Erez on 2026-11-19. Revisit the day a second agent
works here.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D22 · 2026-11-23 · The planted scripts are the plugin's, unchanged

**Decision** — From 0.6.8 the gate, its tests and both compilers are the
plugin's files, copied byte for byte and checked against
`.claude/hooks/unities.manifest.json`. Mandy's own values are in
`.claude/hooks/unities.json`. A change Mandy needs from a script is asked of
the plugin as a task. The gate's tests run under Node (`deno task hooks:test`
is `node --test`), because every case spawns `node` whatever runs the suite.
**Rejected** — Keeping Mandy's own Deno-native copy with the new checks cut in
by hand, as D14 did. 0.6.8's gate refuses a planted copy that differs from the
manifest. The plugin's scripts do run under Deno, through the `run` value, but
not with the procedure's Deno line: measured here, it fails every `git` call, so
the hooks grant `--allow-run=git,deno,/bin/sh` and full `--allow-env` (the third
ask in tasks/unities-plugin-asks.md). That is the `--allow-env` failure D14 was
written against, met again and fixed in the invocation, not in the script.
**Why** — One copy of the rules, kept where they are tested. The D-number
change D12 made is no longer needed: D10 onwards are compiled, so the
compiler numbers from them and never has to read D0–D9.
Supersedes: D12, D14

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D23 · 2026-11-23 · The end-of-turn check sends a turn back once

**Decision** — Strict's `Stop` binding is the plugin's `--branch`: a turn that
ends with the uncommitted tree missing something is sent back once, and the
second pass ends with a note to Erez. A turn that stops mid-change on purpose
says so and ends on that second pass. Asking the plugin for a strict `Stop` that
only reports is tasks/unities-plugin-asks.md. The rest of D10 stands:
the commit is the scene, and the commit refuses.
**Rejected** — Pointing `Stop` at the adapted mode with `UNITIES_SCENE=pr` so
that it only advises. In adapted, `--branch` measures from the merge base with
`main`, and this repo works on `main`, so it would most likely report nothing.
Also rejected: leaving `Stop` out, which loses the check entirely.
**Why** — Chosen by Erez on 2026-11-23 from three options. Of the two that
are available now, one extra pass on a deliberate stop costs less than an
end-of-turn check that never fires.
Supersedes: D10

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D24 · 2026-11-23 · Work a task still owes is an open box

**Decision** — The plugin's done rule holds: a task with a `## What was done`
section and no open box is done, and one with an open box is
`recorded, N boxes open`. The four tasks with records that are not finished —
1.1, 1.12, 3.1 and 6.8 — each gained a dated **Acceptance** block at the end of
their Context, with a box for each piece still owed. The `Status: done` lines
already written stay where they are and no longer decide anything.
**Rejected** — Asking the plugin for a configurable done marker and leaving the
plan wrong until it ships. Under 0.6.8 the plan would read the four as done,
the rewrite among them.
**Why** — Chosen by Erez on 2026-11-23. A box names what is left. A hidden
line names only that someone thought it was finished.
Supersedes: D13

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D25 · 2026-11-23 · CHANGELOG.md stays hand-written, through the configuration

**Decision** — D11 stands under 0.6.8. In `.claude/hooks/unities.json`, `shared`
matches nothing, `CHANGELOG.md` is in the `doc` role and `releaseFiles` matches
nothing. `scripts/compile-changelog.mjs` is copied in because the manifest lists
it, but no task runs it and nothing calls it.
**Rejected** — Leaving it out. The gate would report it missing on the first
commit that touches a planted script.
**Why** — D11's reasons have not changed: one developer, no tags, no releases.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D26 · 2026-11-23 · No note for source changed without a test

**Decision** — The old gate's note when source changed with no test change is
gone, and nothing replaces it. `required` stays doc and task, so a missing test
is neither refused nor mentioned. CLAUDE.md's rule that a change no suite can
reach gives its browser recipe in the CHANGELOG entry still stands. It is now
held by the reader rather than by a note.
**Rejected** — Adding `test` to `required`. Many changes here have no suite
that can reach them, and a refusal would be answered with an empty test.
**Rejected** — Asking the plugin for a "notes" role. The cold reader already
asks what a change did that nothing records.
**Why** — The plugin's gate has no advisory output, and the note never refused
anything.

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D27 · 2026-11-24 · Reload all is Reload, once per tab, on screen

**Decision** — `reloadAllTabs()` switches to each tab with a file and calls the
existing `reloadFile()`, then switches back to the tab it started on. Cancel on
an edited tab keeps that tab and the run goes on.
**Rejected** — reading each background tab's file straight into its parked
bundle or storage without switching to it, and stopping the whole run on the
first Cancel.
**Why** — tabs do not act on each other's state. `reloadFile` and its guard only
ever ask about the document on screen, so switching first is the only way to
reuse them unchanged. This is the same reason `requestCloseTab` switches before
it asks. Cancel in that dialog means "keep this document", and when one tab of
five is edited, keeping it is no reason to leave the other four stale.

Source: [tasks/4.14-reload-all.md](../tasks/4.14-reload-all.md)

## D28 · 2026-11-24 · An edited tab lifts the cover for its question

**Decision** — Reload all runs under an opaque `busy()` cover, and an edited tab
takes the cover down for Reload's question and puts it back up after the
answer.
**Rejected** — asking every edited tab's question up front, in a pass over the
tabs before the cover goes up; and a see-through cover over the switching.
**Why** — the question is about a document you have to be able to see, and
lifting the cover is how most apps handle it (Erez's call). Asking up front
would mean a second pass over the tabs before the real one. A see-through cover
would still show the switching it is there to hide.

Source: [tasks/4.14-reload-all.md](../tasks/4.14-reload-all.md)

## D29 · 2026-11-19 · A copy keeps the gap as text the reader sees, not as markdown

**Decision** — Ctrl/Cmd+C and Edit → Copy go on writing the plain text a
reader sees, and an empty paragraph between two others at the top level is one
more blank line in it — so a run of plain paragraphs copies as
the file's bytes less the final newline, for an LF file. In the HTML such a paragraph keeps a `<br>`, the spelling Word
and Google Docs give an empty paragraph, so a receiving application draws it.
The same reach as the file's rule, and asked of the model as the file asks
it — a block is written when it emits bytes — so not at the ends of the copy,
not inside a container. The plain text is built by marking each such paragraph
with a private-use character the copy does not already hold and replacing the
marker and the two newlines after it with one newline once `innerText` has been
measured.
**Rejected** — Making the plain text the model's markdown for the selection:
it would put `**` and `#` into every copy of formatted text pasted into a plain
field, which is what Export → Copy markdown is for, and a selection starting
mid-block has no markdown of its own to cut from. And writing the plain text
from a `<br>` in the empty paragraph: measured 2026-11-19, `innerText` gives
`<p>a</p><p><br></p><p>b</p>` five newlines in Blink and Gecko and four in
WebKit, against two for the same paragraphs with no gap, so no engine gives
the one extra line and two of them disagree.
**Why** — A copy is for pasting somewhere else, and plain text that is the
reader's text is what every editor people arrive from writes. The marker makes
the answer the same in all three engines.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D30 · 2026-11-19 · A gap read back from a file holds an Enter's separator

**Decision** — An empty paragraph `modelParse` makes of an extra blank line
carries a line end and then that line as its separator, the shape an Enter's
empty paragraph has, so the top level holds one byte more than the file at
each gap and the joiner writes it back without.
**Rejected** — Holding the blank line alone, which keeps the top level an exact
tiling of the file, and converting it to an Enter's shape on the first edit.
Built first and probed: every edit path that takes a block's separator over —
a split, a removal, an insertion after it — reads it before any touch, so Enter
in the gap wrote one blank line too many and a removal left the block before it
with no blank line under it, and each path would have needed teaching.
**Why** — With an Enter's shape a parsed gap is an empty paragraph made by
Enter in every respect but its `source`, so no edit needs to know where it came
from; nothing reads the top level as a concatenation, only through the joiner,
and a container's children, where a gap never is, still tile it exactly.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D31 · 2026-11-19 · A list beside a gap joins across it

**Decision** — Making a paragraph a list item beside a list of the same kind,
with only gaps between them, joins the two lists and takes the gaps out.
**Rejected** — Refusing the command and keeping the gap; and giving the new
list a different bullet character, which markdown reads as a separate list, so
the gap survives at the cost of mixed bullets.
**Why** — The user chose it on 2026-11-19. Markdown keeps two lists of a kind
apart only with something between them that is not a blank line, so the file
would reopen as one list without the gap whatever the screen drew; joining is
what the command did before a file's gaps were read back.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D32 · 2026-11-19 · A list or a quote over a selection drops the gaps inside it

**Decision** — Bulleted list, Numbered list and Blockquote over a selection
covering gaps take the empty paragraphs between two of the formatted blocks
out of the document, and leave the ones at either edge of the selection where
they are; a selection holding nothing but gaps is refused as before.
**Rejected** — Refusing the command, with a notice saying the gap is why.
**Why** — The user chose it on 2026-11-19. A gap cannot be a list item, and
one inside a list or a quote is not written to the file, so formatting around
it would draw what the file cannot keep; until stage 3 the same selection
formatted, because the file's gap was not a block to be in the way.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D33 · 2026-11-19 · A file's line ending is the document's, sniffed once

**Decision** — `modelParse` records the commonest line ending in the file as
the document's and holds the text as LF; `modelSerialise` writes every line
ending as the document's. A uniformly CRLF file comes back byte for byte and
an edit in it writes only CRLF. A file whose line endings are mixed is written
wholly in its commonest one on its first save, edited or not.
**Rejected** — Keeping each block's bytes as the file had them and teaching
every place that composes bytes to use the document's ending, and every affix
check to ignore a trailing `\r`: about eighty sites, each a place to forget,
and the model's bytes and the parser's would still disagree. Recording each
line's own ending so a mixed file keeps its mix: a line's ending would have to
follow it through every split, merge and paste, for a file that is almost
always an accident.
**Why** — A line ending is whitespace nobody can see, the category D3 already
narrows D1 for; a mixed file is the damage D3 describes, not a spelling an
author chose. A uniform file is the case worth keeping exactly, because
rewriting every line of it would be the whole-file diff D1 exists to prevent,
and that is what this keeps.

Source: [tasks/1.13-crlf-files.md](../tasks/1.13-crlf-files.md)

## D34 · 2026-11-19 · The sniff normalises line endings itself

**Decision** — `sniffMarkdownStyle` turns `\r\n` and a lone `\r` into `\n`
before it reads, so whatever hands it a file gets the same answer for any
line ending.
**Rejected** — Normalising in `adoptMarkdownStyle` in `app.js`, the one caller
that hands it a file: it would fix today's caller and leave the function
wrong for the next one. Having `modelParse` hand its LF text to the sniff:
it ties the style module to the model's door for one `replace`.
**Why** — The sniff's answer is a fact about the file's conventions, and a
line ending is not one of them (D33); a pure function that is right for every
input is the cheapest place to keep that true.

Source: [tasks/1.14-crlf-wrap-width.md](../tasks/1.14-crlf-wrap-width.md)

## D35 · 2026-11-20 · A gap inside a quote is kept

**Decision** — An empty paragraph between two blocks of a quote is saved as one
more `>` line, and a run of extra `>` lines in a file is read back as that many
empty paragraphs, as at the top level.
**Rejected** — Leaving a quote's gap drawn and not saved, recorded as a limit.
**Why** — The user chose it on 2026-11-20. It is the promise D20 made, kept one
level in; and unlike a list, a quote is where a verse is quoted.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D36 · 2026-11-20 · A list holds no gap

**Decision** — A list item holds no gap: Enter in one starts a new item as
before, an extra blank line inside an item reads as nothing, and a gap pasted
or dropped into an item is dropped.
**Rejected** — Showing and saving an extra blank line inside an item.
**Why** — The user chose it on 2026-11-20. A gap cannot be typed in an item,
since Enter there starts a new one, and an extra blank line in a list means
nothing to any other markdown reader, so it would be a gap only Mandy sees.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D37 · 2026-11-20 · The exports show a gap

**Decision** — The HTML, PDF and Word exports draw a gap as a blank line,
wherever the file writes one; an empty paragraph the file does not write is
not drawn.
**Rejected** — Drawing the document as any markdown viewer would, with no gap.
**Why** — The user chose it on 2026-11-20. An export is the document as Mandy
shows it, and a song exported to PDF without its verse gaps is the bug this
task began with, one step further on.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D38 · 2026-11-20 · A paste keeps the gaps copied out of Mandy

**Decision** — A paste keeps a gap that a copy out of Mandy marked as one, and
goes on dropping the empty paragraphs any other application leaves.
**Rejected** — Keeping every empty paragraph a paste brings, Word's and Google
Docs' blank lines included; and keeping none, with Paste markdown the way to
bring gaps in.
**Why** — The user chose it on 2026-11-20. A copy and a paste within Mandy
should give back what was copied, while the blank lines another application
puts in its HTML are the ghost lines `sanitisePastedHtml` exists to remove.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D39 · 2026-11-20 · Only a block that renders bare keeps its edge whitespace

**Decision** — The rendering trim keeps a block's own edge whitespace only for
a block whose opening token is hidden, a tight item's paragraph, and trims
every other rendering whole. A block with an inline tree and no opening token
to ask is treated as bare too, keeping the older and more careful answer; none
of the oracle's 1,093 inline-bearing leaves takes that branch.
**Rejected** — Leaving the trim as it was and removing the whitespace text
nodes beside a block's element after it is built; and asking whether the
rendering ends in a closing tag.
**Why** — The first cleans up after a wrong answer rather than giving the right
one, and would have to tell a paragraph's own text from markdown-it's line end
again. The second cannot tell `a <strong>b</strong> `, a bare paragraph whose
trailing space is content, from `<p>a </p>`. Whether the block has a tag of its
own is the one fact that decides it, and the token says so.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D40 · 2026-11-21 · Blockquote keeps the gaps inside a selection

Supersedes: D32

**Decision** — Blockquote over a selection keeps the gaps between the blocks it
wraps or unwraps, and leaves the ones at the selection's edges out of it. The
two lists go on dropping the gaps between, as D32 decided for them.
**Rejected** — Dropping them, as D32 did for all three.
**Why** — The user chose it on 2026-11-21. D32 dropped a quote's gaps because
one inside a quote was not written; since a quote's gap is kept (the decision
above), that reason is gone for a quote and stands for a list.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D41 · 2026-11-21 · A split drops a line break at its cut, but not one opening the second half

**Decision** — Enter drops a soft break at the cut from either half, and a hard
break from the end of the first half, and keeps a hard break that opens the
second half.
**Rejected** — Keeping every break at the cut, as before; and dropping every
one, hard breaks opening the second half included.
**Why** — A paragraph cannot end in a break anyone sees: kept, the half ending
in one writes an empty last line, which is a blank line in the file and reopens
as a gap the screen never showed. A soft break opening a paragraph is nothing
either. A hard break opening one is a blank line the reader sees, and a
paragraph may open with one, so dropping it would delete what is on screen.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D42 · 2026-11-21 · Word writes a quote of paragraphs as one paragraph each

**Decision** — The Word export writes a quote as one Word paragraph per child,
each with the quote's indent and border, a gap among them as an empty one and a
nested quote the same way one indent further in; a child that is not a
paragraph — a heading, code, a list — is a paragraph of its text, as the whole
quote used to be.
**Rejected** — Keeping a quote as one Word paragraph and drawing its gap as a
line break inside it.
**Why** — A quote drawn as one paragraph runs its paragraphs together, which
was already wrong before a gap was kept, and a break inside it is two lines
tall where a gap at the top level is one; one Word paragraph per child gives
both the same spacing as the rest of the document.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D43 · 2026-11-21 · A pasted gap is marked with a NUL on its way through Turndown

**Decision** — The `mandyGap` Turndown rule writes a marked gap as a line
holding `\u0000G`, which `htmlFragmentToMarkdown` then removes, leaving the
extra blank line.
**Rejected** — A private-use character such as U+E000, chosen to be absent from
the fragment; and a bare blank line.
**Why** — Measured 2026-11-21: Turndown drops U+E000 from a rule's output, so the
mark vanished before it could be removed, and it collapses blank lines between
blocks to one, so a bare blank line would be lost the same way. A NUL survives
Turndown, as the table rules' marks already rely on, and parsed HTML cannot hold
one, so it can only ever be the mark.

Source: [tasks/1.12-blank-lines-kept.md](../tasks/1.12-blank-lines-kept.md)

## D44 · 2026-11-28 · The end-of-turn check only reports, as the plugin's does

**Decision** — From 0.7.0 the plugin's strict `Stop` tells the agent what the
uncommitted tree is still missing and never refuses the turn. Mandy takes it as
it comes, with no value set: a scene ends at its commit, a turn may end to ask,
and a change that is abandoned is reverted. This is the 2026-11-14 decision
again, now held by the plugin's gate and not by a mode of Mandy's own.
**Rejected** — Staying on 0.6.8 to keep the turn that is sent back once. D23
chose that only because reporting was not on offer, and said so.
**Why** — It is the first of the three asks in tasks/unities-plugin-asks.md,
answered. The commit still refuses, through the `PreToolUse` hook and
`.githooks/pre-commit`.
Supersedes: D23

Source: [tasks/adopt-unities.md](../tasks/adopt-unities.md)

## D45 · 2026-11-28 · A pasted quote's chain is composed, not parsed again

**Decision** — `modelAdoptBlocks` keeps the chain a block inside a pasted quote
recorded and puts the landing quote's prefix and the landing column in front
of each line of it.
**Rejected** — Writing the pasted quote as text at its landing place and
parsing it again, the way Format → Blockquote wraps and unwraps.
**Why** — The toggle parses a top-level block it already holds; a paste would
have to rebuild the landing block's containers as text to parse inside them,
before the split and the merges the insertion still has to make. The affixes a
pasted block recorded are right for its own bytes and only move, which the
sweep over torture.md checks byte for byte.

Source: [tasks/1.15-pasted-quote.md](../tasks/1.15-pasted-quote.md)

## D46 · 2026-11-28 · The landing column is the emitter's

**Decision** — When the landing block's chain holds a `>`, the column pasted
items, fences and chains move by is read through `modelItemAffix`, which stops
at a quote. When it holds none, it is the nearest item's, as before.
**Rejected** — `modelItemAncestor` everywhere, as before, which finds an item
above a quote too. `modelItemAffix` everywhere, which the first draft did.
**Why** — A landing block in a quote inside an item has the item's indent in
its chain already. Adding it again wrote `  >   - x` for a pasted list and
would have written `  >   > q` for a pasted quote. This also moves what Format
→ Code writes for a code block made in such a quote, to `  > ` and the fence.
The two landings under "Found on the way" whose chain was never recorded have
nothing carrying the indent, and the reader found that `modelItemAffix` alone
moved a list or fence pasted there, and a code block made there, out of the
list; they are wrong either way and keep the bytes they had.

Source: [tasks/1.15-pasted-quote.md](../tasks/1.15-pasted-quote.md)

## D47 · 2026-11-28 · Blank lines inside a pasted container take the landing quote

**Decision** — A blank line between two blocks of a pasted container is written
as the landing quote's bare `>`, and a `>` line there is moved as a chain is.
**Rejected** — Leaving the separators as parsed and fixing only the chain.
**Why** — A pasted item holding a quote, landing in a quote, would still end
the landing quote at its blank line, so the chain fix alone leaves its own
case broken. The same line fixes a loose list pasted into a quote, which had
the fault with no pasted quote in it.

Source: [tasks/1.15-pasted-quote.md](../tasks/1.15-pasted-quote.md)

## D48 · 2026-11-28 · A bare `>` line is written without a space after it

**Decision** — On adoption a line that is nothing but a quote chain loses its
trailing whitespace, in a gap block's bytes and in a separator.
**Rejected** — Keeping the pasted bytes, which is what a fence gets.
**Why** — Turndown writes every blank line of a quote as `> `. Before this
task those lines were the only ones of a pasted quote to keep their `>`; with
the quote kept they would put trailing whitespace on each. The emitter already
writes an empty quoted line as `>`, and D3 leaves invisible whitespace out of
fidelity.

Source: [tasks/1.15-pasted-quote.md](../tasks/1.15-pasted-quote.md)

## D49 · 2026-11-28 · A lazy line is not indented under a bullet

**Decision** — A line of a pasted quote that recorded no `>` gets the landing
quote's prefix and nothing else, so under a bullet it is written flush left.
**Rejected** — Giving it the item's indent, which is what its bytes would be
if the quote had been typed there.
**Why** — The emitter takes no item affix inside a quote, so an indent on that
line would have to live in the chain as a prefix with no `>` in it, which
`modelBlankSeparator` and the gap joiner both read as a line outside the quote.
Flush left it is still a lazy continuation and parses to the same quote.

Source: [tasks/1.15-pasted-quote.md](../tasks/1.15-pasted-quote.md)
