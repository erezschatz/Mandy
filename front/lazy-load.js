// On-demand loading for the heavy third-party libraries.
//
// MathJax (1.1 MB) and html2pdf (0.9 MB) used to load on every page view
// whether or not the document contained any maths or the user ever pressed PDF.
// (Mermaid, at 3.4 MB, did too until diagrams were removed on 2026-10-01.) They
// are now fetched the first time they are actually needed. Each loader is memoised, so concurrent callers share one request.

const MATHJAX_SRC = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
const HTML2PDF_SRC =
  "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
const DOCX_SRC = "https://unpkg.com/docx@7.1.0/build/index.js";
const FILESAVER_SRC =
  "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js";

const scriptPromises = new Map();

function loadScript(src) {
  if (scriptPromises.has(src)) return scriptPromises.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      scriptPromises.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

async function ensureMathJax() {
  if (window.MathJax && typeof window.MathJax.typesetPromise === "function") {
    return window.MathJax;
  }

  // MathJax reads its configuration from window.MathJax at load time, so this
  // has to be in place before the script tag is appended.
  if (!window.MathJax || !window.MathJax.startup) {
    window.MathJax = {
      tex: {
        inlineMath: [
          ["$", "$"],
          ["\\(", "\\)"],
        ],
        displayMath: [
          ["$$", "$$"],
          ["\\[", "\\]"],
        ],
      },
      options: {
        skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"],
      },
      // **MathJax must not typeset the page by itself on load.** Its default
      // is to typeset the whole document as soon as it starts, and this app
      // always typesets explicitly straight afterwards — so on a fresh page,
      // where the document arrived with its TeX still raw, MathJax's own pass
      // got there first, the app's pass found the result unstamped, typeset it
      // again, and nested a copy of every equation inside itself through the
      // assistive MathML. Measured 2026-10-01: three equations, three nested
      // copies, after one reload. `5e6efad` never saw it, because its reload
      // test restored maths that was already typeset, which `renderLatex` puts
      // back to source first. The editable export loads its own MathJax and
      // relies on exactly this startup pass; that configuration is separate.
      startup: { typeset: false },
    };
  }

  await loadScript(MATHJAX_SRC);
  if (window.MathJax.startup?.promise) {
    await window.MathJax.startup.promise;
  }
  return window.MathJax;
}

// MathJax's SVG output, for the PDF and Word exports' pictures of equations.
// Its own component of the same package, in a hidden frame of its own: loaded
// into the page beside `tex-mml-chtml` its font data clashes with CHTML's and
// it throws (measured 2026-11-08), and the frame also keeps its configuration
// away from the editor's MathJax. `fontCache: "none"` writes every glyph as a
// path, so the SVG needs no web font when it is drawn as an image.
const MATHJAX_SVG_SRC = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
let mathSvgPromise = null;

function ensureMathSvg() {
  if (mathSvgPromise) return mathSvgPromise;
  mathSvgPromise = new Promise((resolve, reject) => {
    // A script that loads and never starts would hang the export; past this,
    // the export draws without pictures instead, and the next one tries again.
    const timer = setTimeout(() => fail(new Error("MathJax's SVG output did not start")), 30_000);
    const fail = (error) => {
      clearTimeout(timer);
      frame.remove();
      mathSvgPromise = null;
      reject(error);
    };
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:2000px;height:600px;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    win.document.open();
    win.document.write("<!doctype html><html><head></head><body></body></html>");
    win.document.close();
    win.MathJax = {
      svg: { fontCache: "none" },
      startup: {
        typeset: false,
        ready() {
          win.MathJax.startup.defaultReady();
          win.MathJax.startup.promise.then(() => {
            clearTimeout(timer);
            resolve({ frame, MathJax: win.MathJax });
          }, fail);
        },
      },
    };
    const script = win.document.createElement("script");
    script.src = MATHJAX_SVG_SRC;
    // A later export retries rather than finding the failure cached.
    script.onerror = () => fail(new Error(`Failed to load ${MATHJAX_SVG_SRC}`));
    win.document.head.appendChild(script);
  });
  return mathSvgPromise;
}

async function ensureHtml2Pdf() {
  if (typeof html2pdf === "undefined") {
    await loadScript(HTML2PDF_SRC);
  }
  return window.html2pdf;
}

// docx builds the document, FileSaver hands it to the browser; both are only
// needed once the DOCX button is actually pressed. No typeof guards here —
// loadScript already de-duplicates by URL, and guarding on a global name is
// exactly how a collision with another script's global goes unnoticed.
async function ensureDocx() {
  await Promise.all([loadScript(DOCX_SRC), loadScript(FILESAVER_SRC)]);
  return window.docx;
}
