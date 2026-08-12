// The open file and the last browsed directory survive a reload. The path is
// restored only alongside its content: when app.js is going to fall back to
// welcome.md there is no file behind what you see, and showing one would point
// Ctrl+S at a document you are not looking at.
//
// toolbar.js, app.js and file-api.js load concatenated into one scope, the way
// the page (and the export bundle) actually runs them.

import { loadSource, makeEl, walk } from "./dom.mjs";

const DIALOG_IDS = [
  "formatBar", "fileInput", "fileDialog", "dialogTitle", "dialogClose",
  "dialogPathBar", "dialogEntries", "dialogSaveRow", "dialogFilename",
  "dialogSaveConfirm",
];

function boot({ savedContent, savedPath, savedDir }) {
  const store = new Map();
  if (savedContent !== undefined) store.set("markdownContent", savedContent);
  if (savedPath !== undefined) store.set("marky-current-file", savedPath);
  if (savedDir !== undefined) store.set("marky-last-dir", savedDir);

  const toolbar = makeEl();
  toolbar.className = "toolbar";
  const extra = new Map([["editor", makeEl()]]);
  extra.get("editor").id = "editor";
  for (const id of DIALOG_IDS) extra.set(id, makeEl());

  const document = {
    createElement: (t) => makeEl(t),
    // Dynamic: toolbar.js builds its buttons during this same execution.
    getElementById: (id) =>
      extra.get(id) ?? walk(toolbar).find((n) => n.id === id) ?? null,
    querySelector: (sel) => {
      if (sel === ".toolbar") return toolbar;
      const m = sel.match(/\[data-action="([a-z-]+)"\]/);
      return m
        ? walk(toolbar).find((n) => n.attrs["data-action"] === m[1]) ?? null
        : null;
    },
    addEventListener() {},
    body: makeEl(),
    head: makeEl(),
    documentElement: makeEl(),
    createRange: () => ({ setStart() {}, collapse() {} }),
    execCommand() {},
  };

  const api = loadSource(
    ["toolbar.js", "app.js", "file-api.js"],
    {
      document,
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
      window: {
        addEventListener() {},
        matchMedia: () => ({ matches: false }),
        markdownit: () => ({ render: (s) => s }),
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
      },
      navigator: { clipboard: {} },
      fetch: async () => ({
        ok: true, json: async () => ({ home: "/home/x" }), text: async () => "",
      }),
      TurndownService: class { addRule() {} turndown(h) { return h; } },
      alert() {},
      confirm: () => true,
      console,
      setTimeout,
      clearTimeout,
      URL: globalThis.URL,
      Blob: class {},
      Date,
    },
    "; return { path: currentFilePath, label: currentFileLabel.textContent, dir: dialogDir };",
  );

  const editorEl = extra.get("editor");
  return {
    ...api,
    store,
    clear: () => {
      editorEl.innerHTML = "<p><br></p>"; // app.js's handler has already run
      toolbar.listeners.click[0]({
        target: document.querySelector('[data-action="clear"]'),
      });
    },
  };
}

export default function run(check) {
  let r = boot({ savedContent: "<h1>Real work</h1>", savedPath: "/home/erez/notes/plan.md" });
  check("path restored alongside content", r.path === "/home/erez/notes/plan.md");
  check("label shows the basename", r.label === "plan.md");

  r = boot({ savedContent: "<p><br></p>", savedPath: "/home/erez/notes/plan.md" });
  check("path dropped when the content is blank", !r.path);
  check("stale path key removed from storage", !r.store.has("marky-current-file"));

  r = boot({ savedPath: "/home/erez/notes/plan.md" });
  check("path dropped when nothing was saved", !r.store.has("marky-current-file"));

  r = boot({ savedContent: "<h1>x</h1>" });
  check("a missing path is handled", r.path === null);
  check("label is empty without a path", r.label === "");

  r = boot({ savedDir: "/home/erez/projects/docs" });
  check("last directory restored", r.dir === "/home/erez/projects/docs");

  r = boot({});
  check("a missing last directory is handled", r.dir === null);

  r = boot({ savedContent: "<p><br></p>", savedDir: "/home/erez/projects/docs" });
  check("last directory kept across a blank document",
    r.dir === "/home/erez/projects/docs");

  r = boot({
    savedContent: "<h1>Real work</h1>",
    savedPath: "/home/erez/notes/plan.md",
    savedDir: "/home/erez/projects/docs",
  });
  r.clear();
  check("clear drops the persisted path", !r.store.has("marky-current-file"));
  check("clear keeps the last directory",
    r.store.get("marky-last-dir") === "/home/erez/projects/docs");
}
