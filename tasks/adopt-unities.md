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
