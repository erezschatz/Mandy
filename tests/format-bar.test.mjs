// Regression tests for the bug that replaced #editor with an <h1>/<ul>/<pre>.
//
// applyFormat used to resolve its target to the editable root whenever the
// selection's common ancestor was the editor — any multi-line selection, or
// bare text at the root after Clear — and then replaceChild swapped #editor out
// of the document. The page lost its styling and contenteditable, every module
// was left holding a detached node, and only a reload recovered it.

import { loadSource, makeEl, makeText } from "./dom.mjs";

// Every format is a model command now, so what applyFormat owes is the right
// command for each format, the selection check in front of it, and never
// touching #editor itself. The model commands are stood in for by recorders:
// what they do to a document is the `model` and `model-input` suites' business,
// and the browser specs'. `model: false` is a bundle without model-input.js.
function scenario(format, buildSelection, { model = true } = {}) {
  const container = makeEl();
  const editor = makeEl("div", { parent: container });
  const p1 = makeEl("p", { parent: editor, text: "line one" });
  const p2 = makeEl("p", { parent: editor, text: "line two" });

  const commands = [];
  const recorders = model
    ? {
      modelInputFormat: (mark) => commands.push(`mark:${mark}`),
      modelInputBlockFormat: (tag) => commands.push(`block:${tag}`),
      modelInputList: (ordered) => commands.push(`list:${ordered ? "ol" : "ul"}`),
      modelInputQuote: () => commands.push("quote"),
      modelInputCode: () => commands.push("code"),
    }
    : {};
  loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
      },
      ...recorders,
      window: { addEventListener() {}, getSelection: () => buildSelection(editor, p1, p2) },
      editor,
      formatBar: { classList: { remove() {}, add() {} } },
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      // The Format menu reaches applyFormat through these registrations; this
      // suite drives applyFormat directly and only needs them not to throw.
      onToolbarAction: () => {},
      onMenuOpen: () => {},
      __format: format,
    },
    "; applyFormat(__format);",
  );

  return { container, editor, commands };
}

// Where the bar lands for a selection at `rect`. The bar is positioned
// absolute, so `top` is in document coordinates and `left` is not.
//
// Two sticky elements, not one: `.tab-bar` is a sibling of `.toolbar` rather
// than a row inside it, so the band the bar must stay clear of is the sum.
// `tabBarHeight: 0` is the exported document, which ships no tab bar.
function position({
  rect,
  scrollTop = 0,
  windowWidth = 1000,
  toolbarHeight = 69,
  tabBarHeight = 36,
  barWidth = 300,
  barHeight = 40,
}) {
  const editor = makeEl();
  const chrome = {
    ".toolbar": toolbarHeight,
    ".tab-bar": tabBarHeight,
  };
  const chromeEl = (height) => {
    const el = makeEl();
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height });
    return el;
  };

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

  // Recorded rather than ignored: the bar hides on the page's own scroll, and a
  // listener the module registers is the only handle the suite has on that.
  const listeners = [];

  const result = loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        querySelector: (sel) => (sel in chrome ? chromeEl(chrome[sel]) : null),
        querySelectorAll: () => [],
        addEventListener() {},
        documentElement: { clientWidth: windowWidth, scrollTop },
      },
      window: {
        addEventListener: (type, fn) => listeners.push({ type, fn }),
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
      onMenuOpen: () => {},
      __bar: bar,
      __width: barWidth,
      __window: windowWidth,
    },
    "; showFormatBar(); return { left: parseFloat(__bar.style.left)," +
      " top: parseFloat(__bar.style.top), width: __width, windowWidth: __window," +
      " visible: __bar.classList.contains('visible') };",
  );

  return {
    ...result,
    isVisible: () => bar.classList.contains("visible"),
    scroll: () => {
      for (const l of listeners) if (l.type === "scroll") l.fn();
    },
  };
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
      },
      window: {
        addEventListener() {},
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
      onMenuOpen: () => {},
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

// Drives the Format menu's open hook the same way: the handler format-bar.js
// registers through onMenuOpen is captured and run against a menu holding the
// three checkable items, with the old core answering from the DOM.
function menuCase(build) {
  const { editor, touched } = build();
  const items = {};
  for (const format of ["bold", "italic", "strikethrough", "code", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "quote"]) {
    items[format] = makeEl("button");
  }
  let opened = null;
  loadSource(
    "format-bar.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
      },
      window: {
        addEventListener() {},
        getSelection: () => ({
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt: () => ({ intersectsNode: (n) => touched.includes(n), commonAncestorContainer: editor }),
        }),
      },
      editor: Object.assign(editor, { contains: () => true }),
      formatBar: { classList: { remove() {}, add() {} } },
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      onToolbarAction: () => {},
      onMenuOpen: (id, handler) => { if (id === "formatMenu") opened = handler; },
    },
  );
  opened({
    querySelector: (sel) => items[(sel.match(/format-([a-z0-9]+)/) || [])[1]] || null,
    querySelectorAll: () => [],
  });
  return (format) => items[format].attrs["aria-pressed"];
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
        documentElement: { clientWidth: windowWidth, scrollTop: 0 },
      },
      window: { addEventListener() {}, pageYOffset: 0, getSelection: () => selection },
      editor,
      formatBar: bar,
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
      onToolbarAction: () => {},
      onMenuOpen: () => {},
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

  // Each format reaches its model command, and only that one.
  for (const [format, command] of [
    ["h1", "block:h1"], ["h2", "block:h2"], ["h6", "block:h6"], ["p", "block:p"],
    ["ul", "list:ul"], ["ol", "list:ol"], ["quote", "quote"], ["code", "code"],
    ["bold", "mark:strong"], ["italic", "mark:em"], ["strikethrough", "mark:strike"],
  ]) {
    const { commands } = scenario(format, multiBlock);
    check(`${format} is the model's ${command}`, commands.length === 1 && commands[0] === command);
  }
  // A bundle without the input layer has nothing to format with, and does
  // nothing rather than editing the DOM behind a model that is not there.
  const bare = scenario("h1", multiBlock, { model: false });
  check("without model-input.js a format does nothing to the editor",
    bare.commands.length === 0 && bare.editor.children.length === 2 &&
      bare.editor.children.every((c) => c.tagName === "P"));

  const outside = scenario("h1", outsideEditor);
  check("selection outside the editor is ignored",
    outside.commands.length === 0 && !outside.container.replaced);
  // TODO 1.1.5: refused before the model is asked, where the selection still
  // exists.
  const inItem = scenario("h2", (editor) => {
    const ul = makeEl("ul", { parent: editor });
    const li = makeEl("li", { parent: ul, text: "item" });
    return { rangeCount: 1, isCollapsed: true, getRangeAt: () => ({ commonAncestorContainer: textIn(li) }) };
  });
  check("a heading in a list item is refused", inItem.commands.length === 0);

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

  // The chrome is sticky, so "on screen" is not enough — the top 105px of the
  // viewport is behind it, 69 of toolbar and 36 of tab strip.
  p = position({ rect: { left: 400, width: 100, top: 100, bottom: 120 } });
  check("the bar never lands behind the sticky chrome", p.top >= 105);

  // The case the tab strip added, and the one a toolbar-only clearance got
  // wrong: 80 is clear of the toolbar and squarely on top of the tab bar, which
  // the bar wins on z-index. So it flips below the selection instead.
  p = position({ rect: { left: 400, width: 100, top: 130, bottom: 150 } });
  check("the tab strip counts too: no room above is no room", p.top === 160);

  // Measured rather than assumed — an exported document ships no tab bar, and
  // the same selection has room above it there.
  p = position({ rect: { left: 400, width: 100, top: 130, bottom: 150 }, tabBarHeight: 0 });
  check("with no tab bar the same selection has room above it", p.top === 80);

  p = position({ rect: { left: 400, width: 100, top: 300, bottom: 320 }, scrollTop: 500 });
  check("top is a document coordinate, so it carries the scroll", p.top === 750);

  // Which is exactly why a scroll has to take the bar away: absolute in
  // document coordinates means it rides the text off the top of the window and
  // over the chrome on the way. The next selectionchange brings it back.
  p = position({ rect: { left: 400, width: 100, top: 300, bottom: 320 } });
  check("the bar is up before the scroll", p.isVisible());
  p.scroll();
  check("and a scroll hides it rather than carrying it off screen", !p.isVisible());

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

  // The Format menu says which marks the selection has, stamped as it opens.
  let pressed = menuCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const strong = makeEl("strong", { parent: p });
    const t = appendText(strong, "hello world");
    return { editor, touched: [t] };
  });
  check("the Format menu checks Bold for a fully bold selection", pressed("bold") === "true");
  check("and leaves Italic unchecked", pressed("italic") === "false");
  pressed = menuCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const plain = appendText(p, "hello ");
    const strong = makeEl("strong", { parent: p });
    const bold = appendText(strong, "world");
    return { editor, touched: [plain, bold] };
  });
  check("and marks Bold as mixed for a selection only partly bold", pressed("bold") === "mixed");
  pressed = menuCase(() => {
    const editor = makeEl("div");
    const p = makeEl("p", { parent: editor });
    const code = makeEl("code", { parent: p });
    const t = appendText(code, "npm test");
    return { editor, touched: [t] };
  });
  check("and checks Code for a selection inside a code span", pressed("code") === "true");
  check("without claiming Bold for it", pressed("bold") === "false");
  // The block formats are checked too: the selection is in a heading, a list
  // or a quote, which is not plain text, and the menu says so.
  pressed = menuCase(() => {
    const editor = makeEl("div");
    const quote = makeEl("blockquote", { parent: editor });
    const ul = makeEl("ul", { parent: quote });
    const li = makeEl("li", { parent: ul });
    const t = appendText(li, "a quoted bullet");
    return { editor, touched: [t] };
  });
  check("the Format menu checks Blockquote and Bullet list for a bullet in a quote",
    pressed("quote") === "true" && pressed("ul") === "true" && pressed("ol") === "false" && pressed("h1") === "false");
  pressed = menuCase(() => {
    const editor = makeEl("div");
    const h = makeEl("h5", { parent: editor });
    const t = appendText(h, "small heading");
    return { editor, touched: [t] };
  });
  check("and the heading's own level, even one only the menu offers",
    pressed("h5") === "true" && pressed("h2") === "false" && pressed("quote") === "false");

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
