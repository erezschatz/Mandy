// Mermaid diagram counter for unique IDs
let mermaidCounter = 0;

// What an earlier render drew, by the source it drew it from, so a render that
// throws the DOM away can put the same drawing back **synchronously** instead of
// showing the source until the renderer catches up. TODO 3.1, stage 2, slice
// 7's step 2: the model core re-renders — the whole document on every Enter, one
// block on every keystroke — and until this every diagram went back to its
// fence and every equation back to TeX each time. Mermaid cannot be made
// synchronous at all (15–22 ms a diagram, measured in Blink on 2026-09-29), so
// without this a frame of raw source is guaranteed; MathJax can, but costs about
// 0.3 ms an equation, so a fifty-equation document paid 13–17 ms per Enter
// where reuse costs 1 ms for all fifty.
//
// Keyed by source rather than by block, because a block's id says nothing about
// whether its content changed and the source says exactly that. Capped rather
// than cleared per render, since a one-block re-render has not seen the rest of
// the document and must not evict it. A diagram Mermaid rejected is kept as its
// error, since Mermaid's answer for a source does not change and a broken
// diagram would otherwise flash its code on every Enter. A library that failed
// to *load* is not: nothing was drawn, and the next render tries again.
const RENDERED_CACHE_LIMIT = 200;
const renderedCache = new Map();

function renderedCachePut(key, value) {
  renderedCache.delete(key);
  renderedCache.set(key, value);
  if (renderedCache.size > RENDERED_CACHE_LIMIT) {
    renderedCache.delete(renderedCache.keys().next().value);
  }
}

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

  // Hits first, and before anything is awaited: a caller that does not await
  // this still gets every diagram drawn before it returns, which is what keeps
  // a render from painting a frame of fence.
  const theme = activeTheme();
  const misses = [];
  for (const codeBlock of mermaidBlocks) {
    const pre = codeBlock.parentElement;
    const source = codeBlock.textContent.trim();
    if (!source) continue;
    const key = `mermaid:${theme}:${source}`;
    const cached = renderedCache.get(key);
    // The drawing carries its SVG's id, and Mermaid's own styles are scoped by
    // it — so a second copy of a diagram still standing would duplicate the id.
    // Two identical diagrams in one document are the case, and the second one
    // is drawn afresh rather than cloned.
    if (cached && (cached.svg === null || !document.getElementById(cached.id))) {
      pre.parentNode.replaceChild(mermaidWrapper(pre, source, cached.svg, cached.failure), pre);
    } else {
      misses.push({ pre, source, key });
    }
  }
  if (!misses.length) return;

  try {
    await ensureMermaid(theme);
  } catch (error) {
    console.error("[Mermaid] Failed to load library:", error);
    return;
  }

  for (const { pre, source, key } of misses) {
    const id = `mermaid-${Date.now()}-${mermaidCounter++}`;
    let svg = null;
    let failure = null;
    try {
      ({ svg } = await mermaid.render(id, source));
    } catch (error) {
      console.error("[Mermaid] Render error:", error);
      failure = error.message || "Failed to render diagram";
    }
    // A render finished after the document moved on. The `<pre>` it was for
    // has been thrown away by a later render, which drew its own; replacing a
    // node with no parent would throw, and drawing anywhere else would draw
    // over the successor.
    if (!pre.isConnected) continue;
    pre.parentNode.replaceChild(mermaidWrapper(pre, source, svg, failure), pre);
    renderedCachePut(key, svg !== null ? { svg, id } : { svg: null, id: null, failure });
  }
}

// The wrapper a diagram lives in: the drawing, and the hidden source the
// Turndown rule in app.js reads back on save. `svg` null is a failed render,
// which shows `failure` and the source instead.
function mermaidWrapper(pre, source, svg, failure = null) {
  const wrapper = document.createElement("div");
  wrapper.className = "mermaid-wrapper";
  wrapper.setAttribute("contenteditable", "false");
  // The model core finds a block's element by `data-block`, and the `<pre>`
  // carried it. Dropped, the fence has no element: a re-render of it, and every
  // selection mapped through it, lose the block. The old core stamps none, so
  // this is nothing there.
  const block = pre.getAttribute("data-block");
  if (block !== null) wrapper.setAttribute("data-block", block);

  // Store source in hidden element for markdown conversion
  const sourceElement = document.createElement("pre");
  sourceElement.className = "mermaid-source";
  sourceElement.textContent = source;
  wrapper.appendChild(sourceElement);

  const diagramContainer = document.createElement("div");
  diagramContainer.className = "mermaid-diagram";
  wrapper.appendChild(diagramContainer);

  if (svg !== null) {
    diagramContainer.innerHTML = svg;
    return wrapper;
  }
  const errorDiv = document.createElement("div");
  errorDiv.className = "mermaid-error";
  errorDiv.textContent = `Mermaid Error: ${failure || "Failed to render diagram"}`;
  diagramContainer.appendChild(errorDiv);

  // Also show the source code when there's an error
  const codeDisplay = document.createElement("pre");
  codeDisplay.style.textAlign = "left";
  codeDisplay.style.marginTop = "1rem";
  const code = document.createElement("code");
  code.textContent = source;
  codeDisplay.appendChild(code);
  diagramContainer.appendChild(codeDisplay);
  return wrapper;
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
      renderedCachePut(`mermaid:${theme}:${source}`, { svg, id });
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

// Stamped maths in `container`, outermost only: a container nested inside
// another is MathJax's re-typeset of its own assistive MathML, never authored.
function typesetLatexRoots(container) {
  return [...container.querySelectorAll("mjx-container[data-tex]")].filter(
    (root) => !(root.parentElement && root.parentElement.closest("mjx-container")),
  );
}

// The TeX a stamped container was typeset from, delimited the way the
// "mathjax" Turndown rule in app.js writes it back.
function latexSourceOf(root) {
  const tex = root.getAttribute("data-tex");
  return root.getAttribute("data-display") === "block" ? `$$${tex}$$` : `$${tex}$`;
}

// MathJax is only downloaded once the document actually contains maths.
//
// **Maths already typeset goes back to its source first, and is typeset again
// from that.** A typeset container holds MathJax's assistive MathML, and the
// `tex-mml-chtml` bundle reads MathML as input — so a second pass over one
// typeset the assistive copy and nested a new container inside the old. Every
// reload restores typeset HTML from autosave and every Paste markdown re-runs
// this over the whole editor, so each one added another copy of every equation,
// which the next autosave kept: measured 2026-09-29, one equation became three
// containers on a single reload. Nothing showed, because the copies sit inside
// hidden assistive markup. Typesetting fresh from the stamp also regenerates
// MathJax's stylesheet, which restored maths needs and which that second pass
// was, by accident, the only thing providing.
//
// After the load, never before it: offline the containers stay as they are,
// stamped, and a save still writes their TeX back. Put back as text before
// then, the TeX would reach Turndown as prose and be escaped.
async function renderLatex(container) {
  if (!typesetLatexRoots(container).length && !containsLatex(container.textContent)) return;

  try {
    const mathJax = await ensureMathJax();
    // Read after the await, since the document can change while MathJax loads.
    // The list entries go first, while the containers they describe are still
    // inside `container` to be found.
    const typeset = typesetLatexRoots(container);
    if (typeset.length) mathJax.typesetClear([container]);
    for (const root of typeset) root.replaceWith(document.createTextNode(latexSourceOf(root)));
    await mathJax.typesetPromise([container]);
    stampLatexSource(container);
  } catch (error) {
    console.error("[MathJax] Render error:", error);
  }
}

// ── After a model render ─────────────────────────────────────────────────────
//
// The model core's renderer hands markdown-it's output to the DOM, and that
// output is a fence and a `<span data-math>` holding TeX: what the reader sees
// is drawn over it afterwards, by the two functions above. The old core only
// ever needed that at load, because contenteditable never re-rendered anything;
// the model core re-renders on every edit, so model.js calls this after each
// one with what it just built. Feature-tested there, since
// `front/input-check.html` ships the model without this file.

// Equations in `container` not yet typeset. A cached one is put back here and
// now, as a copy of the container MathJax drew last time — which carries its
// `data-tex` stamp with it, so a save reads it the same as a fresh one. The
// rest come back with the key their source gives, taken before typesetting
// replaces that source with glyphs.
function mathTakeFromCache(container) {
  const pending = [];
  for (const span of container.querySelectorAll("[data-math]")) {
    if (span.querySelector("mjx-container")) continue;
    const key = `math:${span.textContent}`;
    const cached = renderedCache.get(key);
    if (cached) span.replaceChildren(cached.cloneNode(true));
    else pending.push({ span, key });
  }
  return pending;
}

// Keep a copy of each equation that typeset and was stamped. An unstamped one
// is not kept: a copy without `data-tex` would save as its glyphs.
function mathRemember(pending) {
  for (const { span, key } of pending) {
    const drawn = span.querySelector("mjx-container");
    if (drawn && drawn.hasAttribute("data-tex")) renderedCachePut(key, drawn.cloneNode(true));
  }
}

// MathJax keeps every equation it has ever typeset in one list, and the list
// outlives the nodes: a render throws the old ones away and the list keeps
// them. Measured 2026-09-29, one entry more per equation per render, for good.
function mathForgetDetached() {
  const list = MathJax.startup.document.math;
  const stale = [];
  for (const item of list) if (!item.typesetRoot || !item.typesetRoot.isConnected) stale.push(item);
  if (stale.length) list.remove(...stale);
}

// Synchronously when MathJax is already here, so the typeset lands in the same
// task as the render and no frame shows TeX. `typeset` throws when it would
// need something it has to fetch first; that, and a MathJax not yet loaded at
// all, fall back to the asynchronous path, which does the fetching.
function mathTypesetNow(pending, container) {
  if (!(window.MathJax && MathJax.typeset && MathJax.startup && MathJax.startup.document)) return false;
  try {
    MathJax.typeset(pending.map((p) => p.span));
  } catch (error) {
    return false;
  }
  stampLatexSource(container);
  mathRemember(pending);
  mathForgetDetached();
  return true;
}

// The asynchronous path is the pending equations alone, never `renderLatex`
// over the container: that puts every stamped equation back to source and
// typesets it again, which would redo the ones just restored from the cache.
// An equation a later render has already thrown away is skipped rather than
// typeset where nobody will see it.
function renderAfterModel(container) {
  renderMermaidDiagrams(container).catch((error) => console.error("[Mermaid]", error));
  const pending = mathTakeFromCache(container);
  if (!pending.length || mathTypesetNow(pending, container)) return;
  ensureMathJax()
    .then(async (mathJax) => {
      const live = pending.filter((p) => p.span.isConnected);
      if (!live.length) return;
      await mathJax.typesetPromise(live.map((p) => p.span));
      stampLatexSource(container);
      mathRemember(live);
      mathForgetDetached();
    })
    .catch((error) => console.error("[MathJax] Render error:", error));
}
