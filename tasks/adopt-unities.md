# Adopt the Unities

## Context

Asked by Erez on 2026-10-19: carry out [docs/UNITIES.md](../docs/UNITIES.md), the
procedure for making the work, its record and its location one thing — a change
to the code lands in the same commit as its doc line and its task record, and
outside input arrives as a task file. Adopted as an **evaluation**, not a
settled rule: the procedure is largely a written-down form of how this project
already works (granular tasks, the plan written before the build, documentation
as part of the landing, tests around a change), and the point is to see where it
fits that and where it chafes. Hard rules are deliberately lenient for now.

Decisions taken in the discovery round, against the procedure's defaults:

- **Gate at commit, report at Stop.** The procedure's Stop hook sends a turn
  back until the record is complete; here a turn often stops mid-change on
  purpose — to discuss a design before writing it, or to hand over a browser
  recipe — so the Stop hook only reports.
- **CHANGELOG.md stays hand-written**, one dated entry per commit with the hash
  backfilled by the next. Compiling it from task records at release exists to
  stop several developers colliding in one file; this is one developer with no
  release schedule, so the compiler (the procedure's Appendix F) is deferred
  until either changes. For the same reason CHANGELOG.md is not a protected
  file, and it counts as a change's doc line.
- **A task record is required beside every source change (option a).** Its
  `## What was done` can be two sentences and a pointer, since the CHANGELOG
  entry carries the prose; a small fix with no task gets one made on the spot.
- **A test is noted, never required.** Some changes here can only be verified
  in a browser, and CLAUDE.md already says a change no suite reaches should
  say so and give the recipe.
- **Task files keep their TODO numbers** (`3.1-editing-core-rewrite.md`), since
  "TODO 3.1" is cited about 245 times across the code and the docs.
  docs/ROADMAP.md stays a doc: its sections are post-1.0 design essays, not
  work anybody has picked up. The "Where each stage stands" section in
  docs/REWRITE.md stays as design-doc content.
- **The hooks are committed.** `.claude` was gitignored whole, which put the
  previous attempt's hook outside the repo; now `.claude/settings.json` and
  `.claude/hooks/` are tracked and the rest stays ignored.

## What was done

Created `.claude/hooks/check-unit.mjs` in place of the untracked, report-only
copy a previous attempt left on 2026-10-18, which had never actually run: under
Deno, `node:child_process` also needs `--allow-env`, so every git call threw and
the Stop hook failed silently on every turn. The new script is Deno-native,
refuses an incomplete staged set (source in `front/` or `server/src/` with no
doc line or no task file, or an edit to the retired docs/TODO.md once it is
retired at HEAD), only reports on the working tree, and refuses at commit if it
cannot run at all rather than letting a broken gate open.

Wired it as a `PreToolUse` hook on `git commit` and kept the `Stop` hook, in
`.claude/settings.json`; created `.githooks/pre-commit` and a `deno task hooks`
in the root deno.json that points `core.hooksPath` at it, run once on this
clone, with a line in the README; un-ignored `.claude/settings.json` and
`.claude/hooks/` in `.gitignore`. Created `tasks/README.md` and
`tasks/_template.md`, adapted to the numbering and the hand-written CHANGELOG.

Migrated all 25 items in docs/TODO.md to `tasks/<number>-<slug>.md`, each item's
text carried verbatim apart from its relative links, which were repointed so
they still resolve from `tasks/` — 1.1's sub-items 1.1.6–1.1.10 stay in its
body, and section 2's opening paragraph is quoted into both of its tasks. All
are open, since a finished item had always left that file. Retired docs/TODO.md
in place with a pointer and its full original content below a rule. Added "The
Unities" section to CLAUDE.md — including two working rules the hooks cannot
enforce: stage in a separate call from the commit, since the `PreToolUse` hook
reads the index before the command runs, and have a read-only reviewer check the
task record against the staged diff before committing. Repointed the two places
in CLAUDE.md that sent a plan or a reference to docs/TODO.md; the "Making a
change" one also now says a stage's status goes in the task's `## What was
done` section. Committed docs/UNITIES.md itself, which had been planted
untracked, since this record and CLAUDE.md cite it. Backfilled `8d20745` into
the previous CHANGELOG entry.

Not installed: the changelog compiler, its marker in CHANGELOG.md and the
release boundary it needs — there are no tags. Verified in a scratch clone: an
incomplete staged set is refused both by the hook as `PreToolUse` and by a real
`git commit` through `.githooks/pre-commit`, a complete one passes with the test
note, a git command other than commit passes untouched, the Stop hook reports
without refusing, and a hook that cannot run refuses the commit.

## Decisions

### 2026-11-14 · Strict staging, with the end-of-turn check reporting only

**Decision** — The commit is the scene: `git commit` refuses an incomplete one,
through the `PreToolUse` hook and `.githooks/pre-commit`. The `Stop` hook
reports what the tree is missing and never sends a turn back. Chosen
2026-10-19 and recorded here, when the procedure first asked for it by name.
**Rejected** — Adapted staging, where the pull request is the scene: this is
one developer, and `rewrite` reaches `main` by merge (D8), not through pull
requests. Strict's refusing `Stop` hook: a turn here often stops mid-change on
purpose, to argue a design before writing it or to hand over a browser recipe,
and a hook that sent those turns back would be fought rather than followed.
**Why** — The commit already is a complete unit here, so strict costs nothing at
the commit. At the end of a turn the scene is often not meant to be finished yet.

### 2026-11-14 · CHANGELOG.md stays hand-written

**Decision** — One dated entry per commit, in prose, with the hash backfilled by
the next commit. It counts as a change's doc line and is not a protected file.
The procedure's changelog compiler (its Appendix F), its marker and the release
check are not installed.
**Rejected** — Compiling CHANGELOG.md from the task records at release.
**Why** — That compiler stops several developers colliding in one file at
release. This is one developer with no tags and no release schedule, and the
hand-written entries carry the reasoning a compiled one would not. Revisit if
either changes. First deferred 2026-10-19.

### 2026-11-14 · The record compiler reads the hand-written D0–D9 numbers

**Decision** — `scripts/compile-record.mjs` is the procedure's Appendix K, with
its number search accepting `D9.` as well as `D9 ·`. D0–D9 stay where and as
they are, above the marker, and the first compiled decision is D10.
**Rejected** — The appendix verbatim. It recognises only `D<n> ·`, would see no
number above the marker, and would number the next decision D1, which collides
with an entry cited across CLAUDE.md and the code.
**Rejected** — Renumbering or retitling D0–D9 to the compiled form. That edits
ten settled entries to suit a regular expression.
**Why** — The procedure says the old entries keep their numbers. This is what
it takes for the compiler to see them.

### 2026-11-14 · A task is done when its last record says Status: done

**Decision** — The compiled plan reads three states: no `## What was done` is
open, sections without the closing line are in progress, and a last section
carrying a `Status: done` line is done. The three tasks already closed (1.6, 2.1
and export-equations) each got a short appended section carrying that line, and
so did this one.
**Rejected** — The appendix's rule that any `## What was done` section means
done. Seven task files have one, and 3.1 has seventeen and is not finished, so
the plan would have reported the rewrite as done.
**Rejected** — Reading "closed" or "done" out of the prose. Wording that cannot
be checked mechanically drifts.
**Why** — A task here gathers one section per landing, which tasks/README.md
already said. Done has to be a line someone writes on purpose.

### 2026-11-14 · The check script stays Deno-native and strict-only

**Decision** — `.claude/hooks/check-unit.mjs` keeps its own Deno form and its
two modes (`--staged` refuses, `--tree` reports). It gains the procedure's new
checks: the compiled record current and staged, its hand-written head
untouched, a compiled decision never removed, a `Reviewed by:` line on every
record a commit adds, acceptance boxes that are checks rather than outcomes,
the shape of review items, and a tombstone that may be deleted though not
edited. Its tests are `.claude/hooks/check-unit.test.mjs` (`deno task
hooks:test`), cut from the procedure's Appendix J to this staging.
**Rejected** — The procedure's Appendix A script verbatim. It is written for
Node, and under Deno its `node:child_process` calls need `--allow-env`, which
is how the first attempt's hook silently failed on every turn in October. Its
`--pr` gate, release check and adapted mode serve nothing in this staging.
**Why** — Same rules, in the runtime the repo already uses, without the parts
this staging has no use for.

### 2026-11-14 · CI checks the compiled record; no pull-request gate

**Decision** — `.github/workflows/ci.yml` runs `compile-record.mjs --check`, so a
commit that reached a push without the hook (`--no-verify`, a clone without
`deno task hooks`) is caught there.
**Rejected** — The procedure's full pull-request gate (`check-unit.mjs --pr`):
the check script has no `--pr` mode here, see the decision above, and in strict
staging the gate is an optional backstop.
**Why** — The cheap half of the backstop catches the one thing a bypassed hook
would let through silently, a record out of step with its task files. A missing
doc line or task record shows up in review of the commit itself.

### 2026-11-14 · docs/SPEC.md is short and points at CLAUDE.md

**Decision** — `docs/SPEC.md` holds why Mandy exists, what 1.0 is and is not, a
two-paragraph architecture and the stack table. For everything about how the
code works it points to CLAUDE.md's Architecture section and docs/REWRITE.md.
**Rejected** — A full spec that restates the architecture.
**Why** — CLAUDE.md already records the how at length, with the why for each
mechanism. A second copy would drift, and a fresh session needs the what in one
page and a pointer to the rest.

### 2026-11-14 · No developer's guide

**Decision** — `docs/working-on-a-task.md` is not written. CLAUDE.md's Unities
section does not point to one.
**Rejected** — Writing the guide the procedure's 4.8 describes.
**Why** — It is for people who receive tasks, and there is one developer, who
also wrote the rules. tasks/README.md is the format and CLAUDE.md is the working
practice. Write the guide the day a second person works here.

### 2026-11-19 · Claude Code is the only agent here

**Decision** — Nobody works in this repository with another agent, so the
procedure's 4.10 is not installed: the instructions stay in CLAUDE.md, and
there is no `AGENTS.md`, no `.codex/hooks.json` and no Codex reader. The check
script's `doc` role names `AGENTS.md` anyway, as the procedure's does, so the
file counts as a doc line the day it exists.
**Rejected** — Installing 4.10: moving CLAUDE.md to `AGENTS.md` behind a
one-line import and adding the Codex bindings, which nobody here would run and
nobody could verify.
**Why** — Asked once, as the procedure says for a repository adopted before
0.5.0, and answered by Erez on 2026-11-19. Revisit the day a second agent
works here.

### 2026-11-23 · The planted scripts are the plugin's, unchanged

**Decision** — From 0.6.8 the gate, its tests and both compilers are the
plugin's files, copied byte for byte and checked against
`.claude/hooks/unities.manifest.json`. Mandy's own values are in
`.claude/hooks/unities.json`. A change Mandy needs from a script is asked of
the plugin as a task. The gate's tests run under Node (`deno task hooks:test`
is `node --test`), because every case spawns `node` whatever runs the suite.
**Rejected** — Keeping Mandy's own Deno-native copy with the new checks cut in
by hand, as D14 did. 0.6.8's gate refuses a planted copy that differs from the
manifest. The plugin's scripts do run under Deno, through the `run` value, but
not with the procedure's Deno line: measured here, it fails every `git` call, so
the hooks grant `--allow-run=git,deno,/bin/sh` and full `--allow-env` (the third
ask in tasks/unities-plugin-asks.md). That is the `--allow-env` failure D14 was
written against, met again and fixed in the invocation, not in the script.
**Why** — One copy of the rules, kept where they are tested. The D-number
change D12 made is no longer needed: D10 onwards are compiled, so the
compiler numbers from them and never has to read D0–D9.
Supersedes: D12, D14

### 2026-11-23 · The end-of-turn check sends a turn back once

**Decision** — Strict's `Stop` binding is the plugin's `--branch`: a turn that
ends with the uncommitted tree missing something is sent back once, and the
second pass ends with a note to Erez. A turn that stops mid-change on purpose
says so and ends on that second pass. Asking the plugin for a strict `Stop` that
only reports is tasks/unities-plugin-asks.md. The rest of D10 stands:
the commit is the scene, and the commit refuses.
**Rejected** — Pointing `Stop` at the adapted mode with `UNITIES_SCENE=pr` so
that it only advises. In adapted, `--branch` measures from the merge base with
`main`, and this repo works on `main`, so it would most likely report nothing.
Also rejected: leaving `Stop` out, which loses the check entirely.
**Why** — Chosen by Erez on 2026-11-23 from three options. Of the two that
are available now, one extra pass on a deliberate stop costs less than an
end-of-turn check that never fires.
Supersedes: D10

### 2026-11-23 · Work a task still owes is an open box

**Decision** — The plugin's done rule holds: a task with a `## What was done`
section and no open box is done, and one with an open box is
`recorded, N boxes open`. The four tasks with records that are not finished —
1.1, 1.12, 3.1 and 6.8 — each gained a dated **Acceptance** block at the end of
their Context, with a box for each piece still owed. The `Status: done` lines
already written stay where they are and no longer decide anything.
**Rejected** — Asking the plugin for a configurable done marker and leaving the
plan wrong until it ships. Under 0.6.8 the plan would read the four as done,
the rewrite among them.
**Why** — Chosen by Erez on 2026-11-23. A box names what is left. A hidden
line names only that someone thought it was finished.
Supersedes: D13

### 2026-11-23 · CHANGELOG.md stays hand-written, through the configuration

**Decision** — D11 stands under 0.6.8. In `.claude/hooks/unities.json`, `shared`
matches nothing, `CHANGELOG.md` is in the `doc` role and `releaseFiles` matches
nothing. `scripts/compile-changelog.mjs` is copied in because the manifest lists
it, but no task runs it and nothing calls it.
**Rejected** — Leaving it out. The gate would report it missing on the first
commit that touches a planted script.
**Why** — D11's reasons have not changed: one developer, no tags, no releases.

### 2026-11-23 · No note for source changed without a test

**Decision** — The old gate's note when source changed with no test change is
gone, and nothing replaces it. `required` stays doc and task, so a missing test
is neither refused nor mentioned. CLAUDE.md's rule that a change no suite can
reach gives its browser recipe in the CHANGELOG entry still stands. It is now
held by the reader rather than by a note.
**Rejected** — Adding `test` to `required`. Many changes here have no suite
that can reach them, and a refusal would be answered with an empty test.
**Rejected** — Asking the plugin for a "notes" role. The cold reader already
asks what a change did that nothing records.
**Why** — The plugin's gate has no advisory output, and the note never refused
anything.

### 2026-11-28 · The end-of-turn check only reports, as the plugin's does

**Decision** — From 0.7.0 the plugin's strict `Stop` tells the agent what the
uncommitted tree is still missing and never refuses the turn. Mandy takes it as
it comes, with no value set: a scene ends at its commit, a turn may end to ask,
and a change that is abandoned is reverted. This is the 2026-11-14 decision
again, now held by the plugin's gate and not by a mode of Mandy's own.
**Rejected** — Staying on 0.6.8 to keep the turn that is sent back once. D23
chose that only because reporting was not on offer, and said so.
**Why** — It is the first of the three asks in tasks/unities-plugin-asks.md,
answered. The commit still refuses, through the `PreToolUse` hook and
`.githooks/pre-commit`.
Supersedes: D23

## What was done

2026-11-14: **brought up to the procedure dated 2026-11-11 (0.4.0).** The
planted docs/UNITIES.md was an older copy with no date on its first line. It
was replaced with the master, and the run then installed what the newer version
adds.

Created `scripts/compile-record.mjs`, the procedure's record compiler with the
two changes above (D-number search, done rule), and `deno task record` in the
root deno.json. Ran it: docs/DECISIONS.md keeps D0–D9 above the new marker,
and its introduction no longer says to reopen a decision by editing it.
Created docs/PLAN.md with a hand-written head that says what the list does not
hold (3.1's stages live in docs/REWRITE.md, post-1.0 work in docs/ROADMAP.md)
and the compiled steps below it. There was no hand-written plan to convert. The
plan has no milestones or not-in-scope lines: none was carried over, and
docs/SPEC.md's scope says what 1.0 is not.

Extended `.claude/hooks/check-unit.mjs` with the new checks listed in the
decisions, and gave it `--allow-run=git,deno` everywhere it is invoked
(`.claude/settings.json`, `.githooks/pre-commit`), since it now runs the
compiler. A record or review section counts as this commit's when HEAD has no
section with the same text. The procedure decides by the heading line, which
flagged every older record in a file with a new one, since every record's
heading reads `## What was done`. Created `.claude/hooks/check-unit.test.mjs`
with `deno task hooks:test`, which runs in throwaway repositories, with
hand-written asserts so it adds no dependency. It was confirmed able to fail:
with the D-number fix and the done rule reverted in the compiler, three cases
fail. A case pins the section comparison. Added the compiled-record check to CI.

The procedure's own checks were run. The Stop report never refuses. A probe
file staged in `front/` is refused at `--staged`. `compile-record.mjs --check`
exits 0, and `.claude/settings.json` parses with both hooks. The real-commit
probe found that `core.hooksPath` was unset on this clone, so the October hook
had not been running here, and the probe committed. It was undone with a soft
reset, `deno task hooks` was run again, and the probe was then refused by git.

Created docs/SPEC.md. Rewrote CLAUDE.md's Unities section: a read-first list,
the decision rule, the `Reviewed by:` and `Status: done` lines, what the
commit gate now refuses, and a *Division of labour* subsection. Updated
tasks/README.md and tasks/_template.md for `## Decisions`, `## Review`, the
reader line and derived status. Appended a closing `Status: done` section to
1.6, 2.1 and export-equations.

Found, not created: docs/DECISIONS.md, the task files, the hooks and their
bindings. Left as they were: docs/ROADMAP.md is not a tombstone, and docs/TODO.md
stays the only one. No release boundary was chosen, since no changelog compiler
was installed.

Three changes to the hook's behaviour come with the procedure's Appendix A and
are not in the decisions above. A merge commit is judged only on the files the
merge itself writes, through `MERGE_HEAD`, so a merge from `main` is not asked
for the records of scenes made there. The compiled record counts as no role, so
a source change cannot pass on it as its doc line. And the hook now runs
`compile-record.mjs --check` on every commit and every Stop, which is why it
needs `--allow-run=deno`. One known limit is left as it is: the compiler reads
the work tree rather than the index, so a task file edited after staging can
make a stale staged record pass, or a current one fail. Stage the task files
and the compiled record together. A fresh session given only the repo answered
what Mandy is, what was decided, what comes next and how a change is recorded,
from SPEC, DECISIONS, PLAN, REWRITE and CLAUDE.md.

Status: done
Reviewed by: a read-only subagent that had not seen the work, against the staged diff. It found the hook changes and the limit recorded above, a "last line" rule the closing sections broke, a test rule in *Division of labour* that contradicted "Making a change", a route count in docs/SPEC.md, and docs/DECISIONS.md's introduction still pointing at the retired TODO.md. All of them were fixed before the commit.

## What was done

2026-11-19: **brought up to the procedure dated 2026-11-19 (0.5.5).** The
planted docs/UNITIES.md was 0.4.0 of 2026-11-11 and was replaced with the
master. What the newer version adds, and what of it landed here:

- **The reader's brief**, `docs/reviewer.md`, copied from the procedure's
  Appendix G: the three questions every cold reader is asked, in the same
  words. CLAUDE.md's Unities section now says the review is a member of the
  unit with the code, the test and the doc line, that the reader is a
  read-only subagent and never the author, that it carries out that brief, and
  that its findings go into the task file. tasks/README.md points the
  `Reviewed by:` line at the brief.
- **`AGENTS.md` in the `doc` role** of `.claude/hooks/check-unit.mjs`, and the
  procedure's licence line at the head of the check script, its tests and the
  record compiler, which all three appendices now carry.
- **Not installed:** 4.10 and its Codex files, by the decision above, and the
  script's `--codex` flag with them. The `--pr` changes (measuring from the
  merge base, refusing an unknown target) touch a mode this repo's script does
  not have, by the 2026-11-14 decision that keeps it strict-only. 4.11 installs
  nothing.

`deno task hooks:test` passes, the compiled record is current, and a fresh
reading of CLAUDE.md's Unities section names the brief.

Status: done
Reviewed by: a read-only subagent that had not seen the work, carrying out docs/reviewer.md against the staged diff. It found the record accurate and two faults in the CHANGELOG entry: it credited tasks/README.md with saying the review is part of the unit, which only CLAUDE.md says, and it opened after two blank lines. Both were fixed before the commit.

## What was done

2026-11-23: **brought up to the procedure dated 2026-11-22 (0.6.8).** The
planted docs/UNITIES.md was 0.5.5 of 2026-11-19 and was replaced with the
master. 5.5 applied, since the scripts here were cut from the listings, along
with 0.6.8's done rule and its record check.

- **The values**, from the old gate's per-repo block, are now in
  `.claude/hooks/unities.json`: `scene` `commit`, the same five roles, `shared`
  matching nothing, `required` doc and task, `base` `main`, `releaseFiles`
  matching nothing, and `run` for Deno. The old compiler had no closing-line
  change and still compiled a plan, so `changelog.recorded` and `plan` are left
  out.
- **The local changes**, compared against the 0.5.5 copy's appendices, and
  what became of each: D11, the hand-written changelog, is kept through the
  configuration. D12, the `D9.` search, is no longer needed. D13, `Status:
  done`, is superseded by open boxes in 1.1, 1.12, 3.1 and 6.8. D14, the
  Deno-native copy, and D10's reporting-only `Stop` are superseded. The old
  gate's "no test change" note is dropped, since `required`
  holds no test and the plugin's gate has no notes; the decision above
  records it.
  tasks/unities-plugin-asks.md carries what is asked of the plugin.
- **The files**: the four scripts and the manifest were copied from the
  plugin unchanged. `.claude/settings.json` moved to the `command`/`args` form
  with the `git commit` filter and `onFailure: "block"`, with `Stop` on
  `--branch`. `.githooks/pre-commit` got the same invocation. `deno task
  hooks:test` is `node --test`. CLAUDE.md's Unities section, tasks/README.md
  and tasks/_template.md now state the done rule, the planted files and the
  end-of-turn behaviour. docs/PLAN.md's hand-written head still states the
  `Status: done` rule, because the gate refuses an edit to it.
- **Measured, not as the procedure says**: Appendix H's Deno line fails every
  `git` call under Deno 2.9.8. The hooks run with
  `--allow-run=git,deno,/bin/sh --allow-env`, written up as the third ask.

**Verification.** `deno task hooks:test` gives 90 passed and 1 skipped. The
old and new gates were run with `--staged` on the same index sets, each built
in a temporary index:

- a lone file in `front/`: both refuse, naming no doc, no task and the record
  unstaged;
- that file with a CHANGELOG line, a new reviewed task record and the compiled
  files: both pass;
- that file with a CHANGELOG line and a touched task file but no new record:
  both refuse on the unstaged record, and the new gate also on "no record";
- a CHANGELOG line alone, while this change's compiled files were unstaged:
  both refuse on those.

The manifest probe (6.6) is refused as `scripts/compile-record.mjs` edited.
`Stop` on a tree holding a source probe sends the turn back on the first pass
and ends it with a `systemMessage` on the second. A `PreToolUse` on a command
that is not `git commit` exits 0. `compile-record.mjs --check` exits 0.

Status: done
Reviewed by: a read-only subagent that had not seen the work, carrying out docs/reviewer.md against the staged diff. It confirmed the planted files equal the 0.6.8 masters, the configuration's values, the backfill and the compiled record. It found five things. D22 claimed the procedure's Deno line works, contradicting this record. docs/SPEC.md still said the hooks need no Node. The dropped test note had no decision. 1.12's stage 2 and stage 5 boxes were narrower than its plan. 6.8's box left out item 1 and the `input-check` half of item 3. All were fixed before the commit. It did not rerun the hooks suite.

## What was done

2026-11-28: **brought up to the procedure dated 2026-11-26 (0.7.0).** The
planted docs/UNITIES.md was 0.6.8 of 2026-11-22 and was replaced with the
master, taken from the plugin's marketplace clone at `7e45113`. The copy of the
plugin that the session loaded was an older one, 0.6.5, and nothing was taken
from it.

- **The files**: the gate, its tests, both compilers and the manifest were
  copied from the plugin unchanged, and the manifest now reads 0.7.0.
- **The end of a turn**: the plugin's strict `Stop` now reports and never
  refuses the turn. Nothing in `.claude/settings.json` changes for it; the
  decision above supersedes D23, and CLAUDE.md's Unities section says what the
  hook does now.
- **The Deno invocation**: the scripts start git by name with no shell, so
  `/bin/sh` left `--allow-run` in `.claude/settings.json` and
  `.githooks/pre-commit`, which are now the procedure's Appendix H line with
  `--quiet`. `run` in `.claude/hooks/unities.json` gained `--allow-env`, as the
  procedure's example for Deno now has it.
- **The heads**, read against 0.7.0 as its 5.3 asks: docs/PLAN.md's said a task
  is done when its last record carries `Status: done`, and now states the
  open-box rule. docs/DECISIONS.md's head needed no change.
- **tasks/README.md**: a committed record may be corrected but a correction is
  not a record, and a box that waits on anything outside the project is an
  outcome. tasks/_template.md and docs/reviewer.md needed no change, since the
  procedure's text for them did not move.
- **Not installed**: 0.7.0 moved the Azure DevOps listing out of the procedure
  and leaves what runs the gate at a pull request to the person. Mandy has no
  pull-request gate (D15), and `.github/workflows/ci.yml` is as it was.
- **The asks**: all three in tasks/unities-plugin-asks.md are answered, and
  that task closes in this commit. This commit also fills `e95ff48` into the
  CHANGELOG header of the merge before it.

**Verification**, under Deno 2.9.8 with the narrowed permissions, the probes in
a temporary index:

- `deno task hooks:test`, under Node 26.13.1: 108 passed, 1 skipped, none
  failed.
- `--branch HEAD` prints nothing and exits 0.
- A lone file staged in `front/` is refused with exit 2, naming no doc change
  and no task change, by `--staged`, by `.githooks/pre-commit` run on the same
  index, and by a `PreToolUse` payload whose command is `git commit`. A
  `PreToolUse` payload for another command exits 0.
- `Stop` on the uncommitted tree exits 0 on both passes: the first hands the
  agent the missing parts through `additionalContext`, the second tells Erez
  through `systemMessage`. Neither sends the turn back.
- The manifest probe is refused, naming `scripts/compile-record.mjs` as edited,
  and the file was put back and matches the manifest's hash.
- `compile-record.mjs --check` exits 0 on the committed tree.

Not run: a real `git commit` of the probe, since the agent's own hook would
refuse it before git's hook ran, so the git hook's line was run directly
instead. The fresh-session test was not repeated; nothing it reads changed
beyond the lines named here.

Status: done
Reviewed by: a read-only subagent that had not seen the work, carrying out docs/reviewer.md against the staged diff. It confirmed by command that the planted files equal the 0.7.0 masters and the manifest's hashes, the two commit hashes, the compiled record, and that no standing file still describes a turn sent back or `/bin/sh`. It found this record accurate and one fault in tasks/unities-plugin-asks.md's, fixed before the commit. It did not rerun the hooks suite or the probes.
