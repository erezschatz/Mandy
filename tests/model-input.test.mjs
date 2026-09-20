// The input layer's routing. TODO 3.1, stage 2, slices 3, 4 and 5.
//
// **What this suite can see, and what it deliberately cannot.** `beforeinput`
// itself is unreachable from here: tests/dom.mjs has no editing engine, so a
// stub can only deliver the event it was told to deliver and would agree with
// any handler at all. What *is* reachable is the routing — which inputType goes
// where, what is cancelled, what happens during a composition — and that is a
// pure function of the event, which a hand-built event object answers honestly.
//
// So the model is stubbed and the dispatcher is real. That is the opposite of
// the usual arrangement here and it is deliberate: `modelInlineSplice` and the
// render are covered by the `model` suite against the real thing, and stubbing
// them is what lets this suite assert *routing* rather than re-assert those.
//
// The half neither suite can reach — does the engine actually send these, is it
// actually cancelable, what does a real IME do — is front/input-check.html,
// which needs a human at a keyboard and is per browser and per version.

import { loadSource, makeEl } from "./dom.mjs";

export default function run(check) {
  // One rig per case: the handler keeps composition state across events, so a
  // shared one would let an earlier check decide a later one.
  const rig = ({
    coreOn = true, doc = { blocks: [] }, range = null, splice = 7,
    source = false, at = null, item = null, empty = false, hardBreak = "  ",
    html = "", point = null, selection = false,
  } = {}) => {
    const calls = {
      splice: [], rerender: [], render: [], announced: [], sourceSplice: [],
      merged: [], pruned: [], split: [], broke: [], emptyItem: [], moved: [], filled: [],
      parsed: [], textBlocks: [], inserted: [], sanitised: [], turndown: [],
    };
    const editor = makeEl("div");
    // The two halves of a drop position, which are the two spellings the
    // engines never agreed on. A case that wants a drop supplies `point`.
    editor.ownerDocument = {
      caretPositionFromPoint: () => (point ? { offsetNode: point, offset: 0 } : null),
    };
    const block = { kind: "paragraph", inlines: [], source: "x" };
    editor.dispatchEvent = (event) => calls.announced.push(event.inputType ?? event.type);

    const api = loadSource(
      ["model-input.js"],
      {
        editor,
        md: {},
        markdownStyle: { hardBreak },
        modelCoreEnabled: () => coreOn,
        modelCurrentDocument: () => doc,
        modelInlineSplice: (b, from, to, text) => {
          calls.splice.push({ block: b, from, to, text });
          return splice;
        },
        // Slice 4's second text space. The stub answers for whichever kind the
        // case asked for, so the routing question -- inline tree or source --
        // is the only thing under test here.
        modelBearsSource: () => source,
        modelSourceSplice: (b, from, to, text) => {
          calls.sourceSplice.push({ block: b, from, to, text });
          return splice;
        },
        modelFlatten: () => doc.blocks || [],
        modelPruneBlock: (d, b) => calls.pruned.push(b),
        modelMergeBlocks: (d, first, second) => {
          calls.merged.push({ first, second });
          return 3;
        },
        modelInsertParagraph: (d, b, offset) => {
          calls.split.push({ block: b, offset });
          return { block: b, offset: 0 };
        },
        modelInsertBreak: (b, offset, spelling) => {
          calls.broke.push({ block: b, offset, spelling });
          return offset + 1;
        },
        modelItemAncestor: () => item,
        modelIsEmptyBlock: () => empty,
        modelEmptyItemKey: (d, i, parser, backspace) => {
          calls.emptyItem.push({ item: i, backspace });
          return { block, offset: 0 };
        },
        modelIndentItem: (d, i) => { calls.moved.push({ item: i, outdent: false }); return i; },
        modelOutdentItem: (d, i) => { calls.moved.push({ item: i, outdent: true }); return i; },
        modelFillItem: (d, i) => { calls.filled.push(i); return null; },
        modelEnsureBlock: () => null,
        // The paste pipeline. `sanitisePastedHtml` and `htmlFragmentToMarkdown`
        // are app.js's and are stubbed here for the same reason the model is:
        // what this suite asserts is which branch runs, not what Turndown makes
        // of a fragment.
        sanitisePastedHtml: (raw) => { calls.sanitised.push(raw); return html; },
        htmlFragmentToMarkdown: (clean) => { calls.turndown.push(clean); return clean; },
        modelParse: (markdown) => {
          calls.parsed.push(markdown);
          return { blocks: [{ kind: "paragraph", inlines: [], source: markdown }] };
        },
        modelTextBlocks: (d, parser, text) => {
          calls.textBlocks.push(text);
          return [{ kind: "paragraph", inlines: [], source: text }];
        },
        modelInsertBlocks: (d, b, offset, blocks) => {
          calls.inserted.push({ block: b, offset, blocks });
          return { block: b, offset };
        },
        modelRerenderBlock: (root, b, parser, sel) => {
          calls.rerender.push({ block: b, selection: sel });
          return editor;
        },
        modelRender: (root, d, parser, sel) => calls.render.push({ doc: d, selection: sel }),
        modelDomBlockAt: () => range && range.shift(),
        modelReadSelection: () => at || { block, offset: 0 },
        modelElementFor: () => editor,
        modelDomText: () => "abX",
        modelBlockText: () => "ab",
        // A drag records its source from the live selection, so a case that
        // drags has to have one. `collapsed: false` is the whole of what both
        // `modelInputDragStart` and `modelInputSpan` ask it.
        window: {
          getSelection: () => (selection
            ? { rangeCount: 1, getRangeAt: () => ({ collapsed: false, startContainer: 1, startOffset: 0, endContainer: 2, endOffset: 1 }) }
            : { rangeCount: 0 }),
        },
        InputEvent: class {
          constructor(type, init) { this.type = type; this.inputType = init && init.inputType; }
        },
        Event: class {
          constructor(type) { this.type = type; }
        },
        console,
      },
      "; return { modelInputBeforeInput, modelInputCompositionStart," +
        " modelInputCompositionEnd, modelInputComposing, modelInputInstall," +
        " modelInputKeydown, modelIndentAtCaret, modelInputPasteEvent," +
        " modelInputDrop, modelInputDragStart, modelPastePlain, modelPasteMarkdown };",
    );
    return { api, calls, editor, block };
  };

  // A beforeinput the handler understands nothing about.
  const event = (inputType, { data = null, targets = null } = {}) => {
    const e = { inputType, data, prevented: 0 };
    e.preventDefault = () => { e.prevented += 1; };
    if (targets) e.getTargetRanges = () => targets;
    return e;
  };
  const here = (block, offset) => ({ block, offset });

  // --- cancelled first, and unconditionally --------------------------------
  //
  // The property the whole design rests on. An inputType this slice has never
  // heard of has to be a keystroke that does nothing, rather than one the
  // engine gets to act on behind the model's back -- so the cancel comes before
  // anything is looked at, including before the document is known to exist.

  {
    const { api, calls } = rig();
    const e = event("formatBold");
    api.modelInputBeforeInput(e);
    check("an inputType nobody handles is still cancelled", e.prevented === 1);
    check("and nothing is done with it", calls.splice.length === 0 && calls.rerender.length === 0);
  }
  {
    const { api } = rig({ doc: null });
    const e = event("insertText", { data: "x" });
    api.modelInputBeforeInput(e);
    check("with no document open it is cancelled anyway", e.prevented === 1);
  }
  {
    // Every type this slice names, plus a run of ones it does not, all cancelled.
    const { api } = rig({ doc: null });
    const types = [
      "insertText", "insertReplacementText", "deleteContentBackward",
      "deleteContentForward", "deleteWordBackward", "deleteWordForward",
      "deleteByCut", "insertParagraph", "insertLineBreak", "insertFromPaste",
      "insertFromDrop", "historyUndo", "historyRedo", "formatItalic",
      "insertCompositionText", "insertOrderedList",
    ];
    const missed = types.filter((type) => {
      const e = event(type);
      api.modelInputBeforeInput(e);
      return e.prevented !== 1;
    });
    check(
      `every inputType is cancelled, handled or not (${types.length} tried)` +
        (missed.length ? ` — ${missed.join(", ")}` : ""),
      missed.length === 0,
    );
  }

  // --- the types this slice handles ----------------------------------------

  {
    const target = { id: 1 };
    const r = rig({ range: [here(target, 2), here(target, 2)] });
    const e = event("insertText", { data: "q", targets: [{ startContainer: 1, startOffset: 0, endContainer: 1, endOffset: 0 }] });
    r.api.modelInputBeforeInput(e);
    check(
      `insertText splices its data in (${JSON.stringify(r.calls.splice[0] && r.calls.splice[0].text)})`,
      r.calls.splice.length === 1 && r.calls.splice[0].text === "q" &&
        r.calls.splice[0].from === 2 && r.calls.splice[0].to === 2,
    );
    check("and renders the block it changed, with the caret the splice returned",
      r.calls.rerender.length === 1 && r.calls.rerender[0].selection.offset === 7);
    check("and announces the change, or nothing downstream would hear it",
      r.calls.announced.length === 1 && r.calls.announced[0] === "insertText");
  }

  {
    // The four delete types are one implementation, because the engine has
    // already decided what a word is and says so in the target ranges.
    for (const type of ["deleteContentBackward", "deleteContentForward", "deleteWordBackward", "deleteWordForward", "deleteByCut"]) {
      const target = { id: 2 };
      const r = rig({ range: [here(target, 1), here(target, 5)] });
      const e = event(type, { targets: [{ startContainer: 1, startOffset: 0, endContainer: 2, endOffset: 4 }] });
      r.api.modelInputBeforeInput(e);
      check(
        `${type} deletes the range the engine named (${r.calls.splice[0] ? r.calls.splice[0].from + "–" + r.calls.splice[0].to : "none"})`,
        r.calls.splice.length === 1 && r.calls.splice[0].from === 1 &&
          r.calls.splice[0].to === 5 && r.calls.splice[0].text === "",
      );
    }
  }

  {
    // **Two blocks is a merge**, which slice 4 turned from a refusal into the
    // handling. The shape is what matters: what is left of the first block,
    // what is left of the last, and then the join -- so a Backspace at a
    // block's start deletes nothing at either end and merges, which is the
    // commonest case there is.
    const first = { id: 3, inlines: [] };
    const second = { id: 4, inlines: [] };
    const doc = { blocks: [first, second] };
    const r = rig({ doc, range: [here(first, 4), here(second, 0)] });
    const e = event("deleteContentBackward", { targets: [{ startContainer: 1, startOffset: 0, endContainer: 2, endOffset: 4 }] });
    r.api.modelInputBeforeInput(e);
    check("a deletion spanning two blocks merges them",
      r.calls.merged.length === 1 && r.calls.merged[0].first === first && r.calls.merged[0].second === second);
    check("clearing what the range covered at each end first",
      r.calls.splice.length === 2 && r.calls.splice[0].from === 4 && r.calls.splice[1].to === 0);
    check("and rendering the whole document, since a block has gone",
      r.calls.render.length === 1 && r.calls.rerender.length === 0);
    check("and it is still cancelled, so the engine does not do it too", e.prevented === 1);
  }

  {
    // A merge needs two blocks with a common text space. A paragraph and a
    // fence have none -- one is an inline tree, the other is source -- so this
    // refuses, which is the same refusal slice 3 made with one case fewer
    // behind it.
    const first = { id: 11, inlines: [] };
    const fence = { id: 12, inlines: null };
    const r = rig({ doc: { blocks: [first, fence] }, range: [here(first, 4), here(fence, 0)] });
    const e = event("deleteContentBackward", { targets: [{ startContainer: 1, startOffset: 0, endContainer: 2, endOffset: 1 }] });
    r.api.modelInputBeforeInput(e);
    check("a merge into a block with no inline tree is refused rather than approximated",
      r.calls.merged.length === 0 && r.calls.splice.length === 0 && r.calls.render.length === 0);
  }

  // --- slice 4: the structural types ---------------------------------------

  {
    const target = { id: 20, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, range: [here(target, 4), here(target, 4)] });
    const e = event("insertParagraph", { targets: [{ startContainer: 1, startOffset: 4, endContainer: 1, endOffset: 4 }] });
    r.api.modelInputBeforeInput(e);
    check(`insertParagraph splits at the caret (${r.calls.split[0] && r.calls.split[0].offset})`,
      r.calls.split.length === 1 && r.calls.split[0].block === target && r.calls.split[0].offset === 4);
    check("and renders the document rather than the block, since the count changed",
      r.calls.render.length === 1 && r.calls.rerender.length === 0);
    check("announced as its own inputType, so undo does not coalesce it with typing",
      r.calls.announced.length === 1 && r.calls.announced[0] === "insertParagraph");
  }

  {
    // A selection is deleted first and the split happens where it collapsed.
    const target = { id: 21, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, range: [here(target, 2), here(target, 6)] });
    const e = event("insertParagraph", { targets: [{ startContainer: 1, startOffset: 0, endContainer: 2, endOffset: 4 }] });
    r.api.modelInputBeforeInput(e);
    check("Enter over a selection deletes it first, then splits where it collapsed",
      r.calls.splice.length === 1 && r.calls.splice[0].text === "" && r.calls.split.length === 1 &&
        r.calls.split[0].offset === 7);
  }

  {
    // Enter inside a fence is a newline in its body: its content is source, so
    // there is no block to split.
    const target = { id: 22, inlines: null };
    const r = rig({ doc: { blocks: [target] }, source: true, range: [here(target, 3), here(target, 3)] });
    const e = event("insertParagraph", { targets: [{ startContainer: 1, startOffset: 3, endContainer: 1, endOffset: 3 }] });
    r.api.modelInputBeforeInput(e);
    check("Enter in a source-bearing block writes a newline into its body instead",
      r.calls.sourceSplice.length === 1 && r.calls.sourceSplice[0].text === "\n" && r.calls.split.length === 0);
    check("and re-renders that block alone, because nothing was added or removed",
      r.calls.rerender.length === 1 && r.calls.render.length === 0);
  }

  {
    const target = { id: 23, inlines: null };
    const r = rig({ doc: { blocks: [target] }, source: true, range: [here(target, 1), here(target, 1)] });
    const e = event("insertText", { data: "z", targets: [{ startContainer: 1, startOffset: 1, endContainer: 1, endOffset: 1 }] });
    r.api.modelInputBeforeInput(e);
    check("typing in a source-bearing block goes to the source space, not the inline one",
      r.calls.sourceSplice.length === 1 && r.calls.sourceSplice[0].text === "z" && r.calls.splice.length === 0);
  }

  {
    for (const [spelling, label] of [["  ", "two spaces"], ["\\", "a backslash"]]) {
      const target = { id: 24, inlines: [] };
      const r = rig({ doc: { blocks: [target] }, hardBreak: spelling, range: [here(target, 2), here(target, 2)] });
      const e = event("insertLineBreak", { targets: [{ startContainer: 1, startOffset: 2, endContainer: 1, endOffset: 2 }] });
      r.api.modelInputBeforeInput(e);
      check(`a new hard break takes the document's own spelling (${label})`,
        r.calls.broke.length === 1 && r.calls.broke[0].spelling === spelling);
    }
  }

  {
    // The two hand-rolled clusters, asked before the generic handling: what the
    // engine reports for either is a split or a deletion of a block holding
    // nothing, and the shape says nothing about the intent.
    for (const [type, backspace] of [["insertParagraph", false], ["deleteContentBackward", true]]) {
      const target = { id: 25, inlines: [] };
      const r = rig({ doc: { blocks: [target] }, item: { kind: "item" }, empty: true, at: { block: target, offset: 0 } });
      const e = event(type, { targets: [{ startContainer: 1, startOffset: 0, endContainer: 1, endOffset: 0 }] });
      r.api.modelInputBeforeInput(e);
      check(`${type} on an empty item is the list rule, not the generic edit`,
        r.calls.emptyItem.length === 1 && r.calls.emptyItem[0].backspace === backspace &&
          r.calls.split.length === 0 && r.calls.splice.length === 0);
    }
  }

  {
    // ...and only at the start of it, for Backspace: mid-item it is an ordinary
    // deletion of whatever the engine named.
    const target = { id: 26, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, item: { kind: "item" }, empty: true, at: { block: target, offset: 3 },
      range: [here(target, 2), here(target, 3)] });
    const e = event("deleteContentBackward", { targets: [{ startContainer: 1, startOffset: 2, endContainer: 1, endOffset: 3 }] });
    r.api.modelInputBeforeInput(e);
    check("Backspace away from an item's start is an ordinary deletion",
      r.calls.emptyItem.length === 0 && r.calls.splice.length === 1);
  }

  // --- slice 4: Tab, which is not an inputType -----------------------------

  {
    const target = { id: 27, inlines: [] };
    const listItem = { kind: "item" };
    for (const shift of [false, true]) {
      const r = rig({ doc: { blocks: [target] }, item: listItem, at: { block: target, offset: 0 } });
      const e = { key: "Tab", shiftKey: shift, prevented: 0, preventDefault() { this.prevented += 1; } };
      r.api.modelInputKeydown(e);
      check(`${shift ? "Shift+Tab outdents" : "Tab indents"} the item the caret is in`,
        r.calls.moved.length === 1 && r.calls.moved[0].outdent === shift && e.prevented === 1);
      check("announced as its own inputType so it is one undo step",
        r.calls.announced.length === 1 && r.calls.announced[0] === (shift ? "formatOutdent" : "formatIndent"));
    }
  }

  {
    // Outside a list Tab keeps its default job of leaving the editor, which is
    // a keyboard user's only way out -- today's rule kept rather than re-decided.
    const target = { id: 28, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, item: null, at: { block: target, offset: 0 } });
    const e = { key: "Tab", shiftKey: false, prevented: 0, preventDefault() { this.prevented += 1; } };
    r.api.modelInputKeydown(e);
    check("Tab outside a list is not taken from the browser",
      e.prevented === 0 && r.calls.moved.length === 0);
  }

  {
    // The Format menu's two items ask the identical question. The flag is read
    // by app.js rather than in here, so that front/input-check.html can install
    // the layer without flipping the flag for the app on the same origin — a
    // guard in here made Tab do nothing on the one page built to measure it.
    const target = { id: 29, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, item: { kind: "item" }, at: { block: target, offset: 0 } });
    check("the toolbar path moves the item the caret is in", r.api.modelIndentAtCaret(false) === true &&
      r.calls.moved.length === 1);
    const none = rig({ doc: null });
    check("and answers no with no document open", none.api.modelIndentAtCaret(false) === false);
  }

  {
    // A block whose content is source says so with a null, and the dispatcher
    // has to stop rather than render something it did not change.
    const target = { id: 5 };
    const r = rig({ range: [here(target, 0), here(target, 0)], splice: null });
    const e = event("insertText", { data: "x", targets: [{ startContainer: 1, startOffset: 0, endContainer: 1, endOffset: 0 }] });
    r.api.modelInputBeforeInput(e);
    check("a splice that refuses stops the edit rather than rendering anyway",
      r.calls.splice.length === 1 && r.calls.rerender.length === 0 && r.calls.announced.length === 0);
  }

  {
    // **A collapsed caret stays collapsed.** Found by hand in Gecko on
    // 2026-09-20, which puts the caret *inside* a rendered equation where Blink
    // does not. Both ends of that one position clamp outward -- correctly for a
    // real selection, which must not collapse onto an atom's front edge -- and
    // the caret became a range covering the whole equation, so typing a
    // character ate it. The rig's stub hands back a different answer per call,
    // so a handler that asked twice gets two offsets and one that asks once
    // gets one: which is exactly the difference under test.
    const target = { id: 9 };
    const r = rig({ range: [here(target, 12), here(target, 13)] });
    const e = event("insertText", {
      data: "d",
      targets: [{ startContainer: 1, startOffset: 4, endContainer: 1, endOffset: 4 }],
    });
    r.api.modelInputBeforeInput(e);
    check(
      `a caret inside an atom inserts rather than replacing it (${r.calls.splice[0] ? r.calls.splice[0].from + "–" + r.calls.splice[0].to : "none"})`,
      r.calls.splice.length === 1 && r.calls.splice[0].from === 12 && r.calls.splice[0].to === 12,
    );

    // And the other half of the same rule, which is why the bias exists at all.
    const two = { id: 10 };
    const s2 = rig({ range: [here(two, 12), here(two, 13)] });
    const e2 = event("insertText", {
      data: "d",
      targets: [{ startContainer: 1, startOffset: 0, endContainer: 2, endOffset: 11 }],
    });
    s2.api.modelInputBeforeInput(e2);
    check(
      `while a real selection over one still replaces it (${s2.calls.splice[0] ? s2.calls.splice[0].from + "–" + s2.calls.splice[0].to : "none"})`,
      s2.calls.splice.length === 1 && s2.calls.splice[0].from === 12 && s2.calls.splice[0].to === 13,
    );
  }

  // --- composition ----------------------------------------------------------
  //
  // insertCompositionText cannot be cancelled, so the rule is that the engine
  // owns the node under the caret until compositionend and the model waits. The
  // guard that matters is the re-render suppression: a render during
  // composition takes the node the IME is holding out from under it.

  {
    const target = { id: 6 };
    const r = rig({ range: [here(target, 0), here(target, 0)] });
    check("nothing is composing to begin with", r.api.modelInputComposing() === false);
    r.api.modelInputCompositionStart();
    check("compositionstart records that one is", r.api.modelInputComposing() === true);

    const e = event("insertCompositionText", { data: "あ" });
    r.api.modelInputBeforeInput(e);
    check("and nothing renders while it runs", r.calls.rerender.length === 0 && r.calls.render.length === 0);
    check("though the event is still cancelled, for the types that can be", e.prevented === 1);

    r.api.modelInputCompositionEnd();
    check("compositionend is no longer composing", r.api.modelInputComposing() === false);
    check(
      `and applies the difference as one edit (${JSON.stringify(r.calls.splice[0])})`,
      r.calls.splice.length === 1 && r.calls.splice[0].from === 2 &&
        r.calls.splice[0].to === 2 && r.calls.splice[0].text === "X",
    );
    check("as one step, announced once", r.calls.announced.length === 1);
  }

  // --- slice 5: paste and drop ---------------------------------------------
  //
  // The `paste` event rather than `beforeinput`: it fires first, carries
  // clipboardData by specification, and cancelling it stops the insertion
  // before an insertFromPaste is ever raised.

  const clipboard = (types) => ({
    preventDefault() { this.prevented = (this.prevented || 0) + 1; },
    clipboardData: { getData: (type) => types[type] || "" },
    prevented: 0,
  });

  {
    const target = { id: 40, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, at: { block: target, offset: 2 }, html: "<p>hi</p>" });
    const e = clipboard({ "text/html": "<p>hi</p>", "text/plain": "hi" });
    r.api.modelInputPasteEvent(e);
    check("a paste is cancelled, so the engine does not insert it too", e.prevented === 1);
    check("the HTML branch runs when there is HTML",
      r.calls.sanitised.length === 1 && r.calls.turndown.length === 1 && r.calls.parsed.length === 1);
    check("and the plain text is not touched", r.calls.textBlocks.length === 0);
    check(`the blocks land at the selection (${r.calls.inserted[0] && r.calls.inserted[0].offset})`,
      r.calls.inserted.length === 1 && r.calls.inserted[0].block === target && r.calls.inserted[0].offset === 2);
    check("and the document re-renders, since the block count changed",
      r.calls.render.length === 1 && r.calls.announced[0] === "insertFromPaste");
  }

  {
    // A fragment that was nothing but wrappers sanitises to nothing. Falling
    // through to the plain text beats inserting an empty string and leaving the
    // user to wonder where their paste went.
    const target = { id: 41, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, at: { block: target, offset: 0 }, html: "   " });
    r.api.modelInputPasteEvent(clipboard({ "text/html": "<div><span></span></div>", "text/plain": "fallback" }));
    check("HTML that sanitises to nothing falls through to the plain text",
      r.calls.parsed.length === 0 && r.calls.textBlocks.length === 1 && r.calls.textBlocks[0] === "fallback");
  }

  {
    // **Plain text is never parsed as markdown**, which is today's behaviour
    // and the reason Insert -> Paste markdown is a separate action.
    const target = { id: 42, inlines: [] };
    const r = rig({ doc: { blocks: [target] }, at: { block: target, offset: 0 } });
    r.api.modelInputPasteEvent(clipboard({ "text/plain": "*not emphasis*" }));
    check("a plain-text paste never reaches the parser",
      r.calls.parsed.length === 0 && r.calls.textBlocks[0] === "*not emphasis*");

    // ...and Paste markdown is the same pipeline with the Turndown step gone.
    const two = { id: 43, inlines: [] };
    const s = rig({ doc: { blocks: [two] }, at: { block: two, offset: 0 } });
    s.api.modelPasteMarkdown("# heading");
    check("while Paste markdown parses it and runs no Turndown",
      s.calls.parsed.length === 1 && s.calls.turndown.length === 0 && s.calls.inserted.length === 1);

    // One line of plain text is an ordinary insertion and must not split.
    const three = { id: 44, inlines: [] };
    const u = rig({ doc: { blocks: [three] }, at: { block: three, offset: 1 } });
    u.api.modelPastePlain("just words");
    check("one line of plain text is a splice rather than a block insert",
      u.calls.splice.length === 1 && u.calls.inserted.length === 0);
    const four = { id: 45, inlines: [] };
    const v = rig({ doc: { blocks: [four] }, at: { block: four, offset: 1 } });
    v.api.modelPastePlain("two\nlines");
    check("and several lines are blocks", v.calls.inserted.length === 1 && v.calls.splice.length === 0);
  }

  {
    // A drop lands where the pointer was, not where the caret was.
    const dropped = { id: 46, inlines: [] };
    const node = {};
    const r = rig({ doc: { blocks: [dropped] }, point: node, range: [here(dropped, 5)] });
    const e = {
      prevented: 0, clientX: 10, clientY: 20,
      preventDefault() { this.prevented += 1; },
      dataTransfer: { getData: (type) => (type === "text/plain" ? "moved" : "") },
    };
    r.api.modelInputDrop(e);
    check("a drop is cancelled", e.prevented === 1);
    check(`and lands at the position under the pointer (${r.calls.inserted[0] && r.calls.inserted[0].offset})`,
      r.calls.inserted.length === 1 && r.calls.inserted[0].offset === 5);
    check("announced as its own inputType", r.calls.announced[0] === "insertFromDrop");
  }

  {
    // **A drag that started inside the editor is a move, not a copy.** Both
    // halves are cancelled, so doing only the insert would duplicate the text
    // and leave the original standing -- which looks like it worked, and is the
    // worst of the three possible answers.
    const block = { id: 47, inlines: [] };
    const node = {};
    const r = rig({
      doc: { blocks: [block] }, point: node, selection: true,
      range: [here(block, 2), here(block, 6), here(block, 20)],
    });
    r.api.modelInputDragStart();
    r.api.modelInputDrop({
      clientX: 1, clientY: 1, preventDefault() {},
      dataTransfer: { getData: () => "moved" },
    });
    check(`the source range is deleted before the insert (${r.calls.splice[0] ? r.calls.splice[0].from + "–" + r.calls.splice[0].to : "none"})`,
      r.calls.splice.length === 1 && r.calls.splice[0].from === 2 && r.calls.splice[0].to === 6 &&
        r.calls.splice[0].text === "");
    check(`and the drop offset moves back by what was taken out (${r.calls.inserted[0] && r.calls.inserted[0].offset})`,
      r.calls.inserted.length === 1 && r.calls.inserted[0].offset === 16);
  }

  {
    // Dropping a selection onto itself is a no-op rather than a delete.
    const block = { id: 48, inlines: [] };
    const r = rig({ doc: { blocks: [block] }, point: {}, selection: true,
      range: [here(block, 2), here(block, 8), here(block, 5)] });
    r.api.modelInputDragStart();
    r.api.modelInputDrop({ clientX: 1, clientY: 1, preventDefault() {}, dataTransfer: { getData: () => "x" } });
    check("dropping a selection inside itself changes nothing",
      r.calls.splice.length === 0 && r.calls.inserted.length === 0);
  }

  {
    // A drag spanning two blocks is refused rather than approximated: the
    // offsets on the far side of a merge are not the ones the drop was measured
    // against, and getting that wrong moves the text somewhere nobody pointed.
    const one = { id: 49, inlines: [] };
    const two = { id: 50, inlines: [] };
    const r = rig({ doc: { blocks: [one, two] }, point: {}, selection: true,
      range: [here(one, 1), here(two, 3), here(two, 9)] });
    r.api.modelInputDragStart();
    r.api.modelInputDrop({ clientX: 1, clientY: 1, preventDefault() {}, dataTransfer: { getData: () => "x" } });
    check("a drag spanning two blocks is refused",
      r.calls.splice.length === 0 && r.calls.inserted.length === 0);
  }

  // --- installation ---------------------------------------------------------

  {
    const root = makeEl("div");
    const { api } = rig();
    api.modelInputInstall(root);
    check(
      `all the listeners are bound (${Object.keys(root.listeners).sort().join(", ")})`,
      !!root.listeners.beforeinput && !!root.listeners.compositionstart &&
        !!root.listeners.compositionend && !!root.listeners.keydown &&
        !!root.listeners.paste && !!root.listeners.drop &&
        !!root.listeners.dragstart && !!root.listeners.dragend,
    );
  }
}
