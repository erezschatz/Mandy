// The one-time conversion of this browser's autosave from HTML to markdown.
// TODO 3.1, stage 4's slice 4, and decisions 2, 3 and 5 in docs/REWRITE.md.
//
// Until slice 4 every document was stored as the editor's HTML under its
// `content` key, with the markdown it was opened from beside it under `source`.
// From slice 4 the model is the document and it is stored as the markdown it
// would save, under `markdown`. This file moves every document stored the old
// way onto the new key, once, and is deleted when stage 5 closes — by then the
// one browser that needs it has long since converted.
//
// **It runs at script load, before anything reads a document**: after app.js,
// whose Turndown service it converts with, and before tabs.js and file-api.js,
// which read storage when they load. `window` `load` would be too late.
//
// **The markdown goes under a new key rather than over `content`**, so the key
// says what it holds and no stored document is ever asked whether it looks like
// HTML. That matters on the second run: Turndown reading markdown as if it were
// HTML escapes every `*` and `#` in it, so a conversion that could run twice
// over one document would corrupt it. A document whose `markdown` key exists has
// been converted, and only its old keys are removed.
//
// It is in index.html and sw.js and not in html-export.js's ASSETS: an exported
// document never reads the autosave back.
//
// **It also holds the old core's save path**, since stage 4's slice 5 and
// decision 5: the restore layer, the re-wrapper's document pass and the
// reference definitions. The conversion is the one caller left — the model
// writes every file now — and it needs them, because a stored document is
// converted the way the old core would have saved it. They go with this file.

const STORAGE_VERSION_KEY = "mandy-storage-version";
const STORAGE_VERSION = "2";

// Markdown converted on this load whose write failed, by the key it belongs
// under. storedDocument() in app.js reads it when the key itself is missing, so
// the document opens anyway; the next load tries the write again.
const legacyPendingMarkdown = new Map();

function legacyStoredMarkdown(key) {
  return legacyPendingMarkdown.has(key) ? legacyPendingMarkdown.get(key) : null;
}

// Whether the flat document is still stored the old way after this load's
// conversion: its write failed, or the converter threw on it. tabs.js asks
// before it migrates the flat names onto a first tab, and refuses while this is
// true. Otherwise the migration would move the session onto tab keys and leave
// the flat document behind: a conversion held in memory under the flat key
// would never be found, and the old key would convert on a later load into a
// flat key a session with a tab list never reads. Refusing keeps the session on
// the flat names for this load, which is the migration's own answer to a write
// that fails, and the next load tries both again.
function legacyFlatUnconverted() {
  try {
    return localStorage.getItem("markdownContent") !== null;
  } catch {
    return false;
  }
}

// Every document stored the old way: the flat `markdownContent`, which a
// session with no tab list uses and a failed tab migration leaves behind, and
// every tab's `mandy-tab-N-content`. Found by scanning rather than through the
// tab list, so a session whose list is missing or names fewer tabs than storage
// holds is converted the same way. Each names its old pair and its new key.
function legacyStoredDocuments(storage) {
  const found = [];
  if (storage.getItem("markdownContent") !== null) {
    found.push({ content: "markdownContent", source: "markdownSource", markdown: DOCUMENT_KEYS.markdown });
  }
  for (let i = 0; i < storage.length; i++) {
    const match = /^mandy-tab-(\d+)-content$/.exec(storage.key(i) || "");
    if (!match) continue;
    const prefix = `mandy-tab-${match[1]}-`;
    found.push({ content: prefix + "content", source: prefix + "source", markdown: prefix + "markdown" });
  }
  return found;
}

// ── The old core's save path ─────────────────────────────────────────────────
//
// Turndown serialises to its own house style, so the old core put the opened
// file's bytes back for every block whose text still matched (the restore
// layer, `indexMarkdownBlocks` / `restoreSourceWrapping` in markdown-style.js)
// and re-wrapped the rest to the file's width (`reflowMarkdown`). Decision D1
// is the argument. Moved here from markdown-style.js and app.js in stage 4's
// slice 5, as written there, apart from what the move itself made untrue. The
// sniffers and `wrapMarkdownLine` stay in markdown-style.js, since the model
// calls them.

// A reference link's definition: "[label]: destination". Loose on purpose —
// this only has to stop reflowMarkdown tearing a long URL across two lines,
// so a false positive costs nothing (a line that is not really a definition
// just does not get wrapped either) while a false negative would corrupt one.
// The scan for the definitions themselves, below, reuses this same check
// rather than a second regex, so the two cannot silently disagree about what
// counts as one.
function isReferenceDefinitionLine(line) {
  return /^ {0,3}\[[^\]]+\]:\s*\S/.test(line);
}

// Re-wrapping is a guess at how the author broke their lines, and measured
// against this repo's own files it is a poor one: they break after a sentence,
// or let a line run long rather than split a link, and no width reproduces that.
// So rather than guess harder, keep the answer. Every run of non-blank lines in
// the opened file is indexed under a whitespace-insensitive key, and on save any
// block whose text still matches comes back as the bytes it arrived as.
//
// The index is keyed on content rather than position, which is what makes it
// affordable: there is no mapping into the DOM to keep correct, so none of the
// ways contenteditable rewrites the document -- splitting a node on Enter,
// merging two on Backspace, restoring stale markup on undo -- can invalidate it.
// A block that was edited simply misses, and falls back to the re-wrap below.
// The unit is one list item or one paragraph, not one blank-line-separated
// block, because the two sides disagree about blank lines: a tight list whose
// items contain sub-paragraphs is loose by CommonMark's definition, so
// markdown-it wraps each item in <p> and Turndown puts a blank line back
// between items the author wrote flush. Matching whole blocks would fail on
// every such list -- which in this repo's own docs/TODO.md is most of the file.
//
// Each segment therefore also carries the separator that followed it in its own
// document, so a restored run of items comes back as tight or loose the way the
// author had it rather than the way Turndown re-derived it.
function markdownSegments(markdown) {
  const segments = [];
  const lines = markdown.split("\n");
  let current = [];
  let fence = null;

  const push = (gap) => {
    if (current.length) segments.push({ text: current.join("\n"), gap });
    current = [];
  };

  // Every construct Turndown emits as its own block has to be its own segment
  // here too, or a source that ran two of them together -- a heading with the
  // fence directly under it, no blank line -- is one segment on this side and
  // two on the serialiser's, and neither can ever match the other.
  let closedFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);

    if (fence) {
      current.push(line);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) {
        fence = null;
        closedFence = true;
      }
      continue;
    }

    if (!line.trim()) {
      let end = i;
      while (end + 1 < lines.length && !lines[end + 1].trim()) end++;
      push("\n".repeat(end - i + 2));
      closedFence = false;
      i = end;
      continue;
    }

    if (
      current.length &&
      (closedFence ||
        match ||
        /^\s*([-*+]|\d+[.)])\s/.test(line) ||
        /^\s{0,3}#{1,6}\s/.test(line))
    ) {
      push("\n");
    }
    closedFence = false;

    if (match) fence = match[1];
    current.push(line);
  }
  push("");

  return segments;
}

// A pipe table is the one construct whose spacing is not the author's to keep:
// the `table` rule in app.js writes the document's commonest convention, not
// each table's own, so `|---|---|` and `| --- | --- |` are the same table and
// never the same key. Normalising both sides to one shape is what lets a table
// the author did not touch restore like every other block.
function normaliseTableRows(block) {
  const lines = block.split("\n");
  if (!lines.some(isTableDelimiterRow)) return block;
  return lines
    .map((line) => {
      const row = line.trim().replace(/\s*\|\s*/g, "|");
      // The dash run is a width, not a meaning -- only the colons around it say
      // anything -- and ours is always three however wide the author's was.
      return isTableDelimiterRow(row) ? row.replace(/-+/g, "-") : row;
    })
    .join("\n");
}

// The key has to ignore everything the serialiser rewrites, or a block that
// changed in no other way stops matching itself and falls through to layer 2 --
// rewritten and re-wrapped with no edit anywhere near it. Three things qualify.
//
// Turndown escapes punctuation that could reparse as markup ("1\." mid
// sentence). The table rule writes its own padding and its own dash run, which
// is what normaliseTableRows is for.
//
// And the **hard break**, which is TODO 2.3's cheap half. A break has two
// spellings -- a trailing backslash, or two trailing spaces -- and
// sniffMarkdownStyle picks one for the whole document, so Turndown writes the
// winner into every block before the restore layer runs. The two-space spelling
// survives the whitespace collapse below and the backslash does not, so a block
// written the minority way keyed differently from its own source and lost both
// its spelling and its line breaks without being touched. Dropping the
// backslash puts the two forms on the same key.
//
// **The emphasis delimiter is the other half of 2.3 and is deliberately not
// here.** The only normalisation available without parsing is folding `_` into
// `*`, and measured on tests/fixtures/torture.md that keys the rules `***` and
// `___` identically -- two different blocks, so the restore layer could hand
// back the wrong bytes, which is worse than the bug. Telling a delimiter from a
// snake_case identifier or a code span needs a parser, and a second parser free
// to disagree with the first is the thing TODO 3.1 exists to delete. The model
// records each node's spelling as written, so that half waits for it.
function markdownBlockKey(block) {
  return normaliseTableRows(block)
    .replace(/\\([^\w\s])/g, "$1")
    // Before the whitespace collapse, and per line: a trailing backslash is
    // only a break at the end of a line, and the trailing spaces that spell the
    // same thing have to go with it or the two still differ.
    .replace(/[ \t]*\\?$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Split off the document's own trailing newlines first: the last element of a
// split on "\n" is the terminator, not a blank line, and counting it as one
// grows the file by a line on every save.
function markdownBody(markdown) {
  const trailing = markdown.match(/\n*$/)[0];
  return [markdown.slice(0, markdown.length - trailing.length), trailing];
}

function indexMarkdownBlocks(markdown) {
  const index = new Map();
  const segments = markdownSegments(markdownBody(markdown)[0]);
  segments.forEach((segment, i) => {
    segment.next = segments[i + 1] || null;
  });
  for (const segment of segments) {
    const key = markdownBlockKey(segment.text);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(segment);
  }
  return index;
}

const LIST_ITEM_START = /^\s*([-*+]|\d+[.)])\s/;

// A restored segment's separator describes what followed it in the source, and
// a single "\n" is only safe in front of something that ends the block before
// it. Delete a list's last item and the item before it would hand its "\n" to
// the paragraph after the list, which then reparses as a lazy continuation of
// the item -- the paragraph saved into the bullet, nothing wrong on screen. So
// the source's separator stands when its successor is still the one that
// follows, or when a list item still follows a list item, which keeps a list
// tight with an item deleted or edited beside it. Anything else takes the
// serialiser's.
function restoredSeparator(original, next, nextOriginal, fallback) {
  if (!original || !original.gap) return fallback;
  if (original.gap !== "\n") return original.gap;
  if (nextOriginal && nextOriginal === original.next) return original.gap;
  if (
    original.next &&
    LIST_ITEM_START.test(original.next.text) &&
    LIST_ITEM_START.test(next.text)
  ) {
    return original.gap;
  }
  return fallback;
}

// Segments are consumed as they are matched, so a document repeating the same
// paragraph twice gets each original back in turn rather than the first twice.
function restoreSourceWrapping(markdown, index) {
  if (!index || !index.size) return markdown;

  const used = new Map();
  const [body, trailing] = markdownBody(markdown);
  const segments = markdownSegments(body);
  // Matched in a pass of their own, since a separator depends on what the next
  // segment matched as well as on what this one did.
  const originals = segments.map((segment) => {
    const key = markdownBlockKey(segment.text);
    const bucket = index.get(key);
    const taken = used.get(key) || 0;
    const original = bucket && taken < bucket.length ? bucket[taken] : null;
    if (original) used.set(key, taken + 1);
    return original;
  });
  let out = "";

  segments.forEach((segment, i) => {
    const original = originals[i];
    out += original ? original.text : segment.text;
    if (i === segments.length - 1) return;
    // A segment that ended its document carries no separator, so fall back to
    // the one the serialiser produced rather than running two segments together.
    out += restoredSeparator(original, segments[i + 1], originals[i + 1], segment.gap);
  });

  return out + trailing;
}

// Turndown emits each paragraph, list item and blockquote line as a single
// line however long it is, so this never has to join anything -- only break.
function reflowMarkdown(markdown, width) {
  if (!width) return markdown;

  const out = [];
  let fence = null;
  let displayMath = false;

  for (const line of markdown.split("\n")) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (match) {
      fence = match[1];
      out.push(line);
      continue;
    }

    // A `$$` alone on its line opens or closes a display block, and everything
    // between the two is TeX rather than prose whatever it looks like. After
    // the fence check, so `$$` inside a code block is just code.
    if (line.trim() === "$$") {
      displayMath = !displayMath;
      out.push(line);
      continue;
    }
    if (displayMath) {
      out.push(line);
      continue;
    }

    // A wrapped `|` row stops being a table, and a wrapped heading turns its
    // own tail into a paragraph. Both are silent -- the file still parses. A
    // wrapped reference definition is worse: the destination is one word with
    // nowhere to break, so wrapping would either leave it overlong anyway or
    // fold it onto a continuation line indented by an amount CommonMark never
    // promised meant anything -- simplest to leave the whole line alone.
    if (
      line.length <= width ||
      !line.trim() ||
      /^\s*[|#]/.test(line) ||
      hasMathSpan(line) ||
      isHorizontalRule(line, "") ||
      isReferenceDefinitionLine(line)
    ) {
      out.push(line);
      continue;
    }

    out.push(...wrapMarkdownLine(line, width));
  }

  return out.join("\n");
}


// The blocks of the stored document's source, so an untouched one comes back as
// the bytes it was opened with.
let legacySource = new Map();

// A reference definition has no representation in the parsed document at all
// -- markdown-it consumes the line silently, so there is nothing in the HTML to
// read it back from. The source's lines are kept here by label instead, and
// referenceAwareLink stamps which label each link resolved through, so the
// `referenceLink` rule below can look the line back up.
let legacyReferenceDefinitions = new Map();

// The labels a conversion actually used, so only those definitions come back.
let legacyUsedLabels = new Set();

// Whether a conversion is running. The two rules below are registered on app.js's
// shared Turndown service, which a paste and the table of contents also use,
// and neither rule may fire for those: a fragment has no definitions to point
// at, and no stored diagram can reach one.
let legacyConverting = false;

// CommonMark's own label matching: trim, collapse internal whitespace, fold
// case. It only has to agree with itself between the scan and the rule.
function normalizeReferenceLabel(label) {
  return (label || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Every single-line `[label]: destination "title"` in the source, keyed by
// label, as written. Deliberately narrow: a definition spanning lines is not
// seen, and a link resolved through one saves inline rather than losing its
// target.
function scanReferenceDefinitions(markdown) {
  const definitions = new Map();
  let fence = null;

  for (const line of (markdown || "").split("\n")) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }

    if (!isReferenceDefinitionLine(line)) continue;
    const label = line.match(/^ {0,3}\[([^\]]+)\]:/)[1];
    const key = normalizeReferenceLabel(label);
    // First definition wins: CommonMark's own precedence.
    if (!definitions.has(key)) definitions.set(key, line);
  }

  return definitions;
}

// The used definitions' own lines, after a blank line at the end of the
// document. A definition has no DOM node to track a position with, so
// "collected once at the end" was the old core's deliberate answer.
function appendReferenceDefinitions(markdown, usedLabels) {
  const lines = [];
  for (const key of usedLabels) {
    const line = legacyReferenceDefinitions.get(key);
    if (line) lines.push(line);
  }
  if (!lines.length) return markdown;
  return markdown.replace(/\n*$/, "\n") + "\n" + lines.join("\n") + "\n";
}

// `[text][label]` for a link whose label the source still defines; anything
// else falls through to Turndown's inline form.
turndownService.addRule("referenceLink", {
  filter: function (node) {
    if (!legacyConverting || node.nodeName !== "A") return false;
    const label = node.getAttribute("data-ref-label");
    return Boolean(label) && legacyReferenceDefinitions.has(normalizeReferenceLabel(label));
  },
  replacement: function (content, node) {
    const label = node.getAttribute("data-ref-label");
    legacyUsedLabels.add(normalizeReferenceLabel(label));
    return "[" + content + "][" + label + "]";
  },
});

// A Mermaid diagram drawn before diagrams were removed on 2026-10-01, which
// only stored HTML can still hold, goes back to the fence it came from. Without
// it the SVG's text would be written in the diagram's place.
turndownService.addRule("mermaid", {
  filter: function (node) {
    return legacyConverting && node.classList && node.classList.contains("mermaid-wrapper");
  },
  replacement: function (content, node) {
    const sourceElement = node.querySelector(".mermaid-source");
    if (sourceElement) {
      const source = sourceElement.textContent.trim();
      return "\n\n```mermaid\n" + source + "\n```\n\n";
    }
    return "";
  },
});

// The old core's whole save: Turndown, the definitions, the re-wrap to the
// sniffed width, and then the restore. Re-wrap first, restore second:
// restoring puts back original bytes, and the re-wrap must not then take a
// hand-broken line back apart.
function legacyHtmlToMarkdown(html) {
  legacyUsedLabels = new Set();
  legacyConverting = true;
  let markdown;
  try {
    markdown = htmlFragmentToMarkdown(html).replace(/\n*$/, "\n");
  } finally {
    legacyConverting = false;
  }
  const withReferences = appendReferenceDefinitions(markdown, legacyUsedLabels);
  const wrapped = reflowMarkdown(withReferences, markdownStyle.wrapWidth);
  return restoreSourceWrapping(wrapped, legacySource);
}

// Whether a stored document holds anything, read off its HTML. The model
// renderer's view attributes go before the comparison, since a document stored
// under the flag carries them.
function isBlankContent(html) {
  const trimmed = (html || "")
    .replace(/ data-block="\d+"/g, "")
    .replace(/ data-filler(="")?/g, "")
    .trim();
  return trimmed === "" || trimmed === "<p><br></p>" || trimmed === "<p></p>";
}

// ── The conversion ───────────────────────────────────────────────────────────

// One document's HTML as markdown, the way a save under the old core would have
// written it: legacyHtmlToMarkdown with the document's own source indexed, so every
// untouched block is restored to the bytes it was opened with.
//
// **An unchanged document is its source** (decision 2), decided by comparison
// and never by the `dirty` flag: a save clears the flag without rewriting
// `source`, so a document edited and then saved reads clean while `source`
// still holds the bytes it was opened with. So `source` is rendered, both it and
// the stored HTML go through the same converter, and `source` is taken only if
// the two come out the same.
function legacyConvertDocument(html, source) {
  if (source) adoptMarkdownStyle(source);
  else markdownStyleAdopt(null);
  legacySource = source ? indexMarkdownBlocks(source) : new Map();
  legacyReferenceDefinitions = source ? scanReferenceDefinitions(source) : new Map();
  const converted = legacyHtmlToMarkdown(html);
  if (source && legacyHtmlToMarkdown(md.render(source)) === converted) return source;
  return converted;
}

function legacyConvertStorage(storage) {
  if (storage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return;

  let failed = false;
  for (const doc of legacyStoredDocuments(storage)) {
    if (storage.getItem(doc.markdown) !== null) {
      // Converted on an earlier load, whose removal of the old pair did not
      // happen. The markdown is the document now.
      storage.removeItem(doc.content);
      storage.removeItem(doc.source);
      continue;
    }

    const html = storage.getItem(doc.content);
    let markdown;
    try {
      markdown = isBlankContent(html) ? "" : legacyConvertDocument(html, storage.getItem(doc.source));
    } catch (error) {
      // Nothing is removed, so the next load tries again and the HTML is still
      // there to try with. The document opens as blank this once.
      console.error(`[Storage] Could not convert ${doc.content}:`, error);
      failed = true;
      continue;
    }

    if (markdown === "") {
      // A blank document has nothing to keep, which is what no key means.
      storage.removeItem(doc.content);
      storage.removeItem(doc.source);
      continue;
    }

    // Write, read back, and only then remove what it came from — the same
    // order tabs.js's migration keeps, for the same reason: a blown quota does
    // not always throw.
    try {
      storage.setItem(doc.markdown, markdown);
      if (storage.getItem(doc.markdown) !== markdown) throw new Error("it did not survive the write");
    } catch (error) {
      console.warn(`[Storage] Could not store ${doc.markdown}; it will open from memory:`, error);
      try { storage.removeItem(doc.markdown); } catch { /* nothing was written */ }
      legacyPendingMarkdown.set(doc.markdown, markdown);
      failed = true;
      continue;
    }
    storage.removeItem(doc.content);
    storage.removeItem(doc.source);
  }

  // The conversion borrowed the shared style. Whatever document loads next
  // adopts its own.
  markdownStyleAdopt(null);
  legacySource = new Map();
  legacyReferenceDefinitions = new Map();

  if (!failed) {
    try {
      storage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
    } catch (error) {
      // Costs a scan on the next load, which finds nothing to convert.
      console.warn("[Storage] Could not record the storage version:", error);
    }
  }
}

try {
  legacyConvertStorage(localStorage);
} catch (error) {
  // No storage at all — a privacy mode that throws on access. There is nothing
  // to convert, and the app runs as it would with an empty autosave.
  console.warn("[Storage] Could not read the autosave to convert it:", error);
}
