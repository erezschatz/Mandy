// The input layer's routing. TODO 3.1, stage 2, slice 3.
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
  const rig = ({ coreOn = true, doc = { blocks: [] }, range = null, splice = 7 } = {}) => {
    const calls = { splice: [], rerender: [], render: [], announced: [] };
    const editor = makeEl("div");
    const block = { kind: "paragraph", inlines: [], source: "x" };
    editor.dispatchEvent = (event) => calls.announced.push(event.inputType ?? event.type);

    const api = loadSource(
      ["model-input.js"],
      {
        editor,
        md: {},
        modelCoreEnabled: () => coreOn,
        modelCurrentDocument: () => doc,
        modelInlineSplice: (b, from, to, text) => {
          calls.splice.push({ block: b, from, to, text });
          return splice;
        },
        modelRerenderBlock: (root, b, parser, sel) => {
          calls.rerender.push({ block: b, selection: sel });
          return editor;
        },
        modelRender: (root, d, parser, sel) => calls.render.push({ doc: d, selection: sel }),
        modelDomBlockAt: () => range && range.shift(),
        modelReadSelection: () => ({ block, offset: 0 }),
        modelElementFor: () => editor,
        modelDomText: () => "abX",
        modelBlockText: () => "ab",
        window: { getSelection: () => ({ rangeCount: 0 }) },
        InputEvent: class {
          constructor(type, init) { this.type = type; this.inputType = init && init.inputType; }
        },
        Event: class {
          constructor(type) { this.type = type; }
        },
        console,
      },
      "; return { modelInputBeforeInput, modelInputCompositionStart," +
        " modelInputCompositionEnd, modelInputComposing, modelInputInstall };",
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
    // Two blocks is a merge, which is slice 4's. Refusing is the honest answer
    // until then -- the alternative is deleting inside one of them and leaving
    // the other, which is a wrong edit rather than a missing one.
    const r = rig({ range: [here({ id: 3 }, 0), here({ id: 4 }, 0)] });
    const e = event("deleteContentBackward", { targets: [{ startContainer: 1, startOffset: 0, endContainer: 2, endOffset: 4 }] });
    r.api.modelInputBeforeInput(e);
    check("a deletion spanning two blocks is refused rather than half-applied",
      r.calls.splice.length === 0 && r.calls.rerender.length === 0);
    check("and it is still cancelled, so the engine does not do it either", e.prevented === 1);
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

  // --- installation ---------------------------------------------------------

  {
    const root = makeEl("div");
    const { api } = rig();
    api.modelInputInstall(root);
    check(
      `all three listeners are bound (${Object.keys(root.listeners).sort().join(", ")})`,
      !!root.listeners.beforeinput && !!root.listeners.compositionstart && !!root.listeners.compositionend,
    );
  }
}
