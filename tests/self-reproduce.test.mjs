// Exported documents are self-reproducing: an exported file has no origin to
// fetch from, but is already carrying its own CSS and JS inline, so it reads
// itself instead. This is what stops the chain dying after one hop.
//
// The property under test is a fixpoint: what generation N+1 hands its
// successor must be byte-identical to what generation N handed it.

import { loadApp, loadSource, readFront } from "./dom.mjs";

// The real one out of app.js, not a stand-in: the filename is the one thing an
// export hands to the recipient's filesystem, and a slug that disagrees with
// the app's own would be invisible from in here.
const { slugifyTitle } = loadApp();

const INLINE_CSS = "#editor h1 { font-size: 2rem; } /* gen-N css */";
const INLINE_JS = [
  "toolbar.js", "app.js", "static-export.js", "html-export.js", "docx-export.js",
].map(readFront).join("\n\n");

function runExport({ inlined }) {
  let written = null;
  let downloaded = null;
  let fetchCalls = 0;
  let handler = null;

  const byId = {
    "app-style": inlined ? { textContent: INLINE_CSS } : null,
    "app-script": inlined ? { textContent: INLINE_JS } : null,
  };

  loadSource("html-export.js", {
    document: {
      getElementById: (id) => byId[id] ?? null,
      createElement: () => ({
        click() {},
        set href(_v) {},
        set download(v) {
          downloaded = v;
        },
      }),
      body: { appendChild() {}, removeChild() {} },
    },
    editor: {
      innerHTML: "<h1>Doc</h1><p>body</p>",
      textContent: "Doc body",
      querySelector: (sel) => (sel === "h1" ? { textContent: "Doc" } : null),
    },
    slugifyTitle,
    fetch: async (url) => {
      fetchCalls++;
      return { ok: true, statusText: "OK", url: "http://x" + url, text: async () => `/* ${url} */` };
    },
    Blob: class { constructor(parts) { written = parts[0]; } },
    URL: Object.assign(
      class { constructor(u) { this.pathname = u; } },
      { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
    ),
    notify: () => {},
    console,
    containsLatex: () => false,
    onToolbarAction: (action, fn) => { if (action === "export-editable") handler = fn; },
  });

  return {
    handler,
    output: () => written,
    filename: () => downloaded,
    fetches: () => fetchCalls,
  };
}

export default async function run(check) {
  // Generation N+1, produced from inside an exported document.
  const reExport = runExport({ inlined: true });
  check("registers an export-editable handler", !!reExport.handler);
  await reExport.handler();
  const genN1 = reExport.output();

  check("re-export performs no network fetches", reExport.fetches() === 0);
  check("carries the stylesheet forward", genN1.includes(INLINE_CSS));
  check("re-tags the style as app-style", genN1.includes('<style id="app-style">'));
  check("re-tags the script as app-script", genN1.includes('<script id="app-script">'));
  check("carries the whole bundle forward", genN1.includes(INLINE_JS));
  check("no literal closing script tag in the payload",
    !INLINE_JS.includes("</" + "script>"));

  // The payload legitimately contains "<script" inside string literals, which
  // is what the CLOSE constant exists to work around, so balance can only be
  // judged on the document structure with the payload removed.
  const script = genN1.match(/<script id="app-script">\n([\s\S]*?)\n    <\/script>/);
  const structure = script ? genN1.replace(script[1], "") : genN1;
  check("document script tags balance",
    (structure.match(/<script/g) || []).length ===
      (structure.match(/<\/script>/g) || []).length);

  const style = genN1.match(/<style id="app-style">\n([\s\S]*?)\n    <\/style>/);
  check("next generation's css is identical", style && style[1] === INLINE_CSS);
  check("next generation's js is identical", script && script[1] === INLINE_JS);

  // Generation 1, produced from the running app.
  const firstExport = runExport({ inlined: false });
  await firstExport.handler();
  const genOne = firstExport.output();

  // One per entry in ASSETS: the stylesheet plus every script in the bundle.
  check("app export fetches its assets", firstExport.fetches() === 13);
  check("app export bundles notify.js", genOne.includes("/notify.js"));
  check("app export bundles docx-export.js", genOne.includes("/docx-export.js"));
  check("app export bundles static-export.js", genOne.includes("/static-export.js"));
  check("app export bundles html-export.js", genOne.includes("/html-export.js"));
  check("app export omits file-api.js", !genOne.includes("/file-api.js"));

  // The filename is the only thing a recipient sees before opening the file.
  // It used to be a bare timestamp, which named the document nothing at all and
  // was the one export inconsistent with the other three.
  const name = firstExport.filename();
  check("the editable export is named after the document",
    /^doc-editable-\d+\.html$/.test(name));
  check("and says which of the two HTML exports it is", name.includes("-editable-"));
  check("and a re-export names itself the same way",
    /^doc-editable-\d+\.html$/.test(reExport.filename()));
}
