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

// Since stage 5 a quote writes a gap, so a copy keeps one: inside the quote
// alone, and across it from the paragraph after. Until then this case said the
// opposite, when the file had nothing to say about a quote's gap.
test("an empty paragraph between two of a quote's is a gap", async ({ page }) => {
  await open(page, "> q\n>\n> r\n\nafter\n");
  await page.locator("#editor blockquote p").first().click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("Enter");
  await expect(page.locator("#editor blockquote p")).toHaveCount(3);
  expect(await markdown(page)).toBe("> q\n>\n>\n> r\n\nafter\n");
  await page.evaluate(() => {
    const quote = editor.querySelector("blockquote");
    getSelection().setBaseAndExtent(quote, 0, quote, quote.childNodes.length);
  });
  const inside = await page.evaluate(() => {
    const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return { text: event.clipboardData.getData("text/plain"), html: event.clipboardData.getData("text/html") };
  });
  expect(inside.html.match(GAP)).toHaveLength(1);
  expect(inside.text).toBe("q\n\n\nr");
  const all = await copyAll(page);
  expect(all.html.match(GAP)).toHaveLength(1);
  expect(all.text).toBe("q\n\n\nr\n\nafter");
});

test("an empty paragraph at the end of a quote is not a gap", async ({ page }) => {
  await open(page, "> q\n\nafter\n");
  await page.locator("#editor blockquote p").first().click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.press("Enter");
  await expect(page.locator("#editor blockquote p")).toHaveCount(2);
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

// A paste back into Mandy keeps the gaps a copy out of it marked (TODO 1.12's
// stage 5, part c), and still drops the blank paragraphs other applications
// leave. The copy is read off its event; the paste is `modelPasteInto`, the
// pipeline the editor's own paste event and Edit → Paste both reach, since
// Gecko hands a constructed paste event an empty DataTransfer of its own.
async function pasteHtml(page, html, text = "") {
  await page.evaluate(({ html, text }) => modelPasteInto(html, text), { html, text });
}

async function intoFresh(page, html, text, start = "x\n") {
  await open(page, start);
  await paragraph(page).click();
  await page.keyboard.press(LINE_END);
  await pasteHtml(page, html, text);
  return markdown(page);
}

test("a song copied out of Mandy and pasted back keeps its gaps", async ({ page }) => {
  await typeLines(page, "a", ["\n", "b", "\n", "\n", "c", "\n", "d"]);
  const copied = await copyAll(page);
  expect(copied.html).toContain("data-mandy-gap");
  expect(await intoFresh(page, copied.html, copied.text)).toBe("xa\n\nb\n\n\nc\n\nd\n");
});

// Copied from inside one quote and pasted into another: what is copied is the
// quote's paragraphs and not the quote, so they join the one they land in.
test("a quote's gap copied out of Mandy and pasted into a quote is kept", async ({ page }) => {
  await open(page, "> q\n>\n>\n> r\n");
  const copied = await page.evaluate(() => {
    const [first, , last] = editor.querySelectorAll("blockquote > p");
    getSelection().setBaseAndExtent(first.firstChild, 0, last.firstChild, 1);
    const event = new ClipboardEvent("copy", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
    editor.dispatchEvent(event);
    return { html: event.clipboardData.getData("text/html"), text: event.clipboardData.getData("text/plain") };
  });
  expect(copied.html).toContain("data-mandy-gap");
  await open(page, "> a\n>\n> b\n");
  await page.locator("#editor blockquote p").first().click();
  await page.keyboard.press(LINE_END);
  await pasteHtml(page, copied.html, copied.text);
  expect(await markdown(page)).toBe("> aq\n>\n>\n> r\n>\n> b\n");
});

// A quote pasted outside any quote is written as one (TODO 1.15). Until
// 2026-11-28 it was drawn as a quote and saved with no `>` on any line, so
// each case reads the markdown a save writes and then reopens it.
test("a quote pasted from another application is written as a quote", async ({ page }) => {
  const foreign = "<p>one</p><blockquote><p>A</p><p>B</p></blockquote><p>two</p>";
  const written = await intoFresh(page, foreign, "one\n\nA\n\nB\n\ntwo");
  expect(written).toBe("xone\n\n> A\n>\n> B\n\ntwo\n");
  await open(page, written);
  await expect(page.locator("#editor blockquote p")).toHaveCount(2);
});

test("a quote pasted into a list item stays in the item, as a quote", async ({ page }) => {
  const foreign = "<p>one</p><blockquote><p>A</p></blockquote><p>two</p>";
  await open(page, "- x\n- y\n");
  await page.locator("#editor li").first().click();
  await page.keyboard.press(LINE_END);
  await pasteHtml(page, foreign, "one\n\nA\n\ntwo");
  expect(await markdown(page)).toBe("- xone\n\n  > A\n\n  two\n- y\n");
});

test("a quote copied out of Mandy with what is around it pastes back as a quote", async ({ page }) => {
  await open(page, "before\n\n> q\n>\n>\n> r\n\nafter\n");
  await paragraph(page).click();
  const copied = await copyAll(page);
  expect(await intoFresh(page, copied.html, copied.text)).toBe("xbefore\n\n> q\n>\n>\n> r\n\nafter\n");
});

test("blank paragraphs from another application are still dropped", async ({ page }) => {
  const foreign = "<p>one</p><p><br></p><p>two</p>";
  expect(await intoFresh(page, foreign, "one\n\ntwo")).toBe("xone\n\ntwo\n");
});

test("a gap pasted into a list item is left out, as a list holds none", async ({ page }) => {
  await typeLines(page, "a", ["\n", "\n", "b"]);
  const copied = await copyAll(page);
  await open(page, "- x\n- y\n");
  await page.locator("#editor li").first().click();
  await page.keyboard.press(LINE_END);
  await pasteHtml(page, copied.html, copied.text);
  expect(await markdown(page)).toBe("- xa\n\n  b\n- y\n");
});

// HTML another source built or edited with Mandy's mark in it: nothing of the
// mark reaches the file, and a marked paragraph holding text keeps its text.
test("a marked gap at the end, in a cell, or holding text writes no mark", async ({ page }) => {
  const clean = (md) => !/[\u0000�]/.test(md);
  const atEnd = await intoFresh(page, '<p>a</p><p data-mandy-gap=""><br></p>', "a");
  expect(clean(atEnd), JSON.stringify(atEnd)).toBe(true);
  expect(atEnd).toBe("xa\n");
  const alone = await intoFresh(page, '<p data-mandy-gap=""><br></p>', "");
  expect(clean(alone), JSON.stringify(alone)).toBe(true);
  const typedInto = await intoFresh(page, '<p>a</p><p data-mandy-gap="">edited text</p><p>b</p>', "");
  expect(typedInto).toBe("xa\n\nedited text\n\nb\n");
  const cell = await page.evaluate(() =>
    htmlFragmentToMarkdown(sanitisePastedHtml('<table><tr><th>h</th></tr><tr><td><p>x</p><p data-mandy-gap=""><br></p><p>y</p></td></tr></table>')));
  expect(clean(cell), JSON.stringify(cell)).toBe(true);
});
