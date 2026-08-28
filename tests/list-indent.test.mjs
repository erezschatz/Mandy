// Tab and Shift+Tab inside a list (app.js).
//
// Two things fail quietly here. First, Tab is the keyboard user's only way out
// of a contenteditable, so swallowing it anywhere but a list traps them in the
// document. Second, execCommand will happily produce nesting markdown cannot
// express — an indented first item, which Turndown writes as an indent that
// parses back as a code block — so the guards, not the commands, are the
// feature.

import { loadApp, makeEl } from "./dom.mjs";

function tabEvent({ shift = false, ctrl = false, alt = false, key = "Tab" } = {}) {
  return {
    key,
    shiftKey: shift,
    ctrlKey: ctrl,
    metaKey: false,
    altKey: alt,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

export default function run(check) {
  const { byId, commands, selection } = loadApp();
  const editor = byId.get("editor");
  const onKeydown = editor.listeners.keydown[0];

  // <ul><li>one</li><li>two</li></ul>, plus a bare paragraph beside it.
  const list = makeEl("ul", { parent: editor });
  const first = makeEl("li", { parent: list, text: "one" });
  const second = makeEl("li", { parent: list, text: "two" });
  const paragraph = makeEl("p", { parent: editor, text: "prose" });

  const inputs = [];
  editor.addEventListener("input", (e) => inputs.push(e));

  // Drives the handler with the caret at `node`, and reports what it did.
  const press = (node, event = tabEvent()) => {
    selection.anchorNode = node;
    commands.length = 0;
    onKeydown(event);
    return { command: commands[0] ?? null, prevented: event.prevented };
  };

  let r = press(second);
  check("Tab on a later item indents it", r.command === "indent");
  check("and swallows the keypress", r.prevented);

  // Nothing to nest under: markdown has no way to write it, so Tab stays Tab.
  r = press(first);
  check("Tab on the first item of a list does nothing", r.command === null);
  check("and lets focus leave the editor", !r.prevented);

  r = press(paragraph);
  check("Tab outside a list does nothing", r.command === null);
  check("and lets focus leave the editor", !r.prevented);

  const text = makeEl("#text", { parent: second, text: "two" });
  text.nodeType = 3;
  text.closest = undefined;
  r = press(text);
  check("a caret in a text node resolves to its item", r.command === "indent");

  // --- unnesting -----------------------------------------------------------
  //
  // execCommand's own outdent isn't trusted here — Firefox merges a nested
  // item into the one above it instead of unnesting it, losing a bullet with
  // no way back (TODO 5.1) — so Shift+Tab moves the item by hand instead of
  // calling runCommand. These checks drive the DOM outcome directly rather
  // than the command name, since there is no command any more.

  // The spec shape: the sublist lives inside the item it hangs off.
  {
    const outer = makeEl("ul", { parent: editor });
    const owner = makeEl("li", { parent: outer, text: "parent" });
    const sublist = makeEl("ul", { parent: owner });
    const nested = makeEl("li", { parent: sublist, text: "child" });
    r = press(nested, tabEvent({ shift: true }));
    check("Shift+Tab on a nested item calls no execCommand", r.command === null);
    check("and swallows the keypress", r.prevented);
    check("the item leaves the sublist", nested.parentNode === outer);
    check(
      "and lands right after the item it was nested under",
      outer.children.indexOf(nested) === outer.children.indexOf(owner) + 1,
    );
    check("the now-empty sublist is removed", !owner.children.includes(sublist));
  }

  // Chrome's execCommand shape: the sublist is a sibling of its parent item,
  // one hop further from the ancestor <li> than the spec shape.
  // outdentListItem folds that back into the spec shape before moving anything.
  {
    const outer = makeEl("ul", { parent: editor });
    const owner = makeEl("li", { parent: outer, text: "parent" });
    const chromeSublist = makeEl("ul", { parent: outer });
    const chromeNested = makeEl("li", { parent: chromeSublist, text: "child" });
    r = press(chromeNested, tabEvent({ shift: true }));
    check(
      "Shift+Tab handles Chrome's sibling nesting too",
      outer.children.indexOf(chromeNested) === outer.children.indexOf(owner) + 1,
    );
    check("and the sibling sublist is gone", !outer.children.includes(chromeSublist));
  }

  // A middle item takes whatever followed it in the nested list along as its
  // own sublist, rather than leaving those items stranded under the old parent.
  {
    const outer = makeEl("ul", { parent: editor });
    const owner = makeEl("li", { parent: outer, text: "parent" });
    const sublist = makeEl("ul", { parent: owner });
    const a = makeEl("li", { parent: sublist, text: "a" });
    const b = makeEl("li", { parent: sublist, text: "b" });
    const c = makeEl("li", { parent: sublist, text: "c" });
    r = press(b, tabEvent({ shift: true }));
    check("the outdented item moves up", b.parentNode === outer);
    check("an earlier sibling stays behind", sublist.children.includes(a));
    check("a later sibling moves under it instead", b.contains(c) && !sublist.children.includes(c));
    check("the earlier sibling's own sublist survives", owner.children.includes(sublist));
  }

  // Two followers, because one cannot show an order. This is the case the
  // suite was missing: the followers came back reversed, in both engines,
  // and only tests/list-indent-check.html run in a real browser caught it.
  {
    const outer = makeEl("ul", { parent: editor });
    const owner = makeEl("li", { parent: outer, text: "parent" });
    const sublist = makeEl("ul", { parent: owner });
    const b = makeEl("li", { parent: sublist, text: "b" });
    const c = makeEl("li", { parent: sublist, text: "c" });
    const d = makeEl("li", { parent: sublist, text: "d" });
    press(b, tabEvent({ shift: true }));
    const moved = b.children.find((child) => child.tagName === "UL");
    check("both followers move under the outdented item", !!moved &&
      moved.children.includes(c) && moved.children.includes(d));
    check("and keep the order the document had them in", !!moved &&
      moved.children.indexOf(c) < moved.children.indexOf(d));
  }

  // The same, for an item that already had children of its own: those were
  // nested under it and the followers were beside it, so the followers go
  // below them rather than in front of them.
  {
    const outer = makeEl("ul", { parent: editor });
    const owner = makeEl("li", { parent: outer, text: "parent" });
    const sublist = makeEl("ul", { parent: owner });
    const b = makeEl("li", { parent: sublist, text: "b" });
    const own = makeEl("ul", { parent: b });
    const x = makeEl("li", { parent: own, text: "x" });
    const c = makeEl("li", { parent: sublist, text: "c" });
    press(b, tabEvent({ shift: true }));
    check("the item keeps its own sublist rather than gaining a second",
      b.children.filter((child) => child.tagName === "UL").length === 1);
    check("its own children come first, the followers after",
      own.children.indexOf(x) < own.children.indexOf(c));
  }

  // Every outdent raises input, same as an execCommand would have.
  check("Shift+Tab raises input for autosave/undo/outline to hear", inputs.length > 0);

  // Plain outdent at the top level turns the bullet into a paragraph. That is a
  // formatting change wearing an indent's keybinding, so it does not happen.
  r = press(second, tabEvent({ shift: true }));
  check("Shift+Tab on a top-level item does not unlist it", r.command === null);
  check("and lets focus leave the editor", !r.prevented);

  // --- keys that are not ours ----------------------------------------------

  for (const [label, event] of [
    ["Ctrl+Tab", tabEvent({ ctrl: true })],
    ["Alt+Tab", tabEvent({ alt: true })],
    ["a plain letter", tabEvent({ key: "a" })],
  ]) {
    r = press(second, event);
    check(`${label} is left alone`, r.command === null && !r.prevented);
  }

  // A list somewhere else on the page is not the editor's to reformat.
  const orphan = makeEl("li", { parent: makeEl("ul", { parent: makeEl("div") }) });
  makeEl("li", { parent: orphan.parentNode }); // give it a previous sibling
  r = press(orphan.parentNode.children[1]);
  check("a list outside the editor is ignored", r.command === null && !r.prevented);
}
