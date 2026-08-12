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

  const document = {
    createElement: (t) => makeEl(t),
    querySelector: (s) => (s === ".toolbar" ? toolbar : null),
    getElementById: (id) => (id === "editor" ? editorEl : null),
  };
  const hits = [];
  new Function("document", "hits", TOOLBAR_SRC + "\n" + probe)(document, hits);
  return { toolbar, hits };
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
    const handled = handlersIn(bundle.filter((f) => f !== "toolbar.js"));

    for (const button of buttons) {
      const action = button.attrs["data-action"];
      check(`${variant}: "${action}" has a handler in this bundle`, handled.has(action));
    }

    check(
      `${variant}: every button carries a data-action`,
      buttons.every((b) => b.attrs["data-action"]),
    );
    check(
      `${variant}: every button has id, title and a resolved icon`,
      buttons.every(
        (b) =>
          b.id && b.title && b.innerHTML.includes("<svg") &&
          !b.innerHTML.includes("undefined"),
      ),
    );
    check(
      `${variant}: three button groups`,
      nodes.filter((n) => n.className === "button-group").length === 3,
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
}
