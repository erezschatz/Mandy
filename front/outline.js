// The document outline: a live sidebar of the headings, and a one-shot command
// that writes the same list into the document as markdown.
//
// The sidebar is chrome, and lives outside #editor on purpose. Everything
// inside the editor is the document — Turndown serialises it on every save — so
// a self-updating table of contents in there would rewrite a block of the
// user's file every time any heading changed, which is precisely the diff noise
// markdown-style.js exists to prevent. Insert TOC is the honest version of the
// same idea: it writes a list once, and that list is then ordinary content the
// author owns and edits.
//
// The nav element is built here rather than written into index.html because
// html-export.js hand-writes the .container markup too, and markup kept in two
// places drifts. Same reasoning as the toolbar.

const OUTLINE_KEY = "marky-outline";

// Same 1s as the autosave: an outline that re-renders per keystroke flickers,
// and re-measures the document while someone is still typing the heading.
const OUTLINE_DEBOUNCE = 1000;

// Indent depth comes from the nesting relationship, not from the number in the
// tag. People use headings as a type scale, so a document may well put three
// H6s under an H1 and then follow them with an H2; indenting by level would
// draw that as a five-deep staircase with four empty rungs.
//
// A monotonic stack of the open levels gives the shape instead: a heading
// closes every heading open at its own level or deeper, and nests inside
// whatever is left. Two properties fall out. The stack is strictly increasing,
// so depth is bounded by the number of *distinct* levels in play rather than by
// 6 — the pathological document above maxes out at 2, and no cap is needed.
// And nothing is invented: a document that opens on an H3 simply starts at 0.
//
// Equal levels are siblings. That is the one judgement here and it is forced —
// treating a repeat as a child would nest a flat run of H2s forever. The
// outline reports structure; it cannot divine intent.
function outlineDepths(levels) {
  const open = [];
  return levels.map((level) => {
    while (open.length && open[open.length - 1] >= level) open.pop();
    const depth = open.length;
    open.push(level);
    return depth;
  });
}

// Slugs come from headingAnchors so the outline and the editor's own
// Ctrl+click resolution cannot disagree about what a heading is called.
function outlineEntries(root) {
  const entries = Array.from(headingAnchors(root), ([slug, heading]) => ({
    slug,
    heading,
    level: Number(heading.tagName[1]),
  }));

  const depths = outlineDepths(entries.map((entry) => entry.level));
  return entries.map((entry, i) => ({ ...entry, depth: depths[i] }));
}

// What survives from a heading into a table-of-contents entry. An allowlist
// rather than a blocklist, so a heading containing something nobody anticipated
// degrades to readable text instead of producing a broken entry.
//
// The exclusions are the point. An <a> inside a heading would nest anchors,
// which is invalid — the browser unnests them and the entry stops being a link
// at all. A <br> would split the list item. MathJax's container flattens to the
// glyphs it rendered, which reads correctly but whose slug will not resolve;
// that is a known limit of maths in headings rather than one of this.
const TOC_INLINE = new Set([
  "EM", "I", "STRONG", "B", "CODE", "DEL", "S", "SUB", "SUP",
]);

// Numeric nodeTypes rather than the Node.* constants: this walks childNodes,
// and the test harness's DOM has elements and text nodes but no Node global.
const NODE_ELEMENT = 1;
const NODE_TEXT = 3;

function copyInline(source, target) {
  for (const child of source.childNodes) {
    if (child.nodeType === NODE_TEXT) {
      target.appendChild(document.createTextNode(child.textContent));
      continue;
    }
    if (child.nodeType !== NODE_ELEMENT) continue;

    if (TOC_INLINE.has(child.tagName)) {
      const copy = document.createElement(child.tagName.toLowerCase());
      copyInline(child, copy);
      target.appendChild(copy);
      continue;
    }
    target.appendChild(document.createTextNode(child.textContent));
  }
  return target;
}

function tocLink(entry) {
  const link = document.createElement("a");
  // Percent-encoding matches what markdown-it writes for a non-ASCII slug, so
  // an inserted link survives being saved and read back by anything else.
  link.setAttribute("href", `#${encodeURIComponent(entry.slug)}`);
  return copyInline(entry.heading, link);
}

// ---- the sidebar --------------------------------------------------------

let outlineNav = null;
let outlineTimer;

function outlineIsOpen() {
  return document.documentElement.getAttribute("data-outline") === "open";
}

// A flat list carrying data-depth rather than nested <ul>s: the indent is one
// calc() in app.css, and there is no markup to keep in step with the depths.
// The inserted TOC needs real nesting and builds its own — see insertToc.
function renderOutline() {
  if (!outlineNav || !outlineIsOpen()) return;

  const list = document.createElement("ul");
  list.className = "outline-list";

  for (const entry of outlineEntries(editor)) {
    const item = document.createElement("li");
    item.className = "outline-item";
    item.setAttribute("data-depth", String(Math.min(entry.depth, 5)));
    // Indent is the relative depth, type scale is the absolute level. A stray
    // H6 sitting one rung under an H1 therefore renders small beside a large
    // one: the outline stays navigable and the inconsistency shows up as
    // texture rather than as a warning nobody asked for.
    item.setAttribute("data-level", String(entry.level));

    const link = tocLink(entry);
    // Entries are truncated with an ellipsis at 16rem, so the full heading goes
    // in a tooltip. Safe here in a way it would not be inside the editor: this
    // nav never reaches Turndown, which writes a link's title into the markdown
    // as [text](href "title").
    link.title = entry.heading.textContent.trim();
    // The heading is captured here rather than looked up by slug on click.
    // A slug goes stale the moment its heading is edited, and the rebuild is
    // debounced — the element reference stays good across that window.
    link.addEventListener("click", (e) => {
      e.preventDefault();
      scrollToAnchor(entry.heading);
    });

    item.appendChild(link);
    list.appendChild(item);
  }

  outlineNav.innerHTML = "";
  if (!list.children.length) {
    const empty = document.createElement("p");
    empty.className = "outline-empty";
    empty.textContent = "No headings yet.";
    outlineNav.appendChild(empty);
    return;
  }
  outlineNav.appendChild(list);
}

function scheduleOutline() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(renderOutline, OUTLINE_DEBOUNCE);
}

function buildOutlineNav() {
  const container = document.querySelector(".container");
  if (!container || !editor) return;

  outlineNav = document.createElement("nav");
  outlineNav.id = "outline";
  outlineNav.className = "outline";
  outlineNav.setAttribute("aria-label", "Document outline");
  container.insertBefore(outlineNav, editor);

  // One observer instead of an input listener, because the document changes
  // from more directions than typing: opening a file, reloading it, Clear,
  // paste, and the welcome document arriving after its fetch. characterData is
  // in there for editing a heading in place, which moves no nodes at all.
  new MutationObserver(scheduleOutline).observe(editor, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function setOutlineOpen(open) {
  document.documentElement.setAttribute(
    "data-outline",
    open ? "open" : "closed",
  );
  try {
    localStorage.setItem(OUTLINE_KEY, open ? "open" : "closed");
  } catch {
    // Private browsing, or a quota that is somebody else's fault. The outline
    // still works for this session; it just will not be remembered.
  }

  const button = toolbarButton("toggle-outline");
  if (button) button.setAttribute("aria-pressed", open ? "true" : "false");

  // Nothing was kept up to date while it was closed.
  if (open) renderOutline();
}

// ---- insert into the document -------------------------------------------

// Real nesting, because CommonMark's indent is what makes a sublist a sublist.
// The stack holds the <ul> currently accepting each depth; outlineDepths never
// increases depth by more than one at a time, and its first entry is always 0,
// so the list being descended into always has an item to descend from.
function buildNestedList(entries) {
  const root = document.createElement("ul");
  const stack = [root];

  for (const entry of entries) {
    while (stack.length > entry.depth + 1) stack.pop();

    if (stack.length === entry.depth) {
      const child = document.createElement("ul");
      stack[stack.length - 1].lastElementChild.appendChild(child);
      stack.push(child);
    }

    const item = document.createElement("li");
    item.appendChild(tocLink(entry));
    stack[stack.length - 1].appendChild(item);
  }

  return root;
}

// The block the caret is sitting in, as a direct child of the editor — a TOC
// has to land between blocks, not inside the middle of a paragraph or a table
// cell. Falls back to the top of the document when the caret is elsewhere.
function blockAtCaret() {
  const selection = window.getSelection();
  const anchor = selection && selection.anchorNode;
  let node = anchor && (anchor.nodeType === NODE_ELEMENT ? anchor : anchor.parentElement);

  while (node && node.parentElement && node.parentElement !== editor) {
    node = node.parentElement;
  }
  return node && node.parentElement === editor ? node : null;
}

function insertToc() {
  const entries = outlineEntries(editor);
  if (!entries.length) {
    alert("This document has no headings to build a table of contents from.");
    return;
  }

  const list = buildNestedList(entries);
  const block = blockAtCaret();

  // No dedupe on a second invocation. A marker class would not survive a save
  // and reload — Turndown drops it — so there is no honest way to recognise a
  // TOC this inserted earlier, and pretending otherwise would delete content
  // the author had since edited. Once inserted it is theirs.
  if (block) block.insertAdjacentElement("afterend", list);
  else editor.insertBefore(list, editor.firstChild);

  // The observer sees the insertion, but autosave and the dirty flag hang off
  // `input`, which a programmatic edit does not raise.
  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

// ---- wiring --------------------------------------------------------------

onToolbarAction("toggle-outline", () => setOutlineOpen(!outlineIsOpen()));
onToolbarAction("insert-toc", () => insertToc());

// Exported documents open closed regardless of the author's stored preference,
// for the same reason they ignore the author's theme: this is the reader's
// copy. index.html stamps the attribute before the stylesheet loads so the
// column is reserved rather than appearing after this script runs.
if (editor && editor.hasAttribute("data-exported")) {
  document.documentElement.setAttribute("data-outline", "closed");
}

buildOutlineNav();

// Sync the button and the list with whatever the inline script stamped, but
// without writing back: a reader opening an exported document should not have
// their own stored preference overwritten by the author's file.
const outlineButton = toolbarButton("toggle-outline");
if (outlineButton) {
  outlineButton.setAttribute("aria-pressed", outlineIsOpen() ? "true" : "false");
}
renderOutline();
