// Paragraph, Heading 1–6 and the code block under the model core — TODO 3.1's
// slice 7, step 5 — through the caret bar at the start of a line, the format
// bar over a selection, and the Format menu. Stands in for the hand run in
// Chromium and WebKit, and is judged by what the page shows and the markdown
// the model holds.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, paragraph, menu, bar, LINE_START, LINE_END } from "./model-page.mjs";

useModelPage(test);

// The caret at the start of a paragraph's line, where the caret bar appears.
async function caretAtStart(page, n = 0) {
  await paragraph(page, n).click();
  await page.keyboard.press(LINE_START);
}

test("the Format menu makes a paragraph a heading, and back", async ({ page }) => {
  await open(page, "A title\n\nBody text.\n");
  await paragraph(page).click();
  await menu(page, "h2");
  await expect(page.locator("#editor h2")).toHaveText("A title");
  expect(await markdown(page)).toBe("## A title\n\nBody text.\n");
  await page.locator("#editor h2").click();
  await menu(page, "p");
  await expect(page.locator("#editor h2")).toHaveCount(0);
  expect(await markdown(page)).toBe("A title\n\nBody text.\n");
});

test("the caret bar at a line's start makes a heading", async ({ page }) => {
  await open(page, "A title\n");
  await caretAtStart(page);
  await bar(page, "h1");
  expect(await markdown(page)).toBe("# A title\n");
});

test("a selection across two paragraphs makes both headings", async ({ page }) => {
  await open(page, "One\n\nTwo\n\nThree\n");
  await caretAtStart(page, 0);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`Shift+${LINE_END}`);
  await menu(page, "h3");
  expect(await markdown(page)).toBe("### One\n\n### Two\n\nThree\n");
});

test("a heading inside a bullet is refused", async ({ page }) => {
  await open(page, "- an item\n");
  await page.locator("#editor li").click();
  await menu(page, "h1");
  expect(await markdown(page)).toBe("- an item\n");
});

test("Code at a bare caret makes the line a code block, and again turns it back", async ({ page }) => {
  await open(page, "npm test\n\nafter\n");
  await caretAtStart(page);
  await bar(page, "code");
  await expect(page.locator("#editor pre code")).toHaveText("npm test\n");
  expect(await markdown(page)).toBe("```\nnpm test\n```\n\nafter\n");
  await page.locator("#editor pre").click();
  await menu(page, "code");
  await expect(page.locator("#editor pre")).toHaveCount(0);
  expect(await markdown(page)).toBe("npm test\n\nafter\n");
});

test("two whole paragraphs become one code block", async ({ page }) => {
  await open(page, "first line\n\nsecond line\n\nafter\n");
  await caretAtStart(page, 0);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`Shift+${LINE_END}`);
  await menu(page, "code");
  expect(await markdown(page)).toBe("```\nfirst line\nsecond line\n```\n\nafter\n");
});

test("two bullets are refused as one code block, and say so", async ({ page }) => {
  await open(page, "- one\n- two\n");
  await page.locator("#editor li").first().click();
  await page.keyboard.press(LINE_START);
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`Shift+${LINE_END}`);
  await menu(page, "code");
  await expect(page.getByText("Select inside a single block to format it as code.")).toBeVisible();
  expect(await markdown(page)).toBe("- one\n- two\n");
});

test("one undo takes a kind change back", async ({ page }) => {
  await open(page, "A title\n");
  await paragraph(page).click();
  await menu(page, "h2");
  expect(await markdown(page)).toBe("## A title\n");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("A title\n");
});
