// The open file and the last browsed directory survive a reload. The path is
// restored only alongside its content: when app.js is going to fall back to
// welcome.md there is no file behind what you see, and showing one would point
// Ctrl+S at a document you are not looking at.
//
// toolbar.js, app.js and file-api.js load concatenated into one scope, the way
// the page (and the export bundle) actually runs them.

import { loadSource, makeEl, markdownitStub, walk } from "./dom.mjs";

const HOME = "/home/x";

const DIALOG_IDS = [
  "formatBar", "fileInput", "fileDialog", "dialogTitle", "dialogClose",
  "dialogPathBar", "dialogEntries", "dialogSaveRow", "dialogFilename",
  "dialogSaveConfirm",
];

// Lets a test park the answer the next confirm() gives, and read back what it
// was asked. Reload and overwrite both hinge on it.
let confirmAnswer = true;

// Every disk check is fired and not awaited — a page load fires one, and so does
// the visibilitychange handler. One turn of the timer queue drains them, since
// the promises behind them are all microtasks.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function boot({
  savedContent,
  savedPath,
  savedDir,
  savedDirty,
  savedMtime,
  realDirs,
  disk = new Map(),
}) {
  const store = new Map();
  const browsed = [];
  const reads = [];
  const writes = [];
  const asked = [];
  // One bag for both targets: file-api.js binds `focus` on window and
  // `visibilitychange` on document, and no name is claimed by both.
  const listeners = {};
  if (savedContent !== undefined) store.set("markdownContent", savedContent);
  if (savedPath !== undefined) store.set("marky-current-file", savedPath);
  if (savedDir !== undefined) store.set("marky-last-dir", savedDir);
  if (savedDirty !== undefined) store.set("marky-dirty", savedDirty);
  if (savedMtime !== undefined) store.set("marky-file-mtime", savedMtime);

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
      const m = sel.match(/\[data-(action|menu)="([a-z-]+)"\]/);
      return m
        ? walk(toolbar).find((n) => n.attrs[`data-${m[1]}`] === m[2]) ?? null
        : null;
    },
    hidden: false,
    addEventListener(event, fn) {
      (listeners[event] ||= []).push(fn);
    },
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
        addEventListener(event, fn) {
          (listeners[event] ||= []).push(fn);
        },
        matchMedia: () => ({ matches: false }),
        markdownit: markdownitStub(),
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
      },
      navigator: { clipboard: {} },
      // Loaded by renderers.js in the app, which this suite does not need — but
      // openFile calls both on every read, reload included.
      renderMermaidDiagrams: async () => {},
      renderLatex: async () => {},
      // /api/home on boot; a save echoes back the path it was given, which is
      // what the real endpoint does and what setCurrentFile reads. /api/browse
      // answers 400 for anything outside `realDirs`, the way the server does
      // for a folder that has been moved or deleted.
      fetch: async (url, opts) => {
        if (opts && opts.method === "POST") {
          // A write moves the file's mtime, the way the real one does — which is
          // what stops the next disk check reading our own save as an outside
          // edit. The path is echoed back because setCurrentFile reads it.
          const body = JSON.parse(opts.body);
          const modified = `2026-08-17T10:0${writes.length + 5}:00.000Z`;
          disk.set(body.path, { content: body.content, modified });
          writes.push(body.path);
          return { ok: true, json: async () => ({ path: body.path, modified }) };
        }
        if (url.startsWith("/api/file")) {
          const filePath = decodeURIComponent(url.match(/path=([^&]*)/)[1]);
          const stat = url.includes("stat=1");
          reads.push(`${stat ? "stat" : "read"}:${filePath}`);
          const file = disk.get(filePath);
          if (!file) {
            return { ok: false, json: async () => ({ error: "File not found" }) };
          }
          const base = { path: filePath, name: filePath.split("/").pop(), modified: file.modified };
          return {
            ok: true,
            json: async () => (stat ? base : { ...base, content: file.content }),
          };
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
      // `options` is the real one's own bag, and reading a file writes the
      // sniffed style into it — so a stub without it throws on the first open.
      TurndownService: class {
        options = {};
        addRule() {}
        turndown(h) {
          return h;
        }
      },
      notify() {},
      // The real one resolves a promise, which is the whole reason the guards
      // could grow a third button — so the stub has to resolve one too, or the
      // callers pass a pending promise off as a yes.
      ask: (message) => {
        asked.push(message);
        return Promise.resolve(confirmAnswer);
      },
      console,
      setTimeout,
      clearTimeout,
      URL: globalThis.URL,
      Blob: class {},
      Date,
    },
    "; return { path: currentFilePath, label: currentFileLabel.textContent," +
      " dir: dialogDir, labelEl: currentFileLabel, saveFile, showOpenDialog," +
      " openFile, reloadFile, dirNow: () => dialogDir," +
      " pathNow: () => currentFilePath, mtimeNow: () => fileMtime };",
  );

  const editorEl = extra.get("editor");
  return {
    ...api,
    store,
    browsed,
    reads,
    writes,
    asked,
    disk,
    // Coming back to the window, both ways a browser reports it. Fired and then
    // settled rather than awaited, because a browser does not await them either.
    focus: async () => {
      for (const fn of listeners.focus || []) fn();
      await settle();
    },
    reveal: async () => {
      for (const fn of listeners.visibilitychange || []) fn();
      await settle();
    },
    // What the toolbar reads right now, as opposed to `label` — the snapshot
    // taken while the scripts were still loading.
    labelNow: () => api.labelEl.textContent,
    // markdownit is a pass-through here, so this is the markdown a read put in.
    html: () => editorEl.innerHTML,
    // The harness boots from localStorage without app.js's restore ever running,
    // so the editor starts empty whatever savedContent said. Anything that turns
    // on what is actually in the document has to put it there.
    fill: (html) => {
      editorEl.innerHTML = html;
    },
    // Typing, and anything else that goes through execCommand: file-api.js
    // hangs the dirty flag off the editor's own input event.
    type: () => {
      for (const fn of editorEl.listeners.input || []) fn();
    },
    // app.js's handler is registered first and does the actual clearing; this
    // one only drops the file association on top of it. It used to be enough to
    // fake the emptied editor and dispatch, because app.js's confirm() returned
    // before the dispatcher moved on. Now app.js stops on a dialog, so this has
    // to settle — which is the ordering the whole thing hinges on: run it too
    // early and isBlankContent sees the document still full and keeps the path.
    clear: async () => {
      toolbar.listeners.click[0]({
        target: document.querySelector('[data-action="clear"]'),
      });
      await settle();
    },
    // Two elements carry the same action once a button has a split menu — the
    // button and the menu entry — so a test has to be able to say which.
    find: (action, fromMenu = false) => {
      const matches = walk(toolbar).filter(
        (n) => n.attrs["data-action"] === action,
      );
      return fromMenu ? matches.at(-1) : matches[0];
    },
    clickAction(action, fromMenu = false) {
      toolbar.listeners.click[0]({ target: this.find(action, fromMenu) });
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
  // Filled for real, so dropping the path depends on app.js having emptied the
  // editor first. With an empty one this check passes on any ordering at all,
  // which is the trap: it is the ordering that is under test here.
  r.fill("<h1>Real work</h1>");
  await r.clear();
  check("clear asks before discarding", /removes all content/.test(r.asked.at(-1) || ""));
  check("clear drops the persisted path", !r.store.has("marky-current-file"));
  check("clear keeps the last directory",
    r.store.get("marky-last-dir") === "/home/erez/projects/docs");

  // The ordering this suite exists to protect, from the other side: a cancelled
  // Clear must leave the file association alone. file-api.js's hook decides
  // that by looking at the editor, so it can only be right if it runs after
  // app.js's dialog has been answered rather than while it is still open.
  r = boot({
    savedContent: "<h1>Real work</h1>",
    savedPath: "/home/erez/notes/plan.md",
  });
  r.fill("<h1>Real work</h1>");
  confirmAnswer = false;
  await r.clear();
  check("a cancelled clear leaves the document alone",
    r.html() === "<h1>Real work</h1>");
  check("a cancelled clear keeps the file open",
    r.pathNow() === "/home/erez/notes/plan.md");
  check("and keeps it persisted",
    r.store.get("marky-current-file") === "/home/erez/notes/plan.md");
  confirmAnswer = true;

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
  await r.clear();
  check("clear drops the marker with the path", r.labelNow() === "");
  check("clear drops the persisted flag", !r.store.has("marky-dirty"));

  // Nothing to be out of step with when no file is open, so the marker would
  // be a bare "(edited)" hanging next to the app title.
  r = boot({ savedContent: "<h1>Real work</h1>" });
  r.type();
  check("no marker without a file open", r.labelNow() === "");

  // --- reload, and the file changing underneath ----------------------------
  //
  // A page load restores the document from autosave, never from the file, so
  // until Reload existed nothing in the app could see an edit made anywhere
  // else — and re-Opening was the only way to discard local changes.

  const OPEN = "/home/erez/notes/plan.md";
  const T1 = "2026-08-17T09:00:00.000Z";
  const T2 = "2026-08-17T09:30:00.000Z";

  // Restored from autosave against a file that has since moved on: the case the
  // whole feature exists for.
  const changedUnderneath = (extra) =>
    boot({
      savedContent: "<h1>Stale</h1>",
      savedPath: OPEN,
      savedMtime: T1,
      disk: new Map([[OPEN, { content: "# Fresh", modified: T2 }]]),
      ...extra,
    });

  const inStep = (extra) =>
    boot({
      savedContent: "<h1>Same</h1>",
      savedPath: OPEN,
      savedMtime: T1,
      disk: new Map([[OPEN, { content: "# Same", modified: T1 }]]),
      ...extra,
    });

  confirmAnswer = true;
  r = changedUnderneath();
  await r.reloadFile();
  check("reload re-reads the open file", r.reads.includes(`read:${OPEN}`));
  check("and the document comes from disk", r.html() === "# Fresh");
  check("and the file's mtime becomes the new baseline", r.mtimeNow() === T2);
  check("which is persisted like the path", r.store.get("marky-file-mtime") === T2);
  check("and the marker clears", r.labelNow() === "plan.md");

  r = boot({ savedContent: "<h1>Real work</h1>" });
  await r.reloadFile();
  check("reload with no file open reads nothing", !r.reads.length);

  // Reload is destructive by definition — it is the discard path as much as the
  // refresh one — so it is the one place that has to ask.
  r = changedUnderneath();
  await settle();
  r.type();
  confirmAnswer = false;
  await r.reloadFile();
  check("reload asks before discarding edits", /Unsaved edits/.test(r.asked.at(-1) || ""));
  check("and cancelling reads nothing", !r.reads.some((s) => s.startsWith("read:")));
  check("and leaves the edits in place", r.labelNow() === "plan.md (edited, disk changed)");

  confirmAnswer = true;
  await r.reloadFile();
  check("confirming discards them", r.labelNow() === "plan.md");

  r = changedUnderneath({ disk: new Map() });
  await r.reloadFile();
  check("reloading a file that is gone keeps the open path", r.pathNow() === OPEN);
  check("and does not move the baseline", r.mtimeNow() === T1);
  check(
    "and does not claim to have reloaded",
    !r.find("open-file").innerHTML.includes("Reloaded!"),
  );

  r = changedUnderneath();
  await settle();
  check(
    "a page load checks the file behind the document it restored",
    r.labelNow() === "plan.md (disk changed)",
  );
  check("with a stat, not a re-read", r.reads.join() === `stat:${OPEN}`);

  r = changedUnderneath({ savedDirty: "1" });
  await settle();
  check(
    "our edits and everybody else's are both reported",
    r.labelNow() === "plan.md (edited, disk changed)",
  );

  r = inStep();
  await settle();
  check("a file nobody touched is not flagged", r.labelNow() === "plan.md");
  r.disk.set(OPEN, { content: "# Changed", modified: T2 });
  await r.focus();
  check("coming back to the window notices the change", r.labelNow() === "plan.md (disk changed)");

  r = inStep();
  await settle();
  r.disk.set(OPEN, { content: "# Changed", modified: T2 });
  await r.reveal();
  check("so does switching back to the tab", r.labelNow() === "plan.md (disk changed)");

  // A document restored from before any of this shipped has no baseline, and
  // there is no honest way to invent one: we do not know when it was read.
  r = boot({ savedContent: "<h1>x</h1>", savedPath: OPEN, disk: new Map() });
  await r.focus();
  check("no baseline, no disk check", !r.reads.length);

  r = changedUnderneath();
  await settle();
  await r.clear();
  check("clear drops the persisted baseline", !r.store.has("marky-file-mtime"));

  r = boot({ savedContent: "<p><br></p>", savedPath: OPEN, savedMtime: T1 });
  check("and a blank document never restores one", !r.store.has("marky-file-mtime"));

  // The flag with teeth: a save over a file that moved on destroys whatever
  // moved it, and there is no merge on offer.
  r = changedUnderneath();
  await settle();
  confirmAnswer = false;
  let saved = await r.saveFile(OPEN);
  check("a save over a changed file asks first", /changed on disk/.test(r.asked.at(-1) || ""));
  check("and declining writes nothing", saved === false && !r.writes.length);

  confirmAnswer = true;
  saved = await r.saveFile(OPEN);
  check("confirming writes", saved === true && r.writes.join() === OPEN);
  check("and the write re-baselines", r.mtimeNow() === r.disk.get(OPEN).modified);
  check("so the next check is quiet", (await r.focus(), r.labelNow() === "plan.md"));

  r = inStep();
  await settle();
  confirmAnswer = false;
  saved = await r.saveFile(OPEN);
  check("an untouched file saves without asking", saved === true && !r.asked.length);

  // Both the button and its menu entry carry "save-file", and the menu closes
  // itself on the way through — so a flash on the clicked element would land
  // inside a menu nobody is looking at, and still be there next time it opens.
  r = inStep();
  await settle();
  r.clickAction("save-file", true);
  await settle();
  check(
    "saving from the menu flashes the toolbar button",
    r.find("save-file").innerHTML.includes("Saved!"),
  );
  check(
    "and leaves the menu entry alone",
    r.find("save-file", true).innerHTML === "",
  );

  // Save As writes somewhere the baseline says nothing about, so it is not the
  // open file's staleness that should stand in its way.
  r = changedUnderneath();
  await settle();
  confirmAnswer = false;
  saved = await r.saveFile("/home/erez/notes/copy.md");
  check("saving elsewhere is not blocked by the open file's baseline", saved === true);
  check("and the copy becomes the open file", r.pathNow() === "/home/erez/notes/copy.md");
  confirmAnswer = true;
}
