#!/usr/bin/env -S deno run --allow-read --allow-write=docs
// compile-record [--check]                       (deno task record)
// The only writer docs/DECISIONS.md and docs/PLAN.md have below their marker
// line. Both are compiled from the task files: decisions from their
// `## Decisions` sections, the plan's steps from the task files that exist, its
// milestones and not-in-scope lines from the decisions. A pure function of the
// files in the work tree: no git, no clock, so the gate can compare its output
// with what is committed.
//   (no flag) : write both files
//   --check   : exit 0 if both equal the compiler's output, 1 if not, 3 if the
//               record itself is invalid (a compiled decision removed or
//               retitled, a duplicate)
// docs/UNITIES.md's Appendix K, with two changes for this repo, both recorded in
// tasks/adopt-unities.md:
//   - D0–D9 were written by hand as `## D9. title`, so the number search accepts
//     `.` as well as `·`; without it the first compiled decision would be D1.
//   - A task here gathers one `## What was done` per landing, so having one does
//     not make it done: done is a `Status: done` line in its last such section,
//     and a task with sections but no such line is in progress.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

// ---- per-repo ----
const TASKS = "tasks";
const DECISIONS = "docs/DECISIONS.md";
const PLAN = "docs/PLAN.md";
const DONE = /^Status:\s*done\b/mi;
// ------------------
const MARKER = "<!-- Compiled from tasks/ by scripts/compile-record.mjs. Do not edit below this line by hand. -->";
const check = process.argv.includes("--check");
const invalid = message => { console.error(`Invalid record: ${message}`); process.exit(3); };
const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });
const trimBlank = lines => {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};

// ---- read the task files ----
const tasks = [];       // { file, stem, title, status }
const decisions = [];   // { key, date, title, file, order, body[] }
const names = existsSync(TASKS)
  ? readdirSync(TASKS).filter(f => /^[^_].*\.md$/.test(f) && f !== "README.md").sort(natural) : [];
for (const name of names) {
  const file = `${TASKS}/${name}`;
  const text = readFileSync(file, "utf8");
  const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? name).trim();
  const records = text.split(/^(?=## )/m).filter(s => /^## What was done/.test(s));
  const status = !records.length ? "" : DONE.test(records.at(-1)) ? " · done" : " · in progress";
  tasks.push({ file, stem: name.replace(/\.md$/, ""), title, status });
  let inDecisions = false, current = null;
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) { inDecisions = /^## Decisions\s*$/.test(line); current = null; continue; }
    if (!inDecisions) continue;
    const head = /^### (\d{4}-\d{2}-\d{2}) · (.+)$/.exec(line);
    if (head) {
      current = { key: `${head[1]} · ${head[2].trim()}`, date: head[1], title: head[2].trim(), file, order: decisions.length, body: [] };
      decisions.push(current);
    } else if (/^### /.test(line)) invalid(`${file}: a decision heading is "### YYYY-MM-DD · title", got "${line}"`);
    else if (current) current.body.push(line);
  }
}
const byKey = new Map();
for (const d of decisions) {
  if (byKey.has(d.key)) invalid(`two decisions are both "${d.key}" (${byKey.get(d.key).file}, ${d.file}); retitle the one not yet compiled`);
  byKey.set(d.key, d);
}

// ---- numbers: a compiled decision keeps its number for ever; new ones take the next ----
const split = (path, fallback) => {
  const text = existsSync(path) ? readFileSync(path, "utf8") : fallback;
  const i = text.indexOf(MARKER);
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + MARKER.length)];
};
const [decisionsHead, compiled] = split(DECISIONS,
  "# Decisions\n\nDated, append-only. A decision is reversed only by a new entry naming the one it supersedes.\nWritten in the task file of the work that made it (`## Decisions`); compiled here after each merge.\n");
let last = 0;
for (const m of (decisionsHead + compiled).matchAll(/^[#*\s]*D(\d+)\s*[·.]/gm)) last = Math.max(last, Number(m[1]));
for (const m of compiled.matchAll(/^## D(\d+) · (\d{4}-\d{2}-\d{2} · .+)$/gm)) {
  const d = byKey.get(m[2].trim());
  if (!d) invalid(`D${m[1]} "${m[2].trim()}" is compiled in ${DECISIONS} but no task file carries it any more; a decision is reversed by a new entry, never removed or retitled`);
  d.n = Number(m[1]);
}
const fresh = decisions.filter(d => d.n === undefined)
  .sort((a, b) => a.date.localeCompare(b.date) || natural(a.file, b.file) || a.order - b.order);
for (const d of fresh) d.n = ++last;
decisions.sort((a, b) => a.n - b.n);

// ---- docs/DECISIONS.md ----
const link = file => `[${file}](../${file})`;
let decisionsOut = `${decisionsHead.trimEnd()}\n\n${MARKER}\n`;
for (const d of decisions)
  decisionsOut += `\n## D${d.n} · ${d.key}\n\n${trimBlank(d.body).join("\n")}\n\nSource: ${link(d.file)}\n`;

// ---- docs/PLAN.md ----
// A decision may carry plan lines: `Milestone: …` and `Not in scope: …`. They stay in the
// plan until a later decision names that one in a `Supersedes: D<n>` line.
const superseded = new Set();
for (const d of decisions)
  for (const line of d.body)
    if (/^Supersedes:/.test(line)) for (const m of line.matchAll(/D(\d+)/g)) superseded.add(Number(m[1]));
const planLines = label => decisions.filter(d => !superseded.has(d.n)).flatMap(d =>
  d.body.filter(l => l.startsWith(`${label}:`)).map(l => `- ${l.slice(label.length + 1).trim()} (D${d.n})`));
const [planHead] = split(PLAN,
  "# Plan\n\nThe steps are the task files, in file-name order unless a decision says otherwise. Milestones and\nwhat is not in scope are set by decisions. All of it is compiled from `tasks/` by\n`deno task record`, which every commit that changes a task file runs.\n");
let planOut = `${planHead.trimEnd()}\n\n${MARKER}\n\n## Steps\n\n`;
planOut += tasks.map(t => `- [${t.stem}](../${t.file}) — ${t.title}${t.status}`).join("\n") || "(no task files yet)";
planOut += "\n";
for (const [heading, label] of [["Milestones", "Milestone"], ["Not in scope", "Not in scope"]]) {
  const found = planLines(label);
  if (found.length) planOut += `\n## ${heading}\n\n${found.join("\n")}\n`;
}

// ---- write, or compare ----
const outputs = [[DECISIONS, decisionsOut], [PLAN, planOut]];
const stale = outputs.filter(([path, out]) => !existsSync(path) || readFileSync(path, "utf8") !== out).map(([path]) => path);
if (check) {
  if (stale.length) { console.error(`${stale.join(" and ")} not equal to the compiler's output; run deno task record`); process.exit(1); }
  process.exit(0);
}
for (const [path, out] of outputs) {
  if (!stale.includes(path)) continue;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, out);
}
console.log(stale.length
  ? `${stale.join(", ")}: ${decisions.length} decision(s), ${fresh.length} new, from ${tasks.length} task file(s)`
  : "the compiled record is up to date");
