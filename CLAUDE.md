# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This branch

`rewrite` carries TODO 3.1, the editing-core rewrite, and **the rewrite has
replaced the core.** The document is a markdown model ([front/model.js](front/model.js)),
the DOM is rendered from it, and the input layer ([front/model-input.js](front/model-input.js))
cancels every `beforeinput` and makes the edit itself. There is no
`execCommand` editing, no flag and no second core: the old one was deleted in
stage 4's slice 5. The model writes the file, and the autosave holds the
markdown a save would write. The sections below describe that.

[docs/REWRITE.md](docs/REWRITE.md) is the design, the plan, and — in its "Where
each stage stands" section — the running status, one line per stage, updated
as part of each landing. Read it before starting anything on the core. D6 in
[docs/DECISIONS.md](docs/DECISIONS.md) is why this is 1.0 work.

**It goes back to `main` twice** — at the end of stage 1 and at the end of
stage 4, per **D8**. The first happened at `5322693`, 2026-09-18. Stage 4's is
the one left, and it is the irreversible one, because the first load after it
converts this browser's old HTML autosave to markdown
([front/legacy-storage.js](front/legacy-storage.js)). The reminder is on stage
4's line in REWRITE.md.

**D7 still governs how `main`'s code is treated from here.** A change that
fixes something or makes a workaround unnecessary is the work; what must not
happen is carrying the old core's compromises into the new one.

Two things on the branch are not the editor: [spike/block-model.html](spike/block-model.html),
stage 0's throwaway gate — passed by hand in Blink, Gecko and WebKit on
2026-09-10 and not the first draft of anything in `front/` — and
`front/legacy-storage.js`, which converts the old autosave once and holds the
old core's save path for that alone. It is deleted when stage 5 closes.

## Commands

```bash
npm run serve   # deno task start — server on http://localhost:9130
npm run dev     # same, with --watch auto-restart
npm test        # deno run --allow-read tests/run.mjs
npm run test:browser  # Playwright: the app under Chromium, Firefox and WebKit — see Tests
```

Type-check the server: `cd server && deno task check`.
`MANDY_PORT` overrides the port. `pm2 start ecosystem.config.cjs` runs it supervised.

There is no linter and no build step, and nothing is installed at the root —
`package.json` exists only to hold the scripts (the one `node_modules` in the
tree is [tests/browser/](tests/browser/)'s, with Playwright in it and nothing
else; the Tests section says why), and Deno fetches what it needs itself: Hono for
the server, and markdown-it for the model suite, both pinned by `npm:` specifier
(`server/deno.json` and the root `deno.json`). The root config also sets
`nodeModulesDir: none`, without which `package.json`'s presence sends Deno
looking for a `node_modules` this project does not have. So `npm test` wants the
network on its first run and nothing after it, since Deno caches what it fetched.
Flag it before adding any dependency, npm or Deno.

### Tests

[tests/](tests/) has no framework. Each suite loads the real `front/` sources
into a scope with a hand-rolled DOM stub ([tests/dom.mjs](tests/dom.mjs)) and
drives them, so a suite breaks when the source it names changes. Run one suite
by importing it directly; `tests/run.mjs` runs them all.

One suite is the exception to both halves of that: `model` needs no stub and
does need a dependency. See its entry below.

**No suite reads a living project file as test data, and no metafile quotes a
number a suite computes.** Both rules were broken by the same arrangement and
were fixed together on 2026-09-16 (D8's sibling problem, written up in the
`model` entry below). Test data belongs in [tests/fixtures/](tests/fixtures/),
where it can be edited to cover a construct — a living document cannot be, since
nobody is going to put a quote inside a list in `README.md` for a test, so
coverage ends up hostage to what the prose happens to need to say. And a count
belongs in the check label that computes it and nowhere else: while `CLAUDE.md`
and `docs/REWRITE.md` both described the suite *and* were read by it, editing
either moved the numbers quoted in both, and refreshing those moved them again.
A figure written in prose is one that will be wrong later; the labels are the
report.

They cover the invariants that fail *silently* rather than loudly:

- **toolbar** — every item a variant renders has a handler in a script that
  variant's bundle ships. Both bundle lists are parsed out of `index.html` and
  `html-export.js`, so the test cannot drift from the real ones. Also drives the
  menus the way a browser would — toolbar listener first, then the document's,
  as the event bubbles — plus arrow-key navigation, hover-to-switch, and
  `visibleItems` directly, since the real spec strands no separator today.
- **format-bar** — formatting never replaces `#editor`. Regression cover for a
  bug that detached the editable root and left the app looking unstyled and
  dead until reload. `applyFormat` is a router now: every format reaches its
  model command (stubbed here, since what the command does to a document is the
  `model` and `model-input` suites' business), a heading inside a list item is
  refused before the model is asked, and a bundle without the input layer does
  nothing rather than editing the DOM. Also where the bar sits, the caret bar,
  and the active states read off the whole selection.
- **self-reproduce** — an exported document re-exports without touching the
  network, and hands its successor byte-identical CSS and JS.
- **static-export** / **file-path** — the document-only export's contents, and
  everything the app remembers about the file it has open: the path, the last
  browsed directory, the edited marker, and the mtime baseline that Reload and
  the disk-changed marker measure against. It drives a fake disk, so a reload,
  an outside edit and a save over one all have a real file to disagree with.
  It also drives the unsaved-work guard, where the property under test is not
  that a dialog appears but that every answer except Discard leaves the document
  where it was — including a Save the user backed out of halfway.
- **export-variant** — `app.js` booted as an exported document rather than as
  the app, which nothing did until 2026-09-22: `data-exported` appeared in one
  other place in `tests/`, and that one loads `toolbar.js` alone. So the bundle
  here is the export's — no `file-api.js`, no `tabs.js` — and what it covers is
  the code that exists only for that configuration. The keydown gates, both
  ways: Ctrl+S downloads a blob and Ctrl+O opens the file picker where the app
  would save and browse, Ctrl+Shift+P is bound to nothing because PDF is
  app-only, and Ctrl+K is the control that works in both. New, which here falls
  through `typeof confirmDiscard === "function"` to app.js's own plain question
  and resets in place. And the startup branch that keeps the *embedded*
  document and ignores this browser's autosave — getting that backwards shows
  the reader a document of their own in place of the one they were sent. It
  fires `window` `load` rather than skipping it, since all of that startup is
  inside the listener. It cannot be a flag on `file-path`'s `boot()`: that
  harness's tail returns `currentFilePath` and `fileDescriptor()`, so a bundle
  without `file-api.js` throws before a check runs. The two suites meet at one
  place instead — `file-path` checks that Ctrl+S in the app does *not* also
  download, which is the same gate from the other side.
- **latex** — that `stampLatexSource` copies each equation's TeX onto its
  container and makes it uneditable, never overwrites a stamp and never stamps
  MathJax's own nested copy; the render cache that puts a typeset equation back
  without a frame of TeX; the PDF and Word exports' pictures of equations; and
  the `mathjax` and `modelFiller` Turndown rules.
- **links** — Ctrl/Cmd+click and its scheme allowlist, the anchor slugs a table
  of contents needs (and why `slugifyTitle` is not one), the hint as a CSS
  variable rather than a `title` Turndown would serialise, the address the link
  dialog's answer becomes, and that a pasted reference link is written inline
  (D18).
- **outline** — the depth algorithm, the inline allowlist, and the shape of the
  list Insert TOC writes. The depths are a pure function over heading levels, so
  the pathological document is a table rather than a fixture; the list shape is
  there because a sublist placed beside its parent `<li>` instead of inside it
  serialises to a flat list, into the user's file, looking fine on screen.
- **notify** — that no `front/` file has slipped back to `alert()` or
  `confirm()`, that every bundle holding a module which calls `notify`/`ask`
  also ships `notify.js` ahead of it, and that dismissing a dialog does not
  resolve to the same thing as agreeing with it. The source scan is the half
  that matters: an `alert()` looks fine from inside the app right up until the
  user has silenced dialogs and their save failure disappears. **Since stage 4's
  slice 5 it also scans for `execCommand`**, and allows exactly one call — the
  Edit menu's Copy in `model-input.js`, which edits nothing. Any other call
  would be the engine editing behind the model's back.
- **undo** — the coalescing rules, the redo branch, that history does not
  survive `undoReset()`, that `undoPark()`/`undoAdopt()` carry it across a tab
  switch whole rather than merging two tabs' stacks, and the two seams where a
  state is captured as a model fork and applied as one, caret and all. The stack
  checks run on a model stand-in that mirrors the editor; the seam checks on a
  block-shaped one. It also counts `editor.innerHTML` assignments, because the
  way this regresses is not a broken stack but a new assignment the stack never
  hears about: **zero in each of the eight files it names** (`app.js`,
  `file-api.js`, `tabs.js`, `undo.js`, `format-bar.js`, `model-input.js`,
  `outline.js`, `renderers.js`). `model.js`'s render, which draws the
  document into the root it is handed, is the one place allowed to.
- **save-fidelity** — the conventions a document is written back in. The
  Turndown options `app.js` asks for, for what Turndown still converts (a paste
  and the table of contents), and then `markdown-style.js` directly: the
  sniffers, the line wrapper the model calls on an over-long composed line, and
  the table formatter. It also covers the invisible-whitespace rules: that
  U+00A0 is normalised in both spellings, and the ghost-element predicate,
  including the `<br>` asymmetry that decides whether a block is a blank line or
  an inline is a real one. Only the predicate — the traversal around it needs an
  HTML parser the stub does not have, which is why the decision lives in one
  pure function.
- **legacy-storage** — `front/legacy-storage.js`, the one-time conversion of the
  old HTML autosave. Its control flow on a stub store — which keys, the
  read-back, a failed write held in memory, decision 2's comparison, the version
  key, a second run doing nothing — and, since stage 4's slice 5, the old core's
  save path it holds: the restore layer, the whole-document re-wrap (every guard
  that once wrote into the user's file) and the reference-definition scan and
  rule. The real conversion of real stored HTML is
  `tests/browser/storage-conversion.spec.mjs`'s.
- **model** — `front/model.js`, TODO 3.1's stage 1 and stage 2. It is the suite
  with **no HTML parser** in it, which is the constraint that actually matters
  and is what "no DOM" always meant: the model is string and token work, so it
  borrows dom.mjs's file helpers — and, since stage 2's slice 2, `makeEl` and
  `makeText`, because the selection walks are pure functions over a node tree
  and a tree built by hand answers `nodeType`, `textContent`, `childNodes` and
  `hasAttribute` the way a real one does. What it still cannot do is turn a
  string into a tree, which is why everything that renders markup is measured
  in a real browser instead: the render verify, switched on under every
  `tests/browser/` spec, and those specs themselves. (An untracked scratch
  harness did that during stage 2 and was deleted when the stage closed.) It
  loads `markdown-style.js` ahead of `model.js`, and that order is load-bearing
  rather than tidy: since slice 3's
  step 5 the model calls `wrapMarkdownLine` and `hasMathSpan` rather than
  carrying a second copy of either. Its oracle is `ORACLE_FILES`, and every file in
  it is a **fixture** — `tests/fixtures/corpus/`, five frozen copies taken on
  2026-09-16 of documents this project maintains by hand, plus
  [tests/fixtures/torture.md](tests/fixtures/torture.md).

  **It drove the living files until then, and that was the wrong shape.** Real
  prose is what makes the oracle worth having — a human wrote it to be read, so
  it carries the conventions prose carries rather than the ones a parser test
  would think to invent — but a *living* file cannot be written for the test.
  Nobody is going to put a quote inside a list in `README.md` to cover a
  construct, so coverage was hostage to what the documents happened to need to
  say. And these documents describe the suite, so every count quoted in one
  moved the moment the other was edited: a documentation change became a failing
  test about list items, and refreshing the figures moved them again. Copies fix
  both at once — they can be edited to cover a construct, and editing the
  originals cannot move a number here. **Anything in `corpus/` is oracle**;
  there is no README in there and nothing that is not in the list, so a new file
  is a deliberate addition. Refreshing one is deliberate too: copy the living
  file over it and expect the counts in the labels to move.

  `torture.md` is a different answer to a different half. The five are a
  **biased** sample and the bias runs one way: all written in one voice, so
  uniformly well-formed, and between them holding no blockquote, no hard break,
  no strikethrough and no reference definition at all. It found two things on
  its first run that no repo file could: a tab-marked item derived a
  continuation indent the file does not use, **fixed the same day**, and a list
  item inside a blockquote gets no marker, which stays pinned as a check — the
  thing slice 3 records the quote chain to fix. It is also the only suite with
  a dependency — a real markdown-it, since the point is to parse real markdown
  with no browser anywhere. Since 2026-09-14 it configures that instance
  with `configureMarkdownParser`, the same call `app.js` makes, so the suite and
  the app parse with one configuration rather than the suite seeing a bare
  parser with no `math` token and no `data-ref-label` stamp in it. What it asserts is D1: every file in the oracle comes back byte-identical,
  and editing one paragraph rewrites exactly that paragraph. Since slice 1b it
  also asserts the same invariant one level down — a container's children tile
  its own bytes, at every depth, on those same files — plus the spans the tiler
  hands back at each level, pinned by exact file line numbers. Four of its
  checks exist only to stop those two passing by doing nothing: a parse that
  found no blocks hands the file back untouched, which is byte-identical and
  worthless, and a model with no children anywhere tiles vacuously, which is
  exactly the state slice 1 left it in. It also carries **the metric**, because
  the number slice 1b exists to move should not be something a human measured
  once and quoted: the worst edit in each of those files as a share of it, the
  guard that `corpus/todo.md`'s largest top-level block is still a third of the
  file so the share moved for the right reason, and every block in the oracle
  edited alone to prove it rewrites exactly itself. **The counts live in the
  check labels and nowhere else**, so a run reads as a report and no prose
  anywhere has to be kept in step with them. Since slice 2's step 1 it also drives the
  inline tree, where the invariant is the same shape one level down again:
  across every inline-bearing block in the oracle, all of the nodes are the
  parser's own tokens, each in the tree exactly once and in order, and every
  token left out is one of the empty text tokens the fold drops on purpose.
  Step 2 adds the offset space over that tree, where the property is a fixpoint:
  every leaf in those files, at both edges and the middle, maps to an
  offset that maps back to the same place — plus the one check the model cannot
  mark its own homework on, that in a block holding no markup at all the
  text it renders is the content markdown-it recorded. Slice 3's step 3 is the
  same shape once more and the sharpest of the three: throw away every
  inline-bearing leaf's `source` and emit it from its tree alone, and every one
  comes back byte-identical. Its hand-written cases are one per affix rule, and
  each rule was broken on purpose first to confirm the check fails — two of them
  were caught only by the oracle sweep on the first pass, which is how a case
  reaching for the wrong leaf was found. Step 4 adds the reference-definition
  search, checked against the parser's own answer for the whole file rather than
  against itself: on the six oracle files, where all five definitions are in
  `torture.md`, and on ten hand-written cases either side of the line — in a
  list item, in a quote, two quotes deep, two in one block, wrapped, and the
  four places a definition-shaped line is not one.

  Stage 2's slice 4 adds the structural edits, and its sharpest check is the
  one that is **D1 one step further out**: stage 1 only ever proved that an
  edited block rewrites itself, so every inline-bearing block in the oracle is
  now **split in half** and the file that comes back has to be the file that
  went in everywhere outside that block. Its instrument had to be fixed before
  it meant anything — `indexOf` finds the wrong copy of a paragraph whose bytes
  occur twice, and both `claude.md` and `corpus/todo.md` have one — so the
  block's position is measured with the sentinel sweep instead of searched for.
  Every nested item is also outdented, where what is asserted is not the bytes
  (an outdent is meant to change those) but that what it wrote re-parses to
  itself. The hand-written cases beside them are one per decision in the slice.
- **model-input** — `front/model-input.js`: the input layer's **routing**, and
  the one suite here whose stubs are the model rather than the DOM. That is
  deliberate and is the opposite of the usual arrangement: `beforeinput` is
  unreachable from `tests/dom.mjs`, which has no editing engine, so a stub could
  only deliver what it was told and would agree with any handler at all — but
  which `inputType` goes where, what is cancelled, and what happens during a
  composition are pure functions of the event, which a hand-built one answers
  honestly. `modelInlineSplice` and the render are covered against the real
  thing in `model`, so stubbing them is what lets this assert routing rather
  than re-assert those. What it pins: that **every** inputType is cancelled
  whether handled or not, that a cross-block deletion merges and a cross-block
  *replacement* is refused, that a source-bearing block is routed to the source
  space and not the inline one, that the empty-item rules are asked before the
  generic edit, and that Tab is taken from the browser inside a list and left to
  it outside one. The half neither suite can reach — does an engine actually
  send these, is it actually cancelable, what does a real IME do — is the
  Playwright specs and, for what only a person can do, `front/input-check.html`.
- **tabs** — the per-tab state boundaries and the swap between documents: that
  park and adopt are lossless and adopting nothing is a blank document rather
  than a half-cleared one; the migration off the flat keys and both ways a
  write can fail; the switch lock; the ordering inside `switchToTab`; the
  hydration of a tab this session has never shown; `beforeunload` seeing a
  background tab's edits; and the bar — the dot's precedence, close asking by
  switching first, and the keyboard. It loads `undo.js` for real rather than
  stubbing it, because what is under test is an ordering and a stub would
  agree with any order at all. The seam between `file-api.js` and `undo.js` is
  where stage 4's real bug lived, invisible to either suite alone.

**Opening a document, editing it and saving it is tested** — by
`tests/browser/open-edit-save.spec.mjs`, in a real browser through the file
API, and by the `model` suite with no browser at all, because the model goes
markdown to markdown. Until stage 4 neither was possible for the running
editor: the save was markdown → HTML → an editing engine → HTML → markdown, and
[tests/dom.mjs](tests/dom.mjs) has no HTML parser. The hard-break loss fixed on
2026-09-13 lived in exactly that seam — Turndown wrote the break and the
re-wrapper ate it, each passing its own checks.

**So when a change's real verification is something no suite reaches — a real
IME, a real clipboard, Safari as shipped, a document in daily use — say so, and
give the recipe**: what to open, what to do, what to look at afterwards. Never
report such a change as verified because `npm test` passed. This is the rule
the check pages below exist under, and the same honesty `npm test` gets for
what it *does* cover.

[tests/fixtures/break-test.md](tests/fixtures/break-test.md) is the document for
that recipe on the save path, and `open-edit-save.spec.mjs`'s, kept because the alternative was measured: it was
generated outside the repo for TODO 2.2's verification, deleted as scratch the
same day, and by the time it was wanted again it survived only in one browser's
`localStorage`. Its filler is load-bearing rather than padding — `sniffWrapWidth`
gives up entirely on a file with fewer than three wrapped paragraphs or ten prose
lines, so a short fixture would pass every check by never wrapping at all — and
its five labelled paragraphs are one case each: **ALPHA** a two-space break on a
line long enough to be re-wrapped, **BRAVO** a short-line control, **CHARLIE**
the backslash spelling, **DELTA** no break but long enough that it must re-wrap,
**ECHO** untouched and byte-identical.

**Never save over it.** The run is Save As to a scratch name, diff that against
the fixture, delete the scratch — the fixture is the pristine copy the diff is
taken against, so a save over it destroys the only thing that makes the next run
mean anything. It is also the document TODO 2.3 was found with, and CHARLIE is
the paragraph that finds it.

### The browser checks

**`npm test` cannot see an editing engine**, so everything about what a real
browser does is measured in one, in two ways.

**The Playwright harness, [tests/browser/](tests/browser/)**, is the machine
half: `npm run test:browser` from the root, under Playwright's Chromium,
Firefox and WebKit. Its specs drive the running app with Playwright's keyboard
and mouse, which are trusted, so the engine raises real `beforeinput`s (TODO
6.8 has the measurement). They stand in for the hand protocols of stages 2 and
3 — `tests/fixtures/format-check.md`'s sections through `format-marks`,
`inline-code-links`, `block-kinds`, `lists`, `blockquote`, `image`,
`table-cells`, `table-structure`, `insert-clear`, `keys-clipboard` and
`equation-typing` — and they cover what stage 4 reintegrated:
`open-edit-save.spec.mjs` opens `tests/fixtures/break-test.md` through the file
API, types into it and saves it to a scratch file, `exports.spec.mjs` makes each
export and checks none carries the renderer's view markup, `tabs-model.spec.mjs`
parks and adopts models, and `storage-conversion.spec.mjs` seeds old HTML
autosaves captured from both cores and checks what they convert to.
`model-page.mjs` fails a test on any render divergence or console error.

It is not part of `npm test` and will not be: it wants a browser engine and a
`node_modules`, the one dependency of that kind this project has agreed to
(TODO 6.8). First time only, `cd tests/browser && npm install && npm run
engines`. The run starts `deno task start` itself when nothing is on the port
and uses the dev server when there is. Each test is a fresh profile, so a run
never reads or writes the autosave of any browser you use.

Two things it measures less than a hand run, stated so a green run is not read
as more than it is. Playwright's WebKit is WebKit and not Safari — the editing
code is WebCore's in both, so engine claims carry, but it tracks trunk and
usually runs ahead of the shipping Safari, so a measurement with a Safari
version on it still wants real Safari by hand. Its Firefox is likewise a pinned
build rather than the one installed.

**The check pages are the hand half**, for what only a person at a real
keyboard, clipboard or browser can do. **It is the only thing in the repo that
can tell measurement from folklore** — every engine-specific claim in `front/`
and in the metafiles came from a check page, a spec, or is a guess — and the
pages that watched the old core proved it: their first run killed two
long-standing beliefs about execCommand. Those three (`browser-check`,
`list-indent-check`, `list-empty-item-check`) retired with the old core in
stage 4's slice 6, and with them the server's `/tests/:name` route and its
`/report` sink. Every page left is opened as a file or from `front/`, and
reports on the page.

[front/input-check.html](front/input-check.html) is TODO 3.1's, and it is the
one the rewrite's riskiest stage is measured by: does an engine send a
`beforeinput` for each thing a keystroke means, is it cancelable, what does
`getTargetRanges()` say, and what does a real IME do. Most of what it
asks is now asked by the Playwright specs above, in the app, in three engines;
its keyboard step is driven on the page itself by `final-pass.spec.mjs`. **What
is left for a person** is what no engine-driven run reaches: a real IME (the
press-and-hold accent), the engine's own undo gesture and menu, a formatted
paste from another application, a real drag — moving a selection, the two
refused drags, and a drop from another window — and whether Cmd+B opens
Firefox's bookmarks sidebar. Run by hand in Chrome and Firefox on 2026-11-14
for stage 4's slice 6, clean in both. It reports every event the engine sent
and, after each one, whether any block's DOM text has come adrift from its
model's. Slice 4 added eight steps to its protocol — the split, the merge across
a block boundary, Tab and Shift+Tab, the empty-item rules, a fence edited as
source, the table refusing the caret (typing in a cell since stage 3's slice 4),
and the guard paragraph that stops a trailing table trapping it, and slice 5
added seven more for paste and drop.
**It reports a drag that never begins**, added 2026-09-21: pressing inside a
selection is the gesture that should start one, so the page logs that and then
whether a `dragstart` followed — a drag that does not happen logs nothing
otherwise, and a page that says nothing reads as having no opinion. The same
lesson the divergence banner learnt. **Driven in Gecko on 2026-09-21, and it earned its
keep twice over.** Two real bugs, both of which the whole suite passed over
because the emitted markdown was right in each: a hard break the renderer
dropped, and a bullet's trailing space the DOM builder's `trim()` ate. One
per-engine fact — Blink keeps the caret out of the uneditable table and Gecko
and WebKit both let it in. One instruction that was wrong rather than the code,
about dragging over part of an equation. And three faults in the page: its document was set in
the page's own monospace, so a fenced code block was indistinguishable from a
paragraph; the divergence banner sat below the fold; and a divergence that fixed
itself left no trace at all, so one was hit and then lost. The banner is first
and sticky now, it keeps a count that survives a recovery, and every divergence
goes into the log as well. **All three engines pass the whole protocol** — the
same gate stage 0 set, and the same answer — including the merge, which no
machine can drive in any of them: a constructed `InputEvent` carries no target
ranges, so a synthetic Backspace at a block's start is a zero-width deletion
where a real keystroke hands over a range spanning two blocks. It lives in `front/` so the static handler already serves it
same-origin with `/model.js`, and it installs the input layer on its own
document, so running it does not touch the app's state on the same origin. It is in none of
the three registries: it is a page, not a module.

[tests/paste-check.html](tests/paste-check.html) cannot be run by a machine at
all: it measures what a browser puts in a
paste event for the paste-as-plain-text binding, which needs a real clipboard
and a real keystroke. **It answered the question in all three engines, and the
answer was no every time** — Chrome 152 and Firefox 154 on 2026-08-30, Safari
26.6.2 on 2026-09-18: each offers `text/plain` alone on its own plain-text
binding, so the plain branch already fires and there was never
anything to build. That is the opposite of what the item behind it predicted for
all three, which is the whole argument for the check pages, and it is what
closed that item with no code — see CHANGELOG.md, since the item has left
docs/TODO.md and its number is free for something else. All three deliver the
`keydown` to the page as well, so the flag-from-keydown shape stays available if
a browser ever changes its mind.

**So the page is now a regression check rather than an open question, and that
is why it stays**: the answer is per browser and per version, and the way it
comes back is a browser release rather than a change here.

Safari was the last of the three and cost a bug first: until 2026-09-18 the page
could not have measured it. Its binding is Cmd+Shift+Option+V, the keydown
matcher tested `e.key === "v"`, and on macOS Option composes characters — Option
and V make `√` — so the match never fired. **It did not fail loudly**: the
keydown was dropped and the paste was attributed to whichever keystroke came
before it, reading as `Ctrl/Cmd+V` if the tester was quick and `menu or unknown`
if they were not. It now matches `e.code`, names the binding from the modifiers
actually pressed, logs every keydown it sees, and consumes a keystroke once a
paste has used it. A check page that drops evidence quietly is worse than none,
since the whole point is to report what the browser did rather than what we
expected. It needs no server and no app — open the file itself.

[spike/block-model.html](spike/block-model.html) is the same family and the
only page outside `tests/` and `front/`: stage 0's gate, kept as the record of
it. It carries its own protocol and needs no server.

[tests/tab-shortcut-check.html](tests/tab-shortcut-check.html) is the same kind
of page and the same kind of question, for the tab bar's keyboard: Ctrl+Tab,
Ctrl+Shift+Tab and Ctrl+1–9 are all bindings some browser claims for its own tab
strip, and two separate things have to be true before one of ours works — the
keydown has to reach the page at all, and `preventDefault` has to suppress the
browser's own action. The answer is per browser *and* per platform, because
macOS switches browser tabs on Cmd+1–9 and leaves Ctrl+1–9 free while Windows
and Linux do not. Measured so far: Chrome 148 on macOS delivers all of them and
reports each as cancelable. Nothing else — no Windows, no Linux, no Firefox, no
Safari — so the shipped bindings are provisional, and TODO 4.2 says so. It needs
no server and no app either.

[tests/caret-guard-check.html](tests/caret-guard-check.html) measures what
Firefox needs before it will put a caret beside an uneditable equation at the
very start or end of a line — every typeset equation is uneditable since
2026-09-29, and measured by hand on 2026-10-01 Gecko then leaves the start
fiddly and the end unreachable. Four copies of one line: no stop, which is the
control, then a trailing `<br>`, zero-width characters, and a zero-width
character with a hidden image and `<br>`. It reports where typed letters landed
on the page. It needs no server and no app.

## Making a change

- **Every change lands in [CHANGELOG.md](CHANGELOG.md) as part of the change
  itself.** Add a dated entry in the prose style the file already uses, with no
  commit hash in the header yet. This holds for docs, comments and metafiles
  too — a change with no CHANGELOG entry is unfinished.
- **The hash is backfilled by the *next* commit, as part of that commit's own
  work, and never as an action of its own.** A commit cannot contain its own
  hash, so the header goes in blank and the commit after it fills it to
  `## DATE — HASH — Title`. Not by amending, and **not as a loose edit made
  straight after committing**: an edit sitting in the tree is one an amend
  will sweep into the commit it names, which moves the hash and leaves the
  header pointing at an object that no longer exists. That has happened
  twice — `d604beb` on 2026-08-31 and `90e12c1` on 2026-09-22, both caught
  only by an audit weeks later. So leave the previous entry hashless until
  there is a change to carry it, and fold the backfill into that change.
- **Dependency bumps in `server/deno.json` and `server/deno.lock` are part of
  the work, not noise to step around.** They arrive from `ncu` runs outside
  any one task; a commit that finds them in the tree takes them along rather
  than leaving them behind.
- **Anything more than trivial is written down before it is built, and again
  as each part lands.** Before: what is about to change, what the stages are,
  and what each one entails — in the item's own task file in
  [tasks/](tasks/) when it has one, or a `docs/` file when it is
  large enough to need one (3.1 has [docs/REWRITE.md](docs/REWRITE.md)). After:
  each stage says where it stands — *done and tested*, *done, untested*, *not
  started* — in the `## What was done` section that lands with it, rather than
  afterwards. **Do not
  start the work before the plan is written.** The failure this prevents is a
  CHANGELOG entry announcing "stage two" of a sequence that exists nowhere a
  reader can find it, which is what the tabbed view's first two stages shipped as.
- **Do not run tests for a change that touches no code.** Nothing in `tests/`
  loads a CHANGELOG entry, a comment, a doc or a `docs/` file, so `npm test`
  proves nothing about one — skip it. When code does change, run only the suite
  that names the file you touched (import it directly, per the Tests section
  above) rather than the whole `npm test`, unless the change reaches across
  enough of `front/` that only the full run covers it.

## The Unities

**Adopted 2026-10-19 as an evaluation, and brought up to the 2026-11-11
procedure on 2026-11-14** — the rules are deliberately lenient where this
project's way of working differs from the procedure's defaults.
[tasks/adopt-unities.md](tasks/adopt-unities.md) records what was installed,
what was left out on purpose, and why; its decisions are D10 onwards.

**Read first, in this order**, for anything beyond a one-line fix:
[docs/SPEC.md](docs/SPEC.md) (what Mandy is and is not),
[docs/DECISIONS.md](docs/DECISIONS.md) (what was decided and why),
[docs/PLAN.md](docs/PLAN.md) (every task and where it stands), and
[tasks/README.md](tasks/README.md) (how a task file is written).

The work, its record and its location are the same thing at the same time.
Every change to `front/` or `server/src/` is one commit that also carries its doc
line — the CHANGELOG entry counts, and is still written by hand as above — and a
`## What was done` section appended to its task file in [tasks/](tasks/). A
small fix that never had a task gets one created in the same commit; see
[tasks/README.md](tasks/README.md) for the format. The task's section can be two
sentences and a pointer, since the CHANGELOG entry carries the prose, and it
ends with a `Reviewed by:` line naming the reader below. The section that
closes a task carries a `Status: done` line; a task gathers one section per
landing, so having sections does not make it done.
[docs/TODO.md](docs/TODO.md) is retired: its items are task files now, and "TODO
3.1" names `tasks/3.1-*.md`.

**Decisions are written in the task file, never in `docs/DECISIONS.md`.** Any
choice with a rejected alternative gets a dated `### YYYY-MM-DD · title` entry
under `## Decisions` in the task file of the work that made it, with
**Decision** / **Rejected** / **Why** and no number. `deno task record` compiles
it into `docs/DECISIONS.md` below D0–D9, which stay as written, and rebuilds
`docs/PLAN.md` from the task files; the commit carries the compiler's output,
staged. A listed decision is not reopened quietly but by a new entry carrying
`Supersedes: D<n>`. A review item (`## Review · <date>` in the task file) is
done when every *Done when* line holds for the running program, not when its
wording is satisfied; whatever a fix needs beyond its item is recorded as a
decision before it is built.

`.claude/hooks/check-unit.mjs` checks all of this in two places, and only one of
them refuses:

- **At commit** — a `PreToolUse` hook on `git commit` and `.githooks/pre-commit`
  (`deno task hooks` once per clone) refuse a staged set with source but no doc
  line or no task record, a record with no `Reviewed by:` line, a compiled
  record that is stale or unstaged or whose hand-written head was edited, an
  acceptance box naming an outcome rather than a check, a review item missing
  its parts, and an edit to the retired TODO. A missing test is a note, never a
  refusal. **Stage in a separate call from the commit**: the hook reads the
  index before the command runs, so `git add … && git commit` is judged on what
  was staged before the `add`. `deno task hooks:test` is its own suite.
- **At the end of a turn** — the `Stop` hook reports what the uncommitted tree is
  missing and never sends the turn back, because stopping mid-change to ask a
  design question or hand over a browser recipe is how work goes here.

Before committing a change, have a reader that has not seen the work — a
read-only subagent — check that the task record describes the staged diff, and
name it in the `Reviewed by:` line. The hooks test presence, not truth.

### Division of labour

Claude writes the code and its record, and runs the automated suites the change
reaches, by the rule in "Making a change" above — the suite that names the
touched file, `npm test` when the change reaches across `front/`, and `npm run
test:browser` under Playwright's Chromium, Firefox and WebKit when only a real
engine can see it. **Erez is who says a change works**
— in a real browser, by hand, for what no engine-driven run can see (a real IME,
a real clipboard, Safari as shipped, a real document in daily use). Claude never
reports a change as working because a suite passed when the suite does not
reach it; it says so and gives the recipe (Tests, above).

## Architecture

Two halves:

- `front/` — the editor. Vanilla JS, no bundler, no modules.
- `server/` — Deno + Hono. Serves `front/` and exposes the local file API.

### Frontend: one shared global scope

Every file in `front/` is a plain `<script>` tag in [index.html](front/index.html),
so all top-level `const`s and functions are globals shared across files. There
are no imports. Consequences that bite:

- **Load order in `index.html` is load-bearing.** `toolbar.js` must come
  **first**: it defines `onToolbarAction`, which every other module calls at
  top level. Toolbar *buttons* no longer need to exist by then — clicks are
  delegated (see below) — but non-toolbar elements are still grabbed at load,
  so `#editor`, `#formatBar` and the file dialog must be in the markup.
  `notify.js` comes next and is depended on the same way: every module below
  reports its failures through `notify` / `ask`, so it must be defined before
  any of their handlers run.
  After that: `markdown-parser.js` defines `configureMarkdownParser`, which
  `app.js` calls at top level on the markdown-it instance it builds — so it must
  be *before* `app.js` in both bundles, and a bundle that gets that backwards
  throws on load and takes the whole editor with it, which is why the `latex`
  suite checks the order in both;
  `markdown-style.js` defines `sniffMarkdownStyle`, `wrapMarkdownLine` and the
  table formatter, which `app.js` and `model.js` call;
  `model.js` calls `wrapMarkdownLine` and `hasMathSpan` rather than carrying a
  second copy of either, so it sits after `markdown-style.js` — at emit time
  rather than at load, so it only has to be *present*, but the dependency is
  real and the model suite loads the two in that order for the same reason;
  `app.js` defines `editor`, `md`, the Turndown service, `documentMarkdown`
  and the two doors a document arrives through, all of which call into
  `model.js` at run time, so it follows it;
  `model-input.js` reads `editor` and `md` at load, so it follows `app.js`;
  `undo.js` binds to `editor` and so must follow `app.js`;
  `legacy-storage.js` converts the old autosave at its own load, with app.js's
  Turndown service, before `tabs.js` and `file-api.js` read storage at theirs,
  so it sits between them;
  `outline.js` defines `outlineIsOpen`, `outlineEntries` and `buildNestedList`,
  which `static-export.js` calls at export time;
  `renderers.js` defines `renderAfterModel`, which the model's render calls, and
  `stampLatexSource`;
  `lazy-load.js` defines the `ensure*` loaders. Later files call these freely.
- **Global-name collisions are real bugs, not hypotheticals.** `file-api.js`
  names its function `saveFileAs` rather than `saveAs` because FileSaver.js
  claims that global. Check for collisions before naming anything at top level.
- `theme-manager.js` and `docx-export.js` are indented as if still inside
  `<script>` blocks — they were extracted from `index.html`. Leave the
  indentation alone unless reformatting the whole file.

### The three registries a new `front/` file must join

Adding a file to `front/` means touching three places, and forgetting one fails
in a way that only shows up later:

1. `<script>` tag in [index.html](front/index.html) — in the right order,
   after `toolbar.js`.
2. `SHELL_ASSETS` in [sw.js](front/sw.js) — or it is missing offline.
3. `ASSETS` in [html-export.js](front/html-export.js) — only if the editable
   export needs it. Adding a script here without adding its menu item to the
   `export` variant in `toolbar.js` ships dead weight; adding the item without
   the script ships a dead control.

Bump `VERSION` in [sw.js](front/sw.js) when the shell changes; `activate` deletes
caches whose names don't match.

**`model.js` joined all three on 2026-09-20**, in stage 2's slice 1: for the
editor to draw from the model the app has to load the model, and an editable
export needs it in `ASSETS` too or it ships a dead editor. Its place in the
load order is load-bearing in one direction: **after `markdown-style.js`**,
whose `wrapMarkdownLine` and `hasMathSpan` it calls rather than carrying a
second copy of either.

[model-input.js](front/model-input.js) joined all three with slice 3, and sits
**after `app.js`**, whose `editor` and `md` it reads at its own load time. It
sits *before* `undo.js` and calls `undo` / `redo` anyway: the call is at event
time, so the function only has to be **present** in the bundle rather than
defined by then — and it is feature-tested besides, because one bundle
(`front/input-check.html`) deliberately lacks it.

Skipping a registry is otherwise a bug, and where it is deliberate the reason is
written down — `tabs.js` is absent from `ASSETS` because an exported document
holds one document and has no file API, and `legacy-storage.js` because an
exported document never reads the autosave.

### Document state

**The document is a markdown model, and the DOM is drawn from it.**
[front/model.js](front/model.js) holds it as blocks that tile the file's bytes,
`modelRender` draws `#editor` from it through markdown-it's own renderer, and
[front/model-input.js](front/model-input.js) cancels every `beforeinput` and
makes each edit on the model, so the DOM changes only by a render. The next
section is the model in detail; [docs/REWRITE.md](docs/REWRITE.md) is the
design and D6 the decision.

**Two doors and one way out.** A document arrives through
`loadDocumentMarkdown` or `loadBlankDocument` in `app.js` — Open and Reload,
the welcome document, upload, New, the boot restore, a tab this session has
never shown, an exported document's boot — and nothing else assigns
`editor.innerHTML` (the `undo` suite counts it in every file that might). It leaves through
`documentMarkdown()`, which asks the model for the markdown a save writes:
Save, Save As, Download, Copy markdown and the autosave all ask it, so an
untouched block goes back as the bytes it was parsed from and only an edited
one is composed. Turndown is not on that path any more; it converts what
arrives as HTML from outside — a paste, a drop — and the table of contents
`outline.js` builds.

**Autosave holds that same markdown**, under the open document's `markdown`
key (see `documentKey` below), written by `flushAutosave` on a one-second
debounce, a tab switch and `beforeunload`. A model the emitter refuses to write
leaves the last good autosave where it was and says so on the console. A
browser whose autosave predates stage 4 holds HTML under `content` instead;
`front/legacy-storage.js` converts it once at load and records
`mandy-storage-version`.

The `#editor` div in `index.html` ships **empty**. The welcome document is
[front/welcome.md](front/welcome.md), fetched and loaded by `app.js` when there
is no stored document to restore. Edit the markdown, not the markup — and note
`welcome.md` is a shell asset, so it needs its `sw.js` entry to survive
offline.

**Mermaid diagrams were removed on 2026-10-01.** A ` ```mermaid ` fence is an
ordinary code block, shown as its source. What remains is the conversion of a
diagram drawn before then and still in an old HTML autosave: the `mermaid`
Turndown rule in `legacy-storage.js` turns the wrapper back into its fence.

**Maths** is the one construct whose rendering destroys its source, and the
model sidesteps that by never reading the rendering: an equation is an atom in
the model, holding its TeX. On screen:

- **`<span data-math>`** wraps what markdown-parser.js's `math` rule writes, so
  an equation is one node — one character in the model's offset space — before
  and after MathJax runs.
- **`renderAfterModel`** in `renderers.js` typesets what each render built, and
  puts back a cached copy of an equation it has typeset before, by source,
  synchronously, so a render never paints a frame of TeX.
- **`stampLatexSource`** copies the TeX onto each `<mjx-container>` as
  `data-tex` / `data-display` while MathJax still knows it. The cache, the
  clipboard, the PDF and Word exports' pictures of equations and the `mathjax`
  Turndown rule (for an equation pasted back) all read it. An existing stamp is
  never overwritten, because MathJax re-typesets already-rendered maths in an
  exported document and reports MathML the second time.
- **A stamped container is `contenteditable="false"`**, with its wrapper. Left
  editable, Firefox walked the caret into MathJax's own elements and letters
  typed there vanished. An equation at a line's edge gets a caret stop from the
  DOM builder, which every walk counts as nothing.

On the way *in*, markdown-it has no notion of maths, so `$…$` used to pass
through every inline rule: `\{` and `\}` resolved as escapes and `$x = a*b*c$`
came back italicised. `mathSpan` and the `math` rule in
[markdown-parser.js](front/markdown-parser.js) claim the span ahead of the
`escape` rule. The rule runs before `backticks` in the chain but positionally
after it, so `` `$HOME` `` is still code; and it decides equation-versus-price on
two heuristics — an opening `$` is never followed by whitespace, a closing one
never by a digit — which `hasMathSpan` in `markdown-style.js` repeats, so the
line wrapper and the parser cannot disagree about what is an equation. Display
maths broken across a blank line is not handled, and need not be: a blank line
inside `$$…$$` is an error in TeX itself.

### The model

[model.js](front/model.js) is the document, and this section is how it came to
be, stage by stage. **It was written as each slice landed**, while the model
ran behind a flag beside the old core: where it says "under the flag" or "under
the model core", read *now*, since the flag went in stage 4's slice 4 and the
old core in slice 5; where it names an old-core function as running, that
function is gone. The closing paragraph says what stage 4 changed. Where each
stage stands is in [docs/REWRITE.md](docs/REWRITE.md). Everything down to the renderer is pure
string and token work, which is what lets the `model` suite drive it with no DOM
anywhere; the renderer's own DOM half is the exception, and the end of this
section says how it is watched instead.

`modelParse(markdown, md)` returns `{ prefix, blocks }`, and the invariant that
makes the rest work is that **every character of the input is in exactly one of
`prefix`, a block's `source`, or a block's `separator`**. `modelSerialise`
concatenates them, so an unedited document comes back byte-identical *because
nothing ever threw the bytes away* — not because a restore pass got most of them
back. That is the inversion the whole rewrite is for. Two identical paragraphs
cannot be confused for one another by a source span, and `indexMarkdownBlocks`
keys on content precisely because it has no span to use instead.

Twelve things that are decisions rather than details:

- **The parser is injected, never reached for.** `modelParse` takes the
  markdown-it instance as an argument. Both callers now configure it the same
  way, through `configureMarkdownParser` in
  [markdown-parser.js](front/markdown-parser.js): the app hands over the CDN
  instance it builds, the suite the `npm:` one, and both carry the `math` and
  `referenceAwareLink` rules. A module that fetched its own parser could not be
  tested without a browser, which is the entire reason this stage comes before
  the ones that are at risk — and a suite parsing with a *bare* instance was the
  same hole one step along, since it would have reported full marks on
  constructs the app never hands it.
- **`modelTouch` is the only door to `source = null`, and it walks up.** That
  assignment *is* the contract with D1: a path that changes a block's content
  without going through it leaves the file's old bytes on disk under new content,
  and the document looks right on screen either way. The walk is the same rule
  one level out — a container still holding its `source` is emitted from those
  bytes and never asked about its children, so an edited item under an untouched
  list would re-emit into nothing. It clears the whole chain rather than stopping
  at the first ancestor already cleared, because a stop condition is a second
  rule about when an ancestor may keep its bytes and there is no such case. The
  price is the `parent` link that makes it possible: **the model is cyclic and
  not `JSON.stringify`-able**, which is cheaper than searching the tree for a
  parent on every keystroke.
- **Blocks come from top-level tokens' `map`, which is a source span for free.**
  A block's `source` is the exact bytes and no trailing newline; the newline
  that ends its last line belongs to the separator, or every block would carry
  one and the two could not be told apart when a block is re-emitted.
- **A container's `map` runs into the blank line after it**, so trailing blanks
  are handed back to the separator. Without that an edited list loses or doubles
  that line depending on which side of the seam the emitter believed it was on.
- **Reference definitions are ordinary blocks.** markdown-it consumes a
  `[label]: url` line and emits no token, which is why today they have no DOM
  node to survive on and `appendReferenceDefinitions` collects them at the end of
  the file regardless of where the author put them. Here such a line is a block
  of kind `gap` in its own position, rendered to nothing — and a definition
  wrapped onto a second line, which `scanReferenceDefinitions` cannot see at all
  today, is only a taller one.
- **A container holds children that tile its own bytes, and the serialiser does
  not read them yet.** A list was one block, which was a known regression rather
  than the design: `docs/TODO.md` was 708 lines and sixteen top-level blocks when
  this was measured on 2026-09-12, the largest 239 of them, so editing one item
  would rewrite a third of the file —
  the unmergeable diff D1 exists to prevent, and *worse* than the three-layer
  restore this replaces, since `markdownSegments` splits on list markers for
  exactly this reason. Slice 1b is the fix, and its first two steps are in: a
  list holds its items, an item the blocks inside it, a quote its paragraphs, a
  table its head, body and rows — five deep on `docs/TODO.md`, with the row as
  the floor because `td_open` carries no `map`. The same invariant one level
  down: `leading` plus every child's `source` and `separator` is the parent's
  `source`, so a child's source is its lines whole and carries its own marker.
  Serialisation recurses with them (step 3): a block whose `source` is null and
  which has children emits its children instead of calling the emitter, so an
  edited child re-emits and **no sibling is ever re-serialised**. `modelTouch`
  clears the touched block's ancestors so that recursion reaches it (step 4 —
  see the bullet below). Editing the first bullet in `docs/TODO.md` therefore
  asks the emitter for a 10-line paragraph where the same edit used to
  re-serialise the whole list around it, and a bullet five blocks down costs
  one emitter call. Every item also carries its own marker and continuation
  indent (step 5), recorded at parse by `modelItemPrefix` because slice 3's
  emitter has to write both back and re-reading them at emit time would be a
  second place that can disagree. The indent is **read off the item's own
  continuation line** and only derived from the marker where there is no such
  line: deriving alone turned the marker `"-\t"` into the indent `" \t"` where
  the file continues under a bare `"\t"` — the same column, different bytes, and
  an edited item written back under an indent its author never used. **The
  metric is the suite's, not a human's** (step 6): editing the worst block in
  the oracle's copy of `docs/TODO.md` rewrites a handful of its lines where the
  same edit cost the whole enclosing list before the slice, and every block the
  suite drives rewrites exactly itself when edited one at a time. The figures
  are in the labels. A blockquote's `> `
  chain is the same problem as the marker, and is **recorded the same way**,
  which is slice 3's step 1 and landed 2026-09-16: `modelQuotePrefix` fills
  `quotePrefixes`, one string per line of a block's source. **Per line rather
  than per block**, because a lazy continuation carries no `>` at all and a
  quote can start indented, so one prefix for the whole block would write bytes
  the author never used. Depth is the number of quote containers a block is
  inside, so a block records the chain of the quotes it is *in* and never its
  own — a quote is a container and re-emits from its children. It is also what
  makes an item behind a `> ` an ordinary item: `modelItemPrefix` now scans the
  line with the chain already claimed, where before it found no marker at all.
- **A heading's spelling is recorded too, and it is the model's one suffix.**
  Slice 3's step 2, same day. `level` has been on the block since slice 1 and
  says nothing about how the heading was written — `# T`, `# T #` and `T` over
  `=====` are all level 1, and `======` and `===` are the same heading in
  different bytes — so `modelHeadingShape` records `{ open, close, underline }`.
  Everything else markdown-it strips sits in *front* of the content; a closing
  hash run and a setext underline sit behind it, which is why the only blocks in
  the oracle whose source is not a per-line prefix plus their inline source are
  headings. The branch is taken on the parser's own `markup` rather than on a
  line count, and the result is checked against `inline.content` rather than
  trusted: a shape that does not line up is null, so the emitter has nothing to
  work from instead of the model inventing a spelling. 1b's step 5 left it open between that and re-applying the
  chain at emit time, for want of anything to measure — this repo has no
  blockquote in any of its nine markdown files. `tests/fixtures/torture.md` is
  the measurement, and it decides it: `modelItemPrefix` returns null for every
  list item inside a quote, because the marker it looks for sits behind a `> `,
  so an emit-time strip would be reaching for something parse had already lost.
  The work lands in slice 3.
- **A block's inline content is a tree, folded on `nesting` alone.** Slice 2's
  step 1: markdown-it hands inline content over flat, with `+1`/`-1`/`0` on each
  token, and `modelInlines` folds that back into the tree the markup describes —
  which is what an edited block will be re-emitted from and what stage 2's
  format commands act on. Switching on `nesting` rather than on a list of mark
  kinds is the same rule the block tiler follows one level up: a construct this
  file has never heard of still nests correctly, and `MODEL_INLINE_KINDS` only
  names it. Three things it keeps that matter later. **A mark carries the
  delimiter as written** — `_a_` and `*a*` are both em and are told apart on the
  node, where `sniffMarkdownStyle` can only guess once per document; the oracle
  files spell every mark both ways, so this is measured rather than theoretical.
  **The token stays on the node**, because a link's href, title and
  `data-ref-label` stamp and an image's `src` are already on it and re-deriving
  them from the source would be a second parser free to disagree with the first.
  **An image is one node rather than its alt text**, which is step 2's offset
  rule arriving early. The one thing the fold drops is a zero-length text token,
  of which markdown-it leaves one either side of every mark it converts, of which
  the oracle holds several hundred: they hold no bytes, and a position inside one cannot be told
  from a position beside it. The suite checks that omission as an omission —
  every token not in the tree is an empty text token, and everything else is
  there exactly once, in order.
- **A position in a block is an offset into the text that tree renders.** Slice
  2's step 2 is that space plus the two functions in and out of it:
  `modelInlineText`, `modelInlineOffset`, `modelInlineAt`. A code span's content
  counts and its backticks do not; a mark's delimiters are zero-width; a break
  is one character and that character is a newline; an image and an equation are
  one `\uFFFC` each, because what the reader sees is not the characters the
  model holds and counting the TeX would put the model's offsets and the DOM's
  out of step. **Characters means UTF-16 code units**, since a DOM `Range`
  counts those and mapping to one is the whole purpose. The boundary rule is
  `undo.js`'s and is kept on purpose: a position at a boundary belongs to the
  node that *ends* there (`undoLocateOffset`'s `remaining <= length`), out of
  range clamps to the end, and a node from another tree gets null rather than a
  0 — so stage 2 ports the caret behaviour instead of re-deciding it.
  `modelInlineAt` hands back the mark chain as `path`, which is how the tree
  answers what marks a position carries.
- **An edited leaf is put back together out of the affixes, not written from a
  house style.** `modelEmitLeaf` is slice 3's step 3 and is what
  `modelEmitBlock`'s `emit` argument stood in for: `modelInlineSource` for the
  content — which slice 2 already reconstructs byte for byte — and then, per
  line, the quote chain, the item marker or continuation indent, and for a
  heading its `open` and its closing run or setext underline. **The affixes are
  absolute**, so only the *nearest* item ancestor contributes: a child's source
  is its lines whole, so a nested item's marker already carries every outer
  indent, and stacking them reproduces 707 of the oracle's 861 inline-bearing
  leaves instead of all of them. Two suppressions follow from the same fact, and
  both are 1b's tab bug one layer along — an affix recorded from its own column
  0 has already claimed the item's indent, so a quote *inside* a bullet and a
  heading inside one each take no item affix. It refuses rather than guesses
  three times over, and each refusal is a `null` something recorded on purpose:
  a leaf with no inline tree (a fence, indented code, a rule, a gap, a table
  row — their content *is* source and is edited as source), a heading whose
  shape did not line up, an item whose marker was never found.
- **The emitter is handed the document, and that is what a reference link costs.**
  Slice 3's step 4, and the slice's one piece of new plumbing.
  `modelRebuildTail` writes `[text][label]` off the `data-ref-label` stamp for a
  link a command built or changed, and whether that label still resolves is a
  question about the whole document — so `modelReferenceLabels(doc, md)`
  searches it and a label nobody defines any more falls back to the inline form
  instead of a reference that renders as literal text. It searches **every leaf
  with no inline tree**, not the `gap` blocks: `> [b]: u` is a quote whose only
  content is the definition, so it has no children and is a childless leaf, and
  a scan of the gaps misses it. And it asks **`md.parse`**, whose
  `env.references` is markdown-it's own record — which is what makes a
  definition **wrapped onto a second line** work here where
  `scanReferenceDefinitions`'s single-line regex cannot see one at all. The scan
  is lazy, at most once per emitted block and never cached across blocks, since
  an edit to a definition is exactly what a cache would go stale on. Handed no
  document it keeps the stamp's spelling, which is slice 2's behaviour: a caller
  not given the means to answer should not materialise a possibly stale href on
  a guess. **A reference *image* is the one thing this cannot reach** —
  `referenceAwareLink` replaces markdown-it's `link` rule and nothing else, so
  an image carries no stamp; an untouched one round-trips on its recorded tail
  and a rebuilt one comes back inline.
- **Re-wrapping is the second layer, and it is applied to one block.** Slice 3's
  step 5. `modelEmitLeaf` takes a width and hands each over-long composed line to
  `wrapMarkdownLine` — **with the prefixes it recorded at parse rather than
  letting the wrapper read them back off the line**, which is that function's
  new third argument and the reason `wrapMarkdownPrefixes` now exists as its
  default. The difference is the tab: derived, the marker `"-\t"` continues
  under two spaces, the same column in different bytes, on 1 item in 343 across
  the oracle. Most of the value is in what is *not* wrapped — never a heading
  (a wrap turns its tail into a paragraph, and a `#` scan cannot see a setext
  one), never a line carrying maths, and never a line already inside the width,
  because `inline.content` keeps the author's own breaks so only a line the edit
  made too long is touched. A width of 0 is a real answer meaning *this file is
  not hard-wrapped*, and `README.md` is one. This is why `model.js` must load
  **after** `markdown-style.js`: it calls `wrapMarkdownLine` and `hasMathSpan`
  rather than carrying a second copy of either.
- **`leadingAffix` is everything markdown-it took off the first line, recorded
  whole.** A paragraph indented one to three spaces is still a paragraph and has
  that indent stripped off `inline.content` exactly as a list marker is — so
  until 2026-09-18 an edited one came back flush left, silently, and every check
  passed because no paragraph in the oracle is indented. Whole rather than named
  because the pieces worth naming already are: the emitter subtracts the item
  prefix it is putting back and keeps the remainder, which is one subtraction in
  one place instead of a second derivation at parse. Verified against
  `inline.content`, and a null is a shape the emitter refuses on.

**Stage 1 is closed** — 2026-09-18, all four slices. The model parses a
document, holds it as blocks that tile the file and children that tile their
containers, records every spelling markdown-it discards, and emits an edited
block back in the conventions its own bytes recorded.

**Stage 2's slice 1 gave it a renderer**, 2026-09-20, and that is the whole of
what it can do in the DOM so far: `modelRenderBlock` is a block's HTML out of
markdown-it's own renderer, `modelRender` builds `#editor`'s children from it,
and `modelRerenderBlock` replaces one subtree. Six things in it are decisions
rather than details.

- **Never a hand-written HTML emitter.** Everything goes through `md.renderer`,
  so the output is identical to what `markdownToHtml` produces today — which is
  what keeps `outline.js`'s observer, `headingAnchors`, the format bar's
  geometry, the static export's clone and `renderers.js` reading a DOM that
  still looks the same. A second renderer would be a second thing free to
  disagree with the parser, which is the mistake `modelInlines` already refuses
  to make by keeping the token on the node.
- **A block is rendered with the token that precedes it**, when that token is
  hidden, which is the one thing a block's own slice does not carry. markdown-it
  opens a block-level tag on a new line when the token before it is hidden — the
  tight list item `<li>Walk the transect.\n<ol>` — and prepending costs nothing
  because a hidden token renders to the empty string by markdown-it's own rule.
  Without it, `tests/fixtures/torture.md` is the one oracle file whose blocks do
  not concatenate to `md.render` of itself. That equality, over the six oracle
  files, is the slice's instrument, and it needs no DOM at all.
- **Identity is a minted id on `data-block`, never an index path and never
  `id`.** A path goes stale on every splice and the input layer splices
  constantly; `id` is what `headingAnchors` stamps on the static export's clone
  and the two must not collide. The counter is on the document, so a block the
  editor creates takes the next one, and none is ever reused.
- **A block owns an element only when its rendering is exactly one**, whitespace
  aside. markdown-it hides a tight list item's paragraph, so it renders to bare
  text with nothing to stamp — and **the re-render unit is therefore the nearest
  ancestor that does own one**, which for such a paragraph is its `<li>`. That
  is not a heuristic: replacing an element with a block's rendering is correct
  exactly when that rendering *is* the element.
- **An empty block renders a marked filler `<br>`**, because a block holding no
  text has no height in a `contenteditable` and takes no caret — which is why
  `BLANK_DOCUMENT` has always been `<p><br></p>`. The mark goes on the `<br>`
  rather than on the block, since `<p>foo<br><br></p>` is an ordinary shape and
  the parent cannot say which of the two it means. The filler belongs to the DOM
  builder rather than to the renderer, which is what keeps the equality above
  exact: `md.render("#\n")` is `<h1></h1>`, so an empty block is parseable, and
  a renderer that filled one in would diverge on any file holding a bare `#`.
  Nothing here reaches anyone's file, so simplicity was the only criterion.
- **Blocks are built one at a time into their real parent**, rather than as one
  string assigned to `#editor`. That is what makes the block-to-element map fall
  out instead of having to be reconstructed, and it gets the fragment parsing
  context right for free — an `<li>` goes into its `<ul>` and a `<tr>` into its
  `<tbody>`, where the same markup parsed detached would be thrown away.
  Measured 2026-09-20 on a 2,399-line document of 1,325 blocks: 16.8ms against
  13.4ms for one `innerHTML`, so the map costs about a quarter more on a
  document three times the size of anything in this repo.

**Slice 2 added the selection mapping**, 2026-09-20: `(block, offset)` to a DOM
position and back. The model half was built in stage 1 on purpose —
`modelInlineText`, `modelInlineOffset`, `modelInlineAt`, written to `undo.js`'s
boundary rule so this ports the caret behaviour rather than re-deciding it — so
what this adds is `modelDomText`, `modelDomOffset` and `modelDomLocate`, which
are `undoTextOffset` / `undoLocateOffset` over one block's subtree, plus two
things those never had to know about.

- **Atoms.** `modelIsAtomNode` is the DOM half of `MODEL_ATOM_KINDS` and the two
  have to agree, or the directions disagree by the length of some TeX. An
  `<img>` contributes nothing to `textContent` and one character here; an
  equation is the `<span data-math>` above, one character whether or not MathJax
  has replaced its contents. A `<br>` is deliberately *not* an atom: measured,
  markdown-it renders a hard break as `<br>\n`, so the newline is the text node
  after it and the `<br>` is zero characters — which is exactly what
  `undoTextOffset` has always counted, and what makes the filler `<br>` slice 1
  renders cost nothing too.
- **A block with no element of its own.** markdown-it hides a tight list item's
  paragraph, so it has none — and most of this repo's documents are tight lists,
  so this is not an edge. It is addressed through the nearest ancestor that owns
  one, shifted by the text of the siblings in front of it, which works because
  **a container's text is its children's concatenated**: the tiling invariant
  one more level down, in text rather than in bytes. `modelBlockText` is that
  recursion.

`modelApplySelection` and `modelReadSelection` are the two ends in the browser's
own terms, and `modelRender` / `modelRerenderBlock` take a selection to apply,
because **nothing holds a `Range` across a render** — every node the old one
pointed at has just been thrown away.

`modelVerifyRender` is the spike's step 6 kept as a permanent assertion: after a
render, each block's DOM text against the text its tree says it holds. Off by
default. Slice 2 made it **exact** — it compares atom-aware DOM text against
`modelBlockText` at every block that owns an element, so a block holding maths
is checked rather than skipped and one owning no element is covered by its
container. The one thing it still does not measure is a block bearing no inline
tree anywhere: a fence, a rule and a gap. **A table was on that list** until
stage 3's slice 4 gave its cells an inline tree each, and since then the verify
covers them like any other block.

**Slice 3 gave it input**, 2026-09-20, in [model-input.js](front/model-input.js)
— its own file because it is an event layer rather than the model, and because
slices 4 and 5 grow it. `beforeinput` fires on the editable root *before* the
engine mutates anything, so the handler **cancels every one of them, handled or
not**, and the DOM can then only change through `modelRender`. That is D4's
treatment reversed, and it is the one line the whole design rests on: an
`inputType` nobody has heard of is a keystroke that does nothing, rather than
one the engine gets to act on behind the model's back.

What slice 3 handles is text: `insertText`, `insertReplacementText`, and the
five delete types. The four delete-word and delete-content types are **one
implementation**, because the engine has already decided what a word is and
says so in `getTargetRanges()` — which is also why "a deletion whose target
range spans two blocks is a merge" falls out rather than being special-cased.
Slice 4, below, is what does the merging.

`modelInlineSplice` is the mutation the tree never had. Stage 1 only ever read
it, and the contract a mutation keeps was already written down in
`modelInlineSource`: every leaf emits `raw ?? <rebuilt from content>`, so an
edit sets `content` and **clears `raw`** — `modelTouch`'s rule one level down,
meaning the same thing. Four things about it:

- **Text typed at a mark's edge goes inside when the caret was inside**, and
  that needed no code: `modelInlineAt`'s boundary rule already puts a position
  at the node that *ends* there, so the caret after `**bold**` is in the mark
  and the one before it is not. The rule that ships is the one stage 1 wrote
  for the caret.
- **An atom is all or nothing.** One character each, so a range covers one
  whole or not at all — there is no partial overlap to define.
- **U+00A0 is normalised here, once, at the boundary**, which is TODO 1.4
  closed by construction. Its other half goes more quietly still: the browser
  cannot rewrite a trailing space behind our back when it is not the one
  writing.
- **No `execCommand` edits anything**, and that is a measurement rather than
  tidiness: Chrome 152, `execCommand` fires `input` but **never
  `beforeinput`**, so it cannot be intercepted at all. Every call would be a
  DOM mutation the model can neither cancel nor hear about. So the formats,
  Clear and the list moves are model commands, and the one `execCommand` left
  in `front/` is the Edit menu's `copy`, which edits nothing — the `notify`
  suite's scan allows exactly that one.
- **`undo.js` refused too, between 2026-09-21 and slice 6's step 2, and it was
  the door nobody shut.** Found 2026-09-21,
  after the marker above had been claiming for a day that Ctrl+Z does nothing
  here. It did something: the keydown handler is on `document` and was never
  gated, and the stack is fed by the synthetic `input` every model edit raises —
  so an undo restored an earlier *rendering* over a model that had not moved.
  That is a divergence rather than a no-op, and worse than one, because it looks
  like it worked: the next inline edit patches one block out of the unreverted
  model into the reverted DOM, and `modelReadSelection` maps the caret through
  DOM text the document no longer has. `undo()` and `redo()` return false under
  the flag; the keydown goes on calling `preventDefault`, because falling
  through hands the key to the native stack, which is the same mutation behind
  the model's back one layer down. **The stack goes on recording**, which is the
  half that is not optional: `file-api.js` reads `undoPosition()` to know
  whether the document is back at the last save, and a history that stood still
  would report every model edit as clean — taking the unsaved-work guard and the
  `beforeunload` warning down together. **Step 2 replaced the refusal with the
  branch it was standing in for**, so this is history rather than current
  behaviour — kept because the failure it describes is what the two seams exist
  to prevent.
- **`modelInlineTokens` puts the tokens back in step with the tree**, and
  without it an edited block does not render at all — the renderer goes through
  markdown-it over the block's *tokens* and an edit changes the *tree*. The
  tokens the tree carries on its nodes are what it hands back, which is the
  second thing that design pays for. Re-parsing the emitted source was the
  alternative and is worse: a reference link's source is `[text][label]`, and
  resolving it needs the whole document's definitions in the parser's env.

**Composition is decided rather than discovered.** `insertCompositionText`
cannot be cancelled, so from `compositionstart` to `compositionend` the engine
owns the one text node under the caret and **nothing re-renders** — a render
during composition takes that node away from the IME, which is how CJK input
breaks outright. On `compositionend` the block's DOM text is diffed against the
model's and the difference applied as one edit, which is also one undo step for
one composed word.

Every edit ends by dispatching a synthetic `input`, because `preventDefault()`
means the engine will not — and autosave, the dirty flag, the outline and the
undo stack all hang off exactly that.

**Slice 4 gave it structure**, 2026-09-20, in the same two files: the edits that
change how many blocks there are, and the ones that act on a block with no
inline tree. **Driven through by hand in all three engines on 2026-09-21, clean
in all three after two rounds of fixes** — they found two real bugs, both of
which every check in the suite passed straight over, and both reproduced and
cleared everywhere. Seven steps, and the ones worth knowing from outside:

- **What Enter splits is the block, and then its container when that container
  is an item.** So Enter in a top-level paragraph makes a paragraph, Enter in a
  quoted paragraph makes a second quoted paragraph — a quote is not an item, and
  the walk stops — and Enter in a bullet makes a bullet rather than two
  paragraphs inside one. At the end of a heading it opens a paragraph; anywhere
  else in a heading it splits into two headings of the same level, because the
  text after the caret is still heading text.
- **A new block's tokens come from the parser, never hand-built.** That is the
  exact twin of the rule that keeps `modelRenderBlock` honest — a fresh
  paragraph is `md.parse` of a one-character template with its inline children
  replaced, and everything else is cloned from the block it came from. Its
  affixes are **computed from its position rather than copied**, because a
  split's second half is never its item's first child and so takes the
  continuation indent where the original took the marker.
- **A block that emits nothing takes the separator before it with it.**
  `modelJoinBlocks` is both the document's fold and a container's, and this
  clause is what makes markdown's lack of an empty paragraph survivable: the
  model holds a block for the caret, the file has nothing to say about it, and
  an Enter nobody has typed into yet costs **zero bytes**. Nothing the parser
  produces emits empty, so an opened-and-saved file is untouched.
- **The two hand-rolled list clusters are model rules now**, with no engine in
  them — Enter and Backspace on an empty `<li>`, and `outdentListItem`. What
  `app.js`'s handler does is the specification, because it is what users have;
  what changes is that there is no DOM surgery to watch in three browsers.
  **Tab is the first thing the input layer binds that is not an `inputType`**,
  and it has to be, since a keydown is where Tab arrives.
- **The indent is absolute**, so an outdent shifts every marker and continuation
  indent beneath the item it moves — and a follower that comes across with it
  does not move at all, because it goes out one level and down one level at the
  same moment. Tabs stay tabs, which is 1b's step 5 in the one other place that
  writes an indent.
- **A fence and an indented code block are edited as source**, which is the
  second text space: offsets into the block's own body rather than into an
  inline tree. **Such a leaf keeps a `source`, and it is the new bytes** —
  `modelTouch` read inverted, and the honest shape rather than an exception,
  since the contract is that a block whose content changed must not re-emit its
  *old* bytes. A gap renders to nothing, an `html_block`'s text is not its
  source, and a table refused until stage 3's slice 4 made its cells editable.
- **A table refused edits from here until stage 3's slice 4**, and the
  rendering was how it said so: its subtree was `contenteditable="false"`.
  `modelEnsureBlock` closed the trap that came with that — a table as the last
  block would leave nowhere for the caret to go — by keeping an empty paragraph
  after it, which is free, because of the fold above, and it still does, since
  nothing a key does in a cell leaves the table downwards. The same
  function answers the other half: **deleting everything leaves one empty
  paragraph block**, so the filler paragraph belonging to no block is no longer
  reachable from the app.
- **A split trims the whitespace a markdown block cannot carry**, at the cut, on
  both sides and into marks. Not tidying: four leading spaces make the tail an
  **indented code block**, and a space before a closing `**` stops it being
  emphasis at all.
- **A structural edit re-renders the whole document.** One block's re-render
  cannot express a block that was added or removed. Named rather than hidden —
  16.8ms on a 1,325-block document, about a frame, and rare next to a keystroke.
- **No leaf may vanish on the way to the renderer**, which is the rule the first
  hand run bought. A node the model builds has no parser token — correctly, as
  there is no parse behind it — and `modelInlineTokens` was dropping exactly
  those, so Shift+Enter put a newline in the model and no `<br>` on screen. The
  *markdown* was right throughout, because `modelEmitLeaf` composes from the
  tree and the node carries its own `raw`, which is why every check in the suite
  passed over it. Breaks are synthesised now; **an atom with no token throws**,
  because an image's rendering *is* its `src`, alt and title and an equation's
  *is* its delimiters and TeX, so there is no honest way to make one here. The
  rule slices 5 and 7 inherit: **a command that creates an image or an equation
  takes its token from the parser**, never hand-builds one.
- **A block's rendering is trimmed to its own text, not `trim()`ed.** The trim
  strips markdown-it's pretty-printing, which is right exactly while a block's
  rendering begins and ends with a tag — and markdown-it **hides a tight list
  item's paragraph**, so that block renders as bare text whose edges are its
  content. Delete a bullet's last word and the model keeps the space before it,
  correctly, and `trim()` ate it in all three engines. `modelTrimRendering`
  keeps back exactly the edge whitespace the block's text has: not a heuristic
  but the invariant `modelVerifyRender` checks, applied where the markup is
  built. It covers a second case nobody had reached — a hidden paragraph ending
  in a hard break, whose final newline *is* the break's one character. The
  **file** still gains no trailing whitespace, since markdown strips it on the
  next parse: the last composed line is trimmed on the way out, and only ever
  the last, because a hard break's two spaces are never on it.
- **Two engines out of three put a caret inside the table anyway** — history
  since stage 3's slice 4, which took the refusal away. The
  refusal's signal was meant to be the rendering — an engine will not put a
  caret inside a `contenteditable="false"` island — and measured by hand in all
  three, **that is Blink's behaviour and nobody else's**: Gecko and WebKit both
  let the caret in, so there the door is shut without looking shut. The decision
  stands and nothing is lost — the edit is refused either way and a selection
  across the table still works everywhere — but the **mitigation** failed.
  Recorded against TODO 1.1.8, which is what makes the caret welcome again,
  rather than patched for a one-stage life; what is left on the table there is a
  once-per-document notice, which the original "it would fire per keystroke"
  argument does not reach.

**Slice 5 gave it paste and drop**, 2026-09-21 — the one thing the model cannot
produce for itself, and so the one place Turndown survives into the new core,
converting somebody else's HTML on the way in. It leaves the save path at stage
4; this is the last thing it does. **Driven clean by hand in all three engines
on 2026-09-21**, after one real bug — no `dragover` handler, below — and one
gesture: a drag needs the button released after selecting and then a fresh press
on the highlight, which is every engine's behaviour and not this editor's.
What is worth knowing:

- **A paste parses to a second document, and nothing in it is safe as it
  stands.** `modelParse` mints ids from 1, so every pasted block wears an id the
  target is already using and `modelElementFor` is a `querySelector` — it would
  answer with whichever element it met first. And a pasted block's bytes were
  written flush left, so dropping them into a quote or a list item would write
  lines carrying no `> ` and no indent. `modelAdoptBlocks` re-mints every id and
  **clears every `source`**, letting the emitter compose the chain from the
  block it lands beside, the leading affix from its new position, and an item's
  marker shifted to the column its new container starts at.
- **Except a leaf with no inline tree, which keeps its bytes and has them
  moved.** Slice 4's inversion again: a fence's content *is* source and the
  emitter refuses it outright, so clearing it would leave nothing able to write
  the fence back at all. Its lines are shifted and given the quote chain
  instead.
- **The splice rule is the conventional one**, written down because it is where
  pasting feels wrong when it is wrong: the block splits at the caret, the first
  pasted block merges into the head, the last into the tail, and whole blocks
  land between. A one-block paste is that with nothing in the middle and reduces
  to an inline splice. **A pasted container joins neither end** and sits between
  them.
- **Pasted blocks land as siblings of the block the caret was in.** Enter
  promotes to the nearest item; a paste does not, so three pasted paragraphs
  give one bullet holding three rather than three bullets. Nothing is lifted out
  of the container the caret was in, which is the direction worth being cowardly
  in.
- **A paste must not trim at the cut.** Slice 4 trims both edges of a split,
  because a markdown block cannot carry whitespace at its own edge — true of a
  split that *stays* split. A paste rejoins both sides around what it inserts,
  so that whitespace ends up mid-line where it is ordinary text, and trimming it
  ran two words together. `modelSplitLeaf` takes a `trim` flag, false for this
  one caller; the trim returns on the tail when nothing joined it.
- **Plain text is never parsed, which is stronger here than it is today.** A
  pasted `*foo*` becomes a text node whose `raw` is null, so `modelEmitLeaf`
  escapes it and it stays literal in the file rather than becoming emphasis on
  the next save. One line is an ordinary splice; several become paragraphs, with
  single newlines kept as softbreaks.
- **The `paste` and `drop` events rather than `beforeinput`.** Both fire first,
  both carry their data by specification, and cancelling either stops the
  insertion before an `insertFromPaste` is raised. `beforeinput` goes on
  cancelling those types anyway, so a browser that raised one without the event
  before it still changes nothing behind the model's back.
- **A drag that started inside the editor is a move, not a copy.** The engine
  raises `deleteByDrag` and `insertFromDrop` as a pair, both are cancelled, and
  doing only the insert would duplicate the text and leave the original standing
  — which looks like it worked. The source range is recorded at `dragstart` in
  model coordinates, the deletion runs first, and the drop offset moves back by
  what was taken out when the two are in the same block. A drag spanning two
  blocks, or dropped inside itself, does nothing.
- **`dragover` has to be cancelled or there is no `drop` at all**, and that is
  the spec rather than a quirk: an element accepts a drop only if something
  cancels `dragover` over it. The old core never had to, because a
  `contenteditable` is a drop target the engine handles **natively** — and the
  model core suppresses exactly that, so the editor becomes an ordinary scripted
  target and has to say so. Missing from slice 5 as first written, and found by
  hand on 2026-09-21: drag and drop did nothing in Blink and WebKit while
  working in Gecko, which is the engines disagreeing about how much they will
  still do for a `contenteditable` that has stopped behaving like one.
  `dropEffect` is set alongside it, because the cursor has to promise what will
  actually happen — a move for a drag that started here, a copy for anything
  from outside, which we cannot remove from wherever it came from.
- **`htmlFragmentToMarkdown` is the Turndown half alone.** The old core's
  document conversion also appended the reference definitions, re-wrapped to
  the sniffed width and restored the opened file's bytes, and none of that means
  anything for a fragment from somebody else's clipboard. That conversion is
  `legacy-storage.js`'s now, for the old autosave alone; a fragment never had a
  `referenceLink` rule to resolve against (D18), so a pasted reference link
  comes in inline.
- **Both converters are feature-tested, and that is not defensive coding.**
  `front/input-check.html` deliberately ships no `app.js`, so there the HTML
  branch falls through to the plain text and the page says so. The questions
  that page exists to ask are untouched: does the engine hand over `text/html`,
  does cancelling stop the insertion, where does a drop land.

**Slice 6 gave it undo**, 2026-09-21 to 2026-09-28, and its protocol —
[tests/fixtures/undo-check.md](tests/fixtures/undo-check.md) — is clean by hand
in all three engines. It began with the one piece of it that is pure model:
`modelCloneDocument`, which is what an undo state is. Four things in it.

- **Not `structuredClone`**, which was the plan's word for it. It handles the
  cycle `parent` makes perfectly well and then hands back markdown-it's `Token`
  as a bare object — the structured clone algorithm's own rule for a class
  instance — so the renderer throws `token.attrIndex is not a function` on the
  first image or fence. Measured against the pinned 13.0.1, and reproduced
  through the suite by putting it back.
- **Every token is cloned and none is shared**, which the cheaper option loses
  on a fact rather than on taste: `modelSourceSplice` writes `token.content` on
  a fence, so a shared fence token would give back an undo whose `source` holds
  the old bytes and whose token holds the new — rendering the code the undo was
  meant to take back while a save files the code it did — and
  `modelVerifyRender` skips exactly the blocks with no inline tree, so nothing
  would report it. The saving was 0.19ms on `docs/TODO.md` and 0.23ms on this
  file, per step, against a 16.8ms render.
  **Superseded by step 7**: that argument holds against sharing with nothing
  protecting it, which is what was on the table here. It does not hold against
  sharing with a copy-before-write barrier, and the saving it weighed was time
  rather than space. A state shares its contents now and copies them on write.
- **Aliases are preserved rather than flattened.** A block's `inline` is one of
  its own `tokens`, and a `hiddenBefore` is a token out of the block before it;
  copied twice they can disagree about the `hidden` flag `modelFillItem` sets.
  A `Map` keyed on the original token makes the clone's token graph isomorphic
  rather than merely equivalent, which is one allocation and a property that
  survives a later slice adding an alias.
- **`parent` is rebuilt to point inside the clone**, and that is the one that
  half-works for a long time if it is wrong: nothing reads it until `modelTouch`
  walks up from an edited block, and then the edit clears the ancestors of a
  document nobody is showing while the one on screen re-emits its stale bytes.

**Step 2 gave `undo.js` the two seams**, same day, and with it Ctrl+Z works
under the flag. The branch between the two cores is exactly two functions —
`undoCaptureState` and `undoApplyState` — and everything else in that file is
core-independent and stays one implementation: coalescing, `UNDO_LIMIT`, the
redo branch, the ids `file-api.js` reads, `breakOnce`, park and adopt. A second
history in a second file was the other candidate and is worse for the reason
`app.js` has three doors: `undoReset`/`undoPark`/`undoAdopt`/`undoPosition` have
seven callers, and a second owner would make each of them ask which core is
running. Three things in it:

- **A state carries exactly one of `html` and `model`**, and **applying reads
  that rather than the flag**. So a state says which core took it and can only
  be put back the way it was taken; asking the flag again would make a state's
  meaning depend on when it is applied. The flag is asked once, in capture.
- **Applying installs a clone of the stored state**, never the entry itself —
  the next edit mutates what it installs, and the way that fails is undo, redo,
  undo, where the second visit finds what the first one left behind.
- **`modelRestoreDocument` is the model's half**, in `model.js` because
  `modelDocument` is that file's variable. It deliberately does not call
  `modelEnsureBlock`: every state came from a document that had already been
  through it, so calling it again could only append a block the state never had
  — a document the user never saw and cannot undo back out of.

**Step 3 gave it the caret**, same day. A state's selection is a
`(blockId, offset)` rather than a block, because a block reference would point
into the document the state is a copy of — the one the restore is about to throw
away. `modelRecordSelection` and `modelResolveSelection` are the two ends, and
the second is **resolved against the document being installed**, never against
the state: `undoApplyState` clones the state and resolves into the clone, so the
caret lands in the tree that is about to be rendered. Ids survive the clone, so
the way back is a lookup rather than a search for something that looks the same.
A block the document has not got gives null rather than a guess, and an end that
has gone leaves the caret that has not.

**What an undo restores is where the caret was when the undone edit began.**
The state that is current follows the caret on `selectionchange` until the next
edit pushes it, in both cores — `undoFollowCaret` in `undo.js`, which reads the
state's own shape rather than the flag. Until 2026-09-23 a state carried the
caret it was *taken* with, just after the edit before it, which is the same
place only when the caret never moved between. It had moved in the two cases a
hand run in Firefox tripped over: a click then an edit sent an undo's caret to
wherever the previous edit had left it, and the first edit after an Open — whose
state has no caret at all — sent it nowhere. That second one was the caret
half of the undo bug once filed as TODO 1.6, closed 2026-09-28. A caret outside
the editor does not count, and nor does one while an IME holds the text.

**An edit that rewrites what was just typed joins its step.** The macOS
press-and-hold accent types the vowel as a keystroke, waits on the popup well
past the coalescing window, then replaces it — so one Ctrl+Z took back the accent
and left a bare vowel nobody typed. `undoJoin()` merges the next edit whatever
its type and timing, and `modelInputRevises` decides when to call it: **the
edit's range sits inside what the last keystroke typed and ends where it
ended**, recorded in model coordinates and cleared by any other edit. Measured
on `front/input-check.html`: Firefox replaces the vowel with an `insertText`
over it, Safari with an `insertReplacementText` over it. Two guesses came first
and both were wrong — a composition (neither engine starts one), and *a range
while the selection is collapsed* (failed in Firefox, most likely because macOS
marks the vowel while the popup is up) — which is why the rule reads the model
rather than the selection. The composition hook is kept for an engine that does
it. The join is set only after the splice succeeds, so a refused edit cannot
leave one standing.

**A text edit that carries no text is refused, not treated as a deletion.**
Safari's `insertReplacementText` has `data` null and its text in
`dataTransfer`, where the specification puts it for that type. Reading `data`
alone turned the accent popup into a Backspace that erased the letter.

**Step 4 routed the engine's own undo gesture.** `historyUndo` and
`historyRedo` arrive as `beforeinput` — the macOS trackpad swipe, a context
menu, a mobile keyboard's own button — and were cancelled and routed nowhere,
which is the right default for a type nobody has claimed and the wrong one for a
pair meaning exactly what Ctrl+Z means. They now reach `undo()` / `redo()`,
**feature-tested** for the same reason slice 5's converters are:
`front/input-check.html` ships no `undo.js`, because undo is the application
around the input layer rather than the layer, so there the route finds nothing
and does nothing rather than throwing and taking the protocol with it. The
keyboard stays the mechanism and this is a bonus entry point.

**And the bonus is never collected, on the desktop.** Measured on
`front/input-check.html` — always the model core, flag or no flag, which is what
makes the reading this core's — in Chrome, Firefox and Safari on 2026-09-21: **no engine raises `historyUndo` at all**,
from its own gesture or after a Ctrl+Z. Safari says why and the reason
generalises — its *Edit → Undo* is **disabled**, because every `beforeinput` is
cancelled, so the engine never edited anything, so its own stack is empty and it
has nothing to raise. A consequence of the design rather than a quirk, which is
why all three agree. So no suppression for a double-fire was needed, the route
stays for a mobile keyboard's own undo button and for an engine that changes its
mind, and the check page's step is a regression check rather than an open
question — the same shape `paste-check.html` reached. The consequence worth
knowing: under the model core Ctrl+Z is the only undo, since the browser's own
menu item is dead.

**Step 5 was the tab switch, and it needed no code.** `tabs.js` parks a bundle
and adopts a bundle and never looks inside one, so a state changing shape from
an HTML string to a model clone reached it as nothing at all. That is a source
scan now rather than a fact about today — only `undoPark` and `undoAdopt` are
called, no state field is named, and `adoptActive` still loads the content
before adopting the history and the history before the file. `undoBreak`'s one
caller is already unreachable under the flag, which was also checked rather than
assumed: both paste menu items branch on `modelOwnsInput()` first and the
editor's own `paste` listener returns early.

The switch is where **step 3's choice pays**. This stage re-parses on adopt, so
the document on screen after a switch is a different *object* from the one the
parked bundle's states describe, with its own ids — and a state's caret resolves
inside the state's own clone, so that cannot matter. Resolved against the live
document instead, the ids would be another parse's.

**Step 6 measured what a state costs, and one of the plan's claims did not
survive it.** A clone is cheap in *time* — 0.57ms on `corpus/todo.md`, 1.22ms on
`corpus/claude.md`, about 40% of a parse and a fraction of a 16.8ms render — and
expensive in *space*: **743KB and 1,610KB per state**, against the 51KB and
119KB HTML strings it replaces. **Fourteen to fifteen times**, or roughly 15KB
of state per KB of markdown, which means `UNDO_LIMIT = 100` is 73MB and 157MB
**per tab**. That constant's own comment says it is sized so "a large document
cannot run the tab out of memory", and that was calibrated against strings.
Where it goes, on `corpus/claude.md`: tokens 62%, inline nodes 32%, blocks 5% —
the inline layer is 94% of a state.

**Step 7 made a state share what the edit did not touch**, which is what the
measurement turned into. `modelForkDocument` copies the document's **outline** —
which blocks exist, nested in what, and every affix each records — and **shares
its contents**, the inline tree and the parser's tokens, marking every block it
walks `shared` on the way past. `modelUnshare` is the other half: before
anything writes to a block's contents, that block gets its own. **84KB per state
where the copy was 1,610KB**, 0.068ms where it was 1.22ms, and 8.2MB for a
hundred states where the old core's HTML strings are 11.6MB — so the 2026-09-19
claim that this is cheaper than what ships is finally true.

Four things about it:

- **The barrier is the rule, plus six exceptions.** `modelTouch` is where every
  content change is supposed to pass, so the barrier goes there. Six functions
  write to a block's contents *before* calling it — `modelInlineSplice`,
  `modelSplitLeaf`, `modelInsertBreak`, `modelMergeBlocks`, `modelSourceSplice`,
  `modelInsertBlocks` — so those carry their own, each confirmed by removing it
  and watching the sweep fail. `modelTouch`'s own is the only one whose removal
  fails nothing; it stays for the path nobody has written yet.
- **The outline is deliberately still copied.** Sharing it would take a state to
  almost nothing, but `parent` is in it, and one block cannot be the third item
  of a list in one state and a top-level paragraph in another. That means
  removing `parent` and rewriting the 42 places that ask it — the expensive
  half, for 5% of a state.
- **It re-opens what step 1 recorded as settled.** Step 1 chose to clone rather
  than share, on correctness (`modelSourceSplice` writes into a token in place,
  so a shared token lets a later edit reach backwards into an older state) and
  on a *time* measurement. Both true; neither covered sharing with a
  copy-before-write barrier, which is exactly what removes the hazard it named.
- **The check that proves it had to be fixed twice.** Comparing a state's
  *serialised bytes* is vacuous — an untouched block emits its `source` and
  never consults its contents — so the sweep passed with the barrier removed
  entirely. It compares the state's **rendering** now, and two of its edits were
  silently doing nothing, so it also checks that each edit changed its own
  document first.

**Slice 7 has begun**, 2026-09-28: the formats, the keyboard, and the
renderers. Its first two steps are in. Step 1 shut three doors that edited the
DOM without the model knowing: Code, Insert TOC and Link…. They do nothing
under the flag until their own steps build them. Step 2 made maths survive a
render, and that is an architectural fact worth knowing from outside:
**`modelRender` and `modelRerenderBlock` hand what they built to
`renderAfterModel` in `renderers.js`**, through `modelDecorate`, after the build
and before the selection is applied. It puts back a copy of the stamped
`mjx-container` an earlier render typeset, by source, before anything is
awaited, so a render never paints a frame of TeX. Every equation and its
`<span data-math>` wrapper are uneditable, and an equation at a line's edge gets
a caret stop from the DOM builder (`modelPlaceStops`), which every walk counts
as nothing and a save drops. Step 2 handled Mermaid diagrams as well, until they
were removed on 2026-10-01. **Step 10 lets an equation be typed**, on probation:
`$x^2$` typed into a paragraph stays literal until the caret leaves it, then
converts, judged by `mathSpan` — the parser's own function — so typing and
reopening cannot disagree. The conversion is its own undo step and an undone
one stays text, and Backspace into an equation reveals its source instead of
deleting it, which under the model core reverses the one-press delete described
above. **Step 3 made bold, italic and strikethrough model commands**:
`modelSetMark` rebuilds one block's tree with one mark kind given or taken, and
**the parser judges the result** — the block's new inline source goes back
through `md.parseInline`, and a tree the parser does not read back exactly is
fixed at its edges or refused, never written. `applyFormat` calls
`modelInputFormat` for the three under the flag; a bare caret sets a pending
mark for the next letters typed, and typing over a selection keeps what the
selection was marked with. **Step 4 did inline code and the link** the same way:
`modelWrapRange` puts a new container around a range, under the marks that
cover all of it, and the parser judges what comes out. **Step 5 did Paragraph,
Heading 1–6 and the code block**: `modelSetHeading` changes a block's kind and
keeps its id and inline tree, and `modelMakeFence` / `modelUnfence` turn whole
blocks into one fence and back, adopted into place the way a pasted fence is.
**Step 6 did the lists**: `modelWrapList`, `modelUnwrapItems` and
`modelSwitchList` keep the paragraphs they move as the same blocks, and
**`modelSettleLists` lets the parser decide what is tight or loose**, refusing
any operation it would read as a different shape. **Step 7 did the rule, the
table of contents and Clear**, the first two run on a fork through the same
shape check. **Step 8 bound Ctrl/Cmd+B and Ctrl/Cmd+I** under the flag, which
is TODO 1.7 for the model core, and made the Edit menu's Cut and Copy go
through the model's own clipboard handler: `runCommand` lets `copy` alone
through, and Cut is that copy plus the model's deletion. Step 9, the hand pass
over the whole slice, is what is left of slice 7.

**Stage 3's slice 1 gave it the blockquote**, 2026-10-27 to 2026-10-30: Format → Blockquote
toggles one quote over the selection, and Enter and Backspace at a quote's edge
are the empty-item rules' twins. **A wrap or an unwrap is done as text and
parsed again**, which is the one place the model re-parses a block it already
holds: the top-level block holding the change is emitted, `> ` goes on or comes
off each line at the column its outer containers end, and `modelParse` reads it
back with the document's reference definitions in its env — then every leaf
takes the id of the leaf it replaces, and a parse that hands back different
leaves is a refusal. It is done that way because a quote inside an item splits
its prefix between `quotePrefixes` and `leadingAffix`, and the parser already
knows how. **The Backspace rule is also on `keydown`**, because WebKit raises no
`beforeinput` for a Backspace at the very start of the document. **The Format
menu checks every format that is not plain text** — the marks, Code, Heading
1–6, both lists and Blockquote — so it says what the caret is in; a new control
for something that is not plain text gets its check with it, and
`modelBlockState` is the model's answer for the block formats.

**Slice 2 gave it the image**, 2026-10-30: Insert → Image… puts one in at the
caret, or edits the one image selected, through `askForInput`'s `fields`. Its
token comes from the parser, the stage 2 rule for every atom, and the parser
checks the block it lands in. **A click on an image selects it**, under the model
core, because only Gecko does that itself. An image gets no menu check: like an
equation, the caret is never inside one. **An image is drawn inline**, as
markdown has it, and `app.css` must not make it a block again: a block image
takes a line of its own and the caret beside it draws on the line above or
below, which the Firefox hand run found on 2026-10-31.

**Slice 3 gave tables a formatter** — `formatMarkdownTable` and
`sniffTableConvention` in `markdown-style.js`, under Save fidelity below — and
**slice 4 gave cells the caret**, 2026-10-31. A row's `children` are its cells,
of kind `cell`, each with the parser's three tokens and an inline tree and **no
`source`**: `td_open` has no `map`, so the row is still the floor for bytes and
the cell is the floor for text — the one place children do not tile their
parent, which the `model` suite's tiling walks exempt by name. So a touched
table is the one container `modelEmitBlock` hands to `emit` whole, and
`modelEmitTable` writes it: a table that keeps to a convention, recorded at
parse with each line's prefix, is laid out whole by the formatter, which gives
every untouched row back byte for byte unless a column widened; one that keeps
to none keeps its untouched lines and writes the edited row alone. In a cell,
text, the deletes, marks, code spans, links, images and equations work; a
deletion across cells empties what it covers and never merges; the block
formats are refused with a notice; Shift+Enter does nothing; and a paste or
drop is flattened to one line — by `modelCellBlocks` for anything that arrives
as blocks, and by joining the lines with a space for Paste without formatting.

**Slice 5 gave tables their structure**, 2026-11-01: Insert → Table (three
columns, a header and two body rows, in the convention the document's other
tables keep), and ten Format controls — row above and below, column left and
right, delete row, column and table, and three alignments that show the caret's
column. They are disabled outside a table. Tab and Shift+Tab move through the
cells and select the content, Tab on the last cell and Enter on the last row
add a row, and Backspace at the start of the paragraph after a table goes into
the last cell. Four things are decisions rather than details. **A new row or
cell is taken from the parser** as a template table of the right width, never
built by hand. **The parser judges every result**: each command writes the table
the way the emitter will and parses that, and a grid that does not come back is
a refusal. **A structural edit writes the whole table** — in its convention, or
in the formatter's default with `tableLines` null, since a row's index no
longer names its line — and **a table with a row longer than its header refuses
all of them**, because its extra cells were never shown and the rewrite would
drop them from the file. And **a table that arrives by paste or Insert works its
line prefixes out from where it sits** (`modelTablePrefixes`): the recorded ones
belong to the document it was parsed in, and a pasted table written with them
lost the `>` of the quote it landed in. WebKit reports Shift+Enter in a cell as
`insertParagraph`, so the input layer remembers a shifted Enter keydown.

**Stage 3 closed on 2026-11-07**, with a hand pass of its sections in Firefox
on one document ending in a Save As and a reopen. Stage 4, reintegration, is
next, and the irreversible merge to `main` comes at its end.

**Stage 4 put the model in charge of the file**, 2026-11-07 to 2026-11-14 —
reintegration, in seven slices, each in REWRITE.md. What it changed from
outside:

- **The model writes the file.** Save, Save As, Download and Copy markdown ask
  `documentMarkdown()`, which is `modelDocumentMarkdown` over the current
  document, and a document the emitter refuses is reported rather than written
  (slice 1). Every file operation binds its tab and its model when it starts,
  and refuses to read or write once the screen has moved on, so an action
  cannot land in another tab's document (slice 3, decision 4).
- **The exports start from the model.** The editable export carries its
  document as markdown in `<script type="text/markdown" id="app-document">`,
  and the static, PDF and Word exports clone the editor through
  `modelExportClone`, which strips the renderer's view markup (slice 2).
- **The autosave is markdown, and the flag is gone** (slice 4). The old HTML
  autosave is converted once by `legacy-storage.js`, which takes the source
  itself for a document nobody edited (decision 2) and keeps nothing to undo
  the conversion with (decision 3).
- **The old core is deleted** (slice 5), and its check pages and the server's
  test routes with it (slice 6).

### Links and heading anchors

markdown-it does not slug headings — that is GitHub's extension, not CommonMark
— so `[x](#section)` arrives pointing at an element that does not exist. Two
different mechanisms fix that, because the two outputs have different powers:

- **In the editor** (and the editable export), `headingAnchors(root)` in
  `app.js` resolves slugs against the live DOM on every Ctrl/Cmd+click. Nothing
  is stamped, so an id cannot go stale when a heading is edited.
- **In the static export**, there is no JS at all, so `documentBody()` in
  `static-export.js` calls `headingAnchors(clone, true)` to write real `id`
  attributes into the markup. It stamps the *clone*, never the editor, so
  nothing reaches Turndown.

`outline.js` is a third consumer: it builds both the sidebar and the inserted
TOC out of `headingAnchors`, rather than slugging headings a second time, so the
outline and the editor's own Ctrl+click resolution cannot disagree about what a
heading is called.

That is a second cross-file dependency on `app.js` alongside `slugifyTitle` —
`static-export.js` must stay after `app.js` in both `index.html` and `ASSETS`,
and after `outline.js` for the same reason.

Two traps here, both of which write into the user's file if you get them wrong:

- **`anchorSlug` is not `slugifyTitle`.** The filename slug strips non-ASCII and
  truncates at 50 characters, so it would slug `## Ünïcode Heading` to
  `ncode-heading` and never match the `#ünïcode-heading` link markdown-it wrote.
  They look interchangeable and are not.
- **The Ctrl+Click hint is a CSS variable, never a `title` attribute.** Turndown
  serialises a link title into the markdown as `[text](href "title")`, so
  stamping tooltips onto links would write them into the document on save.
  `app.js` sets `--link-hint` on `documentElement` and `app.css` draws it with a
  `:hover::after`, which never enters the DOM. The rule is scoped to
  `#editor[contenteditable="true"]` so the static export — where links are
  ordinary links needing no modifier — does not advertise a shortcut.

Autosave writes the model's markdown to the open document's `markdown` key on a
1s debounce — separate from, and unaware of, the file on disk.

**Every storage key naming part of the open document goes through
`documentKey(name)` in `app.js`, never a literal.** There are five —
`markdown`, `path`, `dirty`, `mtime`, `dir` — and `DOCUMENT_KEYS` in `app.js`
holds the flat names they have while Mandy holds one document (`mandy-markdown`,
`mandy-current-file` and so on). `markdown` replaced the old `content` (the
editor's HTML) and `source` (the markdown it was opened from) in stage 4's slice
4, under a new name so that no stored document is ever asked which it holds.
**Every reader goes through `storedDocument()`**, because a document
`legacy-storage.js` converted on this load but could not write is held in
memory there. [tabs.js](front/tabs.js)
scopes them to the active tab when it is loaded; without it — an exported
document, and the test suites that boot the same modules without it — the flat
names are what everything resolves to. One indirection in one place, so the
single-document path stays the fallback rather than becoming a second
implementation.

`tabs.js` owns which documents are open, which one is showing, where each is
persisted, and the bar that draws them; none of the state itself lives there. It joins two of the three
registries below — `index.html` and `SHELL_ASSETS` — and deliberately not
`ASSETS`: an exported document holds one document and has no file API. Its place
in the load order is load-bearing in both directions: after `app.js`, which
defines `DOCUMENT_KEYS`, and **before `file-api.js`**, which reads the open
file's path out of storage at its own load time and so has to be handed the
active tab's key by then.

**The swap is where a tab costs more than a key prefix, and two orderings inside
it are load-bearing.** `switchToTab` gates on `tabsSwitchAllowed()`, then
`flushAutosave()` — while `documentKey` still resolves to the *outgoing* tab,
since the timer resolves its key when it fires and a flush after the flip would
write the outgoing document under the incoming tab's name — then parks the
history, file and style bundles and **the model itself** onto the outgoing
record, flips `activeTabId`, and only then puts the incoming document on screen
and adopts. A parked model is rendered as it stands, with no parse, so it comes
back as the same object its history's states were forked from; a tab never
shown this session is loaded from its stored markdown. **Content before adopt**: `undoAdopt` trusts the
bundle to describe what is on screen and never re-snapshots. **Undo before
file**: `cleanPosition` is an id minted inside one history bundle, so the file
state has to land on top of the history it was measured against, or a dirty
document reports clean — which switches off the unsaved-work guard and the
`beforeunload` warning together, and only when two tabs' edit counts line up.

A tab this session has never shown — one restored from a page load — is an id
and five storage keys, with no parked bundle and no undo history, which does not
survive a reload. So an adopt with no bundle hydrates from storage instead:
`loadDocumentMarkdown` sniffs the style from the stored markdown, and
`fileAdoptStored()` is the load-time restore reused rather than a second
reading of the same keys, which is why
`restoreCurrentFile` is a function with two callers rather than the IIFE it was.
`closeTab` is the one operation that neither parks nor flushes: the document is
being thrown away, and flushing would write it straight back under the key the
close has just removed. It asks nothing either — `confirmDiscard` reads the
*active* document's flag and filename and cannot ask about a background tab at
all, so guarding a close belongs to whatever offers the close —
`requestCloseTab`, which switches to a dirty tab before asking about it.

**The bar is redrawn whole, from `renderCurrentFile()`.** That function is
already file-api.js's single "the active document's identity changed" hook, so
the dot cannot fall out of step with the flags without every other consumer
falling out of step too. Each tab's name and marks come from `tabDescriptor`,
which reads the live modules for the document on screen, the parked bundle for
one this session has shown, and the tab's own storage keys for one restored by a
page load — three sources, one shape. A session whose migration failed has no
list at all and still gets one tab standing for its one document, without a
close on it: there is no list to take that document out of, and a control that
cannot do its job is worse than an absent one.

Moving an existing document onto tab storage happens once, in `tabs.js`, and it
copies, reads each value back under its new name, and only then deletes the
originals. `localStorage` offers no transaction, a blown quota does not always
announce itself by throwing, and a half-migrated document whose source of truth
has already been deleted is the one outcome here that destroys the user's work.
A failure anywhere rolls back the partial copies and leaves the session running
on the flat names — one document, no list, nothing lost — rather than on a tab
list pointing at storage the document is not under.

### The document versus the file

A page load restores the document from autosave, never by re-reading the file,
so the two can drift apart from either end. `file-api.js` tracks both directions
and hands them to the bar through `fileDescriptor()`, which draws them as one
dot on the tab: red for edited, the toolbar's own text colour for
disk-changed-only, nothing when clean. The sentence the old `plan.md (edited,
disk changed)` label spelled out lives on as the tab's `title` and `aria-label`,
because colour on its own is not a signal everyone can read.

The two marks part company on one case, and the label used to get it wrong.
Disk-changed is meaningless with no file open — there is nothing to be out of
step with — but *edited* is not: unsaved work in a document that was never saved
anywhere is the most urgent version of it, and `beforeunload` has always said so.
The label gated both on a path only because with no filename on screen there was
nothing for "(edited)" to attach to.

- **Our edits** are `isDirty`, set from the editor's own `input` event —
  compared against `cleanPosition`, undo.js's id for the state as of the last
  open, reload, save or clear, rather than latched true forever. That is what
  lets undoing an edit back to that exact position read clean again instead of
  the flag only ever being set, never cleared: `markClean()` in `file-api.js`
  records the id, and undo/redo reaching it back is indistinguishable from
  never having left, since `undoPosition()` hands back an id an edit mints once
  and undo/redo reuse rather than a stack index that `UNDO_LIMIT` can recycle
  into naming a different state. It differs from asking "does the content
  match" on one case, deliberately left alone: type a character and Backspace
  it and the id has moved on even though the text has not, so the document
  still reads dirty.
- **Everybody else's** are `fileMtime`, the mtime the file had when we last read
  or wrote it. `GET /api/file` returns it; `?stat=1` returns *only* it, which is
  the call `checkDiskChanged` makes on window `focus`, on `visibilitychange`, and
  once at startup — a page load has already missed the `focus` event for the tab
  it loads into.

Both flags are persisted (the `dirty` and `mtime` keys) and restored only
alongside the content, for the same reason the path is: autosave carries unsaved
edits across a browser reload, and a baseline that reset to null would make the
first check call a file nobody has touched changed.

Setting a new baseline always clears the changed flag, because `openFile`,
`reloadFile` and `saveFile` are exactly the three moments the document and the
file are back in step. A document restored from before this shipped has no
baseline, and `checkDiskChanged` stays silent rather than inventing one — we do
not know when that document was read.

The flag has teeth in one place: `confirmOverwrite` re-stats before a save that
would write over the open file, because overwriting a file that moved on destroys
whatever moved it and Mandy has no merge to offer. A Save As to any *other* path
is not gated on it — the baseline says nothing about a file we never read.

`reloadFile` is the discard path as much as the refresh one, so it is the one
action that confirms when there are edits to lose. It has no keyboard shortcut:
Ctrl+R, Ctrl+Shift+R and F5 all belong to the browser.

### The unsaved-work guard

`confirmDiscard` in [file-api.js](front/file-api.js) is the single gate in front
of every action that throws the open document away — Open, Reload and closing a
tab. **New is not one of them any more**: in the app it makes a tab, so nothing
is discarded and nothing is asked. It still resets in place in an exported
document, which ships no `tabs.js` and has nowhere to put a second document —
and no `file-api.js` either, so what it asks there is the plain question below
rather than this guard.

**Closing a tab asks by switching to it first.** The guard reads the *active*
document's dirty flag and filename, so a background tab is a subject it cannot
name; `requestCloseTab` in `tabs.js` makes the dirty tab the active one and then
asks the question unchanged, which is why there is no second implementation and
no extra parameter. A clean tab closes with neither a switch nor a dialog. Before it, the three
disagreed: Reload asked, Open replaced the document with no check at all
despite calling the identical function, and New/Clear asked a question whose
wording read the same whether it was about to discard an untouched welcome
document or an hour of work. The presence of a dialog was therefore a bad
signal about how much was at stake, which is worse than no dialog.

Four things about it that are decisions rather than details:

- **Three buttons, not two.** A yes/no asks the user to choose between losing
  their work and abandoning what they were doing, when what they want is almost
  always neither. This is the case `ask()`'s arbitrary action list was built for.
- **Dismissing is cancelling.** `dismiss: "cancel"` is passed explicitly, so
  Escape, the backdrop and the close button all abandon the action rather than
  agreeing to discard. Get it backwards and a stray keypress destroys the work
  the guard exists to protect.
- **Save must report whether it saved.** `saveCurrentOrPrompt` and `saveFileAs`
  return booleans for this reason alone: an unnamed document opens the save
  dialog, an overwrite of a file that moved asks again, and the write itself can
  fail. In each of those the edits are still unsaved, so the action waiting on
  the save must not go ahead either. The `file-path` suite drives exactly that
  path with a queue of dialog answers.
- **New picks one dialog or the other, never both.** The guard's question
  already says everything the plain one does and adds the filename and a Save
  button, so a dirty document gets the guard and a clean one gets the plain
  question. Asking twice would only teach the user to click through the first.

Two of the four guards do not go through it. `confirmOverwrite` is about
somebody *else's* work rather than the user's, so it asks its own question — but
it gained the same third button, Save as…, which is the only answer to "your file
changed underneath you" that does not require someone's work to be lost. It
cannot recurse: the new path is not `currentFilePath`, so the staleness check
returns early. And `beforeunload` in `app.js` cannot use `ask()` at all, because
the browser will not wait on a Promise — it sets `returnValue` from
`documentIsDirty()` and takes the browser's own wording. It asks
`tabsBackgroundDirty()` as well: the question is whether anything would be lost,
not whether the document on screen would be, and a window shut over an unsaved
background document is the same loss either way. Which tab it is cannot be
named, since the string is the browser's.

An exported document ships no `file-api.js`, and has no file to be dirty against.
Both call sites in `app.js` therefore feature-test (`typeof confirmDiscard ===
"function"`) and fall back to the plain question. That is an honest absence
rather than a second implementation of a flag with nothing behind it.

**New and Clear are two different weights, not one action with two names.**
Clear used to be both: it emptied the editor *and* dropped the autosave, the
sniffed style and (via `file-api.js`'s `"new"` hook — see below) the file
association, guarded by the dialog above. That is the right behaviour for
starting a document over, and the wrong one for emptying the document you have
open, which should read like Ctrl+A then Delete: the content goes, the file
you're editing doesn't. So New kept all of Clear's old weight — same handler
body, same guard, same reset — and Clear became an ordinary edit:
one model edit (`modelInputClear`), which raises `input` the same way typing
does, so it undoes as one step and needs no dialog of its own.
Clear no longer touches `file-api.js` at all — nothing it does can leave a
filename pointed at the wrong content, so there is nothing for that module to
guard.

That weight has since moved again rather than being lost. In the app New makes a
tab, and the body it used to run is `resetDocument()` in `app.js` — the reset
primitive an exported document's New still calls. `file-api.js`'s `"new"` hook
returns early when `tabs.js` is loaded: it exists to drop the file association
after an in-place reset, and there is no in-place reset left for it to follow.

### Save fidelity

D1 is the promise: **a saved file gets its own bytes back**, and an edit costs
the diff of the edit. Under the old core that took three layers of repair around
Turndown's house style; under the model it is mostly structural, and the repair
layers survive only inside the old autosave's conversion.

- **An untouched block is its source.** Every character of a file is in
  exactly one block's `source` or `separator`, and `modelSerialise`
  concatenates them, so a block nobody edited goes back as the bytes it was
  parsed from — not because anything restored them, but because nothing threw
  them away. `modelTouch` is the one door to `source = null`, and it walks up,
  so only the edited block and its containers are re-emitted, and a container
  re-emits from its children rather than around them.
- **An edited block is composed from what it recorded.** Each node keeps its
  spelling as written — a mark its delimiter, a heading its ATX or setext
  shape, an item its marker and continuation indent, a quote its `>` chain per
  line, a hard break its two spaces or backslash — and `modelEmitLeaf` puts the
  affixes back around the inline source. So a block written the minority way
  keeps its own spelling when edited, which closed TODO 2.3.
- **New content follows the document as it is now** (stage 4's decision 1).
  `sniffMarkdownStyle` in [markdown-style.js](front/markdown-style.js) reads the
  conventions the document follows — rule character, bullet marker and pad per
  nesting depth, emphasis delimiters, ordered-list delimiter and numbering,
  autolinks, the hard-break spelling, table convention and wrap width — every
  time a document arrives, including from the autosave, which holds the
  document as it now stands. A new mark takes the delimiter the document's own
  marks already use most, counted off the model's tree.
- **Re-wrapping is one block's, and only a line the edit made too long.**
  `modelEmitLeaf` hands an over-long composed line to `wrapMarkdownLine` with
  the prefixes it recorded at parse, at the sniffed width. Never a heading,
  never a line carrying maths, never a line already inside the width. The width
  is measured, not assumed: `sniffWrapWidth` takes the **95th percentile** of
  prose line lengths and gives up (width 0, no wrap) on a file with fewer than
  three wrapped paragraphs, fewer than ten prose lines, or a result outside
  40–120 columns — so a file like README.md that is not hard-wrapped is never
  wrapped. A break never strands a `#`, `-`, `1.`, `>` or `---` at the start of
  a line, where it would reparse as a block marker.
- **An edited table is laid out in the document's convention** by
  `formatMarkdownTable` — compact, one-space or padded to width, with or without
  edge pipes — read by `sniffTableConvention` **by reproduction**: a table keeps
  to a convention when the formatter writes it back byte for byte, and one that
  keeps to none is not guessed at. A table that keeps to none keeps its
  untouched lines and writes the edited row alone. That is TODO 2.1.
- **A reference link stays a reference.** `referenceAwareLink` in
  [markdown-parser.js](front/markdown-parser.js) replaces markdown-it's own
  inline `link` rule — a near-verbatim copy of markdown-it 13.0.1's, so **an
  upgrade of the CDN markdown-it needs this diffed against the new source** —
  and stamps the label a link resolved through as `data-ref-label`. The model's
  emitter writes `[text][label]` off the stamp when it rebuilds a link, if the
  document still defines the label (`modelReferenceLabels`, which asks the
  parser, so a definition wrapped onto a second line counts); otherwise the
  inline form. A definition is an ordinary block in its own position, so it
  stays where the author put it. **A reference *image* is the one thing this
  cannot reach**: the stamp is on links only, so an edited image resolved
  through a reference comes back inline.

**One category is deliberately exempt: whitespace nobody can see.** D3 is the
argument. U+00A0 is normalised to a plain space at the boundary — typed text in
`modelNormaliseTyped`, pasted HTML in `normaliseNbsp` before Turndown, which
also lets the code-span shield see a trailing space — and the engine can no
longer write one in place of a trailing space, since it writes nothing.
`sanitisePastedHtml` drops the empty inline wrappers and blank `<p>`/`<div>`
blocks a paste brings in. It is targeted rather than a round-trip through
markdown, so a pasted page keeps its bold, links and tables; and
`isGhostElement` treats `<br>` asymmetrically on purpose — a `<p>` or `<div>`
holding only one *is* the ghost line Word and Docs emit, while inside an inline
element it is a real break. The predicate is a pure function because the test
stub has no HTML parser, so the decision is testable and the walk is not.

**Turndown converts what arrives as HTML**, and nothing else: a paste, a drop,
and the table of contents. Its rules in `app.js` exist because Turndown 7 ships
no GFM: `table` and its helpers (laying a pasted table out in the document's
convention, with U+0000-marked pieces handed up from the cell and row rules),
`strikethrough`, a `listItem` that takes the pad and numbering from the
document, `autolink` (gated on the sniff, and on a scheme, since `<notes.md>` is
not an autolink), `mathjax` (an equation copied out of a document comes back as
its stamped TeX) and `modelFiller` (the renderer's caret stops and filler
`<br>`s are not content). There is **no `referenceLink` rule** on it — D18: a
pasted fragment is parsed with no definitions, so a reference would come back as
literal brackets.

**The old core's three layers live on in
[front/legacy-storage.js](front/legacy-storage.js)**, for the one-time
conversion of an old HTML autosave and nothing else: the sniff, the
whole-document `reflowMarkdown`, and the restore layer (`indexMarkdownBlocks` /
`restoreSourceWrapping`, which keyed every segment of the opened file on its
whitespace-insensitive content and handed back the original bytes of any that
still matched), with the reference scan and the `referenceLink` and `mermaid`
rules, which fire only while it converts. Its own comments carry the design as
it was. It is deleted when stage 5 closes.

[tests/fixtures/break-test.md](tests/fixtures/break-test.md) is the document
the hard-break and wrap behaviour is checked against, by hand or by
`open-edit-save.spec.mjs` — see Tests.

### Lazy loading

MathJax, html2pdf, docx and FileSaver load on first actual
use via the memoised loaders in [lazy-load.js](front/lazy-load.js). Only
markdown-it and Turndown load eagerly. Never add a top-level `<script>` for a
heavy library — add an `ensure*` loader.

`ensureMathSvg` is the odd one: MathJax's SVG output (`tex-svg.js`, same
package) in a hidden `<iframe>` of its own, for the pictures of equations the
PDF and Word exports carry (`exportEquationImages` in `renderers.js`). It cannot
share the page's MathJax — loaded beside `tex-mml-chtml`, the two outputs' font
data clash and it throws.

### The two HTML exports

There are two, and they are different deliverables:

- **HTML** ([static-export.js](front/static-export.js)) — the document alone as
  a standalone page, the same kind of artifact as PDF or DOCX. Inlines
  `app.css`, copies MathJax's runtime-generated `<style id="MJX…">` so maths
  lays out without MathJax present, strips `contenteditable`, and ships no
  editor JS at all. It is also the one place a
  table of contents is written into the document rather than drawn beside it:
  this file never goes back through Turndown, so nothing added here can reach
  anyone's `.md`. See the outline section below.
- **Editable** ([html-export.js](front/html-export.js)) — bundles the editor
  *with* the document so recipients can edit in-browser and send it back.
  **The document travels as markdown** (stage 4's slice 2): escaped in
  `<script type="text/markdown" id="app-document">`, with an empty editor, and
  the boot loads it through `loadDocumentMarkdown`. A file exported before then
  carries HTML in its editor instead and runs the bundle it was exported with;
  should this code ever meet one, the HTML goes into the model through the paste
  converter.

The static export, PDF and Word all start from `modelExportClone` in
`model.js`, which strips the model renderer's block ids, fillers, caret stops
and `contenteditable` from a copy of the editor. A new document export starts
there too, or the zero-width stop beside an equation reaches the file.

**Exported documents are self-reproducing.** They carry the export set a
document can travel on in — markdown, HTML and Editable — so the collaboration
chain survives more than one hop. The trick is that an exported file has no origin to fetch from but is
already carrying everything inline, so both export modules read the document
itself when it can: `static-export.js` takes the stylesheet from
`<style id="app-style">`, and `html-export.js` takes CSS *and* the whole bundle
from `<style id="app-style">` + `<script id="app-script">`, falling back to
`fetch` only when those are absent (i.e. when running in the app). Rename either
id and re-export silently degrades to a fetch of nothing.

**The exported document is a nerfed Mandy, not Mandy.** What ships is an editable
*document*; the application around it is the means, not the deliverable. Four
modules are deliberately excluded from `ASSETS`, for two different reasons.

The first two are excluded because the thing they drive does not exist in an
exported document:

- `file-api.js` — it drives the server-backed open/save, and an exported
  document has no server. It falls back to blob download instead, which is why
  `app.js` guards `downloadBtn` / `uploadBtn` / `fileInput` with existence
  checks, and why those two buttons are the only real split in the toolbar spec.
- `theme-manager.js` — it binds the theme toggle, which `toolbar.js` only
  renders for the `app` variant. Exported documents follow the reader's OS
  preference via the inline `THEME_SCRIPT` instead.

The other two are excluded because the formats they produce are dead ends:

- `pdf-export.js` and `docx-export.js` — nobody edits a PDF or a Word file and
  sends it back, so neither format extends the chain the editable export exists
  to keep going. They were 12% of the bundle inlined into every exported copy to
  produce artifacts that can never be exported *from*. Their `export-pdf` /
  `export-docx` items are `variants: ["app"]` for the same reason, and the two
  halves have to move together: drop the scripts alone and the items become dead
  controls, drop the items alone and the bundle carries dead weight. The toolbar
  suite catches the first, the self-reproduce suite the second.

  `ensureHtml2Pdf` and `ensureDocx` stay in `lazy-load.js`, which is a shared
  file with no variants — unreachable in an export rather than absent from it.

`outline.js` *is* in `ASSETS` — the sidebar needs no server — but an exported
document opens with it closed regardless of the author's stored preference, for
the same reason it ignores the author's theme: it is the reader's copy.

Both files build `</script>` from a constant rather than writing it literally,
for the reason documented at the top of `html-export.js`. They use *different*
constant names (`CLOSE` vs `DOC_CLOSE`) because top-level `const`s collide in
the shared global scope — see the load-order section above.

### execCommand

**There is none, bar one.** Until stage 4's slice 5 twelve of the thirteen
formats, paste and Tab-indent went through `document.execCommand`, behind one
door (`execcommand.js`) and a normaliser that fixed what each engine left
behind; D4 was the decision, and D19 retired it. The model core cannot use it:
`execCommand` fires `input` but never `beforeinput` (measured in Chrome 152), so
every call is a mutation the model can neither cancel nor hear about. The one
call left is the Edit menu's `execCommand("copy")` in `model-input.js`, which
edits nothing and raises the `copy` event the model answers — and the `notify`
suite's source scan allows exactly that one.

### The menu bar

There is no toolbar markup in `index.html` or `html-export.js` — both ship an
empty `<div class="toolbar">` and [toolbar.js](front/toolbar.js) fills it from
`TOOLBAR_MENUS`. **Add or change an item there and nowhere else.**

It was a row of sixteen buttons until it stopped fitting: four groups plus the
theme toggle, wrapping onto a second line below about 900px, with split buttons
bolted on where two actions had to share one slot. Six words — File, Edit,
Insert, Format, View, Export — hold 40 items and fit one line at 375px.

**Edit is the selection's menu, and that is what decides where the two markdown
clipboard actions live.** Once Edit gained an ordinary Cut / Copy / Paste /
Paste without formatting, *Copy markdown* and *Paste markdown* sitting beside
them made two pairs of near-identical names meaning entirely different things —
one pair acting on the selection, the other on the whole document. So *Copy
markdown* moved to **Export**, where copying the document as markdown is an
export to the clipboard rather than to a file, and *Paste markdown* moved to
**Insert**, which is what it does: it inserts at the caret, and has done since
it stopped replacing the document. Nothing was renamed — the menu each one sits
in is what tells them apart.

Cut and Copy go through the model's own clipboard handler: Copy runs
`execCommand("copy")`, which raises the same `copy` event Ctrl/Cmd+C does and
which the model answers, and Cut is that copy and then the model's own
deletion. `mousedown` is prevented over the bar, so the selection survives the
click. **Paste is the exception, and it is a browser restriction rather than a
choice:** `execCommand("paste")` is refused in web content, so the two Paste
items read `navigator.clipboard` themselves and hand what they read to
`modelPasteInto` / `modelPastePlain`, the same pipeline the editor's own
`paste` event reaches. Reading the clipboard is a permission the app may not
have, so both report failure by pointing at the keyboard, which never needed
it.

**The menus never give way to the path.** `.toolbar-left` does not shrink and
`.toolbar-right` may shrink below its content, which between them decide who
loses width when the open file's directory is long. Before 2026-09-21 both
groups shrank and a 60-character path clipped the menubar until *Insert* read
*Inser* — measured at 1024px. The menus are controls and the directory is
information, and `.toolbar-path` already knows how to ellipsise; it could not,
because its parent was not allowed to. Six words plus the theme toggle fit
375px, which is what makes the left group's refusal safe.

**`.toolbar` is one row now, in both the app and an exported document** — it
was two rows in the app until the chrome redesign (`docs/redesign/`, closed
out in CHANGELOG.md) moved the tab strip out to a sibling appended right
after `.toolbar`, on the page rather than inside the teal row. It is sticky
in its own right, pinned just below `.toolbar`: it briefly scrolled away
with the document instead, which read as the strip vanishing on any
downward scroll rather than as the feature the design doc called it.
`.toolbar` itself holds two
groups kept apart by its own `space-between`: `.toolbar-left` (the app mark
and the menus) always, and `.toolbar-right` (the open file's directory, then
the theme toggle) in the app only — an exported document has no file on disk
and no theme toggle, so it gets no right group at all rather than an empty
one. `toolbar.js` ships `#tabBar` empty and `tabs.js` fills it — the same
arrangement `.toolbar` itself has, and for the same reason.

There is no GitHub link. It pointed away from the app from a bar that should be
about the document, and it was the tallest thing in that bar.

**There is no app title.** It was an `<h1>` reading "Mandy Markdown Editor", it
cost a third of the bar's width to repeat what the tab already says, and it was
the page's only `<h1>` — which belongs to the document, not to the chrome.

Clicks are **delegated**: one listener on `.toolbar` dispatches by
`data-action`. Modules call `onToolbarAction("export-pdf", handler)` rather than
reaching for an element, so an item a variant does not render is an unused
registration instead of a listener bound to `null`. The handler receives the
item, and several handlers may share an action and run in registration order,
**each awaited before the next starts** — that is how `file-api.js` hooks
`"new"` on top of `app.js`'s own reset, and the await is what keeps that
working now that `app.js`'s handler stops on an `ask()` dialog. Drop it and
`file-api.js` runs while the question is still on screen, sees a document that
is not blank yet, and leaves the file association behind — pointing Ctrl+S at a
filename with nothing under it. Use `toolbarButton(action)` to find an item on
demand and `runToolbarAction(action)` to drive one from a keyboard shortcut.

Six things that are decisions rather than details:

- **The trigger carries `data-menu`, not `data-action`.** It is not an action:
  it belongs to the mechanism in `toolbar.js` rather than to any module. Give it
  an action and "every rendered action has a handler in this variant's bundle"
  stops being true — the trigger's handler lives in `toolbar.js`, which that
  check deliberately excludes. Same rule the old split caret followed.
- **`mousedown` is prevented over the bar.** Formatting acts on the editor's
  live selection, and a click that moved focus would take the selection with it,
  so every Format item would return having done nothing. The format bar's own
  buttons have always done this; the menu bar had to learn it. The click still
  fires — only the focus change is suppressed.
- **A `separator: true` entry is filtered by variant like any other**, and
  `visibleItems` collapses the leading, trailing and doubled rules left behind.
  Today's spec happens to filter cleanly in both variants, so nothing rendered
  exercises it — the toolbar suite drives the function directly instead, because
  the next app-only item added at the top of a menu strands a rule in the export
  variant and nobody would see it until they opened that file.
- **In-button feedback does not survive a menu.** "Saved!", "Reloaded!",
  "Copied!" and the two export spinners all used to live on the button that was
  clicked, and a menu closes on the click — so they are `notify` toasts now, and
  `flashButton` is gone. Anything new that wants to report on a click has the
  same problem and the same answer.
- **`--toolbar-height` is a plain fixed value, not a formula**, since the
  chrome redesign (`docs/redesign/`, closed out in CHANGELOG.md) moved the
  tab strip out of `.toolbar` to a sibling appended right after it — the row
  is the mark and the menus, and in the app the open file's directory and
  the theme toggle, none of which can make it taller than the `40px` both
  variants now share. It used to be a sum of two rows' worth of padding and
  font-size custom properties, and before that a per-variant
  `:root[data-variant="export"]` override shortened it for the export's
  one-row bar — neither is left to repoint now that both variants only ever
  had one row to begin with. The toolbar still ships empty and the two
  render-blocking CDN scripts still sit above `toolbar.js`, so the
  reservation is still what stops everything below jumping once the script
  runs; it is a literal now rather than a chain of variables, which is
  safer, not more fragile — there is nothing left for it to go stale
  against. The tab strip, being a sibling rather than part of `.toolbar`,
  reserves its own height separately through `--tab-bar-height`
  (`.tab-bar`'s `min-height`) — and is sticky in its own right rather than
  scrolling away, so `.outline`'s sticky offset reads both variables
  together (`calc(var(--toolbar-height) + var(--tab-bar-height))`). That
  brought the per-variant override back, just for a different value: an
  exported document has no tab bar at all, so `[data-variant="export"]`
  redefines `--tab-bar-height` to `0px` rather than the app's `36px`.
- **The theme toggle carries a `title`, and `theme-manager.js` moves it.** It
  is a two-segment sun/moon switch with no label of its own — CSS alone
  decides which segment is lit, off the same `data-theme` attribute
  `theme-manager.js` always wrote — and it is the only control left in the bar
  that is not a word. The title and the `aria-label` say the same sentence and
  are updated together in `updateToggleButton`; stamp one and not the other
  and the tooltip ends up claiming the opposite of what the switch will do.
- **`tocBtn` is the only stateful item.** `outline.js` writes `aria-pressed` on
  it by action, exactly as it did to the old toggle button, and `app.css` draws
  the checkmark from that attribute. Every item reserves the checkmark's gutter
  so the labels line up in a column.

Each item declares `variants`. There are three splits. The file group: the app
talks to the file server (`open-file` / `open-file-tab` / `save-file` /
`reload-file` / `save-as-file`), while an exported document has none and falls
back to `upload-md` / `download-md`. The theme toggle, since exported documents
follow the reader's OS preference rather than inheriting the author's stored
one. And PDF / DOCX, which are app-only because the formats are terminal — see
the two exports section above.

The variant is read from `#editor[data-exported]`, which only exported documents
carry. `app.js` strips that attribute on `window load`, long after `toolbar.js`
has run.

The rule to preserve: **an item must only exist in a variant whose bundle
includes the script that binds it**, or it renders as a dead control. The
editable export's `ASSETS` decide that, and `toolbar.js` must stay first in that
list for the same reason it is first in `index.html`.

Keyboard: arrows move along the bar and within a panel, both wrapping; Escape
closes and hands focus back to the trigger, and is a no-op when no menu is open
so a `notify.js` dialog still gets it. Hovering switches menus only while one is
already open — hovering a closed bar must not spring menus at you.

### The format bar

`applyFormat` in [format-bar.js](front/format-bar.js) is the one entry point —
the bar's own buttons and the Format menu both go through it for the ten the
bar can show; the menu is a second way to reach those, not a second
implementation of them, and reaches more (Heading 4–6, Blockquote) that only it
has room for — see the menu-bar section below. **It is a router**: each format
is a model command in `model-input.js` — the marks through `modelInputFormat`,
Paragraph and the headings through `modelInputBlockFormat`, the lists through
`modelInputList`, Blockquote through `modelInputQuote` and Code through
`modelInputCode` — feature-tested, so a bundle without the input layer does
nothing rather than editing the DOM behind a model that is not there. What a
format *does* is the model section's; everything interesting about *when the
bar is there at all* is the caret bar below.

**Ctrl/Cmd+B and Ctrl/Cmd+I are bound** (TODO 1.7, slice 7's step 8), with
`preventDefault`, because the engines disagreed about the key entirely:
measured 2026-09-10, Blink bolded, **Gecko on macOS opened its bookmarks
sidebar** and the page never saw the key, and WebKit did nothing. Taking the
key is what makes the shortcut work in all three, and `front/input-check.html`
carries the hand check that Firefox's sidebar stays shut.

**Every letter binding in `front/` matches a lowercased `key`, and that is a
rule rather than a style.** Caps Lock moves `event.key` and leaves `shiftKey`
alone, so a bare `=== "s"` stops matching the moment it is on and the keystroke
goes to the browser — which for Ctrl+S means Save Page As over a document Mandy
never wrote, with nothing on screen to say so. `undo.js` has lowercased since it
was written; `app.js` and `file-api.js` did not until 2026-09-22. It is `key`
rather than `code` on purpose: matching the physical key would also fix a
non-Latin layout, and would also give a Dvorak user Save on the key that types
`o`, which is a measurement nobody has made.

The Format menu also carries **Indent**/**Outdent list item** (TODO 1.1.3),
which do not go through `applyFormat`: they call `modelIndentAtCaret`, the same
model rule Tab and Shift+Tab reach.

**A heading targeting a list item is refused, not attempted.** `applyFormat`
checks for it before the model is asked (TODO 1.1.5's settled answer): a
heading nested in a bullet is expressible in both HTML and markdown, but not
something the editor should offer a way to make by accident.

**The bar appears at a bare caret too, and it is a different bar there.**
`showFormatBar` used to bail on `selection.isCollapsed`, so "make this line an
H3" with nothing selected had no route but the Format menu — a discoverability
gap rather than a functional one, since `applyFormat` never required a
selection. Three decisions settle what it does instead:

- **It appears only at the start of a row.** `atBlockStart` asks whether any of
  the block's text precedes the caret. Whitespace does not count, because
  nothing on screen tells it apart from nothing at all; and the question is
  about text rather than nodes, so a caret inside a `<strong>` that opens the
  line is still at the start. A caret dropped mid-line raises nothing — a bar
  that trailed the caret around the document would have no way to be dismissed,
  and it would be offering the same block formats the Format menu already
  reaches from exactly there.
- **It offers block formats only** — `CARET_FORMATS`: p, h1, h2, h3, ul, ol and
  code. Bold, italic, strikethrough and an inline code span have nothing to act
  on but selected text; at a caret they could only toggle *typing state*, which
  is a different affordance wearing the same button. `p` is in the list because
  it is the only way back out of a heading, and a bar that could make one but
  not unmake it would send the user to the menu for the return trip — which is
  the gap this variant exists to close.
- **So `code` means the block at a caret**: `modelInputCode` reads a bare caret
  outside a code span as the whole block. One button still, with the selection
  deciding which of markdown's two code constructs it means.

Three mechanics behind it, each wrong in a way that shows:

- **Buttons are hidden rather than removed**, and `collapseSeparators` takes
  the rules that no longer divide anything with them — the same problem
  `visibleItems` solves for the menu bar and the same answer. Dropping the
  inline group strands *both* of the bar's separators, which then render as a
  double gap instead of as a divider. Hidden rather than removed because the
  bar's markup is hand-written in `index.html` and again in `html-export.js`,
  so rebuilding it here would make this a third copy to keep in step. The
  `.format-bar [hidden]` rule is spelled out in `app.css` because
  `.format-btn`'s own `display: flex` beats the browser's
  `[hidden] { display: none }` — the property alone sets an attribute and
  changes nothing on screen.
- **The mode is set inside the measure-after-showing window.** Hiding three
  buttons changes the width every positioning line below reads, so `setBarMode`
  runs between `classList.add("visible")` and `offsetWidth` — for the same
  reason the class is added before the measurement at all.
- **An empty row has no geometry.** A collapsed range is zero-width by
  definition, and in the `<p><br></p>` a browser leaves after Enter it measures
  0×0 at the document origin — measured in Chrome, not assumed. `barRect` falls
  back to the block's own rect there, which is exact rather than approximate:
  the caret is at its start, so the block's left edge is the caret's. The caret
  bar is left-aligned to the row for the related reason — centring on a
  zero-width rect would clamp it to the window edge and leave it in the same
  place whichever row the caret was in.

`updateActiveButtons` needed the same split. A collapsed range touches no text
node — `intersectsNode` asks a boundary question there and the engines do not
agree on it — so `caretNodes` hands it the node the caret is in, or the block
itself when the row is empty and there is no text node to be in. That is the
whole answer rather than an approximation, since every format the caret bar
offers is an ancestor test.

**The caret bar stays up after a format; the selection bar still does not.** Its
formats compose — h2, then a bullet — and the caret has not moved, so the
condition that raised it still holds. It is re-shown rather than merely left
alone, because the row it points at has just changed height and its active
states have changed with it. If the command left the caret somewhere that is no
longer a row start, `showFormatBar` hides the bar itself, so there is one rule
about when it is up rather than two.

**A scroll takes the bar away, and the clearance it measures is the whole
chrome.** The bar is `position: absolute` with a `top` in document coordinates,
so a scroll carried it along with the text it points at — off the top of the
window, over the sticky toolbar and tab strip on the way, since it wins on
`z-index`. A `scroll` listener on `window` hides it, and the next
`selectionchange` puts it back where the selection now is: one rule about when
the bar is up, the same one the caret variant follows. Registered on `window`
without capture so the outline's and the tab strip's own overflow scrolling is
not read as the page's. The band it refuses to enter is `chromeClearance`,
which measures `.toolbar` **and** `.tab-bar` — it measured the toolbar alone
until 2026-09-22, which was right while the tab bar was a row inside it and
wrong the moment the redesign made it a sticky sibling, leaving the band 36px
short and the bar sitting on the tabs with no scrolling involved. An exported
document has no tab bar, so the `querySelector` misses and it contributes
nothing. **`scrollToAnchor` in `app.js` calls it too**, having had the same
one-element copy and parked Ctrl/Cmd+clicked headings under the tab strip for
the same reason. That is a cross-file call in the direction the load order does
not allow at load time, and it is fine because a click is long past load, so
the function only has to be *present* in the bundle.

**Code is the only format with both a block and an inline spelling**, and
markdown draws that line as sharply as HTML does: ` ``` ` fences a block, single
backticks span text inside a line. The choice is made from the selection rather
than from a second button, in `modelInputCode`: a range inside one block makes
a code span, and one inside a code span turns it back into text; a whole block,
several whole blocks side by side, or a bare caret make one fenced code block,
and a caret in a code block turns it back. Selecting two words used to fence the
whole paragraph, under the old core, before that split existed.

**The block formats act on the whole block from a partial selection, by
design.** There is no such thing as half a heading. Disabling them unless the
selection covered a whole line would read as a broken button, and every editor
people arrive from behaves this way. Code is the only one that reads the
extent, because it is the only one with somewhere else to go.

**`updateActiveButtons` reads the whole selection, not just where it started.**
It used to walk up from `selection.anchorNode` alone, so a selection spanning
both bold and plain text lit the Bold button up or left it dark purely on which
end of the drag the browser calls the anchor — never mind that neither answer
described the selection. It now collects every non-blank text node the range
touches (`textNodesInRange`) and asks the `FORMAT_PREDICATES` entry for each
button
whether *all*, *some*, or *none* of them carry that format — a text node's own
formatting cannot be partial, so per-node is the right granularity to fake a
selection at without a real editing engine, which is also why the test suite
drives it that way. All lights the button `.active`, same as before; none
leaves it dark; some is new, and lights it `.mixed` — outlined rather than
filled, so it cannot be mistaken for `.active` at a glance.

### The outline

The sidebar is chrome and lives **outside `#editor`**, and that is the whole
design. Everything inside the editor is the document — the model writes it on
every save — so a self-updating table of contents in there would rewrite a
block of the user's file every time any heading changed. A live TOC inside the
document would be a feature whose only output is the diff noise D1 exists to
eliminate. It would
also sit inside a `contenteditable`, where regeneration fights the caret.

**Insert TOC** is the honest version of the same idea, and it is a different
feature: it writes a nested markdown list once, and that list is then ordinary
content the author owns. It builds the list as HTML and converts it through
Turndown (`htmlFragmentToMarkdown`) into the model, after the caret's block. It
does not recognise a list it inserted before — nothing in markdown could mark
one — so a second invocation inserts a second list rather than guessing. Taking one back
is Ctrl+Z, which works: see the Undo section.

**Depth comes from nesting, not from the heading level.** People use headings as
a type scale, so a document may put three H6s under an H1 and follow them with
an H2; indenting by the number in the tag draws that as a five-deep staircase
with four empty rungs. `outlineDepths` runs a monotonic stack of the open
levels instead: a heading closes every heading open at its own level or deeper
and nests inside what is left. The stack is strictly increasing, so depth is
bounded by the number of *distinct* levels in play rather than by 6 — that
document maxes out at 2 — and nothing is invented, so one that opens on an H3
starts at 0. Equal levels are siblings; treating a repeat as a child would nest
a flat run of H2s forever. The outline reports structure and cannot divine
intent.

The two visual channels are deliberately independent: **indent is the relative
depth, type scale is the absolute level**. A stray H6 one rung under an H1
renders small beside a large one, so an inconsistent document reads as texture
rather than earning a warning nobody asked for.

`copyInline` decides what survives from a heading into an entry, by
**allowlist** — `em`/`strong`/`code`/`del`/`sub`/`sup` pass through, everything
else flattens to its text. The exclusions are the reason it exists: an `<a>`
inside a heading would nest anchors, which is invalid, and the browser unnests
them until the entry stops being a link at all. Maths in a heading flattens to
MathJax's rendered glyphs, which reads correctly and whose slug will not
resolve — a known limit, left alone.

Three more things worth knowing:

- **The nav element is built in JS, not written into markup.**
  `html-export.js` hand-writes the whole `.container` block too, so markup added
  to `index.html` would be a fourth registry that drifts silently. Same
  reasoning as the toolbar.
- **The open/closed state is stamped before the stylesheet loads**, in the same
  inline `<script>` in `index.html` that sets the theme, and the grid column is
  sized from `--outline-width` rather than from the nav's content. Both exist so
  the editor does not render full-width and then shift once `outline.js` runs —
  the same problem `.toolbar`'s `min-height` solves.
- **Rebuilds hang off a `MutationObserver` on `#editor`**, not an `input`
  listener, because the document also changes from Open, Reload, New, paste
  and the welcome fetch. It is debounced by a second for typing and **not for
  a document swap**, and that second is not a preference: a sidebar lagging the
  document reads as the app being unable to parse what is in front of it.
  **The property is immediacy, and the model says so**: `modelRender` calls
  `renderOutline` itself when a whole document is drawn, so every mutation
  record the observer sees is someone editing and waits its second. Reading a
  swap off the record shape, as the old core did, cannot work here — a
  top-level Enter produces the identical record. The click
  handler captures the heading *element* rather than looking it up by slug,
  since a slug goes stale the moment its heading is edited and the rebuild can
  be a second behind.

The static export's TOC is gated on `outlineIsOpen()`. That is a placeholder for
a Settings pane, not a design — the sidebar is chrome for the author and the
export's TOC is content for the reader, and they should not be one switch. The
pane that would hold the real control is in
[docs/ROADMAP.md](docs/ROADMAP.md).

### Undo

[undo.js](front/undo.js) keeps the document's history. The browser's own stack
has nothing on it: every `beforeinput` is cancelled, so the engine never edits
anything — Safari's own Edit → Undo is disabled for exactly that reason — and
Ctrl/Cmd+Z, Ctrl+Shift+Z and Ctrl+Y are taken with `preventDefault` and routed
here. The engine's own undo gesture arrives as `historyUndo` / `historyRedo` and
is routed here too, though on the desktop no engine raises one.

**A state is a fork of the model**, with the caret beside it as a
`(blockId, offset)`. `modelForkDocument` copies the document's outline — which
blocks exist, nested in what, with every affix each records — and shares its
contents, the inline tree and the parser's tokens, marking each block `shared`;
`modelUnshare` gives a block its own contents before anything writes to them.
That makes a state about 84KB on a large document where a full copy was
1,610KB, and a hundred states smaller than the old core's HTML strings were.
What a state is lives in exactly two functions, `undoCaptureState` and
`undoApplyState`; the rest of the file is the stack and never asks.

Five things worth knowing:

- **`undoReset()`, `undoPark()` and `undoAdopt()` are the whole API, and they
  turn on a document boundary.** History never crosses one. Undo after an Open
  must not hand back the previous file's text, because that text would then be
  sitting under the new file's path, one Ctrl+S away from being written there.
  Every caller of the two document doors picks a side — `undoReset()`, or raise
  an `input` event and be undoable — and the `undo` suite counts that none of
  the files that might assigns `editor.innerHTML`. The one sanctioned
  crossing is a **tab switch**: the history is one detachable `history` object,
  `undoPark()` hands it back for the caller to keep on the outgoing tab and
  leaves a fresh one, and `undoAdopt(bundle)` installs the incoming tab's —
  `undoAdopt(null)` being exactly `undoReset()`. The bundle moves whole and two
  stacks are never merged. The caller puts the document on screen before
  adopting: adopt trusts the bundle matches it and never re-snapshots.
- **Applying installs a fork of the stored state**, never the entry, and
  resolves the caret against that fork. The next edit mutates what was
  installed, so handing over the entry would edit the history — the failure is
  undo, redo, undo finding what the first visit left behind.
- **What an undo restores is where the caret was when the undone edit began.**
  The current state follows the caret on `selectionchange` until the next edit
  pushes it (`undoFollowCaret`); a caret outside the editor, or one while an IME
  holds the text, does not count. Until 2026-09-23 a state carried the caret it
  was taken with, which was wrong whenever the caret moved between edits.
- **Coalescing is by `inputType`, not just by time.** Consecutive `insertText`
  or `deleteContentBackward` inside 600ms collapse into one step; everything
  else — Enter, a format, a paste, a synthetic event with no `inputType` —
  starts its own. **`undoJoin()` merges the next edit whatever its type**, for
  an edit that rewrites what was just typed: the macOS press-and-hold accent
  types the vowel, waits on the popup, then replaces it, and one Ctrl+Z should
  take back the accented letter whole. `modelInputRevises` decides when.
- **The position moves before the `input` event an undo raises, not after.**
  Applying a state dispatches `input` so autosave, the dirty flag and the
  outline hear it, behind a re-entrancy guard so the undo does not record itself.
  `file-api.js` asks `undoPosition()` from inside its own input handler, so
  dispatching first told it the document was still in the state undo had just
  left, and undoing back to the last save went on reporting `(edited)`.
  `undoPosition()` is an id minted once per state, never a stack index, which
  `UNDO_LIMIT` would recycle into naming a different state.

### Notifications

[notify.js](front/notify.js) is the only way `front/` talks to the user outside
the document. There is no `alert()` and no `confirm()` left, and the `notify`
test suite scans the sources to keep it that way.

- `notify(message, { severity, actions, timeout })` — a toast in the bottom
  right. Non-blocking, returns a function that dismisses it.
- `ask(message, { title, severity, actions, dismiss })` — a modal, resolving to
  the chosen action's `value` or to `dismiss` (default `null`).
- `askForInput(message, { title, placeholder, value, confirmLabel, dismiss })` —
  a modal with one text field, resolving to the trimmed string on confirm (which
  may be `""`) or to `dismiss` (default `null`) when backed out. Given
  `fields` — a list of `{ name, label, placeholder, value, prose }` — it asks
  for several and resolves to an object keyed by name, which Insert → Image…
  uses for its address, description and title. A deliberate
  second copy of the modal scaffold rather than an option on `ask()`: the return
  contracts differ, and this file is already where the dialogs are built. Insert
  → Link… and Insert → Image… are its callers.

Why it exists at all is worth keeping: `alert()` blocks the page, ignores the
theme, and can say nothing but OK. The one that forced the issue is that Chrome
and Firefox both let a user tick "prevent this page from creating additional
dialogs", after which every `alert()` in the app silently does nothing — so a
save failure could reach nobody.

Four things about it that are decisions rather than details:

- **Errors do not auto-dismiss; everything else does.** A toast that vanishes is
  right for "Saved!" and wrong for "Failed to save file". Having just argued
  that a suppressible dialog is unacceptable, a four-second one the user was
  looking away from would be the same bug wearing a nicer hat. Hovering also
  holds a toast open, since a message worth reading can outlast its own timer.
- **`ask()` takes an arbitrary action list, not a yes/no.** That is the whole
  reason it is not a `confirm()` wrapper, and the unsaved-work guards are what
  it was built for: Save / Discard / Cancel, and Cancel / Overwrite / Save as….
  Actions render in array order; the one marked `default: true` takes focus, so
  the destructive dialogs mark Cancel and Enter does the safe thing.
- **Dismissing is not agreeing.** Escape, the backdrop and the close button all
  resolve to `dismiss`, which defaults to `null` so a two-way caller testing the
  result for truthiness reads it as no. Get this backwards and Escape overwrites
  the user's file.
- **It returns a Promise, which made toolbar dispatch asynchronous.** See the
  toolbar section: handlers sharing an action are now awaited in turn, because
  `app.js`'s New stops mid-handler and `file-api.js`'s hook must not run until
  it resumes.

The DOM is built in JS, like the toolbar and the outline nav, because
`html-export.js` hand-writes its own copy of the page shell — markup in
`index.html` would be a second copy to keep in step. Escape is bound to the
backdrop rather than the document, so with two dialogs open only the one holding
focus answers it, and there is no stack to maintain.

`notify.js` is in `ASSETS`: exported documents raise most of the same failures
the app does, since every export path can fail in one.

### Server

[server/src/server.ts](server/src/server.ts) is the whole thing. Routes:
`/api/home`, `GET /api/browse`, `GET|POST /api/file`, then a catch-all static
handler for `front/`.

Both `/api/file` methods report the file's mtime, which is what lets the editor
notice a file changing underneath it. `GET` with `stat=1` answers with that
alone and never reads the file: the editor asks on every window focus while a
file is open. `POST` returns the mtime of what it just wrote, so a save
re-baselines from the reply — without it the next check reads our own save as
somebody else's edit.

Two security properties to preserve:

- The server binds `127.0.0.1` only. The file API reads and writes anywhere the
  user can, so it must never be network-reachable.
- The static handler resolves inside `FRONT_DIR` and verifies the result stays
  there. The file API intentionally does *not* have that restriction — it is
  gated on extension (`.md`, `.markdown`, `.txt`) instead, which is the point of
  the tool.

`POST /api/file` writes only into a directory that already exists — it does not
`mkdir -p` its way there. The editor's remembered file path outlives the folder
it names, so creating the parent would rebuild a tree the user moved or deleted
and file the document somewhere they would never look. The dialog can only pick
directories it browsed, so the check costs nothing on the normal path.

`FRONT_DIR` resolves relative to `import.meta.dirname`, so cwd doesn't matter.
The service worker never touches `/api/*` — those are live reads and writes.

### Degrading without the server

`file-api.js` probes `/api/home` and disables Open/Save/Reload/Save As if it
doesn't get well-formed JSON back (a static host answering 200 with
`index.html` does not count). The editor still boots from the service-worker
cache; clipboard and all three exports keep working.

The probe is not just a startup check: `checkServerAvailable()` runs again on
`window focus` and `visibilitychange`, the same wake points `checkDiskChanged`
uses, so a server that dies mid-session gets noticed without a click failing
first, and one brought up after a dead start re-enables the buttons without a
reload. `setServerAvailable(bool)` is idempotent both ways, guarded like
`setDirty`/`setDiskChanged` against writing the DOM when nothing changed.
