const BAR_GAP = 10; // between the bar and the selection
const BAR_EDGE = 8; // between the bar and the edge of the window

// The toolbar is sticky at top: 0, so the usable area starts under it rather
// than at the top of the viewport. Measured live for the reason scrollToAnchor
// measures it: app.css's 69px is a magic number and wrong once it wraps.
function toolbarClearance() {
  const toolbar = document.querySelector(".toolbar");
  return toolbar ? toolbar.getBoundingClientRect().height : 0;
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

  return !before.trim();
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
  const ceiling = scrollTop + toolbarClearance() + BAR_EDGE;
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
// per node instead of once. p/h1/h2/h3 match their own tag directly, the way
// formatBlock leaves it; bold, italic and strikethrough fold every spelling
// execCommand can produce; ul/ol/code match on presence anywhere in the
// chain, nested list or not, which is what the single-node walk always did
// too.
const FORMAT_PREDICATES = {
  p: (node) => hasAncestorTag(node, "P"),
  h1: (node) => hasAncestorTag(node, "H1"),
  h2: (node) => hasAncestorTag(node, "H2"),
  h3: (node) => hasAncestorTag(node, "H3"),
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

// The blocks a selection actually touches — the innermost one around each end
// and everything between, not `editor.children`.
//
// Top-level children were wrong in exactly one way, and it was destructive: a
// selection inside a single bullet reported the whole `<ul>`, so Code replaced
// the list with one `<pre>` and ran every item together. The innermost block is
// the `<li>` the text is in, which is what the caret is actually sitting in.
//
// Walked rather than queried because the check has to run under the DOM stub
// too, where querySelectorAll answers with nothing.
function blocksInRange(range) {
  const hits = [];
  (function walk(node) {
    for (const child of node.children || []) {
      if (child.nodeType !== 1) continue;
      if (BLOCK_TAGS.includes(child.tagName) && range.intersectsNode(child)) {
        hits.push(child);
      }
      walk(child);
    }
  })(editor);

  // A nested list reports both `<li>`s and only the inner one holds the text.
  return hits.filter(
    (el) => !hits.some((other) => other !== el && el.contains(other)),
  );
}

// Whether Code should produce a block rather than an inline span.
//
// Three cases, and the middle one is the reason this exists: selecting two
// words in a paragraph and pressing Code used to turn the entire paragraph into
// a fenced block. Markdown has two different constructs here and the button
// only ever reached one of them.
function coversWholeBlocks(range, blocks) {
  // Across a block boundary there is no inline answer — markdown has no code
  // span that spans two paragraphs — so the block is the only thing it can be.
  if (blocks.length > 1) return true;
  // A caret is not a partial selection. Every other block format acts on the
  // whole block from a bare caret, and Code should not be the one that makes
  // you select the line first.
  if (range.collapsed) return true;
  return range.toString().trim() === (blocks[0].textContent || "").trim();
}

// The inline `<code>` the selection sits in, if any. A `<code>` inside a `<pre>`
// is the code block's own and belongs to the other branch.
function inlineCodeAt(range) {
  const node = range.commonAncestorContainer;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const code = element && element.closest && element.closest("code");
  if (!code || !editor.contains(code)) return null;
  return code.closest("pre") ? null : code;
}

function toggleInlineCode(range) {
  const existing = inlineCodeAt(range);
  if (existing) {
    existing.parentNode.replaceChild(
      document.createTextNode(existing.textContent),
      existing,
    );
    return;
  }

  const text = range.toString();
  if (!text.trim()) return;

  // textContent, not the extracted nodes: markdown has no way to express bold
  // inside a code span, so anything carried in would be silently dropped by
  // Turndown on the next save. Dropping it here at least happens on screen.
  const code = document.createElement("code");
  code.textContent = text;
  range.deleteContents();
  range.insertNode(code);

  // Leave the new span selected rather than collapsing the caret to wherever
  // deleteContents left it, so pressing Code twice is a toggle.
  const selection = window.getSelection();
  if (selection.removeAllRanges && document.createRange) {
    const next = document.createRange();
    next.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(next);
  }
}

function saveSoon() {
  setTimeout(() => {
    localStorage.setItem("markdownContent", editor.innerHTML);
  }, 100);
}

// Hand-rolled because there is no execCommand for either kind of code.
//
// Which kind is the whole decision, and it is made from the selection rather
// than from a second button: a partial selection means an inline span, whole
// blocks mean a fenced block. Markdown draws that line too, so a button that
// only reached one of them could not write half of what the format offers.
function toggleCode(range) {
  const block = blockAncestor(range.commonAncestorContainer);
  const pre = block && block.closest("pre");

  if (pre && editor.contains(pre)) {
    const container = pre.parentNode;
    const text = pre.textContent;
    if (container.tagName === "LI") {
      // Undoes the nested case below: the <pre> is the li's only child, not a
      // wrapper standing in for the li itself, so it comes out and the li's
      // own text takes its place — same shape the li had before toggling on.
      pre.remove();
      container.textContent = text;
    } else {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      container.replaceChild(paragraph, pre);
    }
    return;
  }

  const blocks = blocksInRange(range);
  if (!blocks.length) return toggleInlineCode(range);

  // A whole bullet nests its fence inside the <li> instead of replacing it —
  // swapping the <li> itself for a <pre> would be invalid markup, but a <pre>
  // as the li's only child round-trips through markdown fine.
  if (blocks.length === 1 && blocks[0].tagName === "LI" && coversWholeBlocks(range, blocks)) {
    const li = blocks[0];
    const preElement = document.createElement("pre");
    const codeElement = document.createElement("code");
    codeElement.textContent = li.textContent;
    preElement.appendChild(codeElement);
    li.textContent = "";
    li.appendChild(preElement);
    return;
  }

  // A <pre> can only stand in for a block that is a direct child of the
  // editor — the list-item case above is the one exception, handled by
  // nesting rather than replacing.
  const atTopLevel = blocks.every((b) => b.parentNode === editor);

  if (!coversWholeBlocks(range, blocks) || !atTopLevel) {
    // Inline is only safe within a single block. Across two, deleteContents
    // would pull the blocks themselves apart — so selecting three bullets and
    // pressing Code would delete the list to make a code span markdown cannot
    // write anyway. Nothing to do, and better said than done silently.
    if (blocks.length === 1) return toggleInlineCode(range);
    notify("Select inside a single block to format it as code.", { severity: "info" });
    return;
  }

  const preElement = document.createElement("pre");
  const codeElement = document.createElement("code");
  codeElement.textContent = blocks.map((b) => b.textContent).join("\n");
  preElement.appendChild(codeElement);

  blocks[0].parentNode.replaceChild(preElement, blocks[0]);
  for (const extra of blocks.slice(1)) extra.remove();
}

// TODO 1.1.5: a heading inside a list item is expressible in both HTML and
// markdown, but not something the editor should offer a way to make by
// accident — Chrome already refused it after normaliseEditorMarkup unwrapped
// the list it used to swallow, Firefox never did. Settled as a no-op in both
// engines rather than "whichever is less destructive," and refused here,
// where the selection still exists, rather than after the fact.
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

  switch (format) {
    case "bold":
      runCommand("bold");
      break;
    case "italic":
      runCommand("italic");
      break;
    // Cross-browser identical per D4 / TODO 1.1's measurements, so this needs
    // no normalisation of its own — only the Turndown rule that reads it back.
    case "strikethrough":
      runCommand("strikeThrough");
      break;
    // The list commands toggle: run inside an existing list, they unwrap it.
    case "ul":
      runCommand("insertUnorderedList");
      break;
    case "ol":
      runCommand("insertOrderedList");
      break;
    case "code":
      toggleCode(range);
      // The one branch that raises no input event of its own. Every execCommand
      // above raises one, and autosave, the dirty flag, the outline and the undo
      // stack all hang off exactly that — so before this a code block was
      // invisible to Ctrl+Z and left the toolbar claiming the document still
      // matched the file on disk.
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      break;
    // p, h1, h2, h3. formatBlock spans a multi-block selection natively and
    // works inside the editable root rather than on it.
    //
    // These act on the whole block even from a partial selection, by design
    // rather than by omission — there is no such thing as half a heading, and
    // every editor people already use behaves this way. Disabling them on a
    // partial selection was the alternative and would read as broken. Code is
    // the only format with a real inline counterpart, which is why it is the
    // only one that reads the selection's extent.
    default:
      runCommand("formatBlock", `<${format}>`);
  }

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
  saveSoon();
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
// through the one applyFormat entry point everything else here does; the
// default `formatBlock` branch already handles any tag name, so no new case
// was needed for them, only the registration.
for (const format of ["p", "h1", "h2", "h3", "h4", "h5", "h6", "bold", "italic", "strikethrough", "ul", "ol", "code"]) {
  onToolbarAction(`format-${format}`, () => applyFormat(format));
}
