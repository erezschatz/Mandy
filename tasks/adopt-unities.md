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
