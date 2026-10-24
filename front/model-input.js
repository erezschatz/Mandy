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
 * The span an event is about, in model coordinates, or null.
 *
 * `getTargetRanges()` first, because it is the engine saying what it intends
 * rather than us guessing from the selection — for a collapsed caret and
 * Backspace it is the character about to go, which we would otherwise have to
 * work out ourselves and would get wrong at a mark boundary. The selection is
 * the fallback for the types that carry no target range.
 *
 * **Both ends are named even when they are in different blocks**, which is
 * slice 4's change to this function. Slice 3 returned null there and called it
 * a merge it could not do; the merge is now `modelInputDelete`'s, and "a
 * deletion whose target range spans two blocks is a merge" falls out of the
 * engine's own answer rather than being worked out from a keystroke — which is
 * what the spike said it would.
 */
function modelInputSpan(event, doc) {
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
  if (!from || !to) return null;
  return { from, to, collapsed: collapsed || (from.block === to.block && from.offset === to.offset) };
}

// The same span, when both ends land in one block. Kept because most of this
// file only ever wants that, and a caller reading `{ block, from, to }` says so.
function modelInputRange(event, doc) {
  const span = modelInputSpan(event, doc);
  if (!span || span.from.block !== span.to.block) return null;
  return {
    block: span.from.block,
    from: Math.min(span.from.offset, span.to.offset),
    to: Math.max(span.from.offset, span.to.offset),
  };
}

/**
 * Show what an edit did, and tell the app about it.
 *
 * The order is the design's: change the model, then render from it, and the
 * render applies the selection the edit asked for. Nothing holds a `Range`
 * across that, because every node the old one pointed at has just been thrown
 * away.
 */
function modelInputShow(doc, block, at, inputType) {
  if (!modelRerenderBlock(editor, block, md, at)) {
    // The block owns no element and neither does anything above it, which is
    // the shape an html_block with two roots gets to. Falling back to the whole
    // document is heavy and correct; silently doing nothing is neither.
    modelRender(editor, doc, md, at);
  }
  modelInputAnnounce(inputType);
  return true;
}

/**
 * Show a **structural** edit, which is the whole document.
 *
 * A re-render of one block cannot express a block that was added or taken away,
 * so this rebuilds `#editor`. Named rather than hidden: slice 1 measured a full
 * render at 16.8ms on a 2,399-line document of 1,325 blocks, which is three
 * times the size of anything in this repo, so an Enter there costs about a
 * frame. The obvious optimisation — re-render the nearest container that owns
 * an element, and only fall back to the document at top level — is available
 * and is not taken, because a structural edit is rare next to a keystroke and a
 * second render path is a second thing that can be subtly wrong about the
 * block-to-element map.
 */
function modelInputRestructure(doc, at, inputType) {
  modelEnsureBlock(doc, md);
  modelRender(editor, doc, md, at);
  modelInputAnnounce(inputType);
  return true;
}

/**
 * An empty item has no block to type into until something types into it.
 *
 * 1b records one as a childless leaf holding its own marker, so the caret is
 * inside a block with no inline tree and every edit below would refuse. This is
 * the one place a read turns into a write before the edit it was asked for.
 */
function modelInputRetarget(doc, span) {
  const block = span.from.block;
  if (!span.collapsed || block.kind !== "item" || block.children || block.inlines) return span;
  const paragraph = modelFillItem(doc, block, md);
  if (!paragraph) return span;
  const at = { block: paragraph, offset: 0 };
  return { from: at, to: at, collapsed: true };
}

/**
 * Delete a span, without showing it. Hands back the position it collapsed to.
 *
 * One block is a splice — into the inline tree, or into the block's own source
 * when it is a fence or an indented code block, which is slice 4's second text
 * space. Two blocks is a **merge**: what is left of the first, what is left of
 * the last, and every block strictly between them taken out — with the
 * containers each removal emptied taken out too, which is `modelPruneBlock`'s
 * job and the part that stops an empty `<ul>` being left behind.
 *
 * **A merge needs two blocks with a common text space.** A paragraph and a
 * fence have none, so this refuses rather than approximating — the same refusal
 * slice 3 made in the same place, now with one case fewer behind it.
 */
function modelInputDelete(doc, span) {
  const from = span.from;
  const to = span.to;

  if (from.block === to.block) {
    const start = Math.min(from.offset, to.offset);
    const end = Math.max(from.offset, to.offset);
    const offset = modelBearsSource(from.block)
      ? modelSourceSplice(from.block, start, end, "", md)
      : modelInlineSplice(from.block, start, end, "");
    return offset === null ? null : { block: from.block, offset, structural: false };
  }

  if (!from.block.inlines || !to.block.inlines) return null;
  const flat = modelFlatten(doc).filter((block) => !block.children && block.kind !== "gap");
  const first = flat.indexOf(from.block);
  const last = flat.indexOf(to.block);
  if (first < 0 || last < 0 || last < first) return null;

  if (modelInlineSplice(from.block, from.offset, Number.MAX_SAFE_INTEGER, "") === null) return null;
  if (modelInlineSplice(to.block, 0, to.offset, "") === null) return null;
  for (const between of flat.slice(first + 1, last)) modelPruneBlock(doc, between);
  const offset = modelMergeBlocks(doc, from.block, to.block);
  return offset === null ? null : { block: from.block, offset, structural: true };
}

/**
 * Text typed, or a deletion. One block or two.
 *
 * A deletion spanning two blocks is a merge and changes the shape of the
 * document, so it is shown as a restructure; anything inside one block is the
 * block. **Text across two blocks is refused**: replacing a multi-block
 * selection with typed characters is a paste in everything but name, and paste
 * is slice 5's.
 */
function modelInputWrite(doc, span, text, inputType = "") {
  if (!span) return false;
  const target = modelInputRetarget(doc, span);

  if (text) {
    if (target.from.block !== target.to.block) return false;
    const block = target.from.block;
    const start = Math.min(target.from.offset, target.to.offset);
    const end = Math.max(target.from.offset, target.to.offset);
    const revise = modelInputRevises(block, start, end);
    // What the text being replaced was marked with, read before it goes.
    const inherit = modelBearsSource(block) ? null : modelInputMarksOf(block, start, end);
    const offset = modelBearsSource(block)
      ? modelSourceSplice(block, start, end, text, md)
      : modelInlineSplice(block, start, end, text);
    if (offset === null) return false;
    if (!modelBearsSource(block)) modelInputMarkTyped(doc, block, start, end, offset, text, inherit);
    // After the splice, so the join is spent on this edit's own announcement
    // and cannot be left standing for some later one if the splice refused.
    if (revise && typeof undoJoin === "function") undoJoin();
    // A rewrite extends the run it joined rather than starting a new one.
    modelPendingTyped = { block, from: revise ? modelLastTyped.from : start, to: offset };
    modelMathNext = { doc, id: block.id, at: offset };
    modelInputShow(doc, block, { block, offset }, "insertText");
    modelInputSettleMath(false);
    return true;
  }

  if (modelInputRevealMath(doc, target, inputType)) return true;
  const landed = modelInputDelete(doc, target);
  if (!landed) return false;
  const at = { block: landed.block, offset: landed.offset };
  if (landed.structural) return modelInputRestructure(doc, at, "deleteContentBackward");
  modelMathNext = { doc, id: landed.block.id, at: landed.offset };
  modelInputShow(doc, landed.block, at, "deleteContentBackward");
  modelInputSettleMath(false);
  return true;
}

// ── Marks ────────────────────────────────────────────────────────────────────
//
// Slice 7's step 3: bold, italic and strikethrough under the model core. The
// command itself is `modelToggleMark` in model.js; this is when it runs and
// what the editor shows afterwards.

const MODEL_MARK_INPUT_TYPES = { strong: "formatBold", em: "formatItalic", strike: "formatStrikeThrough" };

// The spelling a document with none of a mark yet should take: the sniffed
// style app.js keeps, feature-tested because front/input-check.html ships no
// app.js. Strikethrough has only one spelling, so it never asks.
function modelInputMarkFallback(kind) {
  if (typeof markdownStyle !== "object" || !markdownStyle) return undefined;
  if (kind === "strong") return markdownStyle.strongDelimiter;
  if (kind === "em") return markdownStyle.emDelimiter;
  return undefined;
}

/**
 * The marks waiting for the next character typed at a bare caret: `{ doc,
 * block, offset, marks }`, where `marks` maps a kind to whether that text
 * should carry it. Ctrl+B, type, Ctrl+B gives bold text, which is what all
 * three engines do natively and so what people already have — decided
 * 2026-09-28. It is consumed by the next text typed there, and dropped by
 * anything that moves the caret.
 */
let modelPendingMarks = null;

// Whether a mark kind is on at a caret: the marks the next character typed
// there would carry, which is `modelInlineAt`'s boundary rule — a position
// belongs to the node that ends there.
function modelInputCaretHas(block, offset, kind) {
  if (!block.inlines) return false;
  return modelInlineAt(block.inlines, offset).path.some((node) => node.kind === kind);
}

/**
 * Bold, italic or strikethrough, from the format bar or the Format menu.
 *
 * A selection is toggled and stays selected, since marks take no room in the
 * offset space. A bare caret sets the pending mark instead, or clears one that
 * is already set. Either way it is one undo step, announced as the
 * `inputType` the engine itself would use.
 */
function modelInputFormat(kind) {
  const doc = modelCurrentDocument();
  if (!doc || !MODEL_MARK_KINDS.has(kind)) return false;
  const at = modelReadSelection(editor, doc);
  if (!at) return true;

  if (!at.to) {
    const same = modelPendingMarks && modelPendingMarks.doc === doc &&
      modelPendingMarks.block === at.block && modelPendingMarks.offset === at.offset;
    const marks = same ? modelPendingMarks.marks : new Map();
    const now = marks.has(kind) ? marks.get(kind) : modelInputCaretHas(at.block, at.offset, kind);
    if (marks.has(kind)) marks.delete(kind);
    else marks.set(kind, !now);
    modelPendingMarks = marks.size ? { doc, block: at.block, offset: at.offset, marks } : null;
    return true;
  }

  const changed = modelToggleMark(doc, at, kind, md, modelInputMarkFallback(kind));
  if (!changed.length) return true;
  modelPendingMarks = null;
  const inputType = MODEL_MARK_INPUT_TYPES[kind];
  if (changed.length === 1) return modelInputShow(doc, changed[0], at, inputType);
  modelRender(editor, doc, md, at);
  modelInputAnnounce(inputType);
  return true;
}

// The marks every character of `[start, end)` carries, by kind, or null for an
// empty range: what text typed over that range should carry.
function modelInputMarksOf(block, start, end) {
  if (start === end || !block.inlines) return null;
  const marks = new Map();
  for (const kind of MODEL_MARK_KINDS) {
    const covers = modelMarkCovers(block, start, end, kind);
    if (covers !== null) marks.set(kind, covers);
  }
  return marks.size ? marks : null;
}

/**
 * Give text just typed the marks it should have, after the splice.
 *
 * **Typing over a selection keeps what the selection was marked with**, which
 * is stage 0's open finding: a new run inherits from what was deleted when
 * something was, and from the left otherwise — so typing over a fully bold
 * word gives bold, where the boundary rule alone would give whatever sits to
 * the left of the selection. And a bare caret's pending marks are applied
 * here, to the text typed where they were set.
 */
function modelInputMarkTyped(doc, block, start, end, offset, text, inherit) {
  let marks = inherit;
  const pending = modelPendingMarks;
  modelPendingMarks = null;
  if (!marks && start === end && pending && pending.doc === doc &&
      pending.block === block && pending.offset === start) marks = pending.marks;
  if (!marks || offset <= start) return;
  for (const [kind, want] of marks) {
    if (modelInputCaretHas(block, offset, kind) === want) continue;
    modelSetMark(block, start, offset, kind, want, md,
      modelMarkPreference(doc, kind, modelInputMarkFallback(kind)), modelReferenceEnv(doc, md));
  }
  // A mark never starts with a space, so a space typed first leaves the marks
  // waiting for the letter after it.
  if (marks === (pending && pending.marks) && !text.trim()) {
    modelPendingMarks = { doc, block, offset, marks };
  }
}

// Anything that moves the caret away from a pending mark drops it.
function modelInputSelectionMarks() {
  const pending = modelPendingMarks;
  if (!pending) return;
  const doc = modelCurrentDocument();
  const at = doc === pending.doc ? modelReadSelection(editor, doc) : null;
  if (!at || at.to || at.block !== pending.block || at.offset !== pending.offset) modelPendingMarks = null;
}

// ── Equations by typing ──────────────────────────────────────────────────────
//
// Slice 7's step 10, on probation: docs/REWRITE.md has the decisions and the
// tripwire. `model.js` finds, converts and reveals; this decides when. A span
// converts once the caret is outside it and not sitting straight after its
// closing `$` — `mathSpan` says no to a closing `$` followed by a digit, and at
// the end of the text it cannot see one coming, so `$5 and $` must wait to see
// whether `10` follows. That one rule covers every trigger the plan names: the
// next character typed, Enter (the caret goes to the next block), and the caret
// leaving by any other route, which is the `selectionchange` below.

/**
 * The edit a typed equation would come from: `{ doc, id, at }`, the block and
 * the offset the last text edit left the caret at. Only a span touching that
 * offset is considered, so a plain-text paste of `$x$` stays the literal text
 * it was pasted as unless somebody types against it.
 *
 * Set by a text edit or a deletion inside one block, kept across Enter and
 * Shift+Enter — the two edits whose whole point here is that the caret moves
 * on — and dropped by every other announcement. Keyed on the document object,
 * so an undo, which installs a different one, leaves it describing nothing.
 */
let modelMathPending = null;
let modelMathNext = null;
const MODEL_MATH_KEEPS = new Set(["insertParagraph", "insertLineBreak"]);

/**
 * The conversion just made, `{ doc, id, source }`, until anything else
 * happens. If the next thing is a different document — an undo — the user
 * took the conversion back, and it is **declined**: that span in that block
 * is left as text until its text changes, or the very next keystroke would
 * convert it straight back.
 */
let modelMathLast = null;
const modelMathDeclined = new Set();

function modelMathKey(id, source) {
  return id + "\n" + source;
}

/**
 * Convert the pending span if the caret has left it. `leaving` is true when
 * the caret is known to be elsewhere whatever the selection says.
 *
 * Its own undo step, announced as `insertEquation`, so Ctrl+Z straight after
 * gives back exactly the text that was typed.
 */
function modelInputSettleMath(leaving) {
  if (modelInputComposing()) return false;
  const doc = modelCurrentDocument();
  if (modelMathLast && modelMathLast.doc !== doc) {
    modelMathDeclined.add(modelMathKey(modelMathLast.id, modelMathLast.source));
    modelMathLast = null;
  }
  const pending = modelMathPending;
  if (!pending || !doc) return false;
  if (pending.doc !== doc) {
    modelMathPending = null;
    return false;
  }
  const block = modelBlockById(doc, pending.id);
  if (!block || !block.inlines) {
    modelMathPending = null;
    return false;
  }

  const caret = leaving ? null : modelReadSelection(editor, doc);
  if (caret && caret.to) return false; // a selection is being made; wait for it
  const here = caret && caret.block === block ? caret.offset : null;
  const span = modelMathCandidates(block).find((candidate) =>
    candidate.start <= pending.at && pending.at <= candidate.end + 1 &&
    !modelMathDeclined.has(modelMathKey(block.id, candidate.source)) &&
    (here === null || here <= candidate.start || here > candidate.end));
  if (!span) {
    if (here === null) modelMathPending = null;
    return false;
  }

  if (modelMathConvert(block, span.start, span.end, md) === null) {
    modelMathPending = null;
    return false;
  }
  modelMathPending = null;
  // The caret where it was, moved back by the TeX the atom now stands for when
  // it was after it.
  const at = here === null
    ? caret
    : { block, offset: here > span.end ? here - (span.end - span.start) + 1 : here };
  modelInputShow(doc, block, at, "insertEquation");
  modelMathLast = { doc, id: block.id, source: span.source };
  // Said out loud, because text turning into something else as the caret moves
  // on reads as a glitch unless the editor owns up to it — and the toast is
  // where the way back is named. Feature-tested: front/input-check.html ships
  // no notify.js, and toolbar.js is what knows Cmd from Ctrl.
  if (typeof notify === "function") {
    const keys = typeof shortcutLabel === "function" ? shortcutLabel("Ctrl+Z") : "Ctrl/Cmd+Z";
    notify(`Converted to an equation. ${keys} keeps it as text.`);
  }
  return true;
}

/**
 * Backspace into an equation shows its source instead of deleting it, and
 * Delete does the same from the other side. Only from a bare caret: an
 * equation that is selected, or part of a wider selection, is deleted like
 * anything else, which is how a whole one is removed.
 */
function modelInputRevealMath(doc, span, inputType) {
  const backward = inputType === "deleteContentBackward";
  if (!backward && inputType !== "deleteContentForward") return false;
  const live = window.getSelection();
  if (!live || !live.isCollapsed) return false;
  if (span.from.block !== span.to.block) return false;
  const block = span.from.block;
  const start = Math.min(span.from.offset, span.to.offset);
  if (Math.max(span.from.offset, span.to.offset) !== start + 1) return false;
  const offset = modelMathReveal(block, start, backward);
  if (offset === null) return false;
  // Revealed on purpose, so a decline from an earlier undo no longer applies:
  // leaving the source is meant to re-form it.
  const revealed = modelMathCandidates(block).find((candidate) => candidate.start === start);
  if (revealed) modelMathDeclined.delete(modelMathKey(block.id, revealed.source));
  modelMathNext = { doc, id: block.id, at: offset };
  return modelInputShow(doc, block, { block, offset }, "deleteEquation");
}

function modelInputSelectionMath() {
  modelInputSettleMath(false);
}

/**
 * Enter and Backspace on an empty item, which are the two hand-rolled clusters
 * arriving as model rules — see `modelEmptyItemKey`.
 *
 * Asked before the generic handling and answering for itself, because what the
 * engine would report for either is a deletion or a split of a block that holds
 * nothing: the shape is the same and the intent is not.
 */
function modelInputEmptyItem(doc, backspace) {
  const at = modelReadSelection(editor, doc);
  if (!at) return false;
  const item = modelItemAncestor(at.block);
  if (!item || !modelIsEmptyBlock(item)) return false;
  if (backspace && at.offset !== 0) return false;
  const landed = modelEmptyItemKey(doc, item, md, backspace);
  return modelInputRestructure(doc, landed, backspace ? "deleteContentBackward" : "insertParagraph");
}

/**
 * Enter. Slice 4's step 2.
 *
 * A selection is deleted first and the split happens where it collapsed, which
 * is what every editor does and what the model already has the pieces for. In a
 * fence there is no split to make — its content is source — so Enter is a
 * newline in the body, which is also what it does today.
 */
function modelInputParagraph(doc, span) {
  if (!span) return false;
  const target = modelInputRetarget(doc, span);

  let block = target.from.block;
  let offset = target.from.offset;
  if (!target.collapsed) {
    const landed = modelInputDelete(doc, target);
    if (!landed) return false;
    block = landed.block;
    offset = landed.offset;
  }

  if (modelBearsSource(block)) {
    const at = modelSourceSplice(block, offset, offset, "\n", md);
    if (at === null) return false;
    return modelInputShow(doc, block, { block, offset: at }, "insertParagraph");
  }

  const landed = modelInsertParagraph(doc, block, offset, md);
  if (!landed) return false;
  return modelInputRestructure(doc, landed, "insertParagraph");
}

/**
 * Shift+Enter. Slice 4's step 4.
 *
 * The spelling comes from `sniffMarkdownStyle`'s document-wide answer, read
 * here and handed over rather than reached for in model.js — the same boundary
 * the parser injection draws. `markdownStyle` is app.js's, which is why this
 * file loads after it.
 */
function modelInputLineBreak(doc, span) {
  if (!span) return false;
  const target = modelInputRetarget(doc, span);
  let block = target.from.block;
  let offset = target.from.offset;
  if (!target.collapsed) {
    const landed = modelInputDelete(doc, target);
    if (!landed) return false;
    block = landed.block;
    offset = landed.offset;
  }
  const spelling = typeof markdownStyle === "object" && markdownStyle ? markdownStyle.hardBreak : "  ";
  const at = modelInsertBreak(block, offset, spelling);
  if (at === null) return false;
  return modelInputShow(doc, block, { block, offset: at }, "insertLineBreak");
}

/**
 * Tab and Shift+Tab, and the Format menu's two items, which ask the identical
 * question — the same arrangement `canIndentListItem` already has on the old
 * core.
 *
 * Hands back whether it answered, so `app.js`'s toolbar handlers know not to
 * fall through to `outdentListItem` — which mutates the DOM directly, behind
 * the model's back, which is exactly what this layer exists to stop.
 *
 * **It does not ask whether the flag is on**, and that is the boundary this
 * file keeps: the install block at the bottom is the one place the flag is
 * read, and once the layer is installed it works. `front/input-check.html`
 * installs it deliberately without flipping the flag for the app on the same
 * origin, and a second guard in here made Tab do nothing on the one page built
 * to measure it. The caller that has a fallback asks the flag; the layer does
 * its job.
 */
function modelIndentAtCaret(outdent) {
  const doc = modelCurrentDocument();
  if (!doc) return false;
  const at = modelReadSelection(editor, doc);
  if (!at) return true;
  const item = modelItemAncestor(at.block);
  if (!item) return true;
  const moved = outdent ? modelOutdentItem(doc, item) : modelIndentItem(doc, item);
  if (!moved) return true;
  modelRender(editor, doc, md, at);
  modelInputAnnounce(outdent ? "formatOutdent" : "formatIndent");
  return true;
}

/**
 * Tab is the first thing this layer binds that is not an `inputType`, and it
 * has to be: a keydown is where Tab arrives, and no engine reports it as an
 * editing intention. It is also the shape slice 7's format shortcuts take.
 *
 * **Outside a list Tab keeps its default job of leaving the editor**, which is
 * a keyboard user's only way out and is today's rule kept rather than
 * re-decided.
 */
function modelInputKeydown(event) {
  if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  const doc = modelCurrentDocument();
  if (!doc) return;
  const at = modelReadSelection(editor, doc);
  if (!at || !modelItemAncestor(at.block)) return;
  event.preventDefault();
  modelIndentAtCaret(event.shiftKey === true);
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
  modelLastTyped = modelPendingTyped;
  modelPendingTyped = null;
  modelMathPending = modelMathNext || (MODEL_MATH_KEEPS.has(inputType) ? modelMathPending : null);
  modelMathNext = null;
  modelMathLast = null;
  const event = typeof InputEvent === "function"
    ? new InputEvent("input", { inputType, bubbles: true })
    : new Event("input", { bubbles: true });
  editor.dispatchEvent(event);
}

/**
 * What the last keystroke typed: `{ block, from, to }`, or null.
 *
 * Set by a text edit through `modelInputWrite` and **replaced on every
 * announcement**, so any other edit — a deletion, an Enter, a paste, a
 * composition — clears it. An undo installs a fresh copy of the document with
 * its own block objects, so a record from before it can never match again.
 */
let modelLastTyped = null;
let modelPendingTyped = null;

/**
 * Whether a text edit rewrites exactly what the last keystroke typed.
 *
 * The macOS press-and-hold accent. Hold `e` and the engine types it as an
 * ordinary edit; pick `é` from the popup and it replaces that `e` — as an
 * `insertText` whose target range covers it in Firefox, and as an
 * `insertReplacementText` doing the same in Safari, both measured on
 * `front/input-check.html`. The wait on the popup is far past the coalescing
 * window, so without a join one Cmd+Z took back the accent and left a bare
 * vowel nobody typed.
 *
 * **Keyed on the model, not on the selection.** The first version asked
 * whether the selection was collapsed while the range was not, and still
 * failed in Firefox — macOS marks the vowel while the popup is up. What both
 * engines agree on is where the range *is*: inside what was just typed, ending
 * where it ended. Selecting a word typed earlier and typing over it fails that,
 * and stays its own step.
 */
function modelInputRevises(block, start, end) {
  const last = modelLastTyped;
  return !!last && start < end && last.block === block &&
    end === last.to && start >= last.from;
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
    // **A text edit that carries no text is not a deletion.** Safari sends
    // `insertReplacementText` with `data` null and the text in `dataTransfer`,
    // which is where the specification puts it for that type — and reading
    // `data` alone turned its accent popup into a Backspace that erased the
    // letter. Measured in Safari on 2026-09-28. Anything still empty after both
    // is refused, since writing nothing over a range is a deletion nobody asked
    // for.
    const text = event.data ||
      (event.dataTransfer && event.dataTransfer.getData("text/plain")) || "";
    if (!text) return;
    modelInputWrite(doc, modelInputSpan(event, doc), text);
    return;
  }
  if (MODEL_INPUT_DELETE_TYPES.has(event.inputType)) {
    if (modelInputEmptyItem(doc, true)) return;
    modelInputWrite(doc, modelInputSpan(event, doc), "", event.inputType);
    return;
  }
  if (event.inputType === "insertParagraph") {
    if (modelInputEmptyItem(doc, false)) return;
    modelInputParagraph(doc, modelInputSpan(event, doc));
    return;
  }
  if (event.inputType === "insertLineBreak") {
    modelInputLineBreak(doc, modelInputSpan(event, doc));
    return;
  }
  // The engine's own undo gesture — the macOS trackpad swipe, a context menu,
  // a mobile keyboard's own button — which means exactly what Ctrl+Z means and
  // so goes to exactly the same place. Cancelled like everything else either
  // way; what this adds is that the intention is now carried out rather than
  // dropped, which is the right default for a type nobody has claimed and the
  // wrong one for this pair.
  //
  // **A bonus entry point rather than the mechanism.** `undo.js` binds the
  // keyboard itself, on `document`, and calls `preventDefault` — which should
  // stop the engine running the default action these types are raised as part
  // of, so a Ctrl+Z should never arrive here as well. *Should*: that is a
  // per-engine fact and it is asked on the check page rather than assumed
  // here, because the shape of any suppression depends on which engine needs
  // one. If a Ctrl+Z ever does raise one of these, the symptom is two steps
  // back for one press — confusing, and recoverable with a redo.
  //
  // Feature-tested because `front/input-check.html` deliberately ships no
  // `undo.js`: it measures this layer against a real engine, not the
  // application around it, so there the event is logged and nothing happens.
  if (event.inputType === "historyUndo") {
    if (typeof undo === "function") undo();
    return;
  }
  if (event.inputType === "historyRedo") {
    if (typeof redo === "function") redo();
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
  // Read as the model holds it: the DOM builder draws a space that would
  // collapse as U+00A0 (`modelHoldSpaces`), and diffing that against the
  // model's plain space would rewrite text the composition never touched.
  const now = modelDomText(el).replace(/\u00A0/g, " ");
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
  // A composition that replaced text the model already held is rewriting what
  // was just typed — the press-and-hold accent turning `e` into `é` — so it
  // belongs to that keystroke's undo step rather than being its own. One that
  // only inserted, like a dead key, is an ordinary step. Feature-tested for the
  // reason the history route is: this file's check page ships no undo.js.
  if (was.length - tail > head && typeof undoJoin === "function") undoJoin();
  modelInputAnnounce("insertCompositionText");
}

// ── Paste and drop ───────────────────────────────────────────────────────────
//
// Slice 5. Content arriving from outside the document, which is the one thing
// the model cannot produce for itself — so it is also the one place Turndown
// survives into the new core, converting somebody else's HTML on the way in.
// It leaves the save path at stage 4; this is the last thing it does.
//
// **The `paste` and `drop` events rather than `beforeinput`.** Both fire first,
// both carry their data by specification, and cancelling either stops the
// insertion before an `insertFromPaste` or `insertFromDrop` is ever raised.
// `beforeinput` goes on cancelling those types too, which costs nothing and is
// what the design says to do with a type nobody has claimed — so a browser that
// raised one without the event before it still changes nothing behind the
// model's back.

/**
 * HTML from a clipboard or a drag, as blocks.
 *
 * `sanitisePastedHtml` and `normaliseNbsp` exactly as today — a paste should
 * keep its bold, its links and its tables, and only what nobody can see goes —
 * then `htmlFragmentToMarkdown` and `modelParse`. Hands back null when the
 * fragment sanitises to nothing, which is a paste of pure wrappers and is the
 * caller's cue to fall through to the plain text rather than insert an empty
 * string and leave the user wondering where their paste went.
 *
 * **Both converters are app.js's, and both are feature-tested**, which is not
 * defensive coding: `front/input-check.html` deliberately does not load app.js,
 * because what it measures is this layer against a real engine and not the
 * application around it. There the HTML branch falls through to the plain text
 * and the page says so, so the questions that page exists to answer — does the
 * engine hand over `text/html` at all, does cancelling the event stop the
 * insertion, where does a drop land — are still the ones being asked. In both
 * real bundles model-input.js loads after app.js and the test always passes.
 */
function modelPasteBlocks(doc, html) {
  if (!html || !html.trim()) return null;
  if (typeof sanitisePastedHtml !== "function" || typeof htmlFragmentToMarkdown !== "function") return null;
  const clean = sanitisePastedHtml(html);
  if (!clean.trim()) return null;
  const markdown = htmlFragmentToMarkdown(clean);
  if (!markdown.trim()) return null;
  return modelParse(markdown, md).blocks;
}

/**
 * Put a clipboard's two flavours into the document at a model position.
 *
 * HTML first and plain text as the fallback, which is the order
 * `insertPastedContent` has always used. **Plain text is never parsed as
 * markdown** — today's behaviour, and the reason Insert → *Paste markdown* is a
 * separate action: that one is this pipeline without the Turndown step.
 */
function modelInputPaste(doc, at, html, text, inputType = "insertFromPaste") {
  if (!at) return false;
  const blocks = modelPasteBlocks(doc, html) || (text ? modelTextBlocks(doc, md, text) : null);
  if (!blocks || !blocks.length) return false;
  const landed = modelInsertBlocks(doc, at.block, at.offset, blocks);
  if (!landed) return false;
  return modelInputRestructure(doc, landed, inputType);
}

// Where an edit lands: the selection, with any range it covers deleted first.
// Hands back null when the model cannot name the position, which is a refusal
// rather than a guess about where the content should go.
function modelInputCollapsed(doc) {
  const at = modelReadSelection(editor, doc);
  if (!at) return null;
  const live = window.getSelection();
  if (!live || !live.rangeCount || live.getRangeAt(0).collapsed) return at;
  // No event to read a target range off — a menu click and a drop have none —
  // so `modelInputSpan` falls through to the live selection, which is what a
  // paste replaces.
  const span = modelInputSpan({}, doc);
  if (!span || span.collapsed) return at;
  const landed = modelInputDelete(doc, span);
  return landed ? { block: landed.block, offset: landed.offset } : null;
}

function modelInputPasteEvent(event) {
  const doc = modelCurrentDocument();
  if (!doc || modelInputComposing()) return;
  event.preventDefault();
  const data = event.clipboardData;
  if (!data) return;
  modelInputPaste(doc, modelInputCollapsed(doc), data.getData("text/html"), data.getData("text/plain"));
}

/**
 * A drag that started inside the editor is a **move**, not a copy.
 *
 * The engine would raise `deleteByDrag` and `insertFromDrop` as a pair; both
 * are cancelled, so doing only the insert would duplicate the text and leave
 * the original standing — which is the worst of the three possible answers,
 * because it looks like it worked. The source is recorded here, in model
 * coordinates, because by the time `drop` fires the selection has moved.
 */
let modelDragSource = null;

function modelInputDragStart() {
  const doc = modelCurrentDocument();
  if (!doc) return;
  const live = window.getSelection();
  if (!live || !live.rangeCount || live.getRangeAt(0).collapsed) return;
  modelDragSource = modelInputSpan({}, doc);
}

function modelInputDragEnd() {
  modelDragSource = null;
}

/**
 * Say that a drop is welcome here, on every `dragover`.
 *
 * **Without this there is no `drop` event at all**, and that is the spec rather
 * than a quirk: an element accepts a drop only if something cancels `dragover`
 * over it. On the old core nobody had to, because the browser performs the drop
 * *itself* — a `contenteditable` is a drop target the engine handles natively.
 * Under the model core that native drop is exactly what is suppressed, so the
 * editor becomes an ordinary **scripted** drop target and has to say so.
 *
 * Missing from slice 5 and found by hand on 2026-09-21: drag-and-drop did
 * nothing in Blink and WebKit while working in Gecko, which is the engines
 * disagreeing about how much they will do for a `contenteditable` that has
 * stopped behaving like one — not about drag and drop.
 *
 * `dragenter` as well as `dragover`, because the two are one answer: an engine
 * that reads the first as the refusal never sends the second.
 *
 * **`dropEffect` is what the cursor shows**, and it has to match what will
 * actually happen or the pointer promises the wrong thing: a drag that started
 * in this editor is a *move* — see `modelInputDrop` — and anything from outside
 * is a copy, because we cannot remove it from wherever it came from.
 */
function modelInputDragOver(event) {
  if (!modelCurrentDocument()) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = modelDragSource ? "move" : "copy";
}

/**
 * The model position under the pointer.
 *
 * Two spellings, because this is one of the places the engines never agreed:
 * `caretPositionFromPoint` is the standard and Gecko's, `caretRangeFromPoint`
 * is Blink's and WebKit's. Which one answers is a browser fact, so the check
 * page reports it rather than this file assuming it.
 */
function modelInputPointAt(doc, x, y) {
  const owner = editor.ownerDocument;
  let node = null;
  let offset = 0;
  if (typeof owner.caretPositionFromPoint === "function") {
    const position = owner.caretPositionFromPoint(x, y);
    if (position) {
      node = position.offsetNode;
      offset = position.offset;
    }
  }
  if (!node && typeof owner.caretRangeFromPoint === "function") {
    const range = owner.caretRangeFromPoint(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  return node ? modelDomBlockAt(editor, doc, node, offset, -1) : null;
}

/**
 * Say that a drop was refused, and why.
 *
 * A refusal is correct and indistinguishable from a failure: the text stays
 * where it was either way. So it is announced as a `modeldroprefused` event
 * carrying the reason, which `front/input-check.html` logs — the same lesson
 * as its "no dragstart followed" line, that a page which says nothing reads as
 * having no opinion. The app listens to nothing, so it costs nothing there.
 */
function modelInputRefuseDrop(reason) {
  editor.dispatchEvent(new CustomEvent("modeldroprefused", { detail: { reason } }));
}

function modelInputDrop(event) {
  const doc = modelCurrentDocument();
  if (!doc || modelInputComposing()) return;
  event.preventDefault();
  const data = event.dataTransfer;
  if (!data) return;

  let at = modelInputPointAt(doc, event.clientX, event.clientY);
  const source = modelDragSource;
  modelDragSource = null;
  if (!at) return;

  if (source) {
    // **A drag spanning two blocks is refused rather than approximated**, which
    // is the same refusal the merge made before slice 4 gave it an
    // implementation: the offsets on the far side of a merge are not the
    // offsets the drop was measured against, and getting that wrong moves the
    // user's text somewhere they did not point at.
    if (source.from.block !== source.to.block) return modelInputRefuseDrop("spans two blocks");
    const start = Math.min(source.from.offset, source.to.offset);
    const end = Math.max(source.from.offset, source.to.offset);
    if (at.block === source.from.block && at.offset >= start && at.offset <= end) {
      return modelInputRefuseDrop("dropped onto itself");
    }
    // **What moves is the model's own content, read before it is taken out**,
    // not what the engine put on the drag: measured 2026-10-01, Firefox and
    // Chrome both left an equation out of a dragged selection, so the move
    // deleted it. See modelInlineSourceRange.
    const moved = modelInlineSourceRange(source.from.block, start, end, md);
    if (moved === null || !moved.trim()) return;
    if (modelInlineSplice(source.from.block, start, end, "") === null) return;
    // Only when the two are in the same block does taking the source out move
    // the target; anywhere else the offset still names the same place.
    if (at.block === source.from.block && at.offset > end) at = { block: at.block, offset: at.offset - (end - start) };
    const landed = modelInsertBlocks(doc, at.block, at.offset, modelParse(moved, md).blocks);
    if (landed) modelInputRestructure(doc, landed, "insertFromDrop");
    return;
  }

  modelInputPaste(doc, at, data.getData("text/html"), data.getData("text/plain"), "insertFromDrop");
}

// ── The clipboard, reached from the menu ─────────────────────────────────────
//
// Edit → Paste, Edit → Paste without formatting and Insert → Paste markdown all
// reach `runCommand` on the old core, which refuses under the flag — so without
// these three they would silently do nothing. Same arrangement the two list
// items got in slice 4: app.js asks whether the model core is on, and these do
// the work when it is.

function modelPasteInto(html, text) {
  const doc = modelCurrentDocument();
  if (!doc) return false;
  return modelInputPaste(doc, modelInputCollapsed(doc), html, text);
}

function modelPastePlain(text) {
  const doc = modelCurrentDocument();
  if (!doc || !text) return false;
  const at = modelInputCollapsed(doc);
  if (!at) return false;
  // One line is an ordinary insertion and must not split anything; several are
  // blocks. `modelInlineSplice` normalises U+00A0 on the way through, which is
  // the same boundary slice 3 put it at.
  if (!/[\r\n]/.test(text)) {
    const offset = modelInlineSplice(at.block, at.offset, at.offset, text);
    if (offset === null) return false;
    return modelInputShow(doc, at.block, { block: at.block, offset }, "insertFromPaste");
  }
  const landed = modelInsertBlocks(doc, at.block, at.offset, modelTextBlocks(doc, md, text));
  if (!landed) return false;
  return modelInputRestructure(doc, landed, "insertFromPaste");
}

/**
 * Insert → *Paste markdown*: the same pipeline with the Turndown step taken
 * out, because what is on the clipboard is already markdown.
 *
 * It is the one paste that *parses*, which is exactly the distinction the menu
 * draws — and the reason it sits in Insert rather than beside Edit's Paste.
 */
function modelPasteMarkdown(text) {
  const doc = modelCurrentDocument();
  if (!doc || !text || !text.trim()) return false;
  const at = modelInputCollapsed(doc);
  if (!at) return false;
  const landed = modelInsertBlocks(doc, at.block, at.offset, modelParse(text, md).blocks);
  if (!landed) return false;
  return modelInputRestructure(doc, landed, "insertFromPaste");
}

// ── Installation ─────────────────────────────────────────────────────────────
//
// After app.js, which defines `editor` and `md`, and after model.js, which
// defines everything else here. Registered only under the model core: with the
// flag off this file is inert, and the editor is the one the rest of CLAUDE.md
// describes.

/**
 * A caret that lands *inside* an equation moves to the edge it is nearer.
 *
 * Slice 7's step 2, measured by hand on 2026-10-01: a click just after an
 * equation that ends a line puts the caret on one of MathJax's own glyph
 * elements (`MJX-C`, offset 0) — first in Firefox, until the wrapper was made
 * uneditable, and then in Chrome even with the wrapper and the container both
 * uneditable, where no caret stop on `tests/caret-guard-check.html` helped
 * either. `modelDomOffset` reads any position inside an atom as its front
 * edge, which is right for a range's start and wrong for this, so a letter
 * typed there went in front of the equation the user had clicked after.
 *
 * So the side comes from where the caret actually is on screen, not from the
 * DOM: the glyph it sits on is past the equation's midpoint or it is not. That
 * holds in any engine and for any shape of stop, and a click on an equation
 * mid-line goes to its nearer edge as well. A selection that is not collapsed
 * is left alone — dragging across an equation is a real selection of it — and
 * so is anything during a composition, which owns the text under the caret.
 */
function modelInputLeaveAtom() {
  if (modelInputComposing()) return;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return;
  const anchor = selection.anchorNode;
  const element = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
  const atom = element && element.closest && element.closest("[data-math]");
  if (!atom && element && element.closest) modelInputLeaveFront(selection, element);
  if (!atom || !editor.contains(atom)) return;

  // The glyph the caret sits on, or the element it is inside. A collapsed range
  // there can measure as an empty rectangle at the origin, so the element's own
  // box is the reliable one.
  const at = anchor.nodeType === 1 && anchor.childNodes[selection.anchorOffset]
    ? anchor.childNodes[selection.anchorOffset]
    : element;
  const glyph = (at.nodeType === 1 ? at : element).getBoundingClientRect();
  // A caret at the *end* of an element that has children — Blink puts one at
  // `MJX-MATH` offset 1 for a click after a line-ending equation — names no
  // child to measure, and the element's own centre is never past the
  // equation's midpoint. Its right edge is where the caret is.
  const atEnd = anchor.nodeType === 1 && anchor.childNodes.length > 0 &&
    selection.anchorOffset >= anchor.childNodes.length;
  // When a click has just placed it, though, the click is the answer. An
  // equation of one glyph — `$z$` — *is* its glyph, so the glyph's centre is
  // the equation's centre and a click after it ties with a click before it.
  const press = modelInputFreshPress();
  modelInputCaretBeside(atom, press ? press.x : atEnd ? glyph.right : glyph.left + glyph.width / 2);
}

// The last mouse press in the editor, which `modelInputLeaveAtom` reads: the
// engine places a click's caret on the mousedown, and the `selectionchange` it
// raises follows within a task or two. A caret that lands inside an equation
// later than this did not come from a click, and is measured the old way.
let modelInputPress = null;
const MODEL_PRESS_FRESH_MS = 500;

function modelInputFreshPress() {
  return modelInputPress && performance.now() - modelInputPress.time < MODEL_PRESS_FRESH_MS
    ? modelInputPress : null;
}

/**
 * A click after an equation that WebKit puts in front of it.
 *
 * Measured by hand in Safari on 2026-10-10: the caret does not land inside the
 * equation, as it does in Blink, but in the caret stop in front of it — the
 * zero-width `<span data-filler>` `modelPlaceStops` puts before an equation that
 * starts a line — so `modelInputLeaveAtom` saw nothing to leave and a letter
 * went in front of the equation the user had clicked after. Only an equation
 * that starts its line has a front stop.
 *
 * So a caret that a click has just put in a stop is moved after the equation
 * when the click was on the equation's own line and past its midpoint. A click
 * before it, or on another line, leaves the caret in the stop, where it belongs.
 *
 * **WebKit has a second spelling of the same place**, found by
 * `tests/browser/equation-typing.spec.mjs` on 2026-10-21 in Playwright's WebKit
 * 27.2: an equation that ends its line with text before it — `Also $z$` — has no
 * front stop, and a click anywhere after it puts the caret at the *end of that
 * text*. That is in front of the equation too, in a text node rather than a
 * stop, so the same rule covers it: whatever position directly precedes the
 * equation counts, however the engine spells it.
 */
function modelInputLeaveFront(selection, element) {
  const press = modelInputFreshPress();
  if (!press) return;
  const atom = modelInputAtomAhead(selection, element);
  if (!atom || !editor.contains(atom)) return;
  const box = atom.getBoundingClientRect();
  if (press.y < box.top || press.y > box.bottom) return;
  if (press.x > box.left + box.width / 2) modelInputCaretBeside(atom, press.x);
}

// The equation a collapsed caret sits directly in front of, or null: from
// inside its caret stop, from the end of the text node just before it, or from
// an element offset that names it.
function modelInputAtomAhead(selection, element) {
  const isAtom = (node) => node && node.nodeType === 1 && node.hasAttribute("data-math");
  const stop = element.closest(`[${MODEL_FILLER_ATTR}]`);
  if (stop) return isAtom(stop.nextSibling) ? stop.nextSibling : null;
  const anchor = selection.anchorNode;
  const offset = selection.anchorOffset;
  if (anchor.nodeType === 3) {
    return offset === anchor.data.length && isAtom(anchor.nextSibling) ? anchor.nextSibling : null;
  }
  const next = anchor.childNodes[offset];
  return isAtom(next) ? next : null;
}

// Put the caret at whichever edge of `atom` the screen position `x` is nearer.
function modelInputCaretBeside(atom, x) {
  const box = atom.getBoundingClientRect();
  const after = x > box.left + box.width / 2;
  const selection = window.getSelection();
  const parent = atom.parentNode;
  const index = Array.prototype.indexOf.call(parent.childNodes, atom);
  const range = document.createRange();
  const stop = atom.previousSibling;
  if (after) range.setStart(parent, index + 1);
  // In front of an equation that starts a line, inside the caret stop, the one
  // place there Firefox draws a caret — see modelPlaceStops.
  else if (stop && stop.nodeType === 1 && stop.hasAttribute(MODEL_FILLER_ATTR) && stop.firstChild) {
    range.setStart(stop.firstChild, stop.firstChild.textContent.length);
  } else range.setStart(parent, index);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * A press *on* an equation puts the caret beside it, at the nearer edge.
 *
 * Measured in Blink on 2026-10-01: clicking an uneditable equation does not
 * move the caret at all — no `selectionchange` fires — so the next letter
 * landed wherever the caret already was, somewhere else in the document. The
 * press is cancelled, which also stops a drag selection starting *on* an
 * equation; one starting beside it still works, and a press on an equation
 * already inside the selection is left alone, since that is how a drag of the
 * selection begins. Shift is left to the engine, since it extends a selection
 * rather than placing a caret.
 */
function modelInputPressAtom(event) {
  if (event.button !== 0 || event.shiftKey) return;
  const atom = event.target && event.target.closest && event.target.closest("[data-math]");
  if (!atom || !editor.contains(atom)) return;
  // Pressing on an equation that is part of the current selection is how a
  // drag of that selection starts (slice 5), so it is left to the engine.
  const selection = window.getSelection();
  if (selection && selection.rangeCount && !selection.isCollapsed &&
      selection.getRangeAt(0).intersectsNode(atom)) return;
  event.preventDefault();
  editor.focus({ preventScroll: true });
  modelInputCaretBeside(atom, event.clientX);
}

/**
 * Copy and cut write the clipboard themselves — slice 7's step 2.
 *
 * Measured by hand on 2026-10-01: copying or cutting a selection with an
 * equation in it, in Firefox and in Chrome, left the equation out of what was
 * pasted — and a cut deleted it from the document. The engines serialise the
 * selection themselves and the uneditable equation does not survive that, the
 * same loss a drag had. A copy of the selected DOM does keep it, stamp and all,
 * and the paste path already turns that back into `$…$` (measured in Blink), so
 * that is what goes on the clipboard as HTML: paragraphs and list items keep
 * their structure, which a copy out of the model would have to rebuild. The
 * caret stops go, being nothing. The plain half shows each equation as its
 * `$…$` source rather than MathJax's glyph text, and keeps line breaks by
 * measuring `innerText` on a copy placed off screen.
 *
 * A cut then deletes through the model, the way Backspace over the same
 * selection would, announced as `deleteByCut` so it is its own undo step.
 */
function modelInputClipboard(event, cut) {
  const doc = modelCurrentDocument();
  if (!doc || modelInputComposing() || !event.clipboardData) return;
  const live = window.getSelection();
  if (!live || !live.rangeCount || live.isCollapsed) return;
  const range = live.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  const holder = document.createElement("div");
  holder.appendChild(range.cloneContents());
  for (const stop of holder.querySelectorAll(`[${MODEL_FILLER_ATTR}]`)) stop.remove();
  // A space the DOM builder drew as U+00A0 is a plain space in the model, and
  // should be one wherever it is pasted — see `modelHoldSpaces`.
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent.includes("\u00A0")) node.textContent = node.textContent.replace(/\u00A0/g, " ");
  }
  const html = holder.innerHTML;
  for (const equation of holder.querySelectorAll("[data-math]")) {
    const typeset = equation.querySelector("mjx-container[data-tex]");
    const source = !typeset ? equation.textContent
      : typeset.getAttribute("data-display") === "block"
        ? `$$${typeset.getAttribute("data-tex")}$$`
        : `$${typeset.getAttribute("data-tex")}$`;
    equation.replaceWith(document.createTextNode(source));
  }
  holder.style.cssText = "position:fixed;left:-99999px;top:0;white-space:pre-wrap";
  document.body.appendChild(holder);
  const text = holder.innerText;
  holder.remove();

  event.preventDefault();
  event.clipboardData.setData("text/html", html);
  event.clipboardData.setData("text/plain", text);
  if (!cut) return;

  const span = modelInputSpan({}, doc);
  if (!span || span.collapsed) return;
  const landed = modelInputDelete(doc, modelInputRetarget(doc, span));
  if (!landed) return;
  const at = { block: landed.block, offset: landed.offset };
  if (landed.structural) modelInputRestructure(doc, at, "deleteByCut");
  else modelInputShow(doc, landed.block, at, "deleteByCut");
}

function modelInputInstall(root) {
  root.ownerDocument.addEventListener("selectionchange", modelInputLeaveAtom);
  root.ownerDocument.addEventListener("selectionchange", modelInputSelectionMath);
  root.ownerDocument.addEventListener("selectionchange", modelInputSelectionMarks);
  root.addEventListener("mousedown", (event) => {
    modelInputPress = { x: event.clientX, y: event.clientY, time: performance.now() };
  }, true);
  root.addEventListener("mousedown", modelInputPressAtom);
  root.addEventListener("copy", (event) => modelInputClipboard(event, false));
  root.addEventListener("cut", (event) => modelInputClipboard(event, true));
  root.addEventListener("beforeinput", modelInputBeforeInput);
  root.addEventListener("compositionstart", modelInputCompositionStart);
  root.addEventListener("compositionend", modelInputCompositionEnd);
  root.addEventListener("keydown", modelInputKeydown);
  root.addEventListener("paste", modelInputPasteEvent);
  root.addEventListener("dragstart", modelInputDragStart);
  root.addEventListener("dragend", modelInputDragEnd);
  root.addEventListener("dragenter", modelInputDragOver);
  root.addEventListener("dragover", modelInputDragOver);
  root.addEventListener("drop", modelInputDrop);
}

if (typeof editor !== "undefined" && editor && modelCoreEnabled()) {
  modelInputInstall(editor);
}
