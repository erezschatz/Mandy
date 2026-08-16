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

import { loadApp, loadSource } from "./dom.mjs";

export default function run(check) {
  const { options, htmlToMarkdown } = loadApp();

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
}
