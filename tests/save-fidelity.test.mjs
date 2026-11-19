// Cover for the conventions a document is written back in.
//
// Every invariant here is invisible in the app: the document looks identical on
// screen either way, and the damage only shows up in `git diff` — which is
// exactly the class of bug the rest of this suite exists for.
//
// Two halves. The first drives app.js through the DOM stub, where Turndown is a
// pass-through (see dom.mjs), so those checks assert what app.js *asks for*
// rather than what Turndown does with it. Turndown converts a paste and the
// table of contents now, never the document: the model writes that.
//
// The second drives markdown-style.js directly, which needs no stub at all: it
// is pure string work. The sniffers decide the spelling every edited block is
// written in, the line wrapper breaks one the model composed too long, and the
// table formatter lays out an edited table. A break in front of a `-` turns the
// rest of a paragraph into a bullet, and the file still parses, so nothing
// anywhere else would notice.
//
// The old core's two other layers — the re-wrap of a whole serialised document
// and the restore of the opened file's bytes — moved to legacy-storage.js in
// stage 4's slice 5, and their checks to the `legacy-storage` suite with them.

import { loadApp, loadSource, makeEl, readFront } from "./dom.mjs";

export default function run(check) {
  const { options, htmlFragmentToMarkdown, isGhostElement, rules } = loadApp();

  check(
    "horizontal rules serialise as --- , not Turndown's * * *",
    options.hr === "---",
  );

  // Turndown ships no strikethrough rule of its own — that lives in
  // turndown-plugin-gfm, which this project does not carry — so without this
  // a pasted <s> round-trips to plain text.
  const strike = rules.strikethrough;
  check("app.js registers a strikethrough rule", !!strike);
  check("the rule matches <s>", strike.filter({ nodeName: "S" }));
  check("the rule matches <del>", strike.filter({ nodeName: "DEL" }));
  check("the rule matches <strike>", strike.filter({ nodeName: "STRIKE" }));
  check("the rule ignores other elements", !strike.filter({ nodeName: "SPAN" }));
  check(
    "the replacement wraps the content in ~~",
    strike.replacement("struck") === "~~struck~~",
  );

  // The two settings that were already deliberate. They are the reason a file
  // does not come back with setext headings or indented code blocks.
  check("headings stay atx", options.headingStyle === "atx");
  check("code blocks stay fenced", options.codeBlockStyle === "fenced");

  // TODO 2.2's second half: the hard-break spelling is a sniffed option like
  // the rule character and the emphasis delimiters, not a fixed one. Checked
  // here because this is where "the options app.js actually asks for" lives —
  // a sniffer that reads the spelling correctly and never hands it to Turndown
  // would pass every sniff check below and change nothing a paste writes.
  check("the hard-break spelling is handed to Turndown", options.br === "  ");

  // The one difference from what was pasted that is deliberate rather than a
  // bug. U+00A0 is invisible in the document, matches a plain space in
  // find-in-page, and cannot be located or deleted from inside the app -- so it
  // is normalised on the way in. Checked in both spellings because innerHTML
  // gives back the entity.
  check(
    "a U+00A0 is normalised to a plain space",
    htmlFragmentToMarkdown("hello\u00a0world") === "hello world",
  );

  check(
    "the &nbsp; entity is normalised too",
    htmlFragmentToMarkdown("hello&nbsp;world") === "hello world",
  );

  // The other half of the bug is the code-span shield, which tests for a
  // literal space: an unconverted U+00A0 at the edge of a span was invisible to
  // it, and Turndown -- whose \s does match U+00A0 -- moved the character
  // outside the backticks. Converting first is what closes that. The stub
  // cannot show it: querySelectorAll returns [] there, so the shield is a no-op
  // and this only asserts the character does not survive.
  check(
    "no U+00A0 survives a code span",
    !/\u00a0/.test(htmlFragmentToMarkdown("<p>a <code>>\u00a0</code>b</p>")),
  );

  check(
    "a literal &amp;nbsp; is not mistaken for the entity",
    htmlFragmentToMarkdown("a &amp;nbsp; b") === "a &amp;nbsp; b",
  );

  ghostChecks(check, isGhostElement);
  styleChecks(check);
  tableChecks(check);
}

// TODO 2.1, closed for the running editor by stage 3's slice 3 of 3.1. An edited
// table used to come back in the rule's one house style, losing a compact or a
// padded-to-width source; now it is laid out again in the convention the
// document's tables keep to. The oracle half -- every well-formed table in the
// oracle files re-emitted byte for byte from the parser's cells -- is in the
// model suite, which has the parser. These are the decisions one at a time, and
// then the Turndown rule driven the way Turndown drives it.
function tableChecks(check) {
  const { sniffTable, format, sniff, split } = loadSource(
    "markdown-style.js",
    {},
    "; return { sniffTable: sniffTableConvention, format: formatMarkdownTable, sniff: sniffMarkdownStyle," +
      " split: splitTableRow };",
  );
  const lines = (text) => text.trimEnd().split("\n");

  const padded = "| Name | Age |\n| ---- | --: |\n| Ann  |   7 |\n| Bo   |  12 |";
  const convention = sniffTable(lines(padded));
  check("a table padded to width is read as aligned, its numbers set right",
    !!convention && convention.aligned && convention.justify && convention.delimiter.fill);
  check("and widening one cell re-pads the whole column and its delimiter with it",
    format([["Name", "Age"], ["Annabelle", "7"], ["Bo", "12"]], ["", "right"], convention) ===
      "| Name      | Age |\n| --------- | --: |\n| Annabelle |   7 |\n| Bo        |  12 |");

  const compact = "|a|b|\n|:-|-:|\n|1|2|";
  const tight = sniffTable(lines(compact));
  check("a compact table stays compact when a cell grows, alignment and all",
    !!tight && format([["a", "b"], ["100", "2"]], ["left", "right"], tight) === "|a|b|\n|:-|-:|\n|100|2|");

  check("an escaped pipe is counted as the two characters the file holds",
    format([["a"], ["x \\| y"]], [""], { ...convention, justify: false }) ===
      "| a      |\n| ------ |\n| x \\| y |");
  check("width is counted in code points, so an accented letter is one",
    format([["é"], ["ab"]], [""], { ...convention, minWidth: 1 }) === "| é  |\n| -- |\n| ab |");
  check("a hand-padded table that keeps to no convention is read as none rather than guessed at",
    sniffTable(lines("| a |  b |\n| --- | --- |\n|c| d |")) === null);
  // Without edge pipes, a row starting with an empty cell would start with the
  // pipe after it, which GFM reads as a leading pipe: the cell would vanish.
  const pipeless = { ...sniffTable(lines("a | b\n--- | ---\n1 | 2")) };
  check("a table with no edge pipes is read as one",
    pipeless.lead === false && pipeless.trail === false);
  check("and a row of it whose first cell is empty keeps a leading pipe, so the cell stays",
    format([["a", "b"], ["", "x"]], ["", ""], pipeless) === "a | b\n--- | ---\n| | x");
  check("and padded to width too",
    format([["a", "b"], ["", "x"]], ["", ""], { ...pipeless, aligned: true, minWidth: 1, delimiter: { fill: true } }) ===
      "a | b\n- | -\n|   | x");
  // markdown-it 13 splits on a pipe unless a backslash is right before it, and
  // counts no parity, measured: `b\\|c` is one cell to it. A splitter that
  // read `\\` as an escaped backslash disagreed with the parser about where
  // the cells are, which is the one thing it must not do.
  check("a pipe after two backslashes does not split, as markdown-it reads it",
    JSON.stringify(split("|a|b\\\\|c|").cells) === JSON.stringify(["a", "b\\\\|c"]));
  check("an empty cell in a one-space table is one space, as people write it",
    format([["a", "b"], ["", "x"]], ["", ""]) === "| a | b |\n| --- | --- |\n| | x |");

  // The document-wide half: Turndown sees the DOM, so it gets one convention.
  check("a document with no tables has no table convention, so the rule keeps its own",
    sniff("Just prose.\n").table === null);
  check("the document's commonest convention wins",
    sniff("|a|b|\n|-|-|\n|1|2|\n\n|c|d|\n|-|-|\n|3|4|\n\n| e | f |\n| --- | --- |\n| 5 | 6 |\n").table.pad === 0);
  check("a table inside a fence is an example, not evidence",
    sniff("```\n|a|b|\n|-|-|\n```\n").table === null);
  // The style sniff blanks code spans so `*x*` in one is not evidence of
  // emphasis; a table must not lose its cells to that, or its vote goes too.
  check("a table holding a code span still votes",
    !!sniff("| `a` | b |\n| --- | --- |\n| 1 | 2 |\n").table);
  check("a table in a quote is read through its `>`",
    sniff("> |a|b|\n> |-|-|\n> |1|2|\n").table.pad === 0);

  // The rule, driven the way Turndown drives it: cells, then each row with its
  // node, then the table with everything its rows returned.
  const app = loadApp();
  const cell = (align) => ({ getAttribute: (name) => (name === "style" && align ? `text-align:${align}` : null) });
  const head = { nodeName: "THEAD", previousElementSibling: null };
  const body = { nodeName: "TBODY", previousElementSibling: head };
  const row = (parentNode, previousElementSibling, aligns) =>
    ({ parentNode, previousElementSibling, children: aligns.map(cell) });
  const turndownTable = (rows) => {
    const tr = app.rules.tableRow.replacement;
    const td = app.rules.tableCell.replacement;
    let content = "";
    let previous = null;
    rows.forEach((cells, i) => {
      const node = row(i ? body : head, i > 1 ? previous : null, i ? cells.map(() => null) : ["left", "right"]);
      content += tr(cells.map((c) => td(c)).join(""), node);
      previous = node;
    });
    return app.rules.table.replacement(content);
  };
  check("with nothing sniffed the rule writes what it always wrote",
    turndownTable([["a", "b"], ["1", "22"]]) === "\n\n| a | b |\n| :-- | --: |\n| 1 | 22 |\n\n");
  app.adoptMarkdownStyle("|x|y|\n|-|-|\n|1|2|\n");
  check("after a compact document is opened, an edited table is written compact",
    turndownTable([["a", "b"], ["1", "22"]]) === "\n\n|a|b|\n|:-|-:|\n|1|22|\n\n");
  app.adoptMarkdownStyle("| x   |   y |\n| --- | --: |\n| 1   |   2 |\n");
  check("and after a padded one, padded to width",
    turndownTable([["a", "b"], ["1", "22"]]) === "\n\n| a   |   b |\n| :-- | --: |\n| 1   |  22 |\n\n");
  // An empty cell reaches the cell rule like any other -- measured against the
  // Turndown 7.1.2 the app loads, which counts a blank <td> as meaningful.
  app.adoptMarkdownStyle("");
  const td = app.rules.tableCell.replacement;
  const tr = app.rules.tableRow.replacement;
  check("an empty cell is written as one",
    app.rules.table.replacement(tr(td("a") + td("b"), row(head, null, ["", ""])) +
      tr(td("") + td("2"), row(body, null, [null, null]))) === "\n\n| a | b |\n| --- | --- |\n| | 2 |\n\n");
  // markdown has nowhere for a <caption>, and dropping its text loses words.
  check("a caption's text is kept, ahead of the table",
    app.rules.table.replacement("Readings" + tr(td("a"), row(head, null, [""])) + tr(td("1"), row(body, null, [null]))) ===
      "\n\nReadings\n\n| a |\n| --- |\n| 1 |\n\n");
}

// markdown-style.js is all pure string work, so unlike the options above these
// drive the real functions rather than asserting what app.js asked for.
function styleChecks(check) {
  const { sniff, wrapLine, wrapPrefixes } = loadSource(
    "markdown-style.js",
    {},
    "; return { sniff: sniffMarkdownStyle," +
      " wrapLine: wrapMarkdownLine, wrapPrefixes: wrapMarkdownPrefixes };",
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

  // The prefixes a wrap puts back are now a parameter, so a caller that knows
  // them does not have to let the wrapper guess a second time — TODO 3.1's
  // slice 3 step 5, where the model hands over what it recorded at parse. The
  // derivation stays as the default for reflowMarkdown, which is handed a
  // document as text and has nothing else to consult.
  check(
    "the derived prefixes are the quote chain, the marker and a content-aligned indent",
    JSON.stringify(wrapPrefixes("> -   text")) === JSON.stringify({ first: "> -   ", continuation: ">     " }) &&
      JSON.stringify(wrapPrefixes("plain text")) === JSON.stringify({ first: "", continuation: "" }),
  );
  check(
    "and a caller that passes its own gets them back verbatim, tab and all",
    wrapLine("-\talpha beta gamma delta epsilon zeta eta theta", 20, { first: "-\t", continuation: "\t" })
      .slice(1)
      .every((line) => line.startsWith("\t")),
  );
  // Which is the bug: derived, that same item continues under two spaces — the
  // same column and different bytes. Unreachable through reflowMarkdown, since
  // a marker only arrives there from Turndown's listItem rule and the sniff
  // behind it matches spaces alone, so this is here to pin the difference the
  // model measured rather than to report a live fault.
  check(
    "where the derivation would have written spaces of the same width instead",
    wrapPrefixes("-\talpha").continuation === "  ",
  );

  // S3: which spelling to write is read off the document rather than fixed.
  // Both forms only mean a break when a line of the same paragraph follows, so
  // trailing spaces before a blank line are untidiness and not evidence.
  check(
    "a file that breaks with two spaces sniffs to two spaces",
    sniff("one line  \nand its continuation\n\nmore prose here\n").hardBreak === "  ",
  );
  check(
    "a file that breaks with a backslash sniffs to a backslash",
    sniff("one line\\\nand its continuation\n\nmore prose here\n").hardBreak === "\\",
  );
  check(
    "a file with no break at all keeps Turndown's own default",
    sniff("just prose\n\nand more of it\n").hardBreak === "  ",
  );
  check(
    "trailing spaces before a blank line are not a break and do not vote",
    sniff("a paragraph ending untidily  \n\nthe next one\n").hardBreak === "  ",
  );
  check(
    "a backslash before a blank line does not vote either",
    sniff("a paragraph ending in a slash\\\n\nthe next one\n").hardBreak === "  ",
  );
  check(
    "the commoner spelling wins when a file mixes them",
    sniff("a\\\nb\n\nc\\\nd\n\ne  \nf\n").hardBreak === "\\",
  );
  // And the consequence of that, which is a real behaviour rather than a gap:
  // a file mixing both spellings has its minority ones rewritten in the
  // majority spelling wherever a block is edited. Watched end-to-end through
  // the running app on 2026-09-13 and left alone deliberately — `hardBreak` is
  // a document-wide option like `emDelimiter`, not a per-break one, and no real
  // document alternates break spellings on purpose. **The break itself is never
  // lost**, which is the guarantee that matters; only its spelling moves.
  check(
    "and the minority spelling loses, which is what a document-wide option means",
    sniff("a  \nb\n\nc  \nd\n\ne\\\nf\n").hardBreak === "  ",
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
