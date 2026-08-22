// Undo is kept on our own stack because the browser's is discarded by every
// assignment to editor.innerHTML — and discarded silently, which is what made
// it worth replacing rather than working around.
//
// Two halves, and they fail differently. The behavioural half drives the real
// stack: coalescing, the redo branch, and above all that history does not
// survive a document being replaced. The source half counts the innerHTML
// assignment sites, because the way this regresses is not a broken stack, it is
// a seventh assignment added somewhere that never tells the stack about it —
// after which undo hands back text from a document you are no longer editing.

import { loadSource, makeEl, makeText, readFront } from "./dom.mjs";

// Every site that replaces the document has to pick a side: undoReset() to
// forget the history, or an input event to record the change as undoable.
// Update this when a site is added or removed, having made that choice.
const REPLACEMENT_SITES = {
  "app.js": 6, // clear, paste-md, upload, welcome (x2), restore-from-autosave
  "file-api.js": 1, // openFile, which reload comes through too
};

function harness({ html = "<p>start</p>" } = {}) {
  const editor = makeEl("div");
  editor.innerHTML = html;

  const actions = new Map();
  const keydowns = [];
  // Everything else that hangs off `input` — autosave, the dirty flag, the
  // outline. An undo has to reach them, or the document and the autosave part
  // company and the toolbar goes on claiming the file matches.
  const heard = [];
  editor.addEventListener("input", (e) => heard.push(e && e.inputType));

  let now = 1000;

  const api = loadSource("undo.js", {
    editor,
    document: {
      addEventListener: (event, fn) => {
        if (event === "keydown") keydowns.push(fn);
      },
      createRange: () => ({ setStart() {}, setEnd() {} }),
    },
    // No selection: the offset maths is exercised directly below instead, so
    // the stack tests compare snapshots on their HTML alone.
    window: { getSelection: () => ({ rangeCount: 0 }) },
    Date: { now: () => now },
    Event,
    onToolbarAction: (action, fn) => actions.set(action, fn),
    runToolbarAction: (action) => actions.get(action)?.(),
    console,
  }, "; return { undo, redo, undoReset, undoTextOffset, undoLocateOffset," +
     " undoDepth: () => undoStack.length, redoDepth: () => redoStack.length };");

  return {
    ...api, editor, actions, heard,
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
    check(
      `${file}: tells the undo stack about them`,
      /undoReset\(\)/.test(src) || /dispatchEvent\(new Event\("input"/.test(src),
    );
  }

  // The native stack is not merely unused after an innerHTML assignment, it is
  // wrong — so nothing may quietly go on driving it alongside ours.
  check(
    "app.js no longer drives execCommand undo",
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

  // --- the document boundary, which is the point of the file ---------------

  h = harness();
  h.undoReset();
  h.type("edits to the first file");
  check("there is history to lose", h.undoDepth() === 1);

  // What openFile does: replace the content, then re-baseline.
  h.editor.innerHTML = "<p>a completely different file</p>";
  h.undoReset();
  check("opening a file forgets the history", h.undoDepth() === 0);
  check("and the redo branch with it", h.redoDepth() === 0);
  h.undo();
  check(
    "so undo cannot hand back the previous file's text",
    h.editor.innerHTML === "<p>a completely different file</p>",
  );

  h.type("x");
  h.undo();
  check("but undo works normally again straight away",
    h.editor.innerHTML === "<p>a completely different file</p>");

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

  // --- the caret ------------------------------------------------------------
  //
  // A Range cannot be stored across a snapshot: restoring one replaces every
  // node it points at. A character offset describes a position in the content
  // instead, so it survives the tree being rebuilt.

  const root = makeEl("div");
  const p1 = makeEl("p", { parent: root });
  p1.appendChild(makeText("Hello "));
  const strong = makeEl("strong", { parent: p1 });
  strong.appendChild(makeText("brave"));
  p1.appendChild(makeText(" world"));
  const p2 = makeEl("p", { parent: root });
  p2.appendChild(makeText("second"));

  const { undoTextOffset, undoLocateOffset } = h;
  check("an offset counts across element boundaries",
    undoTextOffset(root, strong.childNodes[0], 3) === 9);
  check("and across blocks",
    undoTextOffset(root, p2.childNodes[0], 2) === 19);
  check("a container offset counts its children's text",
    undoTextOffset(root, p1, 2) === 11);
  check("a node outside the root has no offset",
    undoTextOffset(root, makeText("elsewhere"), 0) === null);

  const at = undoLocateOffset(root, 9);
  check("locating an offset finds the text node", at.node === strong.childNodes[0]);
  check("and the position within it", at.offset === 3);
  const past = undoLocateOffset(root, 9999);
  check("an offset past the end lands at the end rather than nowhere",
    past.node === p2.childNodes[0] && past.offset === 6);
}
