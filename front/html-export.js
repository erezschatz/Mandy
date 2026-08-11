exportBtn.addEventListener("click", async () => {
  const currentContent = editor.innerHTML;
  const currentText = editor.textContent || "";
  const needsMermaid =
    currentContent.includes("language-mermaid") ||
    currentContent.includes("mermaid-wrapper");
  const needsMathJax =
    containsLatex(currentText) ||
    currentContent.includes("mjx-container") ||
    currentContent.includes("MJX-CHTML");

  let cssContent = "";
  let jsContent = "";

  try {
    // Fetch CSS and all split JS files in load order
    const [
      cssRes,
      defaultContentRes,
      appRes,
      renderersRes,
      pdfRes,
      formatBarRes,
      htmlExportRes,
    ] = await Promise.all([
      fetch("/app.css"),
      fetch("/default-content.js"),
      fetch("/app.js"),
      fetch("/renderers.js"),
      fetch("/pdf-export.js"),
      fetch("/format-bar.js"),
      fetch("/html-export.js"),
    ]);
    cssContent = await cssRes.text();
    // Concatenate in correct dependency order: default-content first, then app.js (defines globals), then features
    jsContent = [
      await defaultContentRes.text(),
      await appRes.text(),
      await renderersRes.text(),
      await pdfRes.text(),
      await formatBarRes.text(),
      await htmlExportRes.text(),
    ].join("\n\n");
  } catch (err) {
    console.warn("[Export] Could not fetch external files:", err);
  }

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Editor</title>
    <style>
${cssContent}
    </style>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <h1>Markdown Editor</h1>
            <div class="buttons">
                <button id="pasteBtn" title="Paste from clipboard">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    </svg>
                    Paste
                </button>
                <button id="uploadBtn" title="Upload markdown file (Ctrl+O)" style="margin-right: 1rem;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    Upload MD
                </button>
                <button id="exportBtn" title="Export as HTML file">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="12" y1="18" x2="12" y2="12"></line>
                        <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                    Export HTML
                </button>
                <button id="pdfBtn" title="Export as PDF file" aria-label="Export document as PDF">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                    <span class="btn-text">PDF</span>
                    <span class="loading-indicator" style="display:none">⏳</span>
                </button>
                <button id="downloadBtn" title="Download as markdown (Ctrl+S)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download MD
                </button>
                <button id="copyBtn" title="Copy markdown to clipboard" style="margin-right: 1rem;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy
                </button>
                <button id="clearBtn" title="Clear document">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                    Clear
                </button>
                <a href="https://github.com/Tommertom/marky" target="_blank" rel="noopener noreferrer" id="githubBtn" title="View on GitHub">
                    <svg height="32" viewBox="0 0 24 24" version="1.1" width="32" fill="white">
                        <path d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z"></path>
                    </svg>
                </a>
            </div>
        </div>
        
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
    ${needsMermaid ? '<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\\/script>' : ""}
    ${needsMathJax ? '<script>window.MathJax={tex:{inlineMath:[["$","$"],["\\\\(","\\\\)"]],displayMath:[["$$","$$"],["\\\\[","\\\\]"]]},options:{skipHtmlTags:["script","noscript","style","textarea","pre","code"],ignoreHtmlClass:"mermaid-wrapper"}};<\\/script><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"><\\/script>' : ""}
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
    <script id="app-script">
${jsContent}
    <\/script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
