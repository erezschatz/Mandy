// In-app notifications, replacing alert() and confirm().
//
// Why the platform's are not good enough, in the order it matters:
//
//   - They are modal and block the page. For an export failure that is
//     backwards: the error interrupts, and then the document is fine.
//   - They are unstyled OS chrome, so they ignore the theme and read as a
//     browser malfunction rather than as part of the app.
//   - confirm() can express nothing but OK / Cancel, which is why the
//     unsaved-work guards want something else: those need Save / Discard /
//     Cancel.
//   - Chrome and Firefox both offer "prevent this page from creating
//     additional dialogs", after which every alert() silently does nothing.
//     A save failure would then be completely invisible. Reasonable of them —
//     the mechanism exists because the dialogs were abused — but it means a
//     page cannot rely on alert() reaching anyone.
//
// Two functions, and the split between them is the point:
//
//   notify(message, opts)  a toast. Non-blocking, corner of the screen, does
//                          not interrupt. Returns nothing. This is for "that
//                          happened", failures included.
//   ask(message, opts)     a modal dialog. Returns a Promise of the chosen
//                          action's value, or the dismiss value. This is for
//                          "something is about to be destroyed".
//
// ask() takes an arbitrary list of actions rather than a fixed yes/no, which
// is the capability confirm() never had and the main reason this file exists.
//
// All the DOM is built here rather than written into index.html. Same reason
// as the toolbar and the outline nav: html-export.js hand-writes its own copy
// of the page shell, so markup in index.html would be a second copy to keep in
// step, and it would drift silently.
//
// This file ships in both bundles. Exported documents raise most of the same
// failures the app does — every export path can fail in one — so leaving it
// out of ASSETS would put them back to having no way to report anything.

const NOTIFY_ICONS = {
  error:
    '<circle cx="12" cy="12" r="10"></circle>' +
    '<line x1="12" y1="8" x2="12" y2="12"></line>' +
    '<line x1="12" y1="16" x2="12.01" y2="16"></line>',
  warn:
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
    '<line x1="12" y1="9" x2="12" y2="13"></line>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"></line>',
  success:
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>' +
    '<polyline points="22 4 12 14.01 9 11.01"></polyline>',
  info:
    '<circle cx="12" cy="12" r="10"></circle>' +
    '<line x1="12" y1="16" x2="12" y2="12"></line>' +
    '<line x1="12" y1="8" x2="12.01" y2="8"></line>',
};

// Errors do not auto-dismiss. Everything else does. A toast that vanishes is
// fine for "Copied!" and wrong for "Failed to save file": the whole complaint
// against alert() being suppressible is that a save failure must not be
// invisible, and a four-second one the user was looking away from is the same
// bug with extra steps.
const NOTIFY_TIMEOUTS = { error: 0, warn: 8000, success: 3000, info: 5000 };

// Long enough for the transition in app.css to finish. A transitionend
// listener would be more exact and does not always fire — a toast dismissed
// while its tab is in the background never transitions at all, and the node
// would stay in the DOM forever.
const NOTIFY_EXIT_MS = 200;

function notifyIcon(severity) {
  const svg = document.createElement("span");
  svg.className = "notify-icon";
  svg.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    (NOTIFY_ICONS[severity] || NOTIFY_ICONS.info) +
    "</svg>";
  return svg;
}

// Built on demand rather than at load: this file runs before app.js in both
// bundles, and an exported document's body is still being parsed at that point.
let notifyStack = null;

function notifyContainer() {
  if (notifyStack && notifyStack.parentNode) return notifyStack;
  notifyStack = document.createElement("div");
  notifyStack.className = "notify-stack";
  // Toasts are never focused, so a screen reader only hears one if the region
  // announces itself. Individual toasts carry the role: an error is assertive,
  // "Saved!" is not, and that cannot be decided once for the container.
  document.body.appendChild(notifyStack);
  return notifyStack;
}

function notifyRemove(toast) {
  if (toast.notifyLeaving) return;
  toast.notifyLeaving = true;
  if (toast.notifyTimer) clearTimeout(toast.notifyTimer);
  toast.classList.remove("is-in");
  setTimeout(() => toast.remove(), NOTIFY_EXIT_MS);
}

/**
 * A toast. `severity` is one of error / warn / success / info and decides the
 * colour, the icon and whether it dismisses itself. `actions` are optional
 * `{ label, onSelect }` buttons — a Retry, say. `timeout` overrides the
 * severity's default; 0 means it stays until dismissed.
 *
 * Returns a function that dismisses it, for a caller that wants to take one
 * back (a progress notice, say). Ignoring it is the normal case.
 */
function notify(message, { severity = "info", actions = [], timeout } = {}) {
  const toast = document.createElement("div");
  toast.className = `notify-toast notify-${severity}`;
  toast.setAttribute("role", severity === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", severity === "error" ? "assertive" : "polite");

  toast.appendChild(notifyIcon(severity));

  const body = document.createElement("div");
  body.className = "notify-body";

  const text = document.createElement("p");
  text.className = "notify-message";
  text.textContent = message;
  body.appendChild(text);

  if (actions.length) {
    const row = document.createElement("div");
    row.className = "notify-toast-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.className = "notify-toast-action";
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        notifyRemove(toast);
        if (action.onSelect) action.onSelect();
      });
      row.appendChild(button);
    }
    body.appendChild(row);
  }
  toast.appendChild(body);

  const close = document.createElement("button");
  close.className = "notify-close";
  close.type = "button";
  close.title = "Dismiss";
  close.setAttribute("aria-label", "Dismiss");
  close.innerHTML = "&times;";
  close.addEventListener("click", () => notifyRemove(toast));
  toast.appendChild(close);

  const life = timeout === undefined ? NOTIFY_TIMEOUTS[severity] : timeout;
  const arm = () => {
    if (life > 0) toast.notifyTimer = setTimeout(() => notifyRemove(toast), life);
  };
  // Hovering holds it open: a message long enough to be worth reading is long
  // enough to outlast its own timer while being read.
  toast.addEventListener("mouseenter", () => clearTimeout(toast.notifyTimer));
  toast.addEventListener("mouseleave", arm);

  notifyContainer().appendChild(toast);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => toast.classList.add("is-in"));
  } else {
    toast.classList.add("is-in");
  }
  arm();

  return () => notifyRemove(toast);
}

const NOTIFY_CONFIRM = [
  { label: "Cancel", value: false, variant: "quiet", default: true },
  { label: "OK", value: true, variant: "primary" },
];

/**
 * A modal dialog. Resolves to the chosen action's `value`, or to `dismiss`
 * (default `null`, which is falsy, so a two-way caller can just test the
 * result) if it is closed by Escape, the backdrop or the close button.
 *
 * `actions` render left to right in array order. The one marked `default: true`
 * takes focus, falling back to the last — so a destructive dialog marks Cancel
 * and Enter does the safe thing.
 */
function ask(message, options = {}) {
  const {
    title = "",
    severity = "warn",
    actions = NOTIFY_CONFIRM,
    dismiss = null,
  } = options;

  return new Promise((resolve) => {
    const previous = document.activeElement;
    let settled = false;

    const backdrop = document.createElement("div");
    backdrop.className = "notify-backdrop";

    const panel = document.createElement("div");
    panel.className = `notify-dialog notify-${severity}`;
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");

    const close = (value) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      // Focus falls to <body> when the dialog goes, which loses the caret and
      // scrolls the editor to the top on the next keystroke.
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };

    const header = document.createElement("div");
    header.className = "notify-dialog-header";
    header.appendChild(notifyIcon(severity));

    const heading = document.createElement("h2");
    heading.className = "notify-dialog-title";
    heading.textContent = title || "Mandy";
    header.appendChild(heading);

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "notify-close";
    dismissBtn.type = "button";
    dismissBtn.title = "Close";
    dismissBtn.setAttribute("aria-label", "Close");
    dismissBtn.innerHTML = "&times;";
    dismissBtn.addEventListener("click", () => close(dismiss));
    header.appendChild(dismissBtn);
    panel.appendChild(header);

    const text = document.createElement("p");
    text.className = "notify-dialog-message";
    text.textContent = message;
    panel.appendChild(text);

    const row = document.createElement("div");
    row.className = "notify-dialog-actions";
    const buttons = actions.map((action) => {
      const button = document.createElement("button");
      button.className = `notify-btn notify-btn-${action.variant || "quiet"}`;
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", () => close(action.value));
      row.appendChild(button);
      return button;
    });
    panel.appendChild(row);
    backdrop.appendChild(panel);

    // Only a click on the backdrop itself, not one that bubbled out of the
    // panel — otherwise releasing a drag-select of the message text outside
    // the panel counts as a dismissal.
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(dismiss);
    });

    // Bound to the backdrop rather than the document, so with two dialogs open
    // only the one holding focus answers Escape — no stack to keep.
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(dismiss);
        return;
      }
      if (event.key !== "Tab" || !buttons.length) return;
      // Focus stays in the dialog: it is modal, and Tab reaching the toolbar
      // behind it would let a keyboard user act on the thing being asked about.
      const at = buttons.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      const next = (at + step + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next].focus();
    });

    document.body.appendChild(backdrop);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => backdrop.classList.add("is-in"));
    } else {
      backdrop.classList.add("is-in");
    }

    const preferred = actions.findIndex((a) => a.default);
    const focus = buttons[preferred >= 0 ? preferred : buttons.length - 1];
    if (focus) focus.focus();
  });
}

/**
 * A modal that asks for one line of text — a URL, a name. Resolves to the
 * trimmed string on confirm (which may be `""` if the field was left empty),
 * or to `dismiss` (default `null`) when closed by Escape, the backdrop or the
 * close button. A caller distinguishes "cleared it on purpose" from "backed
 * out" by testing `result === null`.
 *
 * Separate from ask() rather than an option on it because the return contract
 * differs — ask() resolves to an action's `value`, this resolves to what was
 * typed — and the modal scaffold is deliberately a second copy: both builders
 * live in this file, which is the one place Mandy's dialogs are built.
 */
function askForInput(message, options = {}) {
  const {
    title = "",
    severity = "info",
    placeholder = "",
    value = "",
    confirmLabel = "OK",
    cancelLabel = "Cancel",
    dismiss = null,
  } = options;

  return new Promise((resolve) => {
    const previous = document.activeElement;
    let settled = false;

    const backdrop = document.createElement("div");
    backdrop.className = "notify-backdrop";

    const panel = document.createElement("div");
    panel.className = `notify-dialog notify-${severity}`;
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");

    const close = (result) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      if (previous && previous.focus) previous.focus();
      resolve(result);
    };

    const header = document.createElement("div");
    header.className = "notify-dialog-header";
    header.appendChild(notifyIcon(severity));

    const heading = document.createElement("h2");
    heading.className = "notify-dialog-title";
    heading.textContent = title || "Mandy";
    header.appendChild(heading);

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "notify-close";
    dismissBtn.type = "button";
    dismissBtn.title = "Close";
    dismissBtn.setAttribute("aria-label", "Close");
    dismissBtn.innerHTML = "&times;";
    dismissBtn.addEventListener("click", () => close(dismiss));
    header.appendChild(dismissBtn);
    panel.appendChild(header);

    // The label wraps the field so clicking the prompt text focuses it, and so
    // there is no id to collide with a second dialog open at the same time.
    const label = document.createElement("label");
    label.className = "notify-dialog-message";
    label.textContent = message;

    const field = document.createElement("input");
    field.type = "text";
    field.className = "notify-dialog-input";
    field.placeholder = placeholder;
    field.value = value;
    label.appendChild(field);
    panel.appendChild(label);

    const submit = () => close(field.value.trim());

    const row = document.createElement("div");
    row.className = "notify-dialog-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "notify-btn notify-btn-quiet";
    cancelBtn.type = "button";
    cancelBtn.textContent = cancelLabel;
    cancelBtn.addEventListener("click", () => close(dismiss));
    const okBtn = document.createElement("button");
    okBtn.className = "notify-btn notify-btn-primary";
    okBtn.type = "button";
    okBtn.textContent = confirmLabel;
    okBtn.addEventListener("click", submit);
    row.appendChild(cancelBtn);
    row.appendChild(okBtn);
    panel.appendChild(row);
    backdrop.appendChild(panel);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close(dismiss);
    });

    const focusables = [field, cancelBtn, okBtn];
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(dismiss);
        return;
      }
      if (event.key === "Enter" && event.target === field) {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key !== "Tab") return;
      // Modal: Tab cycles the field and the two buttons, never the toolbar.
      const at = focusables.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      const next = (at + step + focusables.length) % focusables.length;
      event.preventDefault();
      focusables[next].focus();
    });

    document.body.appendChild(backdrop);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => backdrop.classList.add("is-in"));
    } else {
      backdrop.classList.add("is-in");
    }

    field.focus();
    if (field.select) field.select();
  });
}
