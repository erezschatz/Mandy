#!/usr/bin/env node
// Copyright (c) 2026 Erez Schatz, https://github.com/erezschatz/unities. SPDX-License-Identifier: MIT
// A scene is complete or it is nothing. SCENE says how long a scene is:
//   "commit" (strict)  : every commit; --staged and --branch refuse.
//   "pr"     (adapted) : the pull request; --pr refuses, --staged and --branch warn.
//
//   --pr <target>   : what the PR changed since it forked from its target (gate; always enforces)
//   --staged        : what `git commit` is about to record       (pre-commit, PreToolUse)
//   --branch [base] : the scene so far, committed or not         (Stop)
//
//   --codex, after the mode: the caller is Codex's hooks, not Claude Code's (4.10). The
//   checks are the same; only how an adapted Stop reaches the agent differs.
//
// This file is the same in every repository. What differs between repositories is read
// from CONFIG; the hashes of the planted files, from MANIFEST.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG = ".claude/hooks/unities.json";            // per-repo values, written at adoption
const MANIFEST = ".claude/hooks/unities.manifest.json"; // copied from the plugin with the scripts
const COMPILER = "scripts/compile-changelog.mjs";
const RECORD_COMPILER = "scripts/compile-record.mjs";
const RECORD_MARKER = "<!-- Compiled from tasks/ by scripts/compile-record.mjs.";
const SELF = ".claude/hooks/check-unit.mjs";
// An acceptance box names the assignee's check, before the task closes. One whose subject
// is the user, customers, adoption or production, or whose verb is a continuing state, is
// an outcome: a promise or a plan milestone, never a gate. Fixed; not per-repo.
const ACCEPTANCE_FORBIDDEN = /^(the |an? |all |active |end[- ])*(user|users|customer|customers|production|prod)\b|\b(is|are|was|were) (running|live|in use|using|deployed)\b|\b(has|have) (replaced|adopted|switched|migrated)\b|\b(started?|starts) (to use|using)\b|\bin production\b|\b(by|from) (active |real |the )?(users?|customers?)\b|\bactive users\b|\buninstall(ed|s)? the old\b/i;
// A record is read cold before it is committed (Appendix G). The gate cannot judge the
// reading; it checks that one is named. Records the migration carried over are exempt.
const REVIEW = /^Reviewed by:\s*\S/m;
const REVIEW_SECTION = /^## Review\b/;   // a review round, written into the task file of the scene it reviews
const REVIEW_EXEMPT = /^(Done before adoption; no record\.|Migrated from )/m;

const codex = process.argv.includes("--codex");
const argv = process.argv.slice(2).filter(a => a !== "--codex");
const mode = argv[0] ?? "--branch";
// Only the hook modes are handed JSON on stdin; --pr must not wait on a pipe its caller left
// open, and the hook modes wait for it only briefly (readStdin).
const input = mode === "--pr" || process.stdin.isTTY ? {} : JSON.parse((await readStdin()) || "{}");
const cwd = input.cwd ?? process.cwd();
const lines = s => s.split("\n").map(l => l.trim()).filter(Boolean);


// PreToolUse's `if` filter is best-effort; make sure this really is a commit.
if (input.hook_event_name === "PreToolUse" &&
    !/(^|[;&|]\s*)git\s+commit\b/.test(input.tool_input?.command ?? "")) process.exit(0);

// ---- per-repo, from CONFIG ----
const config = readConfig();
const SCENE = process.env.UNITIES_SCENE ?? config.scene;   // "commit" (strict) or "pr" (adapted)
const RULES = Object.fromEntries(Object.entries(config.rules).map(([role, re]) => [role, new RegExp(re)]));
// What a change in a role must be accompanied by: a list for source alone, or a map from
// role to list where some files are held to less (a procedure that has no test, say).
const REQUIRED = Array.isArray(config.required) ? { source: config.required } : config.required;
const BASE = config.base;                                  // the branch pull requests target
const RELEASE_FILES = new RegExp(config.releaseFiles);     // what a release PR may touch
// docs/DECISIONS.md and docs/PLAN.md are compiled from the task files (Appendix K). Nobody
// writes them by hand: a decision is written in the task file of the work that made it.
// A repository that keeps no plan ("plan": false) compiles only the decisions, and a
// docs/PLAN.md there, if any, is an ordinary file.
const RECORD_FILES = config.plan === false ? /^docs\/DECISIONS\.md$/ : /^docs\/(DECISIONS|PLAN)\.md$/;
// How the compilers are invoked (Deno, Bun: Appendix H): a command and its arguments,
// split on spaces, since no shell reads it.
const RUN = (config.run ?? "node").trim().split(/\s+/);
const strict = SCENE === "commit";

let files, base, deleted;   // deleting a tombstone is not editing it
if (mode === "--pr") {
  const target = argv[1];
  if (!target) fail("usage: check-unit.mjs --pr <target>");
  // A name git does not know is not a target that has yet to adopt: refuse, do not skip.
  if (!gitOk(["cat-file", "commit", target]))
    fail(`${target} is not a commit this checkout knows; check the name, or fetch the branch (a single-branch or shallow clone may not have it).`);
  if (!adopted(target)) skip(`${target} has no ${SELF}; the record is not required until the target adopts it.`);
  // The PR's own change, measured from where it forked. The target's tip may have
  // moved on since, and its new commits are not this PR's.
  if (!gitOk(["merge-base", target, "HEAD"]))
    fail(`no merge base between ${target} and HEAD; the checkout needs the history back to where the branch forked (a shallow clone may not have it).`);
  base = git(["merge-base", target, "HEAD"]).trim();
  files = lines(git(["diff", "--name-only", base, "HEAD"]));
  deleted = lines(git(["diff", "--name-only", "--diff-filter=D", base, "HEAD"]));
} else if (mode === "--staged") {
  files = lines(git(["diff", "--cached", "--name-only"]));
  deleted = lines(git(["diff", "--cached", "--name-only", "--diff-filter=D"]));
  // A merge carries scenes recorded on the other branch. Only what the merge
  // commit itself writes — a file that differs from both parents — is new.
  if (gitOk(["rev-parse", "-q", "--verify", "MERGE_HEAD"])) {
    const fromTheirs = new Set(lines(git(["diff", "--cached", "--name-only", "MERGE_HEAD"])));
    files = files.filter(f => fromTheirs.has(f));
  }
} else if (mode === "--branch") {
  // Strict: the scene is what is not yet committed. Adapted: the branch since it forked.
  if (strict) {
    base = "HEAD";
  } else {
    base = argv[1] ?? BASE;
    if (!gitOk(["rev-parse", "-q", "--verify", base]) || !adopted(base)) process.exit(0);
    base = git(["merge-base", base, "HEAD"]).trim();
  }
  files = [...new Set([
    ...lines(git(["diff", "--name-only", base])),              // committed since base, plus the work tree
    ...lines(git(["ls-files", "--others", "--exclude-standard"])),
  ])];
  deleted = lines(git(["diff", "--name-only", "--diff-filter=D", base]));
} else {
  fail(`unknown mode ${mode}`);
}

// The compiled record is nobody's doc line: it does not count toward any role.
const has = re => files.some(f => re.test(f) && !RECORD_FILES.test(f));
const missing = [];
for (const [role, needs] of Object.entries(REQUIRED)) {
  if (!has(RULES[role])) continue;
  for (const part of needs)
    if (!has(RULES[part]) && !missing.includes(`no ${part} change`)) missing.push(`no ${part} change`);
}
let shared = files.filter(f => RULES.shared.test(f) || (RULES.retired.test(f) && !deleted.includes(f)));

// A release PR: only RELEASE_FILES changed, and the changelog it adds is exactly
// what the compiler produces from the record. The blob must equal compile(sources).
if (mode === "--pr" && shared.length && files.every(f => RELEASE_FILES.test(f))) {
  // The developer's git configuration can colour the diff, change its a/ and b/ prefixes,
  // hand it to another program, widen its context or pick another algorithm; the flags set
  // each back to git's default. The header ends at the first "@@", so an added line that
  // itself begins "++" is content; a line is tested before it is trimmed, so a context
  // line whose text begins "+" is not taken for an added one.
  const diff = git(["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--src-prefix=a/", "--dst-prefix=b/",
    "--unified=3", "--inter-hunk-context=0", "--diff-algorithm=myers", base, "HEAD", "--", "CHANGELOG.md"]).split("\n");
  const firstHunk = diff.findIndex(l => l.startsWith("@@"));
  const added = (firstHunk < 0 ? [] : diff.slice(firstHunk))
    .filter(l => l.startsWith("+")).map(l => l.slice(1).trim()).filter(Boolean);
  let compiled, why;
  try {
    // The last release's tag, or the first commit where there has been no release.
    let since;
    try { since = git(["describe", "--tags", "--abbrev=0", base]).trim(); }
    catch { since = git(["rev-list", "--max-parents=0", "HEAD"]).trim(); }
    const out = program(RUN[0], [...RUN.slice(1), COMPILER, "--dry-run", "--since", since]).trim();
    if (/^\(no task records/.test(out)) why = " (no task records to release)";
    else compiled = lines(out).slice(1);                       // drop the version heading
  } catch { why = " (compiler failed)"; }
  if (compiled && /^## /.test(added[0] ?? "") && same(added.slice(1), compiled)) shared = [];
  else missing.push(`CHANGELOG.md does not equal the compiler's output${why ?? firstDifference(added.slice(1), compiled)}`);
}
if (shared.length) missing.push(`shared file edited directly: ${shared.join(", ")}`);

// The compiled record. A file is compiled once its version at the scene's base carries the
// marker; until then (a new project, the adoption itself) it is an ordinary file.
//   strict : the commit is also the merge, so the scene carries the compiler's output.
//   adapted: a scene does not touch the compiled files; they are compiled on the target
//            after the merge. The one scene that may is the compile itself (nothing but
//            those files), and then they must equal the compiler's output.
const from = base ?? "HEAD";
const record = files.filter(f => RECORD_FILES.test(f) && head(show(from, f)) !== null);
// An upgrade, the scene that installs a new version of the plugin, is told by the planted
// manifest's version, which only the plugin's own copy writes and the gate checks by hash.
const versionOf = text => { try { return JSON.parse(text).version ?? null; } catch { return null; } };
const upgrade = versionOf(show(from, MANIFEST)) !== null && versionOf(contents(MANIFEST, "")) !== null
  && versionOf(show(from, MANIFEST)) !== versionOf(contents(MANIFEST, ""));
const compileOnly = files.length > 0 && files.every(f => RECORD_FILES.test(f));
if (files.length && existsSync(join(cwd, RECORD_COMPILER))) {
  // The compiler reads the work tree; in --pr that is the checkout of the PR's tip.
  const run = spawnSync(RUN[0], [...RUN.slice(1), RECORD_COMPILER, "--check"], { cwd, encoding: "utf8" });
  if (run.status === 3) missing.push(run.stderr.trim());
  // 0, 1 and 3 are the compiler's answers. Anything else means it did not run (the runtime
  // in "run" is not installed, or Deno does not allow the gate to start it), and a record
  // nobody checked does not pass.
  else if (run.status !== 0 && run.status !== 1) {
    // Deno, refusing to start a program --allow-run does not name, gives no status and no error.
    const what = run.error ? `did not start: ${run.error.code ?? run.error.message}`
      : run.signal ? `was killed by ${run.signal}`
      : typeof run.status === "number" ? `exited ${run.status}`
      : "was not allowed to start (under Deno, --allow-run must name it)";
    missing.push(`record compiler could not be run (\`${[...RUN, RECORD_COMPILER, "--check"].join(" ")}\` ${what}); check "run" in ${CONFIG} (Appendix H)`);
  }
  if (strict || compileOnly) {
    if (run.status === 1) missing.push(`compiled record is out of date: ${run.stderr.trim()}`);
    for (const f of record) {
      if (deleted.includes(f) || head(show(from, f)) === head(contents(f)) || headMayChange(f)) continue;
      missing.push(upgrade
        ? `the decisions in the hand-written head of ${f}, recorded before adoption, were edited; an upgrade may change the head above them, and a decision is reversed by a new one in a task file`
        : `the hand-written head of ${f} was edited; everything in it is changed by a new decision in a task file, or above its decisions by an upgrade`);
    }
    if (mode === "--staged" && !run.status) {
      const unstaged = lines(git(["diff", "--name-only"])).filter(f => RECORD_FILES.test(f));
      if (unstaged.length) missing.push(`compiled record not staged: ${unstaged.join(", ")}`);
    }
  } else {
    // An upgrade may rewrite the head; what is below the marker is compiled after the merge.
    const edited = record.filter(f => deleted.includes(f) || !(headMayChange(f) && below(show(from, f)) === below(contents(f))));
    if (edited.length)
      missing.push(`compiled record edited in this scene: ${edited.join(", ")} (write the decision in your task file under "## Decisions"; it is compiled after the merge)`);
  }
  const gone = record.filter(f => deleted.includes(f));
  if (gone.length) missing.push(`compiled record deleted: ${gone.join(", ")}`);
} else if (record.length) {
  missing.push(`compiled record edited directly: ${record.join(", ")}`);
}

// Acceptance boxes in the task files this scene touches, in path order, so that every mode
// sees them in the same order.
let recorded = false;   // has the scene added a "## What was done" section, in any task file?
const taskFiles = files.filter(f => RULES.task.test(f) && !deleted.includes(f)).sort();
const corrected = corrections();
for (const f of taskFiles) {
  // A task closed at the base, and still closed in the scene, keeps the acceptance boxes
  // it closed with: a rule made since does not reach them. Each one the base held passes
  // once, anywhere outside a review section; a box the scene adds, edits or copies is
  // judged, and an open or reopened task is judged whole, by the rule as it is now.
  const atBase = show(from, f);
  const closedWith = new Map();
  if (closed(atBase) && closed(contents(f)))
    for (const box of acceptanceBoxes(atBase)) closedWith.set(box, (closedWith.get(box) ?? 0) + 1);
  let heading = "";
  for (const line of contents(f).split("\n")) {
    if (/^## /.test(line)) heading = line;
    const m = /^\s*[-*] \[[ xX]\]\s+(.+)$/.exec(line);
    if (m && !REVIEW_SECTION.test(heading) && closedWith.get(line.trim()) > 0) {
      closedWith.set(line.trim(), closedWith.get(line.trim()) - 1);
      continue;
    }
    // "Done when" boxes of a review describe behaviour and may well start with "the user".
    if (m && !REVIEW_SECTION.test(heading) && ACCEPTANCE_FORBIDDEN.test(m[1].trim()))
      missing.push(`acceptance box in ${f} names an outcome, not a check: "${m[1].trim()}" (make it the promise${config.plan === false ? "" : " or a PLAN.md milestone"})`);
  }
  // Every record this scene adds names its cold reader. A section is the scene's unless
  // the base held it word for word, in any task file (scenesSections). A changed record
  // is a correction, not a new one, when it is mostly a record the scene no longer holds
  // as it was (corrections): a correction is neither refused nor the scene's record.
  const sections = scenesSections(f);
  for (const section of sections) {
    if (!isRecord(section)) continue;
    if (corrected.get(section) > 0) { corrected.set(section, corrected.get(section) - 1); continue; }
    recorded = true;
    if (!REVIEW.test(section) && !REVIEW_EXEMPT.test(section))
      missing.push(`record in ${f} has no "Reviewed by:" line (a reader that has not seen the work; see Appendix G)`);
  }
  // Every review round this scene adds: each item says what was found, when it is done
  // (one box per case, as "case → outcome") and what was not asked. An item with an open
  // box does not merge. Who ticks is not the gate's business; that every case is named is.
  for (const section of sections) {
    if (!REVIEW_SECTION.test(section)) continue;
    for (const item of section.split(/^(?=### )/m).slice(1)) {
      const name = item.split("\n")[0].replace(/^### /, "").trim();
      const doneWhen = item.split(/^\*\*Done when\*\*/m)[1]?.split(/^\*\*/m)[0] ?? "";
      const boxes = [...doneWhen.matchAll(/^\s*[-*] \[([ xX])\]\s+(.+)$/gm)];
      if (!/^\*\*Found\*\*/m.test(item) || !boxes.length || !/^\*\*Not asked\*\*/m.test(item))
        missing.push(`review item "${name}" in ${f} needs **Found**, **Done when** with a box per case, and **Not asked**`);
      for (const [, , text] of boxes)
        if (!text.includes("→")) missing.push(`review item "${name}" in ${f}: "${text.trim()}" is not "case → outcome"`);
      if (mode === "--pr" && boxes.some(b => b[1] === " ")) missing.push(`review item "${name}" in ${f} is still open`);
    }
  }
}

// A touched task file is not a recorded scene. A change that must carry a task change
// must carry the record itself: a "## What was done" section the scene added. A scene
// that only opens a task changes nothing that owes one, and passes.
const owesRecord = Object.entries(REQUIRED).some(([role, needs]) => needs.includes("task") && has(RULES[role]));
if (owesRecord && !recorded && !missing.includes("no task change"))
  missing.push(`no record: a task file changed but no "## What was done" section was added (tasks/README.md)`);

// The planted scripts are the plugin's, byte for byte. A copy edited in place is a second
// version of the gate; the fix belongs in the plugin, and an upgrade is a copy of the
// scripts and the manifest together. Judged when the scene touches one of them, so that a
// clean tree still passes. Line endings are left out of the hash: a checkout that writes
// CRLF has not edited anything. A scene that deletes the manifest is judged against the
// one it deleted.
const manifestNow = contents(MANIFEST, null);
const manifestBefore = show(from, MANIFEST) || null;
if (manifestNow === null && manifestBefore !== null)
  missing.push(`planted manifest deleted: ${MANIFEST} (an upgrade replaces it; nothing removes it)`);
const manifest = manifestNow ?? manifestBefore;
if (manifest !== null) {
  let planted = null;
  try { planted = JSON.parse(manifest).files; } catch {}
  if (!planted) missing.push(`${MANIFEST} has no "files" map`);
  else if (files.some(f => f === MANIFEST || f in planted)) {
    for (const [file, hash] of Object.entries(planted)) {
      const text = contents(file, null);
      if (text === null) missing.push(`planted file missing: ${file} (copy it from the plugin)`);
      else if (sha256(text) !== hash)
        missing.push(`planted file edited: ${file} differs from the plugin's (change the plugin, then copy it here)`);
    }
  }
}
// The plugin's own repository holds the masters as well as planted copies ("plugin" in
// CONFIG names their folder). There a changed master must arrive in the copies in the
// same scene, or the repository's gate is not the one it ships.
if (config.plugin) {
  const masterManifest = contents(`${config.plugin}/manifest.json`, null);
  let shipped = [];
  try { shipped = Object.keys(JSON.parse(masterManifest ?? "{}").files ?? {}); }
  catch { missing.push(`${config.plugin}/manifest.json is not valid JSON (run make-manifest.mjs)`); }
  const touched = files.some(f => f.startsWith(`${config.plugin}/`) || f === MANIFEST || shipped.includes(f));
  if (touched) {
    if (masterManifest !== manifestNow)
      missing.push(`planted copy out of date: ${MANIFEST} differs from ${config.plugin}/manifest.json`);
    for (const file of shipped)
      if (contents(file, null) !== contents(`${config.plugin}/${file.split("/").pop()}`, null))
        missing.push(`planted copy out of date: ${file} differs from ${config.plugin}/${file.split("/").pop()}`);
  }
}

if (missing.length === 0) process.exit(0);

const what = { "--pr": "This pull request", "--staged": "This commit", "--branch": strict ? "This change" : "This branch" }[mode];
const reason = `Incomplete scene: ${missing.join("; ")}.`;

if (mode === "--pr") {
  const prefix = process.env.TF_BUILD ? "##vso[task.logissue type=error]" : "";
  console.error(`${prefix}${reason}`);
  console.error(`${what} cannot merge until its change carries its record (see tasks/README.md).`);
  process.exit(1);
}

// A scene ends at its commit, not at the end of a turn: a turn may end to ask or to
// discuss. So the strict staging refuses the commit and only advises at Stop, as the
// adapted one does; being sent back would argue the agent out of the question it stopped
// to ask.
if (strict && input.hook_event_name !== "Stop") {
  console.error(`${reason} Complete the record in this same change before committing it.`);
  process.exit(2);   // PreToolUse: deny the commit. pre-commit: refuse.
}

const note = strict
  ? `${reason} The commit will be refused until the scene is complete. If you stopped to ask or to discuss, that is fine; say what is still missing.`
  : `${reason} ${what} is fine to keep, but the pull request will be refused until it is complete.`;
if (input.hook_event_name === "Stop") {
  // Advise the agent once, in its own context, so it can act; never refuse the turn.
  // Claude Code takes the note as additionalContext. Codex has no such field at Stop: its
  // one channel to the agent is to continue the turn with the note as the prompt.
  if (input.stop_hook_active)
    console.log(JSON.stringify({ systemMessage: note }));
  else if (codex)
    console.log(JSON.stringify({ decision: "block", reason: note }));
  else
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: note } }));
} else {
  console.error(note);
}
process.exit(0);

function adopted(ref) { return gitOk(["cat-file", "-e", `${ref}:${SELF}`]); }
// The sections of a task file that are this scene's: every one the base did not hold, word
// for word, in some task file. A section that only moved (reordered, renamed with its file,
// split or copied into another) is still the base's.
function scenesSections(file) {
  return sectionsOf(contents(file)).filter(section => !baseSections().has(section));
}
function isRecord(section) { return /^## What was done/.test(section); }
// Closed: a "## What was done" record, and no box open outside a fenced block, since a
// task file may quote a box without having one. The record compiler counts done the same.
function closed(text) {
  let fenced = false, open = 0;
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    else if (!fenced && /^\s*[-*] \[ \]/.test(line)) open++;
  }
  return /^## What was done/m.test(text) && open === 0;
}
// The acceptance boxes of a task file, trimmed: every box outside a review section.
function acceptanceBoxes(text) {
  let heading = "";
  const boxes = [];
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) heading = line;
    if (/^\s*[-*] \[[ xX]\]\s+\S/.test(line) && !REVIEW_SECTION.test(heading)) boxes.push(line.trim());
  }
  return boxes;
}
// A record the scene changed is a correction of one the base held when at least half its
// words are that record's, and the base held that record more times than the scene still
// does. Each such record corrects at most one, so a new record cannot pass as a second
// correction of the same one; as many are paired as can be, across all task files read in
// path order, so every mode gives the same answer. Moving a record by hand into another file
// and rewriting it there is not told from new work, and is not meant to be.
// Returns how many times each changed record's text is a correction.
function corrections() {
  const changed = taskFiles.flatMap(f => scenesSections(f).filter(isRecord));
  const gone = [];
  const left = new Map();
  for (const s of sceneSections().all) left.set(s, (left.get(s) ?? 0) + 1);
  for (const s of baseSections().all) {
    if (left.get(s) > 0) left.set(s, left.get(s) - 1);
    else if (isRecord(s)) gone.push(s);
  }
  // Each changed record's possible originals, closest first.
  const partners = changed.map(c => gone
    .map((g, j) => [likeness(c, g), j])
    .filter(([l]) => l >= 0.5)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .map(([, j]) => j));
  // Pair as many as can be paired: taking the closest pair first can leave a second
  // correction with no original when a different pairing would have found both theirs.
  // A changed record takes a free original, or one whose holder can move to another. The
  // closest records try first, so where not all can be paired, the closest are.
  const best = i => partners[i].length ? likeness(changed[i], gone[partners[i][0]]) : 0;
  const order = changed.map((_, i) => i).sort((x, y) => best(y) - best(x) || x - y);
  const holder = new Array(gone.length).fill(-1);
  const take = (i, tried) => {
    for (const j of partners[i]) {
      if (tried.has(j)) continue;
      tried.add(j);
      if (holder[j] < 0 || take(holder[j], tried)) { holder[j] = i; return true; }
    }
    return false;
  };
  for (const i of order) take(i, new Set());
  const out = new Map();
  for (const i of holder) if (i >= 0) out.set(changed[i], (out.get(changed[i]) ?? 0) + 1);
  return out;
}
function likeness(a, b) {   // the share of the longer section's words, below the heading, that both hold
  const words = s => s.split("\n").slice(1).join(" ").split(/\s+/).filter(Boolean);
  const left = new Map();
  for (const w of words(b)) left.set(w, (left.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of words(a)) if (left.get(w) > 0) { shared++; left.set(w, left.get(w) - 1); }
  return shared / Math.max(words(a).length, words(b).length, 1);
}
function sceneSections() {   // every section of every task file as the scene has it
  if (sceneSections.cache) return sceneSections.cache;
  const paths = mode === "--pr" ? lines(git(["ls-tree", "-r", "--name-only", "HEAD", "--", "tasks/"]))
    : mode === "--staged" ? lines(git(["ls-files", "--", "tasks/"]))
    : [...lines(git(["ls-files", "--", "tasks/"])), ...lines(git(["ls-files", "--others", "--exclude-standard", "--", "tasks/"]))];
  const all = paths.filter(p => RULES.task.test(p)).flatMap(p => sectionsOf(contents(p)));
  return sceneSections.cache = Object.assign(new Set(all), { all });
}
function baseSections() {   // every section of every task file at the scene's base
  if (baseSections.cache) return baseSections.cache;
  // One git call for all of them: a repository keeps a task file for every task it ever had.
  let blobs = [];
  try {
    blobs = lines(git(["ls-tree", "-r", from, "--", "tasks/"]))
      .map(l => /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(l))
      .filter(m => m && RULES.task.test(m[2]))
      .map(m => m[1]);
  } catch {}
  const texts = [];
  if (blobs.length) {
    // Bytes out, since the sizes git gives are in bytes; bytes in, since the encoding
    // option would otherwise be applied to the input as well.
    const out = program("git", ["cat-file", "--batch"], { input: Buffer.from(blobs.join("\n") + "\n"), stdio: ["pipe", "pipe", "ignore"], encoding: "buffer" });
    // Each object: "<oid> blob <size>\n", then <size> bytes, then "\n".
    for (let at = 0; at < out.length;) {
      const eol = out.indexOf(10, at);
      const size = Number(out.toString("utf8", at, eol).split(" ")[2]);
      texts.push(out.toString("utf8", eol + 1, eol + 1 + size));
      at = eol + 1 + size + 1;
    }
  }
  const all = texts.flatMap(sectionsOf);   // as many times as the base holds each, for corrections
  return baseSections.cache = Object.assign(new Set(all), { all });
}
function sectionsOf(text) {   // the "## " sections of a file; line endings and trailing blanks are not content
  const out = [];
  for (const raw of lf(text).split("\n")) {
    const line = raw.replace(/[ \t]+$/, "");
    if (line.startsWith("## ")) out.push(line);
    else if (out.length) out[out.length - 1] += "\n" + line;
  }
  return out.map(section => section.replace(/\n+$/, ""));
}
function contents(file, absent = "") {   // the file as this scene has it
  try {
    if (mode === "--pr") return lf(git(["show", `HEAD:${file}`]));
    if (mode === "--staged") return lf(git(["show", `:${file}`]));
    return lf(readFileSync(join(cwd, file), "utf8"));
  } catch { return absent; }
}
function sha256(text) { return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex"); }
function readConfig() {
  // The configuration missing or broken is an incomplete adoption, which the person fixes:
  // refused at a commit and sent back once at a Stop, whose second pass lets the turn end.
  const fail = message => {
    if (input.hook_event_name === "Stop" && input.stop_hook_active) {
      console.log(JSON.stringify({ systemMessage: message }));
      process.exit(0);
    }
    console.error(message);
    process.exit(2);
  };
  const path = join(cwd, CONFIG);
  if (!existsSync(path)) fail(`${CONFIG} is missing; it holds this repository's roles and staging (UNITIES.md, Appendix A).`);
  let c;
  try { c = JSON.parse(lf(readFileSync(path, "utf8"))); } catch (e) { fail(`${CONFIG} is not valid JSON: ${e.message}`); }
  const isMap = v => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isMap(c)) fail(`${CONFIG} must hold a JSON object`);
  for (const key of ["scene", "rules", "required", "base", "releaseFiles"])
    if (c[key] === undefined) fail(`${CONFIG} has no "${key}"`);
  if (!isMap(c.rules)) fail(`${CONFIG}: rules must be a map from role to regular expression`);
  // A pattern is compiled here, so one that will not compile is refused rather than crashing the gate.
  const pattern = (name, re) => {
    if (typeof re !== "string") fail(`${CONFIG}: ${name} must be a regular expression, as a string`);
    try { new RegExp(re); } catch (e) { fail(`${CONFIG}: ${name} is not a valid regular expression: ${e.message}`); }
  };
  for (const role of ["source", "test", "doc", "task", "shared", "retired"]) pattern(`rules.${role}`, c.rules[role]);
  for (const [role, re] of Object.entries(c.rules)) pattern(`rules.${role}`, re);
  pattern("releaseFiles", c.releaseFiles);
  if (!["commit", "pr"].includes(c.scene)) fail(`${CONFIG}: scene must be "commit" or "pr"`);
  if (c.plan !== undefined && typeof c.plan !== "boolean") fail(`${CONFIG}: plan must be true or false`);
  if (c.run !== undefined && (typeof c.run !== "string" || !c.run.trim()))
    fail(`${CONFIG}: run must be the command that replaces "node", as a non-empty string`);
  if (!Array.isArray(c.required) && !isMap(c.required))
    fail(`${CONFIG}: required must be a list of roles, or a map from role to list`);
  const required = Array.isArray(c.required) ? { source: c.required } : c.required;
  if (!Object.hasOwn(required, "source") || (Array.isArray(required.source) && required.source.length === 0))
    fail(`${CONFIG}: required has no "source", or an empty one; a source change must be held to something`);
  for (const [role, needs] of Object.entries(required)) {
    if (!Array.isArray(needs)) fail(`${CONFIG}: required.${role} must be a list of roles`);
    for (const name of [role, ...needs])
      if (!Object.hasOwn(c.rules, name)) fail(`${CONFIG}: required names "${name}", which is not a role in rules`);
  }
  return c;
}
function show(ref, file) {   // the file as the scene's base has it; "" if absent
  try { return lf(git(["show", `${ref}:${file}`])); } catch { return ""; }
}
// A Windows checkout commits and hands back CRLF line endings, and some editors put a
// byte-order mark first; neither is content. Without this a line such as "- [ ] box\r"
// matches none of the patterns that end in (.+)$.
function lf(text) { return text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n"); }
function head(text) {        // the part above the compile marker; null if the file is not compiled
  const i = text.indexOf(RECORD_MARKER);
  return i < 0 ? null : text.slice(0, i).trimEnd();
}
function below(text) {       // the marker and what the compiler wrote under it
  const i = text.indexOf(RECORD_MARKER);
  return i < 0 ? null : text.slice(i);
}
// The decisions a DECISIONS.md head holds, recorded before adoption (runbook 5.4) in
// whatever form they were written: from the first numbered entry, or the first heading
// below the title, whichever comes first, to the marker. "" if none. A PLAN.md head holds
// no decisions (5.4 moves its milestones out), so nothing in it is closed to an upgrade.
function headDecisions(text, file) {
  if (file !== "docs/DECISIONS.md") return "";
  const m = /^[#* \t]*D\d+\s*·|^#{2,}[ \t]/m.exec(text);
  return m ? text.slice(m.index) : "";
}
// An upgrade may change a compiled file's head above its decisions, never the decisions.
function headMayChange(file) {
  const before = head(show(from, file)), now = head(contents(file));
  return upgrade && before !== null && now !== null && headDecisions(before, file) === headDecisions(now, file);
}
function skip(message) { console.log(message); process.exit(0); }
function fail(message) { console.error(message); process.exit(2); }
function same(a, b) { return a.length === b.length && a.every((l, i) => l === b[i]); }
function firstDifference(a, b) {
  const i = a.findIndex((l, i) => l !== b[i]);
  const at = i < 0 ? a.length : i;
  return `\n  PR line ${at + 1}: ${JSON.stringify(a[at] ?? "(end)")}\n  compiled: ${JSON.stringify(b[at] ?? "(end)")}`;
}
// git and the compilers are started by name with a list of arguments, never through a
// shell: under Deno a shell is one more program to allow, and allowing it allows any
// program. It also keeps a file name with a space in it one argument.
function program(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 30, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  return result.stdout;
}
function git(args) { return program("git", args); }
function gitOk(args) { return spawnSync("git", args, { cwd, stdio: "ignore" }).status === 0; }
// A hook writes its JSON as it starts the gate and closes stdin. Run by hand from a script
// or an agent's shell, stdin can be a pipe that is held open and never written to, and
// waiting for its end would wait forever. So the gate stops listening once stdin has been
// silent for a second, before the first byte or between two, and goes on as a run by hand.
// It says so on stderr, because a hook's input it did not read is input it ignored. The
// wait is inside the function because the gate calls it from the top of the file, before
// a const below runs.
function readStdin() {
  const silentMs = 1000;
  return new Promise(resolve => {
    let s = "";
    let timer;
    const done = text => {
      clearTimeout(timer);
      process.stdin.destroy();   // or the open pipe keeps the process alive after the answer
      resolve(text);
    };
    const giveUp = () => {
      try { JSON.parse(s); return done(s); } catch {}   // whole JSON with stdin left open is a hook's input
      console.error(`check-unit: stdin stayed open with ${s ? "an unfinished" : "no"} hook input for a second; going on as a run by hand.`);
      done("");
    };
    const wait = () => { clearTimeout(timer); timer = setTimeout(giveUp, silentMs); };
    wait();
    process.stdin.on("data", d => { s += d; wait(); }).on("end", () => done(s));
  });
}
