<!-- UNITIES.md 2026-11-11 · 0.4.0. Master copy: the unities-project skill folder (plugin `unities`). -->

# UNITIES.md — adopting the Unities in a repository

This file is a procedure, addressed to the agent that carries it out (Claude Code, or a
person). Planting it in `docs/` does nothing on its own. To apply it:

    claude
    > Read docs/UNITIES.md and carry it out.

It is safe to run more than once. Every step checks what already exists before writing,
so a second run on an adopted repo should change nothing. The one exception is this file
itself: the master copy lives in the `unities-project` skill folder and carries a date
and a version on its first line; if the repo's `docs/UNITIES.md` is older than the skill's, the skill
replaces it first, and the run then installs whatever the newer procedure adds.

Do **not** import this file into CLAUDE.md. It is a migration, not a standing rule. The
standing rule is one paragraph (Appendix E), and this procedure installs it.

For a **new** project, the `unities-project` skill is the front door: it runs the kickoff
interview (which includes the staging question of §1), lays down `CLAUDE.md`,
`docs/SPEC.md` and the task files (the kickoff's decisions written in the first of them),
then plants this file and carries it out for the record, the gates and the compilers,
which produce `docs/DECISIONS.md` and `docs/PLAN.md`. For an **existing** repository, start
here; Phase 4.9 creates those files from what the code already is.

---

## 0. The form

The work, its record and its location are the same thing at the same time.

- **Place.** Everything the work consists of is a file in this repository. If `git diff`
  cannot see it, it is not on stage. The test that makes the files appear: a fresh
  session, human or agent, must be able to pick up from the repo alone; whatever it would
  need and cannot find is the previous session's failure. Outside input (a request, an
  incident, a decision from a meeting) enters through one door: it becomes a file on
  arrival — a task, or a decision.
- **Time.** The record is written in the same gesture as the change. Code, its test, its
  doc line and its task record are one unit. A change without its record is not a change
  with missing paperwork; it is a scene that did not happen.
- **Action.** There is one record, and it is the task files. A task file says what was
  asked, what was done, and what was chosen and rejected on the way (`## Decisions`,
  append-only, a decision reversed only by a new entry naming the old one). A task file
  belongs to one scene: the developer, their agent, the reviewer, the verifier and the
  hooks that act in that scene all write in it, and that is one writer, the way many
  terminals are one desk. What the form rules out is two *scenes* writing one file. Everything
  that several scenes would otherwise write — `docs/DECISIONS.md`, `docs/PLAN.md`,
  `CHANGELOG.md`, boards, status views — is compiled from the task files and never edited
  by hand. The one who compiles is the *merge man*: a script, run where the merge happens.

---

## 1. Choose the staging

The form says what a scene is. It does not say how long one is, and that is where
practice pushes back. There are two stagings. The choice is made here, once, before
anything is inventoried, because it is the one decision in this procedure that is about
people rather than files, and everything that follows is derived from it. The skill asks
it in its kickoff interview; this file asks it when it is the front door. It is never
asked twice: Phase 3 only checks the answer against the repository.

**Strict: the commit is the scene.** Every commit that touches source also carries its
test, its doc line and its task record, and the gates refuse anything less: `git commit`
refuses an incomplete scene and the agent cannot end a turn with one. If a scene cannot
be finished in the sitting, it is reverted, not saved for tomorrow. This is the ideal.
It holds where commits are already complete units: one developer, or a team that works
that way. Get it if you can.

**Adapted: the pull request is the scene.** Commits on the way are the developer's own
and may be anything, because in most teams a commit is a save, not a statement. The unit
that must be complete is the pull request, and the gate that refuses an incomplete scene
runs at merge. `git commit` and the end of a turn only warn, pointing at what the PR will
still fail on. This gives up part of the unity of time: the record may legitimately be
written at the end of the scene rather than beside each change, and the discard rule
goes with it (a half-scene sits as an open PR instead of being reverted). What keeps it
from being a Definition-of-Done with a better name is that the gate has teeth and the
warnings keep pulling toward same-gesture.

**The question.** Who works here, and how do they commit? One developer, or several;
commits as statements, or as saves; does merging already go through a pull-request
policy? Default to strict for a single developer and adapted for a team, and ask. Record
the answer and its reason as the first decision of the adoption, in the adoption task's
`## Decisions` section (5.3; in a new project, in task 00), from which
`docs/DECISIONS.md` is compiled.

**What follows from it.** Both stagings use the same script and the same record. The
difference is one constant (`SCENE`) and which bindings are installed:

| | Strict | Adapted |
| --- | --- | --- |
| The scene | the commit | the pull request |
| `SCENE` in `check-unit.mjs` | `"commit"` | `"pr"` |
| `Stop` hook (end of an agent turn) | refuses; on the second pass lets go and tells the person | advises once, through `additionalContext`; never blocks |
| `PreToolUse` on `git commit` | installed; blocks | not installed |
| pre-commit hook (where commits happen outside the agent) | refuses | warns |
| CI gate, `check-unit.mjs --pr` | optional backstop; install if there is CI | required; runs in CI or in the tool that merges (4.7) |
| A half-finished scene | revert it | sits as an open PR |
| `docs/DECISIONS.md`, `docs/PLAN.md` | the commit is also the merge: it carries the record compiler's output, and the gate refuses a commit where they are out of date | no pull request touches them; the merge man compiles them on the target after each merge (4.5) |
| Release | compiler output committed from a shell with `--no-verify`, the one bypass | a release PR, which passes only because its changelog equals the compiler's output |
| Merge strategy | — | squash recommended: one commit per scene lands on `main`, so its history reads as strict; the gate does not depend on it |
| The adoption itself (Phase 7) | one commit | one pull request |

Where a repo later moves from adapted to strict, that is one constant, one settings entry
and a new decision naming the old one.

---

## 2. Contract for the agent carrying this out

1. **Discover before you write.** Phase 3 produces a report and a proposal. Nothing in the
   repo is modified until the person approves it. Stop and wait; do not proceed on
   silence.
2. **One scene.** The whole adoption is one unit, per the table in §1, with its own task
   file (`tasks/adopt-unities.md`) that records what was done. If you cannot finish,
   revert; do not leave a half-migrated repo.
3. **Nothing is deleted.** Existing TODO, roadmap and changelog files are converted or
   retired in place with a pointer, never removed by this procedure. History stays
   readable. (Deleting a retired file later is the repo's business; the gate allows it,
   see 4.7.)
4. **Merge, don't clobber.** `.claude/settings.json`, husky hooks, `package.json`
   scripts and CLAUDE.md may already exist. Add to them; preserve what is there.
5. **Idempotent.** Before each write, check whether the target already carries the
   change (look for `check-unit.mjs` in hook config, for the `tasks/` folder, for the
   Unities paragraph in CLAUDE.md). Skip what is already done.
6. **Do not invent rules.** The role regexes in the check script come from what Phase 3
   finds, not from this document's examples.
7. **Do not guess at task content.** When converting TODO items, carry the text as
   written. Status, owner and history you cannot find are left absent, not fabricated.
8. **Record reasons truthfully.** When something is left out or changed from this
   document, the adoption task says what and why, in terms future readers can check. Do
   not record "could not be made to work" for something that was a choice.

---

## 3. Discover

Inventory the repository and write a short report to the person. Do not modify anything
in this phase.

### 3.1 Roles

Find where each role lives. There may be more than one location per role; there may be
none for some.

| Role | What to look for |
| --- | --- |
| source | `src/`, `lib/`, `app/`, `packages/*/src/`, language-specific layouts |
| test | `test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`, `e2e/` |
| doc | `docs/`, `README.md`, `*.md` next to code (including `CLAUDE.md`), ADR folders |
| task | `TODO.md`, `TASKS.md`, `ROADMAP.md`, `BACKLOG.md`, `docs/todo*`, issue-like folders |
| changelog | `CHANGELOG.md`, `HISTORY.md`, `CHANGES.md`, `changes/`, `.changeset/` |

Record the glob for each role as it actually is in this repo. These become `RULES` in
the check script. The task-role files found here are what Phase 5 converts and retires;
their names become `RULES.retired`. A new project has none, and `RULES.retired` matches
nothing.

### 3.2 Existing enforcement and conventions

- Hooks: `.husky/`, `.githooks/`, `git config core.hooksPath`, `.claude/settings.json`,
  `.claude/hooks/`, `lefthook.yml`, `.pre-commit-config.yaml`.
- Agent instructions: `CLAUDE.md`, `.claude/rules/`, `AGENTS.md`. Note size; a CLAUDE.md
  over a few hundred lines is a place to put *less*, not more.
- Changelog convention: heading style, whether entries carry commit hashes or PR links,
  whether a version heading exists for unreleased work.
- Release mechanism: git tags (`git tag --sort=-creatordate | head`), `version` in
  `package.json` / `deno.json`, a release script, CI. The compiler needs a "since"
  boundary, and the gate needs to know which files a release PR may touch.
- Runtime. Use the one the repo already runs, not the one this document's examples use:
  `deno.json` → Deno; `bun.lockb` / `bunfig.toml` → Bun; otherwise Node (18+). The
  scripts in the appendices use only `node:` built-ins, which all three run; what
  changes is the invocation (see Appendix H) and where the git hook path is configured.
- **The staging, checked.** §1 chose it. Look for what contradicts the choice: strict
  with several authors in `git shortlog -sn`, or with a PR policy already on the main
  branch; adapted with one author and no remote. A contradiction goes in the report as a
  question, not as a silent override.
- Who commits. Does every commit go through the agent, or do commits also happen from a
  shell or an editor? This decides whether the git binding (4.3) is installed. The
  Claude Code `Stop` binding (4.2) is installed regardless; this is not a question.
- Who merges (adapted). Pull requests are merged by the CI service's merge button, by a
  person, or by a tool that completes them through an API. This decides where the gate
  (4.7) runs, and who the merge man is: where the record compiler runs after a merge
  (4.5). Note the merge strategy in force; the table in §1 recommends squash.
- Definition-of-Done checklists in CLAUDE.md, PR templates or docs. These are what the
  gates replace; note them for retirement.
- Work-item tracker. If tasks map to tracker items (Azure DevOps, Jira, GitHub issues),
  note the id format; task files are named with it (Appendix D).
- **The fresh-session gap.** What would a session that has only this repo not know?
  Look for a spec (`docs/SPEC.md`, a README that explains the *what*), a decision record
  (`docs/DECISIONS.md`, ADRs), a plan (`docs/PLAN.md`, a roadmap). For each that is
  missing, list the knowledge that currently lives in a wiki, a tracker, a chat or a
  person's head and would have to be written down. These become 4.9.
- **The verification loop.** Who builds, where it runs, and who says it works. The agent
  never claims a build is green or a feature works where it runs; a person does. Write
  down who that is, so it goes into `CLAUDE.md` as *Division of labour*.

### 3.3 The record to migrate

For each task-role file found, list its items. For each item capture: text as written,
apparent status (open / done / in progress, only if the file says so), any date, any
owner, any link. Produce a proposed mapping:

    TODO.md
      - [ ] Fix flaky parser test              -> tasks/fix-flaky-parser-test.md   (open)
      - [x] Migrate to ESM                      -> tasks/migrate-to-esm.md          (done, 2026-09-02)
    ROADMAP.md
      ## Q4: offline mode                       -> tasks/4711-offline-mode.md       (open, roadmap, item 4711)

Slugs: lowercase, hyphenated, from the item text, deduplicated, prefixed with the
tracker id where one is known. Group sub-bullets under their parent item as the task's
body, not as separate tasks, unless the person says otherwise.

### 3.4 The report

Send the person, in this order:

1. The staging chosen in §1, and anything in the repo that contradicts it (3.2).
2. The role table with the globs you found and the `RULES` you intend to write,
   including `retired`.
3. What enforcement already exists and how you will merge into it.
4. The changelog convention you found and how the compiler will match it; which files a
   release PR touches besides `CHANGELOG.md`.
5. The release boundary you will use (last tag / version / first commit).
6. The runtime you will invoke the scripts with, and whether the git binding will be
   installed (yes if any commit can happen outside the agent; otherwise ask).
7. Adapted: where the gate will run (4.7), the CI service or the merging tool; where the
   record compiler will run after each merge (4.5) and under which identity it commits;
   and the merge strategy in force.
8. The TODO → `tasks/` mapping, in full.
9. The fresh-session gap: which of spec, decisions, plan are missing, and the knowledge
   each would have to capture, with where it lives today.
10. Anything you could not determine, as questions.

Then stop and wait for approval. The person may edit the mapping, the rules or the
staging; carry their edits, not your originals.

---

## 4. Install

After approval. All writes in this phase are new files or additive merges. Which
bindings are installed, and what each does, is the table in §1; the subsections below
say how.

### 4.1 The check script and its tests

Write `.claude/hooks/check-unit.mjs` from Appendix A, with `SCENE`, `RULES` (including
`retired`), `REQUIRED`, `BASE` and `RELEASE_FILES` filled from the approved report, and
its tests, `.claude/hooks/check-unit.test.mjs`, from Appendix J, with one path per role
that matches those rules. If a role has several locations, join them in one regex. If a
role does not exist in this repo (no docs folder at all), leave it out of `REQUIRED` and
say so in the report; do not invent a folder to satisfy the rule.

### 4.2 Claude Code wiring (always)

Merge Appendix B into `.claude/settings.json`, with `command` and `args` from Appendix H
for the repo's runtime. Create the file if absent. If a `Stop` (or `PreToolUse`) array
already exists, append the new matcher group; do not replace the array. Skip if an entry
already references `check-unit.mjs`.

The `Stop` binding is installed in both stagings and does not depend on team size. At
the end of every turn it compares the scene so far with its base and tells the agent —
the party most likely to produce a fluent, simultaneous, incomplete scene — what is
missing; strict refuses, adapted advises, per the table. A single developer is bound by
it as much as a team; there is nobody else to notice the skipped test.

The `PreToolUse` binding on `git commit` is strict only. Its `if` filter is best-effort
(a pattern more specific than the command name fires on any command containing `$()`,
backticks or `$VAR`, which includes heredoc commit messages), so the script itself checks
that the command is a `git commit` and exits 0 otherwise. In adapted it would be
redundant with the `Stop` advice and the git hook's warning, and is left out.

### 4.3 Git wiring (when commits can happen outside the agent)

Install if Phase 3 found that commits happen, or may happen, from a shell, an editor or
CI. If every commit goes through Claude Code, the `Stop` binding already covers it;
record in the adoption task that this was deliberately left out and why, so it is added
the day a second person or a second tool appears.

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

The hook refuses in strict and warns in adapted (table, §1): committing a half-done stage
to keep one's place is allowed there, and 4.7 is the gate.

### 4.4 The record folder

Create `tasks/` with:

- `tasks/README.md` from Appendix D (what a task file is, the naming and heading
  conventions).
- `tasks/_template.md` from Appendix D.

### 4.5 The compilers

Write `scripts/compile-changelog.mjs` from Appendix F, adjusted to the changelog
convention found in 3.2 (heading level, hash or link format). Register it as the repo's
task runner knows: `"changelog": "node scripts/compile-changelog.mjs"` in `package.json`
scripts, or the Deno/Bun equivalent from Appendix H. It runs at release.

Write `scripts/compile-record.mjs` from Appendix K and register it the same way
(`"record": "node scripts/compile-record.mjs"`). It produces `docs/DECISIONS.md` and
`docs/PLAN.md` from the task files and runs **at every merge**, not at release: a fresh
session needs yesterday's decision today. It reads only the work tree — no git, no
clock — so running it twice changes nothing, and the gate can compare its output with
what is committed.

- **Numbers.** A decision is written without a number, under `### YYYY-MM-DD · title`.
  The compiler gives it the next `D<n>` the first time it compiles it and never changes
  it afterwards, so two people cannot claim the same number, and a number seen in
  `docs/DECISIONS.md` is safe to cite (`Supersedes: D7`). Until it is compiled, a
  decision is referred to by its task file and title.
- **The merge man.** Strict: the commit is the merge. Run `npm run record` before
  committing; the compiled files ride in the same commit and the gate refuses a commit
  where they are out of date. Adapted: nobody's pull request touches the compiled files.
  After each merge into the branch in `BASE`, the compiler runs on that branch and its
  output is committed there, by whichever of these the repo has, in this order of
  preference: the tool that merges, as its next step after the merge; a CI job triggered
  by a push to that branch, committing under an identity allowed to push to it (Appendix
  I); or a person, through a pull request that contains nothing but the compiled files,
  which the gate passes only if they equal the compiler's output (4.7). Between a merge
  and its compile the compiled files are behind by that one merge and the task files
  are not; a session that needs to be sure runs the compiler with `--check`.
- **What is not compiled.** Whatever stands above the marker line in either file is its
  hand-written head: a title, an introduction, and in an adopted repository the decisions
  recorded before this version (5.4). The compiler carries it over untouched and the gate
  refuses changes to it.

### 4.6 Standing instructions

Append Appendix E (the version for the chosen staging) to CLAUDE.md as its own section,
unless an equivalent paragraph is already there. If CLAUDE.md contains a
Definition-of-Done checklist that the gates now enforce, replace that checklist with one
line pointing at the Unities section; keep any items the gates do not cover.

### 4.7 The gate (required in adapted; recommended backstop in strict)

Add a CI job that runs `check-unit.mjs --pr <target>` on every pull request, against the
commit the PR targets, and make it required for merging into the branch in `BASE`. Use
whatever the repo's CI already is; Appendix I is an Azure DevOps example. The check
passes while the target has no `check-unit.mjs`, so the pull request that carries this
adoption — retired TODO files and all — is not held to it.

If pull requests are merged by a tool through the CI service's API rather than by its
merge button, run the check in that tool, before it merges, instead of as a CI job. A
required CI policy applies to the tool's API merges too, so the two gates would collide.
Run in a checkout, the base is the merge base of source and target, with the source tip
checked out: `check-unit.mjs --pr $(git merge-base <target> HEAD)`.

**Shared files.** Three kinds are never edited by hand. `CHANGELOG.md` is *compiled* at
release: the compiler is its only writer, and deleting it is refused like editing it.
`docs/DECISIONS.md` and `docs/PLAN.md` are *compiled at every merge* (4.5): in strict a
scene must carry them equal to the record compiler's output; in adapted a scene must not
touch them at all, the one exception being a scene that contains nothing else and equals
the compiler's output, which is the compile itself. In both, a task file that removes or
retitles a decision already compiled is refused, and so is a change to the hand-written
head. A file becomes compiled when the version at the scene's base carries the marker,
so the scene that installs this — a new project's first, an adoption, an upgrade — is not
held to it. The compiled files do not count as a scene's doc change. The files the
migration retired in place (`RULES.retired`: a `TODO.md`, a `ROADMAP.md`) are
*tombstones*: editing one is refused, deleting one is not, so a repo may remove them once
the version that retired them has shipped. A new project has no tombstones; if a
`TODO.md` appears there it matches no role and is an ordinary file, which is to say the
record lives in `tasks/` and nowhere else.

**Release pull requests.** The gate refuses any change to `CHANGELOG.md`, and there is no
exemption mechanism; instead the gate verifies the blob against its sources. For a PR
whose changes are confined to `RELEASE_FILES` (`CHANGELOG.md` plus the repo's version
files), the script runs the compiler in dry-run against the target's history and checks
that the lines the PR adds to `CHANGELOG.md` equal the compiler's output. Equal → it is a
release by construction and passes. Not equal → it is a hand edit and fails, with a diff.
This is unity of action enforced literally: the compiled file must equal
compile(record). Phase 3 fills `RELEASE_FILES`; a release PR that touches anything else
is an ordinary PR and is judged as one.

**Acceptance boxes.** A task file's checkboxes are its acceptance. Each must name an
actor who is the assignee (or a script), a check that actor can perform, and a moment
before the task closes. A box about the user, users, customers, adoption or production —
"the user replaced the old app", "new schema is running in production", "feature replaced
old by active users" — is an outcome, not a check: it is the promise or a milestone in
`docs/PLAN.md`, and the gate refuses it (`ACCEPTANCE_FORBIDDEN` in the script) in every
mode, so it is caught at the commit or the turn, not only at merge. Move the sentence up
to the promise or out to the plan and replace it with the checks it decomposes into.

**The reader.** Every `## What was done` section a scene adds ends with a line
`Reviewed by: <who>` naming the reader that read the diff cold against it (Appendix G: a
read-only subagent, a colleague). The gate refuses a record without one, in every mode;
it cannot judge the reading, only that one was named, which is the same bargain as the
test rule. Records the migration carries over (5.1) are exempt. The compiler drops the
line from the changelog.

**Review rounds.** A review is part of the scene it reviews, so it is written into that
scene's task file, as a `## Review · <date>` section (Appendix D), by whoever reviews: a
person, or the verifier of Appendix G. Each item has three parts. **Found**: where, and
what happens now. **Done when**: one box per case, each written `case → outcome`, and
every case of the thing the item touches is named, including the ones that should not
change. **Not asked**: what the fix must not add. The shape exists because an item is
executed by a reader, usually an agent, that satisfies the words it is given: "keep only
the failed rows importable" names one case, and the rows that were never sent fall out
of the preview with every box ticked and every test green. The gate cannot judge whether
the cases are complete. It refuses, in every mode, an item added by the scene that lacks
one of the three parts or has a *Done when* line without `→`; and at the pull request it
refuses an item with an open box. Who ticks a box is not part of the form; that the
verifier read the diff against each line is (Appendix G). Review sections that predate
this rule are left alone.

In strict the gate is not required (every commit is already complete) but is cheap, and
catches a bypassed hook; install it if there is CI.

### 4.8 The developer's guide

The procedure and the standing paragraph are written for the agent. The people who
receive tasks need their own page. Write `docs/working-on-a-task.md` (or the repo's
equivalent) for them, and link it from the README's setup path and from
`tasks/README.md`. It covers, in this order:

1. Receiving a task: where its file is, how it is named, that `## Context` is the brief
   and is not edited, and what to do when something new turns up.
2. Doing the work: branching, committing (freely in adapted; complete scenes in strict),
   turning on the git binding, and the role table in plain words (which files count as
   source, test, doc and task, and which are never edited).
3. Finishing: the test, the doc line and the `## What was done` section — written last,
   because its presence marks the task done; read by someone who did not write it;
   appended, never edited once merged; it becomes the changelog entry. And, where the
   work chose something over something else, a `## Decisions` entry in the same task
   file: the developer never opens `docs/DECISIONS.md` or `docs/PLAN.md` to write, only
   to read; both are compiled from the task files after the merge.
4. What happens at merge (adapted) or at commit (strict): the gate, how to run it
   locally, and who sets the work item's state.
5. A review round: where it appears (a `## Review` section in the task's own file, on
   the branch), how an item reads (*Found*, *Done when*, *Not asked*), and the three
   rules for answering one. An item is done when every *Done when* line holds for the
   running program, not when its wording is satisfied; a test for it exercises the
   behaviour, not the text of a source file. Anything the fix needs beyond the item — a
   migration, an endpoint, a constraint, another caller changed — is a decision: it is
   written under `## Decisions` before it is built, and what *Not asked* names is not
   built at all without asking. After the last item, one pass over the whole diff of the
   round for what the fixes themselves added or broke. The answer to a round is a
   further `## What was done` section.
6. Adapted only: what happens to a PR that fails the gate and stays open. Name the
   repo's answer, even if it is "nothing"; the form's answer was revert, and that rule
   was traded away here.
7. A checklist.

Every fact in it is checkable against the repository. Have a reader who did not write it
check it before it is committed.

### 4.9 Spec, decisions, plan

These are the files the fresh-session test asks for. Create whichever Phase 3 found
missing; where one exists under another name, keep the name and the content, and add
only what is absent. Write them from the code and the history as they are, not as wished;
mark gaps as gaps.

- `docs/SPEC.md` — the *what*. Opens with *Why this project exists*, then *Scope* (what
  it does, what it explicitly does not), architecture, and a stack table (dependency →
  what it replaces → why). Its rule, written into it: when this file and the code
  disagree, fix one of them in the same unit.
- `docs/DECISIONS.md` — compiled (4.5); nobody appends to it. A decision is written in
  the task file of the work that made it, under `## Decisions`, as
  `### YYYY-MM-DD · title` → **Decision** / **Rejected** / **Why** (Appendix D), and
  appears here as `D<n> · YYYY-MM-DD · title` with a link back to its task file. A
  decision is reversed only by a new entry with a `Supersedes: D<n>` line. A decision
  that has no task of its own — the kickoff's, one taken in a meeting — still enters
  through a task file: the kickoff's in task 00 or the adoption task, the meeting's in a
  small task file of its own, written by whoever brought it in. Seed the adoption task's
  `## Decisions` with the staging (§1: which, and why) and with the decisions already
  baked in that a newcomer would question, titled with the original date if known and
  saying *recorded <today>* in the body. An earlier version of this procedure let this
  one file be shared and hand-appended, on the argument that a conflict there is a
  conversation. With several developers it is also two entries both numbered D14, on
  every second pull request; hence the compiler.
- `docs/PLAN.md` — compiled (4.5). *Steps*: one line per task file, in file-name order,
  linking to it; adding a step is adding a task file, and nobody edits a list. The order
  is the file names' unless a decision says otherwise. Each line carries the status
  derived from its task file (a `## What was done` section → done); what the discipline
  removes is the hand-kept status field, and this one has no hand. *Milestones* and
  *Not in scope* are set by decisions: a decision carries `Milestone: After NN: …` or
  `Not in scope: …` lines, the plan lists them with the decision's number, and they
  leave the plan when a later decision supersedes that one (restating the lines that
  still hold).

`docs/SPEC.md` goes in the `doc` role in `RULES` if not already matched; the two
compiled files are matched by `RECORD_FILES` and count toward no role. Add
`docs/DECISIONS.md` to `CLAUDE.md`'s *Read first* list. The adoption task records which
were created and which were found.

---

## 5. Migrate the record

### 5.1 Tasks

For each item in the approved mapping, write `tasks/<slug>.md` from the template:

- Title from the item text.
- `## Context` holding the original text and sub-bullets verbatim, plus
  `Migrated from <file> on <date>`.
- `## What was done` only for items the source marked done, holding whatever the source
  said about it (a date, a note, a hash). If the source says only "done", write
  `Done before adoption; no record.` Do not reconstruct history from git log into the
  task file; that is the compiler's job if ever needed. These carried-over records are the
  one kind the gate does not ask a `Reviewed by:` line of (it recognises the
  `Migrated from` and `Done before adoption` wording); nobody read them cold, and saying
  so is the honest record.

Then retire the source file in place: replace its body with a short note —
`Tasks now live in tasks/, one file each. This file is kept for history; see git log.` —
and keep the original content below a horizontal rule so nothing is lost. The file is now
a tombstone (`RULES.retired`): the gate refuses edits to it and allows its deletion, so
the repo may remove it in a later unit once this one has shipped. If the person prefers
it deleted now, they will say so; default is retirement.

### 5.2 Changelog

Do not rewrite existing entries. At the top of `CHANGELOG.md`, directly under its title,
insert:

    <!-- Compiled from tasks/ by scripts/compile-changelog.mjs. Do not edit below this line by hand. -->

Everything above the previous first entry stays as it was. From this unit on, the
compiler is the only writer.

If the repo used `changes/` or `.changeset/` fragments: convert any pending fragments
into `## What was done` sections on their tasks (create the task if none matches), then
retire the fragments folder with a README pointer. Do not run two record systems.

### 5.3 The adoption task

Write `tasks/adopt-unities.md` with a `## What was done` section listing, in plain
sentences: which staging was chosen and why, which files were created, which merged,
which retired, which bindings were left out and why, how many tasks were migrated, which
of spec, decisions and plan were created and which found, and the release boundary
chosen. This is the record of this scene. Its `## Decisions` section carries the
decisions of 4.9. A re-run that installs a newer version of this procedure appends a
further `## What was done` section here saying what was added, and any decision it took.

### 5.4 An existing `docs/DECISIONS.md` and `docs/PLAN.md`

Where the repository already has these, written by hand (every repository adopted under
a version of this procedure dated before 2026-11-11 does), convert them once, in this
scene, and run the record compiler as its last step:

- `docs/DECISIONS.md`: leave every existing entry exactly where and as it is. On its
  first run the compiler appends the marker line after them; they become the
  hand-written head, keep their numbers, and can be superseded by number like any other.
  Do not move them into task files and do not renumber them. If two existing entries
  already share a number (the collision this version removes), leave both and say so in
  the adoption task; new numbers start above the highest.
- `docs/PLAN.md`: its hand-written step table is replaced by the compiled *Steps*, so
  delete the table, after checking that every row has its task file (a row without one
  becomes a task file, per 5.1). Copy each existing milestone and each not-in-scope line,
  as written, into one decision in the adoption task — `### <today> · The plan as it
  stood` — as `Milestone:` and `Not in scope:` lines, and delete them from the file.
  What remains above the marker is the title and any introduction. Phase headings in
  the old table are not carried by the compiler; if the phases matter, say which steps
  belong to which in the introduction that stays.
- Open pull requests that edit either file will be refused once this merges; each moves
  its entry into its own task file. Say so in the final report, with the list of open
  PRs that touch them if the host can be asked.

---

## 6. Verify

Run, and include the output in the final report. Steps marked (S) apply to strict, (A)
to adapted, unmarked to both.

1. `check-unit.mjs --branch HEAD` → must print nothing (no change against itself; this
   proves the script runs).
2. Simulate a violation: `touch <source-dir>/_unities_probe`, `git add` it, run
   `--staged`. (S) must exit 2 naming the missing roles. (A) must exit 0 with a warning
   naming them. Unstage and remove the probe.
3. `compile-changelog.mjs --dry-run` → must list the adoption task's record and nothing
   else (or nothing, if the boundary is HEAD). `compile-record.mjs --check` → must exit
   0: both compiled files equal the compiler's output. `docs/DECISIONS.md` lists the
   staging decision with a number and a link to the adoption task (or task 00), and every
   entry that was there before the run is still there, unchanged.
   Then the fresh-session test itself: open a new session with no context but the repo
   and ask it what the project is, what was decided and what comes next. If it has to
   guess, 4.9 is not finished.
4. If the git binding was installed: `git commit --dry-run` does not test hooks; instead
   stage the probe file plus nothing else and attempt a real commit. (S) expect refusal,
   then unstage. (A) expect the warning and a commit, then `git reset --soft HEAD~1` and
   unstage. If the binding was deliberately left out, skip this step.
5. Confirm `.claude/settings.json` parses and `/hooks` (or the settings file) lists the
   `Stop` entry, and (S) the `PreToolUse` entry.
6. `node --test .claude/hooks/check-unit.test.mjs` → the Appendix J tests pass against
   the script with this repo's `RULES`, in the chosen staging.
7. (A) Confirm the 4.7 gate exists, and say whether whatever makes it required — a branch
   policy, or the merging tool's step — is in place; it usually lives outside the
   repository. Confirm the release check: on a throwaway branch, run the compiler for a
   fake version, commit only its output and the version bump, and run `--pr <base>` →
   must pass; then hand-edit one changelog line → must fail with a diff. Confirm the
   merge man: name what runs the record compiler after a merge and under which identity
   it commits; if that lives outside the repository and is not in place yet, say so —
   until it is, the compiled files are compiled by a person, through a pull request of
   only those files.

If any check fails, fix it before Phase 7. If it cannot be fixed, revert the working
tree and report why.

---

## 7. Finish

One unit, per the table in §1. Message or title: `Adopt the Unities`, body the same
sentences as the adoption task's record. Then tell the person:

- which staging the repo now runs, and what it enforces, in three lines (one per unity);
- the one command to compile a release (`npm run changelog -- <version>`) and, adapted,
  that the release PR passes the gate only if its changelog equals the compiler's output;
- that decisions and plan changes are written in the task file and nowhere else, the one
  command that compiles them (`npm run record`), and who runs it: (S) whoever commits,
  before the commit; (A) the merge man named in 4.5, after each merge;
- what remains manual: the reviewer before the record is committed (Appendix G); (A)
  whatever makes the 4.7 gate required; (S) the decision to revert when the `Stop` hook
  reports a half-scene twice.

---

## Appendix A — `.claude/hooks/check-unit.mjs`

Fill the per-repo block from Phase 3. Everything else is fixed.

```js
#!/usr/bin/env node
// A scene is complete or it is nothing. SCENE says how long a scene is:
//   "commit" (strict)  : every commit; --staged and --branch refuse.
//   "pr"     (adapted) : the pull request; --pr refuses, --staged and --branch warn.
//
//   --pr <base>     : what the PR changes against its target     (gate; always enforces)
//   --staged        : what `git commit` is about to record       (pre-commit, PreToolUse)
//   --branch [base] : the scene so far, committed or not         (Stop)
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---- per-repo: written by the adoption procedure from what it found ----
const SCENE = process.env.UNITIES_SCENE ?? "pr";   // "commit" for the strict staging
const RULES = {
  source:  /^src\//,                                 // e.g. /^(src|lib)\//
  test:    /^tests?\//,                              // e.g. /(^tests?\/|\.(test|spec)\.[cm]?[jt]sx?$)/
  doc:     /^(docs\/|(^|\/)(README|CLAUDE)\.md$)/,   // docs also live beside code
  task:    /^tasks\/(?!README\.md$)[^/_][^/]*\.md$/, // excludes README.md and _template.md
  shared:  /^CHANGELOG\.md$/,                        // compiled; never edited or deleted by hand
  retired: /^(TODO\.md|TASKS\.md|ROADMAP\.md)$/,     // tombstones of the migration; never edited, may be deleted. New project: /^$/
};
const REQUIRED = ["test", "doc", "task"];           // roles a source change must be accompanied by
const BASE = "origin/main";                         // the branch pull requests target
const RELEASE_FILES = /^(CHANGELOG\.md|package\.json|deno\.json)$/;   // what a release PR may touch
const COMPILER = "scripts/compile-changelog.mjs";
// docs/DECISIONS.md and docs/PLAN.md are compiled from the task files (Appendix K). Nobody
// writes them by hand: a decision is written in the task file of the work that made it.
const RECORD_FILES = /^docs\/(DECISIONS|PLAN)\.md$/;
const RECORD_COMPILER = "scripts/compile-record.mjs";
const RECORD_MARKER = "<!-- Compiled from tasks/ by scripts/compile-record.mjs.";
const SELF = ".claude/hooks/check-unit.mjs";
// An acceptance box names the assignee's check, before the task closes. One whose subject
// is the user, customers, adoption or production, or whose verb is a continuing state, is
// an outcome: a promise or a plan milestone, never a gate. Fixed; not per-repo.
const ACCEPTANCE_FORBIDDEN = /^(the |an? |all |active |end[- ])*(user|users|customer|customers|production|prod)\b|\b(is|are|was|were) (running|live|in use|using|deployed)\b|\b(has|have) (replaced|adopted|switched|migrated)\b|\b(started?|starts) (to use|using)\b|\bin production\b|\b(by|from) (active |real |the )?(users?|customers?)\b|\bactive users\b|\buninstall(ed|s)? the old\b/i;
// A record is read cold before it is committed (Appendix G). The gate cannot judge the
// reading; it checks that one is named. Records the migration carried over are exempt.
const REVIEW = /^Reviewed by:\s*\S/m;
const REVIEW_SECTION = /^## Review\b/;   // a review round, written into the task file of the scene it reviews
const REVIEW_EXEMPT = /^(Done before adoption; no record\.|Migrated from )/m;
// -----------------------------------------------------------------------

const strict = SCENE === "commit";
const mode = process.argv[2] ?? "--branch";
const input = process.stdin.isTTY ? {} : JSON.parse((await readStdin()) || "{}");
const cwd = input.cwd ?? process.cwd();
const lines = s => s.split("\n").map(l => l.trim()).filter(Boolean);

// PreToolUse's `if` filter is best-effort; make sure this really is a commit.
if (input.hook_event_name === "PreToolUse" &&
    !/(^|[;&|]\s*)git\s+commit\b/.test(input.tool_input?.command ?? "")) process.exit(0);

let files, base, deleted;   // deleting a tombstone is not editing it
if (mode === "--pr") {
  base = process.argv[3];
  if (!base) fail("usage: check-unit.mjs --pr <base>");
  if (!adopted(base)) skip(`${base} has no ${SELF}; the record is not required until the target adopts it.`);
  files = lines(git(`diff --name-only ${base} HEAD`));
  deleted = lines(git(`diff --name-only --diff-filter=D ${base} HEAD`));
} else if (mode === "--staged") {
  files = lines(git("diff --cached --name-only"));
  deleted = lines(git("diff --cached --name-only --diff-filter=D"));
  // A merge carries scenes recorded on the other branch. Only what the merge
  // commit itself writes — a file that differs from both parents — is new.
  if (gitOk("rev-parse -q --verify MERGE_HEAD")) {
    const fromTheirs = new Set(lines(git("diff --cached --name-only MERGE_HEAD")));
    files = files.filter(f => fromTheirs.has(f));
  }
} else if (mode === "--branch") {
  // Strict: the scene is what is not yet committed. Adapted: the branch since it forked.
  if (strict) {
    base = "HEAD";
  } else {
    base = process.argv[3] ?? BASE;
    if (!gitOk(`rev-parse -q --verify ${base}`) || !adopted(base)) process.exit(0);
    base = git(`merge-base ${base} HEAD`).trim();
  }
  files = [...new Set([
    ...lines(git(`diff --name-only ${base}`)),              // committed since base, plus the work tree
    ...lines(git("ls-files --others --exclude-standard")),
  ])];
  deleted = lines(git(`diff --name-only --diff-filter=D ${base}`));
} else {
  fail(`unknown mode ${mode}`);
}

// The compiled record is nobody's doc line: it does not count toward any role.
const has = re => files.some(f => re.test(f) && !RECORD_FILES.test(f));
const missing = [];
if (has(RULES.source)) {
  for (const part of REQUIRED)
    if (!has(RULES[part])) missing.push(`no ${part} change`);
}
let shared = files.filter(f => RULES.shared.test(f) || (RULES.retired.test(f) && !deleted.includes(f)));

// A release PR: only RELEASE_FILES changed, and the changelog it adds is exactly
// what the compiler produces from the record. The blob must equal compile(sources).
if (mode === "--pr" && shared.length && files.every(f => RELEASE_FILES.test(f))) {
  const added = lines(git(`diff ${base} HEAD -- CHANGELOG.md`))
    .filter(l => l.startsWith("+") && !l.startsWith("+++")).map(l => l.slice(1).trim()).filter(Boolean);
  let compiled, why;
  try {
    const since = sh(`git describe --tags --abbrev=0 ${base}`) || git("rev-list --max-parents=0 HEAD").trim();
    const out = sh(`node ${COMPILER} --dry-run --since ${since}`);
    if (/^\(no task records/.test(out)) why = " (no task records to release)";
    else compiled = lines(out).slice(1);                       // drop the version heading
  } catch { why = " (compiler failed)"; }
  if (compiled && /^## /.test(added[0] ?? "") && same(added.slice(1), compiled)) shared = [];
  else missing.push(`CHANGELOG.md does not equal the compiler's output${why ?? firstDifference(added.slice(1), compiled)}`);
}
if (shared.length) missing.push(`shared file edited directly: ${shared.join(", ")}`);

// The compiled record. A file is compiled once its version at the scene's base carries the
// marker; until then (a new project, the adoption itself) it is an ordinary file.
//   strict : the commit is also the merge, so the scene carries the compiler's output.
//   adapted: a scene does not touch the compiled files; they are compiled on the target
//            after the merge. The one scene that may is the compile itself (nothing but
//            those files), and then they must equal the compiler's output.
const from = base ?? "HEAD";
const record = files.filter(f => RECORD_FILES.test(f) && head(show(from, f)) !== null);
const compileOnly = files.length > 0 && files.every(f => RECORD_FILES.test(f));
if (files.length && existsSync(join(cwd, RECORD_COMPILER))) {
  // The compiler reads the work tree; in --pr that is the checkout of the PR's tip.
  const run = spawnSync(`node ${RECORD_COMPILER} --check`, { cwd, shell: true, encoding: "utf8" });
  if (run.status === 3) missing.push(run.stderr.trim());
  if (strict || compileOnly) {
    if (run.status === 1) missing.push(`compiled record is out of date: ${run.stderr.trim()}`);
    for (const f of record)
      if (!deleted.includes(f) && head(show(from, f)) !== head(contents(f)))
        missing.push(`the hand-written head of ${f} was edited; everything in it is changed by a new decision in a task file`);
    if (mode === "--staged" && !run.status) {
      const unstaged = lines(git("diff --name-only")).filter(f => RECORD_FILES.test(f));
      if (unstaged.length) missing.push(`compiled record not staged: ${unstaged.join(", ")}`);
    }
  } else if (record.length) {
    missing.push(`compiled record edited in this scene: ${record.join(", ")} (write the decision in your task file under "## Decisions"; it is compiled after the merge)`);
  }
  const gone = record.filter(f => deleted.includes(f));
  if (gone.length) missing.push(`compiled record deleted: ${gone.join(", ")}`);
} else if (record.length) {
  missing.push(`compiled record edited directly: ${record.join(", ")}`);
}

// Acceptance boxes in the task files this scene touches.
for (const f of files.filter(f => RULES.task.test(f) && !deleted.includes(f))) {
  let heading = "";
  for (const line of contents(f).split("\n")) {
    if (/^## /.test(line)) heading = line;
    const m = /^\s*[-*] \[[ xX]\]\s+(.+)$/.exec(line);
    // "Done when" boxes of a review describe behaviour and may well start with "the user".
    if (m && !REVIEW_SECTION.test(heading) && ACCEPTANCE_FORBIDDEN.test(m[1].trim()))
      missing.push(`acceptance box in ${f} names an outcome, not a check: "${m[1].trim()}" (make it the promise or a PLAN.md milestone)`);
  }
  // Every record this scene adds names its cold reader.
  const added = addedLines(f);
  for (const section of contents(f).split(/^(?=## )/m)) {
    if (!/^## What was done/.test(section) || !added.has(section.split("\n")[0].trim())) continue;
    if (!REVIEW.test(section) && !REVIEW_EXEMPT.test(section))
      missing.push(`record in ${f} has no "Reviewed by:" line (a reader that has not seen the work; see Appendix G)`);
  }
  // Every review round this scene adds: each item says what was found, when it is done
  // (one box per case, as "case → outcome") and what was not asked. An item with an open
  // box does not merge. Who ticks is not the gate's business; that every case is named is.
  for (const section of contents(f).split(/^(?=## )/m)) {
    if (!REVIEW_SECTION.test(section) || !added.has(section.split("\n")[0].trim())) continue;
    for (const item of section.split(/^(?=### )/m).slice(1)) {
      const name = item.split("\n")[0].replace(/^### /, "").trim();
      const doneWhen = item.split(/^\*\*Done when\*\*/m)[1]?.split(/^\*\*/m)[0] ?? "";
      const boxes = [...doneWhen.matchAll(/^\s*[-*] \[([ xX])\]\s+(.+)$/gm)];
      if (!/^\*\*Found\*\*/m.test(item) || !boxes.length || !/^\*\*Not asked\*\*/m.test(item))
        missing.push(`review item "${name}" in ${f} needs **Found**, **Done when** with a box per case, and **Not asked**`);
      for (const [, , text] of boxes)
        if (!text.includes("→")) missing.push(`review item "${name}" in ${f}: "${text.trim()}" is not "case → outcome"`);
      if (mode === "--pr" && boxes.some(b => b[1] === " ")) missing.push(`review item "${name}" in ${f} is still open`);
    }
  }
}

if (missing.length === 0) process.exit(0);

const what = { "--pr": "This pull request", "--staged": "This commit", "--branch": strict ? "This change" : "This branch" }[mode];
const reason = `Incomplete scene: ${missing.join("; ")}.`;

if (mode === "--pr") {
  const prefix = process.env.TF_BUILD ? "##vso[task.logissue type=error]" : "";
  console.error(`${prefix}${reason}`);
  console.error(`${what} cannot merge until its change carries its record (see tasks/README.md).`);
  process.exit(1);
}

if (strict) {
  const note = `${reason} Complete the record in this same change, or revert it. Do not leave it for later.`;
  // Stop, second pass: the agent was already sent back once. Let the turn end,
  // but make the half-scene visible to the person; the revert is theirs to decide.
  if (input.hook_event_name === "Stop" && input.stop_hook_active) {
    console.log(JSON.stringify({ systemMessage: note }));
    process.exit(0);
  }
  console.error(note);
  process.exit(2);   // PreToolUse: deny the commit. Stop: send the agent back. pre-commit: refuse.
}

const note = `${reason} ${what} is fine to keep, but the pull request will be refused until it is complete.`;
if (input.hook_event_name === "Stop") {
  // Advise the agent once, in its own context, so it can act; never block.
  if (!input.stop_hook_active)
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: note } }));
  else
    console.log(JSON.stringify({ systemMessage: note }));
} else {
  console.error(note);
}
process.exit(0);

function adopted(ref) { return gitOk(`cat-file -e ${ref}:${SELF}`); }
function addedLines(file) {  // lines this scene adds to the file
  let diff;
  if (mode === "--pr") diff = git(`diff ${base} HEAD -- ${file}`);
  else if (mode === "--staged") diff = git("diff --cached -- " + file);
  else if (gitOk(`ls-files --error-unmatch ${file}`)) diff = git(`diff ${base} -- ${file}`);
  else return new Set(lines(contents(file)));            // untracked: all of it is new
  return new Set(lines(diff).filter(l => l.startsWith("+") && !l.startsWith("+++")).map(l => l.slice(1).trim()));
}
function contents(file) {   // the file as this scene has it
  try {
    if (mode === "--pr") return git(`show HEAD:${file}`);
    if (mode === "--staged") return git(`show :${file}`);
    return readFileSync(join(cwd, file), "utf8");
  } catch { return ""; }
}
function show(ref, file) {   // the file as the scene's base has it; "" if absent
  try { return git(`show ${ref}:${file}`); } catch { return ""; }
}
function head(text) {        // the part above the compile marker; null if the file is not compiled
  const i = text.indexOf(RECORD_MARKER);
  return i < 0 ? null : text.slice(0, i).trimEnd();
}
function skip(message) { console.log(message); process.exit(0); }
function fail(message) { console.error(message); process.exit(2); }
function same(a, b) { return a.length === b.length && a.every((l, i) => l === b[i]); }
function firstDifference(a, b) {
  const i = a.findIndex((l, i) => l !== b[i]);
  const at = i < 0 ? a.length : i;
  return `\n  PR line ${at + 1}: ${JSON.stringify(a[at] ?? "(end)")}\n  compiled: ${JSON.stringify(b[at] ?? "(end)")}`;
}
function git(args) {
  return execSync(`git ${args}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function sh(cmd) {
  return execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function gitOk(args) {
  try { execSync(`git ${args}`, { cwd, stdio: "ignore" }); return true; }
  catch { return false; }
}
function readStdin() {
  return new Promise(r => {
    let s = "";
    process.stdin.on("data", d => s += d).on("end", () => r(s));
  });
}
```

## Appendix B — `.claude/settings.json` (merge)

Both stagings:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node",
        "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/check-unit.mjs", "--branch"]
      }]
    }]
  }
}
```

Strict adds:

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
    }]
  }
}
```

In adapted the `Stop` hook compares the branch so far — commits and uncommitted work —
with `BASE`, and if the pull request would fail, tells the agent what is missing, once
per turn, without blocking. In strict it compares the work tree with `HEAD` and refuses
to let the turn end on an incomplete scene; on the second refusal it lets go and tells
the person.

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

How to work on a task — receiving it, finishing it, what the unit needs:
`docs/working-on-a-task.md`. This file is the format.

One file per task. Task files are the record; everything else (docs/DECISIONS.md,
docs/PLAN.md, CHANGELOG.md, boards, status) is compiled from them and never edited by
hand. A task file belongs to one scene — one piece of work, on one branch, by one
developer with whatever agents, reviewers and hooks act for them — and everyone acting in
that scene writes in it. Two scenes never write the same file, which is why nothing here
needs a merge by hand.

A task file is named `<work item id>-<task description>.md`: the tracker's id for the
work it belongs to, then a short kebab-case description. Several tasks under one item
share the prefix. A task with no work item yet is named by its description alone and gets
the prefix when one is assigned; renaming it then is fine, because the changelog compiler
follows renames.

A task file has:

- a title (H1);
- `## Context`: what was asked, by whom, where it came from — written when it arrived.
  It carries the **promise** (what the user gets, in the user's words, never
  implementation; it may be unverifiable) and the **acceptance** boxes. An acceptance box
  is a check: it names an actor who is the assignee of the task (or a script), a check
  that actor can perform, and a moment before the task closes. A box about the user,
  customers, adoption or production ("the user replaced the old app", "schema is running
  in production") is an outcome, not a check; it belongs in the promise or in
  `docs/PLAN.md` under *Milestones*, and the gate refuses it;
- `## What was done`: appended in the same unit (commit or pull request, by the repo's
  staging) as the change it describes, once, never edited afterwards once merged. A task
  may accumulate several such sections over several units; each is a separate entry in
  the compiled changelog. Its last line is `Reviewed by: <who>`: the reader that had not
  seen the work and read the diff against this section before it was committed. The gate
  refuses a record without it;
- `## Decisions`, when the work chose one thing over another: one entry per choice,
  appended in the same unit, never edited or removed once merged.

      ### 2026-11-11 · <title: the choice, in a few words>

      **Decision** — <what was chosen>
      **Rejected** — <what was not, by name>
      **Why** — <the reason a newcomer would need>

  No number: `docs/DECISIONS.md` is compiled from these entries after the merge and the
  compiler numbers them (`D<n>`). Until then, refer to a decision by its task file and
  title. Optional lines at the end of an entry, each on its own line:
  `Supersedes: D7` (the only way a compiled decision is reversed);
  `Milestone: After 05: <outcome>` and `Not in scope: <thing>` (the only way a line gets
  into `docs/PLAN.md` — and it leaves when a later decision supersedes this one). A
  decision that comes from outside the work, a meeting or a request, gets a small task
  file of its own, written by whoever brought it in.

- `## Review · <date>`, when the work is reviewed: written by the reviewer (a person or
  a verifying agent) into this file, on the work's own branch. One `###` item per
  finding:

      ### <the finding, in a few words>

      **Found** — <where, and what happens now>

      **Done when**

      - [ ] <case> → <outcome>
      - [ ] <every other case of the same thing, including those that must not change> → <outcome>

      **Not asked** — <what the fix must not add: a schema change, an endpoint, a refactor>

  A *Done when* line is a state of the running program, never an instruction ("keep
  only…", "use them", "refresh while untouched" are instructions, and each has more than
  one reading). The gate refuses an item without the three parts or a line without `→`,
  and a pull request with an open box. The answer to a round is a further
  `## What was done` section; anything the fix needed beyond the item is first a
  `## Decisions` entry.

The plan's steps are the task files themselves: adding a step is adding a file here.

Status is derived: no "what was done" → open; present → done; included in a compiled
release → shipped. There is no status field to keep in sync.

Outside input enters here and nowhere else. If it is not a task file, it did not arrive.
```

`tasks/_template.md`:

```md
# <title>

## Context

<what was asked, by whom, from where; date of arrival>

**Promise** — <what the user gets, in the user's words; never implementation>

**Acceptance**

- [ ] <actor: the assignee, or a script> <the check they perform, before this task closes>

<!-- append below, in the same unit as the change:
     `## Decisions`, if the change chose something: `### YYYY-MM-DD · title`, then
         **Decision** / **Rejected** / **Why**; no number, the compiler assigns it;
     `## What was done`, one section per change, each ending with
         `Reviewed by: <reader that had not seen the work>`.
     `## Review · <date>`, written by the reviewer: per finding `### title`, **Found**,
         **Done when** (a box per case, `case → outcome`), **Not asked**.
     Never write in docs/DECISIONS.md or docs/PLAN.md; they are compiled from this file. -->
```

## Appendix E — CLAUDE.md paragraph

Strict:

```md
## The Unities

The work, its record and its location are the same thing at the same time. Every commit
that changes source also carries its test, its doc line and a `## What was done` section
appended to the task file in `tasks/`. This is enforced, not requested: a Stop hook
refuses to end a turn with a half-recorded change, and `git commit` refuses an incomplete
scene (`.claude/hooks/check-unit.mjs`). `CHANGELOG.md` is compiled from task records at
release (`npm run changelog -- <version>`) and is never edited by hand. If a change cannot
be completed with its record in this sitting, revert it; do not leave it for later.
Any choice with a rejected alternative gets a dated entry under `## Decisions` in the task
file of the work that made it; a listed decision is not reopened quietly but by a new
entry that supersedes it. `docs/DECISIONS.md` and `docs/PLAN.md` are read, never written:
they are compiled from the task files (`npm run record`), the commit carries the
compiler's output, and the gate refuses one where they are out of date. A review item
(`## Review` in the task file) is done when every *Done when* line holds for the running
program, not when its wording is satisfied; whatever a fix needs beyond its item is
recorded as a decision before it is built. Before committing, have a reader that
has not seen the work check that the task record describes the diff. The agent does not
claim a build is green or a feature works where it runs; <who> does. The developer's side
of all this is `docs/working-on-a-task.md`.
```

Adapted:

```md
## The Unities

The work, its record and its location are the same thing at the same time. Every pull
request that changes source also carries its test, its doc line and a `## What was done`
section appended to the task file in `tasks/`. Commits on the way are free: a stage may be
committed to keep one's place before its record exists. This is enforced at the pull
request, not at the commit: the gate runs `.claude/hooks/check-unit.mjs --pr` — as a CI
job, or in the tool that merges — and the PR cannot merge with an incomplete scene.
`git commit` and the end of a turn only warn, naming what the PR will still fail on.
`CHANGELOG.md` is compiled from task records at release (`npm run changelog -- <version>`)
and is never edited by hand; a release PR passes the gate only because its changelog
equals the compiler's output. Any choice with a rejected alternative gets a dated entry
under `## Decisions` in the task file of the work that made it; a listed decision is not
reopened quietly but by a new entry that supersedes it. `docs/DECISIONS.md` and
`docs/PLAN.md` are read, never written, and no pull request touches them: they are
compiled from the task files on the target branch after each merge, so a decision made on
this branch is in its task file and not yet in `docs/DECISIONS.md`. A review item
(`## Review` in the task file) is done when every *Done when* line holds for the running
program, not when its wording is satisfied; whatever a fix needs beyond its item is
recorded as a decision before it is built. Before
committing a record, have a reader that has not seen the work check that it describes the
diff. The agent does not claim a build is green or a feature works where it runs; <who>
does. The developer's side of all this is `docs/working-on-a-task.md`.
```

## Appendix F — `scripts/compile-changelog.mjs`

Adjust `formatEntry` to the repo's existing changelog convention. Keep blank lines inside a
record — they are its paragraph and list breaks — and keep the rename-following: task
files are renamed when they get a work item id, and a record written under the old name
must compile under the new one. The gate (4.7) compares a release PR against this
script's `--dry-run` output, so its output must be deterministic for a given `--since`:
no timestamps finer than the date, no environment-dependent ordering.

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
const version = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--since");
if (!version && !dry) { console.error("usage: compile-changelog <version> [--since <ref>] [--dry-run]"); process.exit(1); }

const sh = c => execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const since = sinceIdx >= 0 ? argv[sinceIdx + 1]
  : (sh("git describe --tags --abbrev=0 2>/dev/null || true") || sh("git rev-list --max-parents=0 HEAD"));

const raw = sh(`git log --no-merges --reverse --format=%x1e%h%x1f%as -p ${since}..HEAD -- tasks/`);
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
    if (inSection && current) current.lines.push(text);
  }
}

// Task files get renamed (e.g. when a work item id is assigned). Records written
// under an earlier name must land under the file's current name.
const renamed = new Map();
for (const line of sh(`git log --reverse --format= --name-status -M --diff-filter=R ${since}..HEAD -- tasks/`).split("\n")) {
  const [, from, to] = line.split("\t");
  if (from && to) renamed.set(from, to);
}
const current = f => {
  const seen = new Set();
  while (renamed.has(f) && !seen.has(f)) { seen.add(f); f = renamed.get(f); }
  return f;
};

const byTask = new Map();
for (const e of entries) {
  const file = current(e.file);
  if (!byTask.has(file)) byTask.set(file, []);
  byTask.get(file).push(e);
}

const title = f => {
  if (!existsSync(f)) return f.replace(/^tasks\//, "").replace(/\.md$/, "");
  const m = readFileSync(f, "utf8").match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : f;
};

// ---- per-repo: match the existing changelog convention ----
// Blank lines inside a record are its paragraph and list breaks: keep them, trim the
// ends. The hash goes once per record. Ordering is by task path, then by commit order,
// so the output is deterministic for the gate.
const trimBlank = lines => {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};
const formatEntry = (e) => `${trimBlank(e.lines.filter(l => !/^Reviewed by:/.test(l))).join("\n")}\n\nRecorded in \`${e.hash}\`.`;
const today = new Date().toISOString().slice(0, 10);
let out = `## ${version ?? "<version>"} — ${today}\n\n`;
for (const file of [...byTask.keys()].sort()) {
  out += `### ${title(file)}\n\n${byTask.get(file).map(formatEntry).join("\n\n")}\n\n`;
}
// -----------------------------------------------------------

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

The compiler writes `CHANGELOG.md`, which the `shared` rule forbids editing by hand. In
strict the release commit is made from a shell with `--no-verify`, the one documented
bypass. In adapted no bypass exists: the release PR passes the gate because its changelog
equals this script's output (4.7).

## Appendix G — the reviewer

The gates test presence, not truth. A task record that describes the diff wrongly passes
every check above. Before committing a record, a reader that has not seen the work reads
the staged diff cold against the task file and answers one question: does the
`## What was done` section describe this change — nothing claimed that the diff does not
do, nothing significant left out? In Claude Code that is a subagent with read-only tools,
invoked explicitly before `git commit`; for a person, a colleague. Its verdict is
advisory; its value is that it did not write the record it is checking. In practice it
earns its place: it routinely finds the decision or the side change the writer forgot to
mention; a decision it finds goes under `## Decisions` in the same task file. It is also the one step of the form that is an instruction rather than a gate,
so the gate asks for its trace: the record's last line, `Reviewed by: <who>`, and a
record without it is an incomplete scene (4.7). The line says a reading happened, not
that it was good; that is as far as presence-checking goes.

**What the reader verifies.** Reading the record against the diff is the first of three
questions, and the same reader answers all three in one pass:

1. Does each `## What was done` section describe the diff — nothing claimed that the
   diff does not do, nothing significant left out?
2. For each review item the scene answers: does every *Done when* line hold, checked
   against the code path and not against the item's wording or the test's name? A test
   that asserts the text of a source file, or that a field is filled which nothing
   reads, does not show a line holds.
3. What did the change add or break beside what it was asked: a schema change, a
   migration, a new direct dependency, a caller of something it altered, anything an
   item's *Not asked* names — and is each of those a `## Decisions` entry?

Its findings are written as a `## Review` section in the same task file, in the item
shape of Appendix D, so that a verifier's finding and a person's review are the same
thing to the developer and to the gate. It ticks the boxes it found to hold and leaves
the others open. Run by hand in Claude Code today or by the merging tool before it
merges, it is one procedure: the oars, not the helm.

**How the reviewer is run.** The review belongs to the same scene as the record, so the
agent waits for it. Where the `Agent` tool takes `run_in_background`, run the reviewer
with it set to `false`: the report comes back in the tool result, the `Reviewed by:` line
is written, and the turn ends with a complete scene. Where the tool has no such option
and subagents only run in the background, the report arrives after the turn ends, and the
Stop hook refuses that turn once because the record has no `Reviewed by:` line yet. That
refusal is correct and expected: at that moment the change *is* unreviewed. Write the line
when the report arrives, and the hook lets go on the next pass as §1 describes. Neither
case is a reason to relax the hook or to commit ahead of the review; the commit waits for
the report in both.

## Appendix H — runtimes

The scripts use only `node:child_process` and `node:fs`, which Node, Deno and Bun all
provide. Only the invocation differs. Use the same form everywhere a script is called:
`.claude/settings.json` (`command` + `args`), the pre-commit line, the gate, and the task
runner. The check script shells out to `node scripts/compile-changelog.mjs` for the
release verification and to `node scripts/compile-record.mjs --check` for the compiled
record; on Deno or Bun change `node` in those two calls to the matching invocation. The
record compiler needs no `--allow-run`; it reads `tasks/` and writes the two files in
`docs/` (`deno run --allow-read --allow-write=docs scripts/compile-record.mjs`), and
gets a `record` entry in the task runner beside `changelog`.

| Runtime | `command` | `args` prefix | Task runner entry |
| --- | --- | --- | --- |
| Node | `node` | — | `package.json` → `"scripts": {"changelog": "node scripts/compile-changelog.mjs"}` |
| Deno | `deno` | check: `run --allow-run=git,deno --allow-read --allow-env=TF_BUILD,UNITIES_SCENE`; compiler: `run --allow-run=git --allow-read --allow-write=CHANGELOG.md` | `deno.json` → `"tasks": {"changelog": "deno run --allow-run=git --allow-read --allow-write=CHANGELOG.md scripts/compile-changelog.mjs"}` |
| Bun | `bun` | `run` | `package.json` scripts as for Node, with `bun` |

Deno example for `.claude/settings.json`:

```json
{
  "type": "command",
  "command": "deno",
  "args": ["run", "--allow-run=git,deno", "--allow-read", "--allow-env=TF_BUILD,UNITIES_SCENE",
           "${CLAUDE_PROJECT_DIR}/.claude/hooks/check-unit.mjs", "--branch"]
}
```

Keep the permission list that narrow; if Deno asks for more, grant that one name, not
`-A`. A hook with `-A` is a hook nobody reads.

## Appendix I — the gate in Azure DevOps

Azure Repos ignores `pr:` triggers in YAML. Register this pipeline as a Build Validation
policy on the gated branch (Project settings → Repositories → Policies → the branch),
required, so it runs on every pull request into it.

```yaml
trigger: none

pool:
  vmImage: ubuntu-latest

steps:
  # A PR build checks out the merge of the PR into its target: HEAD^1 is the target,
  # so HEAD^1..HEAD is exactly what the PR would change. Depth 2 reaches it.
  # This relies on the policy's default merge-commit checkout. If the policy is ever
  # switched to a rebase or squash build, HEAD^1 is no longer the target; use the
  # merge-base form from 4.7 instead.
  - checkout: self
    fetchDepth: 2
    clean: true

  - task: UseNode@1
    inputs:
      version: 22.x

  - bash: |
      set -euo pipefail
      if [ "$BUILD_REASON" != "PullRequest" ]; then exit 0; fi
      # The release check needs the last tag reachable from the target.
      git fetch --quiet --tags --depth=1 origin || true
      node .claude/hooks/check-unit.mjs --pr HEAD^1
    displayName: Check the change carries its record
```

**The merge man.** A second pipeline, triggered by pushes to the gated branch, compiles
the record after each merge and pushes the result. Its build identity needs *Contribute*
and *Bypass policies when pushing* on that branch (Project settings → Repositories →
Security), and nothing else does. `[skip ci]` keeps its own push from triggering it
again. Leave this pipeline out where the tool that merges runs the compiler itself.

```yaml
trigger:
  branches:
    include: [main]

pool:
  vmImage: ubuntu-latest

steps:
  - checkout: self
    persistCredentials: true
    clean: true

  - task: UseNode@1
    inputs:
      version: 22.x

  - bash: |
      set -euo pipefail
      node scripts/compile-record.mjs
      if git diff --quiet -- docs/DECISIONS.md docs/PLAN.md; then exit 0; fi
      git config user.name "merge man"
      git config user.email "merge-man@localhost"
      git add docs/DECISIONS.md docs/PLAN.md
      git commit -m "Compile the record [skip ci]"
      git push origin HEAD:$(Build.SourceBranchName)
    displayName: Compile decisions and plan from the task files
```

Two merges close together make two runs; the second push can be rejected because the
first moved the branch. The compiler is idempotent, so the fix is to run the pipeline
again, or to let the next merge's run pick both up.

## Appendix J — `.claude/hooks/check-unit.test.mjs`

Fill the per-repo paths with one file in each role that `RULES` matches. The tests build
throwaway repositories, so they need git and nothing else. They pin the behaviour the
practice depended on: the gate at the pull request, free commits in adapted, refused
commits in strict, merges that do not re-check the other branch's scenes, a target that
has not adopted yet, tombstones that may be deleted but not edited, the release check,
review rounds whose items must name their cases and be closed before merge,
and the compiled record: numbers that never change, a pull request that may not touch
`docs/DECISIONS.md` or `docs/PLAN.md`, the compile that may, and the strict commit that
must carry them up to date.

```js
// Run with: node --test .claude/hooks/check-unit.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---- per-repo: one path in each role, matching RULES in check-unit.mjs ----
const SOURCE = "src/x.ts";
const TEST = "tests/x.test.ts";
const DOC = "docs/a.md";
const TASK = "tasks/1-t.md";
const SHARED = "CHANGELOG.md";
const RETIRED = "TODO.md";     // leave the retired tests out in a new project, which has none
// ---------------------------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));
const hook = join(here, "check-unit.mjs");
const compiler = resolve(here, "../../scripts/compile-changelog.mjs");
const recordCompiler = resolve(here, "../../scripts/compile-record.mjs");
const DECISIONS = "docs/DECISIONS.md";
const PLAN = "docs/PLAN.md";

// A repo whose main branch has adopted the hook, unless told otherwise.
function repo({ adopted = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "check-unit-"));
  const git = (args) => execSync(`git ${args}`, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const write = (file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
  git("init -q -b main");
  git("config user.email t@example.com");
  git("config user.name t");
  git("config commit.gpgsign false");
  write(SHARED, "# Changelog\n\n<!-- Compiled from tasks/ by scripts/compile-changelog.mjs. Do not edit below this line by hand. -->\n");
  write(RETIRED, "Tasks now live in tasks/, one file each.\n");
  write(SOURCE, "base\n");
  write(DOC, "base\n");
  if (adopted) {
    mkdirSync(join(dir, ".claude/hooks"), { recursive: true });
    copyFileSync(hook, join(dir, ".claude/hooks/check-unit.mjs"));
    mkdirSync(join(dir, "scripts"), { recursive: true });
    copyFileSync(compiler, join(dir, "scripts/compile-changelog.mjs"));
    copyFileSync(recordCompiler, join(dir, "scripts/compile-record.mjs"));
  }
  // The merge man: compiles docs/DECISIONS.md and docs/PLAN.md from the task files.
  const compile = () => execSync("node scripts/compile-record.mjs", { cwd: dir, stdio: "ignore" });
  const read = (file) => readFileSync(join(dir, file), "utf8");
  if (adopted) compile();
  git("add -A");
  git("commit -q -m base");
  git("tag v0");
  const commit = (message) => { git("add -A"); git(`commit -q -m ${message}`); };
  return { dir, git, write, commit, compile, read };
}

function run(dir, args, { scene = "pr", stdin = "" } = {}) {
  return spawnSync("node", [hook, ...args], {
    cwd: dir, input: stdin, encoding: "utf8", env: { ...process.env, UNITIES_SCENE: scene },
  });
}

const complete = (write) => {
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, "# t\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
};

// ---- the gate (both stagings) ----

test("a pull request that changes source without its record is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  commit("wip");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no \w+ change/);
});

test("work-in-progress commits are fine once the pull request as a whole carries its record", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "stage 1\n");
  commit("stage-1");
  write(SOURCE, "stage 2\n");
  commit("stage-2");
  complete(write);
  commit("record");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
});

test("a pull request editing the compiled changelog by hand is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SHARED, "hand edit\n");
  commit("edit");
  assert.match(run(dir, ["--pr", "main"]).stderr, /CHANGELOG\.md does not equal/);
});

test("a pull request deleting the compiled changelog is refused", () => {
  const { dir, git, commit } = repo();
  git("checkout -q -b feature");
  git(`rm -q ${SHARED}`);
  commit("delete");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CHANGELOG\.md/);
});

test("a pull request editing a retired file is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(RETIRED, "- [ ] a new item, in the old place\n");
  commit("edit");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /shared file edited directly: TODO\.md/);
});

test("a pull request deleting a retired file is not refused", () => {
  const { dir, git, commit } = repo();
  git("checkout -q -b feature");
  git(`rm -q ${RETIRED}`);
  commit("retire");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stderr, /shared file/);
});

test("a release pull request whose changelog equals the compiler's output passes", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  commit("feature");
  git("checkout -q main");
  git("merge -q --no-ff -m merge feature");
  git("checkout -q -b release");
  execSync("node scripts/compile-changelog.mjs 1.0.0 --since v0", { cwd: dir, stdio: "ignore" });
  commit("release");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
  // then a hand edit to the compiled section
  const path = join(dir, SHARED);
  writeFileSync(path, execSync(`cat ${path}`, { encoding: "utf8" }).replace("done", "done, and more"));
  commit("tamper");
  const bad = run(dir, ["--pr", "main"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /does not equal the compiler's output/);
});

test("a pull request into a target that has not adopted the hook is not checked", () => {
  const { dir, git, write, commit } = repo({ adopted: false });
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  write(SHARED, "hand edit\n");
  commit("edit");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
});

test("on a CI merge commit, HEAD^1 is the target and only the PR's changes count", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  commit("feature");
  git("checkout -q main");
  write(DOC, "changed on main\n");   // on the target only; not the PR's doing
  commit("main");
  git("merge -q --no-ff -m merge feature");
  const result = run(dir, ["--pr", "HEAD^1"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no \w+ change/);
});

// ---- acceptance boxes (both stagings, every mode) ----

test("a task file whose acceptance box names an outcome is refused", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, "# t\n\n## Context\n\n**Acceptance**\n\n- [ ] the user uninstalled the old app and started to use the new one\n- [ ] new schema is running in production\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  commit("record");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /acceptance box in tasks\/1-t\.md names an outcome/);
  assert.match(result.stderr, /running in production/);
});

test("a task file whose acceptance boxes name the assignee's checks passes, in every mode", () => {
  const { dir, git, write, commit, compile } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, "# t\n\n## Context\n\n**Promise** — you no longer need the old app.\n\n**Acceptance**\n\n- [ ] every record from the old app exported and verified in the new one by the programmer\n- [ ] each ported workflow run end to end on the phone, logged\n- [x] `npm test` green\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  git("add -A");
  assert.equal(run(dir, ["--staged"]).status, 0);
  commit("record");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
  compile();   // strict: the commit is also the merge, so it carries the compiled record
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 0);
});

test("strict: an outcome acceptance box is refused at the commit, not only at merge", () => {
  const { dir, write, git } = repo();
  write(TASK, "# t\n\n- [ ] feature replaced old by active users\n");
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /names an outcome/);
});

// ---- the reader (both stagings, every mode) ----

test("a record without a Reviewed by line is refused; the one with it passes", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, "# t\n\n## What was done\n\ndone, nobody read it\n");
  git("add -A");
  const staged = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(staged.status, 2);
  assert.match(staged.stderr, /no "Reviewed by:" line/);
  commit("record");
  assert.match(run(dir, ["--pr", "main"]).stderr, /no "Reviewed by:" line/);
  write(TASK, "# t\n\n## What was done\n\ndone, nobody read it\n\nReviewed by: colleague\n");
  commit("reviewed");
  assert.equal(run(dir, ["--pr", "main"]).status, 0);
});

test("only records this scene adds are asked for a reader; earlier and migrated ones are not", () => {
  const { dir, git, write, commit } = repo();
  write(TASK, "# t\n\n## Context\n\nMigrated from TODO.md on 2026-01-01\n\n## What was done\n\nDone before adoption; no record.\n");
  commit("migrated");
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, "# t\n\n## Context\n\nMigrated from TODO.md on 2026-01-01\n\n## What was done\n\nDone before adoption; no record.\n\n## What was done\n\nnew work\n\nReviewed by: a reader\n");
  commit("new");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("the compiler leaves the Reviewed by line out of the changelog", () => {
  const { dir, git, write, commit } = repo();
  write(SOURCE, "changed\n");
  complete(write);
  commit("feature");
  const out = execSync("node scripts/compile-changelog.mjs --dry-run --since v0", { cwd: dir, encoding: "utf8" });
  assert.match(out, /done/);
  assert.doesNotMatch(out, /Reviewed by/);
});

// ---- adapted staging: commits and turns warn ----

test("adapted: a commit with an incomplete scene warns but is not refused", () => {
  const { dir, write, git } = repo();
  write(SOURCE, "wip\n");
  git("add -A");
  const result = run(dir, ["--staged"]);
  assert.equal(result.status, 0);
  assert.match(result.stderr, /no \w+ change.*pull request will be refused/);
});

test("a clean merge commit does not warn about what the other branch recorded", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b other");
  write(SOURCE, "base\nmore\n");
  complete(write);
  commit("other");
  git("checkout -q main");
  write("docs/b.md", "ours\n");
  commit("ours");
  git("merge --no-commit --no-ff other");
  assert.equal(run(dir, ["--staged"]).stderr, "");
});

test("adapted: the Stop hook advises the agent once, in its context, and never blocks", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "stage 1\n");
  commit("stage-1");
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: active });
  const first = run(dir, ["--branch", "main"], { stdin: stop(false) });
  assert.equal(first.status, 0);
  assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /no \w+ change/);
  const second = run(dir, ["--branch", "main"], { stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /no \w+ change/);
  complete(write);   // uncommitted and untracked still count
  assert.equal(run(dir, ["--branch", "main"], { stdin: stop(false) }).stdout, "");
});

// ---- strict staging: commits and turns refuse ----

test("strict: a commit with an incomplete scene is refused", () => {
  const { dir, write, git } = repo();
  write(SOURCE, "wip\n");
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /revert it/);
});

test("strict: deleting a retired file is a complete scene on its own", () => {
  const { dir, git } = repo();
  git(`rm -q ${RETIRED}`);
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("strict: PreToolUse ignores shell commands that are not a git commit", () => {
  const { dir, write, git } = repo();
  write(SOURCE, "wip\n");
  git("add -A");
  const pre = (command) => JSON.stringify({ hook_event_name: "PreToolUse", cwd: dir, tool_input: { command } });
  assert.equal(run(dir, ["--staged"], { scene: "commit", stdin: pre("npm test && echo $(date)") }).status, 0);
  assert.equal(run(dir, ["--staged"], { scene: "commit", stdin: pre("git commit -m \"$(cat <<'EOF'\nwip\nEOF\n)\"") }).status, 2);
});

test("strict: the Stop hook sends the agent back once, then lets go and tells the person", () => {
  const { dir, write, compile } = repo();
  write(SOURCE, "wip\n");
  const stop = (active) => JSON.stringify({ hook_event_name: "Stop", cwd: dir, stop_hook_active: active });
  const first = run(dir, ["--branch"], { scene: "commit", stdin: stop(false) });
  assert.equal(first.status, 2);
  const second = run(dir, ["--branch"], { scene: "commit", stdin: stop(true) });
  assert.equal(second.status, 0);
  assert.match(JSON.parse(second.stdout).systemMessage, /no \w+ change/);
  complete(write);
  compile();
  assert.equal(run(dir, ["--branch"], { scene: "commit", stdin: stop(false) }).status, 0);
});

// ---- the compiled record: docs/DECISIONS.md and docs/PLAN.md ----

const decision = (date, title, extra = "") =>
  `### ${date} · ${title}\n\n**Decision** — yes.\n**Rejected** — no.\n**Why** — because.\n${extra}`;
const taskWith = (...decisions) =>
  `# t\n\n## Context\n\nasked\n\n## Decisions\n\n${decisions.join("\n")}\n## What was done\n\ndone\n\nReviewed by: a reader\n`;

test("a decision written in a task file is compiled with the next number, and the plan lists the task", () => {
  const { write, compile, read } = repo();
  write(DECISIONS, "# Decisions\n\n## D1 · 2026-01-01 · written by hand before\n\nkept\n");
  write(TASK, taskWith(decision("2026-11-11", "One file per unit", "Milestone: After 03: sync proven\nNot in scope: tablets\n")));
  compile();
  assert.match(read(DECISIONS), /written by hand before\n\nkept\n\n<!-- Compiled from tasks\//);
  assert.match(read(DECISIONS), /## D2 · 2026-11-11 · One file per unit\n\n\*\*Decision\*\* — yes\./);
  assert.match(read(DECISIONS), /Source: \[tasks\/1-t\.md\]/);
  assert.match(read(PLAN), /- \[1-t\]\(\.\.\/tasks\/1-t\.md\) — t · done/);
  assert.match(read(PLAN), /## Milestones\n\n- After 03: sync proven \(D2\)/);
  assert.match(read(PLAN), /## Not in scope\n\n- tablets \(D2\)/);
  const before = read(DECISIONS) + read(PLAN);
  compile();
  assert.equal(read(DECISIONS) + read(PLAN), before);
});

test("a compiled decision keeps its number whatever is compiled after it", () => {
  const { write, compile, read } = repo();
  write(TASK, taskWith(decision("2026-11-11", "Second by date")));
  compile();
  write("tasks/0-earlier.md", taskWith(decision("2026-10-01", "First by date")));
  compile();
  assert.match(read(DECISIONS), /## D1 · 2026-11-11 · Second by date[^]*## D2 · 2026-10-01 · First by date/);
});

test("a decision that supersedes another takes that one's lines out of the plan", () => {
  const { write, compile, read } = repo();
  write(TASK, taskWith(decision("2026-11-01", "No tablets", "Not in scope: tablets\n")));
  compile();
  assert.match(read(PLAN), /- tablets \(D1\)/);
  write("tasks/2-u.md", taskWith(decision("2026-11-11", "Tablets after all", "Supersedes: D1\n")));
  compile();
  assert.doesNotMatch(read(PLAN), /tablets \(D1\)/);
  assert.match(read(DECISIONS), /## D1 · 2026-11-01 · No tablets/);   // the old entry stays
});

test("adapted: a pull request that writes its decision in its task file passes", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  commit("feature");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("adapted: a pull request that touches the compiled record is refused, by hand or by compiler", () => {
  const { dir, git, write, commit, compile, read } = repo();
  git("checkout -q -b by-hand");
  write(SOURCE, "changed\n");
  complete(write);
  write(DECISIONS, read(DECISIONS) + "\n## D1 · 2026-11-11 · appended by hand\n");
  commit("by-hand");
  assert.match(run(dir, ["--pr", "main"]).stderr, /compiled record edited in this scene: docs\/DECISIONS\.md/);
  git("checkout -q main");
  git("checkout -q -b by-compiler");
  write(SOURCE, "changed\n");
  complete(write);
  compile();
  commit("by-compiler");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /compiled record edited in this scene: docs\/PLAN\.md/);
});

test("the compiled record does not count as the doc change", () => {
  const { dir, git, write, commit, compile } = repo();
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  compile();
  git("add -A");
  const result = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no doc change/);
});

test("the compile after a merge: only the compiled files, equal to the compiler's output", () => {
  const { dir, git, write, commit, compile, read } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  commit("feature");
  git("checkout -q main");
  git("merge -q --no-ff -m merge feature");
  git("checkout -q -b record");
  compile();
  commit("compile");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
  write(DECISIONS, read(DECISIONS).replace("because", "because I say so"));
  commit("tamper");
  assert.match(run(dir, ["--pr", "main"]).stderr, /compiled record is out of date/);
  compile();
  write(PLAN, "# Plan\n\nA milestone added by hand above the line.\n" + read(PLAN).slice(read(PLAN).indexOf("\n<!-- Compiled")));
  commit("head");
  assert.match(run(dir, ["--pr", "main"]).stderr, /hand-written head of docs\/PLAN\.md was edited/);
});

test("removing or retitling a compiled decision is refused in every staging", () => {
  const { dir, git, write, commit, compile } = repo();
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  compile();
  commit("compiled");
  git("checkout -q -b feature");
  write(TASK, taskWith(decision("2026-11-11", "One file per unit, on second thought")));
  commit("retitle");
  const result = run(dir, ["--pr", "main"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /D1 .* is compiled .* never removed or retitled/);
  git("add -A");
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 0);   // nothing uncommitted
  write(TASK, taskWith(decision("2026-11-11", "Retitled again")));
  assert.equal(run(dir, ["--branch"], { scene: "commit" }).status, 2);
});

test("strict: a commit whose compiled record is out of date is refused; compiled and staged, it passes", () => {
  const { dir, git, write, compile } = repo();
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, taskWith(decision("2026-11-11", "One file per unit")));
  git("add -A");
  const stale = run(dir, ["--staged"], { scene: "commit" });
  assert.equal(stale.status, 2);
  assert.match(stale.stderr, /compiled record is out of date/);
  compile();
  assert.match(run(dir, ["--staged"], { scene: "commit" }).stderr, /compiled record not staged/);
  git("add -A");
  assert.equal(run(dir, ["--staged"], { scene: "commit" }).status, 0);
});

test("a file that is not compiled yet at the base is an ordinary file", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b old");
  write(DECISIONS, "# Decisions\n\n## D1 · 2026-01-01 · by hand\n");   // main as it was before this version
  write(PLAN, "# Plan\n\n| 01 | by hand |\n");
  commit("old");
  git("checkout -q -b upgrade");
  write(DECISIONS, "# Decisions\n\n## D1 · 2026-01-01 · by hand\n\ntidied during the upgrade\n");
  write(SOURCE, "changed\n");
  complete(write);
  commit("upgrade");
  const result = run(dir, ["--pr", "old"]);
  assert.equal(result.status, 0, result.stderr);
});

// ---- review rounds (both stagings) ----

const review = (...items) => `# t\n\n## What was done\n\ndone\n\nReviewed by: a reader\n\n## Review · 2026-11-11\n\n${items.join("\n")}`;
const item = (boxes, { found = "**Found** — created rows stay in the preview after a partial import.\n\n", notAsked = "**Not asked** — no schema change.\n" } = {}) =>
  `### Rows after a partial import\n\n${found}**Done when**\n\n${boxes.join("\n")}\n\n${notAsked}`;

test("a review item names every case as case → outcome, and what was not asked", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  write(TASK, review(item(["- [x] keep only the failed rows importable"])));
  commit("review");
  assert.match(run(dir, ["--pr", "main"]).stderr, /"keep only the failed rows importable" is not "case → outcome"/);
  write(TASK, review(item(["- [x] rows created → removed"], { notAsked: "" })));
  commit("no-not-asked");
  assert.match(run(dir, ["--pr", "main"]).stderr, /needs \*\*Found\*\*, \*\*Done when\*\* with a box per case, and \*\*Not asked\*\*/);
});

test("a pull request with an open review item does not merge; a commit on the way is not held to it", () => {
  const { dir, git, write, commit } = repo();
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  complete(write);
  const boxes = (tick) => [`- [x] rows created → removed`, `- [${tick}] rows never sent → stay, with their error, not importable`, `- [x] the user edits the default → it is no longer refreshed`];
  write(TASK, review(item(boxes(" "))));
  git("add -A");
  assert.equal(run(dir, ["--staged"]).stderr, "");
  commit("review");
  const open = run(dir, ["--pr", "main"]);
  assert.equal(open.status, 1);
  assert.match(open.stderr, /review item "Rows after a partial import" in tasks\/1-t\.md is still open/);
  write(TASK, review(item(boxes("x"))));
  commit("closed");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("a review round from before this rule is left alone", () => {
  const { dir, git, write, commit } = repo();
  write(TASK, "# t\n\n## Review\n\n### Barrages\n\n- [ ] keep only the failed rows importable\n");
  commit("old");
  git("checkout -q -b feature");
  write(SOURCE, "changed\n");
  write(TEST, "test\n");
  write(DOC, "documented\n");
  write(TASK, "# t\n\n## Review\n\n### Barrages\n\n- [ ] keep only the failed rows importable\n\n## What was done\n\ndone\n\nReviewed by: a reader\n");
  commit("new");
  const ok = run(dir, ["--pr", "main"]);
  assert.equal(ok.status, 0, ok.stderr);
});
```

## Appendix K — `scripts/compile-record.mjs`

The record compiler: `docs/DECISIONS.md` and `docs/PLAN.md` from the task files (4.5).
Adjust the three paths if the repo keeps these files elsewhere, and the heading level of
a compiled entry if the existing `docs/DECISIONS.md` uses another. Keep it a pure
function of the work tree: the gate runs it with `--check` and compares.

```js
#!/usr/bin/env node
// compile-record [--check]
// The only writer docs/DECISIONS.md and docs/PLAN.md have. Both are compiled from the
// task files: decisions from their `## Decisions` sections, the plan's steps from the
// task files that exist, its milestones and not-in-scope lines from the decisions.
// A pure function of the files in the work tree: no git, no clock, so the gate can
// compare its output with what is committed.
//   (no flag) : write both files
//   --check   : exit 0 if both equal the compiler's output, 1 if not, 3 if the record
//               itself is invalid (a compiled decision removed or retitled, a duplicate)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

// ---- per-repo ----
const TASKS = "tasks";
const DECISIONS = "docs/DECISIONS.md";
const PLAN = "docs/PLAN.md";
// ------------------
const MARKER = "<!-- Compiled from tasks/ by scripts/compile-record.mjs. Do not edit below this line by hand. -->";
const check = process.argv.includes("--check");
const invalid = message => { console.error(`Invalid record: ${message}`); process.exit(3); };
const natural = (a, b) => a.localeCompare(b, "en", { numeric: true });
const trimBlank = lines => {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
};

// ---- read the task files ----
const tasks = [];       // { file, stem, title, done }
const decisions = [];   // { key, date, title, file, order, body[] }
const names = existsSync(TASKS)
  ? readdirSync(TASKS).filter(f => /^[^_].*\.md$/.test(f) && f !== "README.md").sort(natural) : [];
for (const name of names) {
  const file = `${TASKS}/${name}`;
  const text = readFileSync(file, "utf8");
  const title = (text.match(/^#\s+(.+)$/m)?.[1] ?? name).trim();
  tasks.push({ file, stem: name.replace(/\.md$/, ""), title, done: /^## What was done/m.test(text) });
  let inDecisions = false, current = null;
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) { inDecisions = /^## Decisions\s*$/.test(line); current = null; continue; }
    if (!inDecisions) continue;
    const head = /^### (\d{4}-\d{2}-\d{2}) · (.+)$/.exec(line);
    if (head) {
      current = { key: `${head[1]} · ${head[2].trim()}`, date: head[1], title: head[2].trim(), file, order: decisions.length, body: [] };
      decisions.push(current);
    } else if (/^### /.test(line)) invalid(`${file}: a decision heading is "### YYYY-MM-DD · title", got "${line}"`);
    else if (current) current.body.push(line);
  }
}
const byKey = new Map();
for (const d of decisions) {
  if (byKey.has(d.key)) invalid(`two decisions are both "${d.key}" (${byKey.get(d.key).file}, ${d.file}); retitle the one not yet compiled`);
  byKey.set(d.key, d);
}

// ---- numbers: a compiled decision keeps its number for ever; new ones take the next ----
const split = (path, fallback) => {
  const text = existsSync(path) ? readFileSync(path, "utf8") : fallback;
  const i = text.indexOf(MARKER);
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + MARKER.length)];
};
const [decisionsHead, compiled] = split(DECISIONS,
  "# Decisions\n\nDated, append-only. A decision is reversed only by a new entry naming the one it supersedes.\nWritten in the task file of the work that made it (`## Decisions`); compiled here after each merge.\n");
let last = 0;
for (const m of (decisionsHead + compiled).matchAll(/^[#*\s]*D(\d+)\s*·/gm)) last = Math.max(last, Number(m[1]));
for (const m of compiled.matchAll(/^## D(\d+) · (\d{4}-\d{2}-\d{2} · .+)$/gm)) {
  const d = byKey.get(m[2].trim());
  if (!d) invalid(`D${m[1]} "${m[2].trim()}" is compiled in ${DECISIONS} but no task file carries it any more; a decision is reversed by a new entry, never removed or retitled`);
  d.n = Number(m[1]);
}
const fresh = decisions.filter(d => !d.n)
  .sort((a, b) => a.date.localeCompare(b.date) || natural(a.file, b.file) || a.order - b.order);
for (const d of fresh) d.n = ++last;
decisions.sort((a, b) => a.n - b.n);

// ---- docs/DECISIONS.md ----
const link = file => `[${file}](../${file})`;
let decisionsOut = `${decisionsHead.trimEnd()}\n\n${MARKER}\n`;
for (const d of decisions)
  decisionsOut += `\n## D${d.n} · ${d.key}\n\n${trimBlank(d.body).join("\n")}\n\nSource: ${link(d.file)}\n`;

// ---- docs/PLAN.md ----
// A decision may carry plan lines: `Milestone: …` and `Not in scope: …`. They stay in the
// plan until a later decision names that one in a `Supersedes: D<n>` line.
const superseded = new Set();
for (const d of decisions)
  for (const line of d.body)
    if (/^Supersedes:/.test(line)) for (const m of line.matchAll(/D(\d+)/g)) superseded.add(Number(m[1]));
const planLines = label => decisions.filter(d => !superseded.has(d.n)).flatMap(d =>
  d.body.filter(l => l.startsWith(`${label}:`)).map(l => `- ${l.slice(label.length + 1).trim()} (D${d.n})`));
const [planHead] = split(PLAN,
  "# Plan\n\nThe steps are the task files, in file-name order unless a decision says otherwise. Milestones and\nwhat is not in scope are set by decisions. All of it is compiled from `tasks/` after each merge.\n");
let planOut = `${planHead.trimEnd()}\n\n${MARKER}\n\n## Steps\n\n`;
planOut += tasks.map(t => `- [${t.stem}](../${t.file}) — ${t.title}${t.done ? " · done" : ""}`).join("\n") || "(no task files yet)";
planOut += "\n";
for (const [heading, label] of [["Milestones", "Milestone"], ["Not in scope", "Not in scope"]]) {
  const found = planLines(label);
  if (found.length) planOut += `\n## ${heading}\n\n${found.join("\n")}\n`;
}

// ---- write, or compare ----
const outputs = [[DECISIONS, decisionsOut], [PLAN, planOut]];
const stale = outputs.filter(([path, out]) => !existsSync(path) || readFileSync(path, "utf8") !== out).map(([path]) => path);
if (check) {
  if (stale.length) { console.error(`${stale.join(" and ")} not equal to the compiler's output; run scripts/compile-record.mjs`); process.exit(1); }
  process.exit(0);
}
for (const [path, out] of outputs) {
  if (!stale.includes(path)) continue;
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, out);
}
console.log(stale.length
  ? `${stale.join(", ")}: ${decisions.length} decision(s), ${fresh.length} new, from ${tasks.length} task file(s)`
  : "the compiled record is up to date");
```
