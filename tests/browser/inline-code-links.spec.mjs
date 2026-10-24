// Inline code and links under the model core — TODO 3.1's slice 7, step 4 —
// driven through the format bar's Code button, Insert → Link… and Ctrl/Cmd+K,
// with the link dialog filled in the way a person fills it. Stands in for the
// hand run in Chromium and WebKit, like the two specs before it, and is judged
// the same way: what the paragraph shows, and the markdown the model holds.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, selected, paragraph, doubleClickWord, bar } from "./model-page.mjs";

useModelPage(test);

// The Link… dialog: the address field, pre-filled for an existing link, and
// the confirm button, which reads Insert or Update.
async function answerLink(page, address, { expectValue } = {}) {
  const field = page.locator(".notify-dialog-input");
  await expect(field).toBeVisible();
  if (expectValue !== undefined) await expect(field).toHaveValue(expectValue);
  await field.fill(address);
  await page.locator(".notify-dialog .notify-btn-primary").click();
  await expect(field).toHaveCount(0);
}

async function insertLinkFromMenu(page) {
  await page.locator('[data-menu="insertMenu"]').click();
  await page.locator('[data-action="insert-link"]').click();
}

test("Code over a word makes a code span, and again turns it back", async ({ page }) => {
  await open(page, "Run npm now.\n");
  await doubleClickWord(page, 0, "npm");
  await bar(page, "code");
  await expect(paragraph(page).locator("code")).toHaveText("npm");
  expect(await markdown(page)).toBe("Run `npm` now.\n");
  expect(await selected(page)).toBe("npm");
  await bar(page, "code");
  await expect(paragraph(page).locator("code")).toHaveCount(0);
  expect(await markdown(page)).toBe("Run npm now.\n");
});

test("Code over a whole paragraph is left for the code block step", async ({ page }) => {
  await open(page, "Whole line.\n");
  await paragraph(page).click({ clickCount: 3 });
  await bar(page, "code");
  expect(await markdown(page)).toBe("Whole line.\n");
});

test("a selection becomes a link through Insert → Link…", async ({ page }) => {
  await open(page, "See the docs now.\n");
  await doubleClickWord(page, 0, "docs");
  await insertLinkFromMenu(page);
  await answerLink(page, "example.com/docs", { expectValue: "" });
  await expect(paragraph(page).locator("a")).toHaveText("docs");
  expect(await markdown(page)).toBe("See the [docs](https://example.com/docs) now.\n");
});

test("at a bare caret the address goes in as its own link", async ({ page }) => {
  await open(page, "Go\n");
  await paragraph(page).click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowRight" : "End");
  await page.keyboard.type(" ");
  await page.keyboard.press("ControlOrMeta+k");
  await answerLink(page, "https://e.example");
  expect(await markdown(page)).toBe("Go [https://e.example](https://e.example)\n");
});

test("Ctrl/Cmd+K in a link offers its address, and a new one retargets it", async ({ page }) => {
  await open(page, "See [docs](https://a.example) now.\n");
  await doubleClickWord(page, 0, "docs");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+k");
  await answerLink(page, "https://b.example", { expectValue: "https://a.example" });
  expect(await markdown(page)).toBe("See [docs](https://b.example) now.\n");
});

test("leaving the address empty unlinks", async ({ page }) => {
  await open(page, "See [docs](https://a.example) now.\n");
  await doubleClickWord(page, 0, "docs");
  await page.keyboard.press("ControlOrMeta+k");
  await answerLink(page, "");
  await expect(paragraph(page).locator("a")).toHaveCount(0);
  expect(await markdown(page)).toBe("See docs now.\n");
});

test("one undo takes a link back", async ({ page }) => {
  await open(page, "See the docs now.\n");
  await doubleClickWord(page, 0, "docs");
  await page.keyboard.press("ControlOrMeta+k");
  await answerLink(page, "https://x.example");
  expect(await markdown(page)).toBe("See the [docs](https://x.example) now.\n");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("See the docs now.\n");
});

// Code is checkable in the Format menu, like the marks: found missing by the
// user on 2026-10-24, along with the control's name, which is "Code" now and
// not "Code block", since one control makes both.
test("the Format menu checks Code with the caret in a code span", async ({ page }) => {
  await open(page, "Run `npm` now.\n");
  await page.locator("#editor code").click();
  await page.locator('[data-menu="formatMenu"]').click();
  const item = page.locator('[data-action="format-code"]');
  await expect(item).toHaveText(/^Code$/);
  await expect(item).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator('#formatBar [data-format="code"]')).toHaveAttribute("title", "Code");
});

