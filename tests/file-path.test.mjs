// The open file and the last browsed directory survive a reload. The path is
// restored only alongside its content: when app.js is going to fall back to
// welcome.md there is no file behind what you see, and showing one would point
// Ctrl+S at a document you are not looking at.
//
// toolbar.js, app.js and file-api.js load concatenated into one scope, the way
// the page (and the export bundle) actually runs them.

import { loadSource, makeEl, walk } from "./dom.mjs";

const HOME = "/home/x";

const DIALOG_IDS = [
  "formatBar", "fileInput", "fileDialog", "dialogTitle", "dialogClose",
  "dialogPathBar", "dialogEntries", "dialogSaveRow", "dialogFilename",
  "dialogSaveConfirm",
];

function boot({ savedContent, savedPath, savedDir, savedDirty, realDirs }) {
  const store = new Map();
  const browsed = [];
  if (savedContent !== undefined) store.set("markdownContent", savedContent);
  if (savedPath !== undefined) store.set("marky-current-file", savedPath);
  if (savedDir !== undefined) store.set("marky-last-dir", savedDir);
  if (savedDirty !== undefined) store.set("marky-dirty", savedDirty);

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
    ["toolbar.js", "markdown-style.js", "app.js", "file-api.js"],
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
      // /api/home on boot; a save echoes back the path it was given, which is
      // what the real endpoint does and what setCurrentFile reads. /api/browse
      // answers 400 for anything outside `realDirs`, the way the server does
      // for a folder that has been moved or deleted.
      fetch: async (url, opts) => {
        if (opts && opts.method === "POST") {
          return { ok: true, json: async () => ({ path: JSON.parse(opts.body).path }) };
        }
        if (url.startsWith("/api/browse")) {
          const query = url.split("?path=")[1];
          const path = query ? decodeURIComponent(query) : HOME;
          browsed.push(query ? path : null);
          return realDirs && !realDirs.includes(path)
            ? { ok: false, json: async () => ({ error: "Cannot read directory" }) }
            : {
              ok: true,
              json: async () => ({ path, parent: "/home", entries: [] }),
            };
        }
        return { ok: true, json: async () => ({ home: HOME }), text: async () => "" };
      },
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
    "; return { path: currentFilePath, label: currentFileLabel.textContent," +
      " dir: dialogDir, labelEl: currentFileLabel, saveFile, showOpenDialog," +
      " dirNow: () => dialogDir };",
  );

  const editorEl = extra.get("editor");
  return {
    ...api,
    store,
    browsed,
    // What the toolbar reads right now, as opposed to `label` — the snapshot
    // taken while the scripts were still loading.
    labelNow: () => api.labelEl.textContent,
    // Typing, and anything else that goes through execCommand: file-api.js
    // hangs the dirty flag off the editor's own input event.
    type: () => {
      for (const fn of editorEl.listeners.input || []) fn();
    },
    clear: () => {
      editorEl.innerHTML = "<p><br></p>"; // app.js's handler has already run
      toolbar.listeners.click[0]({
        target: document.querySelector('[data-action="clear"]'),
      });
    },
  };
}

export default async function run(check) {
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

  // --- a remembered directory that no longer exists ------------------------
  //
  // The last directory outlives the folder it names. Rename or move it and the
  // dialog opens on a path the server cannot read, with no way to get out of it
  // from inside the dialog.

  r = boot({ savedDir: "/home/erez/gone", realDirs: [HOME] });
  await r.showOpenDialog();
  check("a missing directory falls back to home",
    r.browsed.join() === "/home/erez/gone,");
  check("and the dialog lands on home", r.dirNow() === HOME);
  check("and the stale directory is forgotten",
    r.store.get("marky-last-dir") === HOME);

  r = boot({ savedDir: "/home/erez/notes", realDirs: [HOME, "/home/erez/notes"] });
  await r.showOpenDialog();
  check("a directory that still exists is not second-guessed",
    r.browsed.join() === "/home/erez/notes");

  // --- edited marker -------------------------------------------------------
  //
  // Autosave writes to localStorage on a debounce and knows nothing about the
  // file on disk, so a filename in the toolbar says nothing about whether the
  // two still match. Every check below is a way that lie can creep back.

  r = boot({ savedContent: "<h1>Real work</h1>", savedPath: "/home/erez/notes/plan.md" });
  check("a freshly restored document is not marked edited",
    r.labelNow() === "plan.md");

  r.type();
  check("typing marks the document edited", r.labelNow() === "plan.md (edited)");
  check("and the full path stays in the tooltip",
    r.labelEl.title === "/home/erez/notes/plan.md");

  // Autosave survives a reload, so the flag has to as well — otherwise the
  // toolbar reopens showing a clean filename over unsaved edits.
  check("the edited flag is persisted", r.store.get("marky-dirty") === "1");

  r = boot({
    savedContent: "<h1>Real work</h1>",
    savedPath: "/home/erez/notes/plan.md",
    savedDirty: "1",
  });
  check("the edited marker survives a reload", r.labelNow() === "plan.md (edited)");

  await r.saveFile("/home/erez/notes/plan.md");
  check("saving clears the marker", r.labelNow() === "plan.md");
  check("and drops the persisted flag", !r.store.has("marky-dirty"));

  r = boot({ savedContent: "<h1>Real work</h1>", savedPath: "/home/erez/notes/plan.md" });
  r.type();
  r.clear();
  check("clear drops the marker with the path", r.labelNow() === "");
  check("clear drops the persisted flag", !r.store.has("marky-dirty"));

  // Nothing to be out of step with when no file is open, so the marker would
  // be a bare "(edited)" hanging next to the app title.
  r = boot({ savedContent: "<h1>Real work</h1>" });
  r.type();
  check("no marker without a file open", r.labelNow() === "");
}
