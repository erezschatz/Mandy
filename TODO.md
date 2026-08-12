# TODO

## Editing

*   Undo is bound but unreliable. Ctrl+Z / Ctrl+Y are wired to
    `execCommand("undo"/"redo")` in app.js and work for typing and for anything
    done via execCommand (bold, italic, headings, lists). They do NOT survive
    the seven places that assign `editor.innerHTML = ...` — open file, paste,
    clear, restore from localStorage, welcome doc. Each wholesale rewrite
    discards the browser's native undo stack, so undo silently stops working
    after any of them. Real fix: stop rewriting innerHTML, or keep our own
    snapshot stack.
*   Block vs inline formatting is not distinguished. Selecting part of a line
    and pressing Code turns the whole line into a code block. A partial
    selection should produce inline `<code>`; only a whole-line selection
    should produce a block. P/H1/H2/H3 are inherently block-level, so decide:
    act on the whole line by design, or disable them for partial selections.
*   `toggleCodeBlock` operates on top-level editor children, so a selection
    inside a bullet replaces the entire `<ul>` with one `<pre>` and runs all
    the items together. (format-bar.js, `blocksInRange`)
*   Hybrid mode is not supported: typing `#` at the start of a line should turn
    that line into a heading, and the same for `-`, `>`, ``` and so on.
*   No way to indent bullets. There is no Tab handling in the editor and no
    indent/outdent control in the format bar. `execCommand("indent"/"outdent")`
    exists and would cover it.
*   The UI only supports some of the markup MD offers, and not even all of what
    the README advertises. The format bar has p, h1, h2, h3, bold, italic, ul,
    ol, code. Missing: links, images, tables, blockquotes, h4-h6, strikethrough,
    inline code, horizontal rules. They render when imported; there is just no
    way to author them.
*   No source view, editable or otherwise. The document lives as HTML in
    `editor.innerHTML` and markdown exists only at the boundaries — markdown-it
    parses on the way in, Turndown serialises on the way out. Copy MD, Download
    MD and Save all emit markdown, so it is reachable, but there is no way to
    see or edit the markdown inside the app.
*   No way to reload the open file from disk. On load the editor restores from
    `localStorage["markdownContent"]`, not from the file, and autosave is
    unaware of the file on disk — so if the file changes underneath Marky
    (edited in another tool, rewritten by a script or an agent) nothing picks it
    up, and re-Opening it is also the only way to discard local changes. Wants a
    Reload control, and probably a warning when the file on disk is newer than
    what was loaded. `GET /api/browse` already returns mtime per entry, but
    `GET /api/file` does not, so the read endpoint would need to return it too.
*   Ghost lines. Pasted text brings in empty lines — roughly 1px tall, enough to
    space bullets unevenly. Not yet reproduced deliberately. Prime suspect is
    the paste handler (app.js), which feeds clipboard HTML straight into
    `execCommand("insertHTML")` with no sanitising, so empty `<p></p>` and
    `<div><br></div>` from Word/Docs/web pages land in the document and are then
    serialised by Turndown, which is why they persist. Confirm by pasting and
    checking Copy MD for stray blank lines. Likely fix: round-trip pasted HTML
    through htmlToMarkdown → markdownToHtml before inserting, so only
    markdown-expressible structure gets in.

## Format bar

*   The inline toolbar doesn't stay within the app. `showFormatBar` sets `left`
    and `top` straight from the selection rect with no clamping at all, so it
    goes off the top near the first line and off the right edge on selections
    near the right margin. (An `editorRect` variable sat there unused, clearly
    an abandoned attempt at exactly this; it was removed as dead code and will
    want to come back.)
*   The inline toolbar is too jittery. It repositions on every `selectionchange`
    on the document, which fires constantly while dragging a selection. Needs
    debouncing, or to only reposition when the selection rect actually moves.
*   Selection doesn't identify the elements inside it. `updateActiveButtons`
    walks up from `selection.anchorNode` only, so the active states reflect
    wherever the selection *started* rather than the whole of it: select a bold
    run and B lights up, select a span covering both bold and non-bold text and
    it still lights up (or doesn't) depending only on the anchor end. It should
    reflect the whole selection — all-bold vs mixed vs none — and probably show
    a third, indeterminate state for mixed.

## Interface

*   A menu instead of a button row. The toolbar is full: three button groups
    plus the theme toggle, already wrapping onto a second row below roughly
    900px, and every new export or formatting control makes it worse. A menu bar
    (File / Edit / Format / Export) scales where the row does not, and gives the
    formatting the format bar has no room for — links, tables, blockquotes — a
    place to live. toolbar.js already builds everything from `TOOLBAR_GROUPS`
    with delegated `data-action` handlers, so the spec survives the change
    mostly intact; it becomes a menu renderer over the same data.
*   Tabbed view — several documents open at once, one per tab. Today the app is
    built around holding exactly one: `editor.innerHTML` is the entire document
    state, autosave writes a single `localStorage["markdownContent"]`, and
    file-api.js tracks a single `currentFilePath`. All three become per-document,
    plus somewhere to persist the open set across reloads. Worth deciding early
    whether a tab is just a path plus content, or carries its own undo history,
    scroll position and selection. (If what was meant is edit/preview/source
    tabs rather than multiple files, that is the source-view item above.)

## Architecture

*   execCommand deprecation/inconsistency. Now load-bearing rather than
    incidental: after the format-bar fix, headings go through `formatBlock` and
    lists through `insertUnorderedList`/`insertOrderedList`. Those produce
    slightly different markup across engines, so this now affects core
    formatting and needs a cross-browser check.
*   No module system. Every file in front/ is a plain `<script>`, so every
    top-level `const` is a shared global and collisions are real bugs, not
    hypotheticals (`CLOSE` vs `DOC_CLOSE`, `saveFileAs` vs FileSaver's
    `saveAs`). The fix is `<script type="module">` with real imports, which
    browsers support natively — but it conflicts with the editable export
    concatenating every JS file into one inline `<script>`, so it needs import
    maps or blob URLs. Real work, needs a decision first.
*   Load order is still load-bearing. toolbar.js must run first because it
    defines `onToolbarAction`, which every other module calls at load. Click
    delegation removed the silent bound-to-null failure, not the ordering
    requirement.
*   `generatePDFFilename`, `generateDocxFilename` and `documentFilename` are the
    same slug logic three times over, and the Editable export still names its
    output `${Date.now()}.html`, inconsistent with the other three.
*   `min-height: 69px` on `.toolbar` is a magic number derived from current
    button padding and font size, holding the layout still while toolbar.js
    builds. It will be silently wrong if either changes.
*   docx-export.js and theme-manager.js still carry the indentation they had as
    inline `<script>` blocks in index.html. Cosmetic, but both files read oddly.

## Product

*   Rewrite the README to better fit the project's state.
*   More export options. The set today is markdown, HTML, PDF, DOCX and
    Editable. Decide what else earns a place — ODT or RTF for word processors
    that are not Word, plain text, EPUB, a slide deck, an image of a single
    diagram. Two constraints worth holding: each format is another heavy library
    behind an `ensure*` loader in lazy-load.js, and the export button group is
    already the most crowded part of the toolbar, so this and the menu item
    above are the same conversation.
*   The "collaborative" framing doesn't hold. Collaborative in 2026 means Google
    Docs — two people editing one document. This is the Word model: pass a file
    back and forth by mail. Worse, every hop mints a *new* file, because the
    editable export fuses the document and the application into one artifact, so
    there is no stable document identity to write back to. You open X, you
    export Y, and now which one is current? Three routes out: both sides run the
    full Marky (server + client) and pass plain .md; or the exported file writes
    back to itself via the File System Access API (Chromium-only, and needs
    testing from `file://` before anyone designs around it); or shared storage
    both sides can reach. Failing all of those, describe it honestly as
    send-for-review, one hop.
*   Mermaid diagrams in the static HTML export keep the light palette they were
    rendered with, since Mermaid isn't shipped with the document. Dark-mode
    readers get a white card behind the diagram as a workaround rather than a
    properly re-rendered dark one.
