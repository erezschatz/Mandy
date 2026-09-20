// The input layer. TODO 3.1, stage 2, slice 3 — docs/REWRITE.md is the design.
//
// This is the part of the rewrite with no counterpart in the repo and the only
// part that can blow the estimate. Everything under it is data-structure work
// of a kind this codebase already does well; this is the part where the
// browser has opinions.
//
// **The whole idea is one line of it.** `beforeinput` fires on the editable
// root *before* the engine mutates anything, with an `inputType` saying what it
// is about to do — so the handler cancels every one of them, handled or not,
// and the DOM can then only change through `modelRender`. That is D4's
// treatment reversed: contenteditable is an input method whose intentions are
// intercepted, rather than a data structure whose mutations are cleaned up
// afterwards. Stage 0's spike asked exactly one question — will an engine
// announce what it is about to do and let us do it instead — and Blink, Gecko
// and WebKit all answered yes on 2026-09-10.
//
// Its own file rather than more of model.js, because it is an event layer
// rather than the model, and because slices 4 and 5 grow it: structure edits,
// then paste. model.js stays the thing a suite can drive with no browser.
//
// **Nothing here runs unless `modelCoreEnabled()`.** With the flag off this
// file loads, registers nothing, and the editor is the one CLAUDE.md describes.

// What this slice handles. Everything else is still cancelled — see the
// handler — so an unhandled type is a keystroke that does nothing rather than
// one the browser gets to act on behind the model's back.
//
// The four delete-word and delete-content types are one implementation: the
// engine has already worked out *what* it means to delete and says so in
// `getTargetRanges()`, so the difference between a character and a word is the
// browser's business and none of ours. That is the same reason the spike gave
// for reading deletions off the target ranges rather than computing them: "a
// deletion whose target range spans two blocks is a merge" then falls out
// instead of being special-cased.
const MODEL_INPUT_TEXT_TYPES = new Set([
  "insertText",
  "insertReplacementText",
]);

const MODEL_INPUT_DELETE_TYPES = new Set([
  "deleteContentBackward",
  "deleteContentForward",
  "deleteWordBackward",
  "deleteWordForward",
  "deleteByCut",
  "deleteContent",
]);

// From compositionstart to compositionend the engine owns one text node and
// nothing may re-render, which is the guard that matters: a render during
// composition takes the node the IME is holding out from under it, and that is
// how CJK input breaks outright rather than subtly.
let modelComposingBlock = null;

function modelInputComposing() {
  return modelComposingBlock !== null;
}

/**
 * The range an event is about, in model coordinates, or null.
 *
 * `getTargetRanges()` first, because it is the engine saying what it intends
 * rather than us guessing from the selection — for a collapsed caret and
 * Backspace it is the character about to go, which we would otherwise have to
 * work out ourselves and would get wrong at a mark boundary. The selection is
 * the fallback for the types that carry no target range.
 *
 * Returns `{ block, from, to }` only when both ends land in the **same** block.
 * Two blocks is a merge, which is slice 4's, and null is how this says so.
 */
function modelInputRange(event, doc) {
  let range = null;
  const targets = typeof event.getTargetRanges === "function" ? event.getTargetRanges() : [];
  if (targets && targets.length) {
    range = targets[0];
  } else {
    const live = window.getSelection();
    if (!live || !live.rangeCount) return null;
    range = live.getRangeAt(0);
  }

  // **Outward at both ends only when there are two ends.** A selection covering
  // an equation hands over a range whose end a browser has normalised to inside
  // the `<span data-math>`, and clamping that inward would collapse the range
  // and leave the equation standing. But a *collapsed* caret inside the same
  // span is one position, and biasing its two ends apart turns it into a range
  // covering the whole atom — so a keystroke replaces the equation instead of
  // inserting beside it. Measured in Gecko on 2026-09-20, which puts the caret
  // in there where Blink does not: typing `d` inside `$x = a*b*c$` reported
  // `12–13` and ate the equation.
  //
  // So a collapsed range stays collapsed, at the atom's front edge, which is
  // also where `modelDomLocate` would have put the caret. The result is a
  // character inserted before the equation rather than one that destroys it.
  const collapsed = range.collapsed === true ||
    (range.startContainer === range.endContainer && range.startOffset === range.endOffset);
  const from = modelDomBlockAt(editor, doc, range.startContainer, range.startOffset, -1);
  const to = collapsed
    ? from
    : modelDomBlockAt(editor, doc, range.endContainer, range.endOffset, 1);
  if (!from || !to || from.block !== to.block) return null;
  return { block: from.block, from: Math.min(from.offset, to.offset), to: Math.max(from.offset, to.offset) };
}

/**
 * Apply one edit and show it.
 *
 * The order is the design's: change the model, then render from it, and the
 * render applies the selection the edit asked for. Nothing holds a `Range`
 * across that, because every node the old one pointed at has just been thrown
 * away.
 */
function modelInputApply(doc, target, text) {
  if (!target) return false;
  const offset = modelInlineSplice(target.block, target.from, target.to, text);
  if (offset === null) return false;
  const at = { block: target.block, offset };
  if (!modelRerenderBlock(editor, target.block, md, at)) {
    // The block owns no element and neither does anything above it, which is
    // the shape an html_block with two roots gets to. Falling back to the whole
    // document is heavy and correct; silently doing nothing is neither.
    modelRender(editor, doc, md, at);
  }
  modelInputAnnounce(text ? "insertText" : "deleteContentBackward");
  return true;
}

/**
 * Tell the rest of the app that the document changed.
 *
 * The repo's convention since long before this: a programmatic edit raises a
 * synthetic `input` event, and autosave, the dirty flag, the outline and the
 * undo stack all hang off exactly that. It matters more here than anywhere,
 * because `preventDefault()` on the `beforeinput` means the engine will not
 * raise one — so an edit that forgot this would be invisible to every one of
 * them, and the toolbar would go on claiming the document matches the file.
 *
 * `inputType` is carried because undo.js coalesces on it.
 */
function modelInputAnnounce(inputType) {
  const event = typeof InputEvent === "function"
    ? new InputEvent("input", { inputType, bubbles: true })
    : new Event("input", { bubbles: true });
  editor.dispatchEvent(event);
}

/**
 * Every `beforeinput`, cancelled.
 *
 * **Cancelled first and unconditionally**, before anything is looked at, which
 * is the property the whole design rests on: an `inputType` this slice has
 * never heard of is a keystroke that does nothing, rather than one the engine
 * gets to act on behind the model's back. A handler that cancelled only what it
 * understood would leave the DOM and the model to drift apart on exactly the
 * inputs nobody thought of.
 *
 * The one type that cannot be cancelled is `insertCompositionText`, and the
 * spec says so: an IME has to write into the DOM while composing. Calling
 * `preventDefault()` on it is a harmless no-op, and the real handling is the
 * composition pair below.
 */
function modelInputBeforeInput(event) {
  event.preventDefault();

  const doc = modelCurrentDocument();
  if (!doc) return;
  // The engine owns the node under the caret until compositionend. Reading it
  // now would see half a syllable; rendering now would take it away.
  if (modelInputComposing()) return;

  if (MODEL_INPUT_TEXT_TYPES.has(event.inputType)) {
    modelInputApply(doc, modelInputRange(event, doc), event.data || "");
    return;
  }
  if (MODEL_INPUT_DELETE_TYPES.has(event.inputType)) {
    modelInputApply(doc, modelInputRange(event, doc), "");
  }
}

/**
 * Composition, which is decided rather than discovered.
 *
 * `insertCompositionText` cannot be cancelled, so the rule is that from
 * `compositionstart` to `compositionend` the engine owns the one text node
 * under the caret and the model waits. On `compositionend` the block's DOM text
 * is diffed against the model's and the difference applied as a single edit,
 * then rendered — one undo step for one composed word, which is also what the
 * platform's own editors do. Dead keys and the macOS accent popup are
 * compositions and take the same path.
 *
 * The diff is a common prefix and suffix rather than anything cleverer, because
 * a composition replaces one contiguous run: that is what an IME does by
 * construction, and a smarter diff would only be able to disagree with it.
 */
function modelInputCompositionStart() {
  const doc = modelCurrentDocument();
  if (!doc) return;
  const at = modelReadSelection(editor, doc);
  modelComposingBlock = at ? at.block : null;
  // A composition starting somewhere the model cannot name would end by
  // reading a block it never held. Better to know now.
  if (!modelComposingBlock) modelComposingBlock = false;
}

function modelInputCompositionEnd() {
  const block = modelComposingBlock;
  modelComposingBlock = null;
  const doc = modelCurrentDocument();
  if (!doc || !block) return;

  const el = modelElementFor(editor, block);
  if (!el) return;
  const now = modelDomText(el);
  const was = modelBlockText(block);
  if (now === was) return;

  let head = 0;
  while (head < now.length && head < was.length && now[head] === was[head]) head += 1;
  let tail = 0;
  while (
    tail < now.length - head &&
    tail < was.length - head &&
    now[now.length - 1 - tail] === was[was.length - 1 - tail]
  ) tail += 1;

  const inserted = now.slice(head, now.length - tail);
  const offset = modelInlineSplice(block, head, was.length - tail, inserted);
  if (offset === null) return;
  modelRerenderBlock(editor, block, md, { block, offset });
  modelInputAnnounce("insertCompositionText");
}

// ── Installation ─────────────────────────────────────────────────────────────
//
// After app.js, which defines `editor` and `md`, and after model.js, which
// defines everything else here. Registered only under the model core: with the
// flag off this file is inert, and the editor is the one the rest of CLAUDE.md
// describes.

function modelInputInstall(root) {
  root.addEventListener("beforeinput", modelInputBeforeInput);
  root.addEventListener("compositionstart", modelInputCompositionStart);
  root.addEventListener("compositionend", modelInputCompositionEnd);
}

if (typeof editor !== "undefined" && editor && modelCoreEnabled()) {
  modelInputInstall(editor);
}
