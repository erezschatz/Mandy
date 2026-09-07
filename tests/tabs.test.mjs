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
// toolbar.js, markdown-style.js, app.js and file-api.js load concatenated into
// one scope, the way the page runs them.

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
function boot({ withTabs = false, seed = {}, refuse = [], swallow = [],
  quiet = false } = {}) {
  const store = new Map();
  for (const [key, value] of Object.entries(seed)) store.set(key, value);
  // Every localStorage write, in order. Park and adopt must add none of their
  // own: which key a tab's state is persisted under belongs to whoever owns the
  // tab list, not to the modules the state lives in.
  const writes = [];
  const listeners = {};

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
      ? ["toolbar.js", "markdown-style.js", "app.js", "tabs.js", "file-api.js"]
      : ["toolbar.js", "markdown-style.js", "app.js", "file-api.js"],
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
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
      },
      navigator: { clipboard: {} },
      renderMermaidDiagrams: async () => {},
      renderLatex: async () => {},
      fetch: async () => ({
        ok: true,
        json: async () => ({ home: HOME }),
        text: async () => "",
      }),
      TurndownService: class {
        options = {};
        addRule() {}
        turndown(h) {
          return h;
        }
      },
      notify: () => {},
      undoReset() {},
      undoPosition: () => null,
      ask: () => Promise.resolve(false),
      // The deliberate-failure cases warn on purpose. Left unmuted they print
      // into the run output, where an expected warning reads exactly like a
      // suite going wrong.
      console: quiet ? { ...console, warn() {}, error() {} } : console,
      setTimeout,
      clearTimeout,
      URL: globalThis.URL,
      Blob: class {},
      Date,
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
      " documentKey" +
      (withTabs ? ", tabs: { list: openTabs, active: activeTabId }" : "") +
      " }; return out;",
  );

  // `store` and `writes` belong to this harness rather than to the loaded
  // scope, so they are merged in here instead of reached for from the tail.
  return { ...api, store, writes };
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
      app.tabs.list.length === 1 && app.tabs.active === 1);
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
}
