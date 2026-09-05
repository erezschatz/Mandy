# TODO

This is what stands between here and a finished 1.0 — for what comes after
that, see [ROADMAP.md](ROADMAP.md).

Items are numbered `section.item` so they can point at each other. The numbers
are labels, not an order and not a priority. An italic *(needs 4.1)* means that
one has to land first, *(best after …)* is a preference rather than a blocker,
and *(unblocks …)* marks an item others are waiting on — those are the ones to
start from. Two more say what kind of item it is: *(undecided)* is a suggestion
nobody has ruled on yet, so it wants a decision before it wants code — settled
ones are recorded in [DECISIONS.md](DECISIONS.md) — and *(fixed, unverified)*
means the work landed but nobody has watched it happen in a browser, so what is
left is the checking.

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
    a link. Missing, still: images, tables, blockquotes, and inline code. They
    render when imported; there is just no way to author them. The Format and
    Insert menus are where they go, and both have room. D4 carries the boundary
    rule for which formats may use execCommand and which get written by hand.

    **Standing instruction, for every slice below:** re-run
    [tests/browser-check.html](../tests/browser-check.html) when adding a format,
    and when a browser does something surprising. It is the only thing in the
    repo that can tell measurement from folklore — the Deno suite has no editing
    engine — and every engine-specific claim in `front/` either came from it or
    is a guess. Its sibling
    [tests/list-indent-check.html](../tests/list-indent-check.html) covers the
    one path that no longer goes through execCommand at all.

    The slices are roughly in order of increasing cost. 1.1.1 (links), 1.1.2
    (h4-h6, plus the 1.1.5 heading-in-list refusal bundled with it) and 1.1.3
    (indent/outdent controls) landed — see CHANGELOG.md.

    *   **1.1.4** *(inline code)* No execCommand; written by hand. Partly
        reachable already — the format bar's Code button produces inline
        `<code>` for a partial selection (see the format-bar section of
        CLAUDE.md) — so the slice is a dedicated control plus confirming the
        caret, whole-block and partial cases all behave.

    *   **1.1.5** *(block controls inside a list)* One execCommand divergence
        remains here, of the two originally found — the other (the
        heading-in-list no-op) is settled and landed; see CHANGELOG.md.
        Measured in Chrome 139 and Firefox 154 by
        [tests/browser-check.html](../tests/browser-check.html):

        - **`indent` outside a list produces a `<blockquote>`**, with inline
          styles in Chrome and without in Firefox. Not reachable today: app.js
          guards Tab to lists only. Recorded because the blockquote control
          (1.1.6) is what will meet it.

        This slice is the consistency rule the hand-written block controls
        (1.1.6) should follow, so settle it alongside or just before them.

        **Standing check, for 1.1.6 and 1.1.8 specifically:** both are new
        hand-rolled DOM surgery, same family as `outdentListItem` and the
        empty-`<li>` Enter/Backspace handler — which ROADMAP.md's "Mandy 2.0"
        section counts as two such clusters already, with a standing rule that
        **a third reclassifies the rewrite from a roadmap item to a 1.0
        blocker.** Before writing either slice, check ROADMAP.md for the
        current count and re-read that rule; if either slice's hand-rolling
        turns up its own contenteditable divergence needing a bespoke fix,
        stop and raise it rather than landing a third cluster quietly. This
        line exists so that check survives being asked for as "do 1.1.6" or
        "do 1.1.8" alone, the way the 1.1.5 cross-reference above almost
        didn't.

    *   **1.1.6** *(blockquotes)* Written by hand. Meets the `indent`-outside-a-
        list divergence in 1.1.5, and wants that slice's "what does a block
        control do to a list" answer settled first. *(third-cluster check
        above applies here.)*

    *   **1.1.7** *(images)* Written by hand — an insertion at the caret plus a
        prompt for src and alt. An image is a leaf, so there is no structural-
        editing story the way tables have one; simpler than 1.1.8 despite also
        being hand-rolled.

    *   **1.1.8** *(tables — also needs 2.1)* Worse than everything above.
        *(third-cluster check above applies here too.)* Not
        just that there is no control to insert one: an *existing* table —
        already in the document, already rendered from markdown-it's `<table>` —
        cannot be edited either. No way to add or remove a row or column.
        Confirmed by hand: editing this very file after `hr: "---"` landed,
        trying to delete the now-obsolete row it made fixed above. Insert is
        hand-written; structural editing is a small grid-surgery layer; and an
        edited table's bytes are 2.1's problem.
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

*   **1.4** Invisible whitespace: what the cleanup does not reach. Pasted HTML
    is sanitised on the way in and U+00A0 is normalised on the way out (see D3
    in [DECISIONS.md](DECISIONS.md)), which covers everything that reaches the
    *file*. It does not cover the live DOM in between: type a trailing space,
    let the browser rewrite it to U+00A0, then select that paragraph and paste
    it into Google Docs, and the character goes with it — that path crosses
    neither boundary. Closing it means normalising the document itself, on a
    debounced `input` or on `copy`, which is fiddlier than either of the two
    that landed: rewriting a text node under the caret can move the caret.

*   **1.5** No search-and-replace. Ctrl+F is chrome-level browser UI that
    highlights matches in the live DOM but exposes nothing to the page, and
    `window.find()` only moves the selection — it doesn't replace, isn't
    standard, and support is inconsistent. So this is one of the few editor
    features the platform doesn't hand over for free: match-finding over the
    document, a highlight/navigate UI, and replacement done through
    `runCommand("insertText", …)` or Range manipulation so it stays undoable
    and raises `input` like everything else in
    [execcommand.js](../front/execcommand.js). A feature in its own right, not
    one of the one-liners nearby.

*   **1.6** *(bug, unfixed)* Undo does not always come back clean. Reported:
    open a file, press Enter at the end of an `<li>` (one edit), then Ctrl+Z.
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

## 2. Save fidelity

Ways the bytes on disk still differ from what was opened, all verified by
round-tripping real files through the running app.
[front/markdown-style.js](../front/markdown-style.js) is what preserves them;
Decision D1 in [DECISIONS.md](DECISIONS.md) is why, and lists the differences
that are deliberate rather than bugs — as does D3, which is the one whole
category fidelity deliberately does not extend to.

*   **2.1** *(wanted by 1.1.8)* An edited table is re-emitted in the `table`
    rule's house style. An untouched one now restores byte-for-byte —
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

## 4. Interface

*   **4.1** Tabbed view — several documents open at once, one per
    tab. The guard it was waiting on has landed, so what is left is the document
    model.

    Today the app is built around holding exactly one: `editor.innerHTML` is the
    entire document state, autosave writes a single
    `localStorage["markdownContent"]`, and file-api.js tracks a single
    `currentFilePath`. Settled: **a tab is a whole document**, so undo history,
    dirty status, file path, mtime baseline and the last-browsed directory are
    all per-tab. Working in tab A and then switching to B must not leave B's
    Open starting from A's directory, and A's unsaved status must still stop the
    window closing.

    Three things the obvious list misses:

    - **`markdownSource` and `markdownStyle` are per-tab too.** The sniffed
      source is what makes a save byte-faithful, and it is already a second full
      copy of the document — see the save-fidelity section of
      [ROADMAP.md](ROADMAP.md). N tabs is therefore 2N copies in
      `localStorage`. Settled: **no budget, no eviction, no per-tab cap.** Each
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
    - **Undo has to park and restore rather than reset.** Every
      `editor.innerHTML` assignment currently picks reset-or-be-undoable, and a
      tab switch is neither. It needs a third option: park the outgoing tab's
      `{undoStack, redoStack, undoCurrent}` and restore the incoming one's. That
      is a real relaxation of "history never crosses a document boundary", safe
      only because the boundary becomes the tab rather than the assignment.
    - **One `#editor`, not N.** app.js, undo.js, file-api.js, format-bar.js and
      outline.js all grab `editor` once at load, so N editor elements would
      fight the whole shared-scope arrangement. Swap the content instead.

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

## 6. Product

*   **6.1** *(best last)* Rewrite the README to better fit the project's state
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
