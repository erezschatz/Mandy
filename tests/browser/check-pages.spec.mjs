// The self-running check pages, one test each per engine. A page runs its own
// cases, sets document.title to `check: N problems`, and POSTs its report to
// /report; this waits for that POST and judges the report it carries rather
// than scraping the page, so the thing asserted is the same JSON a hand run
// prints to the server log. A page that could not run — the app never booted
// in its frame, a script did not load — sets a different title and POSTs
// nothing, and fails here for that reason rather than passing on zero problems.
//
// The report is attached to the test result either way, so a failing engine's
// raw markup is in the output and not only on a screen somebody had open.

import { test, expect } from "@playwright/test";

const PAGES = ["browser-check", "list-indent-check", "list-empty-item-check"];

for (const name of PAGES) {
  test(name, async ({ page }, testInfo) => {
    // The two list pages boot the whole app in a frame, and the app pulls
    // markdown-it and Turndown from a CDN. The page's own "has the app come
    // up" wait polls for functions that exist before those scripts are needed,
    // so with the CDN unreachable it runs anyway and every case reads as the
    // handler never firing. That is not a measurement, so a run with any failed
    // resource is reported as such and never judged on its problem count.
    const failed = [];
    page.on("requestfailed", (req) => {
      // The report POST itself is a fire-and-forget sink; the test closing the
      // page before its 204 arrives is not a missing resource.
      if (new URL(req.url()).pathname === "/report") return;
      failed.push({ text: `${req.failure()?.errorText ?? "failed"} ${req.url()}`, frame: req.frame() });
    });
    // A list page removes its app frame once the report is written, so a
    // debounced autosave cannot land after it restores the tester's keys — and
    // that cancels whatever the app still had in flight, including the
    // /api/home its own visibilitychange wake fires on the way out. Those are
    // the page's teardown, not a resource that failed to load: an abort from a
    // frame that has since been detached. Checked here rather than in the
    // listener because the detach can be reported after the abort. A CDN that
    // cannot be reached fails with its own error, never an abort, so it still
    // trips this.
    const missing = () => failed
      .filter(({ text, frame }) => !(/^(net::ERR_ABORTED|cancelled) /.test(text) && frame.isDetached()))
      .map(({ text }) => text);

    const posted = page.waitForRequest(
      (req) => req.method() === "POST" && new URL(req.url()).pathname === "/report",
      { timeout: 25_000 },
    ).then((req) => JSON.parse(req.postData() ?? "null"), () => null);

    await page.goto(`/tests/${name}.html`);
    await page.waitForFunction(() => document.title.startsWith("check: "), null, { timeout: 25_000 });
    const title = await page.title();

    const report = await posted;
    if (report) {
      await testInfo.attach(`${name}.report.json`, {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
    }

    // "could not run" / "execcommand.js did not load": the page is telling us
    // the measurement never happened. That is a failure of the run, not a pass.
    const lost = missing();
    expect(lost, "resources failed to load, so the page measured nothing:\n" + lost.join("\n")).toEqual([]);
    expect(title, `page title: ${title}`).toMatch(/^check: \d+ problems$/);
    expect(report, "no report was POSTed to /report").not.toBeNull();

    const bad = (report.results ?? []).filter(
      (r) => r.verdict !== "ok" && r.verdict !== "—",
    );
    expect(
      report.problems,
      `${report.agent}\n${JSON.stringify(bad, null, 2)}`,
    ).toBe(0);
  });
}
