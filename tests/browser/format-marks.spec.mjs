// Bold, italic and strikethrough under the model core — TODO 3.1's slice 7,
// step 3 — driven the way a person does it: a word double-clicked or a range
// swept with Shift+arrows, then the format bar's button or the Format menu's
// item. Like equation-typing.spec.mjs, it stands in for the hand run in
// Chromium and WebKit, on Playwright's trusted keyboard and mouse.
//
// Each test is judged by what the paragraph shows, what is still selected
// afterwards, and the markdown the model holds for the document. Not the save
// path: until stage 4 a save is Turndown over the DOM, which would be testing
// the old core. Every test fails on a render divergence or a console error.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, selected, paragraph, doubleClickWord, bar, menu, LINE_START, LINE_END }
  from "./model-page.mjs";

useModelPage(test);

test("bold from the format bar goes on, stays selected, and comes off again", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await bar(page, "bold");
  await expect(paragraph(page).locator("strong")).toHaveText("beta");
  expect(await markdown(page)).toBe("Alpha **beta** gamma.\n");
  expect(await selected(page)).toBe("beta");

  await bar(page, "bold");
  await expect(paragraph(page).locator("strong")).toHaveCount(0);
  expect(await markdown(page)).toBe("Alpha beta gamma.\n");
  expect(await selected(page)).toBe("beta");
});

// A document with no italic yet takes the sniffed style, and for one that
// sniffs to nothing that is Turndown's own default, `_` — the spelling the old
// core's save would write for it too.
test("italic and strikethrough from the Format menu", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await menu(page, "italic");
  await expect(paragraph(page).locator("em")).toHaveText("beta");
  await doubleClickWord(page, 0, "gamma");
  await menu(page, "strikethrough");
  await expect(paragraph(page).locator("s")).toHaveText("gamma");
  expect(await markdown(page)).toBe("Alpha _beta_ ~~gamma~~.\n");
});

test("a new mark is spelt the way the document already spells it", async ({ page }) => {
  await open(page, "One _two_ three.\n");
  await doubleClickWord(page, 0, "three");
  await bar(page, "italic");
  expect(await markdown(page)).toBe("One _two_ _three_.\n");
});

test("spaces swept into a selection stay outside the mark", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n");
  // From just after "Alpha" to just before "gamma": " beta ".
  await paragraph(page).click();
  await page.keyboard.press(LINE_START);
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowRight");
  expect(await selected(page)).toBe(" beta ");
  await bar(page, "bold");
  expect(await markdown(page)).toBe("Alpha **beta** gamma.\n");
});

test("a selection across two paragraphs marks the part of each it covers", async ({ page }) => {
  await open(page, "First para here.\n\nSecond para here.\n");
  await doubleClickWord(page, 0, "here");
  // Extend to the end of "Second" in the next paragraph.
  for (let i = 0; i < "Second".length + 2; i++) await page.keyboard.press("Shift+ArrowRight");
  await bar(page, "bold");
  expect(await markdown(page)).toBe("First para **here.**\n\n**Second** para here.\n");
});

test("one undo takes a mark back, and redo puts it back", async ({ page }) => {
  await open(page, "Alpha beta gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await bar(page, "bold");
  expect(await markdown(page)).toBe("Alpha **beta** gamma.\n");
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("Alpha beta gamma.\n");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(await markdown(page)).toBe("Alpha **beta** gamma.\n");
});

test("at a bare caret the mark waits for the next letters typed", async ({ page }) => {
  await open(page, "Alpha\n");
  await paragraph(page).click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.type(" ");
  await menu(page, "bold");
  await page.keyboard.type("bold");
  await menu(page, "bold");
  await page.keyboard.type(" plain");
  expect(await markdown(page)).toBe("Alpha **bold** plain\n");
});

test("typing over a bold word keeps it bold", async ({ page }) => {
  await open(page, "Alpha **beta** gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await page.keyboard.type("delta");
  expect(await markdown(page)).toBe("Alpha **delta** gamma.\n");
});

test("typing over plain text just after a bold word stays plain", async ({ page }) => {
  await open(page, "Alpha **beta** gamma.\n");
  await doubleClickWord(page, 0, "gamma");
  await page.keyboard.type("delta");
  expect(await markdown(page)).toBe("Alpha **beta** delta.\n");
});

// The Format menu says which marks are on where the caret is, stamped as it
// opens. Found missing by the Firefox hand run on 2026-10-24: with the caret
// in bold text, or a Bold pending at a bare caret, nothing said so.
async function menuState(page, format) {
  await page.locator('[data-menu="formatMenu"]').click();
  const state = await page.locator(`[data-action="format-${format}"]`).getAttribute("aria-pressed");
  await page.keyboard.press("Escape");
  return state;
}

test("the Format menu checks Bold with the caret in bold text", async ({ page }) => {
  await open(page, "Alpha **beta** gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  expect(await menuState(page, "bold")).toBe("true");
  expect(await menuState(page, "italic")).toBe("false");
});

test("the Format menu checks a pending Bold, and unchecks it again", async ({ page }) => {
  await open(page, "Alpha\n");
  await paragraph(page).click();
  await page.keyboard.press(LINE_END);
  expect(await menuState(page, "bold")).toBe("false");
  await menu(page, "bold");
  expect(await menuState(page, "bold")).toBe("true");
  await menu(page, "bold");
  expect(await menuState(page, "bold")).toBe("false");
});

test("the Format menu shows Bold as mixed for a selection only partly bold", async ({ page }) => {
  await open(page, "Alpha **beta** gamma.\n");
  await doubleClickWord(page, 0, "beta");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  expect(await menuState(page, "bold")).toBe("mixed");
});
