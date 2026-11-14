# tasks/

One file per task. This is where work arrives: a request, a bug, a measurement
someone wants made, a decision still to be taken. If it is not a task file, it
did not arrive.

A task file has:

- a title (H1). A 1.0 item keeps the `section.item` number it had in
  [docs/TODO.md](../docs/TODO.md), in the title and in the filename
  (`3.1-editing-core-rewrite.md`), so the "TODO 3.1" references across the code
  and the docs still name it;
- `## Context` — what was asked, by whom, where it came from, written when it
  arrived. For anything more than trivial this is also where the plan goes
  before the work starts: what is about to change, the stages, what each one
  entails (CLAUDE.md, "Making a change");
- `## What was done` — appended in the same commit as the change it describes,
  once, and not edited afterwards. A task gathers one per landing, each saying
  where its stage stands: *done and tested*, *done, untested*, *not started*.
  Two sentences and a pointer is enough, since the CHANGELOG entry for the same
  commit carries the prose. Its last line is `Reviewed by: <who>`: the reader
  that had not seen the work and read the staged diff against this section
  before it was committed. The commit gate refuses a section without it;
- `## Decisions`, when the work chose one thing over another: one entry per
  choice, appended in the same commit, never edited or removed afterwards.

      ### 2026-11-14 · <the choice, in a few words>

      **Decision** — <what was chosen>
      **Rejected** — <what was not, by name>
      **Why** — <the reason a newcomer would need>

  No number: `deno task record` compiles these into
  [docs/DECISIONS.md](../docs/DECISIONS.md), below the hand-written D0–D9, and
  gives each the next `D<n>` for good; the commit carries its output. Optional
  lines at the end of an entry: `Supersedes: D7` (the only way a decision is
  reversed), and `Milestone: After 3.1: <outcome>` or `Not in scope: <thing>`
  (the only way a line gets into [docs/PLAN.md](../docs/PLAN.md), and it leaves
  when a later decision supersedes this one). A decision that comes from
  outside any work in hand — a conversation, a change of scope — gets a small
  task file of its own;
- `## Review · <date>`, when the work is reviewed, written into this file by the
  reviewer. One `###` item per finding, each with **Found** (where, and what
  happens now), **Done when** (one box per case, written `case → outcome`, every
  case of the thing named including the ones that must not change) and **Not
  asked** (what the fix must not add). The gate refuses an item without the
  three parts or a line without `→`. The answer to a round is a further
  `## What was done`.

An acceptance box in `## Context`, if a task has one, is a check its assignee
performs before the task closes. A box about users, adoption or production is
an outcome rather than a check, and the gate refuses it: say it as the promise,
or as a `Milestone:` line in a decision.

**Status is derived, and the plan shows it.** No `## What was done` means open;
sections without the closing line mean in progress; a last section carrying a
`Status: done` line means done. [docs/PLAN.md](../docs/PLAN.md) lists every task
file in file-name order with that status, compiled, so nothing keeps it by
hand. The italic markers the items brought with
them — *(needs 3.1)*, *(undecided)*, *(fixed, unverified)* — stay in their
Context as written; they describe the item, not its progress.

**A finished task stays here.** docs/TODO.md removed finished items and reused
their numbers; a task file is the record of the work, so it keeps its number for
good. A new 1.0 item takes the next number in its section that no task file and
no CHANGELOG entry has used. A small fix with no place in the numbering gets a
plain slug (`tab-close-focus.md`).

CHANGELOG.md is still written by hand, one entry per commit, while this is one
developer with no release schedule. Compiling it from these files at release is
the plan for when that changes — [adopt-unities.md](adopt-unities.md), D11.
