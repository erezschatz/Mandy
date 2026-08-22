// The document outline: the depth algorithm, what survives from a heading into
// a TOC entry, and the nesting of the list Insert TOC writes.
//
// The parts that fail quietly:
//   - the depths. Indenting by heading level instead of by nesting draws a
//     five-rung staircase for an H6 under an H1, and every rung is empty. The
//     failure is a bad-looking sidebar, which nobody files a bug about.
//   - the inline allowlist. A heading containing a link would nest anchors;
//     the browser silently unnests them and the entry stops being clickable.
//   - the list shape. A sublist that is a sibling of its parent <li> rather
//     than a child of it serialises to a flat list, and Insert TOC writes that
//     into the user's file.

import { loadSource, makeEl, makeText, markdownitStub, walk } from "./dom.mjs";

function loadOutline() {
  const noop = () => {};
  const root = makeEl("html");
  const container = makeEl("div");
  container.className = "container";
  const toolbar = makeEl("div");
  toolbar.className = "toolbar";
  toolbar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 69 });

  const byId = new Map();
  const getElementById = (id) => {
    if (!byId.has(id)) {
      const node = makeEl("div");
      if (id === "editor") container.appendChild(node);
      byId.set(id, node);
    }
    return byId.get(id);
  };

  const store = new Map();
  const alerts = [];
  const scrolled = [];
  const observed = [];
  const actions = new Map();
  const selection = { anchorNode: null };
  const timers = [];

  return loadSource(
    ["markdown-style.js", "app.js", "outline.js"],
    {
      window: {
        markdownit: markdownitStub([], {}),
        addEventListener: noop,
        matchMedia: () => ({ matches: false }),
        open: noop,
        scrollTo: (opts) => scrolled.push(opts),
        scrollY: 0,
        getSelection: () => selection,
      },
      TurndownService: class {
        constructor() {}
        addRule() {}
        turndown(html) {
          return html;
        }
      },
      document: {
        getElementById,
        // Honours the tag, unlike the shared loadApp helper: this suite asserts
        // on the tag names of the list it builds.
        createElement: (tag) => makeEl(tag),
        createTextNode: makeText,
        addEventListener: noop,
        documentElement: root,
        querySelector: (sel) => {
          if (sel === ".toolbar") return toolbar;
          if (sel === ".container") return container;
          return null;
        },
        body: { appendChild: noop, removeChild: noop },
        execCommand: noop,
      },
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
      navigator: { clipboard: {}, platform: "MacIntel" },
      onToolbarAction: (action, handler) => actions.set(action, handler),
      toolbarButton: () => null,
      runToolbarAction: noop,
      MutationObserver: class {
        constructor(fn) {
          this.fn = fn;
        }
        observe(target, options) {
          observed.push({ target, options });
        }
      },
      Event: class {
        constructor(type) {
          this.type = type;
        }
      },
      notify: (message) => alerts.push(message),
      // Immediate rather than deferred: a suite that had to wait a second for
      // the debounce would be a suite nobody runs.
      setTimeout: (fn) => {
        timers.push(fn);
        fn();
        return timers.length;
      },
      clearTimeout: noop,
      console,
      __ctx: {
        root,
        container,
        byId,
        store,
        alerts,
        scrolled,
        observed,
        actions,
        selection,
      },
    },
    "; return { ctx: __ctx, outlineDepths, outlineEntries, copyInline," +
      " buildNestedList, insertToc, setOutlineOpen, renderOutline," +
      " outlineIsOpen, anchorSlug };",
  );
}

// A heading list for headingAnchors to walk, the way links.test.mjs does it.
function withHeadings(editor, headings) {
  const nodes = headings.map(([tag, text]) => {
    const node = makeEl(tag, { text });
    node.appendChild(makeText(text));
    return node;
  });
  editor.querySelectorAll = (sel) => (sel.startsWith("h1") ? nodes : []);
  return nodes;
}

function levels(spec) {
  return spec.map((tag) => Number(tag[1]));
}

export default function run(check) {
  const outline = loadOutline();
  const {
    outlineDepths,
    outlineEntries,
    copyInline,
    buildNestedList,
    insertToc,
    setOutlineOpen,
    outlineIsOpen,
    ctx,
  } = outline;
  const editor = ctx.byId.get("editor");

  // --- depths --------------------------------------------------------------

  check(
    "a plain hierarchy indents one rung per level",
    String(outlineDepths(levels(["h1", "h2", "h3", "h2"]))) === "0,1,2,1",
  );

  // The whole reason the depth is not the level: three H6s under an H1 are one
  // rung in, not five, and there are no empty rungs above them.
  check(
    "an H6 under an H1 is one rung in, not five",
    String(outlineDepths(levels(["h1", "h6", "h6", "h6"]))) === "0,1,1,1",
  );

  // The full mess: H1 > 3×H6, then an H2 that closes them, a sibling H2,
  // 3×H6 under it, then a new H1 unwinding everything.
  check(
    "the pathological document never exceeds two rungs",
    String(
      outlineDepths(
        levels([
          "h1", "h6", "h6", "h6",
          "h2", "h2", "h6", "h6", "h6",
          "h1", "h3", "h3",
        ]),
      ),
    ) === "0,1,1,1,1,1,2,2,2,0,1,1",
  );

  // Forced, not chosen: treating a repeat as a child would nest a flat run of
  // H2s one rung deeper every time.
  check(
    "equal levels are siblings",
    String(outlineDepths(levels(["h2", "h2", "h2", "h2"]))) === "0,0,0,0",
  );

  // No ghost rungs for the H1 and H2 that were never written.
  check(
    "a document that opens on an H3 starts at zero",
    String(outlineDepths(levels(["h3", "h4", "h3"]))) === "0,1,0",
  );

  check("no headings is no depths", outlineDepths([]).length === 0);

  // The stack is strictly increasing, so depth is bounded by the number of
  // distinct levels rather than by 6 — which is what makes the cap in the
  // renderer a display detail rather than a correctness one.
  const everyLevel = outlineDepths(levels(["h1", "h2", "h3", "h4", "h5", "h6"]));
  check(
    "depth never outruns the distinct levels in play",
    Math.max(...everyLevel) === 5 &&
      Math.max(...outlineDepths(levels(["h1", "h4", "h6"]))) === 2,
  );

  // --- entries -------------------------------------------------------------

  withHeadings(editor, [["h1", "Intro"], ["h6", "Detail"], ["h2", "Next"]]);
  const entries = outlineEntries(editor);

  check("an entry per heading, in document order", entries.length === 3);
  check(
    "slugs come from headingAnchors, not a second implementation",
    entries.map((e) => e.slug).join(",") === "intro,detail,next",
  );
  check(
    "the level is the tag and the depth is the nesting",
    entries.map((e) => `${e.level}/${e.depth}`).join(",") === "1/0,6/1,2/1",
  );

  // --- the inline allowlist ------------------------------------------------

  function heading(build) {
    const node = makeEl("h2");
    build(node);
    return node;
  }

  const withCode = heading((h) => {
    h.appendChild(makeText("The "));
    const code = makeEl("code");
    code.appendChild(makeText("table"));
    h.appendChild(code);
    h.appendChild(makeText(" rule"));
  });
  const kept = copyInline(withCode, makeEl("a"));
  check(
    "allowlisted inline markup is preserved",
    kept.children.map((c) => c.tagName || "#text").join(",") ===
      "#text,CODE,#text",
  );

  // Nested anchors are invalid: the browser unnests them and the TOC entry
  // stops being a link at all, so the inner one has to go.
  const withLink = heading((h) => {
    const link = makeEl("a");
    link.appendChild(makeText("Marky"));
    link.textContent = "Marky";
    h.appendChild(link);
    h.appendChild(makeText(" and friends"));
  });
  const flattened = copyInline(withLink, makeEl("a"));
  check(
    "a link inside a heading flattens to its text",
    flattened.children.every((c) => c.nodeType === 3) &&
      flattened.children.map((c) => c.textContent).join("") ===
        "Marky and friends",
  );

  // The allowlist's point: something nobody anticipated degrades to readable
  // text rather than producing a broken entry.
  const withUnknown = heading((h) => {
    const box = makeEl("mjx-container", { text: "x²" });
    box.textContent = "x²";
    h.appendChild(box);
  });
  const degraded = copyInline(withUnknown, makeEl("a"));
  check(
    "an unrecognised element degrades to text",
    degraded.children.length === 1 &&
      degraded.children[0].nodeType === 3 &&
      degraded.children[0].textContent === "x²",
  );

  // --- the nested list -----------------------------------------------------

  withHeadings(editor, [
    ["h1", "One"], ["h2", "Two"], ["h3", "Three"], ["h2", "Four"],
  ]);
  const list = buildNestedList(outlineEntries(editor));

  check("the list is a ul", list.tagName === "UL");
  check("top level holds only the depth-0 heading", list.children.length === 1);

  const top = list.children[0];
  const sub = top.children.find((c) => c.tagName === "UL");
  // The trap: a sublist placed beside its parent <li> instead of inside it
  // serialises to a flat list, and Insert TOC writes that flat list to disk.
  check("a sublist lives inside its parent li", !!sub);
  check("both depth-1 headings share that sublist", sub.children.length === 2);

  const deepest = sub.children[0].children.find((c) => c.tagName === "UL");
  check("depth 2 nests one further", !!deepest && deepest.children.length === 1);

  const hrefs = walk(list)
    .filter((n) => n.tagName === "A")
    .map((n) => n.getAttribute("href"));
  check(
    "every entry links to its own slug",
    hrefs.join(",") === "#one,#two,#three,#four",
  );

  // --- insert --------------------------------------------------------------

  const before = editor.children.length;
  ctx.selection.anchorNode = null;
  insertToc();
  check("insert adds one block", editor.children.length === before + 1);
  check(
    "with no caret it lands at the top of the document",
    editor.children[0].tagName === "UL",
  );

  // Autosave and the dirty flag hang off `input`, which a programmatic edit
  // does not raise on its own.
  let inputs = 0;
  editor.addEventListener("input", () => inputs++);
  insertToc();
  check("insert announces itself as an edit", inputs === 1);

  editor.querySelectorAll = () => [];
  const alertsBefore = ctx.alerts.length;
  insertToc();
  check(
    "a document with no headings is told so rather than given an empty list",
    ctx.alerts.length === alertsBefore + 1,
  );

  // --- the toggle ----------------------------------------------------------

  setOutlineOpen(true);
  check("open is stamped on the root", outlineIsOpen() === true);
  check(
    "and remembered under its own key",
    ctx.store.get("marky-outline") === "open",
  );

  setOutlineOpen(false);
  check("closed is stamped too", outlineIsOpen() === false);
  check("and remembered", ctx.store.get("marky-outline") === "closed");

  // One observer on the editor, not an input listener: the document also
  // changes from Open, Reload, Clear, paste and the welcome fetch.
  check(
    "the rebuild watches the editor for every kind of change",
    ctx.observed.length === 1 &&
      ctx.observed[0].target === editor &&
      ctx.observed[0].options.childList === true &&
      ctx.observed[0].options.subtree === true &&
      ctx.observed[0].options.characterData === true,
  );

  check(
    "both toolbar actions are registered",
    ctx.actions.has("toggle-outline") && ctx.actions.has("insert-toc"),
  );
}
