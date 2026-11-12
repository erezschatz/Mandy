// The autosave's conversion from HTML to markdown — TODO 3.1, stage 4's slice 4.
//
// Every document stored before slice 4 is the editor's HTML under `content`,
// with the markdown it was opened from under `source`. front/legacy-storage.js
// converts each one once, at load, onto the `markdown` key. This drives that on
// real storage: each test seeds a fresh profile with keys in one of the shapes
// a browser can hold, loads the app, and compares what it opens — and what it
// stored — with the markdown expected.
//
// The stored HTML is tests/fixtures/storage/, captured on 2026-11-12 from the
// running app under `?core=legacy` (what `main`'s autosave holds) and
// `?core=model`, before the old core was removed. Each fixture carries its
// `source` key and the markdown the old core's save wrote for that HTML, which
// is the expected answer: an oracle the converter did not produce. For a
// document nobody edited the expected answer is its source, byte for byte
// (decision 2), and the fixture says so independently. The Mermaid wrapper is
// written by hand, since nothing can draw one now.

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cancelledFont } from "./model-page.mjs";

const fixture = (name) =>
  JSON.parse(readFileSync(resolve(`../fixtures/storage/${name}.json`), "utf8"));

const LEGACY_CLEAN = fixture("legacy-notes-clean");
const LEGACY_EDITED = fixture("legacy-notes-edited");
const MODEL_CLEAN = fixture("model-notes-clean");
const MODEL_EDITED = fixture("model-notes-edited");
const LEGACY_PLAN = fixture("legacy-plan-edited");
const MODEL_PLAN = fixture("model-plan-edited");
const MERMAID = fixture("legacy-mermaid");

const flat = (f) => ({ markdownContent: f.html, markdownSource: f.source });
const tab = (id, f) => ({ [`mandy-tab-${id}-content`]: f.html, [`mandy-tab-${id}-source`]: f.source });
const list = (order, active) => ({ "mandy-tabs": JSON.stringify({ order, active, seq: Math.max(...order) }) });

// Seed the origin's storage from a page that runs none of the app, then load
// the app into it, so the conversion meets the keys exactly as a browser that
// last ran the old code would have left them.
async function boot(page, seed) {
  const problems = [];
  page.on("console", (msg) => {
    if (cancelledFont(msg.text())) return;
    if (msg.type() === "error" || /render diverged/.test(msg.text())) problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  await page.goto("/manifest.json");
  await page.evaluate((seed) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
  }, seed);
  await page.goto("/");
  await page.waitForFunction(() =>
    typeof currentModelMarkdown === "function" && modelCurrentDocument() !== null);
  await page.waitForLoadState("networkidle");
  return problems;
}

const opened = (page) => page.evaluate(() => currentModelMarkdown());
const stored = (page) => page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) out[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
  return out;
});
const oldKeys = (keys) => Object.keys(keys).filter((k) =>
  k === "markdownContent" || k === "markdownSource" || /^mandy-tab-\d+-(content|source)$/.test(k));

for (const [label, f] of [
  ["the old core's autosave", LEGACY_EDITED],
  ["the model core's autosave", MODEL_EDITED],
]) {
  test(`one document under the flat names, edited, from ${label}`, async ({ page }) => {
    const problems = await boot(page, { ...flat(f), "mandy-current-file": "/home/x/notes.md", "mandy-dirty": "1" });
    expect(await opened(page), "it opens as the old core's save would have written it").toBe(f.expected);
    const keys = await stored(page);
    expect(keys["mandy-tab-1-markdown"], "stored as markdown, on the tab the migration made").toBe(f.expected);
    expect(oldKeys(keys), "no HTML is left").toEqual([]);
    expect(keys["mandy-storage-version"]).toBe("2");
    expect(keys["mandy-tab-1-path"], "its file came with it").toBe("/home/x/notes.md");
    expect(await page.evaluate(() => documentIsDirty()), "and it is still edited").toBe(true);
    expect(problems).toEqual([]);
  });
}

for (const [label, f] of [
  ["the old core's autosave", LEGACY_CLEAN],
  ["the model core's autosave", MODEL_CLEAN],
]) {
  test(`a document nobody edited is its source, byte for byte, from ${label}`, async ({ page }) => {
    expect(f.expected, "the fixture's own answer is the source").toBe(f.source);
    const problems = await boot(page, { ...list([1], 1), ...tab(1, f) });
    expect(await opened(page)).toBe(f.source);
    expect((await stored(page))["mandy-tab-1-markdown"]).toBe(f.source);
    expect(problems).toEqual([]);
  });
}

test("several tabs, two never shown, one holding a Mermaid diagram", async ({ page }) => {
  const problems = await boot(page, {
    ...list([1, 2, 4], 1),
    ...tab(1, LEGACY_CLEAN),
    ...tab(2, MODEL_PLAN),
    ...tab(4, MERMAID),
    "mandy-tab-2-path": "/home/x/plan.md",
  });
  const keys = await stored(page);
  expect(oldKeys(keys), "every tab was converted at load, shown or not").toEqual([]);
  expect(keys["mandy-tab-2-markdown"]).toBe(MODEL_PLAN.expected);
  expect(keys["mandy-tab-4-markdown"]).toBe(MERMAID.expected);

  expect(await opened(page), "the active tab").toBe(LEGACY_CLEAN.source);
  expect(await page.evaluate(() => switchToTab(2))).toBe(true);
  expect(await opened(page), "a tab never shown, from its stored markdown").toBe(MODEL_PLAN.expected);
  expect(await page.evaluate(() => switchToTab(4))).toBe(true);
  expect(await opened(page), "the diagram is its fence again").toBe(MERMAID.expected);
  expect(MERMAID.expected).toContain("```mermaid\ngraph TD\n  A-->B\n```");
  expect(await page.evaluate(() => editor.querySelector(".mermaid-wrapper")), "and nothing of the wrapper is left").toBe(null);
  expect(problems).toEqual([]);
});

test("a tab migration that failed halfway, leaving copies beside the flat keys", async ({ page }) => {
  // tabs.js rolls back the copies it made when a write fails, and a session
  // whose rollback did not finish is left with both. No list, so the next load
  // migrates the flat document again over the half-made tab.
  const problems = await boot(page, { ...flat(LEGACY_PLAN), ...tab(1, LEGACY_PLAN) });
  expect(await opened(page)).toBe(LEGACY_PLAN.expected);
  const keys = await stored(page);
  expect(oldKeys(keys)).toEqual([]);
  expect(keys["mandy-tab-1-markdown"]).toBe(LEGACY_PLAN.expected);
  expect(keys["mandy-tabs"]).toBe(JSON.stringify({ order: [1], active: 1, seq: 1 }));
  expect(problems).toEqual([]);
});

test("a blank tab converts to nothing, and opens blank", async ({ page }) => {
  // In the background, because a blank document on screen at boot opens the
  // welcome document, as it always has.
  const problems = await boot(page, {
    ...list([1, 2], 1),
    ...tab(1, LEGACY_CLEAN),
    "mandy-tab-2-content": "<p><br></p>",
  });
  const keys = await stored(page);
  expect(keys["mandy-tab-2-markdown"], "no key").toBeUndefined();
  expect(oldKeys(keys)).toEqual([]);
  expect(await page.evaluate(() => switchToTab(2))).toBe(true);
  expect(await opened(page)).toBe("");
  expect(problems).toEqual([]);
});

test("the conversion runs once, and an edit after it autosaves markdown", async ({ page }) => {
  const problems = await boot(page, { ...list([1], 1), ...tab(1, LEGACY_EDITED) });
  // Typed after the heading, then flushed the way a tab switch or the debounce
  // would flush it.
  await page.evaluate(() => {
    const h1 = editor.querySelector("h1");
    const text = h1.firstChild;
    editor.focus();
    const range = document.createRange();
    range.setStart(text, text.length);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.keyboard.type("!");
  await page.evaluate(() => flushAutosave());
  const after = (await stored(page))["mandy-tab-1-markdown"];
  expect(after, "the autosave is the markdown a save would write").toBe(LEGACY_EDITED.expected.replace("# Field notes", "# Field notes!"));

  // And a reload reads it back as markdown, without converting anything again.
  await page.reload();
  await page.waitForFunction(() => typeof currentModelMarkdown === "function" && modelCurrentDocument() !== null);
  await page.waitForLoadState("networkidle");
  expect(await opened(page)).toBe(after);
  expect(problems).toEqual([]);
});
