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
      // Headings, for the anchor ids. Setting `id` rewrites the markup, which
      // is what the export actually ships and what the assertions read back.
      if (sel.startsWith("h1")) {
        const self = this;
        const found = [...this.innerHTML.matchAll(/<(h[1-6])>(.*?)<\/\1>/g)];
        return found.map((m) => ({
          textContent: m[2],
          set id(value) {
            self.innerHTML = self.innerHTML.replace(
              m[0],
              `<${m[1]} id="${value}">${m[2]}</${m[1]}>`,
            );
          },
        }));
      }

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
    // Only ever asked for the leading <h1>, which is where the contents nav
    // goes when there is a title to put it under.
    get firstElementChild() {
      const self = this;
      const open = this.innerHTML.match(/^\s*<([a-z0-9-]+)[^>]*>/i);
      if (!open) return null;
      const tag = open[1];
      const close = `</${tag}>`;
      const end = this.innerHTML.indexOf(close);
      return {
        tagName: tag.toUpperCase(),
        insertAdjacentElement(position, el) {
          const at = end + close.length;
          self.innerHTML =
            position === "afterend"
              ? self.innerHTML.slice(0, at) + "\n" + el.html + self.innerHTML.slice(at)
              : el.html + self.innerHTML;
        },
      };
    },
    insertBefore(el) {
      this.innerHTML = el.html + this.innerHTML;
    },
    cloneNode() { return makeNode(this.innerHTML); },
  };
}

// static-export.js builds the contents nav from real elements and inserts it
// into the clone, so the stub needs elements that can render themselves back
// into the markup string this suite reads.
function makeFrag(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: "",
    textContent: "",
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    get html() {
      const cls = this.className ? ` class="${this.className}"` : "";
      const inner = this.children.length
        ? this.children.map((c) => c.html).join("")
        : this.textContent;
      return `<${tag}${cls}>${inner}</${tag}>`;
    },
  };
}

export default async function run(check) {
  let written = null;
  let downloadName = null;
  let handler = null;
  // The static export's TOC follows the sidebar toggle, which is the only
  // switch there is until Mandy grows a Settings pane.
  let outlineOpen = false;

  // The real one from app.js, not a stub: the leading-hyphen bug lived in this
  // slug, and a stub here would have hidden it.
  const { slugifyTitle, headingAnchors } = loadApp();

  loadSource("static-export.js", {
    slugifyTitle,
    headingAnchors,
    document: {
      getElementById: () => null,
      querySelectorAll: () => [
        { id: "MJX-CHTML-styles", textContent: "mjx-container{display:inline}" },
        { id: "other", textContent: "SHOULD-NOT-APPEAR" },
      ],
      createElement: (tag) =>
        tag === "a"
          ? {
              click() {},
              set href(_v) {},
              set download(v) { downloadName = v; },
            }
          : makeFrag(tag),
      body: { appendChild() {}, removeChild() {} },
    },
    editor: makeNode(DOC_HTML),
    // Stubbed rather than loaded: this suite checks the wiring — whether the
    // nav is emitted at all, and where it lands — while outline.test.mjs
    // checks that the entries and the nesting are right.
    outlineIsOpen: () => outlineOpen,
    outlineEntries: () => [{ slug: "quarterly-report", level: 1, depth: 0 }],
    buildNestedList: (entries) => {
      const list = makeFrag("ul");
      for (const entry of entries) {
        const item = makeFrag("li");
        const link = makeFrag("a");
        link.textContent = entry.slug;
        item.appendChild(link);
        list.appendChild(item);
      }
      return list;
    },
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

  // An emoji-led title ("👋 Welcome to Mandy") strips to a leading space, which
  // used to survive as a leading hyphen: "-welcome-to-mandy-1234.html".
  check("emoji-led titles do not leave a leading hyphen",
    slugifyTitle("👋 Welcome to Mandy", "document") === "welcome-to-mandy");
  check("trailing punctuation does not leave a trailing hyphen",
    slugifyTitle("Report — Q4!", "document") === "report-q4");
  check("runs of separators collapse",
    slugifyTitle("A   ///   B", "document") === "a-b");
  check("a title with nothing slugworthy falls back",
    slugifyTitle("🎉🎉🎉", "document") === "document");
  // This file ships no JS, so an in-document link only works if the id is in
  // the markup. Without it a table of contents exports as a page of dead links,
  // and nothing about the document looks wrong until someone clicks one.
  check("headings carry anchor ids",
    written.includes('<h1 id="quarterly-report">'));

  // The TOC is document content here rather than the sidebar it is in the app.
  // Safe only because this file is a terminal artifact — it never goes back
  // through Turndown, so nothing added here can reach anyone's .md.
  // The element, not the class name: .doc-outline's styles are inlined from
  // DOC_LAYOUT_CSS either way.
  check("no contents nav while the outline is closed",
    !written.includes('<nav class="doc-outline">'));

  outlineOpen = true;
  await handler();
  check("an open outline exports a contents nav",
    written.includes('<nav class="doc-outline">'));
  // After the title, so the document still opens on its own heading rather
  // than on its own index.
  check("the nav lands after the leading h1",
    written.indexOf('<h1 id="quarterly-report">') <
      written.indexOf('<nav class="doc-outline">'));
  check("the nav is inside the document, not the page chrome",
    written.indexOf('<div id="editor">') <
      written.indexOf('<nav class="doc-outline">'));
  outlineOpen = false;

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
