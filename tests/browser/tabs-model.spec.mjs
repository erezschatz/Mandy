// A tab parks its model under the model core — TODO 3.1's stage 4, slice 3.
// The Deno suite proves which path a switch takes, against a stand-in; these
// run the real model in the running app, and judge what the page shows, the
// markdown the model holds, and how many times a document was parsed.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, LINE_END } from "./model-page.mjs";

useModelPage(test);

// Counts every parse from here on. A tab coming back must add none: its model
// is handed back as it stands, and a parse here would mean the document had
// been rebuilt from its stored HTML, which is what the switch used to do.
async function countParses(page) {
  await page.evaluate(() => {
    window.__parses = 0;
    const parse = modelParse;
    modelParse = (...args) => {
      window.__parses += 1;
      return parse(...args);
    };
  });
}

const parses = (page) => page.evaluate(() => window.__parses);

// A click on the tab in the bar, which is what the person does.
const switchTo = (page, id) => page.locator(`#tabBar [data-tab="${id}"]`).click();

test("a tab coming back is rendered from its model, with no parse", async ({ page }) => {
  await open(page, "Alpha\n\nBravo\n");
  await page.evaluate(() => newTab());
  await open(page, "Charlie\n");
  await countParses(page);

  await switchTo(page, 1);
  expect(await parses(page), "returning to tab 1 parses nothing").toBe(0);
  expect(await markdown(page)).toBe("Alpha\n\nBravo\n");

  await switchTo(page, 2);
  expect(await parses(page), "returning to tab 2 parses nothing").toBe(0);
  expect(await markdown(page)).toBe("Charlie\n");
});

test("undo reaches the tab's own history after a switch away and back", async ({ page }) => {
  await open(page, "Alpha\n");
  await page.locator("#editor p").first().click();
  await page.keyboard.press(LINE_END);
  await page.keyboard.type("X");
  expect(await markdown(page)).toBe("AlphaX\n");

  await page.evaluate(() => newTab());
  await open(page, "Charlie\n");
  await switchTo(page, 1);

  await page.locator("#editor p").first().click();
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page), "the typed letter is undone, and only that").toBe("Alpha\n");
});
