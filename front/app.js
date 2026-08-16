const md = window.markdownit();
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  // Turndown's default is "* * *", which almost nobody writes by hand, so every
  // file with a horizontal rule came back with a changed line for no reason.
  // This is still a fixed house style rather than one matched to the file --
  // see the style question in TODO.md -- but "---" is the convention that loses
  // the fewest diffs. Safe against setext: Turndown always surrounds the rule
  // with blank lines, so "---" can never attach to a paragraph as an underline.
  hr: "---",
});

// Turndown rule to convert mermaid wrappers back to markdown code blocks
turndownService.addRule("mermaid", {
  filter: function (node) {
    return node.classList && node.classList.contains("mermaid-wrapper");
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

// The LaTeX counterpart of the mermaid rule above. MathJax renders the source
// away, so without this a save writes the rendered glyphs back to the file:
// $$\frac{a}{b}$$ returns as "ab", and there is no getting it back.
// renderers.js stamps data-tex while the TeX is still recoverable.
turndownService.addRule("mathjax", {
  filter: function (node) {
    return node.nodeName === "MJX-CONTAINER" && node.hasAttribute("data-tex");
  },
  // No surrounding newlines for display maths: an equation that was its own
  // paragraph is the only child of its <p>, so Turndown's own block handling
  // gives it the blank lines. Forcing them here would instead split a sentence
  // that happened to contain $$…$$ into three paragraphs.
  replacement: function (content, node) {
    const delimiter = node.getAttribute("data-display") === "block" ? "$$" : "$";
    return delimiter + node.getAttribute("data-tex") + delimiter;
  },
});

// One slug for every export filename. Kept here rather than in any one export
// module because app.js loads before all three of them, in index.html and in
// the editable export's bundle alike.
//
// The trims are load-bearing, not tidiness: a title starting with an emoji
// ("👋 Welcome to Marky") strips to a leading space, which then becomes a
// leading hyphen in the filename.
function slugifyTitle(text, fallback) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .substring(0, 50)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

const editor = document.getElementById("editor");
// fileInput only exists in exported HTML files, which have no server behind
// them; the app itself uses the file API instead.
const fileInput = document.getElementById("fileInput");
const formatBar = document.getElementById("formatBar");

// Turndown's output never ends in a newline, so every saved file was one git
// reports as "\ No newline at end of file". Normalised here rather than in
// saveFile because Download MD writes a file too, and a copied document that
// ends in a newline is what the clipboard's consumers expect anyway.
function htmlToMarkdown(html) {
  return turndownService.turndown(html).replace(/\n*$/, "\n");
}

function markdownToHtml(markdown) {
  return md.render(markdown);
}

// ── Button handlers ──────────────────────────────────────────────────────────

// Registered by action name, not bound to an element: download and upload only
// exist in exported documents, and registering an action nothing renders is
// harmless.
onToolbarAction("download-md", () => {
  const markdown = htmlToMarkdown(editor.innerHTML);

  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "document.md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

onToolbarAction("upload-md", () => {
  if (fileInput) fileInput.click();
});

onToolbarAction("copy-md", async (button) => {
  const markdown = htmlToMarkdown(editor.innerHTML);

  try {
    await navigator.clipboard.writeText(markdown);
    const originalText = button.innerHTML;
    button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!`;
    setTimeout(() => {
      button.innerHTML = originalText;
    }, 2000);
  } catch (err) {
    alert("Unable to copy to clipboard. Please grant clipboard permissions.");
  }
});

onToolbarAction("clear", () => {
  if (
    confirm(
      "Are you sure you want to clear the document? This will remove all content and auto-saved data.",
    )
  ) {
    editor.innerHTML = "<p><br></p>";
    localStorage.removeItem("markdownContent");

    editor.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(editor.firstChild, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

onToolbarAction("paste-md", async () => {
  try {
    const clipboardText = await navigator.clipboard.readText();
    if (clipboardText && clipboardText.trim()) {
      const html = markdownToHtml(clipboardText);
      editor.innerHTML = html;
      await renderMermaidDiagrams(editor);
      await renderLatex(editor);
      localStorage.setItem("markdownContent", editor.innerHTML);
    }
  } catch (err) {
    alert("Unable to access clipboard. Please grant clipboard permissions.");
  }
});

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const markdown = event.target.result;
      const html = markdownToHtml(markdown);
      editor.innerHTML = html;
      await renderMermaidDiagrams(editor);
      await renderLatex(editor);
      localStorage.setItem("markdownContent", editor.innerHTML);
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}

// --- Links -----------------------------------------------------------------
//
// Two problems, and the anchors are the bigger one. Inside a contenteditable
// the browser treats a link as text to put the caret in and will not navigate
// on a modifier either, so nothing here is free. And markdown-it does not slug
// headings — heading ids are GitHub's extension, not part of the spec — so a
// table of contents arrives with every link pointing at an element that does
// not exist. Making the destination exist is most of the work.

// Deliberately NOT slugifyTitle: that one strips non-ASCII (so "Ünïcode
// Heading" becomes "ncode-heading" while the href markdown-it wrote is
// "#ünïcode-heading") and truncates at 50 characters, and it is shared by all
// four export filenames, so it must not be bent to fit this.
function anchorSlug(text) {
  return (text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

// Slugs are resolved against the live document on every click rather than
// stamped onto the headings once, because an id assigned at render time goes
// stale the moment someone edits the heading. `stamp` is for the static export,
// which has no JS to resolve anything and needs real id attributes.
//
// Duplicate headings get GitHub's -1, -2 suffixes, so a document with two
// "Notes" sections still addresses both.
function headingAnchors(root, stamp = false) {
  const counts = new Map();
  const anchors = new Map();

  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const base = anchorSlug(heading.textContent);
    if (!base) continue;

    const seen = counts.get(base) || 0;
    counts.set(base, seen + 1);
    const slug = seen ? `${base}-${seen}` : base;

    anchors.set(slug, heading);
    if (stamp) heading.id = slug;
  }

  return anchors;
}

// An href out of a document Marky did not write — a file off disk, or an
// editable export that arrived by mail. `javascript:` through window.open would
// run in the app's own origin, next to the file API, so this is an allowlist
// rather than a blocklist.
const LINK_SCHEMES = ["http:", "https:", "mailto:"];

// scrollIntoView would park the heading under the toolbar, which is sticky at
// top: 0 — so the jump lands on a heading the reader cannot see. Measured from
// the live element rather than repeating the 69px min-height from app.css,
// which is a magic number already and wrong once the toolbar wraps to two rows.
function scrollToAnchor(target) {
  const toolbar = document.querySelector(".toolbar");
  const clearance = toolbar ? toolbar.getBoundingClientRect().height + 12 : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - clearance;

  window.scrollTo({
    top: Math.max(top, 0),
    // Setting location.hash instead would pile up history entries and, in an
    // exported file opened from file://, rewrite the URL for no benefit.
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

function openExternalLink(href) {
  let url;
  try {
    // No base, so a relative href throws and is left inert. That is the
    // documented first cut: resolving ./notes.md against the origin just 404s
    // off the static handler, and opening it in Marky is a bigger feature. See
    // TODO.md before making relative links do something.
    url = new URL(href);
  } catch {
    return;
  }

  if (!LINK_SCHEMES.includes(url.protocol)) return;
  window.open(url.href, "_blank", "noopener");
}

editor.addEventListener("click", (e) => {
  // Plain click has to keep placing the caret, or link text becomes uneditable.
  if (!e.metaKey && !e.ctrlKey) return;

  const link = e.target.closest && e.target.closest("a");
  const href = link && link.getAttribute("href");
  if (!href) return;

  e.preventDefault();

  if (href.startsWith("#")) {
    // markdown-it percent-encodes non-ASCII in the attribute, so decode before
    // matching against a slug that kept its unicode.
    let wanted = href.slice(1);
    try {
      wanted = decodeURIComponent(wanted);
    } catch {
      // A malformed escape is not worth failing over; match it raw.
    }
    const target = headingAnchors(editor).get(wanted);
    if (target) scrollToAnchor(target);
    return;
  }

  openExternalLink(href);
});

// The hint is a CSS variable rather than a title attribute on each link:
// Turndown serialises a title into the markdown as [text](href "title"), so
// stamping one would write the tooltip into the user's file. app.css draws it
// from a :hover pseudo-element, which never enters the DOM at all.
document.documentElement.style.setProperty(
  "--link-hint",
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '"Cmd+Click to open link"'
    : '"Ctrl+Click to open link"',
);

editor.addEventListener("paste", (e) => {
  e.preventDefault();

  const html = e.clipboardData.getData("text/html");
  const text = e.clipboardData.getData("text/plain");

  if (html && html.trim()) {
    document.execCommand("insertHTML", false, html);
  } else if (text && text.trim()) {
    document.execCommand("insertText", false, text);
  }
});

let saveTimer;
editor.addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem("markdownContent", editor.innerHTML);
  }, 1000);
});

function isBlankContent(html) {
  const trimmed = (html || "").trim();
  return trimmed === "" || trimmed === "<p><br></p>" || trimmed === "<p></p>";
}

// The welcome document is markdown like any other, not markup baked into the
// page. Returns false if it cannot be fetched so startup can carry on with an
// empty editor rather than dying on the welcome text.
async function loadWelcomeDocument() {
  try {
    const res = await fetch("/welcome.md");
    if (!res.ok) throw new Error(res.statusText);
    editor.innerHTML = markdownToHtml(await res.text());
    return true;
  } catch (error) {
    console.error("[Welcome] Could not load welcome.md:", error);
    editor.innerHTML = "<p><br></p>";
    return false;
  }
}

window.addEventListener("load", () => {
  const saved = localStorage.getItem("markdownContent");
  const isExported = editor.hasAttribute("data-exported");

  (async () => {
    if (isExported) {
      // Exported HTML file: keep the embedded content, ignore localStorage
      editor.removeAttribute("data-exported");
    } else if (saved && !isBlankContent(saved)) {
      editor.innerHTML = saved;
    } else {
      if (saved) localStorage.removeItem("markdownContent");
      await loadWelcomeDocument();
    }

    try {
      await renderMermaidDiagrams(editor);
    } catch (error) {
      console.error("[Mermaid] Startup render error:", error);
    }
    try {
      await renderLatex(editor);
    } catch (error) {
      console.error("[MathJax] Startup render error:", error);
    }
  })();
});

window.addEventListener("beforeunload", () => {
  const currentContent = editor.innerHTML.trim();
  // Check if content is empty or just the empty paragraph placeholder
  const willSave =
    currentContent &&
    currentContent !== "<p><br></p>" &&
    currentContent !== "<p></p>" &&
    currentContent !== "";

  // Only save if content is not essentially empty
  if (willSave) {
    localStorage.setItem("markdownContent", editor.innerHTML);
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

// Returns the <li> the caret is in, or null. Scoped to the editor: a selection
// in a list somewhere else on the page is not ours to indent.
function listItemAtCaret() {
  const anchor = window.getSelection().anchorNode;
  const element = anchor && (anchor.closest ? anchor : anchor.parentElement);
  const item = element && element.closest && element.closest("li");
  return item && editor.contains(item) ? item : null;
}

// Chrome's execCommand puts the nested list beside the item it belongs to
// rather than inside it, so the parent list is one hop further up than the
// spec shape suggests. Look for either.
function isNested(item) {
  const list = item.parentElement;
  return !!(list && list.parentElement && list.parentElement.closest("ul, ol"));
}

// Tab indents a bullet instead of moving focus — but only inside a list, and
// only where the nesting is expressible: markdown cannot write a first item
// nested under nothing, and Turndown would emit an indent that parses back as
// a code block. Shift+Tab only unnests; plain outdent turns a top-level item
// into a paragraph, which is a formatting change, not an indent. Everywhere
// else Tab keeps its default job of leaving the editor, which is a keyboard
// user's only way out.
editor.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;

  const item = listItemAtCaret();
  if (!item) return;

  if (e.shiftKey) {
    if (!isNested(item)) return;
    e.preventDefault();
    document.execCommand("outdent");
    return;
  }

  if (!item.previousElementSibling) return;
  e.preventDefault();
  document.execCommand("indent");
});

document.addEventListener("keydown", (e) => {
  // Save/open bind to the blob fallbacks only where those buttons are rendered,
  // i.e. in exported documents. In the app itself file-api.js owns Ctrl+S and
  // Ctrl+O, and talks to the server instead.
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && toolbarButton("download-md")) {
    e.preventDefault();
    runToolbarAction("download-md");
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "o" && toolbarButton("upload-md")) {
    e.preventDefault();
    runToolbarAction("upload-md");
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
    e.preventDefault();
    runToolbarAction("export-pdf");
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    document.execCommand("undo");
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") {
    e.preventDefault();
    document.execCommand("redo");
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "y") {
    e.preventDefault();
    document.execCommand("redo");
  }
});
