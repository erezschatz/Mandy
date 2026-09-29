// Regression cover for silent LaTeX data loss on save.
//
// MathJax replaces the `$$…$$` source with rendered CHTML, so Turndown used to
// serialise the glyphs instead of the maths: `$$\frac{a}{b}$$` was written back
// to the file as "ab", and `$$E = mc^2$$` as "E\=mc2". Irrecoverable, and quiet
// — the document still looked right on screen.
//
// Two halves have to hold for the round trip to survive, and each fails
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

  // Re-stamping must not clobber: MathJax re-typesets already-rendered maths on
  // load in an exported document, and the second pass reports MathML, not TeX.
  loadRenderers(
    fakeMathJax([{ math: "<math>rerendered</math>", display: true, typesetRoot: block }]),
    container,
  );
  check("an existing stamp is not overwritten", block.attrs["data-tex"] === "\\frac{a}{b}");

  // Absent MathJax must be survivable: renderLatex is a no-op without maths,
  // but stampLatexSource is reachable from an exported document either way.
  let threw = null;
  try {
    loadRenderers(undefined, makeEl("div"), []);
  } catch (error) {
    threw = error;
  }
  check("no MathJax is not an error", threw === null);

  // ── renderers.js: typesetting again ────────────────────────────────────────
  //
  // A second typeset pass over maths already typeset nested a new container
  // inside the old one, every reload and every Paste markdown, and the
  // autosave kept each copy: one equation was three containers after a single
  // reload. renderLatex now puts stamped maths back to its source and typesets
  // that afresh. The stub has no MathJax and no selector engine, so what is
  // asserted is what renderLatex hands MathJax, and in what order.
  {
    const loadRenderLatex = (container, ensureMathJax) => {
      container.querySelectorAll = (sel) =>
        sel === "mjx-container[data-tex]"
          ? walk(container).filter((n) => n.tagName === "MJX-CONTAINER" && "data-tex" in n.attrs)
          : [];
      return loadSource(
        "renderers.js",
        {
          window: { MathJax: undefined },
          MathJax: undefined,
          document: {
            documentElement: { getAttribute: () => "light" },
            createTextNode: makeText,
          },
          editor: container,
          ensureMathJax,
          console: { error() {} },
        },
        "; return renderLatex;",
      );
    };
    // A typeset container that can be swapped out, the way a real one can.
    const typesetIn = (parent, tex, display) => {
      const root = makeContainer(parent);
      root.setAttribute("data-tex", tex);
      root.setAttribute("data-display", display);
      root.replaceWith = (node) => {
        parent.children[parent.children.indexOf(root)] = node;
        node.parentElement = parent;
        root.parentElement = null;
      };
      return root;
    };
    const textOf = (node) => node.children.map((c) => c.nodeType === 3 ? c.textContent : "<" + c.tagName + ">").join("");

    const para = makeEl("p");
    typesetIn(para, "\\frac{a}{b}", "block");
    const inlineRoot = typesetIn(para, "x^2", "inline");
    // Earlier reloads' nesting, stamped: a container inside the assistive
    // MathML of another. Only the outer one is authored maths.
    const assistive = makeEl("mjx-assistive-mml", { parent: inlineRoot });
    assistive.parentElement = inlineRoot;
    const nestedRoot = typesetIn(assistive, "<math>copy</math>", "inline");

    const calls = [];
    const fake = {
      typesetClear: () => calls.push(`clear:${textOf(para)}`),
      typesetPromise: async () => calls.push(`typeset:${textOf(para)}`),
    };
    await loadRenderLatex(para, async () => fake)(para);
    check("typeset maths goes back to its source before typesetting",
      calls[calls.length - 1] === "typeset:$$\\frac{a}{b}$$$x^2$");
    check("MathJax forgets the old containers while they are still there to find",
      calls[0] === "clear:<MJX-CONTAINER><MJX-CONTAINER>");
    check("a nested copy goes with its outer container rather than on its own",
      !walk(para).includes(nestedRoot) && calls.length === 2);

    // Offline, the stamped containers are what a save reads the TeX from. Put
    // back as text before MathJax has loaded, it would reach Turndown as prose.
    const offline = makeEl("p");
    const kept = typesetIn(offline, "y", "inline");
    await loadRenderLatex(offline, async () => { throw new Error("offline"); })(offline);
    check("with MathJax unavailable the typeset maths is left as it was",
      offline.children[0] === kept && kept.attrs["data-tex"] === "y");

    // And a document with no maths at all still never fetches MathJax.
    let fetched = false;
    const plain = makeEl("p");
    plain.children.push(makeText("Just prose, no maths."));
    await loadRenderLatex(plain, async () => { fetched = true; return fake; })(plain);
    check("a document with no maths does not load MathJax", fetched === false);
  }

  // ── renderers.js: drawing again after a model render ───────────────────────
  //
  // TODO 3.1's model core re-renders on every edit, and each render throws away
  // the diagrams and equations the renderers drew. What was drawn is kept by
  // source and put back **before anything is awaited**, so a render never
  // paints a frame of fence or TeX. The stub has no Mermaid and no MathJax; what
  // is asserted is what lands in the DOM, and when.
  {
    const loadDrawing = ({ document: documentExtra, ...globals }) => loadSource(
      "renderers.js",
      {
        window: { MathJax: undefined },
        MathJax: undefined,
        document: {
          documentElement: { getAttribute: () => "light" },
          createElement: (tag) => makeEl(tag),
          createTextNode: makeText,
          getElementById: () => null,
          ...documentExtra,
        },
        editor: makeEl("div"),
        console: { error() {} },
        ensureMermaid: async () => {},
        mermaid: { render: async (id) => ({ svg: `<svg id="${id}"></svg>` }) },
        ...globals,
      },
      "; return { renderMermaidDiagrams, renderedCachePut, renderedCache," +
        " mathTakeFromCache, mathRemember };",
    );
    // A fence the way markdown-it renders one, stamped with its block id the
    // way the model core's renderer stamps it.
    const fenceIn = (source, block) => {
      const container = makeEl("div");
      const pre = makeEl("pre", { parent: container });
      pre.parentElement = container;
      pre.parentNode = container;
      pre.isConnected = true;
      if (block) pre.setAttribute("data-block", block);
      const code = makeEl("code", { parent: pre, text: source });
      code.parentElement = pre;
      container.querySelectorAll = (sel) => (sel === "pre code.language-mermaid" && container.children.includes(pre) ? [code] : []);
      return { container, pre };
    };

    let r = loadDrawing({});
    let f = fenceIn("graph TD; A-->B", "7");
    r.renderedCachePut("mermaid:light:graph TD; A-->B", { svg: "<svg id=\"old\"></svg>", id: "old" });
    const pending = r.renderMermaidDiagrams(f.container); // deliberately not awaited
    const drawn = f.container.children[0];
    check("a diagram drawn before goes back in the same task, before anything is awaited",
      drawn.className === "mermaid-wrapper");
    check("and its wrapper keeps the fence's block id, so the model still finds the block",
      drawn.getAttribute("data-block") === "7");
    await pending;

    // Two identical diagrams in one document: Mermaid scopes its styles by the
    // SVG's id, so the second must be drawn afresh rather than given a copy.
    r = loadDrawing({ document: { getElementById: (id) => (id === "old" ? {} : null) } });
    f = fenceIn("graph TD; A-->B", "8");
    r.renderedCachePut("mermaid:light:graph TD; A-->B", { svg: "<svg id=\"old\"></svg>", id: "old" });
    await r.renderMermaidDiagrams(f.container);
    check("a drawing whose id is still on the page is drawn afresh instead of copied",
      f.container.children[0].className === "mermaid-wrapper" &&
        r.renderedCache.get("mermaid:light:graph TD; A-->B").id !== "old");

    // A render that finishes after the document moved on: the <pre> it was for
    // has been thrown away, and drawing anywhere would draw over its successor.
    r = loadDrawing({});
    f = fenceIn("graph LR; X-->Y", "9");
    const late = r.renderMermaidDiagrams(f.container);
    f.container.children.length = 0;
    f.pre.isConnected = false;
    f.pre.parentNode = null;
    let threw = null;
    try { await late; } catch (error) { threw = error; }
    check("a diagram finishing after its fence was thrown away draws nothing and does not throw",
      threw === null && f.container.children.length === 0);

    // A diagram Mermaid rejects is kept as its error, so a broken one does not
    // flash its code on every Enter while Mermaid rejects it again.
    r = loadDrawing({ mermaid: { render: async () => { throw new Error("Parse error on line 2"); } } });
    f = fenceIn("graph TD; A --> -->", "10");
    await r.renderMermaidDiagrams(f.container);
    const again = fenceIn("graph TD; A --> -->", "10");
    r.renderMermaidDiagrams(again.container); // not awaited
    const errorShown = again.container.children[0];
    check("a rejected diagram comes back as its error in the same task, message and all",
      errorShown.className === "mermaid-wrapper" &&
        JSON.stringify(walk(errorShown).map((n) => n.textContent)).includes("Parse error on line 2"));

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

  // ── app.js: the Turndown rule ─────────────────────────────────────────────
  const { rules } = loadApp();
  const rule = rules.mathjax;

  check("app.js registers a mathjax rule", !!rule);
  check("the mermaid rule is still registered", !!rules.mermaid);

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
