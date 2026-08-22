// These are built as plain strings rather than inline in the template literal.
// Escaping a closing script tag as "<\\/script>" inside a ${...} expression is
// evaluated as JS, so it emits a literal backslash — invalid HTML that leaves
// the script element unclosed and swallows the rest of the document. This file
// is loaded externally and is not bundled into the export, so a plain closing
// tag is correct here.
const CLOSE = "</" + "script>";

const MERMAID_TAG =
  '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js">' +
  CLOSE;

// Exported documents follow the reader's OS preference. Deliberately no
// localStorage and no toggle: this is a document, not the app, and the
// recipient should not inherit the author's stored preference. Runs before the
// stylesheet so there is no flash of the wrong theme.
//
// It stamps the variant in the same breath, for the same reason and in the same
// slot: with no toggle and no file on disk the toolbar has no second row, and
// app.css reserves a shorter bar for that. Both have to be known before the
// stylesheet is read or the page paints one shape and settles into another —
// the check cannot wait for toolbar.js to build the row, because "the row is
// not there yet" and "there is no row" look identical until it has.
const THEME_SCRIPT =
  "<script>document.documentElement.setAttribute('data-theme'," +
  "window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)')" +
  ".matches?'dark':'light');" +
  "document.documentElement.setAttribute('data-variant','export');" +
  CLOSE;

// Diagrams are exported as SVG with the light Mermaid palette baked in, so a
// dark-mode reader would otherwise get a dark page with light diagrams.
const MERMAID_RETHEME_SCRIPT =
  "<script>if(document.documentElement.getAttribute('data-theme')==='dark'" +
  "&&typeof reRenderMermaidWithTheme==='function'){reRenderMermaidWithTheme('dark');}" +
  CLOSE;

const MATHJAX_TAGS =
  "<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']]," +
  "displayMath:[['$$','$$'],['\\\\[','\\\\]']]},options:{skipHtmlTags:" +
  "['script','noscript','style','textarea','pre','code']," +
  'ignoreHtmlClass:"mermaid-wrapper"}};' +
  CLOSE +
  '<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js">' +
  CLOSE;

// Same shape as the other three exports, each of which slugs the document's own
// h1 through slugifyTitle in app.js. The "-editable" is this one's own: the
// static export produces a filename of exactly the same form, and a recipient
// with both in their downloads has nothing else to tell them apart by.
function editableFilename() {
  const heading = editor.querySelector("h1");
  const slug = slugifyTitle(heading && heading.textContent, "document");
  return `${slug}-editable-${Date.now()}.html`;
}

onToolbarAction("export-editable", async () => {
  const currentContent = editor.innerHTML;
  const currentText = editor.textContent || "";
  const needsMermaid =
    currentContent.includes("language-mermaid") ||
    currentContent.includes("mermaid-wrapper");
  const needsMathJax =
    containsLatex(currentText) ||
    currentContent.includes("mjx-container") ||
    currentContent.includes("MJX-CHTML");

  // file-api.js is the one module deliberately left out: it drives the
  // server-backed Open/Save, and an exported document has no server. app.js
  // falls back to blob download instead, which is why it guards downloadBtn /
  // uploadBtn / fileInput with existence checks.
  //
  // Dependency order is load-bearing: toolbar.js first because the rest bind to
  // elements it creates, then lazy-load, then app.js (which defines the shared
  // globals), then the feature modules. They are concatenated into one inline
  // script, so they run in exactly this order.
  const ASSETS = [
    "/app.css",
    "/toolbar.js",
    "/notify.js",
    "/lazy-load.js",
    "/markdown-style.js",
    "/app.js",
    "/undo.js",
    "/outline.js",
    "/renderers.js",
    "/pdf-export.js",
    "/format-bar.js",
    "/static-export.js",
    "/html-export.js",
    "/docx-export.js",
  ];

  let cssContent = "";
  let jsContent = "";

  // Re-exporting from an exported document: there is no origin to fetch from,
  // but everything the new file needs is already inline in this one. Reading it
  // back out is what keeps exports self-reproducing rather than degrading to a
  // dead end after one hop.
  const inlinedStyle = document.getElementById("app-style");
  const inlinedScript = document.getElementById("app-script");

  if (inlinedStyle && inlinedScript) {
    cssContent = inlinedStyle.textContent;
    jsContent = inlinedScript.textContent;
  } else {
    try {
      const responses = await Promise.all(ASSETS.map((url) => fetch(url)));

      // fetch() resolves on 404, so verify rather than trust: a bad response
      // here would otherwise be silently inlined as the document's stylesheet.
      const failed = responses.filter((res) => !res.ok);
      if (failed.length) {
        throw new Error(
          `could not read ${failed.map((res) => new URL(res.url).pathname).join(", ")}`,
        );
      }

      const [css, ...scripts] = await Promise.all(
        responses.map((res) => res.text()),
      );
      cssContent = css;
      jsContent = scripts.join("\n\n");
    } catch (err) {
      console.error("[Export] Could not fetch external files:", err);
      notify(
        `Export failed: ${err.message}. Exporting only works from the running Marky app.`,
        { severity: "error" },
      );
      return;
    }
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Editor</title>
    ${THEME_SCRIPT}
    <style id="app-style">
${cssContent}
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar"><!-- built by toolbar.js --></div>

        <div id="formatBar" class="format-bar">
            <button class="format-btn" data-format="p" title="Paragraph">P</button>
            <button class="format-btn" data-format="h1" title="Heading 1">H1</button>
            <button class="format-btn" data-format="h2" title="Heading 2">H2</button>
            <button class="format-btn" data-format="h3" title="Heading 3">H3</button>
            <div class="separator"></div>
            <button class="format-btn" data-format="bold" title="Bold">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                    <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
                </svg>
            </button>
            <button class="format-btn" data-format="italic" title="Italic">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="19" y1="4" x2="10" y2="4"></line>
                    <line x1="14" y1="20" x2="5" y2="20"></line>
                    <line x1="15" y1="4" x2="9" y2="20"></line>
                </svg>
            </button>
            <div class="separator"></div>
            <button class="format-btn" data-format="ul" title="Bullet List">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <circle cx="3" cy="6" r="1" fill="currentColor"></circle>
                    <circle cx="3" cy="12" r="1" fill="currentColor"></circle>
                    <circle cx="3" cy="18" r="1" fill="currentColor"></circle>
                </svg>
            </button>
            <button class="format-btn" data-format="ol" title="Numbered List">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="10" y1="6" x2="21" y2="6"></line>
                    <line x1="10" y1="12" x2="21" y2="12"></line>
                    <line x1="10" y1="18" x2="21" y2="18"></line>
                    <text x="3" y="8" font-size="8" fill="currentColor">1.</text>
                    <text x="3" y="14" font-size="8" fill="currentColor">2.</text>
                    <text x="3" y="20" font-size="8" fill="currentColor">3.</text>
                </svg>
            </button>
            <button class="format-btn" data-format="code" title="Code Block">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
            </button>
        </div>
        
        <div id="editor" contenteditable="true" spellcheck="true" data-exported="true">
            ${currentContent}
        </div>
    </div>
    
    <input type="file" id="fileInput" accept=".md,.markdown,.txt" style="display: none;">
    
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@13.0.1/dist/markdown-it.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/turndown@7.1.2/dist/turndown.min.js"><\/script>
    ${needsMermaid ? MERMAID_TAG : ""}
    ${needsMathJax ? MATHJAX_TAGS : ""}
    <script id="app-script">
${jsContent}
    <\/script>
    ${needsMermaid ? MERMAID_RETHEME_SCRIPT : ""}
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = editableFilename();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
