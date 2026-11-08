// Mermaid diagrams were removed on 2026-10-01. A ```mermaid fence is now an
// ordinary code block, shown as its source, and the file never changes: the
// fence was always the fence. What is left here is for documents drawn before
// that, still sitting in a browser's autosave or tab storage as the wrapper the
// old renderer built — the SVG, plus the diagram's source in a hidden
// `.mermaid-source`. Each one goes back to the fenced code block it came from,
// so no wrapper is ever in the editor again; the "mermaid" Turndown rule in
// app.js does the same for any that reach a save by another way.
function unwrapMermaidDiagrams(container) {
  for (const wrapper of container.querySelectorAll(".mermaid-wrapper")) {
    const source = wrapper.querySelector(".mermaid-source");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.className = "language-mermaid";
    // markdown-it ends a fence's body with a newline; matching it keeps the
    // restore layer's key for this block the same as the file's.
    code.textContent = (source ? source.textContent : "") + "\n";
    pre.appendChild(code);
    wrapper.parentNode.replaceChild(pre, wrapper);
  }
}

// What an earlier render typeset, by the source it was typeset from, so a render
// that throws the DOM away can put the same equation back **synchronously**
// instead of showing TeX until MathJax catches up. TODO 3.1, stage 2, slice 7's
// step 2: the model core re-renders — the whole document on every Enter, one
// block on every keystroke — and until this every equation went back to its TeX
// each time. MathJax costs about 0.3 ms an equation (measured in Blink on
// 2026-09-29), so a fifty-equation document paid 13–17 ms per Enter where reuse
// costs 1 ms for all fifty. It cached diagrams too, until Mermaid went.
//
// Keyed by source rather than by block, because a block's id says nothing about
// whether its content changed and the source says exactly that. Capped rather
// than cleared per render, since a one-block re-render has not seen the rest of
// the document and must not evict it.
const RENDERED_CACHE_LIMIT = 200;
const renderedCache = new Map();

function renderedCachePut(key, value) {
  renderedCache.delete(key);
  renderedCache.set(key, value);
  if (renderedCache.size > RENDERED_CACHE_LIMIT) {
    renderedCache.delete(renderedCache.keys().next().value);
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
// The source survives as an attribute so it can survive an export, which is why
// it lives nowhere but the document itself.
function stampLatexSource(container) {
  const mathDocument = window.MathJax && MathJax.startup && MathJax.startup.document;
  if (!mathDocument) return;

  for (const item of mathDocument.math) {
    const root = item.typesetRoot;
    // The list accumulates across typesets and outlives the nodes it describes,
    // so only stamp roots still standing in this container.
    if (!root || !container.contains(root)) continue;
    // A container inside another container is not authored maths. Loading an
    // exported document makes MathJax re-typeset its own assistive MathML and
    // nest a second container inside the first, and that pass reports MathML
    // rather than TeX — stamping it would write a `<math>` element into
    // data-tex and carry it through every later save and export.
    if (root.parentElement && root.parentElement.closest("mjx-container")) continue;
    // **An equation is one thing to the caret, not a run of glyphs.** Left
    // editable, Firefox walks the caret into MathJax's own elements — it
    // vanishes for several presses before coming out the other side — and
    // anything typed while it is in there lands inside the container, where
    // nothing shows it and a save throws it away: the "mathjax" Turndown rule
    // writes the container from its stamp and never reads what is in it.
    // Measured by hand in Firefox on 2026-09-29. Uneditable, every engine steps
    // over it in one press and puts typing beside it, the way it treats an
    // image. Set before the stamp check, so maths stamped before this existed
    // gets it too.
    root.setAttribute("contenteditable", "false");
    if (root.hasAttribute("data-tex")) continue;
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

// The PDF and Word exports' equations, as pictures. Neither can use what the
// editor shows. html2canvas paints the hidden assistive MathML over the glyphs,
// so the PDF drew every equation twice, and it places CHTML's CSS glyphs a few
// pixels high. Word took the container's text, which is that same assistive
// copy, so it wrote bare letters. Both had done this since they existed;
// measured in Firefox on 2026-11-08 under both cores.
//
// So each stamped equation in `clone` is replaced by a PNG of MathJax's SVG for
// its TeX, sized in CSS pixels at the font size its counterpart in `source` is
// drawn at (a detached clone has no computed style, and the two are matched by
// order), and lowered by its depth so it sits on the text's baseline. PNG
// because docx 7.1.0 takes no SVG. Three times the size, so it stays sharp in
// print. A display equation is a centred block.
//
// If the SVG renderer cannot load, or one equation cannot be drawn, `fallback`
// decides what that equation becomes rather than the export failing: "glyphs"
// keeps MathJax's rendering and drops only the assistive copy (the PDF: drawn
// once, slightly high), "source" writes the TeX as text (Word, where the glyphs
// are CSS and would come out empty).
const EQUATION_IMAGE_SCALE = 3;

function equationFallback(root, fallback) {
  if (fallback === "source") root.replaceWith(document.createTextNode(latexSourceOf(root)));
  else root.querySelectorAll("mjx-assistive-mml").forEach((node) => node.remove());
}

async function exportEquationImages(clone, { source = editor, fallback = "glyphs" } = {}) {
  const roots = typesetLatexRoots(clone);
  if (!roots.length) return clone;
  const live = typesetLatexRoots(source);

  let svg;
  try {
    svg = await ensureMathSvg();
  } catch (error) {
    console.warn("[Export] No SVG renderer for the equations:", error);
    for (const root of roots) equationFallback(root, fallback);
    return clone;
  }

  for (const [index, root] of roots.entries()) {
    const counterpart = live[index] || source;
    const fontSize = parseFloat(getComputedStyle(counterpart).fontSize) || 16;
    const display = root.getAttribute("data-display") === "block";
    let picture;
    try {
      picture = await drawEquation(svg, root.getAttribute("data-tex"), display, fontSize);
    } catch (error) {
      console.warn("[Export] Could not draw an equation:", error);
      equationFallback(root, fallback);
      continue;
    }
    const img = document.createElement("img");
    img.src = picture.src;
    img.alt = latexSourceOf(root);
    img.setAttribute("data-equation", display ? "block" : "inline");
    // Fractional, which the width and height attributes are not.
    img.setAttribute("data-width", String(picture.width));
    img.setAttribute("data-height", String(picture.height));
    img.setAttribute("data-depth", String(picture.depth));
    img.style.cssText =
      `width:${picture.width}px;height:${picture.height}px;` +
      (display ? "display:block;margin:0.5em auto" : `vertical-align:${-picture.depth}px`);
    root.replaceWith(img);
  }
  return clone;
}

// One equation drawn by the SVG frame: `{ src, width, height, depth }`, the
// sizes in CSS pixels and `src` a PNG data URL at EQUATION_IMAGE_SCALE.
async function drawEquation({ frame, MathJax }, tex, display, fontSize) {
  const body = frame.contentDocument.body;
  body.style.fontSize = `${fontSize}px`;
  const node = await MathJax.tex2svgPromise(tex, { display });
  body.appendChild(node);
  const svg = node.querySelector("svg");
  const box = svg.getBoundingClientRect();
  // MathJax sizes the SVG in ex and lowers it by its depth in ex. The frame's
  // layout turns the height into pixels, which is the ex to convert the depth by.
  const exPx = box.height / parseFloat(svg.getAttribute("height"));
  const depth = Math.max(0, -parseFloat(svg.style.verticalAlign || "0") * exPx);
  node.remove();

  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  const drawn = svg.cloneNode(true);
  drawn.setAttribute("width", `${width}px`);
  drawn.setAttribute("height", `${height}px`);
  drawn.removeAttribute("style");
  // The glyphs are filled with currentColor, which inside an image is the
  // SVG's own colour: black, whatever the editor's theme is.
  drawn.setAttribute("color", "#000");
  drawn.style.color = "#000";
  const xml = new XMLSerializer().serializeToString(drawn);

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * EQUATION_IMAGE_SCALE);
  canvas.height = Math.ceil(height * EQUATION_IMAGE_SCALE);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    src: canvas.toDataURL("image/png"),
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    depth: Math.round(depth * 100) / 100,
  };
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
  // **Under the model core this is the render step's job and nobody else's.**
  // `renderAfterModel` typesets what each render builds; the load paths go on
  // calling this as the old core needs them to. On a fresh page that was a
  // race: MathJax not yet loaded, so the render step's typeset waits for it,
  // this call looks for stamped maths before that typeset has finished, finds
  // none, and queues a second pass that lands on the render step's output —
  // and nests a copy of every equation, the bug `5e6efad` fixed for the old
  // core. Measured in Firefox and then Blink on 2026-10-01: 15 equations, 30
  // nested copies, after one reload. Feature-tested, because the suites load
  // this file without model.js.
  if (typeof modelCoreEnabled === "function" && modelCoreEnabled()) return;
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
// output is a `<span data-math>` holding TeX: what the reader sees is typeset
// over it afterwards, by MathJax. The old core only
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
