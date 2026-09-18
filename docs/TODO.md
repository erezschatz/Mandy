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

*   **1.7** *(measurement first; the binding lands with 3.1 stage 2)*
    **No format shortcut is Mandy's.** `app.js` binds Ctrl+S, Ctrl+O,
    Ctrl+Shift+P and Ctrl+K, and nothing binds Ctrl/Cmd+B or Ctrl/Cmd+I — the
    three formats that have a conventional shortcut at all are left to whatever
    the engine does with the key inside a `contenteditable`, and the other ten
    have no shortcut to be broken. Measured 2026-09-10 while running 3.1's
    stage-0 spike, which is the only reason anyone noticed: Blink bolds, **Gecko
    on macOS opens the bookmarks sidebar** and the page never sees the key, and
    **WebKit does nothing at all**. So in two engines out of three the most
    common formatting shortcut in any editor is dead on `main` today, silently.

    The fix is one `keydown` handler on the editable calling the same command
    the Format menu calls, and it belongs with 3.1 stage 2, where every format
    becomes a model command and the handler has somewhere to call into. Writing
    it against `execCommand` first would be a fourth thing D4's amendment says
    not to start on the old core.

    **The measurement comes first, and it is 4.2's shape exactly**: two things
    have to be true before a binding works — the keydown has to reach the page,
    and `preventDefault` has to suppress what the browser wanted the key for.
    [spike/block-model.html](../spike/block-model.html) answers the first half —
    a `keydown` row in its Events table means the key arrived, no row means the
    browser kept it — and **it arrived: measured 2026-09-10, a `keydown`
    binding with `preventDefault` takes Cmd+B back in all three engines**, so
    the fix is the ordinary one and no fallback binding has to be invented. That
    is the good outcome, and it is only known because it was pressed: 4.2's
    identical question about the tab strip is still unpressed everywhere but
    Chrome on macOS.

    What no script can see is whether Gecko *also* still opens its sidebar on
    that keystroke. If it does, the binding is worse than dead — it would move
    Mandy's formatting and the browser's chrome together — so that is the one
    thing to watch for when the binding lands in stage 2, and the reason 1.7
    stays open rather than closing on the measurement above.

*   **1.8** *(needs 3.1)* **Nothing in Mandy inserts a line
    break inside a paragraph.** There is no menu item — all thirty were checked
    on 2026-09-13 — no format-bar button, and no binding: `app.js` binds Ctrl+S,
    Ctrl+O, Ctrl+Shift+P and Ctrl+K and never Shift+Enter, and the hand-rolled
    empty-`<li>` Enter handler explicitly *bails out* when `shiftKey` is set. So
    a break is reachable today only because the browser's own `contenteditable`
    inserts a `<br>` for Shift+Enter, which is the engine's behaviour and not
    Mandy's — unmeasured here, like every other engine claim that has not been
    through a check page.

    That is the same gap 1.7 describes for the format shortcuts and the same
    answer: **`insertLineBreak` is already in REWRITE.md's input-layer table**,    so the work is a `keydown` binding and a model command in 3.1 stage 2,
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

*   **2.3** *(bug, closed by 3.1; no fix on the old core unless it turns up in
    use)* **An untouched block loses a minority spelling.** Layer 3 promises
    that a block the user never edited comes back byte-identical, and for two of
    layer 1's own sniffed options it does not.

    `sniffMarkdownStyle` reads the hard break and the emphasis delimiter
    **document-wide**, and Turndown writes the winner into every block before
    `restoreSourceWrapping` runs. `markdownBlockKey` collapses whitespace and
    unescapes punctuation, but knows nothing about style spellings — so a block
    written the minority way keys differently from its own source, misses the
    index, and falls through to layer 2, coming back rewritten *and* re-wrapped
    with no edit anywhere near it.

    Measured 2026-09-13 by opening a document and serialising it, no edit made:

    | Source | Comes back as |
    | --- | --- |
    | `Charlie one\` | `Charlie one  ` |
    | `_underscored_` | `*underscored*` |

    The same reasoning covers any document-wide option whose output differs from
    the source in a non-whitespace byte; the bullet marker escapes it only
    because `sniffMarkdownStyle` reads that one per nesting depth.

    **It only bites a document that mixes spellings, and it loses no content** —
    the break is still a break and the emphasis still emphasis, which is why it
    went unnoticed through the whole of 2.2. What it costs is the mergeable diff
    D1 exists for: a save touches lines the user did not.

    **The fix is 3.1 and it needs no work of its own there.** Slice 2 step 3
    records each node's spelling as written, at parse, and slice 3's emitter
    puts that back — so an untouched block is never re-emitted at all, and an
    edited one keeps its own spelling rather than inheriting a document-wide
    guess. Sniffing survives only for genuinely new content, per MARKDOWN.md's
    **S3**. Fixing it on the old core means making the key style-insensitive,
    which is one normalisation per sniffed option and a second place that can
    disagree with the serialiser — worth it only if this shows up in daily use
    before 3.1 lands.

    Found while verifying the empty-`<li>` check page, not by the 2.2 work, and
    `5d96619`'s CHANGELOG entry recorded the opposite: it saw the rewrite in an
    edited block and concluded the spelling moves "only in a block the user was
    already editing". That entry now carries a correction.

## 3. The editing core

*   **3.1** *(unblocks 1.1.6, 1.1.7, 1.1.8, 1.4, 1.6, 1.8, 2.3)*
    Replace the editing core: hold the document as a block-granular markdown
    model with source spans, render it to the DOM, and treat contenteditable
    as an input method whose `beforeinput` intentions are reinterpreted as
    model edits rather than trusted the way `execCommand`'s output is today.
    Retires D4, `undo.js`'s snapshot design, `execcommand.js`, the content-keyed
    restore in `markdown-style.js`, the Mermaid and LaTeX source stashes, and
    the reason a table cell cannot be edited. Leaves the ~5,300 lines around
    the core — menus, notify, file API, outline, exports, server — substantially
    alone, and the tabbed view nearly so: its swap moves a model reference instead
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

    **Started 2026-09-09 on branch `rewrite`.** REWRITE.md's "Where each stage
    stands" is the running status, one line per stage, updated as each lands.

    **The gate passed**: [spike/block-model.html](../spike/block-model.html) was
    driven by hand in Blink, Gecko and WebKit on 2026-09-10 — typing, Enter,
    Backspace, the accent popup and a refused edit inside a read-only block all
    behave, with the DOM never diverging from the model. The one check that
    failed is keyboard routing upstream of `beforeinput` and is a gap `main`
    already has; it became **1.7**.

    Stage 1 is in progress: slices 1 and 1b are done and tested, slice 2 (the
    inline model) is under way — steps 0, 1 and 2 landed on 2026-09-14, steps 3
    to 6 have not started — and slice 3 (the block serialiser) follows. D7 in
    [DECISIONS.md](DECISIONS.md) is the rule for what the branch may do to the
    live editor on the way, and step 0 is the first change here to take it up:
    `math` and `referenceAwareLink` are out of `app.js` and in
    [front/markdown-parser.js](../front/markdown-parser.js), so the suite and the
    app parse with one configuration rather than the suite seeing a bare
    parser.

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

*   **4.6** *(bug, survives 3.1)* The outline is a second late. Switch tabs,
    open a new one, open or reload a file, and the sidebar goes on showing the
    previous document's headings for a second before it catches up — long
    enough to read as a different document's outline, and long enough that a
    tab switch feels like it has not finished.

    **The whole delay is one constant.** Rebuilds hang off a `MutationObserver`
    on `#editor`, debounced by `OUTLINE_DEBOUNCE` in
    [outline.js](../front/outline.js) — one second, copied from the autosave so
    that the sidebar does not flicker while someone is still typing a heading.
    A document swap is one `innerHTML` assignment and so one observer batch,
    which then waits the full second. Every swap pays it: `adoptActive` in
    [tabs.js](../front/tabs.js), Open and Reload in `file-api.js`, New, and
    the welcome fetch.

    **It is a `main` bug, not a rewrite one.** [REWRITE.md](REWRITE.md) lists
    `outline.js` among the modules 3.1 leaves alone because they read the
    rendered DOM, and says in *Rendering* that the observer survives per-block
    re-render. Nothing in the model, the renderer or the input layer changes
    when the observer fires or how long it waits, so this does not wait on 3.1
    and gains nothing from riding it.

    *   **Measure** — *done 2026-09-18*. Instrumented the running app with a
        second observer on `#editor` and one on `#outline`: a new tab and a
        switch back each produced exactly one mutation record, target
        `#editor`, type `childList`, at 6ms, and one outline render at 1007ms.
        Nothing re-arms the timer inside the window; what feels like two
        seconds is one, plus the redraw. So the fix is the constant's shape,
        not a second cause.

    *   **Fix** — *done and tested*. The debounce defends typing, and a swap is
        not typing: a record whose target is `#editor` itself with
        `childList` is a top-level structural change — a document swap, or an
        Enter or Backspace at the top level — and renders at once; a record
        inside the subtree, or a text change, keeps the second. The
        distinction is read off the record the browser hands over rather than
        off a flag the callers would each have to set, so Open, Reload, New
        and the welcome fetch are covered without any of them learning about
        the outline. The `outline` suite drives the observer's callback with
        both record shapes and asserts which one arms the timer.

    *   **Verify in a browser** — *done 2026-09-18, Chrome*. Same
        instrumentation, after the change: the render lands in the same
        animation frame as the swap, both directions.

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
    Import rescues prose and structure, not a page.
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

    **3.1 may answer this by deletion instead, which is worth knowing before
    the env var is built.** `CHECK_PAGES` holds exactly three names —
    `browser-check`, `list-indent-check`, `list-empty-item-check` — and those
    same three are the only pages that `POST /report`. All three retire with
    execCommand. So when the rewrite lands, both routes lose every caller at
    once: the set is empty and the sink has nobody writing to it, and two
    endpoints that serve nothing are removed rather than gated. The open part
    is whether 3.1's own input-layer check page wants them back —
    `spike/block-model.html` needs no server and `paste-check` and
    `tab-shortcut-check` are run off disk, so the precedent says no. If a
    successor does want a sink, `MANDY_DEV` is still the answer and this item
    is unchanged; if not, it shrinks to a deletion. Neither waits on the other,
    but doing 6.6 first risks building a gate for two routes about to be
    deleted.
