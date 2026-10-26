// Slice 7's step 9, the machine half: the items of
// tests/fixtures/format-check.md's "Everything together" section that no
// earlier section's spec drives — marks combined on one word, a code span
// beside them, a numbered list switched back to bullets, a reference link
// retargeted — plus the keyboard step front/input-check.html gained for TODO
// 1.7, checked to report what it should before a person relies on it.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, paragraph, doubleClickWord, bar, menu } from "./model-page.mjs";

test.describe("in the app", () => {
  useModelPage(test);

  async function menuStates(page) {
    await page.locator('[data-menu="formatMenu"]').click();
    const states = {};
    for (const format of ["bold", "italic", "strikethrough"]) {
      states[format] = await page.locator(`[data-action="format-${format}"]`).getAttribute("aria-pressed");
    }
    await page.keyboard.press("Escape");
    return states;
  }

  test("three marks on one word, and a code span beside it that leaves them alone", async ({ page }) => {
    await open(page, "A word to dress up here.\n");
    await doubleClickWord(page, 0, "dress");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.press("ControlOrMeta+i");
    await menu(page, "strikethrough");
    const dress = paragraph(page).locator("strong, em, s").filter({ hasText: "dress" });
    await expect(paragraph(page).locator("strong")).toHaveText("dress");
    await expect(paragraph(page).locator("em")).toHaveText("dress");
    await expect(paragraph(page).locator("s")).toHaveText("dress");
    expect(await dress.count()).toBe(3);
    expect(await menuStates(page)).toEqual({ bold: "true", italic: "true", strikethrough: "true" });

    await doubleClickWord(page, 0, "word");
    await bar(page, "code");
    await expect(paragraph(page).locator("code")).toHaveText("word");
    await expect(paragraph(page).locator("strong")).toHaveText("dress");
    // What the model holds reads back with the same three marks and the code.
    const html = await page.evaluate((src) => md.render(src), await markdown(page));
    expect(html).toContain("<code>word</code>");
    for (const tag of ["strong", "em", "s"]) expect(html).toContain(`<${tag}>`);
  });

  test("a numbered list switched back to bullets", async ({ page }) => {
    await open(page, "1. first number\n2. second number\n");
    await page.locator("#editor li").first().click();
    await menu(page, "ul");
    await expect(page.locator("#editor ul li")).toHaveCount(2);
    expect(await markdown(page)).toBe("*   first number\n*   second number\n");
  });

  test("a reference link retargeted is written inline, and its definition stays", async ({ page }) => {
    await open(page, "Read the [field notes][notes] first.\n\n[notes]: https://example.org/notes\n");
    await doubleClickWord(page, 0, "notes");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ControlOrMeta+k");
    const field = page.locator(".notify-dialog-input");
    await expect(field).toHaveValue("https://example.org/notes");
    await field.fill("https://example.org/elsewhere");
    await page.locator(".notify-dialog .notify-btn-primary").click();
    await expect(field).toHaveCount(0);
    expect(await markdown(page)).toBe(
      "Read the [field notes](https://example.org/elsewhere) first.\n\n[notes]: https://example.org/notes\n");
  });
});

test("input-check's keyboard step says the key was taken from the browser", async ({ page }) => {
  await page.goto("/input-check.html");
  const editor = page.locator("#editor");
  await expect(editor).toBeVisible();
  // Any word in the page's own document will do.
  const word = await editor.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const match = /[A-Za-z]{5,}/.exec(node.data);
      if (!match) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      const r = range.getBoundingClientRect();
      return { text: match[0], x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  await page.mouse.dblclick(word.x, word.y);
  await page.keyboard.press("ControlOrMeta+b");
  // The page's log, not its protocol, which quotes the failure line by name.
  const log = page.locator("#log");
  await expect(log.getByText("taken from the browser: the editor handles Bold")).toBeVisible();
  await expect(log.getByText("NOT taken from the browser")).toHaveCount(0);
  await expect(editor.locator("strong", { hasText: word.text })).toHaveCount(1);
});
