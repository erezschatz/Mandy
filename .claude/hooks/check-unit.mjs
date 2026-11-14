// A change set is a complete scene or it is not ready to commit. See "The
// Unities" in CLAUDE.md, tasks/adopt-unities.md and docs/UNITIES.md (whose
// Appendix A this follows, in Deno and in this repo's staging).
//   --staged : what `git commit` is about to record   (PreToolUse, .githooks/pre-commit)
//              refuses an incomplete scene
//   --tree   : everything uncommitted in the tree      (Stop)
//              reports and never refuses — a turn that stops to ask a question
//              mid-change is how work goes here, not a half-scene
// Run with `deno run --allow-run=git,deno --allow-read`. Deno-native on purpose:
// node:child_process under Deno also wants --allow-env, and without it every git
// call threw — which a Stop hook reports as nothing at all.

// spike/ is throwaway by design, and server/deno.json and the lockfiles change
// from ncu runs outside any one task, so none of them counts as source.
// CHANGELOG.md is a doc line because it is still written by hand, one entry per
// commit — the compiler that would take it over is deferred (tasks/adopt-unities.md).
const RULES = {
  source: /^(front\/|server\/src\/)/,
  test: /^tests\//,
  doc: /^(docs\/(?!TODO\.md$)|README\.md$|CLAUDE\.md$|CHANGELOG\.md$)/,
  task: /^tasks\/(?!README\.md$)[^/_][^/]*\.md$/,
  retired: /^docs\/TODO\.md$/,
};
const REQUIRED = ["doc", "task"];
// Noted, never required: a change no suite can reach says so and gives a
// browser recipe instead (CLAUDE.md, Tests).
const ADVISED = ["test"];
// docs/DECISIONS.md and docs/PLAN.md are compiled from the task files by
// scripts/compile-record.mjs. Nobody writes below the marker by hand, and they
// count toward no role.
const RECORD_FILES = /^docs\/(DECISIONS|PLAN)\.md$/;
const RECORD_COMPILER = "scripts/compile-record.mjs";
const RECORD_MARKER = "<!-- Compiled from tasks/ by scripts/compile-record.mjs.";
// An acceptance box names the assignee's check, before the task closes. One whose
// subject is the user, customers, adoption or production, or whose verb is a
// continuing state, is an outcome: a promise or a plan milestone, never a gate.
const ACCEPTANCE_FORBIDDEN = /^(the |an? |all |active |end[- ])*(user|users|customer|customers|production|prod)\b|\b(is|are|was|were) (running|live|in use|using|deployed)\b|\b(has|have) (replaced|adopted|switched|migrated)\b|\b(started?|starts) (to use|using)\b|\bin production\b|\b(by|from) (active |real |the )?(users?|customers?)\b|\bactive users\b|\buninstall(ed|s)? the old\b/i;
// A record is read cold before it is committed. The gate cannot judge the
// reading; it checks that one is named.
const REVIEW = /^Reviewed by:\s*\S/m;
const REVIEW_SECTION = /^## Review\b/;
const REVIEW_EXEMPT = /^(Done before adoption; no record\.|Migrated from )/m;

const mode = Deno.args[0] ?? "--tree";
const input = Deno.stdin.isTerminal() ? {} : JSON.parse((await new Response(Deno.stdin.readable).text()) || "{}");
const event = input.hook_event_name;
const cwd = input.cwd ?? Deno.cwd();
const text = new TextDecoder();
const lines = s => s.split("\n").map(l => l.trim()).filter(Boolean);

let result;
try {
  result = check();
} catch (e) {
  // A gate that cannot run must not open silently: refuse at commit, say so at Stop.
  result = { message: `check-unit.mjs failed to run: ${e?.message ?? e}`, refuse: mode === "--staged" };
}
if (!result) Deno.exit(0);
if (!result.refuse) {
  if (event) console.log(JSON.stringify({ systemMessage: result.message }));
  else console.error(result.message);
  Deno.exit(0);
}
// A PreToolUse command hook blocks the tool call on exit 2 and hands stderr to
// the agent; git refuses the commit on any non-zero exit.
console.error(result.message);
Deno.exit(2);

function check() {
  // PreToolUse sees every Bash call; only a commit is a scene boundary.
  const command = input.tool_input?.command ?? "";
  if (event === "PreToolUse" && !/\bgit\s+(?:-[cC]\s+\S+\s+|--?[\w-]+(?:=\S+)?\s+)*commit\b/.test(command))
    return null;

  const staged = mode === "--staged";
  const clean = f => f.replace(/^"|"$/g, "");
  let files, deleted;
  if (staged) {
    files = lines(git("diff", "--cached", "--name-only")).map(clean);
    deleted = lines(git("diff", "--cached", "--name-only", "--diff-filter=D")).map(clean);
    // A merge carries scenes recorded on the other branch. Only what the merge
    // commit itself writes — a file that differs from both parents — is new.
    if (gitOk("rev-parse", "-q", "--verify", "MERGE_HEAD")) {
      const fromTheirs = new Set(lines(git("diff", "--cached", "--name-only", "MERGE_HEAD")).map(clean));
      files = files.filter(f => fromTheirs.has(f));
    }
  } else {
    const status = git("status", "--porcelain=v1", "--untracked-files=all").split("\n").filter(Boolean);
    files = status.map(l => l.slice(3)).map(f => f.includes(" -> ") ? f.split(" -> ").pop() : f).map(clean);
    deleted = status.filter(l => l[0] === "D" || l[1] === "D").map(l => clean(l.slice(3)));
  }

  const has = re => files.some(f => re.test(f) && !RECORD_FILES.test(f));
  const missing = [];
  const advice = [];

  if (has(RULES.source)) {
    for (const role of REQUIRED)
      if (!has(RULES[role])) missing.push(`source changed with no ${role} change`);
    for (const role of ADVISED)
      if (!has(RULES[role])) advice.push(`source changed with no ${role} change — fine if no suite can reach it, but the CHANGELOG entry should then give the browser recipe`);
  }
  // A tombstone may be deleted, never edited.
  if (files.some(f => RULES.retired.test(f) && !deleted.includes(f)) && retiredAtHead())
    missing.push("docs/TODO.md is retired and was edited — the item lives in tasks/ now");

  // The compiled record. A file is compiled once its HEAD version carries the
  // marker; until then it is an ordinary file. The commit is also the merge here,
  // so a commit carries the compiler's output, staged.
  const record = files.filter(f => RECORD_FILES.test(f) && head(show(f)) !== null);
  if (files.length && exists(RECORD_COMPILER)) {
    const run = new Deno.Command("deno", {
      args: ["run", "--quiet", "--allow-read", RECORD_COMPILER, "--check"], cwd, stdout: "piped", stderr: "piped",
    }).outputSync();
    const err = text.decode(run.stderr).trim();
    if (run.code === 3) missing.push(err);
    else if (run.code === 1) missing.push(`compiled record is out of date: ${err}`);
    else if (run.code !== 0) throw new Error(`${RECORD_COMPILER} --check: ${err || `exit ${run.code}`}`);
    for (const f of record)
      if (deleted.includes(f)) missing.push(`compiled record deleted: ${f}`);
      else if (head(show(f)) !== head(contents(f)))
        missing.push(`the hand-written head of ${f} was edited; everything in it is changed by a new decision in a task file`);
    if (staged && run.code === 0) {
      const unstaged = lines(git("diff", "--name-only")).filter(f => RECORD_FILES.test(f));
      if (unstaged.length) missing.push(`compiled record not staged: ${unstaged.join(", ")}`);
    }
  }

  for (const f of files.filter(f => RULES.task.test(f) && !deleted.includes(f))) {
    const body = contents(f);
    // A section is this scene's when HEAD has no section with the same text: every
    // record's heading reads "## What was done", so a heading cannot say which.
    const before = new Set(sectionsOf(show(f)));
    // Acceptance boxes in the task files this scene touches.
    let heading = "";
    for (const line of body.split("\n")) {
      if (/^## /.test(line)) heading = line;
      const m = /^\s*[-*] \[[ xX]\]\s+(.+)$/.exec(line);
      // "Done when" boxes of a review describe behaviour and may well start with "the user".
      if (m && !REVIEW_SECTION.test(heading) && ACCEPTANCE_FORBIDDEN.test(m[1].trim()))
        missing.push(`acceptance box in ${f} names an outcome, not a check: "${m[1].trim()}" (make it the promise or a PLAN.md milestone)`);
    }
    const sections = sectionsOf(body);
    // Every record this scene adds names its cold reader.
    for (const section of sections) {
      if (!/^## What was done/.test(section) || before.has(section)) continue;
      if (!REVIEW.test(section) && !REVIEW_EXEMPT.test(section))
        missing.push(`record in ${f} has no "Reviewed by:" line (a reader that has not seen the work read the diff against it)`);
    }
    // Every review round this scene adds: each item says what was found, when it
    // is done (one box per case, as "case → outcome") and what was not asked.
    for (const section of sections) {
      if (!REVIEW_SECTION.test(section) || before.has(section)) continue;
      for (const item of section.split(/^(?=### )/m).slice(1)) {
        const name = item.split("\n")[0].replace(/^### /, "").trim();
        const doneWhen = item.split(/^\*\*Done when\*\*/m)[1]?.split(/^\*\*/m)[0] ?? "";
        const boxes = [...doneWhen.matchAll(/^\s*[-*] \[([ xX])\]\s+(.+)$/gm)];
        if (!/^\*\*Found\*\*/m.test(item) || !boxes.length || !/^\*\*Not asked\*\*/m.test(item))
          missing.push(`review item "${name}" in ${f} needs **Found**, **Done when** with a box per case, and **Not asked**`);
        for (const [, , line] of boxes)
          if (!line.includes("→")) missing.push(`review item "${name}" in ${f}: "${line.trim()}" is not "case → outcome"`);
      }
    }
  }

  if (missing.length === 0 && advice.length === 0) return null;

  const scope = mode.slice(2);
  const parts = [];
  if (missing.length) parts.push(`Incomplete scene (${scope}): ${missing.join("; ")}.`);
  if (advice.length) parts.push(`Note (${scope}): ${advice.join("; ")}.`);
  const refuse = staged && missing.length > 0;
  if (refuse) parts.push("Stage the record with the change, or unstage the change. `git commit --no-verify` is the escape hatch from a shell.");
  return { message: parts.join("\n"), refuse };

  function contents(file) {   // the file as this scene has it
    try {
      return staged ? git("show", `:${file}`) : Deno.readTextFileSync(`${cwd}/${file}`);
    } catch { return ""; }
  }
}

function show(file) {        // the file at HEAD; "" if absent
  try { return git("show", `HEAD:${file}`); } catch { return ""; }
}
function sectionsOf(content) {   // its `## ` sections, trimmed, so appending after one leaves it equal
  return content.split(/^(?=## )/m).map(s => s.trim());
}
function head(content) {     // the part above the compile marker; null if not compiled
  const i = content.indexOf(RECORD_MARKER);
  return i < 0 ? null : content.slice(0, i).trimEnd();
}
function exists(file) {
  try { Deno.statSync(`${cwd}/${file}`); return true; } catch { return false; }
}

function git(...args) {
  const { success, stdout, stderr } = new Deno.Command("git", { args: ["-C", cwd, ...args] }).outputSync();
  if (!success) throw new Error(text.decode(stderr).trim());
  return text.decode(stdout);
}
function gitOk(...args) {
  return new Deno.Command("git", { args: ["-C", cwd, ...args], stdout: "null", stderr: "null" }).outputSync().success;
}

// The commit that retires the file has to edit it; only the ones after it are
// refused.
function retiredAtHead() {
  try {
    return /^# TODO — retired/.test(git("show", "HEAD:docs/TODO.md"));
  } catch {
    return false;
  }
}
