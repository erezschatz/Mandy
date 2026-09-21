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
function modelInputWrite(doc, span, text) {
  if (!span) return false;
  const target = modelInputRetarget(doc, span);

  if (text) {
    if (target.from.block !== target.to.block) return false;
    const block = target.from.block;
    const start = Math.min(target.from.offset, target.to.offset);
    const end = Math.max(target.from.offset, target.to.offset);
    const offset = modelBearsSource(block)
      ? modelSourceSplice(block, start, end, text, md)
      : modelInlineSplice(block, start, end, text);
    if (offset === null) return false;
    return modelInputShow(doc, block, { block, offset }, "insertText");
  }

  const landed = modelInputDelete(doc, target);
  if (!landed) return false;
  const at = { block: landed.block, offset: landed.offset };
  return landed.structural
    ? modelInputRestructure(doc, at, "deleteContentBackward")
    : modelInputShow(doc, landed.block, at, "deleteContentBackward");
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
    modelInputWrite(doc, modelInputSpan(event, doc), event.data || "");
    return;
  }
  if (MODEL_INPUT_DELETE_TYPES.has(event.inputType)) {
    if (modelInputEmptyItem(doc, true)) return;
    modelInputWrite(doc, modelInputSpan(event, doc), "");
    return;
  }
  if (event.inputType === "insertParagraph") {
    if (modelInputEmptyItem(doc, false)) return;
    modelInputParagraph(doc, modelInputSpan(event, doc));
    return;
  }
  if (event.inputType === "insertLineBreak") {
    modelInputLineBreak(doc, modelInputSpan(event, doc));
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
    if (source.from.block !== source.to.block) return;
    const start = Math.min(source.from.offset, source.to.offset);
    const end = Math.max(source.from.offset, source.to.offset);
    if (at.block === source.from.block && at.offset >= start && at.offset <= end) return;
    if (modelInlineSplice(source.from.block, start, end, "") === null) return;
    // Only when the two are in the same block does taking the source out move
    // the target; anywhere else the offset still names the same place.
    if (at.block === source.from.block && at.offset > end) at = { block: at.block, offset: at.offset - (end - start) };
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

function modelInputInstall(root) {
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
