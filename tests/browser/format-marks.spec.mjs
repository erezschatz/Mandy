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

// The start and end of a line. On macOS WebKit takes Home and End to scroll
// the page and leave the caret alone, which is the platform's own convention.
const LINE_START = process.platform === "darwin" ? "Meta+ArrowLeft" : "Home";
const LINE_END = process.platform === "darwin" ? "Meta+ArrowRight" : "End";

test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || /render diverged/.test(msg.text())) problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  testInfo.problems = problems;
  await page.goto("/?core=model");
  await page.waitForFunction(() =>
    typeof loadDocumentMarkdown === "function" && typeof modelCoreEnabled === "function");
  expect(await page.evaluate(() => modelCoreEnabled()), "the model core is on").toBe(true);
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.problems, "console errors or render divergences").toEqual([]);
});

async function open(page, markdown) {
  await page.evaluate((src) => {
    modelVerifySetEnabled(true);
    loadDocumentMarkdown(src);
    // What File → Open does after the door: a fresh history, so an undo
    // cannot reach back past the document into the welcome page.
    undoReset();
  }, markdown);
}

// The markdown the model holds: what a save will write from stage 4 on.
const markdown = (page) => page.evaluate(() => {
  const doc = modelCurrentDocument();
  return modelSerialise(doc, (block) => modelEmitLeaf(block, md, doc));
});

const selected = (page) => page.evaluate(() => getSelection().toString());

const paragraph = (page, n = 0) => page.locator("#editor > p").nth(n);

async function doubleClickWord(page, n, word) {
  const box = await paragraph(page, n).evaluate((p, word) => {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf(word);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + word.length);
      const r = range.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  }, word);
  await page.mouse.dblclick(box.x, box.y);
  await expect.poll(() => selected(page)).toBe(word);
}

// The format bar shows itself for a selection; its buttons are what a person
// presses. The menu is the second route to the same command.
async function bar(page, format) {
  const button = page.locator(`#formatBar [data-format="${format}"]`);
  await expect(button).toBeVisible();
  await button.click();
}

async function menu(page, format) {
  await page.locator('[data-menu="formatMenu"]').click();
  await page.locator(`[data-action="format-${format}"]`).click();
}

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
