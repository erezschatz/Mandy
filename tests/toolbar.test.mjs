// The toolbar spec is the single definition of the button set. These check
// that every button a variant renders has a handler in a script that variant's
// bundle actually ships — the correspondence that used to be maintained by
// hand across index.html and html-export.js.

import { makeEl, readFront, walk } from "./dom.mjs";

const TOOLBAR_SRC = readFront("toolbar.js");

function render(variant, probe = "") {
  const toolbar = makeEl();
  toolbar.className = "toolbar";
  const editorEl = makeEl();
  if (variant === "export") editorEl.setAttribute("data-exported", "true");

  // The split menus dismiss on a click or Escape anywhere, so toolbar.js binds
  // to the document as well as to .toolbar.
  const listeners = {};
  const document = {
    createElement: (t) => makeEl(t),
    querySelector: (s) => (s === ".toolbar" ? toolbar : null),
    getElementById: (id) => (id === "editor" ? editorEl : null),
    addEventListener: (event, fn) => ((listeners[event] ||= []).push(fn), undefined),
  };
  const hits = [];
  new Function("document", "hits", TOOLBAR_SRC + "\n" + probe)(document, hits);
  return { toolbar, hits, listeners };
}

// A split button is a wrapper holding the primary button, its caret and the
// menu. Menu items are buttons too, and deliberately: they ride the same
// delegated dispatch, so they are held to the same handler-exists rule.
function splitParts(node) {
  const [primary, caret, menu] = node.children;
  return { primary, caret, menu, items: menu ? menu.children : [] };
}

// Read the bundles from source so these lists cannot drift from the real ones.
const exportBundle = [
  ...readFront("html-export.js")
    .match(/const ASSETS = \[(.*?)\];/s)[1]
    .matchAll(/"\/([^"]+\.js)"/g),
].map((m) => m[1]);

const appBundle = [
  ...readFront("index.html").matchAll(/src="\/([a-z-]+\.js)"/g),
].map((m) => m[1]);

function handlersIn(files) {
  const actions = new Set();
  for (const file of files) {
    for (const m of readFront(file).matchAll(/onToolbarAction\("([a-z-]+)"/g)) {
      actions.add(m[1]);
    }
  }
  return actions;
}

export default function run(check) {
  for (const [variant, bundle] of [["app", appBundle], ["export", exportBundle]]) {
    const { toolbar } = render(variant);
    const nodes = walk(toolbar);
    const buttons = nodes.filter((n) => n.tagName === "BUTTON");
    const carets = buttons.filter((b) => b.attrs["data-menu"]);
    const items = buttons.filter((b) => b.className === "split-menu-item");
    // Everything that dispatches an action and is not a menu entry: the ones
    // that carry an icon and a tooltip.
    const primary = buttons.filter((b) => !carets.includes(b) && !items.includes(b));
    const handled = handlersIn(bundle.filter((f) => f !== "toolbar.js"));

    for (const button of [...primary, ...items]) {
      const action = button.attrs["data-action"];
      check(`${variant}: "${action}" has a handler in this bundle`, handled.has(action));
    }

    check(
      `${variant}: every button carries an action or opens a menu`,
      buttons.every((b) => b.attrs["data-action"] || b.attrs["data-menu"]),
    );
    check(
      `${variant}: every action button has id, title and a resolved icon`,
      primary.every(
        (b) =>
          b.id && b.title && b.innerHTML.includes("<svg") &&
          !b.innerHTML.includes("undefined"),
      ),
    );
    // A caret is the mechanism, not an action: it must stay out of the action
    // namespace, or the handler-exists rule above quietly stops holding.
    check(
      `${variant}: carets carry no data-action`,
      carets.every((b) => !b.attrs["data-action"] && b.id && b.title),
    );
    check(
      `${variant}: every menu item has a label and no icon`,
      items.every((b) => b.textContent && !b.innerHTML),
    );
    const splits = nodes.filter((n) => n.className === "split-button");
    check(
      `${variant}: every split button is primary + caret + menu`,
      splits.every((s) => {
        const { primary, caret, menu, items } = splitParts(s);
        return (
          primary.tagName === "BUTTON" &&
          caret.attrs["data-menu"] === primary.attrs["data-action"] &&
          menu.className === "split-menu" &&
          items.length > 1 &&
          // The default belongs in its own menu: a menu that omitted it would
          // make the button's own action the one choice you cannot read.
          items.some((i) => i.attrs["data-action"] === primary.attrs["data-action"])
        );
      }),
    );
    check(`${variant}: a caret exists only where a menu does`, carets.length === splits.length);
    // Split buttons are not app-only any more. Open/Reload and Save/Save As are
    // file-server controls an exported document has none of, but the outline is
    // chrome both variants ship. Named rather than counted, so adding one to
    // the wrong variant fails here rather than passing on arithmetic.
    check(
      `${variant}: the right split buttons`,
      splits.map((s) => splitParts(s).primary.id).sort().join(",") ===
        (variant === "app" ? "openBtn,saveBtn,tocBtn" : "tocBtn"),
    );
    check(
      `${variant}: four button groups`,
      nodes.filter((n) => n.className === "button-group").length === 4,
    );
    check(
      `${variant}: theme toggle ${variant === "app" ? "present" : "absent"}`,
      nodes.some((n) => n.id === "themeToggle") === (variant === "app"),
    );
    check(
      `${variant}: aside is the last toolbar child`,
      toolbar.children.at(-1).className === "theme-toggle-container",
    );
    check(
      `${variant}: exactly one delegated click listener`,
      (toolbar.listeners.click || []).length === 1,
    );
    check(
      `${variant}: no button binds its own listener`,
      buttons.every((b) => !(b.listeners.click || []).length),
    );
  }

  // Delegation: a real click lands on the <svg>, not the button.
  const { toolbar, hits } = render(
    "app",
    `onToolbarAction("export-pdf", (btn) => hits.push(btn.id));
     onToolbarAction("export-pdf", (btn) => hits.push("second:" + btn.id));`,
  );
  const pdf = walk(toolbar).find((n) => n.attrs["data-action"] === "export-pdf");
  pdf.appendChild(makeEl("svg"));

  toolbar.listeners.click[0]({ target: pdf.children.at(-1) });
  check("click on a button's icon reaches the handler", hits[0] === "pdfBtn");
  check(
    "multiple handlers per action run in order",
    hits.length === 2 && hits[1] === "second:pdfBtn",
  );

  hits.length = 0;
  toolbar.listeners.click[0]({ target: makeEl() });
  check("click outside any action is ignored", hits.length === 0);

  // --- split menus ---------------------------------------------------------
  //
  // The menu's whole justification is that it needs no dispatch of its own: its
  // items are [data-action] buttons inside .toolbar, so they ride the listener
  // above. These drive it the way a browser would — toolbar listener first, then
  // the document's, as the event bubbles.

  const app = render(
    "app",
    `onToolbarAction("reload-file", () => hits.push("reload"));`,
  );
  const splits = walk(app.toolbar).filter((n) => n.className === "split-button");
  const openSplit = splits.find((s) => splitParts(s).primary.id === "openBtn");
  const saveSplit = splits.find((s) => splitParts(s).primary.id === "saveBtn");
  const openParts = splitParts(openSplit);

  const click = (target) => {
    app.toolbar.listeners.click[0]({ target });
    for (const fn of app.listeners.click || []) fn({ target });
  };
  const escape = () => {
    for (const fn of app.listeners.keydown || []) fn({ key: "Escape" });
  };
  const isOpen = (split) => split.hasAttribute("data-open");

  click(openParts.caret);
  check("the caret opens its menu", isOpen(openSplit));
  check(
    "and says so for assistive tech",
    openParts.caret.attrs["aria-expanded"] === "true",
  );

  click(openParts.caret);
  check("the same caret closes it again", !isOpen(openSplit));
  check(
    "and takes the aria state back",
    openParts.caret.attrs["aria-expanded"] === "false",
  );

  // A real click lands on the chevron, the same way it lands on a button's icon.
  click(openParts.caret.appendChild(makeEl("svg")));
  check("a click on the chevron itself opens the menu", isOpen(openSplit));

  click(splitParts(saveSplit).caret);
  check(
    "opening one menu closes the other",
    !isOpen(openSplit) && isOpen(saveSplit),
  );

  click(openParts.caret);
  click(openParts.items.find((i) => i.attrs["data-action"] === "reload-file"));
  check("a menu item dispatches its action", app.hits.join() === "reload");
  check("and the menu closes behind it", !isOpen(openSplit));

  click(openParts.caret);
  click(makeEl());
  check("a click anywhere else dismisses the menu", !isOpen(openSplit));

  click(openParts.caret);
  escape();
  check("Escape dismisses the menu", !isOpen(openSplit));

  click(openParts.caret);
  click(openParts.primary);
  check("the primary action dismisses it too", !isOpen(openSplit));
}
