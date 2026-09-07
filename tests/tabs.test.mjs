// The per-tab state boundaries (TODO 4.1). A tab is a whole document, so every
// module that owns part of one exposes its own park/adopt pair and a swap moves
// all of them at once -- the shape undo.js already had.
//
// What is under test here is not that a tab bar works: there is no tab bar yet.
// It is that parking a document and adopting it back is lossless, that adopting
// nothing is a blank document rather than a half-cleared one, and that the two
// pieces of shared state which do not live in the module that names them -- the
// toolbar label, and Turndown's own options -- follow the swap. Both of those
// fail silently: a stale label points Ctrl+S at a filename, and a stale bullet
// marker writes the wrong list style into the next file saved.
//
// Stage 4 adds the list operations, and with them the one thing this suite could
// not fake: undo.js is now loaded for real rather than stubbed, because what is
// under test is an ordering -- content, then history, then the file state whose
// savepoint is an id inside that history -- and a stub of undoPark/undoAdopt
// would agree with any order at all.
//
// toolbar.js, markdown-style.js, app.js, undo.js and file-api.js load
// concatenated into one scope, the way the page runs them.

import { loadSource, makeEl, markdownitStub, walk } from "./dom.mjs";

const HOME = "/home/x";

const DIALOG_IDS = [
  "formatBar", "fileInput", "fileDialog", "dialogTitle", "dialogClose",
  "dialogPathBar", "dialogEntries", "dialogSaveRow", "dialogFilename",
  "dialogSaveConfirm",
];

// `withTabs` decides whether tabs.js is in the bundle, which is the difference
// between the app and an exported document -- and between this suite and the
// file-path one, which boots the same modules without it and must keep reading
// and writing the flat key names.
//
// `seed` fills the store with flat keys the way a session from before tabs
// existed left them. `refuse` and `swallow` are the two ways a localStorage
// write fails: throwing, and the quieter one where setItem reports success and
// stores nothing.
// `hold` is a deferred the file reads await, so a test can stand inside an
// operation's own await window and ask whether a switch is allowed there.
// `fakeTimers` replaces setTimeout with a queue the test drains itself, which is
// the only way to see that flushing the autosave cancels the debounce rather
// than racing it.
function boot({ withTabs = false, seed = {}, refuse = [], swallow = [],
  quiet = false, hold = null, disk = new Map(), fakeTimers = false,
  failRender = false } = {}) {
  const store = new Map();
  for (const [key, value] of Object.entries(seed)) store.set(key, value);
  // Every localStorage write, in order. Park and adopt must add none of their
  // own: which key a tab's state is persisted under belongs to whoever owns the
  // tab list, not to the modules the state lives in.
  const writes = [];
  const listeners = {};

  const timers = new Map();
  let timerId = 0;

  const toolbar = makeEl();
  toolbar.className = "toolbar";
  const extra = new Map([["editor", makeEl()]]);
  extra.get("editor").id = "editor";
  for (const id of DIALOG_IDS) extra.set(id, makeEl());

  const document = {
    createElement: (t) => makeEl(t),
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
    withTabs
      ? ["toolbar.js", "markdown-style.js", "app.js", "undo.js", "tabs.js", "file-api.js"]
      : ["toolbar.js", "markdown-style.js", "app.js", "undo.js", "file-api.js"],
    {
      document,
      runCommand: () => true,
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => {
          writes.push(k);
          if (refuse.includes(k)) throw new Error("QuotaExceededError");
          if (swallow.includes(k)) return;
          store.set(k, v);
        },
        removeItem: (k) => {
          writes.push(k);
          store.delete(k);
        },
      },
      window: {
        addEventListener(event, fn) {
          (listeners[event] ||= []).push(fn);
        },
        matchMedia: () => ({ matches: false }),
        markdownit: markdownitStub(),
        // No range: undo.js stores a caret offset when there is one and null
        // when there is not, and every check here is about which document is on
        // screen rather than where the caret landed in it.
        getSelection: () => ({ rangeCount: 0, removeAllRanges() {}, addRange() {} }),
      },
      navigator: { clipboard: {} },
      // openFile awaits both renderers outside its own try, so a renderer that
      // throws throws out of the whole operation -- the path the counter's
      // `finally` exists for.
      renderMermaidDiagrams: async () => {
        if (failRender) throw new Error("mermaid blew up");
      },
      renderLatex: async () => {},
      fetch: async (url, opts) => {
        if (opts && opts.method === "POST") {
          const body = JSON.parse(opts.body);
          disk.set(body.path, body.content);
          return {
            ok: true,
            json: async () => ({ path: body.path, modified: "2026-09-07T12:00:00.000Z" }),
          };
        }
        if (url.startsWith("/api/file")) {
          if (hold) await hold.promise;
          const filePath = decodeURIComponent(url.match(/path=([^&]*)/)[1]);
          if (!disk.has(filePath)) {
            return { ok: false, json: async () => ({ error: "File not found" }) };
          }
          return {
            ok: true,
            json: async () => ({
              path: filePath,
              content: disk.get(filePath),
              modified: "2026-09-07T10:00:00.000Z",
            }),
          };
        }
        if (url.startsWith("/api/browse")) {
          return { ok: true, json: async () => ({ path: HOME, parent: null, entries: [] }) };
        }
        return { ok: true, json: async () => ({ home: HOME }), text: async () => "" };
      },
      TurndownService: class {
        options = {};
        addRule() {}
        turndown(h) {
          return h;
        }
      },
      notify: () => {},
      ask: () => Promise.resolve(false),
      // The deliberate-failure cases warn on purpose. Left unmuted they print
      // into the run output, where an expected warning reads exactly like a
      // suite going wrong.
      console: quiet ? { ...console, warn() {}, error() {} } : console,
      setTimeout: fakeTimers
        ? (fn) => {
          timerId += 1;
          timers.set(timerId, fn);
          return timerId;
        }
        : setTimeout,
      clearTimeout: fakeTimers ? (id) => timers.delete(id) : clearTimeout,
      URL: globalThis.URL,
      Blob: class {},
      Date,
      // undo.js raises one when it applies a snapshot, so autosave, the dirty
      // flag and the outline all hear an undo the way they hear a keystroke.
      Event,
    },
    "; const out = { filePark, fileAdopt, markdownStylePark, markdownStyleAdopt," +
      " adoptMarkdownStyle," +
      " fileState: () => ({ currentFilePath, isDirty, fileMtime, diskChanged," +
      "   cleanPosition, dialogDir })," +
      " setFileState: (o) => { currentFilePath = o.currentFilePath;" +
      "   isDirty = o.isDirty; fileMtime = o.fileMtime;" +
      "   diskChanged = o.diskChanged; cleanPosition = o.cleanPosition;" +
      "   dialogDir = o.dialogDir; renderCurrentFile(); }," +
      " mdState: () => ({ style: markdownStyle, source: markdownSource," +
      "   references: referenceDefinitions })," +
      " turndownOptions: () => turndownService.options," +
      " label: () => currentFileLabel.textContent," +
      " documentKey, flushAutosave, editor, markClean," +
      " openFile, reloadFile, saveFile, saveFileAs, saveCurrentOrPrompt," +
      " showOpenDialog, closeDialog, checkDiskChanged," +
      " fileOperationInFlight, operationCount: () => fileOperations," +
      " undo, undoReset, undoDepth: () => history.undoStack.length," +
      (withTabs
        // Read as functions rather than captured once: every stage-4 check is
        // about what the list looks like *after* an operation moved it.
        ? " tabIds: () => openTabs.map((tab) => tab.id)," +
          " activeTab: () => activeTabId," +
          " tabRecord: (id) => openTabs.find((tab) => tab.id === id)," +
          " tabsSwitchAllowed, newTab, switchToTab, closeTab, tabsBackgroundDirty"
        : "") +
      " }; return out;",
  );

  // `store`, `writes` and the fake timer queue belong to this harness rather
  // than to the loaded scope, so they are merged in here instead of reached for
  // from the tail.
  return {
    ...api,
    store,
    writes,
    disk,
    pendingTimers: () => timers.size,
    fireInput: () => {
      for (const fn of api.editor.listeners.input || []) fn({});
    },
    // What a keystroke looks like from the outside: mutate, then announce it,
    // which is the order a browser does it in and the order undo.js assumes.
    type: (text) => {
      api.editor.innerHTML = api.editor.innerHTML.replace("</p>", text + "</p>");
      for (const fn of api.editor.listeners.input || []) fn({ inputType: "insertText" });
    },
    fireWindow: (event, arg) => {
      for (const fn of listeners[event] || []) fn(arg);
    },
  };
}

const TAB_A = {
  currentFilePath: "/home/x/notes/plan.md",
  isDirty: true,
  fileMtime: "2026-09-07T10:00:00.000Z",
  diskChanged: true,
  cleanPosition: 7,
  dialogDir: "/home/x/notes",
};

const TAB_B = {
  currentFilePath: "/home/x/other/log.md",
  isDirty: false,
  fileMtime: "2026-09-07T11:00:00.000Z",
  diskChanged: false,
  cleanPosition: 7,
  dialogDir: "/home/x/other",
};

const BLANK = {
  currentFilePath: null,
  isDirty: false,
  fileMtime: null,
  diskChanged: false,
  cleanPosition: null,
  dialogDir: null,
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default async function run(check) {
  // --- file-api.js -------------------------------------------------------

  {
    const app = boot();
    app.setFileState(TAB_A);
    const parked = app.filePark();

    check("filePark returns the state it found", same(parked, TAB_A));
    check("filePark leaves the module blank", same(app.fileState(), BLANK));
  }

  {
    const app = boot();
    app.setFileState(TAB_A);
    app.filePark();
    app.fileAdopt(TAB_A);
    check("fileAdopt restores every field", same(app.fileState(), TAB_A));
  }

  {
    const app = boot();
    app.setFileState(TAB_A);
    app.fileAdopt(null);
    check("fileAdopt(null) is a document with no file", same(app.fileState(), BLANK));
  }

  // The whole point of the pair: two documents held at once, neither leaking
  // into the other. TAB_A and TAB_B deliberately share a cleanPosition of 7 --
  // undo.js mints ids from zero inside each history bundle, so equal ids across
  // two tabs is the normal case rather than a contrived one, and a swap that
  // carried one tab's savepoint into the other would report a dirty document
  // clean.
  {
    const app = boot();
    app.setFileState(TAB_A);
    const a = app.filePark();
    app.fileAdopt(TAB_B);
    const b = app.filePark();
    app.fileAdopt(a);

    check("a parked document comes back whole after another was adopted",
      same(app.fileState(), TAB_A));
    check("the other document is still intact in its own bundle", same(b, TAB_B));
  }

  // The label is the only thing on screen that says which file Ctrl+S writes
  // to, and it lives in toolbar.js rather than in the module holding the path.
  {
    const app = boot();
    app.fileAdopt(TAB_A);
    check("adopting renders the incoming file's label",
      app.label() === "plan.md (edited, disk changed)");
    app.fileAdopt(null);
    check("adopting nothing clears the label", app.label() === "");
  }

  {
    const app = boot();
    app.setFileState(TAB_A);
    const before = app.writes.length;
    const parked = app.filePark();
    app.fileAdopt(parked);
    check("neither park nor adopt writes to storage", app.writes.length === before);
  }

  // --- app.js ------------------------------------------------------------

  // A document whose markdown was read: sniffed conventions, an indexed block,
  // and the Turndown options that go with them. Both `+` and `*emphasis*` are
  // away from Turndown's own defaults (`*` and `_`), so a stale option shows up
  // as a wrong value rather than coinciding with the right one.
  const SOURCE = "+   one\n+   two\n\n*emphasis* in a paragraph.\n";

  {
    const app = boot();
    app.adoptMarkdownStyle(SOURCE, false);
    const live = app.mdState();
    const parked = app.markdownStylePark();

    check("markdownStylePark returns the state it found",
      parked.style === live.style && parked.source === live.source &&
      parked.references === live.references);
    check("markdownStylePark leaves nothing indexed",
      app.mdState().source.size === 0);
    check("markdownStylePark restores Turndown's own bullet marker",
      app.turndownOptions().bulletListMarker === "*");
  }

  {
    const app = boot();
    app.adoptMarkdownStyle(SOURCE, false);
    const parked = app.markdownStylePark();
    app.markdownStyleAdopt(parked);
    const back = app.mdState();

    check("markdownStyleAdopt restores the sniffed style",
      back.style === parked.style);
    check("markdownStyleAdopt restores the block index", back.source === parked.source);
    check("markdownStyleAdopt restores the reference definitions",
      back.references === parked.references);
    // The failure this exists for: one shared Turndown instance serialises every
    // tab, so an adopt that moved the index but left the previous document's
    // marker behind would write `*` into a file written with `+`, in a block
    // that had not been edited.
    check("markdownStyleAdopt pushes the document's own marker onto Turndown",
      app.turndownOptions().bulletListMarker === "+");
    check("markdownStyleAdopt pushes the document's own emphasis delimiter",
      app.turndownOptions().emDelimiter === "*");
  }

  {
    const app = boot();
    app.adoptMarkdownStyle(SOURCE, false);
    const before = app.writes.length;
    const parked = app.markdownStylePark();
    app.markdownStyleAdopt(parked);
    check("neither markdown park nor adopt writes to storage",
      app.writes.length === before);
  }

  {
    const app = boot();
    app.adoptMarkdownStyle(SOURCE, false);
    app.markdownStyleAdopt(null);
    check("markdownStyleAdopt(null) indexes nothing", app.mdState().source.size === 0);
    check("markdownStyleAdopt(null) is Turndown's own defaults",
      app.turndownOptions().bulletListMarker === "*" &&
      app.turndownOptions().emDelimiter === "_");
  }

  // --- tabs.js: storage and the migration onto it -------------------------

  // What a session from before tabs existed leaves behind: one document under
  // the flat names, and no list.
  const LEGACY = {
    markdownContent: "<p>hello</p>",
    markdownSource: "hello\n",
    "mandy-current-file": "/home/x/notes/plan.md",
    "mandy-dirty": "1",
    "mandy-file-mtime": "2026-09-07T10:00:00.000Z",
    "mandy-last-dir": "/home/x/notes",
  };

  const TAB_1 = {
    "mandy-tab-1-content": LEGACY.markdownContent,
    "mandy-tab-1-source": LEGACY.markdownSource,
    "mandy-tab-1-path": LEGACY["mandy-current-file"],
    "mandy-tab-1-dirty": LEGACY["mandy-dirty"],
    "mandy-tab-1-mtime": LEGACY["mandy-file-mtime"],
    "mandy-tab-1-dir": LEGACY["mandy-last-dir"],
  };

  const tabKeys = (app) => [...app.store.keys()].filter((k) => k.startsWith("mandy-tab-"));

  {
    const app = boot({ withTabs: true, seed: LEGACY });

    check("migration copies every flat key onto the first tab",
      Object.entries(TAB_1).every(([k, v]) => app.store.get(k) === v));
    check("migration deletes the flat keys it moved",
      Object.keys(LEGACY).every((k) => !app.store.has(k)));
    check("migration writes the tab list",
      app.store.get("mandy-tabs") === JSON.stringify({ order: [1], active: 1, seq: 1 }));
    check("documentKey resolves to the active tab once tabs.js is loaded",
      app.documentKey("content") === "mandy-tab-1-content" &&
      app.documentKey("dir") === "mandy-tab-1-dir");
    // The chain end to end: file-api.js reads the open file's path out of
    // storage at its own load time, so it has to be given the scoped key by
    // then -- which is the whole reason tabs.js loads ahead of it.
    check("the migrated document arrives with its file attached",
      app.label() === "plan.md (edited)");
  }

  {
    const app = boot({ withTabs: true });
    check("a session with nothing stored opens one tab",
      app.tabIds().length === 1 && app.activeTab() === 1);
    check("a session with nothing stored writes no document keys",
      tabKeys(app).length === 0);
  }

  {
    const app = boot({
      withTabs: true,
      seed: { ...LEGACY, "mandy-tabs": JSON.stringify({ order: [3], active: 3, seq: 3 }) },
    });
    check("a session that already has a list does not migrate again",
      Object.entries(LEGACY).every(([k, v]) => app.store.get(k) === v));
    check("a stored list decides which tab is active",
      app.documentKey("content") === "mandy-tab-3-content");
  }

  {
    const app = boot({
      withTabs: true,
      seed: { ...LEGACY, "mandy-tabs": JSON.stringify({ order: [3, 4], active: 9, seq: 4 }) },
    });
    check("an active id that is not in the order falls back to the first tab",
      app.documentKey("content") === "mandy-tab-3-content");
  }

  {
    const app = boot({
      withTabs: true, quiet: true,
      seed: { ...LEGACY, "mandy-tabs": "{not json" },
    });
    check("a corrupt list is treated as no list rather than throwing during load",
      app.store.get("mandy-tab-1-content") === LEGACY.markdownContent);
  }

  // The failure this whole dance exists for. A migration that deleted the flat
  // keys before proving the copies readable would lose the user's open document
  // outright, so a failure anywhere has to leave every original exactly where
  // it was -- and the session then runs on the flat names, as one document with
  // no list, rather than on a tab list pointing at storage the document is not
  // under.
  for (const [label, options] of [
    ["a write that throws", { refuse: ["mandy-tab-1-source"] }],
    ["a write that reports success and stores nothing", { swallow: ["mandy-tab-1-content"] }],
  ]) {
    const app = boot({ withTabs: true, quiet: true, seed: LEGACY, ...options });

    check(`${label} leaves every flat key where it was`,
      Object.entries(LEGACY).every(([k, v]) => app.store.get(k) === v));
    check(`${label} leaves no half-migrated tab keys behind`, tabKeys(app).length === 0);
    check(`${label} writes no tab list`, !app.store.has("mandy-tabs"));
    check(`${label} falls back to the flat key names`,
      app.documentKey("content") === "markdownContent");
    check(`${label} still shows the document's own file`,
      app.label() === "plan.md (edited)");
  }

  // --- stage 3: the switch lock, and flushing the autosave ----------------

  // Every file operation has an await between naming a path and touching the
  // bytes. With one document that window is harmless; with two, a switch inside
  // it writes one document over another document's file. The settled answer is
  // to refuse the switch rather than have each site capture its own copy, so
  // what is under test is the predicate the switch will consult -- there is no
  // switch yet to drive through it.

  const deferred = () => {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  };

  {
    const app = boot({ withTabs: true });
    check("nothing is in flight at rest", app.fileOperationInFlight() === false);
    check("a switch is allowed at rest", app.tabsSwitchAllowed() === true);
  }

  {
    const hold = deferred();
    const app = boot({
      withTabs: true, hold, disk: new Map([["/home/x/f.md", "hi\n"]]),
    });
    const done = app.openFile("/home/x/f.md");

    check("an open still awaiting its read refuses a switch",
      app.tabsSwitchAllowed() === false);
    hold.resolve();
    await done;
    check("the open gives its turn back when it finishes",
      app.fileOperationInFlight() === false);
  }

  // The counter has to count rather than latch: reloadFile calls openFile, and a
  // boolean would be cleared by the inner one's exit while the outer was still
  // running -- which is exactly the window the guard exists for.
  {
    const hold = deferred();
    const app = boot({
      withTabs: true, hold, disk: new Map([["/home/x/f.md", "hi\n"]]),
    });
    app.setFileState({ ...BLANK, currentFilePath: "/home/x/f.md" });
    const done = app.reloadFile();
    await Promise.resolve();

    check("a nested operation takes its own turn", app.operationCount() === 2);
    hold.resolve();
    await done;
    check("both turns come back", app.operationCount() === 0);
  }

  {
    const app = boot({ withTabs: true });
    // Nothing on disk, so the read fails and the operation returns early.
    await app.openFile("/home/x/gone.md");
    check("an operation that returns early gives its turn back",
      app.fileOperationInFlight() === false);
  }

  // The case the counter's `finally` is actually for. openFile awaits the two
  // renderers outside its own try/catch, so one of them throwing throws out of
  // the operation -- and a turn left behind would refuse every switch for the
  // rest of the session, with nothing on screen saying why.
  {
    const app = boot({
      withTabs: true, failRender: true, disk: new Map([["/home/x/f.md", "hi\n"]]),
    });
    let threw = false;
    try {
      await app.openFile("/home/x/f.md");
    } catch {
      threw = true;
    }
    check("an operation that throws still throws", threw);
    check("an operation that throws gives its turn back",
      app.operationCount() === 0 && app.tabsSwitchAllowed() === true);
  }

  // The dialog is in flight in its own right. showOpenDialog returns as soon as
  // the dialog is rendered and the pick arrives later on a click, so the counter
  // alone would leave the entire picking phase unguarded.
  {
    const app = boot({ withTabs: true });
    await app.showOpenDialog();
    check("an open file dialog refuses a switch with no operation running",
      app.operationCount() === 0 && app.tabsSwitchAllowed() === false);
    app.closeDialog();
    check("closing the dialog allows switching again", app.tabsSwitchAllowed() === true);
  }

  // The opposite requirement: these run on every window focus and every
  // visibilitychange, so locking on them would refuse switches at moments with
  // nothing on screen to explain why.
  {
    const app = boot({ withTabs: true, disk: new Map([["/home/x/f.md", "hi\n"]]) });
    app.setFileState({ ...BLANK, currentFilePath: "/home/x/f.md", fileMtime: "old" });
    const done = app.checkDiskChanged();
    check("a background disk check does not refuse a switch",
      app.tabsSwitchAllowed() === true);
    await done;
  }

  // Autosave is not a file operation and the lock does not cover it. A switch
  // inside the 1s debounce would leave the outgoing tab's last edits written
  // nowhere -- the timer resolves its key when it fires, so it would write the
  // incoming tab's content under the incoming tab's key and be none the wiser.
  {
    const app = boot({ withTabs: true, fakeTimers: true });
    app.editor.innerHTML = "<p>one</p>";
    app.fireInput();
    check("an edit schedules a debounced write", app.pendingTimers() === 1);

    app.editor.innerHTML = "<p>two</p>";
    app.flushAutosave();
    check("flushing writes the document as it stands now",
      app.store.get("mandy-tab-1-content") === "<p>two</p>");
    check("flushing cancels the debounce rather than racing it",
      app.pendingTimers() === 0);
  }

  {
    const app = boot({ withTabs: true, fakeTimers: true });
    app.editor.innerHTML = "<p>only</p>";
    app.flushAutosave();
    check("flushing with nothing pending still writes",
      app.store.get("mandy-tab-1-content") === "<p>only</p>");
  }

  // --- stage 4: the list operations ---------------------------------------

  // Nothing in the app makes a second tab yet -- New is rewired in stage 5,
  // alongside the bar that makes one visible -- so this is the only place two
  // documents have ever existed at once. Which is the point: every check below
  // is of a failure that cannot happen while there is one document to be wrong
  // about, and goes live the moment there are two.

  {
    const app = boot({ withTabs: true, fakeTimers: true });
    app.editor.innerHTML = "<p>first</p>";
    const id = app.newTab();

    check("newTab appends a tab and makes it active",
      id === 2 && same(app.tabIds(), [1, 2]) && app.activeTab() === 2);
    check("newTab persists the list it just changed",
      app.store.get("mandy-tabs") ===
        JSON.stringify({ order: [1, 2], active: 2, seq: 2 }));
    // The reason parkActive flushes before the active id moves. The debounce is
    // still pending here, and documentKey resolves when it is called, so a
    // flush on the far side of the flip would write this document under the new
    // tab's key and tab 1's edits would be written nowhere at all.
    check("the outgoing document is written under its own key before the swap",
      app.store.get("mandy-tab-1-content") === "<p>first</p>");
    check("keys now resolve to the new tab",
      app.documentKey("content") === "mandy-tab-2-content");
    check("the new tab is a blank document", app.editor.innerHTML === "<p><br></p>");
    // Clean at position 0 rather than at null: a blank tab has a history, it
    // just has nothing in it, so there is a savepoint to measure the first edit
    // against. null is what a document restored across a page load has.
    check("the new tab has no file behind it",
      app.label() === "" && same(app.fileState(), { ...BLANK, cleanPosition: 0 }));
  }

  // The round trip, through every module that owns a piece of a document.
  {
    const app = boot({ withTabs: true, fakeTimers: true, seed: LEGACY });
    app.editor.innerHTML = "<p>hello</p>";
    app.adoptMarkdownStyle(SOURCE, false);

    app.newTab();
    check("switching away leaves Turndown on its own defaults",
      app.turndownOptions().bulletListMarker === "*");
    check("switching away leaves nothing of the outgoing document indexed",
      app.mdState().source.size === 0);

    app.editor.innerHTML = "<p>second</p>";
    const returned = app.switchToTab(1);

    check("switching back returns the content",
      returned === true && app.editor.innerHTML === "<p>hello</p>");
    check("switching back returns the file", app.label() === "plan.md (edited)");
    // The silent one: one shared Turndown instance serialises every tab, so a
    // swap that moved the block index but left the other document's marker
    // behind writes `*` into a file written with `+`, in a block nobody edited.
    check("switching back returns the document's own bullet marker",
      app.turndownOptions().bulletListMarker === "+");
    check("the tab left behind kept its own content",
      app.store.get("mandy-tab-2-content") === "<p>second</p>");
  }

  {
    const app = boot({ withTabs: true, fakeTimers: true });
    check("switching to the tab already showing is a no-op that succeeds",
      app.switchToTab(1) === true);
    check("switching to a tab that does not exist fails rather than blanking",
      app.switchToTab(9) === false && app.activeTab() === 1);
  }

  // Two histories, never merged. undo.js mints ids from zero inside each
  // bundle, so tab A's id 1 and tab B's id 1 name different states -- which is
  // why the history and the file state have to move in one swap.
  {
    const app = boot({ withTabs: true, fakeTimers: true });
    app.editor.innerHTML = "<p>start</p>";
    // What app.js does on window load, once the document has settled. Without
    // it the first edit's snapshot is taken *after* the mutation and there is
    // nothing to undo back to -- a property of undo.js rather than of tabs, but
    // one this harness has to reproduce because it never fires that load.
    app.undoReset();
    app.type("A");

    app.newTab();
    check("a new tab starts with no history of its own", app.undoDepth() === 0);
    app.type("B");
    app.switchToTab(1);

    check("the history that comes back is the tab's own", app.undoDepth() === 1);
    app.undo();
    check("undo in one tab hands back that tab's own content",
      app.editor.innerHTML === "<p>start</p>");
  }

  // The sharpest silent failure in the item: cleanPosition is an id inside one
  // history bundle, so leaving it a single global reports a dirty document
  // clean -- which switches off the unsaved-work guard and the beforeunload
  // warning together, and only when two tabs' edit counts line up.
  {
    const app = boot({ withTabs: true, fakeTimers: true });
    app.editor.innerHTML = "<p>start</p>";
    app.undoReset();
    app.setFileState({ ...BLANK, currentFilePath: "/home/x/a.md" });
    app.markClean();
    app.type("A");
    check("the document on screen reads edited", app.label() === "a.md (edited)");

    // The second tab reaches the same position id by the same route, which is
    // the collision that cannot be contrived away: both counts start at zero.
    app.newTab();
    app.setFileState({ ...BLANK, currentFilePath: "/home/x/b.md" });
    app.markClean();
    app.type("B");
    app.markClean();

    app.switchToTab(1);
    check("a tab still reads edited after another was shown",
      app.label() === "a.md (edited)");
    // The savepoint travelled with the history it was minted in, so undoing
    // back to it reads clean -- against this tab's id, not the other tab's.
    app.undo();
    check("undoing back to the tab's own savepoint reads clean again",
      app.label() === "a.md");
  }

  // Stage 3's gate, now with something to refuse. Every file operation has an
  // await between naming a path and touching the bytes; a switch inside one
  // writes one document over another document's file, with the toast reporting
  // success.
  {
    const hold = deferred();
    const app = boot({
      withTabs: true, hold, disk: new Map([["/home/x/f.md", "hi\n"]]),
    });
    app.newTab();
    const done = app.openFile("/home/x/f.md");

    check("a switch is refused while a file operation is in flight",
      app.switchToTab(1) === false && app.activeTab() === 2);
    check("a new tab is refused there too, rather than made and not switched to",
      app.newTab() === null && same(app.tabIds(), [1, 2]));

    hold.resolve();
    await done;
    check("the same switch is allowed once the operation finishes",
      app.switchToTab(1) === true && app.activeTab() === 1);
  }

  {
    const app = boot({ withTabs: true });
    app.newTab();
    await app.showOpenDialog();
    check("an open file dialog refuses a switch", app.switchToTab(1) === false);
    app.closeDialog();
    check("closing it allows the switch again", app.switchToTab(1) === true);
  }

  // --- stage 4: a tab this session has never shown -------------------------

  // What a page load leaves: a list of ids, six storage keys per tab, and no
  // undo history anywhere -- it does not survive a reload. So a tab with no
  // parked bundle hydrates from its own keys, which is the same question the
  // load-time restore asks about the one document it brings back.
  const RESTORED = {
    "mandy-tabs": JSON.stringify({ order: [1, 2], active: 1, seq: 2 }),
    "mandy-tab-1-content": "<p>showing</p>",
    "mandy-tab-2-content": "<p>log</p>",
    "mandy-tab-2-source": SOURCE,
    "mandy-tab-2-path": "/home/x/other/log.md",
    "mandy-tab-2-mtime": "2026-09-07T11:00:00.000Z",
    "mandy-tab-2-dir": "/home/x/other",
  };

  {
    const app = boot({ withTabs: true, seed: RESTORED });
    app.editor.innerHTML = "<p>showing</p>";
    app.switchToTab(2);

    check("a never-shown tab comes back from its own content key",
      app.editor.innerHTML === "<p>log</p>");
    check("a never-shown tab comes back with its file",
      app.label() === "log.md" && app.fileState().fileMtime === RESTORED["mandy-tab-2-mtime"]);
    check("a never-shown tab comes back with its own dialog directory",
      app.fileState().dialogDir === "/home/x/other");
    // Re-sniffed from the source key rather than left on the previous
    // document's options, which is the same failure as a stale bullet marker
    // and reaches the file the same way.
    check("a never-shown tab re-sniffs its markdown style",
      app.turndownOptions().bulletListMarker === "+" && app.mdState().source.size > 0);
    check("a clean restored tab gets a savepoint in the history now live",
      app.fileState().isDirty === false && app.fileState().cleanPosition === 0);
  }

  {
    const app = boot({
      withTabs: true,
      seed: { ...RESTORED, "mandy-tab-2-dirty": "1" },
    });
    app.editor.innerHTML = "<p>showing</p>";
    app.switchToTab(2);

    // Its history did not survive the reload, so there is no position to call
    // clean until the next real save -- exactly what a page load does with the
    // one document it restores, and the reason that reading is one function.
    check("a dirty restored tab comes back dirty with no savepoint",
      app.label() === "log.md (edited)" && app.fileState().cleanPosition === null);
  }

  {
    const app = boot({ withTabs: true, seed: RESTORED });
    app.editor.innerHTML = "<p>showing</p>";
    app.switchToTab(2);
    app.switchToTab(1);

    check("the tab that hydrated parks like any other",
      app.tabRecord(2).file.currentFilePath === "/home/x/other/log.md");
    check("switching back to the first tab restores it from storage too",
      app.editor.innerHTML === "<p>showing</p>" && app.label() === "");
  }

  // --- stage 4: closing --------------------------------------------------

  {
    const app = boot({ withTabs: true, seed: RESTORED });
    app.editor.innerHTML = "<p>showing</p>";

    check("closing a background tab succeeds", app.closeTab(2) === true);
    check("closing a background tab leaves the document on screen alone",
      app.activeTab() === 1 && app.editor.innerHTML === "<p>showing</p>");
    check("closing a tab forgets every key that was its document",
      [...app.store.keys()].every((k) => !k.startsWith("mandy-tab-2-")));
    check("closing a tab persists the shorter list",
      app.store.get("mandy-tabs") === JSON.stringify({ order: [1], active: 1, seq: 2 }));
    check("closing a tab that is not open fails rather than shifting the list",
      app.closeTab(9) === false && same(app.tabIds(), [1]));
  }

  {
    const app = boot({ withTabs: true, seed: RESTORED });
    app.editor.innerHTML = "<p>showing</p>";

    check("closing the tab on screen succeeds", app.closeTab(1) === true);
    check("the neighbour is adopted, not just made active",
      app.activeTab() === 2 && app.editor.innerHTML === "<p>log</p>" &&
      app.label() === "log.md");
    // Deliberately no flush and no park on the way out: the document is being
    // thrown away, and flushing would write it straight back under the key the
    // close had just removed.
    check("the closed tab's keys stay gone",
      [...app.store.keys()].every((k) => !k.startsWith("mandy-tab-1-")));
  }

  // Settled (TODO 4.1): never no document at all. Five modules grab `editor`
  // once at load and assume a document behind it, so a no-document state is a
  // null case none of them has.
  {
    const app = boot({ withTabs: true, fakeTimers: true, seed: LEGACY });
    app.editor.innerHTML = "<p>hello</p>";

    app.closeTab(1);
    check("closing the last tab leaves exactly one tab",
      app.tabIds().length === 1 && app.activeTab() === app.tabIds()[0]);
    check("closing the last tab does not reuse its id", app.tabIds()[0] === 2);
    check("closing the last tab leaves a blank untitled document",
      app.editor.innerHTML === "<p><br></p>" && app.label() === "");
    check("closing the last tab forgets the document it held",
      [...app.store.keys()].every((k) => !k.startsWith("mandy-tab-1-")));
  }

  {
    const hold = deferred();
    const app = boot({
      withTabs: true, hold, seed: RESTORED, disk: new Map([["/home/x/f.md", "hi\n"]]),
    });
    const done = app.openFile("/home/x/f.md");

    check("closing the tab on screen is refused while an operation is in flight",
      app.closeTab(1) === false && same(app.tabIds(), [1, 2]));
    // Closing a background tab swaps nothing, so it answers to no gate: the
    // operation in flight is about the document on screen and this one is not
    // that document.
    check("closing a background tab is allowed there", app.closeTab(2) === true);

    hold.resolve();
    await done;
  }

  // --- stage 4: what beforeunload asks ------------------------------------

  {
    const app = boot({ withTabs: true, fakeTimers: true });
    check("nothing is dirty in the background with one tab",
      app.tabsBackgroundDirty() === false);

    app.editor.innerHTML = "<p>start</p>";
    app.undoReset();
    app.setFileState({ ...BLANK, currentFilePath: "/home/x/a.md" });
    app.markClean();
    app.type("A");
    app.newTab();

    check("a parked tab's unsaved edits count as dirty",
      app.tabsBackgroundDirty() === true);
    check("the tab on screen is never the background answer",
      app.switchToTab(1) === true && app.tabsBackgroundDirty() === false);
  }

  {
    const app = boot({
      withTabs: true,
      seed: { ...RESTORED, "mandy-tab-2-dirty": "1" },
    });
    check("a restored tab's own dirty key counts, with no bundle to read",
      app.tabsBackgroundDirty() === true);
  }

  // The wiring, rather than the predicate: the browser shows its own string and
  // will not wait on us, so all this can do is ask for the prompt at all -- and
  // a window shut over an unsaved background document is the same loss whether
  // or not it was the one showing.
  {
    const app = boot({ withTabs: true, seed: { ...RESTORED, "mandy-tab-2-dirty": "1" } });
    app.editor.innerHTML = "<p>showing</p>";
    let prevented = false;
    app.fireWindow("beforeunload", { preventDefault: () => { prevented = true; } });

    check("beforeunload warns for a dirty tab that is not the one showing",
      prevented === true);
  }

  {
    const app = boot({ withTabs: true, seed: RESTORED });
    app.editor.innerHTML = "<p>showing</p>";
    let prevented = false;
    app.fireWindow("beforeunload", { preventDefault: () => { prevented = true; } });

    check("beforeunload stays quiet when nothing anywhere is dirty",
      prevented === false);
  }
}
