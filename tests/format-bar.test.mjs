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
}
