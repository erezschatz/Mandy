// Open, edit, save — TODO 6.8's second item, and stage 4's slice 1 gate.
//
// The `break-test.md` recipe CLAUDE.md gives for a hand run, driven: open the
// fixture through the file API, type into its four labelled paragraphs, save
// to a scratch file outside the repo, and read what landed on disk. The save
// is `saveFile` handed a path, which is what Save As calls once its dialog has
// one; the dialog itself is not driven. **The
// fixture is never saved over** — it is the pristine copy every run is measured
// against — and the scratch is deleted afterwards.
//
// Until stage 4's slice 4 this ran under both cores and compared the two files,
// with every line where they disagreed named in advance: that was the gate the
// old core's removal had to pass, and it passed with one entry, CHARLIE's
// backslash break, which the old core rewrote and the model keeps. With the old
// core gone, the model's file is checked against the fixture alone, and that
// entry is one of the expectations below.

import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const FIXTURE = resolve("../fixtures/break-test.md");
const LABELS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA"];

let scratch;
test.beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "mandy-save-")); });
test.afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

async function openEditSave(page, name) {
  const problems = [];
  page.on("pageerror", (err) => problems.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") problems.push(msg.text()); });

  await page.goto("/");
  await page.waitForFunction(() => typeof openFile === "function" && typeof saveFile === "function");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => editor.children.length > 0);

  expect(await page.evaluate((path) => openFile(path), FIXTURE)).not.toBe(false);
  await page.waitForFunction(() => editor.textContent.includes("ECHO"));

  // A letter typed straight after each label: a trusted keystroke, so each
  // core handles it the way it handles a person typing, and the edit marks
  // exactly that paragraph as changed.
  for (const label of LABELS) {
    await page.evaluate((label) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.data.indexOf(label);
        if (at === -1) continue;
        editor.focus();
        const range = document.createRange();
        range.setStart(node, at + label.length);
        range.collapse(true);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        return;
      }
      throw new Error(`no ${label} in the document`);
    }, label);
    await page.keyboard.type("-x");
  }

  const path = join(scratch, `${name}.md`);
  expect(await page.evaluate((path) => saveFile(path), path), "the save reports success").toBe(true);
  expect(problems, "console errors").toEqual([]);
  return readFileSync(path, "utf8");
}

// The fixture's bytes before the first labelled paragraph and from ECHO on,
// which nothing typed into and the save has to hand back untouched.
function untouched(text) {
  return { head: text.slice(0, text.indexOf("ALPHA")), tail: text.slice(text.indexOf("ECHO")) };
}

test("open, edit and save", async ({ browser, browserName }) => {
  const fixture = readFileSync(FIXTURE, "utf8");
  const page = await browser.newPage();
  const model = await openEditSave(page, browserName);
  await page.close();

  // Against the fixture: every case the recipe names.
  expect(untouched(model), "the model leaves everything outside the edits byte-identical").toEqual(untouched(fixture));
  for (const label of LABELS) expect(model, `${label} was typed into`).toContain(`${label}-x`);
  expect(model, "ALPHA keeps its two-space break").toMatch(/put the break back {2}\nand this is the line that follows ALPHA/);
  expect(model, "BRAVO keeps its two-space break").toMatch(/always worked {2}\nbecause/);
  expect(model, "CHARLIE keeps its backslash break").toMatch(/must keep doing so\\\nand this is the line that follows CHARLIE/);
  const delta = model.slice(model.indexOf("DELTA-x"), model.indexOf("ECHO")).trimEnd().split("\n");
  expect(delta.length, "DELTA was re-wrapped").toBeGreaterThan(1);
  const width = Math.max(...fixture.slice(0, fixture.indexOf("ALPHA")).split("\n").map((l) => l.length));
  for (const line of delta) expect(line.length, `"${line}" fits the file's width`).toBeLessThanOrEqual(width);
});
