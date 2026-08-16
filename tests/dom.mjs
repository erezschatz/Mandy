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

    get previousElementSibling() {
      const siblings = node.parentNode ? node.parentNode.children : [];
      const index = siblings.indexOf(node);
      return index > 0 ? siblings[index - 1] : null;
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
  // Mutable: a suite parks the caret somewhere before driving a handler.
  const selection = { anchorNode: null };

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
    "app.js",
    {
      window: {
        markdownit: () => ({ render: (s) => s }),
        addEventListener: noop,
        matchMedia: () => ({ matches: false }),
        open: (url, target, features) => opened.push({ url, target, features }),
        scrollTo: (opts) => scrolled.push(opts),
        scrollY: 0,
        getSelection: () => selection,
      },
      TurndownService: class {
        // Options are recorded, not honoured: the serialiser is a pass-through
        // here, so a suite can only assert what app.js asked for.
        constructor(options) {
          Object.assign(opts, options);
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
      __opts: opts,
      __opened: opened,
      __scrolled: scrolled,
      __commands: commands,
      __selection: selection,
      __root: root,
      __byId: byId,
    },
    "; return { rules: __rules, options: __opts, opened: __opened," +
      " scrolled: __scrolled, commands: __commands, selection: __selection," +
      " documentElement: __root, byId: __byId," +
      " htmlToMarkdown, anchorSlug, headingAnchors, openExternalLink," +
      " slugifyTitle, isBlankContent };",
  );
}
