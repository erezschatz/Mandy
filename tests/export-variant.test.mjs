// app.js booted as an exported document rather than as the app.
//
// Nothing else does this. `data-exported` appears in exactly one other place in
// tests/ — toolbar.test.mjs's render() — and that one loads `toolbar.js` alone,
// which is enough to check that every item a variant renders has a handler in
// that variant's bundle but cannot run a handler. Seven suites load `app.js`,
// and until this one they all booted it as the app.
//
// So a whole configuration went unexercised, and the parts of `app.js` that
// exist *only* for it went with it: the blob fallbacks behind Ctrl+S and
// Ctrl+O, which are gated on toolbar items the app variant does not render,
// and the `typeof confirmDiscard === "function"` feature test that decides
// whether New asks the unsaved-work guard's question or the plain one.
//
// The bundle is the export's, which is to say `file-api.js` is absent — that
// is the whole point, and it is also why this cannot be a flag on
// file-path.test.mjs's `boot()`: that harness's tail returns
// `currentFilePath` and `fileDescriptor()`, both of which are `file-api.js`
// globals, so a bundle without the file throws before a single check runs.

import { loadSource, makeEl, markdownitStub, walk } from "./dom.mjs";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// `embedded` is the document the export wrote into the file — an exported
// document's content is the markup in the page, not anything in storage.
// `stored` is what this browser happens to have under the autosave key, which
// on a first open is nothing and after any editing is that editing.
function boot({
  embedded = "<h1>Real work</h1>",
  stored = null,
  confirmAnswer = true,
} = {}) {
  const store = new Map(stored === null ? [] : [["markdownContent", stored]]);

  const container = makeEl();
  container.className = "container";
  const toolbar = makeEl();
  toolbar.className = "toolbar";
  container.appendChild(toolbar);

  // Stamped before anything loads, because `toolbarVariant()` reads it at build
  // time: an editor that grows the attribute later gets an app toolbar, and
  // every check below would then be about the wrong variant.
  const editorEl = makeEl();
  editorEl.id = "editor";
  editorEl.setAttribute("data-exported", "true");
  editorEl.focus = () => {};
  editorEl.innerHTML = embedded;

  const extra = new Map([["editor", editorEl]]);
  for (const id of ["fileInput", "formatBar"]) extra.set(id, makeEl());

  // What a download looks like from outside: app.js builds a real <a>, sets
  // `download`, clicks it and takes it out again. The anchor is the only
  // evidence, so it is recorded rather than the blob.
  const downloads = [];
  const clicks = [];
  const objectUrls = [];
  const revoked = [];
  extra.get("fileInput").click = () => clicks.push("fileInput");

  const listeners = {};
  const asked = [];

  const document = {
    createElement: (t) => {
      const el = makeEl(t);
      if (t === "a") {
        el.click = () => downloads.push(el.download || el.getAttribute("download"));
      }
      return el;
    },
    getElementById: (id) =>
      extra.get(id) ?? walk(toolbar).find((n) => n.id === id) ?? null,
    querySelector: (sel) => {
      if (sel === ".toolbar") return toolbar;
      if (sel === ".container") return container;
      const m = sel.match(/\[data-(action|menu)="([a-z-]+)"\]/);
      return m
        ? walk(toolbar).find((n) => n.attrs[`data-${m[1]}`] === m[2]) ?? null
        : null;
    },
    querySelectorAll: () => [],
    addEventListener(event, fn) {
      (listeners[event] ||= []).push(fn);
    },
    body: makeEl(),
    head: makeEl(),
    documentElement: makeEl(),
    createRange: () => ({ setStart() {}, collapse() {}, selectNodeContents() {} }),
    execCommand() {},
  };

  const api = loadSource(
    ["toolbar.js", "markdown-parser.js", "markdown-style.js", "app.js"],
    {
      document,
      runCommand: () => true,
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
      window: {
        addEventListener(event, fn) {
          (listeners[event] ||= []).push(fn);
        },
        matchMedia: () => ({ matches: false }),
        markdownit: markdownitStub(),
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
      },
      navigator: { clipboard: {} },
      renderMermaidDiagrams: async () => {},
      renderLatex: async () => {},
      // An exported document has no origin to fetch from, and nothing here
      // should try: the stored content is what it opens with. A request is a
      // failure rather than a stub, so the welcome path cannot pass silently.
      fetch: async (url) => {
        throw new Error(`unexpected fetch: ${url}`);
      },
      TurndownService: class {
        options = {};
        addRule() {}
        turndown(h) {
          return h;
        }
      },
      notify: () => {},
      // No file-api.js here, so New takes app.js's own fallback question rather
      // than the guard. Two-way: the reading a `confirm()` used to have, which
      // is exactly what that fallback is.
      ask: (message) => {
        asked.push(message);
        return Promise.resolve(confirmAnswer);
      },
      undoReset() {},
      undoPosition: () => 0,
      console,
      setTimeout,
      clearTimeout,
      // The real URL for `new URL(href)`, which openExternalLink parses with,
      // and the two object-URL statics replaced: Deno's own createObjectURL
      // rejects anything that is not a real Blob, and handing it a real one
      // would mean building the download rather than recording it.
      URL: Object.assign(class extends globalThis.URL {}, {
        createObjectURL: (blob) => {
          objectUrls.push(blob);
          return `blob:${objectUrls.length}`;
        },
        revokeObjectURL: (url) => revoked.push(url),
      }),
      Blob: class {},
      Date,
    },
    "; return { onToolbarAction, editorHtml: () => editor.innerHTML };",
  );

  const fired = [];
  for (const action of ["download-md", "upload-md", "export-pdf", "insert-link"]) {
    api.onToolbarAction(action, () => fired.push(action));
  }

  // The page load itself. app.js does its startup inside a `load` listener —
  // the branch that keeps an exported document's embedded markup and drops the
  // attribute is in there — so a harness that never fires one is testing a
  // half-booted module. The async work it kicks off is drained by the
  // `settle()` every caller does next.
  for (const fn of listeners.load || []) fn();

  return {
    ...api,
    store,
    asked,
    fired,
    downloads,
    clicks,
    objectUrls,
    revoked,
    item: (action) => walk(toolbar).find((n) => n.attrs["data-action"] === action) ?? null,
    hasVariantAttribute: () => editorEl.hasAttribute("data-exported"),
    press: async (init) => {
      let prevented = false;
      const event = {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: () => {
          prevented = true;
        },
        ...init,
      };
      for (const fn of listeners.keydown || []) fn(event);
      await settle();
      return prevented;
    },
    // Through the delegated listener rather than by calling a handler, because
    // several handlers can share an action and the dispatch awaits them in
    // turn — which is the ordering New depends on.
    clickAction: async (action) => {
      toolbar.listeners.click[0]({
        target: walk(toolbar).find((n) => n.attrs["data-action"] === action),
      });
      await settle();
    },
  };
}

export default async function run(check) {
  const r = boot();
  await settle();

  // Everything below is about the export variant, so the first thing to
  // establish is that this really is one. Without these two the suite could
  // pass by having quietly booted the app, where `download-md` does not exist
  // and every gated branch is a no-op for the wrong reason.
  check("the toolbar rendered the export variant", !!r.item("download-md") && !!r.item("upload-md"));
  check("and not the app's file items", !r.item("open-file") && !r.item("save-file"));

  // --- what an exported document opens with ---------------------------------
  //
  // Its content is the markup in the file, and `localStorage` belongs to
  // whoever's browser it was opened in — which may well hold an unrelated
  // document of their own. The branch that decides this has never been
  // exercised, and getting it backwards would show the reader somebody else's
  // work in place of the document they were sent.

  const r2 = boot({ embedded: "<h1>Sent to you</h1>", stored: "<p>Your own notes</p>" });
  await settle();
  check("the embedded document is what opens", r2.editorHtml() === "<h1>Sent to you</h1>");
  check("and this browser's autosave is ignored", r2.editorHtml() !== "<p>Your own notes</p>");
  check("and data-exported is stripped once the toolbar has read it",
    !r2.hasVariantAttribute());

  // --- the blob fallbacks -----------------------------------------------
  //
  // These are the two bindings no suite could reach: app.js gates them on
  // items only this variant renders, so in the app harness they are skipped
  // and file-api.js answers the same keystroke instead.

  let fired = r.fired.length;
  check("Ctrl+S downloads the markdown",
    await r.press({ key: "s", ctrlKey: true }) &&
      r.fired.at(-1) === "download-md" && r.fired.length === fired + 1);
  check("and the download is a real anchor click", r.downloads.at(-1) === "document.md");
  // The anchor and its object URL are both taken back out. A leaked one holds
  // the whole document in memory for as long as the page is open, and an
  // exported document is a page people leave open.
  check("and the object URL is revoked after it", r.revoked.at(-1) === `blob:${r.objectUrls.length}`);

  fired = r.fired.length;
  check("and Caps Lock does not silence it",
    await r.press({ key: "S", ctrlKey: true }) &&
      r.fired.at(-1) === "download-md" && r.fired.length === fired + 1);

  fired = r.fired.length;
  check("Ctrl+O opens the file picker",
    await r.press({ key: "o", ctrlKey: true }) &&
      r.fired.at(-1) === "upload-md" && r.fired.length === fired + 1);
  check("and it is the file input that was clicked", r.clicks.at(-1) === "fileInput");

  fired = r.fired.length;
  check("and Caps Lock does not silence that either",
    await r.press({ key: "O", ctrlKey: true }) &&
      r.fired.at(-1) === "upload-md" && r.fired.length === fired + 1);

  // The gate's other direction, and the reason it is a gate rather than a
  // plain binding: PDF is app-only, so this variant renders no item, nothing
  // fires, and the keystroke is left to the browser rather than swallowed.
  fired = r.fired.length;
  check("Ctrl+Shift+P is not bound here", !(await r.press({ key: "P", ctrlKey: true, shiftKey: true })));
  check("and nothing fired", r.fired.length === fired);

  // Ctrl+K is ungated, so it is the control: a binding that works in both
  // variants, proving the two above are skipped by the gate rather than by the
  // handler never running at all.
  fired = r.fired.length;
  check("Ctrl+K is bound in both variants",
    await r.press({ key: "k", ctrlKey: true }) &&
      r.fired.at(-1) === "insert-link" && r.fired.length === fired + 1);

  // --- New, which is a different action here --------------------------------
  //
  // In the app New makes a tab and asks nothing. An exported document ships no
  // tabs.js and has nowhere to put a second document, so it still resets in
  // place — and no file-api.js either, so `confirmDiscard` does not exist and
  // the feature test in this handler falls back to app.js's own plain
  // question. That fallback has never been exercised: every suite that loads
  // app.js loads it where one or both of those modules is present.

  let n = boot({ stored: "<h1>Real work</h1>" });
  await settle();
  await n.clickAction("new");
  check("New in an exported document asks the plain question",
    n.asked.length === 1 && n.asked[0].includes("auto-saved copy"));
  check("and resets the document in place", n.editorHtml() === "<p><br></p>");
  check("and drops the autosave with it", !n.store.has("markdownContent"));

  // Cancel is the default action on that dialog, so this is the answer Escape
  // and Enter both give.
  n = boot({ stored: "<h1>Real work</h1>", confirmAnswer: false });
  await settle();
  await n.clickAction("new");
  check("and backing out of it keeps the document", n.editorHtml() === "<h1>Real work</h1>");
  check("and keeps the autosave", n.store.get("markdownContent") === "<h1>Real work</h1>");
}
