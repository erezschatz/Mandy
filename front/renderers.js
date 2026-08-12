// Mermaid diagram counter for unique IDs
let mermaidCounter = 0;

function activeTheme() {
  return document.documentElement.getAttribute("data-theme") || "light";
}

/**
 * Render all mermaid code blocks in the given container
 * Converts <pre><code class="language-mermaid"> to rendered SVG diagrams
 * Mermaid itself is only downloaded if the document actually has a diagram.
 */
async function renderMermaidDiagrams(container) {
  const mermaidBlocks = container.querySelectorAll("pre code.language-mermaid");
  if (!mermaidBlocks.length) return;

  try {
    await ensureMermaid(activeTheme());
  } catch (error) {
    console.error("[Mermaid] Failed to load library:", error);
    return;
  }

  for (const codeBlock of mermaidBlocks) {
    const pre = codeBlock.parentElement;
    const source = codeBlock.textContent.trim();

    if (!source) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "mermaid-wrapper";
    wrapper.setAttribute("contenteditable", "false");

    // Store source in hidden element for markdown conversion
    const sourceElement = document.createElement("pre");
    sourceElement.className = "mermaid-source";
    sourceElement.textContent = source;
    wrapper.appendChild(sourceElement);

    const diagramContainer = document.createElement("div");
    diagramContainer.className = "mermaid-diagram";
    wrapper.appendChild(diagramContainer);

    try {
      const id = `mermaid-${Date.now()}-${mermaidCounter++}`;
      const { svg } = await mermaid.render(id, source);
      diagramContainer.innerHTML = svg;
    } catch (error) {
      console.error("[Mermaid] Render error:", error);
      const errorDiv = document.createElement("div");
      errorDiv.className = "mermaid-error";
      errorDiv.textContent = `Mermaid Error: ${
        error.message || "Failed to render diagram"
      }`;
      diagramContainer.appendChild(errorDiv);

      // Also show the source code when there's an error
      const codeDisplay = document.createElement("pre");
      codeDisplay.style.textAlign = "left";
      codeDisplay.style.marginTop = "1rem";
      codeDisplay.innerHTML = `<code>${source
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</code>`;
      diagramContainer.appendChild(codeDisplay);
    }

    pre.parentNode.replaceChild(wrapper, pre);
  }
}

/**
 * Re-render all mermaid diagrams with new theme
 */
async function reRenderMermaidWithTheme(theme) {
  // Nothing to re-theme if the library was never needed in the first place.
  if (!window.mermaid) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === "dark" ? "dark" : "default",
    securityLevel: "loose",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  });

  const wrappers = editor.querySelectorAll(".mermaid-wrapper");
  for (const wrapper of wrappers) {
    const sourceElement = wrapper.querySelector(".mermaid-source");
    if (!sourceElement) continue;

    const source = sourceElement.textContent.trim();
    const diagramContainer = wrapper.querySelector(".mermaid-diagram");

    try {
      const id = `mermaid-${Date.now()}-${mermaidCounter++}`;
      const { svg } = await mermaid.render(id, source);
      diagramContainer.innerHTML = svg;
    } catch (error) {
      console.error("[Mermaid] Re-render error:", error);
    }
  }
}

function containsLatex(text) {
  // Matches: \\( ... \\), \\[ ... \\], $$ ... $$, $ ... $
  return /(\\\\\([\s\S]+?\\\\\)|\\\\\[[\s\S]+?\\\\\]|\$\$[\s\S]+?\$\$|(^|[^\\\\$])\$(?!\$)(?:[^$\n]|\\\\\$)+?\$(?!\$))/m.test(
    text || "",
  );
}

// MathJax renders the `$$…$$` source away: by the time Turndown runs there is
// nothing left in the DOM but glyphs, so a save writes `\frac{a}{b}` back out as
// "ab". MathJax does keep the original TeX — in the math list it builds while
// typesetting — so stamp it onto each container while the two are still
// associated. The "mathjax" Turndown rule in app.js reads it back.
//
// Same trick as `.mermaid-source`, one level down: there the source survives as
// a hidden element, here as an attribute. Both have to survive an export, which
// is why neither lives anywhere but the document itself.
function stampLatexSource(container) {
  const mathDocument = window.MathJax && MathJax.startup && MathJax.startup.document;
  if (!mathDocument) return;

  for (const item of mathDocument.math) {
    const root = item.typesetRoot;
    // The list accumulates across typesets and outlives the nodes it describes,
    // so only stamp roots still standing in this container.
    if (!root || !container.contains(root)) continue;
    if (root.hasAttribute("data-tex")) continue;
    // A container inside another container is not authored maths. Loading an
    // exported document makes MathJax re-typeset its own assistive MathML and
    // nest a second container inside the first, and that pass reports MathML
    // rather than TeX — stamping it would write a `<math>` element into
    // data-tex and carry it through every later save and export.
    if (root.parentElement && root.parentElement.closest("mjx-container")) continue;
    root.setAttribute("data-tex", item.math);
    root.setAttribute("data-display", item.display ? "block" : "inline");
  }
}

// MathJax is only downloaded once the document actually contains maths.
async function renderLatex(container) {
  if (!containsLatex(container.textContent)) return;

  try {
    const mathJax = await ensureMathJax();
    await mathJax.typesetPromise([container]);
    stampLatexSource(container);
  } catch (error) {
    console.error("[MathJax] Render error:", error);
  }
}
