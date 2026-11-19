// A copy keeps a gap typed with Enter — TODO 1.12's stage 2. What the copy
// handler writes is read straight off the event: a `copy` raised with a
// `DataTransfer` of its own goes through the same handler Ctrl/Cmd+C reaches,
// and hands back both halves, where a paste would only show the one this
// editor prefers. The gaps are typed, since a reopened file does not show them
// until stage 3.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, paragraph, LINE_START, LINE_END } from "./model-page.mjs";

useModelPage(test);

// Selects the whole document and copies it, returning what was written.
async function copyAll(page) {
  await page.keyboard.press("ControlOrMeta+a");
  return page.evaluate(() => {
    // Read off the event, not the DataTransfer handed in: Gecko wraps it in an
    // object of its own and writes there.
    const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    const data = event.clipboardData;
    return { text: data.getData("text/plain"), html: data.getData("text/html") };
  });
}

async function typeLines(page, first, keys) {
  await open(page, `${first}\n`);
  await paragraph(page).click();
  await page.keyboard.press(LINE_END);
  for (const key of keys) {
    if (key === "\n") await page.keyboard.press("Enter");
    else await page.keyboard.type(key);
  }
}

test("a song copies with its verse gaps, as the file has them", async ({ page }) => {
  await typeLines(page, "a", ["\n", "b", "\n", "\n", "c", "\n", "d"]);
  expect(await markdown(page)).toBe("a\n\nb\n\n\nc\n\nd\n");
  const copied = await copyAll(page);
  expect(copied.text).toBe("a\n\nb\n\n\nc\n\nd");
  expect(copied.html.match(/<p[^>]*><br><\/p>/g)).toHaveLength(1);
  expect((await copyAll(page)).text).toBe((await markdown(page)).replace(/\n$/, ""));
});

test("two empty paragraphs copy as two blank lines more", async ({ page }) => {
  await typeLines(page, "one", ["\n", "\n", "\n", "two"]);
  expect((await copyAll(page)).text).toBe("one\n\n\n\ntwo");
});

test("an empty paragraph at the end of the copy adds nothing", async ({ page }) => {
  await typeLines(page, "one", ["\n", "two", "\n"]);
  const copied = await copyAll(page);
  expect(copied.text).toBe("one\n\ntwo");
  expect(copied.html).not.toMatch(/<br>/);
});

test("a copy with no gap is what it was", async ({ page }) => {
  await open(page, "one\n\ntwo\n");
  await paragraph(page).click();
  expect((await copyAll(page)).text).toBe("one\n\ntwo");
});

const GAP = /<p[^>]*><br><\/p>/g;

test("an empty paragraph at the start of the copy adds nothing", async ({ page }) => {
  await open(page, "a\n");
  await paragraph(page).click();
  await page.keyboard.press(LINE_START);
  await page.keyboard.press("Enter");
  const copied = await copyAll(page);
  expect(copied.text).toBe("a");
  expect(copied.html).not.toMatch(/<br>/);
});

test("a rule is written, so an empty paragraph beside it is a gap, on either side", async ({ page }) => {
  await open(page, "a\n\n---\n");
  await paragraph(page).click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("Enter");
  expect(await markdown(page)).toBe("a\n\n\n---\n");
  expect((await copyAll(page)).html.match(GAP)).toHaveLength(1);

  await open(page, "---\n\nb\n");
  await paragraph(page).click();
  await page.keyboard.press(LINE_START);
  await page.keyboard.press("Enter");
  expect(await markdown(page)).toBe("---\n\n\nb\n");
  expect((await copyAll(page)).html.match(GAP)).toHaveLength(1);
});

// The model writes nothing for a paragraph holding only spaces, so the file
// has a gap there, and so does the copy: the model decides, not the DOM.
test("a paragraph of spaces copies as the file writes it", async ({ page }) => {
  await typeLines(page, "a", ["\n", "   ", "\n", "b"]);
  expect(await markdown(page)).toBe("a\n\n\nb\n");
  const copied = await copyAll(page);
  expect(copied.html.match(GAP)).toHaveLength(1);
  expect(copied.text).toBe("a\n\n\nb");
});

test("an empty paragraph inside a quote is not a gap", async ({ page }) => {
  await open(page, "> q\n>\n> r\n\nafter\n");
  await page.locator("#editor blockquote p").first().click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("Enter");
  await expect(page.locator("#editor blockquote p")).toHaveCount(3);
  // Inside the quote alone, and across it from the paragraph after.
  await page.evaluate(() => {
    const quote = editor.querySelector("blockquote");
    getSelection().setBaseAndExtent(quote, 0, quote, quote.childNodes.length);
  });
  const inside = await page.evaluate(() => {
    const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return event.clipboardData.getData("text/html");
  });
  expect(inside).not.toMatch(GAP);
  expect((await copyAll(page)).html).not.toMatch(GAP);
});

test("a copy from partway into one paragraph to partway into another keeps the gap between", async ({ page }) => {
  await typeLines(page, "alpha", ["\n", "\n", "gamma"]);
  await page.evaluate(() => {
    const [first, , last] = editor.querySelectorAll(":scope > p");
    getSelection().setBaseAndExtent(first.firstChild, 2, last.firstChild, 2);
  });
  const copied = await page.evaluate(() => {
    const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return { text: event.clipboardData.getData("text/plain"), html: event.clipboardData.getData("text/html") };
  });
  expect(copied.text).toBe("pha\n\n\nga");
  expect(copied.html.match(GAP)).toHaveLength(1);
});

test("a private-use character in the text survives the copy", async ({ page }) => {
  await open(page, "x\n\ny\n");
  await paragraph(page).click();
  expect((await copyAll(page)).text).toBe("x\n\ny");
  await typeLines(page, "x", ["\n", "\n", "y"]);
  expect((await copyAll(page)).text).toBe("x\n\n\ny");
});
