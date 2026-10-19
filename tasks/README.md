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
  commit carries the prose.

**Status is derived.** No `## What was done` means open; one whose last section
says the work is finished means done. The italic markers the items brought with
them — *(needs 3.1)*, *(undecided)*, *(fixed, unverified)* — stay in their
Context as written; they describe the item, not its progress.

**A finished task stays here.** docs/TODO.md removed finished items and reused
their numbers; a task file is the record of the work, so it keeps its number for
good. A new 1.0 item takes the next number in its section that no task file and
no CHANGELOG entry has used. A small fix with no place in the numbering gets a
plain slug (`tab-close-focus.md`).

CHANGELOG.md is still written by hand, one entry per commit, while this is one
developer with no release schedule. Compiling it from these files at release is
the plan for when that changes — [adopt-unities.md](adopt-unities.md).
