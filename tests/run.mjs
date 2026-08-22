// Runs every suite. No framework, no dependencies: `deno run --allow-read
// tests/run.mjs`, or `npm test`. Exits non-zero if anything fails.

const SUITES = [
  ["toolbar", "./toolbar.test.mjs"],
  ["format-bar", "./format-bar.test.mjs"],
  ["static-export", "./static-export.test.mjs"],
  ["self-reproduce", "./self-reproduce.test.mjs"],
  ["file-path", "./file-path.test.mjs"],
  ["latex", "./latex.test.mjs"],
  ["save-fidelity", "./save-fidelity.test.mjs"],
  ["links", "./links.test.mjs"],
  ["list-indent", "./list-indent.test.mjs"],
  ["outline", "./outline.test.mjs"],
  ["notify", "./notify.test.mjs"],
  ["undo", "./undo.test.mjs"],
];

let passed = 0;
const failures = [];

for (const [name, path] of SUITES) {
  const { default: run } = await import(path);
  const results = [];
  const check = (label, ok) => results.push({ label, ok });

  try {
    await run(check);
  } catch (error) {
    results.push({ label: `threw: ${error.message}`, ok: false });
  }

  const bad = results.filter((r) => !r.ok);
  passed += results.length - bad.length;
  for (const f of bad) failures.push(`${name}: ${f.label}`);

  const status = bad.length ? `${bad.length} FAILED` : "ok";
  console.log(`${name.padEnd(16)} ${String(results.length).padStart(3)} checks  ${status}`);
}

if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  ${f}`);
  console.log(`\n${passed} passed, ${failures.length} failed`);
  // Runs under Deno (the project's toolchain) or Node, since nothing here
  // depends on either beyond node:fs.
  (globalThis.Deno?.exit ?? globalThis.process?.exit)?.(1);
}

console.log(`\n${passed} checks passed`);
