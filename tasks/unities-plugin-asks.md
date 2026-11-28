# Unities plugin: three asks from Mandy's 0.6.8 upgrade

## Context

Raised 2026-11-23, while bringing the Unities up to 0.6.8 (tasks/adopt-unities.md).
This is a change to the plugin, not to Mandy: the gate is now the plugin's file,
copied in unchanged, so what Mandy cannot get from `.claude/hooks/unities.json`
has to be asked of the plugin and arrives with a later version.

**Three things to ask for.**

1. **A strict `Stop` that only reports.** Mandy's copy of the gate had a `--tree`
   mode, kept by a 2026-11-14 decision: in strict staging the commit refuses, and
   the end of a turn lists what the uncommitted tree is missing and never sends
   the turn back. A turn here often stops mid-change on purpose, to argue a
   design before it is built or to hand over a browser recipe. 0.6.8's strict
   `--branch` sends such a turn back once and ends it on the second pass, and
   no configuration value changes that. The ask is one, for example
   `"stop": "advise"`, under which strict's `Stop` answers as adapted's does,
   through `additionalContext`, while `--staged` still refuses.
2. **A door for the compiled files' hand-written head.** The gate refuses any
   edit above the marker in `docs/DECISIONS.md` and `docs/PLAN.md`, and its
   message says to change the head through a new decision. But nothing in a
   decision reaches the head, so a head that has gone stale stays stale.
   docs/PLAN.md's head here still says a task is done when its last record
   carries `Status: done`, which stopped being true at 0.6.8. The ask is a way
   to change the head that the gate accepts, for example a scene that touches
   only the head and the task file whose decision explains it.

3. **Appendix H's Deno invocation does not run the gate.** Measured
   2026-11-23 under Deno 2.9.8: with `--allow-env=TF_BUILD,UNITIES_SCENE` every
   `execSync` throws `NotCapable: Requires env access`, because Deno's
   `child_process` copies the whole environment into the child. With full
   `--allow-env` it then throws `Command failed: git …` and hides the reason,
   because `execSync` runs through `/bin/sh` and `--allow-run=git,deno` does not
   cover it. Mandy runs the gate with
   `--allow-run=git,deno,/bin/sh --allow-env`. Granting `/bin/sh` amounts to
   granting any command, so a narrow list is only possible if the script calls
   `spawnSync("git", […])` without a shell. The plugin's tests run under Node and
   cannot see this. Under `onFailure: "block"` a gate that crashes refuses every
   commit. A `Stop` gate that crashes fails silently, which is October's failure
   again (D14).

**Acceptance**

- [x] All three asks filed as tasks in the plugin's repository, by Erez
- [x] Once a version carrying any of them ships: Mandy re-runs the procedure, sets the
  value, fixes docs/PLAN.md's head or narrows the Deno permissions, and records
  it in tasks/adopt-unities.md

## What was done

2026-11-28: **all three asks shipped in 0.7.0, and Mandy took them.** Both boxes
are ticked from what the plugin's repository and this commit hold.

- **Filed.** The plugin's `tasks/` holds one task for each, each restating its
  ask as the first, second or third of three raised on 2026-11-23:
  `a-turn-may-stop-to-discuss.md`,
  `an-upgrade-may-rewrite-the-head.md` and
  `the-gate-runs-under-deno-without-a-shell.md`.
- **A strict `Stop` that only reports.** It arrived as the gate's behaviour in
  both stagings, not as a value, so nothing is set in
  `.claude/hooks/unities.json`. The decision that takes it is in
  tasks/adopt-unities.md.
- **A door for the head.** An upgrade may change the head, so docs/PLAN.md's
  head now states the open-box rule in place of `Status: done`.
- **The Deno line.** The scripts start git without a shell, so the hooks dropped
  `/bin/sh` and run with `--allow-run=git,deno --allow-read --allow-env`.
  `--allow-env` stays whole, which the procedure now says and explains.

The record of the upgrade, with what was run, is tasks/adopt-unities.md's
section of the same date.

Status: done
Reviewed by: a read-only subagent that had not seen the work, carrying out docs/reviewer.md against the staged diff. It found both boxes to hold and one fault: this record said the plugin's three tasks quote this file, and they restate the asks without naming it. That was fixed before the commit.
