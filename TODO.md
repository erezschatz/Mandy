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

*   **1.1** Block vs inline formatting is not distinguished. Selecting part of
    a line and pressing Code turns the whole line into a code block. A partial
    selection should produce inline `<code>`; only a whole-line selection
    should produce a block. P/H1/H2/H3 are inherently block-level, so decide:
    act on the whole line by design, or disable them for partial selections.
*   **1.2** `toggleCodeBlock` operates on top-level editor children, so a
    selection inside a bullet replaces the entire `<ul>` with one `<pre>` and
    runs all the items together. (format-bar.js, `blocksInRange`)
*   **1.3** *(undecided)* Hybrid mode: typing `#` at the start of
    a line turns that line into a heading, and the same for `-`, `>` and a
    ` ``` ` fence. Suggested, not agreed — it commits the editor to reading
    keystrokes as markdown everywhere, which is a different product from a
    WYSIWYG surface with a format bar, and it needs an escape hatch for
    someone who wants a literal `#`.
*   **1.4** *(tables also need 2.4, or 1.6 instead)*
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
*   **1.5** *(relative links need 1.7)* Links are done except for three loose
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
*   **1.7** Nothing guards unsaved work. The toolbar says
    `(edited)` when the document has diverged from the file, and Reload and an
    overwriting Save both act on it now — but the other three ways out of a
    dirty document still throw it away without asking:

    - **Open** replaces the document outright. `openFile` in file-api.js
      assigns `editor.innerHTML` and overwrites the autosave with no check at
      all, so opening a second file silently discards unsaved edits to the
      first. Note `reloadFile` guards the same call and Open does not, which is
      the inconsistency to fix rather than a design.
    - **Clear** does confirm, and the dialog is styled and three-button-capable
      now, but the wording still never mentions the file or whether anything is
      unsaved. It reads identical whether you are about to lose an untouched
      welcome document or an hour of work, and it should offer Save.
    - **Closing the tab** does not warn. There is a `beforeunload` handler in
      app.js, but it only flushes the autosave; it never sets `returnValue`, so
      the browser shows nothing. Autosave means the work is usually still there
      on reopen, which is *why* nobody notices this until the one time it is
      not — a cleared cache, a different browser, a private window.

    All three want the same thing: consult the dirty flag, and offer Save /
    Discard / Cancel rather than a bare yes-no. `ask()` takes an arbitrary
    action list and returns the chosen value, so the three-way choice is now
    just a call — this item is down to wiring, with no mechanism left to build.
    Reload and the overwrite guard already go through it, but both still offer
    only Cancel and a destructive action; they want the same third button.
    `beforeunload` is the one that cannot use it, since the browser will not
    wait on a Promise — that one still needs `returnValue` set from the dirty
    flag, and gets the browser's own wording. Note the flag lives in
    file-api.js, which the editable export does not ship, so the exported
    document needs its own answer or an honest absence of one.
*   **1.8** Ghost lines. Pasted text brings in empty lines — roughly 1px tall,
    enough to space bullets unevenly. Not yet reproduced deliberately. Prime
    suspect is the paste handler (app.js), which feeds clipboard HTML straight
    into `execCommand("insertHTML")` with no sanitising, so empty `<p></p>` and
    `<div><br></div>` from Word/Docs/web pages land in the document and are
    then serialised by Turndown, which is why they persist. Confirm by pasting
    and checking Copy MD for stray blank lines. Likely fix: round-trip pasted
    HTML through htmlToMarkdown → markdownToHtml before inserting, so only
    markdown-expressible structure gets in.

## 2. Save fidelity

Ways the bytes on disk still differ from what was opened, all verified by
round-tripping real files through the running app.
[front/markdown-style.js](front/markdown-style.js) is what preserves them;
Decision 1 in [CHANGELOG.md](CHANGELOG.md) is why, and lists the differences
that are deliberate rather than bugs. In rough order of how much they matter:

*   **2.1** **Reference links are inlined and the definition block deleted.** A
    document that cites the same URL in twenty places arrives with one
    definition and leaves with twenty copies. The restore cannot cover it:
    inlining changes the text of the block, so the block stops matching itself.
    Turndown's `linkReferenceStyle` is not the fix — it converts *every* link
    to a reference, the same rewrite in the other direction. Wants a rule that
    emits a reference only where the source already had a definition, plus
    somewhere to re-emit the definition block.
*   **2.2** *(regression, confirmed in browser)* Inline code still loses a
    trailing space, through a different door than the one `shieldCodeEdgeSpaces`
    was built to close. Editing text inside or beside a code span (e.g. the
    `` `> ` `` on CLAUDE.md's "blockquote's ... chain" line) in a real
    contenteditable, then saving, turned it into `` `>X` `` followed by a
    literal U+00A0 NBSP character, then `chain` — the space escaped the span
    *and* landed in the file as an invisible non-ASCII byte. Root cause:
    browsers commonly rewrite a trailing space inside an edited contenteditable
    text node to `&nbsp;` (U+00A0) rather than leaving it as U+0020, to stop it
    collapsing. `shieldCodeEdgeSpaces`'s leading/trailing check in app.js
    (`/^ /`, `/ $/`) only matches literal ASCII space, so it never sees the
    NBSP and doesn't shield it — while Turndown's own edge-trim treats NBSP as
    whitespace (`\s` in JS matches U+00A0) and moves it outside the backticks
    same as before the fix. So the original bug (verified fixed outside the
    app, against a hand-built HTML string with a plain space) doesn't reproduce
    that way inside the app, because the app never gets a plain trailing space
    to shield once a human has actually edited near one. Fix needs the shield's
    regexes to also match ` `, and `htmlToMarkdown` to decode the shielded
    placeholder back to whichever original character it stood in for — not
    unconditionally to `" "` — or an NBSP-holding span round-trips to a plain
    space and silently changes the byte anyway.
*   **2.3** The source is persisted as a second copy of the document.
    `adoptMarkdownStyle` writes the incoming markdown to
    `localStorage["markdownSource"]`, because the autosave is HTML and carries
    no markdown to re-sniff on reload. It roughly doubles what Marky stores,
    and a document that blows the quota keeps editing and saving but loses byte
    fidelity across a reload — a `console.warn` and nothing else. Storing the
    derived style plus block hashes instead of the whole source would be
    smaller, and could not reconstruct the bytes.
*   **2.4** *(wanted by 1.4)* An edited table is re-emitted in the `table`
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
*   **2.5** `markdownSegments` splits on blank lines, list markers, headings
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

*   **4.1** *(needs 1.7)* Tabbed view — several documents open at once, one per
    tab. Today the app is built around holding exactly one: `editor.innerHTML`
    is the entire document state, autosave writes a single
    `localStorage["markdownContent"]`, and file-api.js tracks a single
    `currentFilePath`. All three become per-document, plus somewhere to persist
    the open set across reloads. Worth deciding early whether a tab is just a
    path plus content, or carries its own undo history, scroll position and
    selection. The dirty flag becomes per-tab too, and should switch
    presentation with it: the "(edited)" suffix file-api.js writes today reads
    fine on a single filename, but the convention on a row of tabs is a red `*`
    against each unsaved one. There is somewhere to put them: the menu bar
    left the toolbar as two rows, and the second — `.toolbar-content`, holding
    the filename and the theme toggle — is shaped for a tab bar rather than for
    one label. (If what was meant is edit/preview/source tabs
    rather than multiple files, that is the source-view item above.)

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

*   **5.1** *(affects 1.1, 1.2)* execCommand deprecation/inconsistency.
    Now load-bearing rather than incidental: after the format-bar fix, headings
    go through `formatBlock` and lists through
    `insertUnorderedList`/`insertOrderedList`. Those produce slightly different
    markup across engines, so this now affects core formatting and needs a
    cross-browser check.
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
    fit the project's state.
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
