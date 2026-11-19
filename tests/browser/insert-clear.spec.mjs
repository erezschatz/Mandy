// Insert → Horizontal rule, Insert → Table of contents and Edit → Clear
// document under the model core — TODO 3.1's slice 7, step 7. Stands in for
// the hand run in Chromium and WebKit, judged by what the page shows and the
// markdown the model holds.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, paragraph, LINE_START } from "./model-page.mjs";

useModelPage(test);

async function choose(page, menuId, action) {
  await page.locator(`[data-menu="${menuId}"]`).click();
  await page.locator(`[data-action="${action}"]`).click();
}

// The caret just after the first `count` characters of paragraph `n`.
async function caretAfter(page, n, count) {
  await paragraph(page, n).click();
  await page.keyboard.press(LINE_START);
  for (let i = 0; i < count; i++) await page.keyboard.press("ArrowRight");
}

test("a rule goes in at the caret, splitting the paragraph", async ({ page }) => {
  await open(page, "Alpha beta\n");
  await caretAfter(page, 0, 6);
  await choose(page, "insertMenu", "insert-hr");
  await expect(page.locator("#editor hr")).toHaveCount(1);
  expect(await markdown(page)).toBe("Alpha\n\n---\n\nbeta\n");
});

test("a rule is spelt the way the document spells one", async ({ page }) => {
  await open(page, "***\n\nAlpha\n");
  await paragraph(page, 0).click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
  await choose(page, "insertMenu", "insert-hr");
  expect(await markdown(page)).toBe("***\n\nAlpha\n\n***\n");
});

test("a rule at the start of a bullet is refused, and says why", async ({ page }) => {
  await open(page, "- one\n- two\n");
  await page.locator("#editor li").first().click();
  await page.keyboard.press(LINE_START);
  await choose(page, "insertMenu", "insert-hr");
  await expect(page.getByText("A rule cannot go at the start of a list item.")).toBeVisible();
  expect(await markdown(page)).toBe("- one\n- two\n");
});

test("a table of contents goes in after the caret's block", async ({ page }) => {
  await open(page, "# One\n\nText here.\n\n## Two\n");
  await page.locator("#editor h1").click();
  await choose(page, "insertMenu", "insert-toc");
  await expect(page.locator("#editor ul a")).toHaveCount(2);
  const md = await markdown(page);
  expect(md.startsWith("# One\n\n")).toBe(true);
  expect(md).toContain("[One](#one)");
  expect(md).toContain("[Two](#two)");
  expect(md.endsWith("Text here.\n\n## Two\n")).toBe(true);
});

test("Clear empties the document, and one undo brings it back", async ({ page }) => {
  await open(page, "# One\n\nText here.\n");
  await paragraph(page, 0).click();
  await choose(page, "editMenu", "clear");
  expect(await markdown(page)).toBe("");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("# One\n\nText here.\n");
});

test("one undo takes a rule back", async ({ page }) => {
  await open(page, "Alpha beta\n");
  await caretAfter(page, 0, 6);
  await choose(page, "insertMenu", "insert-hr");
  expect(await markdown(page)).toBe("Alpha\n\n---\n\nbeta\n");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("Alpha beta\n");
});
