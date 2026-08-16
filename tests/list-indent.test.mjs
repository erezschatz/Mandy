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

  // The spec shape: the sublist lives inside the item it hangs off.
  const sublist = makeEl("ul", { parent: second });
  const nested = makeEl("li", { parent: sublist, text: "two a" });
  r = press(nested, tabEvent({ shift: true }));
  check("Shift+Tab on a nested item outdents it", r.command === "outdent");

  // Chrome's execCommand shape: the sublist is a sibling of its parent item,
  // one hop further from the ancestor <li> than the spec shape.
  const chromeSublist = makeEl("ul", { parent: list });
  const chromeNested = makeEl("li", { parent: chromeSublist, text: "two b" });
  r = press(chromeNested, tabEvent({ shift: true }));
  check("Shift+Tab handles Chrome's sibling nesting too", r.command === "outdent");

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
