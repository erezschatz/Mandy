// A change set is a complete scene or it is not ready to commit: source that
// changed with no doc line and no task record beside it, or the retired
// docs/TODO.md edited. See "The Unities" in CLAUDE.md and tasks/adopt-unities.md.
//   --staged : what `git commit` is about to record   (PreToolUse, .githooks/pre-commit)
//              refuses an incomplete scene
//   --tree   : everything uncommitted in the tree      (Stop)
//              reports and never refuses — a turn that stops to ask a question
//              mid-change is how work goes here, not a half-scene
// Run with `deno run --allow-run=git --allow-read`. Deno-native on purpose:
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

const mode = Deno.args[0] ?? "--tree";
const input = Deno.stdin.isTerminal() ? {} : JSON.parse((await new Response(Deno.stdin.readable).text()) || "{}");
const event = input.hook_event_name;
const cwd = input.cwd ?? Deno.cwd();

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

  const files = (mode === "--staged"
    ? git("diff", "--cached", "--name-only").split("\n")
    : git("status", "--porcelain=v1", "--untracked-files=all").split("\n").map(l => l.slice(3)))
    .filter(Boolean)
    .map(f => f.includes(" -> ") ? f.split(" -> ").pop() : f)
    .map(f => f.replace(/^"|"$/g, ""));

  const has = re => files.some(f => re.test(f));
  const missing = [];
  const advice = [];

  if (has(RULES.source)) {
    for (const role of REQUIRED)
      if (!has(RULES[role])) missing.push(`source changed with no ${role} change`);
    for (const role of ADVISED)
      if (!has(RULES[role])) advice.push(`source changed with no ${role} change — fine if no suite can reach it, but the CHANGELOG entry should then give the browser recipe`);
  }
  if (has(RULES.retired) && retiredAtHead())
    missing.push("docs/TODO.md is retired and was edited — the item lives in tasks/ now");

  if (missing.length === 0 && advice.length === 0) return null;

  const scope = mode.slice(2);
  const parts = [];
  if (missing.length) parts.push(`Incomplete scene (${scope}): ${missing.join("; ")}.`);
  if (advice.length) parts.push(`Note (${scope}): ${advice.join("; ")}.`);
  const refuse = mode === "--staged" && missing.length > 0;
  if (refuse) parts.push("Stage the record with the change, or unstage the change. `git commit --no-verify` is the escape hatch from a shell.");
  return { message: parts.join("\n"), refuse };
}

function git(...args) {
  const { success, stdout, stderr } = new Deno.Command("git", { args: ["-C", cwd, ...args] }).outputSync();
  const text = new TextDecoder();
  if (!success) throw new Error(text.decode(stderr).trim());
  return text.decode(stdout);
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
