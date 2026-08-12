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
    style: {},
    children: [],
    attrs: {},
    listeners: {},
    parentNode: parent,
    parentElement: parent,

    classList: { add() {}, remove() {}, contains: () => false },

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
