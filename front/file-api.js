// Server-backed open/save. Only loaded by the app itself — exported HTML files
// have no server behind them and keep their own blob download instead.

const openBtn = document.getElementById("openBtn");
const saveBtn = document.getElementById("saveBtn");
const currentFileLabel = document.getElementById("currentFile");

const fileDialog = document.getElementById("fileDialog");
const dialogTitle = document.getElementById("dialogTitle");
const dialogClose = document.getElementById("dialogClose");
const dialogPathBar = document.getElementById("dialogPathBar");
const dialogEntries = document.getElementById("dialogEntries");
const dialogSaveRow = document.getElementById("dialogSaveRow");
const dialogFilename = document.getElementById("dialogFilename");
const dialogSaveConfirm = document.getElementById("dialogSaveConfirm");

let currentFilePath = null;
let dialogMode = "open";
let dialogDir = null; // last visited directory, reused between openings
let saveResolver = null;

function setCurrentFile(filePath) {
  currentFilePath = filePath;
  if (currentFileLabel) {
    currentFileLabel.textContent = filePath ? filePath.split("/").pop() : "";
    currentFileLabel.title = filePath || "";
  }
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
    alert("Failed to browse directory: " + err.message);
    return;
  }

  dialogDir = data.path;
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
    loadDir(currentFilePath ? null : dialogDir).then(() => {
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

  setCurrentFile(data.path);
  return true;
}

async function saveCurrentOrPrompt() {
  const target = currentFilePath || (await showSaveDialog());
  if (!target) return;

  if (await saveFile(target)) {
    flashButton(
      saveBtn,
      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Saved!`,
    );
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
    for (const btn of [openBtn, saveBtn]) {
      btn.disabled = true;
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
      btn.title = "Unavailable: the Marky file server is not running";
    }
  }
})();

openBtn.addEventListener("click", showOpenDialog);
saveBtn.addEventListener("click", saveCurrentOrPrompt);
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
