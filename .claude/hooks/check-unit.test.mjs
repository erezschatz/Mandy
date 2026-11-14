// deno task hooks:test
// The check script and the record compiler, driven in throwaway git
// repositories. docs/UNITIES.md's Appendix J, cut to this repo's staging: the
// commit is the scene (--staged refuses), the Stop hook only reports (--tree
// never refuses), CHANGELOG.md is a hand-written doc line, and there is no pull
// request gate and no release — so none of Appendix J's --pr, release or
// adapted-mode tests apply. What is left pins what this repo depends on.
// Four asserts by hand rather than jsr:@std/assert: the project adds no
// dependency without flagging it (CLAUDE.md, Commands), and these need none.
const assert = (ok, msg = "assertion failed") => { if (!ok) throw new Error(msg); };
const assertEquals = (a, b, msg = "") => assert(a === b, `${JSON.stringify(a)} !== ${JSON.stringify(b)} ${msg}`);
const assertMatch = (s, re) => assert(re.test(s), `${JSON.stringify(s)} does not match ${re}`);
const assertStringIncludes = (s, part) => assert(s.includes(part), `${JSON.stringify(s)} does not include ${JSON.stringify(part)}`);

// ---- one path in each role, matching RULES in check-unit.mjs ----
const SOURCE = "front/x.js";
const TEST = "tests/x.test.mjs";
const DOC = "CHANGELOG.md";
const TASK = "tasks/9.9-t.md";
const RETIRED = "docs/TODO.md";
const DECISIONS = "docs/DECISIONS.md";
const PLAN = "docs/PLAN.md";
// -----------------------------------------------------------------

const here = new URL(".", import.meta.url).pathname;
const hook = `${here}check-unit.mjs`;
const compiler = `${here}../../scripts/compile-record.mjs`;
const text = new TextDecoder();

function sh(cwd, cmd, args) {
  const r = new Deno.Command(cmd, { args, cwd, stdout: "piped", stderr: "piped" }).outputSync();
  if (!r.success) throw new Error(`${cmd} ${args.join(" ")}: ${text.decode(r.stderr)}`);
  return text.decode(r.stdout);
}

// A repo that has adopted the hook, with D0–D9-style hand-written decisions above
// the marker and a compiled record committed.
function repo() {
  const dir = Deno.makeTempDirSync({ prefix: "check-unit-" });
  const git = (...args) => sh(dir, "git", args);
  const write = (file, body) => {
    Deno.mkdirSync(`${dir}/${file.split("/").slice(0, -1).join("/") || "."}`, { recursive: true });
    Deno.writeTextFileSync(`${dir}/${file}`, body);
  };
  const read = file => Deno.readTextFileSync(`${dir}/${file}`);
  const remove = file => Deno.removeSync(`${dir}/${file}`);
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  write(SOURCE, "base\n");
  write(DOC, "# Changelog\n");
  write(RETIRED, "# TODO — retired\n\nTasks now live in tasks/.\n");
  write(DECISIONS, "# Decisions\n\n## D0. First\n\nbody\n\n## D9. Last by hand\n\nbody\n");
  write(PLAN, "# Plan\n\nHand-written head.\n");
  write("tasks/1.1-old.md", "# Old\n\n## Context\n\nold\n\n## What was done\n\nlong ago, no reader\n");
  write(".claude/hooks/check-unit.mjs", Deno.readTextFileSync(hook));
  write("scripts/compile-record.mjs", Deno.readTextFileSync(compiler));
  const compile = () => sh(dir, "deno", ["run", "--quiet", "--allow-read", "--allow-write=docs", "scripts/compile-record.mjs"]);
  compile();
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  const stage = () => git("add", "-A");
  const commit = () => { stage(); git("commit", "-q", "-m", "next"); };
  return { dir, git, write, read, remove, compile, stage, commit };
}

function run(dir, mode, stdin = "") {
  const child = new Deno.Command("deno", {
    args: ["run", "--quiet", "--allow-run=git,deno", "--allow-read", hook, mode],
    cwd: dir, stdin: "piped", stdout: "piped", stderr: "piped",
  }).spawn();
  const w = child.stdin.getWriter();
  w.write(new TextEncoder().encode(stdin));
  w.close();
  return child.output().then(r => ({ code: r.code, out: text.decode(r.stdout), err: text.decode(r.stderr) }));
}

const record = (extra = "") =>
  `# T\n\n## Context\n\nasked\n${extra}\n## What was done\n\ndone\n\nReviewed by: a reader\n`;
const complete = r => {
  r.write(SOURCE, "changed\n");
  r.write(DOC, "# Changelog\n\nentry\n");
  r.write(TASK, record());
  r.compile();
};

// ---- the scene ----

Deno.test("a commit that changes source without its record is refused", async () => {
  const r = repo();
  r.write(SOURCE, "changed\n");
  r.stage();
  const res = await run(r.dir, "--staged");
  assertEquals(res.code, 2);
  assertMatch(res.err, /no doc change.*no task change/);
});

Deno.test("a commit carrying doc line, task record and compiled record passes, with the test note", async () => {
  const r = repo();
  complete(r);
  r.stage();
  const res = await run(r.dir, "--staged");
  assertEquals(res.code, 0, res.err);
  assertStringIncludes(res.err, "no test change");
});

Deno.test("the Stop report never refuses, however incomplete the tree", async () => {
  const r = repo();
  r.write(SOURCE, "changed\n");
  const res = await run(r.dir, "--tree", JSON.stringify({ hook_event_name: "Stop", cwd: r.dir }));
  assertEquals(res.code, 0);
  assertMatch(JSON.parse(res.out).systemMessage, /Incomplete scene \(tree\)/);
});

Deno.test("PreToolUse lets a shell command that is not a commit through", async () => {
  const r = repo();
  r.write(SOURCE, "changed\n");
  r.stage();
  const res = await run(r.dir, "--staged",
    JSON.stringify({ hook_event_name: "PreToolUse", cwd: r.dir, tool_input: { command: "git status" } }));
  assertEquals(res.code, 0);
  const commit = await run(r.dir, "--staged",
    JSON.stringify({ hook_event_name: "PreToolUse", cwd: r.dir, tool_input: { command: "git commit -m x" } }));
  assertEquals(commit.code, 2);
});

Deno.test("the retired TODO may be deleted but not edited", async () => {
  const r = repo();
  r.write(RETIRED, "# TODO — retired\n\nedited\n");
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 2);
  r.git("checkout", "-q", "--", RETIRED);
  r.git("reset", "-q");
  r.remove(RETIRED);
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 0);
});

// ---- the record ----

Deno.test("a record without a Reviewed by line is refused; earlier and migrated ones are not asked", async () => {
  const r = repo();
  r.write(TASK, "# T\n\n## Context\n\nasked\n\n## What was done\n\ndone\n");
  r.compile();
  r.stage();
  const res = await run(r.dir, "--staged");
  assertEquals(res.code, 2);
  assertStringIncludes(res.err, "Reviewed by:");
  r.write(TASK, "# T\n\n## Context\n\nMigrated from docs/TODO.md on 2026-10-19.\n\n## What was done\n\nDone before adoption; no record.\n");
  r.compile();
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 0);
  // tasks/1.1-old.md has a reader-less record from before; touching its context is fine.
  r.write("tasks/1.1-old.md", r.read("tasks/1.1-old.md").replace("old\n", "old, clarified\n"));
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 0);
});

Deno.test("a record appended under an older reader-less one is judged alone", async () => {
  const r = repo();
  const old = r.read("tasks/1.1-old.md");
  // Same heading as the old record, so the heading cannot tell them apart.
  r.write("tasks/1.1-old.md", `${old}\n## What was done\n\nstage 2\n`);
  r.stage();
  const res = await run(r.dir, "--staged");
  assertEquals(res.code, 2);
  assertEquals(res.err.match(/no "Reviewed by:" line/g)?.length, 1, res.err);
  r.write("tasks/1.1-old.md", `${old}\n## What was done\n\nstage 2\n\nReviewed by: a reader\n`);
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 0);
});

Deno.test("an acceptance box that names an outcome is refused; a check passes", async () => {
  const r = repo();
  r.write(TASK, record("\n- [ ] users have switched to the new editor\n"));
  r.compile();
  r.stage();
  const res = await run(r.dir, "--staged");
  assertEquals(res.code, 2);
  assertStringIncludes(res.err, "names an outcome");
  r.write(TASK, record("\n- [ ] the model suite passes on the new fixture\n"));
  r.compile();
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 0);
});

Deno.test("a review item names its cases as case → outcome, and what was not asked", async () => {
  const r = repo();
  const review = items => `${record()}\n## Review · 2026-11-14\n\n### Caret\n\n${items}`;
  r.write(TASK, review("**Found** — x\n\n**Done when**\n\n- [ ] keep only the caret\n"));
  r.compile();
  r.stage();
  const res = await run(r.dir, "--staged");
  assertEquals(res.code, 2);
  assertMatch(res.err, /Not asked/);
  assertMatch(res.err, /not "case → outcome"/);
  r.write(TASK, review("**Found** — x\n\n**Done when**\n\n- [ ] caret at a block's end → stays there\n\n**Not asked** — nothing new\n"));
  r.compile();
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 0);
});

// ---- the compiled record ----

Deno.test("a decision takes the number after the hand-written D9, and keeps it", () => {
  const r = repo();
  r.write(TASK, "# T\n\n## Decisions\n\n### 2026-11-14 · Second\n\n**Decision** — b\n");
  r.write("tasks/0.1-first.md", "# F\n\n## Decisions\n\n### 2026-11-13 · First\n\n**Decision** — a\n");
  r.compile();
  const out = r.read(DECISIONS);
  assertStringIncludes(out, "## D10 · 2026-11-13 · First");
  assertStringIncludes(out, "## D11 · 2026-11-14 · Second");
  assert(out.startsWith("# Decisions\n\n## D0. First"), "the hand-written head is untouched");
  r.write("tasks/0.0-earlier.md", "# E\n\n## Decisions\n\n### 2026-11-01 · Earlier\n\n**Decision** — c\n");
  r.compile();
  const again = r.read(DECISIONS);
  assertStringIncludes(again, "## D10 · 2026-11-13 · First");
  assertStringIncludes(again, "## D12 · 2026-11-01 · Earlier");
});

Deno.test("a superseded decision's plan lines leave the plan", () => {
  const r = repo();
  r.write(TASK, "# T\n\n## Decisions\n\n### 2026-11-13 · A\n\nMilestone: After 3.1: the model core on main\nNot in scope: Mermaid\n");
  r.compile();
  assertStringIncludes(r.read(PLAN), "- After 3.1: the model core on main (D10)");
  r.write(TASK, r.read(TASK) + "\n### 2026-11-14 · B\n\nSupersedes: D10\nNot in scope: Mermaid\n");
  r.compile();
  const plan = r.read(PLAN);
  assert(!plan.includes("model core on main"));
  assertStringIncludes(plan, "- Mermaid (D11)");
});

Deno.test("a task is open, in progress, or done by its last record's Status line", () => {
  const r = repo();
  r.write("tasks/2.1-open.md", "# Open\n\n## Context\n\nx\n");
  r.write("tasks/2.2-going.md", "# Going\n\n## What was done\n\nstage 1\n\n## What was done\n\nstage 2\n");
  r.write("tasks/2.3-closed.md", "# Closed\n\n## What was done\n\nStatus: done\n\n## What was done\n\nfinal\n\nStatus: done\n");
  r.write("tasks/2.4-reopened.md", "# Reopened\n\n## What was done\n\nStatus: done\n\n## What was done\n\nreopened\n");
  r.compile();
  const plan = r.read(PLAN);
  assertMatch(plan, /— Open\n/);
  assertMatch(plan, /— Going · in progress\n/);
  assertMatch(plan, /— Closed · done\n/);
  assertMatch(plan, /— Reopened · in progress\n/);
  assertMatch(plan, /\[1\.1-old\][^\n]*\n[^\n]*2\.1-open/, "file-name order, numerically");
});

Deno.test("a commit whose compiled record is stale, or compiled but unstaged, is refused", async () => {
  const r = repo();
  r.write(TASK, "# T\n\n## Decisions\n\n### 2026-11-14 · X\n\n**Decision** — x\n");
  r.git("add", TASK);
  const stale = await run(r.dir, "--staged");
  assertEquals(stale.code, 2);
  assertStringIncludes(stale.err, "out of date");
  r.compile();
  const unstaged = await run(r.dir, "--staged");
  assertEquals(unstaged.code, 2);
  assertStringIncludes(unstaged.err, "not staged");
  r.stage();
  assertEquals((await run(r.dir, "--staged")).code, 0);
});

Deno.test("the hand-written head may not be edited, and a compiled decision may not be removed", async () => {
  const r = repo();
  r.write(TASK, "# T\n\n## Decisions\n\n### 2026-11-14 · X\n\n**Decision** — x\n");
  r.compile();
  r.commit();
  r.write(DECISIONS, r.read(DECISIONS).replace("## D9. Last by hand", "## D9. Renamed"));
  r.stage();
  const head = await run(r.dir, "--staged");
  assertEquals(head.code, 2);
  assertStringIncludes(head.err, "hand-written head");
  r.git("checkout", "-q", "HEAD", "--", DECISIONS);
  r.write(TASK, "# T\n\n## Decisions\n\n### 2026-11-14 · Y\n\n**Decision** — x\n");
  r.stage();
  const gone = await run(r.dir, "--staged");
  assertEquals(gone.code, 2);
  assertStringIncludes(gone.err, "no task file carries it any more");
});

Deno.test("the compiled record is not a doc line", async () => {
  const r = repo();
  r.write(SOURCE, "changed\n");
  r.write(TASK, "# T\n\n## Decisions\n\n### 2026-11-14 · X\n\n**Decision** — x\n");
  r.compile();
  r.stage();
  const res = await run(r.dir, "--staged");
  assertEquals(res.code, 2);
  assertStringIncludes(res.err, "no doc change");
});
