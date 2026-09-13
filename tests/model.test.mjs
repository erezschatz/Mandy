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
// The oracle is this repo. CLAUDE.md, README.md, welcome.md and docs/TODO.md
// are real files with real reference links, tight lists, tables, fences and
// maths in them, and the claim under test is that opening and saving one
// changes nothing whatsoever. Fixtures would prove that the model round-trips
// what the model finds easy.

import markdownit from "markdown-it";
import { readFileSync } from "node:fs";
import { loadSource } from "./dom.mjs";

const repoFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// The oracle, and it is deliberately two kinds of file.
//
// The first five are documents this project maintains by hand, which is what
// makes them worth testing against: they are the files a regression would
// actually damage, and they carry the conventions real prose carries.
//
// They are also a **biased** sample, and the bias runs one way. Every one was
// written or reformatted in a single voice, so they are uniformly well-formed —
// and between them they contain no blockquote, no hard break, no strikethrough
// and no reference definition at all. A suite driving only these would report
// full marks on constructs it had never once parsed.
//
// `tests/fixtures/torture.md` is the answer to that: one deliberately messy
// document carrying at least one of everything in docs/MARKDOWN.md, nested far
// deeper than any real file here goes, and inconsistent everywhere it is legal
// to be. It does not replace the five — a synthetic file cannot say what this
// project's own prose does — it covers the half they cannot.
const ORACLE_FILES = [
  "CLAUDE.md",
  "README.md",
  "front/welcome.md",
  "docs/TODO.md",
  "docs/REWRITE.md",
  "tests/fixtures/torture.md",
];

export default function run(check) {
  const { modelParse, modelSerialise, modelTouch, modelSpansAtLevel, modelItemPrefix } = loadSource(
    "model.js",
    {},
    "; return { modelParse, modelSerialise, modelTouch, modelSpansAtLevel, modelItemPrefix };",
  );

  const md = markdownit();
  const parse = (src) => modelParse(src, md);

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
  // docs/TODO.md today; what step 1 buys is that the tiler can see inside it
  // at all, which is the thing nothing could do before.
  const todo = md.parse(repoFile("docs/TODO.md"), {});
  const biggest = modelSpansAtLevel(todo, 0).reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  check("the largest block in docs/TODO.md is a container", biggest.open.type.endsWith("list_open"));
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
  const todoDoc = parse(repoFile("docs/TODO.md"));
  const depthOf = (b) => (b.children ? 1 + Math.max(...b.children.map(depthOf)) : 1);
  const containers = (b) => (b.children ? 1 : 0) + (b.children || []).reduce((n, c) => n + containers(c), 0);
  check(
    "docs/TODO.md tiles into containers rather than staying flat",
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
  const kinds = new Set(parse(repoFile("CLAUDE.md")).blocks.flatMap(everyKind));
  check(`CLAUDE.md holds no unknown kind at any depth (${[...kinds].sort().join(",")})`, !kinds.has("unknown"));

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

  const src = repoFile("CLAUDE.md");
  const claude = parse(src);

  // Without this the round trip above could pass by doing nothing at all: a
  // parse that found no blocks would leave the whole file in `prefix` and
  // hand it back unchanged, which is byte-identical and worthless.
  check("CLAUDE.md parses to blocks rather than one undigested lump", claude.blocks.length > 100);
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

  const todoSrc = repoFile("docs/TODO.md");
  // The first bullet in the file, found by its own marker: docs/TODO.md writes
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
    "a bullet unique in docs/TODO.md is what the check below edits",
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
    "editing one bullet rewrites exactly that bullet, and nothing else in 708 lines",
    listOut === todoSrc.slice(0, itemAt) + "*   ZZZITEM" + todoSrc.slice(itemAt + itemSource.length),
  );
  // The list this bullet is in is 239 lines of docs/TODO.md. Before slice 1b it
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
    "every child's parent is the container holding it, throughout docs/TODO.md",
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
    "the deepest leaf in docs/TODO.md is five blocks down and unique in the file",
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
  // A threshold and not the exact count, deliberately: the oracle here is five
  // live files, and an exact number turns every edit to the documentation into a
  // failing test about list items. (It did, in this slice, on the REWRITE.md
  // entry describing this very check.)
  // An item inside a blockquote has `> ` in front of its own marker, because a
  // child's source is its lines whole — so `modelItemPrefix`, which reads a
  // marker off the *start* of the first line, does not find one. It returns
  // null rather than inventing a marker, which is the safe direction, and the
  // split below is what says so out loud.
  //
  // This is the blockquote-prefix question REWRITE.md's slice 1b step 5 left
  // open, showing up as a measurement instead of an argument. **It is pinned
  // here rather than fixed**, the way step 3's hazard was pinned for step 4:
  // record the quote prefix at parse and these two stop being exceptions, which
  // is the case for doing it that way rather than stripping at emit time.
  //
  // None of the five hand-maintained files can see this. They contain no
  // blockquote at all — it took the fixture.
  const quoted = (b) => (b.parent ? b.parent.kind === "quote" || quoted(b.parent) : false);
  const plainItems = itemsSeen.filter((b) => !quoted(b));
  const quotedItems = itemsSeen.filter(quoted);
  check(
    `every item outside a blockquote has a marker (${plainItems.length} of them)`,
    plainItems.length > 200 && plainItems.every((b) => typeof b.marker === "string"),
  );
  check(
    `and every item inside one has none, which is slice 3's open question (${quotedItems.length} of them)`,
    quotedItems.length > 0 && quotedItems.every((b) => b.marker === null),
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

  // ------------------------------------------------------------- the metric

  // Slice 1b's step 6: the number the slice exists to move, asserted rather
  // than measured by hand once and quoted in a CHANGELOG entry. The cases above
  // say the mechanism works on the shapes we thought of; this says what it is
  // worth on the files this project is written in.
  //
  // "One block" is the unit an edit re-serialises, which is a leaf: a container
  // re-emits as its children, so what reaches slice 3's emitter is always a
  // block with none.
  const leavesOf = (doc) => {
    const out = [];
    const walk = (b) => (b.children ? b.children.forEach(walk) : out.push(b));
    doc.blocks.forEach(walk);
    return out;
  };
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
  const worstTodo = worst.find((f) => f.path === "docs/TODO.md");

  check(
    `editing the worst block in docs/TODO.md rewrites ${worstTodo.leaf} of its ${worstTodo.lines} lines (${share(worstTodo).toFixed(1)}%)`,
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
