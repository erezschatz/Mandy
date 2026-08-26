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

// Lets a test park the answer the next dialog gives, and read back what it was
// asked. Reload, Open and overwrite all hinge on it.
//
// `confirmAnswer` is the two-way reading: true takes the action, false backs
// out. It stays useful for the three-button guards because their extra button
// is Save, and "agreed" there still means the destructive one. `confirmChoice`
// names a button outright, which is the only way to exercise Save.
let confirmAnswer = true;
let confirmChoice = null;

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
  entries = [],
  disk = new Map(),
  serverUp = true,
}) {
  const store = new Map();
  const browsed = [];
  const reads = [];
  const writes = [];
  let undoPos = null;
  let up = serverUp;
  const asked = [];
  const askedActions = [];
  const toasts = [];
  // Clear goes through runCommand rather than replacing editor.innerHTML, and
  // this suite does not load execcommand.js — recorded rather than executed.
  const commands = [];
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
    createRange: () => ({ setStart() {}, collapse() {}, selectNodeContents() {} }),
    execCommand() {},
  };

  const api = loadSource(
    ["toolbar.js", "markdown-style.js", "app.js", "file-api.js"],
    {
      document,
      // execcommand.js is not in this suite's bundle: Clear's own weight is
      // the recording below, not what a real execCommand does with it.
      runCommand: (cmd) => {
        commands.push(cmd);
        return true;
      },
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
              json: async () => ({ path, parent: "/home", entries }),
            };
        }
        // /api/home. A dead server is a connection failure, not a bad
        // response, so simulate it the way a browser actually sees one.
        if (!up) throw new Error("Failed to fetch");
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
      notify: (message) => toasts.push(message),
      // undo.js is not in this suite's bundle; openFile and New both
      // re-baseline the history, and a missing stub makes them throw.
      undoReset() {},
      // Stands in for undo.js's position id. Controlled by the returned
      // `setUndoPosition` so a test can simulate an edit followed by an undo
      // landing back on the id a save recorded, without driving the real
      // stack — that half is undo.test.mjs's job.
      undoPosition: () => undoPos,
      // The real one resolves a promise, which is the whole reason the guards
      // could grow a third button — so the stub has to resolve one too, or the
      // callers pass a pending promise off as a yes.
      ask: (message, options = {}) => {
        asked.push(message);
        askedActions.push(options.actions || []);
        const actions = options.actions || [];
        // Declining resolves to `dismiss`. The real default is null; false
        // here instead, so a two-way caller reads it the same way and the
        // suites written before there was a third button keep their meaning.
        const dismiss = "dismiss" in options ? options.dismiss : false;

        if (confirmChoice) {
          // An array is a queue: the discard guard's Save can raise the
          // overwrite dialog behind it, and the two need different answers.
          const want = Array.isArray(confirmChoice) ? confirmChoice.shift() : confirmChoice;
          const hit = actions.find((a) => a.label === want);
          return Promise.resolve(hit ? hit.value : dismiss);
        }
        if (!actions.length) return Promise.resolve(confirmAnswer);

        // Every dialog in front/ marks Cancel as the default, so the first
        // action that is not the default is the one the user came to press.
        const affirmative = actions.find((a) => !a.default);
        if (confirmAnswer) return Promise.resolve(affirmative ? affirmative.value : true);
        return Promise.resolve(dismiss);
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
    askedActions,
    toasts,
    commands,
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
    // Simulates undo.js reporting a position, for the tests that drive the
    // dirty flag's undo half without the real stack.
    setUndoPosition: (n) => {
      undoPos = n;
    },
    // Flips whether /api/home answers, for the tests driving the file-server
    // liveness check. Takes effect on the next probe, not retroactively.
    setServerUp: (v) => {
      up = v;
    },
    // Typing, and anything else that goes through execCommand: file-api.js
    // hangs the dirty flag off the editor's own input event.
    type: () => {
      for (const fn of editorEl.listeners.input || []) fn();
    },
    // app.js's handler is registered first and does the actual emptying; this
    // one only drops the file association on top of it. It used to be enough to
    // fake the emptied editor and dispatch, because app.js's confirm() returned
    // before the dispatcher moved on. Now app.js stops on a dialog, so this has
    // to settle — which is the ordering the whole thing hinges on: run it too
    // early and isBlankContent sees the document still full and keeps the path.
    newDocument: async () => {
      toolbar.listeners.click[0]({
        target: document.querySelector('[data-action="new"]'),
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
    // Opening goes through the browser rather than through openFile directly,
    // because the guard is on the row click: calling openFile would walk
    // straight past the thing under test.
    // The name lives in a child span, and the stub's innerHTML = "" does not
    // empty `children`, so rows pile up across directories — hence the last
    // match rather than the first.
    pick: async (name) => {
      const rows = extra
        .get("dialogEntries")
        .children.filter((node) =>
          (node.children || []).some((c) => c.textContent === name)
        );
      const row = rows.at(-1);
      if (!row) throw new Error(`no dialog row for ${name}`);
      await row.listeners.click[0]();
      await settle();
    },
    // The browser asks the page whether it may leave. Nothing awaits it there
    // either, which is the reason this guard is returnValue and not ask().
    unload: () => {
      const event = { preventDefault() {}, returnValue: undefined };
      for (const fn of listeners.beforeunload || []) fn(event);
      return event.returnValue;
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
  await r.newDocument();
  check("new asks before discarding", /removes all content/.test(r.asked.at(-1) || ""));
  check("new drops the persisted path", !r.store.has("marky-current-file"));
  check("new keeps the last directory",
    r.store.get("marky-last-dir") === "/home/erez/projects/docs");

  // The ordering this suite exists to protect, from the other side: a cancelled
  // New must leave the file association alone. file-api.js's hook decides
  // that by looking at the editor, so it can only be right if it runs after
  // app.js's dialog has been answered rather than while it is still open.
  r = boot({
    savedContent: "<h1>Real work</h1>",
    savedPath: "/home/erez/notes/plan.md",
  });
  r.fill("<h1>Real work</h1>");
  confirmAnswer = false;
  await r.newDocument();
  check("a cancelled new leaves the document alone",
    r.html() === "<h1>Real work</h1>");
  check("a cancelled new keeps the file open",
    r.pathNow() === "/home/erez/notes/plan.md");
  check("and keeps it persisted",
    r.store.get("marky-current-file") === "/home/erez/notes/plan.md");
  confirmAnswer = true;

  // --- Clear is not New ------------------------------------------------------
  //
  // Clear used to be this same guarded, file-dropping action under a different
  // name. Now it is an ordinary edit — no dialog, no touch to any of the state
  // New still resets — and this is the suite that would notice if the two
  // handlers drifted back together.

  r = boot({
    savedContent: "<h1>Real work</h1>",
    savedPath: "/home/erez/notes/plan.md",
    savedDir: "/home/erez/projects/docs",
  });
  r.fill("<h1>Real work</h1>");
  r.clickAction("clear");
  await settle();
  check("clear asks nothing", r.asked.length === 0);
  check("clear goes through runCommand, not a document replacement",
    r.commands.includes("delete"));
  check("clear keeps the file open", r.pathNow() === "/home/erez/notes/plan.md");
  check("and keeps it persisted",
    r.store.get("marky-current-file") === "/home/erez/notes/plan.md");

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
  await r.newDocument();
  check("new drops the marker with the path", r.labelNow() === "");
  check("new drops the persisted flag", !r.store.has("marky-dirty"));

  // Nothing to be out of step with when no file is open, so the marker would
  // be a bare "(edited)" hanging next to the app title.
  r = boot({ savedContent: "<h1>Real work</h1>" });
  r.type();
  check("no marker without a file open", r.labelNow() === "");

  // --- the marker follows undo ----------------------------------------------
  //
  // The flag used to only ever latch true on an edit and never unlatch, so
  // undoing back to a saved document still claimed it was edited. undo.js's
  // own stack is stubbed out above; `setUndoPosition` stands in for it, so
  // this drives file-api.js's half of the fix — that a position equal to the
  // one recorded at the last save reads clean, and anything else does not —
  // without needing the real stack, which undo.test.mjs already covers.

  r = boot({ savedContent: "<h1>Real work</h1>", savedPath: "/home/erez/notes/plan.md" });
  r.setUndoPosition(0);
  await r.saveFile("/home/erez/notes/plan.md");
  check("save records the position as clean", r.labelNow() === "plan.md");

  r.setUndoPosition(1);
  r.type();
  check("moving away from it marks the document edited",
    r.labelNow() === "plan.md (edited)");

  r.setUndoPosition(0);
  r.type(); // what applyUndoSnapshot's synthetic input event triggers
  check("undoing back to the saved position clears it again",
    r.labelNow() === "plan.md");
  check("and drops the persisted flag too", !r.store.has("marky-dirty"));

  r.setUndoPosition(2);
  r.type();
  r.setUndoPosition(3); // content restored by hand, not by undo/redo
  r.type();
  check("a different position never reads clean by coincidence",
    r.labelNow() === "plan.md (edited)");

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
  await r.newDocument();
  check("new drops the persisted baseline", !r.store.has("marky-file-mtime"));

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

  // Confirmation used to be a flash on the toolbar's Save button, deliberately
  // not on whatever was clicked, because the split menu closed behind the click
  // and took the flash with it. Every way in is a menu item now, so there is no
  // button left to flash and it has to be said somewhere still on screen.
  r = inStep();
  await settle();
  r.clickAction("save-file");
  await settle();
  check(
    "saving from the menu says so where it can be seen",
    /^Saved plan\.md$/.test(r.toasts.at(-1) || ""),
  );
  check(
    "and leaves the menu item's own markup alone",
    r.find("save-file").innerHTML === "",
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

  // --- the unsaved-work guard ----------------------------------------------
  //
  // Three ways out of a dirty document used to throw it away without asking, or
  // ask without saying what was at stake. They go through one guard now, and
  // the property that matters is not that a dialog appears — it is that every
  // answer other than "discard" leaves the document exactly where it was.

  const OTHER = "/home/x/other.md";
  const dirtyWith = (extra = {}) =>
    boot({
      savedContent: "<h1>Mine</h1>",
      savedPath: OPEN,
      savedMtime: T1,
      entries: [{ name: "other.md", isDir: false }],
      disk: new Map([
        [OPEN, { content: "# Mine", modified: T1 }],
        [OTHER, { content: "# Other", modified: T1 }],
      ]),
      ...extra,
    });

  // Open replaced the document outright, with no check at all, while Reload
  // guarded the very same call. That inconsistency was the bug.
  r = dirtyWith();
  await settle();
  r.fill("<h1>Mine</h1>");
  r.type();
  confirmAnswer = false;
  await r.showOpenDialog();
  await r.pick("other.md");
  check("opening over unsaved edits asks first", /Unsaved edits/.test(r.asked.at(-1) || ""));
  check("and names the file at risk", /plan\.md/.test(r.asked.at(-1) || ""));
  check("a cancelled open leaves the document alone", r.html() === "<h1>Mine</h1>");
  check("and leaves the file open", r.pathNow() === OPEN);
  check("and never reads the other file", !r.reads.includes(`read:${OTHER}`));

  // Cancel has to be the dismissible answer as well as a button: Escape and the
  // backdrop resolve to `dismiss`, and a guard that read those as agreement
  // would throw the work away on a stray keypress.
  check(
    "the guard dismisses to cancel, not to discard",
    (r.askedActions.at(-1) || []).some((a) => a.label === "Cancel" && a.default),
  );
  check(
    "and offers Save alongside the destructive answer",
    (r.askedActions.at(-1) || []).some((a) => a.value === "save"),
  );

  r = dirtyWith();
  await settle();
  r.fill("<h1>Mine</h1>");
  r.type();
  confirmAnswer = true;
  await r.showOpenDialog();
  await r.pick("other.md");
  check("discarding opens the other file", r.pathNow() === OTHER);
  check("and the document comes from disk", r.html() === "# Other");

  // Nothing to lose, nothing to ask. A guard that fired on every Open would be
  // trained away inside a day.
  r = dirtyWith();
  await settle();
  await r.showOpenDialog();
  await r.pick("other.md");
  check("a clean document opens without asking", !r.asked.length);
  check("and still opens", r.pathNow() === OTHER);

  // The third button is the whole reason ask() is not a confirm() wrapper.
  r = dirtyWith();
  await settle();
  r.fill("<h1>Mine</h1>");
  r.type();
  confirmChoice = "Save";
  await r.showOpenDialog();
  await r.pick("other.md");
  check("choosing Save writes the open file first", r.writes.includes(OPEN));
  check("and then opens the other one", r.pathNow() === OTHER);
  confirmChoice = null;

  // The half that is easy to get wrong: a Save the user backed out of leaves
  // the edits unsaved, so the action waiting on it must not go ahead either.
  r = dirtyWith({ disk: new Map([
    [OPEN, { content: "# Mine", modified: T2 }],
    [OTHER, { content: "# Other", modified: T1 }],
  ]) });
  await settle();
  r.fill("<h1>Mine</h1>");
  r.type();
  confirmChoice = ["Save", "Cancel"];
  await r.showOpenDialog();
  await r.pick("other.md");
  check("a Save that was called off aborts the open", r.pathNow() === OPEN);
  check("and writes nothing", !r.writes.length);
  confirmChoice = null;

  // The overwrite guard gets the same third button, and its third answer is the
  // only one that resolves the dilemma rather than picking a side of it.
  r = changedUnderneath();
  await settle();
  confirmAnswer = false;
  await r.saveFile(OPEN);
  check(
    "the overwrite guard offers somewhere else to write",
    (r.askedActions.at(-1) || []).some((a) => a.value === "save-as"),
  );
  confirmAnswer = true;

  // beforeunload is the one guard that cannot use ask(): the browser will not
  // wait on a Promise, so all it gets is returnValue and the browser's wording.
  r = dirtyWith();
  await settle();
  check("a clean document closes without a prompt", r.unload() === undefined);
  r.fill("<h1>Mine</h1>");
  r.type();
  check("a dirty one asks the browser to stop", r.unload() === "");

  // --- the file server going away, and coming back --------------------------
  //
  // The startup probe used to be the only check there was, so a server that
  // died mid-session left the buttons claiming it was still there, and one
  // brought up after a dead start stayed disabled until a reload.
  // `focus` and `visibilitychange` are the same wake points checkDiskChanged
  // already used, reused here for the same reason: whatever changed while the
  // tab was away is cheapest to notice the moment it comes back.

  r = boot({ savedContent: "<h1>Real work</h1>", serverUp: false });
  await settle();
  check("a dead server disables Open", r.find("open-file").disabled === true);
  check("and says why", r.find("open-file").title.includes("not running"));
  check("and disables Save", r.find("save-file").disabled === true);

  r.setServerUp(true);
  await r.focus();
  check("coming back up re-enables Open", r.find("open-file").disabled === false);
  check("and clears the explanation", r.find("open-file").title === "");
  check("and re-enables Save", r.find("save-file").disabled === false);

  r = boot({ savedContent: "<h1>Real work</h1>", serverUp: true });
  await settle();
  check("a live server at boot leaves Open enabled",
    r.find("open-file").disabled === false);

  r.setServerUp(false);
  await r.reveal();
  check("dying mid-session disables it without a reload",
    r.find("open-file").disabled === true);
}
