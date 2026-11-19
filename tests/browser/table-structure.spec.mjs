// Table structure under the model core — TODO 3.1's stage 3, slice 5 — in a
// real engine with trusted keys. Stands in for the hand run of format-check.md's
// table-structure section in Chromium and WebKit, judged by what the page shows
// and the markdown the model holds; the render verify is on for every test, so
// a cell whose DOM text drifts from its model fails here too.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, LINE_START, LINE_END } from "./model-page.mjs";

useModelPage(test);

const SOURCE = "Before.\n\n|a|b|\n|-|-|\n|1|2|\n\nAfter.\n";
const cell = (page, text) => page.locator("#editor td, #editor th").filter({ hasText: new RegExp(`^${text}$`) });
const control = async (page, action) => {
  await page.locator('[data-menu="formatMenu"]').click();
  await page.locator(`[data-action="${action}"]`).click();
};
// Lowercased: a header cell is drawn in capitals, and the selection reports
// what is drawn.
const selection = (page) => page.evaluate(() => getSelection().toString().toLowerCase());

test("Insert → Table makes three columns, a header and two body rows, caret in the first header cell", async ({ page }) => {
  await open(page, "One.\n");
  await cell(page, "One\\.").count();
  await page.locator("#editor p").first().click();
  await page.keyboard.press(LINE_END);
  await page.locator('[data-menu="insertMenu"]').click();
  await page.locator('[data-action="insert-table"]').click();
  await expect(page.locator("#editor th")).toHaveCount(3);
  await expect(page.locator("#editor td")).toHaveCount(6);
  await page.keyboard.type("x");
  expect(await markdown(page)).toBe("One.\n\n|x| | |\n".replace("|x| | |", "| x | | |") +
    "| --- | --- | --- |\n| | | |\n| | | |\n");
});

test("Tab moves through the cells, selecting each one's content, and Shift+Tab goes back", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "a").click();
  await page.keyboard.press("Tab");
  expect(await selection(page)).toBe("b");
  await page.keyboard.press("Tab");
  expect(await selection(page)).toBe("1");
  await page.keyboard.press("Shift+Tab");
  expect(await selection(page)).toBe("b");
  await page.keyboard.type("z");
  expect(await markdown(page)).toBe("Before.\n\n|a|z|\n|-|-|\n|1|2|\n\nAfter.\n");
});

test("Shift+Tab in the first cell does nothing", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "a").click();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("x");
  expect(await markdown(page)).toBe("Before.\n\n|ax|b|\n|-|-|\n|1|2|\n\nAfter.\n");
});

test("Tab in the last cell adds a row and goes to its first cell", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "2").click();
  await page.keyboard.press("Tab");
  await page.keyboard.type("n");
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-|\n|1|2|\n|n||\n\nAfter.\n");
});

test("Enter moves down a column, and on the last row adds one", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "b").click();
  await page.keyboard.press("Enter");
  expect(await selection(page)).toBe("2");
  await page.keyboard.press("Enter");
  await page.keyboard.type("n");
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-|\n|1|2|\n||n|\n\nAfter.\n");
});

test("Backspace at the start of the paragraph after a table goes into the last cell and deletes nothing", async ({ page }) => {
  await open(page, SOURCE);
  await page.locator("#editor p").last().click();
  await page.keyboard.press(LINE_START);
  await page.keyboard.press("Backspace");
  await page.keyboard.type("x");
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-|\n|1|2x|\n\nAfter.\n");
});

test("the table controls are disabled outside a table and live inside one", async ({ page }) => {
  await open(page, SOURCE);
  await page.locator("#editor p").first().click();
  await page.locator('[data-menu="formatMenu"]').click();
  await expect(page.locator('[data-action="table-row-below"]')).toBeDisabled();
  await page.keyboard.press("Escape");
  await cell(page, "1").click();
  await page.locator('[data-menu="formatMenu"]').click();
  await expect(page.locator('[data-action="table-row-below"]')).toBeEnabled();
});

test("rows and columns are added and deleted from the menu", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "1").click();
  await control(page, "table-row-above");
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-|\n|||\n|1|2|\n\nAfter.\n");
  await cell(page, "1").click();
  await control(page, "table-col-right");
  expect(await markdown(page)).toBe("Before.\n\n|a||b|\n|-|-|-|\n||||\n|1||2|\n\nAfter.\n");
  await cell(page, "1").click();
  await control(page, "table-delete-row");
  expect(await markdown(page)).toBe("Before.\n\n|a||b|\n|-|-|-|\n||||\n\nAfter.\n");
  await cell(page, "b").click();
  await control(page, "table-delete-column");
  expect(await markdown(page)).toBe("Before.\n\n|a||\n|-|-|\n|||\n\nAfter.\n");
});

test("the header row cannot be deleted, and says so", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "a").click();
  await control(page, "table-delete-row");
  await expect(page.getByText("A table needs its header row")).toBeVisible();
  expect(await markdown(page)).toBe(SOURCE);
});

test("alignment is set from the menu, shown by a check, and taken off by choosing it again", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "b").click();
  await control(page, "table-align-right");
  expect(await markdown(page)).toBe("Before.\n\n|a|b|\n|-|-:|\n|1|2|\n\nAfter.\n");
  await expect(cell(page, "2")).toHaveCSS("text-align", "right");
  await cell(page, "2").click();
  await page.locator('[data-menu="formatMenu"]').click();
  await expect(page.locator('[data-action="table-align-right"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-action="table-align-right"]').click();
  expect(await markdown(page)).toBe(SOURCE);
});

test("deleting the table leaves an empty paragraph where it was", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "1").click();
  await control(page, "table-delete");
  await expect(page.locator("#editor table")).toHaveCount(0);
  expect(await markdown(page)).toBe("Before.\n\nAfter.\n");
});

test("one undo takes each structural edit back", async ({ page }) => {
  await open(page, SOURCE);
  await cell(page, "1").click();
  await control(page, "table-col-left");
  await control(page, "table-row-below");
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe(SOURCE);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await markdown(page)).toBe("Before.\n\n||a|b|\n|-|-|-|\n||1|2|\n\nAfter.\n");
});
