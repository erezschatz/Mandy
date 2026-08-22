// notify.js replaced every alert() and confirm() in front/. Two kinds of check
// here, because there are two ways this goes quietly wrong.
//
// The source-level ones are the important ones. Nothing about an alert() looks
// broken from inside the app — it pops up, it says the right words — so a call
// site that slips back to one is invisible until a user has ticked "prevent
// this page from creating additional dialogs" and their save failure vanishes.
// Same for the registries: a module that calls notify() from a bundle that does
// not ship notify.js throws ReferenceError inside a catch block, which is to
// say at exactly the moment something else has already gone wrong.
//
// The behavioural ones drive the real module against the DOM stub: what ask()
// resolves to, and that dismissing is not the same answer as agreeing.

import { readdirSync } from "node:fs";
import { loadSource, makeEl, readFront, walk } from "./dom.mjs";

const FRONT_JS = readdirSync(new URL("../front/", import.meta.url))
  .filter((f) => f.endsWith(".js"));

// Comments in this repo discuss alert() at length — notify.js's own header is
// mostly about why it exists — so the scan has to read code, not prose.
function code(file) {
  return readFront(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function bundleOf(name) {
  return name === "app"
    ? [...readFront("index.html").matchAll(/src="\/([a-z-]+\.js)"/g)].map((m) => m[1])
    : [
        ...readFront("html-export.js")
          .match(/const ASSETS = \[(.*?)\];/s)[1]
          .matchAll(/"\/([^"]+\.js)"/g),
      ].map((m) => m[1]);
}

// A document with a tracked focus and a working classList: notify.js restores
// focus when a dialog closes and moves it around inside one, and neither shows
// up against the stub's no-op versions.
function makeDoc() {
  const body = makeEl("body");
  const doc = { body, activeElement: null };
  doc.createElement = (tag) => {
    const el = makeEl(tag);
    const classes = new Set();
    el.classList = {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    };
    el.focus = () => {
      doc.activeElement = el;
    };
    return el;
  };
  return doc;
}

function load(doc) {
  const timers = [];
  return {
    timers,
    api: loadSource("notify.js", {
      document: doc,
      setTimeout: (fn, ms) => timers.push({ fn, ms }) && timers.length,
      clearTimeout: (id) => {
        if (timers[id - 1]) timers[id - 1].cleared = true;
      },
      console,
    }, "; return { notify, ask };"),
  };
}

const find = (doc, cls) => walk(doc.body).find((n) => n.className && n.className.includes(cls));
const textOf = (doc, cls) => {
  const node = walk(doc.body).find((n) => n.className === cls);
  return node ? node.textContent : null;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

export default async function run(check) {
  // --- the registries and the call sites -----------------------------------

  for (const file of FRONT_JS) {
    const src = code(file);
    check(`${file} raises no alert()`, !/(^|[^.\w])alert\s*\(/.test(src));
    check(`${file} asks no confirm()`, !/(^|[^.\w])confirm\s*\(/.test(src));
  }

  for (const variant of ["app", "export"]) {
    const bundle = bundleOf(variant);
    const callers = bundle.filter(
      (f) => f !== "notify.js" && /(^|[^.\w])(notify|ask)\s*\(/.test(code(f)),
    );
    check(`${variant}: something in the bundle notifies`, callers.length > 0);
    check(
      `${variant}: ships notify.js for ${callers.length} caller(s)`,
      bundle.includes("notify.js"),
    );
    // It has to run before them, the same reason toolbar.js does.
    check(
      `${variant}: notify.js loads before its callers`,
      bundle.indexOf("notify.js") < Math.min(...callers.map((f) => bundle.indexOf(f))),
    );
  }

  // Offline, the app boots from the service worker's cache. A shell missing
  // this file loads an editor whose every error path throws.
  check(
    "notify.js is a shell asset",
    /SHELL_ASSETS = \[[\s\S]*?"\/notify\.js"[\s\S]*?\];/.test(readFront("sw.js")),
  );

  // --- toasts ---------------------------------------------------------------

  let doc = makeDoc();
  let { api, timers } = load(doc);

  api.notify("Failed to save file: EACCES", { severity: "error" });
  check("a toast lands in the stack", !!find(doc, "notify-stack"));
  check("carrying its message", textOf(doc, "notify-message") === "Failed to save file: EACCES");
  const errorToast = find(doc, "notify-toast");
  check("and its severity", errorToast.className.includes("notify-error"));
  // alert() was assertive whether it deserved to be. This keeps that only where
  // it is earned, so a screen reader is not interrupted by "Copied!".
  check("an error interrupts assistive tech", errorToast.getAttribute("role") === "alert");
  check("an error does not dismiss itself", timers.length === 0);

  api.notify("Saved!", { severity: "success" });
  check("a non-error does", timers.length === 1 && timers[0].ms === 3000);
  check("and does not interrupt", find(doc, "notify-success").getAttribute("role") === "status");

  const stack = find(doc, "notify-stack");
  check("both toasts stack", stack.children.length === 2);

  // Running the dismissal timer removes it: the exit is a second timer, so the
  // node only actually goes once that has run too.
  timers[0].fn();
  const exit = timers.at(-1);
  exit.fn();
  check("a dismissed toast leaves the stack", stack.children.length === 1);

  const dismiss = api.notify("Working…", { severity: "info" });
  check("three toasts, one just added", stack.children.length === 2);
  dismiss();
  timers.at(-1).fn();
  check("the returned handle takes it back", stack.children.length === 1);

  // --- dialogs --------------------------------------------------------------

  doc = makeDoc();
  ({ api } = load(doc));

  const before = doc.createElement("div");
  doc.activeElement = before;

  const actions = [
    { label: "Cancel", value: "cancel", variant: "quiet", default: true },
    { label: "Discard", value: "discard", variant: "danger" },
    { label: "Save", value: "save", variant: "primary" },
  ];
  let pending = api.ask("Unsaved edits to plan.md will be lost.", {
    title: "Reload from disk?",
    actions,
  });

  const backdrop = find(doc, "notify-backdrop");
  check("the dialog opens", !!backdrop);
  check("with its message", textOf(doc, "notify-dialog-message") === "Unsaved edits to plan.md will be lost.");
  check("and its title", textOf(doc, "notify-dialog-title") === "Reload from disk?");

  const buttons = walk(backdrop).filter((n) => n.className.startsWith("notify-btn"));
  check("one button per action", buttons.length === 3);
  check("three of them, which confirm() could never do",
    buttons.map((b) => b.textContent).join() === "Cancel,Discard,Save");
  check("the danger action is styled as one",
    buttons[1].className === "notify-btn notify-btn-danger");

  // The destructive dialogs all mark Cancel, so Enter does the safe thing.
  check("the default action takes focus", doc.activeElement === buttons[0]);

  buttons[1].dispatchEvent({ type: "click" });
  check("choosing an action resolves its value", (await pending) === "discard");
  check("and closes the dialog", !find(doc, "notify-backdrop"));
  check("and gives focus back", doc.activeElement === before);

  // Dismissal is not agreement. confirm() got this right and it is the one
  // thing easy to lose when reimplementing it: a caller testing the result for
  // truthiness must not read Escape as yes.
  for (const [label, drive] of [
    ["Escape", (b) => b.dispatchEvent({ type: "keydown", key: "Escape", preventDefault() {} })],
    ["a backdrop click", (b) => b.dispatchEvent({ type: "click", target: b })],
    ["the close button", (b) => walk(b).find((n) => n.className === "notify-close").dispatchEvent({ type: "click" })],
  ]) {
    pending = api.ask("Overwrite?");
    const b = find(doc, "notify-backdrop");
    drive(b);
    check(`${label} resolves to the dismiss value`, (await pending) === null);
    check(`${label} closes it`, !find(doc, "notify-backdrop"));
  }

  // A click that started inside the panel and ended outside it — releasing a
  // drag over the message text — bubbles to the backdrop with the panel as its
  // target, and is not a dismissal.
  pending = api.ask("Overwrite?");
  const live = find(doc, "notify-backdrop");
  live.dispatchEvent({ type: "click", target: find(doc, "notify-dialog") });
  await settle();
  check("a click inside the panel does not dismiss", !!find(doc, "notify-backdrop"));
  walk(live).find((n) => n.className === "notify-close").dispatchEvent({ type: "click" });
  await pending;

  // Two-way callers just test the result, so the default has to be falsy.
  pending = api.ask("Overwrite?");
  const two = walk(find(doc, "notify-backdrop")).filter((n) => n.className.startsWith("notify-btn"));
  check("the default actions are Cancel and OK",
    two.map((b) => b.textContent).join() === "Cancel,OK");
  check("with the affirmative unmarked, so Enter cancels",
    doc.activeElement === two[0]);
  two[1].dispatchEvent({ type: "click" });
  check("OK resolves true", (await pending) === true);

  // --- the focus trap -------------------------------------------------------
  //
  // The dialog is modal, so Tab reaching the toolbar behind it would let a
  // keyboard user act on the very thing being asked about.
  pending = api.ask("Overwrite?", { actions });
  const trap = find(doc, "notify-backdrop");
  const tabs = walk(trap).filter((n) => n.className.startsWith("notify-btn"));
  const tab = (shiftKey) =>
    trap.dispatchEvent({ type: "keydown", key: "Tab", shiftKey, preventDefault() {} });

  tab(false);
  check("Tab moves to the next action", doc.activeElement === tabs[1]);
  tab(false);
  tab(false);
  check("and wraps rather than leaving the dialog", doc.activeElement === tabs[0]);
  tab(true);
  check("Shift+Tab wraps the other way", doc.activeElement === tabs.at(-1));
  trap.dispatchEvent({ type: "keydown", key: "Escape", preventDefault() {} });
  await pending;
}
