// Blockquote under the model core — TODO 3.1's stage 3, slice 1, TODO 1.1.6 —
// through the Format menu and the two keys at a quote's edge. Stands in for the
// hand run of format-check.md's blockquote section in Chromium and WebKit, and
// is judged by what the page shows and the markdown the model holds.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, paragraph, menu, LINE_START, LINE_END } from "./model-page.mjs";

useModelPage(test);

const quoted = (page) => page.locator("#editor blockquote p");

test("a paragraph is quoted and unquoted from the Format menu", async ({ page }) => {
  await open(page, "One\n\nTwo\n");
  await paragraph(page, 0).click();
  await menu(page, "quote");
  await expect(quoted(page)).toHaveText("One");
  expect(await markdown(page)).toBe("> One\n\nTwo\n");
  await quoted(page).click();
  await menu(page, "quote");
  await expect(page.locator("#editor blockquote")).toHaveCount(0);
  expect(await markdown(page)).toBe("One\n\nTwo\n");
});

test("two paragraphs selected become one quote", async ({ page }) => {
  await open(page, "One\n\nTwo\n\nAfter\n");
  await paragraph(page, 0).click();
  await page.keyboard.press(LINE_START);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`Shift+${LINE_END}`);
  await menu(page, "quote");
  await expect(page.locator("#editor blockquote")).toHaveCount(1);
  await expect(quoted(page)).toHaveCount(2);
  expect(await markdown(page)).toBe("> One\n>\n> Two\n\nAfter\n");
});

test("a bullet is quoted inside its own item", async ({ page }) => {
  await open(page, "- a\n- b\n");
  await page.locator("#editor li").first().click();
  await menu(page, "quote");
  await expect(page.locator("#editor li blockquote")).toHaveCount(1);
  await expect(page.locator("#editor li")).toHaveCount(2);
  expect(await markdown(page)).toBe("- > a\n- b\n");
});

test("Enter twice at the end of a quote leaves it", async ({ page }) => {
  await open(page, "> One\n\nAfter\n");
  await quoted(page).click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("x");
  await expect(quoted(page)).toHaveText("One");
  expect(await markdown(page)).toBe("> One\n\nx\n\nAfter\n");
});

test("Backspace at the start of a quote's first block takes it out", async ({ page }) => {
  await open(page, "> One\n>\n> Two\n");
  await quoted(page).first().click();
  await page.keyboard.press(LINE_START);
  await page.keyboard.press("Backspace");
  await expect(quoted(page)).toHaveText("Two");
  expect(await markdown(page)).toBe("One\n\n> Two\n");
  // The caret stayed at the start of the block it moved.
  await page.keyboard.type("x");
  expect(await markdown(page)).toBe("xOne\n\n> Two\n");
});

test("one undo takes a quote back", async ({ page }) => {
  await open(page, "One\n");
  await paragraph(page, 0).click();
  await menu(page, "quote");
  expect(await markdown(page)).toBe("> One\n");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("One\n");
});

// D4's amendment: no new format is written against contenteditable, so the
// old core answers the control with a message and changes nothing.
test("the old core says where Blockquote works, and changes nothing", async ({ page }) => {
  await page.goto("/?core=legacy");
  await page.waitForFunction(() => typeof modelCoreEnabled === "function" && !modelCoreEnabled());
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => { loadDocumentMarkdown("One\n"); undoReset(); });
  await paragraph(page, 0).click();
  const before = await page.evaluate(() => editor.innerHTML);
  await menu(page, "quote");
  await expect(page.getByText("Blockquote needs the new editing core")).toBeVisible();
  expect(await page.evaluate(() => editor.innerHTML)).toBe(before);
});

// The menu says what the caret is in. Asked for by the user on 2026-10-30:
// a caret in a quote is not in plain text, and the Format menu has to show it,
// the way it shows Bold for a caret in bold text.
async function menuState(page, format) {
  await page.locator('[data-menu="formatMenu"]').click();
  const state = await page.locator(`[data-action="format-${format}"]`).getAttribute("aria-pressed");
  await page.keyboard.press("Escape");
  return state;
}

test("the Format menu checks Blockquote with the caret in a quote, and not outside one", async ({ page }) => {
  await open(page, "> - quoted bullet\n\n## Plain heading\n");
  await page.locator("#editor blockquote li").click();
  expect(await menuState(page, "quote")).toBe("true");
  expect(await menuState(page, "ul")).toBe("true");
  await page.locator("#editor h2").click();
  expect(await menuState(page, "quote")).toBe("false");
  expect(await menuState(page, "h2")).toBe("true");
});

