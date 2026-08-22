// The one definition of the toolbar. Both the app and the editable export
// render from this spec, so the two can no longer drift.
//
// LOAD ORDER: this file must run before every other front/ script. app.js,
// file-api.js, docx-export.js and static-export.js all call getElementById at
// top level, and they bind to null if the toolbar has not been built yet.
//
// The variant comes from #editor[data-exported], which only exported documents
// carry. app.js strips that attribute on window load, long after this runs.

const TOOLBAR_ICONS = {
  open: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>',
  save:
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>' +
    '<polyline points="17 21 17 13 7 13 7 21"></polyline>' +
    '<polyline points="7 3 7 8 15 8"></polyline>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
    '<polyline points="17 8 12 3 7 8"></polyline>' +
    '<line x1="12" y1="3" x2="12" y2="15"></line>',
  download:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
    '<polyline points="7 10 12 15 17 10"></polyline>' +
    '<line x1="12" y1="15" x2="12" y2="3"></line>',
  clear:
    '<polyline points="3 6 5 6 21 6"></polyline>' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '<line x1="10" y1="11" x2="10" y2="17"></line>' +
    '<line x1="14" y1="11" x2="14" y2="17"></line>',
  copy:
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
  paste:
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>' +
    '<rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>',
  html:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
    '<polyline points="14 2 14 8 20 8"></polyline>' +
    '<line x1="12" y1="18" x2="12" y2="12"></line>' +
    '<line x1="9" y1="15" x2="15" y2="15"></line>',
  pdf:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
    '<polyline points="14 2 14 8 20 8"></polyline>' +
    '<line x1="16" y1="13" x2="8" y2="13"></line>' +
    '<line x1="16" y1="17" x2="8" y2="17"></line>' +
    '<polyline points="10 9 9 9 8 9"></polyline>',
  docx:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>' +
    '<polyline points="14 2 14 8 20 8"></polyline>' +
    '<path d="M9 15l2 2 4-4"></path>',
  editable:
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
    '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"></path>',
  outline:
    '<line x1="4" y1="6" x2="4" y2="6"></line>' +
    '<line x1="8" y1="6" x2="20" y2="6"></line>' +
    '<line x1="11" y1="12" x2="20" y2="12"></line>' +
    '<line x1="14" y1="18" x2="20" y2="18"></line>' +
    '<circle cx="4" cy="6" r="1" fill="currentColor"></circle>' +
    '<circle cx="7" cy="12" r="1" fill="currentColor"></circle>' +
    '<circle cx="10" cy="18" r="1" fill="currentColor"></circle>',
  caret: '<polyline points="6 9 12 15 18 9"></polyline>',
  github:
    '<path d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-2.764.509-3.479-.674-3.699-1.292-.124-.317-.66-1.293-1.127-1.554-.385-.207-.936-.715-.014-.729.866-.014 1.485.797 1.691 1.128.99 1.663 2.571 1.196 3.204.907.096-.715.385-1.196.701-1.471-2.448-.275-5.005-1.224-5.005-5.432 0-1.196.426-2.186 1.128-2.956-.111-.275-.496-1.402.11-2.915 0 0 .921-.288 3.024 1.128a10.193 10.193 0 0 1 2.75-.371c.936 0 1.871.123 2.75.371 2.104-1.43 3.025-1.128 3.025-1.128.605 1.513.221 2.64.111 2.915.701.77 1.127 1.747 1.127 2.956 0 4.222-2.571 5.157-5.019 5.432.399.344.743 1.004.743 2.035 0 1.471-.014 2.654-.014 3.025 0 .289.206.632.756.522C19.851 20.979 23 16.854 23 12c0-6.077-4.922-11-11-11Z"></path>',
};

// Grouped so each group is a .button-group, the unit that wraps as a block.
// `variants` decides which documents a button appears in. The only real split
// is the file group: the app talks to the file server (open/save), while an
// exported document has none and falls back to upload/download. Everything
// else is shared — exported documents carry the full export set, and read
// their own inline <style>/<script> to do it.
const TOOLBAR_GROUPS = [
  [
    { id: "openBtn", action: "open-file", label: "Open", icon: "open", variants: ["app"],
      title: "Open markdown file (Ctrl+O)",
      menu: [
        { action: "open-file", label: "Open…" },
        { action: "reload-file", label: "Reload from disk" },
      ] },
    { id: "uploadBtn", action: "upload-md", label: "Upload MD", icon: "upload", variants: ["export"],
      title: "Upload markdown file (Ctrl+O)" },
    { id: "saveBtn", action: "save-file", label: "Save", icon: "save", variants: ["app"],
      title: "Save markdown file (Ctrl+S, Ctrl+Shift+S to save as)",
      menu: [
        { action: "save-file", label: "Save" },
        { action: "save-as-file", label: "Save As…" },
      ] },
    { id: "downloadBtn", action: "download-md", label: "Download MD", icon: "download", variants: ["export"],
      title: "Download as markdown (Ctrl+S)" },
    { id: "clearBtn", action: "clear", label: "Clear", icon: "clear", variants: ["app", "export"],
      title: "Clear document" },
  ],
  [
    { id: "tocBtn", action: "toggle-outline", label: "Outline", icon: "outline",
      variants: ["app", "export"],
      title: "Show the document outline",
      menu: [
        { action: "toggle-outline", label: "Show outline" },
        { action: "insert-toc", label: "Insert table of contents" },
      ] },
  ],
  [
    { id: "copyBtn", action: "copy-md", label: "Copy MD", icon: "copy", variants: ["app", "export"],
      title: "Copy markdown to clipboard" },
    { id: "pasteBtn", action: "paste-md", label: "Paste MD", icon: "paste", variants: ["app", "export"],
      title: "Paste from clipboard" },
  ],
  [
    { id: "htmlBtn", action: "export-html", label: "HTML", icon: "html", variants: ["app", "export"],
      title: "Export the document as a standalone HTML page" },
    { id: "pdfBtn", action: "export-pdf", icon: "pdf", variants: ["app", "export"],
      title: "Export as PDF file", ariaLabel: "Export document as PDF",
      labelHtml:
        '<span class="btn-text">PDF</span>' +
        '<span class="loading-indicator" style="display: none">⏳</span>' },
    { id: "docxBtn", action: "export-docx", icon: "docx", variants: ["app", "export"],
      title: "Export as Word document (.docx)", ariaLabel: "Export document as DOCX",
      labelHtml:
        '<span class="docx-btn-text">DOCX</span>' +
        '<span class="docx-loading-indicator" style="display: none">⏳</span>' },
    { id: "editableBtn", action: "export-editable", label: "Editable", icon: "editable",
      variants: ["app", "export"],
      title: "Export a copy recipients can edit in their browser and send back" },
  ],
];

// Toolbar clicks are delegated: one listener on .toolbar dispatches by
// data-action. Modules register behaviour by name instead of reaching for an
// element, so a button missing from a variant means an unused registration
// rather than a listener silently bound to null.
//
// Several handlers may share an action — they run in registration order, and
// each is awaited before the next starts. That is how file-api.js hooks "clear"
// to drop the file association on top of the clearing app.js already does, and
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
// to style their own button (a spinner, a disabled state, a flash of "Saved!").
function toolbarButton(action) {
  return document.querySelector(`.toolbar [data-action="${action}"]`);
}

// Nobody awaits the result, so a handler that throws would otherwise surface as
// a bare unhandled rejection naming neither the action nor the button. Caught
// for the message only: the loop still stops, the way it did when a throw
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

function buildToolbarButton(spec) {
  const button = document.createElement("button");
  button.id = spec.id;
  button.title = spec.title;
  button.setAttribute("data-action", spec.action);
  if (spec.ariaLabel) button.setAttribute("aria-label", spec.ariaLabel);
  button.innerHTML = iconSvg(spec.icon, 20) + (spec.labelHtml || spec.label);
  return button;
}

// A split button: the primary action is still a plain click, and a caret beside
// it offers the alternatives. The menu is built inside the wrapper, and so
// inside `.toolbar` — which is the whole point. Its items are ordinary
// [data-action] buttons, so the one delegated listener dispatches them already
// and a menu entry needs no wiring beyond the `onToolbarAction` its module
// registers anyway.
//
// The caret carries `data-menu`, not `data-action`, because it is not an action:
// it belongs to the mechanism here rather than to any module. Keeping it out of
// the action namespace is what keeps "every rendered action has a handler in
// this variant's bundle" a true statement.
function buildSplitButton(spec) {
  const wrapper = document.createElement("div");
  wrapper.className = "split-button";
  wrapper.appendChild(buildToolbarButton(spec));

  const caret = document.createElement("button");
  caret.id = spec.id + "Menu";
  caret.className = "split-caret";
  caret.title = `More ${spec.label} options`;
  caret.setAttribute("data-menu", spec.action);
  caret.setAttribute("aria-haspopup", "true");
  caret.setAttribute("aria-expanded", "false");
  caret.setAttribute("aria-label", `More ${spec.label} options`);
  caret.innerHTML = iconSvg("caret", 14);
  wrapper.appendChild(caret);

  const menu = document.createElement("div");
  menu.className = "split-menu";
  menu.setAttribute("role", "menu");
  for (const item of spec.menu) {
    const entry = document.createElement("button");
    entry.className = "split-menu-item";
    entry.setAttribute("data-action", item.action);
    entry.setAttribute("role", "menuitem");
    entry.textContent = item.label;
    menu.appendChild(entry);
  }
  wrapper.appendChild(menu);

  return wrapper;
}

// At most one menu is ever open, so the caret and its wrapper are held here
// rather than looked up again — nothing else needs to know a menu exists.
let openSplit = null;

function closeSplitMenu() {
  if (!openSplit) return;
  openSplit.wrapper.removeAttribute("data-open");
  openSplit.caret.setAttribute("aria-expanded", "false");
  openSplit = null;
}

function toggleSplitMenu(caret) {
  const wrapper = caret.parentElement;
  const wasOpen = openSplit && openSplit.wrapper === wrapper;
  closeSplitMenu();
  if (wasOpen) return;

  wrapper.setAttribute("data-open", "true");
  caret.setAttribute("aria-expanded", "true");
  openSplit = { wrapper, caret };
}

function buildToolbarTitle(variant) {
  const title = document.createElement("div");
  title.className = "toolbar-title";

  const heading = document.createElement("h1");
  heading.textContent =
    variant === "export" ? "Markdown Editor" : "Marky Markdown Editor";
  title.appendChild(heading);

  // Only the app tracks a file on disk, but the label is harmless either way
  // and file-api.js expects to find it.
  const currentFile = document.createElement("span");
  currentFile.id = "currentFile";
  currentFile.className = "current-file";
  title.appendChild(currentFile);

  return title;
}

// The right-hand region: its own side of the toolbar, outside .buttons so it
// never reflows with them. Exported documents get no theme toggle on purpose —
// they follow the reader's OS preference rather than the author's stored one.
function buildToolbarAside(variant) {
  const aside = document.createElement("div");
  aside.className = "theme-toggle-container";

  const github = document.createElement("a");
  github.href = "https://github.com/Tommertom/marky";
  github.target = "_blank";
  github.rel = "noopener noreferrer";
  github.id = "githubBtn";
  github.title = "View on GitHub";
  github.innerHTML =
    '<svg height="32" viewBox="0 0 24 24" version="1.1" width="32" ' +
    `fill="white">${TOOLBAR_ICONS.github}</svg>`;
  aside.appendChild(github);

  if (variant === "app") {
    const toggle = document.createElement("div");
    toggle.id = "themeToggle";
    toggle.className = "theme-toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", "false");
    toggle.setAttribute("aria-label", "Toggle dark mode");
    toggle.setAttribute("tabindex", "0");
    toggle.setAttribute("data-testid", "theme-toggle");
    toggle.innerHTML = '<div class="theme-toggle-slider"></div>';
    aside.appendChild(toggle);
  }

  return aside;
}

function buildToolbar(variant) {
  const toolbar = document.querySelector(".toolbar");
  if (!toolbar) return;

  const buttons = document.createElement("div");
  buttons.className = "buttons";

  for (const group of TOOLBAR_GROUPS) {
    const included = group.filter((spec) => spec.variants.includes(variant));
    if (!included.length) continue;

    const groupEl = document.createElement("div");
    groupEl.className = "button-group";
    for (const spec of included) {
      groupEl.appendChild(
        spec.menu ? buildSplitButton(spec) : buildToolbarButton(spec),
      );
    }
    buttons.appendChild(groupEl);
  }

  toolbar.appendChild(buildToolbarTitle(variant));
  toolbar.appendChild(buttons);
  toolbar.appendChild(buildToolbarAside(variant));

  // The click target is usually the <svg> inside the button, hence closest().
  toolbar.addEventListener("click", (event) => {
    const caret = event.target.closest("[data-menu]");
    if (caret) {
      toggleSplitMenu(caret);
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;
    // Covers choosing an item as well as clicking elsewhere in the toolbar: the
    // item is itself a [data-action] button, so this is the same code path.
    closeSplitMenu();
    dispatchToolbarAction(button.dataset.action, button, event);
  });

  // Anything outside the open menu dismisses it. The caret's own click is
  // already handled above and bubbles to here afterwards, which is why this
  // tests containment rather than closing unconditionally.
  document.addEventListener("click", (event) => {
    if (openSplit && !openSplit.wrapper.contains(event.target)) closeSplitMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSplitMenu();
  });
}

buildToolbar(toolbarVariant());
