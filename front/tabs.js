// The tab list (TODO 4.1). A tab is a whole document: its content, the file it
// came from, the markdown conventions it was written in and its undo history.
// None of that state lives here -- each module that already owns a piece of it
// exposes its own park/adopt pair, the way undo.js always has. What this file
// owns is which documents are open, which one is showing, and where each of
// them is persisted.
//
// Only the app loads it. An exported document holds exactly one document and
// has no file API, so it keeps the flat key names in app.js's DOCUMENT_KEYS and
// never sees a tab list -- which is also what the test suites that boot without
// this file are exercising.
//
// It must load after app.js, which defines DOCUMENT_KEYS and isBlankContent,
// and before file-api.js, which reads the open file's path out of storage at
// its own load time and has to be given the active tab's key by then.

const TABS_KEY = "mandy-tabs";
const TAB_PREFIX = "mandy-tab-";

// The documents open right now, in bar order. Stage 2 holds exactly one: there
// is no way to make a second yet, and no bar to show them in.
let openTabs = [];
// Null means no tab list is in play, and every key falls back to the flat name
// it had before this file existed. That is the state an unmigratable session
// runs in -- see restoreTabs below -- rather than a tab pointing at storage the
// document is not under.
let activeTabId = null;
// Ids are never reused. A recycled id would inherit whatever of the previous
// tab's keys had not been cleaned up, which is the document equivalent of the
// savepoint-id collision that made cleanPosition per-tab in the first place.
let tabSeq = 0;

function tabKeyFor(id, name) {
  return `${TAB_PREFIX}${id}-${name}`;
}

// app.js's documentKey() routes through this whenever the file is loaded, so
// every existing call site keeps its shape and only the name it resolves to
// changes.
function tabDocumentKey(name) {
  return activeTabId === null ? DOCUMENT_KEYS[name] : tabKeyFor(activeTabId, name);
}

function persistTabList() {
  try {
    localStorage.setItem(
      TABS_KEY,
      JSON.stringify({
        order: openTabs.map((tab) => tab.id),
        active: activeTabId,
        seq: tabSeq,
      }),
    );
  } catch (error) {
    // The list is small enough that this only happens on a quota already blown
    // by the documents themselves, and losing it costs the tab order on the
    // next load rather than any content: the documents are still under their
    // own keys, and a session that comes back to no list migrates trivially
    // into tab 1 again, which is the id it already had.
    console.warn("[Tabs] Could not persist the tab list:", error);
  }
}

// Move the one document Mandy has always stored under flat key names onto the
// first tab's keys. Copy, prove each value readable under its new name, and
// only then delete the originals -- a half-migrated document with the source of
// truth already deleted is the one outcome here that loses the user's work,
// and localStorage gives no transaction to lean on.
function migrateSingleDocument(id) {
  const copied = [];
  try {
    for (const name of Object.keys(DOCUMENT_KEYS)) {
      const value = localStorage.getItem(DOCUMENT_KEYS[name]);
      if (value === null) continue;

      const key = tabKeyFor(id, name);
      localStorage.setItem(key, value);
      // Read back rather than trusting setItem. A blown quota is exactly what
      // this is defending against and it does not always announce itself by
      // throwing -- Safari's private mode has historically accepted the write
      // and stored nothing.
      if (localStorage.getItem(key) !== value) {
        throw new Error(`${DOCUMENT_KEYS[name]} did not survive the copy`);
      }
      copied.push(key);
    }
  } catch (error) {
    for (const key of copied) localStorage.removeItem(key);
    throw error;
  }

  for (const name of Object.keys(DOCUMENT_KEYS)) {
    localStorage.removeItem(DOCUMENT_KEYS[name]);
  }
}

(function restoreTabs() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(TABS_KEY) || "null");
  } catch (error) {
    // A corrupt list is no list. Falling through to the migration below finds
    // no flat keys to move and opens a single empty tab, which is a better
    // answer than throwing during load and taking the whole app with it.
    console.warn("[Tabs] Could not read the tab list:", error);
  }

  if (stored && Array.isArray(stored.order) && stored.order.length) {
    openTabs = stored.order.map((id) => ({ id }));
    tabSeq = Number.isFinite(stored.seq) ? stored.seq : Math.max(...stored.order);
    // A stored active id that is not in the order is a list written by a
    // version that did something we no longer do; the first tab is a safe
    // reading of it either way.
    activeTabId = stored.order.includes(stored.active) ? stored.active : stored.order[0];
    return;
  }

  const id = tabSeq + 1;
  try {
    migrateSingleDocument(id);
  } catch (error) {
    // Every flat key is still exactly where it was, so this session runs as it
    // did before tabs existed: one document, no list, nothing lost. The next
    // load tries again.
    console.warn("[Tabs] Could not move the open document onto tab storage:", error);
    return;
  }

  openTabs = [{ id }];
  tabSeq = id;
  activeTabId = id;
  persistTabList();
})();

// The single gate every tab switch goes through. Stage 4's switch and stage 5's
// Ctrl+Tab / Ctrl+1-9 both call this rather than each testing their own
// conditions, so there is one answer to "may the document be swapped right now"
// instead of one per entry point.
//
// The mouse is already blocked while a dialog is up: `.notify-backdrop` and
// `.file-dialog` are both full-viewport `inset: 0` overlays, so a click cannot
// reach a tab bar behind one. The keyboard is not -- four document-level
// keydown listeners, in app.js, file-api.js, undo.js and toolbar.js, fire
// straight through an open dialog -- and that gap is the reason this exists as
// a function rather than as a CSS problem already solved.
//
// file-api.js is absent from an exported document, which has one document and
// nothing to switch between; its absence reads as "nothing in flight" rather
// than as a reason to refuse.
function tabsSwitchAllowed() {
  return !(typeof fileOperationInFlight === "function" && fileOperationInFlight());
}
