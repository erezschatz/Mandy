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

function updateActiveButtons() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  let node = selection.anchorNode;
  if (!node) return;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  document.querySelectorAll(".format-btn").forEach((btn) => {
    btn.classList.remove("active");
  });

  while (node && node !== editor) {
    const tagName = node.tagName?.toLowerCase();
    const btn = document.querySelector(`.format-btn[data-format="${tagName}"]`);
    if (btn) {
      btn.classList.add("active");
    }

    if (tagName === "strong" || tagName === "b") {
      const boldBtn = document.querySelector('.format-btn[data-format="bold"]');
      if (boldBtn) {
        boldBtn.classList.add("active");
      }
    }

    if (tagName === "em" || tagName === "i") {
      const italicBtn = document.querySelector(
        '.format-btn[data-format="italic"]',
      );
      if (italicBtn) {
        italicBtn.classList.add("active");
      }
    }

    node = node.parentElement;
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

// Top-level blocks the selection touches, for the one format with no
// execCommand equivalent.
function blocksInRange(range) {
  return Array.from(editor.children).filter((child) =>
    range.intersectsNode(child),
  );
}

function saveSoon() {
  setTimeout(() => {
    localStorage.setItem("markdownContent", editor.innerHTML);
  }, 100);
}

// Hand-rolled because there is no execCommand for code blocks. Multiple
// selected blocks collapse into one fenced block, joined by newlines.
function toggleCodeBlock(range) {
  const block = blockAncestor(range.commonAncestorContainer);
  const pre = block && block.closest("pre");

  if (pre && editor.contains(pre)) {
    const paragraph = document.createElement("p");
    paragraph.textContent = pre.textContent;
    pre.parentNode.replaceChild(paragraph, pre);
    return;
  }

  const blocks = blocksInRange(range);
  if (!blocks.length) return;

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
      document.execCommand("bold", false, null);
      break;
    case "italic":
      document.execCommand("italic", false, null);
      break;
    // The list commands toggle: run inside an existing list, they unwrap it.
    case "ul":
      document.execCommand("insertUnorderedList", false, null);
      break;
    case "ol":
      document.execCommand("insertOrderedList", false, null);
      break;
    case "code":
      toggleCodeBlock(range);
      break;
    // p, h1, h2, h3. formatBlock spans a multi-block selection natively and
    // works inside the editable root rather than on it.
    default:
      document.execCommand("formatBlock", false, `<${format}>`);
  }

  // Bold and italic leave the bar up so they can be combined on one selection.
  if (format !== "bold" && format !== "italic") {
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
