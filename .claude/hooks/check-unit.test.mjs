// Copyright (c) 2026 Erez Schatz, https://github.com/erezschatz/unities. SPDX-License-Identifier: MIT
// Run with: node --test   (in the plugin: the master; in a repository: its planted copy)
// The same file in every repository. The throwaway repositories these tests build carry
// their own configuration, FIXTURE, so the tests pin the script's behaviour and not the
// roles of the repository they happen to run in.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// One path in each role of FIXTURE.
const SOURCE = "src/x.ts";
const TEST = "tests/x.test.ts";
const DOC = "docs/a.md";
const TASK = "tasks/1-t.md";
const SHARED = "CHANGELOG.md";
const RETIRED = "TODO.md";
const CONFIG = ".claude/hooks/unities.json";
const MANIFEST = ".claude/hooks/unities.manifest.json";
const FIXTURE = {
  scene: "pr",
  rules: {
    source: "^src/",
    test: "^tests?/",
    doc: "^(docs/|(^|/)(README|CLAUDE|AGENTS)\\.md$)",
    task: "^tasks/(?!README\\.md$)[^/_][^/]*\\.md$",
    shared: "^CHANGELOG\\.md$",
    retired: "^(TODO\\.md|TASKS\\.md|ROADMAP\\.md)$",
  },
  required: ["test", "doc", "task"],
  base: "origin/main",
  releaseFiles: "^(CHANGELOG\\.md|package\\.json|deno\\.json)$",
};

// The scripts sit side by side in the plugin, and in .claude/hooks/ and scripts/ once planted.
const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, "check-unit.mjs");
const sibling = name => existsSync(join(here, name)) ? join(here, name) : resolve(here, "../../scripts", name);
const compiler = sibling("compile-changelog.mjs");
const recordCompiler = sibling("compile-record.mjs");
const DECISIONS = "docs/DECISIONS.md";
const PLAN = "docs/PLAN.md";

// A repo whose main branch has adopted the hook, unless told otherwise.
function repo({ adopted = true, config = FIXTURE } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "check-unit-"));
  const git = (args) => execSync(`git ${args}`, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const write = (file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
  git("init -q -b main");
  git("config user.email t@example.com");
  git("config user.name t");
  git("config commit.gpgsign false");
  write(CONFIG, JSON.stringify(config, null, 2) + "\n");
  write(SHARED, "# Changelog\n\n<!-- Compiled from tasks/ by scripts/compile-changelog.mjs. Do not edit below this line by hand. -->\n");
  write(RETIRED, "Tasks now live in tasks/, one file each.\n");
  write(SOURCE, "base\n");
  write(DOC, "base\n");
  if (adopted) {
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    copyFileSync(hook, join(dir, ".claude/hooks/check-unit.mjs"));
    mkdirSync(join(dir, "scripts"), { recursive: true });
    copyFileSync(compiler, join(dir, "scripts/compile-changelog.mjs"));
    copyFileSync(recordCompiler, join(dir, "scripts/compile-record.mjs"));
  }
  // The merge man: compiles docs/DECISIONS.md and docs/PLAN.md from the task files.
  const compile = () => execSync("node scripts/compile-record.mjs", { cwd: dir, stdio: "ignore" });
  const read = (file) => readFileSync(join(dir, file), "utf8");
  if (adopted) compile();
  git("add -A");
  git("commit -q -m base");
  git("tag v0");
  const commit = (message) => { git("add -A"); git(`commit -q -m ${message}`); };
  return { dir, git, write, commit, compile, read };
}

function run(dir, args, { scene = "pr", stdin = "" } = {}) {
  return spawnSync("node", [hook, ...args], {
    cwd: dir, input: stdin, encoding: "utf8", env: { ...process.env, UNITIES_SCENE: scene },
  });
}

const complete = (write) => {
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, "# t\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
};

// ---- the gate (both stagings) ----

test("a pull request that changes source without its record is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  commit("wip");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no \w+ change/);
});

test("work-in-progress commits are fine once the pull request as a whole carries its record", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "stage 1\n");
  commit("stage-1");
  write(SOURCE, "stage 2\n");
  commit("stage-2");
  complete(write);
  commit("record");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
});

test("a pull request editing the compiled changelog by hand is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SHARED, "hand edit\n");
  commit("edit");
  assert.match(run(dir, ["--pr", "main"]).stderr, /CHANGELOG\.md does not equal/);
});

test("a pull request deleting the compiled changelog is refused", () => {
  const { dir, git, commit } = repo();
  git("checkout -q -b feature");
  git(`rm -q ${SHARED}`);
  commit("delete");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CHANGELOG\.md/);
});

test("a pull request editing a retired file is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(RETIRED, "- [ ] a new item, in the old place\n");
  commit("edit");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /shared file edited directly: TODO\.md/);
});

test("a pull request deleting a retired file is not refused", () => {
  const { dir, git, commit } = repo();
  git("checkout -q -b feature");
  git(`rm -q ${RETIRED}`);
  commit("retire");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /shared file/);
});

test("a release pull request whose changelog equals the compiler's output passes", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  commit("feature");
  git("checkout -q main");
  git("merge -q --no-ff -m merge feature");
  git("checkout -q -b release");
  execSync("node scripts/compile-changelog.mjs 1.0.0 --since v0", { cwd: dir, stdio: "ignore" });
  commit("release");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
  // then a hand edit to the compiled section
  const path = join(dir, SHARED);
  writeFileSync(path, execSync(`cat ${path}`, { encoding: "utf8" }).replace("done", "done, and more"));
  commit("tamper");
  const bad = run(dir, ["--pr", "main"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /does not equal the compiler's output/);
});

test("a release pull request with no tag at its base is compared from the first commit", () => {
  const { dir, git, write, commit } = repo();
  git("tag -d v0");
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  commit("feature");
  git("checkout -q main");
  git("merge -q --no-ff -m merge feature");
  git("checkout -q -b release");
  execSync("node scripts/compile-changelog.mjs 1.0.0", { cwd: dir, stdio: "ignore" });
  commit("release");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("a record compiler that cannot be run is refused, naming run; one that answers is not", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(CONFIG, JSON.stringify({ ...FIXTURE, run: "no-such-runtime-for-the-unities" }));
  commit("feature");
  const missing = run(dir, ["--pr", "main"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /record compiler could not be run \(`no-such-runtime-for-the-unities scripts\/compile-record\.mjs --check` did not start: ENOENT\); check "run" in \.claude\/hooks\/unities\.json/);
  // Any exit that is not one of the compiler's answers is refused the same way.
  write(CONFIG, JSON.stringify({ ...FIXTURE, run: "node -e process.exit(9)" }));
  commit("nine");
  assert.match(run(dir, ["--pr", "main"]).stderr, /record compiler could not be run \(.* exited 9\)/);
  // "node" spelled out answers as the default does.
  write(CONFIG, JSON.stringify({ ...FIXTURE, run: "node" }));
  commit("node");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("a pull request into a target that has not adopted the hook is not checked", () => {
  const { dir, git, write, commit } = repo({ adopted: false });
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  write(SHARED, "hand edit\n");
  commit("edit");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
});

test("a target the checkout does not know is an error, not a target that has not adopted", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  commit("wip");
  const result = run(dir, ["--pr", "origin/mian"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /origin\/mian is not a commit this checkout knows/);
  // A commit id the checkout never fetched, and a name that is not a commit, are refused too.
  const unfetched = "1234567890123456789012345678901234567890";
  for (const name of [unfetched, `main:${SOURCE}`]) {
    const other = run(dir, ["--pr", name]);
    assert.equal(other.status, 2, name);
    assert.match(other.stderr, /is not a commit this checkout knows/);
  }
});

test("on a CI merge commit, HEAD^1 is the target and only the PR's changes count", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  commit("feature");
  git("checkout -q main");
  write(DOC, "changed on main\n");   // on the target only; not the PR's doing
  commit("main");
  git("merge -q --no-ff -m merge feature");
  const result = run(dir, ["--pr", "HEAD^1"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no \w+ change/);
});

// ---- acceptance boxes (both stagings, every mode) ----

test("a task file whose acceptance box names an outcome is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, "# t\n\n## Context\n\n**Acceptance**\n\n- [ ] the user uninstalled the old app and started to use the new one\n- [ ] new schema is running in production\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  commit("record");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /acceptance box in tasks\/1-t\.md names an outcome/);
  assert.match(result.stderr, /running in production/);
});

test("a task file whose acceptance boxes name the assignee's checks passes, in every mode", () => {
  const { dir, git, write, commit, compile } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, "# t\n\n## Context\n\n**Promise** — you no longer need the old app.\n\n**Acceptance**\n\n- [ ] every record from the old app exported and verified in the new one by the programmer\n- [ ] each ported workflow run end to end on the phone, logged\n- [x] `npm test` green\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  git("add -A");
  assert.equal(run(dir, ["--staged"]).status, 0);
  commit("record");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
  compile();   // strict: the commit is also the merge, so it carries the compiled record
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 0);
});

test("strict: an outcome acceptance box is refused at the commit, not only at merge", () => {
  const { dir, write, git } = repo();
  write(TASK, "# t\n\n- [ ] feature replaced old by active users\n");
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /names an outcome/);
});

test("a rule made after a task closed does not reach its boxes; an open task is held to today's rule", () => {
  // A box today's rule refuses, written before the rule was: committed on main directly,
  // as if the pattern had been narrower then.
  const old = "- [x] the user uninstalled the old app";
  const closed = `# t\n\n## Context\n\n**Acceptance**\n\n${old}\n\n## What was done\n\ndone\n\nReviewed by: a reader\n`;
  const open = `# t\n\n## Context\n\n**Acceptance**\n\n${old}\n- [ ] a check still to do\n\n## What was done\n\ndone\n\nReviewed by: a reader\n`;
  const unrecorded = `# t\n\n## Context\n\n**Acceptance**\n\n${old}\n`;
  const added = "\n## What was done\n\nmore\n\nReviewed by: a reader\n";
  const scene = (atBase, now) => {
    const { dir, git, write, commit } = repo();
    write(TASK, atBase);
    commit("before-the-rule");
    git("checkout -q -b feature");
    write(SOURCE, "changed\n");
    write(TEST, "test\n");
    write(DOC, "documented\n");
    write(TASK, now);
    commit("feature");
    const pr = run(dir, ["--pr", "main"]);
    git("checkout -q main");
    git("merge -q --squash feature");
    const staged = run(dir, ["--staged"]);
    return [pr, staged];
  };
  for (const result of scene(closed, closed + added))
    assert.doesNotMatch(result.stderr, /names an outcome/, "closed task, its old box left alone");
  for (const result of scene(closed, closed.replace(old, `${old}, every one`) + added))
    assert.match(result.stderr, /names an outcome/, "closed task, its old box edited");
  for (const result of scene(closed, closed.replace("## What was done", "- [ ] new schema is running in production\n\n## What was done") + added))
    assert.match(result.stderr, /running in production/, "closed task, a box added");
  for (const result of scene(open, open.replace("- [ ] a check still to do", "- [x] a check still to do") + added))
    assert.match(result.stderr, /uninstalled the old app/, "open task: today's rule");
  for (const result of scene(unrecorded, unrecorded + added))
    assert.match(result.stderr, /uninstalled the old app/, "a task with no record: open");
  // Each acceptance box the base held passes once, anywhere outside a review; a second
  // copy of it is the scene's.
  for (const result of scene(closed, closed.replace(old, `${old}\n${old}`) + added))
    assert.match(result.stderr, /uninstalled the old app/, "closed task, the old box copied");
  for (const result of scene(closed, closed.replace(old, `  ${old}`) + added))
    assert.doesNotMatch(result.stderr, /names an outcome/, "closed task, the old box re-indented");
  for (const result of scene(closed, closed.replace("[x]", "[X]") + added))
    assert.match(result.stderr, /uninstalled the old app/, "closed task, the old box edited to [X]");
  const reviewed = `${closed}\n## Review · 2026-01-01\n\n### an item\n\n**Found** — here\n\n**Done when**\n\n- [x] the user sees the message → shown\n\n**Not asked** — more\n`;
  for (const result of scene(reviewed, reviewed.replace(old, `${old}\n- [x] the user sees the message → shown`) + added))
    assert.match(result.stderr, /the user sees the message/, "closed task, a review line copied into Acceptance");
  // A scene that reopens the task is held to today's rule, as an open task is.
  for (const result of scene(closed, closed.replace(old, `${old}\n- [ ] a new check`) + added))
    assert.match(result.stderr, /uninstalled the old app/, "closed task reopened by the scene");
  // Closed is a record and no open box outside a fenced block: a box quoted in a fence is
  // not open.
  const quoted = closed.replace("## What was done", "```\n- [ ] a quoted box\n```\n\n## What was done");
  for (const result of scene(quoted, quoted + added))
    assert.doesNotMatch(result.stderr, /names an outcome/, "closed task, an open box only in a fence");
});

// ---- the reader (both stagings, every mode) ----

test("a record without a Reviewed by line is refused; the one with it passes", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, "# t\n\n## What was done\n\ndone, nobody read it\n");
  git("add -A");
  const staged = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(staged.status, 2);
  assert.match(staged.stderr, /no "Reviewed by:" line/);
  commit("record");
  assert.match(run(dir, ["--pr", "main"]).stderr, /no "Reviewed by:" line/);
  write(TASK, "# t\n\n## What was done\n\ndone, nobody read it\n\nReviewed by: colleague\n");
  commit("reviewed");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
});

test("only records this scene adds are asked for a reader; earlier and migrated ones are not", () => {
  const { dir, git, write, commit } = repo();
  write(TASK, "# t\n\n## Context\n\nMigrated from TODO.md on 2026-01-01\n\n## What was done\n\nDone before adoption; no record.\n");
  commit("migrated");
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, "# t\n\n## Context\n\nMigrated from TODO.md on 2026-01-01\n\n## What was done\n\nDone before adoption; no record.\n\n## What was done\n\nnew work\n\nReviewed by: a reader\n");
  commit("new");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("the compiler writes a changelog whose history since the release is longer than 1 MiB", () => {
  const { dir, write, commit, read } = repo();
  // About 1.06 MiB of record, and 1.1 MiB of git log -p: past Node's default buffer of 1 MiB.
  const body = Array.from({ length: 40_000 }, (_, i) => `line ${i} of a long record`).join("\n");
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, `# t\n\n## What was done\n\n${body}\n\nReviewed by: a reader\n`);
  commit("long");
  const result = spawnSync("node", ["scripts/compile-changelog.mjs", "1.0.0", "--since", "v0"], { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(read(SHARED), /^## 1\.0\.0 — /m);
  assert.match(read(SHARED), /line 39999 of a long record/);
});

test("the compiler leaves the Reviewed by line out of the changelog", () => {
  const { dir, git, write, commit } = repo();
  write(SOURCE, "changed\n");
  complete(write);
  commit("feature");
  const out = execSync("node scripts/compile-changelog.mjs --dry-run --since v0", { cwd: dir, encoding: "utf8" });
  assert.match(out, /done/);
  assert.doesNotMatch(out, /Reviewed by/);
});

test("the release check and the compiler decide the same under the developer's git configuration", () => {
  // Each setting changes the text git diff and git log -p print; the repository's own
  // configuration stands in for the developer's, since it outranks the global one.
  const settings = [
    [],
    ["color.ui", "always"],
    ["color.diff", "always"],
    ["diff.noprefix", "true"],
    ["diff.mnemonicPrefix", "true"],
    ["diff.external", "node ext.mjs"],
    ["diff.context", "10"],
    ["diff.interHunkContext", "10"],
    ["diff.renames", "false"],
    ["diff.algorithm", "patience"],
    ["core.quotePath", "true"],
  ];
  // An older release whose entry has a list line beginning "+"; a task file, already
  // released, that the scene renames to a name git quotes, adds a record to above its
  // review and ticks the review's box well below it.
  const released = "# t\n\n## What was done\n\nold work\n\nReviewed by: a reader\n";
  const review = "\n## Review · 2026-01-01\n\n### an item\n\n**Found** — here\n\n**Done when**\n\n- [ ] a case → an outcome\n\n**Not asked** — more\n";
  const renamed = "tasks/1-renamed-café.md";
  for (const setting of settings) {
    const { dir, git, write, commit, read } = repo();
    const label = setting.join("=") || "no setting";
    write("ext.mjs", 'console.log("an external diff tool printed this");\n');
    if (setting.length) git(`config ${setting[0]} "${setting[1]}"`);
    write(SHARED, read(SHARED) + "\n## 0.9.0 — 2026-01-01\n\n### t\n\n+ first item\n+ second item\n\nRecorded in `0000000`.\n");
    write(TASK, released + review);
    commit("released");
    git("tag v1");
    git("checkout -q -b feature");
    write(SOURCE, "changed\n");
    write(TEST, "test\n");
    write(DOC, "documented\n");
    git(`mv ${TASK} ${renamed}`);
    write(renamed, released + "\n## What was done\n\nnew work\n++ a line that begins with two plus signs\n\nReviewed by: a reader\n" + review.replace("- [ ]", "- [x]"));
    commit("feature");
    git("checkout -q main");
    git("merge -q --no-ff -m merge feature");
    git("checkout -q -b release");
    const compiled = spawnSync("node", ["scripts/compile-changelog.mjs", "1.0.0", "--since", "v1"], { cwd: dir, encoding: "utf8" });
    assert.equal(compiled.status, 0, `${label}: ${compiled.stderr}`);
    const entry = read(SHARED).split("## 0.9.0")[0];
    assert.match(entry, /^new work\n\+\+ a line that begins with two plus signs\n\nRecorded in/m, label);
    assert.doesNotMatch(entry, /old work|Reviewed by|\[x\]/, label);
    commit("release");
    const ok = run(dir, ["--pr", "main"]);
    assert.equal(ok.status, 0, `${label}: ${ok.stderr}`);
    // A line added by hand to the compiled section, even one that begins "++", is refused.
    write(SHARED, read(SHARED).replace("++ a line", "++ a hand-added line\n++ a line"));
    commit("tamper");
    assert.match(run(dir, ["--pr", "main"]).stderr, /does not equal the compiler's output/, label);
  }
});

test("a record is compiled with its text wherever in the task file it was written; a correction is not a record", () => {
  const record = text => `## What was done\n\n${text}\n\nReviewed by: a reader\n`;
  const compile = (before, after) => {
    const { dir, write, commit } = repo();
    write(TASK, before);
    commit("before");
    write(TASK, after);
    commit("after");
    return execSync("node scripts/compile-changelog.mjs --dry-run --since HEAD~1", { cwd: dir, encoding: "utf8" });
  };
  const old = `# t\n\n${record("old work")}`;
  const above = compile(old, `# t\n\n${record("new work")}\n${record("old work")}`);
  assert.match(above, /^new work\n\nRecorded in/m, "inserted above an older record");
  assert.doesNotMatch(above, /old work/);
  const below = compile(old, `${old}\n${record("new work")}`);
  assert.match(below, /^new work\n\nRecorded in/m, "appended after an older record");
  assert.doesNotMatch(below, /old work/);
  const both = compile(old, `# t\n\n${record("new work")}\n${record("old work, corrected")}`);
  assert.match(both, /^new work\n\nRecorded in/m, "inserted above an older record that is corrected at once");
  assert.doesNotMatch(both, /old work/);
  const corrected = compile(old, `# t\n\n${record("old work, corrected")}`);
  assert.match(corrected, /no task records since/, "a correction alone");
  // An appended record whose words the last one already has, or that has none of its own,
  // is still the new one: the last record is not changed by what comes after it.
  const shared = compile(`# t\n\n${record("Recompiled the record and the plan.")}`, `# t\n\n${record("Recompiled the record and the plan.")}\n${record("Recompiled the plan.")}`);
  assert.match(shared, /^Recompiled the plan\.\n\nRecorded in/m, "appended, its words all in the last record");
  assert.doesNotMatch(shared, /record and the plan/);
  const wordless = compile(old, `${old}\n${record("--")}`);
  assert.match(wordless, /^--\n\nRecorded in/m, "appended, with no words");
  const blank = compile(`${old}\n\n`, `${old}\n\n${record("old work")}`);
  assert.match(blank, /^old work\n\nRecorded in/m, "appended after a file that ended in blank lines");
  assert.equal(blank.match(/old work/g).length, 1);
  const spaced = compile(old, old.replace("old work", "old work   ") + "\n\n");
  assert.match(spaced, /no task records since/, "only trailing blanks changed");
  // The same appended record, when the commit also touches the record above it.
  const last = `# t\n\n${record("Recompiled the record and the plan.")}`;
  for (const [touch, label] of [
    [last.replace("the plan.", "the plan.   "), "the last record given trailing spaces"],
    [last.replace("and the plan", "and plan"), "the last record corrected, losing a word"],
    [last.replace("the plan.", "the plan and the notes."), "the last record corrected, gaining words"],
  ]) {
    const out = compile(last, `${touch}\n${record("Recompiled the plan.")}`);
    assert.match(out, /^Recompiled the plan\.\n\nRecorded in/m, label);
    assert.doesNotMatch(out, /record and|the notes/, label);
  }
  // Compared without trailing spaces, compiled with them: two of them are a line break.
  const broken = compile(old, `${old}\n${record("First line with a hard break  \nsecond line")}`);
  assert.match(broken, /^First line with a hard break  \nsecond line$/m, "a Markdown line break kept");
});

// ---- adapted staging: commits and turns warn ----

test("adapted: a commit with an incomplete scene warns but is not refused", () => {
  const { dir, write, git } = repo();
  write(SOURCE, "wip\n");
  git("add -A");
  const result = run(dir, ["--staged"]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /no \w+ change.*pull request will be refused/);
});

test("a clean merge commit does not warn about what the other branch recorded", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b other");
  write(SOURCE, "base\nmore\n");
  complete(write);
  commit("other");
  git("checkout -q main");
  write("docs/b.md", "ours\n");
  commit("ours");
  git("merge --no-commit --no-ff other");
  assert.equal(run(dir, ["--staged"]).stderr, "");
});

test("adapted: the Stop hook advises the agent once, in its context, and never blocks", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "stage 1\n");
  commit("stage-1");
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: active });
  const first = run(dir, ["--branch", "main"], { stdin: stop(false) });
  assert.equal(first.status, 0);
  assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /no \w+ change/);
  const second = run(dir, ["--branch", "main"], { stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /no \w+ change/);
  complete(write);   // uncommitted and untracked still count
  assert.equal(run(dir, ["--branch", "main"], { stdin: stop(false) }).stdout, "");
});

// ---- strict staging: commits and turns refuse ----

test("strict: a commit with an incomplete scene is refused", () => {
  const { dir, write, git } = repo();
  write(SOURCE, "wip\n");
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Complete the record in this same change before committing it/);
  assert.doesNotMatch(result.stderr, /revert/);
});

test("strict: deleting a retired file is a complete scene on its own", () => {
  const { dir, git } = repo();
  git(`rm -q ${RETIRED}`);
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("strict: PreToolUse ignores shell commands that are not a git commit", () => {
  const { dir, write, git } = repo();
  write(SOURCE, "wip\n");
  git("add -A");
  const pre = (command) => JSON.stringify({ hook_event_name: "PreToolUse", cwd: dir, tool_input: { command } });
  assert.equal(run(dir, ["--staged"], { scene: "commit", stdin: pre("npm test && echo $(date)") }).status, 0);
  assert.equal(run(dir, ["--staged"], { scene: "commit", stdin: pre("git commit -m \"$(cat <<'EOF'\nwip\nEOF\n)\"") }).status, 2);
});

// A scene ends at its commit; a turn may end to ask or discuss (runbook §1).
test("strict: the Stop hook never sends the agent back; it tells it once what is missing, then tells the person", () => {
  const { dir, write, compile } = repo();
  write(SOURCE, "wip\n");
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: active });
  const first = run(dir, ["--branch"], { scene: "commit", stdin: stop(false) });
  assert.equal(first.status, 0);
  const advice = JSON.parse(first.stdout).hookSpecificOutput.additionalContext;
  assert.match(advice, /no \w+ change/);
  assert.match(advice, /If you stopped to ask or to discuss, that is fine/);
  assert.doesNotMatch(advice, /revert/);
  const second = run(dir, ["--branch"], { scene: "commit", stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /no \w+ change/);
  complete(write);
  compile();
  assert.equal(run(dir, ["--branch"], { scene: "commit", stdin: stop(false) }).status, 0);
});

// ---- the same script, called from Codex's hooks (4.10) ----

test("codex, adapted: the Stop hook continues the turn once with the note, then lets go and tells the person", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "stage 1\n");
  commit("stage-1");
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, turn_id: "t1", stop_hook_active: active });
  const first = run(dir, ["--branch", "--codex", "main"], { stdin: stop(false) });
  assert.equal(first.status, 0);
  const told = JSON.parse(first.stdout);
  assert.equal(told.decision, "block");
  assert.match(told.reason, /no \w+ change/);
  assert.match(told.reason, /fine to keep/);
  assert.equal(told.hookSpecificOutput, undefined);   // Codex documents no such field at Stop
  const second = run(dir, ["--branch", "--codex", "main"], { stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /no \w+ change/);
  complete(write);
  assert.equal(run(dir, ["--branch", "--codex", "main"], { stdin: stop(false) }).stdout, "");
});

test("codex: the flag is not read as the base, wherever it stands", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  commit("wip");
  const plain = run(dir, ["--pr", "main"]);
  for (const args of [["--pr", "--codex", "main"], ["--pr", "main", "--codex"]]) {
    const flagged = run(dir, args);
    assert.equal(flagged.status, plain.status);
    assert.equal(flagged.stderr, plain.stderr);
  }
});

test("codex, strict: Stop continues the turn once with the note, as in adapted; PreToolUse refuses the commit", () => {
  const { dir, write, git } = repo();
  write(SOURCE, "wip\n");
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, turn_id: "t1", stop_hook_active: active });
  const first = run(dir, ["--branch", "--codex"], { scene: "commit", stdin: stop(false) });
  assert.equal(first.status, 0);
  const cont = JSON.parse(first.stdout);
  assert.equal(cont.decision, "block");
  assert.match(cont.reason, /no \w+ change.*If you stopped to ask or to discuss, that is fine/s);
  const second = run(dir, ["--branch", "--codex"], { scene: "commit", stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /no \w+ change/);
  git("add -A");
  const pre = (command) => JSON.stringify({ hook_event_name: "PreToolUse", cwd: dir, tool_name: "Bash", tool_input: { command } });
  assert.equal(run(dir, ["--staged", "--codex"], { scene: "commit", stdin: pre("npm test") }).status, 0);
  assert.equal(run(dir, ["--staged", "--codex"], { scene: "commit", stdin: pre("git commit -m wip") }).status, 2);
});

// ---- the compiled record: docs/DECISIONS.md and docs/PLAN.md ----

const decision = (date, title, extra = "") =>
  `### ${date} · ${title}\n\n**Decision** — yes.\n**Rejected** — no.\n**Why** — because.\n${extra}`;
const taskWith = (...decisions) =>
  `# t\n\n## Context\n\nasked\n\n## Decisions\n\n${decisions.join("\n")}\n## What was done\n\ndone\n\nReviewed by: a reader\n`;

test("a decision written in a task file is compiled with the next number, and the plan lists the task", () => {
  const { write, compile, read } = repo();
  write(DECISIONS, "# Decisions\n\n## D1 · 2026-01-01 · written by hand before\n\nkept\n");
  write(TASK, taskWith(decision("2026-11-11", "One file per unit", "Milestone: After 03: sync proven\nNot in scope: tablets\n")));
  compile();
  assert.match(read(DECISIONS), /written by hand before\n\nkept\n\n<!-- Compiled from tasks\//);
  assert.match(read(DECISIONS), /## D2 · 2026-11-11 · One file per unit\n\n\*\*Decision\*\* — yes\./);
  assert.match(read(DECISIONS), /Source: \[tasks\/1-t\.md\]/);
  assert.match(read(PLAN), /- \[1-t\]\(\.\.\/tasks\/1-t\.md\) — t · done/);
  assert.match(read(PLAN), /## Milestones\n\n- After 03: sync proven \(D2\)/);
  assert.match(read(PLAN), /## Not in scope\n\n- tablets \(D2\)/);
  const before = read(DECISIONS) + read(PLAN);
  compile();
  assert.equal(read(DECISIONS) + read(PLAN), before);
});

test("a task with a record and an open box is recorded, not done, and the plan says how many are open", () => {
  const { write, compile, read } = repo();
  const record = "## What was done\n\ndone\n\nReviewed by: a reader\n";
  write(TASK, `# t\n\n## Context\n\n**Acceptance**\n\n- [x] script: one\n- [ ] the assignee: two\n\n${record}`);
  write("tasks/2-u.md", `# u\n\n## Context\n\n- [ ] the assignee: one\n\n${record}\n## Review · 2026-11-22\n\n### a finding\n\n**Done when**\n\n* [ ] a case → an outcome\n`);
  write("tasks/3-v.md", "# v\n\n## Context\n\n- [ ] the assignee: not started\n");
  compile();
  assert.match(read(PLAN), /— t · recorded, 1 box open\n/);
  assert.match(read(PLAN), /— u · recorded, 2 boxes open\n/);
  assert.match(read(PLAN), /— v\n/);                       // no record: open, and no count
  write(TASK, read(TASK).replace("- [ ] the assignee: two", "- [x] the assignee: two"));
  compile();
  assert.match(read(PLAN), /— t · done\n/);
});

test("a box quoted in a fenced block is not an open box", () => {
  const { write, compile, read } = repo();
  write(TASK, "# t\n\n## Context\n\n- [x] script: one\n\nThe template reads:\n\n```\n- [ ] <actor>: <check>\n```\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  compile();
  assert.match(read(PLAN), /— t · done\n/);
});

test("a compiled decision keeps its number whatever is compiled after it", () => {
  const { write, compile, read } = repo();
  write(TASK, taskWith(decision("2026-11-11", "Second by date")));
  compile();
  write("tasks/0-earlier.md", taskWith(decision("2026-10-01", "First by date")));
  compile();
  assert.match(read(DECISIONS), /## D1 · 2026-11-11 · Second by date[^]*## D2 · 2026-10-01 · First by date/);
});

test("a decision that supersedes another takes that one's lines out of the plan", () => {
  const { write, compile, read } = repo();
  write(TASK, taskWith(decision("2026-11-01", "No tablets", "Not in scope: tablets\n")));
  compile();
  assert.match(read(PLAN), /- tablets \(D1\)/);
  write("tasks/2-u.md", taskWith(decision("2026-11-11", "Tablets after all", "Supersedes: D1\n")));
  compile();
  assert.doesNotMatch(read(PLAN), /tablets \(D1\)/);
  assert.match(read(DECISIONS), /## D1 · 2026-11-01 · No tablets/);   // the old entry stays
});

test("adapted: a pull request that writes its decision in its task file passes", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  commit("feature");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("adapted: a pull request that touches the compiled record is refused, by hand or by compiler", () => {
  const { dir, git, write, commit, compile, read } = repo();
  git("checkout -q -b by-hand");
  write(SOURCE, "changed\n");
  complete(write);
  write(DECISIONS, read(DECISIONS) + "\n## D1 · 2026-11-11 · appended by hand\n");
  commit("by-hand");
  assert.match(run(dir, ["--pr", "main"]).stderr, /compiled record edited in this scene: docs\/DECISIONS\.md/);
  git("checkout -q main");
  git("checkout -q -b by-compiler");
  write(SOURCE, "changed\n");
  complete(write);
  compile();
  commit("by-compiler");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /compiled record edited in this scene: docs\/PLAN\.md/);
});

test("what the target did after the branch forked is not the pull request's doing", () => {
  const { dir, git, write, commit, compile } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  commit("feature");
  git("checkout -q main");
  write("tasks/2-u.md", taskWith(decision("2026-11-19", "Decided on the target")));
  compile();   // the merge man recompiled the record on the target; the branch is now behind
  commit("main");
  git("checkout -q feature");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
  // A caller that still passes the fork point itself gets the same answer.
  assert.equal(run(dir, ["--pr", git("merge-base main HEAD").trim()]).status, 0);
  // And the branch's own edit to the compiled record is still refused.
  write(DECISIONS, "by hand\n");
  commit("by-hand");
  const own = run(dir, ["--pr", "main"]);
  assert.equal(own.status, 1);
  assert.match(own.stderr, /compiled record edited in this scene: docs\/DECISIONS\.md/);
});

test("a pull request with no history in common with its target stops with an error", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q --orphan elsewhere");
  write(SOURCE, "changed\n");
  commit("elsewhere");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no merge base between main and HEAD/);
});

test("the compiled record does not count as the doc change", () => {
  const { dir, git, write, commit, compile } = repo();
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  compile();
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no doc change/);
});

test("the compile after a merge: only the compiled files, equal to the compiler's output", () => {
  const { dir, git, write, commit, compile, read } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  commit("feature");
  git("checkout -q main");
  git("merge -q --no-ff -m merge feature");
  git("checkout -q -b record");
  compile();
  commit("compile");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
  write(DECISIONS, read(DECISIONS).replace("because", "because I say so"));
  commit("tamper");
  assert.match(run(dir, ["--pr", "main"]).stderr, /compiled record is out of date/);
  compile();
  write(PLAN, "# Plan\n\nA milestone added by hand above the line.\n" + read(PLAN).slice(read(PLAN).indexOf("\n<!-- Compiled")));
  commit("head");
  assert.match(run(dir, ["--pr", "main"]).stderr, /hand-written head of docs\/PLAN\.md was edited/);
});

test("removing or retitling a compiled decision is refused in every staging", () => {
  const { dir, git, write, commit, compile } = repo();
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  compile();
  commit("compiled");
  git("checkout -q -b feature");
  write(TASK, taskWith(decision("2026-11-11", "One file per unit, on second thought")));
  commit("retitle");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /D1 .* is compiled .* never removed or retitled/);
  git("add -A");
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 0);   // nothing uncommitted
  write(TASK, taskWith(decision("2026-11-11", "Retitled again")));
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 2);
});

test("strict: a commit whose compiled record is out of date is refused; compiled and staged, it passes", () => {
  const { dir, git, write, compile } = repo();
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  git("add -A");
  const stale = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /compiled record is out of date/);
  compile();
  assert.match(run(dir, ["--staged"], { scene: "commit" }).stderr, /compiled record not staged/);
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("a file that is not compiled yet at the base is an ordinary file", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b old");
  write(DECISIONS, "# Decisions\n\n## D1 · 2026-01-01 · by hand\n");   // main as it was before this version
  write(PLAN, "# Plan\n\n| 01 | by hand |\n");
  commit("old");
  git("checkout -q -b upgrade");
  write(DECISIONS, "# Decisions\n\n## D1 · 2026-01-01 · by hand\n\ntidied during the upgrade\n");
  write(SOURCE, "changed\n");
  complete(write);
  commit("upgrade");
  const result = run(dir, ["--pr", "old"]);
  assert.equal(result.status, 0, result.stderr);
});

// ---- review rounds (both stagings) ----

const review = (...items) => `# t\n\n## What was done\n\ndone\n\nReviewed by: a reader\n\n## Review · 2026-11-11\n\n${items.join("\n")}`;
const item = (boxes, { found = "**Found** — created rows stay in the preview after a partial import.\n\n", notAsked = "**Not asked** — no schema change.\n" } = {}) =>
  `### Rows after a partial import\n\n${found}**Done when**\n\n${boxes.join("\n")}\n\n${notAsked}`;

test("a review item names every case as case → outcome, and what was not asked", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, review(item(["- [x] keep only the failed rows importable"])));
  commit("review");
  assert.match(run(dir, ["--pr", "main"]).stderr, /"keep only the failed rows importable" is not "case → outcome"/);
  write(TASK, review(item(["- [x] rows created → removed"], { notAsked: "" })));
  commit("no-not-asked");
  assert.match(run(dir, ["--pr", "main"]).stderr, /needs \*\*Found\*\*, \*\*Done when\*\* with a box per case, and \*\*Not asked\*\*/);
});

test("a pull request with an open review item does not merge; a commit on the way is not held to it", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  const boxes = (tick) => [`- [x] rows created → removed`, `- [${tick}] rows never sent → stay, with their error, not importable`, `- [x] the user edits the default → it is no longer refreshed`];
  write(TASK, review(item(boxes(" "))));
  git("add -A");
  assert.equal(run(dir, ["--staged"]).stderr, "");
  commit("review");
  const open = run(dir, ["--pr", "main"]);
  assert.equal(open.status, 1);
  assert.match(open.stderr, /review item "Rows after a partial import" in tasks\/1-t\.md is still open/);
  write(TASK, review(item(boxes("x"))));
  commit("closed");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("a review round from before this rule is left alone", () => {
  const { dir, git, write, commit } = repo();
  write(TASK, "# t\n\n## Review\n\n### Barrages\n\n- [ ] keep only the failed rows importable\n");
  commit("old");
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, "# t\n\n## Review\n\n### Barrages\n\n- [ ] keep only the failed rows importable\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  commit("new");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

// ---- the scripts as files: configuration and manifest ----

const sha256 = text => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const PLANTED = {
  ".claude/hooks/check-unit.mjs": hook,
  "scripts/compile-changelog.mjs": compiler,
  "scripts/compile-record.mjs": recordCompiler,
};
// A repository planted the way the runbook plants: the files copied, the manifest beside them.
function planted() {
  const r = repo();
  const files = Object.fromEntries(Object.keys(PLANTED).map(f => [f, sha256(r.read(f))]));
  r.write(MANIFEST, JSON.stringify({ version: "test", files }, null, 2) + "\n");
  r.commit("manifest");
  return r;
}

test("the roles are read from the configuration file", () => {
  const { dir, git, write, read } = repo();
  write(CONFIG, JSON.stringify({ ...FIXTURE, rules: { ...FIXTURE.rules, source: "^lib/" } }));
  git("add -A"); git("commit -q -m lib-is-source");
  write("src/y.ts", "not source here\n");
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
  write("lib/y.ts", "source here\n");
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no test change/);
  assert.ok(read(CONFIG).includes("^lib/"));
});

test("without its configuration the gate stops and names the file", () => {
  const { dir, git } = repo();
  git(`rm -q ${CONFIG}`);
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\.claude\/hooks\/unities\.json is missing/);
});

test("a planted script edited in place is refused, naming the file, in every mode", () => {
  const { dir, git, write, read, commit } = planted();
  git("checkout -q -b feature");
  write("scripts/compile-record.mjs", read("scripts/compile-record.mjs") + "// a local fix\n");
  const edited = /planted file edited: scripts\/compile-record\.mjs/;
  const branch = run(dir, ["--branch"], { scene: "commit" });   // strict Stop: the work tree
  assert.equal(branch.status, 2);
  assert.match(branch.stderr, edited);
  git("add -A");
  const staged = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(staged.status, 2);
  assert.match(staged.stderr, edited);
  commit("local-fix");
  const pr = run(dir, ["--pr", "main"]);
  assert.equal(pr.status, 1);
  assert.match(pr.stderr, /planted file edited: scripts\/compile-record\.mjs/);
});

test("a planted copy equal to the plugin's passes; deleting one is refused", () => {
  const { dir, git, write, read, compile } = planted();
  // The same bytes copied again, as an upgrade to an unchanged file does.
  write(".claude/hooks/check-unit.mjs", readFileSync(hook, "utf8"));
  write(TASK, "# t\n\n## Context\n\nopened\n");
  compile();
  git("add -A");
  const same = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(same.status, 0, same.stderr);
  git("reset -q --hard");
  git("rm -q scripts/compile-changelog.mjs");
  const gone = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(gone.status, 2);
  assert.match(gone.stderr, /planted file missing: scripts\/compile-changelog\.mjs/);
  assert.ok(read(MANIFEST).includes("compile-changelog"));
});

test("an upgrade copies a script and the manifest together, and passes", () => {
  const { dir, git, write, read } = planted();
  const next = read("scripts/compile-record.mjs") + "// the plugin's next version\n";
  const manifest = JSON.parse(read(MANIFEST));
  manifest.files["scripts/compile-record.mjs"] = sha256(next);
  write("scripts/compile-record.mjs", next);
  write(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
});

// An upgrade is told by the planted manifest's version (tasks/an-upgrade-may-rewrite-the-head.md).
const upgradeManifest = r => {
  const manifest = JSON.parse(r.read(MANIFEST));
  manifest.version = "next";
  r.write(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
};
const STALE = "An introduction the next version makes wrong.";
const OLD = "## D1 · 2026-01-01 · Decided before adoption\n\nKept as it was.\n";
// A planted repository whose DECISIONS.md head holds an introduction and a decision from before adoption.
function withOldHead() {
  const r = planted();
  const text = r.read(DECISIONS);
  r.write(DECISIONS, `# Decisions\n\n${STALE}\n\n${OLD}\n${text.slice(text.indexOf("<!-- Compiled"))}`);
  r.compile();
  r.commit("old-head");
  return r;
}
const rewriteIntro = r => r.write(DECISIONS, r.read(DECISIONS).replace(STALE, "An introduction for the next version."));

test("strict: an upgrade may rewrite a compiled file's head above its old decisions; no other scene may", () => {
  const r = withOldHead();
  rewriteIntro(r);
  r.git("add -A");
  const plain = run(r.dir, ["--staged"], { scene: "commit" });
  assert.equal(plain.status, 2);
  assert.match(plain.stderr, /the hand-written head of docs\/DECISIONS\.md was edited/);
  upgradeManifest(r);
  r.git("add -A");
  const upgrade = run(r.dir, ["--staged"], { scene: "commit" });
  assert.equal(upgrade.status, 0, upgrade.stderr);
  // The decision recorded before adoption stays closed, upgrade or not.
  r.write(DECISIONS, r.read(DECISIONS).replace("Kept as it was.", "Rewritten."));
  r.git("add -A");
  const old = run(r.dir, ["--staged"], { scene: "commit" });
  assert.equal(old.status, 2);
  assert.match(old.stderr, /the decisions in the hand-written head of docs\/DECISIONS\.md, recorded before adoption, were edited/);
});

test("an upgrade keeps old decisions closed from their first D<n> · line or heading, and only them", () => {
  const variants = [
    ["## D1 — Decided before adoption\n\nKept as it was.\n", "refused"],
    ["### 2026-01-01 · Decided before adoption\n\nKept as it was.\n", "refused"],
  ];
  for (const [entry] of variants) {
    const r = planted();
    const text = r.read(DECISIONS);
    r.write(DECISIONS, `# Decisions\n\n${STALE}\n\n${entry}\n${text.slice(text.indexOf("<!-- Compiled"))}`);
    r.compile();
    r.commit("old-head");
    upgradeManifest(r);
    r.write(DECISIONS, r.read(DECISIONS).replace("Kept as it was.", "Rewritten."));
    r.git("add -A");
    assert.equal(run(r.dir, ["--staged"], { scene: "commit" }).status, 2, entry);
  }
  // A blank line added between the introduction and the first decision is the introduction's.
  let r = withOldHead();
  upgradeManifest(r);
  r.write(DECISIONS, r.read(DECISIONS).replace(`${STALE}\n\n`, `${STALE}\n\n\n`));
  r.git("add -A");
  const blank = run(r.dir, ["--staged"], { scene: "commit" });
  assert.equal(blank.status, 0, blank.stderr);
  // A head with no decisions is the upgrade's throughout; so is a PLAN.md head, headings and all.
  r = planted();
  const plan = r.read(PLAN);
  r.write(PLAN, `# Plan\n\n## Phases\n\n${STALE}\n\n${plan.slice(plan.indexOf("<!-- Compiled"))}`);
  r.compile();
  r.commit("plan-head");
  upgradeManifest(r);
  r.write(PLAN, r.read(PLAN).replace(STALE, "Phases for the next version."));
  r.git("add -A");
  const planUp = run(r.dir, ["--staged"], { scene: "commit" });
  assert.equal(planUp.status, 0, planUp.stderr);
});

test("adapted: an upgrade's pull request may rewrite the head and nothing below the marker", () => {
  const r = withOldHead();
  r.git("checkout -q -b upgrade");
  rewriteIntro(r);
  upgradeManifest(r);
  r.commit("upgrade");
  const up = run(r.dir, ["--pr", "main"]);
  assert.equal(up.status, 0, up.stderr);
  // Without the version, the same head edit is refused: a pull request of the compiled files
  // alone is the compile, held to the head as strict is.
  r.git("checkout -q main");
  r.git("checkout -q -b plain");
  rewriteIntro(r);
  r.commit("plain");
  assert.match(run(r.dir, ["--pr", "main"]).stderr, /the hand-written head of docs\/DECISIONS\.md was edited/);
  // With anything else beside it, it is a compiled file edited in the scene.
  r.write(DOC, "documented\n");
  r.commit("plain-and-doc");
  assert.match(run(r.dir, ["--pr", "main"]).stderr, /compiled record edited in this scene: docs\/DECISIONS\.md/);
  // An upgrade that also changes what the compiler wrote is refused the same way.
  r.git("checkout -q main");
  r.git("checkout -q -b below");
  rewriteIntro(r);
  upgradeManifest(r);
  r.write(DECISIONS, r.read(DECISIONS) + "\nWritten by hand below the marker.\n");
  r.commit("below");
  assert.match(run(r.dir, ["--pr", "main"]).stderr, /compiled record edited in this scene: docs\/DECISIONS\.md/);
});

test("a checkout that writes CRLF has not edited a planted script", () => {
  const { dir, git, write, read } = planted();
  write("scripts/compile-record.mjs", read("scripts/compile-record.mjs").replace(/\n/g, "\r\n"));
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 0);
});

test("the plugin's manifest holds the hash of every file it ships", { skip: !existsSync(join(here, "manifest.json")) && "not the plugin: this copy is planted" }, () => {
  const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
  const shipped = [".claude/hooks/check-unit.mjs", ".claude/hooks/check-unit.test.mjs", "scripts/compile-changelog.mjs", "scripts/compile-record.mjs"];
  assert.deepEqual(Object.keys(manifest.files).sort(), shipped.sort());
  for (const [file, hash] of Object.entries(manifest.files)) {
    const master = join(here, file.split("/").pop());
    assert.equal(hash, sha256(readFileSync(master, "utf8")), `${file}: run node ${join(here, "make-manifest.mjs")}`);
  }
});

test("deleting the planted manifest is refused, and the scripts are still judged against it", () => {
  const { dir, git, write, read, commit } = planted();
  git("checkout -q -b feature");
  git(`rm -q ${MANIFEST}`);
  const deleted = /planted manifest deleted: \.claude\/hooks\/unities\.manifest\.json/;
  const branch = run(dir, ["--branch"], { scene: "commit" });
  assert.equal(branch.status, 2);
  assert.match(branch.stderr, deleted);
  write("scripts/compile-record.mjs", read("scripts/compile-record.mjs") + "// a local fix\n");
  git("add -A");
  const staged = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(staged.status, 2);
  assert.match(staged.stderr, deleted);
  assert.match(staged.stderr, /planted file edited: scripts\/compile-record\.mjs/);
  commit("no-manifest");
  const pr = run(dir, ["--pr", "main"]);
  assert.equal(pr.status, 1);
  assert.match(pr.stderr, deleted);
});

test("a scene that touches no planted file is not judged by the manifest; a clean tree passes", () => {
  const { dir, git, write, compile } = planted();
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 0);
  write(SOURCE, "changed\n");
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stderr, /planted/);
  complete(write);
  compile();
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("without its configuration: other commands pass, a commit is refused, a Stop lets go on its second pass", () => {
  const { dir, git } = repo();
  git(`rm -q ${CONFIG}`);
  const pre = (command) => JSON.stringify({ hook_event_name: "PreToolUse", cwd: dir, tool_input: { command } });
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: active });
  assert.equal(run(dir, ["--staged"], { scene: "commit", stdin: pre("ls") }).status, 0);
  const commit = run(dir, ["--staged"], { scene: "commit", stdin: pre("git commit -m x") });
  assert.equal(commit.status, 2);
  assert.match(commit.stderr, /unities\.json is missing/);
  const first = run(dir, ["--branch"], { scene: "commit", stdin: stop(false) });
  assert.equal(first.status, 2);
  assert.match(first.stderr, /unities\.json is missing/);
  const second = run(dir, ["--branch"], { scene: "commit", stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /unities\.json is missing/);
  assert.equal(run(dir, ["--pr", "main"]).status, 2);
});

test("in the plugin's own repository a changed master must arrive in its planted copy", () => {
  const { dir, git, write, read, compile } = planted();
  const PLUGIN = "plugin/files";
  // The masters beside the copies, and the configuration that says where they are.
  for (const [file] of Object.entries(PLANTED)) write(`${PLUGIN}/${file.split("/").pop()}`, read(file));
  write(`${PLUGIN}/manifest.json`, read(MANIFEST));
  write(CONFIG, JSON.stringify({ ...FIXTURE, plugin: PLUGIN }));
  git("add -A"); git("commit -q -m masters");
  const next = read(`${PLUGIN}/compile-record.mjs`) + "// the next version\n";
  const manifest = JSON.parse(read(MANIFEST));
  manifest.files["scripts/compile-record.mjs"] = sha256(next);
  write(`${PLUGIN}/compile-record.mjs`, next);
  write(`${PLUGIN}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  git("add -A");
  const stale = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /planted copy out of date: scripts\/compile-record\.mjs/);
  assert.match(stale.stderr, /planted copy out of date: \.claude\/hooks\/unities\.manifest\.json/);
  write("scripts/compile-record.mjs", next);
  write(MANIFEST, read(`${PLUGIN}/manifest.json`));
  compile();
  git("add -A");
  const copied = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(copied.status, 0, copied.stderr);
  git("commit -q -m copied");
  write(DOC, "a doc change only\n");
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("in the plugin's repository a broken master manifest is refused by name, and a Stop lets go", () => {
  const { dir, git, write, read } = planted();
  write("plugin/files/manifest.json", read(MANIFEST));
  write(CONFIG, JSON.stringify({ ...FIXTURE, plugin: "plugin/files" }));
  git("add -A"); git("commit -q -m masters");
  write("plugin/files/manifest.json", "{");
  git("add -A");
  const staged = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(staged.status, 2);
  assert.match(staged.stderr, /plugin\/files\/manifest\.json is not valid JSON/);
  const stop = run(dir, ["--branch"], { scene: "commit", stdin: JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: true }) });
  assert.equal(stop.status, 0);
  assert.match(JSON.parse(stop.stdout).systemMessage, /manifest\.json is not valid JSON/);
});

test("required may hold a list per role: a procedure needs its doc and task, not a test", () => {
  const { dir, git, write, compile } = repo();
  write(CONFIG, JSON.stringify({
    ...FIXTURE,
    rules: { ...FIXTURE.rules, procedure: "^procedure/" },
    required: { source: ["test", "doc", "task"], procedure: ["doc", "task"] },
  }));
  git("add -A"); git("commit -q -m procedure-role");
  write("procedure/RUNBOOK.md", "a step\n");
  git("add -A");
  const alone = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(alone.status, 2);
  assert.match(alone.stderr, /no doc change; no task change/);
  assert.doesNotMatch(alone.stderr, /no test change/);
  write(DOC, "documented\n");
  write(TASK, "# t\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  compile();
  git("add -A");
  const recorded = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(recorded.status, 0, recorded.stderr);
  write(SOURCE, "changed too\n");
  git("add -A");
  const source = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(source.status, 2);
  assert.match(source.stderr, /no test change/);
});

test("required naming a role that rules does not have stops the gate", () => {
  const { dir, git, write } = repo();
  write(CONFIG, JSON.stringify({ ...FIXTURE, required: { source: ["test"], procedure: ["doc"] } }));
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /required names "procedure"/);
});

test("a required that is not a list or a map, misses source, or names no own role stops the gate", () => {
  const { dir, git, write } = repo();
  const stop = JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: true });
  const cases = [
    [null, /required must be a list of roles, or a map/],
    [5, /required must be a list of roles, or a map/],
    ["test", /required must be a list of roles, or a map/],
    [{ procedure: ["doc"] }, /required has no "source"/],
    [{}, /required has no "source"/],
    [[], /required has no "source", or an empty one/],
    [{ source: [] }, /required has no "source", or an empty one/],
    [{ source: "test" }, /required\.source must be a list of roles/],
    [{ source: ["test"], toString: ["doc"] }, /required names "toString"/],
    [["test", "constructor"], /required names "constructor"/],
  ];
  for (const [required, message] of cases) {
    write(CONFIG, JSON.stringify({ ...FIXTURE, required }));
    write(SOURCE, `changed ${JSON.stringify(required)}\n`);
    git("add -A");
    const result = run(dir, ["--staged"], { scene: "commit" });
    assert.equal(result.status, 2, JSON.stringify(required));
    assert.match(result.stderr, message);
    assert.match(result.stderr, /\.claude\/hooks\/unities\.json/);
    const second = run(dir, ["--branch"], { scene: "commit", stdin: stop });
    assert.equal(second.status, 0);
    assert.match(JSON.parse(second.stdout).systemMessage, message);
  }
  write(CONFIG, JSON.stringify({ ...FIXTURE, rules: { ...FIXTURE.rules, extra: 7 } }));
  git("add -A");
  assert.match(run(dir, ["--staged"], { scene: "commit" }).stderr, /rules\.extra must be a regular expression/);
  assert.match(JSON.parse(run(dir, ["--branch"], { scene: "commit", stdin: stop }).stdout).systemMessage, /rules\.extra must be a regular expression/);
});

// ---- which sections a scene added ----

const RECORD_OLD = "# t\n\n## What was done\n\nan old record, read before the gate asked\n";

test("a second record is judged alone; the first, with the same heading, is not the scene's", () => {
  const { dir, git, write, commit, read } = repo();
  write(TASK, RECORD_OLD);
  commit("old-record");
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, read(TASK) + "\n## What was done\n\nthe new record\n\nReviewed by: a reader\n");
  commit("new-record");
  const pr = run(dir, ["--pr", "main"]);
  assert.equal(pr.status, 0, pr.stderr);
});

test("a second review round with the same heading is judged alone", () => {
  const { dir, git, write, commit, read } = repo();
  // A round from before the rule: an item without its three parts, left alone.
  write(TASK, "# t\n\n## Review · 2026-11-11\n\n### Old\n\nfix it\n");
  commit("old-review");
  git("checkout -q -b feature");
  write(TASK, read(TASK) + "\n## Review · 2026-11-11\n\n### New\n\n**Found** — here\n\n**Done when**\n\n- [x] a case → an outcome\n\n**Not asked** — more\n");
  commit("new-review");
  const pr = run(dir, ["--pr", "main"]);
  assert.equal(pr.status, 0, pr.stderr);
});

test("a record the scene adds without a reader is still refused in every mode, after an older one", () => {
  const { dir, git, write, commit, read, compile } = repo();
  write(TASK, RECORD_OLD + "\nReviewed by: a reader\n");
  compile();
  commit("old-record");
  const scene = () => {
    write(TASK, read(TASK) + "\n## What was done\n\nthe new record, unread\n");
    compile();
  };
  const unread = /record in tasks\/1-t\.md has no "Reviewed by:" line/;
  scene();
  const branch = run(dir, ["--branch"], { scene: "commit" });
  assert.equal(branch.status, 2);
  assert.match(branch.stderr, unread);
  git("add -A");
  const staged = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(staged.status, 2);
  assert.match(staged.stderr, unread);
  git("checkout -q -b feature");
  commit("unread");
  const pr = run(dir, ["--pr", "main"]);
  assert.equal(pr.status, 1);
  assert.match(pr.stderr, unread);
});


const RECORD_READ = "## What was done\n\nan older record\n\nReviewed by: a reader\n";
const RECORD_NEW_UNREAD = "## What was done\n\na new record, unread\n";
const RECORD_NEW_READ = "## What was done\n\na new record\n\nReviewed by: another reader\n";
const unreadIn = file => new RegExp(`record in ${file.replace(/[./]/g, "\\$&")} has no "Reviewed by:" line`);
// Every mode, on a scene the caller has written but not committed: strict --branch, adapted
// --branch, strict --staged, and --pr once committed on a branch.
function everyMode(r) {
  const { dir, git, compile, commit } = r;
  compile();
  const out = {
    branch: run(dir, ["--branch"], { scene: "commit" }),
    adapted: run(dir, ["--branch"], { scene: "pr" }),
  };
  git("add -A");
  out.staged = run(dir, ["--staged"], { scene: "commit" });
  commit("scene");
  out.pr = run(dir, ["--pr", "main"]);
  return out;
}
function onBranch(baseTask, file = TASK) {
  const r = repo();
  r.write(file, baseTask);
  r.compile();
  r.commit("base-task");
  // Adapted --branch measures from origin/main; give it one.
  r.git("update-ref refs/remotes/origin/main HEAD");
  r.git("checkout -q -b feature");
  return r;
}

test("an unread record inserted above an older read one is refused in every mode", () => {
  const r = onBranch(`# t\n\n${RECORD_READ}`);
  r.write(TASK, `# t\n\n${RECORD_NEW_UNREAD}\n${RECORD_READ}`);
  const out = everyMode(r);
  for (const mode of ["branch", "staged"]) { assert.equal(out[mode].status, 2, mode); assert.match(out[mode].stderr, unreadIn(TASK)); }
  assert.match(JSON.stringify(out.adapted.stdout + out.adapted.stderr), /has no \\"Reviewed by:\\" line/);
  assert.equal(out.pr.status, 1);
});

test("a read record inserted above an older pre-rule one passes in every mode", () => {
  const r = onBranch("# t\n\n## What was done\n\nan old record, before the rule\n");
  r.write(TASK, `# t\n\n${RECORD_NEW_READ}\n## What was done\n\nan old record, before the rule\n`);
  const out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
  assert.doesNotMatch(out.adapted.stdout + out.adapted.stderr, /Reviewed by/);
  assert.equal(out.pr.status, 0, out.pr.stderr);
});

test("a review round inserted above an older one with the same heading is judged alone", () => {
  const old = "## Review · 2026-11-11\n\n### Old\n\nfix it\n";
  const fresh = "## Review · 2026-11-11\n\n### New\n\n**Found** — here\n\n**Done when**\n\n- [x] a case → an outcome\n\n**Not asked** — more\n";
  const r = onBranch(`# t\n\n${old}`);
  r.write(TASK, `# t\n\n${fresh}\n${old}`);
  const out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
  assert.equal(out.pr.status, 0, out.pr.stderr);
});

test("an older record the scene corrects is not refused, with or without a reader line", () => {
  const pre = "# t\n\n## What was done\n\nan old record, before the rule\n";
  let r = onBranch(pre);
  r.write(TASK, "# t\n\n## What was done\n\nan old record, before the rule\nwith a line added\n");
  let out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
  assert.equal(out.pr.status, 0, out.pr.stderr);
  r = onBranch(pre);
  r.write(TASK, "# t\n\n## What was done\n\nan old record, before the rule\n\nReviewed by: a reader, at last\n");
  out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
  assert.equal(out.pr.status, 0, out.pr.stderr);
});

test("a renamed task file keeps its older records; only the new one is judged", () => {
  const old = "tasks/t.md";
  const pre = "# t\n\n## What was done\n\nan old record, before the rule\n";
  // Read: passes everywhere.
  let r = onBranch(pre, old);
  r.git(`mv ${old} ${TASK}`);
  r.write(TASK, `${pre}\n${RECORD_NEW_READ}`);
  let out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
  // A rename changes the compiled plan, which an adapted pull request does not carry;
  // what matters here is that no record is charged.
  assert.doesNotMatch(out.pr.stderr, /Reviewed by/);
  // Unread: refused once, for the new record.
  r = onBranch(pre, old);
  r.git(`mv ${old} ${TASK}`);
  r.write(TASK, `${pre}\n${RECORD_NEW_UNREAD}`);
  out = everyMode(r);
  assert.equal(out.staged.status, 2);
  assert.equal(out.staged.stderr.match(/has no "Reviewed by:" line/g).length, 1);
  // Renamed in the work tree only: the old path gone, the new one untracked.
  r = onBranch(pre, old);
  r.write(TASK, `${pre}\n${RECORD_NEW_READ}`);
  execSync(`rm ${old}`, { cwd: r.dir });
  r.compile();
  assert.equal(run(r.dir, ["--branch"], { scene: "commit" }).status, 0);
});

test("line endings rewritten to CRLF do not make the older records new", () => {
  const pre = "# t\n\n## What was done\n\nan old record, before the rule\n";
  let r = onBranch(pre);
  r.write(TASK, `${pre}\n${RECORD_NEW_READ}`.replace(/\n/g, "\r\n"));
  let out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
  assert.equal(out.pr.status, 0, out.pr.stderr);
  r = onBranch(pre);
  r.write(TASK, `${pre}\n${RECORD_NEW_UNREAD}`.replace(/\n/g, "\r\n"));
  out = everyMode(r);
  assert.equal(out.staged.status, 2);
  assert.equal(out.staged.stderr.match(/has no "Reviewed by:" line/g).length, 1);
});

test("## after a U+2028, a U+2029 or a lone CR inside a line is not a heading", () => {
  for (const sep of [" ", " ", "\r"]) {
    const r = onBranch("# t\n\n## Context\n\nopened\n");
    r.write(TASK, `# t\n\n## Context\n\nopened\n\nnote${sep}## What was done\n\nnot a record\n`);
    const out = everyMode(r);
    assert.doesNotMatch(out.staged.stderr, /Reviewed by/, JSON.stringify(sep));
  }
});

// The second reading's cases: nothing a scene deletes, and no length, stands for a new section.

const refusedEverywhere = (out, label) => {
  for (const mode of ["branch", "staged"]) { assert.equal(out[mode].status, 2, `${label} ${mode}`); }
  assert.match(out.adapted.stdout + out.adapted.stderr, /Incomplete scene/, `${label} adapted`);
  assert.equal(out.pr.status, 1, `${label} pr`);
};
const passesEverywhere = (out, label) => {
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${label} ${mode}: ${out[mode].stderr}`);
  // Adapted: a branch never carries the compiled plan, which a new task file changes; only
  // the record and review messages are this test's business.
  assert.doesNotMatch(out.adapted.stdout + out.adapted.stderr, /Reviewed by|review item/, `${label} adapted`);
};

test("an older record deleted does not let a new unread one through", () => {
  const r = onBranch(`# t\n\n${RECORD_READ}`);
  r.write(TASK, `# t\n\n${RECORD_NEW_UNREAD}`);
  refusedEverywhere(everyMode(r), "deleted record");
});

test("an older review round deleted does not let an incomplete new one through", () => {
  const r = onBranch("# t\n\n## Review · 2026-11-11\n\n### Old\n\nfix it\n");
  r.write(TASK, "# t\n\n## Review · 2026-11-11\n\n### New\n\nno parts\n");
  refusedEverywhere(everyMode(r), "deleted round");
});

test("another task file deleted does not let an unread record through", () => {
  const r = onBranch(`# t\n\n${RECORD_READ}`);
  r.write("tasks/2-u.md", `# u\n\n${RECORD_READ}`);
  r.compile(); r.commit("second-task");
  r.git("rm -q tasks/2-u.md");
  r.write(TASK, `# t\n\n${RECORD_READ}\n${RECORD_NEW_UNREAD}`);
  refusedEverywhere(everyMode(r), "other file deleted");
});

test("a long new record does not hide behind a short edited one", () => {
  const r = onBranch(`# t\n\n${RECORD_READ}`);
  const long = "## What was done\n\n" + "a paragraph\n\n".repeat(5) + "unread\n";
  r.write(TASK, `# t\n\n${RECORD_READ.replace("an older record", "an older record, fixed")}\n${long}`);
  refusedEverywhere(everyMode(r), "long new record");
});

test("records that only moved, by split or copy, with the original kept or not, are not the scene's", () => {
  const two = `# t\n\n## What was done\n\nfirst, before the rule\n\n## What was done\n\nsecond, before the rule\n`;
  // Split, the original kept.
  let r = onBranch(two);
  r.write(TASK, "# t\n\n## What was done\n\nfirst, before the rule\n");
  r.write("tasks/2-u.md", `# u\n\n## What was done\n\nsecond, before the rule\n\n${RECORD_NEW_READ}`);
  passesEverywhere(everyMode(r), "split kept");
  // Split, the original deleted, a new unread record in one part.
  r = onBranch(two);
  r.git(`rm -q ${TASK}`);
  r.write("tasks/1-a.md", `# a\n\n## What was done\n\nfirst, before the rule\n\n${RECORD_NEW_UNREAD}`);
  r.write("tasks/1-b.md", "# b\n\n## What was done\n\nsecond, before the rule\n");
  let out = everyMode(r);
  refusedEverywhere(out, "split deleted");
  assert.equal(out.staged.stderr.match(/has no "Reviewed by:" line/g).length, 1);
  assert.match(out.staged.stderr, unreadIn("tasks/1-a.md"));
  // Copied, with a new record in the copy: read passes, unread is refused for it alone.
  r = onBranch(two);
  r.write("tasks/2-u.md", `${two}\n${RECORD_NEW_READ}`);
  passesEverywhere(everyMode(r), "copy read");
  r = onBranch(two);
  r.write("tasks/2-u.md", `${two}\n${RECORD_NEW_UNREAD}`);
  out = everyMode(r);
  assert.equal(out.staged.stderr.match(/has no "Reviewed by:" line/g).length, 1);
});

test("a rename staged before its deletion is still a move", () => {
  const pre = "# t\n\n## What was done\n\nan old record, before the rule\n";
  const r = onBranch(pre, "tasks/t.md");
  r.write(TASK, `${pre}\n${RECORD_NEW_READ}`);
  r.compile();
  r.git(`add ${TASK} docs`);   // the new name staged, the old one not yet removed
  assert.equal(run(r.dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("a task file that is new in the scene is judged throughout", () => {
  const r = onBranch("# t\n\n## Context\n\nopened\n");
  r.write("tasks/2-u.md", `# u\n\n${RECORD_NEW_UNREAD}`);
  refusedEverywhere(everyMode(r), "new file");
});

test("corrected older records are not asked for a reader, only the new one is; after a rename too", () => {
  const two = "# t\n\n## What was done\n\nfirst, before the rule\n\n## What was done\n\nsecond, before the rule\n";
  let r = onBranch(two);
  r.write(TASK, `${two.replace("first,", "first, fixed,").replace("second,", "second, fixed,")}\n${RECORD_NEW_UNREAD}`);
  let out = everyMode(r);
  assert.equal(out.staged.status, 2);
  assert.equal(out.staged.stderr.match(/has no "Reviewed by:" line/g).length, 1);
  r = onBranch("# t\n\n## What was done\n\nan old record, before the rule\n", "tasks/t.md");
  r.git(`mv tasks/t.md ${TASK}`);
  r.write(TASK, `# t\n\n## What was done\n\nan old record, before the rule, fixed\n\n${RECORD_NEW_READ}`);
  out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
});

// The base as several task files, then a branch, as onBranch does for one.
function onBranchWith(tasks) {
  const r = repo();
  for (const [file, text] of Object.entries(tasks)) r.write(file, text);
  r.compile();
  r.commit("base-tasks");
  r.git("update-ref refs/remotes/origin/main HEAD");
  r.git("checkout -q -b feature");
  return r;
}

test("a correction passes when its record is also in another file, is one of two alike, or has a close new record beside it", () => {
  const shared = "# t\n\n## What was done\n\nshared record, before the rule\n";
  let r = onBranchWith({ [TASK]: shared, "tasks/2-u.md": shared });
  r.write(TASK, shared.replace("before the rule", "before the rule, fixed"));
  passesEverywhere(everyMode(r), "also in another file");
  const twice = "# t\n\n## What was done\n\nthe same record, before the rule\n\n## What was done\n\nthe same record, before the rule\n";
  r = onBranchWith({ [TASK]: twice });
  r.write(TASK, twice.replace(/before the rule\n$/, "before the rule, fixed\n"));
  passesEverywhere(everyMode(r), "one of two alike");
  // A new read record in an earlier file, close to the corrected one: the correction is
  // still the correction, in every mode, whatever order the files are read in.
  const old = "# t\n\n## What was done\n\na record about the parser and its tests, before the rule\n";
  r = onBranchWith({ "tasks/5-t.md": old });
  r.write("tasks/5-t.md", old.replace("before the rule", "before the rule, fixed"));
  r.write("tasks/0-a.md", "# a\n\n## What was done\n\na record about the parser and its tests\n\nReviewed by: a reader\n");
  passesEverywhere(everyMode(r), "close new record");
  // Two records corrected, where the closest pair first would leave the second with none.
  const words = (from, to, tag) => Array.from({ length: to - from + 1 }, (_, k) => `${tag}${from + k}`).join(" ");
  const a = words(1, 10, "a"), b = `${words(1, 5, "a")} ${words(6, 10, "b")}`;
  const both = `# t\n\n## What was done\n\n${a}\n\n## What was done\n\n${b}\n`;
  r = onBranchWith({ [TASK]: both });
  // The first: a with one word changed (0.9 to a, 0.5 to b). The second: 0.8 to a, 0.4 to b.
  const first = a.replace("a10", "x10");
  const second = `${words(1, 4, "a")} ${words(6, 9, "a")} y9 y10`;
  r.write(TASK, `# t\n\n## What was done\n\n${first}\n\n## What was done\n\n${second}\n`);
  passesEverywhere(everyMode(r), "two corrections");
});

// A correction is allowed and is not a record (runbook 4.7): with source, a box ticked or a
// line added inside a merged record does not answer "no record"; a new record still does.
test("source with a corrected merged record and no new one is refused as no record", () => {
  const merged = "## What was done\n\ndone, with a box:\n\n- [ ] a check → an outcome\n\nReviewed by: a reader\n";
  const sourced = r => { r.write(SOURCE, "changed\n"); r.write(TEST, "test\n"); r.write(DOC, "documented\n"); };
  const noRecord = /no record: a task file changed but no "## What was done" section was added/;
  for (const [label, corrected] of [
    ["box ticked", merged.replace("- [ ]", "- [x]")],
    ["line added", merged.replace("Reviewed by:", "one more line\n\nReviewed by:")],
  ]) {
    let r = onBranch(`# t\n\n${merged}`);
    sourced(r);
    r.write(TASK, `# t\n\n${corrected}`);
    let out = everyMode(r);
    for (const mode of ["branch", "staged"]) { assert.equal(out[mode].status, 2, `${label} ${mode}`); assert.match(out[mode].stderr, noRecord); }
    assert.equal(out.pr.status, 1, label);
    assert.match(out.pr.stderr, noRecord);
    // The same correction with a new, read record passes.
    r = onBranch(`# t\n\n${merged}`);
    sourced(r);
    r.write(TASK, `# t\n\n${corrected}\n${RECORD_NEW_READ}`);
    out = everyMode(r);
    for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${label} + new ${mode}: ${out[mode].stderr}`);
    // A ticked box changes the compiled plan, which an adapted pull request does not carry;
    // only the record messages are this test's business there.
    assert.doesNotMatch(out.pr.stderr, /no record|Reviewed by/, `${label} + new pr`);
    // The correction alone, with no source change, passes.
    r = onBranch(`# t\n\n${merged}`);
    r.write(TASK, `# t\n\n${corrected}`);
    passesEverywhere(everyMode(r), `${label} alone`);
  }
});

test("trailing spaces or tabs, removed or added, do not make an older record the scene's", () => {
  const pre = "# t\n\n## What was done\n\nfirst line  \nsecond line, before the rule\n";
  let r = onBranch(pre);
  r.write(TASK, `${pre.replace("first line  ", "first line")}\n \n${RECORD_NEW_READ}`);
  let out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
  assert.equal(out.pr.status, 0, out.pr.stderr);
  // A tab inside a line is a change, and a change to an older record is a correction.
  r = onBranch(pre);
  r.write(TASK, `${pre.replace("second line", "second\tline")}\n${RECORD_NEW_READ}`);
  out = everyMode(r);
  for (const mode of ["branch", "staged"]) assert.equal(out[mode].status, 0, `${mode}: ${out[mode].stderr}`);
});

// ---- a repository that keeps no plan ("plan": false in the configuration) ----

const NO_PLAN = { ...FIXTURE, plan: false };

test("with the plan switched off the compiler writes the decisions and no plan, and its check passes", () => {
  const { dir, write, compile, read } = repo({ config: NO_PLAN });
  assert.equal(existsSync(join(dir, PLAN)), false);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit", "Milestone: After 03: sync proven\n")));
  compile();
  assert.match(read(DECISIONS), /## D1 · 2026-11-11 · One file per unit/);
  assert.equal(existsSync(join(dir, PLAN)), false);
  assert.equal(spawnSync("node", ["scripts/compile-record.mjs", "--check"], { cwd: dir }).status, 0);
});

test("with the plan switched off, strict: a commit is held to the decisions alone and gains no plan", () => {
  const { dir, git, write, compile } = repo({ config: NO_PLAN });
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  git("add -A");
  assert.match(run(dir, ["--staged"], { scene: "commit" }).stderr, /compiled record is out of date/);
  compile();
  git("add -A");
  const ok = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(existsSync(join(dir, PLAN)), false);
});

test("with the plan switched off, adapted: the compile after a merge is the decisions alone", () => {
  const { dir, git, write, commit, compile } = repo({ config: NO_PLAN });
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  commit("feature");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
  git("checkout -q main");
  git("merge -q --no-ff -m merge feature");
  git("checkout -q -b record");
  compile();
  commit("compile");
  assert.equal(git("diff --name-only main HEAD").trim(), DECISIONS);
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("with the plan switched off, a docs/PLAN.md that was compiled before is an ordinary doc", () => {
  const { dir, git, write, commit, read } = repo();        // the base compiles a plan
  write(CONFIG, JSON.stringify(NO_PLAN, null, 2) + "\n");
  commit("switch");
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(PLAN, read(PLAN) + "\nA line written by hand.\n");
  commit("feature");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("a plan setting that is not true or false stops the gate, naming the configuration", () => {
  const { dir, git, write } = repo();
  write(CONFIG, JSON.stringify({ ...FIXTURE, plan: "no" }, null, 2) + "\n");
  write(SOURCE, "changed\n");
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unities\.json: plan must be true or false/);
  // The compiler reads the same key and stops on the same value, and on a file that is not JSON.
  const compiler = () => spawnSync("node", ["scripts/compile-record.mjs", "--check"], { cwd: dir, encoding: "utf8" });
  assert.equal(compiler().status, 3);
  assert.match(compiler().stderr, /unities\.json: plan must be true or false/);
  write(CONFIG, "{ not json");
  assert.equal(compiler().status, 3);
  assert.match(compiler().stderr, /unities\.json: not valid JSON/);
});

test("a configuration that is not an object, or whose rules are not a map, is refused by name", () => {
  const { dir, write } = repo();
  const cases = [
    ["null", /unities\.json must hold a JSON object/],
    ["[]", /unities\.json must hold a JSON object/],
    ["5", /unities\.json must hold a JSON object/],
    [JSON.stringify({ ...FIXTURE, rules: null }), /unities\.json: rules must be a map from role to regular expression/],
    [JSON.stringify({ ...FIXTURE, rules: ["^src/"] }), /unities\.json: rules must be a map/],
    [JSON.stringify({ ...FIXTURE, rules: "^src/" }), /unities\.json: rules must be a map/],
  ];
  for (const [text, message] of cases) {
    write(CONFIG, text);
    const result = run(dir, ["--staged"], { scene: "commit" });
    assert.equal(result.status, 2, text);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stderr, /TypeError|at readConfig/);
  }
});

test("a rule or releaseFiles that will not compile is refused by name, and a Stop lets go on its second pass", () => {
  const { dir, write } = repo();
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: active });
  write(CONFIG, JSON.stringify({ ...FIXTURE, rules: { ...FIXTURE.rules, source: "(" } }));
  const first = run(dir, ["--branch"], { scene: "commit", stdin: stop(false) });
  assert.equal(first.status, 2);
  assert.match(first.stderr, /unities\.json: rules\.source is not a valid regular expression: /);
  assert.doesNotMatch(first.stderr, /SyntaxError: Invalid regular expression: \/\(\/: Unterminated group\n\s+at /);
  const second = run(dir, ["--branch"], { scene: "commit", stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /rules\.source is not a valid regular expression/);
  // A role of the repository's own is held to the same.
  write(CONFIG, JSON.stringify({ ...FIXTURE, rules: { ...FIXTURE.rules, procedure: "[" } }));
  assert.match(run(dir, ["--pr", "main"]).stderr, /rules\.procedure is not a valid regular expression/);
  for (const [releaseFiles, message] of [
    [null, /releaseFiles must be a regular expression, as a string/],
    [3, /releaseFiles must be a regular expression, as a string/],
    ["(", /releaseFiles is not a valid regular expression/],
  ]) {
    write(CONFIG, JSON.stringify({ ...FIXTURE, releaseFiles }));
    const result = run(dir, ["--staged"], { scene: "commit" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, message);
  }
});

test("a run setting that is not a non-empty string is refused by name", () => {
  const { dir, write } = repo();
  for (const value of [5, "", "  ", null, ["deno"]]) {
    write(CONFIG, JSON.stringify({ ...FIXTURE, run: value }));
    const result = run(dir, ["--staged"], { scene: "commit" });
    assert.equal(result.status, 2, JSON.stringify(value));
    assert.match(result.stderr, /unities\.json: run must be the command that replaces "node", as a non-empty string/);
  }
});

test("the compilers stop on a configuration that is not an object, naming it", () => {
  const { dir, write } = repo();
  const record = () => spawnSync("node", ["scripts/compile-record.mjs", "--check"], { cwd: dir, encoding: "utf8" });
  const changelog = () => spawnSync("node", ["scripts/compile-changelog.mjs", "--dry-run"], { cwd: dir, encoding: "utf8" });
  for (const text of ["null", "[]", "7"]) {
    write(CONFIG, text);
    assert.equal(record().status, 3, text);
    assert.match(record().stderr, /unities\.json: must hold a JSON object/);
    assert.equal(changelog().status, 1, text);
    assert.match(changelog().stderr, /unities\.json: must hold a JSON object/);
  }
  write(CONFIG, "{ not json");
  assert.equal(changelog().status, 1);
  assert.match(changelog().stderr, /unities\.json: not valid JSON/);
  assert.doesNotMatch(changelog().stderr, /SyntaxError[^\n]*\n\s+at /);
  for (const recorded of [5, null, { text: "x" }]) {
    write(CONFIG, JSON.stringify({ ...FIXTURE, changelog: { recorded } }));
    assert.equal(changelog().status, 1, JSON.stringify(recorded));
    assert.match(changelog().stderr, /unities\.json: changelog\.recorded must be a string/);
  }
});

test("no planted script starts a program through a shell", () => {
  for (const file of [hook, compiler, recordCompiler]) {
    const text = readFileSync(file, "utf8");
    // child_process's exec, execSync and a shell option; a regular expression's .exec is not one.
    assert.doesNotMatch(text, /\bexecSync\b|(?<!\.)\bexec\(|shell:\s*true/, file);
  }
});

// Appendix H's Deno line for the gate. Under Deno a program the gate starts must be
// allowed by name, and the environment is read whole because a child is given all of it.
const DENO_GATE = ["run", "--allow-run=git,deno", "--allow-read", "--allow-env"];
const deno = spawnSync("deno", ["--version"], { encoding: "utf8" });
test("under Deno, with Appendix H's permissions, the gate refuses an incomplete scene and passes a complete one",
  { skip: deno.error ? "Deno is not installed here" : false }, () => {
  const { dir, git, write, compile } = repo({ config: { ...FIXTURE, run: "deno run --allow-read --allow-write=docs" } });
  const gate = args => spawnSync("deno", [...DENO_GATE, join(dir, ".claude/hooks/check-unit.mjs"), ...args],
    { cwd: dir, input: "", encoding: "utf8", env: { ...process.env, UNITIES_SCENE: "commit" } });
  write(SOURCE, "changed\n");
  git("add -A");
  const incomplete = gate(["--staged"]);
  assert.equal(incomplete.status, 2, incomplete.stderr);
  assert.match(incomplete.stderr, /Incomplete scene: no test change/);
  assert.doesNotMatch(incomplete.stderr, /NotCapable|Requires|Command failed/);
  complete(write);
  compile();
  git("add -A");
  const ok = gate(["--staged"]);
  assert.equal(ok.status, 0, ok.stderr);
  // The record compiler runs under Deno, through "run": a decision not yet compiled is refused.
  write(TASK, `${readFileSync(join(dir, TASK), "utf8")}\n## Decisions\n\n### 2026-11-24 · A choice\n\n**Decision** — this\n**Rejected** — that\n**Why** — because\n`);
  git("add -A");
  const stale = gate(["--staged"]);
  assert.equal(stale.status, 2, stale.stderr);
  assert.match(stale.stderr, /compiled record is out of date/);
  // Without "run" the compilers would be started with node, which Deno does not allow:
  // refused, naming run, not passed unchecked.
  write(CONFIG, JSON.stringify(FIXTURE));
  git("add -A");
  const unset = gate(["--staged"]);
  assert.equal(unset.status, 2, unset.stderr);
  assert.match(unset.stderr, /record compiler could not be run \(`node scripts\/compile-record\.mjs --check` was not allowed to start \(under Deno, --allow-run must name it\)\); check "run"/);
});

// The gate run by hand from a script or an agent's shell, whose stdin is a pipe held open
// and never written to. Killed after ten seconds, so a gate that waits shows as a failure.
function runWithOpenStdin(dir, args, { scene = "pr", written = "" } = {}) {
  return new Promise(resolve => {
    const child = spawn("node", [hook, ...args], { cwd: dir, env: { ...process.env, UNITIES_SCENE: scene } });
    if (written) child.stdin.write(written);
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);
    const killer = setTimeout(() => child.kill(), 10_000);
    child.on("close", (status, signal) => {
      clearTimeout(killer);
      child.stdin.destroy();
      resolve({ status, signal, stdout, stderr });
    });
  });
}

test("with stdin held open and never written, every mode answers instead of waiting", async () => {
  const { dir, git, write } = repo();
  for (const [args, scene] of [[["--branch"], "commit"], [["--staged"], "commit"], [["--branch", "main"], "pr"], [["--pr", "main"], "pr"]]) {
    const result = await runWithOpenStdin(dir, args, { scene });
    assert.equal(result.signal, null, `${args.join(" ")} (${scene}) was killed waiting on stdin`);
    assert.equal(result.status, 0, result.stderr);
    // --pr never reads stdin, so it has nothing to say about it.
    if (args[0] === "--pr") assert.doesNotMatch(result.stderr, /stdin stayed open/);
    else assert.match(result.stderr, /stdin stayed open with no hook input/);
  }
  // Part of a hook's JSON, then silence: the gate does not wait for the rest, and says so.
  const partial = await runWithOpenStdin(dir, ["--branch"], { scene: "commit", written: '{"hook_event_name":' });
  assert.equal(partial.signal, null, "partial input held open was killed waiting on stdin");
  assert.equal(partial.status, 0, partial.stderr);
  assert.match(partial.stderr, /stdin stayed open with an unfinished hook input/);
  // A whole hook input with stdin left open is read: the second Stop pass lets go, as it does with stdin closed.
  write(SOURCE, "changed\n");
  const whole = await runWithOpenStdin(dir, ["--branch"], { scene: "commit", written: JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: true }) });
  assert.equal(whole.signal, null);
  assert.equal(whole.status, 0, whole.stderr);
  assert.match(JSON.parse(whole.stdout).systemMessage, /Incomplete scene/);
  assert.doesNotMatch(whole.stderr, /stdin stayed open/);
  // Without a hook's JSON the gate goes on as a run by hand: an incomplete scene is still refused.
  write(SOURCE, "changed\n");
  git("add -A");
  const staged = await runWithOpenStdin(dir, ["--staged"], { scene: "commit" });
  assert.equal(staged.signal, null);
  assert.equal(staged.status, 2);
  assert.match(staged.stderr, /Incomplete scene/);
});

// ---- CRLF line endings and a byte-order mark are not content ----

const crlf = text => text.replace(/\n/g, "\r\n");
const BOM = "\uFEFF";
const FORMS = [crlf, text => BOM + text, text => BOM + crlf(text)];

test("a task file with CRLF line endings or a byte-order mark compiles to the same record", () => {
  const text = taskWith(decision("2026-11-11", "One file per unit", "Milestone: After 03: sync proven\n"));
  const compiled = (t) => {
    const { write, compile, read } = repo();
    write(TASK, t);
    compile();
    return read(DECISIONS) + read(PLAN);
  };
  const plain = compiled(text);
  assert.match(plain, /## D1 · 2026-11-11 · One file per unit/);
  assert.match(plain, /- After 03: sync proven \(D1\)/);
  for (const form of FORMS) assert.equal(compiled(form(text)), plain);
});

test("compiled files checked out with CRLF are still equal to the compiler's output", () => {
  const { dir, write, compile, read } = repo();
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  compile();
  write(DECISIONS, crlf(read(DECISIONS)));
  write(PLAN, crlf(read(PLAN)));
  assert.equal(spawnSync("node", ["scripts/compile-record.mjs", "--check"], { cwd: dir }).status, 0);
});

test("a record committed with CRLF line endings or a byte-order mark compiles to the same changelog entry", () => {
  const text = "# t\n\n## What was done\n\ndone\nsecond line\n\nReviewed by: a reader\n";
  const entry = (t) => {
    const { dir, git, write, commit } = repo();
    git("config core.autocrlf false");
    write(SOURCE, "changed\n");
    write(TEST, "test\n");
    write(DOC, "documented\n");
    write(TASK, t);
    commit("feature");
    const out = execSync("node scripts/compile-changelog.mjs --dry-run --since v0", { cwd: dir, encoding: "utf8" });
    return out.replace(/`[0-9a-f]{7,}`/g, "`hash`");
  };
  const plain = entry(text);
  assert.match(plain, /### t\n\ndone\nsecond line\n\nRecorded in `hash`\./);
  for (const form of FORMS) assert.equal(entry(form(text)), plain);
});

test("the gate reads a task file with CRLF line endings or a byte-order mark as it reads LF", () => {
  const texts = {
    outcome: "# t\n\n## Context\n\n**Acceptance**\n\n- [ ] new schema is running in production\n\n## What was done\n\ndone\n\nReviewed by: a reader\n",
    read: "# t\n\n## What was done\n\ndone\n\nReviewed by: a reader\n",
    unread: "# t\n\n## What was done\n\ndone\n",
    open: review(item([`- [x] rows created → removed`, `- [ ] rows never sent → stay`])),
    shapeless: review("### No parts\n\nfix it\n"),
  };
  const pr = (t) => {
    const { dir, git, write, commit } = repo();
    git("config core.autocrlf false");
    git("checkout -q -b feature");
    write(SOURCE, "changed\n");
    write(TEST, "test\n");
    write(DOC, "documented\n");
    write(TASK, t);
    commit("record");
    const result = run(dir, ["--pr", "main"]);
    return `${result.status}\n${result.stderr}`;
  };
  const plain = Object.fromEntries(Object.entries(texts).map(([name, t]) => [name, pr(t)]));
  assert.match(plain.outcome, /names an outcome/);
  assert.match(plain.read, /^0\n/);
  assert.match(plain.unread, /no "Reviewed by:" line/);
  assert.match(plain.open, /is still open/);
  assert.match(plain.shapeless, /^1\n/);
  for (const form of FORMS)
    for (const [name, t] of Object.entries(texts)) assert.equal(pr(form(t)), plain[name], name);
});

// ---- a touched task file is not a recorded scene ----

const OPENED = "# t\n\n## Context\n\nasked\n\n**Acceptance**\n\n- [ ] script: it works\n";
const RECORDED = OPENED + "\n## What was done\n\ndone\n\nReviewed by: a reader\n";
const unrecorded = (write, task = OPENED) => {
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, task);
};

test("adapted: source with its test, doc and a touched task file but no record is refused at the pull request, and only warned of at the commit", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  unrecorded(write);
  git("add -A");
  const staged = run(dir, ["--staged"]);
  assert.equal(staged.status, 0);
  assert.match(staged.stderr, /no record: /);
  commit("no-record");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no record: a task file changed but no "## What was done" section was added/);
  write(TASK, RECORDED);
  commit("record");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
});

test("strict: the same scene is refused at the commit and at the end of the turn, and passes once the record is added", () => {
  const { dir, git, write, compile } = repo();
  unrecorded(write);
  compile();
  git("add -A");
  for (const mode of ["--staged", "--branch"]) {
    const result = run(dir, [mode], { scene: "commit" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /no record: /);
    assert.doesNotMatch(result.stderr, /out of date|no \w+ change/);   // the record is all that is missing
  }
  write(TASK, RECORDED);
  compile();
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 0);
});

test("a record the base already held is not this scene's: a line added elsewhere in that task file is refused", () => {
  const { dir, git, write, commit } = repo();
  write(TASK, RECORDED);
  commit("an-earlier-scene");
  git("checkout -q -b feature");
  unrecorded(write, RECORDED.replace("asked", "asked, and one more line"));
  commit("touched");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no record: /);
});

test("a scene that only opens a task, and changes no source, passes in both stagings", () => {
  let r = repo();
  r.git("checkout -q -b feature");
  r.write(TASK, OPENED);
  r.commit("open-a-task");
  assert.equal(run(r.dir, ["--pr", "main"]).status, 0);
  r = repo();
  r.write(TASK, OPENED);
  r.compile();
  r.git("add -A");
  assert.equal(run(r.dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("a role held to a task change is held to a record; a role held to less is not", () => {
  const config = { ...FIXTURE, rules: { ...FIXTURE.rules, procedure: "^procedure/", notes: "^notes/" },
    required: { source: ["test", "doc", "task"], procedure: ["doc", "task"], notes: ["doc"] } };
  let r = repo({ config });
  r.git("checkout -q -b feature");
  r.write("procedure/RUNBOOK.md", "a step\n");
  r.write(DOC, "documented\n");
  r.write(TASK, OPENED);
  r.commit("procedure");
  const result = run(r.dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no record: /);
  r = repo({ config });
  r.git("checkout -q -b feature");
  r.write("notes/n.md", "a note\n");
  r.write(DOC, "documented\n");
  r.write(TASK, OPENED);
  r.commit("notes");
  assert.equal(run(r.dir, ["--pr", "main"]).status, 0);
});
