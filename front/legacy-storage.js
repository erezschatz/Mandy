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
// whose htmlToMarkdown it converts with, and before tabs.js and file-api.js,
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

// One document's HTML as markdown, the way a save under the old core would have
// written it: htmlToMarkdown with the document's own source handed in, so every
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
  const converted = htmlToMarkdown(html);
  if (source && htmlToMarkdown(md.render(source)) === converted) return source;
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
