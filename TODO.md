# TODO

Items are numbered `section.item` so they can point at each other. The numbers
are labels, not an order and not a priority. An italic *(needs 4.1)* means that
one has to land first, *(best after …)* is a preference rather than a blocker,
and *(unblocks …)* marks an item others are waiting on — those are the ones to
start from. Two more say what kind of item it is: *(undecided)* is a suggestion
nobody has ruled on yet, so it wants a decision before it wants code — settled
ones are recorded in [CHANGELOG.md](CHANGELOG.md) — and *(fixed, unverified)*
means the work landed but nobody has watched it happen in a browser, so what is
left is the checking.

A finished item leaves this file rather than staying in it struck through: what
was done and why is in [CHANGELOG.md](CHANGELOG.md), which is the better place
to look for it, and a list of open work reads better without seven closed items
in the way. Numbers are reused when that happens, so a reference in the code or
in [CLAUDE.md](CLAUDE.md) has to be chased down and updated in the same commit
— `grep -rn "TODO [0-9]" .` finds them.

## 1. Editing

*   **1.1** *(needs a browser)* A fenced code block inside a list item. Code now
    declines rather than damaging anything — a whole bullet gets inline
    `<code>`, several bullets get a toast — but the construct markdown actually
    offers there, a fence indented inside the `<li>`, is still unreachable. It
    is left undone because it is a save-fidelity question rather than a DOM one:
    `<li><pre><code>` has to survive Turndown and markdown-it in both
    directions, and nobody has watched it do so. Check that round-trip first;
    the editing part is a few lines either way.

*   **1.3** *(undecided)* Hybrid mode: typing `#` at the start of
    a line turns that line into a heading, and the same for `-`, `>` and a
    ` ``` ` fence. Suggested, not agreed — it commits the editor to reading
    keystrokes as markdown everywhere, which is a different product from a
    WYSIWYG surface with a format bar, and it needs an escape hatch for
    someone who wants a literal `#`.
*   **1.4** *(tables also need 2.3, or 1.6 instead; read D4 first)*
    The UI only supports some of the markup MD offers, and not even all of what
    the README advertises. The format bar has p, h1, h2, h3, bold, italic, ul,
    ol, code, and the Format menu now reaches the same nine — which is more
    reachable, not more capable. Missing, still: links, images, tables,
    blockquotes, h4-h6, strikethrough, inline code, horizontal rules, and
    indent/outdent — that last one is bound to Tab but has no control, so on
    touch there is no way to nest a bullet at all. The Format and Insert menus
    are where they go, and both have room now. They render when imported; there is just no way to
    author them. Tables are worse than the others in that list: it's not just
    that there's no control to insert one, an *existing* table — already in the
    document, already rendered — cannot be edited either. No way to add or
    remove a row or column once markdown-it has rendered the `<table>`.
    Confirmed by hand: editing this very file after `hr: "---"` landed, trying
    to delete the now-obsolete row it made fixed above.

    Two things the browser check already settled for this item. **Strikethrough
    has no Turndown rule** — it lives in `turndown-plugin-gfm`, which this
    project does not carry — so `<del>`/`<s>`/`<strike>` are dropped on save
    today, and a strikethrough control needs a `~~` rule in app.js before it
    needs a button. And of the controls on the list that *do* have an
    execCommand, `createLink`, `insertHorizontalRule` and `strikeThrough` all
    produce identical markup in both engines, so per D4's boundary rule they can
    use it. Tables, inline code and indent/outdent get written by hand either
    way.
*   **1.5** Links are done except for three loose
    ends. Ctrl/Cmd+click follows a link and jumps to `#anchor` headings,
    `anchorSlug` / `headingAnchors` in app.js resolve slugs live, and
    `static-export.js` stamps real ids into the exported markup. What is still
    open:

    - **Relative links are inert on purpose.** `[notes](./notes.md)` is parsed,
      rendered and then ignored: `openExternalLink` builds a `URL` with no base,
      so a relative href throws and is dropped. Resolving it against the origin
      would just 404 off the static handler. The behaviour that would make a
      linked set of markdown files navigable is opening it in Marky through the
      file API, resolved against the directory of the open file — a good deal
      more work than a `window.open`. Following a link means replacing the open
      document, so it now has `openFile` and the dirty/mtime tracking to build
      on; what it still lacks is the unsaved-work guard on that path.
    - **Touch devices have no modifier**, so there is no way to follow a link on
      one, and the hover tooltip never shows either. Wants its own affordance —
      a long-press, or the chip Google Docs shows.
    - **PDF still has no live links at all**, internal or external. html2pdf
      rasterises through html2canvas, so pdf-export.js only restyles `A` to
      blue and nothing survives as a clickable annotation. Heading ids do not
      help; it needs a different PDF path.

*   **1.6** *(undecided; would unblock 1.4 cheaply)* A source view — see and
    edit the markdown inside the app. Today the document lives as HTML in
    `editor.innerHTML` and markdown exists only at the boundaries: markdown-it
    parses on the way in, Turndown serialises on the way out. Copy MD, Download
    MD and Save all emit it, so it is reachable, just not visible. Suggested,
    not agreed — an editable source view makes markdown a second seat of truth
    and raises which one wins, and where it lives (a tab, a split pane, a mode)
    is the same question 4.1 asks about tabs.
*   **1.7** Paste without formatting (Ctrl/Cmd+Shift+V), and the menu reorg it
    comes with. Three parts, and the first is a question rather than work:
    browsers already implement that binding in a `contenteditable` as
    paste-as-plain-text, but the handler in app.js intercepts *every* paste and
    prefers `text/html` whenever the clipboard offers one — so if the browser
    still hands over an HTML flavour we override the user's request. Check in a
    real browser first: if Chrome strips `text/html` for that binding the plain
    branch already fires and there is nothing to build but the Firefox case.
    Either way the robust shape is a flag set from a `keydown` on `#editor` and
    consumed by the next `paste` event.

    Second, the plain branch has a bug waiting for it. It goes through
    `execCommand("insertText")`, which raises `input` with
    `inputType: "insertText"` — and that is in `UNDO_COALESCING`, so a plain
    paste within 600ms of typing merges into the keystroke before it and one
    Ctrl+Z takes back both. The paste path should break coalescing explicitly.

    Third, the Edit menu. It currently holds *Copy markdown* and *Paste
    markdown*, which are whole-document operations, and adding selection-level
    Cut / Copy / Paste beside them gives two pairs of near-identical names
    meaning entirely different things. The split that resolves it: **Edit** gets
    Cut, Copy, Paste and Paste without formatting; *Copy markdown* moves to
    **Export**, where "copy as markdown" is what it has always meant; *Paste
    markdown* moves to **Insert**, which needs 1.8 first to stop being a lie.
    Cut and Copy can go through `execCommand`, which raises `input`, so undo and
    the dirty flag pick them up for nothing. `mousedown` is already prevented
    over the bar, so the editor's selection survives the click.

    Note that this is now a convenience rather than a fix: the whitespace
    cleanup took the pain out of an ordinary paste, so what is left here is
    wanting the text bare, not wanting it repaired.

*   **1.8** *(wanted by 1.7)* Paste markdown replaces the document instead of
    inserting into it. `onToolbarAction("paste-md")` in app.js assigns
    `editor.innerHTML` outright — a legacy of the serverless model, where
    replacing the document from the clipboard was the closest thing to an Open
    there was. There is a real Open now, and no editor anywhere has a "replace
    everything from the clipboard" command. It should insert at the caret like
    its name says; wanting the replacement is Clear followed by Paste, which is
    two deliberate actions rather than one surprising one.

    `insertToc` in outline.js is the pattern to copy — caret insertion with a
    synthetic `input` event. Doing it that way also stops this being an
    `innerHTML` assignment site, so it becomes ordinarily undoable and drops out
    of the count the undo suite keeps.

*   **1.9** Invisible whitespace: what the cleanup does not reach. Pasted HTML
    is sanitised on the way in and U+00A0 is normalised on the way out (see D3
    in [CHANGELOG.md](CHANGELOG.md)), which covers everything that reaches the
    *file*. It does not cover the live DOM in between: type a trailing space,
    let the browser rewrite it to U+00A0, then select that paragraph and paste
    it into Google Docs, and the character goes with it — that path crosses
    neither boundary. Closing it means normalising the document itself, on a
    debounced `input` or on `copy`, which is fiddlier than either of the two
    that landed: rewriting a text node under the caret can move the caret.

## 2. Save fidelity

Ways the bytes on disk still differ from what was opened, all verified by
round-tripping real files through the running app.
[front/markdown-style.js](front/markdown-style.js) is what preserves them;
Decision D1 in [CHANGELOG.md](CHANGELOG.md) is why, and lists the differences
that are deliberate rather than bugs — as does D3, which is the one whole
category fidelity deliberately does not extend to. In rough order of how much
they matter:

*   **2.1** **Reference links are inlined and the definition block deleted.** A
    document that cites the same URL in twenty places arrives with one
    definition and leaves with twenty copies. The restore cannot cover it:
    inlining changes the text of the block, so the block stops matching itself.
    Turndown's `linkReferenceStyle` is not the fix — it converts *every* link
    to a reference, the same rewrite in the other direction. Wants a rule that
    emits a reference only where the source already had a definition, plus
    somewhere to re-emit the definition block.
*   **2.2** The source is persisted as a second copy of the document.
    `adoptMarkdownStyle` writes the incoming markdown to
    `localStorage["markdownSource"]`, because the autosave is HTML and carries
    no markdown to re-sniff on reload. It roughly doubles what Marky stores,
    and a document that blows the quota keeps editing and saving but loses byte
    fidelity across a reload — a `console.warn` and nothing else. Storing the
    derived style plus block hashes instead of the whole source would be
    smaller, and could not reconstruct the bytes.
*   **2.3** *(wanted by 1.4)* An edited table is re-emitted in the `table`
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
*   **2.4** `markdownSegments` splits on blank lines, list markers, headings
    and fences. A change anywhere in a fenced block, a table or a multi-line
    paragraph re-serialises the whole segment. Finer granularity would need to
    match at line level, which is a different and much less safe algorithm.

## 3. Format bar

*   **3.1** Selection doesn't identify the elements inside it.
    `updateActiveButtons` walks up from `selection.anchorNode` only, so the
    active states reflect wherever the selection *started* rather than the
    whole of it: select a bold run and B lights up, select a span covering both
    bold and non-bold text and it still lights up (or doesn't) depending only
    on the anchor end. It should reflect the whole selection — all-bold vs
    mixed vs none — and probably show a third, indeterminate state for mixed.

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
      copy of the document (2.2). N tabs is therefore 2N copies in
      `localStorage`, and blowing the quota does not break editing — it silently
      costs fidelity on the next reload, with a `console.warn` and nothing else.
      Decide what happens with eight tabs open *before* the tab bar, not after.
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
    arithmetic in app.css follows it, and the `(edited)` suffix becomes the
    conventional red `*` against each unsaved tab. (If what was meant is
    edit/preview/source tabs rather than multiple files, that is 1.6.)

*   **4.2** *(undecided)* The static HTML export's table of contents follows
    the outline sidebar's toggle, because that toggle is the only switch that
    exists. It is the wrong control: the sidebar is chrome for whoever is
    editing, the export's TOC is content for whoever receives the file, and
    there is no reason the two should be one decision. The right home is a
    Settings pane, which does not exist yet — as would "which heading levels
    does the outline show", if that ever stops being "all of them". Until then
    the coupling is documented rather than fixed. (`documentBody` in
    static-export.js, gated on `outlineIsOpen`.)

## 5. Architecture

*   **5.1** Three execCommand divergences that survive normalisation. The
    decision is settled — D4 in [CHANGELOG.md](CHANGELOG.md): execCommand stays,
    [front/execcommand.js](front/execcommand.js) normalises what it leaves
    behind, and new formats follow the boundary rule recorded there. What is
    left here is the residue that normalisation cannot reach, all three measured
    in Chrome 139 and Firefox 154 by
    [tests/browser-check.html](tests/browser-check.html):

    - **Firefox loses a bullet on outdent.** Shift+Tab on a nested item gives
      `<li>one<br>two</li>` — merged into the item above — where Chrome gives two
      siblings. This is the one with teeth: it is reachable from a shortcut the
      app binds, and it silently costs the user a list item. It cannot be
      normalised, because that markup is indistinguishable from a deliberate
      hard break inside a list item, so it needs a real fix — most likely doing
      the outdent by hand for the nested case rather than asking for it.
    - **A heading inside a list item should be a no-op, and currently is only in
      Chrome.** Chrome wrapped the whole list in the heading, which was
      destructive and is now unwrapped — so the command does nothing there.
      Firefox puts the `<h1>` inside the `<li>`, which is what was literally
      asked for and does round-trip through markdown.

      Settled: **the no-op is the wanted behaviour, in both engines.** A heading
      inside a bullet is expressible but it is not something the editor should
      offer a way to make by accident, and "less havoc than Chrome" is not the
      same as right. So the fix is to refuse it in `applyFormat` — where the
      selection still exists, unlike in `normaliseEditorMarkup` — rather than to
      teach Chrome the Firefox behaviour. Deferred to 1.4, since that is when
      block formatting gets looked at properly and the refusal wants to be
      consistent with whatever the other block controls do about lists.
    - **`indent` outside a list produces a `<blockquote>`**, with inline styles
      in Chrome and without in Firefox. Not reachable today: app.js guards Tab to
      lists only. Recorded because the check confirms that guard is still
      earning its place, and because 1.4's blockquote control will meet it.

    Re-run the check page when adding a format, or when a browser does something
    surprising. It is the only thing in the repo that can tell measurement from
    folklore — the Deno suite has no editing engine, and the first run of this
    page killed two long-standing beliefs about which engine did what.

*   **5.4** The file-server liveness check only runs once, in the startup IIFE
    in [front/file-api.js](front/file-api.js). It probes `/api/home` and
    disables Open/Save/Reload/Save As if the server is not there — but never
    again: start the app with the server up and kill it mid-session and the
    buttons stay live, so the next click fails with a `notify` rather than
    being disabled up front. Start with the server down, bring it up
    afterwards, and the buttons stay dead until a full reload, even though
    nothing else about the page needs one.

    `checkDiskChanged` already re-verifies a weaker version of the same
    question — "does what we believe about the outside world still hold" — on
    `focus`, `visibilitychange` and startup, so the trigger points are not new.
    But it cannot just be folded into that function: `checkDiskChanged` only
    runs when `currentFilePath && fileMtime`, i.e. only with a file open, and
    liveness has to be checked with no file open too (a fresh install, the
    welcome doc, a file opened before the server died). It also needs to flip
    both ways where the startup check today only flips one: extract the probe
    into something like `setServerAvailable(bool)` that can enable the buttons
    back as cleanly as it disables them, and call it from the same wake
    triggers as `checkDiskChanged` rather than standing up a second independent
    listener pair.

*   **5.2** *(subsumes 5.3)* No module system. Every file in front/ is a plain
    `<script>`, so every top-level `const` is a shared global and collisions
    are real bugs, not hypotheticals (`CLOSE` vs `DOC_CLOSE`, `saveFileAs` vs
    FileSaver's `saveAs`). The fix is `<script type="module">` with real
    imports, which browsers support natively — but it conflicts with the
    editable export concatenating every JS file into one inline `<script>`, so
    it needs import maps or blob URLs. Real work, needs a decision first.
*   **5.3** *(subsumed by 5.2)* Load order is still load-bearing. toolbar.js
    must run first because it defines `onToolbarAction`, which every other
    module calls at load. Click delegation removed the silent bound-to-null
    failure, not the ordering requirement.

## 6. Product

*   **6.1** *(best last, and at least after 6.3)* Rewrite the README to better
    fit the project's state. D0 in [CHANGELOG.md](CHANGELOG.md) is the framing
    to write it from — what the project is *for* is argued there and nowhere in
    the README, which still describes a markdown editor rather than the case for
    one.
*   **6.2** More export options. The set today is markdown, HTML, PDF, DOCX and
    Editable. Decide what else earns a place — ODT or RTF for word processors
    that are not Word, plain text, EPUB, a slide deck, an image of a single
    diagram. The constraint that used to sit beside this one is gone: the export
    group was the most crowded part of the toolbar, and the Export menu has room
    for whatever earns it. What remains is that each format is another heavy
    library behind an `ensure*` loader in lazy-load.js.
*   **6.3** *(feeds 6.1)* The "collaborative" framing doesn't hold.
    Collaborative in 2026 means Google Docs — two people editing one document.
    This is the Word model: pass a file back and forth by mail. Worse, every
    hop mints a *new* file, because the editable export fuses the document and
    the application into one artifact, so there is no stable document identity
    to write back to. You open X, you export Y, and now which one is current?
    Three routes out: both sides run the full Marky (server + client) and pass
    plain .md; or the exported file writes back to itself via the File System
    Access API (Chromium-only, and needs testing from `file://` before anyone
    designs around it); or shared storage both sides can reach. Failing all of
    those, describe it honestly as send-for-review, one hop.
*   **6.4** Mermaid diagrams in the static HTML export keep the light palette
    they were rendered with, since Mermaid isn't shipped with the document.
    Dark-mode readers get a white card behind the diagram as a workaround
    rather than a properly re-rendered dark one.
