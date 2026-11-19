// Undo is kept on our own stack because the browser's is discarded by every
// assignment to editor.innerHTML — and discarded silently, which is what made
// it worth replacing rather than working around.
//
// Two halves, and they fail differently. The behavioural half drives the real
// stack: coalescing, the redo branch, that history does not survive a document
// being replaced, and that undoPark/undoAdopt move it across a tab switch whole
// rather than merging two tabs' stacks. The source half counts the innerHTML
// assignment sites, because the way this regresses is not a broken stack, it is
// a seventh assignment added somewhere that never tells the stack about it —
// after which undo hands back text from a document you are no longer editing.

import { fakeModelCore, loadSource, makeEl, readFront } from "./dom.mjs";

// Every site that replaces the document has to pick a side: undoReset() to
// forget the history, or an input event to record the change as undoable.
// Stage 2's slice 1 funnelled seven of these into three doors in app.js, and
// stage 4 took every door to the model, which renders: **nothing outside
// model.js's render assigns `editor.innerHTML` any more**, and a zero is an
// assertion that a file does not replace the document behind the model. A new
// route into the document goes through loadDocumentMarkdown or
// loadBlankDocument, which hand the model markdown and leave the history to
// their callers.
const REPLACEMENT_SITES = {
  "app.js": 0,
  "file-api.js": 0,
  "tabs.js": 0,
  "undo.js": 0, // a state is a model, and applying one renders it
  "format-bar.js": 0,
  "model-input.js": 0,
  "outline.js": 0,
  "renderers.js": 0,
};

// A fake model core. `live` is the document on screen; `clone` counts as a
// generation so a check can tell one copy from another, which is how "applying
// installs a clone of the stored state" is asked at all.
// A fake model core. `live` is the document on screen; `clones` counts as a
// generation so a check can tell one copy from another, which is how "applying
// installs a clone of the stored state" is asked at all. Its blocks are copied
// per generation for the same reason one level down: the caret's whole point is
// that it resolves against the document being installed, and that is only
// visible if each generation's blocks are distinct objects.
function fakeModel() {
  let live = { text: "start", clones: 0, blocks: [{ id: 1 }, { id: 2 }] };
  let caret = { block: live.blocks[0], offset: 0 };
  const restored = [];
  const applied = [];
  const clone = (doc) => ({ ...doc, clones: doc.clones + 1, blocks: doc.blocks.map((b) => ({ ...b })) });
  return {
    get live() { return live; },
    get applied() { return applied; },
    restored,
    edit: (text) => { live.text = text; },
    // Where the browser's caret is, in model terms. Set by a check before an
    // edit, exactly as a real one is set by the render the edit ends with.
    look: (id, offset) => { caret = { block: live.blocks.find((b) => b.id === id), offset }; },
    // What a tab switch does to the model: loadDocumentHtml re-parses the
    // incoming tab's stored HTML, so the document on screen afterwards is a
    // *different object* from the one the parked bundle's states describe --
    // same content, new blocks. Nothing in this file may care.
    reparse: (text) => {
      live = { text, clones: 0, blocks: [{ id: 1 }, { id: 2 }] };
      caret = { block: live.blocks[0], offset: 0 };
    },
    scope: {
      modelCurrentDocument: () => live,
      modelForkDocument: clone,
      modelRestoreDocument: (root, doc, md, selection) => {
        live = doc; restored.push(doc); applied.push(selection); return doc;
      },
      modelReadSelection: () => caret,
      modelRecordSelection: (sel) =>
        (sel && sel.block ? { block: sel.block.id, offset: sel.offset } : null),
      modelResolveSelection: (doc, at) => {
        if (!at) return null;
        const block = doc.blocks.find((b) => b.id === at.block);
        return block ? { block, offset: at.offset } : null;
      },
      md: {},
    },
  };
}

function harness({ html = "<p>start</p>", modelCore = false } = {}) {
  const editor = makeEl("div");
  editor.innerHTML = html;
  const model = fakeModel();
  // The stack's checks read the document off the editor, which is the easiest
  // thing to compare: a model stand-in whose document *is* the editor's HTML,
  // the one the `tabs` suite boots with. `modelCore: true` is the block-shaped
  // one above instead, for the checks about what a state is.
  const mirror = fakeModelCore(editor);

  const actions = new Map();
  const keydowns = [];
  const selectionchanges = [];
  // Everything else that hangs off `input` — autosave, the dirty flag, the
  // outline. An undo has to reach them, or the document and the autosave part
  // company and the toolbar goes on claiming the file matches.
  const heard = [];
  editor.addEventListener("input", (e) => heard.push(e && e.inputType));
  // Where those listeners think the document is when they hear it. file-api.js
  // asks undoPosition() from inside its own input handler, so what this records
  // is exactly what decides whether the toolbar says "(edited)".
  const positions = [];

  let now = 1000;

  const api = loadSource("undo.js", {
    editor,
    document: {
      addEventListener: (event, fn) => {
        if (event === "keydown") keydowns.push(fn);
        if (event === "selectionchange") selectionchanges.push(fn);
      },
      createRange: () => ({ setStart() {}, setEnd() {} }),
    },
    // No selection: the stack tests compare states on their content alone,
    // and the caret is the model checks' business below.
    window: { getSelection: () => ({ rangeCount: 0 }) },
    Date: { now: () => now },
    Event,
    onToolbarAction: (action, fn) => actions.set(action, fn),
    runToolbarAction: (action) => actions.get(action)?.(),
    // The model layer, stubbed -- which is the opposite of this file's usual
    // arrangement and is the same call model-input.test.mjs makes. What is
    // under test here is the *stack*: that a state is captured and applied at
    // the two seams and that nothing else in the file learned about the model.
    // The fork itself is covered against the real tree and the real oracle in
    // `model`, so stubbing it is what lets this assert the seams rather than
    // re-assert that.
    md: {},
    ...(modelCore ? model.scope : mirror.scope),
    console,
  }, "; return { undo, redo, undoReset, undoJoin, undoPark, undoAdopt," +
     " undoDepth: () => history.undoStack.length," +
     " redoDepth: () => history.redoStack.length, undoPosition };");

  editor.addEventListener("input", () => positions.push(api.undoPosition()));

  return {
    ...api, editor, actions, heard, positions, model,
    advance: (ms) => { now += ms; },
    // What the browser raises for a real edit: mutate, then announce it.
    type: (text, inputType = "insertText") => {
      editor.innerHTML = editor.innerHTML.replace("</p>", text + "</p>");
      editor.dispatchEvent({ type: "input", inputType });
    },
    // What a programmatic edit raises: no inputType, because there was no key.
    programmatic: (html) => {
      editor.innerHTML = html;
      editor.dispatchEvent({ type: "input" });
    },
    key: (init) => { for (const fn of keydowns) fn(init); },
    // What the browser raises when the caret moves, with no edit.
    moved: () => { for (const fn of selectionchanges) fn(); },
  };
}

export default function run(check) {
  // --- the sites that replace the document ---------------------------------

  for (const [file, expected] of Object.entries(REPLACEMENT_SITES)) {
    const src = readFront(file);
    const found = (src.match(/editor\.innerHTML = /g) || []).length;
    check(
      `${file}: ${expected} innerHTML assignment(s), all accounted for`,
      found === expected,
    );
    // Vacuous for a file with none left, and said rather than quietly skipped.
    if (!expected) continue;
    check(
      `${file}: tells the undo stack about them`,
      /undoReset\(\)/.test(src) || /dispatchEvent\(new Event\("input"/.test(src) ||
        // The third answer, and only a tab switch is entitled to it: the
        // outgoing history is set aside rather than forgotten, which is a
        // crossing of the document boundary only because the boundary has
        // become the tab.
        /undoAdopt\(/.test(src),
    );
  }

  // The native stack has nothing on it, since the engine never edits — so
  // nothing may quietly go on driving it alongside ours.
  check(
    "app.js does not drive execCommand undo",
    !/execCommand\("(undo|redo)"\)/.test(readFront("app.js")),
  );
  // Load order: undo.js binds to `editor`, which app.js defines.
  const bundle = [...readFront("index.html").matchAll(/src="\/([a-z-]+\.js)"/g)].map((m) => m[1]);
  check("undo.js loads after app.js", bundle.indexOf("undo.js") > bundle.indexOf("app.js"));
  check(
    "and ships in the editable export",
    readFront("html-export.js").includes('"/undo.js"'),
  );
  check("and offline", readFront("sw.js").includes('"/undo.js"'));

  // --- coalescing ----------------------------------------------------------

  let h = harness();
  h.undoReset();
  h.type("a"); h.type("b"); h.type("c");
  check("a run of typing is one undo step", h.undoDepth() === 1);

  h.undo();
  check("which takes back the whole run", h.editor.innerHTML === "<p>start</p>");
  check("and empties the stack", h.undoDepth() === 0);

  h = harness();
  h.undoReset();
  h.type("a");
  h.advance(700);
  h.type("b");
  check("a pause starts a new step", h.undoDepth() === 2);

  h = harness();
  h.undoReset();
  h.type("a");
  h.type("", "deleteContentBackward");
  check("a different kind of edit starts a new step", h.undoDepth() === 2);

  h = harness();
  h.undoReset();
  h.type("a");
  h.type("", "insertParagraph");
  h.type("b");
  check("Enter is always its own step", h.undoDepth() === 3);

  // The one that only the allowlist gets right: these are consecutive and
  // identical and within the window, so every other condition says coalesce.
  // Two Enters are two acts, and so are bold-on and bold-off.
  h = harness();
  h.undoReset();
  h.type("", "insertParagraph");
  h.type("", "insertParagraph");
  check("but two of them in a row are still two steps", h.undoDepth() === 2);

  h = harness();
  h.undoReset();
  h.type("", "formatBold");
  h.type("", "formatBold");
  check("and so is each press of a format button", h.undoDepth() === 2);

  h = harness();
  h.undoReset();
  h.type("a");
  h.programmatic("<p>a table of contents</p>");
  check("a programmatic edit never joins the typing before it", h.undoDepth() === 2);
  h.undo();
  check("and is undoable on its own", h.editor.innerHTML === "<p>starta</p>");

  // --- undoJoin: a composition rewriting what was just typed ---------------
  //
  // The press-and-hold accent types the vowel, waits on a popup far longer
  // than the coalescing window, then replaces it under a different inputType.
  // Neither rule would merge the two, and both are overridden on purpose.

  h = harness();
  h.undoReset();
  h.type("e");
  h.advance(2000);
  h.undoJoin();
  h.type("\u0301", "insertCompositionText");
  check("a joined edit merges across both the type and the pause", h.undoDepth() === 1);
  h.undo();
  check("so one undo takes back the letter and its accent together",
    h.editor.innerHTML === "<p>start</p>");

  h = harness();
  h.undoReset();
  h.type("a");
  h.undoJoin();
  h.type("b", "insertCompositionText");
  h.advance(2000);
  h.type("c");
  check("the join is spent on the edit it merges", h.undoDepth() === 2);

  // --- redo ----------------------------------------------------------------

  h = harness();
  h.undoReset();
  h.type("a"); h.advance(700); h.type("b");
  h.undo(); h.undo();
  check("undo walks back through the steps", h.editor.innerHTML === "<p>start</p>");
  check("and fills the redo branch", h.redoDepth() === 2);

  h.redo();
  check("redo walks forward again", h.editor.innerHTML === "<p>starta</p>");
  h.redo();
  check("all the way", h.editor.innerHTML === "<p>startab</p>");
  check("emptying the redo branch", h.redoDepth() === 0);

  h.undo();
  h.type("z");
  check("a fresh edit discards the redo branch", h.redoDepth() === 0);
  while (h.undo()) { /* drain */ }
  check("undo stops at the bottom of the stack rather than throwing",
    h.undo() === false && h.undoDepth() === 0);
  while (h.redo()) { /* drain */ }
  check("and redo stops at the top", h.redo() === false && h.redoDepth() === 0);

  // --- position, which file-api.js reads to follow the dirty flag ----------
  //
  // A stack index is not enough on its own: UNDO_LIMIT shifts the whole stack
  // down once it fills, so an index would end up naming whatever slid into
  // that slot rather than the state that was actually there. undoPosition()
  // hands back an id instead, minted once per state and never reused, so a
  // savepoint can only ever be reached again by actually undoing or redoing
  // back to it.

  h = harness();
  h.undoReset();
  const clean = h.undoPosition();
  h.type("a");
  const edited = h.undoPosition();
  check("an edit moves off the position it started at", edited !== clean);

  h.undo();
  check("undo lands back on the exact id it started from",
    h.undoPosition() === clean);

  h.redo();
  check("redo returns to the same id it left, not a freshly minted one",
    h.undoPosition() === edited);

  // A run of coalesced typing pushes one stack entry but still moves the
  // position on every keystroke — the id tracks content, not stack depth.
  h = harness();
  h.undoReset();
  const start = h.undoPosition();
  h.type("a"); h.type("b"); h.type("c");
  const afterRun = h.undoPosition();
  check("coalescing still advances the position", afterRun !== start);
  h.undo();
  check("one undo takes back the whole run, position included",
    h.undoPosition() === start);

  // --- the document boundary, which is the point of the file ---------------

  h = harness();
  h.undoReset();
  const firstFile = h.undoPosition();
  h.type("edits to the first file");
  check("there is history to lose", h.undoDepth() === 1);

  // What openFile does: replace the content, then re-baseline.
  h.editor.innerHTML = "<p>a completely different file</p>";
  h.undoReset();
  check("opening a file forgets the history", h.undoDepth() === 0);
  check("and the redo branch with it", h.redoDepth() === 0);
  check("and mints a fresh position rather than reusing the old file's",
    h.undoPosition() !== firstFile && h.undoPosition() !== null);
  h.undo();
  check(
    "so undo cannot hand back the previous file's text",
    h.editor.innerHTML === "<p>a completely different file</p>",
  );

  h.type("x");
  h.undo();
  check("but undo works normally again straight away",
    h.editor.innerHTML === "<p>a completely different file</p>");

  // --- parking history across a tab switch --------------------------------
  //
  // A tab switch is neither a reset nor an edit: the outgoing document's
  // history is set aside whole and brought back untouched, while the incoming
  // document's own history — or a fresh one — takes over. The bundle moves as a
  // unit; the two stacks are never merged, which is what stops an undo in one
  // tab from ever reaching another tab's content.

  h = harness();
  h.undoReset();
  h.type("a"); h.advance(700); h.type("b");
  const tabA = h.undoPark();
  check("parking hands back a bundle carrying the stack",
    tabA.undoStack.length === 2);
  check("and leaves a fresh empty history in its place", h.undoDepth() === 0);

  // The incoming tab: swap the content first, then adopt.
  h.editor.innerHTML = "<p>second document</p>";
  h.undoAdopt(null);
  check("adopt(null) is a reset — fresh baseline, no history", h.undoDepth() === 0);
  const bFile = h.undoPosition();
  check("with a position of its own, not the parked tab's", bFile !== null);
  h.type("c");
  h.undo();
  check("the incoming tab undoes normally",
    h.editor.innerHTML === "<p>second document</p>");
  const tabB = h.undoPark();

  // Back to A: its depth, its redo branch, its position ids — all intact.
  h.editor.innerHTML = "<p>startab</p>";
  h.undoAdopt(tabA);
  check("adopting a bundle restores its exact depth", h.undoDepth() === 2);
  h.undo();
  check("and its steps still walk back", h.editor.innerHTML === "<p>starta</p>");
  h.undo();
  check("all the way", h.editor.innerHTML === "<p>start</p>");
  check("with the redo branch it was parked with", h.redoDepth() === 2);

  // The wall between tabs: draining A's stack never yields B's content.
  while (h.undo()) { /* drain */ }
  check("draining one tab's history cannot surface another's html",
    h.editor.innerHTML === "<p>start</p>");
  h.undoAdopt(tabB);
  check("and B's own history is still where it was left", h.redoDepth() === 1);

  // --- an undo has to reach everyone else ----------------------------------

  h = harness();
  h.undoReset();
  h.type("a");
  const before = h.heard.length;
  h.undo();
  check("applying a snapshot raises input for the other listeners",
    h.heard.length === before + 1);
  check("and does not record itself as an edit", h.undoDepth() === 0);
  check("leaving exactly one step to redo", h.redoDepth() === 1);

  // Raising the event is only half of reaching them: file-api.js asks
  // undoPosition() from inside its own handler, so a snapshot applied *after*
  // the event told it the document was still in the state undo had just left.
  // The dirty flag is computed from that answer, so undoing back to the last
  // save went on reporting "(edited)" and the unsaved-work guard went on asking
  // about a document that matched its file.
  h = harness();
  h.undoReset();
  const saved = h.undoPosition();
  h.type("a");
  h.undo();
  check("the input an undo raises already reports the restored position",
    h.positions[h.positions.length - 1] === saved);

  h.redo();
  check("and the one a redo raises reports the position it returned to",
    h.positions[h.positions.length - 1] === h.undoPosition());

  // --- shortcuts -----------------------------------------------------------

  h = harness();
  h.undoReset();
  h.type("a");
  const pressed = [];
  h.key({ ctrlKey: true, key: "z", preventDefault: () => pressed.push("z") });
  check("Ctrl+Z undoes", h.editor.innerHTML === "<p>start</p>");
  check("and takes the key from the browser", pressed.length === 1);

  h.key({ ctrlKey: true, shiftKey: true, key: "Z", preventDefault() {} });
  check("Ctrl+Shift+Z redoes, whatever the shift key did to the case",
    h.editor.innerHTML === "<p>starta</p>");
  h.key({ metaKey: true, key: "z", preventDefault() {} });
  h.key({ ctrlKey: true, key: "y", preventDefault() {} });
  check("Ctrl+Y redoes too", h.editor.innerHTML === "<p>starta</p>");

  const ignored = [];
  h.key({ key: "z", preventDefault: () => ignored.push("z") });
  h.key({ ctrlKey: true, key: "b", preventDefault: () => ignored.push("b") });
  check("and nothing else is intercepted", ignored.length === 0);

  // --- what a state is: the two seams --------------------------------------
  //
  // Slice 6's step 2. Everything above this line is about the stack: what a
  // state *is* is decided at exactly two functions, and the stack machinery
  // around them -- coalescing, the limit, the redo branch, the ids file-api.js
  // reads, park and adopt -- never asks. So the checks here are the two seams
  // and then a re-run of the stack's own rules with a block-shaped model in
  // place of the mirror, because "nothing else moves" is a claim about this
  // file and not a plan.

  h = harness({ modelCore: true });
  h.undoReset();
  h.model.edit("start a");
  h.type("a");
  check("under the model core a state holds a model", h.undoDepth() === 1);

  h.undo();
  check("and undo restores it", h.model.live.text === "start");
  check("without touching innerHTML", h.editor.innerHTML === "<p>starta</p>");
  check("and it is a clone rather than the entry itself", h.model.live.clones === 2);

  // The one the plan names: applying has to install a copy, or the next edit
  // rewrites the history it came from. Undo, redo, undo -- the second visit
  // must find what the first one did, not what was done to it afterwards.
  h = harness({ modelCore: true });
  h.undoReset();
  h.model.edit("one");
  h.type("a");
  h.undo();
  h.model.edit("vandalised");
  h.redo();
  h.undo();
  check("a state survives the document it was restored into being edited",
    h.model.live.text === "start");

  // And capture is a clone too, for the same reason from the other end: the
  // live document is mutated in place by every edit.
  h = harness({ modelCore: true });
  h.undoReset();
  const captured = h.model.live;
  h.model.edit("moved on");
  h.type("a");
  h.undo();
  check("and the state a reset took is not the live document",
    h.model.live !== captured && h.model.live.text === "start");

  // The stack's own rules, unchanged, with model states in them. These are the
  // coalescing checks from the top of this file run through the other seam.
  h = harness({ modelCore: true });
  h.undoReset();
  h.type("a"); h.type("b"); h.type("c");
  check("a run of typing is still one step under the model core", h.undoDepth() === 1);
  h.advance(700);
  h.type("d");
  check("and a pause still starts a new one", h.undoDepth() === 2);
  h.type("", "insertParagraph");
  check("and Enter is still its own", h.undoDepth() === 3);

  h = harness({ modelCore: true });
  h.undoReset();
  h.model.edit("one"); h.type("a");
  h.model.edit("two"); h.type("", "insertParagraph");
  const middle = h.undoPosition();
  h.undo();
  check("redo is still a branch", h.redoDepth() === 1);
  h.redo();
  check("and redoing returns the state it left", h.model.live.text === "two");
  check("with the id it was minted with", h.undoPosition() === middle);

  // file-api.js reads undoPosition() from inside its own input listener, so
  // this is what decides whether the toolbar says "(edited)" under the flag.
  check("and every input reported a position", h.positions.every((p) => p !== null));

  // Park and adopt move the bundle whole, and never learned what is in it.
  h = harness({ modelCore: true });
  h.undoReset();
  h.model.edit("first tab"); h.type("a");
  const parked = h.undoPark();
  check("parking leaves a fresh history", h.undoDepth() === 0);
  h.undoAdopt(parked);
  h.undo();
  check("and adopting it back restores that tab's model", h.model.live.text === "start");

  // Nothing here may reach the native stack: the shortcut is still taken, and
  // now it has something to do with it.
  h = harness({ modelCore: true });
  h.undoReset();
  h.model.edit("typed"); h.type("a");
  const taken = [];
  h.key({ ctrlKey: true, key: "z", preventDefault: () => taken.push("z") });
  check("Ctrl+Z still takes the key from the browser", taken.length === 1);
  check("and now undoes through the model", h.model.live.text === "start");

  // --- the caret, which travels as an id ------------------------------------
  //
  // Slice 6's step 3. A state cannot hold a block reference -- it would point
  // into the document the state is a copy of, and the restore replaces that.
  // So capture records an id and apply resolves it **against the clone it is
  // installing**, which is the half a stub can actually check: the resolved
  // block has to be one of the blocks now on screen, not one of the state's.
  //
  // The caret an undo restores is the one the state was taken with, which is
  // to say the one that was there *before* the edit being undone -- so these
  // set the caret before the reset that mints the state they come back to.

  h = harness({ modelCore: true });
  h.model.look(2, 7);
  h.undoReset();
  h.model.look(1, 0);
  h.type("a");
  const wasLive = h.model.live.blocks;
  h.undo();
  const put = h.model.applied[h.model.applied.length - 1];
  check("an undo restores the caret the state was taken with",
    put && put.block.id === 2 && put.offset === 7);
  check("resolved against the document it installed",
    h.model.live.blocks.includes(put.block));
  check("which is a different object from the one on screen before it",
    !wasLive.includes(put.block));

  // **But the state follows the caret until the next edit leaves it**, so what
  // comes back is where the caret was when the undone edit *began*. The caret
  // half of the bug once filed as TODO 1.6: open a file (a state with no caret), click, press Enter, undo
  // -- and the caret went nowhere, or to wherever the edit before had left it.
  h = harness({ modelCore: true });
  h.model.look(99, 0);          // opened: no caret anywhere
  h.undoReset();
  h.model.look(2, 5);           // the user clicks
  h.moved();
  h.model.look(1, 0);           // the edit's own render moves it on
  h.type("a");
  h.undo();
  const back = h.model.applied[h.model.applied.length - 1];
  check("an undo restores the caret from where the edit began, not from when the state was taken",
    back && back.block.id === 2 && back.offset === 5);

  // A caret outside the editor is not a caret here: clicking the toolbar must
  // not wipe the one the state is holding.
  h = harness({ modelCore: true });
  h.model.look(2, 5);
  h.undoReset();
  h.model.look(99, 0);
  h.moved();
  h.model.look(1, 0);
  h.type("a");
  h.undo();
  const kept = h.model.applied[h.model.applied.length - 1];
  check("and a selection that left the editor leaves the state's caret alone",
    kept && kept.block.id === 2 && kept.offset === 5);

  // A state taken with no caret, never given one, restores none.
  h = harness({ modelCore: true });
  h.model.look(99, 0);          // no such block: modelReadSelection sees nothing
  h.undoReset();
  h.model.look(1, 0);
  h.type("a");
  h.undo();
  check("and a state taken with no caret asks for none",
    h.model.applied[h.model.applied.length - 1] === null);

  // --- slice 6's step 5: the switch, where a bundle meets a re-parsed document
  //
  // A tab never shown this session is parsed from its stored markdown, so after
  // a switch the document on screen can be a different *object* from the one
  // a parked bundle's states describe, with its own ids. What makes that
  // survivable is that a restore installs the state's
  // own clone wholesale and never compares it against the live tree.
  //
  // This is also where step 3's choice pays: the caret resolves inside the
  // state's own clone. Resolved against the *live* document instead -- the
  // alternative -- a switch would break it, because the ids would be another
  // parse's.

  h = harness({ modelCore: true });
  h.model.look(2, 4);
  h.undoReset();
  h.model.look(1, 0);
  h.type("a");                      // an edit in this tab
  const modelTabA = h.undoPark();

  h.model.reparse("other tab");     // a different document, with its own blocks
  h.undoAdopt(null);
  h.type("b");
  check("a tab with no bundle of its own takes its baseline from what is there",
    h.undoDepth() === 1);
  h.undo();
  check("and undoes within that document", h.model.live.text === "other tab");

  // Back to the first tab: the content is re-parsed, then its bundle is adopted
  // on top of it. The bundle's states still describe the old objects.
  h.model.reparse("start");
  h.undoAdopt(modelTabA);
  h.undo();
  check("adopting a bundle back restores that tab's own state",
    h.model.live.text === "start");
  const parkedCaret = h.model.applied[h.model.applied.length - 1];
  check("with its caret resolved inside the state's own clone",
    parkedCaret && parkedCaret.block.id === 2 && parkedCaret.offset === 4 &&
      h.model.live.blocks.includes(parkedCaret.block));

  // The property the whole park/adopt design exists for, asked with model
  // states in it: an undo in one tab can never reach another tab's content.
  h = harness({ modelCore: true });
  h.undoReset();
  h.model.edit("tab one edited"); h.type("a");
  const parkedFirst = h.undoPark();
  h.model.reparse("tab two");
  h.undoAdopt(null);
  h.model.edit("tab two edited"); h.type("b");
  h.undo();
  check("and an undo in one tab cannot reach the other's content",
    h.model.live.text === "tab two");
  check("whose own stack is empty at that point", h.undoDepth() === 0);
  check("while the parked bundle still has its step", parkedFirst.undoStack.length === 1);

  // The old core's half of the seams went in stage 4's slice 5, and the source
  // says so rather than leaving a reader to wonder whether one is left: a state
  // has no HTML in it, and applying one never assigns the editor's markup.
  const undoSrc = readFront("undo.js");
  check("undo.js keeps no HTML state",
    !/\bhtml:/.test(undoSrc) && !/snapshot\.html/.test(undoSrc) && !/innerHTML\s*=[^=]/.test(undoSrc));
  check("and asks no question about which core is running",
    !/undoModelCore|modelCoreEnabled/.test(undoSrc));
}
