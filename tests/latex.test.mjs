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

import { loadApp, loadSource, makeEl } from "./dom.mjs";

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

  // ── app.js: the markdown-it rule on the way in ────────────────────────────
  // The other end of the same loss. markdown-it applies its inline rules inside
  // an equation unless something claims the span first, so `\{` arrives as `{`,
  // renders without the brace and is saved that way -- damage done before
  // MathJax, and before any of the round trip above can help.
  const { inlineRules, renderRules, mathSpan } = loadApp();
  const registered = inlineRules.find((r) => r.name === "math");

  check("app.js registers a math rule", !!registered);
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
