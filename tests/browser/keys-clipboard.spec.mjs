// Ctrl/Cmd+B and Ctrl/Cmd+I, and Edit → Cut and Copy, under the model core —
// TODO 3.1's slice 7, step 8. The keys are TODO 1.7 for the model core. The
// menu's Cut and Copy go through the model's own clipboard handler, so what
// reached the clipboard is judged the way a person would judge it: by pasting.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, selected, paragraph, doubleClickWord, menu, LINE_END } from "./model-page.mjs";

useModelPage(test);

test.beforeEach(async ({ context, browserName }) => {
  // Chromium asks for these before a page may read or write the clipboard;
  // WebKit has no such permission and lets a user gesture through.
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

async function choose(page, action) {
  await page.locator('[data-menu="editMenu"]').click();
  await page.locator(`[data-action="${action}"]`).click();
}

test("Ctrl/Cmd+B bolds a selection, and again takes it off", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await page.keyboard.press("ControlOrMeta+b");
  await expect(paragraph(page).locator("strong")).toHaveText("beta");
  expect(await markdown(page)).toBe("Alpha **beta** gamma.\n");
  expect(await selected(page)).toBe("beta");
  await page.keyboard.press("ControlOrMeta+b");
  expect(await markdown(page)).toBe("Alpha beta gamma.\n");
});

test("Ctrl/Cmd+I italicises a selection", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await page.keyboard.press("ControlOrMeta+i");
  await expect(paragraph(page).locator("em")).toHaveText("beta");
});

test("Ctrl/Cmd+B at a bare caret makes the next letters bold", async ({ page }) => {
  await open(page, "Alpha\n");
  await paragraph(page).click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.type(" ");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("bold");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type(" plain");
  expect(await markdown(page)).toBe("Alpha **bold** plain\n");
});

test("Edit → Copy puts the selection on the clipboard, marks and all", async ({ page }) => {
  await open(page, "Alpha **beta** gamma.\n\nEnd\n");
  await doubleClickWord(page, 0, "beta");
  await choose(page, "copy");
  expect(await markdown(page)).toBe("Alpha **beta** gamma.\n\nEnd\n");
  await paragraph(page, 1).click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => markdown(page)).toBe("Alpha **beta** gamma.\n\nEnd**beta**\n");
});

test("Edit → Cut takes the selection out, and a paste puts it back", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n\nEnd\n");
  await doubleClickWord(page, 0, "beta");
  await choose(page, "cut");
  await expect.poll(() => markdown(page)).toBe("Alpha  gamma.\n\nEnd\n");
  await paragraph(page, 1).click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => markdown(page)).toBe("Alpha  gamma.\n\nEndbeta\n");
});

test("one undo takes a cut back", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await choose(page, "cut");
  await expect.poll(() => markdown(page)).toBe("Alpha  gamma.\n");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("Alpha beta gamma.\n");
});
