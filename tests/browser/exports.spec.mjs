// The exports, read from the model — TODO 3.1, stage 4's slice 2.
//
// Two properties, both of which only a real DOM can show. **No view attribute
// reaches a file**: the static export, PDF and Word all start from
// `modelExportClone`, so a block id, a filler `<br>`, a caret stop beside an
// equation and the wrapper's `contenteditable="false"` stay in the editor. And
// **the editable export carries markdown**: its editor ships empty, the
// document sits escaped in `#app-document`, and the file opens to the same
// document and re-exports itself unchanged.
//
// PDF and Word are checked at the hand-over rather than in the file they make:
// the PDF library is replaced by a recorder, so no CDN is needed and nothing
// is rasterised, and Word's converter is wrapped to record the root it was
// given. What the two files look like opened is the Firefox hand run's.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { useModelPage, open } from "./model-page.mjs";

// The exported copy is served from the app's own origin by a route, which a
// service worker would answer first.
test.use({ serviceWorkers: "block" });
useModelPage(test);

// Each test loads the app at least once and the last loads the exported copy
// twice more, each a fresh fetch of markdown-it, Turndown and MathJax from the
// CDN. The config's 30s was overrun on a slow CDN day with nothing wrong.
test.setTimeout(120_000);

// An equation at each edge of a line, which is where the stops go; a display
// equation on a line of its own; a code span
// saying the two things that end a script element early; and a list.
const DOCUMENT = [
  "# Exported",
  "",
  "$x$ starts this line and one ends it $y$",
  "",
  "$$\\frac{a}{b}$$",
  "",
  "Say `</script>` and `<!-- x -->` & `&lt;` here.",
  "",
  "- one",
  "- two",
  "",
].join("\n");

// Open it, then Enter at the end of the heading, so there is an empty block
// and its filler <br> in the editor as well.
async function prepare(page) {
  await open(page, DOCUMENT);
  await page.evaluate(() => {
    const heading = editor.querySelector("h1");
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(heading);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.keyboard.press("Enter");

  // The control: every kind of view attribute is really in the editor, so the
  // checks below cannot pass by there having been nothing to strip.
  const view = await page.evaluate(() => ({
    block: !!editor.querySelector("[data-block]"),
    emptyFiller: !!editor.querySelector("p > br[data-filler]:only-child"),
    stop: !!editor.querySelector("span[data-filler]"),
    wrapper: !!editor.querySelector('[data-math][contenteditable="false"]'),
  }));
  expect(view, "the editor carries the model's view").toEqual({
    block: true, emptyFiller: true, stop: true, wrapper: true,
  });
}

function expectNoView(html, what) {
  expect(html, `${what}: a block id`).not.toContain("data-block");
  expect(html, `${what}: a filler`).not.toContain("data-filler");
  expect(html, `${what}: contenteditable`).not.toContain("contenteditable");
  expect(html, `${what}: a caret stop's character`).not.toContain("​");
}

async function download(page, action) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate((action) => { runToolbarAction(action); }, action),
  ]);
  return readFileSync(await file.path(), "utf8");
}

const embedded = (html) => {
  const m = html.match(/<script type="text\/markdown" id="app-document">([\s\S]*?)<\/script>/);
  return m && m[1].replace(/&(amp|lt);/g, (_, n) => (n === "amp" ? "&" : "<"));
};
const bundle = (html) => html.match(/<script id="app-script">\n([\s\S]*?)\n {4}<\/script>/)?.[1];
const editorDiv = (html) => html.match(/<div id="editor"[^>]*>([\s\S]*?)<\/div>\n {4}<\/div>/)?.[1];

test("the static export carries none of the model's view", async ({ page }) => {
  await prepare(page);
  const html = await download(page, "export-html");
  // From the editor on: app.css, inlined above it, names contenteditable in
  // its own selectors.
  const body = html.slice(html.indexOf('<div id="editor">'));
  expect(body).toContain("<h1");
  expect(body).toContain("data-math");
  expectNoView(body, "static export");
});

test("PDF and Word are handed the stripped clone", async ({ page }) => {
  await prepare(page);

  const pdf = await page.evaluate(async () => {
    let captured = null;
    window.html2pdf = () => {
      const chain = {
        set: () => chain,
        from: (el) => { captured = el.innerHTML; return chain; },
        save: async () => {},
      };
      return chain;
    };
    await generatePDF();
    return captured;
  });
  expect(pdf).toContain("data-math");
  expectNoView(pdf, "PDF");
  expectEquationPictures(pdf, "PDF");

  const word = await page.evaluate(async () => {
    await ensureDocx();
    window.saveAs = () => {};
    const convert = convertHtmlToDocxElements;
    const run = equationRun;
    let captured = null;
    const runs = [];
    window.convertHtmlToDocxElements = (root) => { captured = root.innerHTML; return convert(root); };
    window.equationRun = (img) => {
      const made = run(img);
      runs.push(made.properties.root.some((child) => child.rootKey === "w:position"));
      return made;
    };
    try {
      await generateDOCX();
    } finally {
      window.convertHtmlToDocxElements = convert;
      window.equationRun = run;
    }
    return { html: captured, runs };
  });
  expect(word.html).toContain("data-math");
  expectNoView(word.html, "Word");
  expectEquationPictures(word.html, "Word");
  // One image run per equation, and the one with a descender (y) is lowered.
  expect(word.runs.length, "Word: an image run per equation").toBe(3);
  expect(word.runs.some(Boolean), "Word: a picture lowered onto the baseline").toBe(true);
});

// Both equations as pictures, and nothing of MathJax's own markup left: its
// hidden assistive copy is what was drawn a second time in the PDF and written
// as bare letters in Word.
function expectEquationPictures(html, what) {
  expect(html, `${what}: no MathJax markup`).not.toContain("mjx-");
  expect(html.match(/<img[^>]*data-equation="inline"/g)?.length, `${what}: a picture per equation`).toBe(2);
  expect(html.match(/<img[^>]*data-equation="block"/g)?.length, `${what}: the display one too`).toBe(1);
  expect(html, `${what}: the TeX as alt text`).toContain('alt="$y$"');
}

test("the editable export carries markdown, and opens and re-exports", async ({ page }) => {
  await prepare(page);
  const markdown = await page.evaluate(() => currentModelMarkdown());
  const first = await download(page, "export-editable");

  expect(embedded(first), "the embedded markdown is the document").toBe(markdown);
  expect(editorDiv(first)?.trim(), "the editor ships empty").toBe("");
  expect(bundle(first), "the bundle is inlined").toBeTruthy();

  // Served from the app's origin, which is the same storage and the same CDN
  // access a downloaded file opened from disk would have.
  await page.route("**/exported-copy.html*", (route) =>
    route.fulfill({ body: first, contentType: "text/html" }));

  await page.goto("/exported-copy.html");
  await page.waitForFunction(() =>
    typeof modelCurrentDocument === "function" && modelCurrentDocument() !== null);
  expect(await page.evaluate(() => !!toolbarButton("download-md")), "the export's toolbar").toBe(true);
  expect(await page.evaluate(() => currentModelMarkdown()), "it opens to the same document").toBe(markdown);

  // A re-export from inside the exported document: the same markdown, and the
  // same bundle byte for byte, which is the self-reproduce suite's fixpoint in
  // a real browser.
  const second = await download(page, "export-editable");
  expect(embedded(second)).toBe(markdown);
  expect(bundle(second) === bundle(first), "the bundle reproduces itself").toBe(true);
});
