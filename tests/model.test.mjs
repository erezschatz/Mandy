// The document model — TODO 3.1's stage 1, and the suite that proves D1
// survives the rewrite before anything is at risk.
//
// This is the first suite with no DOM in it at all. `front/model.js` is pure
// string and token work by construction, so the only things borrowed from
// dom.mjs are its two file helpers — there is no stub here, nothing is
// pretending to be a browser, and a failure means the model is wrong rather
// than that the stub disagreed.
//
// It does need a real parser, which is the one thing the repo has not had
// outside a browser: markdown-it arrives by `npm:` specifier, pinned in the
// root deno.json the way server/deno.json already pins `npm:hono`. Flagged per
// CLAUDE.md and decided on 2026-09-11 — the app keeps its CDN script tag, so
// **that tag and deno.json are two halves of one pin and move together**.
//
// The oracle is real prose, held as fixtures. It drove the living project
// files until 2026-09-16, which was right while this was a fork being hacked
// on and is wrong now, for two reasons that are the same reason. A living file
// cannot be written for the test — nobody is going to put a quote inside a
// list in README.md to cover a construct — so coverage is hostage to what the
// documents happen to need to say. And the documents describe the suite, so
// every count quoted in one moved the moment the other was edited: a
// documentation change became a failing test about list items, and refreshing
// the figures moved them again. See `corpus/` below.

import markdownit from "markdown-it";
import { readFileSync } from "node:fs";
import { loadSource } from "./dom.mjs";

const repoFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The oracle, and it is deliberately two kinds of file.
//
// The first five are **frozen copies**, taken on 2026-09-16, of five documents
// this project maintains by hand. Copies rather than references, and prose
// rather than invention: what makes them worth testing against is that a human
// wrote them to be read, so they carry the conventions real prose carries —
// tight lists, reference links, tables, fences, maths, a wrap width somebody
// chose. A file written to exercise the parser would prove only that the model
// round-trips what the model finds easy.
//
// Being copies is what makes them usable. They can be edited to cover a
// construct, because nothing reads them but this file; and editing the
// originals cannot move a number here, which it did constantly while these
// were references — these files quote the suite's own counts, so the two
// chased each other.
//
// **Anything in `corpus/` is oracle.** There is no README in there and no file
// that is not in the list below, so a new file is a deliberate addition rather
// than something to be discovered. Refreshing one is a deliberate act too: copy
// the living file over it, run the suite, and expect the counts in the labels
// to move.
//
// They are a **biased** sample, and the bias runs one way. Every one was
// written or reformatted in a single voice, so they are uniformly well-formed —
// and between them they contain no blockquote, no hard break, no strikethrough
// and no reference definition at all. A suite driving only these would report
// full marks on constructs it had never once parsed.
//
// `tests/fixtures/torture.md` is the answer to that: one deliberately messy
// document carrying at least one of everything in docs/MARKDOWN.md, nested far
// deeper than any real file here goes, and inconsistent everywhere it is legal
// to be. It does not replace the five — an invented file cannot say what real
// prose does — it covers the half they cannot.
const CORPUS = {
  claude: "tests/fixtures/corpus/claude.md",
  readme: "tests/fixtures/corpus/readme.md",
  welcome: "tests/fixtures/corpus/welcome.md",
  todo: "tests/fixtures/corpus/todo.md",
  rewrite: "tests/fixtures/corpus/rewrite.md",
};

const ORACLE_FILES = [...Object.values(CORPUS), "tests/fixtures/torture.md"];

export default function run(check) {
  const {
    modelParse, modelSerialise, modelTouch, modelSpansAtLevel, modelItemPrefix,
    modelInlineText, modelInlineOffset, modelInlineAt, modelInlineSource, modelEscapeText,
    modelEmitLeaf, modelReferenceLabels, sniffMarkdownStyle,
  } = loadSource(
    // markdown-style.js comes first because model.js calls into it: slice 3's
    // step 5 re-wraps an edited block with `wrapMarkdownLine` and reads
    // `hasMathSpan`, rather than carrying a second copy of either. That is a
    // real load-order dependency the three registries will have to honour when
    // model.js joins them at stage 4 — it has to follow markdown-style.js the
    // way undo.js has to follow app.js.
    ["markdown-style.js", "model.js"],
    {},
    "; return { modelParse, modelSerialise, modelTouch, modelSpansAtLevel, modelItemPrefix," +
      " modelInlineText, modelInlineOffset, modelInlineAt, modelInlineSource, modelEscapeText," +
      " modelEmitLeaf, modelReferenceLabels, sniffMarkdownStyle };",
  );

  // The app's own parser configuration, not a bare one: `math` and
  // referenceAwareLink moved out of app.js into markdown-parser.js on
  // 2026-09-14 (slice 2's step 0) precisely so this line can exist. A suite
  // parsing with a bare markdown-it would see no `math` token and no
  // `data-ref-label` stamp, and those are the two things slice 2's re-emission
  // and link steps are about — it would report full marks on constructs the app
  // never hands it.
  const { configureMarkdownParser } = loadSource(
    "markdown-parser.js",
    {},
    "; return { configureMarkdownParser };",
  );

  const md = configureMarkdownParser(markdownit());
  const parse = (src) => modelParse(src, md);

  // Every block an edit can re-serialise, in order. A container re-emits as its
  // children (slice 1b's step 3), so what reaches slice 3's emitter is always a
  // block with none — which makes a leaf the unit both the emitter checks and
  // the metric at the bottom of this file count in.
  const leavesOf = (doc) => {
    const out = [];
    const walk = (b) => (b.children ? b.children.forEach(walk) : out.push(b));
    doc.blocks.forEach(walk);
    return out;
  };

  // The two rules are why the file was moved, so the suite says out loud that it
  // has them. Both read the token stream rather than the model: what is under
  // test here is only that the parser this suite drives is the app's, which is
  // the whole of step 0 and the precondition for steps 3 and 5.
  {
    const mathTokens = md
      .parse("An equation $x = a*b*c$ and a price $5 and $10.", {})
      .filter((t) => t.type === "inline")
      .flatMap((t) => t.children)
      .filter((t) => t.type === "math");
    check(
      "the suite's parser emits a math token, and reads a price as prose" +
        ` (${mathTokens.length} token: ${JSON.stringify(mathTokens[0]?.content ?? null)})`,
      mathTokens.length === 1 && mathTokens[0].content === "x = a*b*c",
    );

    const linkTokens = md
      .parse("A [reference][label] and an [inline](u).\n\n[label]: https://example.com\n", {})
      .filter((t) => t.type === "inline")
      .flatMap((t) => t.children)
      .filter((t) => t.type === "link_open");
    const stamps = linkTokens.map((t) => t.attrGet("data-ref-label"));
    check(
      `the suite's parser stamps a reference link with its label (${JSON.stringify(stamps)})`,
      stamps.length === 2 && stamps[0] === "label" && stamps[1] === null,
    );
  }

  // ---------------------------------------------------------------- D1 itself

  // Every one of these is a file this project maintains by hand, and the whole
  // point of markdown-style.js is that saving one does not rewrite it. Here
  // that is not a restoration pass getting most of it back — it is the model
  // never having thrown the bytes away.
  for (const path of ORACLE_FILES) {
    const src = repoFile(path);
    const out = modelSerialise(parse(src));
    const at = out === src ? -1 : [...src].findIndex((c, i) => c !== out[i]);
    check(
      `${path} round-trips byte-identical` + (at < 0 ? "" : ` (first difference at ${at}: ${JSON.stringify(src.slice(at, at + 40))} vs ${JSON.stringify(out.slice(at, at + 40))})`),
      out === src,
    );
  }

  // The awkward shapes, which are awkward for the same reason in every parser:
  // they are where a line belongs to no block, or to a block that ends in a
  // place the map does not name.
  const edges = {
    "an empty document": "",
    "a document with no trailing newline": "one\n\ntwo",
    "a document that is only blank lines": "\n\n\n",
    "leading blank lines before the first block": "\n\n# Title\n",
    "trailing blank lines after the last block": "# Title\n\n\n\n",
    "windows line endings": "# Title\r\n\r\nA paragraph.\r\n",
    "two blank lines between paragraphs": "one\n\n\ntwo\n",
    "a tight list against a loose one": "- a\n- b\n\n- c\n\n- d\n",
    "an indented code block with a blank line in it": "    one\n\n    two\n\ntext\n",
    "a fence holding what looks like markdown": "```\n# not a heading\n\n- not a list\n```\n",
    "a table": "| a | b |\n| --- | --- |\n| 1 | 2 |\n",
    "a reference definition between paragraphs": "one [x][a]\n\n[a]: http://example.com\n\ntwo\n",
    "a setext heading": "Title\n=====\n\ntext\n",
    "html between blocks": "one\n\n<div>\n  raw\n</div>\n\ntwo\n",
  };
  for (const [label, src] of Object.entries(edges)) {
    check(`${label} round-trips byte-identical`, modelSerialise(parse(src)) === src);
  }

  // --------------------------------------------------- what the blocks are

  const doc = parse("# Title\n\nA paragraph.\n\n- one\n- two\n\nLast.\n");
  check("a document parses to one block per top-level construct", doc.blocks.length === 4);
  check(
    "the kinds are the constructs, in order",
    doc.blocks.map((b) => b.kind).join(",") === "heading,paragraph,list,paragraph",
  );
  check("a heading carries its level", doc.blocks[0].level === 1);
  check("a block's source is its own bytes and no newline", doc.blocks[1].source === "A paragraph.");
  check("the blank line after it is the separator", doc.blocks[1].separator === "\n\n");
  check("the last block's separator is the file's final newline", doc.blocks[3].separator === "\n");

  // The list's map runs into the blank line after it; the block must not keep
  // it, or an edited list would lose or double that line depending on which
  // side of the seam the emitter believed it was on.
  check("a list block ends at its last item", doc.blocks[2].source === "- one\n- two");
  check("the blank line after a list is the separator", doc.blocks[2].separator === "\n\n");

  // ------------------------------------------------- the tiler, one level down

  // Slice 1b's step 1: the span finder takes a level, so the same code that
  // tiles the file tiles a container. Nothing in `modelParse` asks it for more
  // than level 0 yet — step 2 is what makes children blocks — so this section
  // drives the function directly, which is also the only way to see that the
  // spans it hands back at depth are absolute ranges in the file rather than
  // offsets into the container.
  const nested = "# Title\n\n- one\n- two\n  - deep a\n  - deep b\n\n> quoted\n>\n> again\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
  const span = (s) => `${s.open.type}[${s.start},${s.end}]`;
  const childrenOf = (s) => modelSpansAtLevel(s.tokens, s.open.level + 1);

  const top = modelSpansAtLevel(md.parse(nested, {}), 0);
  check(
    "level 0 is the top-level constructs, exactly as before it took a level",
    top.map((s) => span(s)).join(" ") === "heading_open[0,1] bullet_list_open[2,7] blockquote_open[7,10] table_open[11,14]",
  );

  // The line numbers below are the file's, not the list's. That is the whole
  // reason this generalises for free: startOf and endOf keep working on them.
  const items = childrenOf(top[1]);
  check(
    "a list's items are its children one level down, in absolute file lines",
    items.map((s) => span(s)).join(" ") === "list_item_open[2,3] list_item_open[3,7]",
  );
  check(
    "an item holds the ordinary block kinds, so the recursion has somewhere to go",
    childrenOf(items[1]).map((s) => span(s)).join(" ") === "paragraph_open[3,4] bullet_list_open[4,7]",
  );
  check(
    "and a nested list tiles into items the same way, so depth is not a limit",
    childrenOf(childrenOf(items[1])[1]).map((s) => span(s)).join(" ") === "list_item_open[4,5] list_item_open[5,7]",
  );
  check(
    "a quote's children are the block kinds the file itself has",
    childrenOf(top[2]).map((s) => span(s)).join(" ") === "paragraph_open[7,8] paragraph_open[9,10]",
  );

  // The floor the plan measured: thead/tbody, then the row, and no further.
  // `td_open` carries no map at all, so a cell cannot be made a sub-block from
  // the token stream however much one might want it to be.
  const sections = childrenOf(top[3]);
  check(
    "a table tiles into its head and body",
    sections.map((s) => span(s)).join(" ") === "thead_open[11,12] tbody_open[13,14]",
  );
  check(
    "each of those into a row",
    sections.flatMap((s) => childrenOf(s)).map((s) => span(s)).join(" ") === "tr_open[11,12] tr_open[13,14]",
  );
  check(
    "and a row into nothing: a cell is not a sub-block",
    sections.flatMap((s) => childrenOf(s)).every((row) => childrenOf(row).length === 0),
  );

  // Two lines of that fixture are inside a container and inside none of its
  // children: the table's delimiter row (12) and the quote's bare `>` (8).
  // They are why step 2 reuses takeGap inside a container rather than assuming
  // the children cover it — unclaimed lines exist at depth too, and a line
  // nobody claims is a line that does not come back.
  const claimed = new Set();
  const walk = (s) => {
    for (const child of childrenOf(s)) {
      for (let line = child.start; line < child.end; line++) claimed.add(line);
      walk(child);
    }
  };
  for (const s of top) walk(s);
  check("a line inside a container can belong to none of its children", !claimed.has(12) && !claimed.has(8));

  // The invariant step 2 is about to rest on, asserted here on the spans
  // themselves: children are inside the parent and never overlap each other.
  // Without it two siblings could claim the same bytes, and those bytes would
  // be written into the file twice.
  const nests = (s) => {
    let last = s.start;
    for (const child of childrenOf(s)) {
      if (child.start < last || child.end > s.end || child.end < child.start) return false;
      last = child.end;
      if (!nests(child)) return false;
    }
    return true;
  };
  check("children stay inside their parent's span and never overlap, at every depth", top.every(nests));

  // On the file the slice exists for. One bullet list is a third of
  // corpus/todo.md today; what step 1 buys is that the tiler can see inside it
  // at all, which is the thing nothing could do before.
  const todo = md.parse(repoFile(CORPUS.todo), {});
  const biggest = modelSpansAtLevel(todo, 0).reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  check("the largest block in corpus/todo.md is a container", biggest.open.type.endsWith("list_open"));
  check("and it tiles into many children rather than staying one span", childrenOf(biggest).length > 5);

  // ----------------------------------------------- children, and what tiles what

  // Slice 1b's step 2: those spans are blocks now. The invariant is slice 1's
  // one level down — leading plus every child's source and separator is the
  // parent's own source — and it is asserted first, on real files, because
  // every other claim in this section is only interesting if it holds.
  const mistiled = (block, path) => {
    if (!block.children) return [];
    const rebuilt = block.leading + block.children.map((c) => c.source + c.separator).join("");
    const here = rebuilt === block.source ? [] : [`${path} (${block.kind})`];
    return here.concat(block.children.flatMap((c, i) => mistiled(c, `${path}/${i}`)));
  };
  for (const path of ORACLE_FILES) {
    const bad = parse(repoFile(path)).blocks.flatMap((b, i) => mistiled(b, String(i)));
    check(
      `${path}: children tile their parent exactly, at every depth` + (bad.length ? ` (${bad.length} do not: ${bad.slice(0, 3).join(", ")})` : ""),
      bad.length === 0,
    );
  }

  // And that the loop above is not passing by finding nothing: a model with no
  // children anywhere tiles vacuously, which is exactly the state slice 1 was
  // in and exactly what step 2 had to change.
  const todoDoc = parse(repoFile(CORPUS.todo));
  const depthOf = (b) => (b.children ? 1 + Math.max(...b.children.map(depthOf)) : 1);
  const containers = (b) => (b.children ? 1 : 0) + (b.children || []).reduce((n, c) => n + containers(c), 0);
  check(
    "corpus/todo.md tiles into containers rather than staying flat",
    todoDoc.blocks.reduce((n, b) => n + containers(b), 0) > 40,
  );
  check(
    "and nests as deep as the document does (list, item, list, item, paragraph)",
    Math.max(...todoDoc.blocks.map(depthOf)) === 5,
  );

  // The shape of it, on the fixture the section above measured the spans of.
  const tree = parse(nested);
  const shape = (block, indent = "") =>
    [`${indent}${block.kind}`].concat((block.children || []).map((c) => shape(c, indent + " "))).join("\n");
  check(
    "a list tiles into items, and an item into the blocks inside it",
    shape(tree.blocks[1]) === ["list", " item", "  paragraph", " item", "  paragraph", "  list", "   item", "    paragraph", "   item", "    paragraph"].join("\n"),
  );
  check(
    "a quote tiles into the blocks inside it",
    shape(tree.blocks[2]) === ["quote", " paragraph", " gap", " paragraph"].join("\n"),
  );
  check(
    "a table tiles into head, body and rows, and stops at the row",
    shape(tree.blocks[3]) === ["table", " table-head", "  row", " gap", " table-body", "  row"].join("\n"),
  );

  // The two lines the tiler section found unclaimed are blocks in their own
  // position now, by the same mechanism a reference definition is: a table's
  // delimiter row between head and body, and a blockquote's bare `>` between
  // its paragraphs. Neither is content anyone edits; both are bytes that have
  // to come back.
  check("a table's delimiter row is a gap child between head and body", tree.blocks[3].children[1].source === "| --- | --- |");
  check("a blockquote's bare `>` is a gap child in its place", tree.blocks[2].children[1].source === ">");

  // A child's source is its lines, whole — so it carries its own container's
  // marker. That is what byte-exactness wants, since nothing else claims those
  // characters; step 5 is what records the marker as data for the emitter.
  check("an item's source includes its own marker", tree.blocks[1].children[0].source === "- one");
  check("and so does the paragraph inside it", tree.blocks[1].children[0].children[0].source === "- one");
  check("a paragraph inside a quote carries the `> `", tree.blocks[2].children[0].source === "> quoted");

  // Tight versus loose, which markdownSegments carries today for the same
  // reason: the blank line between two items is the first item's separator, so
  // a list comes back the way the author wrote it whichever it is.
  const loose = parse("- a\n\n- b\n");
  check("a loose list's blank line is the first item's separator", loose.blocks[0].children[0].separator === "\n\n");
  check("a tight list's is a single newline", parse("- a\n- b\n").blocks[0].children[0].separator === "\n");

  // Leaves say so with null rather than with an empty array: "has children" is
  // the test step 3 serialises on, and an empty array would answer yes.
  const leafy = parse("Text.\n\n# Head\n\n```\ncode\n```\n\n---\n");
  check("a paragraph, a heading, a fence and a rule are leaves", leafy.blocks.every((b) => b.children === null));
  check("an empty list item is a leaf holding its marker", parse("- \n").blocks[0].children[0].source === "- ");
  check("an empty blockquote is a leaf too", parse(">\n").blocks[0].children === null);

  // A reference definition inside a list item, which today would be collected
  // at the end of the file by appendReferenceDefinitions regardless of where
  // the author put it. Here it is a gap child of the item it was written in.
  const inItem = parse("1. a\n\n   [x]: http://e.example\n2. b\n");
  check(
    "a reference definition inside an item stays inside that item",
    shape(inItem.blocks[0]) === ["list", " item", "  paragraph", "  gap", " item", "  paragraph"].join("\n"),
  );
  check("with its exact bytes and its indent", inItem.blocks[0].children[0].children[1].source === "   [x]: http://e.example");

  // Extends the top-level check further down: a kind the model does not know is
  // a construct nothing below can render or emit, and it should be found by the
  // suite rather than by a document.
  const everyKind = (block) => [block.kind].concat((block.children || []).flatMap(everyKind));
  const kinds = new Set(parse(repoFile(CORPUS.claude)).blocks.flatMap(everyKind));
  check(`corpus/claude.md holds no unknown kind at any depth (${[...kinds].sort().join(",")})`, !kinds.has("unknown"));

  // ------------------------------------------------- reference definitions

  // markdown-it consumes the definition line and emits no token, which is why
  // today it has no DOM node to survive on and appendReferenceDefinitions has
  // to collect every definition at the end of the file. In the model it is an
  // ordinary block that happens to render to nothing, in the place the author
  // put it.
  const refs = parse("Text [one][a] and [two][b].\n\n[a]: http://a.example\n[b]: http://b.example\n\nMore.\n");
  check("a reference definition becomes a block of its own", refs.blocks.some((b) => b.kind === "gap"));
  check(
    "it keeps its position rather than being collected at the end",
    refs.blocks.map((b) => b.kind).join(",") === "paragraph,gap,paragraph",
  );
  check(
    "it keeps its exact bytes, both lines of it",
    refs.blocks[1].source === "[a]: http://a.example\n[b]: http://b.example",
  );

  // A definition spanning two lines is invisible to scanReferenceDefinitions
  // today, so the link that used it saves as a plain inline link. Here it is
  // just a taller gap, and nothing about it is special.
  const wrapped = parse("Text [one][a].\n\n[a]: http://a.example\n    \"A title\"\n");
  check(
    "a definition wrapped onto a second line is one gap block",
    wrapped.blocks.filter((b) => b.kind === "gap").length === 1,
  );
  check("and round-trips whole", modelSerialise(wrapped) === "Text [one][a].\n\n[a]: http://a.example\n    \"A title\"\n");

  // ------------------------------------------------------- editing a block

  const src = repoFile(CORPUS.claude);
  const claude = parse(src);

  // Without this the round trip above could pass by doing nothing at all: a
  // parse that found no blocks would leave the whole file in `prefix` and
  // hand it back unchanged, which is byte-identical and worthless.
  check("corpus/claude.md parses to blocks rather than one undigested lump", claude.blocks.length > 100);
  check("with nothing left over in the prefix", claude.prefix === "");
  check("and every block is a kind the model knows", claude.blocks.every((b) => b.kind !== "unknown"));
  check("every block arrives carrying its source", claude.blocks.every((b) => typeof b.source === "string"));

  // The property the whole stage is for: one edited paragraph re-serialises,
  // and every other byte in the file is the byte that was read.
  const target = claude.blocks.findIndex((b) => b.kind === "paragraph");
  const before = claude.blocks[target].source;
  check(
    "the paragraph under test appears once, so the check below is unambiguous",
    src.indexOf(before) === src.lastIndexOf(before),
  );

  modelTouch(claude.blocks[target]);
  const out = modelSerialise(claude, () => "ZZZREPLACED");
  const at = src.indexOf(before);
  check(
    "editing one paragraph rewrites exactly that paragraph",
    out === src.slice(0, at) + "ZZZREPLACED" + src.slice(at + before.length),
  );

  // An edited block with nowhere to go must not quietly write something else
  // into the user's file.
  const orphan = parse("A paragraph.\n");
  modelTouch(orphan.blocks[0]);
  let threw = false;
  try {
    modelSerialise(orphan);
  } catch {
    threw = true;
  }
  check("an edited block with no serialiser throws rather than guessing", threw);

  // ---------------------------------------------- editing one thing in a list

  // Slice 1b's step 3, and the payoff of the whole slice: an edited block
  // inside a container re-emits, its siblings are handed back, and nothing
  // above it is re-serialised either.
  //
  // The chain walk is the test's own, for finding a block and naming its depth.
  // Clearing the ancestors is `modelTouch`'s job since step 4, which is what the
  // single touch below relies on.
  const chainTo = (blocks, want) => {
    for (const block of blocks) {
      if (want(block)) return [block];
      const below = block.children ? chainTo(block.children, want) : null;
      if (below) return [block, ...below];
    }
    return null;
  };

  const todoSrc = repoFile(CORPUS.todo);
  // The first bullet in the file, found by its own marker: corpus/todo.md writes
  // them `*   `, which is a convention sniffMarkdownStyle reads off the file and
  // slice 3's emitter will have to put back.
  const inList = (blocks) =>
    chainTo(blocks, (b) =>
      b.kind === "paragraph" &&
      b.source.startsWith("*   ") &&
      b.source.length > 40 &&
      todoSrc.indexOf(b.source) === todoSrc.lastIndexOf(b.source));

  // An item is never the block that emits: it has a paragraph in it, so the
  // item re-emits as that paragraph and the paragraph is what the serialiser
  // is asked for. The bytes it owns start at the marker, which is what step 5
  // hands the emitter as data.
  const edited = parse(todoSrc);
  const chain = inList(edited.blocks);
  check(
    "a bullet unique in corpus/todo.md is what the check below edits",
    chain !== null && chain.map((b) => b.kind).join("/") === "list/item/paragraph",
  );

  const item = chain[chain.length - 1];
  const itemSource = item.source;   // read before touching: that is what clears it
  modelTouch(item);                 // one call, at the leaf: step 4 walks up
  let asked = 0;
  const listOut = modelSerialise(edited, (block) => {
    asked += 1;
    return block === item ? "*   ZZZITEM" : "WRONG BLOCK";
  });
  const itemAt = todoSrc.indexOf(itemSource);
  check(
    `editing one bullet rewrites exactly that bullet, and nothing else in ${todoSrc.split("\n").length} lines`,
    listOut === todoSrc.slice(0, itemAt) + "*   ZZZITEM" + todoSrc.slice(itemAt + itemSource.length),
  );
  // The list this bullet is in is the largest block in corpus/todo.md. Before slice 1b it
  // was one block, so the same edit re-serialised a third of the file.
  check("and the serialiser is asked for that block and nothing else", asked === 1);

  // Step 4, and the reason the single touch above is enough. A container still
  // holding its own `source` is emitted from those bytes and never consulted
  // about its children, so an edited item under an untouched list would re-emit
  // into nothing: the edit lost, the document right on screen, the old bullet in
  // the file. This check and the two after it are that failure's cover.
  check("touching a child clears every container above it", chain.every((b) => b.source === null));
  check(
    "and clears nothing beside it — a sibling item keeps its own bytes",
    typeof chain[0].children.find((b) => b !== chain[1]).source === "string",
  );
  check(
    "a top-level block has no parent to walk to",
    edited.blocks.every((b) => b.parent === null),
  );

  // Every link, on a real file, in the direction that matters: a block's parent
  // is the container whose `children` it is in. A link to the wrong block is a
  // touch that clears the wrong bytes, which is the one failure here that writes
  // into the file.
  const misparented = (block) =>
    (block.children || []).flatMap((child) => (child.parent === block ? misparented(child) : [child.kind]));
  check(
    "every child's parent is the container holding it, throughout corpus/todo.md",
    parse(todoSrc).blocks.flatMap(misparented).length === 0,
  );

  // The cost of those links, named rather than discovered later: the model is
  // cyclic now. Nothing has needed to serialise it as JSON, and the alternative
  // was searching the tree for a parent on every keystroke.
  let cyclic = false;
  try {
    JSON.stringify(parse("- a\n- b\n"));
  } catch {
    cyclic = true;
  }
  check("the model is cyclic and no longer JSON.stringify-able", cyclic);

  // The deepest thing in the file, which is where a missing link or a walk that
  // stopped early would show first: a bullet nested in a bullet, five blocks
  // down. One touch, one emitter call, and the other 700-odd lines are the bytes
  // that were read.
  const deep = parse(todoSrc);
  let deepest = null;
  let deepestAt = 0;
  const findDeepest = (block, depth) => {
    if (block.children) return block.children.forEach((c) => findDeepest(c, depth + 1));
    if (depth > deepestAt) {
      deepestAt = depth;
      deepest = block;
    }
  };
  deep.blocks.forEach((b) => findDeepest(b, 1));
  const deepSource = deepest.source;
  check(
    "the deepest leaf in corpus/todo.md is five blocks down and unique in the file",
    deepestAt === 5 && todoSrc.indexOf(deepSource) === todoSrc.lastIndexOf(deepSource),
  );
  modelTouch(deepest);
  let deepAsked = 0;
  const deepOut = modelSerialise(deep, () => {
    deepAsked += 1;
    return "ZZZDEEP";
  });
  const deepAt = todoSrc.indexOf(deepSource);
  check(
    "one touch five deep rewrites exactly that block",
    deepAsked === 1 && deepOut === todoSrc.slice(0, deepAt) + "ZZZDEEP" + todoSrc.slice(deepAt + deepSource.length),
  );

  // Case 2 needs no emitter at all: a container that is edited but whose
  // children are not is a concatenation of bytes that already exist. Only a
  // leaf can reach stage 1's slice 3, which is the only part of this that has
  // to invent markdown.
  const container = parse("- a\n- b\n");
  modelTouch(container.blocks[0]);
  check("an edited container with untouched children needs no serialiser", modelSerialise(container) === "- a\n- b\n");

  let leafThrew = false;
  try {
    const leaf = parse("- a\n- b\n");
    modelTouch(chainTo(leaf.blocks, (b) => b.kind === "paragraph").pop());
    modelSerialise(leaf);
  } catch {
    leafThrew = true;
  }
  check("an edited leaf inside a container still throws rather than guessing", leafThrew);

  // `leading` is emitted because the invariant includes it, not because any
  // document makes one: a container's first child starts on the container's own
  // first line. Measured rather than assumed, since an emitter that dropped it
  // would be correct on every file here and wrong on the first one that was not.
  const leadings = [];
  const collectLeading = (b) => {
    if (!b.children) return;
    leadings.push(b.leading);
    b.children.forEach(collectLeading);
  };
  for (const path of ORACLE_FILES) {
    parse(repoFile(path)).blocks.forEach(collectLeading);
  }
  check(
    `every container in the oracle files has empty leading text (${leadings.length} of them)`,
    leadings.length > 300 && leadings.every((text) => text === ""),
  );

  // ------------------------------------------- the marker, as data for slice 3

  // Slice 1b's step 5. None of the round trips above need this — an item's
  // source is its lines whole and already carries its marker — so what it is for
  // is slice 3's emitter, which has to write the marker and the continuation
  // indent back when the item is edited. Recorded at parse rather than re-read
  // at emit time, so there is one place that can be wrong instead of two.
  //
  // The pure function first, which is where the rules are: a pad is whatever the
  // author wrote, and a tab in the indent stays a tab instead of being counted
  // as one column.
  const prefixes = {
    "- one": ["- ", "  "],
    "  - deep": ["  - ", "    "],
    "*   padded": ["*   ", "    "],
    "1.  ordered": ["1.  ", "    "],
    "10) other delimiter": ["10) ", "    "],
    "\t- tab indented": ["\t- ", "\t  "],
    "- ": ["- ", "  "],
  };
  for (const [line, [marker, indent]] of Object.entries(prefixes)) {
    const got = modelItemPrefix(line);
    check(
      `${JSON.stringify(line)} has marker ${JSON.stringify(marker)} and indent ${JSON.stringify(indent)}`,
      got !== null && got.marker === marker && got.contentIndent === indent,
    );
  }
  check("a line that is not an item has no prefix at all", modelItemPrefix("ordinary text") === null);

  // On the blocks, and only on items: a paragraph's marker would be a marker
  // nobody wrote.
  const marked = parse("*   one\n*   two\n    - deep\n");
  check("an item carries its own marker", marked.blocks[0].children[0].marker === "*   ");
  check("and the indent its continuation lines use", marked.blocks[0].children[0].contentIndent === "    ");
  check(
    "a nested item carries the whole prefix, its parent's indent included",
    chainTo(marked.blocks, (b) => b.kind === "item" && b.source.trimStart().startsWith("- ")).pop().marker === "    - ",
  );
  check("nothing that is not an item has one", marked.blocks[0].marker === null && marked.blocks[0].children[0].children[0].marker === null);

  // ---- Slice 3, step 1: the blockquote chain, recorded per line ----------
  //
  // The hand-written cases first, because each is a shape the fixture has and
  // the oracle sweep below would only report in aggregate.
  {
    const quotes = parse("> one\n> two\n\n>>> deep\n\n  > indented\n\n> lazy\ncontinuation\n");
    const leafOf = (block) => (block.children ? leafOf(block.children[0]) : block);

    check(
      "a quoted paragraph records the chain on each of its own lines",
      JSON.stringify(leafOf(quotes.blocks[0]).quotePrefixes) === JSON.stringify(["> ", "> "]),
    );
    check(
      "and nests, so a leaf three quotes down records all three levels",
      leafOf(quotes.blocks[1]).quotePrefixes.join("|") === ">>> ",
    );
    check(
      "an indented chain is recorded as written rather than normalised",
      leafOf(quotes.blocks[2]).quotePrefixes[0] === "  > ",
    );
    // The case that decided the unit. A lazy continuation carries no `>` at
    // all, so one prefix for the whole block would put one there.
    check(
      "a lazy continuation records the empty chain it actually has",
      JSON.stringify(leafOf(quotes.blocks[3]).quotePrefixes) === JSON.stringify(["> ", ""]),
    );
    check(
      "a block outside a quote records nothing rather than an array of empties",
      parse("plain\n").blocks[0].quotePrefixes === null,
    );
    // A quote is a container and re-emits from its children, so it needs no
    // chain of its own — what it records is its *parents'*, which at the top
    // is nothing. The child is what carries the level.
    check(
      "a top-level quote records no chain itself; its child carries the level",
      quotes.blocks[0].quotePrefixes === null && quotes.blocks[0].children[0].quotePrefixes !== null,
    );
  }

  // Then the oracle, where the property is the one that says the split is the
  // parser's and not this file's: **strip the recorded chain off a quoted
  // block's source lines and what is left is exactly what markdown-it recorded
  // as its content.** Whatever bytes this claims as prefix, the rest of the
  // line is the remainder, so byte-exactness cannot fail here — what can is the
  // split landing in the wrong place, and only `inline.content` can say.
  {
    const quotedLeaves = [];
    const walk = (block, inQuote) => {
      if (block.children) return block.children.forEach((c) => walk(c, inQuote || block.kind === "quote"));
      if (inQuote) quotedLeaves.push(block);
    };
    for (const path of ORACLE_FILES) parse(repoFile(path)).blocks.forEach((b) => walk(b, false));

    check(
      `every line of a quoted block starts with the chain recorded for it (${quotedLeaves.length} leaves)`,
      quotedLeaves.length > 0 &&
        quotedLeaves.every((b) =>
          b.source.split("\n").every((line, i) => line.startsWith(b.quotePrefixes[i]))),
    );
    check(
      "and a recorded chain is only ever indent and `>`",
      quotedLeaves.every((b) => b.quotePrefixes.every((p) => /^(?: {0,3}>[ \t]?)*$/.test(p))),
    );
    // Restricted to a *paragraph* sitting directly in the quote, and both halves
    // of that are load-bearing. With an item in between, markdown-it has taken
    // the item's marker off the content as well, which is 1b's step 5; and a
    // heading carries its own `### `, which comes off too — the fixture's
    // `> ### A heading inside a quote` has the content `A heading inside a
    // quote`, and it failed this check when it was written wider. That is not a
    // chain that was recorded wrongly, it is the next marker down, and step 2
    // is what records it. A paragraph is the one leaf with nothing of its own
    // in front of the text, so it is the one that isolates the chain.
    const direct = quotedLeaves.filter((b) => b.kind === "paragraph" && b.parent && b.parent.kind === "quote");
    check(
      `stripping it gives back exactly what markdown-it called the content (${direct.length} paragraphs)`,
      direct.length > 0 &&
        direct.every((b) =>
          b.source
            .split("\n")
            .map((line, i) => line.slice(b.quotePrefixes[i].length))
            .join("\n") === b.inline.content),
    );
  }

  // ---- Slice 3, step 2: the heading's shape -----------------------------
  //
  // A heading's `level` says nothing about how it was written, so the spelling
  // is recorded. This is the one affix in the model that is a **suffix** — a
  // closing hash run and a setext underline both sit behind the content — which
  // is why the ten blocks in the oracle whose source is not a per-line prefix
  // plus their inline source are all headings.
  {
    const shapeOf = (src) => {
      const doc = parse(src);
      const find = (b) => (b.kind === "heading" ? b : (b.children || []).map(find).find(Boolean));
      return doc.blocks.map(find).find(Boolean);
    };
    const sh = (src) => shapeOf(src).headingShape;

    check("a plain ATX heading records its opening run", sh("### Title\n").open === "### ");
    check("and nothing to close it", sh("### Title\n").close === "" && sh("### Title\n").underline === null);
    check(
      "a closing hash run is recorded whole, with the space in front of it",
      sh("#### Title ####\n").close === " ####",
    );
    // `### x ###` and `### x #` differ only in bytes the renderer throws away,
    // which is the kind of difference this exists to keep.
    check("a closing run of a different length is a different spelling", sh("### Title #\n").close === " #");
    check(
      "a setext heading records its underline as written, not normalised",
      sh("Title\n====\n").underline === "====" && sh("Title\n----------\n").underline === "----------",
    );
    check("a setext heading has no opening run", sh("Title\n====\n").open === "");
    check(
      "a heading inside a quote records the hashes, not the chain in front of them",
      sh("> ### Quoted\n").open === "### ",
    );
    check("an empty ATX heading is a shape rather than a null", sh("###\n").open === "###");
  }

  // The oracle, and the property is byte-level: **the recorded shape puts the
  // heading back together.** Byte-exactness cannot fail for an untouched
  // heading, which re-emits from `source`; what this asserts is that step 3 has
  // everything it needs to write one that was edited, which is the only reason
  // any of this is recorded.
  {
    const headings = [];
    const walk = (b) => (b.children ? b.children.forEach(walk) : b.kind === "heading" && headings.push(b));
    for (const path of ORACLE_FILES) parse(repoFile(path)).blocks.forEach(walk);

    check(
      `every heading in the oracle has a recorded shape (${headings.length} of them)`,
      headings.length > 50 && headings.every((b) => b.headingShape !== null),
    );

    const rebuild = (b) => {
      const at = (i) => (b.quotePrefixes ? b.quotePrefixes[i] : "");
      const { open, close, underline } = b.headingShape;
      if (underline === null) return at(0) + open + b.inline.content + close;
      const body = (open + b.inline.content).split("\n");
      return body.map((line, i) => at(i) + line).join("\n") + "\n" + at(body.length) + underline;
    };
    const rebuilt = headings.filter((b) => rebuild(b) === b.source);
    check(
      `and it reassembles the heading's own bytes, chain included (${rebuilt.length}/${headings.length})`,
      rebuilt.length === headings.length,
    );

    const setext = headings.filter((b) => b.headingShape.underline !== null);
    const closed = headings.filter((b) => b.headingShape.close !== "");
    check(
      `the oracle holds all three spellings, so none of this is untested (${setext.length} setext, ${closed.length} with a closing run)`,
      setext.length > 0 && closed.length > 0 && headings.length > setext.length + closed.length,
    );
  }

  // Every item in the five files, cross-checked against the parser rather than
  // against itself: markdown-it reports the marker character on the token
  // (`markup`, plus `info` for an ordered item's number), so a regex that had
  // drifted from what the parser saw would show up here rather than in a file.
  const itemsSeen = [];
  const collectItems = (block) => {
    if (block.kind === "item") itemsSeen.push(block);
    (block.children || []).forEach(collectItems);
  };
  for (const path of ORACLE_FILES) {
    parse(repoFile(path)).blocks.forEach(collectItems);
  }
  // Thresholds and not exact counts, deliberately: a count here turns an edit to
  // an oracle file into a failing test about list items, which it did once, on
  // the REWRITE.md entry describing this very check. Since 2026-09-16 the oracle
  // is a fixture and the counts live in the labels — both halves of the same fix.
  //
  // An item inside a blockquote has `> ` in front of its own marker, because a
  // child's source is its lines whole, so `modelItemPrefix` read the start of a
  // line that began with the chain and found nothing. It returned null rather
  // than inventing a marker, and that was **pinned rather than fixed** through
  // 1b, the way step 3's hazard was pinned for step 4: it was the case for
  // recording the quote prefix at parse rather than stripping it at emit time,
  // since emit cannot reach a marker parse never found.
  //
  // Slice 3's step 1 is that recording, and this is where it shows: the split
  // below is gone, and an item behind a `> ` is an ordinary item. None of the
  // five hand-maintained files can see any of this — they contain no blockquote
  // at all, and it took the fixture.
  const quoted = (b) => (b.parent ? b.parent.kind === "quote" || quoted(b.parent) : false);
  const plainItems = itemsSeen.filter((b) => !quoted(b));
  const quotedItems = itemsSeen.filter(quoted);
  check(
    `every item outside a blockquote has a marker (${plainItems.length} of them)`,
    plainItems.length > 200 && plainItems.every((b) => typeof b.marker === "string"),
  );
  check(
    `and since step 1 claimed the chain, so does every item inside one (${quotedItems.length} of them)`,
    quotedItems.length > 0 && quotedItems.every((b) => typeof b.marker === "string"),
  );
  check(
    "an item behind a `> ` records the marker the author wrote, not the chain in front of it",
    quotedItems.every((b) => {
      const open = b.tokens[0];
      const written = open.info ? open.info + open.markup : open.markup;
      return b.marker.trim() === written && !b.marker.includes(">");
    }),
  );
  check(
    "and the marker matches what markdown-it says the item's markup was",
    plainItems.every((b) => {
      const open = b.tokens[0];
      const written = open.info ? open.info + open.markup : open.markup;
      return b.marker.trim() === written;
    }),
  );

  // The claim `contentIndent` rests on, measured rather than assumed: where an
  // item has a continuation line, the indent recorded from its marker is the
  // indent that line actually carries. A file that disagreed — a tab, a lazy
  // continuation — would be a file slice 3 re-wraps differently from the way it
  // was written, and this is where that shows.
  const continued = plainItems
    .map((b) => [b, b.source.split("\n").slice(1).find((line) => line.trim() !== "")])
    .filter(([, line]) => line !== undefined);
  const indentOf = ([, line]) => /^[ \t]*/.exec(line)[0];
  check(
    `every continued item carries the indent its own lines use (${continued.length} of them)`,
    continued.length > 150 && continued.every((c) => indentOf(c) === c[0].contentIndent),
  );
  // That check read `> 150 && every(...)` before 2026-09-13 too, and passed —
  // because not one of the five hand-maintained files indents a list with a tab.
  // `tests/fixtures/torture.md` does, and it failed: the marker `"-\t"` derived
  // the indent `" \t"` where the file continues under a bare `"\t"`. Same column,
  // different bytes. `modelItemPrefix` now reads the written indent instead of
  // reconstructing it, and believes it only when the two land on the same column
  // — so the case below is the one that used to be wrong and the two after it
  // are the ones that must not become wrong in the fixing.
  const tabItems = continued.filter(([b]) => b.marker.includes("\t"));
  check(
    `including the tab-marked ones, which derived a different spelling before (${tabItems.length} of them)`,
    tabItems.length > 0 && tabItems.every((c) => c[0].contentIndent.includes("\t")),
  );
  check(
    "a lazy continuation is not believed — the marker's own column stands",
    modelItemPrefix("- item", "lazily continued").contentIndent === "  " &&
      modelItemPrefix("-\titem", "lazily continued").contentIndent === " \t",
  );
  check(
    "nor is a continuation indented past the marker's column",
    modelItemPrefix("- item", "      pushed further in").contentIndent === "  ",
  );
  check(
    "an item with no continuation line still derives one",
    modelItemPrefix("*   item").contentIndent === "    " &&
      modelItemPrefix("10) item", "").contentIndent === "    ",
  );
  check(
    "and a tab-indented marker is believed only where the columns agree (tab stops are four)",
    modelItemPrefix("-\titem", "\tcontinued").contentIndent === "\t" &&
      modelItemPrefix("-\titem", "    continued").contentIndent === "    ",
  );

  // ------------------------------------------------ the inline tree (slice 2)

  // Slice 2's step 1. markdown-it hands inline content over flat, with
  // `nesting` on each token; the model folds it back into the tree the markup
  // describes. What is under test here is the fold and what it keeps — the
  // offsets into it are step 2, re-emission is step 3, and neither exists yet.
  const inlinesOf = (src) => parse(src).blocks[0].inlines;
  const kindsOf = (nodes) => (nodes || []).map((n) => n.kind);
  const flatten = (nodes, out = []) => {
    for (const node of nodes || []) {
      out.push(node);
      if (node.children) flatten(node.children, out);
    }
    return out;
  };
  const treeDepth = (nodes, depth = 1) =>
    (nodes || []).reduce(
      (max, node) => Math.max(max, node.children ? treeDepth(node.children, depth + 1) : depth),
      0,
    );

  {
    const plain = inlinesOf("just words");
    check(
      "a paragraph with no markup in it is one text node",
      plain.length === 1 && plain[0].kind === "text" &&
        plain[0].content === "just words" && plain[0].children === null,
    );

    // The fold itself: six tokens in a row become a mark holding a link.
    const nested = inlinesOf("**a [b](c) d**");
    check(
      `a mark holds what it marks (${JSON.stringify(kindsOf(nested))} → ` +
        `${JSON.stringify(kindsOf(nested[0].children))})`,
      nested.length === 1 && nested[0].kind === "strong" &&
        kindsOf(nested[0].children).join(",") === "text,link,text" &&
        kindsOf(nested[0].children[1].children).join(",") === "text" &&
        nested[0].children[1].children[0].content === "b",
    );

    // Per-node, where sniffMarkdownStyle can only guess once for a document.
    check(
      "emphasis keeps the delimiter the author wrote",
      inlinesOf("*a*")[0].markup === "*" && inlinesOf("_a_")[0].markup === "_" &&
        inlinesOf("**a**")[0].markup === "**" && inlinesOf("__a__")[0].markup === "__",
    );

    // The fold's one omission, and the reason `**a**` above is one node rather
    // than three: markdown-it puts a zero-length text token on each side of a
    // mark it converted. They hold no bytes, and a position inside one cannot
    // be told from a position beside it.
    check(
      `an empty text token is the parser's bookkeeping, not a node` +
        ` (${JSON.stringify(kindsOf(inlinesOf("**a**")))})`,
      kindsOf(inlinesOf("**a**")).join(",") === "strong" &&
        md.parse("**a**", {})[1].children.filter((t) => t.type === "text").length === 3,
    );
    check(
      "strikethrough is a mark like any other",
      inlinesOf("~~a~~")[0].kind === "strike" && inlinesOf("~~a~~")[0].markup === "~~",
    );

    const span = inlinesOf("`a`")[0];
    const padded = inlinesOf("`` ` ``")[0];
    check(
      "a code span keeps its backtick run and is a leaf",
      span.kind === "code-span" && span.markup === "`" && span.content === "a" &&
        span.children === null && padded.markup === "``" && padded.content === "`",
    );

    // One atom, not its alt text: the alt is parsed by markdown-it into the
    // token's own children, and those are deliberately not folded in.
    const image = inlinesOf("![alt *em*](i.png)");
    check(
      "an image is one node rather than its alt text",
      image.length === 1 && image[0].kind === "image" &&
        image[0].children === null && image[0].content === "alt *em*" &&
        image[0].token.attrGet("src") === "i.png" &&
        image[0].token.children.length > 1,
    );

    // The two constructs only the app's own parser produces, which is what
    // step 0 was for: a bare markdown-it gives neither.
    const math = inlinesOf("An eq $x = a*b*c$ end");
    check(
      `maths survives as one leaf with its delimiter (${JSON.stringify(kindsOf(math))})`,
      kindsOf(math).join(",") === "text,math,text" && math[1].markup === "$" &&
        math[1].content === "x = a*b*c",
    );
    const ref = parse("A [ref][label] link.\n\n[label]: https://e.com\n").blocks[0].inlines;
    check(
      "a link keeps the stamp and href the tree itself does not name",
      ref[1].kind === "link" && ref[1].token.attrGet("data-ref-label") === "label" &&
        ref[1].token.attrGet("href") === "https://e.com" &&
        kindsOf(ref[1].children).join(",") === "text",
    );

    // Both spellings of a break arrive as the same token — which is step 3's
    // problem, and is pinned here so the shape it has to solve is on record.
    check(
      "both hard-break spellings fold to a hardbreak leaf",
      kindsOf(inlinesOf("a  \nb")).join(",") === "text,hardbreak,text" &&
        kindsOf(inlinesOf("a\\\nb")).join(",") === "text,hardbreak,text",
    );
    check(
      "a wrapped line is a softbreak where the author broke it",
      kindsOf(inlinesOf("one\ntwo")).join(",") === "text,softbreak,text",
    );

    // A tree hangs off the block that owns the text, at whatever depth that
    // block sits at — so a list has none and the paragraph inside its item does.
    const list = parse("- a *b*\n").blocks[0];
    const itemParagraph = list.children[0].children[0];
    check(
      "a container has no tree of its own and its blocks do",
      list.inlines === null && list.children[0].inlines === null &&
        kindsOf(itemParagraph.inlines).join(",") === "text,em",
    );
    check(
      "and a block with no inline content has none either",
      parse("```\ncode\n```\n").blocks[0].inlines === null &&
        parse("---\n").blocks[0].inlines === null,
    );
  }

  // The oracle, and the invariant that matters at this step: the fold moves
  // every token into the tree exactly once, in order. A fold that dropped a
  // token would lose the author's text; one that duplicated it would write the
  // text twice when step 3 emits from the tree.
  {
    let blocksFolded = 0;
    let nodes = 0;
    let dropped = 0;
    let depth = 0;
    const kinds = new Map();
    const markups = new Map();
    const wrong = [];

    for (const path of ORACLE_FILES) {
      const walk = (blocks) => {
        for (const block of blocks) {
          if (block.inline) {
            blocksFolded += 1;
            depth = Math.max(depth, treeDepth(block.inlines));
            const flat = flatten(block.inlines);
            nodes += flat.length;
            for (const node of flat) {
              kinds.set(node.kind, (kinds.get(node.kind) || 0) + 1);
              if (node.kind !== "text") {
                const key = `${node.kind} ${JSON.stringify(node.markup)}`;
                markups.set(key, (markups.get(key) || 0) + 1);
              }
            }
            const carried = new Set(flat.map((node) => node.token));
            const opened = block.inline.children.filter((t) => t.nesting !== -1);
            const same = flat.length === opened.filter((t) => carried.has(t)).length &&
              flat.every((node, i) => node.token === opened.filter((t) => carried.has(t))[i]);
            // Every token left out has to be an empty text token — the fold's
            // one omission — or the tree is missing something the author wrote.
            const droppedHere = opened.filter((t) => !carried.has(t));
            dropped += droppedHere.length;
            if (!same || droppedHere.some((t) => t.type !== "text" || t.content !== "")) {
              wrong.push(`${path}: ${JSON.stringify(block.inline.content.slice(0, 30))}`);
            }
          }
          if (block.children) walk(block.children);
        }
      };
      walk(parse(repoFile(path)).blocks);
    }

    check(
      `every inline token carrying anything is in the tree exactly once, in order` +
        ` (${blocksFolded} blocks, ${nodes} nodes, ${dropped} empty text tokens left out)` +
        (wrong.length ? ` — ${wrong.length} disagreed: ${wrong.slice(0, 3).join(", ")}` : ""),
      wrong.length === 0 && blocksFolded > 800 && nodes > 10000 && dropped > 0,
    );
    // Levels of nodes, leaves included, so a mark holding a link holding text
    // is 3. REWRITE.md's measured "deepest inline nesting: 2" counts only the
    // nodes that hold others, which is the same shape read one way rather than
    // the other — said here because two numbers for one fact invite a bug
    // report about whichever one is met second.
    check(
      `the tree nests as deep as these files do (${depth} levels of nodes, leaves included)`,
      depth >= 3,
    );

    // Nothing in the oracle should land in the fallback bucket: an "unknown"
    // here is a construct the app parses and this file has never been told
    // about, which step 3 would then have to emit blind.
    const named = [...kinds].sort((a, b) => b[1] - a[1]);
    check(
      `every kind in the oracle is named (${named.map(([k, n]) => `${k} ${n}`).join(", ")})`,
      !kinds.has("unknown") &&
        ["text", "softbreak", "code-span", "strong", "em", "link", "image", "math",
          "hardbreak", "strike"].every((k) => (kinds.get(k) || 0) > 0),
    );

    // The claim the delimiter-on-the-node design rests on: these files spell
    // the same mark both ways, and the tree tells them apart rather than
    // handing step 3 one document-wide guess.
    const seen = (key) => markups.get(key) || 0;
    check(
      `both spellings of every mark occur and are distinguished` +
        ` (em ${seen('em "*"')}/${seen('em "_"')},` +
        ` strong ${seen('strong "**"')}/${seen('strong "__"')},` +
        ` code ${seen('code-span "`"')}/${seen('code-span "``"')})`,
      seen('em "*"') > 0 && seen('em "_"') > 0 &&
        seen('strong "**"') > 0 && seen('strong "__"') > 0 &&
        seen('code-span "`"') > 0 && seen('code-span "``"') > 0,
    );
    // markdown-it marks an autolink on the token that opens it, which is the
    // one spelling a link carries in `markup` at all — the rest of a link's
    // shape is on `attrs`, and rebuilding from those is step 5.
    check(
      `an autolink is distinguishable from a written-out link (${seen('link "autolink"')})`,
      seen('link "autolink"') > 0 && seen('link ""') > 0,
    );
  }

  // --------------------------------------------- the text coordinate (slice 2)

  // Slice 2's step 2: the space a model position's offset counts in, and the
  // two functions that map into and out of it. Done here rather than in stage 2
  // because with no renderer in the way it is testable with no DOM, which is
  // the whole reason stage 1 comes first.
  const textOf = (src) => modelInlineText(parse(src).blocks[0].inlines);

  {
    check("a paragraph with no markup is its own text", textOf("plain words") === "plain words");
    check(
      `a mark's delimiters are zero-width (${JSON.stringify(textOf("**a**b"))})`,
      textOf("**a**b") === "ab" && textOf("_x_") === "x" && textOf("~~y~~") === "y",
    );
    check(
      `a code span's content counts and its backticks do not (${JSON.stringify(textOf("`a b`"))})`,
      textOf("`a b`") === "a b" && textOf("`` ` ``") === "`",
    );
    check(
      "a soft break is one character, and it is a newline",
      textOf("one\ntwo") === "one\ntwo",
    );
    check(
      "and so is a hard break, in both spellings",
      textOf("a  \nb") === "a\nb" && textOf("a\\\nb") === "a\nb",
    );
    // The rule the plan named for images, and the same argument for maths: what
    // the reader sees is not the characters the model holds.
    check(
      `an image is one character rather than its alt text (${JSON.stringify(textOf("![alt text](i.png)"))})`,
      textOf("![alt text](i.png)") === "￼",
    );
    check(
      `an equation is one character rather than its TeX (${JSON.stringify(textOf("$x = a*b*c$"))})`,
      textOf("$x = a*b*c$") === "￼" && textOf("a $x$ b") === "a ￼ b",
    );
    check(
      "a block with no inline content has no text",
      modelInlineText(null) === "" && modelInlineText([]) === "",
    );

    // Both directions, on a tree with a mark, an atom and a break in it.
    const doc = parse("**bo**ld ![i](u)\nnext");
    const nodes = doc.blocks[0].inlines;
    const text = modelInlineText(nodes);
    check(
      `the two directions agree on every offset (${JSON.stringify(text)})`,
      text === "bold ￼\nnext" &&
        [...text].every((_, i) => {
          const at = modelInlineAt(nodes, i);
          return modelInlineOffset(nodes, at.node, at.offset) === i;
        }),
    );

    // A boundary belongs to the node that ends there: undoLocateOffset's own
    // rule, kept so stage 2 ports the caret behaviour rather than re-deciding
    // it -- and it is what makes a position after a mark still inside it.
    const bold = modelInlineAt(nodes, 2);
    const after = modelInlineAt(nodes, 3);
    check(
      `a boundary belongs to the node that ends there (${bold.path.map((n) => n.kind).join(",")} / ` +
        `${after.path.map((n) => n.kind).join(",") || "none"})`,
      bold.offset === 2 && bold.path.map((n) => n.kind).join(",") === "strong" &&
        after.path.length === 0 && after.node.content === "ld ",
    );
    check(
      "which is how the tree says what marks a position carries",
      modelInlineAt(nodes, 0).path.map((n) => n.kind).join(",") === "strong" &&
        modelInlineAt(nodes, text.length).path.length === 0,
    );

    // Out of range clamps rather than failing, the way a restore onto text that
    // got shorter needs it to.
    const end = modelInlineAt(nodes, 999);
    check(
      "past the end lands at the end, and before the start at the start",
      end.node.content === "next" && end.offset === 4 &&
        modelInlineAt(nodes, -5).offset === 0,
    );
    check(
      "an empty tree is a position a caret can be in",
      modelInlineAt(null, 0).node === null && modelInlineAt([], 3).offset === 0,
    );
    check(
      "a node from another tree has no offset in this one",
      modelInlineOffset(nodes, parse("elsewhere").blocks[0].inlines[0]) === null,
    );
    // A mark is addressable too: `within` counts into its whole subtree.
    check(
      "a mark's own offset is where what it marks begins",
      modelInlineOffset(nodes, nodes[0]) === 0 &&
        modelInlineOffset(nodes, nodes[0], 2) === 2 &&
        modelInlineOffset(nodes, nodes[0], 99) === 2,
    );
  }

  // The oracle again, and the property is the fixpoint: every leaf, at both its
  // edges and its middle, maps to an offset that maps back to that same place.
  // A space that disagreed with itself would land the caret somewhere else
  // after every render.
  {
    let leaves = 0;
    let characters = 0;
    let atoms = 0;
    const wrong = [];
    let plainBlocks = 0;
    const plainMismatch = [];

    for (const path of ORACLE_FILES) {
      const walk = (blocks) => {
        for (const block of blocks) {
          if (block.inlines) {
            const nodes = block.inlines;
            const text = modelInlineText(nodes);
            characters += text.length;
            atoms += [...text].filter((c) => c === "￼").length;

            // markdown-it's own record of the block, as an independent reading:
            // a block whose tree is a single text node has no markup in it, so
            // the text the model renders is the content the parser recorded.
            if (nodes.length === 1 && nodes[0].kind === "text") {
              plainBlocks += 1;
              if (text !== block.inline.content) {
                plainMismatch.push(`${path}: ${JSON.stringify(text.slice(0, 30))}`);
              }
            }

            const flat = flatten(nodes).filter((n) => !n.children);
            for (const leaf of flat) {
              leaves += 1;
              const length = modelInlineText([leaf]).length;
              for (const within of [0, Math.floor(length / 2), length]) {
                const offset = modelInlineOffset(nodes, leaf, within);
                const back = modelInlineAt(nodes, offset);
                // The left bias makes one disagreement legitimate: offset 0 of
                // a leaf is also the end of the leaf before it, and that is the
                // place the boundary belongs to. Compare the offsets, which is
                // what a caret is, rather than the node.
                if (offset === null || modelInlineOffset(nodes, back.node, back.offset) !== offset) {
                  wrong.push(`${path}: ${JSON.stringify(leaf.content.slice(0, 20))} @${within}`);
                }
              }
            }
          }
          if (block.children) walk(block.children);
        }
      };
      walk(parse(repoFile(path)).blocks);
    }

    check(
      `every leaf maps to an offset that maps back to it` +
        ` (${leaves} leaves, ${characters} characters, ${atoms} of them atoms)` +
        (wrong.length ? ` — ${wrong.length} did not: ${wrong.slice(0, 3).join(", ")}` : ""),
      wrong.length === 0 && leaves > 9000 && characters > 200000 && atoms > 0,
    );
    check(
      `and in a block with no markup the model's text is what markdown-it recorded` +
        ` (${plainBlocks} of them)` +
        (plainMismatch.length ? ` — ${plainMismatch.length} did not` : ""),
      plainMismatch.length === 0 && plainBlocks > 100,
    );
  }

  // ------------------------------------------------ put back what was written
  //                                                             (slice 2, step 3)

  // markdown-it discards four spellings on the way from source to token: a
  // code span's padding, a backslash escape, a link's angle-bracket
  // destination, and which of the two hard-break spellings was used — plus a
  // fifth the plan does not name, the whitespace a soft or hard break's own
  // line surrenders to CommonMark on both sides of it. All five are recorded
  // on the node at parse time, in `raw` (and a link or image's tail in `tail`),
  // rather than re-derived at emit time: the same rule 1b's step 5 follows for
  // a list item's marker, and for the same reason — record first, so there is
  // only one place that can be wrong about it.
  //
  // `modelInlineSource` is the inverse of `modelInlines`: an inline tree back
  // to the raw text it was folded from, for every node that carries one of
  // these fields. `roundTrips` checks it against the block's own
  // `inline.content` rather than the caller's raw `src`, since a reference
  // link's definition line is a `gap` block of its own — this is the check
  // slice 1b's tiling invariant does not reach, because an untouched block
  // never asks its tree anything at all.
  const firstBlock = (src) => parse(src).blocks[0];
  const roundTrips = (src) => {
    const block = firstBlock(src);
    return modelInlineSource(block.inlines, md) === block.inline.content;
  };

  {
    check(
      `a code span with no padding keeps none (${JSON.stringify(modelInlineSource(firstBlock("`a`").inlines, md))})`,
      roundTrips("`a`"),
    );
    check(
      `and one with padding keeps it, rather than the content markdown-it stripped (${JSON.stringify(modelInlineSource(firstBlock("` a `").inlines, md))})`,
      roundTrips("` a `"),
    );
    check(
      "padding forced by a leading or trailing backtick round-trips too",
      roundTrips("`` `a` ``") && roundTrips("`` a` ``"),
    );
    check(
      `an escape is preserved, backslash and all (${JSON.stringify(modelInlineSource(firstBlock("\\*not em\\*").inlines, md))})`,
      roundTrips("\\*not em\\*") &&
        // and a real mark right beside an escaped one is not confused for it
        roundTrips("\\*a\\* and *b*"),
    );
    check(
      `both hard-break spellings keep their own bytes (${JSON.stringify(modelInlineSource(firstBlock("a  \nb").inlines, md))} / ${JSON.stringify(modelInlineSource(firstBlock("a\\\nb").inlines, md))})`,
      roundTrips("a  \nb") && roundTrips("a\\\nb"),
    );
    check(
      "a hard break's exact space count survives, not just its being a break",
      roundTrips("a    \nb"),
    );
    check(
      "a soft break's own trailing space and the next line's stripped indent both survive",
      roundTrips("a \n  b") && roundTrips("a\n  b") && roundTrips("a  \n"),
    );
    check(
      `a bare link destination and an angle-bracket one keep their own spelling (${JSON.stringify(modelInlineSource(firstBlock("[t](<u v>)").inlines, md))})`,
      roundTrips("[t](u)") && roundTrips("[t](<u v>)"),
    );
    check(
      "a title round-trips along with the destination, in both quote styles",
      roundTrips('[t](u "title")') && roundTrips("[t](u 'title')"),
    );
    check(
      "an autolink round-trips, angle brackets and all",
      roundTrips("<https://example.com>"),
    );
    check(
      "a reference link's tail round-trips in each of its three forms",
      roundTrips("[t][label]\n\n[label]: u") &&
        roundTrips("[label][]\n\n[label]: u") &&
        roundTrips("[label]\n\n[label]: u"),
    );
    check(
      "an image's alt text and its tail both round-trip, inline and reference alike",
      roundTrips("![alt text](i.png \"title\")") && roundTrips("![alt][ref]\n\n[ref]: u.png"),
    );
    check(
      "marks nest without losing track of the cursor between them",
      roundTrips("**bo *ld* text** and `code` and ~~gone~~"),
    );
    check(
      "an HTML entity is a named, thrown failure rather than a silent one" +
        " (unmeasured: no oracle file carries a live one)",
      (() => {
        try {
          parse("a &amp; b");
          return false;
        } catch (e) {
          return /raw spelling/.test(e.message);
        }
      })(),
    );
  }

  // The oracle again. Every inline-bearing block, at every depth — a table
  // cell is still 1b's floor and holds no tree of its own — reconstructs its
  // own `inline.content` exactly. `corpus/todo.md`'s own diet has no images or
  // reference links to speak of; the walk still visits every block that does,
  // in `tests/fixtures/torture.md`, the same way the earlier oracle checks in
  // this suite lean on it for the constructs the five hand-maintained files
  // never once use.
  {
    let blocks = 0;
    const wrong = [];
    for (const path of ORACLE_FILES) {
      const walk = (list) => {
        for (const block of list) {
          if (block.inlines) {
            blocks += 1;
            const out = modelInlineSource(block.inlines, md);
            if (out !== block.inline.content) {
              wrong.push(`${path}: ${JSON.stringify(block.inline.content.slice(0, 30))}`);
            }
          }
          if (block.children) walk(block.children);
        }
      };
      walk(parse(repoFile(path)).blocks);
    }
    check(
      `every inline-bearing block in the oracle reconstructs its own source exactly (${blocks} blocks)` +
        (wrong.length ? ` — ${wrong.length} did not: ${wrong.slice(0, 3).join(", ")}` : ""),
      wrong.length === 0 && blocks > 800,
    );
  }

  // ------------------------------------------------------------ escaping
  //                                                          (slice 2, step 4)

  // `modelEscapeText` is what `modelInlineSource` falls back to for a text
  // node with no `raw` recorded — genuinely new content, typed fresh or built
  // by a command — and the property under test is minimal escaping: a
  // backslash only where leaving the character bare would change what it
  // parses as. `escapes` decodes the result back through the real parser
  // rather than trusting the function's own opinion of itself, the same
  // discipline the block-level checks in this suite already hold: a function
  // that escaped everything indiscriminately would pass a bare correctness
  // check and fail this one.
  const escapes = (text) => {
    const escaped = modelEscapeText(md, text);
    const children = md.parseInline(escaped, {})[0]?.children || [];
    const decoded = children.length === 1 && children[0].type === "text" ? children[0].content : null;
    return { escaped, decoded };
  };

  {
    check(
      "plain prose with nothing markdown-active needs no escape at all",
      escapes("plain words").escaped === "plain words",
    );
    check(
      `a single emphasis pair escapes only its opening delimiter (${JSON.stringify(escapes("*a*").escaped)})`,
      escapes("*a*").escaped === "\\*a*" && escapes("_x_").escaped === "\\_x_",
    );
    check(
      "and the same is true with plain text on either side of the pair",
      escapes("a*b*c").decoded === "a*b*c",
    );
    check(
      "two independent pairs in one run are each escaped once, and nothing between them is touched",
      escapes("say *this*, and _that_, plainly").escaped === "say \\*this*, and \\_that_, plainly",
    );
    check(
      "a code span, an autolink, and strikethrough each escape their own opening delimiter",
      escapes("a `code` span").escaped === "a \\`code` span" &&
        escapes("<https://x>").escaped === "\\<https://x>" &&
        escapes("~~gone~~").escaped === "\\~~gone~~",
    );
    check(
      "a link-shaped bracket pair and a bare dollar sign both escape",
      escapes("[text](url)").escaped === "\\[text](url)" && escapes("equation $x$").escaped === "equation \\$x$",
    );
    check(
      "characters with nowhere to pair — a lone bracket, a lone dollar, spaced-out asterisks — stay bare",
      escapes("[text]").escaped === "[text]" &&
        escapes("price is $5 and $10").escaped === "price is $5 and $10" &&
        escapes("5 * 3 * 2 is arithmetic").escaped === "5 * 3 * 2 is arithmetic",
    );
    check(
      "a backslash before a letter is already literal and needs no second one",
      escapes("path\\to\\file").escaped === "path\\to\\file",
    );
    check(
      "an HTML entity and a numeric character reference are both escaped so they stay literal text",
      escapes("a &amp; b").decoded === "a &amp; b" && escapes("a &#65; b").decoded === "a &#65; b",
    );
    check(
      "a bare ampersand with no entity shape after it needs nothing",
      escapes("Q & A").escaped === "Q & A",
    );
    check(
      `a backslash already sitting in front of punctuation is not mistaken for the escape it looks like (${JSON.stringify(escapes("already \\*escaped\\*").escaped)})`,
      escapes("already \\*escaped\\*").decoded === "already \\*escaped\\*",
    );
    check(
      "which is what stops the naive whole-string check from looping forever on it",
      escapes("a\\\\b").decoded === "a\\\\b",
    );
  }

  // The oracle: every text node's own content, run through `modelEscapeText`
  // and decoded back through the real parser, has to reproduce that content
  // exactly — the same fixpoint property step 3's offset space is checked
  // with, applied to the direction step 3 does not reach. Unlike every other
  // check in this file, almost none of these text nodes are expected to need
  // an escape at all: this is the corpus REWRITE.md's own measurement (1.0%
  // of text tokens) was taken against, so the count of how many did is a
  // number worth reporting rather than a threshold worth enforcing.
  {
    let total = 0;
    let escaped = 0;
    const wrong = [];
    for (const path of ORACLE_FILES) {
      const walk = (list) => {
        for (const block of list) {
          if (block.inlines) {
            const flatten = (nodes, out = []) => {
              for (const n of nodes || []) {
                out.push(n);
                if (n.children) flatten(n.children, out);
              }
              return out;
            };
            for (const node of flatten(block.inlines)) {
              if (node.kind !== "text") continue;
              total += 1;
              const { escaped: out, decoded } = escapes(node.content);
              if (out !== node.content) escaped += 1;
              if (decoded !== node.content) {
                wrong.push(`${path}: ${JSON.stringify(node.content.slice(0, 30))}`);
              }
            }
          }
          if (block.children) walk(block.children);
        }
      };
      walk(parse(repoFile(path)).blocks);
    }
    check(
      `every text node in the oracle escapes to something that decodes back to itself` +
        ` (${total} nodes, ${escaped} needed an escape)` +
        (wrong.length ? ` — ${wrong.length} did not: ${wrong.slice(0, 3).join(", ")}` : ""),
      wrong.length === 0 && total > 5000,
    );
  }

  // --------------------------------------------------------------- links
  //                                                          (slice 2, step 5)

  // `node.tail` covers a link or image untouched from a parse (step 3); this
  // is the other half, for one built fresh or whose destination a command
  // changed — nothing in the oracle exercises it on its own, since every
  // parsed link keeps the tail it arrived with, so each case here clears
  // `tail` by hand to stand in for what a future editing command will leave
  // behind: a token with `attrs` and nothing else.
  //
  // The check reparses the *rebuilt* markdown — through the full document,
  // reference definitions included, not the isolated node — and compares its
  // `attrs` against the original token's, which is the only honest way to
  // confirm a rebuilt tail means the same thing rather than merely looking
  // plausible.
  const flattenInlines = (nodes, out = []) => {
    for (const n of nodes || []) {
      out.push(n);
      if (n.children) flattenInlines(n.children, out);
    }
    return out;
  };
  // `suffix` carries a reference definition into the parse when the case
  // needs one — the source has to include it for `referenceAwareLink` to
  // resolve the link at all, the same reason step 3's own reference-link
  // cases parse the definition and the usage together.
  const rebuildsTo = (kind, src, suffix = "") => {
    const block = firstBlock(src + suffix);
    const node = flattenInlines(block.inlines).find((n) => n.kind === kind);
    const before = JSON.stringify(node.token.attrs);
    node.tail = undefined;
    const rebuilt = modelInlineSource(block.inlines, md);
    const reparsedToken = md
      .parse(rebuilt + suffix, {})
      .filter((t) => t.type === "inline")
      .flatMap((t) => t.children)
      .find((t) => t.type === (kind === "image" ? "image" : "link_open"));
    return { rebuilt, matches: JSON.stringify(reparsedToken?.attrs) === before };
  };

  {
    check(
      `a plain inline destination rebuilds bare (${JSON.stringify(rebuildsTo("link", "[t](url)").rebuilt)})`,
      rebuildsTo("link", "[t](url)").matches,
    );
    check(
      "a title rebuilds alongside the destination",
      rebuildsTo("link", '[t](url "my title")').matches,
    );
    check(
      "a title holding a literal quote and a literal backslash both round-trip",
      rebuildsTo("link", '[t](url "a \\"quoted\\" title")').matches &&
        rebuildsTo("link", '[t](url "back\\\\slash")').matches,
    );
    check(
      `a destination normalised to something with no bare-illegal characters stays bare (${JSON.stringify(rebuildsTo("link", "[t](<url with space>)").rebuilt)})`,
      rebuildsTo("link", "[t](<url with space>)").matches,
    );
    check(
      "a reference link rebuilds in its label's explicit form, definition included in the reparse",
      rebuildsTo("link", "[t][label]", "\n\n[label]: https://example.com").matches,
    );
    check(
      "the same is true starting from the collapsed and shortcut forms",
      rebuildsTo("link", "[label][]", "\n\n[label]: https://example.com").matches &&
        rebuildsTo("link", "[label]", "\n\n[label]: https://example.com").matches,
    );
    check(
      "an image rebuilds the same way, inline and with a title",
      rebuildsTo("image", "![alt](i.png)").matches && rebuildsTo("image", '![alt](i.png "cap")').matches,
    );
    check(
      `a destination containing a literal angle bracket or backslash escapes inside the brackets (${JSON.stringify(rebuildsTo("image", "![a](<x\\\\y\\<z>)").rebuilt)})`,
      rebuildsTo("image", "![a](<x\\\\y\\<z>)").matches,
    );
  }

  // ---- Slice 3, step 3: the leaf emitter composes ------------------------

  // The step that finally reads 1b's step 5 marker, step 1's quote chain and
  // step 2's heading shape, and puts an edited leaf back together out of them.
  //
  // What makes it small is the measurement slice 3 was planned from: a block's
  // `source` is `inline.content` with an affix glued to the front of each of
  // its lines, and slice 2's step 3 already reconstructs that content byte for
  // byte. So these checks are about the **affixes**, in the two directions they
  // can be wrong — a prefix the model invents, and one it writes twice.
  {
    const emitted = (src, want) => {
      const doc = parse(src);
      const leaf = want(leavesOf(doc));
      modelTouch(leaf);
      return modelSerialise(doc, (block) => modelEmitLeaf(block, md, doc));
    };
    // The common case, and the only one where nothing at all is glued on.
    const first = (leaves) => leaves[0];
    const nth = (n) => (leaves) => leaves[n];
    const kind = (k) => (leaves) => leaves.find((b) => b.kind === k);
    const quoted = (leaves) => leaves.find((b) => b.quotePrefixes);
    const roundTrips = (src, want = first) => emitted(src, want) === src;

    check(
      "a bare paragraph emits its own bytes back",
      roundTrips("Some *emphatic* prose.\n"),
    );

    // Step 2's three spellings, now read by something. The closing run and the
    // underline are the only bytes in the model that go behind the content, so
    // an emitter that only knew about prefixes would pass the first of these
    // and drop the tail of the other two.
    check(
      "each of markdown's three heading spellings emits back as written",
      roundTrips("# Title\n") &&
        roundTrips("#### Deep ####\n") &&
        roundTrips("Title\n=====\n") &&
        roundTrips("Title\n-\n"),
    );
    check(
      "an indented ATX heading keeps the indent its `open` recorded",
      roundTrips("   ### Three in\n"),
    );

    // 1b's step 5's two fields: the marker on the first line of the item's
    // content, the continuation indent on every other line — and on every line
    // of a block that is not the one opening the item.
    check(
      "an item's marker goes on the first line and its indent on the rest",
      roundTrips("*   One line\n    and its continuation.\n"),
    );
    check(
      "a second block in the same item gets the indent and never the marker",
      roundTrips("- One paragraph.\n\n  And a second one.\n", nth(1)),
    );

    // The rule the measurement decided: the affixes are **absolute**, so only
    // the nearest item contributes. Stacking them indents a nested bullet by
    // the sum of the indents its own marker already carried — which is what 154
    // of the oracle's 861 inline-bearing leaves look like when you get it
    // wrong, every one of them a bullet inside a bullet.
    check(
      "a nested item's marker is absolute, not stacked on its parent's",
      roundTrips("- Outer\n\n  - Inner item\n    wrapped.\n", (leaves) => leaves[1]),
    );
    // 1b's step 5's own bug, one layer along: the derived indent for `-\t` is
    // ` \t`, the same column and different bytes from the bare tab the file
    // continues under. Recorded rather than derived at parse, so read rather
    // than re-derived here.
    check(
      "a tab-marked item's continuation keeps the tab the file wrote",
      roundTrips("-\tTab-marked item, whose continuation\n\tis a bare tab.\n"),
    );

    // Step 1's chain, per line. The third of these is the one a per-block
    // prefix gets wrong: its second line is a lazy continuation carrying no
    // `>` at all.
    check(
      "a quote emits the chain each of its own lines carried, at any depth",
      roundTrips("> Quoted.\n") &&
        roundTrips("> > Twice quoted.\n") &&
        roundTrips("> Quoted, and then\nlazily continued.\n") &&
        roundTrips("  > Indented two columns in.\n"),
    );
    // The chain outside the marker, which is the order the plan named and the
    // measurement confirmed: `> 1. x` has both stripped to reach its content.
    check(
      "an item behind a `> ` emits the chain and then the marker",
      roundTrips("> 1. A list inside a quote.\n") &&
        roundTrips("> - An item\n>   and its continuation.\n"),
    );

    // The two suppressions, and both are cases where an inner affix was
    // recorded from its own column 0 and so already carries the item's indent.
    // Adding it again writes the same columns in different bytes — the exact
    // failure 1b's step 5 had for a day with a tab, and the only two leaves in
    // the oracle that a naive composition gets wrong.
    check(
      "a quote inside an item is not indented twice",
      roundTrips("- Holding a quote:\n\n  > The datum was moved.\n", quoted),
    );
    check(
      "a heading inside an item is not indented twice either",
      roundTrips("- Holding a heading:\n\n  #### A heading inside a list item\n", kind("heading")),
    );

    // The three refusals. Each is a spelling the model recorded as `null`
    // rather than guessing at, so the emitter has nothing to work from — and a
    // throw is what `modelEmitBlock` already does for a leaf with no serialiser
    // at all, for the same reason: writing something else into the user's file
    // is the outcome worth crashing to avoid.
    const throwsOn = (src, want) => {
      try {
        emitted(src, want);
        return false;
      } catch {
        return true;
      }
    };
    check(
      "a leaf with no inline tree refuses rather than emitting — its content is source and is edited as source",
      throwsOn("```sh\nls\n```\n", first) && throwsOn("---\n", first) && throwsOn("[label]: u\n", first),
    );
    check(
      "a heading whose shape did not line up refuses rather than inventing a spelling",
      throwsOn("- # Heading on an item's own first line\n", kind("heading")),
    );
    check(
      "a block inside an item with no recorded marker refuses the same way",
      (() => {
        const doc = parse("- An item.\n");
        const leaf = leavesOf(doc)[0];
        leaf.parent.marker = null;
        modelTouch(leaf);
        try {
          modelSerialise(doc, (block) => modelEmitLeaf(block, md, doc));
          return false;
        } catch {
          return true;
        }
      })(),
    );

    // And the property the step can state exactly, which is the one worth
    // having: throw away every inline-bearing leaf's `source` and emit it from
    // its tree alone. This is slice 2's step 3 claim with the affixes now
    // included, and it is what makes the emitter testable with no browser
    // anywhere near it.
    let inlineBearing = 0;
    let sourceless = 0;
    const wrong = [];
    for (const path of ORACLE_FILES) {
      const doc = parse(repoFile(path));
      for (const leaf of leavesOf(doc)) {
        if (!leaf.inlines) {
          sourceless += 1;
          continue;
        }
        inlineBearing += 1;
        const own = leaf.source;
        leaf.source = null;
        let out;
        try {
          out = modelEmitLeaf(leaf, md, doc);
        } catch (error) {
          out = `threw: ${error.message}`;
        }
        if (out !== own) wrong.push(`${path}: ${JSON.stringify(own.slice(0, 40))}`);
      }
    }
    check(
      `every inline-bearing leaf in the oracle emits its own bytes from its tree alone (${inlineBearing} of them, ${sourceless} leaves having no tree to emit from)` +
        (wrong.length ? ` — ${wrong.length} did not: ${wrong.slice(0, 3).join(", ")}` : ""),
      inlineBearing > 800 && wrong.length === 0,
    );
  }

  // ---- Slice 3, step 4: the definition a rebuilt reference needs ---------

  // Slice 2's step 5 rebuilds `[text][label]` off the `data-ref-label` stamp and
  // declines to ask whether the label still resolves, because a single node's
  // token cannot answer a question about the whole document. This is the
  // emitter it named as the owner, and the model can answer where the running
  // editor cannot: a definition is an ordinary block in its own position, so
  // the document is a list that can be searched.
  {
    const whole = (src) => {
      const env = {};
      md.parse(src, env);
      return new Set(Object.keys(env.references || {}));
    };
    const same = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

    // Where a definition can live, against the parser's own answer for the
    // whole file. The five corpus files hold no reference definition at all —
    // the bias `torture.md` exists to cover — so the oracle half of this check
    // is carried by one file, and the hand-written half is what says the rule
    // is a rule rather than a fit to it.
    const files = ORACLE_FILES.map((path) => {
      const src = repoFile(path);
      return { path, want: whole(src), got: modelReferenceLabels(parse(src), md) };
    });
    const torture = files.find((f) => f.path === "tests/fixtures/torture.md");
    check(
      `the labels a document defines are the parser's own, on every oracle file (${torture.want.size} in torture.md, none in the other five)` +
        ` — ${files.filter((f) => !same(f.want, f.got)).length} disagreed`,
      files.every((f) => same(f.want, f.got)) && torture.want.size === 5,
    );

    // Either side of the line, and the two quote cases are why this is not a
    // scan of the gap blocks: `> [b]: u` is a quote whose only content is the
    // definition, so it has no child tokens and is a childless leaf rather than
    // a container holding a gap.
    const CASES = [
      "[a]: u\n",
      "[e]: u1\n[f]: u2\n",
      "[i]:\n  wrapped onto a second line\n",
      "- item\n\n  [a]: u\n",
      "> [b]: u\n",
      "> > [h]: deep\n",
      "```\n[c]: not a definition\n```\n",
      "    [g]: not a definition either\n",
      "text\n[d]: a lazy continuation, not a definition\n",
      "| a | b |\n| - | - |\n| [j]: u | x |\n",
    ];
    const missed = CASES.filter((src) => !same(whole(src), modelReferenceLabels(parse(src), md)));
    check(
      `and in each of the ${CASES.length} places a definition-shaped line either is or is not one` +
        (missed.length ? ` — ${missed.length} disagreed: ${JSON.stringify(missed[0])}` : ""),
      missed.length === 0,
    );
    // The one `main` cannot see at all: `scanReferenceDefinitions`'s regex is
    // single-line, so a wrapped definition is invisible to it and the link that
    // used it saves as a plain inline link. Here it is only a taller block.
    check(
      "including a definition wrapped onto a second line, which the running editor's scanner cannot see",
      modelReferenceLabels(parse("[wrapped]:\n  https://example.org/x\n"), md).has(md.utils.normalizeReference("wrapped")),
    );

    // Now the emitter. To reach the rebuild path at all the recorded tail has
    // to go — step 3 records one for every parsed link, so only a command that
    // built or changed a link leaves none, which is the case step 5 is for.
    const REF = "A [full reference][papers] in a paragraph.\n\n[papers]: https://example.org/papers \"The Bexley Papers\"\n";
    const rebuilt = (src, { drop = false } = {}) => {
      const doc = parse(src);
      const leaf = leavesOf(doc)[0];
      const link = leaf.inlines.find((n) => n.kind === "link");
      link.tail = null;
      if (drop) doc.blocks = doc.blocks.filter((b) => b.kind !== "gap");
      modelTouch(leaf);
      return modelEmitLeaf(leaf, md, doc);
    };

    check(
      "a rebuilt reference whose definition is still in the document keeps the label",
      rebuilt(REF) === "A [full reference][papers] in a paragraph.",
    );
    check(
      `and one whose definition has been deleted falls back to the inline form (${JSON.stringify(rebuilt(REF, { drop: true }))})`,
      rebuilt(REF, { drop: true }) ===
        'A [full reference](https://example.org/papers "The Bexley Papers") in a paragraph.',
    );
    // Handed no document the emitter cannot be told the label is gone, so it
    // keeps the stamp's spelling rather than materialising a possibly stale
    // href on a question it was not given the means to answer.
    check(
      "with no document handed over it keeps the stamp's spelling, which is step 5's behaviour unchanged",
      (() => {
        const doc = parse(REF);
        const leaf = leavesOf(doc)[0];
        leaf.inlines.find((n) => n.kind === "link").tail = null;
        doc.blocks = doc.blocks.filter((b) => b.kind !== "gap");
        modelTouch(leaf);
        return modelEmitLeaf(leaf, md) === "A [full reference][papers] in a paragraph.";
      })(),
    );

    // The definition stays where the author put it, which is the half the model
    // gets for free and `appendReferenceDefinitions` cannot: it has no position
    // to reason about and collects every definition at the end of the file.
    // torture.md says out loud that its definitions sit in the middle.
    check(
      "editing the paragraph that uses a reference leaves the definition where it was",
      (() => {
        const src = "Intro.\n\n[a] and [b].\n\n[a]: u1\n[b]: u2\n\nA trailing paragraph.\n";
        const doc = parse(src);
        const leaf = leavesOf(doc).find((b) => b.source === "[a] and [b].");
        modelTouch(leaf);
        return modelSerialise(doc, (block) => modelEmitLeaf(block, md, doc)) === src;
      })(),
    );

    // Pinned as a limitation rather than asserted as a design: `data-ref-label`
    // is stamped by `referenceAwareLink`, which replaces markdown-it's inline
    // `link` rule and nothing else, so an image resolved through a reference
    // carries no stamp at all and a rebuilt one can only come back inline. An
    // untouched one still round-trips on its recorded tail. Fixing it means
    // copying the `image` rule the way the `link` rule was copied, which is a
    // parser change rather than an emitter one.
    check(
      "a reference image carries no stamp, so a rebuilt one comes back inline — pinned, and it is referenceAwareLink's gap rather than the emitter's",
      (() => {
        const doc = parse("An ![by reference][plate].\n\n[plate]: https://example.org/p.png\n");
        const leaf = leavesOf(doc)[0];
        const image = leaf.inlines.find((n) => n.kind === "image");
        if (image.token.attrGet("data-ref-label") !== null) return false;
        if (image.tail !== "[plate]") return false;
        image.tail = null;
        modelTouch(leaf);
        return modelEmitLeaf(leaf, md, doc) === "An ![by reference](https://example.org/p.png).";
      })(),
    );
  }

  // ---- Slice 3, step 5: re-wrap, and only where the content moved -------

  // The second of the two layers `markdown-style.js` has always had, applied to
  // one block instead of to a whole document that then has most of itself
  // restored. What it does *not* do is most of the value: `inline.content` keeps
  // the author's own breaks, so a line already inside the width is left exactly
  // where it was and only one the edit made too long is touched.
  {
    const emit = (src, width, want = (leaves) => leaves[0]) => {
      const doc = parse(src);
      const leaf = want(leavesOf(doc));
      modelTouch(leaf);
      return modelEmitLeaf(leaf, md, doc, width);
    };

    // The step-3 defect this step found, and it is a defect rather than a gap:
    // a paragraph indented one to three spaces is still a paragraph, its indent
    // is stripped off `inline.content` exactly as a list marker is, and nothing
    // recorded carried it — so an edited one came back flush left, silently.
    // 861 of 861 passed with it missing because not one paragraph in the oracle
    // is indented. `leadingAffix` is the fix: everything markdown-it took off
    // the first line, taken whole, with the emitter subtracting the item prefix
    // it is putting back.
    check(
      "a paragraph's own leading indent survives an edit, which step 3 dropped",
      emit("   indented paragraph\n", 0) === "   indented paragraph" &&
        emit("  two spaces\n  and a second line\n", 0) === "  two spaces\n  and a second line",
    );
    check(
      "including one indented inside a quote, and one indented past its item's own indent",
      emit(">    indented inside a quote\n", 0) === ">    indented inside a quote" &&
        emit("- item\n\n    over-indented second block\n", 0, (leaves) => leaves[1]) ===
          "    over-indented second block",
    );

    // Width 0 is a real answer, not an absence: `sniffWrapWidth` gives it for a
    // file that is not hard-wrapped, and README.md is one. Imposing a width
    // there would be its own damage.
    const RAGGED = "One sentence on its own line.\nA second, also on its own, which runs a good deal longer than eighty columns would allow.\n";
    check(
      "at width 0 nothing is wrapped, however long the line",
      emit(RAGGED, 0) === RAGGED.trimEnd(),
    );

    // The property itself: the long line splits, its neighbours do not move.
    const wrapped = emit(RAGGED, 40).split("\n");
    check(
      `a line over the width is wrapped and the lines beside it are not (${wrapped.length} lines out of 2 in)`,
      wrapped[0] === "One sentence on its own line." && wrapped.length > 2 &&
        wrapped.slice(1).every((line) => line.length <= 40),
    );

    // Never a heading — a wrap turns its tail into a paragraph. reflowMarkdown
    // refuses one by looking for a `#`, which misses setext entirely; the model
    // knows what kind of block it is holding.
    const LONG_HEAD = "# A heading long enough that any width worth sniffing would break it in two\n";
    const LONG_SETEXT = "A setext heading long enough that any width would break it in two\n===\n";
    check(
      "a heading is never wrapped, in either spelling — the setext one being what a `#` scan cannot see",
      emit(LONG_HEAD, 40) === LONG_HEAD.trimEnd() && emit(LONG_SETEXT, 40) === LONG_SETEXT.trimEnd(),
    );

    // The one guard structure cannot replace, since an equation is inline and
    // can sit anywhere in a paragraph.
    const MATHS = "A line carrying $x = a \\times b \\times c \\times d$ and running past the width.\n";
    check(
      "a line holding maths is never wrapped",
      emit(MATHS, 40) === MATHS.trimEnd(),
    );

    // The prefixes are handed over rather than re-derived, and this is the item
    // the difference shows on: derived, the continuation is two spaces of the
    // same width as the tab the file actually used.
    // It has to have a continuation line, because that is what states the
    // indent: 1b's step 5 derives one only when the item has none, and the
    // derived value for `"-\t"` is `" \t"` — right, in the absence of anything
    // better. torture.md's own tab-marked item is this shape.
    const TABBED = "-\tA tab-marked item whose first line runs past any sniffed width at all\n\tand continues under a bare tab.\n";
    check(
      `a wrapped tab-marked item continues under the tab the file wrote, not spaces of the same width (${JSON.stringify(emit(TABBED, 40).split("\n")[1])})`,
      emit(TABBED, 40).split("\n").slice(1).every((line) => line.startsWith("\t")),
    );
    check(
      "and a wrapped item inside a quote keeps both affixes on every line it produces",
      emit("> - An item inside a quote, long enough that it has to be broken somewhere\n", 40)
        .split("\n")
        .slice(1)
        .every((line) => line.startsWith(">   ")),
    );
    // Held back and re-applied to the last line out, which is wrapMarkdownLine's
    // own rule reached through the model rather than through reflowMarkdown.
    check(
      "a hard break survives a wrap, landing on the last line the wrap produced",
      /\S {2}$/.test(emit("A paragraph with a hard break at its end, long enough to have to wrap somewhere  \nand a second line.\n", 40).split("\n").find((l, i, a) => a[i + 1] === "and a second line.")),
    );

    // And the metric. The two numbers are the claim: composition is exact
    // everywhere, and the re-wrap moves only the blocks holding a line the
    // author let run past the width their file sniffs to — where the running
    // editor re-flows every edited paragraph whole.
    let total = 0;
    let exact = 0;
    let unmoved = 0;
    const perFile = [];
    for (const path of ORACLE_FILES) {
      const src = repoFile(path);
      const width = sniffMarkdownStyle(src).wrapWidth;
      const doc = parse(src);
      let n = 0;
      let kept = 0;
      for (const leaf of leavesOf(doc)) {
        if (!leaf.inlines) continue;
        total += 1;
        n += 1;
        if (modelEmitLeaf(leaf, md, doc, 0) === leaf.source) exact += 1;
        if (modelEmitLeaf(leaf, md, doc, width) === leaf.source) {
          unmoved += 1;
          kept += 1;
        }
      }
      perFile.push(`${path.split("/").pop()} ${kept}/${n} at ${width}`);
    }
    check(
      `every inline-bearing leaf composes exactly (${exact} of ${total}), and re-wrapping at each file's own width moves ${total - unmoved} of them` +
        ` (${perFile.join(", ")})`,
      exact === total && unmoved / total > 0.9,
    );
  }

  // ---- Slice 3, step 6: the two claims one level up ---------------------

  // Everything above drives `modelEmitLeaf` directly. These drive
  // `modelSerialise`, so the emitter sits under the whole recursion — a leaf's
  // bytes, then its item, its list, the separators between them, and the
  // document's prefix — which is the arrangement the app will actually use and
  // the one a per-leaf check cannot reach.
  {
    // Counted, because the way all three of these pass by doing nothing is a
    // `modelTouch` that did not clear: an untouched document serialises from
    // its own bytes and comes back identical without the emitter ever running.
    // So each claim below also says how many times the emitter was asked.
    let calls = 0;
    const emitAt = (doc, width) => modelSerialise(doc, (b) => {
      calls += 1;
      return modelEmitLeaf(b, md, doc, width);
    });
    const inlineLeaves = (doc) => leavesOf(doc).filter((b) => b.inlines);

    // Every inline-bearing leaf in a file, edited at once, and the file still
    // comes back. The five source-edited kinds are left alone deliberately:
    // their content *is* source, a command sets it rather than nulling it, and
    // `modelEmitLeaf` refuses them on purpose (step 3).
    let touched = 0;
    const whole = [];
    for (const path of ORACLE_FILES) {
      const src = repoFile(path);
      const doc = parse(src);
      const leaves = inlineLeaves(doc);
      touched += leaves.length;
      leaves.forEach(modelTouch);
      if (emitAt(doc, 0) !== src) whole.push(path);
    }
    check(
      `every inline-bearing leaf in a file edited at once, and the file still serialises byte-identical (${touched} leaves across ${ORACLE_FILES.length} files, ${calls} emitter calls)` +
        (whole.length ? ` — ${whole.length} did not: ${whole.join(", ")}` : ""),
      touched > 800 && whole.length === 0 && calls === touched,
    );

    // The same with each file's own sniffed width on. What moves is a block
    // holding a line the author let run past it, which is a guaranteed
    // population rather than a fault: `sniffWrapWidth` is a 95th percentile, so
    // about one prose line in twenty is longer than the width by construction.
    // The number is here rather than in prose because it is the one figure that
    // says what re-wrapping costs at document scale.
    const perFile = [];
    for (const path of ORACLE_FILES) {
      const src = repoFile(path);
      const width = sniffMarkdownStyle(src).wrapWidth;
      const doc = parse(src);
      const leaves = inlineLeaves(doc);
      let over = 0;
      for (const leaf of leaves) {
        const own = leaf.source;
        modelTouch(leaf);
        if (modelEmitLeaf(leaf, md, doc, width) !== own) over += 1;
      }
      perFile.push(`${path.split("/").pop()} ${over}/${leaves.length} at ${width}`);
      // A file that is not hard-wrapped sniffs to 0, and nothing may move there:
      // imposing a width on a document that never had one is its own damage.
      if (width === 0 && over !== 0) perFile.push("!! moved at width 0");
    }
    check(
      `with each file's own width on, the leaves that move are the ones holding a line the author let run past it (${perFile.join(", ")})`,
      !perFile.some((p) => p.startsWith("!!")),
    );

    // 1b's step 6 sweep, with a real emitter under it instead of a sentinel.
    // Until now that sweep only ever measured containers handing back bytes
    // that already existed; this asks the emitter to reconstruct each block in
    // turn and puts the whole file back together around it. Re-parsed per leaf,
    // because `modelTouch` clears ancestors and a second measurement on the
    // same document would be measuring one that has already been edited.
    let swept = 0;
    let sweptCalls = 0;
    const wrong = [];
    for (const path of ORACLE_FILES) {
      const src = repoFile(path);
      const total = inlineLeaves(parse(src)).length;
      for (let i = 0; i < total; i += 1) {
        const doc = parse(src);
        const leaf = inlineLeaves(doc)[i];
        const own = leaf.source;
        modelTouch(leaf);
        swept += 1;
        calls = 0;
        if (emitAt(doc, 0) !== src) wrong.push(`${path}: ${JSON.stringify(own.slice(0, 30))}`);
        // One touch, one emitter call: no sibling is ever re-serialised, which
        // is 1b's whole result and is invisible to a byte comparison alone.
        sweptCalls += calls;
      }
    }
    check(
      `and each one edited alone rebuilds the file around itself exactly, for exactly one emitter call (${swept} of them, ${sweptCalls} calls, one parse each)` +
        (wrong.length ? ` — ${wrong.length} did not: ${wrong.slice(0, 3).join(", ")}` : ""),
      swept > 800 && wrong.length === 0 && sweptCalls === swept,
    );
  }

  // ---- Stage 1's exit criterion: the save-fidelity cases, on the model ---

  // The estimate table's third clause for this stage, and the only one that is
  // not already asserted above: "the `save-fidelity` suite's cases pass against
  // the model". Those cases are statements about constructs the old core has to
  // work to preserve — a break inside a list item, a quote's prefix on a
  // continuation line, a table's padding, a definition's exact bytes — and the
  // model's claim is that it preserves them by never throwing them away.
  //
  // So each one is driven both ways: the document round-trips untouched, and
  // every inline-bearing leaf in it re-emits its own bytes. The second half is
  // what makes it a real check — the first passes for a model that parsed
  // nothing at all.
  {
    const CASES = {
      "a break inside a list item": "- An item with a break  \n  and its continuation.\n",
      "a break inside a blockquote": "> Quoted with a break  \n> and its continuation.\n",
      "the backslash spelling of a break": "A line with a break\\\nand its continuation.\n",
      "both spellings in one document": "One  \nbreak.\n\nAnother\\\nbreak.\n",
      "a wrapped list item indented to its content": "*   An item whose second line\n    aligns under the content.\n",
      "a nested list at three depths": "- One\n  - Two\n    - Three\n",
      "an ordered list numbered all-ones": "1.  First\n1.  Second\n1.  Third\n",
      "a table with its own padding": "| a | b |\n| --- | --- |\n| 1 | 2 |\n",
      "a table with alignment colons": "| a | b |\n| :-- | --: |\n| 1 | 2 |\n",
      "each rule character": "a\n\n---\n\nb\n\n***\n\nc\n\n___\n\nd\n",
      "a setext heading, which is not a rule": "Heading\n-------\n\nBody.\n",
      "snake_case, which is not emphasis": "A snake_case_identifier here.\n",
      "a fence with a language": "```sh\nls -la\n```\n",
      "a single-line reference definition": "A [link][foo].\n\n[foo]: http://example.com\n",
      "a titled reference definition": 'A [link][foo].\n\n[foo]: http://example.com "Title"\n',
      "a definition inside a fence, which is not one": "```\n[foo]: http://example.com\n```\n",
      "an inline equation": "The value $x = a*b*c$ holds.\n",
      "a display equation": "Before.\n\n$$\nx = y\n$$\n\nAfter.\n",
      "an autolink": "See <https://example.com> for more.\n",
      "a code span holding a delimiter": "Use `a_b` and `a*b` here.\n",
    };
    const failed = [];
    for (const [name, src] of Object.entries(CASES)) {
      if (modelSerialise(parse(src)) !== src) {
        failed.push(`${name} (round trip)`);
        continue;
      }
      const doc = parse(src);
      const leaves = leavesOf(doc).filter((b) => b.inlines);
      leaves.forEach(modelTouch);
      if (modelSerialise(doc, (b) => modelEmitLeaf(b, md, doc, 0)) !== src) failed.push(`${name} (re-emit)`);
    }
    check(
      `the save-fidelity suite's constructs round-trip and re-emit through the model (${Object.keys(CASES).length} of them)` +
        (failed.length ? ` — ${failed.length} did not: ${failed.slice(0, 3).join("; ")}` : ""),
      failed.length === 0,
    );
  }

  // ------------------------------------------------------------- the metric

  // Slice 1b's step 6: the number the slice exists to move, asserted rather
  // than measured by hand once and quoted in a CHANGELOG entry. The cases above
  // say the mechanism works on the shapes we thought of; this says what it is
  // worth on the files this project is written in.
  //
  // "One block" is the unit an edit re-serialises, which is a leaf — see
  // `leavesOf` at the top of this file.
  const lineCount = (text) => text.split("\n").length;

  const metricFiles = ORACLE_FILES;
  const worst = metricFiles.map((path) => {
    const text = repoFile(path);
    const doc = parse(text);
    return {
      path,
      lines: lineCount(text),
      leaf: Math.max(...leavesOf(doc).map((b) => lineCount(b.source))),
      top: Math.max(...doc.blocks.map((b) => lineCount(b.source))),
    };
  });
  const share = (f) => (f.leaf / f.lines) * 100;
  const worstTodo = worst.find((f) => f.path === CORPUS.todo);

  check(
    `editing the worst block in corpus/todo.md rewrites ${worstTodo.leaf} of its ${worstTodo.lines} lines (${share(worstTodo).toFixed(1)}%)`,
    share(worstTodo) < 5,
  );
  // The guard on that number: it has to have moved because of sub-blocks, not
  // because the file got shorter or its lists got smaller. This is what the same
  // edit cost before slice 1b, and it is still sitting there in the model as a
  // top-level block — the difference is that nothing re-serialises it any more.
  check(
    `and its largest top-level block, which is what that cost before 1b, is still ${worstTodo.top} lines (${((worstTodo.top / worstTodo.lines) * 100).toFixed(0)}%)`,
    worstTodo.top / worstTodo.lines > 0.25,
  );
  check(
    "no file's worst edit is a tenth of it (" + worst.map((f) => `${f.path} ${share(f).toFixed(1)}%`).join(", ") + ")",
    worst.every((f) => share(f) < 10),
  );

  // And the exhaustive version of the single-bullet case above: every leaf in
  // those five files, edited one at a time, rewrites exactly its own bytes and
  // nothing else. It re-parses per leaf rather than reusing one model, because
  // `modelTouch` clears ancestors and a second measurement on the same document
  // would be measuring a document with an edit already in it.
  //
  // The sentinel shares no character with anything in any of the files, at
  // either end. One that did would let the common prefix run into the
  // replacement, so the region measured would be smaller than the block and the
  // check would weaken without failing.
  const SENTINEL = "☃EDITED☃";
  let leavesChecked = 0;
  const notExact = [];
  for (const path of metricFiles) {
    const text = repoFile(path);
    const total = leavesOf(parse(text)).length;
    for (let i = 0; i < total; i++) {
      const doc = parse(text);
      const leaf = leavesOf(doc)[i];
      const own = leaf.source;
      modelTouch(leaf);
      const out = modelSerialise(doc, () => SENTINEL);
      let at = 0;
      while (at < text.length && text[at] === out[at]) at += 1;
      leavesChecked += 1;
      if (out !== text.slice(0, at) + SENTINEL + text.slice(at + own.length)) {
        notExact.push(`${path}: ${JSON.stringify(own.slice(0, 30))}`);
      }
    }
  }
  check(
    `every block in the oracle files, edited alone, rewrites exactly itself (${leavesChecked} of them)` +
      (notExact.length ? ` — ${notExact.length} did not: ${notExact.slice(0, 3).join(", ")}` : ""),
    leavesChecked > 600 && notExact.length === 0,
  );
}
