# TODO

This is what stands between here and a finished 1.0 — for what comes after
that, see [ROADMAP.md](ROADMAP.md).

The item to start from is **3.1**, the editing-core rewrite: most of section 1
and all of section 2 now land on it rather than on the current engine.
[REWRITE.md](REWRITE.md) is its design and plan, D6 in
[DECISIONS.md](DECISIONS.md) the decision.

Items are numbered `section.item` so they can point at each other. The numbers
are labels, not an order and not a priority. An italic *(needs 3.1)* means that
one has to land first and *(unblocks …)* marks an item others are waiting on —
those are the ones to start from. A marker states a blocking relationship and
nothing else: an item that merely reads better after another one says so in its
own prose, where the reasoning can be read and argued with, rather than wearing
a status that looks like a gate. Two more say what kind of item it is:
*(undecided)* is a suggestion nobody has ruled on yet, so it wants a decision
before it wants code — settled ones are recorded in
[DECISIONS.md](DECISIONS.md) — and *(fixed, unverified)* means the work landed
but nobody has watched it happen in a browser, so what is left is the checking.

A finished item leaves this file rather than staying in it struck through: what
was done and why is in [CHANGELOG.md](../CHANGELOG.md), which is the better place
to look for it, and a list of open work reads better without seven closed items
in the way. An item that turns out not to be 1.0 work at all leaves the same
way, to [ROADMAP.md](ROADMAP.md) instead. Numbers are reused when that happens,
so a reference in the code or in [CLAUDE.md](../CLAUDE.md) has to be chased down
and updated in the same commit — `grep -rn "TODO [0-9]" .` finds them.

## 1. Editing

*   **1.1** *(read D4 first)*
    The UI only supports some of the markup MD offers, and not even all of what
    the README advertises. The format bar has p, h1, h2, h3, bold, italic,
    strikethrough, ul, ol, code, and the Format menu reaches those plus h4-h6
    and list indent/outdent, which have no room on the smaller bar — more
    reachable, not more capable. Insert has a horizontal rule and, since 1.1.1,
    a link. Missing, still: images, tables and blockquotes. They render when
    imported; there is just no way to author them. The Format and Insert menus
    are where they go, and both have room. D4 carries the boundary rule for
    which formats may use execCommand and which get written by hand.

    [MARKDOWN.md](MARKDOWN.md) is the full picture: every construct in both
    Markdown Guide cheat sheets scored on render / author / round-trip, plus
    the ones neither the bar nor markdown-it's default preset touches today —
    raw HTML, task lists, footnotes, heading IDs, `linkify`, syntax
    highlighting — each carrying a decision the rewrite has to make rather than
    inherit by omission. Its per-construct notes feed 3.1's stage 1 and 2 exit
    criteria.

    **Standing instruction, for every slice below:** re-run
    [tests/browser-check.html](../tests/browser-check.html) when adding a format,
    and when a browser does something surprising. It is the only thing in the
    repo that can tell measurement from folklore — the Deno suite has no editing
    engine — and every engine-specific claim in `front/` either came from it or
    is a guess. Its sibling
    [tests/list-indent-check.html](../tests/list-indent-check.html) covers the
    one path that no longer goes through execCommand at all. It holds until
    3.1 lands; after that both pages retire with execCommand, and the single
    input-layer check page [REWRITE.md](REWRITE.md) describes takes their place.

    The slices are roughly in order of increasing cost. 1.1.1 (links), 1.1.2
    (h4-h6, plus the 1.1.5 heading-in-list refusal bundled with it), 1.1.3
    (indent/outdent controls) and 1.1.4 (inline code, verified rather than
    rebuilt) landed — see CHANGELOG.md. 1.1.5's other bullet (what a block
    control does to content outside a list) is also settled now, as D5 in
    [DECISIONS.md](DECISIONS.md): indent stays list-only, permanently, so it
    needed no code and left no slice behind.

    **The remaining slices land on the new core, not on this one.** 1.1.6,
    1.1.7 and 1.1.8 were all going to be new hand-rolled DOM surgery, the same
    family as `outdentListItem` and the empty-`<li>` Enter/Backspace handler,
    and the escalation rule that used to sit here — a third such cluster makes
    the model rewrite a 1.0 blocker — has fired: tables alone are several
    clusters, and D6 in [DECISIONS.md](DECISIONS.md) records why fixing first
    and rewriting after costs more than rewriting now. So none of the three is
    written against contenteditable. Each is a model command on 3.1's core —
    see [REWRITE.md](REWRITE.md), "Formats and structure as model commands" —
    and *(needs 3.1)* below means exactly that. Do not start one on the old
    core to save time; the work would be discarded with the core.

    *   **1.1.6** *(blockquotes — needs 3.1)* A block type on the model, plus
        a Format-menu control that wraps or unwraps the current block. D5
        settled the one question it was waiting on — indent never doubles as a
        way to make a quote, in or out of a list — and D2 says how it renders.

    *   **1.1.7** *(images — needs 3.1)* An insertion at the caret plus an
        `askForInput` prompt for src and alt. An image is a leaf, so there is no
        structural-editing story the way tables have one; the smallest of the
        three.

    *   **1.1.8** *(tables — needs 3.1 and 2.1)* The item that made 3.1 a 1.0
        blocker. Not just that there is no control to insert one: an *existing*
        table — already in the document, already rendered from markdown-it's
        `<table>` — cannot be edited either. No way to add or remove a row or
        column. Confirmed by hand: editing this very file after `hr: "---"`
        landed, trying to delete the now-obsolete row it made fixed above. On
        the old core this was cell navigation, row and column surgery, Enter
        and Backspace at cell edges, paste into a cell and a truce with each
        engine's native table editing, all in three engines. On the model it is
        index arithmetic on `rows[][]`: insert, add or delete a row or column
        at the caret, Tab between cells. An edited table's bytes are 2.1's
        problem either way.

    *   **1.1.9** *(task lists — needs 3.1)* A block type on the model: a list
        item that carries a checkbox. Render a **live** checkbox, not the
        `disabled` one `markdown-it-task-lists` emits — toggling it is an
        undoable model edit that raises `input` like any other. A click or
        selection plus a button or menu action turns a list item into a task
        item and back. The serialiser sniffs the `[x]` / `[X]` spelling from
        the file. Likely a hand-rolled markdown-it rule rather than the plugin —
        see [MARKDOWN.md](MARKDOWN.md) S4. GFM only allows the checkbox inside a
        list item, so the control needs a list context or creates one.

    *   **1.1.10** *(link editor — needs 3.1)* Mandy is a web page; links are
        first-class, and the current `askForInput` prompt for a bare href is the
        floor, not the feature. Text + href + optional title, all editable, and
        editing an existing link pre-fills them. A heading picker inserts an
        inner link `[text](#slug)` against either an auto-slug or an explicit
        id. `linkify: true` goes on at the same time — bare URLs become links on
        import (no new dependency, `linkify-it` ships inside markdown-it), and
        the serialiser has to put a linkified bare URL back as bare text, not as
        `[url](url)`. **Explicit heading IDs** ride along: parse `## Title
        {#id}`, honour it in `headingAnchors` over the auto-slug, a field in
        this editor to set one, and re-emit it on an edited heading — with the
        last two as the cut line if the work overruns (parse-and-resolve ships,
        authoring waits; an untouched heading keeps its `{#id}` via its source
        span regardless). The loose ends in 1.2 are the same feature area.
*   **1.2** Links are done except for two loose
    ends. Ctrl/Cmd+click follows a link and jumps to `#anchor` headings,
    `anchorSlug` / `headingAnchors` in app.js resolve slugs live, and
    `static-export.js` stamps real ids into the exported markup. What is still
    open:

    - **Relative links are inert on purpose.** `[notes](./notes.md)` is parsed,
      rendered and then ignored: `openExternalLink` builds a `URL` with no base,
      so a relative href throws and is dropped. Resolving it against the origin
      would just 404 off the static handler. The behaviour that would make a
      linked set of markdown files navigable is opening it in Mandy through the
      file API, resolved against the directory of the open file — a good deal
      more work than a `window.open`. The tabbed view changed the shape of the
      answer: following a link opens the file in a new tab, the way New makes
      one, so nothing is discarded and there is no unsaved-work guard to add.
      `openFile` and the dirty/mtime tracking are what it builds on. What is
      still missing is resolving the path against the open file's directory,
      which `file-api.js` has never had to do, and `newTab` seeding its
      directory from the tab that spawned it — `fileAdopt(null)` resets the
      dialog directory with everything else today, and the CHANGELOG entry
      that introduced it left seeding to whoever creates tabs.
    - **Touch devices have no modifier**, so there is no way to follow a link on
      one, and the hover tooltip never shows either. Wants its own affordance —
      a long-press, or the chip Google Docs shows.
*   **1.3** *(fixed, unverified in WebKit)*
    Paste without formatting is built; what is left is one measurement.

    [tests/paste-check.html](../tests/paste-check.html) settled the question
    this item opened with — whether the browser still puts a `text/html`
    flavour in the event on Ctrl/Cmd+Shift+V, in which case app.js's preference
    for HTML would override the user's request. **Measured 2026-08-30: Chrome
    152 and Firefox 154 both offer `text/plain` alone**, so the plain branch
    already fires and there was nothing to build for either. That is the
    opposite of what this item predicted, which is the whole argument for the
    check pages. Both engines also deliver the `keydown` for Shift+V to the
    page, so if WebKit does keep the HTML flavour, the shape to reach for is a
    flag set from a `keydown` on `#editor` and consumed by the next `paste`
    event — now known to be workable rather than assumed.

    **What is left: run the page in Safari.** Its binding is
    Cmd+Shift+Option+V rather than Cmd+Shift+V, so press both and see which one
    the page logs as a plain-text paste. If WebKit strips the flavour like the
    other two, this item closes with no further code.

*   **1.4** *(closed by 3.1)* Invisible whitespace: what the cleanup does not
    reach. Pasted HTML is sanitised on the way in and U+00A0 is normalised on
    the way out (see D3
    in [DECISIONS.md](DECISIONS.md)), which covers everything that reaches the
    *file*. It does not cover the live DOM in between: type a trailing space,
    let the browser rewrite it to U+00A0, then select that paragraph and paste
    it into Google Docs, and the character goes with it — that path crosses
    neither boundary. Closing it means normalising the document itself, on a
    debounced `input` or on `copy`, which is fiddlier than either of the two
    that landed: rewriting a text node under the caret can move the caret.
    On the model that rewrite never happens: `insertText` is normalised at the
    model boundary and the DOM is rendered from a document that holds no
    U+00A0, so 1.4 closes with 3.1 rather than getting its own caret-preserving
    fix on the old core.

*   **1.5** No search-and-replace. Ctrl+F is chrome-level
    browser UI that highlights matches in the live DOM but exposes nothing to
    the page, and
    `window.find()` only moves the selection — it doesn't replace, isn't
    standard, and support is inconsistent. So this is one of the few editor
    features the platform doesn't hand over for free: match-finding over the
    document, a highlight/navigate UI, and replacement done through
    `runCommand("insertText", …)` or Range manipulation so it stays undoable
    and raises `input` like everything else in
    [execcommand.js](../front/execcommand.js). A feature in its own right, not
    one of the one-liners nearby. After 3.1 the match-finding half is string
    search over the model's blocks and replacement is an ordinary model edit,
    undoable for free — the highlight-and-navigate UI is the whole feature.
    Best after, so it is written once.

*   **1.6** *(bug, closed by 3.1)* Undo does not always come back clean.
    Reported: open a file, press Enter at the end of an `<li>` (one edit), then
    Ctrl+Z.
    The edited dot stays lit, and the caret jumps to the top of the
    document rather than back to where the edit was.

    **Half of it may be fixed already, unverified.** Stage 4 of the tabbed
    view (2026-09-07, `801db70`) found `applyUndoSnapshot` dispatching its
    `input` event *before* moving `history.current`, so `file-api.js`'s
    listener asked `undoPosition()` and was told the state undo had just left
    — which is exactly "undo back to the savepoint, dot stays lit", for any
    edit and not just this one. Nobody has re-run the reported case since. If
    the dot now clears, what is left of this item is the caret half alone.

    Both halves point at the same place. `file-api.js` clears the dot when
    undo returns to `cleanPosition` — the `undoPosition()` id recorded at the
    last open/save — so if the flag stays, the id undo landed on is not the one
    `markClean()` stored. Either the Enter's snapshot bookkeeping is off, or the
    caret restore (`undoTextOffset` / `undoLocateOffset` in
    [undo.js](../front/undo.js), a character offset across element boundaries)
    is miscounting for a caret at the end of a list item and the snapshot it
    lands on is not the baseline. The caret-to-top symptom is the same
    miscount showing directly: offset 0.

    Not yet reproduced in isolation. Candidate to fold in with the empty-`<li>`
    keydown work if it turns out to share a cause; recorded separately because
    it is an `undo.js` question, not a list-markup one, and might be neither.

    Not fixed on the old core: whichever of the two it is, both belong to the
    whole-document `innerHTML` snapshot design that 3.1 removes — undo becomes
    a stack of model states with the caret as a model position, and there is
    no offset walk across the whole editor to miscount. Kept here until the
    new undo is watched doing this exact case correctly.

*   **1.8** *(needs 3.1)* **Nothing in Mandy inserts a line
    break inside a paragraph.** There is no menu item — all thirty were checked
    on 2026-09-13 — no format-bar button, and no binding: `app.js` binds Ctrl+S,
    Ctrl+O, Ctrl+Shift+P and Ctrl+K and never Shift+Enter, and the hand-rolled
    empty-`<li>` Enter handler explicitly *bails out* when `shiftKey` is set. So
    a break is reachable today only because the browser's own `contenteditable`
    inserts a `<br>` for Shift+Enter, which is the engine's behaviour and not
    Mandy's — unmeasured here, like every other engine claim that has not been
    through a check page.

    The same is true of the format shortcuts — `app.js` binds no Ctrl/Cmd+B or
    Ctrl/Cmd+I either — and the answer is the same for both:
    **`insertLineBreak` is already in REWRITE.md's input-layer table**,
    so the work is a `keydown` binding and a model command in 3.1 stage 2,
    where there is something to call. Writing it against `execCommand` first is
    what D4's amendment says not to do.

    **The serialiser side is already done**, which is what had to come first: a
    control that made a break the save path then destroyed would have been worse
    than no control, turning an obscure gap into a data-loss path the user was
    invited down. That was 2.2, fixed and watched end-to-end in the running app
    on 2026-09-13, so this item is now only about the control.

    Worth deciding when it is built, and left open here: whether the control is
    a keybinding alone or also an **Insert → Line break** item. The argument for
    the menu item is that Shift+Enter is invisible and this editor's premise
    (D0) is that nobody should need to know the markup; the argument against is
    that Insert is for things with no keystroke, and every editor people arrive
    from uses Shift+Enter without advertising it.

## 2. Save fidelity

Ways the bytes on disk still differ from what was opened, all verified by
round-tripping real files through the running app.
[front/markdown-style.js](../front/markdown-style.js) is what preserves them;
Decision D1 in [DECISIONS.md](DECISIONS.md) is why, and lists the differences
that are deliberate rather than bugs — as does D3, which is the one whole
category fidelity deliberately does not extend to.

*   **2.1** *(wanted by 1.1.8; survives 3.1)* An edited table is re-emitted in
    the `table` rule's house style. An untouched one now restores byte-for-byte —
    `normaliseTableRows` takes the rule's cell padding and its fixed three-dash
    delimiter out of the block key, so `|---|---|` and `| --- | --- |` are the
    same table to the index — but change one cell and the whole table comes
    back as `| a | b |` with a three-dash rule, losing a compact or a
    width-aligned source. Restoring the bytes is not the fix here and could not
    be: widening `|foo|` to `|foobar|` *requires* the delimiter and every other
    cell in that column to widen with it, so the right output is computed from
    the content, not recovered from the source. Wants a formatter that measures
    the columns and re-emits in whichever convention the source used — compact,
    one-space, or padded to width — which the sniffer can read off the original
    delimiter row. Reachable by typing in a cell, which contenteditable allows
    even though the structural editing above is missing.

    One of the few pieces of section 1 and 2 work that is the same on both
    cores: a pure function from a table's rows and the source's delimiter
    convention to text. It can be written before 3.1, and it is what the
    model's serialiser calls for an edited table block.

## 3. The editing core

*   **3.1** *(unblocks 1.1.6, 1.1.7, 1.1.8, 1.4, 1.6, 1.8)*
    Replace the editing core: hold the document as a block-granular markdown
    model with source spans, render it to the DOM, and treat contenteditable
    as an input method whose `beforeinput` intentions are reinterpreted as
    model edits rather than trusted the way `execCommand`'s output is today.
    Retires D4, `undo.js`'s snapshot design, `execcommand.js`, the content-keyed
    restore in `markdown-style.js`, the Mermaid and LaTeX source stashes, and
    the reason a table cell cannot be edited. Leaves the ~5,300 lines around
    the core — menus, notify, file API, outline, exports, server — untouched,
    and the tabbed view nearly so: its swap moves a model reference instead
    of an HTML string, and REWRITE.md's "What it replaces" section says what
    else changes at reintegration and what is decided there.

    [REWRITE.md](REWRITE.md) is the design, the estimate (five to eight weeks
    at this repo's pace, the tail all in the input layer) and the build order.
    D6 in [DECISIONS.md](DECISIONS.md) is why it is 1.0 work rather than the
    roadmap item it was until 2026-09-06.

    It starts with a three-day spike, and the spike is a gate, not a first
    step: a bare page that types, splits, merges and bolds through a block
    model in Chrome, Firefox and Safari, with the macOS accent popup working.
    If that passes, the stages in REWRITE.md follow in order — model and
    serialiser first, proven byte-identical against this repo's own files with
    no browser involved, then render, input, formats, lists, tables, and
    reintegration. If it fails, REWRITE.md names the two honest moves, and the
    choice between them is made then.

    On a branch; `main` keeps the working editor until parity. Every item
    marked *(needs 3.1)* waits rather than being started on the old core.

## 4. Interface

*   **4.2** *(measurement, not code)* The tab bar's keyboard bindings are
    unmeasured everywhere except one browser on one platform.
    [tests/tab-shortcut-check.html](../tests/tab-shortcut-check.html) is the
    page that answers it: open the file — it needs no server and no app — and
    read the table.

    Ctrl+Tab, Ctrl+Shift+Tab and Ctrl+1–9 are all bindings some browser claims
    for its own tab strip, and **two separate things have to be true before one
    of ours works**: the keydown has to reach the page at all, and
    `preventDefault` has to suppress the browser's own action. A binding that
    fails the first is a dead control; one that fails the second is worse than
    dead, because pressing it moves Mandy's tab *and* the browser's.

    The answer is per browser **and** per platform, which is the part that makes
    a Mac useless for settling it: macOS switches browser tabs on Cmd+1–9, so
    Ctrl+1–9 is free there, while Windows and Linux use Ctrl+1–9 for exactly
    what we are trying to bind. Measured 2026-09-07: Chrome 148 on macOS
    delivers all of them and reports each as cancelable. Unmeasured: every other
    platform, Firefox and Safari anywhere, and — since no script can see it —
    whether the browser's own strip actually stayed put.

    Until that is run, the shipped set is provisional. If a binding turns out to
    be unavailable somewhere, the fallback with the best odds is Alt+1–9, which
    no browser claims; the arrows along the bar are already ours and are not in
    question.

    Numbered 4.2 rather than reusing 4.1, which this section's previous item
    had: a dozen dated [CHANGELOG.md](../CHANGELOG.md) entries say "TODO 4.1"
    meaning the tabbed view, and minting a different 4.1 the same week would
    make every one of them ambiguous. Reuse is fine once that is not fresh.

*   **4.3** *(undecided)* A tab is named by its file's basename and nothing
    else, and two things a real session does break that. **Two open files with
    the same name** — `README.md` from two repos, a `TODO.md` beside its
    `docs/TODO.md` — draw two identical tabs, and the only thing telling them
    apart is the full path on hover, which a glance at the bar never sees.
    **A long name** is cut at 24 characters with an ellipsis at the *end*
    (`.tab-name` in `app.css`), which is the end that carries the extension
    and, for names that share a long prefix, the only part that differed.

    Wants a naming scheme rather than a wider cap. The candidates, in the order
    they should be tried:

    - **Disambiguate only on collision**, the way editors do: a tab keeps its
      bare basename until another open tab shares it, and then both gain the
      shortest trailing directory that tells them apart — `README.md — mandy`
      and `README.md — tasks`, deepening one segment at a time until unique.
      Nothing changes for the common case, and a name never carries a
      qualifier it does not need.
    - **Truncate the middle, not the end**, so a cut name keeps its extension
      and its last few characters: `long-spec-na…-v2.md`. CSS cannot do this,
      so it is a small piece of JS in `buildTab`, measured in characters rather
      than pixels the way the 24ch cap already is.
    - Untitled documents have the same collision in the worst form — every
      new tab is `Untitled` — and want a counter, `Untitled 2`, minted when
      the tab is made and dropped once the document has a name.

    All of it is `buildTab` and `tabDescriptor` in
    [tabs.js](../front/tabs.js), which already has every open tab's path in
    hand when it draws the bar, so the collision check is a pass over
    `openTabs` and nothing has to be stored. The `title` and `aria-label`
    keep the full path regardless — the scheme decides what is drawn, not what
    is said. It reaches nothing in the core, so it neither waits on 3.1 nor is
    discarded by it.

    **4.9 takes the edge off this one without closing it.** The redesign's
    `.toolbar-path` element shows the *active* tab's directory in the chrome,
    which is enough to tell two same-named tabs apart without a hover once one
    of them is selected — but says nothing about the bar itself, so a glance
    at two identical closed-book tab labels still can't tell them apart. This
    item is still the fix for that.

*   **4.4** *(survives 3.1)* Right-to-left documents. **View → Right to left**
    puts `dir="rtl"` on `#editor` and the document flips; the toolbar, the
    outline's side and the dialogs do not. Mirroring the *application* is a
    different and much larger feature, deliberately not this one.

    **Markdown cannot hold direction, and that is the design rather than a
    limitation of it.** There is no CommonMark syntax for it. Writing `<div
    dir="rtl">` into the file would contradict `html: false`
    ([MARKDOWN.md](MARKDOWN.md), out of D0), and frontmatter is a concept the
    project does not have and would be a far bigger feature wearing this one's
    clothes. So direction is Mandy's opinion about the file rather than the
    file's content: a per-document preference, and a flipped document saves to a
    `.md` byte-identical to its unflipped self. The presentation layer presents;
    the data layer stores what the author wrote. The exports are the asymmetry
    worth stating rather than discovering — `dir` is an HTML attribute, so both
    of them can carry it and the markdown never will.

    Per-document rather than a global preference like the theme, because tabs
    make the global answer wrong immediately: a Hebrew file and an English one
    open side by side want different answers, and there is already a mechanism
    for exactly that.

    **The key is named `direction`, not `dir`.** `DOCUMENT_KEYS.dir` is the last
    browsed *directory* ([app.js](../front/app.js)), and this is precisely the
    collision class CLAUDE.md's load-order section warns about.

    The stages:

    *   **The seventh document key** — *not started*. An entry in
        `DOCUMENT_KEYS`, and [tabs.js](../front/tabs.js) needs nothing: it
        iterates `Object.keys(DOCUMENT_KEYS)` at all three places that matter,
        the migration, the cleanup and the per-tab read, so the key is picked up
        rather than enumerated a fourth time. A document from before this has no
        value under it, which reads as left-to-right — the same absence the
        `path` key already tolerates.

    *   **The toggle** — *not started*. A second checkable item in View, which
        holds exactly one today. The mechanism is already there: `outline.js`
        writes `aria-pressed` on its item by action and
        [app.css](../front/app.css) draws the checkmark from the attribute, so
        this is a spec entry and a handler that stamps the attribute and writes
        the key.

    *   **The stylesheet** — *not started*. Three physical declarations inside
        `#editor` become logical ones: the list `padding-left`, and the
        blockquote's `border-left` and `padding-left`. Everything else the
        Unicode bidi algorithm handles for free.

    *   **Code stays left-to-right** — *not started*, and a correctness rule
        rather than a refinement. Under bidi, `const x = 1;` in an RTL block
        renders with its punctuation in the wrong place. `#editor pre`, `#editor
        code { direction: ltr }` is the whole fix, and it is the difference
        between flipping the document and flipping it correctly.

    *   **The exports carry it** — *not started*. `documentBody()` in
        [static-export.js](../front/static-export.js) and the shell
        [html-export.js](../front/html-export.js) hand-writes both stamp `dir`
        on the exported editor. HTML is the one output that can hold the
        setting, so it should.

    *   **What to measure rather than derive** — *not started*. The format bar
        positions itself from `offsetWidth` and a `left`, and a caret rect
        inside an RTL block is a thing to look at rather than reason about.
        Contenteditable's caret behaviour at a bidi boundary is engine-specific
        in ways nobody predicts correctly. A check page if either misbehaves,
        not before one does.

    It reaches nothing in the core: direction is a view property and 3.1 has no
    opinion about it, so this neither waits on the rewrite nor is discarded by
    it.

*   **4.5** *(bug, survives 3.1)* Reopening the installed PWA does not report a
    file that changed while it was closed. Open a file, close the app window,
    edit that file in something else, launch Mandy again from the OS: the tab
    keeps its clean dot and nothing says the document and the file have parted
    company. Reload still takes the newer file, so nothing is lost — but the
    user has no reason to press it, which is the entire job of the mark.

    **Three wake points are supposed to cover this**, all in
    [file-api.js](../front/file-api.js): the startup IIFE, `window` `focus`,
    and `visibilitychange` when the page is not hidden. The startup one exists
    for exactly this shape of launch — the comment beside it says `focus` never
    fires for the tab that already has it — so a cold PWA start should be
    covered already and observably is not.

    **Nothing on screen tells a check that ran and lost from one that never
    ran.** `checkDiskChanged` returns early unless both `currentFilePath` and
    `fileMtime` are set, and swallows every error from the stat, deliberately:
    an alert on every window focus would be no way to raise a deleted file. The
    cost is that the three candidates below look identical from outside, which
    is why this is a measurement before it is a fix.

    *   **The relaunch may not be a page load at all.** A PWA closed to the OS
        can be frozen or discarded and *restored* rather than re-fetched. A
        restored page does not re-run a top-level IIFE, and whether `focus` and
        `visibilitychange` fire on the way back is per engine and per platform.
        If that is it, the missing wake points are `pageshow` — the
        `event.persisted` one — and the Page Lifecycle `resume`.

    *   **Or it is a page load whose state did not come back.** The check bails
        silently with no `mtime`. A PWA launched at `start_url` `/` is the same
        origin as a browser tab and should read the same six document keys, but
        *should* is the word this item exists to remove.

    *   **Or the state came back and the server was not up yet.** The startup
        check is gated on `serverAvailable`, resolved from `/api/home`. An app
        launched before its own file server gets `false`, skips the check, and
        then waits for a `focus` that a window which already has focus never
        fires. That one self-corrects at the next wake, so it explains a silent
        launch rather than a permanently silent session.

    **`checkServerAvailable` rides the same two listeners and has the same
    gap**, so whatever fixes one fixes both: a PWA reopened after the server
    died reports it only once one of those events arrives.

    **What to measure, and it cannot be a check page in the usual sense.** This
    needs an installed PWA, an OS-level close and reopen, and a file edited in
    between — none of which a page can arrange for itself. So it is a by-hand
    run per platform, recording which of `pageshow` (and its `persisted`),
    `resume`, `focus` and `visibilitychange` fire, in what order, and whether
    `visibilityState` was ever `hidden`.

    **The fix is cheap to over-cover**, which is the argument for adding wake
    points rather than identifying the one true event. Both checks are guarded
    by their own in-flight flags, and `setDiskChanged` and `setServerAvailable`
    are no-ops when nothing changed, so a redundant wake point costs one stat
    call and nothing else. Nothing here reloads or merges on its own either —
    the report is the whole feature, and what to do about it stays the user's.

*   **4.6** *(undecided)* `newTab()` in [tabs.js](../front/tabs.js) is the only
    "new tab" there is, and it means one specific thing: park the active
    document, push a bare `{ id }` onto `openTabs`, and let `adoptActive` find
    no bundle and no storage for it — which blanks the editor the same way a
    restored-but-never-shown tab does. That is the right behaviour for the
    toolbar's **New**, which used to reset the document in place and now makes
    a tab instead (see the "New and Clear are two different weights" section
    above), but it is not the only thing a user reaches for a new tab to do.
    Wants a second entry point — a tab that opens blank *and* immediately opens
    the file browser into it, the way a browser's Ctrl+T-then-navigate does —
    so opening a file into a fresh tab is one action instead of New followed by
    Open. Needs a name for the menu that does not collide with plain New, and a
    decision on what happens to the blank tab it made if the browse dialog is
    cancelled: left as an empty tab, or closed back out.

*   **4.7** *(undecided)* The Open dialog's starting directory
    (`showOpenDialog()` / `loadDir()` in [file-api.js](../front/file-api.js))
    is the last directory *that tab* browsed, stored under `documentKey("dir")`
    — so it is not literally hardcoded to home, but a tab that has never
    browsed has no value there, and `newTab()` seeds nothing, so every fresh
    tab's first Open lands on home regardless of what the rest of the session
    has been browsing. That is most of what reads as "always defaults to
    home." The other half is that there is no list of recently opened files at
    all — `grep -rn recent front/` finds nothing — so returning to a file
    opened two tabs or two sessions ago means re-browsing to it by hand even
    though Mandy already knows its path from `DOCUMENT_KEYS.path`. A recent-
    files list is the bigger piece and the one worth deciding first: where it
    lives (the open dialog itself, or a new menu item), how long an entry
    survives a file being moved or deleted, and whether it is global or, like
    the six document keys, per-tab.

*   **4.8** *(undecided)* No way to reorder tabs. `renderTabBar()` in
    [tabs.js](../front/tabs.js) redraws `#tabBar` from `openTabs` on every
    change, and each tab is a plain `<div class="tab">` built by `buildTab()`
    with no drag handlers anywhere — `grep -n drag front/tabs.js` is empty.
    `openTabs` is the source of truth and already drives the redraw, so a
    reorder is a splice on that array followed by the existing
    `renderTabBar()`/`persistTabList()` pair; the work is the drag UI itself —
    HTML5 drag-and-drop or manual pointer tracking, a drop-position indicator,
    and deciding whether it needs a keyboard equivalent for parity with the
    arrow-key menu navigation the rest of the toolbar has.

*   **4.9** Visual restyle of the chrome and the document surface — approved,
    staged, not started. The design is
    [docs/redesign/design_handoff_mandy_chrome/README.md](redesign/design_handoff_mandy_chrome/README.md),
    a high-fidelity handoff doc rather than a mockup to eyeball: exact colors,
    sizes and tokens for every screen, and a "Structural changes" section
    naming precisely which `front/` files move which markup. No feature
    changes — every control stays where it is in the information architecture,
    driven by the same code. What changes is `front/app.css` plus the handful
    of DOM details the doc calls out.

    Checked against current `main` before this was approved: the doc's claims
    about today's code all held (`toolbar.js`'s two-row structure,
    `tabs.js`'s indifference to where `#tabBar` lives, `format-bar.js`'s live
    toolbar-height measurement, `theme-manager.js` never touching the toggle's
    inner markup), and the doc's own dead-variable list is real —
    `--accent-blue` alone has 16 call sites in `app.css`, all of which move to
    the new tokens rather than being deleted for free. Two amendments came out
    of that review and are recorded in the doc itself rather than only here:

    - **A real layout bug**, caught before any code landed: moving the tab
      strip out of `.toolbar` to a sibling inside `.container` collides with
      the outline sidebar's CSS grid, which spans `.toolbar` across both
      columns but would leave the tab strip unspanned — the outline and the
      editor each land one grid cell out of place for as long as the sidebar
      is open. Stage 3 below is where the fix goes.
    - **Fonts are a remote dependency, not self-hosted**, reversing the doc's
      own recommendation. Source Serif 4 loads from a Google Fonts `<link>`
      rather than `front/fonts/` woff2 files, so trying a different typeface
      later is a one-line change instead of a repo carrying font files to
      replace. Accepted rather than solved: offline PWA boot and the editable
      export both lose the serif face with no network reachable, falling back
      to the `Georgia, "Times New Roman", serif` stack `app.css` already
      names. Revisit self-hosting if that fallback turns out to matter.

    **The open-file directory the doc adds to the chrome (`.toolbar-path`) is
    a priority, not a decoration** — it was not asked for, and it is most of
    the fix for the case 4.3 describes, where two open tabs share a filename
    and only a hover tells them apart. Losing it in a pass that trims the menu
    row for space would be losing a feature, not simplifying one.

    Orthogonal to 3.1: this touches presentation only, not the editing core,
    which 3.1 leaves "nearly untouched" at the level this doc works. Lands on
    `main` in stages rather than on a branch, each its own commit and
    CHANGELOG entry, following the doc's own suggested order with the grid fix
    folded into stage 3:

    0. This TODO entry, plus the font and grid-bug amendments — *done*.
    1. Token blocks; delete dead variables, repoint every call site; load the
       remote font — *done*. Colors only: every `var()` in `app.css` now
       resolves against the new token names, but no component's shape, size
       or markup changed, so the app looks half-restyled until stage 2 picks
       up typography — exactly what the doc's suggested order predicts. Four
       tokens (`--accent-ring`, `--accent-bright`, `--selection`,
       `--font-serif`) are declared but not yet consumed anywhere; later
       stages wire them up. `npm test` (992 checks) and `deno task check`
       both pass; not yet watched in a real browser — no headless-Chromium
       driver was available in this session, only static checks (brace
       balance, no undefined custom property, no leftover old token name).
    2. `#editor` typography and the measured column — *done*. `#editor`
       itself is the measured column (no inner wrapper): `max-width: 68ch;
       margin: 0 auto`, no border, no margin box, no `:focus` flash (already
       gone since stage 1). Every size in the doc's typography table applied,
       including the two new differentiations it named — inline code now
       reads `--tint` where `pre` keeps `--code-bg`, and table headers switch
       to the chrome's sans stack in small caps rather than the document
       serif. The old rem-based responsive font shrinking at 768px/480px is
       gone rather than carried forward: the doc gives one flat pixel scale
       and one padding value below 768px, and a `max-width: 480px` query
       already falls inside `max-width: 768px`, so removing the narrower
       override just lets the wider one cascade down. `npm test` (992
       checks) passes, and this stage **was** watched in a real browser —
       Playwright's Chromium installed cleanly in this session (`npx
       playwright install chromium`, no `--with-deps`, since there's no
       sudo) where the previous stage found none — light, dark, phone width,
       and a table/blockquote/code sample all screenshotted and match the
       doc. No console errors.

       **One gap the doc itself leaves**, caught by eye against the running
       app rather than against the spec: `--selection` ("text selection
       highlight") is in the token table but no rule anywhere in the six
       sections consumes it, so selecting text still showed the browser's
       default blue. `#editor ::selection { background: var(--selection) }`
       closes it — scoped to `#editor` since nothing in the chrome is worth
       selecting.
    3. Menu row to a single 40px row; move the tab strip out; tab shapes,
       dot, close button — *done*, and stage 4 folded in rather than left for
       later: splitting "move the tab strip out" from "restyle it" would have
       shipped an intermediate commit with white-on-white tab text, since
       `.tab`'s color assumed the teal background it no longer has once it is
       a sibling on the page. `buildToolbar()` in `toolbar.js` now builds two
       groups (`.toolbar-left`: mark + menus, `.toolbar-right`, app variant
       only: the new `.toolbar-path` + a segmented sun/moon toggle replacing
       the sliding pill) and appends the tab bar after `.toolbar` as a true
       sibling; `file-api.js` gained `renderToolbarPath()` (tilde-collapsed
       from a newly cached `/api/home` response) wired into the existing
       `renderCurrentFile()` hook. The `--toolbar-height` arithmetic block is
       gone — both variants now reserve the same flat `40px`, since neither
       carries the tab strip inside `.toolbar` any more, and the
       `:root[data-variant="export"]` override that used to shorten it had
       nothing left to say.

       **Two more gaps found by building it, on top of the grid-column bug
       stage 0 already caught** — both recorded in the design doc's
       amendments and fixed rather than shipped:
       - The tab strip, now a sibling, renders empty before `tabs.js`
         populates it, the same problem `.toolbar`'s own reservation trick
         solves — un-reserved, `#editor` would have jumped down ~44px once
         tabs.js ran. `.tab-bar` now carries its own `min-height`, measured
         against the real rendered row in a browser rather than derived.
       - The one-row bar does not fit six menu triggers at 375px once they
         share the row with the toggle — CLAUDE.md's "fits one line at
         375px" was true of the old two-row layout, which never had to make
         that room. `.menu-trigger` keeps a real narrow-width override below
         768px; `justify-content: center`, kept from the old override on the
         assumption it was harmless, turned out to make the overflow worse
         (clipping both ends instead of one) and is gone.

       `npm test` (994 checks) passes — `tests/toolbar.test.mjs` and
       `tests/tabs.test.mjs` both needed their DOM stubs updated (the fake
       `.toolbar` now sits inside a fake `.container`, since `getElementById`
       has to be able to find a sibling, not just a descendant) alongside the
       assertions themselves. Watched in a real browser: light, dark
       (including a real click on the toggle, not a stamped attribute — the
       first attempt at that screenshot silently tested nothing), the outline
       open in both themes, two tabs, and 375px width, with the layout-jump
       and overflow claims above measured directly rather than eyeballed.

       **A fourth gap, found only by using it rather than by reviewing or
       measuring it: the tab strip scrolling away with the document — the
       design doc's own explicit call — read as a bug, not a feature, the
       moment it was actually scrolled.** It vanished on any downward scroll
       and only returned at the very top, and dragged the browser's own
       scrollbar visually across the now-shorter sticky chrome with it. Fixed
       by making `.tab-bar` sticky too, right under `.toolbar`
       (`position: sticky; top: var(--toolbar-height)`), which brought back a
       per-variant CSS override this stage had just retired — not for
       `--toolbar-height` itself, which still does not differ between app and
       export, but for a new `--tab-bar-height` (`44px` in the app, `0px` in
       export, which has no tab bar) that `.outline`'s sticky offset now reads
       alongside `--toolbar-height` so the sidebar sits below both bars rather
       than under the tab strip. The fancier version of "the tab strip goes
       away sometimes" — hide going down, reappear instantly going up, the way
       a mobile browser's address bar does — is worth building on purpose
       rather than falling out of this stage sideways; recorded in
       [docs/ROADMAP.md](ROADMAP.md) under "A tab strip that hides itself on
       purpose". **What making the tab strip sticky did not fix — the
       browser's own scrollbar still runs the full viewport height, its track
       visibly passing behind the sticky chrome instead of starting below
       it** — is a separate item, 4.10.
    5. Format bar, menu panel — *done*. Pure restyle, no structural change:
       every rule in the doc's §02 applied directly (`.menu-panel`,
       `.menu-item`, `.menu-check`, `.menu-shortcut`, `.menu-separator`,
       `.format-bar`, `.format-btn` and its `.active`/`.mixed` states, the
       inline-group `.separator`). `.format-btn` drops its border entirely
       and goes from a fixed 32×32 box to `min-width: 30px` with
       `padding: 0 8px` — square for the icon buttons, naturally wider for
       the text ones (P, H1, H2, H3) — which needed no markup change, just
       letting content size win over a fixed width. Icon SVGs shrink from
       16px to 15px via a `.format-btn svg` override rather than editing the
       markup in both `index.html` and `html-export.js`.

       One pickup from §03 while in the area, not its own stage: the dark
       menu row's `1px solid #1e2729` bottom border — "the one place the
       teal steps back" — hadn't landed with stage 3's dark tokens, since it
       is new geometry rather than a value substitution. `npm test` (994
       checks) passes untouched — nothing here changed DOM shape, so nothing
       in `tests/` needed updating. Watched in a real browser: the File menu
       open in both themes, the format bar in selection/caret/active/mixed,
       confirming the mixed state's outline ring reads distinctly from the
       active fill.
    6. Dialogs — open/save (including the `.file-dialog-path` rewrite the
       doc's §04 describes but its own "Structural changes" list omits) and
       `notify.js`'s toasts/confirm/prompt.
    7. Print block; full `npm test`; a manual pass in a real browser — light
       and dark, outline open, narrow width — per this repo's own rule that a
       UI change is not done until it has been used, not just tested.

*   **4.10** *(bug, after the redesign)* The browser's own scrollbar still
    runs the full viewport height, behind the now-sticky `.toolbar` and
    `.tab-bar` — its track starts at the very top of the window rather than
    below the chrome, so it visibly cuts across the teal bar and the tab
    strip instead of representing only the document beneath them. Reported
    against a screenshot of the real app, not a mockup.

    The native scrollbar always represents the extent of whatever element is
    actually scrolling. Right now that is `body`/`html` — `.toolbar` and
    `.tab-bar` are `position: sticky` *within* that scroll, which pins them
    visually but does nothing to the scrollbar, since sticky elements do not
    leave the scrolling box they are sticky inside of. No CSS property
    shrinks where a native scrollbar's track starts within one scrolling
    container; the only fix is the one apps with this exact look (Gmail,
    Notion) use — stop the page itself from scrolling and give the content
    below the chrome its own scroll container instead:

    - `.toolbar` and `.tab-bar` move to plain normal flow, no longer
      `position: sticky`, since they would no longer be inside the thing that
      scrolls at all.
    - A new wrapper around `#formatBar`, `.outline` and `#editor` gets
      `overflow-y: auto` and a height derived from the viewport minus the
      chrome — the same `--toolbar-height` / `--tab-bar-height` arithmetic
      4.9 already built, reused rather than duplicated.
    - **Two call sites read window-level scroll position today and would have
      to read the new container's instead:** `format-bar.js`'s
      `barRect()` (`window.pageYOffset || document.documentElement.scrollTop`,
      used to clamp the floating bar above/below the selection against the
      sticky toolbar) and `app.js`'s `scrollToAnchor` (`window.scrollY` /
      `window.scrollTo`, for Ctrl/Cmd+click on a heading link). Both are
      exercised by existing suites — `format-bar.test.mjs` alone has 79
      checks — so this is a real, testable change, not a CSS-only one.
    - `.outline`'s own sticky positioning inside the new container needs
      re-checking once the outer page no longer scrolls at all — it may
      simplify to a plain height-and-`overflow-y` sidebar inside the same
      container rather than needing `position: sticky` of its own.

    Deliberately not folded into TODO 4.9: it touches tested interaction code
    well past the CSS the redesign otherwise confines itself to, and the
    redesign's remaining stages (format bar, dialogs, print) do not reach it
    either way. Do after 4.9 finishes, not mid-stream.

## 6. Product

*   **6.1** Rewrite the README to better fit the project's state
    at release. D0 in [DECISIONS.md](DECISIONS.md) is the framing to write it
    from — what the project is *for* is argued there and nowhere in the README,
    which still describes a markdown editor rather than the case for one.

    This used to say it wanted the collaboration question settled first, which
    made a 1.0 item wait on an explicitly unscheduled one in
    [ROADMAP.md](ROADMAP.md). It does not have to: that entry already supplies
    the honest description of what ships today — send-for-review, one hop —
    which is what the rewrite should say. Real collaboration changing the answer
    later is a README change later.
*   **6.2** Mermaid diagrams in the static HTML export keep the light palette
    they were rendered with, since Mermaid isn't shipped with the document.
    Dark-mode readers get a white card behind the diagram as a workaround
    rather than a properly re-rendered dark one.
*   **6.3** *(no urgency)* Ship Mandy as a single executable. `deno compile`
    bundles the runtime, the Hono server and `front/` into one binary per
    platform, so "install Deno, run it under pm2" becomes "download this, run
    it". The binary starts the server on a free port and opens the default
    browser at it; Mandy already runs server-optional, so nothing else in the
    app has to know it was launched this way.

    The work is not the `compile` call, it is what the call assumes. The
    `--allow-read` / `--allow-write` / `--allow-net` / `--allow-sys` set that
    `server/deno.json` spells out has to be baked in. `front/` has to be carried
    into the binary with `--include`, and `FRONT_DIR` — which resolves against
    `import.meta.dirname` today — has to still find it from inside a compiled
    binary's virtual filesystem. And something has to open the browser, which is
    the one thing the server has never had to do.

    Packaging, not architecture: no new rendering engine, no experimental API,
    no change to what Mandy is. The desktop-app version of the same idea — a
    window, and the costs that come with one — is in [ROADMAP.md](ROADMAP.md).
*   **6.4** *(survives 3.1)* Open HTML, save markdown. Mandy reads `.md`,
    `.markdown` and `.txt`, and content increasingly arrives as HTML — a
    rendered spec from an agent, a saved page, an editable export coming back
    from a reviewer — so the only way in is a detour through some other
    converter. The README's own collaboration tip ends by admitting it: open the
    returned HTML *in a browser* and use Copy markdown, because the Open dialog
    will not take it.

    **One way on purpose: HTML in, markdown from then on.** Not a second
    document format. [markdown-style.js](../front/markdown-style.js) is
    markdown-specific top to bottom — bullet markers, rule characters, wrap
    width, `markdownSegments` — so D1 has no HTML implementation and could not
    get one cheaply, and [MARKDOWN.md](MARKDOWN.md) has already settled that raw
    HTML is neither rendered nor authored (`html: false`, out of D0). An
    editable HTML format would need a second fidelity stack *and* contradict a
    decision already recorded. So HTML is a source to rescue content out of,
    never a document Mandy holds. The way back out exists twice already, in
    [static-export.js](../front/static-export.js) and
    [html-export.js](../front/html-export.js), and neither needs anything.

    **The conversion is two functions that already exist.**
    `htmlToMarkdown(imported)` then `markdownToHtml(that)`, with
    `markdownStyleAdopt(null)` between them so the outgoing document's sniffed
    bullet marker and block index cannot shape the generated markdown. The
    second call adopts that markdown as the document's source, which is the
    answer rather than a shortcut: an import is stable from its *second* save,
    the first writing Turndown's spelling and D1 applying normally from there.

    **Sanitising is free as long as nothing is assigned live.** Turndown parses
    the string into a detached document and reads only the tags its rules know,
    and markdown-it runs `html: false`, so whatever survives as text is escaped
    rather than rendered. The rule to keep is that the imported string never
    reaches a live node before conversion — `<img onerror>` fires the moment it
    does, where a `<script>` would not. Turndown's detached parse is an engine
    claim rather than a measured one, and this is the repo with check pages for
    exactly that; cheap to watch once.

    The stages:

    *   **The server's one gate becomes two** — *not started*.
        `MARKDOWN_EXTENSIONS` in [server.ts](../server/src/server.ts) gates
        browse, GET and POST alike. Reading widens to `.html` and `.htm`;
        **writing does not**, which keeps the security property CLAUDE.md
        records intact and makes "you cannot save as HTML" enforced rather than
        merely conventional. One dialog serves Open and Save As, so the save
        listing offers files it cannot write to until it takes a filter.

    *   **The import path** — *not started*. A branch in `openFileBody`
        ([file-api.js](../front/file-api.js)) on the extension: markdown as
        today, HTML through the three calls above. A Mandy export is the one
        shape whose body is exactly known — take `#editor`'s contents; anything
        else takes `<body>`.

    *   **Imported, not opened** — *not started*, and the only real decision.
        `setCurrentFile(null)`, so Ctrl+S falls through to Save As under a `.md`
        name instead of posting markdown at `notes.html` and collecting the
        server's rejection. It disposes of the disk-changed baseline question
        too: nothing is being tracked, because the file that was read is not one
        Mandy will ever write.

    *   **Tests** — *not started*. An HTML-open case in the `file-path` suite,
        which already drives a fake disk. No fidelity suite is touched, because
        nothing here claims HTML fidelity.

    It reaches nothing in the core, so it neither waits on 3.1 nor is discarded
    by it: after the rewrite the same conversion is Turndown to markdown to
    blocks, which [REWRITE.md](REWRITE.md)'s input layer already specifies for
    paste, and the call site moves rather than the decision. What is lost on the
    way in is worth saying once — `<details>`, `<div align>` and `<img width>`
    flatten to their text, because that is what a markdown document can hold.
    Import rescues prose and structure, not a page. The presentation half of
    that page — what a document looks like, as opposed to what it says — has
    its own answer, and it is a theme rather than a format: the "Document
    themes" section of [ROADMAP.md](ROADMAP.md), which also records why an
    editable HTML document is refused rather than deferred.
*   **6.5** *(survives 3.1)* The service worker intercepts navigations, which
    breaks logging in to any host that puts an auth gate in front of Mandy.
    Found fitting Mandy behind Atrium as a chamber; it is not an Atrium quirk,
    it is what the platform does to a re-issued navigation.

    [sw.js](../front/sw.js)'s fetch listener sends every same-origin GET that is
    not `/api/*` into `networkFirst`, navigations included — `networkFirst` even
    has a `request.mode === "navigate"` branch, so it is deliberate. Answering a
    navigation means re-issuing it with `fetch(request)`, and that drops
    `Sec-Fetch-Mode` from `navigate` to `cors`. A host that reads that header to
    tell a page load from an XHR — the standard way to decide between redirecting
    to a login page and returning a bare 401 — then classifies the page load as
    an XHR. The browser gets a 401 body where the login page should have been,
    and there is no document loaded to notice the 401 and go find one. The user
    sees an error and has no way to authenticate.

    **What it costs to fix is the offline boot, which is why this is not one
    line.** Leaving navigations alone unconditionally is the simple fix, and it
    means an offline launch no longer boots the cached shell: the browser asks
    for `/`, no worker answers, the network fails, and the app never starts. The
    version written for the Atrium variant keeps most of it by guarding on
    `navigator.onLine` — false means there is genuinely no interface, so cache
    is served without any `fetch()` and `Sec-Fetch-Mode` never arises; true goes
    to the network untouched. The gap that leaves is a reachable interface with
    an unreachable server, where the browser's own error page replaces a boot
    that used to work.

    Worth measuring before adopting either: whether re-issuing really does erase
    the header on every engine, or only the ones this was seen on. It is an
    engine claim in a repo that has check pages for exactly that kind of claim,
    and the cheap fix and the careful fix differ only in how much offline
    behaviour they buy back.
*   **6.6** *(survives 3.1)* `/tests/:name` and `/report` exist in every
    deployment, including ones that are not on loopback. Neither is a hole on
    its own — [server.ts](../server/src/server.ts) matches the check pages
    against a literal `CHECK_PAGES` set, so nothing takes a path from the
    request, and `/report` ignores its body beyond printing it. But they are
    development surfaces, and the deployment story has stopped being "loopback
    only": 6.3 ships a binary, and running Mandy behind an authenticating host
    puts them on a hostname.

    `/report` is the one with an edge to it. It writes the request body to the
    process log at any length, so anyone who can reach the port can grow the log
    without limit and put chosen text in it. On loopback that is any local
    process; under pm2 the log is a file on disk.

    The fix is that they should not exist rather than that they should be
    guarded: read a `MANDY_DEV` env var at startup and register the two routes
    only when it is set, so a deployed instance has no such endpoints to reason
    about. The check pages are run by hand from a dev server, which is exactly
    when the var is set, so nothing about how they are used changes.
