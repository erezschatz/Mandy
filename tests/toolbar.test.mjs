// The menu spec is the single definition of what the toolbar offers. These
// check that every item a variant renders has a handler in a script that
// variant's bundle actually ships — the correspondence that used to be
// maintained by hand across index.html and html-export.js, and the one that
// decides whether a control does something or just sits there.

import { makeEl, readFront, walk } from "./dom.mjs";

const TOOLBAR_SRC = readFront("toolbar.js");

function render(variant, probe = "") {
  // .toolbar needs a real parent for buildToolbar()'s
  // insertAdjacentElement("afterend", tabBar) to attach anything — without
  // one it silently no-ops, the same as it would off a detached node in a
  // real DOM.
  const container = makeEl();
  container.className = "container";
  const toolbar = makeEl();
  toolbar.className = "toolbar";
  container.appendChild(toolbar);
  const editorEl = makeEl();
  if (variant === "export") editorEl.setAttribute("data-exported", "true");

  // The menus dismiss on a click or Escape anywhere, so toolbar.js binds to the
  // document as well as to .toolbar.
  const listeners = {};
  const triggers = [];
  const document = {
    // toolbar.js asks an open menu for its items. The stub returns nothing for
    // every selector, which would leave keyboard navigation with nothing to
    // move between and quietly pass.
    createElement: (t) => {
      const el = makeEl(t);
      el.querySelectorAll = (sel) =>
        sel.startsWith(".menu-item")
          ? walk(el).filter((n) => n.className === "menu-item" && !n.disabled)
          : [];
      // focusItem locates itself with document.activeElement. Without this the
      // stub reports undefined, indexOf returns -1, and every arrow key lands
      // back on the first item while the test happily passes.
      el.focus = () => {
        document.activeElement = el;
      };
      return el;
    },
    querySelector: (s) =>
      s === ".toolbar" ? toolbar : s === ".container" ? container : null,
    querySelectorAll: (s) =>
      s === ".toolbar .menu-trigger" ? triggers : [],
    getElementById: (id) => (id === "editor" ? editorEl : null),
    addEventListener: (event, fn) => ((listeners[event] ||= []).push(fn), undefined),
  };
  const hits = [];
  new Function("document", "hits", "navigator", TOOLBAR_SRC + "\n" + probe)(
    document, hits, { platform: "Linux x86_64" },
  );
  document.activeElement = null;
  for (const node of walk(toolbar)) {
    if (node.className === "menu-trigger") triggers.push(node);
  }
  return { toolbar, container, hits, listeners, triggers, doc: document };
}

// Drains the microtask queue: dispatch awaits each handler, so nothing after a
// click has run yet when the listener returns.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const menusIn = (toolbar) => walk(toolbar).filter((n) => n.className === "menu");
const partsOf = (menu) => ({ trigger: menu.children[0], panel: menu.children[1] });
const itemsIn = (menu) =>
  partsOf(menu).panel.children.filter((c) => c.className === "menu-item");

// Read the bundles from source so these lists cannot drift from the real ones.
const exportBundle = [
  ...readFront("html-export.js")
    .match(/const ASSETS = \[(.*?)\];/s)[1]
    .matchAll(/"\/([^"]+\.js)"/g),
].map((m) => m[1]);

const appBundle = [
  ...readFront("index.html").matchAll(/src="\/([a-z-]+\.js)"/g),
].map((m) => m[1]);

function handlersIn(files) {
  const actions = new Set();
  for (const file of files) {
    for (const m of readFront(file).matchAll(/onToolbarAction\(`?"?([a-z-]+)"?`?[,)]/g)) {
      actions.add(m[1]);
    }
    // format-bar.js registers its nine from a loop rather than nine calls.
    const loop = readFront(file).match(
      /for \(const format of \[(.*?)\][\s\S]*?onToolbarAction\(`format-\$\{format\}`/,
    );
    if (loop) {
      for (const m of loop[1].matchAll(/"([a-z0-9]+)"/g)) actions.add(`format-${m[1]}`);
    }
  }
  return actions;
}

export default async function run(check) {
  for (const [variant, bundle] of [["app", appBundle], ["export", exportBundle]]) {
    const { toolbar, container } = render(variant);
    const menus = menusIn(toolbar);
    const items = menus.flatMap(itemsIn);
    const triggers = menus.map((m) => partsOf(m).trigger);
    const handled = handlersIn(bundle.filter((f) => f !== "toolbar.js"));

    for (const item of items) {
      const action = item.attrs["data-action"];
      check(`${variant}: "${action}" has a handler in this bundle`, handled.has(action));
    }

    check(`${variant}: the six menus`,
      triggers.map((t) => t.textContent).join() ===
        "File,Edit,Insert,Format,View,Export");

    // A trigger is the mechanism, not an action: it must stay out of the action
    // namespace, or the handler-exists rule above quietly stops holding.
    check(`${variant}: triggers carry no data-action`,
      triggers.every((t) => !t.attrs["data-action"] && t.id && t.attrs["data-menu"]));
    check(`${variant}: and announce themselves as menus`,
      triggers.every((t) =>
        t.attrs["aria-haspopup"] === "true" && t.attrs["aria-expanded"] === "false"));
    check(`${variant}: every menu has a labelled panel`,
      menus.every((m) => {
        const { panel } = partsOf(m);
        return panel.className === "menu-panel" &&
          panel.attrs.role === "menu" && panel.attrs["aria-label"];
      }));
    check(`${variant}: every item is a menuitem with a label`,
      items.every((i) =>
        i.attrs.role === "menuitem" && i.attrs.tabindex === "-1" &&
        i.children.some((c) => c.className === "menu-label" && c.textContent)));
    check(`${variant}: no menu is empty`, menus.every((m) => itemsIn(m).length));

    // A stranded separator is what variant filtering leaves behind: the export
    // File menu drops four items and would otherwise open on a rule.
    for (const menu of menus) {
      const kids = partsOf(menu).panel.children;
      const label = partsOf(menu).trigger.textContent;
      const bad =
        kids[0].className === "menu-separator" ||
        kids[kids.length - 1].className === "menu-separator" ||
        kids.some((k, i) => i > 0 &&
          k.className === "menu-separator" &&
          kids[i - 1].className === "menu-separator");
      check(`${variant}: ${label} has no stranded separator`, !bad);
    }

    check(`${variant}: theme toggle ${variant === "app" ? "present" : "absent"}`,
      walk(toolbar).some((n) => n.id === "themeToggle") === (variant === "app"));
    // The link pointed away from the app, from a bar that is about the document.
    check(`${variant}: no GitHub mark`,
      !walk(toolbar).some((n) => n.id === "githubBtn") &&
        !readFront("toolbar.js").includes("github"));
    // One row now: the app mark and menus on the left, the open file's
    // directory and the theme toggle on the right, kept apart by .toolbar's
    // own space-between. An exported document has neither a file on disk nor
    // a theme toggle, so it gets no right group at all — just the left one.
    const groups = variant === "app" ? 2 : 1;
    check(`${variant}: ${groups} group${groups > 1 ? "s" : ""}`,
      toolbar.children.length === groups);
    check(`${variant}: the left group is first, holding the mark and the menus`,
      toolbar.children[0].className === "toolbar-left" &&
      toolbar.children[0].children[0].className === "app-mark" &&
      toolbar.children[0].children[1].className === "menubar");

    if (variant === "app") {
      const right = toolbar.children[1];
      check(`${variant}: the right group is second`,
        right.className === "toolbar-right");
      check(`${variant}: holding the open file's directory`,
        right.children[0].id === "toolbarPath");
      check(`${variant}: with the theme toggle last on it`,
        right.children.at(-1).id === "themeToggle");

      // The tab bar moved out of .toolbar in this same stage (TODO 4.9,
      // caught as a real grid-layout bug before it shipped — see the design
      // doc's amendments) — it is a sibling now, appended right after
      // .toolbar, not a child of it.
      const tabBar = container.children[1];
      check(`${variant}: the tab bar sits right after .toolbar, not inside it`,
        !!tabBar && tabBar.id === "tabBar" && tabBar.parentNode === container);
      check(`${variant}: which announces itself as a tab strip`,
        tabBar.getAttribute("role") === "tablist" &&
        tabBar.getAttribute("aria-label") === "Open documents");
      check(`${variant}: and is empty until tabs.js fills it`,
        tabBar.children.length === 0);
    } else {
      check(`${variant}: no tab bar sibling either`,
        container.children.length === 1);
    }
    // The app name used to be an <h1> in here. It cost a third of the width and
    // took the page's only h1 with it, which belongs to the document.
    check(`${variant}: no app title in the bar`,
      !walk(toolbar).some((n) => n.tagName === "H1"));
    check(`${variant}: exactly one delegated click listener`,
      (toolbar.listeners.click || []).length === 1);
    check(`${variant}: no item binds its own listener`,
      items.every((i) => !(i.listeners.click || []).length));
    // Formatting acts on the editor's selection, which a click that moved focus
    // would destroy before any handler ran.
    check(`${variant}: mousedown is taken so the selection survives a click`,
      (toolbar.listeners.mousedown || []).length === 1);
  }

  // --- what each variant actually offers ------------------------------------

  const appActions = menusIn(render("app").toolbar).flatMap(itemsIn)
    .map((i) => i.attrs["data-action"]);
  const exportActions = menusIn(render("export").toolbar).flatMap(itemsIn)
    .map((i) => i.attrs["data-action"]);

  check("the app talks to the file server",
    ["open-file", "reload-file", "save-file", "save-as-file"]
      .every((a) => appActions.includes(a)));
  check("and an exported document does not",
    !exportActions.some((a) => a.endsWith("-file")));
  check("falling back to upload/download",
    exportActions.includes("upload-md") && exportActions.includes("download-md"));
  check("both get undo and redo",
    ["undo", "redo"].every((a) => appActions.includes(a) && exportActions.includes(a)));
  check("the app exports every format",
    ["export-html", "export-pdf", "export-docx", "export-editable"]
      .every((a) => appActions.includes(a)));
  // The export set is deliberately shorter in an exported document: it carries
  // the formats a document can travel on in, and PDF and DOCX are terminal —
  // nobody edits one and sends it back. Dropping the items and dropping the
  // scripts from ASSETS have to happen together, and the bundle check above is
  // what catches half of that; this catches the other half, where the scripts
  // go and the items are left behind as dead controls.
  check("an exported document carries the three it can be reproduced from",
    ["export-html", "export-editable"].every((a) => exportActions.includes(a)));
  check("and not the two that are dead ends",
    !exportActions.includes("export-pdf") && !exportActions.includes("export-docx"));
  check("and all nine formats",
    ["p", "h1", "h2", "h3", "bold", "italic", "ul", "ol", "code"]
      .every((f) => appActions.includes(`format-${f}`)));

  // The one stateful item. outline.js writes aria-pressed on it by action, the
  // way it did to the old toggle button, and the checkmark is drawn from that.
  const view = menusIn(render("app").toolbar).find(
    (m) => partsOf(m).trigger.textContent === "View");
  const outline = itemsIn(view)[0];
  check("the outline item carries its own pressed state",
    outline.attrs["aria-pressed"] === "false" && outline.id === "tocBtn");
  check("and reserves a checkmark",
    outline.children[0].className === "menu-check" &&
      outline.children[0].innerHTML.includes("<svg"));
  check("while a plain item reserves the gutter but draws nothing",
    (() => {
      const file = menusIn(render("app").toolbar)[0];
      const open = itemsIn(file)[0];
      return open.children[0].className === "menu-check" && open.children[0].innerHTML === "";
    })());

  // --- separator collapsing --------------------------------------------------
  //
  // Rendering the real spec cannot test this: today's menus happen to filter
  // cleanly in both variants. It still has to hold, because the next app-only
  // item added at the top of a menu strands a rule in the export variant — so
  // drive the function rather than the output.
  const SEP = { separator: true, variants: ["app", "export"] };
  const appOnly = (id) => ({ action: id, variants: ["app"] });
  const both = (id) => ({ action: id, variants: ["app", "export"] });
  const collapse = (items) =>
    render("export", `hits.push(visibleItems(${JSON.stringify(items)}, "export")
      .map((i) => i.separator ? "-" : i.action).join(","))`).hits[0];

  check("a separator left at the top is dropped",
    collapse([appOnly("a"), SEP, both("b")]) === "b");
  check("a separator left at the bottom is dropped",
    collapse([both("a"), SEP, appOnly("b")]) === "a");
  check("two that collide become one",
    collapse([both("a"), SEP, appOnly("b"), SEP, both("c")]) === "a,-,c");
  check("and one still separating survives",
    collapse([both("a"), SEP, both("b")]) === "a,-,b");
  check("a menu filtered away entirely renders nothing",
    collapse([appOnly("a"), SEP, appOnly("b")]) === "");

  // --- the toolbar's fixed height ---------------------------------------------
  //
  // html-export.js still stamps the variant in the same inline script as the
  // theme, though app.css no longer reads it for the toolbar's height: since
  // stage 3 of the redesign (TODO 4.9) moved the tab strip out of .toolbar
  // for both variants, there is nothing left that could make an exported
  // document's bar a different height from the app's, so the per-variant
  // override is gone rather than kept as a no-op.
  const themeScript = readFront("html-export.js")
    .match(/const THEME_SCRIPT =([\s\S]*?);\n/)[1];
  check("the export stamps its variant before the stylesheet",
    /data-variant'?,\s*'export'/.test(themeScript));
  check("in the same inline script as the theme, which runs in <head>",
    themeScript.includes("data-theme"));

  const css = readFront("app.css");
  check("the toolbar's height is a plain fixed value now, not a formula",
    /--toolbar-height:\s*40px;/.test(css));
  check("and is no longer overridden per variant",
    !/data-variant="export"\][\s\S]{0,80}--toolbar-height/.test(css));

  // The tab strip is a sibling of .toolbar now, so it needs its own
  // reservation before tabs.js populates it — .toolbar's own fixed height
  // no longer covers it the way it once summed both rows together.
  check("the tab bar reserves its own height before tabs.js fills it",
    /\.tab-bar\s*\{[^}]*min-height:/.test(css));

  // --- the theme toggle explains itself --------------------------------------

  const toggle = walk(render("app").toolbar).find((n) => n.id === "themeToggle");
  check("the toggle carries a tooltip", toggle.title === "Switch to dark mode");
  check("and the same thing for assistive tech",
    toggle.getAttribute("aria-label") === toggle.title);
  // theme-manager.js flips both when the theme changes; stamping only one here
  // would leave the tooltip claiming the opposite of what the switch will do.
  check("which theme-manager.js keeps in step with the theme",
    /toggle\.title = label/.test(readFront("theme-manager.js")));

  // --- shortcut labels ------------------------------------------------------

  const fileMenu = menusIn(render("app").toolbar)[0];
  const openItem = itemsIn(fileMenu).find((n) => n.attrs["data-action"] === "open-file");
  const shortcut = openItem.children.find((c) => c.className === "menu-shortcut");
  check("shortcuts are rendered beside the label", shortcut.textContent === "Ctrl+O");
  check("and hidden from assistive tech, which reads the binding itself",
    shortcut.attrs["aria-hidden"] === "true");

  // --- opening, switching and dispatching -----------------------------------

  const app = render("app", `onToolbarAction("reload-file", () => hits.push("reload"));`);
  const [file, edit] = menusIn(app.toolbar);
  const fileParts = partsOf(file);

  const click = (target) => {
    app.toolbar.listeners.click[0]({ target });
    for (const fn of app.listeners.click || []) fn({ target });
  };
  // Bound to the menu bar rather than the whole toolbar: hovering the filename
  // or the theme toggle is not a menu gesture. Found by walking rather than by
  // position — it is nested inside .toolbar-left now, not a direct child.
  const menubar = walk(app.toolbar).find((c) => c.className === "menubar");
  const hover = (target) => {
    for (const fn of menubar.listeners.mouseover || []) fn({ target });
  };
  const escape = () => {
    for (const fn of app.listeners.keydown || []) fn({ key: "Escape" });
  };
  const isOpen = (menu) => menu.hasAttribute("data-open");

  click(fileParts.trigger);
  check("a trigger opens its menu", isOpen(file));
  check("and says so for assistive tech",
    fileParts.trigger.attrs["aria-expanded"] === "true");

  click(fileParts.trigger);
  check("the same trigger closes it again", !isOpen(file));
  check("and takes the aria state back",
    fileParts.trigger.attrs["aria-expanded"] === "false");

  // Sliding across the bar with one menu open switches between them; hovering
  // a closed bar must not spring menus at you.
  hover(partsOf(edit).trigger);
  check("hovering a closed bar opens nothing", !isOpen(edit));
  click(fileParts.trigger);
  hover(partsOf(edit).trigger);
  check("but with one open, hovering switches", isOpen(edit) && !isOpen(file));

  click(fileParts.trigger);
  click(itemsIn(file).find((i) => i.attrs["data-action"] === "reload-file"));
  await flush();
  check("an item dispatches its action", app.hits.join() === "reload");
  check("and the menu closes behind it", !isOpen(file));

  click(fileParts.trigger);
  click(makeEl());
  check("a click anywhere else dismisses the menu", !isOpen(file));

  click(fileParts.trigger);
  let refocused = null;
  fileParts.trigger.focus = () => { refocused = fileParts.trigger; };
  escape();
  check("Escape dismisses the menu", !isOpen(file));
  // Focus is on an item inside the panel at that point, and the panel is about
  // to be display:none. Left there, the next keystroke goes nowhere.
  check("and hands focus back to the trigger", refocused === fileParts.trigger);

  // With nothing open it must be a no-op, so a notify.js dialog's Escape still
  // reaches the dialog rather than being spent here.
  refocused = null;
  escape();
  check("but does nothing when no menu is open", refocused === null);

  // --- keyboard navigation --------------------------------------------------

  const nav = render("app");
  const navMenus = menusIn(nav.toolbar);
  const navTriggers = navMenus.map((m) => partsOf(m).trigger);
  const navBar = walk(nav.toolbar).find((c) => c.className === "menubar");
  const keydown = (init) => {
    for (const fn of navBar.listeners.keydown || []) fn(init);
  };
  const press = (key, target, extra = {}) =>
    keydown({ key, target, preventDefault() {}, ...extra });

  press("ArrowDown", navTriggers[0]);
  check("ArrowDown opens a menu and enters it", navMenus[0].hasAttribute("data-open"));
  check("landing on the first item", nav.doc.activeElement === itemsIn(navMenus[0])[0]);

  press("ArrowDown", nav.doc.activeElement);
  check("and steps down it", nav.doc.activeElement === itemsIn(navMenus[0])[1]);

  press("ArrowUp", nav.doc.activeElement);
  check("ArrowUp steps back", nav.doc.activeElement === itemsIn(navMenus[0])[0]);
  press("ArrowUp", nav.doc.activeElement);
  check("and wraps to the bottom rather than escaping the menu",
    nav.doc.activeElement === itemsIn(navMenus[0]).at(-1));

  press("ArrowRight", nav.doc.activeElement);
  check("ArrowRight moves along the bar", navMenus[1].hasAttribute("data-open"));
  check("closing the one behind it", !navMenus[0].hasAttribute("data-open"));
  check("and focusing the new trigger", nav.doc.activeElement === navTriggers[1]);

  press("ArrowLeft", nav.doc.activeElement);
  check("ArrowLeft comes back", navMenus[0].hasAttribute("data-open"));
}
