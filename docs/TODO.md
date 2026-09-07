# TODO

This is what stands between here and a finished 1.0 — for what comes after
that, see [ROADMAP.md](ROADMAP.md).

The item to start from is **3.1**, the editing-core rewrite: most of section 1
and all of section 2 now land on it rather than on the current engine.
[REWRITE.md](REWRITE.md) is its design and plan, D6 in
[DECISIONS.md](DECISIONS.md) the decision.

Items are numbered `section.item` so they can point at each other. The numbers
are labels, not an order and not a priority. An italic *(needs 4.1)* means that
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
      more work than a `window.open`. Following a link means replacing the open
      document, so it now has `openFile` and the dirty/mtime tracking to build
      on; what it still lacks is the unsaved-work guard on that path.
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
    The `(edited)` marker stays lit, and the caret jumps to the top of the
    document rather than back to where the edit was.

    Both halves point at the same place. `file-api.js` clears `(edited)` when
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

*   **3.1** *(unblocks 1.1.6, 1.1.7, 1.1.8, 1.4, 1.6)*
    Replace the editing core: hold the document as a block-granular markdown
    model with source spans, render it to the DOM, and treat contenteditable
    as an input method whose `beforeinput` intentions are reinterpreted as
    model edits rather than trusted the way `execCommand`'s output is today.
    Retires D4, `undo.js`'s snapshot design, `execcommand.js`, the content-keyed
    restore in `markdown-style.js`, the Mermaid and LaTeX source stashes, and
    the reason a table cell cannot be edited. Leaves the ~5,300 lines around
    the core — menus, notify, file API, outline, exports, server — untouched.

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

*   **4.1** Tabbed view — several documents open at once, one per tab. The
    guard it was waiting on has landed. **It is not blocked on 3.1** — it builds
    on the current core, on `main`, while the rewrite sits on its own branch and
    absorbs tabs when it merges. What follows was written against the current
    core; the places 3.1 changes are noted inline.

    **It carried *(needs 3.1)* from 2026-09-06 to 2026-09-07, and that was
    wrong.** The marker went on in the pass that re-marked the whole file for
    the rewrite rather than from an argument made about this item, and the
    arguments that were written down do not carry it: the 2N-to-N `localStorage`
    count below is a constant factor against a quota nobody has hit, and "every
    item marked *(needs 3.1)* waits" restates the marker instead of justifying
    it. Measured against the per-tab state list, most of this is
    core-independent — `currentFilePath`, `isDirty`, `fileMtime`, `diskChanged`
    and the last-browsed directory all live in `file-api.js`, which
    [REWRITE.md](REWRITE.md)'s fate table leaves untouched, and the tab bar, the
    per-tab dot, the `beforeunload` compensation and restore-on-load never reach
    the core at all. What 3.1 discards is two things: the per-tab
    `markdownSource` maps, for an index that stops existing, and swapping HTML
    strings where the model swaps a reference. Days of throwaway work, not a
    structural blocker.

    The app is still built around holding exactly one: `editor.innerHTML` is the
    entire document state and `file-api.js` tracks a single `currentFilePath`.
    Storage is the part that has already moved — stage 2 below put the open
    document under per-tab keys, reached through `documentKey(name)`. Settled: **a tab is a whole document**, so undo history,
    dirty status, file path, mtime baseline and the last-browsed directory are
    all per-tab. Working in tab A and then switching to B must not leave B's
    Open starting from A's directory, and A's unsaved status must still stop the
    window closing.

    Three more are settled, and they decide what gets built rather than how:

    - **Open replaces the current tab's document**, exactly as it does today,
      and stays behind `confirmDiscard`. Tabs do not multiply by opening files.
    - **New makes a tab.** It stops resetting the document in place, so it stops
      discarding anything and drops out of `confirmDiscard`'s callers — leaving
      that guard covering Open and Reload. Clear is untouched: still an ordinary
      undoable edit, still leaving the file association where it is, so the
      New/Clear split holds with New's weight moved rather than removed.
    - **Closing the last tab leaves one blank untitled tab**, rather than
      emptying the editor to no document at all. `app.js`, `undo.js`,
      `file-api.js`, `format-bar.js` and `outline.js` each grab `editor` once at
      load and assume a document behind it; a no-document state is a null case
      none of them has.

    New's current body is not lost when it stops being a toolbar handler. Blank
    the document, drop the autosave, drop the sniffed style, drop the file
    association — that is precisely what closing the last tab has to do, so it
    becomes a reset primitive with two callers instead of a handler with one.

    Three things the obvious list misses:

    - **`markdownSource` and `markdownStyle` are per-tab too.** The sniffed
      source is what makes a save byte-faithful, and it is already a second full
      copy of the document — see the save-fidelity section of
      [ROADMAP.md](ROADMAP.md). N tabs is therefore 2N copies in
      `localStorage` — until 3.1, after which the model *is* the source, each
      block carrying its own bytes, and the count is N. Settled either way:
      **no budget, no eviction, no per-tab cap.** Each
      tab's `localStorage.setItem` either succeeds or fails on its own, exactly
      as it does today for one document — the browser's quota is not ours to
      manage, and building a fairness scheme (which tab gets evicted to make
      room for a new one, how many tabs are "supported") would be solving a
      problem nobody has hit yet at the cost of real complexity. A tab that
      loses the race degrades silently to "sniffs to nothing" on its next
      reload, same as a single oversized document does now — cosmetic, not
      data loss, and **not surfaced to the user at all**: the failure never
      touches the current session, the file that gets saved, or the save
      action itself, so any UI mention of it reads as "something's wrong with
      my file" to someone who has no way to act on it and did nothing wrong.
      Stays a `console.warn`, unchanged, for whoever is debugging it.
    - **Undo parks and restores rather than resetting, and that half has
      landed.** Every `editor.innerHTML` assignment picks reset-or-be-undoable
      and a tab switch is neither, so it needed a third option: `undoPark()`
      hands back the outgoing tab's history bundle and `undoAdopt()` installs
      the incoming one's. That is a real relaxation of "history never crosses a
      document boundary", safe only because the boundary becomes the tab rather
      than the assignment. Two things are left to get right at the call site.
      `undoAdopt` trusts the bundle to match what is on screen and never
      re-snapshots, so the content swap comes first, always. And **`cleanPosition`
      moves into the tab record and parks with the bundle** — the sharpest silent
      failure in the item. `nextId` is per-bundle and counts from zero;
      [undo.js](../front/undo.js) says so in as many words, "ids are only ever
      compared within one bundle". Leave `cleanPosition` a single global and tab
      A's id 7 reads as tab B's id 7, so a dirty document reports clean, which
      switches off the unsaved-work guard on Open, Reload and New *and* the
      `beforeunload` warning together. It misfires only when two tabs' edit
      counts line up, so no manual pass will find it.
    - **One `#editor`, not N.** app.js, undo.js, file-api.js, format-bar.js and
      outline.js all grab `editor` once at load, so N editor elements would
      fight the whole shared-scope arrangement. Swap the content instead — and
      after 3.1 that swap is a model reference rather than an HTML string, a tab
      being one model and the editor rendering whichever is active.

    **The one class of bug that is new rather than bigger: every `await` between
    "which document" and "the bytes".** It is unreachable today because there is
    only one document to be wrong about, and each instance of it writes the wrong
    document somewhere the user cannot undo:

    - `saveFile` takes a path, then awaits `confirmOverwrite` — and possibly the
      whole `saveFileAs` browser — before it reads `editor.innerHTML`. Switch in
      that window and tab B's content goes over tab A's file, with the toast
      saying "Saved".
    - `openFile` assigns `editor.innerHTML` after its `await fetch`. A slow read
      and a switch put the file in the wrong tab.
    - Autosave is one `saveTimer` writing one fixed key. Switching inside the 1s
      debounce drops the outgoing tab's last edits, and autosave is the only
      thing carrying unsaved work across a browser reload.
    - `beforeunload` persists the active document alone. Background tabs need
      their content already written, or closing the window takes all of them.

    Settled: **a switch is refused while a file operation is in flight**, rather
    than each site capturing its own copy of the document up front. One rule in
    one place beats four, and capturing early would write the document as of the
    Save click rather than as of the confirm, which is a different answer nobody
    asked for. Half of it is true by accident already — `.notify-backdrop` and
    `.file-dialog` are both full-viewport `inset: 0` overlays, so a mouse cannot
    reach a tab bar behind one. The gap is the keyboard: four `document`-level
    `keydown` listeners (`app.js`, `file-api.js`, `undo.js`, `toolbar.js`) fire
    straight through an open dialog, so the Ctrl+Tab / Ctrl+1–9 binding this item
    adds has to make the check itself.

    **3.1 does not close this, which is the reason it is written down here.** The
    awaits stay — the file API is HTTP and the dialogs wait on a human — and so
    does the single active-document global, so the same read after the same await
    is the same bug wearing a new variable name. What the rewrite changes is
    which fix is available. Today the document *is* the DOM, so a background tab
    is a frozen string and "serialise tab A right now" has no answer; once N
    models are live with one rendered, the fix is capture `tabId` at the top and
    serialise `tabs[tabId].model` at the bottom, and the lock can come off. Build
    the lock anyway: it is small, and it is correct on both cores.

    `beforeunload` cannot name which tab is dirty — the browser shows its own
    string and will not wait on us. That is accepted rather than solved: the
    compensation is on the next load, where the restored tabs can show which are
    unsaved, and where the information is actually usable.

    The bar has a home already: the menu bar left the toolbar as two rows, and
    the second — `.toolbar-content`, holding the filename and the theme toggle —
    is shaped for a tab bar rather than for one label. `--toolbar-height`
    arithmetic in app.css follows it. (If what was meant is edit/preview/source
    tabs rather than multiple files, that is the source view D0 in
    [DECISIONS.md](DECISIONS.md) refuses.)

    **The `(edited, disk changed)` text label becomes a single dot per tab.**
    Settled: a red dot for edited (whether or not the disk also changed — edited
    is the more urgent of the two and wins outright, no need to distinguish the
    combination visually), a neutral dot for disk-changed-only, no dot when
    clean. `var(--notify-error)` and `var(--text-toolbar)` respectively — both
    already theme-aware tokens, so no new ones needed, and `--text-toolbar`
    reads fine against `--bg-toolbar` in either theme (`#2c3e50` light,
    `#0f1419` dark — different values, both dark enough that white text is
    already how the toolbar reads its own labels). A colour-only signal is a
    soft accessibility gap on its own, so the full sentence — what the current
    text label says today — has to still exist as a real `title`/`aria-label`,
    not just a CSS hover tooltip, the same discipline `theme-manager.js`
    already applies to the theme toggle's own title. The transient toasts
    (Saved!, Reloaded!) are unaffected — the dot is the ambient state between
    actions, not a replacement for the feedback an action already gives.

    **The stages, and where each one stands.** Kept here rather than in a
    commit message so that a CHANGELOG entry saying "stage two" resolves to
    something. Each lands on its own.

    1.  **State boundaries** — *done and tested.* Every module owning part of a
        document exposes a park/adopt pair; a round trip through one is
        lossless and writes no storage. `undoPark`/`undoAdopt` already existed;
        `filePark`/`fileAdopt` and `markdownStylePark`/`markdownStyleAdopt` are
        the additions.
    2.  **Storage** — *done and tested*, in the suite and by hand in Firefox.
        One document persisted under per-tab keys, reached through
        `documentKey(name)`; an existing session either migrates onto them or
        provably keeps every flat key it had.
    3.  **The hazards** — *done, tested in the suite.* Nothing to verify by
        hand yet: there is no switch to refuse until stage 4, so what landed is
        the predicate and the two things that consult it. Three additions, no
        behaviour change while there is one tab:

        -   `fileOperationInFlight()` in `file-api.js`. A counter rather than a
            boolean, because the operations nest — `saveCurrentOrPrompt` calls
            `saveFileAs` calls `saveFile` — and true also while the file dialog
            is open, since `showOpenDialog` returns as soon as the dialog is
            rendered and the pick arrives later on a click. `openFile` needs
            its own turn of the counter regardless: the entry click closes the
            dialog *before* calling it, and does not await it.
        -   `tabsSwitchAllowed()` in `tabs.js`, the single gate stage 4's
            switch and stage 5's Ctrl+Tab both call. It is where the keyboard
            gap is closed: `.notify-backdrop` and `.file-dialog` already stop a
            mouse reaching a tab bar, but four `document`-level `keydown`
            listeners fire straight through an open dialog.
        -   `flushAutosave()` in `app.js`, so the 1s debounce can be forced.
            Without it a switch inside that second drops the outgoing tab's
            last edits, and autosave is the only thing carrying unsaved work
            across a browser reload. `format-bar.js`'s own 100ms `saveSoon`
            timer needs no equivalent: it resolves its key at fire time, so
            after a flush it rewrites the incoming tab's content under the
            incoming tab's key, which is redundant rather than wrong.

        **The four late-read sites are deliberately not touched.** The settled
        answer above is the lock, not per-site capture: one rule in one place
        beats four, and capturing early would write the document as of the Save
        click rather than as of the confirm. `checkDiskChanged` and
        `checkServerAvailable` are excluded from the counter for the opposite
        reason — they run on every window focus, so locking on them would make
        switching fail at moments with no explanation attached.
    4.  **N tabs** — *not started.* Two documents open and switchable, driven
        from the suite. No bar yet.
    5.  **The bar** — *not started.* `.toolbar-content` becomes the tab bar:
        the per-tab dot, close, Ctrl+Tab and Ctrl+1–9, and the
        `--toolbar-height` arithmetic following it.

    **Stage 3 comes before stage 4 deliberately, and that is the one ordering
    here which is a safety property rather than a preference.** The four
    late-read sites above are unreachable while there is one document to be
    wrong about and go live the moment there are two, so they are closed before
    a second tab can exist rather than after one could already have written the
    wrong file.

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
