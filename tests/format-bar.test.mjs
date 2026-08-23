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

  // Even a whole bullet: a <pre> in place of an <li> is invalid markup, and the
  // nested-fence version is a separate feature with a save question behind it.
  c = codeCase((editor) => {
    const { ul, lis } = list(editor, ["first"]);
    return {
      commonAncestorContainer: textIn(lis[0]),
      intersectsNode: (n) => n === lis[0] || n === ul,
      toString: () => "first",
      collapsed: false,
    };
  });
  check("selecting a whole bullet does not swap it for a <pre>", !c.tag("PRE"));
  check("it gets inline code instead",
    c.inserted.length === 1 && c.inserted[0].tagName === "CODE");

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
}
