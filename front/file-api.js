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

let currentFilePath = null;
// Edited since the last open or save. Autosave is unaware of the file on disk,
// so without this the toolbar shows a filename that may be nothing like the
// bytes it names.
let isDirty = false;
let dialogMode = "open";
// Last visited directory, reused between openings and across reloads — walking
// back to the same folder every session is the kind of friction you only notice
// by having to do it.
let dialogDir = localStorage.getItem(LAST_DIR_KEY);
let saveResolver = null;

function renderCurrentFile() {
  if (!currentFileLabel) return;

  const name = currentFilePath ? currentFilePath.split("/").pop() : "";
  // Only meaningful against a file on disk: with no file open there is nothing
  // the document could be out of step with.
  currentFileLabel.textContent = name && isDirty ? `${name} (edited)` : name;
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
    setCurrentFile(localStorage.getItem(FILE_PATH_KEY));
  } else {
    localStorage.removeItem(FILE_PATH_KEY);
    localStorage.removeItem(DIRTY_KEY);
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
// app.js registers its handler first, so a cancelled confirm leaves content in
// place and this correctly does nothing.
onToolbarAction("clear", () => {
  if (isBlankContent(editor.innerHTML)) {
    setDirty(false);
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
    alert("Failed to browse directory: " + err.message);
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
    alert("Failed to open file: " + err.message);
    return;
  }

  editor.innerHTML = markdownToHtml(data.content);
  await renderMermaidDiagrams(editor);
  await renderLatex(editor);
  localStorage.setItem("markdownContent", editor.innerHTML);
  setDirty(false);
  setCurrentFile(data.path);
}

async function saveFile(filePath) {
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
    alert("Failed to save file: " + err.message);
    return false;
  }

  setDirty(false);
  setCurrentFile(data.path);
  return true;
}

// `button` comes from the delegated click; the keyboard path looks it up.
async function saveCurrentOrPrompt(button) {
  const target = currentFilePath || (await showSaveDialog());
  if (!target) return;

  if (await saveFile(target)) {
    const saveBtn = button || toolbarButton("save-file");
    if (saveBtn) {
      flashButton(
        saveBtn,
        `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Saved!`,
      );
    }
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
// to open or save into, so say so up front instead of failing on click.
(async () => {
  try {
    const res = await fetch("/api/home");
    if (!res.ok) throw new Error(res.statusText);
    // A static host may rewrite unknown paths to index.html and answer 200,
    // so only a well-formed JSON reply counts as "the server is there".
    const data = await res.json();
    if (typeof data.home !== "string") throw new Error("Not the Marky server");
  } catch {
    for (const action of ["open-file", "save-file"]) {
      const btn = toolbarButton(action);
      if (!btn) continue;
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.title = "Unavailable: the Marky file server is not running";
    }
  }
})();

onToolbarAction("open-file", showOpenDialog);
onToolbarAction("save-file", saveCurrentOrPrompt);
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
