// Document-only HTML export: the rendered document as a standalone page, the
// same kind of deliverable as PDF or DOCX. The editor is deliberately not part
// of it — that is what the Editable export in html-export.js is for.
//
// Names here are prefixed DOC_ because html-export.js already owns CLOSE and
// THEME_SCRIPT at global scope, and every file in front/ shares that scope.

const DOC_CLOSE = "</" + "script>";

// Follows the reader's OS preference. No toggle and no localStorage: this is a
// document, not the app, and the reader should not inherit the author's stored
// theme. Runs before the stylesheet so there is no flash of the wrong theme.
const DOC_THEME_SCRIPT =
  "<script>document.documentElement.setAttribute('data-theme'," +
  "window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)')" +
  ".matches?'dark':'light');" +
  DOC_CLOSE;

// Mermaid is not shipped with the document, so its diagrams keep the light
// palette they were rendered with. On a dark page they would otherwise be dark
// text on a dark card, so give them their own light backdrop.
const DOC_DIAGRAM_CSS = `
      [data-theme="dark"] .mermaid-wrapper {
        background: #ffffff;
        border-color: #d0d0d0;
      }`;

// The exported page is a document: drop the app chrome and the editor's own
// viewport-filling geometry, and let the content set the page height.
const DOC_LAYOUT_CSS = `
      body {
        background: var(--bg-primary);
      }

      #editor {
        min-height: 0;
        max-width: 900px;
        margin: 0 auto;
        outline: none;
      }`;

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function documentTitle() {
  const heading = editor.querySelector("h1");
  const text = heading && heading.textContent.trim();
  return text || "Document";
}

function documentFilename() {
  return `${slugifyTitle(documentTitle(), "document")}-${Date.now()}.html`;
}

// MathJax renders maths to CHTML, which is inert without the stylesheet MathJax
// generates at runtime. Copying it in keeps the maths laid out correctly with
// no MathJax in the exported file.
function mathJaxStyles() {
  return Array.from(document.querySelectorAll("style"))
    .filter((style) => style.id && style.id.startsWith("MJX"))
    .map((style) => style.textContent)
    .join("\n");
}

// The rendered document, stripped of everything that only means something
// inside the editor.
function documentBody() {
  const clone = editor.cloneNode(true);
  clone.removeAttribute("contenteditable");
  clone.removeAttribute("spellcheck");
  clone.removeAttribute("data-exported");

  // The editor resolves #anchors live on click, but this file ships no JS at
  // all, so a table of contents only works here if the ids are real. Stamped on
  // the clone rather than on the document, so nothing lands in the editor and
  // nothing can reach Turndown.
  headingAnchors(clone, true);

  for (const source of clone.querySelectorAll(".mermaid-source")) {
    source.remove();
  }
  for (const wrapper of clone.querySelectorAll(".mermaid-wrapper")) {
    wrapper.removeAttribute("contenteditable");
  }

  return clone.innerHTML;
}

// An exported document has no origin to fetch from, but it is already carrying
// the stylesheet inline — read that rather than the network.
async function documentStylesheet() {
  const inlined = document.getElementById("app-style");
  if (inlined) return inlined.textContent;

  const res = await fetch("/app.css");
  // fetch() resolves on 404, so verify rather than trust: a bad response would
  // otherwise be inlined as the document's stylesheet.
  if (!res.ok) throw new Error(res.statusText);
  return res.text();
}

onToolbarAction("export-html", async () => {
  let cssContent;
  try {
    cssContent = await documentStylesheet();
  } catch (err) {
    console.error("[Export] Could not read app.css:", err);
    alert(
      `Export failed: ${err.message}.\n\n` +
        "Exporting only works from the running Marky app.",
    );
    return;
  }

  const title = documentTitle();
  const htmlContent = `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    ${DOC_THEME_SCRIPT}
    <style>
${cssContent}
${DOC_LAYOUT_CSS}
${DOC_DIAGRAM_CSS}
${mathJaxStyles()}
    </style>
</head>
<body>
    <div id="editor">
${documentBody()}
    </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = documentFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
