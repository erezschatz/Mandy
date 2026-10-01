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
