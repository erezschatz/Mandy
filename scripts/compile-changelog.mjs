#!/usr/bin/env node
// Copyright (c) 2026 Erez Schatz, https://github.com/erezschatz/unities. SPDX-License-Identifier: MIT
// compile-changelog <version> [--since <ref>] [--dry-run]
// The only writer CHANGELOG.md has. Reads "## What was done" sections added to tasks/
// since the last release and prepends them under a version heading.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry-run");
const sinceIdx = argv.indexOf("--since");
const version = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--since");
if (!version && !dry) { console.error("usage: compile-changelog <version> [--since <ref>] [--dry-run]"); process.exit(1); }

const sh = c => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
// A Windows checkout commits and hands back CRLF line endings, and some editors put a
// byte-order mark first; neither is content.
const lf = text => text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const since = sinceIdx >= 0 ? argv[sinceIdx + 1]
  : (sh("git describe --tags --abbrev=0 2>/dev/null || true") || sh("git rev-list --max-parents=0 HEAD"));

const raw = sh(`git log --no-merges --reverse --format=%x1e%h%x1f%as -p ${since}..HEAD -- tasks/`);
const entries = [];                       // { file, hash, date, lines[] }

for (const chunk of raw.split("\x1e").filter(Boolean)) {
  const [head, ...rest] = chunk.split("\n");
  const [hash, date] = head.split("\x1f");
  let file = null, inSection = false, current = null;
  for (const line of rest) {
    if (line.startsWith("+++ b/")) { file = line.slice(6); inSection = false; current = null; continue; }
    if (!file || !file.startsWith("tasks/") || file.startsWith("tasks/_")) continue;
    if (!line.startsWith("+") || line.startsWith("+++")) { if (line.startsWith("@@")) { inSection = false; current = null; } continue; }
    const text = line.slice(1).replace(/^\uFEFF/, "").replace(/\r$/, "");
    if (/^## What was done/.test(text)) { inSection = true; current = { file, hash, date, lines: [] }; entries.push(current); continue; }
    if (/^## /.test(text)) { inSection = false; current = null; continue; }
    if (inSection && current) current.lines.push(text);
  }
}

// Task files get renamed (e.g. when a work item id is assigned). Records written
// under an earlier name must land under the file's current name.
const renamed = new Map();
for (const line of sh(`git log --reverse --format= --name-status -M --diff-filter=R ${since}..HEAD -- tasks/`).split("\n")) {
  const [, from, to] = line.split("\t");
  if (from && to) renamed.set(from, to);
}
const current = f => {
  const seen = new Set();
  while (renamed.has(f) && !seen.has(f)) { seen.add(f); f = renamed.get(f); }
  return f;
};

const byTask = new Map();
for (const e of entries) {
  const file = current(e.file);
  if (!byTask.has(file)) byTask.set(file, []);
  byTask.get(file).push(e);
}

const title = f => {
  if (!existsSync(f)) return f.replace(/^tasks\//, "").replace(/\.md$/, "");
  const m = lf(readFileSync(f, "utf8")).match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : f;
};

// ---- the entry ----
// Blank lines inside a record are its paragraph and list breaks: keep them, trim the
// ends. The hash goes once per record. Ordering is by task path, then by commit order,
// so the output is deterministic for the gate.
const trimBlank = lines => {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};
// The line that closes an entry is the one per-repo value here, read from the gate's
// configuration ("changelog": {"recorded": ...}); {hash} is the short hash of the commit.
const CONFIG = ".claude/hooks/unities.json";
const recorded = (existsSync(CONFIG) && JSON.parse(lf(readFileSync(CONFIG, "utf8"))).changelog?.recorded) || "Recorded in `{hash}`.";
const formatEntry = (e) => `${trimBlank(e.lines.filter(l => !/^Reviewed by:/.test(l))).join("\n")}\n\n${recorded.replaceAll("{hash}", e.hash)}`;
const today = new Date().toISOString().slice(0, 10);
let out = `## ${version ?? "<version>"} — ${today}\n\n`;
for (const file of [...byTask.keys()].sort()) {
  out += `### ${title(file)}\n\n${byTask.get(file).map(formatEntry).join("\n\n")}\n\n`;
}
// -----------------------------------------------------------

if (dry || entries.length === 0) {
  process.stdout.write(entries.length ? out : `(no task records since ${since})\n`);
  process.exit(0);
}

const path = "CHANGELOG.md";
const marker = /<!-- Compiled from tasks\/.*?-->\n?/;
let existing = existsSync(path) ? lf(readFileSync(path, "utf8")) : "# Changelog\n\n";
if (marker.test(existing)) existing = existing.replace(marker, m => m + "\n" + out);
else {
  const i = existing.indexOf("\n", existing.indexOf("# ")) + 1;
  existing = existing.slice(0, i) + "\n" + out + existing.slice(i);
}
writeFileSync(path, existing);
console.log(`CHANGELOG.md: ${entries.length} record(s) from ${byTask.size} task(s) since ${since}`);
