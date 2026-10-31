// Insert → Image… under the model core — TODO 3.1's stage 3, slice 2, TODO
// 1.1.7 — through the Insert menu and its three-field dialog. Stands in for the
// hand run of format-check.md's image section in Chromium and WebKit, judged by
// what the page shows and the markdown the model holds.
//
// The image is one the server already has, because a spec fails on any console
// error and a missing file is one.

import { test, expect } from "@playwright/test";
import { useModelPage, open, markdown, paragraph, LINE_END } from "./model-page.mjs";

useModelPage(test);

const PICTURE = "/favicon-32x32.png";

async function insertMenu(page) {
  await page.locator('[data-menu="insertMenu"]').click();
  await page.locator('[data-action="insert-image"]').click();
}

const dialog = (page) => page.locator(".notify-backdrop");
const field = (page, label) => dialog(page).getByLabel(label);

test("an image goes in at the caret from the Insert menu", async ({ page }) => {
  await open(page, "Before after\n");
  await paragraph(page, 0).click();
  await page.keyboard.press(LINE_END);
  await insertMenu(page);
  await expect(dialog(page).locator(".notify-dialog-title")).toHaveText("Insert image");
  await field(page, "Image address").fill(PICTURE);
  await field(page, "Description").fill("The icon");
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("#editor img")).toHaveAttribute("src", PICTURE);
  await expect(page.locator("#editor img")).toHaveAttribute("alt", "The icon");
  expect(await markdown(page)).toBe(`Before after![The icon](${PICTURE})\n`);
});

// A markdown image is inline, so it sits on the line of the text beside it,
// and so does the caret either side of it. Drawn as a block, it took a line of
// its own and the caret beside it drew on the line above or below.
test("an image shares the line of the text beside it", async ({ page }) => {
  await open(page, `Before ![The icon](${PICTURE}) after\n`);
  await expect(page.locator("#editor img")).toHaveJSProperty("complete", true);
  const [image, text] = await page.evaluate(() => {
    const img = editor.querySelector("img");
    const range = document.createRange();
    range.selectNodeContents(img.previousSibling);
    const box = (r) => ({ top: r.top, bottom: r.bottom });
    return [box(img.getBoundingClientRect()), box(range.getBoundingClientRect())];
  });
  expect(image.top, "the image starts above the text's line ends").toBeLessThan(text.bottom);
  expect(image.bottom, "the image ends below the text's line starts").toBeGreaterThan(text.top);
});

test("an image already there is edited through the same dialog, filled in", async ({ page }) => {
  await open(page, `A ![Old](${PICTURE} "Hover") b\n`);
  await page.locator("#editor img").click();
  await insertMenu(page);
  await expect(dialog(page).locator(".notify-dialog-title")).toHaveText("Edit image");
  await expect(field(page, "Image address")).toHaveValue(PICTURE);
  await expect(field(page, "Description")).toHaveValue("Old");
  await expect(field(page, "Title (optional)")).toHaveValue("Hover");
  await field(page, "Description").fill("New");
  await dialog(page).getByRole("button", { name: "Update" }).click();
  await expect(page.locator("#editor img")).toHaveAttribute("alt", "New");
  expect(await markdown(page)).toBe(`A ![New](${PICTURE} "Hover") b\n`);
});

test("backing out of the dialog changes nothing", async ({ page }) => {
  await open(page, "Plain\n");
  await paragraph(page, 0).click();
  await insertMenu(page);
  await field(page, "Image address").fill(PICTURE);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("#editor img")).toHaveCount(0);
  expect(await markdown(page)).toBe("Plain\n");
});

test("an image with no address is refused, and says so", async ({ page }) => {
  await open(page, "Plain\n");
  await paragraph(page, 0).click();
  await insertMenu(page);
  await field(page, "Description").fill("Nothing");
  await page.keyboard.press("Enter");
  await expect(page.getByText("An image needs an address.")).toBeVisible();
  expect(await markdown(page)).toBe("Plain\n");
});

// The parser will not make an image of a javascript: address, and an edit
// says so just as an insert does, rather than closing on nothing.
test("an edit to an address the parser refuses says so, and changes nothing", async ({ page }) => {
  const source = `A ![Old](${PICTURE}) b\n`;
  await open(page, source);
  await page.locator("#editor img").click();
  await insertMenu(page);
  await field(page, "Image address").fill("javascript:alert(1)");
  await page.keyboard.press("Enter");
  await expect(page.getByText("That address cannot be used for an image.")).toBeVisible();
  expect(await markdown(page)).toBe(source);
});

test("one undo takes an image back", async ({ page }) => {
  await open(page, "Plain\n");
  await paragraph(page, 0).click();
  await page.keyboard.press(LINE_END);
  await insertMenu(page);
  await field(page, "Image address").fill(PICTURE);
  await page.keyboard.press("Enter");
  expect(await markdown(page)).toBe(`Plain![](${PICTURE})\n`);
  await page.keyboard.press("ControlOrMeta+z");
  expect(await markdown(page)).toBe("Plain\n");
});

// D4's amendment: no new format is written against contenteditable, so the
// old core answers the item with a message and changes nothing.
test("the old core says where Insert → Image works, and changes nothing", async ({ page }) => {
  await page.goto("/?core=legacy");
  await page.waitForFunction(() => typeof modelCoreEnabled === "function" && !modelCoreEnabled());
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => { loadDocumentMarkdown("One\n"); undoReset(); });
  await paragraph(page, 0).click();
  const before = await page.evaluate(() => editor.innerHTML);
  await insertMenu(page);
  await expect(page.getByText("Inserting an image needs the new editing core")).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(() => editor.innerHTML)).toBe(before);
});
