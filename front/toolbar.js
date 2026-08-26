// The one definition of the menu bar. Both the app and the editable export
// render from this spec, so the two can no longer drift.
//
// It used to be a row of sixteen buttons that wrapped onto a second line below
// about 900px, and every new export or formatting control made it worse. A menu
// bar scales where a row does not: File / Edit / Insert / Format / View /
// Export are six short words whatever ends up inside them, and the formatting
// the format bar has no room for finally has somewhere to live.
//
// LOAD ORDER: this file must run before every other front/ script. app.js,
// file-api.js, docx-export.js and static-export.js all call getElementById at
// top level, and they bind to null if the toolbar has not been built yet.
//
// The variant comes from #editor[data-exported], which only exported documents
// carry. app.js strips that attribute on window load, long after this runs.

// Menu items are text and a shortcut, the way a menu bar's are — the icons the
// old button row carried went with it, and the GitHub mark went with the aside.
// One survives: the check for a toggling item.
const TOOLBAR_ICONS = {
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
};

// Ctrl reads wrong on a Mac, and these are only ever labels — the bindings
// themselves live in app.js, undo.js and file-api.js and already accept both.
const IS_MAC = /Mac|iPhone|iPad/.test(
  (typeof navigator !== "undefined" && (navigator.platform || navigator.userAgent)) || "",
);

function shortcutLabel(shortcut) {
  if (!shortcut) return "";
  return IS_MAC
    ? shortcut.replace(/Ctrl\+/g, "\u2318").replace(/Shift\+/g, "\u21e7")
    : shortcut;
}

// `variants` decides which documents an item appears in, and the only real
// split is still the file group: the app talks to the file server, while an
// exported document has none and falls back to upload/download. Everything
// else is shared — exported documents carry the full export set and read their
// own inline <style>/<script> to do it.
//
// A `separator: true` entry is filtered by variant like any other, and the
// leading, trailing and doubled ones left behind are collapsed at render time
// so the export variant does not open a File menu with a rule floating at the
// top of it.
const ALL = ["app", "export"];

const TOOLBAR_MENUS = [
  { id: "fileMenu", label: "File", variants: ALL, items: [
    // New carries the weight Clear used to: the confirmation dialog and the
    // full reset (autosave, sniffed style, undo, file association). See
    // CHANGELOG.md, "New and Clear are two different weights now". It leads
    // the menu the way New/Open do in every other editor.
    { id: "newBtn", action: "new", label: "New document", variants: ALL },
    { separator: true, variants: ALL },
    { id: "openBtn", action: "open-file", label: "Open\u2026", shortcut: "Ctrl+O", variants: ["app"] },
    { action: "reload-file", label: "Reload from disk", variants: ["app"] },
    { id: "uploadBtn", action: "upload-md", label: "Open\u2026", shortcut: "Ctrl+O", variants: ["export"] },
    { separator: true, variants: ALL },
    { id: "saveBtn", action: "save-file", label: "Save", shortcut: "Ctrl+S", variants: ["app"] },
    { action: "save-as-file", label: "Save As\u2026", shortcut: "Ctrl+Shift+S", variants: ["app"] },
    { id: "downloadBtn", action: "download-md", label: "Download markdown", shortcut: "Ctrl+S", variants: ["export"] },
  ] },

  { id: "editMenu", label: "Edit", variants: ALL, items: [
    { id: "undoBtn", action: "undo", label: "Undo", shortcut: "Ctrl+Z", variants: ALL },
    { id: "redoBtn", action: "redo", label: "Redo", shortcut: "Ctrl+Shift+Z", variants: ALL },
    { separator: true, variants: ALL },
    { id: "copyBtn", action: "copy-md", label: "Copy markdown", variants: ALL },
    { id: "pasteBtn", action: "paste-md", label: "Paste markdown", variants: ALL },
    { separator: true, variants: ALL },
    // An ordinary edit now — select all, delete — rather than the
    // document-replacing action it used to be, so it lives here rather than
    // in File. See CHANGELOG.md, "New and Clear are two different weights now".
    { id: "clearBtn", action: "clear", label: "Clear document", variants: ALL },
  ] },

  { id: "insertMenu", label: "Insert", variants: ALL, items: [
    { id: "tocInsertBtn", action: "insert-toc", label: "Table of contents", variants: ALL },
    { action: "insert-hr", label: "Horizontal rule", variants: ALL },
  ] },

  // These drive applyFormat in format-bar.js, which the format bar's own
  // buttons already went through — the menu is a second way to reach the same
  // ten formats, not a second implementation of them.
  { id: "formatMenu", label: "Format", variants: ALL, items: [
    { action: "format-p", label: "Paragraph", variants: ALL },
    { action: "format-h1", label: "Heading 1", variants: ALL },
    { action: "format-h2", label: "Heading 2", variants: ALL },
    { action: "format-h3", label: "Heading 3", variants: ALL },
    { separator: true, variants: ALL },
    { action: "format-bold", label: "Bold", shortcut: "Ctrl+B", variants: ALL },
    { action: "format-italic", label: "Italic", shortcut: "Ctrl+I", variants: ALL },
    { action: "format-strikethrough", label: "Strikethrough", variants: ALL },
    { separator: true, variants: ALL },
    { action: "format-ul", label: "Bullet list", variants: ALL },
    { action: "format-ol", label: "Numbered list", variants: ALL },
    { action: "format-code", label: "Code block", variants: ALL },
  ] },

  { id: "viewMenu", label: "View", variants: ALL, items: [
    // The one item that carries state. outline.js writes aria-pressed on it by
    // action, exactly as it did to the old toggle button, so the checkmark is
    // drawn from that attribute rather than from anything tracked here.
    { id: "tocBtn", action: "toggle-outline", label: "Outline sidebar", checkable: true, variants: ALL },
  ] },

  { id: "exportMenu", label: "Export", variants: ALL, items: [
    { id: "htmlBtn", action: "export-html", label: "HTML page\u2026", variants: ALL },
    // App-only, and the one place the export set is deliberately shorter than
    // the app's. PDF and DOCX are terminal formats: nobody edits a PDF and
    // sends it back, so neither contributes to the chain an editable export
    // exists to keep going — and both cost a module in every exported file.
    // Dropping them from the variant and from ASSETS has to happen together,
    // or one ships a dead control and the other dead weight.
    { id: "pdfBtn", action: "export-pdf", label: "PDF\u2026", shortcut: "Ctrl+Shift+P", variants: ["app"] },
    { id: "docxBtn", action: "export-docx", label: "Word document\u2026", variants: ["app"] },
    { separator: true, variants: ALL },
    { id: "editableBtn", action: "export-editable", label: "Editable copy\u2026", variants: ALL },
  ] },
];

// Menu clicks are delegated: one listener on .toolbar dispatches by
// data-action. Modules register behaviour by name instead of reaching for an
// element, so an item missing from a variant means an unused registration
// rather than a listener silently bound to null.
//
// Several handlers may share an action — they run in registration order, and
// each is awaited before the next starts. That is how file-api.js hooks "new"
// to drop the file association on top of the reset app.js already does, and
// the await is what keeps that true now app.js's handler stops on a dialog:
// without it file-api.js would run while the question was still on screen, see
// a document that is not blank yet, and leave the file association behind.
const toolbarActions = new Map();

function onToolbarAction(action, handler) {
  const handlers = toolbarActions.get(action);
  if (handlers) handlers.push(handler);
  else toolbarActions.set(action, [handler]);
}

// Looked up on demand rather than held from load time, for handlers that need
// to style their own item (a disabled state, a checkmark).
function toolbarButton(action) {
  return document.querySelector(`.toolbar [data-action="${action}"]`);
}

// Nobody awaits the result, so a handler that throws would otherwise surface as
// a bare unhandled rejection naming neither the action nor the item. Caught for
// the message only: the loop still stops, the way it did when a throw
// propagated synchronously out of the click listener.
async function dispatchToolbarAction(action, button, event) {
  try {
    for (const handler of toolbarActions.get(action) || []) {
      await handler(button, event);
    }
  } catch (err) {
    console.error(`[Toolbar] "${action}" handler failed:`, err);
  }
}

// Lets the keyboard shortcuts drive the same handlers without faking a click.
function runToolbarAction(action) {
  return dispatchToolbarAction(action, toolbarButton(action));
}

function toolbarVariant() {
  const editorEl = document.getElementById("editor");
  return editorEl && editorEl.hasAttribute("data-exported") ? "export" : "app";
}

function iconSvg(name, size) {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2">${TOOLBAR_ICONS[name]}</svg>`
  );
}

// Variant filtering leaves separators stranded — the export variant drops four
// File items and would open on a rule. Collapse them here rather than making
// every spec author reason about which side of a split they fall on.
function visibleItems(items, variant) {
  const kept = items.filter((item) => item.variants.includes(variant));
  const out = [];
  for (const item of kept) {
    if (!item.separator) {
      out.push(item);
    } else if (out.length && !out[out.length - 1].separator) {
      out.push(item);
    }
  }
  while (out.length && out[out.length - 1].separator) out.pop();
  return out;
}

function buildMenuItem(spec) {
  if (spec.separator) {
    const rule = document.createElement("div");
    rule.className = "menu-separator";
    rule.setAttribute("role", "separator");
    return rule;
  }

  const item = document.createElement("button");
  if (spec.id) item.id = spec.id;
  item.className = "menu-item";
  item.type = "button";
  item.setAttribute("data-action", spec.action);
  item.setAttribute("role", "menuitem");
  item.setAttribute("tabindex", "-1");
  if (spec.checkable) item.setAttribute("aria-pressed", "false");

  const check = document.createElement("span");
  check.className = "menu-check";
  check.setAttribute("aria-hidden", "true");
  check.innerHTML = spec.checkable ? iconSvg("check", 14) : "";
  item.appendChild(check);

  const label = document.createElement("span");
  label.className = "menu-label";
  label.textContent = spec.label;
  item.appendChild(label);

  const shortcut = document.createElement("span");
  shortcut.className = "menu-shortcut";
  shortcut.setAttribute("aria-hidden", "true");
  shortcut.textContent = shortcutLabel(spec.shortcut);
  item.appendChild(shortcut);

  return item;
}

// The trigger carries `data-menu`, not `data-action`, because it is not an
// action: it belongs to the mechanism here rather than to any module. Keeping
// it out of the action namespace is what keeps "every rendered action has a
// handler in this variant's bundle" a true statement.
function buildMenu(spec, variant) {
  const items = visibleItems(spec.items, variant);
  if (!items.length) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "menu";

  const trigger = document.createElement("button");
  trigger.id = spec.id;
  trigger.className = "menu-trigger";
  trigger.type = "button";
  trigger.textContent = spec.label;
  trigger.setAttribute("data-menu", spec.id);
  trigger.setAttribute("aria-haspopup", "true");
  trigger.setAttribute("aria-expanded", "false");
  wrapper.appendChild(trigger);

  const panel = document.createElement("div");
  panel.className = "menu-panel";
  panel.setAttribute("role", "menu");
  panel.setAttribute("aria-label", spec.label);
  for (const item of items) panel.appendChild(buildMenuItem(item));
  wrapper.appendChild(panel);

  return wrapper;
}

// At most one menu is ever open, so the trigger and its wrapper are held here
// rather than looked up again — nothing else needs to know a menu exists.
let openMenu = null;

function closeMenu({ refocus = false } = {}) {
  if (!openMenu) return;
  const { wrapper, trigger } = openMenu;
  wrapper.removeAttribute("data-open");
  trigger.setAttribute("aria-expanded", "false");
  openMenu = null;
  if (refocus) trigger.focus();
}

function showMenu(trigger) {
  const wrapper = trigger.parentElement;
  if (openMenu && openMenu.wrapper === wrapper) return;
  closeMenu();
  wrapper.setAttribute("data-open", "true");
  trigger.setAttribute("aria-expanded", "true");
  openMenu = { wrapper, trigger };
}

function toggleMenu(trigger) {
  if (openMenu && openMenu.wrapper === trigger.parentElement) closeMenu();
  else showMenu(trigger);
}

function menuTriggers() {
  return Array.from(document.querySelectorAll(".toolbar .menu-trigger"));
}

function openMenuItems() {
  if (!openMenu) return [];
  return Array.from(openMenu.wrapper.querySelectorAll(".menu-item:not([disabled])"));
}

// Moves focus within the open menu, wrapping at both ends. `from` is the item
// focus is on now, or -1 to mean "before the first".
function focusItem(step, from) {
  const items = openMenuItems();
  if (!items.length) return;
  const at = from === undefined ? items.indexOf(document.activeElement) : from;
  const next = (at + step + items.length) % items.length;
  items[next].focus();
}

// There is no app title in the bar. It was an <h1> reading "Marky Markdown
// Editor" and it cost a third of the toolbar's width to say something the tab
// already says — and it took the page's only h1 with it, which belonged to the
// document rather than to the chrome.
//
// Only the app tracks a file on disk, but the label is harmless either way and
// file-api.js expects to find it.
function buildFileLabel() {
  const currentFile = document.createElement("span");
  currentFile.id = "currentFile";
  currentFile.className = "current-file";
  return currentFile;
}

// The theme toggle is the whole of the document row's right-hand side now. It
// used to sit beside a GitHub link, which pointed away from the app from a bar
// that should be about the document — that link is gone, and the wrapper that
// existed to hold the pair went with it.
//
// Exported documents get no toggle on purpose: they follow the reader's OS
// preference rather than inheriting the author's stored one.
function buildThemeToggle() {
  const toggle = document.createElement("div");
  toggle.id = "themeToggle";
  toggle.className = "theme-toggle";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", "false");
  // theme-manager.js keeps all three of these in step with the current theme;
  // these are the values before it has run. The title is the one a sighted user
  // gets — a bare sliding pill with no label says nothing about what it does.
  toggle.setAttribute("aria-label", "Switch to dark mode");
  toggle.title = "Switch to dark mode";
  toggle.setAttribute("tabindex", "0");
  toggle.setAttribute("data-testid", "theme-toggle");
  toggle.innerHTML = '<div class="theme-toggle-slider"></div>';
  return toggle;
}

// The toolbar's second row: what the document is, and the control that is not
// about the document at all. Returns nothing for an exported document, which
// has neither a file on disk nor a theme toggle — the row would be an empty
// band, and `:root[data-variant]` takes the reserved height down to match.
function buildToolbarContent(variant) {
  if (variant !== "app") return null;

  const content = document.createElement("div");
  content.className = "toolbar-content";
  content.appendChild(buildFileLabel());
  content.appendChild(buildThemeToggle());
  return content;
}

function buildToolbar(variant) {
  const toolbar = document.querySelector(".toolbar");
  if (!toolbar) return;

  const menubar = document.createElement("nav");
  menubar.className = "menubar";
  menubar.setAttribute("role", "menubar");
  menubar.setAttribute("aria-label", "Main menu");

  for (const spec of TOOLBAR_MENUS) {
    if (!spec.variants.includes(variant)) continue;
    const menu = buildMenu(spec, variant);
    if (menu) menubar.appendChild(menu);
  }

  // Menus first and hard left, the way a menu bar goes; the filename sits after
  // them and its auto margin takes the slack, which is what keeps the aside
  // pinned right at every width.
  // Two rows in the app. The menus get the first to themselves; the second is
  // the document row — the filename today, a tab bar once there is more than
  // one document open (TODO 4.1) — with the theme toggle pinned to its right.
  toolbar.appendChild(menubar);
  const content = buildToolbarContent(variant);
  if (content) toolbar.appendChild(content);

  // Formatting acts on the editor's selection, and clicking a button would
  // otherwise blur the editor and take the selection with it. Preventing the
  // default on mousedown keeps focus where it is; the click still fires. Same
  // trick, and same reason, as the format bar's own buttons.
  toolbar.addEventListener("mousedown", (event) => {
    if (event.target.closest(".menubar")) event.preventDefault();
  });

  // The click target can be the <svg> inside a checkmark, hence closest().
  toolbar.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-menu]");
    if (trigger) {
      toggleMenu(trigger);
      return;
    }

    const item = event.target.closest("[data-action]");
    if (!item) return;
    closeMenu();
    dispatchToolbarAction(item.dataset.action, item, event);
  });

  // Sliding across the bar with one menu open switches between them, the way a
  // menu bar is expected to behave. Only while one is open: hovering a closed
  // bar must not spring menus at you.
  menubar.addEventListener("mouseover", (event) => {
    if (!openMenu) return;
    const trigger = event.target.closest("[data-menu]");
    if (trigger) showMenu(trigger);
  });

  menubar.addEventListener("keydown", (event) => {
    const trigger = event.target.closest("[data-menu]");
    const triggers = menuTriggers();

    switch (event.key) {
      case "ArrowRight":
      case "ArrowLeft": {
        const current = openMenu ? openMenu.trigger : trigger;
        if (!current) return;
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next =
          triggers[(triggers.indexOf(current) + step + triggers.length) % triggers.length];
        if (openMenu) showMenu(next);
        next.focus();
        break;
      }
      case "ArrowDown":
        event.preventDefault();
        if (trigger) {
          showMenu(trigger);
          focusItem(1, -1);
        } else {
          focusItem(1);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (trigger) {
          showMenu(trigger);
          focusItem(-1, 0);
        } else {
          focusItem(-1);
        }
        break;
      case "Home":
      case "End":
        if (!openMenu) return;
        event.preventDefault();
        focusItem(event.key === "Home" ? 1 : -1, event.key === "Home" ? -1 : 0);
        break;
      default:
    }
  });

  // Anything outside the open menu dismisses it. The trigger's own click is
  // already handled above and bubbles to here afterwards, which is why this
  // tests containment rather than closing unconditionally.
  document.addEventListener("click", (event) => {
    if (openMenu && !openMenu.wrapper.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    // Focus is inside the menu while it is open, so it has to come back out
    // with it — otherwise Escape leaves focus on a hidden item and the next
    // keystroke goes nowhere. closeMenu returns early when nothing is open, so
    // this costs a notify.js dialog's Escape nothing.
    if (event.key === "Escape") closeMenu({ refocus: true });
  });
}

buildToolbar(toolbarVariant());
