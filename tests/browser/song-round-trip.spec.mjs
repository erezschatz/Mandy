// A song keeps its verse gaps the whole way round — task 1.12's stage 4. Typed
// with Enter after every line and an extra Enter between verses, it is saved
// to a scratch file through the file API, the page is reloaded so the
// document comes back through the autosave, and the file is opened again; the
// gaps have to be on screen after each, and the bytes have to be the bytes.
// Then a word is typed into a gap of the reopened file and saved, which is the
// edit stage 3 exists for. Copy markdown and the editor's copy handler are
// checked against the same bytes on the way.
//
// The save is `saveFile` handed a path and the reopen `openFile`, which is what
// Save As and Open call once their dialogs have one; the dialogs are not
// driven. Copy markdown's handler is the real one; the clipboard it writes to
// is replaced, since reading the system clipboard back is not something every
// engine lets a page do, and the bytes it was handed are what is under test.
// The copy is the same: Ctrl/Cmd+A is pressed, and then a constructed `copy`
// event reaches the real handler, as copy-gap.spec.mjs does, rather than a
// Ctrl/Cmd+C reaching the system clipboard.

import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useModelPage, open, markdown } from "./model-page.mjs";

useModelPage(test);

let scratch;
test.beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "mandy-song-")); });
test.afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

const VERSES = [
  ["Over the ford", "and up the hill,"],
  ["down to the mill", "where the wheel turns still,"],
  ["and home again."],
];

// The file: one blank line between the lines of a verse, as markdown writes
// two paragraphs, and two between verses, which is the gap. A document typed
// from empty ends without a line end, as it did before this task: the model
// writes the one the file had, and this file never had one.
const SONG = VERSES.map((verse) => verse.join("\n\n")).join("\n\n\n");

// What the screen shows: each line a paragraph, and an empty one between
// verses.
const SCREEN = VERSES.flatMap((verse, i) => (i ? ["", ...verse] : verse));

const screen = (page) => page.evaluate(() =>
  [...editor.querySelectorAll(":scope > p")].map((p) => p.textContent));

async function ready(page) {
  await page.waitForFunction(() =>
    typeof openFile === "function" && typeof saveFile === "function" && typeof modelCurrentDocument === "function");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => editor.children.length > 0);
  await page.evaluate(() => modelVerifySetEnabled(true));
}

async function save(page, path) {
  expect(await page.evaluate((path) => saveFile(path), path), "the save reports success").toBe(true);
  return readFileSync(path, "utf8");
}

async function copyAll(page) {
  await page.keyboard.press("ControlOrMeta+a");
  return page.evaluate(() => {
    // Read off the event, not the DataTransfer handed in: Gecko wraps it.
    const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return event.clipboardData.getData("text/plain");
  });
}

async function copyMarkdown(page) {
  return page.evaluate(async () => {
    let copied = null;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { copied = text; } },
    });
    await runToolbarAction("copy-md");
    return copied;
  });
}

test("a song typed with gaps between its verses keeps them through a save, a reload and a reopen", async ({ page, browserName }) => {
  await open(page, "");
  await page.locator("#editor > p").first().click();
  for (const [i, verse] of VERSES.entries()) {
    if (i) await page.keyboard.press("Enter"); // the extra Enter: the gap
    for (const [j, line] of verse.entries()) {
      if (i || j) await page.keyboard.press("Enter");
      await page.keyboard.type(line);
    }
  }
  expect(await screen(page), "typed").toEqual(SCREEN);
  expect(await markdown(page), "the model holds the song").toBe(SONG);
  // Until 2026-11-20 every word typed into a paragraph left one newline beside
  // it, outside any block, and Firefox copied them as blank lines at the end.
  await page.keyboard.type(" ");
  await page.keyboard.press("Backspace");
  expect(await page.evaluate(() => [...editor.childNodes].filter((node) => node.nodeType === 3).length),
    "typing leaves no text beside the paragraphs").toBe(0);

  const path = join(scratch, `${browserName}.md`);
  expect(await save(page, path), "saved").toBe(SONG);
  expect(await copyMarkdown(page), "Copy markdown is the file").toBe(SONG);
  expect(await copyAll(page), "the copy handler writes the file").toBe(SONG);

  // A reload brings the document back through the autosave.
  await page.reload();
  await ready(page);
  expect(await screen(page), "after a reload").toEqual(SCREEN);
  expect(await markdown(page), "the autosave held the song").toBe(SONG);

  // A reopen brings it back from the file, where stage 3 reads the gaps. Another
  // document goes on screen first, so the wait below waits for the file.
  await open(page, "a\n");
  expect(await page.evaluate((path) => openFile(path), path)).not.toBe(false);
  await page.waitForFunction(() => editor.textContent.includes("Over the ford"));
  expect(await screen(page), "after a reopen").toEqual(SCREEN);
  expect(await markdown(page), "reopened untouched").toBe(SONG);

  // Typing into the first gap fills it: the word becomes a line of its own,
  // with one blank line either side, and the second gap is left alone.
  await page.locator("#editor > p").nth(2).click();
  await page.keyboard.type("refrain");
  const filled = SONG.replace("hill,\n\n\n", "hill,\n\nrefrain\n\n");
  expect(await save(page, path), "the filled gap saved").toBe(filled);
});
