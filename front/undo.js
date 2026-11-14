// Undo and redo, on our own stack rather than the browser's.
//
// The browser's own stack has nothing on it: the input layer cancels every
// `beforeinput` (model-input.js), so the engine never edits the document and
// never records an edit. The model is the document, and its history is kept
// here, as forks of the model with the caret beside each one.
//
// Two things drive the stack, and only two:
//
//   1. The editor's own `input` event, which every model edit dispatches once
//      it has rendered — typing, deleting, IME, paste, drop, cut, the formats
//      and the structural commands alike.
//   2. `undoReset()`, called wherever the document is *replaced* rather than
//      edited.
//
// That second one is the whole point of the file, and it is a deliberate line:
// history does not cross a document boundary. Undo after opening a file must
// not hand back the previous file's text — you would then be one Ctrl+S away
// from writing the old document into the new file's path. Every caller of the
// two doors a document arrives through — `loadDocumentMarkdown` and
// `loadBlankDocument` in app.js, which hand the model markdown to render — has
// to pick a side, and tests/undo.test.mjs counts that nothing outside the
// model's render assigns `editor.innerHTML`.
//
// `undoPark()` / `undoAdopt()` are the one sanctioned crossing of that line,
// for a tab switch — where the outgoing document is neither replaced nor edited
// but set aside to be returned to. Park detaches the whole history bundle for
// the caller to keep on the outgoing tab; adopt installs the incoming tab's
// bundle, or — given null — is exactly `undoReset()`. The bundle moves as a
// unit and the two stacks are never merged, which is what keeps an undo in one
// tab from ever reaching another tab's content.

// Deep enough that nobody reaches the end of it in normal editing, small enough
// that a large document cannot run the tab out of memory.
//
// **A model state is bigger than the HTML string this was sized for**, and for
// a while there was a byte budget here to bound that. It is gone, and the
// reasoning is in CHANGELOG.md: slice 6's step 7 makes a state share the
// contents of every paragraph the edit did not touch, which takes it to about
// the size of the document's outline — smaller than the string it replaced —
// so a budget would have been a ceiling nothing could reach. If states ever get
// heavy again, that is the moment to measure against the case that made them
// heavy, rather than to carry a guard sized for a case nobody has met.
const UNDO_LIMIT = 100;

// Consecutive edits of the same kind, close together in time, collapse into one
// step — otherwise every keystroke is its own undo and getting back to where
// you were takes a hundred of them. Only these types coalesce: anything else
// (Enter, bold, paste, a formatBlock) is a deliberate act and earns its own
// step. `inputType` is what makes that distinction available; a synthetic event
// has none, so a programmatic edit never coalesces into the typing before it.
const UNDO_COALESCE_MS = 600;
const UNDO_COALESCING = new Set([
  "insertText",
  "deleteContentBackward",
  "deleteContentForward",
]);

// The history is one detachable bundle, so a tab switch can set the whole thing
// aside and bring another back (undoPark / undoAdopt). Everything describing
// "the document's past" lives in here; `undoApplying` below does not — it is a
// re-entrancy guard on the current call, not document state.
//
// `nextId` identifies a state, not a position in the stack: a stack index goes
// stale the moment UNDO_LIMIT shifts everything down by one, and would then
// match whatever state has slid into that slot rather than the one that was
// there. An id minted once and never reused cannot — it is only ever revisited
// by literally undoing or redoing back to it, never recreated by two unrelated
// edits landing on the same id. file-api.js reads it (undoPosition) to know
// whether undo has brought the document back to the position it was last saved
// from. Ids are only ever compared within one bundle, so each document counting
// from zero is fine, and `undoReset()` deliberately lets it keep climbing so a
// savepoint id is never reused inside a bundle's life.
function freshHistory() {
  return {
    undoStack: [],
    redoStack: [],
    // The state the editor is in right now. Pushed onto the undo stack when the
    // next change arrives — which is why it has to be kept up to date even for
    // changes that coalesce and push nothing.
    current: null,
    nextId: 0,
    lastType: null,
    lastTime: 0,
    // Set by undoJoin(), cleared by the input event it merges.
    joinOnce: false,
  };
}

let history = freshHistory();

// Guards the listener against the input event `applyUndoSnapshot` raises for
// everyone else's benefit. Without it an undo would record itself as an edit.
let undoApplying = false;

// ── What a state is ──────────────────────────────────────────────────────────
//
// Everything else in this file is about the stack — coalescing, UNDO_LIMIT,
// the redo branch, the ids file-api.js reads, park and adopt — and only these
// two operations know what a state actually *is*. They were the two seams
// between the old core and the model while both ran (TODO 3.1, stage 2's slice
// 6); the old core's half went in stage 4's slice 5, and the seams stayed
// because keeping what a state is in two functions is still what keeps the
// stack machinery the `tabs` suite guards ignorant of it.

/**
 * What the document is right now: a **fork** of the model, which copies the
 * document's outline and shares its contents, and marks the live document as
 * sharing them, so the next edit copies the one block it touches before writing
 * to it. A state that moved with the document would not be a state, and copying
 * the whole document to prevent that was slice 6's step 1 — step 7 is why it no
 * longer has to.
 *
 * The caret is a `(blockId, offset)`, which is a block *id* rather than a block
 * precisely so that a state holds no reference into the document it is a copy
 * of.
 */
function undoCaptureState() {
  const doc = modelCurrentDocument();
  if (!doc) return { model: null, selection: null };
  return { model: modelForkDocument(doc), selection: undoCaptureModelCaret(doc) };
}

function undoCaptureModelCaret(doc) {
  return modelRecordSelection(modelReadSelection(editor, doc));
}

/**
 * Put a state on screen, caret and all, then focus.
 *
 * **It installs a fork of the stored state**, never the stored object. The next
 * edit mutates what it installs, so handing over the entry itself would edit
 * the history — and the way that shows is undo, redo, undo, where the second
 * visit finds the state the first one left behind. A fork is enough because it
 * copies the outline and re-marks the contents as shared, so the first edit
 * after a restore copies what it is about to write to.
 *
 * A state with no model is one taken before a document existed. Nothing is put
 * on screen for it, which is the honest answer: there was nothing.
 */
function undoApplyState(snapshot) {
  if (snapshot.model) {
    // Resolved against the clone being installed, never against the state:
    // the caret has to land in the tree that is about to be rendered, which is
    // the whole reason a state records ids rather than blocks. It goes in
    // inside the render, in the render's own coordinates, because nothing may
    // hold a Range across one.
    const doc = modelForkDocument(snapshot.model);
    modelRestoreDocument(editor, doc, md, modelResolveSelection(doc, snapshot.selection));
  }
  if (editor.focus) editor.focus();
}

// ── The stack ────────────────────────────────────────────────────────────────

function undoSnapshot() {
  return { ...undoCaptureState(), id: history.nextId++ };
}

// The id of the document's current state. Undo and redo hand back a snapshot
// that already carries the id it was minted with, rather than calling
// undoSnapshot() again — that is what makes a round trip back to a state
// reproduce its original id instead of getting a new one.
function undoPosition() {
  return history.current ? history.current.id : null;
}

function applyUndoSnapshot(snapshot) {
  undoApplying = true;
  undoApplyState(snapshot);

  // Before the event, not after it. file-api.js's own input listener asks
  // undoPosition() where the document now is, and answering with the state we
  // have just left made undoing back to the last save go on reporting
  // "(edited)" — the exact thing the savepoint exists to prevent, and with it
  // an unsaved-work guard asking about a document that matches its file. It
  // had no way to show up until a suite drove the real stack past the real
  // listener, which is what stage 4 of the tabbed view needed.
  history.current = snapshot;
  history.lastType = null;

  // Autosave, the dirty flag and the outline all hang off `input`, and a
  // programmatic change does not raise one. Dispatched inside the guard so
  // every other listener hears it and ours does not.
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  undoApplying = false;
}

/**
 * Forget the history. For the sites that *replace* the document rather than
 * edit it — open, reload, new, upload, and the restore-or-welcome path at
 * startup. Call it after the content and any renderers have finished, so the
 * baseline is the document as the user will actually see it.
 */
function undoReset() {
  history.undoStack = [];
  history.redoStack = [];
  history.current = undoSnapshot();
  history.lastType = null;
  history.lastTime = 0;
}

/**
 * Merge the next edit into the step before it, whatever its type and however
 * long it has been. For a composition that **rewrites what was just typed**:
 * the macOS press-and-hold accent types the plain vowel as an ordinary
 * keystroke, waits for the user to pick from the popup — well past the
 * coalescing window — and then replaces that vowel. Without this, one Ctrl+Z
 * takes back the accent and leaves the vowel, which is not a thing anybody
 * typed. Found by hand in Firefox on 2026-09-23.
 */
function undoJoin() {
  history.joinOnce = true;
}

/**
 * Detach the whole history and leave a fresh one in its place. For a tab
 * switch: stash the returned bundle on the outgoing tab, put the incoming
 * document on screen, then undoAdopt that tab's stored bundle. Nothing
 * here touches the editor — the content swap is the caller's.
 */
function undoPark() {
  const parked = history;
  history = freshHistory();
  return parked;
}

/**
 * The savepoint a parked bundle would answer with: where its document was when
 * it was parked. For a save that finishes after its tab has left the screen,
 * which records the save against that bundle rather than the live history. The
 * bundle is otherwise opaque to its caller, so this is the one thing it may ask.
 */
function undoBundlePosition(bundle) {
  return bundle && bundle.current ? bundle.current.id : null;
}

/**
 * Install a history bundle as the live one. A bundle is trusted to match the
 * content the caller has already put on screen — nothing is re-snapshotted, so
 * the editor must be swapped first, exactly as undoReset() has to run after the
 * content settles. `undoAdopt(null)` is `undoReset()`: a fresh baseline taken
 * from whatever is in the editor now, for a tab with no history of its own yet.
 */
function undoAdopt(bundle) {
  if (bundle) {
    history = bundle;
    return;
  }
  undoReset();
}

function undo() {
  if (!history.undoStack.length) return false;
  history.redoStack.push(history.current || undoSnapshot());
  applyUndoSnapshot(history.undoStack.pop());
  return true;
}

function redo() {
  if (!history.redoStack.length) return false;
  history.undoStack.push(history.current || undoSnapshot());
  applyUndoSnapshot(history.redoStack.pop());
  return true;
}

editor.addEventListener("input", (event) => {
  if (undoApplying) return;
  if (!history.current) history.current = undoSnapshot();

  const type = event && event.inputType;
  const now = Date.now();
  const coalesce =
    history.joinOnce || (
      UNDO_COALESCING.has(type) &&
      type === history.lastType &&
      now - history.lastTime < UNDO_COALESCE_MS
    );

  if (!coalesce) {
    history.undoStack.push(history.current);
    if (history.undoStack.length > UNDO_LIMIT) history.undoStack.shift();
  }

  // Any fresh edit invalidates the redo branch, coalesced or not.
  history.redoStack = [];
  history.current = undoSnapshot();
  history.lastType = type;
  history.lastTime = now;
  history.joinOnce = false;
});

/**
 * Keep the state we are in up to date with where the caret *is*, not only
 * where it was when the state was taken.
 *
 * An undo puts back the caret its state carries, and a state used to carry the
 * caret from the moment it was taken — just after the edit *before* it. That
 * is the right place only if the caret never moved in between. Click
 * somewhere, type, undo, and the caret went back to wherever the previous edit
 * had left it; undo the first edit after opening a file, whose state was taken
 * with no caret at all, and it went nowhere — invisible in Firefox, with
 * arrow keys starting from the top. That was the caret half of the undo bug
 * once filed as TODO 1.6, found by hand on 2026-09-23 through
 * `tests/fixtures/undo-check.md`, and it was in both cores. So the state that is current follows the caret until the next
 * edit pushes it, and what an undo restores is **where the caret was when the
 * edit being undone began**.
 *
 * Only a caret inside the editor counts, so clicking the toolbar does not wipe
 * it, and not while undo is applying a state or an IME holds the text, when
 * what the selection points at is not yet the model's.
 */
function undoFollowCaret() {
  const state = history.current;
  if (undoApplying || !state) return;
  if (typeof modelInputComposing === "function" && modelInputComposing()) return;
  if (!state.model) return;
  const doc = modelCurrentDocument();
  const caret = doc ? undoCaptureModelCaret(doc) : null;
  if (caret) state.selection = caret;
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("selectionchange", undoFollowCaret);
}

// Registered as toolbar actions rather than bound to keys alone: the Edit menu
// renders them from the same spec every other item comes from, so the shortcut
// and the menu entry cannot drift into doing different things.
onToolbarAction("undo", () => undo());
onToolbarAction("redo", () => redo());

// The native stack is empty, because the engine never edits anything, so these
// preventDefault rather than falling through to a browser action that has
// nothing to undo — or, in an engine that ever did record something, would
// change the page behind the model's back.
document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = (event.key || "").toLowerCase();

  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    runToolbarAction("undo");
  } else if ((key === "z" && event.shiftKey) || key === "y") {
    event.preventDefault();
    runToolbarAction("redo");
  }
});
