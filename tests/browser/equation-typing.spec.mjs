// tests/fixtures/format-check.md's "Typing an equation" section — TODO 3.1's
// slice 7, step 10 — driven with Playwright's keyboard and mouse rather than a
// person's. TODO 6.8 records that Playwright's keystrokes are trusted and make
// Chromium and WebKit perform real editing commands, which is what lets this
// stand in for the hand run in those two engines.
//
// Each test is one numbered step of that section, in a fresh profile, on the
// fixture itself: read off disk and handed to loadDocumentMarkdown, so the
// document is the one a hand run opens, without the file dialog. What each step
// says should happen is asserted three ways, as a tester would judge it: what
// the new paragraph shows, where the next letters typed land, and — for the
// save — what htmlToMarkdown, the save path, would write.
//
// Like the protocol, every test fails on a `[model] render diverged` warning or
// on any console error.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const FIXTURE = readFileSync(new URL("../fixtures/format-check.md", import.meta.url), "utf8");

// The end of the document. End alone stops at the end of the visual line, and
// the fixture's last paragraph wraps.
const DOC_END = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";

test.beforeEach(async ({ page }, testInfo) => {
  const problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || /render diverged/.test(msg.text())) {
      problems.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  testInfo.problems = problems;

  await page.goto("/?core=model");
  await page.waitForFunction(() =>
    typeof loadDocumentMarkdown === "function" && typeof modelCoreEnabled === "function",
  );
  expect(await page.evaluate(() => modelCoreEnabled()), "the model core is on").toBe(true);
  await page.evaluate((src) => {
    modelVerifySetEnabled(true);
    loadDocumentMarkdown(src);
  }, FIXTURE);
  // The fixture's own equations, typeset: MathJax is loaded on first use, from
  // the CDN, so this is also the check that it came at all.
  await expect.poll(() => page.locator("#editor mjx-container").count(), { timeout: 15_000 })
    .toBeGreaterThan(0);
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.problems, "console errors or render divergences").toEqual([]);
});

// "Each step types into a new paragraph at the end of the file. To start one,
// click at the end of the file's last line and press Enter." Returns the new
// paragraph's block id, so later steps can find it after the caret has left.
async function newParagraph(page) {
  await page.locator("#editor > p").last().click();
  await page.keyboard.press(DOC_END);
  await page.keyboard.press("Enter");
  return caretBlock(page);
}

async function caretBlock(page) {
  return page.evaluate(() => {
    const node = getSelection().anchorNode;
    const el = (node?.nodeType === 1 ? node : node?.parentElement)?.closest("[data-block]");
    return el?.dataset.block ?? null;
  });
}

// What a reader sees in a block: its text, with each equation shown as ⟦TeX⟧ —
// the stamped source once MathJax has typeset it, the raw text before. Caret
// stops, zero-width and dropped on save, are left out.
async function shown(page, id) {
  return page.evaluate((id) => {
    const el = document.querySelector(`#editor [data-block="${id}"]`);
    if (!el) return null;
    const copy = el.cloneNode(true);
    for (const span of copy.querySelectorAll("[data-math]")) {
      const tex = span.querySelector("mjx-container")?.dataset.tex ?? span.textContent;
      span.replaceWith(`⟦${tex}⟧`);
    }
    return copy.textContent.replace(/[​﻿]/g, "").replace(/ /g, " ");
  }, id);
}

const equations = (page, id) =>
  page.locator(`#editor [data-block="${id}"] mjx-container`);

const saved = (page) => page.evaluate(() => htmlToMarkdown(editor.innerHTML));

test("1. an equation forms at the space after it, and typing carries on", async ({ page }) => {
  const id = await newParagraph(page);
  await page.keyboard.type("Area $x^2$");
  // The next character might be a digit, so it waits.
  expect(await shown(page, id)).toBe("Area $x^2$");
  expect(await page.locator(`#editor [data-block="${id}"] [data-math]`).count()).toBe(0);

  await page.keyboard.type(" ");
  await expect(equations(page, id)).toHaveCount(1);
  await expect(page.getByText(/Converted to an equation\. .+ keeps it as text\./)).toBeVisible();

  await page.keyboard.type("and more words");
  expect(await shown(page, id)).toBe("Area ⟦x^2⟧ and more words");
  const markdown = await saved(page);
  expect(markdown.trimEnd().endsWith("\n\nArea $x^2$ and more words"), markdown.slice(-80)).toBe(true);
});

test("2. prices stay text", async ({ page }) => {
  const id = await newParagraph(page);
  await page.keyboard.type("It cost $5 and $");
  expect(await shown(page, id)).toBe("It cost $5 and $");
  await page.keyboard.type("10.");
  expect(await shown(page, id)).toBe("It cost $5 and $10.");
  expect(await page.locator(`#editor [data-block="${id}"] [data-math]`).count()).toBe(0);
});

test("3. Enter forms it, and so does the caret leaving by a click", async ({ page }) => {
  const first = await newParagraph(page);
  await page.keyboard.type("Then $y_1$");
  await page.keyboard.press("Enter");
  await expect(equations(page, first)).toHaveCount(1);
  expect(await shown(page, first)).toBe("Then ⟦y_1⟧");

  // The caret is at the start of the new paragraph: what is typed lands there.
  const second = await caretBlock(page);
  expect(second).not.toBe(first);
  await page.keyboard.type("Also $z$");
  expect(await shown(page, second)).toBe("Also $z$");

  await page.locator("#editor > p").first().click();
  await expect(equations(page, second)).toHaveCount(1);
  expect(await shown(page, second)).toBe("Also ⟦z⟧");
});

// The bug 233af6a fixed, found by hand in Chrome on 2026-10-10: a click just
// after a one-glyph equation put the caret in front of it.
async function clickJustAfter(page, id) {
  // The click before this one, on the first paragraph, scrolled the page to the
  // top, and the mouse works in viewport coordinates.
  await equations(page, id).first().scrollIntoViewIfNeeded();
  const box = await equations(page, id).first().boundingBox();
  await page.mouse.click(box.x + box.width + 2, box.y + box.height / 2);
  // The engine puts the click's caret on the equation, and the input layer
  // moves it out on the selectionchange that follows. A letter typed in the
  // same instant beats that — which 233af6a's entry records as something only
  // a machine does — so wait, as a hand does, until it has moved.
  await page.waitForFunction(() => {
    const node = getSelection().anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    return el && !el.closest("[data-math]");
  });
}

test("3. a click just after a one-glyph equation lands after it", async ({ page, browserName }) => {
  // Found by this spec on 2026-10-21: WebKit puts a click anywhere after an
  // equation that ends its line at the end of the text *before* it, so the
  // caret is in plain text and neither caret handler sees it. Open in
  // docs/REWRITE.md under slice 7's step 10. Marked rather than skipped, so the
  // run says so when it starts passing.
  test.fail(browserName === "webkit", "known: WebKit puts the caret before the equation");
  const id = await newParagraph(page);
  await page.keyboard.type("Also $z$");
  await page.locator("#editor > p").first().click();
  await expect(equations(page, id)).toHaveCount(1);

  await clickJustAfter(page, id);
  await page.keyboard.type("Q");
  expect(await shown(page, id)).toBe("Also ⟦z⟧Q");
});

test("3. the same click when the equation is the whole line", async ({ page }) => {
  // Safari's half of 233af6a: here the equation has a caret stop in front of
  // it, and WebKit put the click's caret in that stop.
  const id = await newParagraph(page);
  await page.keyboard.type("$z$");
  await page.locator("#editor > p").first().click();
  await expect(equations(page, id)).toHaveCount(1);

  await clickJustAfter(page, id);
  await page.keyboard.type("Q");
  expect(await shown(page, id)).toBe("⟦z⟧Q");
});

test("4. an undone conversion stays text", async ({ page }) => {
  const id = await newParagraph(page);
  await page.keyboard.type("$w$ ");
  await expect(equations(page, id)).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+z");
  expect(await shown(page, id)).toBe("$w$ ");
  // The caret is where it was: the letter lands at the end.
  await page.keyboard.type("x");
  expect(await shown(page, id)).toBe("$w$ x");
  expect(await page.locator(`#editor [data-block="${id}"] [data-math]`).count()).toBe(0);
});

test("5. Backspace reveals the source, an edit re-forms it, a selection deletes it whole", async ({ page }) => {
  const id = await newParagraph(page);
  await page.keyboard.type("Before words $x^2$ after words");
  await expect(equations(page, id)).toHaveCount(1);

  // Just after the equation: back over " after words".
  for (let i = 0; i < " after words".length; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  expect(await shown(page, id)).toBe("Before words $x^2$ after words");

  // The caret is just before the closing $, so this replaces the 2.
  await page.keyboard.press("Backspace");
  await page.keyboard.type("3");
  expect(await shown(page, id)).toBe("Before words $x^3$ after words");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(equations(page, id)).toHaveCount(1);
  expect(await shown(page, id)).toBe("Before words ⟦x^3⟧ after words");

  // A drag the way a hand makes one: from inside the words either side. A press
  // within a couple of pixels of the equation lands on the equation itself,
  // which is pressing it rather than dragging across it.
  await equations(page, id).first().scrollIntoViewIfNeeded();
  const box = await equations(page, id).first().boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 20, y, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.press("Backspace");
  await expect(equations(page, id)).toHaveCount(0);
  const after = await shown(page, id);
  expect(after).not.toContain("x");
  expect(after).toMatch(/^Before w.*ords$/);
});

test("6. a display equation forms on a line of its own, centred", async ({ page }) => {
  const id = await newParagraph(page);
  await page.keyboard.type("$$\\frac{a}{b}$$");
  await page.keyboard.press("Enter");
  const eq = equations(page, id);
  await expect(eq).toHaveCount(1);
  expect(await eq.getAttribute("display")).toBe("true");

  // Centred: the glyphs' middle sits at the block's middle.
  const block = await page.locator(`#editor [data-block="${id}"]`).boundingBox();
  const glyphs = await eq.locator("mjx-math").boundingBox();
  const offset = Math.abs(glyphs.x + glyphs.width / 2 - (block.x + block.width / 2));
  expect(offset, "distance between the equation's centre and the line's").toBeLessThan(4);
});

test("7. a caret stop before an equation that starts the line", async ({ page }) => {
  const id = await newParagraph(page);
  const tail = " starts this line";
  await page.keyboard.type("$q$" + tail);
  await expect(equations(page, id)).toHaveCount(1);

  for (let i = 0; i <= tail.length; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.type("P");
  expect(await shown(page, id)).toBe("P⟦q⟧" + tail);
});

test("8. what a save writes comes back as the same equations", async ({ page }) => {
  const inline = await newParagraph(page);
  await page.keyboard.type("Area $x^2$ ok");
  await page.keyboard.press("Enter");
  const display = await caretBlock(page);
  await page.keyboard.type("$$\\frac{a}{b}$$");
  await page.keyboard.press("Enter");
  await expect(equations(page, inline)).toHaveCount(1);
  await expect(equations(page, display)).toHaveCount(1);

  // The protocol's Save As and reopen, without the file dialog: the markdown
  // the save path writes, loaded back through the door Open uses. The fixture
  // quotes both of these in its own steps, so it is the document's last lines
  // that are checked, not whether the text occurs somewhere.
  const markdown = await saved(page);
  expect(markdown.trimEnd().endsWith("\n\nArea $x^2$ ok\n\n$$\\frac{a}{b}$$"), markdown.slice(-80)).toBe(true);

  await page.evaluate((src) => loadDocumentMarkdown(src), markdown);
  const containers = page.locator("#editor mjx-container");
  await expect.poll(async () =>
    containers.evaluateAll((all) => all.slice(-2).map((c) => c.dataset.tex)), { timeout: 15_000 },
  ).toEqual(["x^2", "\\frac{a}{b}"]);
});
