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

// ── The bar ──────────────────────────────────────────────────────────────────

// toolbar.js ships this empty and we fill it, the same arrangement `.toolbar`
// itself has: html-export.js hand-writes its own copy of the page shell, so
// markup in index.html would be a second copy to keep in step. An exported
// document has no second row at all, so this is null there and every function
// below returns early.
const tabBar = document.getElementById("tabBar");

// A document with no file behind it. Shown rather than an empty tab, because a
// nameless strip of dots says nothing about which document is which.
const UNTITLED = "Untitled";

// The tab drawn for the document on screen, as of the last redraw. Only the
// arrow keys read it, and only to keep focus with the selection.
let activeTabElement = null;

// Name and marks for one tab, from whichever of the three places currently
// holds them: the live modules for the tab on screen, its parked bundle for one
// this session has shown and moved off, and its own storage keys for one
// restored by a page load and never opened. Three sources, one shape, so the
// bar draws every tab through the same function.
function tabDescriptor(tab) {
  if (tab.id === activeTabId) return fileDescriptor();
  if (tab.file) {
    return { path: tab.file.currentFilePath, isDirty: tab.file.isDirty, diskChanged: tab.file.diskChanged };
  }
  return {
    path: localStorage.getItem(tabKeyFor(tab.id, "path")),
    isDirty: localStorage.getItem(tabKeyFor(tab.id, "dirty")) === "1",
    // Nothing has stat'd this tab's file since the page loaded, so there is
    // nothing to claim about it. Switching to it re-baselines and the check on
    // the next window focus answers properly.
    diskChanged: false,
  };
}

// The two marks are not exclusive — edit a file an agent has since rewritten
// and both are true, which is exactly the case worth being loud about.
//
// They differ on the no-file case, and the single-document label got that
// wrong: it gated *both* on there being a path, because with no filename on
// screen there was no subject for "(edited)" to attach to. A tab supplies the
// subject, and the two questions are not the same one. "Disk changed" really is
// meaningless without a file — there is nothing for the document to be out of
// step with. "Edited" is not: unsaved work in a document that has never been
// saved anywhere is the *most* urgent version of it, and `beforeunload` already
// says so, since documentIsDirty() has never cared whether there was a path.
// Leaving the dot off there would have the bar and the close-the-window warning
// disagreeing about the same document.
function tabMarks({ path, isDirty, diskChanged }) {
  const marks = [];
  if (isDirty) marks.push("edited");
  if (path && diskChanged) marks.push("disk changed");
  return marks;
}

// Which dot, if any. Edited wins outright over disk-changed: it is the more
// urgent of the two and the combination needs no third colour, since the title
// says the whole sentence either way.
function tabDotState(descriptor) {
  const marks = tabMarks(descriptor);
  if (marks.includes("edited")) return "dirty";
  if (marks.includes("disk changed")) return "stale";
  return "";
}

// The one document a session with no tab list has (see restoreTabs). It stands
// for itself: `tabDescriptor` reads it as the active one, since null is what
// activeTabId is in that state.
const TABS_UNLISTED = [{ id: null }];

function buildTab(tab) {
  const descriptor = tabDescriptor(tab);
  const name = descriptor.path ? descriptor.path.split("/").pop() : UNTITLED;
  const marks = tabMarks(descriptor);
  const sentence = marks.length ? `${name} (${marks.join(", ")})` : name;

  const element = document.createElement("div");
  element.className = "tab";
  element.setAttribute("role", "tab");
  if (tab.id !== null) element.setAttribute("data-tab", String(tab.id));
  element.setAttribute("aria-selected", tab.id === activeTabId ? "true" : "false");
  // Roving tabindex, the way the menu bar does it: one stop for the whole strip
  // rather than one per document.
  element.setAttribute("tabindex", tab.id === activeTabId ? "0" : "-1");
  // A colour-only signal is a soft accessibility gap on its own, so the
  // sentence the old text label spelled out has to still exist as something
  // that can be read aloud -- and the title is where the full path goes now
  // that there is no room for one on screen.
  element.setAttribute("aria-label", sentence);
  element.title = descriptor.path ? `${descriptor.path}${marks.length ? ` — ${marks.join(", ")}` : ""}` : sentence;

  const dot = document.createElement("span");
  dot.className = "tab-dot";
  dot.setAttribute("data-state", tabDotState(descriptor));
  dot.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "tab-name";
  label.textContent = name;

  element.appendChild(dot);
  element.appendChild(label);

  // No close on the unlisted document: there is no list to take it out of, and
  // a control that cannot do its one job is worse than an absent one.
  if (tab.id !== null) {
    const close = document.createElement("button");
    close.className = "tab-close";
    close.setAttribute("data-close", String(tab.id));
    close.setAttribute("tabindex", "-1");
    close.setAttribute("aria-label", `Close ${name}`);
    close.title = `Close ${name}`;
    close.textContent = "×";
    element.appendChild(close);
  }

  return element;
}

// Redrawn whole rather than patched. The bar is at most a handful of elements
// and every input to it -- the list, which tab is active, and three fields per
// document -- can change in one operation, so diffing would be a second model
// of the same thing with its own way of going stale.
//
// file-api.js's renderCurrentFile() calls this, which is what keeps the dot in
// step: every setDirty, setDiskChanged, setCurrentFile and adopt already ends
// there.
function renderTabBar() {
  if (!tabBar) return;

  tabBar.innerHTML = "";
  activeTabElement = null;
  // A session whose migration failed runs on the flat key names with one
  // document and no list. It still has a file open, and a bar that drew nothing
  // would take the only thing naming that file off the screen entirely.
  const showing = activeTabId === null ? TABS_UNLISTED : openTabs;
  for (const tab of showing) {
    const element = buildTab(tab);
    // Kept from the build rather than found again afterwards: the arrows move
    // focus to whichever tab the switch landed on, and asking the DOM for it
    // would be a second way of knowing something we have just decided.
    if (tab.id === activeTabId) activeTabElement = element;
    tabBar.appendChild(element);
  }
}

// Closing a document the user cannot see cannot ask a question about it:
// confirmDiscard reads the *active* document's dirty flag and filename, which
// is the right question wearing the wrong subject. So a dirty tab is switched
// to before it is asked about, and the dialog then names a document that is on
// screen. That is why this needs no new parameter on the guard and no second
// implementation of it -- and why a clean tab closes with neither a switch nor
// a dialog, since there is nothing to lose and nothing to look at.
async function requestCloseTab(id) {
  const tab = findTab(id);
  if (!tab) return false;

  const descriptor = tabDescriptor(tab);
  if (descriptor.isDirty) {
    if (!switchToTab(id)) return false;
    const proceed = await confirmDiscard({
      title: "Close this document?",
      detail: "The auto-saved copy goes too.",
      discardLabel: "Discard and close",
    });
    if (!proceed) return false;
  }

  return closeTab(id);
}

// One listener for the whole strip rather than one per tab, so a redraw does
// not have to rebind anything. Deliberately not routed through
// onToolbarAction: a tab is not an action, and that dispatcher's contract is
// modules registering for a named action rather than one control per row of a
// list.
if (tabBar) {
  tabBar.addEventListener("click", (event) => {
    const closing = event.target.closest && event.target.closest("[data-close]");
    if (closing) {
      // The close sits inside the tab, so without this the click selects the
      // tab on its way past and a cancelled close leaves you somewhere you did
      // not ask to be.
      event.stopPropagation();
      requestCloseTab(Number(closing.getAttribute("data-close")));
      return;
    }

    const tab = event.target.closest && event.target.closest("[data-tab]");
    if (tab) switchToTab(Number(tab.getAttribute("data-tab")));
  });
}

// Cycle by position in the bar, wrapping at both ends -- the same rule the menu
// bar's arrows follow, and what every tab strip people arrive from does.
function switchByOffset(step) {
  if (activeTabId === null || openTabs.length < 2) return false;

  const at = openTabs.findIndex((tab) => tab.id === activeTabId);
  const next = (at + step + openTabs.length) % openTabs.length;
  return switchToTab(openTabs[next].id);
}

// Ctrl+9 is the last tab rather than the ninth, which is the convention every
// browser tab strip already teaches; 1-8 are positional.
function switchByNumber(number) {
  const tab = number === 9 ? openTabs[openTabs.length - 1] : openTabs[number - 1];
  return tab ? switchToTab(tab.id) : false;
}

// Its own listener rather than a branch in one of the four that already exist,
// because this is the only one of them that must not fire through an open
// dialog -- and it does not have to test for that itself, since every path
// below goes through switchToTab and the gate lives there.
//
// What is measured: all of these reach the page in Chrome 148 on macOS, where
// the browser's own tab bindings are Cmd+1-9. What is not: whether
// preventDefault suppresses the browser's own action for Ctrl+Tab, and what
// Windows and Linux do, where Ctrl+1-9 *is* the browser's binding.
// tests/tab-shortcut-check.html is what answers that, and until it has been run
// somewhere other than here this set is provisional.
document.addEventListener("keydown", (event) => {
  if (activeTabId === null) return;

  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key === "Tab") {
    event.preventDefault();
    switchByOffset(event.shiftKey ? -1 : 1);
    return;
  }

  if (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey &&
      /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    switchByNumber(Number(event.key));
    return;
  }

  // role="tablist" promises the arrows, and the promise is the reason they are
  // here: the strip announces itself as a tab list to anything reading the
  // page. Scoped to focus being in the bar, so the arrow keys still belong to
  // the document everywhere else.
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  if (!tabBar || !tabBar.contains(document.activeElement)) return;

  event.preventDefault();
  // Focus follows the selection, or the next arrow press would be measured from
  // a tab that is no longer the one showing — and the strip is a roving
  // tabindex, so the element focus was on has just stopped being a tab stop.
  if (switchByOffset(event.key === "ArrowRight" ? 1 : -1) && activeTabElement) {
    activeTabElement.focus();
  }
});
