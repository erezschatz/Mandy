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
// Run under both cores, and the two files compared. **Parity does not mean the
// same bytes**: the model core is meant to be better. It means that every line
// where the two disagree is one this file names in advance, with the old-core
// bug that makes it differ. A difference nobody wrote down fails the run.

import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const FIXTURE = resolve("../fixtures/break-test.md");
const LABELS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA"];

let scratch;
test.beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "mandy-save-")); });
test.afterAll(() => { rmSync(scratch, { recursive: true, force: true }); });

async function openEditSave(page, core, name) {
  const problems = [];
  page.on("pageerror", (err) => problems.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") problems.push(msg.text()); });

  await page.goto(`/?core=${core}`);
  await page.waitForFunction(() => typeof openFile === "function" && typeof saveFile === "function");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => editor.children.length > 0);
  expect(await page.evaluate(() => modelCoreEnabled())).toBe(core === "model");

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

// Where the two cores are allowed to write different bytes, and why. Each entry
// is one line, as the old core writes it and as the model writes it; the line
// count has to agree, and any other line that differs fails the run.
const KNOWN_DIFFERENCES = [
  {
    // TODO 2.3's residue, which only the model can fix: Turndown has one
    // hard-break setting for the whole file, so an *edited* paragraph whose
    // break is spelt the minority way comes back in the majority spelling. The
    // model records the spelling per node and keeps the backslash.
    legacy: "must keep doing so  ",
    model: "must keep doing so\\",
    why: "CHARLIE's backslash break, rewritten by the old core (TODO 2.3)",
  },
];

// The fixture's bytes before the first labelled paragraph and from ECHO on,
// which nothing typed into and both cores have to hand back untouched.
function untouched(text) {
  return { head: text.slice(0, text.indexOf("ALPHA")), tail: text.slice(text.indexOf("ECHO")) };
}

test("open, edit and save, under both cores", async ({ browser, browserName }) => {
  const fixture = readFileSync(FIXTURE, "utf8");
  const legacyPage = await browser.newPage();
  const legacy = await openEditSave(legacyPage, "legacy", `${browserName}-legacy`);
  await legacyPage.close();
  const modelPage = await browser.newPage();
  const model = await openEditSave(modelPage, "model", `${browserName}-model`);
  await modelPage.close();

  // The model core alone, against the fixture: every case the recipe names.
  expect(untouched(model), "the model leaves everything outside the edits byte-identical").toEqual(untouched(fixture));
  for (const label of LABELS) expect(model, `${label} was typed into`).toContain(`${label}-x`);
  expect(model, "ALPHA keeps its two-space break").toMatch(/put the break back {2}\nand this is the line that follows ALPHA/);
  expect(model, "BRAVO keeps its two-space break").toMatch(/always worked {2}\nbecause/);
  expect(model, "CHARLIE keeps its backslash break").toMatch(/must keep doing so\\\nand this is the line that follows CHARLIE/);
  const delta = model.slice(model.indexOf("DELTA-x"), model.indexOf("ECHO")).trimEnd().split("\n");
  expect(delta.length, "DELTA was re-wrapped").toBeGreaterThan(1);
  const width = Math.max(...fixture.slice(0, fixture.indexOf("ALPHA")).split("\n").map((l) => l.length));
  for (const line of delta) expect(line.length, `"${line}" fits the file's width`).toBeLessThanOrEqual(width);

  // Parity: the two cores line by line, every disagreement accounted for.
  const a = legacy.split("\n");
  const b = model.split("\n");
  expect(b.length, "both cores write the same number of lines").toBe(a.length);
  const unexplained = [];
  const seen = new Set();
  a.forEach((line, i) => {
    if (line === b[i]) return;
    const known = KNOWN_DIFFERENCES.find((d) => d.legacy === line && d.model === b[i]);
    if (known) seen.add(known);
    else unexplained.push(`line ${i + 1}: legacy ${JSON.stringify(line)} / model ${JSON.stringify(b[i])}`);
  });
  expect(unexplained, "differences nobody wrote down").toEqual([]);
  // A known difference that stopped happening is news too: either the old core
  // changed, or the edit no longer reaches the case it was written for.
  expect([...seen].map((d) => d.why), "every known difference still shows").toEqual(KNOWN_DIFFERENCES.map((d) => d.why));
});
