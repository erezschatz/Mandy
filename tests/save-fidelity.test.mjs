// Cover for the ways a saved file differs from the one that was opened.
//
// Every invariant here is invisible in the app: the document looks identical on
// screen either way, and the damage only shows up in `git diff` — which is
// exactly the class of bug the rest of this suite exists for.
//
// Two halves. The first drives app.js through the DOM stub, where the
// serialiser is a pass-through (see dom.mjs), so those checks assert what
// app.js *asks for* rather than what Turndown does with it — the real output
// was checked against the running app when the options were set.
//
// The second drives markdown-style.js directly, which needs no stub at all: it
// is pure string work. Those are the ones that matter most, because the wrapper
// writes into the user's file. A break in front of a `-` turns the rest of a
// paragraph into a bullet, and the file still parses, so nothing anywhere else
// would notice.

import { loadApp, loadSource, makeEl, readFront } from "./dom.mjs";

export default function run(check) {
  const { options, htmlToMarkdown, isGhostElement } = loadApp();

  check(
    "horizontal rules serialise as --- , not Turndown's * * *",
    options.hr === "---",
  );

  // The two settings that were already deliberate. They are the reason a file
  // does not come back with setext headings or indented code blocks.
  check("headings stay atx", options.headingStyle === "atx");
  check("code blocks stay fenced", options.codeBlockStyle === "fenced");

  check("output ends with a newline", htmlToMarkdown("hello") === "hello\n");

  check(
    "an output that already ends in a newline does not gain a second",
    htmlToMarkdown("hello\n") === "hello\n",
  );

  check(
    "trailing blank lines collapse to exactly one newline",
    htmlToMarkdown("hello\n\n\n") === "hello\n",
  );

  // Guards the `\n*$` anchor: a newline in the middle of the document is
  // content, and a greedy or unanchored replace would eat it.
  check(
    "newlines inside the document are left alone",
    htmlToMarkdown("a\n\nb") === "a\n\nb\n",
  );

  // The one difference from the opened file that is deliberate rather than a
  // bug. A browser rewrites a trailing space in an edited text node to U+00A0,
  // which is invisible in the document, matches a plain space in find-in-page,
  // and cannot be located or deleted from inside the app -- so it is normalised
  // on the way out even though that costs byte fidelity for the block it is in.
  // Checked in both spellings because innerHTML gives back the entity.
  check(
    "a U+00A0 is normalised to a plain space",
    htmlToMarkdown("hello\u00a0world") === "hello world\n",
  );

  check(
    "the &nbsp; entity is normalised too",
    htmlToMarkdown("hello&nbsp;world") === "hello world\n",
  );

  // The other half of the bug is the code-span shield, which tests for a
  // literal space: an unconverted U+00A0 at the edge of a span was invisible to
  // it, and Turndown -- whose \s does match U+00A0 -- moved the character
  // outside the backticks and into the file. Converting first is what closes
  // that. The stub cannot show it: querySelectorAll returns [] there, so the
  // shield is a no-op and this only asserts the character does not survive.
  // The interaction itself was checked against the running app.
  check(
    "no U+00A0 survives a code span",
    !/\u00a0/.test(htmlToMarkdown("<p>a <code>>\u00a0</code>b</p>")),
  );

  check(
    "a literal &amp;nbsp; is not mistaken for the entity",
    htmlToMarkdown("a &amp;nbsp; b") === "a &amp;nbsp; b\n",
  );

  ghostChecks(check, isGhostElement);
  styleChecks(check);
}

// markdown-style.js is all pure string work, so unlike the options above these
// drive the real functions rather than asserting what app.js asked for.
function styleChecks(check) {
  const { sniff, reflow, index, restore } = loadSource(
    "markdown-style.js",
    {},
    "; return { sniff: sniffMarkdownStyle, reflow: reflowMarkdown," +
      " index: indexMarkdownBlocks, restore: restoreSourceWrapping };",
  );

  check("dash bullets are sniffed", sniff("- a\n- b\n").bulletListMarker === "-");
  check("a one-space pad is sniffed", sniff("- a\n- b\n").bulletPad === 1);
  check("*** rules are sniffed", sniff("a\n\n***\n\nb\n").hr === "***");

  // The trap the sniffer exists to avoid: a setext underline is three dashes on
  // a line of its own, and reading it as a rule votes for the wrong style.
  check("a setext underline is not a rule", sniff("Title\n---\n").hr === "---");
  check(
    "a setext underline does not outvote a real rule",
    sniff("Title\n---\n\ntext\n\n***\n\nmore\n").hr === "***",
  );

  check("asterisk emphasis is sniffed", sniff("an *emph* here\n").emDelimiter === "*");
  check(
    "snake_case is not read as emphasis",
    sniff("call some_helper_name and _real emph_ here\n").emDelimiter === "_",
  );
  check("all-ones numbering is sniffed", sniff("1. a\n1. b\n1. c\n").orderedAllOnes);
  check("incrementing numbering is sniffed", !sniff("1. a\n2. b\n3. c\n").orderedAllOnes);
  check(
    "a wrapped item does not break the run all-ones is counted over",
    sniff("1. a\n   still a\n1. b\n   still b\n1. c\n").orderedAllOnes,
  );
  check(
    "a paragraph at the margin does end the list",
    !sniff("1. a\n\ntext\n\n1. b\n").orderedAllOnes,
  );
  check("a paren delimiter is sniffed", sniff("1) a\n2) b\n").orderedDelimiter === ")");
  check("autolinks are sniffed", sniff("see <http://example.com>\n").autolinks);
  check("inline links are not read as autolinks", !sniff("[a](http://e.com)\n").autolinks);

  // Nesting depth is not the indent column, so a document that alternates
  // markers by level has to come back alternating.
  const nested = sniff("* one\n    - a\n    - b\n* two\n").bulletsByDepth;
  check("markers are sniffed per depth", nested[0].marker === "*" && nested[1].marker === "-");

  const unwrapped = "a b c d e f g h i j k l m n o p q r s t u v w x y z\n";
  check("an unwrapped file reports no width", sniff(unwrapped).wrapWidth === 0);
  check("a width of 0 leaves the text alone", reflow(unwrapped, 0) === unwrapped);

  // Every one of these writes a heading, bullet, quote or rule into the middle
  // of a paragraph if the wrapper breaks in front of the marker.
  const guards = [
    ["a bullet", "alpha beta gamma delta epsilon - zeta eta theta iota"],
    ["an ordered marker", "alpha beta gamma delta epsilon 1. zeta eta theta"],
    ["a heading", "alpha beta gamma delta epsilon # zeta eta theta iota"],
    ["a rule", "alpha beta gamma delta epsilon --- zeta eta theta iota"],
  ];
  for (const [what, text] of guards) {
    const lines = reflow(text + "\n", 30).trimEnd().split("\n");
    check(
      `wrapping never strands ${what} at the start of a line`,
      lines.every((line) => !/^\s*(#{1,6}|[-*+]|\d+[.)]|-{2,})(\s|$)/.test(line)),
    );
  }

  const quoted = reflow("> alpha beta gamma delta epsilon zeta eta theta iota\n", 30);
  check(
    "a wrapped blockquote keeps its prefix on every line",
    quoted.trimEnd().split("\n").every((line) => line.startsWith(">")),
  );

  const item = reflow("-   alpha beta gamma delta epsilon zeta eta theta\n", 30);
  check(
    "a wrapped list item indents to its content",
    item.trimEnd().split("\n").slice(1).every((line) => line.startsWith("    ")),
  );

  // Fenced code is not prose and re-wrapping it changes the program inside.
  const fenced = "```\nthis is a very long line of code that must not be broken up\n```\n";
  check("fenced code is never re-wrapped", reflow(fenced, 30) === fenced);
  const table = "| a very long header | another very long header |\n";
  check("table rows are never re-wrapped", reflow(table, 20) === table);

  // Maths is not prose either, and a break inside it lands wherever the width
  // says -- between \frac and its arguments, or after a lone backslash.
  const equation = "$$\\frac{a}{b} = \\sum_{i=0}^{n} x_i + y_i - z_i$$\n";
  check("a display equation is never re-wrapped", reflow(equation, 20) === equation);
  const inlineMaths = "the value $a^2 + b^2 = c^2$ holds for every right triangle\n";
  check("a line carrying maths is left alone", reflow(inlineMaths, 20) === inlineMaths);
  const mathsBlock = "$$\n\\alpha + \\beta = \\gamma \\text{ for all of these values}\n$$\n";
  check("the body of a display block is left alone", reflow(mathsBlock, 20) === mathsBlock);

  // The guard is a state machine like the fence one, so the two must not read
  // each other's delimiters: prose after either has to wrap again.
  const afterMaths = mathsBlock + "alpha beta gamma delta epsilon zeta eta\n";
  check(
    "prose after a display block still wraps",
    reflow(afterMaths, 20).trimEnd().split("\n").length > mathsBlock.split("\n").length,
  );
  const fencedMaths = "```\n$$\n```\nalpha beta gamma delta epsilon zeta eta theta\n";
  check(
    "a $$ inside a fence does not open a display block",
    reflow(fencedMaths, 20).split("\n").length > fencedMaths.split("\n").length,
  );
  check("a price is not maths", reflow("it cost $5 and then $10 in total today\n", 20) !==
    "it cost $5 and then $10 in total today\n");

  // The restore is what makes an untouched paragraph come back byte-identical
  // however the author happened to break it.
  const source = "one two three\nfour five six\n\n- item one\n- item two\n";
  const serialised = "one two three four five six\n\n- item one\n\n- item two\n";
  check(
    "an untouched block comes back as the bytes it arrived as",
    restore(serialised, index(source)) === source,
  );
  check(
    "an edited block is left as the serialiser wrote it",
    restore("one two CHANGED six\n", index(source)) === "one two CHANGED six\n",
  );
  check(
    "a document with no source to restore from is untouched",
    restore(serialised, new Map()) === serialised,
  );

  // Escapes are the serialiser's, not the author's, so they must not stop a
  // block matching itself.
  check(
    "turndown's escaping does not defeat the match",
    restore("a 1\\. b\n", index("a 1. b\n")) === "a 1. b\n",
  );

  // Cell padding and delimiter width are the table rule's own, and neither is
  // the author's to lose: a table that keys on them never matches itself.
  const compact = "|a|b|\n|---|---|\n|1|2|\n";
  check(
    "a compact table survives the rule's padding",
    restore("| a | b |\n| --- | --- |\n| 1 | 2 |\n", index(compact)) === compact,
  );
  const aligned = "| a | b |\n|:------|------:|\n| 1 | 2 |\n";
  check(
    "a wide delimiter row survives being narrowed to three dashes",
    restore("| a | b |\n| :-- | --: |\n| 1 | 2 |\n", index(aligned)) === aligned,
  );
  check(
    "an edited cell still misses",
    restore("| a | b |\n| --- | --- |\n| 1 | 3 |\n", index(compact)) ===
      "| a | b |\n| --- | --- |\n| 1 | 3 |\n",
  );

  // The normalisation is scoped to blocks holding a delimiter row, so a rule
  // and a paragraph that happens to contain a pipe both stay literal.
  check(
    "a horizontal rule is not read as a delimiter row",
    restore("a\n\n---\n\nb\n", index("a\n\n-----\n\nb\n")) === "a\n\n---\n\nb\n",
  );
  check(
    "a pipe in prose does not make a table of the paragraph",
    restore("use a | b here\n", index("use  a | b  here\n")) === "use  a | b  here\n",
  );
}

// The other half of the invisible-junk problem, and the one that reaches the
// file: empty wrappers and blank <p>/<div> blocks come in on a paste, Turndown
// serialises them, and they are then in the document for good.
//
// Only the predicate is driven here. The traversal around it needs a real HTML
// parser to have anything to walk, and the stub's innerHTML is a stored string
// -- so the decision is what gets tested, and the sanitiser is written to keep
// that decision in one pure function for exactly that reason.
function ghostChecks(check, isGhostElement) {
  const el = (tag, text = "") => makeEl(tag, { text });
  const nest = (tag, ...children) => {
    const node = makeEl(tag);
    children.forEach((child) => node.appendChild(child));
    return node;
  };

  check("an empty <p> is a ghost", isGhostElement(el("p")));
  check("an empty <div> is a ghost", isGhostElement(el("div")));
  check("an empty <span> is a ghost", isGhostElement(el("span")));
  check("an empty <b> is a ghost", isGhostElement(el("b")));

  check("a <p> with text is not", !isGhostElement(el("p", "hello")));
  check("a <span> with text is not", !isGhostElement(el("span", "hello")));

  // The asymmetry, which is the only interesting rule in the function. Word and
  // Docs both write a blank line as a block holding one <br>, so a block is not
  // saved by one -- but inside an inline element the same tag is a real break
  // in a real line, and removing its parent would take the break with it.
  check(
    "a <p> holding only a <br> is the ghost line itself",
    isGhostElement(nest("p", el("br"))),
  );
  check(
    "a <span> holding a <br> is kept",
    !isGhostElement(nest("span", el("br"))),
  );

  // Empty is not the same as contentless. An image has no text and is the whole
  // point of the block it sits in.
  check(
    "a <p> holding an <img> is kept",
    !isGhostElement(nest("p", el("img"))),
  );
  check(
    "a <div> holding a <table> is kept",
    !isGhostElement(nest("div", el("table"))),
  );
  check(
    "a wrapper several deep with an <img> at the bottom is kept",
    !isGhostElement(nest("div", nest("span", nest("span", el("img"))))),
  );

  // Everything outside the two lists is the author's, however empty it looks.
  // An empty <li> is a bullet they made; an empty <td> is a cell in their table.
  check("an empty <li> is not a ghost", !isGhostElement(el("li")));
  check("an empty <td> is not a ghost", !isGhostElement(el("td")));
  check("an empty <a> is not a ghost", !isGhostElement(el("a")));
  check("an empty <h2> is not a ghost", !isGhostElement(el("h2")));

  check("a text node is not a ghost", !isGhostElement({ nodeType: 3 }));
  check("nothing at all is not a ghost", !isGhostElement(null));

  // A source scan, for the half the stub cannot reach: the sanitiser only helps
  // if the paste handler actually routes through it, and the way this regresses
  // is a later edit reaching for the raw clipboard string again.
  const source = readFront("app.js");
  check(
    "the paste handler sanitises the clipboard HTML",
    /sanitisePastedHtml\(html\)/.test(source),
  );
  check(
    "nothing inserts unsanitised clipboard HTML",
    !/insertHTML", false, html\)/.test(source),
  );
}
