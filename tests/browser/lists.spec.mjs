// Bullet and numbered lists under the model core — TODO 3.1's slice 7, step 6 —
// through the bar at a line's start and the Format menu. Stands in for the
// hand run in Chromium and WebKit, judged by what the page shows and the
// markdown the model holds.
//
// A document with no list yet takes the sniffed default, which for one that
// sniffs to nothing is Turndown's own `*` and three spaces — the spelling the
// old core's save writes too.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, paragraph, menu, bar, LINE_START, LINE_END } from "./model-page.mjs";

useModelPage(test);

async function caretAtStart(page, locator) {
  await locator.click();
  await page.keyboard.press(LINE_START);
}

test("a paragraph becomes a bullet from the bar at its line's start", async ({ page }) => {
  await open(page, "One\n\nTwo\n");
  await caretAtStart(page, paragraph(page, 0));
  await bar(page, "ul");
  await expect(page.locator("#editor ul li")).toHaveText("One");
  expect(await markdown(page)).toBe("*   One\n\nTwo\n");
});

test("two paragraphs become one numbered list", async ({ page }) => {
  await open(page, "One\n\nTwo\n\nAfter\n");
  await caretAtStart(page, paragraph(page, 0));
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`Shift+${LINE_END}`);
  await menu(page, "ol");
  await expect(page.locator("#editor ol li")).toHaveCount(2);
  expect(await markdown(page)).toBe("1. One\n2. Two\n\nAfter\n");
});

test("a new list takes the bullet the document already uses", async ({ page }) => {
  await open(page, "- first\n\nTwo\n");
  await paragraph(page, 0).click();
  await menu(page, "ul");
  expect(await markdown(page)).toBe("- first\n- Two\n");
});

test("Bullet list in a bullet takes it out of the list", async ({ page }) => {
  await open(page, "- a\n- b\n- c\n");
  await page.locator("#editor li").nth(1).click();
  await menu(page, "ul");
  expect(await markdown(page)).toBe("- a\n\nb\n\n- c\n");
});

test("Numbered list in a bullet switches the whole list", async ({ page }) => {
  await open(page, "- a\n- b\n- c\n");
  await page.locator("#editor li").nth(1).click();
  await menu(page, "ol");
  await expect(page.locator("#editor ol li")).toHaveCount(3);
  expect(await markdown(page)).toBe("1. a\n2. b\n3. c\n");
});

test("a heading cannot go into a list, and says so", async ({ page }) => {
  await open(page, "# Title\n");
  await page.locator("#editor h1").click();
  await menu(page, "ul");
  await expect(page.getByText("Select paragraphs, or items of one list, to make a list.")).toBeVisible();
  expect(await markdown(page)).toBe("# Title\n");
});

test("one undo takes a list back", async ({ page }) => {
  await open(page, "One\n");
  await paragraph(page, 0).click();
  await menu(page, "ul");
  expect(await markdown(page)).toBe("*   One\n");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("One\n");
});
