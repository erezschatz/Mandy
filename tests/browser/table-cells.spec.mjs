// Table cells take the caret under the model core — TODO 3.1's stage 3, slice
// 4 — in a real engine with trusted keys. Stands in for the hand run of
// format-check.md's table-cell section in Chromium and WebKit, judged by what
// the page shows and the markdown the model holds; the render verify is on for
// every test, so a cell whose DOM text drifts from its model fails here too.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, menu, LINE_START, LINE_END } from "./model-page.mjs";

useModelPage(test);

const SOURCE = "Before.\n\n|a|b|\n|-|-|\n|1|2|\n|3|4|\n\nAfter.\n";
const cell = (page, text) => page.locator("#editor td, #editor th").filter({ hasText: new RegExp(`^${text}$`) });

test("a table is editable now, and its cells own their elements", async ({ page }) => {
  await open(page, SOURCE);
  await expect(page.locator("#editor table")).not.toHaveAttribute("contenteditable", "false");
  const stamped = await page.locator("#editor td[data-block], #editor th[data-block]").count();
  expect(stamped).toBe(6);
});

test("typing in a cell rewrites only that row's line", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "1").click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.type("00");
  await expect(cell(page, "100")).toHaveCount(1);
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-|\n|100|2|\n|3|4|\n\nAfter.\n");
});

test("a padded table re-pads its column when a cell outgrows it", async ({ page }) => {
  await open(page, "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n");
  await cell(page, "1").click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.type("234");
  expect(await markdown(page)).toBe("| a    | b   |\n| ---- | --- |\n| 1234 | 2   |\n");
});

test("Backspace across cells empties what it covers and keeps the grid", async ({ page }) => {
  await open(page, "|ab|cd|\n|-|-|\n|ef|gh|\n");
  await page.evaluate(() => {
    const cells = [...editor.querySelectorAll("th")];
    getSelection().setBaseAndExtent(cells[0].firstChild, 1, cells[1].firstChild, 1);
  });
  await page.keyboard.press("Backspace");
  expect(await markdown(page)).toBe("|a|d|\n|-|-|\n|ef|gh|\n");
  await expect(page.locator("#editor th")).toHaveCount(2);
});

test("Backspace at a cell's start changes nothing", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "2").click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  expect(await markdown(page)).toBe(SOURCE);
});

test("Enter, Shift+Enter and Tab in a cell do nothing yet, and the caret stays put", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "1").click();
  await page.keyboard.press(LINE_END);
  for (const key of ["Enter", "Shift+Enter", "Tab"]) await page.keyboard.press(key);
  await page.keyboard.type("x");
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-|\n|1x|2|\n|3|4|\n\nAfter.\n");
});

test("bold works in a cell", async ({ page }) => {
  await open(page, "|word|b|\n|-|-|\n|1|2|\n");
  // Selected by keyboard: a double-click at the cell's centre lands in its
  // padding past the word, where Blink and WebKit place a caret and Gecko
  // selects the whole cell — each right, and none of them the gesture tested.
  await cell(page, "word").click();
  await page.keyboard.press(LINE_START);
  await page.keyboard.press(`Shift+${LINE_END}`);
  await page.keyboard.press("ControlOrMeta+b");
  expect(await markdown(page)).toBe("|**word**|b|\n|-|-|\n|1|2|\n");
});

test("a block format in a cell is refused, and says so", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "1").click();
  await menu(page, "h2");
  await expect(page.getByText("A table cell holds one line of text")).toBeVisible();
  expect(await markdown(page)).toBe(SOURCE);
});

test("a paste of several blocks into a cell lands on one line", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "1").click();
  await page.keyboard.press(LINE_END);
  // Through the path Edit → Paste takes once it has read the clipboard: a
  // constructed ClipboardEvent's data is ignored by Gecko, and a real
  // clipboard is the hand run's.
  await page.evaluate(() => modelPasteInto(
    "<h2>Head</h2><p>Some <b>bold</b>.</p><ul><li>one</li></ul>", "Head\n\nSome bold.\n\none"));
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-|\n|1Head Some **bold**. one|2|\n|3|4|\n\nAfter.\n");
});

test("one undo takes a cell edit back", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "3").click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.type("9");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe(SOURCE);
});
