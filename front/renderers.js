// Initialize Mermaid with theme support
const currentTheme =
  document.documentElement.getAttribute("data-theme") || "light";
if (window.mermaid) {
  mermaid.initialize({
    startOnLoad: false,
    theme: currentTheme === "dark" ? "dark" : "default",
    securityLevel: "loose",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  });
}

// Mermaid diagram counter for unique IDs
let mermaidCounter = 0;

/**
 * Render all mermaid code blocks in the given container
 * Converts <pre><code class="language-mermaid"> to rendered SVG diagrams
 */
async function renderMermaidDiagrams(container) {
  if (!window.mermaid) return;
  const mermaidBlocks = container.querySelectorAll("pre code.language-mermaid");

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

async function renderLatex(container) {
  if (!window.MathJax || typeof window.MathJax.typesetPromise !== "function")
    return;
  if (!containsLatex(container.textContent)) return;

  try {
    await window.MathJax.typesetPromise([container]);
  } catch (error) {
    console.error("[MathJax] Render error:", error);
  }
}
