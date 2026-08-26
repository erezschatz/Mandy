const BAR_GAP = 10; // between the bar and the selection
const BAR_EDGE = 8; // between the bar and the edge of the window

// The toolbar is sticky at top: 0, so the usable area starts under it rather
// than at the top of the viewport. Measured live for the reason scrollToAnchor
// measures it: app.css's 69px is a magic number and wrong once it wraps.
function toolbarClearance() {
  const toolbar = document.querySelector(".toolbar");
  return toolbar ? toolbar.getBoundingClientRect().height : 0;
}

function showFormatBar() {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) {
    formatBar.classList.remove("visible");
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0) {
    formatBar.classList.remove("visible");
    return;
  }

  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

  // Shown before it is measured: the bar is display: none until .visible lands,
  // and a hidden element measures 0×0. Measuring first left it with no height
  // to sit above — so it covered the text — and no width to centre or clamp,
  // which is why it ran off the right edge and then snapped into place on the
  // next selectionchange. Nothing paints between here and the writes below.
  formatBar.classList.add("visible");
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
  const rightmost = document.documentElement.clientWidth - barWidth - BAR_EDGE;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - barWidth / 2, BAR_EDGE),
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

function hasAncestorTag(textNode, ...tags) {
  let node = textNode.parentElement;
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

function updateActiveButtons() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const nodes = textNodesInRange(selection.getRangeAt(0));

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

function applyFormat(format) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

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
  if (format !== "bold" && format !== "italic" && format !== "strikethrough") {
    formatBar.classList.remove("visible");
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
      formatBar.classList.remove("visible");
    }
  }
});

document.addEventListener("click", (e) => {
  if (
    !formatBar.contains(e.target) &&
    e.target !== editor &&
    !editor.contains(e.target)
  ) {
    formatBar.classList.remove("visible");
  }
});

document.querySelectorAll(".format-btn").forEach((btn) => {
  btn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const format = btn.dataset.format;
    applyFormat(format);
  });
});

// The Format menu reaches the same nine formats. Registered from one list
// rather than nine calls so the menu spec and the bar cannot drift apart: an
// action named in toolbar.js with no format behind it here would render as a
// dead control, which is exactly what the toolbar suite checks for.
//
// applyFormat works off the live selection, which is why toolbar.js prevents
// the default on mousedown over the menu bar — a click that moved focus out of
// the editor would take the selection with it and every one of these would
// return having done nothing.
for (const format of ["p", "h1", "h2", "h3", "bold", "italic", "strikethrough", "ul", "ol", "code"]) {
  onToolbarAction(`format-${format}`, () => applyFormat(format));
}
