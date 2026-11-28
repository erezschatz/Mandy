#!/usr/bin/env node
// Copyright (c) 2026 Erez Schatz, https://github.com/erezschatz/unities. SPDX-License-Identifier: MIT
// compile-changelog <version> [--since <ref>] [--dry-run]
// The only writer CHANGELOG.md has. Reads "## What was done" sections added to tasks/
// since the last release and prepends them under a version heading.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry-run");
const sinceIdx = argv.indexOf("--since");
const version = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--since");
if (!version && !dry) { console.error("usage: compile-changelog <version> [--since <ref>] [--dry-run]"); process.exit(1); }

// git is started by name with a list of arguments, never through a shell: under Deno a
// shell is one more program to allow, and allowing it allows any program. The buffer is
// large because the log of a long-unreleased history is long.
// core.quotePath, on by default, prints a file name with a non-ASCII character quoted
// and escaped; off, it is printed as it is.
const git = args => {
  const result = spawnSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 30 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} exited ${result.status}`);
  return result.stdout.trim();
};
// A Windows checkout commits and hands back CRLF line endings, and some editors put a
// byte-order mark first; neither is content.
const lf = text => text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const lastTag = () => { try { return git(["describe", "--tags", "--abbrev=0"]); } catch { return ""; } };
const since = sinceIdx >= 0 ? argv[sinceIdx + 1] : (lastTag() || git(["rev-list", "--max-parents=0", "HEAD"]));

// A commit's records are read from the task file as it and its parent hold it, not from
// the diff between them: a diff lines a new record's heading up with an old one's, so a
// record written above another shows its text before its heading. Reading the two
// versions also leaves the developer's diff settings out of it.
// Trailing spaces on a line, and a section's trailing blank lines, are not what it says:
// the file's last section has no blank lines after it, and has some once a record is
// appended after it. The gate reads sections the same way. Records are compared by that
// key and compiled as they were written, so a line's two trailing spaces, a Markdown
// line break, reach the changelog.
const records = text => lf(text).split(/^(?=## )/m).filter(s => /^## What was done/.test(s))
  .map(s => ({ key: s.split("\n").map(l => l.trimEnd()).join("\n").trimEnd(), text: s }));
// Every version needed is read by one git process, as `git cat-file --batch` answers a
// list of "<rev>:<path>" in order; a version that does not exist (a root commit's parent)
// is answered "missing" and read as empty.
const filesAt = specs => {
  if (!specs.length) return [];
  const result = spawnSync("git", ["-c", "core.quotePath=false", "cat-file", "--batch"], { input: specs.join("\n") + "\n", stdio: ["pipe", "pipe", "ignore"], maxBuffer: 1 << 30 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git cat-file --batch exited ${result.status}`);
  const out = result.stdout, texts = [];
  let at = 0;
  for (let i = 0; i < specs.length; i++) {
    const end = out.indexOf(10, at);
    const header = out.subarray(at, end).toString("utf8");
    at = end + 1;
    const size = /^\S+ blob (\d+)$/.exec(header)?.[1];
    if (size === undefined) { texts.push(""); continue; }
    texts.push(out.subarray(at, at + Number(size)).toString("utf8"));
    at += Number(size) + 1;
  }
  return texts;
};
// A record's own words: not its heading or its Reviewed by line, which every record
// shares, and not its punctuation, which a correction often changes.
const words = record => record.split("\n").slice(1).filter(l => !/^Reviewed by:/.test(l))
  .join(" ").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// How alike two records are: the words they share, over the words either has. A record
// the commit only corrected is far more like the one it was than a new record is.
const likeness = (a, b) => {
  const x = new Set(words(a)), y = new Set(words(b));
  const all = new Set([...x, ...y]);
  return all.size ? [...x].filter(w => y.has(w)).length / all.size : 1;
};

const log = git(["log", "--no-merges", "--reverse", "--format=%x1e%H%x1f%h%x1f%as", "--name-status", "-M", `${since}..HEAD`, "--", "tasks/"]);
const entries = [];                       // { file, hash, date, lines[] }

const touched = [];                       // { commit, hash, date, status, from, file }
for (const chunk of log.split("\x1e").filter(Boolean)) {
  const [head, ...rest] = chunk.split("\n");
  const [commit, hash, date] = head.split("\x1f");
  for (const line of rest) {
    const [status, from, to] = line.split("\t");
    if (!status || status.startsWith("D")) continue;
    const file = to ?? from;
    if (!file.startsWith("tasks/") || file.startsWith("tasks/_")) continue;
    touched.push({ commit, hash, date, status, from, file });
  }
}
const versions = filesAt(touched.flatMap(t => [`${t.commit}^:${t.from}`, `${t.commit}:${t.file}`]));
for (let t = 0; t < touched.length; t++) {
  const { hash, date, status, file } = touched[t];
  const before = status.startsWith("A") ? [] : records(versions[2 * t]);
  const after = records(versions[2 * t + 1]);
  // The commit added as many records as the file gained. They are among the ones its
  // parent did not hold word for word; where it also corrected old ones, each corrected
  // old record is paired with the record most like it, the closest pairs first, and the
  // records left over are the new ones.
  const added = after.length - before.length;
  if (added <= 0) continue;
  const unmatched = before.map(r => r.key);
  const fresh = after.filter(r => {
    const i = unmatched.indexOf(r.key);
    if (i < 0) return true;
    unmatched.splice(i, 1);
    return false;
  });
  const pairs = [];
  fresh.forEach((f, i) => unmatched.forEach((u, j) => pairs.push({ i, j, score: likeness(f.key, u) })));
  pairs.sort((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  const corrected = new Set(), used = new Set();
  for (const { i, j } of pairs) {
    if (corrected.size === fresh.length - added) break;
    if (corrected.has(i) || used.has(j)) continue;
    corrected.add(i);
    used.add(j);
  }
  fresh.forEach((r, i) => {
    if (!corrected.has(i)) entries.push({ file, hash, date, lines: r.text.split("\n").slice(1) });
  });
}

// Task files get renamed (e.g. when a work item id is assigned). Records written
// under an earlier name must land under the file's current name.
const renamed = new Map();
for (const line of git(["log", "--reverse", "--format=", "--name-status", "-M", "--diff-filter=R", `${since}..HEAD`, "--", "tasks/"]).split("\n")) {
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
let config = {};
if (existsSync(CONFIG)) try { config = JSON.parse(lf(readFileSync(CONFIG, "utf8"))); }
catch (e) { console.error(`${CONFIG}: not valid JSON: ${e.message}`); process.exit(1); }
if (typeof config !== "object" || config === null || Array.isArray(config)) { console.error(`${CONFIG}: must hold a JSON object`); process.exit(1); }
if (config.changelog?.recorded !== undefined && typeof config.changelog.recorded !== "string") { console.error(`${CONFIG}: changelog.recorded must be a string`); process.exit(1); }
const recorded = config.changelog?.recorded || "Recorded in `{hash}`.";
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
