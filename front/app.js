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

const editor = document.getElementById("editor");
const downloadBtn = document.getElementById("downloadBtn");
const exportBtn = document.getElementById("exportBtn");
const pdfBtn = document.getElementById("pdfBtn");
const uploadBtn = document.getElementById("uploadBtn");
const pasteBtn = document.getElementById("pasteBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const fileInput = document.getElementById("fileInput");
const formatBar = document.getElementById("formatBar");

let initialContent = editor.innerHTML;
let currentSelection = null;

function htmlToMarkdown(html) {
  return turndownService.turndown(html);
}

function markdownToHtml(markdown) {
  return md.render(markdown);
}

// ── Button handlers ──────────────────────────────────────────────────────────

downloadBtn.addEventListener("click", () => {
  const html = editor.innerHTML;
  const markdown = htmlToMarkdown(html);

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

uploadBtn.addEventListener("click", () => {
  fileInput.click();
});

copyBtn.addEventListener("click", async () => {
  const html = editor.innerHTML;
  const markdown = htmlToMarkdown(html);

  try {
    await navigator.clipboard.writeText(markdown);
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!`;
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
    }, 2000);
  } catch (err) {
    alert("Unable to copy to clipboard. Please grant clipboard permissions.");
  }
});

clearBtn.addEventListener("click", () => {
  if (
    confirm(
      "Are you sure you want to clear the document? This will remove all content and auto-saved data.",
    )
  ) {
    editor.innerHTML = "<p><br></p>";
    localStorage.removeItem("markdownContent");

    // Debug logging
    console.log("=== MARKY CLEAR DEBUG ===");
    console.log(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          action: "Clear button clicked",
          editorContent: editor.innerHTML,
          localStorageRemoved: true,
          remainingKeys: Object.keys(localStorage),
        },
        null,
        2,
      ),
    );

    editor.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    range.setStart(editor.firstChild, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

pasteBtn.addEventListener("click", async () => {
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

window.addEventListener("load", () => {
  const saved = localStorage.getItem("markdownContent");
  const theme = localStorage.getItem("marky-theme");
  const isExported = editor.hasAttribute("data-exported");

  // Check if saved content is essentially empty
  const savedTrimmed = saved ? saved.trim() : "";
  const isEmptyContent =
    !saved ||
    savedTrimmed === "" ||
    savedTrimmed === "<p><br></p>" ||
    savedTrimmed === "<p></p>";

  // Check if current editor content is the default welcome message
  const currentContent = editor.innerHTML.trim();
  const isCurrentContentDefault =
    currentContent.includes("👋 Welcome to Marky") &&
    currentContent.includes("Quick Start");
  const isCurrentContentEmpty =
    !currentContent ||
    currentContent === "<p><br></p>" ||
    currentContent === "<p></p>";

  if (isExported) {
    // Exported HTML file: keep the embedded content, ignore localStorage
    editor.removeAttribute("data-exported");
    console.log("✓ Keeping embedded content (exported HTML file)");
  } else if (saved && !isEmptyContent) {
    // Load from localStorage if we have valid saved content
    editor.innerHTML = saved;
    console.log("✓ Loaded saved content from localStorage");
  } else if (isCurrentContentDefault || isCurrentContentEmpty) {
    // Only load default content if current content is the default or empty
    editor.innerHTML = defaultContent;
    console.log("✓ Loaded default welcome content");
    if (saved) {
      localStorage.removeItem("markdownContent");
      console.log("✓ Removed empty content from localStorage");
    }
  } else {
    console.log("✓ Keeping existing editor content");
  }

  (async () => {
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

  // Debug logging
  console.log("=== MARKY BEFOREUNLOAD DEBUG ===");
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        editorContent: {
          raw: currentContent.substring(0, 100) + "...",
          length: currentContent.length,
          trimmedLength: currentContent.trim().length,
          isEmpty: currentContent === "<p><br></p>",
          isEmptyOrWhitespace: !currentContent || currentContent.trim() === "",
        },
        decision: {
          willSave: willSave,
          reason: willSave
            ? "Content is not empty"
            : "Content is empty - not saving",
        },
      },
      null,
      2,
    ),
  );

  // Only save if content is not essentially empty
  if (willSave) {
    localStorage.setItem("markdownContent", editor.innerHTML);
    console.log("✓ Saved content to localStorage on beforeunload");
  } else {
    console.log("✗ Skipped saving empty content on beforeunload");
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    downloadBtn.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "o") {
    e.preventDefault();
    uploadBtn.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
    e.preventDefault();
    pdfBtn.click();
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
