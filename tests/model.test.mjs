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

export default function run(check) {
  const { modelParse, modelSerialise, modelTouch } = loadSource(
    "model.js",
    {},
    "; return { modelParse, modelSerialise, modelTouch };",
  );

  const md = markdownit();
  const parse = (src) => modelParse(src, md);

  // ---------------------------------------------------------------- D1 itself

  // Every one of these is a file this project maintains by hand, and the whole
  // point of markdown-style.js is that saving one does not rewrite it. Here
  // that is not a restoration pass getting most of it back — it is the model
  // never having thrown the bytes away.
  for (const path of ["CLAUDE.md", "README.md", "front/welcome.md", "docs/TODO.md", "docs/REWRITE.md"]) {
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
}
