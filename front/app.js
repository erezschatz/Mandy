const md = window.markdownit();

// The two rules that decide what markdown *means* here — the maths span and
// the reference-aware link — live in markdown-parser.js, so the model suite can
// parse with the same configuration the app does rather than a bare parser or a
// copy of the rules. Registered here because this is where the instance is built.
configureMarkdownParser(md);

// Every localStorage key holding part of the open document, under the flat
// names Mandy used while it could only hold one. tabs.js scopes them to the
// active tab when it is loaded; without it -- an exported document, which has
// one document and no file API -- these names are what everything resolves to,
// so the single-document path is the fallback rather than a second
// implementation.
//
// `markdown` is the document itself, as the markdown a save would write. It
// replaced the `content` key (the editor's HTML) and the `source` key (the
// markdown that HTML came from) in stage 4's slice 4, under a new name so that a
// stored document never has to be asked which of the two it holds —
// legacy-storage.js converts the old pair once.
const DOCUMENT_KEYS = {
  markdown: "mandy-markdown",
  path: "mandy-current-file",
  dirty: "mandy-dirty",
  mtime: "mandy-file-mtime",
  dir: "mandy-last-dir",
};

// The one indirection between every call site and the key it writes. Resolved
// per call rather than cached, because the active tab changes underneath it.
function documentKey(name) {
  return typeof tabDocumentKey === "function"
    ? tabDocumentKey(name)
    : DOCUMENT_KEYS[name];
}

// The conventions of the document currently open. Replaced wholesale every time
// a document arrives with markdown to read; until then these are Turndown's own
// defaults, so a session that never opens a file serialises exactly as it did
// before markdown-style.js existed.
let markdownStyle = Object.assign({}, MARKDOWN_STYLE_DEFAULTS);

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: markdownStyle.hr,
  bulletListMarker: markdownStyle.bulletListMarker,
  emDelimiter: markdownStyle.emDelimiter,
  strongDelimiter: markdownStyle.strongDelimiter,
  br: markdownStyle.hardBreak,
});

// Turndown reads its options object on each replacement rather than closing
// over it, so the serialiser can be re-styled in place. It has to be: the rules
// below are registered against this instance, and rebuilding it to change an
// option would drop them.
//
// The style is the document's as it is now rather than as it was opened
// (decision 1 of stage 4): every door a document arrives through sniffs it, and
// the autosave holds the markdown a save would write, so a reload sniffs that.
// The model reads the wrap width and the table convention off it when it emits
// an edited block; Turndown reads the rest when a paste or the table of
// contents is converted.
function adoptMarkdownStyle(markdown) {
  markdownStyle = sniffMarkdownStyle(markdown);
  pushMarkdownStyleOptions();
}

// The subset of the sniffed style that Turndown itself reads. One shared
// service instance converts for every document, so its options are per-document
// state like the style they come from -- pushed here rather than at each of the
// two call sites, which must not be able to drift apart.
function pushMarkdownStyleOptions() {
  turndownService.options.hr = markdownStyle.hr;
  turndownService.options.bulletListMarker = markdownStyle.bulletListMarker;
  turndownService.options.emDelimiter = markdownStyle.emDelimiter;
  turndownService.options.strongDelimiter = markdownStyle.strongDelimiter;
  turndownService.options.br = markdownStyle.hardBreak;
}

// The per-tab half of the style, for the tabbed view. The Turndown options go
// with it -- a switch that left the outgoing document's bullet marker on the
// shared service would write the wrong marker into the next paste.
//
// Storage is the caller's business, as in undoPark()/undoAdopt() and
// filePark()/fileAdopt(): these move what is in memory and nothing else.
function markdownStylePark() {
  const parked = { style: markdownStyle };
  markdownStyleAdopt(null);
  return parked;
}

// `markdownStyleAdopt(null)` is Turndown's own defaults: a document that has
// never had markdown read into it, which is exactly what a fresh tab is until a
// file is opened or markdown is pasted into it.
function markdownStyleAdopt(bundle) {
  markdownStyle = bundle ? bundle.style : Object.assign({}, MARKDOWN_STYLE_DEFAULTS);
  pushMarkdownStyleOptions();
}

// MathJax renders the source away, so without this an equation copied out of a
// document and pasted back would arrive as its rendered glyphs: $$\frac{a}{b}$$
// returns as "ab", and there is no getting it back. renderers.js stamps
// data-tex while the TeX is still recoverable, and the model's clipboard copies
// the stamped container.
turndownService.addRule("mathjax", {
  filter: function (node) {
    return node.nodeName === "MJX-CONTAINER" && node.hasAttribute("data-tex");
  },
  // No surrounding newlines for display maths: an equation that was its own
  // paragraph is the only child of its <p>, so Turndown's own block handling
  // gives it the blank lines. Forcing them here would instead split a sentence
  // that happened to contain $$…$$ into three paragraphs.
  replacement: function (content, node) {
    const delimiter = node.getAttribute("data-display") === "block" ? "$$" : "$";
    return delimiter + node.getAttribute("data-tex") + delimiter;
  },
});

// The model core's fillers: the empty-block `<br>`, and the caret stops beside
// an equation at a line's edge (TODO 3.1, slice 7's step 2) — a zero-width
// character in front, a `<br>` behind. None is content. The model's clipboard
// strips them from what it copies, but a fragment of the editor's DOM can reach
// Turndown another way — stored HTML from the flag's days does, through
// legacy-storage.js — and without the rule the character would be written into
// the document and the `<br>` would become a hard break.
turndownService.addRule("modelFiller", {
  filter: function (node) {
    return node.nodeType === 1 && node.hasAttribute("data-filler");
  },
  replacement: function () {
    return "";
  },
});

// Turndown ships no strikethrough rule either -- that one lives in
// turndown-plugin-gfm too -- so an <s> or <del> fell through to the default and
// the markup round-tripped as plain text, silently, with the document still
// looking struck-through on screen right up until save. markdown-it's own strikethrough rule is a core rule, not a
// plugin, so parsing `~~text~~` back in already worked; only the way out was
// missing.
turndownService.addRule("strikethrough", {
  filter: function (node) {
    return node.nodeName === "S" || node.nodeName === "DEL" || node.nodeName === "STRIKE";
  },
  replacement: function (content) {
    return "~~" + content + "~~";
  },
});

// Turndown 7 ships no table rule -- GFM tables live in turndown-plugin-gfm,
// which this project does not carry -- so a <table> fell through to the default
// and every cell came back as its own paragraph. Opening a document containing
// a table and saving it destroyed the table outright, unrecoverably, and the
// editor showed nothing wrong either side of the save. markdown-it parses pipe
// tables on the way in, so they have to come back out.
function tableCellContent(content) {
  // A newline inside a cell ends the row, and a bare pipe starts a new cell.
  return content.trim().replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
}

// Read off the style attribute rather than cell.style, which the exported
// document and the test stub do not both implement the same way. markdown-it
// writes alignment there and nowhere else.
function tableColumnRule(cell) {
  const style = cell.getAttribute("style") || "";
  const align = (cell.getAttribute("align") || "").toLowerCase() ||
    (style.match(/text-align:\s*(left|center|right)/) || [])[1] ||
    "";
  if (align === "center") return ":-:";
  if (align === "right") return "--:";
  if (align === "left") return ":--";
  return "---";
}

// GFM has no table without a delimiter row, so whichever row comes first is the
// header whether or not it is made of <th> -- pasted HTML often is not.
function isFirstTableRow(node) {
  if (node.previousElementSibling) return false;
  const section = node.parentNode;
  if (!section || section.nodeName === "TABLE") return true;
  return !section.previousElementSibling;
}

// The cell and row rules do not write the table: a cell's width is only known
// once every row is in, so they hand their pieces up and the `table` rule lays
// the whole thing out with formatMarkdownTable, in the document's sniffed
// convention. The markers are U+0000, which the HTML parser replaces wherever it
// meets one, so no cell's own text can contain one.
const TABLE_CELL = "\u0000C";
const TABLE_ROW = "\u0000R";
const TABLE_ALIGN = "\u0000A";

turndownService.addRule("tableCell", {
  filter: ["th", "td"],
  replacement: function (content) {
    return TABLE_CELL + tableCellContent(content);
  },
});

// The first row carries the alignments too, read off its cells.
turndownService.addRule("tableRow", {
  filter: "tr",
  replacement: function (content, node) {
    if (!isFirstTableRow(node)) return TABLE_ROW + content;
    const aligns = Array.prototype.map
      .call(node.children, (cell) => tableColumnRule(cell))
      .join(" ");
    return TABLE_ROW + TABLE_ALIGN + aligns + TABLE_ALIGN + content;
  },
});

turndownService.addRule("tableSection", {
  filter: ["thead", "tbody", "tfoot"],
  replacement: function (content) {
    return content;
  },
});

// The rows reach here in document order, header first. A table whose header
// carried no alignment marker -- markup from somewhere stranger than markdown-it
// -- gets one plain column per header cell. Anything ahead of the first row is
// a <caption>, which markdown has no place for, so its text goes before the
// table as its own paragraph rather than being lost.
turndownService.addRule("table", {
  filter: "table",
  replacement: function (content) {
    const split = content.split(TABLE_ROW);
    const caption = split[0].trim();
    const pieces = split.slice(1);
    let aligns = null;
    const rows = pieces.map((piece) => {
      const marked = piece.match(/^\u0000A([^\u0000]*)\u0000A/);
      if (marked) {
        aligns = marked[1].split(" ").map(tableCellAlignment);
        piece = piece.slice(marked[0].length);
      }
      return piece.split(TABLE_CELL).slice(1);
    });
    if (!rows.length) return caption ? "\n\n" + caption + "\n\n" : "";
    if (!aligns) aligns = rows[0].map(() => "");
    const lead = caption ? caption + "\n\n" : "";
    return "\n\n" + lead + formatMarkdownTable(rows, aligns, markdownStyle.table || TABLE_CONVENTION_DEFAULT) + "\n\n";
  },
});

// Turndown has no autolink output, so `<http://example.com>` came back as the
// four-times-longer [http://example.com](http://example.com). Only offered to
// documents that already write them, since the expansion is otherwise the form
// the author chose.
turndownService.addRule("autolink", {
  filter: function (node) {
    if (!markdownStyle.autolinks || node.nodeName !== "A") return false;
    const href = node.getAttribute("href");
    // A scheme is what makes an autolink an autolink. Without this check
    // [notes](notes.md) -- whose text and href also match -- becomes
    // <notes.md>, which CommonMark renders as literal text, not a link.
    if (!href || !/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    return href === node.textContent && !node.getAttribute("title");
  },
  replacement: function (content, node) {
    return "<" + node.getAttribute("href") + ">";
  },
});

// There is no `referenceLink` rule here, and that is deliberate. A link the
// model's clipboard copies carries its `data-ref-label` stamp, and writing
// `[text][label]` for it would hand the paste a reference the pasted fragment
// does not define — `modelParse` reads it with no definitions, so it came back
// as literal brackets. Turndown's own inline form is the answer that always
// resolves. The rule lives on in legacy-storage.js, for the one conversion
// where the definitions are known: stored HTML with its own source.

// Turndown hardcodes "*   one" and "1.  one" -- marker plus three or two spaces
// -- which is legal, uncommon, and enough on its own to touch every list line
// in the file. The pad and the numbering come from the document instead.
turndownService.addRule("listItem", {
  filter: "li",
  replacement: function (content, node, options) {
    const parent = node.parentNode;
    let marker;
    if (parent.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      const number = markdownStyle.orderedAllOnes
        ? 1
        : start
          ? Number(start) + index
          : index + 1;
      marker = number + markdownStyle.orderedDelimiter + " ".repeat(markdownStyle.orderedPad);
    } else {
      let depth = -1;
      for (let up = node; up; up = up.parentNode) {
        if (up.nodeName === "UL" || up.nodeName === "OL") depth++;
      }
      const level = markdownStyle.bulletsByDepth[depth];
      marker = (level ? level.marker : options.bulletListMarker) +
        " ".repeat(level ? level.pad : markdownStyle.bulletPad);
    }

    // Continuations align with the content, not the marker, or a nested block
    // falls out of its item.
    const body = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "\n")
      .replace(/\n/gm, "\n" + " ".repeat(marker.length));

    return marker + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
  },
});

// One slug for every export filename. Kept here rather than in any one export
// module because app.js loads before all three of them, in index.html and in
// the editable export's bundle alike.
//
// The trims are load-bearing, not tidiness: a title starting with an emoji
// ("👋 Welcome to Mandy") strips to a leading space, which then becomes a
// leading hyphen in the filename.
function slugifyTitle(text, fallback) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .substring(0, 50)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

const editor = document.getElementById("editor");
// fileInput only exists in exported HTML files, which have no server behind
// them; the app itself uses the file API instead.
const fileInput = document.getElementById("fileInput");
const formatBar = document.getElementById("formatBar");

// Turndown decides how much leading/trailing whitespace to pull out of an
// inline element before any rule's filter or replacement runs -- it is baked
// into the node during Turndown's own upfront tree walk -- so an addRule
// override cannot intercept a real space at the edge of a code span; Turndown
// always moves it outside the backticks and drops it, saving `` `> ` `` as
// `` `>` ``. Swapping the edge space for a placeholder before Turndown ever
// parses the string sidesteps that: the placeholder is not whitespace, so
// Turndown leaves it exactly where it is, and htmlFragmentToMarkdown decodes it back
// once Turndown is done. A code span shielded on both edges gets two
// placeholders per edge rather than one, because CommonMark itself strips a
// single leading-and-trailing space pair from a code span's content -- the
// escape hatch for a span that needs to start with a backtick -- so a lone
// placeholder on each side would come back stripped on the next parse.
const CODE_EDGE_SPACE = String.fromCharCode(0xe000);

// U+00A0 is an invisible character a user cannot get rid of from inside the
// app: it renders as a space and copies into other documents as one, and
// find-in-page matches it *against* a plain space, so searching "hello world"
// cheerfully finds the "hello\u00a0world" the user is then unable to locate
// and delete. Web pages put it in their HTML freely, so it arrives by paste.
//
// So it is normalised rather than preserved, at the boundary: the model's own
// text edits do the same for typed text (modelNormaliseTyped), and the old
// core's habit of writing one in place of a trailing space went with the old
// core, since the engine writes nothing any more. Decision D3.
//
// It runs before Turndown, on the HTML, because the shield below tests for a
// literal space: Turndown treats U+00A0 as whitespace (JS \s matches it) and
// moves it outside the backticks, so an unconverted one escaped the span *and*
// landed in the document.
//
// Both spellings, because innerHTML serialises U+00A0 back out as the entity.
// A literal "&amp;nbsp;" in the document is safe: it has no "&nbsp;" substring.
function normaliseNbsp(html) {
  return html.replace(/\u00a0|&nbsp;/g, " ");
}

function shieldCodeEdgeSpaces(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("code").forEach((node) => {
    const hasSiblings = node.previousSibling || node.nextSibling;
    const isCodeBlock = node.parentNode.nodeName === "PRE" && !hasSiblings;
    if (isCodeBlock) return;
    const text = node.textContent;
    if (!text || text.trim() === "") return;
    const leading = /^ /.test(text);
    const trailing = / $/.test(text);
    if (!leading && !trailing) return;
    const pad = leading && trailing ? CODE_EDGE_SPACE + CODE_EDGE_SPACE : CODE_EDGE_SPACE;
    let next = text;
    if (leading) next = pad + next.slice(1);
    if (trailing) next = next.slice(0, -1) + pad;
    node.textContent = next;
  });
  return container.innerHTML;
}

// The Turndown conversion, which is all a *fragment* may go through: a paste,
// a drop, and the table of contents outline.js builds. The document itself is
// never converted from HTML any more — the model writes it — so there is no
// file to restore against and no width to re-wrap to here. The old core's
// document conversion, which did both, is legacy-storage.js's, and is used only
// to convert this browser's old autosave once.
function htmlFragmentToMarkdown(html) {
  return turndownService.turndown(shieldCodeEdgeSpaces(normaliseNbsp(html)))
    .replace(new RegExp(CODE_EDGE_SPACE, "g"), " ");
}

// The open document as the markdown a save writes — the one question Save,
// Save As, Download and Copy markdown all ask. The model writes it: an untouched
// block goes back as the bytes it was parsed from, and only an edited one is
// composed, in the document's own conventions and at its sniffed width.
//
// There is always a model once the page has booted. Before then there is no
// document to write, and writing nothing over a file would be the worst answer,
// so it throws and the caller reports it.
function documentMarkdown() {
  const markdown = currentModelMarkdown();
  if (markdown === null) throw new Error("no document is loaded yet");
  return markdown;
}

// The model's answer alone: the markdown it would write, or null when there is
// no model document to ask. Throws when the emitter refuses, as a save would.
function currentModelMarkdown() {
  const doc = modelCurrentDocument();
  return doc ? modelDocumentMarkdown(doc, md, markdownStyle.wrapWidth) : null;
}

// ── The editable export's markdown ───────────────────────────────────────────
//
// Under the model core an editable export carries its document as markdown in
// `<script type="text/markdown" id="app-document">` (stage 4's slice 2). A
// script element ends at the first `</script` whatever its type, and plenty of
// documents say that — this repo's own do — so `&` and `<` are written as
// entities: the one reversible pair that leaves no `<` inside the element. A
// script's text is never entity-decoded by the parser, so it is undone here.
function encodeEmbeddedMarkdown(markdown) {
  return markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function decodeEmbeddedMarkdown(text) {
  return text.replace(/&(amp|lt);/g, (_, name) => (name === "amp" ? "&" : "<"));
}

// The markdown an exported document was made with, or null for one that
// embeds HTML in the editor instead.
function readEmbeddedMarkdown() {
  const element = document.getElementById("app-document");
  return element ? decodeEmbeddedMarkdown(element.textContent) : null;
}

// The same, for a caller that has a user waiting: a document the emitter
// refuses is reported and answers null, so the action stops rather than
// writing or copying something other than the document. `action` finishes the
// sentence — "save", "download", "copy".
function documentMarkdownFor(action) {
  try {
    return documentMarkdown();
  } catch (err) {
    console.error(`[Save] Could not ${action} the document:`, err);
    notify(`Could not ${action} the document: ${err.message}`, { severity: "error" });
    return null;
  }
}

// ── The document arrives ─────────────────────────────────────────────────────
//
// Two doors, and every route that replaces the document goes through one of
// them: Open and Reload, the welcome document, upload, New, the boot restore,
// a tab this session has never shown, and an exported document's boot. The
// model parses the markdown and renders itself into the editor, so nothing in
// this file assigns editor.innerHTML.
//
// The sniff belongs in the door rather than at its callers, because
// forgetting it at one of seven is easy.
function loadDocumentMarkdown(markdown) {
  adoptMarkdownStyle(markdown);
  modelLoad(editor, markdown, md);
}

// A document with nothing in it: a model with no blocks, which renders as the
// one filler paragraph a contenteditable needs to be clickable at all — see
// modelRender.
function loadBlankDocument() {
  modelLoad(editor, "", md);
}

/**
 * Put the reader at the top of the document with a caret in its first block.
 *
 * For a document that has just been swapped in whole — New, today — where
 * neither the scroll position nor the caret means anything any more. **Every
 * engine does the right thing here but one, and that one leaves the document
 * unusable**: measured 2026-09-28, Blink clamps the scroll to the shorter
 * document and repairs the selection into the new first block by itself, while
 * WebKit keeps the old scroll offset — showing empty space below a
 * one-paragraph document, with the header out of view — and keeps a selection
 * pointing at nodes that no longer exist, so there is no caret and typing goes
 * nowhere until the user scrolls up and clicks. Done here rather than trusted
 * to the engine, which is also what makes it the same in all three.
 *
 * Focus before the selection, and without scrolling, so focusing cannot move
 * a caret this is about to place, nor the view it is about to reset.
 */
function showDocumentStart() {
  if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  if (editor.focus) editor.focus({ preventScroll: true });
  const selection = window.getSelection && window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(editor.firstElementChild || editor, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

// ── Button handlers ──────────────────────────────────────────────────────────

// Registered by action name, not bound to an element: download and upload only
// exist in exported documents, and registering an action nothing renders is
// harmless.
onToolbarAction("download-md", () => {
  const markdown = documentMarkdownFor("download");
  if (markdown === null) return;

  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "document.md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

onToolbarAction("upload-md", () => {
  if (fileInput) fileInput.click();
});

onToolbarAction("copy-md", async (button) => {
  const markdown = documentMarkdownFor("copy");
  if (markdown === null) return;

  try {
    await navigator.clipboard.writeText(markdown);
    // Was a flash on the button. The button is a menu item now and the menu has
    // closed behind the click, so the confirmation has to happen somewhere the
    // user is still looking.
    notify("Markdown copied to clipboard.", { severity: "success" });
  } catch (err) {
    notify("Unable to copy to clipboard. Please grant clipboard permissions.", {
      severity: "error",
    });
  }
});

// Empty the document in place and forget everything derived from it. The whole
// of what New used to do after its dialog, and now a primitive with two callers
// rather than a handler with one: an exported document's New, which still
// resets in place because it ships no tabs.js and has nowhere else to put a
// second document, and nothing else — the app's New makes a tab instead.
//
// The file association is not dropped here. Only file-api.js knows there is
// one, and it hooks the same action to drop it (see its "new" handler).
function resetDocument() {
  loadBlankDocument();
  localStorage.removeItem(documentKey("markdown"));
  // Or a block of the old document could come back on the next save. The three
  // assignments this replaces left Turndown carrying the *previous* document's
  // bullet marker and emphasis delimiter, since nothing pushed the reset style
  // onto the shared service — so the first save of the new document wrote the
  // old one's list style. markdownStyleAdopt(null) is what they were trying to
  // be, and pushing the options is half of what it does.
  markdownStyleAdopt(null);

  focusDocumentStart();

  // Replaced, not edited: this also drops the autosave, the sniffed style and
  // (via file-api.js) the file association, so an undo that brought the text
  // back would restore it into a document that no longer knows where it came
  // from. The ask() dialog is what stands in for undo here.
  undoReset();
}

// New is what "no baggage" means: a document with no more history than the
// one Mandy opens with. This used to be what Clear did — see the comment on
// the "clear" handler below for why the two split (CHANGELOG.md, "New and
// Clear are two different weights now").
onToolbarAction("new", async () => {
  // In the app, New makes a tab. Nothing is discarded, so nothing is
  // asked: the document that was open is still open, one tab to the left. That
  // is the whole of New here, and the dialogs below belong to the other world.
  //
  // newTab() returns null when the switch was refused — a file operation is in
  // flight — and then no tab was made, which is why this returns either way
  // rather than falling through to a reset that would empty the document that
  // is still on screen.
  if (typeof newTab === "function") {
    newTab();
    return;
  }

  // Only an exported document reaches here. It ships no tabs.js and has
  // nowhere to put a second document, so New still resets in place — and it
  // ships no file-api.js either, so there is no file to be dirty against and no
  // shared guard to ask through. This plain question is the whole of what an
  // export gets, and it is the only question left in this handler: the app's
  // New discards nothing and so dropped out of confirmDiscard's callers, which
  // are Open and Reload now.
  //
  // Cancel is the default action, so Enter and Escape both do the safe thing.
  const confirmed = await ask(
    "This removes all content and the auto-saved copy.",
    {
      title: "Start a new document?",
      severity: "warn",
      actions: [
        { label: "Cancel", value: false, variant: "quiet", default: true },
        { label: "New", value: true, variant: "danger" },
      ],
    },
  );
  if (!confirmed) return;

  resetDocument();
});

// Clear used to carry New's weight above — dialog, full reset, file
// association drop — under the theory that an empty document should not
// still claim to be notes.md. That is right for starting over, and wrong for
// emptying the document you have open: this reads like Ctrl+A then Delete
// instead. The content goes; the file you're editing, its undo history and
// its autosave don't. It is one model edit, so it undoes as one ordinary step
// and needs no dialog of its own.
onToolbarAction("clear", () => {
  // A model edit, slice 7's step 7.
  if (typeof modelInputClear === "function") modelInputClear();
});

onToolbarAction("insert-hr", () => {
  // A model insertion, slice 7's step 7.
  if (typeof modelInputRule === "function") modelInputRule();
});

// Insert / edit a link: a model command, slice 7's step 4 — see
// `modelInputLink`. Ctrl/Cmd+K reaches it through the toolbar action below.
//
// A bare "example.com" is almost never meant as a relative path, so give it a
// scheme. Anything already carrying one, an #anchor, or a path is left exactly
// as typed — markdown puts no other constraint on an href. model-input.js asks
// this for the address the dialog was given.
function normaliseLinkHref(value) {
  const href = value.trim();
  if (!href) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  if (/^[#/]|^\.\.?\//.test(href)) return href;
  if (/^[^\s/]+\.[^\s/]/.test(href)) return `https://${href}`;
  return href;
}

onToolbarAction("insert-link", async () => {
  if (typeof modelInputLink === "function") await modelInputLink();
});

// Insert → Image…, stage 3's slice 2: a model command. Feature-tested, since
// a bundle decides for itself what it ships.
onToolbarAction("insert-image", async () => {
  if (typeof modelInputImage === "function") await modelInputImage();
});

// Insert → Table and the table controls in the Format menu, stage 3's slice 5:
// model commands, feature-tested for Insert → Image…'s reason. The controls
// are disabled outside a table.
function tableControl(run) {
  if (typeof modelInputTable === "function") run();
}

onToolbarAction("insert-table", () => tableControl(() => modelInputInsertTable()));
onToolbarAction("table-row-above", () => tableControl(() => modelInputTable("table-row-above")));
onToolbarAction("table-row-below", () => tableControl(() => modelInputTable("table-row-below")));
onToolbarAction("table-col-left", () => tableControl(() => modelInputTable("table-col-left")));
onToolbarAction("table-col-right", () => tableControl(() => modelInputTable("table-col-right")));
onToolbarAction("table-delete-row", () => tableControl(() => modelInputTable("table-delete-row")));
onToolbarAction("table-delete-column", () => tableControl(() => modelInputTable("table-delete-column")));
onToolbarAction("table-delete", () => tableControl(() => modelInputTable("table-delete")));
onToolbarAction("table-align-left", () => tableControl(() => modelInputTable("table-align-left")));
onToolbarAction("table-align-center", () => tableControl(() => modelInputTable("table-align-center")));
onToolbarAction("table-align-right", () => tableControl(() => modelInputTable("table-align-right")));

onToolbarAction("paste-md", async () => {
  try {
    modelPasteMarkdown(await navigator.clipboard.readText());
  } catch (err) {
    notify("Unable to access clipboard. Please grant clipboard permissions.", {
      severity: "error",
    });
  }
});

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const markdown = event.target.result;
      loadDocumentMarkdown(markdown);
      flushAutosave();
      // This is Open, for the variant with no file server behind it.
      undoReset();
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}

// --- Links -----------------------------------------------------------------
//
// Two problems, and the anchors are the bigger one. Inside a contenteditable
// the browser treats a link as text to put the caret in and will not navigate
// on a modifier either, so nothing here is free. And markdown-it does not slug
// headings — heading ids are GitHub's extension, not part of the spec — so a
// table of contents arrives with every link pointing at an element that does
// not exist. Making the destination exist is most of the work.

// Deliberately NOT slugifyTitle: that one strips non-ASCII (so "Ünïcode
// Heading" becomes "ncode-heading" while the href markdown-it wrote is
// "#ünïcode-heading") and truncates at 50 characters, and it is shared by all
// four export filenames, so it must not be bent to fit this.
function anchorSlug(text) {
  return (text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

// Slugs are resolved against the live document on every click rather than
// stamped onto the headings once, because an id assigned at render time goes
// stale the moment someone edits the heading. `stamp` is for the static export,
// which has no JS to resolve anything and needs real id attributes.
//
// Duplicate headings get GitHub's -1, -2 suffixes, so a document with two
// "Notes" sections still addresses both.
function headingAnchors(root, stamp = false) {
  const counts = new Map();
  const anchors = new Map();

  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const base = anchorSlug(heading.textContent);
    if (!base) continue;

    const seen = counts.get(base) || 0;
    counts.set(base, seen + 1);
    const slug = seen ? `${base}-${seen}` : base;

    anchors.set(slug, heading);
    if (stamp) heading.id = slug;
  }

  return anchors;
}

// An href out of a document Mandy did not write — a file off disk, or an
// editable export that arrived by mail. `javascript:` through window.open would
// run in the app's own origin, next to the file API, so this is an allowlist
// rather than a blocklist.
const LINK_SCHEMES = ["http:", "https:", "mailto:"];

// scrollIntoView would park the heading under the chrome, which is sticky — so
// the jump lands on a heading the reader cannot see. The clearance is
// `chromeClearance` in format-bar.js: the same measurement, made once, because
// this had its own copy that knew only about `.toolbar` and went on parking
// headings under the tab strip after the redesign moved that out to a sticky
// sibling. Called rather than defined here because format-bar.js is the file
// that positions against the chrome; it loads after this one, which costs
// nothing — a Ctrl/Cmd+click is long past load, so the function only has to be
// present in the bundle by then.
function scrollToAnchor(target) {
  const top = target.getBoundingClientRect().top + window.scrollY -
    chromeClearance() - 12;

  window.scrollTo({
    top: Math.max(top, 0),
    // Setting location.hash instead would pile up history entries and, in an
    // exported file opened from file://, rewrite the URL for no benefit.
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

function openExternalLink(href) {
  let url;
  try {
    // No base, so a relative href throws and is left inert. That is the
    // documented first cut: resolving ./notes.md against the origin just 404s
    // off the static handler, and opening it in Mandy is a bigger feature. See
    // docs/TODO.md before making relative links do something.
    url = new URL(href);
  } catch {
    return;
  }

  if (!LINK_SCHEMES.includes(url.protocol)) return;
  window.open(url.href, "_blank", "noopener");
}

editor.addEventListener("click", (e) => {
  // Plain click has to keep placing the caret, or link text becomes uneditable.
  if (!e.metaKey && !e.ctrlKey) return;

  const link = e.target.closest && e.target.closest("a");
  const href = link && link.getAttribute("href");
  if (!href) return;

  e.preventDefault();

  if (href.startsWith("#")) {
    // markdown-it percent-encodes non-ASCII in the attribute, so decode before
    // matching against a slug that kept its unicode.
    let wanted = href.slice(1);
    try {
      wanted = decodeURIComponent(wanted);
    } catch {
      // A malformed escape is not worth failing over; match it raw.
    }
    const target = headingAnchors(editor).get(wanted);
    if (target) scrollToAnchor(target);
    return;
  }

  openExternalLink(href);
});

// The hint is a CSS variable rather than a title attribute on each link:
// Turndown serialises a title into the markdown as [text](href "title"), so
// stamping one would write the tooltip into the user's file. app.css draws it
// from a :hover pseudo-element, which never enters the DOM at all.
document.documentElement.style.setProperty(
  "--link-hint",
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '"Cmd+Click to open link"'
    : '"Ctrl+Click to open link"',
);

// Pasted HTML arrives carrying two kinds of junk that are invisible in the
// document and impossible to find from inside it: elements the source page's
// styling left behind with nothing in them, and blank <p>/<div> blocks that
// render as a ~1px line and space bullets unevenly. The blanks are the ones
// that stick: Turndown serialises them, so they survive a save and a reload and
// travel on into whatever the file is opened with next.
//
// Deliberately targeted rather than a round-trip through markdown. Pasting a
// web page should keep its bold, its links and its tables -- what gets dropped
// is only what nobody can see and nobody asked for.
const GHOST_INLINE_TAGS = new Set([
  "SPAN", "B", "I", "EM", "STRONG", "U", "S", "STRIKE", "FONT",
  "SMALL", "BIG", "SUB", "SUP", "MARK", "ABBR",
]);
const GHOST_BLOCK_TAGS = new Set(["P", "DIV"]);

// Elements that are content in themselves, so an ancestor holding one is not
// empty however empty its text looks.
const REPLACED_TAGS = new Set([
  "IMG", "TABLE", "HR", "SVG", "VIDEO", "AUDIO", "IFRAME",
  "INPUT", "CANVAS", "OBJECT", "EMBED", "PICTURE",
]);

// Walked rather than queried because the check has to run inside the DOM stub
// too, where querySelectorAll answers with nothing.
function holdsTag(node, tags) {
  for (const child of node.childNodes || []) {
    if (child.nodeType !== 1) continue;
    if (tags.has(child.tagName)) return true;
    if (holdsTag(child, tags)) return true;
  }
  return false;
}

const BR_TAG = new Set(["BR"]);

/**
 * Whether this element is junk: no text, nothing in it that counts as content.
 *
 * The asymmetry over <br> is the point and not an oversight. A <p> or <div>
 * whose only content is a line break *is* the ghost line -- that is the exact
 * markup Word and Docs emit for a blank one. Inside an inline element the same
 * <br> is a real break in a real line, so it saves its parent.
 */
function isGhostElement(node) {
  if (!node || node.nodeType !== 1) return false;
  const inline = GHOST_INLINE_TAGS.has(node.tagName);
  if (!inline && !GHOST_BLOCK_TAGS.has(node.tagName)) return false;
  if ((node.textContent || "").trim() !== "") return false;
  if (holdsTag(node, REPLACED_TAGS)) return false;
  return inline ? !holdsTag(node, BR_TAG) : true;
}

function sanitisePastedHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = normaliseNbsp(html);

  // Repeated because emptying a ghost can expose its parent as one: the wrapper
  // chains these pastes carry are often several deep with nothing at the bottom
  // of them. Each pass removes at least one node, so it terminates.
  for (;;) {
    const ghosts = Array.from(container.querySelectorAll("*")).filter(isGhostElement);
    if (!ghosts.length) break;
    ghosts.forEach((node) => node.remove());
  }

  return container.innerHTML;
}

// Cut and Copy go through the model's own clipboard handler, slice 7's step 8 —
// see `modelInputMenuClipboard`. `mousedown` is prevented over the toolbar, so
// clicking the menu item does not blur the editor and take the selection with
// it.
onToolbarAction("cut", () => {
  if (typeof modelInputMenuClipboard === "function") modelInputMenuClipboard(true);
});
onToolbarAction("copy", () => {
  if (typeof modelInputMenuClipboard === "function") modelInputMenuClipboard(false);
});

// Paste reads the clipboard itself: execCommand("paste") is refused in web
// content in every engine, so there is no event for the model to answer. That is a permission the app
// may not have — paste-md has always had the same problem and reports it the
// same way — and the keyboard route works regardless, which is what the message
// points at.
onToolbarAction("paste", async () => {
  try {
    const items = await navigator.clipboard.read();
    let html = "";
    let text = "";
    for (const item of items) {
      if (!html && item.types.includes("text/html")) {
        html = await (await item.getType("text/html")).text();
      }
      if (!text && item.types.includes("text/plain")) {
        text = await (await item.getType("text/plain")).text();
      }
    }
    modelPasteInto(html, text);
  } catch (err) {
    notify("Unable to read the clipboard. Press Ctrl+V to paste instead.", {
      severity: "error",
    });
  }
});

onToolbarAction("paste-plain", async () => {
  try {
    const text = await navigator.clipboard.readText();
    modelPastePlain(text);
  } catch (err) {
    notify("Unable to read the clipboard. Press Ctrl+Shift+V to paste instead.", {
      severity: "error",
    });
  }
});

let saveTimer;

// The document as it was last stored, or null when nothing is. Every reader
// asks this rather than reading the key itself, because a document
// legacy-storage.js converted on this load but could not write is held in
// memory there instead, and has to open anyway. Feature-tested, since an
// exported document and the suites that boot without it have no conversion.
function storedDocument() {
  const key = documentKey("markdown");
  const stored = localStorage.getItem(key);
  if (stored !== null) return stored;
  return typeof legacyStoredMarkdown === "function" ? legacyStoredMarkdown(key) : null;
}

function isBlankMarkdown(markdown) {
  return !markdown || markdown.trim() === "";
}

// Write the document now rather than when the debounce runs out. A tab switch
// has to call this before parking the outgoing document: the timer
// resolves documentKey("markdown") when it fires, so a switch inside its one
// second would write the *incoming* tab's document -- correctly, under the
// incoming tab's key -- and the outgoing tab's last edits would simply never be
// written anywhere. Autosave is the only thing carrying unsaved work across a
// browser reload, so that is real loss rather than a stale cache.
//
// Unconditional: if the debounce has already fired, this rewrites the same
// bytes, which costs nothing and is one fewer state to reason about than asking
// whether a write is pending.
//
// **What it writes is the markdown a save would write**, since stage 4's slice
// 4: the model is the document, and its rendering is not. A blank document is
// no key at all. A model the emitter refuses to write leaves the last good
// write where it was — the same refusal a save reports to the user, said on
// the console here because this runs on every pause in typing.
function flushAutosave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  let markdown;
  try {
    markdown = currentModelMarkdown();
  } catch (error) {
    console.warn("[Autosave] The document could not be written, so the last autosave stands:", error);
    return;
  }
  if (markdown === null) return;
  try {
    if (isBlankMarkdown(markdown)) localStorage.removeItem(documentKey("markdown"));
    else localStorage.setItem(documentKey("markdown"), markdown);
  } catch (error) {
    console.warn("[Autosave] Could not store the document:", error);
  }
}

editor.addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushAutosave, 1000);
});

// Put the caret at the top of whatever is in the editor now. Every route that
// replaces the document wholesale ends here — New, and the tab swaps in
// tabs.js — because a document that arrives without a caret in it makes the
// first keystroke land nowhere. The guard is for the one document that has no
// first child to point at: an editor emptied to the empty string, which is not
// a state anything here produces but is one an assignment could.
function focusDocumentStart() {
  editor.focus();
  if (!editor.firstChild) return;

  const range = document.createRange();
  const sel = window.getSelection();
  range.setStart(editor.firstChild, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// The sheet is a measured column, so the page either side of it (and below a
// short document) is not editable — and a click there blurs the editor, after
// which typing lands nowhere with nothing on screen to say why. Only a click
// on the bare page counts: chrome, dialogs and the outline are interactive and
// must keep their own focus. Caret goes to the end, where a click below the
// text would put it anyway.
document.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  if (event.target !== document.documentElement && event.target !== document.body && !event.target.classList.contains("container")) return;
  event.preventDefault();
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

// The welcome document is markdown like any other, not markup baked into the
// page. Returns false if it cannot be fetched so startup can carry on with an
// empty editor rather than dying on the welcome text.
async function loadWelcomeDocument() {
  try {
    const res = await fetch("/welcome.md");
    if (!res.ok) throw new Error(res.statusText);
    loadDocumentMarkdown(await res.text());
    return true;
  } catch (error) {
    console.error("[Welcome] Could not load welcome.md:", error);
    loadBlankDocument();
    return false;
  }
}

window.addEventListener("load", () => {
  const saved = storedDocument();
  const isExported = editor.hasAttribute("data-exported");

  (async () => {
    if (isExported) {
      // Exported HTML file: its own document, never this browser's autosave.
      // It carries its document as markdown and an empty editor. One exported
      // before stage 4's slice 2 carried HTML in the editor instead, and runs
      // the bundle it was exported with, so this code never meets one; if it
      // ever does, the HTML goes into the model through the paste converter
      // rather than leaving an editor with no model behind it.
      editor.removeAttribute("data-exported");
      const embedded = readEmbeddedMarkdown();
      loadDocumentMarkdown(embedded !== null ? embedded : htmlFragmentToMarkdown(editor.innerHTML));
    } else if (!isBlankMarkdown(saved)) {
      loadDocumentMarkdown(saved);
    } else {
      if (saved !== null) localStorage.removeItem(documentKey("markdown"));
      await loadWelcomeDocument();
    }

    // One baseline for all three branches above — exported, restored and
    // welcome. A state is the model rather than the DOM, so MathJax finishing
    // later changes nothing it records.
    undoReset();
    // Only file-api.js knows whether this session's restored document is
    // dirty, and an exported document has no file-api.js at all.
    if (typeof initUndoBaseline === "function") initUndoBaseline();
  })();
});

window.addEventListener("beforeunload", (e) => {
  // The debounce may not have run out, and this is the last chance to write.
  flushAutosave();

  // The one guard that cannot use ask(): the browser will not wait on a
  // Promise, so this gets returnValue and the browser's own wording, with no
  // say in what it says. Autosave means the work is usually still there when
  // you come back, which is exactly why nobody notices this is missing until
  // the one time it is not — a cleared cache, another browser, a private
  // window. documentIsDirty lives in file-api.js, which an exported document
  // does not ship and which has no file to be dirty against anyway.
  //
  // The question is whether anything would be lost, not whether the document on
  // screen would be, so a background tab's unsaved edits count too.
  // Their content is already written — a switch flushes the outgoing tab under
  // its own key before parking it — but the browser closing takes the warning
  // with it either way, and a window shut over an unsaved background document
  // with no prompt is the same loss whether or not it was the one showing.
  // Which tab it is cannot be named here: the browser shows its own string and
  // will not wait on us.
  const dirty =
    (typeof documentIsDirty === "function" && documentIsDirty()) ||
    (typeof tabsBackgroundDirty === "function" && tabsBackgroundDirty());

  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

// Tab and Shift+Tab in a list, and Enter and Backspace on an empty bullet,
// are model-input.js's, as model rules with no engine in them. The Format
// menu's two list items reach the same rules.
onToolbarAction("indent-list-item", () => {
  modelIndentAtCaret(false);
});

onToolbarAction("outdent-list-item", () => {
  modelIndentAtCaret(true);
});

document.addEventListener("keydown", (e) => {
  // Lowercased for the reason file-api.js's copy spells out: Caps Lock moves
  // `key` and not `shiftKey`, so a bare === against a lowercase letter stops
  // matching and the keystroke goes to the browser instead.
  const key = (e.key || "").toLowerCase();

  // Save/open bind to the blob fallbacks only where those buttons are rendered,
  // i.e. in exported documents. In the app itself file-api.js owns Ctrl+S and
  // Ctrl+O, and talks to the server instead.
  if ((e.ctrlKey || e.metaKey) && key === "s" && toolbarButton("download-md")) {
    e.preventDefault();
    runToolbarAction("download-md");
  }
  if ((e.ctrlKey || e.metaKey) && key === "o" && toolbarButton("upload-md")) {
    e.preventDefault();
    runToolbarAction("upload-md");
  }
  // Gated the way Ctrl+S and Ctrl+O are: an exported document renders no PDF
  // item and ships no pdf-export.js, so without this the shortcut swallows the
  // browser's own Ctrl+Shift+P to do nothing.
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "p" && toolbarButton("export-pdf")) {
    e.preventDefault();
    runToolbarAction("export-pdf");
  }
  // Ctrl/Cmd+K for a link, the way every editor binds it. The link command is a
  // no-op unless the selection is in the editor, so an unfocused window just
  // loses the keystroke rather than acting on nothing.
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === "k") {
    e.preventDefault();
    runToolbarAction("insert-link");
  }
  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y live in undo.js.
});
