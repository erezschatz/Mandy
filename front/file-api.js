// Server-backed open/save. Only loaded by the app itself — exported HTML files
// have no server behind them and keep their own blob download instead.

const currentFileLabel = document.getElementById("currentFile");

const fileDialog = document.getElementById("fileDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogClose = document.getElementById("dialogClose");
const dialogPathBar = document.getElementById("dialogPathBar");
const dialogEntries = document.getElementById("dialogEntries");
const dialogSaveRow = document.getElementById("dialogSaveRow");
const dialogFilename = document.getElementById("dialogFilename");
const dialogSaveConfirm = document.getElementById("dialogSaveConfirm");

const FILE_PATH_KEY = "marky-current-file";
const LAST_DIR_KEY = "marky-last-dir";
const DIRTY_KEY = "marky-dirty";
const MTIME_KEY = "marky-file-mtime";

let currentFilePath = null;
// Edited since the last open or save. Autosave is unaware of the file on disk,
// so without this the toolbar shows a filename that may be nothing like the
// bytes it names.
let isDirty = false;
// The file's mtime as we last read or wrote it — the baseline every staleness
// check measures against. The document diverging from disk is the mirror image
// of `isDirty`: that one is our edits, this one is everybody else's.
let fileMtime = null;
let diskChanged = false;
let dialogMode = "open";
// Last visited directory, reused between openings and across reloads — walking
// back to the same folder every session is the kind of friction you only notice
// by having to do it.
let dialogDir = localStorage.getItem(LAST_DIR_KEY);
let saveResolver = null;

function renderCurrentFile() {
  if (!currentFileLabel) return;

  const name = currentFilePath ? currentFilePath.split("/").pop() : "";
  // Both marks are only meaningful against a file on disk: with no file open
  // there is nothing the document could be out of step with. They are also not
  // exclusive — edit a file an agent has since rewritten and both are true, and
  // that is exactly the case worth being loud about.
  const marks = [];
  if (name && isDirty) marks.push("edited");
  if (name && diskChanged) marks.push("disk changed");

  currentFileLabel.textContent = marks.length ? `${name} (${marks.join(", ")})` : name;
  currentFileLabel.title = currentFilePath || "";
}

// Persisted for the same reason the path is: autosave keeps unsaved edits
// across a reload, so a flag that reset on load would show a clean filename
// over a document that does not match the file — the one lie this indicator
// exists to prevent.
function setDirty(dirty) {
  if (isDirty === dirty) return;
  isDirty = dirty;

  if (dirty) {
    localStorage.setItem(DIRTY_KEY, "1");
  } else {
    localStorage.removeItem(DIRTY_KEY);
  }
  renderCurrentFile();
}

function setDiskChanged(changed) {
  if (diskChanged === changed) return;
  diskChanged = changed;
  renderCurrentFile();
}

// Persisted for the same reason the dirty flag is: autosave restores the
// document across a browser reload, and a baseline that reset to null would make
// the first check report a file nobody has touched as changed.
//
// Setting a new baseline always clears the flag, because the three callers —
// open, reload, save — are exactly the moments the document and the file are
// back in step.
function setFileMtime(modified) {
  fileMtime = modified || null;
  if (fileMtime) {
    localStorage.setItem(MTIME_KEY, fileMtime);
  } else {
    localStorage.removeItem(MTIME_KEY);
  }
  setDiskChanged(false);
}

// Persisted alongside the content so a reload keeps saving to the same file
// rather than silently reverting to "untitled" and prompting again.
function setCurrentFile(filePath) {
  currentFilePath = filePath;
  if (filePath) {
    localStorage.setItem(FILE_PATH_KEY, filePath);
  } else {
    localStorage.removeItem(FILE_PATH_KEY);
  }
  renderCurrentFile();
}

// Only restore the path if the content is being restored too. When app.js is
// about to fall back to welcome.md there is no file behind what you see, and
// showing one would point Ctrl+S at a document you are not looking at.
(function restoreCurrentFile() {
  const savedContent = localStorage.getItem("markdownContent");
  if (savedContent && !isBlankContent(savedContent)) {
    isDirty = localStorage.getItem(DIRTY_KEY) === "1";
    fileMtime = localStorage.getItem(MTIME_KEY);
    setCurrentFile(localStorage.getItem(FILE_PATH_KEY));
  } else {
    localStorage.removeItem(FILE_PATH_KEY);
    localStorage.removeItem(DIRTY_KEY);
    localStorage.removeItem(MTIME_KEY);
  }
})();

// Typing, formatting and paste all land here: execCommand fires input too, so
// the format bar marks the document edited without needing its own hook.
// Assigning editor.innerHTML does not, which is why opening a file and clearing
// do not trip this.
editor.addEventListener("input", () => setDirty(true));

// Clearing the document drops the file association: app.js has already emptied
// the editor and the autosave, and without this a reload would show a filename
// with no content behind it, one Ctrl+S away from truncating the real file.
// app.js registers its handler first and the dispatcher awaits it, so this runs
// after its dialog has been answered: cancel leaves content in place and the
// blank check correctly does nothing.
onToolbarAction("clear", () => {
  if (isBlankContent(editor.innerHTML)) {
    setDirty(false);
    setFileMtime(null);
    setCurrentFile(null);
  }
});

function parentDir(filePath) {
  const parent = filePath.split("/").slice(0, -1).join("/");
  return parent || null;
}

function joinPath(dir, name) {
  if (!dir) return name;
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

const CHECK_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2">' +
  '<polyline points="20 6 9 17 4 12"></polyline></svg>';

function flashButton(button, label) {
  const original = button.innerHTML;
  button.innerHTML = label;
  setTimeout(() => {
    button.innerHTML = original;
  }, 1500);
}

// ── Dialog ───────────────────────────────────────────────────────────────────

function closeDialog() {
  fileDialog.style.display = "none";
  if (saveResolver) {
    saveResolver(null);
    saveResolver = null;
  }
}

async function loadDir(dirPath) {
  const url = dirPath
    ? `/api/browse?path=${encodeURIComponent(dirPath)}`
    : "/api/browse";

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
  } catch (err) {
    // A remembered directory outlives the folder it names: move or delete it
    // between sessions and every Open lands on an error about a path the user
    // has no way to correct from inside the dialog. Forget it and start from
    // home instead. Only one retry — the second call passes no path, so a
    // failure there is the server, not the folder.
    if (dirPath) {
      localStorage.removeItem(LAST_DIR_KEY);
      return loadDir(null);
    }
    notify("Failed to browse directory: " + err.message, { severity: "error" });
    return;
  }

  dialogDir = data.path;
  localStorage.setItem(LAST_DIR_KEY, data.path);
  // The path bar clips from the left (direction: rtl) to keep the tail of deep
  // paths visible; the inner LTR span keeps the path itself rendering normally.
  dialogPathBar.innerHTML = "";
  const pathText = document.createElement("span");
  pathText.dir = "ltr";
  pathText.textContent = data.path;
  dialogPathBar.appendChild(pathText);
  dialogEntries.innerHTML = "";

  if (data.parent) {
    const up = document.createElement("div");
    up.className = "dialog-entry is-up";
    up.textContent = "../";
    up.addEventListener("click", () => loadDir(data.parent));
    dialogEntries.appendChild(up);
  }

  for (const entry of data.entries) {
    const row = document.createElement("div");
    row.className = `dialog-entry ${entry.isDir ? "is-dir" : "is-file"}`;

    const name = document.createElement("span");
    name.className = "dialog-entry-name";
    name.textContent = entry.isDir ? entry.name + "/" : entry.name;
    row.appendChild(name);

    if (entry.modified) {
      const modified = document.createElement("span");
      modified.className = "dialog-entry-modified";
      modified.textContent = new Date(entry.modified).toLocaleDateString();
      row.appendChild(modified);
    }

    row.addEventListener("click", () => {
      if (entry.isDir) {
        loadDir(joinPath(data.path, entry.name));
      } else if (dialogMode === "open") {
        closeDialog();
        openFile(joinPath(data.path, entry.name));
      } else {
        dialogFilename.value = entry.name;
        dialogFilename.focus();
      }
    });

    dialogEntries.appendChild(row);
  }

  if (!data.entries.length && !data.parent) {
    dialogEntries.innerHTML = '<div class="dialog-empty">Nothing here</div>';
  }
}

async function showOpenDialog() {
  dialogMode = "open";
  dialogTitle.textContent = "Open file";
  dialogSaveRow.style.display = "none";
  fileDialog.style.display = "flex";
  await loadDir(dialogDir);
}

function showSaveDialog() {
  return new Promise((resolve) => {
    dialogMode = "save";
    saveResolver = resolve;
    dialogTitle.textContent = "Save file";
    dialogSaveRow.style.display = "flex";
    dialogFilename.value = currentFilePath
      ? currentFilePath.split("/").pop()
      : "document.md";
    fileDialog.style.display = "flex";
    // Save-as starts beside the file you are editing, and otherwise wherever
    // you last browsed. Passing null here would fall back to the server's home
    // directory, which is neither.
    loadDir(currentFilePath ? parentDir(currentFilePath) : dialogDir).then(() => {
      dialogFilename.focus();
      dialogFilename.select();
    });
  });
}

function confirmSaveName() {
  const name = dialogFilename.value.trim();
  if (!name) return;

  const finalName = /\.(md|markdown|txt)$/i.test(name) ? name : name + ".md";
  const filePath = joinPath(dialogDir, finalName);

  fileDialog.style.display = "none";
  if (saveResolver) {
    saveResolver(filePath);
    saveResolver = null;
  }
}

// ── Open / Save ──────────────────────────────────────────────────────────────

async function openFile(filePath) {
  let data;
  try {
    const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
  } catch (err) {
    notify("Failed to open file: " + err.message, { severity: "error" });
    return false;
  }

  editor.innerHTML = markdownToHtml(data.content);
  await renderMermaidDiagrams(editor);
  await renderLatex(editor);
  localStorage.setItem("markdownContent", editor.innerHTML);
  // History does not cross a document boundary. Undo handing back the previous
  // file's text would leave it under this file's path, one Ctrl+S from being
  // written there. Reload comes through here too, which is right: discarding
  // local changes is the whole point of it.
  undoReset();
  setDirty(false);
  setFileMtime(data.modified);
  setCurrentFile(data.path);
  return true;
}

// Re-reads the open file, discarding whatever the editor holds — which is the
// point of it, since this is also the only way to throw local changes away. So
// it asks when there are edits to lose.
async function reloadFile() {
  if (!currentFilePath) {
    notify("No file is open to reload.", { severity: "info" });
    return;
  }

  const name = currentFilePath.split("/").pop();
  if (
    isDirty &&
    !(await ask(`Unsaved edits to ${name} will be lost.`, {
      title: "Reload from disk?",
      severity: "warn",
      actions: [
        { label: "Cancel", value: false, variant: "quiet", default: true },
        { label: "Discard and reload", value: true, variant: "danger" },
      ],
    }))
  ) {
    return;
  }

  // A reload of an unchanged file changes nothing on screen, so without the
  // flash there is no way to tell it happened — and it must be gated on the read
  // actually succeeding, or a file that has since been deleted reports
  // "Reloaded!" over the document it failed to replace.
  if (!(await openFile(currentFilePath))) return;
  const openBtn = toolbarButton("open-file");
  if (openBtn) flashButton(openBtn, `${CHECK_ICON} Reloaded!`);
}

async function statFile(filePath) {
  const res = await fetch(
    `/api/file?path=${encodeURIComponent(filePath)}&stat=1`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// Nothing here recovers, merges or reloads on its own — it only stops the
// toolbar claiming a file matches a document it no longer matches. What to do
// about it is the user's call: Reload takes the file, Save takes the document.
let checkingDisk = false;

async function checkDiskChanged() {
  if (!currentFilePath || !fileMtime || checkingDisk) return;
  checkingDisk = true;
  try {
    const { modified } = await statFile(currentFilePath);
    setDiskChanged(Boolean(modified) && modified !== fileMtime);
  } catch {
    // A file that has been deleted or renamed under us is a different problem,
    // and an alert on every window focus would be no way to raise it.
  } finally {
    checkingDisk = false;
  }
}

// The one place the flag has teeth. Writing over a file that changed after we
// read it destroys those changes, and Marky has no merge to offer — so this is
// the last point at which the choice is still the user's.
async function confirmOverwrite(filePath) {
  if (filePath !== currentFilePath || !fileMtime) return true;

  let modified;
  try {
    ({ modified } = await statFile(filePath));
  } catch {
    // Cannot tell. The save itself is about to report anything really wrong.
    return true;
  }
  if (!modified || modified === fileMtime) return true;

  setDiskChanged(true);
  const name = filePath.split("/").pop();
  return ask(
    `${name} changed on disk since you opened it. Saving replaces whatever ` +
      "changed it, and Marky has no merge to offer.",
    {
      title: "Overwrite the newer file?",
      severity: "warn",
      actions: [
        { label: "Cancel", value: false, variant: "quiet", default: true },
        { label: "Overwrite", value: true, variant: "danger" },
      ],
    },
  );
}

async function saveFile(filePath) {
  if (!(await confirmOverwrite(filePath))) return false;

  const markdown = htmlToMarkdown(editor.innerHTML);

  let data;
  try {
    const res = await fetch("/api/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, content: markdown }),
    });
    data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
  } catch (err) {
    notify("Failed to save file: " + err.message, { severity: "error" });
    return false;
  }

  setDirty(false);
  setFileMtime(data.modified);
  setCurrentFile(data.path);
  return true;
}

// The flash always lands on the toolbar's own Save button, never on whatever was
// clicked: choosing "Save" from the split menu closes the menu behind it, so
// flashing the clicked element would hide "Saved!" inside a menu nobody is
// looking at — and leave it there for the next person who opens it.
async function saveCurrentOrPrompt() {
  const target = currentFilePath || (await showSaveDialog());
  if (!target) return;

  if (await saveFile(target)) {
    const saveBtn = toolbarButton("save-file");
    if (saveBtn) flashButton(saveBtn, `${CHECK_ICON} Saved!`);
  }
}

// Not named saveAs: FileSaver.js claims that global, and whichever loaded last
// would silently clobber the other.
async function saveFileAs() {
  const target = await showSaveDialog();
  if (target) await saveFile(target);
}

// ── Wiring ───────────────────────────────────────────────────────────────────

// Without the file server (e.g. the statically hosted build) there is nothing
// to open or save into, so say so up front instead of failing on click. The
// carets go with them: a live menu over two dead buttons is worse than either.
(async () => {
  try {
    const res = await fetch("/api/home");
    if (!res.ok) throw new Error(res.statusText);
    // A static host may rewrite unknown paths to index.html and answer 200,
    // so only a well-formed JSON reply counts as "the server is there".
    const data = await res.json();
    if (typeof data.home !== "string") throw new Error("Not the Marky server");
  } catch {
    const dead = [
      ...["open-file", "save-file", "reload-file", "save-as-file"].map((a) =>
        document.querySelector(`.toolbar [data-action="${a}"]`)
      ),
      ...["open-file", "save-file"].map((a) =>
        document.querySelector(`.toolbar [data-menu="${a}"]`)
      ),
    ];
    for (const btn of dead) {
      if (!btn) continue;
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.title = "Unavailable: the Marky file server is not running";
    }
    return;
  }

  // A page load restores the document from autosave without going near the
  // file, so the very first thing worth knowing is whether the two still agree.
  // `focus` never fires for the tab that already has it.
  checkDiskChanged();
})();

onToolbarAction("open-file", showOpenDialog);
onToolbarAction("reload-file", reloadFile);
onToolbarAction("save-file", saveCurrentOrPrompt);
onToolbarAction("save-as-file", saveFileAs);

// Coming back to the window is when an outside edit is most likely to have
// happened and cheapest to report. Both events are needed — switching tabs
// within a window fires only `visibilitychange`, alt-tabbing back to the browser
// only `focus` — and checkDiskChanged drops the overlap when both fire.
window.addEventListener("focus", checkDiskChanged);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkDiskChanged();
});
dialogClose.addEventListener("click", closeDialog);
dialogSaveConfirm.addEventListener("click", confirmSaveName);

dialogFilename.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmSaveName();
  }
});

fileDialog.addEventListener("click", (e) => {
  if (e.target === fileDialog) closeDialog();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && fileDialog.style.display === "flex") {
    closeDialog();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "o") {
    e.preventDefault();
    showOpenDialog();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    saveFileAs();
  } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveCurrentOrPrompt();
  }
});
