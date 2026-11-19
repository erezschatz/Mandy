// What the model specs share: a fresh page that fails
// the test on any render divergence or console error, a document loaded the way
// File → Open loads one, and the ways a person selects and formats.

import { expect } from "@playwright/test";

// The start and end of a line. On macOS WebKit takes Home and End to scroll
// the page and leave the caret alone, which is the platform's own convention.
export const LINE_START = process.platform === "darwin" ? "Meta+ArrowLeft" : "Home";
export const LINE_END = process.platform === "darwin" ? "Meta+ArrowRight" : "End";

// Gecko reports a web font whose download was cancelled as a console error,
// with status NS_BINDING_ABORTED (2152398850 = 0x804B0002), which is what a
// navigation does to MathJax's and Source Serif's fonts still in flight. Blink
// and WebKit say nothing. It is the page leaving, not anything failing, so this
// one message is not a problem; a font that failed for any other reason still is.
export const cancelledFont = (text) =>
  /downloadable font: download failed/.test(text) && /status=2152398850\b/.test(text);

export function useModelPage(test) {
test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on("console", (msg) => {
    if (cancelledFont(msg.text())) return;
    if (msg.type() === "error" || /render diverged/.test(msg.text())) problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  testInfo.problems = problems;
  await page.goto("/");
  await page.waitForFunction(() =>
    typeof loadDocumentMarkdown === "function" && typeof modelCurrentDocument === "function");
  // Startup finished, not just defined: it fetches the welcome document
  // asynchronously, and under load that fetch could land after a test had
  // loaded its own document, leaving the welcome page in the history under it.
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => editor.children.length > 0);
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.problems, "console errors or render divergences").toEqual([]);
});
}

export async function open(page, markdown) {
  await page.evaluate((src) => {
    modelVerifySetEnabled(true);
    loadDocumentMarkdown(src);
    // What File → Open does after the door: a fresh history, so an undo
    // cannot reach back past the document into the welcome page.
    undoReset();
  }, markdown);
}

// The markdown the model holds: what a save will write from stage 4 on.
export const markdown = (page) => page.evaluate(() => {
  const doc = modelCurrentDocument();
  return modelSerialise(doc, (block) => modelEmitLeaf(block, md, doc));
});

export const selected = (page) => page.evaluate(() => getSelection().toString());

export const paragraph = (page, n = 0) => page.locator("#editor > p").nth(n);

export async function doubleClickWord(page, n, word) {
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
export async function bar(page, format) {
  const button = page.locator(`#formatBar [data-format="${format}"]`);
  await expect(button).toBeVisible();
  await button.click();
}

export async function menu(page, format) {
  await page.locator('[data-menu="formatMenu"]').click();
  await page.locator(`[data-action="format-${format}"]`).click();
}

