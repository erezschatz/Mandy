const md = window.markdownit();

// markdown-it has never heard of maths. `$…$` reaches MathJax only because it
// passes through as text, which means every inline rule runs *inside* the
// equation on the way past. CommonMark's backslash escapes are the ones that
// bite: `$$\mathbb{N} = \{ a \}$$` arrives as `\mathbb{N} = { a }`, renders
// without the braces and is then saved that way. Emphasis and links do it too,
// verified against markdown-it 13: `$x = a*b*c$` loses both asterisks and
// italicises `b`, and `$[x](y)$` becomes a link. Spacing decides it, which is
// why this looks intermittent — `$a * b * c$` survives untouched.
//
// So claim the span before any other rule can see it. `mathSpan` finds the
// delimiters, a rule ahead of `escape` consumes them, and the renderer writes
// the source back out verbatim. Nothing downstream moves: the document still
// carries `$…$` as text for MathJax to typeset, `containsLatex` still matches
// it, and `data-tex` still carries the TeX back through a save.
//
// Display maths broken across a blank line is not handled and does not need to
// be — a blank line inside `$$…$$` is an error in TeX itself, and markdown-it
// has split the paragraph in two long before any inline rule runs.

// The maths span opening at `start`, or null. Apart from the markdown-it
// plumbing below because the delimiters are the part with judgement in them:
// this is what tells an equation from a price, and it is testable on its own.
function mathSpan(src, start) {
  if (src[start] !== "$") return null;

  const display = src[start + 1] === "$";
  let pos = start + (display ? 2 : 1);

  // `$5 and $10` is prose. Two rules keep it prose: an opening delimiter is
  // never followed by whitespace, and a closing one is never followed by a
  // digit. Display maths needs neither -- `$$` does not occur in prices.
  if (!display && (pos >= src.length || /\s/.test(src[pos]))) return null;

  while (pos < src.length) {
    if (src[pos] === "\\") {
      pos += 2; // `\$` is a literal dollar and does not close the span
      continue;
    }
    if (src[pos] !== "$") {
      pos++;
      continue;
    }
    if (display) {
      if (src[pos + 1] === "$") {
        return { content: src.slice(start + 2, pos), end: pos + 2, display: true };
      }
      pos++; // a lone `$` inside display maths
      continue;
    }
    if (/\d/.test(src[pos + 1] || "")) {
      pos++;
      continue;
    }
    if (pos === start + 1) return null; // `$$` is not an empty inline equation
    return { content: src.slice(start + 1, pos), end: pos + 1, display: false };
  }
  return null; // unterminated: leave it as the prose it probably is
}

function mathRule(state, silent) {
  if (state.src[state.pos] !== "$") return false;

  const span = mathSpan(state.src, state.pos);
  if (!span) return false;

  if (!silent) {
    const token = state.push("math", "", 0);
    token.markup = span.display ? "$$" : "$";
    token.content = span.content;
  }
  state.pos = span.end;
  return true;
}

md.inline.ruler.before("escape", "math", mathRule);
md.renderer.rules.math = function (tokens, idx) {
  const token = tokens[idx];
  return token.markup + md.utils.escapeHtml(token.content) + token.markup;
};

// The conventions of the document currently open. Replaced wholesale every time
// a document arrives with markdown to read; until then these are Turndown's own
// defaults, so a session that never opens a file serialises exactly as it did
// before markdown-style.js existed.
let markdownStyle = Object.assign({}, MARKDOWN_STYLE_DEFAULTS);

// The blocks of the document as it arrived, so an untouched one can be saved
// back as the bytes it came in as rather than as Turndown's rendering of it.
let markdownSource = new Map();

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: markdownStyle.hr,
  bulletListMarker: markdownStyle.bulletListMarker,
  emDelimiter: markdownStyle.emDelimiter,
  strongDelimiter: markdownStyle.strongDelimiter,
});

// Turndown reads its options object on each replacement rather than closing
// over it, so the serialiser can be re-styled in place. It has to be: the rules
// below are registered against this instance, and rebuilding it to change an
// option would drop them.
// Persisted next to the autosave because the autosave is HTML: a reload
// restores the document but carries no markdown to re-read, so without this the
// style and the source index are gone and the first save after any reload
// rewrites the whole file in the defaults. Stored as the source rather than as
// the derived style so both come back from one string.
function adoptMarkdownStyle(markdown, remember = true) {
  markdownStyle = sniffMarkdownStyle(markdown);
  markdownSource = indexMarkdownBlocks(markdown);
  if (remember) {
    try {
      localStorage.setItem("markdownSource", markdown);
    } catch (error) {
      // A document too big for the quota still edits and saves; it just loses
      // byte fidelity across a reload.
      console.warn("[Style] Could not persist the source document:", error);
    }
  }
  turndownService.options.hr = markdownStyle.hr;
  turndownService.options.bulletListMarker = markdownStyle.bulletListMarker;
  turndownService.options.emDelimiter = markdownStyle.emDelimiter;
  turndownService.options.strongDelimiter = markdownStyle.strongDelimiter;
}

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

// Turndown 7 ships no table rule -- GFM tables live in turndown-plugin-gfm,
// which this project does not carry -- so a <table> fell through to the default
// and every cell came back as its own paragraph. Opening a document containing
// a table and saving it destroyed the table outright, unrecoverably, and the
// editor showed nothing wrong either side of the save. markdown-it parses pipe
// tables on the way in, so they have to come back out.
function tableCellContent(content) {
  // A newline inside a cell ends the row, and a bare pipe starts a new cell.
  return content.trim().replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
}

// Read off the style attribute rather than cell.style, which the exported
// document and the test stub do not both implement the same way. markdown-it
// writes alignment there and nowhere else.
function tableColumnRule(cell) {
  const style = cell.getAttribute("style") || "";
  const align = (cell.getAttribute("align") || "").toLowerCase() ||
    (style.match(/text-align:\s*(left|center|right)/) || [])[1] ||
    "";
  if (align === "center") return ":-:";
  if (align === "right") return "--:";
  if (align === "left") return ":--";
  return "---";
}

// GFM has no table without a delimiter row, so whichever row comes first is the
// header whether or not it is made of <th> -- pasted HTML often is not.
function isFirstTableRow(node) {
  if (node.previousElementSibling) return false;
  const section = node.parentNode;
  if (!section || section.nodeName === "TABLE") return true;
  return !section.previousElementSibling;
}

turndownService.addRule("tableCell", {
  filter: ["th", "td"],
  replacement: function (content) {
    return " " + tableCellContent(content) + " |";
  },
});

turndownService.addRule("tableRow", {
  filter: "tr",
  replacement: function (content, node) {
    const row = "|" + content;
    if (!isFirstTableRow(node)) return "\n" + row;
    const rule = Array.prototype.map
      .call(node.children, (cell) => " " + tableColumnRule(cell) + " |")
      .join("");
    return "\n" + row + "\n|" + rule;
  },
});

turndownService.addRule("tableSection", {
  filter: ["thead", "tbody", "tfoot"],
  replacement: function (content) {
    return content;
  },
});

turndownService.addRule("table", {
  filter: "table",
  replacement: function (content) {
    return "\n\n" + content.trim() + "\n\n";
  },
});

// Turndown has no autolink output, so `<http://example.com>` came back as the
// four-times-longer [http://example.com](http://example.com). Only offered to
// documents that already write them, since the expansion is otherwise the form
// the author chose.
turndownService.addRule("autolink", {
  filter: function (node) {
    if (!markdownStyle.autolinks || node.nodeName !== "A") return false;
    const href = node.getAttribute("href");
    // A scheme is what makes an autolink an autolink. Without this check
    // [notes](notes.md) -- whose text and href also match -- becomes
    // <notes.md>, which CommonMark renders as literal text, not a link.
    if (!href || !/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    return href === node.textContent && !node.getAttribute("title");
  },
  replacement: function (content, node) {
    return "<" + node.getAttribute("href") + ">";
  },
});

// Turndown hardcodes "*   one" and "1.  one" -- marker plus three or two spaces
// -- which is legal, uncommon, and enough on its own to touch every list line
// in the file. The pad and the numbering come from the document instead.
turndownService.addRule("listItem", {
  filter: "li",
  replacement: function (content, node, options) {
    const parent = node.parentNode;
    let marker;
    if (parent.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      const number = markdownStyle.orderedAllOnes
        ? 1
        : start
          ? Number(start) + index
          : index + 1;
      marker = number + markdownStyle.orderedDelimiter + " ".repeat(markdownStyle.orderedPad);
    } else {
      let depth = -1;
      for (let up = node; up; up = up.parentNode) {
        if (up.nodeName === "UL" || up.nodeName === "OL") depth++;
      }
      const level = markdownStyle.bulletsByDepth[depth];
      marker = (level ? level.marker : options.bulletListMarker) +
        " ".repeat(level ? level.pad : markdownStyle.bulletPad);
    }

    // Continuations align with the content, not the marker, or a nested block
    // falls out of its item.
    const body = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "\n")
      .replace(/\n/gm, "\n" + " ".repeat(marker.length));

    return marker + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
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

// Turndown decides how much leading/trailing whitespace to pull out of an
// inline element before any rule's filter or replacement runs -- it is baked
// into the node during Turndown's own upfront tree walk -- so an addRule
// override cannot intercept a real space at the edge of a code span; Turndown
// always moves it outside the backticks and drops it, saving `` `> ` `` as
// `` `>` ``. Swapping the edge space for a placeholder before Turndown ever
// parses the string sidesteps that: the placeholder is not whitespace, so
// Turndown leaves it exactly where it is, and htmlToMarkdown decodes it back
// once Turndown is done. A code span shielded on both edges gets two
// placeholders per edge rather than one, because CommonMark itself strips a
// single leading-and-trailing space pair from a code span's content -- the
// escape hatch for a span that needs to start with a backtick -- so a lone
// placeholder on each side would come back stripped on the next parse.
const CODE_EDGE_SPACE = String.fromCharCode(0xe000);

function shieldCodeEdgeSpaces(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("code").forEach((node) => {
    const hasSiblings = node.previousSibling || node.nextSibling;
    const isCodeBlock = node.parentNode.nodeName === "PRE" && !hasSiblings;
    if (isCodeBlock) return;
    const text = node.textContent;
    if (!text || text.trim() === "") return;
    const leading = /^ /.test(text);
    const trailing = / $/.test(text);
    if (!leading && !trailing) return;
    const pad = leading && trailing ? CODE_EDGE_SPACE + CODE_EDGE_SPACE : CODE_EDGE_SPACE;
    let next = text;
    if (leading) next = pad + next.slice(1);
    if (trailing) next = next.slice(0, -1) + pad;
    node.textContent = next;
  });
  return container.innerHTML;
}

// Turndown's output never ends in a newline, so every saved file was one git
// reports as "\ No newline at end of file". Normalised here rather than in
// saveFile because Download MD writes a file too, and a copied document that
// ends in a newline is what the clipboard's consumers expect anyway.
function htmlToMarkdown(html) {
  const markdown = turndownService.turndown(shieldCodeEdgeSpaces(html))
    .replace(new RegExp(CODE_EDGE_SPACE, "g"), " ")
    .replace(/\n*$/, "\n");
  // Re-wrap first, restore second: restoring puts back original bytes, and the
  // re-wrap must not then take a hand-broken line back apart.
  const wrapped = reflowMarkdown(markdown, markdownStyle.wrapWidth);
  return restoreSourceWrapping(wrapped, markdownSource);
}

// The only place markdown enters the document, which is why the sniff lives
// here rather than at the four call sites -- open, upload, paste and the
// welcome document all route through it, and a fifth would be easy to forget.
function markdownToHtml(markdown) {
  adoptMarkdownStyle(markdown);
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
    notify("Unable to copy to clipboard. Please grant clipboard permissions.", {
      severity: "error",
    });
  }
});

onToolbarAction("clear", async () => {
  // Cancel is the default action, so Enter and Escape both do the safe thing.
  // The wording still says nothing about the open file or whether there is
  // anything unsaved to lose — that is TODO 1.8's, along with the third
  // Save option this dialog can now express and confirm() could not.
  const confirmed = await ask(
    "This removes all content and the auto-saved copy.",
    {
      title: "Clear the document?",
      severity: "warn",
      actions: [
        { label: "Cancel", value: false, variant: "quiet", default: true },
        { label: "Clear", value: true, variant: "danger" },
      ],
    },
  );
  if (!confirmed) return;

  editor.innerHTML = "<p><br></p>";
  localStorage.removeItem("markdownContent");
  localStorage.removeItem("markdownSource");
  // Or a block of the cleared document could come back on the next save.
  markdownStyle = Object.assign({}, MARKDOWN_STYLE_DEFAULTS);
  markdownSource = new Map();

  editor.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.setStart(editor.firstChild, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
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
    notify("Unable to access clipboard. Please grant clipboard permissions.", {
      severity: "error",
    });
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
      // Re-adopt rather than re-render: the document is already restored, and
      // this only needs the style and the block index the markdown carries.
      const source = localStorage.getItem("markdownSource");
      if (source) adoptMarkdownStyle(source, false);
    } else {
      if (saved) localStorage.removeItem("markdownContent");
      localStorage.removeItem("markdownSource");
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
