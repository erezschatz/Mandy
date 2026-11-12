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
// The converter is stood in for by a function that tags what it was given, so a
// check can see which document's source was adopted before which document's
// HTML was converted, and whether the answer came from the converter or from
// the source.

import { loadSource, readFront } from "./dom.mjs";

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
  const api = loadSource("legacy-storage.js", {
    localStorage: storage,
    DOCUMENT_KEYS: { markdown: "mandy-markdown" },
    isBlankContent: (html) => !html || html === "<p><br></p>",
    adoptMarkdownStyle: (source) => { style = source; calls.push(`adopt:${source}`); },
    markdownStyleAdopt: (bundle) => { style = null; calls.push(`reset:${bundle}`); },
    md: { render: (source) => `rendered(${source})` },
    htmlToMarkdown: (html) => {
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
      s.map.get("mandy-markdown") === "converted:<p>a</p>");
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
      s.map.get("mandy-tab-1-markdown") === "converted:<p>one</p>" &&
        s.map.get("mandy-tab-3-markdown") === "converted:<p>three</p>" &&
        s.map.get("mandy-tab-7-markdown") === "converted:<p>seven</p>");
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
    check("and one that does not is the converter's", s.map.get("mandy-tab-2-markdown") === "converted:<p>edited</p>");
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
      r.legacyStoredMarkdown("mandy-tab-1-markdown") === "converted:<p>big</p>");
    check(`${label} still converts the tabs it can`, s.map.get("mandy-tab-2-markdown") === "converted:<p>small</p>");
    check(`${label} records no version, so the next load tries again`, !s.map.has("mandy-storage-version"));
    check(`${label} answers nothing for a key it did write`, r.legacyStoredMarkdown("mandy-tab-2-markdown") === null);

    // The next load, with room this time.
    const next = store(Object.fromEntries(s.map));
    load(next);
    check(`after ${label}, the next load with room converts it and records the version`,
      next.map.get("mandy-tab-1-markdown") === "converted:<p>big</p>" &&
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
      r.legacyFlatUnconverted() === true && r.legacyStoredMarkdown("mandy-markdown") === "converted:<p>a</p>");
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
      s.map.get("mandy-tab-2-markdown") === "converted:<p>good</p>" && !s.map.has("mandy-storage-version"));
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
}
