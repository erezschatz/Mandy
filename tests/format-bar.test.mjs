// Regression tests for the bug that replaced #editor with an <h1>/<ul>/<pre>.
//
// applyFormat used to resolve its target to the editable root whenever the
// selection's common ancestor was the editor — any multi-line selection, or
// bare text at the root after Clear — and then replaceChild swapped #editor out
// of the document. The page lost its styling and contenteditable, every module
// was left holding a detached node, and only a reload recovered it.

import { loadSource, makeEl, makeText } from "./dom.mjs";

function scenario(format, buildSelection) {
  const container = makeEl();
  const editor = makeEl("div", { parent: container });
  const p1 = makeEl("p", { parent: editor, text: "line one" });
  const p2 = makeEl("p", { parent: editor, text: "line two" });

  const commands = [];
  loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        execCommand: (cmd, _ui, val) => commands.push(val ? `${cmd}:${val}` : cmd),
      },
      runCommand: (cmd, val) => commands.push(val ? `${cmd}:${val}` : cmd),

      window: { getSelection: () => buildSelection(editor, p1, p2) },
      editor,
      formatBar: { classList: { remove() {}, add() {} } },
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      // The Format menu reaches applyFormat through these registrations; this
      // suite drives applyFormat directly and only needs them not to throw.
      onToolbarAction: () => {},
      __format: format,
    },
    "; applyFormat(__format);",
  );

  return { container, editor, commands };
}

// Where the bar lands for a selection at `rect`. The bar is positioned
// absolute, so `top` is in document coordinates and `left` is not.
function position({
  rect,
  scrollTop = 0,
  windowWidth = 1000,
  toolbarHeight = 69,
  barWidth = 300,
  barHeight = 40,
}) {
  const editor = makeEl();
  const toolbar = makeEl();
  toolbar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: toolbarHeight });

  // app.css keeps the bar display: none until .visible, and a hidden element
  // measures 0×0 — so the stub measures 0 until the class is added, the way the
  // browser does. Positioning that reads the size too early is the whole bug
  // the checks below exist for.
  const bar = makeEl();
  let visible = false;
  bar.classList = {
    add: (name) => {
      if (name === "visible") visible = true;
    },
    remove: () => {
      visible = false;
    },
    contains: () => visible,
  };
  Object.defineProperty(bar, "offsetWidth", { get: () => (visible ? barWidth : 0) });
  Object.defineProperty(bar, "offsetHeight", { get: () => (visible ? barHeight : 0) });

  return loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        querySelector: (sel) => (sel === ".toolbar" ? toolbar : null),
        querySelectorAll: () => [],
        addEventListener() {},
        execCommand() {},
        documentElement: { clientWidth: windowWidth, scrollTop },
      },
      window: {
        pageYOffset: scrollTop,
        getSelection: () => ({
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt: () => ({
            commonAncestorContainer: editor,
            getBoundingClientRect: () => rect,
          }),
        }),
      },
      editor,
      formatBar: bar,
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      // The Format menu reaches applyFormat through these registrations; this
      // suite drives applyFormat directly and only needs them not to throw.
      onToolbarAction: () => {},
      __bar: bar,
      __width: barWidth,
      __window: windowWidth,
    },
    "; showFormatBar(); return { left: parseFloat(__bar.style.left)," +
      " top: parseFloat(__bar.style.top), width: __width, windowWidth: __window," +
      " visible: __bar.classList.contains('visible') };",
  );
}

const multiBlock = (editor, p1, p2) => ({
  rangeCount: 1,
  getRangeAt: () => ({
    commonAncestorContainer: editor,
    intersectsNode: (n) => n === p1 || n === p2,
  }),
});

const bareText = (editor) => ({
  rangeCount: 1,
  getRangeAt: () => ({
    commonAncestorContainer: { nodeType: 3, parentElement: editor },
    intersectsNode: () => true,
  }),
});

const outsideEditor = () => ({
  rangeCount: 1,
  getRangeAt: () => ({
    commonAncestorContainer: makeEl("p"), // detached, not in the editor
    intersectsNode: () => true,
  }),
});


// Code is the only format that reads the *extent* of the selection rather than
// just its position, so it needs a tree and a range built per case rather than
// the fixed two-paragraph document `scenario` sets up.
function codeCase(build) {
  const container = makeEl();
  const editor = makeEl("div", { parent: container });
  const inserted = [];
  const inputs = [];
  const notices = [];
  editor.addEventListener("input", () => inputs.push(1));

  const range = build(editor);
  range.deleteContents ||= () => {};
  range.insertNode ||= (node) => inserted.push(node);

  loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        createTextNode: makeText,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        execCommand() {},
      },
      runCommand: () => true,
      window: { getSelection: () => ({ rangeCount: 1, getRangeAt: () => range }) },
      editor,
      formatBar: { classList: { remove() {}, add() {} } },
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      onToolbarAction: () => {},
      notify: (message) => notices.push(message),
    },
    "; applyFormat('code');",
  );

  const all = [];
  (function walk(node) {
    for (const child of node.children || []) {
      if (child.nodeType !== 1) continue;
      all.push(child);
      walk(child);
    }
  })(editor);

  return { editor, inserted, inputs, notices, tag: (t) => all.find((n) => n.tagName === t) };
}

// A text node inside `block`, which is what a real selection's containers are.
function textIn(block) {
  const node = makeText(block.textContent);
  node.parentElement = block;
  return node;
}

// A real text node child, unlike textIn's detached one — updateActiveButtons
// walks down from #editor to find these, so a node the tree cannot reach is a
// node the fix under test can never see.
function appendText(parent, str) {
  const node = makeText(str);
  node.parentElement = parent;
  parent.children.push(node);
  return node;
}

// A classList that actually remembers what was added, unlike dom.mjs's default
// no-op — the whole point here is reading back which state a button ended up
// in.
function trackedClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    contains: (n) => set.has(n),
  };
}

const FORMATS = ["p", "h1", "h2", "h3", "bold", "italic", "strikethrough", "ul", "ol", "code"];

// Drives updateActiveButtons directly. `build` returns the editor tree and the
// text nodes the selection touches — passed straight to a stub range's
// intersectsNode, since a text node's own formatting cannot be partial, so
// per-text-node is the right (and simplest) granularity to fake a selection
// at.
function activeCase(build) {
  const { editor, touched } = build();
  const buttons = {};
  for (const format of FORMATS) {
    const btn = makeEl("button");
    btn.attrs["data-format"] = format;
    btn.classList = trackedClassList();
    buttons[format] = btn;
  }

  loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        querySelector: (sel) => {
          const m = sel.match(/data-format="([a-z0-9]+)"/);
          return (m && buttons[m[1]]) || null;
        },
        querySelectorAll: (sel) => (sel === ".format-btn" ? Object.values(buttons) : []),
        addEventListener() {},
        execCommand() {},
      },
      runCommand: () => {},
      window: {
        getSelection: () => ({
          rangeCount: 1,
          getRangeAt: () => ({ intersectsNode: (n) => touched.includes(n) }),
        }),
      },
      editor,
      formatBar: { classList: { remove() {}, add() {} } },
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      onToolbarAction: () => {},
    },
    "; updateActiveButtons();",
  );

  return {
    state: (format) => {
      const cl = buttons[format].classList;
      if (cl.contains("active")) return "active";
      if (cl.contains("mixed")) return "mixed";
      return "none";
    },
  };
}

// Drives showFormatBar at a bare caret, against a bar carrying the same
// children index.html ships — four block buttons, a rule, the three inline
// ones, a rule, then the lists and code. Built rather than listed because both
// halves under test are about that shape: which buttons a mode drops, and
// which rules are left dividing nothing once it has.
const BAR_ITEMS = ["p", "h1", "h2", "h3", null, "bold", "italic", "strikethrough",
  null, "ul", "ol", "code"];

function caretCase(build, { windowWidth = 1000, toolbarHeight = 69, barWidth = 200, barHeight = 40 } = {}) {
  const editor = makeEl("div");
  const toolbar = makeEl();
  toolbar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: toolbarHeight });

  const bar = makeEl();
  let visible = false;
  bar.classList = {
    add: (name) => {
      if (name === "visible") visible = true;
    },
    remove: () => {
      visible = false;
    },
    contains: () => visible,
  };
  Object.defineProperty(bar, "offsetWidth", { get: () => (visible ? barWidth : 0) });
  Object.defineProperty(bar, "offsetHeight", { get: () => (visible ? barHeight : 0) });

  const buttons = {};
  const separators = [];
  for (const format of BAR_ITEMS) {
    const el = makeEl(format ? "button" : "div", { parent: bar });
    el.classList = trackedClassList();
    if (format) {
      el.setAttribute("data-format", format);
      buttons[format] = el;
    } else {
      separators.push(el);
    }
  }

  const selection = build(editor);

  loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        querySelector: (sel) => {
          if (sel === ".toolbar") return toolbar;
          const m = sel.match(/data-format="([a-z0-9]+)"/);
          return (m && buttons[m[1]]) || null;
        },
        querySelectorAll: (sel) => (sel === ".format-btn" ? Object.values(buttons) : []),
        addEventListener() {},
        execCommand() {},
        documentElement: { clientWidth: windowWidth, scrollTop: 0 },
      },
      runCommand: () => {},
      window: { pageYOffset: 0, getSelection: () => selection },
      editor,
      formatBar: bar,
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      onToolbarAction: () => {},
    },
    "; showFormatBar();",
  );

  return {
    visible,
    left: parseFloat(bar.style.left),
    top: parseFloat(bar.style.top),
    shown: BAR_ITEMS.filter((f) => f && !buttons[f].hidden),
    rules: separators.filter((s) => !s.hidden).length,
    // Where the visible rule sits, counted in visible buttons before it: the
    // question is not just "one rule" but "one rule in the right place".
    ruleAfter: (() => {
      let count = 0;
      for (const item of bar.children) {
        const format = item.getAttribute("data-format");
        if (format) {
          if (!item.hidden) count++;
        } else if (!item.hidden) return count;
      }
      return -1;
    })(),
    state: (format) => {
      const cl = buttons[format].classList;
      if (cl.contains("active")) return "active";
      if (cl.contains("mixed")) return "mixed";
      return "none";
    },
  };
}

// A collapsed selection parked at `container`/`offset`. `rect` is what the
// range measures — zero-height stands for the empty-block case, where engines
// give a caret no line box to hang off.
function caretAt(container, offset, rect = { left: 120, top: 300, bottom: 320, width: 0, height: 20 }) {
  return {
    rangeCount: 1,
    isCollapsed: true,
    getRangeAt: () => ({
      startContainer: container,
      startOffset: offset,
      commonAncestorContainer: container,
      getBoundingClientRect: () => rect,
    }),
  };
}

export default function run(check) {
  for (const [label, selection] of [
    ["multi-line selection", multiBlock],
    ["bare text at editor root", bareText],
  ]) {
    for (const format of ["h1", "ul", "code"]) {
      const { container, editor } = scenario(format, selection);
      const destroyed = container.replaced && container.replaced.oldNode === editor;
      check(`${label} + "${format}" leaves #editor intact`, !destroyed);
    }
  }

  // Headings and lists go through execCommand, which works inside the editable
  // root rather than on it, and spans multi-block selections natively.
  check("h1 issues formatBlock", scenario("h1", multiBlock).commands[0] === "formatBlock:<h1>");
  check("h2 issues formatBlock", scenario("h2", multiBlock).commands[0] === "formatBlock:<h2>");
  check("p issues formatBlock", scenario("p", multiBlock).commands[0] === "formatBlock:<p>");
  check("ul issues insertUnorderedList",
    scenario("ul", multiBlock).commands[0] === "insertUnorderedList");
  check("ol issues insertOrderedList",
    scenario("ol", multiBlock).commands[0] === "insertOrderedList");
  check("bold issues bold", scenario("bold", multiBlock).commands[0] === "bold");
  check("strikethrough issues strikeThrough",
    scenario("strikethrough", multiBlock).commands[0] === "strikeThrough");

  // Code is the one hand-rolled format: no execCommand equivalent exists.
  const { editor } = scenario("code", multiBlock);
  const pre = editor.children.find((c) => c.tagName === "PRE");
  check("code builds a <pre> inside the editor", !!pre);
  check("code folds both selected lines in",
    pre && pre.children[0].textContent === "line one\nline two");
  check("code removes the absorbed block", editor.children.length === 1);

  const outside = scenario("h1", outsideEditor);
  check("selection outside the editor is ignored",
    outside.commands.length === 0 && !outside.container.replaced);

  // --- staying inside the window -------------------------------------------
  //
  // The bar used to take the selection rect verbatim, so it went off the top on
  // the first line of the document and off the right edge on a selection near
  // the margin — visible in neither case, and unreachable in both.

  let p = position({ rect: { left: 400, width: 100, top: 300, bottom: 320 } });
  check("the bar ends up visible", p.visible);
  check("centred on the selection when there is room", p.left === 300);
  // A bar measured while still display: none has no height to sit above, so it
  // lands on top of the selection instead — at 290 rather than 250.
  check("and sits above it, clear of the text", p.top === 250);

  p = position({ rect: { left: 950, width: 40, top: 300, bottom: 320 } });
  check("a selection at the right margin keeps the bar in the window",
    p.left + p.width <= p.windowWidth);

  p = position({ rect: { left: 0, width: 20, top: 300, bottom: 320 } });
  check("a selection at the left margin keeps the bar in the window", p.left >= 0);

  // Wider than the window: the clamp has no valid range left, and must not
  // invert into something worse than either edge.
  p = position({ rect: { left: 400, width: 100, top: 300, bottom: 320 }, barWidth: 1200 });
  check("a bar wider than the window pins to the left edge", p.left === 8);

  p = position({ rect: { left: 400, width: 100, top: 10, bottom: 30 } });
  check("no room above: the bar flips below the selection", p.top === 40);

  // The toolbar is sticky, so "on screen" is not enough — the top 69px of the
  // viewport is behind it.
  p = position({ rect: { left: 400, width: 100, top: 100, bottom: 120 } });
  check("the bar never lands behind the sticky toolbar", p.top >= 69);

  p = position({ rect: { left: 400, width: 100, top: 300, bottom: 320 }, scrollTop: 500 });
  check("top is in document coordinates, so scrolling carries it", p.top === 750);

  // --- block versus inline ---------------------------------------------------
  //
  // Code was the one format reaching only half of what markdown offers. There
  // is no execCommand for either kind, so the choice between them had to be
  // made here — and it was made once, at load, in favour of the block.

  const para = (editor) => {
    const p = makeEl("p", { parent: editor, text: "line one" });
    return { p };
  };

  let c = codeCase((editor) => {
    const { p } = para(editor);
    return {
      commonAncestorContainer: textIn(p),
      intersectsNode: (n) => n === p,
      toString: () => "line",
      collapsed: false,
    };
  });
  check("a partial selection makes inline code, not a block", !c.tag("PRE"));
  check("and the inline code holds only what was selected",
    c.inserted.length === 1 && c.inserted[0].tagName === "CODE" &&
      c.inserted[0].textContent === "line");

  c = codeCase((editor) => {
    const { p } = para(editor);
    return {
      commonAncestorContainer: textIn(p),
      intersectsNode: (n) => n === p,
      toString: () => "line one",
      collapsed: false,
    };
  });
  check("selecting the whole line still makes a block", !!c.tag("PRE"));

  // A caret is a position, not an extent. Every other block format acts on the
  // whole block from one, so Code doing otherwise would read as broken.
  c = codeCase((editor) => {
    const { p } = para(editor);
    return {
      commonAncestorContainer: textIn(p),
      intersectsNode: (n) => n === p,
      toString: () => "",
      collapsed: true,
    };
  });
  check("a bare caret still makes a block", !!c.tag("PRE"));

  // The destructive one. blocksInRange answered with editor.children, so a
  // selection in one bullet reported the whole <ul> — and Code replaced the
  // list with a single <pre> holding every item run together.
  // A range inside an <li> intersects the <ul> too — that is the whole reason
  // editor.children was the wrong answer, so a stub range that reports only the
  // <li> would quietly excuse the bug it is meant to catch.
  const list = (editor, items) => {
    const ul = makeEl("ul", { parent: editor, text: items.join("") });
    const lis = items.map((t) => makeEl("li", { parent: ul, text: t }));
    return { ul, lis };
  };

  c = codeCase((editor) => {
    const { ul, lis } = list(editor, ["first", "second"]);
    return {
      commonAncestorContainer: textIn(lis[0]),
      intersectsNode: (n) => n === lis[0] || n === ul,
      toString: () => "fir",
      collapsed: false,
    };
  });
  check("a selection inside a bullet leaves the list standing", !c.tag("PRE"));
  check("and the list keeps both its items",
    c.tag("UL") && c.tag("UL").children.filter((n) => n.tagName === "LI").length === 2);
  check("and the bullet gets inline code",
    c.inserted.length === 1 && c.inserted[0].tagName === "CODE");

  // A whole bullet nests its fence inside the <li> rather than swapping the
  // <li> itself out — that would be invalid markup — or falling back to inline.
  c = codeCase((editor) => {
    const { ul, lis } = list(editor, ["first"]);
    return {
      commonAncestorContainer: textIn(lis[0]),
      intersectsNode: (n) => n === lis[0] || n === ul,
      toString: () => "first",
      collapsed: false,
    };
  });
  check("selecting a whole bullet gets a nested <pre>", !!c.tag("PRE"));
  check("the <pre> lives inside the <li>, not in place of it",
    c.tag("PRE") && c.tag("PRE").parentNode.tagName === "LI");
  check("the list item survives",
    c.tag("UL") && c.tag("UL").children.filter((n) => n.tagName === "LI").length === 1);
  check("and nothing goes through inline code", c.inserted.length === 0);

  // A caret in an otherwise-empty bullet counts as the whole block too, same
  // as every other block format.
  c = codeCase((editor) => {
    const { ul, lis } = list(editor, ["only"]);
    return {
      commonAncestorContainer: textIn(lis[0]),
      intersectsNode: (n) => n === lis[0] || n === ul,
      toString: () => "",
      collapsed: true,
    };
  });
  check("a bare caret in a bullet also nests a <pre>", !!c.tag("PRE"));

  // Toggling back off: the <pre> comes out and the li's own text returns,
  // rather than the top-level revert's <p> wrapper — a bullet never had one.
  c = codeCase((editor) => {
    const { ul, lis } = list(editor, [""]);
    const li = lis[0];
    const pre = makeEl("pre", { parent: li });
    const code = makeEl("code", { parent: pre, text: "already" });
    return {
      commonAncestorContainer: textIn(code),
      intersectsNode: (n) => n === li || n === ul || n === pre,
      toString: () => "already",
      collapsed: false,
    };
  });
  check("code nested in a bullet unwraps back to the bullet", !c.tag("PRE"));
  check("no stray <p> wrapper is left behind", !c.tag("P"));

  // The original report: select the list, get one <pre> with every item run
  // together and the <ul> gone. Inline is not the fallback here — a code span
  // cannot cross a block boundary, and deleteContents would take the list apart
  // to build one — so it declines and says why.
  c = codeCase((editor) => {
    const { ul, lis } = list(editor, ["first", "second"]);
    return {
      commonAncestorContainer: ul,
      intersectsNode: (n) => n === ul || lis.includes(n),
      toString: () => "firstsecond",
      collapsed: false,
    };
  });
  check("selecting a whole list does not collapse it into a <pre>", !c.tag("PRE"));
  check("and the items survive",
    c.tag("UL") && c.tag("UL").children.filter((n) => n.tagName === "LI").length === 2);
  check("and nothing is inserted in their place", c.inserted.length === 0);
  check("and it says so rather than doing nothing quietly",
    /single block/.test(c.notices.at(-1) || ""));

  // Toggling back off, which is what makes it a format rather than a one-way
  // conversion.
  c = codeCase((editor) => {
    const p = makeEl("p", { parent: editor });
    const code = makeEl("code", { parent: p, text: "already" });
    return {
      commonAncestorContainer: textIn(code),
      intersectsNode: (n) => n === p,
      toString: () => "already",
      collapsed: false,
    };
  });
  check("code inside an existing span unwraps it",
    c.tag("P").replaced && c.tag("P").replaced.oldNode.tagName === "CODE");
  check("and puts the text back", 
    c.tag("P").replaced && c.tag("P").replaced.newNode.textContent === "already");

  // The hand-rolled branch raises no input event of its own, and autosave, the
  // dirty flag, the outline and the undo stack all hang off that one event. A
  // code block used to be invisible to Ctrl+Z for exactly this reason.
  c = codeCase((editor) => {
    const { p } = para(editor);
    return {
      commonAncestorContainer: textIn(p),
      intersectsNode: (n) => n === p,
      toString: () => "line one",
      collapsed: false,
    };
  });
  check("formatting as code announces itself with an input event", c.inputs.length === 1);

  // --- the whole selection, not just where it started ----------------------
  //
  // updateActiveButtons used to walk up from selection.anchorNode alone, so a
  // selection covering both bold and plain text lit the Bold button up or left
  // it dark purely on which end of the drag the browser calls the anchor —
  // never mind that neither answer describes the selection. Every case below
  // hands the stub range a fixed list of "touched" text nodes rather than an
  // anchor, since that is the granularity the fix actually operates at.

  let r = activeCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const strong = makeEl("strong", { parent: p });
    const t = appendText(strong, "hello world");
    return { editor, touched: [t] };
  });
  check("fully bold text reads active", r.state("bold") === "active");
  check("its paragraph reads active too", r.state("p") === "active");
  check("and it does not also claim italic", r.state("italic") === "none");

  r = activeCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const s = makeEl("s", { parent: p });
    const t = appendText(s, "struck");
    return { editor, touched: [t] };
  });
  check("fully struck-through text reads active", r.state("strikethrough") === "active");
  check("and it does not also claim bold", r.state("bold") === "none");

  r = activeCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const plain = appendText(p, "hello ");
    const strong = makeEl("strong", { parent: p });
    const bold = appendText(strong, "world");
    return { editor, touched: [plain, bold] };
  });
  check(
    "a selection spanning bold and plain text reads mixed, not active or none",
    r.state("bold") === "mixed",
  );

  // The anchor is wherever the drag started, which can be either end — so the
  // old check's answer for this exact selection depended on drag direction.
  // The fix does not have an anchor to be fooled by.
  r = activeCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const strong = makeEl("strong", { parent: p });
    const bold = appendText(strong, "world ");
    const plain = appendText(p, "and more");
    return { editor, touched: [bold, plain] };
  });
  check("mixed regardless of which end of the selection is bold",
    r.state("bold") === "mixed");

  r = activeCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const plain = appendText(p, "hello world");
    return { editor, touched: [plain] };
  });
  check("plain text reads none", r.state("bold") === "none");

  r = activeCase(() => {
    const editor = makeEl("div");
    const h1 = makeEl("h1", { parent: editor });
    const heading = appendText(h1, "Title");
    const p = makeEl("p", { parent: editor });
    const body = appendText(p, "body");
    return { editor, touched: [heading, body] };
  });
  check("a selection spanning a heading and a paragraph reads h1 mixed",
    r.state("h1") === "mixed");
  check("and reads p mixed too", r.state("p") === "mixed");

  r = activeCase(() => {
    const editor = makeEl("div");
    const ul = makeEl("ul", { parent: editor });
    const li = makeEl("li", { parent: ul });
    const t = appendText(li, "item");
    return { editor, touched: [t] };
  });
  check("a list item reads its list format active", r.state("ul") === "active");

  // A blank text node in range — the whitespace contenteditable leaves between
  // blocks — must not read as "an unformatted character" and drag an
  // otherwise-uniform selection down to mixed.
  r = activeCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const strong = makeEl("strong", { parent: p });
    const bold = appendText(strong, "hello");
    const blank = appendText(p, "  ");
    return { editor, touched: [bold, blank] };
  });
  check("a blank touched node does not turn active into mixed",
    r.state("bold") === "active");

  // --- the caret bar ---------------------------------------------------------
  //
  // The bar used to bail on isCollapsed, so "make this line an H3" with nothing
  // selected had no route but the Format menu. At a bare caret it is a row
  // control now — which is why it appears only at the start of a row, and only
  // for the formats that have a row to act on.

  const paragraphAt = (text, offset, rect) => (editor) => {
    const p = makeEl("p", { parent: editor });
    const node = appendText(p, text);
    return caretAt(node, offset, rect);
  };

  let k = caretCase(paragraphAt("line one", 0));
  check("a caret at the start of a row raises the bar", k.visible);

  k = caretCase(paragraphAt("line one", 4));
  check("a caret in the middle of a row does not", !k.visible);

  k = caretCase(paragraphAt("line one", 8));
  check("nor does one at the end of a row", !k.visible);

  // Whitespace ahead of the caret is still the start of the row: nothing on
  // screen tells it apart from nothing at all.
  k = caretCase(paragraphAt("   indented", 2));
  check("whitespace ahead of the caret still counts as the start", k.visible);

  // The caret is two elements deep but no text precedes it, which is what the
  // row-start question is actually asking.
  k = caretCase((editor) => {
    const p = makeEl("p", { parent: editor });
    const strong = makeEl("strong", { parent: p });
    const node = appendText(strong, "bold opener");
    return caretAt(node, 0);
  });
  check("a caret inside an inline element at the row's start still raises it",
    k.visible);

  k = caretCase((editor) => {
    const p = makeEl("p", { parent: editor });
    const strong = makeEl("strong", { parent: p });
    appendText(strong, "bold opener");
    const node = appendText(p, " and the rest");
    return caretAt(node, 0);
  });
  check("but not one after it, where text already precedes the caret", !k.visible);

  // The empty block the browser leaves after Enter. The container is the block
  // itself and the range measures nothing, so the block's own rect has to
  // stand in or the bar lands at the document origin.
  k = caretCase((editor) => {
    const p = makeEl("p", { parent: editor });
    p.getBoundingClientRect = () => ({ left: 64, top: 400, bottom: 424, width: 500, height: 24 });
    return caretAt(p, 0, { left: 0, top: 0, bottom: 0, width: 0, height: 0 });
  });
  check("an empty row raises the bar", k.visible);
  check("and it is placed from the row rather than the document origin",
    k.left === 64 && k.top === 400 - 40 - 10);

  // --- which buttons a caret gets -------------------------------------------

  k = caretCase(paragraphAt("line one", 0));
  check("the caret bar offers the block formats",
    k.shown.join(",") === "p,h1,h2,h3,ul,ol,code");
  check("and no inline one",
    !k.shown.includes("bold") && !k.shown.includes("italic") &&
      !k.shown.includes("strikethrough"));

  // Dropping the inline group leaves its two rules dividing nothing from
  // nothing. Both would render — the bar's separators are ordinary divs — as a
  // double gap where the buttons used to be.
  check("one rule survives, not the two the inline group sat between",
    k.rules === 1);
  check("and it divides the block formats from the lists", k.ruleAfter === 4);

  // Left-aligned to the row. Centring a zero-width rect would clamp the bar to
  // the window edge and leave it there whichever row the caret was in.
  check("the caret bar is left-aligned to the row", k.left === 120);

  // --- and what a selection still gets --------------------------------------

  k = caretCase((editor) => {
    const p = makeEl("p", { parent: editor });
    const node = appendText(p, "line one");
    return {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => ({
        startContainer: node,
        startOffset: 0,
        commonAncestorContainer: node,
        intersectsNode: () => true,
        getBoundingClientRect: () => ({ left: 400, top: 300, bottom: 320, width: 100 }),
      }),
    };
  });
  check("a selection still gets all ten formats", k.shown.length === 10);
  check("and both rules", k.rules === 2);
  check("and is still centred rather than left-aligned", k.left === 350);

  // --- active state at a caret ----------------------------------------------
  //
  // A collapsed range touches no text node, so the selection-side walk reports
  // nothing and every button would read dark — including the one naming the
  // block the caret is sitting in.

  k = caretCase((editor) => {
    const h1 = makeEl("h1", { parent: editor });
    const node = appendText(h1, "Title");
    return caretAt(node, 0);
  });
  check("a caret in a heading lights that heading", k.state("h1") === "active");
  check("and leaves the others dark", k.state("h2") === "none" && k.state("p") === "none");

  k = caretCase((editor) => {
    const ul = makeEl("ul", { parent: editor });
    const li = makeEl("li", { parent: ul });
    const node = appendText(li, "item");
    return caretAt(node, 0);
  });
  check("a caret in a bullet lights the bullet list", k.state("ul") === "active");

  // The empty row again: there is no text node for the caret to be in, so the
  // block itself has to answer for it.
  k = caretCase((editor) => {
    const h2 = makeEl("h2", { parent: editor });
    h2.getBoundingClientRect = () => ({ left: 64, top: 400, bottom: 424, width: 500, height: 24 });
    return caretAt(h2, 0, { left: 0, top: 0, bottom: 0, width: 0, height: 0 });
  });
  check("an empty heading still lights its own button", k.state("h2") === "active");
}
