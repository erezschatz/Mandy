// Regression cover for silent LaTeX data loss.
//
// MathJax replaces the `$$…$$` source with rendered CHTML, so the old core's
// Turndown save used to serialise the glyphs instead of the maths:
// `$$\frac{a}{b}$$` was written back to the file as "ab", and `$$E = mc^2$$` as
// "E\=mc2". Irrecoverable, and quiet — the document still looked right on
// screen. The model writes the file now, from its own tree, but an equation
// copied out of a document and pasted back still goes through Turndown.
//
// Two halves have to hold for that round trip to survive, and each fails
// silently on its own, so both are tested here:
//   renderers.js  stamps data-tex onto the container while MathJax still knows
//                 which TeX produced it;
//   app.js        turns that attribute back into `$…$` / `$$…$$`.

import { loadApp, loadSource, makeEl, makeText, readFront, walk } from "./dom.mjs";

// Stands in for a typeset <mjx-container>. Attribute-backed, because that is
// what has to survive being written into an exported file and parsed back.
function makeContainer(parent) {
  const node = makeEl("mjx-container", { parent });
  node.parentElement = parent;
  return node;
}

// The shape renderers.js reads: MathJax.startup.document.math, an accumulating
// list of { math, display, typesetRoot }.
function fakeMathJax(items) {
  return { startup: { document: { math: items } } };
}

function loadRenderers(mathJax, container, items) {
  return loadSource(
    "renderers.js",
    {
      window: { MathJax: mathJax },
      MathJax: mathJax,
      document: { documentElement: { getAttribute: () => "light" } },
      editor: container,
      console,
      __container: container,
    },
    "; stampLatexSource(__container); return __container;",
  );
}

export default async function run(check) {
  // ── renderers.js: stamping ────────────────────────────────────────────────
  const container = makeEl("div");
  const block = makeContainer(container);
  const inline = makeContainer(container);
  const stale = makeContainer(makeEl("div")); // typeset earlier, since replaced

  loadRenderers(
    fakeMathJax([
      { math: "\\frac{a}{b}", display: true, typesetRoot: block },
      { math: "a^2 + b^2", display: false, typesetRoot: inline },
      { math: "should not be stamped", display: true, typesetRoot: stale },
      { math: "no root at all", display: true, typesetRoot: null },
    ]),
    container,
  );

  check("block maths keeps its TeX", block.attrs["data-tex"] === "\\frac{a}{b}");
  check("block maths is marked display", block.attrs["data-display"] === "block");
  check("inline maths keeps its TeX", inline.attrs["data-tex"] === "a^2 + b^2");
  check("inline maths is marked inline", inline.attrs["data-display"] === "inline");
  check("roots outside the container are left alone", !("data-tex" in stale.attrs));

  // Firefox walked the caret into MathJax's own elements, and what was typed in
  // there reached no file. Uneditable, the equation is one step for the caret.
  check("typeset maths is one uneditable unit to the caret",
    block.attrs.contenteditable === "false" && inline.attrs.contenteditable === "false");
  check("roots outside the container are not touched either", !("contenteditable" in stale.attrs));

  // Loading an exported document makes MathJax re-typeset its own assistive
  // MathML, nesting a second container inside the first and reporting MathML
  // rather than TeX for it. Stamping that would write a <math> element into
  // data-tex and carry it through every later save and export.
  const nested = makeContainer(makeEl("mjx-assistive-mml", { parent: block }));
  loadRenderers(
    fakeMathJax([
      { math: "<math>not TeX</math>", display: true, typesetRoot: nested },
    ]),
    container,
  );
  check("containers nested inside a container are not stamped",
    !("data-tex" in nested.attrs));
  check("nor made uneditable, since they are MathJax's and not the author's",
    !("contenteditable" in nested.attrs));

  // Re-stamping must not clobber: MathJax re-typesets already-rendered maths on
  // load in an exported document, and the second pass reports MathML, not TeX.
  loadRenderers(
    fakeMathJax([{ math: "<math>rerendered</math>", display: true, typesetRoot: block }]),
    container,
  );
  check("an existing stamp is not overwritten", block.attrs["data-tex"] === "\\frac{a}{b}");

  // Maths stamped before the attribute existed — restored from an autosave, or
  // inside an exported file — still gets it, since the stamp check comes after.
  const older = makeContainer(container);
  older.setAttribute("data-tex", "z");
  loadRenderers(fakeMathJax([{ math: "z", display: false, typesetRoot: older }]), container);
  check("maths stamped before this existed is made uneditable too",
    older.attrs.contenteditable === "false" && older.attrs["data-tex"] === "z");

  // Absent MathJax must be survivable: stampLatexSource is reachable from an
  // exported document either way.
  let threw = null;
  try {
    loadRenderers(undefined, makeEl("div"), []);
  } catch (error) {
    threw = error;
  }
  check("no MathJax is not an error", threw === null);

  // ── renderers.js: typesetting again after a model render ──────────────────
  //
  // TODO 3.1's model core re-renders on every edit, and each render throws away
  // the equations MathJax typeset. What was typeset is kept by source and put
  // back **before anything is awaited**, so a render never paints a frame of
  // TeX. The stub has no MathJax; what is asserted is what lands in the DOM.
  {
    const loadDrawing = () => loadSource(
      "renderers.js",
      {
        window: { MathJax: undefined },
        MathJax: undefined,
        document: { documentElement: { getAttribute: () => "light" }, createElement: (tag) => makeEl(tag), createTextNode: makeText },
        editor: makeEl("div"),
        console: { error() {} },
      },
      "; return { renderedCachePut, renderedCache, mathTakeFromCache, mathRemember };",
    );
    let r;

    // Maths. A cached equation goes back as a copy of what MathJax drew, stamp
    // and all, so a save reads it the same as a fresh one.
    r = loadDrawing({});
    const para = makeEl("p");
    const typed = makeEl("span", { parent: para, text: "$x^2$" });
    typed.querySelector = () => null;
    typed.replaceChildren = (node) => { typed.children = [node]; };
    const fresh = makeEl("span", { parent: para, text: "$y$" });
    fresh.querySelector = () => null;
    para.querySelectorAll = (sel) => (sel === "[data-math]" ? [typed, fresh] : []);
    const copy = makeEl("mjx-container");
    copy.setAttribute("data-tex", "x^2");
    r.renderedCachePut("math:$x^2$", { cloneNode: () => copy });
    const waiting = r.mathTakeFromCache(para);
    check("a cached equation goes back as a copy of what was drawn",
      typed.children[0] === copy && copy.attrs["data-tex"] === "x^2");
    check("and only the uncached ones are left for MathJax, keyed by their source",
      waiting.length === 1 && waiting[0].span === fresh && waiting[0].key === "math:$y$");

    // An equation that typeset but never got its stamp is not kept: a copy of
    // it would save as its glyphs.
    const unstamped = makeEl("mjx-container");
    unstamped.cloneNode = () => unstamped;
    fresh.querySelector = () => unstamped;
    r.mathRemember(waiting);
    check("an unstamped equation is not kept for reuse", !r.renderedCache.has("math:$y$"));
    unstamped.setAttribute("data-tex", "y");
    r.mathRemember(waiting);
    check("a stamped one is", r.renderedCache.get("math:$y$") === unstamped);
  }

  // ── renderers.js: equations as pictures for PDF and Word ──────────────────
  //
  // html2canvas painted MathJax's hidden assistive MathML over the glyphs, so
  // the PDF drew every equation twice, and Word wrote the bare letters of that
  // same copy. Each export's clone now holds one picture per equation. Drawing
  // the picture needs a real canvas and a real MathJax, which is
  // exports.spec.mjs's; this checks what is done with it, and the two ways it
  // degrades when the renderer cannot load.
  {
    const build = () => {
      const clone = makeEl("div");
      const roots = [];
      for (const [tex, display] of [["x", "inline"], ["\\frac{a}{b}", "block"]]) {
        const root = makeContainer(clone);
        root.parentNode = clone;
        root.setAttribute("data-tex", tex);
        root.setAttribute("data-display", display);
        const assistive = makeEl("mjx-assistive-mml", { parent: root });
        assistive.parentNode = root;
        assistive.parentElement = root;
        root.querySelectorAll = (sel) =>
          sel === "mjx-assistive-mml" ? root.children.filter((c) => c.tagName === "MJX-ASSISTIVE-MML") : [];
        root.replaceWith = (other) => clone.replaceChild(other, root);
        roots.push(root);
      }
      clone.querySelectorAll = (sel) =>
        sel === "mjx-container[data-tex]" ? clone.children.filter((c) => c.tagName === "MJX-CONTAINER") : [];
      return { clone, roots };
    };
    const source = makeEl("div");
    const liveA = makeContainer(source);
    const liveB = makeContainer(source);
    liveA.fontSize = "20px";
    liveB.fontSize = "30px";
    source.querySelectorAll = () => [liveA, liveB];

    const exporter = (ensureMathSvg, draw) => loadSource(
      "renderers.js",
      {
        window: {},
        editor: source,
        ensureMathSvg,
        getComputedStyle: (node) => ({ fontSize: node.fontSize || "16px" }),
        document: { createElement: (tag) => makeEl(tag), createTextNode: makeText },
        console: { warn() {} },
        __draw: draw,
      },
      "; if (__draw) drawEquation = __draw; return exportEquationImages;",
    );

    const drawn = [];
    const draw = async (renderer, tex, display, fontSize) => {
      drawn.push({ renderer, tex, display, fontSize });
      return { src: `data:image/png;base64,${tex.length}`, width: 10.5, height: 12.25, depth: 3.5 };
    };
    const renderer = { frame: {}, MathJax: {} };
    {
      const { clone } = build();
      await exporter(async () => renderer, draw)(clone, { source });
      const [inline, block] = clone.children;
      check("each equation in the clone becomes one picture",
        clone.children.length === 2 && inline.tagName === "IMG" && block.tagName === "IMG");
      check("drawn from its own TeX, display or not, by the frame that was loaded",
        drawn.length === 2 && drawn[0].tex === "x" && drawn[0].display === false &&
        drawn[1].tex === "\\frac{a}{b}" && drawn[1].display === true &&
        drawn.every((d) => d.renderer === renderer));
      check("at the font size its counterpart in the editor is drawn at",
        drawn[0].fontSize === 20 && drawn[1].fontSize === 30);
      check("its alt text is the TeX, delimited as the file writes it",
        inline.alt === "$x$" && block.alt === "$$\\frac{a}{b}$$");
      check("its exact size and depth travel with it, for Word",
        inline.attrs["data-width"] === "10.5" && inline.attrs["data-height"] === "12.25" &&
        inline.attrs["data-depth"] === "3.5" && inline.attrs["data-equation"] === "inline");
      check("an inline one is lowered onto the baseline by its depth",
        /vertical-align:-3\.5px/.test(inline.style.cssText) && /width:10\.5px/.test(inline.style.cssText));
      check("a display one is a centred block",
        block.attrs["data-equation"] === "block" && /display:block/.test(block.style.cssText) &&
        /margin:0\.5em auto/.test(block.style.cssText));
    }
    {
      const { clone } = build();
      await exporter(async () => { throw new Error("offline"); }, null)(clone, { source, fallback: "source" });
      check("with no renderer, Word's fallback writes each equation's TeX as text",
        clone.children.map((c) => c.textContent).join("|") === "$x$|$$\\frac{a}{b}$$" &&
        clone.children.every((c) => c.nodeType === 3));
    }
    {
      const { clone, roots } = build();
      await exporter(async () => { throw new Error("offline"); }, null)(clone, { source, fallback: "glyphs" });
      check("and the PDF's keeps MathJax's glyphs without the assistive copy",
        clone.children.length === 2 && clone.children.every((c, i) => c === roots[i]) &&
        roots.every((r) => r.children.length === 0));
    }
    {
      const { clone } = build();
      const flaky = async (r, tex, ...rest) => {
        if (tex === "x") throw new Error("decode failed");
        return draw(r, tex, ...rest);
      };
      await exporter(async () => renderer, flaky)(clone, { source, fallback: "source" });
      check("one equation that cannot be drawn falls back alone, and the export goes on",
        clone.children[0].nodeType === 3 && clone.children[0].textContent === "$x$" &&
        clone.children[1].tagName === "IMG");
    }
    {
      let asked = false;
      const clone = makeEl("div");
      clone.querySelectorAll = () => [];
      await exporter(async () => { asked = true; return renderer; }, draw)(clone, { source });
      check("a document with no equations never loads the renderer", !asked);
    }
  }

  // ── app.js: the Turndown rule ─────────────────────────────────────────────
  const { rules } = loadApp();
  const rule = rules.mathjax;

  check("app.js registers a mathjax rule", !!rule);
  // Only stored HTML can hold a diagram drawn before Mermaid went, so its rule
  // is legacy-storage.js's since stage 4's slice 5 (see that suite).
  check("the mermaid rule is not the shared service's any more", !rules.mermaid);

  // The model core's caret stops beside an equation at a line's edge, and its
  // empty-block filler, are view: a conversion drops them. Without the rule the
  // zero-width character reaches the document and a trailing stop becomes a
  // hard break.
  const filler = rules.modelFiller;
  const stopNode = { nodeType: 1, nodeName: "SPAN", hasAttribute: (n) => n === "data-filler" };
  check("app.js drops the model core's caret stops in a conversion",
    !!filler && filler.filter(stopNode) && filler.replacement("\u200B", stopNode) === "");
  check("and only those",
    !filler.filter({ nodeType: 1, nodeName: "SPAN", hasAttribute: (n) => n === "data-math" }));

  const asNode = (attrs) => ({
    nodeName: "MJX-CONTAINER",
    hasAttribute: (n) => n in attrs,
    getAttribute: (n) => attrs[n],
  });

  const blockNode = asNode({ "data-tex": "\\frac{a}{b}", "data-display": "block" });
  const inlineNode = asNode({ "data-tex": "a^2 + b^2", "data-display": "inline" });
  const unstamped = asNode({});

  check("the rule matches a stamped container", rule.filter(blockNode));
  check("the rule ignores an unstamped container", !rule.filter(unstamped));
  check(
    "the rule ignores other elements",
    !rule.filter({ nodeName: "P", hasAttribute: () => true, getAttribute: () => "x" }),
  );

  check(
    "block maths round-trips as $$…$$",
    rule.replacement("ab", blockNode) === "$$\\frac{a}{b}$$",
  );
  check(
    "inline maths round-trips as $…$",
    rule.replacement("a2+b2", inlineNode) === "$a^2 + b^2$",
  );
  // Turndown's block handling supplies the blank lines around an equation that
  // was its own paragraph. Adding them here too would split any sentence that
  // merely contained $$…$$ into three paragraphs.
  check(
    "no newlines are forced around block maths",
    !/\n/.test(rule.replacement("ab", blockNode)),
  );
  // The bug this whole suite exists for: the rendered text must never be what
  // gets written, whatever Turndown hands the replacement as `content`.
  check(
    "the rendered glyphs are discarded",
    !rule.replacement("ab", blockNode).includes("ab"),
  );

  // ── markdown-parser.js: the markdown-it rule on the way in ────────────────
  // The other end of the same loss. markdown-it applies its inline rules inside
  // an equation unless something claims the span first, so `\{` arrives as `{`,
  // renders without the brace and is saved that way -- damage done before
  // MathJax, and before any of the round trip above can help.
  //
  // The rule moved out of app.js into markdown-parser.js on 2026-09-14, so the
  // model suite parses with the app's own configuration rather than a bare
  // parser. Registration is still app.js's call, on the instance it builds, so
  // this reads it back off the stub exactly as it did before.
  const { inlineRules, renderRules, mathSpan } = loadApp();
  const registered = inlineRules.find((r) => r.name === "math");

  check("the math rule is registered", !!registered);

  // Load order, the same invariant undo.js's suite checks for itself: app.js
  // calls configureMarkdownParser at its own top level, so a bundle that ships
  // the parser after it throws on load and takes the whole editor with it —
  // which is the one way this file's move could break something no other check
  // would see.
  const appBundle = [...readFront("index.html").matchAll(/src="\/([a-z-]+\.js)"/g)]
    .map((m) => m[1]);
  check(
    "markdown-parser.js loads before app.js",
    appBundle.indexOf("markdown-parser.js") >= 0 &&
      appBundle.indexOf("markdown-parser.js") < appBundle.indexOf("app.js"),
  );
  const exportBundle = [
    ...readFront("html-export.js").match(/const ASSETS = \[(.*?)\];/s)[1]
      .matchAll(/"\/([^"]+\.js)"/g),
  ].map((m) => m[1]);
  check(
    "and before app.js in the editable export too",
    exportBundle.indexOf("markdown-parser.js") >= 0 &&
      exportBundle.indexOf("markdown-parser.js") < exportBundle.indexOf("app.js"),
  );
  check(
    "and is cached as part of the shell",
    readFront("sw.js").includes('"/markdown-parser.js"'),
  );
  check(
    "the math rule runs before markdown's escapes",
    registered && registered.anchor === "escape",
  );

  const span = (src, start = 0) => mathSpan(src, start);

  check("display maths is found", span("$$\\frac{a}{b}$$").display === true);
  check(
    "display maths keeps its backslashes",
    span("$$\\mathbb{N} = \\{ a \\}$$").content === "\\mathbb{N} = \\{ a \\}",
  );
  check("inline maths is found", span("$a^2$").display === false);
  check("inline maths keeps its content", span("$a^2$").content === "a^2");
  check(
    "the span ends at its closing delimiter",
    span("inline $x$ after", 7).end === 10,
  );

  // A dollar in prose must stay prose. Both heuristics matter: an opening
  // delimiter is never followed by a space, a closing one never by a digit.
  check("a price is not an equation", span("$5 and $10", 0) === null);
  check("a lone dollar is not an equation", span("$ sign", 0) === null);
  check("an unterminated dollar is not an equation", span("$foo bar", 0) === null);
  check("$$ alone is not an empty equation", span("$$", 0) === null);
  check("a maths span may cross a newline", span("$x +\ny$").content === "x +\ny");
  check(
    "an escaped dollar does not close a span",
    span("$a \\$ b$").content === "a \\$ b",
  );

  // The rule's whole job: consume the span and hand the source on untouched.
  const state = {
    src: "$$\\{a\\}$$",
    pos: 0,
    tokens: [],
    push(type) {
      const token = { type, markup: "", content: "" };
      this.tokens.push(token);
      return token;
    },
  };
  check("the rule claims the span", registered.rule(state, false) === true);
  check("the source survives the rule", state.tokens[0].content === "\\{a\\}");
  check("the rule consumes the delimiters", state.pos === state.src.length);
  check(
    "prose is left for the other rules",
    registered.rule({ src: "cost $5", pos: 5 }, false) === false,
  );

  // MathJax reads the text back out of the DOM, so the delimiters have to be
  // written back with it -- and the TeX escaped, or `$a < b$` is a stray tag.
  //
  // The wrapper is TODO 3.1 stage 2 slice 2's, and it is the selection mapping
  // that wants it rather than anything about maths: an equation is one
  // character in the model's offset space, and until MathJax has run there is
  // nothing in the DOM to count as one -- the rule's own output is bare text,
  // by design, because that is what MathJax reads. The delimiters stay inside
  // it for exactly that reason.
  const written = renderRules.math(
    [{ markup: "$", content: "a < b & c" }],
    0,
  );
  check(
    `the delimiters are written back, inside the marker the mapping counts (${JSON.stringify(written)})`,
    written === '<span data-math>$a &lt; b &amp; c$</span>',
  );
}
