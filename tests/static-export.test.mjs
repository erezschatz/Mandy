// The HTML export is the document alone: no editor, no scripts beyond the
// theme sniffer, and self-contained enough to open from a mail attachment.

import { loadApp, loadSource } from "./dom.mjs";

const DOC_HTML = `<h1>Quarterly Report</h1>
<p>Body text with <strong>bold</strong>.</p>
<div class="mermaid-wrapper" contenteditable="false"><pre class="mermaid-source">graph TD; A--&gt;B;</pre><div class="mermaid-diagram"><svg id="d1"></svg></div></div>
<p>Maths: <mjx-container class="MathJax"><mjx-math></mjx-math></mjx-container></p>`;

// Minimal node stub: static-export.js clones the editor and strips from it.
function makeNode(html) {
  return {
    innerHTML: html,
    attrs: { contenteditable: "true", spellcheck: "true" },
    removeAttribute(n) { delete this.attrs[n]; },
    querySelector(sel) {
      if (sel !== "h1") return null;
      const m = this.innerHTML.match(/<h1>(.*?)<\/h1>/);
      return m ? { textContent: m[1] } : null;
    },
    querySelectorAll(sel) {
      const cls = sel.replace(".", "");
      const count = (this.innerHTML.match(new RegExp(`class="${cls}"`, "g")) || []).length;
      return Array.from({ length: count }, () => ({
        remove: () => {
          this.innerHTML = this.innerHTML.replace(
            new RegExp(`<pre class="${cls}">.*?</pre>`), "");
        },
        removeAttribute: () => {
          this.innerHTML = this.innerHTML.replace(' contenteditable="false"', "");
        },
      }));
    },
    cloneNode() { return makeNode(this.innerHTML); },
  };
}

export default async function run(check) {
  let written = null;
  let downloadName = null;
  let handler = null;

  // The real one from app.js, not a stub: the leading-hyphen bug lived in this
  // slug, and a stub here would have hidden it.
  const { slugifyTitle } = loadApp();

  loadSource("static-export.js", {
    slugifyTitle,
    document: {
      getElementById: () => null,
      querySelectorAll: () => [
        { id: "MJX-CHTML-styles", textContent: "mjx-container{display:inline}" },
        { id: "other", textContent: "SHOULD-NOT-APPEAR" },
      ],
      createElement: () => ({
        click() {},
        set href(_v) {},
        set download(v) { downloadName = v; },
      }),
      body: { appendChild() {}, removeChild() {} },
    },
    editor: makeNode(DOC_HTML),
    fetch: async (url) => ({
      ok: true,
      statusText: "OK",
      text: async () => `/* ${url} */\n#editor h1 { font-size: 2rem; }`,
    }),
    Blob: class { constructor(parts) { written = parts[0]; } },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    alert: (m) => { throw new Error("alert: " + m); },
    console,
    onToolbarAction: (action, fn) => { if (action === "export-html") handler = fn; },
  });

  check("registers an export-html handler", !!handler);
  await handler();

  check("starts with a doctype", written.startsWith("<!doctype html>"));
  check("title comes from the first h1", written.includes("<title>Quarterly Report</title>"));
  check("filename is slugged from the title", /^quarterly-report-\d+\.html$/.test(downloadName));

  // An emoji-led title ("👋 Welcome to Marky") strips to a leading space, which
  // used to survive as a leading hyphen: "-welcome-to-marky-1234.html".
  check("emoji-led titles do not leave a leading hyphen",
    slugifyTitle("👋 Welcome to Marky", "document") === "welcome-to-marky");
  check("trailing punctuation does not leave a trailing hyphen",
    slugifyTitle("Report — Q4!", "document") === "report-q4");
  check("runs of separators collapse",
    slugifyTitle("A   ///   B", "document") === "a-b");
  check("a title with nothing slugworthy falls back",
    slugifyTitle("🎉🎉🎉", "document") === "document");
  check("app.css is inlined", written.includes("#editor h1 { font-size: 2rem; }"));
  check("MathJax runtime styles are copied", written.includes("mjx-container{display:inline}"));
  check("non-MathJax styles are excluded", !written.includes("SHOULD-NOT-APPEAR"));
  check("mermaid source is stripped", !written.includes("mermaid-source"));
  check("mermaid svg is kept", written.includes('<svg id="d1">'));
  check("no contenteditable survives", !written.includes("contenteditable"));
  check("no editor scripts are bundled", !written.includes("<script src="));
  check("theme sniffer is present", written.includes("prefers-color-scheme: dark"));
  check("dark-mode diagram backdrop is present",
    written.includes('[data-theme="dark"] .mermaid-wrapper'));
}
