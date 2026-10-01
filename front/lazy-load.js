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
    };
  }

  await loadScript(MATHJAX_SRC);
  if (window.MathJax.startup?.promise) {
    await window.MathJax.startup.promise;
  }
  return window.MathJax;
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
