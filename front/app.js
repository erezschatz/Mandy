const md = window.markdownit();
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
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

function htmlToMarkdown(html) {
  return turndownService.turndown(html);
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
