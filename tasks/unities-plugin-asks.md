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

- [ ] All three asks filed as tasks in the plugin's repository, by Erez
- [ ] Once a version carrying any of them ships: Mandy re-runs the procedure, sets the
  value, fixes docs/PLAN.md's head or narrows the Deno permissions, and records
  it in tasks/adopt-unities.md
