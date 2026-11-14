const BAR_GAP = 10; // between the bar and the selection
const BAR_EDGE = 8; // between the bar and the edge of the window

// The chrome is sticky, so the usable area starts under it rather than at the
// top of the viewport. Measured live for the reason scrollToAnchor measures it:
// app.css's heights are magic numbers and wrong the moment a row changes.
//
// It is two elements rather than one. `.tab-bar` was a second row inside
// `.toolbar` until the chrome redesign moved it out to a sticky sibling at
// `top: var(--toolbar-height)`, and this kept measuring `.toolbar` alone — so
// the band it claimed started 36px too high and the bar parked itself on top of
// the tab strip, which it wins on z-index. An exported document has no tab bar
// at all, so the querySelector misses and it contributes nothing.
function chromeClearance() {
  return [".toolbar", ".tab-bar"].reduce((total, selector) => {
    const element = document.querySelector(selector);
    return total + (element ? element.getBoundingClientRect().height : 0);
  }, 0);
}

// The formats the bar offers at a bare caret: block-level only, and that is
// the whole distinction. Each of these acts on the row the caret is in, so it
// has something to do without a selection. Bold, italic, strikethrough and an
// inline code span have nothing to act on but selected text — at a caret they
// could only toggle *typing state*, which is a different affordance wearing
// the same button, so they wait until there is a selection.
//
// `p` is in the list although the spec this was written from stopped at the
// headings, the lists and code: it is the only way back out of a heading, and
// a bar that can turn a row into an H1 but not back again would send the user
// to the Format menu for the return trip — which is the discoverability gap
// this variant exists to close.
const CARET_FORMATS = ["p", "h1", "h2", "h3", "ul", "ol", "code"];

function hideFormatBar() {
  formatBar.classList.remove("visible");
}

// Whether the caret sits before all of its row's text.
//
// Walked rather than measured with a Range, for two reasons. The question is
// about text and not about nodes — `<p><strong>|x</strong></p>` is the start
// of the row even though the caret is an element deep — and a range from the
// block's start to the caret needs cloneRange/setEnd, which is more editing
// engine than this decision is worth.
//
// Whitespace ahead of the caret still counts as the start, because nothing on
// screen tells it apart from nothing at all.
function atBlockStart(range) {
  const block = blockAncestor(range.startContainer);
  if (!block) return false;

  const container = range.startContainer;
  const offset = range.startOffset;
  let before = "";
  let reached = false;

  (function walk(node) {
    if (reached) return;
    if (node === container) {
      reached = true;
      if (node.nodeType === Node.TEXT_NODE) {
        before += (node.textContent || "").slice(0, offset);
      } else {
        // An element container counts child nodes, not characters.
        const kids = node.childNodes || [];
        for (let i = 0; i < offset && i < kids.length; i++) {
          before += kids[i].textContent || "";
        }
      }
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      before += node.textContent || "";
      return;
    }
    for (const child of node.childNodes || []) {
      walk(child);
      if (reached) return;
    }
  })(block);

  // A zero-width character counts as nothing for the same reason whitespace
  // does — nothing on screen tells it apart from nothing at all — and since
  // TODO 3.1's slice 7 the model core puts one in front of an equation that
  // starts a line, for Firefox's caret.
  return !before.replace(/\u200B/g, "").trim();
}

// What the bar is being positioned against.
//
// A selection is measured by its own rect, and a zero-width one means the
// selection has no geometry to hang off — a range inside a collapsed or
// not-yet-laid-out node — so there is nothing to point at.
//
// A caret is zero-width by definition, so width tells us nothing there. Height
// does: in an empty block — `<p><br></p>`, which is what the browser leaves
// after Enter — engines answer 0×0 at the document origin rather than giving
// the caret a line box. The block's own rect is the honest fallback, and an
// exact one: the caret is at its start, so the block's left edge is the
// caret's.
function barRect(range, caret) {
  const rect = range.getBoundingClientRect();
  if (!caret) return rect.width === 0 ? null : rect;
  if (rect.height > 0) return rect;
  const block = blockAncestor(range.startContainer);
  return block ? block.getBoundingClientRect() : null;
}

// Buttons a mode does not offer are hidden rather than removed: the bar's
// markup is hand-written in index.html and again in html-export.js, so
// rebuilding it here would make this a third copy to keep in step.
//
// Read off `data-format` rather than the class, because that is the attribute
// that says which of the two lists a button belongs to — and it is what tells
// a button from a separator without asking the bar about its own layout.
function setBarMode(caret) {
  const items = Array.from(formatBar.children || []);
  for (const item of items) {
    const format = item.getAttribute && item.getAttribute("data-format");
    if (!format) continue;
    item.hidden = caret && !CARET_FORMATS.includes(format);
  }
  collapseSeparators(items);
}

// A rule that no longer divides two visible groups goes with them. Same problem
// `visibleItems` solves for the menu bar and the same answer: filtering by mode
// strands separators — leading, trailing and doubled — and a stranded rule
// reads as a gap in the bar rather than as a divider.
function collapseSeparators(items) {
  let pending = null;
  let seen = false;
  for (const item of items) {
    const isButton = !!(item.getAttribute && item.getAttribute("data-format"));
    if (isButton) {
      if (item.hidden) continue;
      if (pending) pending.hidden = false;
      pending = null;
      seen = true;
      continue;
    }
    item.hidden = true;
    if (seen) pending = item;
  }
}

function showFormatBar() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return hideFormatBar();

  const range = selection.getRangeAt(0);
  const caret = !!selection.isCollapsed;

  // At a bare caret the bar is a row control rather than a selection control,
  // so it appears only where a row control makes sense: ahead of the row's
  // text. A caret dropped into the middle of a line raises nothing — the bar
  // would trail the caret around the document with no way to dismiss it, and
  // it would be offering the same block formats the Format menu already
  // reaches from exactly there.
  if (caret && !atBlockStart(range)) return hideFormatBar();

  const rect = barRect(range, caret);
  if (!rect) return hideFormatBar();

  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // Shown before it is measured: the bar is display: none until .visible lands,
  // and a hidden element measures 0×0. Measuring first left it with no height
  // to sit above — so it covered the text — and no width to centre or clamp,
  // which is why it ran off the right edge and then snapped into place on the
  // next selectionchange. Nothing paints between here and the writes below.
  //
  // The mode is set in the same window and for the same reason: hiding three
  // buttons changes the width every line below this reads.
  formatBar.classList.add("visible");
  setBarMode(caret);
  const barWidth = formatBar.offsetWidth;
  const barHeight = formatBar.offsetHeight;

  // Above the selection by default. Near the first line of the document there
  // is no room for it there — it would sit off the top of the page, or behind
  // the sticky toolbar — so it flips below rather than going out of reach.
  const ceiling = scrollTop + chromeClearance() + BAR_EDGE;
  const above = rect.top + scrollTop - barHeight - BAR_GAP;
  const top = above >= ceiling ? above : rect.bottom + scrollTop + BAR_GAP;

  // Centred on the selection, but never past either edge: a selection at the
  // right margin used to push half the bar out of the window. The second
  // Math.max keeps the clamp sane if the bar is wider than the window.
  //
  // A caret is left-aligned to the row instead. Centring on a zero-width rect
  // would put half the bar in the margin and then clamp it to the window edge,
  // so it would sit in the same place whichever row the caret was in.
  const wanted = caret ? rect.left : rect.left + rect.width / 2 - barWidth / 2;
  const rightmost = document.documentElement.clientWidth - barWidth - BAR_EDGE;
  const left = Math.min(
    Math.max(wanted, BAR_EDGE),
    Math.max(rightmost, BAR_EDGE),
  );

  formatBar.style.left = `${left}px`;
  formatBar.style.top = `${top}px`;

  updateActiveButtons();
}

// One predicate per button, each checking for an ancestor tag between a text
// node and #editor — the same test the old anchor-only walk made, just run
// per node instead of once. p and the headings match their own tag directly;
// bold, italic and strikethrough fold every spelling of the tag, since pasted
// HTML is the only thing that ever wrote the other ones and the model renders
// what markdown-it renders; ul/ol/code match on presence anywhere in the
// chain, nested list or not.
const FORMAT_PREDICATES = {
  p: (node) => hasAncestorTag(node, "P"),
  h1: (node) => hasAncestorTag(node, "H1"),
  h2: (node) => hasAncestorTag(node, "H2"),
  h3: (node) => hasAncestorTag(node, "H3"),
  h4: (node) => hasAncestorTag(node, "H4"),
  h5: (node) => hasAncestorTag(node, "H5"),
  h6: (node) => hasAncestorTag(node, "H6"),
  quote: (node) => hasAncestorTag(node, "BLOCKQUOTE"),
  bold: (node) => hasAncestorTag(node, "STRONG", "B"),
  italic: (node) => hasAncestorTag(node, "EM", "I"),
  strikethrough: (node) => hasAncestorTag(node, "S", "DEL", "STRIKE"),
  ul: (node) => hasAncestorTag(node, "UL"),
  ol: (node) => hasAncestorTag(node, "OL"),
  code: (node) => hasAncestorTag(node, "CODE"),
};

// Takes an element as well as a text node, because the caret's stand-in for a
// selection can be either. From a text node the walk starts at its parent, as
// it always did; from an element it starts at the element, whose own tag is
// the answer for a caret sitting in an empty heading.
function hasAncestorTag(start, ...tags) {
  let node = start.nodeType === Node.TEXT_NODE ? start.parentElement : start;
  while (node && node !== editor) {
    if (tags.includes(node.tagName)) return true;
    node = node.parentElement;
  }
  return false;
}

// The non-empty text nodes the selection actually touches, in document order.
// A text node's own formatting is uniform along its length — a range that
// only grazes the end of one still counts the whole node, the way a browser's
// own bold-button state does at a selection boundary. Blank nodes (the
// whitespace contenteditable leaves between blocks) are dropped so they can
// never masquerade as an unformatted character and drag "all" down to "mixed".
function textNodesInRange(range) {
  const nodes = [];
  (function walk(node) {
    for (const child of node.childNodes || []) {
      if (child.nodeType === Node.TEXT_NODE) {
        if ((child.textContent || "").trim() && range.intersectsNode(child)) {
          nodes.push(child);
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    }
  })(editor);
  return nodes;
}

// all: every touched node has it. none: no touched node has it. mixed:
// somewhere in between — the state the old single-node check could not tell
// apart from either extreme, because it only ever asked about one node.
function formatState(nodes, predicate) {
  if (!nodes.length) return "none";
  let all = true;
  let any = false;
  for (const node of nodes) {
    if (predicate(node)) any = true;
    else all = false;
  }
  return all ? "all" : any ? "mixed" : "none";
}

// What stands in for the selection at a caret. A collapsed range touches no
// text node — intersectsNode asks a boundary question there and the engines do
// not agree on the answer — so the node the caret is in speaks for it. That is
// the whole answer rather than an approximation: the caret bar offers block
// formats only, and every one of those is an ancestor test.
function caretNodes(range) {
  const node = range.startContainer;
  if (node && node.nodeType === Node.TEXT_NODE) return [node];
  const block = blockAncestor(node);
  return block ? [block] : [];
}

function updateActiveButtons() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const nodes = selection.isCollapsed
    ? caretNodes(range)
    : textNodesInRange(range);

  document.querySelectorAll(".format-btn").forEach((btn) => {
    btn.classList.remove("active", "mixed");
  });

  for (const [format, predicate] of Object.entries(FORMAT_PREDICATES)) {
    const btn = document.querySelector(`.format-btn[data-format="${format}"]`);
    if (!btn) continue;
    const state = formatState(nodes, predicate);
    if (state === "all") btn.classList.add("active");
    else if (state === "mixed") btn.classList.add("mixed");
  }
}

// The Format menu's Bold, Italic and Strikethrough say whether the caret or
// the selection already has the mark, stamped as the menu opens. Under the
// model core the model answers, pending marks included; otherwise the DOM
// does, through the same predicates the format bar's own buttons use.
// Code is checked the same way: a caret in a code span or a code block, or a
// selection that is all code. Not a mark to the model, so it asks its own.
const MENU_MARKS = { bold: "strong", italic: "em", strikethrough: "strike", code: "code" };
// And the block formats: the caret in a heading, a list or a quote is in
// something other than plain text, and the menu says so. The model answers per
// leaf touched; a bundle without it falls back to the DOM predicates the bar
// uses.
const MENU_BLOCKS = ["h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "quote"];
const MENU_CHECKS = Object.keys(MENU_MARKS).concat(MENU_BLOCKS);

function formatMenuState(format) {
  if (MENU_BLOCKS.includes(format) && typeof modelInputBlockState === "function") {
    return modelInputBlockState(format);
  }
  if (format === "code" && typeof modelInputCodeState === "function") {
    return modelInputCodeState();
  }
  if (typeof modelInputMarkState === "function") {
    return modelInputMarkState(MENU_MARKS[format]);
  }
  const selection = window.getSelection();
  if (!selection.rangeCount) return "none";
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return "none";
  const nodes = selection.isCollapsed ? caretNodes(range) : textNodesInRange(range);
  return formatState(nodes, FORMAT_PREDICATES[format]);
}

onMenuOpen("formatMenu", (wrapper) => {
  for (const format of MENU_CHECKS) {
    const item = wrapper.querySelector(`[data-action="format-${format}"]`);
    if (!item) continue;
    const state = formatMenuState(format);
    item.setAttribute("aria-pressed", state === "all" ? "true" : state === "mixed" ? "mixed" : "false");
  }
  // The table controls, stage 3's slice 5: live only with the caret in a table
  // under the model core, and the alignment items check the caret's column.
  const table = typeof modelInputTableState === "function" ? modelInputTableState() : null;
  for (const item of wrapper.querySelectorAll('[data-action^="table-"]')) {
    item.disabled = !table;
    if (!item.hasAttribute("aria-pressed")) continue;
    const align = item.getAttribute("data-action").replace("table-align-", "");
    item.setAttribute("aria-pressed", table && table.align === align ? "true" : "false");
  }
});

const BLOCK_TAGS = ["P", "H1", "H2", "H3", "LI", "PRE"];

// Never returns #editor. Formatting must not target the editable root: swapping
// it out detaches the document, so the `#editor` CSS stops matching, the
// contenteditable attribute goes with it, and every module is left holding a
// reference to a node that is no longer in the page. That produced an editor
// that looked unstyled, refused input, and only recovered on reload.
function blockAncestor(node) {
  let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (
    element &&
    element !== editor &&
    !BLOCK_TAGS.includes(element.tagName)
  ) {
    element = element.parentElement;
  }
  return element && element !== editor ? element : null;
}

// TODO 1.1.5: a heading inside a list item is expressible in both HTML and
// markdown, but not something the editor should offer a way to make by
// accident. Settled as a no-op, and refused here, where the selection still
// exists, rather than after the fact.
function headingTargetsListItem(format, range) {
  if (!/^h[1-6]$/.test(format)) return false;
  const node = range.commonAncestorContainer;
  const start = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const item = start && start.closest && start.closest("li");
  return !!(item && editor.contains(item));
}

function applyFormat(format) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  if (headingTargetsListItem(format, range)) return;

  // Read before the command runs: every branch below can move the selection,
  // and what the bar does afterwards depends on which bar it was.
  const caret = !!selection.isCollapsed;

  // Every format is a model command: the three marks (slice 7's step 3), Code
  // (step 4's span and step 5's fence), Paragraph and the six headings (step
  // 5), the two lists (step 6) and the blockquote (stage 3's slice 1). They
  // act on the whole block from a partial selection where there is no inline
  // counterpart, by design — there is no such thing as half a heading. Code is
  // the only one that reads the selection's extent.
  //
  // Feature-tested, since a bundle decides for itself what it ships, and one
  // without model-input.js has nothing to format with.
  const mark = { bold: "strong", italic: "em", strikethrough: "strike" }[format];
  if (mark && typeof modelInputFormat === "function") modelInputFormat(mark);
  else if (/^(p|h[1-6])$/.test(format) && typeof modelInputBlockFormat === "function") modelInputBlockFormat(format);
  else if ((format === "ul" || format === "ol") && typeof modelInputList === "function") modelInputList(format === "ol");
  else if (format === "quote" && typeof modelInputQuote === "function") modelInputQuote();
  else if (format === "code" && typeof modelInputCode === "function") modelInputCode();
  else return;

  // Bold, italic and strikethrough leave the bar up so they can be combined on
  // one selection.
  //
  // The caret bar stays up for the same reason and is re-shown rather than
  // merely left alone: its formats compose — h2, then a bullet — and the caret
  // has not moved, so the condition that raised it still holds. Re-showing is
  // what repositions it, since the row it is pointing at has just changed
  // height, and what re-reads the active states off the new block. If the
  // command left the caret somewhere that is no longer the start of a row,
  // showFormatBar hides the bar itself.
  if (caret) {
    showFormatBar();
  } else if (format !== "bold" && format !== "italic" && format !== "strikethrough") {
    hideFormatBar();
  }
}

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      showFormatBar();
    } else {
      hideFormatBar();
    }
  }
});

// The bar is `position: absolute` in document coordinates, so a scroll carries
// it along with the text it points at — up over the sticky chrome and off the
// top of the window, or down past the fold — and nothing was taking it away.
// Vanishing is the whole answer: the bar belongs to a selection the reader can
// see, and the next selectionchange puts it back where the selection now is.
//
// On `window` and without capture, so only the page's own scroll is heard: the
// outline's and the tab strip's own overflow scrolling is not this bar's
// business. Passive because this never cancels anything. TODO 4.10 moves the
// document's scroll into an app-shell container, and this listener moves to it
// with barRect's scroll read.
window.addEventListener("scroll", hideFormatBar, { passive: true });

document.addEventListener("click", (e) => {
  if (
    !formatBar.contains(e.target) &&
    e.target !== editor &&
    !editor.contains(e.target)
  ) {
    hideFormatBar();
  }
});

document.querySelectorAll(".format-btn").forEach((btn) => {
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const format = btn.dataset.format;
    applyFormat(format);
  });
});

// The Format menu reaches the same ten formats. Registered from one list
// rather than ten calls so the menu spec and the bar cannot drift apart: an
// action named in toolbar.js with no format behind it here would render as a
// dead control, which is exactly what the toolbar suite checks for.
//
// applyFormat works off the live selection, which is why toolbar.js prevents
// the default on mousedown over the menu bar — a click that moved focus out of
// the editor would take the selection with it and every one of these would
// return having done nothing.
// h4-h6 (TODO 1.1.2) are Format-menu-only — see toolbar.js — but they still go
// through the one applyFormat entry point everything else here does.
for (const format of ["p", "h1", "h2", "h3", "h4", "h5", "h6", "bold", "italic", "strikethrough", "ul", "ol", "code", "quote"]) {
  onToolbarAction(`format-${format}`, () => applyFormat(format));
}
