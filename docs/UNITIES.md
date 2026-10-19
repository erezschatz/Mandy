# UNITIES.md — adopting the Unities in an existing repository

This file is a procedure, addressed to the agent that carries it out (Claude Code, or a
person). Planting it in `docs/` does nothing on its own. To apply it:

    claude
    > Read docs/UNITIES.md and carry it out.

It is safe to run more than once. Every step checks what already exists before writing,
so a second run on a migrated repo should change nothing.

Do **not** import this file into CLAUDE.md. It is a migration, not a standing rule. The
standing rule is one paragraph (Appendix E), and this procedure installs it.

---

## 0. The form, in one paragraph

The work, its record and its location are the same thing at the same time.

- **Place.** Everything the work consists of is a file in this repository. If `git diff`
  cannot see it, it is not on stage. Outside input (a request, an incident, a decision
  from a meeting) enters through one door: it becomes a task file on arrival.
- **Time.** The record is written in the same gesture as the change. Code, its test, its
  doc line and its task record are one commit. A change without its record is not a
  change with missing paperwork; it is a scene that did not happen.
- **Action.** There is one record. Task files are the record. `CHANGELOG.md`, task boards
  and status views are compiled from them and never edited by hand.

Everything below is one staging of that form with git, Node and Claude Code.

---

## 1. Contract for the agent carrying this out

1. **Discover before you write.** Phase 2 produces a report and a proposal. Nothing in the
   repo is modified until the person approves it. Stop and wait; do not proceed on
   silence.
2. **One scene.** The whole adoption is one commit, with its own task file
   (`tasks/adopt-unities.md`) that records what was done. If you cannot finish, revert;
   do not leave a half-migrated repo.
3. **Nothing is deleted.** Existing TODO, roadmap and changelog files are converted or
   retired in place with a pointer, never removed. History stays readable.
4. **Merge, don't clobber.** `.claude/settings.json`, husky hooks, `package.json`
   scripts and CLAUDE.md may already exist. Add to them; preserve what is there.
5. **Idempotent.** Before each write, check whether the target already carries the
   change (look for `check-unit.mjs` in hook config, for the `tasks/` folder, for the
   Unities paragraph in CLAUDE.md). Skip what is already done.
6. **Do not invent rules.** The role regexes in the check script come from what Phase 2
   finds, not from this document's examples.
7. **Do not guess at task content.** When converting TODO items, carry the text as
   written. Status, owner and history you cannot find are left absent, not fabricated.

---

## 2. Discover

Inventory the repository and write a short report to the person. Do not modify anything
in this phase.

### 2.1 Roles

Find where each role lives. There may be more than one location per role; there may be
none for some.

| Role | What to look for |
| --- | --- |
| source | `src/`, `lib/`, `app/`, `packages/*/src/`, language-specific layouts |
| test | `test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`, `e2e/` |
| doc | `docs/`, `README.md`, `*.md` next to code, ADR folders |
| task | `TODO.md`, `TASKS.md`, `ROADMAP.md`, `BACKLOG.md`, `docs/todo*`, issue-like folders |
| changelog | `CHANGELOG.md`, `HISTORY.md`, `CHANGES.md`, `changes/`, `.changeset/` |

Record the glob for each role as it actually is in this repo. These become `RULES` in
the check script.

### 2.2 Existing enforcement and conventions

- Hooks: `.husky/`, `.githooks/`, `git config core.hooksPath`, `.claude/settings.json`,
  `.claude/hooks/`, `lefthook.yml`, `.pre-commit-config.yaml`.
- Agent instructions: `CLAUDE.md`, `.claude/rules/`, `AGENTS.md`. Note size; a CLAUDE.md
  over a few hundred lines is a place to put *less*, not more.
- Changelog convention: heading style, whether entries carry commit hashes or PR links,
  whether a version heading exists for unreleased work.
- Release mechanism: git tags (`git tag --sort=-creatordate | head`), `version` in
  `package.json`, a release script, CI. The compiler needs a "since" boundary.
- Runtime. Use the one the repo already runs, not the one this document's examples use:
  `deno.json` → Deno; `bun.lockb` / `bunfig.toml` → Bun; otherwise Node (18+). The
  scripts in the appendices use only `node:` built-ins, which all three run; what
  changes is the invocation (see Appendix H) and where the git hook path is configured.
- Who commits. Does every commit go through the agent, or do commits also happen from a
  shell or an editor? This decides whether the git binding (3.3) is installed. The
  Claude Code bindings (3.2) are installed regardless; this is not a question.
- Definition-of-Done checklists in CLAUDE.md, PR templates or docs. These are what the
  hooks replace; note them for retirement.

### 2.3 The record to migrate

For each task-role file found, list its items. For each item capture: text as written,
apparent status (open / done / in progress, only if the file says so), any date, any
owner, any link. Produce a proposed mapping:

    TODO.md
      - [ ] Fix flaky parser test              -> tasks/fix-flaky-parser-test.md   (open)
      - [x] Migrate to ESM                      -> tasks/migrate-to-esm.md          (done, 2026-09-02)
    ROADMAP.md
      ## Q4: offline mode                       -> tasks/offline-mode.md            (open, roadmap)

Slugs: lowercase, hyphenated, from the item text, deduplicated. Group sub-bullets under
their parent item as the task's body, not as separate tasks, unless the person says
otherwise.

### 2.4 The report

Send the person, in this order:

1. The role table with the globs you found and the `RULES` you intend to write.
2. What enforcement already exists and how you will merge into it.
3. The changelog convention you found and how the compiler will match it.
4. The release boundary you will use (last tag / version / first commit).
5. The runtime you will invoke the scripts with, and whether the git binding will be
   installed (yes if any commit can happen outside the agent; otherwise ask).
6. The TODO → `tasks/` mapping, in full.
7. Anything you could not determine, as questions.

Then stop and wait for approval. The person may edit the mapping or the rules; carry
their edits, not your originals.

---

## 3. Install

After approval. All writes in this phase are new files or additive merges.

### 3.1 The check script

Write `.claude/hooks/check-unit.mjs` from Appendix A, with `RULES` filled from the
approved role table. If a role has several locations, join them in one regex. If a role
does not exist in this repo (no docs folder at all), leave it out of the `required`
list and say so in the report; do not invent a folder to satisfy the rule.

### 3.2 Claude Code wiring (always)

Merge Appendix B into `.claude/settings.json`, with `command` and `args` from Appendix H
for the repo's runtime. Create the file if absent. If a `PreToolUse` or `Stop` array
already exists, append the new matcher group; do not replace the array. Skip if an entry
already references `check-unit.mjs`.

These two bindings are not optional and do not depend on team size. The `Stop` hook
enforces unity of time on the agent, which is the party most likely to produce a fluent,
simultaneous, incomplete scene. A single developer is bound by it as much as a team;
there is nobody else to notice the skipped test.

### 3.3 Git wiring (when commits can happen outside the agent)

Install if Phase 2 found that commits happen, or may happen, from a shell, an editor or
CI. If every commit goes through Claude Code, this is a second lock on the same door;
record in the adoption task that it was deliberately left out and why, so it is added the
day a second person or a second tool appears.

Choose by what exists:

- `.husky/` present → append the pre-commit line from Appendix C to `.husky/pre-commit`.
- `lefthook` or `pre-commit` framework present → add the equivalent entry in its config.
- Node, none of the above → create `.githooks/pre-commit` from Appendix C, `chmod +x`,
  and add to `package.json`: `"prepare": "git config core.hooksPath .githooks"` (append
  to an existing `prepare` with `&&`). Run it once now.
- Deno or Bun → create `.githooks/pre-commit` from Appendix C; add a task
  (`deno task hooks` / `bun run hooks`) that runs `git config core.hooksPath .githooks`,
  mention it in the README's setup line, and run it once now.

`.git/hooks/` is not committed and is therefore not on stage; do not use it.

### 3.4 The record folder

Create `tasks/` with:

- `tasks/README.md` from Appendix D (what a task file is, the heading convention).
- `tasks/_template.md` from Appendix D.

### 3.5 The compiler

Write `scripts/compile-changelog.mjs` from Appendix F, adjusted to the changelog
convention found in 2.2 (heading level, hash or link format). Register it as the repo's
task runner knows: `"changelog": "node scripts/compile-changelog.mjs"` in `package.json`
scripts, or the Deno/Bun equivalent from Appendix H.

### 3.6 Standing instructions

Append Appendix E to CLAUDE.md as its own section, unless an equivalent paragraph is
already there. If CLAUDE.md contains a Definition-of-Done checklist that the hooks now
enforce, replace that checklist with one line pointing at the Unities section; keep any
items the hooks do not cover.

---

## 4. Migrate the record

### 4.1 Tasks

For each item in the approved mapping, write `tasks/<slug>.md` from the template:

- Title from the item text.
- `## Context` holding the original text and sub-bullets verbatim, plus
  `Migrated from <file> on <date>`.
- `## What was done` only for items the source marked done, holding whatever the source
  said about it (a date, a note, a hash). If the source says only "done", write
  `Done before adoption; no record.` Do not reconstruct history from git log into the
  task file; that is the compiler's job if ever needed.

Then retire the source file in place: replace its body with a short note —
`Tasks now live in tasks/, one file each. This file is kept for history; see git log.` —
and keep the original content below a horizontal rule so nothing is lost. If the person
preferred the file deleted, they will say so; default is retirement.

### 4.2 Changelog

Do not rewrite existing entries. At the top of `CHANGELOG.md`, directly under its title,
insert:

    <!-- Compiled from tasks/ by scripts/compile-changelog.mjs. Do not edit below this line by hand. -->

Everything above the previous first entry stays as it was. From this commit on, the
compiler is the only writer.

If the repo used `changes/` or `.changeset/` fragments: convert any pending fragments
into `## What was done` sections on their tasks (create the task if none matches), then
retire the fragments folder with a README pointer. Do not run two record systems.

### 4.3 The adoption task

Write `tasks/adopt-unities.md` with a `## What was done` section listing, in plain
sentences: which files were created, which merged, which retired, how many tasks were
migrated, and the release boundary chosen. This is the record of this scene.

---

## 5. Verify

Run, and include the output in the final report:

1. `node .claude/hooks/check-unit.mjs --tree` → must pass (no source files changed in
   this migration, so no roles are required; the `shared` rule must not fire — if it
   does, you edited `CHANGELOG.md` below the marker).
2. Simulate a violation: `touch <source-dir>/_unities_probe` then run `--tree` again →
   must exit 2 naming the missing roles. Remove the probe.
3. `node scripts/compile-changelog.mjs --dry-run` → must list the adoption task's
   record and nothing else (or nothing, if the boundary is HEAD).
4. If the git binding was installed: `git commit --dry-run` does not test hooks; instead
   stage the probe file plus nothing else and attempt a real commit, expect refusal,
   then unstage. If it was deliberately left out, verify instead that the `PreToolUse`
   gate refuses: stage the probe, ask the agent to commit, expect the denial.
5. Confirm `.claude/settings.json` parses and `/hooks` (or the settings file) lists both
   entries.

If any check fails, fix it before Phase 6. If it cannot be fixed, revert the working
tree and report why.

---

## 6. Commit

One commit. Message: `Adopt the Unities` followed by the same sentences as the adoption
task's record. Then tell the person:

- what the repo now enforces, in three lines (one per unity);
- the one command to compile a release (`npm run changelog -- <version>`);
- what remains manual: the reviewer before commit (Appendix G), and the decision to
  revert when the Stop hook reports a half-scene twice.

---

## Appendix A — `.claude/hooks/check-unit.mjs`

Fill `RULES` and `REQUIRED` from Phase 2. Everything else is fixed.

```js
#!/usr/bin/env node
// A change set is a complete scene or it is nothing.
//   --staged : what `git commit` is about to record   (PreToolUse, pre-commit)
//   --tree   : everything uncommitted in the tree      (Stop)
import { execSync } from "node:child_process";

// ---- per-repo: written by the adoption procedure from what it found ----
const RULES = {
  source: /^src\//,                         // e.g. /^(src|lib)\//
  test:   /^tests?\//,                      // e.g. /(^tests?\/|\.(test|spec)\.[cm]?[jt]sx?$)/
  doc:    /^(docs\/|README\.md$)/,
  task:   /^tasks\/[^/_][^/]*\.md$/,        // excludes _template.md
  shared: /^(CHANGELOG\.md|TODO\.md|TASKS\.md|ROADMAP\.md)$/,   // compiled or retired; never edited
};
const REQUIRED = ["test", "doc", "task"];  // roles a source change must be accompanied by
// -----------------------------------------------------------------------

const mode = process.argv[2] ?? "--tree";
const input = process.stdin.isTTY ? {} : JSON.parse((await readStdin()) || "{}");
const cwd = input.cwd ?? process.cwd();

const files = git(
  mode === "--staged"
    ? "diff --cached --name-only"
    : "status --porcelain=v1 --untracked-files=all"
)
  .split("\n").filter(Boolean)
  .map(l => (mode === "--staged" ? l : l.slice(3)).trim())
  .map(l => l.includes(" -> ") ? l.split(" -> ").pop() : l);   // renames

if (files.length === 0) process.exit(0);   // clean tree: a scene that ended, or never began

const has = re => files.some(f => re.test(f));
const missing = [];

if (has(RULES.source)) {
  for (const part of REQUIRED)
    if (!has(RULES[part])) missing.push(`no ${part} change`);
}
const shared = files.filter(f => RULES.shared.test(f));
if (shared.length) missing.push(`shared file edited directly: ${shared.join(", ")}`);

if (missing.length === 0) process.exit(0);

const reason =
  `Incomplete scene (${mode.slice(2)}): ${missing.join("; ")}.\n` +
  `Complete the record in this same change, or revert it. Do not leave it for later.`;

// Stop hook, second pass: the agent was already sent back once.
// Let the turn end, but make the half-scene visible to the person.
if (input.hook_event_name === "Stop" && input.stop_hook_active) {
  console.log(JSON.stringify({ systemMessage: reason }));
  process.exit(0);
}

console.error(reason);
process.exit(2);   // PreToolUse: deny the commit. Stop: send the agent back. pre-commit: refuse.

function git(args) {
  return execSync(`git ${args}`, { cwd, encoding: "utf8" });
}
function readStdin() {
  return new Promise(r => {
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => r(s));
  });
}
```

## Appendix B — `.claude/settings.json` (merge)

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "if": "Bash(git commit *)",
        "command": "node",
        "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/check-unit.mjs", "--staged"],
        "onFailure": "block"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node",
        "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/check-unit.mjs", "--tree"]
      }]
    }]
  }
}
```

## Appendix C — git pre-commit

`.githooks/pre-commit` (or the line to append to `.husky/pre-commit`). Replace the
invocation with the runtime's line from Appendix H:

```sh
#!/bin/sh
exec node "$(git rev-parse --show-toplevel)/.claude/hooks/check-unit.mjs" --staged
```

## Appendix D — `tasks/`

`tasks/README.md`:

```md
# tasks/

One file per task. Task files are the record; everything else (CHANGELOG.md, boards,
status) is compiled from them and never edited by hand.

A task file has:

- a title (H1);
- `## Context`: what was asked, by whom, where it came from — written when it arrived;
- `## What was done`: appended in the same commit as the change it describes, once,
  never edited afterwards. A task may accumulate several such sections over several
  commits; each is a separate entry in the compiled changelog.

Status is derived: no "what was done" → open; present → done; included in a compiled
release → shipped. There is no status field to keep in sync.

Outside input enters here and nowhere else. If it is not a task file, it did not arrive.
```

`tasks/_template.md`:

```md
# <title>

## Context

<what was asked, by whom, from where; date of arrival>

<!-- append below, in the same commit as the change; one section per change -->
```

## Appendix E — CLAUDE.md paragraph

```md
## The Unities

The work, its record and its location are the same thing at the same time. Every change
to source is one commit that also carries its test, its doc line and a `## What was done`
section appended to the task file in `tasks/`. This is enforced, not requested: a Stop
hook refuses to end a turn with a half-recorded change, and `git commit` refuses an
incomplete scene (`.claude/hooks/check-unit.mjs`). `CHANGELOG.md` is compiled from task
records at release (`npm run changelog -- <version>`) and is never edited by hand. If a
change cannot be completed with its record in this sitting, revert it; do not leave it
for later. Before committing, have a reader that has not seen the work check that the
task record describes the diff.
```

## Appendix F — `scripts/compile-changelog.mjs`

Adjust `formatEntry` to the repo's existing changelog convention.

```js
#!/usr/bin/env node
// compile-changelog <version> [--since <ref>] [--dry-run]
// The only writer CHANGELOG.md has. Reads "## What was done" sections added to tasks/
// since the last release and prepends them under a version heading.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry-run");
const sinceIdx = argv.indexOf("--since");
const version = argv.find(a => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--since");
if (!version && !dry) { console.error("usage: compile-changelog <version> [--since <ref>] [--dry-run]"); process.exit(1); }

const sh = c => execSync(c, { encoding: "utf8" }).trim();
const since = sinceIdx >= 0 ? argv[sinceIdx + 1]
  : (sh("git describe --tags --abbrev=0 2>/dev/null || true") || sh("git rev-list --max-parents=0 HEAD"));

const raw = sh(`git log --no-merges --format=%x1e%h%x1f%as -p ${since}..HEAD -- tasks/`);
const entries = [];                       // { file, hash, date, lines[] }

for (const chunk of raw.split("\x1e").filter(Boolean)) {
  const [head, ...rest] = chunk.split("\n");
  const [hash, date] = head.split("\x1f");
  let file = null, inSection = false, current = null;
  for (const line of rest) {
    if (line.startsWith("+++ b/")) { file = line.slice(6); inSection = false; current = null; continue; }
    if (!file || !file.startsWith("tasks/") || file.startsWith("tasks/_")) continue;
    if (!line.startsWith("+") || line.startsWith("+++")) { if (line.startsWith("@@")) { inSection = false; current = null; } continue; }
    const text = line.slice(1);
    if (/^## What was done/.test(text)) { inSection = true; current = { file, hash, date, lines: [] }; entries.push(current); continue; }
    if (/^## /.test(text)) { inSection = false; current = null; continue; }
    if (inSection && current && text.trim()) current.lines.push(text);
  }
}

const byTask = new Map();
for (const e of entries) {
  if (!byTask.has(e.file)) byTask.set(e.file, []);
  byTask.get(e.file).push(e);
}

const title = f => {
  if (!existsSync(f)) return f.replace(/^tasks\//, "").replace(/\.md$/, "");
  const m = readFileSync(f, "utf8").match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : f;
};

// ---- per-repo: match the existing changelog convention here ----
const formatEntry = (e) => e.lines.map(l => `${l}  (${e.hash})`).join("\n");
const today = new Date().toISOString().slice(0, 10);
let out = `## ${version ?? "<version>"} — ${today}\n\n`;
for (const [file, es] of byTask) {
  out += `### ${title(file)}\n\n${es.map(formatEntry).join("\n")}\n\n`;
}
// ---------------------------------------------------------------

if (dry || entries.length === 0) {
  process.stdout.write(entries.length ? out : `(no task records since ${since})\n`);
  process.exit(0);
}

const path = "CHANGELOG.md";
const marker = /<!-- Compiled from tasks\/.*?-->\n?/;
let existing = existsSync(path) ? readFileSync(path, "utf8") : "# Changelog\n\n";
if (marker.test(existing)) existing = existing.replace(marker, m => m + "\n" + out);
else {
  const i = existing.indexOf("\n", existing.indexOf("# ")) + 1;
  existing = existing.slice(0, i) + "\n" + out + existing.slice(i);
}
writeFileSync(path, existing);
console.log(`CHANGELOG.md: ${entries.length} record(s) from ${byTask.size} task(s) since ${since}`);
```

Note: the compiler writes `CHANGELOG.md`, which the `shared` rule forbids editing. It is
run at release, outside the scene; commit its output with the release tag, from a shell,
not from an agent turn. If the pre-commit hook refuses, that is the rule working: bypass
it for the release commit only (`git commit --no-verify -m "Release <version>"`), and
nowhere else.

## Appendix H — runtimes

Both scripts use only `node:child_process` and `node:fs`, which Node, Deno and Bun all
provide. Only the invocation differs. Use the same form everywhere the script is called:
`.claude/settings.json` (`command` + `args`), the pre-commit line, and the task runner.

| Runtime | `command` | `args` prefix | Task runner entry |
| --- | --- | --- | --- |
| Node | `node` | — | `package.json` → `"scripts": {"changelog": "node scripts/compile-changelog.mjs"}` |
| Deno | `deno` | `run --allow-run=git --allow-read --allow-write=CHANGELOG.md` | `deno.json` → `"tasks": {"changelog": "deno run --allow-run=git --allow-read --allow-write=CHANGELOG.md scripts/compile-changelog.mjs"}` |
| Bun | `bun` | `run` | `package.json` scripts as for Node, with `bun` |

Deno example for `.claude/settings.json`:

```json
{
  "type": "command",
  "command": "deno",
  "args": ["run", "--allow-run=git", "--allow-read",
           "${CLAUDE_PROJECT_DIR}/.claude/hooks/check-unit.mjs", "--staged"],
  "onFailure": "block"
}
```

The check script needs only `--allow-run=git` and `--allow-read`; the compiler also
writes `CHANGELOG.md`. Keep the permission list that narrow; a hook with `-A` is a hook
nobody reads.

## Appendix G — the reviewer

Hooks test presence, not truth. A task record that describes the diff wrongly passes
every check above. Before committing a scene, a reader that has not seen the work reads
the staged diff cold against the task file and answers one question: does the
`## What was done` section describe this change? In Claude Code that is a subagent with
read-only tools, invoked explicitly before `git commit`. Its verdict is advisory; its
value is that it did not write the record it is checking.
