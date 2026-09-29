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
  const written = renderRules.math(
    [{ markup: "$", content: "a < b & c" }],
    0,
  );
  check("the delimiters are written back", written === "$a &lt; b &amp; c$");
}
