// front/legacy-storage.js: the one-time conversion of the autosave from the
// editor's HTML to the model's markdown. TODO 3.1, stage 4's slice 4.
//
// What is driven here is the control flow, on a stub store: which keys are
// found, what is written where, what is removed and when, what happens when a
// write fails, and that a second run cannot convert a document twice. The
// conversion itself — Turndown over real stored HTML, with a real parser — needs
// a browser, and is tests/browser/storage-conversion.spec.mjs's, against
// fixtures of HTML captured from both cores before the old one was removed.
//
// Turndown is stood in for by a function that tags what it was given, so a
// check can see which document's source was adopted before which document's
// HTML was converted, and whether the answer came from the converter or from
// the source. A conversion ends in exactly one newline, as a saved file did,
// which is why every expected answer below has one.

import { loadApp, loadSource, readFront } from "./dom.mjs";

function store(seed = {}, { refuse = [], swallow = [] } = {}) {
  const map = new Map(Object.entries(seed));
  const writes = [];
  return {
    map,
    writes,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      writes.push(k);
      if (refuse.includes(k)) throw new Error("QuotaExceededError");
      if (swallow.includes(k)) return;
      map.set(k, String(v));
    },
    removeItem: (k) => { map.delete(k); },
  };
}

// `unchanged` lists the sources whose rendering converts to the same bytes as
// the stored HTML: decision 2's comparison, answered by the stub.
function load(storage, { unchanged = [], throwOn = [] } = {}) {
  const calls = [];
  let style = null;
  const api = loadSource(["markdown-style.js", "legacy-storage.js"], {
    localStorage: storage,
    DOCUMENT_KEYS: { markdown: "mandy-markdown" },
    // The old core's save path around the converter is the real one, which
    // this file now holds: a width of 0 re-wraps nothing, and the restore
    // finds none of the stub's tagged strings in any source, so it hands them
    // back as they are. What it does with real markdown is the checks at the
    // end of this file.
    turndownService: { addRule() {} },
    markdownStyle: { wrapWidth: 0 },
    adoptMarkdownStyle: (source) => { style = source; calls.push(`adopt:${source}`); },
    markdownStyleAdopt: (bundle) => { style = null; calls.push(`reset:${bundle}`); },
    md: { render: (source) => `rendered(${source})` },
    htmlFragmentToMarkdown: (html) => {
      if (throwOn.includes(html)) throw new Error("Turndown blew up");
      // A rendering of a source the stub calls unchanged converts to exactly
      // what that source's stored HTML converts to.
      const m = /^rendered\((.*)\)$/s.exec(html);
      if (m && unchanged.includes(m[1])) return `converted:stored-of(${m[1]})`;
      if (m) return `converted:rendering-of(${m[1]})`;
      calls.push(`convert:${html} under ${style}`);
      const owner = unchanged.find((s) => html === `stored-of(${s})`);
      return owner ? `converted:stored-of(${owner})` : `converted:${html}`;
    },
    console: { ...console, warn() {}, error() {} },
  }, "; return { legacyStoredMarkdown, legacyConvertStorage, legacyFlatUnconverted, STORAGE_VERSION_KEY };");
  return { ...api, calls };
}

export default function run(check) {
  // --- one document, under the flat names ----------------------------------
  {
    const s = store({ markdownContent: "<p>a</p>", markdownSource: "a\n", "mandy-current-file": "/x/a.md" });
    const r = load(s);
    check("a flat document is converted onto the flat markdown key",
      s.map.get("mandy-markdown") === "converted:<p>a</p>\n");
    check("with its own source adopted before it is converted",
      r.calls.indexOf("adopt:a\n") < r.calls.indexOf("convert:<p>a</p> under a\n") &&
        r.calls.includes("convert:<p>a</p> under a\n"));
    check("and its old pair is removed", !s.map.has("markdownContent") && !s.map.has("markdownSource"));
    check("and nothing else about it is touched", s.map.get("mandy-current-file") === "/x/a.md");
    check("and the version is recorded once nothing is left", s.map.get(r.STORAGE_VERSION_KEY) === "2");
    check("and the shared style is put back to the defaults afterwards", r.calls.at(-1) === "reset:null");
  }

  // --- several tabs, each with its own source ---------------------------------
  {
    const s = store({
      "mandy-tabs": JSON.stringify({ order: [1, 3], active: 3, seq: 3 }),
      "mandy-tab-1-content": "<p>one</p>", "mandy-tab-1-source": "one\n",
      "mandy-tab-3-content": "<p>three</p>", "mandy-tab-3-source": "three\n",
      // A tab the list does not name is converted the same way: nothing here
      // decides which documents matter.
      "mandy-tab-7-content": "<p>seven</p>",
    });
    const r = load(s);
    check("every tab is converted under its own key",
      s.map.get("mandy-tab-1-markdown") === "converted:<p>one</p>\n" &&
        s.map.get("mandy-tab-3-markdown") === "converted:<p>three</p>\n" &&
        s.map.get("mandy-tab-7-markdown") === "converted:<p>seven</p>\n");
    check("each under its own source",
      r.calls.includes("convert:<p>one</p> under one\n") && r.calls.includes("convert:<p>three</p> under three\n"));
    check("and one with no source under the defaults", r.calls.includes("convert:<p>seven</p> under null"));
    check("and no tab's old pair is left",
      ![...s.map.keys()].some((k) => /-(content|source)$/.test(k)));
    check("and the tab list is left alone", s.map.get("mandy-tabs") === JSON.stringify({ order: [1, 3], active: 3, seq: 3 }));
  }

  // --- decision 2: an unchanged document is its source ------------------------
  {
    const s = store({
      "mandy-tab-1-content": "stored-of(kept\n)", "mandy-tab-1-source": "kept\n",
      "mandy-tab-2-content": "<p>edited</p>", "mandy-tab-2-source": "original\n",
    });
    load(s, { unchanged: ["kept\n"] });
    check("a document whose source converts to the same bytes is taken from its source, byte for byte",
      s.map.get("mandy-tab-1-markdown") === "kept\n");
    check("and one that does not is the converter's", s.map.get("mandy-tab-2-markdown") === "converted:<p>edited</p>\n");
  }

  // --- blank ---------------------------------------------------------------
  {
    const s = store({ "mandy-tab-1-content": "<p><br></p>", "mandy-tab-1-source": "x\n" });
    const r = load(s);
    check("a blank document converts to no key at all, and its pair goes",
      !s.map.has("mandy-tab-1-markdown") && !s.map.has("mandy-tab-1-content") && !s.map.has("mandy-tab-1-source"));
    check("without being converted", !r.calls.some((c) => c.startsWith("convert:")));
  }

  // --- a second run can never convert twice --------------------------------
  {
    const s = store({
      "mandy-tab-1-content": "<p>old</p>", "mandy-tab-1-source": "old\n",
      "mandy-tab-1-markdown": "# Already *markdown*\n",
    });
    const r = load(s);
    check("a tab whose markdown key exists is not converted again",
      s.map.get("mandy-tab-1-markdown") === "# Already *markdown*\n" && !r.calls.some((c) => c.startsWith("convert:")));
    check("and only its old pair is removed", !s.map.has("mandy-tab-1-content") && !s.map.has("mandy-tab-1-source"));
  }
  {
    const s = store({ "mandy-storage-version": "2", "mandy-tab-1-content": "<p>x</p>" });
    const r = load(s);
    check("with the version recorded, nothing is scanned or touched",
      s.map.get("mandy-tab-1-content") === "<p>x</p>" && !s.map.has("mandy-tab-1-markdown") && r.calls.length === 0);
  }
  {
    const s = store({ "mandy-tab-1-content": "<p>x</p>" });
    load(s);
    const once = JSON.stringify([...s.map]);
    load(s);
    check("and a second load after a clean one changes nothing", JSON.stringify([...s.map]) === once);
  }

  // --- a write that fails ---------------------------------------------------
  for (const [label, options] of [
    ["a write that throws", { refuse: ["mandy-tab-1-markdown"] }],
    ["a write that reports success and stores nothing", { swallow: ["mandy-tab-1-markdown"] }],
  ]) {
    const s = store({
      "mandy-tab-1-content": "<p>big</p>", "mandy-tab-1-source": "big\n",
      "mandy-tab-2-content": "<p>small</p>",
    }, options);
    const r = load(s);
    check(`${label} leaves that tab's old pair where it was`,
      s.map.get("mandy-tab-1-content") === "<p>big</p>" && s.map.get("mandy-tab-1-source") === "big\n");
    check(`${label} leaves no markdown key behind`, !s.map.has("mandy-tab-1-markdown"));
    check(`${label} keeps the conversion in memory, so the document opens`,
      r.legacyStoredMarkdown("mandy-tab-1-markdown") === "converted:<p>big</p>\n");
    check(`${label} still converts the tabs it can`, s.map.get("mandy-tab-2-markdown") === "converted:<p>small</p>\n");
    check(`${label} records no version, so the next load tries again`, !s.map.has("mandy-storage-version"));
    check(`${label} answers nothing for a key it did write`, r.legacyStoredMarkdown("mandy-tab-2-markdown") === null);

    // The next load, with room this time.
    const next = store(Object.fromEntries(s.map));
    load(next);
    check(`after ${label}, the next load with room converts it and records the version`,
      next.map.get("mandy-tab-1-markdown") === "converted:<p>big</p>\n" &&
        !next.map.has("mandy-tab-1-content") && next.map.get("mandy-storage-version") === "2");
  }

  // --- the flat document, unconverted, holds the tab migration back ----------
  //
  // tabs.js asks this before moving the flat names onto a first tab. A flat
  // document still stored the old way would otherwise be left behind under a
  // name a session with a tab list never reads.
  {
    const s = store({ markdownContent: "<p>a</p>" }, { refuse: ["mandy-markdown"] });
    const r = load(s);
    check("a flat document whose write failed is still unconverted, so the migration waits",
      r.legacyFlatUnconverted() === true && r.legacyStoredMarkdown("mandy-markdown") === "converted:<p>a</p>\n");
  }
  {
    const s = store({ markdownContent: "<p>bad</p>" });
    const r = load(s, { throwOn: ["<p>bad</p>"] });
    check("and so is one the converter threw on", r.legacyFlatUnconverted() === true);
  }
  {
    const s = store({ markdownContent: "<p>a</p>" });
    const r = load(s);
    check("a flat document that converted lets the migration go ahead", r.legacyFlatUnconverted() === false);
  }

  // --- a conversion that throws ---------------------------------------------
  {
    const s = store({ "mandy-tab-1-content": "<p>bad</p>", "mandy-tab-2-content": "<p>good</p>" });
    const r = load(s, { throwOn: ["<p>bad</p>"] });
    // It opens blank on this load: there is no markdown to show, and the HTML
    // is kept rather than lost.
    check("a document the converter throws on keeps its HTML for the next load",
      s.map.get("mandy-tab-1-content") === "<p>bad</p>" && !s.map.has("mandy-tab-1-markdown"));
    check("and holds nothing in memory", r.legacyStoredMarkdown("mandy-tab-1-markdown") === null);
    check("and the rest still convert, with no version recorded",
      s.map.get("mandy-tab-2-markdown") === "converted:<p>good</p>\n" && !s.map.has("mandy-storage-version"));
  }

  // --- nothing stored ---------------------------------------------------------
  {
    const s = store({});
    load(s);
    check("a browser with no autosave records the version and nothing else",
      s.map.size === 1 && s.map.get("mandy-storage-version") === "2");
  }

  // --- where it sits ----------------------------------------------------------
  //
  // It has to run before anything reads a document, and both tabs.js and
  // file-api.js read storage when they load; and after app.js, whose converter
  // it calls at its own load.
  const index = readFront("index.html");
  const at = (name) => index.indexOf(`<script src="/${name}">`);
  check("index.html loads it after app.js and before tabs.js and file-api.js",
    at("legacy-storage.js") > at("app.js") && at("legacy-storage.js") < at("tabs.js") &&
      at("legacy-storage.js") < at("file-api.js") && at("app.js") > -1);
  check("sw.js caches it for offline", readFront("sw.js").includes('"/legacy-storage.js"'));
  check("and an exported document does not carry it, since it never reads the autosave",
    !readFront("html-export.js").includes('"/legacy-storage.js"'));

  // Every read of the document key goes through app.js's storedDocument, which
  // is what makes a conversion held in memory open at all. A reader that went
  // to the key directly would show a blank document for a tab whose write
  // failed.
  for (const file of ["app.js", "tabs.js", "file-api.js", "format-bar.js", "outline.js"]) {
    const src = readFront(file);
    const direct = (src.match(/getItem\(documentKey\("markdown"\)\)/g) || []).length;
    check(`${file} reads the stored document only through storedDocument (${direct} direct reads)`,
      file === "app.js" ? direct === 0 && /function storedDocument\(\)/.test(src) : direct === 0);
  }

  legacySaveChecks(check);
  restoreChecks(check);
  referenceLinkChecks(check);
}

// ── The old core's save path ─────────────────────────────────────────────────
//
// Moved here from save-fidelity with the code, in stage 4's slice 5. The
// conversion above writes each stored document the way the old core would have
// saved it, so these are what decide whether a converted document matches the
// file it came from. The checks are as they were, except that what they
// drive is legacy-storage.js's now.

function legacySaveChecks(check) {
  const { legacyHtmlToMarkdown, rules, converting } = loadApp({ legacy: true });

  // Only stored HTML can hold a Mermaid diagram drawn before they were
  // removed, so the rule is the conversion's alone, like referenceLink below.
  const wrapper = { classList: { contains: (name) => name === "mermaid-wrapper" } };
  check("the mermaid rule is legacy-storage.js's, and stays out of a fragment conversion",
    !!rules.mermaid && !rules.mermaid.filter(wrapper));
  converting(true);
  check("and turns a stored diagram back into its fence while a conversion runs",
    rules.mermaid.filter(wrapper));
  converting(false);
  check("output ends with a newline", legacyHtmlToMarkdown("hello") === "hello\n");

  check(
    "an output that already ends in a newline does not gain a second",
    legacyHtmlToMarkdown("hello\n") === "hello\n",
  );

  check(
    "trailing blank lines collapse to exactly one newline",
    legacyHtmlToMarkdown("hello\n\n\n") === "hello\n",
  );

  // Guards the `\n*$` anchor: a newline in the middle of the document is
  // content, and a greedy or unanchored replace would eat it.
  check(
    "newlines inside the document are left alone",
    legacyHtmlToMarkdown("a\n\nb") === "a\n\nb\n",
  );
}

// markdown-style.js's sniffer and line wrapper, under legacy-storage.js's
// re-wrapper and restore layer. Pure string work, so no stub.
function restoreChecks(check) {
  const { sniff, reflow, index, restore } = loadSource(
    ["markdown-style.js", "legacy-storage.js"],
    {
      // The recorded version stops the conversion at load before it reads
      // anything; these checks want the functions, not the run.
      localStorage: { getItem: () => "2" },
      turndownService: { addRule() {} },
      DOCUMENT_KEYS: {},
      console,
    },
    "; return { sniff: sniffMarkdownStyle, reflow: reflowMarkdown," +
      " index: indexMarkdownBlocks, restore: restoreSourceWrapping };",
  );

  const unwrapped = "a b c d e f g h i j k l m n o p q r s t u v w x y z\n";
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


  // TODO 2.2. A hard break is two or more trailing spaces, and the wrapper
  // splits on whitespace -- so before this guard the break was swallowed as
  // ordinary spacing between words the moment its line was long enough to
  // wrap, with the paragraph still reading correctly on screen and the break
  // gone from the user's file. The short-line case passed all along, which is
  // what made it a seam rather than an obvious break: reflowMarkdown hands a
  // line under the width straight back without ever calling the wrapper.
  const breakLine = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
  check(
    "a hard break survives a line too short to wrap",
    reflow("one two  \nthree\n", 30).includes("  \n"),
  );
  check(
    "and survives a line long enough to wrap, which is the bug",
    reflow(breakLine + "  \nnext\n", 30).includes("  \n"),
  );
  check(
    "landing on the last line the wrap produced, not the first",
    /iota kappa {2}\n/.test(reflow(breakLine + "  \nnext\n", 30)),
  );
  check(
    "the exact run of spaces is preserved, not normalised to two",
    reflow(breakLine + "   \nnext\n", 30).includes("   \n"),
  );
  // The backslash spelling needed no guard -- it is a non-space character, so
  // it rides through the split attached to the word in front of it. Checked so
  // that a future change to the wrapper cannot quietly break the half that
  // works by construction.
  check(
    "the backslash spelling survives a wrap too",
    reflow(breakLine + "\\\nnext\n", 30).includes("\\\n"),
  );
  check(
    "a break inside a list item keeps both the break and the indent",
    /  \n {2}/.test(reflow("- " + breakLine + "  \n  next\n", 30)),
  );
  check(
    "a break inside a blockquote keeps both the break and the prefix",
    /  \n>/.test(reflow("> " + breakLine + "  \n> next\n", 30)),
  );
  // And the wrap still does its job around the break.
  check(
    "wrapping a line that ends in a break still respects the width",
    reflow(breakLine + "  \nnext\n", 30)
      .split("\n")
      .every((line) => line.trimEnd().length <= 30),
  );


  // Fenced code is not prose and re-wrapping it changes the program inside.
  const fenced = "```\nthis is a very long line of code that must not be broken up\n```\n";
  check("fenced code is never re-wrapped", reflow(fenced, 30) === fenced);
  const table = "| a very long header | another very long header |\n";
  check("table rows are never re-wrapped", reflow(table, 20) === table);

  // A reference definition's destination is one word with nowhere to break;
  // wrapping it would either overflow anyway or fold it onto a continuation
  // line indented by an amount CommonMark never promised meant anything.
  const definition = "[foo]: http://example.com/a/very/long/path/that/exceeds/the/width\n";
  check("a reference definition is never re-wrapped", reflow(definition, 20) === definition);

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

  // A restored segment's separator described the block that followed it in the
  // source. Delete a list's last item and the item before it comes back with
  // the tight "\n" that led to the deleted one -- now leading to the paragraph
  // after the list, which reparses as a lazy continuation of the item. Saved,
  // reopened, and the paragraph is inside the bullet.
  const listThenPara = "- first\n- second\n\nPara after.\n";
  check(
    "deleting a list's last item does not glue the paragraph after it onto the list",
    restore("- first\n\nPara after.\n", index(listThenPara)) === "- first\n\nPara after.\n",
  );
  check(
    "an untouched tight list followed by a paragraph comes back as it was",
    restore("- first\n\n- second\n\nPara after.\n", index(listThenPara)) === listThenPara,
  );
  // The tight separator is still the author's whenever what follows is a list
  // item where a list item followed before, so deleting from the middle of a
  // list -- or editing the item after -- does not loosen it.
  check(
    "deleting a middle item keeps the list tight",
    restore("- a\n\n- c\n\nP\n", index("- a\n- b\n- c\n\nP\n")) === "- a\n- c\n\nP\n",
  );
  check(
    "editing the item after a restored one keeps the boundary before it tight",
    restore("- a\n\n- B\n", index("- a\n- b\n")) === "- a\n- B\n",
  );
  check(
    "a tight separator is never handed to a paragraph that did not follow it",
    restore("- a\n\nNew para\n", index("- a\n- b\n")) === "- a\n\nNew para\n",
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

  // TODO 2.3's cheap half. A hard break has two spellings and the sniff picks
  // one document-wide, so Turndown writes the winner into every block before
  // the restore runs. The two-space form survives the key's whitespace collapse
  // and the backslash does not, so a block written the minority way keyed
  // differently from its own source, missed, and came back rewritten *and*
  // re-wrapped with no edit near it. This is the case break-test.md's CHARLIE
  // paragraph exists to find.
  const charlie = "CHARLIE ends in a backslash\\\nand continues on a second line.\n";
  const asTwoSpaces = "CHARLIE ends in a backslash  \nand continues on a second line.\n";
  check(
    "a block whose hard break is spelt the minority way still matches its own source",
    restore(asTwoSpaces, index(charlie)) === charlie,
  );
  check(
    "and the same in the other direction, since which spelling is the minority is per document",
    restore(charlie, index(asTwoSpaces)) === asTwoSpaces,
  );
  // The guard on that: it must not make two *different* blocks key alike, or
  // the restore hands back somebody else's bytes -- worse than the bug.
  check(
    "but a block that only differs after the break still misses",
    restore("CHARLIE ends in a backslash  \nand continues differently.\n", index(charlie)) ===
      "CHARLIE ends in a backslash  \nand continues differently.\n",
  );
  check(
    "and a backslash mid-line is left alone, so it still tells two blocks apart",
    restore("a b\n", index("a \\ b\n")) === "a b\n",
  );

  // The emphasis half of 2.3 is deliberately *not* fixed here, and this says so
  // out loud rather than leaving a reader to wonder. Folding `_` into `*` is the
  // only normalisation available without a parser, and on torture.md it keys the
  // rules `***` and `___` the same -- so the half that would need one waits for
  // the model, which records each node's spelling as written.
  check(
    "the emphasis delimiter is still document-wide, and an untouched block still loses it",
    restore("An *underscored* word.\n", index("An _underscored_ word.\n")) ===
      "An *underscored* word.\n",
  );
}

// A reference link and an inline link resolve to the identical
// <a href> once markdown-it has parsed them, so without help the old core's
// save could not tell them apart and quietly rewrote every reference as inline, dropping its
// [label]: url definition with it. Two halves, tested separately because
// that is exactly where the fix splits: scanReferenceDefinitions is pure
// string work day one test can drive directly; referenceAwareLink is a
// three-way fork inside markdown-it's own inline parser that the pass-through
// TurndownService stub never calls, the same reason mathjax/mermaid/table are
// tested by pulling the rule out and calling it directly rather than through
// legacyHtmlToMarkdown -- see the mathjax rule tests in latex.test.mjs.
function referenceLinkChecks(check) {
  const { scanReferenceDefinitions, normalizeReferenceLabel } = loadApp({ legacy: true });

  check(
    "a single-line definition is captured",
    scanReferenceDefinitions("[foo]: http://example.com\n").get("foo") ===
      "[foo]: http://example.com",
  );

  check(
    "a titled definition is captured whole, not just the destination",
    scanReferenceDefinitions('[foo]: http://example.com "Title"\n').get("foo") ===
      '[foo]: http://example.com "Title"',
  );

  check(
    "the label key is case- and whitespace-normalised",
    scanReferenceDefinitions("[ My  Label ]: http://example.com\n").has("my label"),
  );

  check(
    "the first of two definitions for the same label wins",
    scanReferenceDefinitions("[foo]: http://a\n[foo]: http://b\n").get("foo") ===
      "[foo]: http://a",
  );

  check(
    "a line that only looks like a definition inside a fence is not one",
    !scanReferenceDefinitions("```\n[foo]: http://example.com\n```\n").has("foo"),
  );

  check(
    "an ordinary paragraph is not mistaken for a definition",
    !scanReferenceDefinitions("This costs $5: not a link.\n").size,
  );

  check(
    "normalizeReferenceLabel agrees with the scan's own keys",
    normalizeReferenceLabel(" My  Label ") === "my label",
  );

  // ── the Turndown rule ──────────────────────────────────────────────────

  const { rules, legacyConvertDocument, legacyState, converting } = loadApp({ legacy: true });
  legacyConvertDocument("", "Body text.\n\n[foo]: http://example.com \"Example\"\n");

  check(
    "the scan ran as part of converting a document with its source",
    legacyState().references.get("foo") === '[foo]: http://example.com "Example"',
  );

  const rule = rules.referenceLink;
  check("legacy-storage.js registers a referenceLink rule", !!rule);
  // The rule fires only inside a conversion; see the `links` suite for the
  // other side of that.
  converting(true);

  const stamped = (label) => ({
    nodeName: "A",
    getAttribute: (n) => (n === "data-ref-label" ? label : null),
  });

  check("the rule matches a link stamped with a known label", rule.filter(stamped("foo")));
  check(
    "the match is case-insensitive, the same as the definition lookup",
    rule.filter(stamped("FOO")),
  );
  check(
    "the rule declines a label with no surviving definition",
    !rule.filter(stamped("no-such-label")),
  );
  check("the rule declines an unstamped link", !rule.filter(stamped(null)));
  check(
    "the rule ignores other elements even if stamped",
    !rule.filter({ nodeName: "SPAN", getAttribute: () => "foo" }),
  );

  check(
    "the replacement writes [text][label], not the inline form",
    rule.replacement("caption", stamped("foo")) === "[caption][foo]",
  );
  check(
    "the replacement keeps the label's original spelling, not the normalised key",
    rule.replacement("caption", stamped("Foo")) === "[caption][Foo]",
  );

  converting(false);

  // ── appending the definitions a conversion actually used ─────────────────

  const { legacyConvertDocument: convert2, appendReferenceDefinitions } = loadApp({ legacy: true });
  convert2("", "[foo]: http://example.com\n[bar]: http://example.org\n");

  check(
    "a label nothing referenced this save is not appended",
    appendReferenceDefinitions("Body.\n", new Set()) === "Body.\n",
  );
  check(
    "a used label's exact source line is appended after a blank line",
    appendReferenceDefinitions("Body.\n", new Set(["foo"])) ===
      "Body.\n\n[foo]: http://example.com\n",
  );
  check(
    "several used labels are appended in the order they were used",
    appendReferenceDefinitions("Body.\n", new Set(["bar", "foo"])) ===
      "Body.\n\n[bar]: http://example.org\n[foo]: http://example.com\n",
  );
  check(
    "a label with no surviving definition is silently skipped",
    appendReferenceDefinitions("Body.\n", new Set(["foo", "ghost"])) ===
      "Body.\n\n[foo]: http://example.com\n",
  );
}


