// The one door every document-mutating execCommand goes through.
//
// execCommand is deprecated, which is a worse position than removed rather than
// a better one: the spec that defined it was abandoned, so nothing obliges any
// engine to agree with any other about what a command produces. What keeps them
// honest instead is web compatibility — the commands are frozen legacy code in
// every engine, and changing one would break a decade of editors — so the risk
// is not that they drift apart from here, it is that they are already apart and
// nobody is going to fix it.
//
// Marky's answer is not to reimplement the commands. It is to normalise what
// they leave behind, in one place, and only for the differences that actually
// survive to the file — which is a much shorter list than it first looks,
// because Turndown flattens most of them on the way out. <b> and <strong> are
// both `**bold**`; whatever any engine does to build an <h2>, it is `## `. What
// has to be fixed here is only what markdown cannot absorb.
//
// The list below is not guesswork: every entry was observed, in Chrome 139 and
// Firefox 154, by tests/browser-check.html. Two things that reading about
// execCommand would lead you to expect turn out to be false, and both are worth
// knowing before editing this file. Neither engine emits styled spans for bold
// or italic once styleWithCSS is off — the content-losing case is closed by one
// line rather than by the retagging below, which is now a backstop for pasted
// markup. And the list-nesting bug is in *both* engines, not just Chrome: the
// comment in app.js that calls it Chrome's is out of date, and this is what a
// dead spec's shared legacy looks like rather than one vendor's mistake.
//
// See Decision D4 in docs/DECISIONS.md for the full argument, and TODO 5.1 for the
// browser check that keeps the list below honest.

// Tag-based output rather than styled spans. The default was never specified
// and is per-browser, so without this some engines answer Bold with
// <span style="font-weight:bold">. Turndown has no rule for that, so it drops
// the span and keeps the text — the bold disappears on save, silently, with
// nothing wrong on screen until the file is reopened. One line, and it closes
// the only divergence on the list that loses the user's content outright.
try {
  document.execCommand("styleWithCSS", false, false);
} catch {
  // Some engines have historically thrown here rather than returning false when
  // the command runs with no editable context focused. Nothing to be done about
  // it, and normaliseEditorMarkup is the backstop either way.
}

// Styles that have a markdown spelling, and the element that spells them.
// Anything else a span carries — colour, font size, a background — has no
// markdown at all, so the span is unwrapped rather than retagged: Turndown
// would drop it anyway, and leaving it in the document lets it accumulate.
const STYLE_TO_TAG = [
  [/font-weight\s*:\s*(bold|[6-9]00)/i, "STRONG"],
  [/font-style\s*:\s*italic/i, "EM"],
  // <del> has no Turndown rule — strikethrough lives in turndown-plugin-gfm,
  // which this project does not carry — so this survives on screen and is
  // dropped on save, exactly as the styled span was. Retagging it anyway is
  // still the right move: it is the semantically correct markup, and the day
  // TODO 1.4 adds a `~~` rule it starts working with no change here.
  [/text-decoration[a-z-]*\s*:[^;]*line-through/i, "DEL"],
];

// Blocks that have no business containing a list, and are unwrapped when they
// do. <li> and <blockquote> are deliberately absent: a list inside either of
// those is ordinary, correct markup.
const UNWRAPPABLE_AROUND_LIST = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6"]);

function holdsListChild(node) {
  for (const child of node.children || []) {
    if (child.nodeType === 1 && (child.tagName === "UL" || child.tagName === "OL")) return true;
  }
  return false;
}

// Subtrees nothing here may touch. `pre` and `code` are the user's literal
// text; the other two are the rendered output of Mermaid and MathJax, which
// hold the only copy of their own source and break irrecoverably if rewritten.
const PROTECTED_TAGS = new Set(["PRE", "CODE", "MJX-CONTAINER"]);

function isProtectedNode(node) {
  let current = node;
  while (current && current !== editor) {
    if (PROTECTED_TAGS.has(current.tagName)) return true;
    const className = current.className;
    if (typeof className === "string" && /\bmermaid-(wrapper|source)\b/.test(className)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

// Replaces an element with one of another tag, carrying the children across as
// the same nodes rather than as copies. That is what keeps the caret alive: a
// selection points at a text node, and the text node survives the move even
// though its parent does not.
function retagElement(node, tagName) {
  const replacement = document.createElement(tagName);
  for (const child of Array.from(node.childNodes)) replacement.appendChild(child);
  node.parentNode.replaceChild(replacement, node);
  return replacement;
}

function unwrapElement(node) {
  const parent = node.parentNode;
  for (const child of Array.from(node.childNodes)) parent.insertBefore(child, node);
  parent.removeChild(node);
}

function styleTagFor(node) {
  const style = node.getAttribute && node.getAttribute("style");
  if (!style) return null;
  for (const [pattern, tag] of STYLE_TO_TAG) {
    if (pattern.test(style)) return tag;
  }
  return null;
}

// Depth-first, children before parents, over a snapshot at each level: a visit
// may remove the node it is given, and unwrapping an inner span can be what
// makes its parent worth unwrapping too.
function eachElement(root, visit) {
  for (const child of Array.from(root.children || [])) {
    if (child.nodeType !== 1) continue;
    eachElement(child, visit);
    visit(child);
  }
}

/**
 * Fix what the engines disagree about, in the document itself.
 *
 * Returns whether anything changed, which the caller needs: the DOM is being
 * edited behind the back of the `input` event execCommand already dispatched.
 */
function normaliseEditorMarkup(root) {
  let changed = false;

  eachElement(root, (node) => {
    if (isProtectedNode(node)) return;

    // A <font> tag is the same problem in older clothes, and arrives by paste
    // from mail clients rather than from any command.
    if (node.tagName === "SPAN" || node.tagName === "FONT") {
      const tag = styleTagFor(node);
      if (tag) {
        retagElement(node, tag);
        changed = true;
        return;
      }
      // A span with no markdown behind it. Keep the text, drop the wrapper.
      if (node.tagName === "FONT" || node.getAttribute("style")) {
        unwrapElement(node);
        changed = true;
      }
      return;
    }

    // A paragraph or heading with a list inside it. Chrome answers
    // insertUnorderedList with <p><ul>…</ul></p>, and formatBlock run with the
    // caret in a bullet with <h1><ul>…</ul></h1> — the entire list wrapped in a
    // heading. Both are invalid nesting that the HTML parser will take apart
    // differently on the next reload, and the second one is destructive: the
    // list stops being a list.
    //
    // Unwrapping makes the command a no-op, and a no-op is the *wanted*
    // behaviour rather than a fallback: a heading inside a bullet is not
    // something the editor should offer a way to make by accident. Firefox
    // still puts the <h1> inside the <li>, so the two engines currently
    // disagree about whether the button does anything. Settling that means
    // refusing it in applyFormat, where the selection still exists — normalise
    // cannot see which item the caret was in. TODO 5.1, deferred to 1.4.
    if (UNWRAPPABLE_AROUND_LIST.has(node.tagName) && holdsListChild(node)) {
      unwrapElement(node);
      changed = true;
      return;
    }

    // An <li> directly inside another <li>, with no list between them — what
    // Chrome's outdent leaves behind. Turndown reads it as one item, so the
    // second bullet is swallowed into the first on save.
    if (node.tagName === "LI" && node.parentElement && node.parentElement.tagName === "LI") {
      const parent = node.parentElement;
      parent.removeChild(node);
      parent.insertAdjacentElement("afterend", node);
      changed = true;
      return;
    }

    // Chrome stamps id="null" on a rule inserted with no id. Harmless in
    // markdown, which carries no attributes, but it travels into the HTML
    // exports and it is not something the author wrote.
    if (node.tagName === "HR" && node.getAttribute && node.getAttribute("id") === "null") {
      node.removeAttribute("id");
      changed = true;
      return;
    }

    // Both engines put the nested list beside the item it belongs to rather
    // than inside it — this one is not a Chrome quirk, it is what the dead
    // spec's shared legacy does. A list that is a direct child of another list
    // serialises as a flat list, since Turndown has no indent to give it, so
    // the nesting the user just asked for is lost on save with the document
    // looking right on screen either side of it.
    if (node.tagName === "UL" || node.tagName === "OL") {
      const parent = node.parentElement;
      if (!parent || (parent.tagName !== "UL" && parent.tagName !== "OL")) return;
      const previous = node.previousElementSibling;
      if (!previous || previous.tagName !== "LI") return;
      parent.removeChild(node);
      previous.appendChild(node);
      changed = true;
    }
  });

  return changed;
}

/**
 * Run a command and clean up after it. Every execCommand in `front/` that
 * changes the document goes through here — the boundary is enforced by a source
 * scan in the execcommand suite, because the way this regresses is not a broken
 * normalisation but a new call site that never reaches it.
 */
function runCommand(command, value = null) {
  const result = document.execCommand(command, false, value);

  // execCommand dispatches `input` synchronously, before this line, so every
  // listener has already seen the un-normalised document. Autosave and the
  // dirty flag do not care — they will read it again. The undo stack does: it
  // took its snapshot during that event, and would hand back the markup we are
  // about to fix. Refreshing the snapshot corrects it in place rather than
  // pushing a second step, so one action is still one Ctrl+Z.
  if (normaliseEditorMarkup(editor) && typeof undoRefresh === "function") {
    undoRefresh();
  }

  return result;
}
