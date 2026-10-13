// The three engines the metafiles make claims about, driven over the running
// server. `npm run serve` first is optional: with nothing on the port this
// starts `deno task start` itself and stops it afterwards; with the dev server
// already up it uses that one. MANDY_PORT is honoured either way.
//
// Each test gets a fresh browser profile, so a run never reads or writes the
// localStorage of any browser you use — the list pages' snapshot-and-restore of
// the autosave is for hand runs and is moot here.

import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MANDY_PORT) || 9130;
export const BASE = `http://localhost:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.mjs",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: { baseURL: BASE },
  webServer: {
    command: "cd ../../server && deno task start",
    url: BASE + "/",
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
