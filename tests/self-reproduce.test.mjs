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
const { slugifyTitle, encodeEmbeddedMarkdown, decodeEmbeddedMarkdown } = loadApp();

const INLINE_CSS = "#editor h1 { font-size: 2rem; } /* gen-N css */";
const INLINE_JS = [
  "toolbar.js", "app.js", "static-export.js", "html-export.js",
].map(readFront).join("\n\n");

// `markdown` is what the model core would answer: null for no model document,
// which is the old core and an export that still embeds HTML; a string for the
// model's document; an Error for a document the emitter refuses to write.
function runExport({ inlined, markdown = null }) {
  let written = null;
  let downloaded = null;
  const notices = [];
  let fetchCalls = 0;
  let handler = null;

  // The template writes the payload between a newline and an indented closing
  // tag, so a real element's textContent gives back more than went in. Handing
  // over a clean string here hid six bytes of whitespace accreting onto the
  // bundle at every hop, which a browser showed and this suite did not.
  const asWritten = (payload) => `\n${payload}\n    `;

  const byId = {
    "app-style": inlined ? { textContent: asWritten(INLINE_CSS) } : null,
    "app-script": inlined ? { textContent: asWritten(INLINE_JS) } : null,
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
    notify: (message) => notices.push(message),
    console: { ...console, error() {} },
    containsLatex: () => false,
    currentModelMarkdown: () => {
      if (markdown instanceof Error) throw markdown;
      return markdown;
    },
    encodeEmbeddedMarkdown,
    onToolbarAction: (action, fn) => { if (action === "export-editable") handler = fn; },
  });

  return {
    handler,
    output: () => written,
    filename: () => downloaded,
    fetches: () => fetchCalls,
    notices,
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
  // Read out of html-export.js rather than written here as a number, so adding
  // a module to the bundle cannot fail this check for the wrong reason — the
  // same rule the toolbar suite's two bundle lists already follow.
  const assetCount = readFront("html-export.js")
    .match(/const ASSETS = \[(.*?)\];/s)[1]
    .match(/"\/[^"]+"/g).length;
  check(
    `app export fetches its assets (${assetCount})`,
    firstExport.fetches() === assetCount,
  );
  check("app export bundles notify.js", genOne.includes("/notify.js"));
  check("app export bundles undo.js", genOne.includes("/undo.js"));
  check("app export bundles static-export.js", genOne.includes("/static-export.js"));
  check("app export bundles html-export.js", genOne.includes("/html-export.js"));
  check("app export omits file-api.js", !genOne.includes("/file-api.js"));

  // Three modules are left out, for two different reasons. file-api.js drives a
  // server an exported document does not have. pdf-export.js and docx-export.js
  // drive formats that cannot be exported *from*, so they add weight to every
  // copy without extending the chain the editable export exists to keep going.
  check("app export omits pdf-export.js", !genOne.includes("/pdf-export.js"));
  check("app export omits docx-export.js", !genOne.includes("/docx-export.js"));

  // The filename is the only thing a recipient sees before opening the file.
  // It used to be a bare timestamp, which named the document nothing at all and
  // was the one export inconsistent with the other three.
  const name = firstExport.filename();
  check("the editable export is named after the document",
    /^doc-editable-\d+\.html$/.test(name));
  check("and says which of the two HTML exports it is", name.includes("-editable-"));
  check("and a re-export names itself the same way",
    /^doc-editable-\d+\.html$/.test(reExport.filename()));

  // --- under the model core: the document travels as markdown ---------------
  //
  // Stage 4's slice 2. The editor ships empty and the markdown sits in its own
  // script element beside the bundle, which the recipient's boot loads through
  // the markdown door. What can go wrong without a browser to show it is the
  // escaping: a script element ends at the first `</script` whatever its type,
  // and documents — this repo's own — say exactly that.
  check("an export with no model document embeds no markdown",
    !genOne.includes('id="app-document"') && genOne.includes("<h1>Doc</h1><p>body</p>"));

  const MARKDOWN = "# Doc\n\nSay `</script>` and `<!-- x -->` & `&lt;` here.\n";
  const modelExport = runExport({ inlined: true, markdown: MARKDOWN });
  await modelExport.handler();
  const genModel = modelExport.output();
  const embedded = genModel.match(/<script type="text\/markdown" id="app-document">([\s\S]*?)<\/script>/);
  check("under the model core the export embeds the markdown", !!embedded);
  check("and it decodes to exactly the document",
    !!embedded && decodeEmbeddedMarkdown(embedded[1]) === MARKDOWN);
  check("with no < left inside the element to end it early",
    !!embedded && !embedded[1].includes("<"));
  check("beside the bundle, ahead of it",
    genModel.indexOf('id="app-document"') < genModel.indexOf('<script id="app-script">'));
  const editorDiv = genModel.match(/<div id="editor"[^>]*>([\s\S]*?)<\/div>\n    <\/div>/);
  check("and the editor ships empty", !!editorDiv && editorDiv[1].trim() === "");
  check("not the rendered HTML", !genModel.includes("<h1>Doc</h1><p>body</p>"));
  check("and the bundle is still carried forward whole", genModel.includes(INLINE_JS));

  const modelScript = genModel.match(/<script id="app-script">\n([\s\S]*?)\n    <\/script>/);
  const modelStructure = modelScript ? genModel.replace(modelScript[1], "") : genModel;
  check("script tags still balance with the document's own",
    (modelStructure.match(/<script/g) || []).length ===
      (modelStructure.match(/<\/script>/g) || []).length);

  // The encoder against itself, on the strings a naive one gets wrong: an
  // entity already in the text has to come back as the entity, not as what it
  // names.
  for (const text of ["&lt;", "&amp;lt;", "<&>", "a</script>b", ""]) {
    check(`the escape round-trips ${JSON.stringify(text)}`,
      decodeEmbeddedMarkdown(encodeEmbeddedMarkdown(text)) === text);
  }

  // A document the model refuses to write is not exported as something else.
  const refused = runExport({ inlined: true, markdown: new Error("no shape") });
  await refused.handler();
  check("a refused document writes no file", refused.output() === null);
  check("and says why", refused.notices.some((m) => m.includes("no shape")));
}
