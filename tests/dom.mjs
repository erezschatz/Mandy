// A DOM stub, just large enough to run front/ code outside a browser.
//
// There is no test framework and no dependency here on purpose: the project
// ships none, and `deno run` is already required to serve the app. These files
// load the real front/ sources and drive them, so they fail when the source
// changes underneath them — which is the whole point.

import { readFileSync } from "node:fs";

const FRONT = new URL("../front/", import.meta.url);

export function readFront(file) {
  return readFileSync(new URL(file, FRONT), "utf8");
}

export function makeEl(tag = "div", { parent = null, text = "" } = {}) {
  const node = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    innerHTML: "",
    textContent: text,
    id: "",
    className: "",
    title: "",
    href: "",
    target: "",
    rel: "",
    value: "",
    disabled: false,
    // setProperty writes into the same bag as `style.color = ...`, so a test
    // can read a custom property back the way it reads any other.
    style: {
      setProperty(name, value) {
        this[name] = value;
      },
    },
    children: [],
    attrs: {},
    listeners: {},
    parentNode: parent,
    parentElement: parent,

    classList: { add() {}, remove() {}, contains: () => false },

    // The real DOM distinguishes these: childNodes carries text, children does
    // not. Text nodes are ordinary children here, so a walk over childNodes
    // sees them and a test can build a heading with mixed content.
    get childNodes() {
      return node.children;
    },
    get firstChild() {
      return node.children[0] || null;
    },
    get firstElementChild() {
      return node.children.find((c) => c.nodeType === 1) || null;
    },
    get lastElementChild() {
      const elements = node.children.filter((c) => c.nodeType === 1);
      return elements[elements.length - 1] || null;
    },

    get previousElementSibling() {
      const siblings = node.parentNode ? node.parentNode.children : [];
      const index = siblings.indexOf(node);
      return index > 0 ? siblings[index - 1] : null;
    },
    get nextSibling() {
      const siblings = node.parentNode ? node.parentNode.children : [];
      const index = siblings.indexOf(node);
      return index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
    },
    get nextElementSibling() {
      const siblings = node.parentNode ? node.parentNode.children : [];
      const index = siblings.indexOf(node);
      for (let i = index + 1; i < siblings.length; i++) {
        if (siblings[i].nodeType === 1) return siblings[i];
      }
      return null;
    },

    appendChild(child) {
      child.parentNode = node;
      child.parentElement = node;
      node.children.push(child);
      return child;
    },
    removeChild(child) {
      node.children = node.children.filter((c) => c !== child);
    },
    replaceChild(newNode, oldNode) {
      node.replaced = { newNode, oldNode };
      newNode.parentNode = node;
      newNode.parentElement = node;
      node.children = node.children.map((c) => (c === oldNode ? newNode : c));
    },
    remove() {
      if (node.parentNode) node.parentNode.removeChild(node);
    },
    insertBefore(child, reference) {
      child.parentNode = node;
      child.parentElement = node;
      const index = node.children.indexOf(reference);
      node.children.splice(index < 0 ? node.children.length : index, 0, child);
      return child;
    },
    insertAdjacentElement(position, child) {
      const parent = node.parentNode;
      if (!parent) return null;
      child.parentNode = parent;
      child.parentElement = parent;
      const index = parent.children.indexOf(node);
      parent.children.splice(index + (position === "afterend" ? 1 : 0), 0, child);
      return child;
    },
    dispatchEvent(event) {
      for (const fn of node.listeners[event.type] || []) fn(event);
      return true;
    },

    setAttribute(name, value) {
      node.attrs[name] = value;
    },
    getAttribute(name) {
      return name in node.attrs ? node.attrs[name] : null;
    },
    removeAttribute(name) {
      delete node.attrs[name];
    },
    hasAttribute(name) {
      return name in node.attrs;
    },
    get dataset() {
      return { action: node.attrs["data-action"] };
    },

    addEventListener(event, fn) {
      (node.listeners[event] ||= []).push(fn);
    },

    // Walks ancestors for a tag selector ("pre", "ul, ol") or an attribute
    // selector ("[data-action]") — the two forms front/ actually uses.
    closest(selector) {
      const wantsAttr = selector.startsWith("[");
      const attr = wantsAttr ? selector.replace(/[[\]]/g, "") : null;
      const tags = wantsAttr
        ? []
        : selector.split(",").map((s) => s.trim().toUpperCase());
      let current = node;
      while (current) {
        if (wantsAttr ? attr in current.attrs : tags.includes(current.tagName)) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    },
    contains(other) {
      let current = other;
      while (current) {
        if (current === node) return true;
        current = current.parentElement;
      }
      return false;
    },

    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    select() {},
    click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  };
  if (parent) parent.children.push(node);
  return node;
}

export function makeText(text) {
  return { nodeType: 3, textContent: text, children: [], parentElement: null };
}

export function walk(node, out = []) {
  out.push(node);
  for (const child of node.children) walk(child, out);
  return out;
}

// Runs a front/ source file in an isolated scope with the given globals, the
// way a <script> tag would. `tail` is appended so a test can reach inside and
// return something the file only holds locally.
export function loadSource(files, globals, tail = "") {
  const source = (Array.isArray(files) ? files : [files]).map(readFront).join("\n\n");
  const names = Object.keys(globals);
  return new Function(...names, source + "\n" + tail)(
    ...names.map((n) => globals[n]),
  );
}

// app.js configures the parser as well as rendering through it -- it registers
// the maths rule that keeps markdown-it's escapes out of an equation -- so a
// stub that is only a render function makes app.js throw on load. Shared rather
// than written twice: two suites load app.js, and only one of them cares what
// was registered.
export function markdownitStub(inlineRules = [], renderRules = {}) {
  return () => ({
    render: (s) => s,
    inline: {
      ruler: {
        before: (anchor, name, rule) => inlineRules.push({ anchor, name, rule }),
        // app.js swaps its own referenceAwareLink in over the built-in "link"
        // rule at load time; render is a pass-through here regardless, so the
        // swapped rule is never actually invoked by anything in this stub.
        at: (name, rule) => inlineRules.push({ anchor: name, name, rule }),
      },
    },
    renderer: { rules: renderRules },
    utils: {
      escapeHtml: (s) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      normalizeReference: (s) => s.trim().replace(/\s+/g, " ").toLowerCase(),
    },
  });
}

// app.js defines globals the later modules use — `slugifyTitle` for every
// export filename, and the Turndown rules. Loading it for real rather than
// stubbing those keeps a test honest when app.js changes underneath it.
// TurndownService is a recorder here: no suite needs conversion, only the rules.
export function loadApp() {
  const noop = () => {};
  const el = () => makeEl("div");
  const rules = {};
  const opts = {};
  const opened = [];
  const scrolled = [];
  const commands = [];
  const root = makeEl("html");

  const inlineRules = [];
  const renderRules = {};
  // Mutable: a suite parks the caret somewhere before driving a handler.
  // removeAllRanges/addRange are no-ops here — a suite that cares where the
  // caret landed reads anchorNode/anchorOffset back off this same object,
  // which the fake range below writes on setStart rather than really moving
  // any selection.
  const selection = {
    anchorNode: null,
    anchorOffset: 0,
    removeAllRanges() {},
    addRange() {},
  };

  // The toolbar is sticky at top: 0, so an anchor jump has to clear it. Given a
  // height here so a suite can check the arithmetic rather than just the call.
  const toolbar = makeEl("div");
  toolbar.className = "toolbar";
  toolbar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 69 });

  // Memoised per id, so a suite can reach the same #editor app.js bound its
  // listeners to rather than a fresh element each lookup.
  const byId = new Map();
  const getElementById = (id) => {
    if (!byId.has(id)) byId.set(id, makeEl("div"));
    return byId.get(id);
  };

  return loadSource(
    ["markdown-style.js", "app.js"],
    {
      window: {
        markdownit: markdownitStub(inlineRules, renderRules),
        addEventListener: noop,
        matchMedia: () => ({ matches: false }),
        open: (url, target, features) => opened.push({ url, target, features }),
        scrollTo: (opts) => scrolled.push(opts),
        scrollY: 0,
        getSelection: () => selection,
      },
      TurndownService: class {
        // Options are recorded, not honoured: the serialiser is a pass-through
        // here, so a suite can only assert what app.js asked for. The real
        // constructor exposes them back as `this.options`, which
        // adoptMarkdownStyle writes into on every document it adopts, so the
        // stub needs the same live object rather than just the external copy.
        constructor(options) {
          Object.assign(opts, options);
          this.options = opts;
        }
        addRule(name, rule) {
          rules[name] = rule;
        }
        turndown(html) {
          return html;
        }
      },
      document: {
        getElementById,
        createElement: el,
        addEventListener: noop,
        documentElement: root,
        querySelector: (sel) => (sel === ".toolbar" ? toolbar : null),
        body: { appendChild: noop, removeChild: noop },
        execCommand: (cmd) => commands.push(cmd),
        createRange: () => ({ setStart: noop, collapse: noop }),
      },
      // app.js reaches execCommand through execcommand.js's wrapper now. The
      // recorder stands in for it, so a suite reads the command the module asked
      // for rather than the normalisation a browser would run afterwards — that
      // half has its own suite.
      runCommand: (cmd) => {
        commands.push(cmd);
        return true;
      },

      localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
      navigator: { clipboard: {}, platform: "MacIntel" },
      onToolbarAction: noop,
      toolbarButton: () => null,
      runToolbarAction: noop,
      setTimeout: noop,
      clearTimeout: noop,
      console,
      __rules: rules,
      __inlineRules: inlineRules,
      __renderRules: renderRules,
      __opts: opts,
      __opened: opened,
      __scrolled: scrolled,
      __commands: commands,
      __selection: selection,
      __root: root,
      __byId: byId,
    },
    "; return { rules: __rules, inlineRules: __inlineRules," +
      " renderRules: __renderRules, mathSpan, options: __opts, opened: __opened," +
      " scrolled: __scrolled, commands: __commands, selection: __selection," +
      " documentElement: __root, byId: __byId," +
      " htmlToMarkdown, anchorSlug, headingAnchors, openExternalLink," +
      " slugifyTitle, isBlankContent, sniffMarkdownStyle, reflowMarkdown," +
      " adoptMarkdownStyle, normaliseNbsp, isGhostElement," +
      " scanReferenceDefinitions, normalizeReferenceLabel, appendReferenceDefinitions," +
      " referenceDefinitionsNow: () => referenceDefinitions };",
  );
}
