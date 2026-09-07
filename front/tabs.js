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

// The documents open right now, in bar order. newTab() and closeTab() below are
// the only things that change the shape of this list, and switchToTab() the
// only thing that changes which of them is showing. Nothing in the app calls
// any of the three yet -- there is no bar to show a second tab in, and a tab
// the user can neither see nor get back from would be worse than no tabs at
// all, so New is rewired in stage 5 alongside the bar that makes one visible.
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

// ── The list operations ──────────────────────────────────────────────────────

// What a tab with nothing in it holds. The same markup app.js's New writes, and
// for the same reason: a document with no block in it has nowhere to put the
// caret.
const BLANK_DOCUMENT = "<p><br></p>";

// A record is `{ id }` and, once this session has shown a tab and moved off it,
// the three parked bundles -- `file`, `md`, `undo`. A tab restored from a page
// load has none of them: its persisted half is under its own six storage keys
// and its undo history did not survive the reload, so switching into one
// hydrates from storage instead. That is the same split the single-document app
// already lives with, one tab at a time.
function findTab(id) {
  return openTabs.find((tab) => tab.id === id) || null;
}

// Take the active document out of the modules that hold it and put it on its
// record. The content is not among them -- it is in the editor, and
// flushAutosave writes it to storage. That call has to happen here, before the
// active id moves: documentKey resolves when it is called, so a flush after the
// flip would write the outgoing document under the incoming tab's key.
function parkActive() {
  const tab = findTab(activeTabId);
  if (!tab) return;

  flushAutosave();
  tab.undo = undoPark();
  tab.file = filePark();
  tab.md = markdownStylePark();
}

// The other half, and the ordering in it is the whole of what stage 4 had to
// get right. The caller has already flipped activeTabId, so every key below
// resolves to the incoming tab.
//
// Content first, always: undoAdopt trusts the bundle to describe what is on
// screen and never re-snapshots, and undoAdopt(null) takes its fresh baseline
// from whatever is in the editor at that moment. Undo before file, always:
// cleanPosition is an id minted inside one history bundle, so the file state
// has to land on top of the history it was measured against or a dirty document
// reports clean -- and it only misfires when two tabs' edit counts line up, so
// nothing but the order itself will catch it.
function adoptActive(tab) {
  editor.innerHTML = localStorage.getItem(documentKey("content")) || BLANK_DOCUMENT;
  undoAdopt(tab.undo || null);

  if (tab.file) fileAdopt(tab.file);
  else fileAdoptStored();

  if (tab.md) markdownStyleAdopt(tab.md);
  else markdownStyleAdoptStored();

  focusDocumentStart();
}

// Every key naming a tab's document, gone. Called when a tab is closed rather
// than on any lighter occasion: these six *are* the document, and an id is
// never reused, so anything left behind is an orphan nothing will ever resolve
// to again.
function forgetTabStorage(id) {
  for (const name of Object.keys(DOCUMENT_KEYS)) {
    localStorage.removeItem(tabKeyFor(id, name));
  }
}

// Show a different document. Returns false when the switch was refused, so a
// caller driving this from a keystroke can leave the bar as it was rather than
// showing a tab that is not the one on screen.
function switchToTab(id) {
  // No list in play at all -- an unmigratable session (see restoreTabs) runs as
  // one document under the flat key names, and there is nothing to switch
  // between.
  if (activeTabId === null) return false;
  if (id === activeTabId) return true;
  if (!tabsSwitchAllowed()) return false;

  const incoming = findTab(id);
  if (!incoming) return false;

  parkActive();
  activeTabId = id;
  persistTabList();
  adoptActive(incoming);
  return true;
}

// A new blank document, and switch to it. Named for what New does rather than
// as the opposite of closeTab, because `openTab` sitting one letter away from
// the `openTabs` list it pushes onto is a line nobody should have to read
// twice. Appended rather than inserted beside the active tab: the bar has no
// other ordering to offer yet, and appending is what every Ctrl+T people arrive
// from does.
//
// Nothing is discarded here, which is why this asks nothing. Returns the new
// id, or null when the switch was refused -- a caller that gets null has made
// no tab, rather than having made one it failed to move to.
function newTab() {
  if (activeTabId === null) return null;
  if (!tabsSwitchAllowed()) return null;

  parkActive();
  tabSeq += 1;
  const tab = { id: tabSeq };
  openTabs.push(tab);
  activeTabId = tab.id;
  persistTabList();
  // No storage under its keys and no bundles on its record, so this blanks the
  // editor and adopts nothing everywhere -- the same path a restored tab takes,
  // reading a document that happens not to be there.
  adoptActive(tab);
  return tab.id;
}

// Throw a document away. Deliberately does not park and does not flush: the
// document is being discarded, and a flush would write it straight back under
// the key this just removed.
//
// It asks nothing either. confirmDiscard reads the *active* document's dirty
// flag and filename, so it cannot ask about a background tab at all -- guarding
// a close belongs to the close control, the same way Open and Reload guard at
// their own call sites rather than inside the thing they call.
function closeTab(id) {
  if (activeTabId === null) return false;

  const tab = findTab(id);
  if (!tab) return false;
  // Closing the tab on screen swaps the document, so it answers to the same
  // gate a switch does. Closing a background one touches nothing that is in
  // flight.
  if (id === activeTabId && !tabsSwitchAllowed()) return false;

  const index = openTabs.indexOf(tab);
  openTabs.splice(index, 1);
  forgetTabStorage(id);

  if (id !== activeTabId) {
    persistTabList();
    return true;
  }

  // Settled (TODO 4.1): never no document at all. app.js, undo.js, file-api.js,
  // format-bar.js and outline.js each grab `editor` once at load and assume a
  // document behind it, so a no-document state is a null case none of them has.
  // A fresh id rather than the one just closed, for the reason ids are never
  // reused: a recycled id inherits whatever of the old tab's keys outlived it.
  if (!openTabs.length) {
    tabSeq += 1;
    openTabs.push({ id: tabSeq });
  }

  // The tab that slid into the closed one's place, or the one before it when
  // the closed tab was last in the bar.
  const next = openTabs[index] || openTabs[index - 1];
  activeTabId = next.id;
  persistTabList();
  adoptActive(next);
  return true;
}

// Whether any document other than the one on screen has unsaved edits, for
// app.js's beforeunload. A tab this session has shown carries the answer in its
// parked file bundle; one restored from a page load and never opened carries it
// in its own `dirty` key, which is where a reload leaves it.
function tabsBackgroundDirty() {
  return openTabs.some((tab) => {
    if (tab.id === activeTabId) return false;
    if (tab.file) return tab.file.isDirty;
    return localStorage.getItem(tabKeyFor(tab.id, "dirty")) === "1";
  });
}
