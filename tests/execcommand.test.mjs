// The normalisation that stands between execCommand and the file.
//
// Two halves, and the second is the one that keeps the first useful. The
// normalisation itself is pure DOM work and is driven directly here. The source
// scan is what stops a later edit reaching for `document.execCommand` again —
// the way this regresses is not a broken fix but a new call site that never
// reaches it, and nothing on screen would look wrong until the file was saved.
//
// Note what is deliberately *not* tested: what any browser actually produces.
// The stub has no editing engine, so a suite here can only assert what we do
// with the output, never what the output is. That half is a manual browser
// check — see TODO 5.1 and tests/browser-check.html.

import { loadSource, makeEl, makeText, readFront } from "./dom.mjs";
import { readdirSync } from "node:fs";

function load() {
  const editor = makeEl("div");
  const commands = [];
  const refreshes = [];

  const api = loadSource(
    "execcommand.js",
    {
      document: {
        createElement: (t) => makeEl(t),
        execCommand: (cmd, _ui, val) => {
          commands.push(val === false ? `${cmd}:false` : cmd);
          return true;
        },
      },
      editor,
      undoRefresh: () => refreshes.push(1),
    },
    "; return { normaliseEditorMarkup, runCommand };",
  );

  return { ...api, editor, commands, refreshes };
}

const el = (tag, attrs = {}) => {
  const node = makeEl(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

function nest(parent, ...children) {
  for (const child of children) parent.appendChild(child);
  return parent;
}

export default function run(check) {
  // --- the one that loses content -----------------------------------------
  //
  // Turndown has no rule for a styled span, so it drops the span and keeps the
  // text: bold applied in an engine that answers with CSS disappears on save,
  // silently, with the document looking correct until it is reopened.

  let { normaliseEditorMarkup, editor } = load();
  let text = makeText("loud");
  let span = nest(el("span", { style: "font-weight: bold" }), text);
  editor.appendChild(span);
  let changed = normaliseEditorMarkup(editor);
  let now = editor.children[0];
  check("a bold span becomes <strong>", now.tagName === "STRONG");
  check("and normalising says it changed something", changed === true);
  // The caret points at a text node. Rebuilding the text instead of moving it
  // would drop the selection on every command that needed normalising.
  check("carrying the text across, not copying it", now.children[0] === text);

  ({ normaliseEditorMarkup, editor } = load());
  editor.appendChild(nest(el("span", { style: "font-style: italic" }), makeText("soft")));
  normaliseEditorMarkup(editor);
  check("an italic span becomes <em>", editor.children[0].tagName === "EM");

  ({ normaliseEditorMarkup, editor } = load());
  editor.appendChild(nest(el("span", { style: "text-decoration: line-through" }), makeText("gone")));
  normaliseEditorMarkup(editor);
  check("a struck span becomes <del>", editor.children[0].tagName === "DEL");

  ({ normaliseEditorMarkup, editor } = load());
  editor.appendChild(nest(el("font", {}), makeText("old mail")));
  normaliseEditorMarkup(editor);
  check("a <font> tag is unwrapped", !editor.children.some((c) => c.tagName === "FONT"));

  // A style markdown cannot express. Turndown would drop the span anyway, so
  // the only thing keeping it achieves is letting them stack up.
  ({ normaliseEditorMarkup, editor } = load());
  text = makeText("blue");
  editor.appendChild(nest(el("span", { style: "color: #06c" }), text));
  normaliseEditorMarkup(editor);
  check("a span with no markdown behind it is unwrapped",
    !editor.children.some((c) => c.tagName === "SPAN"));
  check("and its text stays in the document", editor.children.includes(text));

  // A bare span is somebody else's — a class-marked one especially.
  ({ normaliseEditorMarkup, editor } = load());
  span = nest(el("span", {}), makeText("plain"));
  editor.appendChild(span);
  changed = normaliseEditorMarkup(editor);
  check("a span carrying no style is left alone", editor.children[0] === span);
  check("and normalising reports no change", changed === false);

  // --- subtrees nothing here may touch ------------------------------------
  //
  // Mermaid and MathJax each keep the only copy of their own source inside the
  // rendered output. Rewriting one of those spans breaks the round-trip to
  // markdown irrecoverably, and the document still looks right on screen.

  for (const [label, wrapper] of [
    ["a <pre>", () => el("pre")],
    ["a <code>", () => el("code")],
    ["a mermaid wrapper", () => { const d = el("div"); d.className = "mermaid-wrapper"; return d; }],
    ["a MathJax container", () => el("mjx-container")],
  ]) {
    ({ normaliseEditorMarkup, editor } = load());
    span = nest(el("span", { style: "font-weight: bold" }), makeText("x"));
    editor.appendChild(nest(wrapper(), span));
    changed = normaliseEditorMarkup(editor);
    check(`${label} is left alone`, editor.children[0].children[0] === span && !changed);
  }

  // --- the nesting both engines get wrong ----------------------------------
  //
  // A list that is a direct child of another list has no indent Turndown can
  // give it, so it serialises flat: the nesting the user just asked for is gone
  // from the file, with nothing wrong on screen either side of the save.

  ({ normaliseEditorMarkup, editor } = load());
  const outer = el("ul");
  const item = el("li");
  const inner = el("ul");
  nest(outer, item, inner);
  editor.appendChild(outer);
  changed = normaliseEditorMarkup(editor);
  check("a sublist beside its item moves inside it",
    item.children.includes(inner) && !outer.children.includes(inner));
  check("and that counts as a change", changed === true);

  // Already right — which is what the document looks like once this has run.
  ({ normaliseEditorMarkup, editor } = load());
  const okItem = el("li");
  const okInner = el("ul");
  nest(okItem, okInner);
  editor.appendChild(nest(el("ul"), okItem));
  check("a correctly nested sublist is not moved again",
    normaliseEditorMarkup(editor) === false);

  // A list at the top of the document has no item to move into, and inventing
  // one would be a different document from the one the user is looking at.
  ({ normaliseEditorMarkup, editor } = load());
  const lone = el("ul");
  editor.appendChild(nest(el("ul"), lone));
  check("a sublist with no item before it is left where it is",
    normaliseEditorMarkup(editor) === false);

  // --- invalid nesting the commands leave behind ---------------------------
  //
  // All three were observed rather than imagined: see tests/browser-check.html,
  // which is where the engine-specific claims in this file come from.

  // Chrome answers formatBlock, run with the caret in a bullet, by wrapping the
  // whole list in the heading. The list stops being a list — the one outright
  // destructive thing on the list, and it is reachable from a shipped button.
  ({ normaliseEditorMarkup, editor } = load());
  const list = nest(el("ul"), nest(el("li"), makeText("one")));
  editor.appendChild(nest(el("h1"), list));
  changed = normaliseEditorMarkup(editor);
  check("a heading wrapped around a list is unwrapped",
    editor.children[0] === list && changed === true);

  // And insertUnorderedList leaves <p><ul>…</ul></p> behind.
  ({ normaliseEditorMarkup, editor } = load());
  const inList = nest(el("ul"), nest(el("li"), makeText("one")));
  editor.appendChild(nest(el("p"), inList));
  normaliseEditorMarkup(editor);
  check("a paragraph wrapped around a list is unwrapped", editor.children[0] === inList);

  // A list inside a list item is ordinary markup and must survive, which is
  // what keeps the rule above from eating every nested list in the document.
  ({ normaliseEditorMarkup, editor } = load());
  const keepItem = el("li");
  nest(keepItem, nest(el("ul"), el("li")));
  editor.appendChild(nest(el("ul"), keepItem));
  check("a list inside a list item is left alone",
    normaliseEditorMarkup(editor) === false);

  ({ normaliseEditorMarkup, editor } = load());
  const quote = el("blockquote");
  editor.appendChild(nest(quote, nest(el("ul"), el("li"))));
  check("a list inside a blockquote is left alone",
    normaliseEditorMarkup(editor) === false);

  // Chrome's outdent leaves an <li> directly inside another, with no list in
  // between. Turndown reads that as one item, so the second bullet is swallowed
  // into the first on save.
  ({ normaliseEditorMarkup, editor } = load());
  const first = nest(el("li"), makeText("one"));
  const second = nest(el("li"), makeText("two"));
  first.appendChild(second);
  editor.appendChild(nest(el("ul"), first));
  changed = normaliseEditorMarkup(editor);
  check("an <li> nested in an <li> becomes its sibling",
    !first.children.includes(second) && changed === true);

  // Chrome stamps id="null" on a rule inserted with no id given.
  ({ normaliseEditorMarkup, editor } = load());
  const rule = el("hr", { id: "null" });
  editor.appendChild(rule);
  changed = normaliseEditorMarkup(editor);
  check("a rule's bogus id is stripped",
    rule.getAttribute("id") === null && changed === true);

  ({ normaliseEditorMarkup, editor } = load());
  const realRule = el("hr", { id: "intro" });
  editor.appendChild(realRule);
  check("a real id on a rule is kept",
    normaliseEditorMarkup(editor) === false && realRule.getAttribute("id") === "intro");

  // --- the wrapper ---------------------------------------------------------

  let api = load();
  check("styleWithCSS is turned off at load",
    api.commands.includes("styleWithCSS:false"));

  api = load();
  api.runCommand("bold");
  check("a command reaches execCommand", api.commands.includes("bold"));
  check("and nothing to normalise refreshes nothing", api.refreshes.length === 0);

  // execCommand dispatches `input` before we get here, so the undo stack has
  // already snapshotted the un-normalised document. Refreshing corrects that
  // snapshot in place; dispatching a second input event would instead make one
  // action cost two Ctrl+Z, the first of which would look like it did nothing.
  api = load();
  api.editor.appendChild(nest(el("span", { style: "font-weight: bold" }), makeText("x")));
  api.runCommand("bold");
  check("a command that needed normalising refreshes the undo snapshot",
    api.refreshes.length === 1);

  // --- the boundary --------------------------------------------------------
  //
  // All of the above is worth nothing if a call site skips the wrapper. This is
  // the check that actually holds the rule.
  const offenders = readdirSync(new URL("../front/", import.meta.url))
    .filter((name) => name.endsWith(".js") && name !== "execcommand.js")
    .filter((name) => /document\.execCommand/.test(readFront(name)));
  check("execcommand.js is the only file that calls execCommand directly",
    offenders.length === 0);

  // Both bundles have to ship it, and ahead of everything that calls it —
  // format-bar.js and app.js both do, at click time rather than at load, but a
  // bundle missing the file entirely would throw on the first Bold.
  for (const [label, source, pattern] of [
    ["index.html", readFront("index.html"), /<script src="\/([a-z-]+\.js)"><\/script>/g],
    ["the editable export", readFront("html-export.js"), /"\/([a-z-]+\.js)"/g],
  ]) {
    const scripts = [...source.matchAll(pattern)].map((m) => m[1]);
    check(`${label} ships execcommand.js`, scripts.includes("execcommand.js"));
    check(`${label} loads it before format-bar.js`,
      scripts.indexOf("execcommand.js") < scripts.indexOf("format-bar.js"));
  }
}
