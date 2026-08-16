// Regression tests for the bug that replaced #editor with an <h1>/<ul>/<pre>.
//
// applyFormat used to resolve its target to the editable root whenever the
// selection's common ancestor was the editor — any multi-line selection, or
// bare text at the root after Clear — and then replaceChild swapped #editor out
// of the document. The page lost its styling and contenteditable, every module
// was left holding a detached node, and only a reload recovered it.

import { loadSource, makeEl } from "./dom.mjs";

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
      window: { getSelection: () => buildSelection(editor, p1, p2) },
      editor,
      formatBar: { classList: { remove() {}, add() {} } },
      localStorage: { setItem() {} },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      setTimeout: () => {},
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
}
