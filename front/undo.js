// Undo and redo, on our own stack rather than the browser's.
//
// The browser's native undo is fine right up until something assigns
// editor.innerHTML — open a file, paste markdown, start a new document,
// restore from autosave, load the welcome document — at which point the whole
// native stack is discarded and Ctrl+Z silently stops doing anything for the
// rest of the session. Silently is the problem: nothing looks broken, the
// shortcut just stops answering, and the first you know of it is when you
// needed it.
//
// So the document's history is kept here instead, as whole-innerHTML snapshots
// with the caret position beside them. Snapshots rather than a diff or a
// command log because contenteditable is not a data structure we control: the
// browser splits nodes on Enter, merges them on Backspace, normalises markup on
// paste and rewrites a trailing space to an NBSP behind our back. Anything
// finer-grained would have to model all of that correctly, and the failure mode
// of getting it wrong is a corrupted document.
//
// Two things drive the stack, and only two:
//
//   1. The editor's own `input` event, which covers typing, deleting, IME,
//      drag-and-drop, cut, native paste and every execCommand the format bar
//      runs. Also synthetic input events, which is how a programmatic edit that
//      should be undoable announces itself (see `insertToc` in outline.js).
//   2. `undoReset()`, called wherever the document is *replaced* rather than
//      edited.
//
// That second one is the whole point of the file, and it is a deliberate line:
// history does not cross a document boundary. Undo after opening a file must
// not hand back the previous file's text — you would then be one Ctrl+S away
// from writing the old document into the new file's path. Every site that
// assigns editor.innerHTML has to pick a side, and tests/undo.test.mjs counts
// them so a new one cannot quietly skip the decision.
//
// `undoPark()` / `undoAdopt()` are the one sanctioned crossing of that line,
// for a tab switch — where the outgoing document is neither replaced nor edited
// but set aside to be returned to. Park detaches the whole history bundle for
// the caller to keep on the outgoing tab; adopt installs the incoming tab's
// bundle, or — given null — is exactly `undoReset()`. The bundle moves as a
// unit and the two stacks are never merged, which is what keeps an undo in one
// tab from ever reaching another tab's content.

// Deep enough that nobody reaches the end of it in normal editing, small enough
// that a large document cannot run the tab out of memory: each state is a full
// copy of the document, so this is the cap that matters.
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
// The exception is an execCommand insert, which reports the same `insertText` a
// keystroke does however it was triggered — that is what `undoBreak()` is for.
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
    // Set by undoBreak(), cleared by the input event it isolates.
    breakOnce: false,
    // Set by undoJoin(), cleared by the input event it merges.
    joinOnce: false,
  };
}

let history = freshHistory();

// Guards the listener against the input event `applyUndoSnapshot` raises for
// everyone else's benefit. Without it an undo would record itself as an edit.
let undoApplying = false;

// ── Selection, as a character offset ─────────────────────────────────────────
//
// A Range cannot be stored: restoring a snapshot replaces every node it points
// at. An offset into the document's text survives that, because it describes a
// position in the content rather than in the tree.

function undoTextLength(node) {
  if (node.nodeType === 3) return node.textContent.length;
  let total = 0;
  for (const child of node.childNodes) total += undoTextLength(child);
  return total;
}

// Character offset of (node, offset) within root, or null if it is not inside.
function undoTextOffset(root, node, offset) {
  let total = 0;
  let found = false;

  (function walk(current) {
    if (found) return;
    if (current === node) {
      if (current.nodeType === 3) {
        total += offset;
      } else {
        // An element container: `offset` counts child nodes, not characters.
        const children = current.childNodes;
        for (let i = 0; i < offset && i < children.length; i++) {
          total += undoTextLength(children[i]);
        }
      }
      found = true;
      return;
    }
    if (current.nodeType === 3) {
      total += current.textContent.length;
      return;
    }
    for (const child of current.childNodes) {
      walk(child);
      if (found) return;
    }
  })(root);

  return found ? total : null;
}

// The reverse: the text node and offset that many characters in. Returns the
// last position in the document when the offset runs past the end, which is
// what happens when a snapshot is restored over shorter content.
function undoLocateOffset(root, target) {
  let remaining = target;
  let result = null;
  let last = null;

  (function walk(current) {
    if (result) return;
    if (current.nodeType === 3) {
      const length = current.textContent.length;
      last = { node: current, offset: length };
      if (remaining <= length) {
        result = { node: current, offset: remaining };
        return;
      }
      remaining -= length;
      return;
    }
    for (const child of current.childNodes) {
      walk(child);
      if (result) return;
    }
  })(root);

  return result || last;
}

function undoCaptureSelection() {
  const selection = typeof window !== "undefined" && window.getSelection
    ? window.getSelection()
    : null;
  if (!selection || !selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;

  return {
    start: undoTextOffset(editor, range.startContainer, range.startOffset),
    end: undoTextOffset(editor, range.endContainer, range.endOffset),
  };
}

function undoRestoreSelection(saved) {
  if (!saved || saved.start === null) return;

  const from = undoLocateOffset(editor, saved.start);
  const to = saved.end === null ? from : undoLocateOffset(editor, saved.end);
  if (!from || !to) return;

  try {
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // A snapshot restored over content that no longer has the same shape can
    // produce an offset the range rejects. The document is right either way,
    // and a caret in the wrong place is not worth throwing over.
  }
}

// ── The two seams ────────────────────────────────────────────────────────────
//
// Everything else in this file is core-independent — coalescing, UNDO_LIMIT,
// the redo branch, the ids file-api.js reads, breakOnce, park and adopt — and
// only two operations know what a state actually *is*. So the branch between
// the two cores is exactly these two functions, and the stack machinery the
// `tabs` suite guards stays one implementation rather than two.
//
// A second history in a second file was the other candidate and is worse here,
// for the same reason app.js has three doors instead of a branch at every call
// site: undoReset, undoPark, undoAdopt and undoPosition have seven callers
// across app.js, file-api.js and tabs.js, and a second owner would make every
// one of them ask which core is running.

/**
 * What the document is right now, in whichever shape this core keeps it.
 *
 * Exactly one of `html` and `model` is ever set. The model one is a **fork**:
 * it copies the document's outline and shares its contents, and marks the live
 * document as sharing them, so the next edit copies the one block it touches
 * before writing to it. A state that moved with the document would not be a
 * state, and copying the whole document to prevent that was slice 6's step 1 —
 * step 7 is why it no longer has to.
 *
 * The selection comes in two shapes for the same reason the content does. The
 * old core's is a character offset over the whole editor; the model core's is a
 * `(blockId, offset)`, which is a block *id* rather than a block precisely so
 * that a state holds no reference into the document it is a copy of.
 */
function undoCaptureState() {
  if (!undoModelCore()) {
    return { html: editor.innerHTML, model: null, selection: undoCaptureSelection() };
  }
  const doc = modelCurrentDocument();
  if (!doc) return { html: null, model: null, selection: null };
  return { html: null, model: modelForkDocument(doc), selection: undoCaptureModelCaret(doc) };
}

function undoCaptureModelCaret(doc) {
  return modelRecordSelection(modelReadSelection(editor, doc));
}

/**
 * Put a state on screen. Content, focus, then the caret, in that order, which
 * is the order the old core has always used: the selection has to be restored
 * after the nodes it points at exist.
 *
 * **The model branch installs a fork of the stored state**, never the stored
 * object. The next edit mutates what it installs, so handing over the entry
 * itself would edit the history — and the way that shows is undo, redo, undo,
 * where the second visit finds the state the first one left behind. A fork is
 * enough because it copies the outline and re-marks the contents as shared, so
 * the first edit after a restore copies what it is about to write to.
 *
 * A state with neither shape is one taken before a document existed. Nothing
 * is put on screen for it, which is the honest answer: there was nothing.
 */
function undoApplyState(snapshot) {
  if (snapshot.model) {
    // Resolved against the clone being installed, never against the state:
    // the caret has to land in the tree that is about to be rendered, which is
    // the whole reason a state records ids rather than blocks.
    const doc = modelForkDocument(snapshot.model);
    modelRestoreDocument(editor, doc, md, modelResolveSelection(doc, snapshot.selection));
  } else if (snapshot.html !== null) {
    editor.innerHTML = snapshot.html;
  }
  if (editor.focus) editor.focus();
  // The old core's caret, restored once the nodes it points at exist. The model
  // core's went in above, inside the render and in the render's own
  // coordinates, because nothing may hold a Range across one — so the two
  // selections are different shapes and only ever one of them is set.
  if (!snapshot.model) undoRestoreSelection(snapshot.selection);
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
 * Bring the current snapshot back in line with the document, without pushing a
 * step. For an edit made *after* the `input` event that announced it — which is
 * execcommand.js's normalisation and nothing else so far. Dispatching a second
 * input event would work too and would be wrong: it would make one action cost
 * two Ctrl+Z, the first of which would appear to do nothing.
 */
function undoRefresh() {
  history.current = undoSnapshot();
}

/**
 * Keep the next edit out of the run of typing around it. For a programmatic
 * insert that arrives as `insertText` and so is indistinguishable from a
 * keystroke — paste-without-formatting is the one that needs it, since it goes
 * in through execCommand("insertText") like any typed character. Without this
 * a plain paste lands in the middle of whatever the user was typing and one
 * Ctrl+Z takes back both. Isolates the step on both sides: nothing before it
 * merges in, and nothing typed after it merges into the paste.
 */
function undoBreak() {
  history.breakOnce = true;
}

/**
 * Merge the next edit into the step before it, whatever its type and however
 * long it has been. For a composition that **rewrites what was just typed**:
 * the macOS press-and-hold accent types the plain vowel as an ordinary
 * keystroke, waits for the user to pick from the popup — well past the
 * coalescing window — and then replaces that vowel. Without this, one Ctrl+Z
 * takes back the accent and leaves the vowel, which is not a thing anybody
 * typed. Found by hand in Firefox on 2026-09-23. `undoBreak()` wins if both
 * are set, since an isolated step cannot also be merged into.
 */
function undoJoin() {
  history.joinOnce = true;
}

/**
 * Detach the whole history and leave a fresh one in its place. For a tab
 * switch: stash the returned bundle on the outgoing tab, swap editor.innerHTML
 * to the incoming document, then undoAdopt that tab's stored bundle. Nothing
 * here touches the editor — the content swap is the caller's.
 */
function undoPark() {
  const parked = history;
  history = freshHistory();
  return parked;
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

// Which shape a state takes, asked at the two seams above and nowhere else.
//
// Guarded on `typeof` because the suites load this file with no model.js in the
// scope, the same shape execcommand.js's own refusal takes.
//
// It was a **refusal** between 2026-09-21 and this slice, and the reason is
// worth keeping: with the flag on and no model branch, an undo assigned an
// earlier *rendering* over a model that had not moved — a divergence rather
// than a no-op, and worse than one, because the document visibly went back and
// the next edit then patched one block out of the unreverted model into the
// reverted DOM. The branch is what the refusal was standing in for.
function undoModelCore() {
  return typeof modelCoreEnabled === "function" && modelCoreEnabled();
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
    !history.breakOnce && (
      history.joinOnce || (
        UNDO_COALESCING.has(type) &&
        type === history.lastType &&
        now - history.lastTime < UNDO_COALESCE_MS
      )
    );

  if (!coalesce) {
    history.undoStack.push(history.current);
    if (history.undoStack.length > UNDO_LIMIT) history.undoStack.shift();
  }

  // Any fresh edit invalidates the redo branch, coalesced or not.
  history.redoStack = [];
  history.current = undoSnapshot();
  // A broken step is also one nothing may merge *into*, so the type it reports
  // must not match whatever comes next either.
  history.lastType = history.breakOnce ? null : type;
  history.lastTime = now;
  history.breakOnce = false;
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
 * arrow keys starting from the top. That is the caret half of TODO 1.6, found
 * by hand on 2026-09-23 through `tests/fixtures/undo-check.md`, and it was in
 * both cores. So the state that is current follows the caret until the next
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
  // The state's own shape decides, the way it does when one is applied: the
  // caret is recorded in the shape the state was taken in, never re-asked.
  let caret = null;
  if (state.model) {
    const doc = modelCurrentDocument();
    caret = doc ? undoCaptureModelCaret(doc) : null;
  } else if (state.html !== null) {
    caret = undoCaptureSelection();
  }
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

// The native stack is not merely unused, it is actively wrong after the first
// innerHTML assignment — so these preventDefault rather than falling through.
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
