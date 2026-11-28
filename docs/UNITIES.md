<!-- UNITIES.md 2026-11-26 · 0.7.0. Master copy: the unities-project skill folder (plugin `unities`). -->

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

The scripts this procedure plants are files in the same skill folder, under `files/`, at
the same version: the gate, its tests, the two compilers and a manifest of their hashes.
They are copied, never retyped or edited; what differs between repositories is one
configuration file (Appendix A).

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

**The form, version 1.0** (since plugin 0.6.3, 2026-11-19, when it was first numbered;
nothing in it changed then). It is that sentence and one statement for each unity,
quoted from the essay *The Unities*
(<https://github.com/erezschatz/Unities/blob/main/docs/the-unities.md>):

- Place: "Everything the work consists of lives in the repository as files."
- Time: "The record of the work and the work itself happen in the same moment." A change
  without its record is a scene that did not happen.
- Action: "there is one record, and anything else is derived from it, never kept in
  parallel", and "the check belongs in the same gesture as the writing."

The form has its own number. The version on this file's first line is the plugin's, and
it moves whenever the gate, the compilers, the bindings or this procedure change. When
the plugin version named beside the form's is not this file's, the form did not change
in this version. A staging (§1) is not part of the form: it says how much of the form a
repository holds to, and the adapted one gives up part of the unity of time. Everything
else in this file, the three paragraphs below included, is tooling: how the form is
applied with git and an agent.

- **Place.** Everything the work consists of is a file in this repository. If `git diff`
  cannot see it, it is not on stage. The test that makes the files appear: a fresh
  session, human or agent, must be able to pick up from the repo alone; whatever it would
  need and cannot find is the previous session's failure. Outside input (a request, an
  incident, a decision from a meeting) enters through one door: it becomes a file on
  arrival — a task, or a decision.
- **Time.** The record is written in the same gesture as the change. Code, its test, its
  doc line, its task record and the cold reading of that record against the diff are one
  unit: code, test, document, review. A change without its record is not a change with
  missing paperwork; it is a scene that did not happen. A pull request arrives with all
  of them done, the reading included: the review at the merge is a second reading, not
  the first, and what it sends back is what the scene's own reader should have found.
  The reading is the one member of the unit that leaves no file, only a name
  (`Reviewed by:`), so the gate can check that one was named and never that it took
  place (Appendix G).
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
test, its doc line and its task record, read cold before it is committed, and the gates
refuse anything less: `git commit`
refuses an incomplete scene. A scene ends when its work is committed, or when the person
decides to abandon it; an abandoned scene is reverted, not saved for tomorrow. Ending a
turn does not end the scene: an agent that is unsure stops and asks, and one that stops
to ask or to discuss leaves the scene uncommitted until it is finished. This is the ideal.
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
difference is one value (`scene` in the configuration, Appendix A) and which bindings are installed:

| | Strict | Adapted |
| --- | --- | --- |
| The scene | the commit | the pull request |
| `scene` in `.claude/hooks/unities.json` | `"commit"` | `"pr"` |
| `Stop` hook (end of an agent turn) | advises once and never refuses, as in adapted: a turn may end to ask (above), and the commit refuses | advises once and never refuses (Claude Code: through `additionalContext`; Codex: one continuation of the turn, 4.10) |
| `PreToolUse` on `git commit` | installed; blocks | not installed |
| pre-commit hook (where commits happen outside the agent) | refuses | warns |
| The gate at the pull request, `check-unit.mjs --pr` | optional backstop | required: it runs before each merge into `base`; what runs it is the person's (4.7) |
| A half-finished scene | stays uncommitted until finished; reverted if the person abandons it | sits as an open PR |
| `docs/DECISIONS.md`, `docs/PLAN.md` | the commit is also the merge: it carries the record compiler's output, and the gate refuses a commit where they are out of date | no pull request touches them; the merge man compiles them on the target after each merge (4.5) |
| Release | compiler output committed from a shell with `--no-verify`, the one bypass | a release PR, which passes only because its changelog equals the compiler's output |
| Merge strategy | — | squash recommended: one commit per scene lands on `main`, so its history reads as strict; the gate does not depend on it |
| The adoption itself (Phase 7) | one commit | one pull request |

Where a repo later moves from adapted to strict, that is one value, one settings entry
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
6. **Do not invent rules.** The role regexes in the configuration come from what Phase 3
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
| doc | `docs/`, `README.md`, `*.md` next to code (including `CLAUDE.md` and `AGENTS.md`), ADR folders |
| task | `TODO.md`, `TASKS.md`, `ROADMAP.md`, `BACKLOG.md`, `docs/todo*`, issue-like folders |
| changelog | `CHANGELOG.md`, `HISTORY.md`, `CHANGES.md`, `changes/`, `.changeset/` |

Record a regular expression for each role as it actually is in this repo. These become `rules` in
the gate's configuration (Appendix A). The task-role files found here are what Phase 5 converts and retires;
their names become `rules.retired`. A new project has none, and `rules.retired` matches
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
  scripts in the skill folder's `files/` use only `node:` built-ins, which all three run; what
  changes is the invocation (see Appendix H) and where the git hook path is configured.
- **The staging, checked.** §1 chose it. Look for what contradicts the choice: strict
  with several authors in `git shortlog -sn`, or with a PR policy already on the main
  branch; adapted with one author and no remote. A contradiction goes in the report as a
  question, not as a silent override.
- Who commits. Does every commit go through the agent, or do commits also happen from a
  shell or an editor? This decides whether the git binding (4.3) is installed. The
  Claude Code `Stop` binding (4.2) is installed regardless; this is not a question.
- Which agents work here. Claude Code only, or does anyone work with another agent
  (Codex)? Look for `AGENTS.md`, `.codex/`, and ask; the repository rarely shows it. The
  skill asks it at kickoff. A repository adopted under a version before 0.5.0 has no
  answer on record: ask once, and record it as a decision in the adoption task. A yes
  installs 4.10, and with it the git binding (4.3), because a second agent is a second
  place commits come from.
- Who merges (adapted). Pull requests are merged by the hosting service's merge button,
  by a person, or by a tool that completes them through an API. Note it, and what if
  anything already runs checks on pull requests: the report asks the person what will
  run the gate (4.7) and the record compiler after a merge (4.5). Note the merge strategy
  in force; the table in §1 recommends squash.
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
2. The role table with the paths you found and the `rules` you intend to write,
   including `retired`.
3. What enforcement already exists and how you will merge into it.
4. The changelog convention you found and how the compiler will match it; which files a
   release PR touches besides `CHANGELOG.md`.
5. The release boundary you will use (last tag / version / first commit).
6. The runtime you will invoke the scripts with, and whether the git binding will be
   installed (yes if any commit can happen outside the agent; otherwise ask). Which
   agents work here, and so whether 4.10 is installed; where `CLAUDE.md` and `AGENTS.md`
   both exist with different content, that, as a question.
7. Adapted: what the person says will run the gate before each merge (4.7) and the
   record compiler after it (4.5), with the identity it pushes under where it pushes to
   the branch itself, or "a person, by pull request", or that it is not decided yet; that choice is theirs,
   so ask, and do not propose one unless asked. And the merge strategy in force.
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

Copy from the skill folder's `files/`, byte for byte:

- `check-unit.mjs` → `.claude/hooks/check-unit.mjs`;
- `check-unit.test.mjs` → `.claude/hooks/check-unit.test.mjs`;
- `manifest.json` → `.claude/hooks/unities.manifest.json`.

Then write `.claude/hooks/unities.json` (Appendix A) from the approved report: `scene`,
`rules` (including `retired`), `required`, `base` and `releaseFiles`. If a role has
several locations, join them in one regular expression. If a role does not exist in this
repo (no docs folder at all), leave it out of `required` and say so in the report; do not
invent a folder to satisfy the rule.

Edit none of the copied files. Something the script does not do for this repository is a
change to the plugin, proposed as a task here and made there; the gate refuses a planted
copy that differs from the manifest (Appendix A). The tests carry their own
configuration, so nothing in them is filled in either.

### 4.2 Claude Code wiring (always)

Merge Appendix B into `.claude/settings.json`, with `command` and `args` from Appendix H
for the repo's runtime. Create the file if absent. If a `Stop` (or `PreToolUse`) array
already exists, append the new matcher group; do not replace the array. Skip if an entry
already references `check-unit.mjs`.

The `Stop` binding is installed in both stagings and does not depend on team size. At
the end of every turn it compares the scene so far with its base and tells the agent —
the party most likely to produce a fluent, simultaneous, incomplete scene — what is
missing, and never refuses the turn, since a turn may end to ask (§1); the commit (strict)
or the pull request (adapted) is what refuses. A single developer is bound by
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

Copy `scripts/compile-changelog.mjs` from the skill folder's `files/` (Appendix F). The
changelog convention found in 3.2 is matched through `changelog.recorded` in the
configuration, the one per-repo value the compiler reads; a convention that needs more is
a change to the plugin. Register it as the repo's
task runner knows: `"changelog": "node scripts/compile-changelog.mjs"` in `package.json`
scripts, or the Deno/Bun equivalent from Appendix H. It runs at release.

Copy `scripts/compile-record.mjs` from `files/` (Appendix K) and register it the same way
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
  After each merge into the branch in `base`, the compiler runs on that branch and its
  output is committed there; where something pushes it straight to that branch, it does
  so under an identity allowed to push there. What does it is the person's choice, and
  nothing for it is built unless they ask; until something does, a person compiles through a pull request
  that contains nothing but the compiled files, which the gate passes only if they equal
  the compiler's output (4.7). Between a merge
  and its compile the compiled files are behind by that one merge and the task files
  are not; a session that needs to be sure runs the compiler with `--check`.
- **What is not compiled.** Whatever stands above the marker line in either file is its
  hand-written head: a title, an introduction, and in an adopted repository the decisions
  recorded before this version (5.4). The compiler carries it over untouched. The gate
  refuses changes to it, except in an upgrade, which may change it above those decisions
  (4.7).

### 4.6 Standing instructions

Append Appendix E (the version for the chosen staging) to CLAUDE.md as its own section,
unless an equivalent paragraph is already there. If CLAUDE.md contains a
Definition-of-Done checklist that the gates now enforce, replace that checklist with one
line pointing at the Unities section; keep any items the gates do not cover.

Write `docs/reviewer.md` from Appendix G: the brief the cold reader is given. It is a
file so that every reader of a scene is asked the same questions in the same words — a
subagent of whichever agent the developer uses, a colleague, the tool that merges.

Where another agent works here (4.10), the standing instructions live in `AGENTS.md` and
every "CLAUDE.md" in this document means that file.

### 4.7 The gate (required in adapted; recommended backstop in strict)

In adapted the scene is judged at the merge: before a pull request merges into the branch
in `base`, `check-unit.mjs --pr <target>` runs, and the merge goes ahead only on exit 0.
What runs it there — a CI job, the tool that merges, a person checking the branch out
and running it, anything else — is the person's choice, not this procedure's, and the
agent builds nothing for it unless asked. The check passes while the target has no
`check-unit.mjs`, so the pull request that carries this adoption — retired TODO files and
all — is not held to it. If the person asks for something to run it, or to run the
record compiler after a merge, what is known about building one (a CI job, a merging
tool's step, an Azure DevOps listing) is in
`${CLAUDE_PLUGIN_ROOT}/skills/unities-project/RUNNING-THE-GATE.md`; an adoption that is
not asked reads none of it.

Run in a checkout, with the source tip checked out: `check-unit.mjs --pr <target>`. The
script measures the scene from the merge base of target and `HEAD`, not from the target's
tip, so a target that has moved on since the branch forked does not charge the branch
with the target's commits. The checkout therefore needs the history back to the fork
point; without it the script stops with an error instead of guessing. It stops the same
way when the checkout does not know the target's name at all — a typo, or a branch that
was never fetched — because only a target that exists and has no `check-unit.mjs` counts
as one that has not adopted yet. The release check compares a release from the last tag
reachable from the target, so the checkout needs the target's tags; without them it
compares from the first commit.

**Shared files.** Three kinds are never edited by hand. `CHANGELOG.md` is *compiled* at
release: the compiler is its only writer, and deleting it is refused like editing it.
`docs/DECISIONS.md` and `docs/PLAN.md` are *compiled at every merge* (4.5): in strict a
scene must carry them equal to the record compiler's output; in adapted a scene must not
touch them at all, the one exception being a scene that contains nothing else and equals
the compiler's output, which is the compile itself. In both, a task file that removes or
retitles a decision already compiled is refused, and so is a change to the hand-written
head. A file becomes compiled when the version at the scene's base carries the marker,
so the scene that installs this — a new project's first, an adoption — is not held to it.
An upgrade, a scene whose planted manifest carries a different `version` from its base,
may change the head above the decisions recorded before adoption, which stay as they
were and are reversed only by a new decision (in `docs/DECISIONS.md` they begin at the
head's first numbered entry or heading below the title; a `docs/PLAN.md` head holds none); in adapted it may touch the compiled files
for their head alone, leaving what is below the marker as the base had it. The compiled files do not count as a scene's doc change. The files the
migration retired in place (`rules.retired`: a `TODO.md`, a `ROADMAP.md`) are
*tombstones*: editing one is refused, deleting one is not, so a repo may remove them once
the version that retired them has shipped. A new project has no tombstones; if a
`TODO.md` appears there it matches no role and is an ordinary file, which is to say the
record lives in `tasks/` and nowhere else.

**Release pull requests.** The gate refuses any change to `CHANGELOG.md`, and there is no
exemption mechanism; instead the gate verifies the blob against its sources. For a PR
whose changes are confined to `releaseFiles` (`CHANGELOG.md` plus the repo's version
files), the script runs the compiler in dry-run against the target's history and checks
that the lines the PR adds to `CHANGELOG.md` equal the compiler's output. Equal → it is a
release by construction and passes. Not equal → it is a hand edit and fails, with a diff.
This is unity of action enforced literally: the compiled file must equal
compile(record). Phase 3 fills `releaseFiles`; a release PR that touches anything else
is an ordinary PR and is judged as one.

**Acceptance boxes.** A task file's checkboxes are its acceptance. Each must name an
actor who is the assignee (or a script), a check that actor can perform, and a moment
before the task closes. A box about the user, users, customers, adoption or production —
"the user replaced the old app", "new schema is running in production", "feature replaced
old by active users" — is an outcome, not a check: it is the promise or a milestone in
`docs/PLAN.md`, and the gate refuses it (`ACCEPTANCE_FORBIDDEN` in the script) in every
mode, so it is caught at the commit or the turn, not only at merge. Move the sentence up
to the promise or out to the plan and replace it with the checks it decomposes into.

The same holds for anything that is not the project. A box may exercise what the project
ships wherever it runs: on another operating system, under another agent, on a clean
machine, as someone's main app for a week, with a client trying it on their side. That is
a check of the project. A box may not wait on the state of something else: another
repository taking the new version, an old app removed from a phone, a client leaving the
tool they use now, a third person installing it. That is an outcome, moved as above. The
gate catches only some wordings of it; the rule is this paragraph, not the pattern.

A task is held to the rule as it is while it is open. Once it is closed, with a
`## What was done` record and no `- [ ]` outside a fenced block, a rule made later does not reach
the boxes it closed with: a scene that adds a record to it, and leaves it closed, is
judged on the boxes it adds, edits or copies. An open task, or one the scene reopens with
a new open box, is judged whole by today's rule, so no task keeps a rule of its own. A
task file renamed is read as a new one.

A box, here or in a review round, is ticked by whoever performed its check, and that
includes the agent: a scene's developer is one person with the agents that act for them
(Appendix D). The agent ticks a box it checked by reading the code or by a command whose
output it reports, and a review box the reader found to hold (Appendix G). It does not
ask a person to tick what it has checked. A *Done when* line describes the running
program and is still checked by reading the code path, as the reader checks it; that it
is about the program does not make it a person's. A box that can only be checked by
running the program where it runs belongs to the person who says it works (3.2): the
agent leaves it open and hands over those boxes alone, each with what to do and what
should be seen.

**The record.** A change in a role that the configuration holds to a task change
(source, by default; Appendix A) must add a `## What was done` section to a task file. A
task file that was only touched, a line added to its Context or a box ticked, is not a
record, and the gate refuses it as "no record": at the commit in strict, at the pull
request in adapted, where a commit on the way is told and not refused; the end of a turn
tells, in both. A section the base already held is not the scene's. A
record the scene corrects, a mistake fixed or a line added inside a `## What was done`
the base held, is never refused and is not a record either: the gate takes a changed
section for a correction when at least half its words are those of a record the scene no
longer holds as it was. A scene that changes nothing held to a task change, one that only
opens a task or corrects a record, owes no record.

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
refuses an item with an open box. Who ticks a box is not part of the form (who does is
under *Acceptance boxes*, above); that the verifier read the diff against each line is
(Appendix G). Review sections that predate
this rule are left alone.

In strict the gate is not required (every commit is already complete) but is cheap, and
catches a bypassed hook; the person may run it at the pull request too, by whatever
means they choose.

### 4.8 The developer's guide

The procedure and the standing paragraph are written for the agent. The people who
receive tasks need their own page. Write `docs/working-on-a-task.md` (or the repo's
equivalent) for them, and link it from the README's setup path and from
`tasks/README.md`. It covers, in this order:

1. Receiving a task: where its file is, how it is named, that `## Context` is the brief
   and is not edited, and what to do when something new turns up.
2. Doing the work: branching, committing (freely in adapted; complete scenes in strict),
   turning on the git binding, with Codex trusting this repository's hooks once (4.10),
   and the role table in plain words (which files count as source, test, doc and task,
   and which are never edited).
3. Finishing: code, test, document and review are one unit, and the pull request is
   opened with all four done. The test, the doc line and the `## What was done` section — written last,
   because its presence marks the task done; read by someone who did not write it,
   against `docs/reviewer.md`, before the pull request is opened and not only at merge;
   appended, and once merged only corrected, never added to as new work; it becomes the
   changelog entry. And, where the
   work chose something over something else, a `## Decisions` entry in the same task
   file: the developer never opens `docs/DECISIONS.md` or `docs/PLAN.md` to write, only
   to read; both are compiled from the task files after the merge. And who ticks a box
   (4.7): whoever performed its check, the developer's agent included, so the developer
   is handed only the boxes that can only be checked by running the program.
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
  derived from its task file: a `## What was done` section and no open box anywhere in the
  file → done; a section and a box still open → `recorded, N boxes open`; what the discipline
  removes is the hand-kept status field, and this one has no hand. *Milestones* and
  *Not in scope* are set by decisions: a decision carries `Milestone: After NN: …` or
  `Not in scope: …` lines, the plan lists them with the decision's number, and they
  leave the plan when a later decision supersedes that one (restating the lines that
  still hold).

`docs/SPEC.md` goes in the `doc` role in `rules` if not already matched; the two
compiled files are matched by `RECORD_FILES` and count toward no role. Add
`docs/DECISIONS.md` to `CLAUDE.md`'s *Read first* list. The adoption task records which
were created and which were found.

### 4.10 Other agents (when someone works here with an agent that is not Claude Code)

Install if 3.2 found, or the person said, that anyone works in this repository with
another agent. Everything above this section that is not `.claude/settings.json` already
holds for them: the record, the script, the git binding, the gate at the pull request
and the compilers are files and git, and do not know which agent wrote a change. Three
things do not reach another agent on their own: the standing instructions, the binding
at the end of a turn, and the reader. This section carries them across. It is written
for Codex; for any other agent the three are the same and only the file names differ.

**Standing instructions: one file, read by both.** Codex reads `AGENTS.md` and never
`CLAUDE.md`; Claude Code reads `CLAUDE.md`, which can import another file. So the
instructions live in `AGENTS.md`, and `CLAUDE.md` is the import. Two copies would be two
accounts of the work.

- `CLAUDE.md` exists, `AGENTS.md` does not → `git mv CLAUDE.md AGENTS.md`, then write a
  new `CLAUDE.md` whose only content is the line `@AGENTS.md` (Appendix L). Nothing in
  the moved file is reworded. If a section of it only makes sense to Claude Code (it
  names a skill, a slash command, `.claude/rules/`), ask the person whether it moves
  back under the import line; do not decide it.
- Both exist and `CLAUDE.md` already imports `AGENTS.md` → nothing to do; Appendix E goes
  in `AGENTS.md`.
- Both exist with different content → a question in the report (3.4), not a merge by
  guesswork.
- Add `AGENTS.md` to the `doc` role in `rules` beside `CLAUDE.md`.

Codex stops reading instruction files at a byte limit (`project_doc_max_bytes` in its
configuration); note the size of `AGENTS.md` in the report.

**The binding at the end of a turn.** Write `.codex/hooks.json` from Appendix L. It
calls the same script as `.claude/settings.json`, with `--codex` after the mode, and is
installed by the same table (§1): `Stop` in both stagings, `PreToolUse` on `git commit`
in strict only. The flag changes one thing. In both stagings, Claude Code is advised at
`Stop` through `additionalContext`; Codex documents no such field for `Stop`, and its one
way to tell the agent anything at the end of a turn is to continue the turn with the note
as the prompt (`"decision": "block"`). The script does that once per turn and, on the
second pass, lets go and tells the person. So under Codex the advice is one further pass
of the agent on every turn that ends with an incomplete scene, and the note says the
branch is fine to keep (adapted), or that stopping to ask or discuss is fine (strict). If that proves too loud in
practice, the remedy is a decision to leave `Stop` out of `.codex/hooks.json`
in this repository, recorded as one; it is not a change to the script.

The script stays at `.claude/hooks/check-unit.mjs`. The path is where adoption first put
it and is what `adopted()` looks for on the target branch; it is one script with several
bindings, not Claude Code's script.

**The reader.** Write `.codex/agents/unities-reader.toml` from Appendix L: a read-only
agent whose whole instruction is to carry out `docs/reviewer.md`. The standing paragraph
(Appendix E) tells the agent to give the diff to a reader that has not seen the work;
under Codex this file is that reader. Codex starts a subagent only when asked or when a
project instruction says to, which the paragraph in `AGENTS.md` now does.

**What each developer does once.** Codex runs a project's hooks only after the project
is trusted and its hooks are reviewed (`/hooks` in Codex), and asks again when the file
changes. Until a developer has done that, nothing in `.codex/hooks.json` runs for them,
silently. This goes in the developer's guide (4.8, item 2) and the README's setup line.

**What this document has not done.** The Codex files in Appendix L were written from
Codex's documentation as it stood on 2026-11-15 and were not run under Codex when this
version was written. Phase 6, step 8, runs them. If no Codex is installed where this
procedure is carried out, install the files, say in the adoption task that the Codex
binding is unverified and name the developer who will verify it; do not report it as
working.

### 4.11 What each binding enforces, and what none of them can

Nothing here is installed. It is what the person adopting should know about the bindings
above. It was carried over from the essay *The Unities* (14 October 2026) when the
essay's second part was cut as an older copy of this file; the statements about Claude
Code's behaviour are as they stood then.

Each binding enforces a different unity (S = strict, A = adapted). The table describes
the Claude Code bindings; under Codex the `Stop` continues the turn once instead
(§1, 4.10):

| Binding | Fires when | What it does | Unity |
| --- | --- | --- | --- |
| `Stop` hook | the agent finishes a turn | tells the agent once, in its own context, what the commit (S) or the PR (A) will still refuse, then tells the person; never refuses the turn, since a turn may end to ask (§1) | time |
| `PreToolUse` on `git commit` (S) | the agent is about to commit | refuses a commit that is not a complete scene | time |
| `pre-commit` | a person commits | S: refuses. A: warns | time, place |
| `--pr` at the merge (A; backstop in S) | before a pull request merges, by whatever the person runs there | refuses the merge of an incomplete scene; the one gate with teeth in the adapted staging | time |
| `shared` rule in the script | any mode | refuses a direct edit to `CHANGELOG.md` or a retired `TODO.md`; a release PR passes only if its changelog equals the compiler's output | action |
| `onFailure: "block"` (S) | the script is missing or crashes | blocks the commit; a policy that fails open is not a policy | time |
| manifest check in the script | a scene touches a planted script or the manifest | refuses a planted copy that differs from the plugin's, or is missing | action |

In strict, a clean tree passes at the commit and at the end of a turn, so reverting an
abandoned scene is always a way out. `--pr`, and `--branch` in adapted, read the commits since the fork, so
there a clean tree says nothing.

`check-unit.mjs` is the rule, in code. The essay said of a repository's own skill, if it
has one, that it "holds procedure only: how task files are named here, what the 'what was
done' heading is. The skill says how; the hooks make sure." Here that procedure is
`tasks/README.md` (4.4, Appendix D), and the sentence holds of it: the instructions say
how, the hooks make sure.

The fresh-session test is the plainest statement of unity of place; the decisions file is
unity of action applied to choices rather than changes.

With squash-merge the adapted staging's history reads as strict: one commit per scene,
each complete, even though the branch was free. The branch is the rehearsal; `main` is
the performance.

A hook can test presence but not truth, and can gate a change but not build a release.
The point of the changelog compiler is its shape: it is the compile step from sources to
blob, it runs once per release, and nobody edits its output. It reads the record out of
git history, not out of the tree, so archiving or deleting a finished task file cannot
lose its changelog entries. That holds for the changelog only. The record compiler reads
the work tree (4.5): deleting a task file drops its step from `docs/PLAN.md`, and if the
file carries a compiled decision the compiler refuses, and so does the gate (4.7). The
release tag is the one thing in the system that is not a file, and it is the right thing
not to be.

**Limits.** This list is what a person adopting should know, not every case the gate
has been read against. A case a reader constructed, which has not happened in a
repository and was not built against, is recorded in the plugin's repository as a
decision whose title begins `Left unchecked` (before 0.6.18, `Not admitted`), in
`docs/DECISIONS.md` there.

- Presence is not truth. The gate is deliberately a presence test: a file in each role,
  nothing about whether `tests/parser.test.ts` really exercises `parser.ts`. Presence
  already catches the failure this discipline exists for, the record not being written
  at all. The reviewer covers truth; nothing covers it for free.
- A touched task file is not a recorded scene, and since 0.6.8 the gate says so: a
  change in a role held to a task change must add a `## What was done` section, and a
  line added elsewhere in a task file, or inside a record it held, is refused as "no
  record" (4.7). What stays a
  presence test is the section's content: the gate sees that one was added and that a
  reader is named, not that it describes the change.
- The `Stop` hook judges one session's tree or branch. Two sessions in one repository
  each see only their own. The commit gate (strict) or the PR gate (adapted) is what
  holds across sessions.
- `onFailure: "block"` has no effect on `Stop` hooks, so a missing script silently lets
  turns end; the next gate catches the change. Keep the script in the repository and the
  path in `settings.json` correct. A missing or broken configuration is not silent: the
  gate refuses a commit and sends a turn back once, naming the file, and lets the second
  pass end with a message. That is an adoption left incomplete, which the person fixes;
  an incomplete scene is never sent back (§1).
- Hooks in `.claude/settings.json` run only after the person has trusted the folder, and
  cloud sessions do not read a machine's user settings. Committing the project settings
  is what makes the staging travel with the repository.
- Whatever makes the merge wait on the gate lives outside the repository (a branch
  policy, a merging tool's step, a person's own check). It is the one part of the staging that `git diff` cannot see, and
  the first thing to check when the gate seems to have stopped working.
- The discard is not automated anywhere. A scene the person abandons is reverted (§1);
  the gate cannot tell an abandoned scene from one paused to ask, and leaves the
  `git checkout` to a person.
- Claude Code can also start the reader of Appendix G from a hook (an agent-type `Stop`
  hook), but that feature was marked experimental; an explicitly invoked subagent is the
  stable form.
- A planted script edited together with its manifest passes. The manifest makes a local
  edit visible and deliberate, not impossible; the diff shows both.

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
a tombstone (`rules.retired`): the gate refuses edits to it and allows its deletion, so
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
The re-run also reads the head of `docs/DECISIONS.md` and `docs/PLAN.md` against the new
version: a sentence there that the version makes wrong (how a task is done, what is
compiled, who compiles) is rewritten in the same scene, and the record says which. The
decisions in the head are left as they are (4.7).

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

### 5.5 A repository whose scripts were cut from the listings

Every repository adopted under a version before 0.6.0 holds its gate, tests and compilers
as copies of this document's old listings, with its per-repo values written into them.
Convert them once, in this scene:

1. Read the per-repo block of the repository's `.claude/hooks/check-unit.mjs` (`SCENE`,
   `RULES`, `REQUIRED`, `BASE`, `RELEASE_FILES`) and write the same values into
   `.claude/hooks/unities.json` (Appendix A), each regular expression as a string. The
   closing line of `formatEntry` in `scripts/compile-changelog.mjs`, if it differs from
   ``Recorded in `<hash>`.``, goes into `changelog.recorded`. A repository whose copy of
   `scripts/compile-record.mjs` was changed to compile no plan gets `"plan": false`.
2. Compare the rest of each old copy with the listing it was cut from: the appendices of
   the repository's previous `docs/UNITIES.md` (`git show HEAD:docs/UNITIES.md`, since the
   skill has just replaced the file). A difference outside the per-repo blocks is a local
   change. Neither drop it silently nor carry it into the copy: list each in the report,
   and the person decides for each whether it becomes a task in the plugin's repository,
   to arrive in a later version, or is dropped. Either is a decision in the adoption
   task. Where its loss would reopen a defect the repository has met, say so in the
   report before anything is copied.
3. Copy the files and the manifest (4.1, 4.5) over the old copies.
4. Run the old gate and the new one on the same scenes: at least the probe of Phase 6
   step 2, a complete scene, and a hand edit of the changelog, each in the repository's
   staging. Write both results into the adoption task's further `## What was done`
   (5.3), with the configuration's values and each local change and what was decided.
   The results must agree, except where a local change was dropped or this version
   changes behaviour on purpose; say which.

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
   the planted script. Then probe the manifest check, at the repository's root, in a
   temporary index, so that the adoption's own index and work tree are left as they were
   (`<files>` is the skill folder's `files/`):

       idx=$(git rev-parse --git-path index); tmp="$idx.unities-probe"
       cp "$idx" "$tmp" 2>/dev/null || rm -f "$tmp"
       echo "// probe" >> scripts/compile-record.mjs
       GIT_INDEX_FILE="$tmp" git add .claude/hooks scripts
       GIT_INDEX_FILE="$tmp" node .claude/hooks/check-unit.mjs --staged
       cp <files>/compile-record.mjs scripts/; rm -f "$tmp"

   → (S) exit 2, (A) exit 0 with a warning, both naming `scripts/compile-record.mjs` as
   edited. The planted files are added to the temporary index because at a first
   adoption they are not yet staged, and the check judges only a scene that touches
   them; `--staged`, because in adapted `--branch` says nothing while the target has not
   adopted.
7. (A) Say what the person said will run the 4.7 gate before a merge, and whether it is
   in place and makes the merge wait; it usually lives outside the repository, and where
   nothing is decided yet, say that. Confirm the release check: on a throwaway branch, run the compiler for a
   fake version, commit only its output and the version bump, and run `--pr <target>` →
   must pass; then hand-edit one changelog line → must fail with a diff. Confirm the
   merge man: name what runs the record compiler after a merge, and the identity it
   pushes under where it pushes to the branch itself; if that lives outside the repository and is not in place yet, say so —
   until it is, the compiled files are compiled by a person, through a pull request of
   only those files.
8. If 4.10 was installed: `.codex/hooks.json` parses, and `claude` started in the repo
   still has the standing instructions (ask it what its project instructions say about
   the Unities; it must answer from `AGENTS.md`, through the import). Then, under Codex, in this order: trust the project and its hooks (`/hooks`);
   ask it what its project instructions say about the Unities (it must answer from
   `AGENTS.md`); create the probe of step 2 and end a turn — the turn continues once
   with the note naming the missing roles and ends; ask it to run the reader on a staged
   diff and confirm a second agent named `unities_reader` did the reading. Remove the
   probe. Where no Codex is at hand, say so and name who will run this step (4.10).

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
  before the commit; (A) whatever the person said will compile after each merge (3.4, item 7), or a
  person through a pull request of only the compiled files where nothing does yet;
- what remains manual: the reviewer before the record is committed (Appendix G); (A)
  whatever makes the 4.7 gate required; (S) the decision to abandon and revert a scene
  the `Stop` hook reports as incomplete;
- if 4.10 was installed: that each developer on Codex trusts the project's hooks once,
  and whether step 8 of Phase 6 was run under Codex or is still owed, and by whom.

---

## Appendix A — the gate, its configuration and the manifest

**The gate** is `files/check-unit.mjs` in the skill folder, planted at
`.claude/hooks/check-unit.mjs` byte for byte, the licence line included. Nothing in it is
per-repo, and it says what it does in its own comments: the three modes, the roles, the
compiled record, acceptance boxes, the reader, review rounds and the manifest check.
The gate and both compilers read the files of a repository (task files, the compiled
files, the changelog, the configuration and the manifest, in the work tree and from
git) with CRLF line endings as LF and without a leading byte-order mark, so a Windows
checkout gets the answer a Linux one gets.

**The configuration** is `.claude/hooks/unities.json`, written by the adoption from
Phase 3. The gate reads it from the repository it runs in, and stops with an error naming
the file when it is missing, is not JSON, or lacks a key. The values below are examples,
not defaults:

```json
{
  "scene": "pr",
  "rules": {
    "source":  "^src/",
    "test":    "^tests?/",
    "doc":     "^(docs/|(^|/)(README|CLAUDE|AGENTS)\\.md$)",
    "task":    "^tasks/(?!README\\.md$)[^/_][^/]*\\.md$",
    "shared":  "^CHANGELOG\\.md$",
    "retired": "^(TODO\\.md|TASKS\\.md|ROADMAP\\.md)$"
  },
  "required": ["test", "doc", "task"],
  "base": "origin/main",
  "releaseFiles": "^(CHANGELOG\\.md|package\\.json|deno\\.json)$",
  "changelog": { "recorded": "Recorded in `{hash}`." }
}
```

| Key | What it holds |
| --- | --- |
| `scene` | `"commit"` (strict) or `"pr"` (adapted), §1. The environment variable `UNITIES_SCENE` overrides it; the tests use that. |
| `rules` | one regular expression per role, as a JSON string (a backslash is written twice). All six are present, and a repository may add its own for `required` to name; a role the repository lacks matches nothing (`"^$"`). `task` excludes `tasks/README.md` and `_`-prefixed files; `shared` is the compiled changelog; `retired` the tombstones of 5.1, `"^$"` in a new project. |
| `required` | the roles a source change must be accompanied by. A role the repository does not have is left out (4.1). It may instead map roles to lists, where some files are held to less than source: `{"source": ["test", "doc", "task"], "procedure": ["doc", "task"]}`, with `procedure` a seventh role in `rules`. Every role it names must be in `rules`, and `source` must be held to at least one role. |
| `base` | the branch pull requests target. |
| `releaseFiles` | what a release pull request may touch: `CHANGELOG.md` and the version files (4.7). |
| `changelog.recorded` | optional: the line that closes each changelog entry, `{hash}` standing for the commit's short hash (Appendix F). |
| `run` | optional: how the gate invokes the two compilers, `"node"` when absent (Appendix H). A record compiler that cannot be run that way, or that exits with anything but its own answers, is refused, naming `run`. |
| `plan` | optional: `false` in a repository that keeps no compiled plan. The record compiler then writes and checks `docs/DECISIONS.md` alone, the gate does not ask for `docs/PLAN.md`, and a file of that name, if there is one, is an ordinary doc. Absent or `true`, the plan is compiled (4.9, Appendix K). `Milestone:` and `Not in scope:` lines in decisions then go nowhere. Where it is `false`, whatever this runbook, the standing paragraph (Appendix E) and the gate's messages say of `docs/PLAN.md` as a compiled file does not apply: the adoption writes the paragraph with `docs/DECISIONS.md` alone, and an outcome box is moved to the promise. |
| `plugin` | only in the plugin's own repository: the folder of the master files. A scene there that touches a master, a planted copy or the manifest is refused unless every planted copy and the manifest equal the masters. |

The gate refuses by name, like a missing key, a file that is not a JSON object, a `rules`
that is not a map, a rule or `releaseFiles` that is not a string or will not compile, and
a `run` that is not a non-empty string (4.11). Both compilers refuse a file that is not
valid JSON or not a JSON object; `compile-record.mjs` also a `plan` that is not a boolean,
and `compile-changelog.mjs` a `changelog.recorded` that is not a string.

**The manifest** is `files/manifest.json`: the plugin's version and the sha256 of each
shipped script, under the path it is planted at. It is planted as
`.claude/hooks/unities.manifest.json`, unchanged. When a scene touches a planted script
or the manifest, the gate compares every planted script with its hash and refuses the
scene if one differs ("planted file edited") or is missing; line endings are left out of
the hash, so a checkout that writes CRLF has edited nothing. A scene that deletes the
manifest is refused, and its scripts are judged against the manifest it deleted. A clean
tree still passes.
So a planted copy is never fixed in place: the fix is made in the plugin, gets a version,
and arrives by the re-run as a copy of the scripts and the manifest together. In the
plugin, `files/make-manifest.mjs` rewrites `manifest.json` after a script changes, and
the plugin's own tests fail until it has; it is not planted.

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
with `base`, and if the pull request would fail, tells the agent what is missing, once
per turn, without blocking. In strict it compares the work tree with `HEAD` and does the
same: it tells the agent what the commit will still refuse, and never refuses the turn,
since a turn may end to ask (§1); the `PreToolUse` hook refuses the commit.

A hook hands the gate its JSON on stdin and closes it. Run by hand, from a terminal or
an agent's shell, the gate stops listening once stdin has been silent for a second, says
so on stderr, and answers as a run by hand, so a stdin left open never holds it; `--pr`
does not read stdin at all.

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
  `docs/PLAN.md` under *Milestones*, and the gate refuses it. So is a box that waits on
  anything that is not the project ("the other repositories run the new version"), though
  the gate does not catch every wording of it; a box that runs what the project ships
  somewhere else (another operating system, a clean machine) is a check;
- `## What was done`: appended in the same unit (commit or pull request, by the repo's
  staging) as the change it describes, once. Once merged it may be corrected, a mistake
  fixed, but a correction is not a record: new work gets a new section (4.7). A task
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

Status is derived: no "what was done" → open; present, with a box in the file still
open → recorded, and the plan says how many boxes are open; present and every box
ticked → done; included in a compiled release → shipped. There is no status field to
keep in sync.

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

Where another agent works here (4.10) the paragraph goes in `AGENTS.md`, unchanged. It
names no agent: "a Stop hook" and "a reader" are whichever the developer's agent has.

Strict:

```md
## The Unities

The work, its record and its location are the same thing at the same time. Every commit
that changes source also carries its test, its doc line and a `## What was done` section
appended to the task file in `tasks/`, read cold against the diff by a reader that did not
write it: code, test, document, review are one unit. This is enforced, not requested:
`git commit` refuses an incomplete scene, and a Stop hook says what a half-recorded change
still lacks (`.claude/hooks/check-unit.mjs`). `CHANGELOG.md` is compiled from task records
at release (`npm run changelog -- <version>`) and is never edited by hand. A scene ends at
its commit, not at the end of a turn: if you are unsure, stop and ask, and leave the
change uncommitted until it is finished. If it is abandoned, revert it; do not leave it
for later.
Any choice with a rejected alternative gets a dated entry under `## Decisions` in the task
file of the work that made it; a listed decision is not reopened quietly but by a new
entry that supersedes it. `docs/DECISIONS.md` and `docs/PLAN.md` are read, never written:
they are compiled from the task files (`npm run record`), the commit carries the
compiler's output, and the gate refuses one where they are out of date. A review item
(`## Review` in the task file) is done when every *Done when* line holds for the running
program, not when its wording is satisfied; whatever a fix needs beyond its item is
recorded as a decision before it is built. Before committing, give the staged diff and
the task file to a reader that has not seen the work — a read-only subagent, never
yourself — to carry out `docs/reviewer.md`; write what it finds into the task file and
its name on the record's `Reviewed by:` line. The agent does not
claim a build is green or a feature works where it runs; <who> does. A box you checked by
reading the code or by a command whose output you report, or a review box the reader
found to hold, you tick; do not ask anyone to tick it for you. A box that can only be
checked by running the program you leave open and hand to <who>, those boxes alone, each
with what to do and what should be seen. The developer's side of all this is
`docs/working-on-a-task.md`.
```

Adapted:

```md
## The Unities

The work, its record and its location are the same thing at the same time. Every pull
request that changes source also carries its test, its doc line and a `## What was done`
section appended to the task file in `tasks/`, read cold against the diff by a reader that
did not write it: code, test, document, review are one unit, and the pull request is
opened with all four done. Commits on the way are free: a stage may be
committed to keep one's place before its record exists. This is enforced at the pull
request, not at the commit: the gate runs `.claude/hooks/check-unit.mjs --pr` before the
merge, by whatever this repository runs there, and the PR cannot merge with an
incomplete scene.
`git commit` and the end of a turn only warn, naming what the PR will still fail on. If
you are unsure, stop and ask; ending a turn to ask does not end the scene.
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
committing a record, and in any case before the pull request is opened, give the diff
and the task file to a reader that has not seen the work — a read-only subagent, never
yourself — to carry out `docs/reviewer.md`; write what it finds into the task file and
its name on the record's `Reviewed by:` line. Where the tool that merges asks the same
questions again, what the reader finds here is what does not come back from there. The
agent does not claim a build is green or a feature works where it runs; <who>
does. A box you checked by reading the code or by a command whose output you report, or
a review box the reader found to hold, you tick; do not ask anyone to tick it for you. A
box that can only be checked by running the program you leave open and hand to <who>,
those boxes alone, each with what to do and what should be seen. The developer's side of
all this is `docs/working-on-a-task.md`.
```

## Appendix F — `scripts/compile-changelog.mjs`

`files/compile-changelog.mjs` in the skill folder, planted at
`scripts/compile-changelog.mjs` byte for byte. It reads the record out of git history:
every `## What was done` section added to `tasks/` since the last tag (or `--since`),
grouped by task file, blank lines inside a record kept as its paragraph and list breaks,
and records written under an earlier name of a renamed task file compiled under its
current one. The `Reviewed by:` line is left out. The gate (4.7) compares a release PR
against its `--dry-run` output, so the output is deterministic for a given `--since`:
nothing finer than the date, no environment-dependent ordering.

Its one per-repo value is `changelog.recorded` in the gate's configuration (Appendix A),
the line that closes each entry; without it the line is ``Recorded in `<hash>`.``. A
convention that needs more than that line (another heading level, links instead of
hashes) is a change to the plugin, for every repository, and not to the copy.

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
invoked explicitly before `git commit`; in Codex, the read-only agent of
`.codex/agents/unities-reader.toml` (4.10, Appendix L); for a person, a colleague. Its verdict is
advisory; its value is that it did not write the record it is checking. In practice it
earns its place: it routinely finds the decision or the side change the writer forgot to
mention; a decision it finds goes under `## Decisions` in the same task file. It is a member of the unit like the test and the doc line (§0), and the one member that is an instruction rather than a gate,
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
thing to the developer and to the gate. It says which boxes it found to hold; whoever
asked for the reading ticks those and leaves the others open (4.7). Run by the developer's agent before the pull request, by a colleague,
or by the merging tool before it merges, it is one procedure: the oars, not the helm.

**The brief.** The three questions and the shape of the answer are a file,
`docs/reviewer.md`, so that each of those readers is given the same words. A reader run
twice on one diff, once on the developer's side and once at the merge, is one review at
two moments and will mostly find the same things; the point of the first is that the
developer fixes them before the second. Write it as below (4.6):

```md
# The reader's brief

You are reading a change you did not write and have not watched being written. You are
given a diff and the task file (or files) in `tasks/` that the diff touches. Change
nothing. Read the diff cold against the task file and answer three questions.

1. **Does the record describe the diff?** For each `## What was done` section the diff
   adds: is anything claimed that the diff does not do, and is anything significant in
   the diff left out of it?
2. **Does each review item hold?** For each item under `## Review` that this change
   answers: does every *Done when* line hold, checked against the code path and not
   against the item's wording or a test's name? A test that asserts the text of a source
   file, or that a field is filled which nothing reads, does not show that a line holds.
3. **What else did the change do?** A schema change, a migration, a new direct
   dependency, a changed caller of something it altered, anything an item's *Not asked*
   names. Is each of those an entry under `## Decisions` in the task file?

Answer in this shape and nothing else. If all three hold, say so in one line. Otherwise
one item per finding, in the form `tasks/README.md` gives for a review:

    ### <the finding, in a few words>

    **Found** — <file and place, and what happens now>

    **Done when**

    - [ ] <case> → <outcome>
    - [ ] <every other case of the same thing, including those that must not change> → <outcome>

    **Not asked** — <what the fix must not add>

A *Done when* line is a state of the running program, never an instruction. Name every
case of the thing the finding touches. For question 2, also list which existing boxes
you found to hold and which you did not.

Whoever asked you writes your findings into the task file as a `## Review · <date>`
section and names you on the record's `Reviewed by:` line. Your verdict is advisory; its
value is that you did not write what you are checking.
```

**How the reviewer is run.** The review belongs to the same scene as the record, so the
agent waits for it. Where the `Agent` tool takes `run_in_background`, run the reviewer
with it set to `false`: the report comes back in the tool result, the `Reviewed by:` line
is written, and the turn ends with a complete scene. Where the tool has no such option
and subagents only run in the background, the report arrives after the turn ends, and the
Stop hook says the record has no `Reviewed by:` line yet. That is correct and expected: at
that moment the change *is* unreviewed, and the scene is not over (§1). Write the line
when the report arrives. Neither case is a reason to commit ahead of the review; the
commit waits for the report in both.

## Appendix H — runtimes

The scripts use only `node:` built-ins (`child_process`, `crypto`, `fs`, `path`, `url`;
the tests add `test`, `assert`, `os`), which Node, Deno and Bun all provide. Only the invocation differs. Use the same form everywhere a script is called:
`.claude/settings.json` (`command` + `args`), the pre-commit line, the gate, and the task
runner. The check script shells out to `node scripts/compile-changelog.mjs` for the
release verification and to `node scripts/compile-record.mjs --check` for the compiled
record; on Deno or Bun set `run` in the configuration (Appendix A) to the invocation that
replaces `node` in those two calls, for example
`"run": "deno run --allow-run=git --allow-read --allow-env"`. No shell reads it: it is
split on spaces into a command and its arguments, so it holds no quotes, pipes or
variables. The script itself is not edited. The record compiler starts no program; it
reads `tasks/` and writes the two files in `docs/` (`deno run --allow-read
--allow-write=docs scripts/compile-record.mjs`), and gets a `record` entry in the task
runner beside `changelog`.

The scripts start git, and the runtime in `run`, by name with a list of arguments, never
through a shell, so `--allow-run` names only those. `--allow-env` is whole: Deno refuses
to start any program unless it may read the whole environment, so a list of names fails
with `NotCapable` (measured under Deno 2.9.8). The scripts do not hand a program a chosen
environment instead, because git needs what its caller set, such as a hook's
`GIT_INDEX_FILE` and `HOME` for its configuration. Under Deno, set `run` too: without it
the gate starts the compilers with `node`, which `--allow-run` does not name, and refuses
every scene that touches a file, saying the record compiler could not be run.

| Runtime | `command` | `args` prefix | Task runner entry |
| --- | --- | --- | --- |
| Node | `node` | — | `package.json` → `"scripts": {"changelog": "node scripts/compile-changelog.mjs"}` |
| Deno | `deno` | check: `run --allow-run=git,deno --allow-read --allow-env`; changelog compiler: `run --allow-run=git --allow-read --allow-env --allow-write=CHANGELOG.md`; record compiler: `run --allow-read --allow-write=docs` | `deno.json` → `"tasks": {"changelog": "deno run --allow-run=git --allow-read --allow-env --allow-write=CHANGELOG.md scripts/compile-changelog.mjs"}` |
| Bun | `bun` | `run` | `package.json` scripts as for Node, with `bun` |

Deno example for `.claude/settings.json`:

```json
{
  "type": "command",
  "command": "deno",
  "args": ["run", "--allow-run=git,deno", "--allow-read", "--allow-env",
           "${CLAUDE_PROJECT_DIR}/.claude/hooks/check-unit.mjs", "--branch"]
}
```

Keep the permission list that narrow; if Deno asks for more, grant that one name, not
`-A`. A hook with `-A` is a hook nobody reads.

`.codex/hooks.json` (4.10, Appendix L) takes one `command` string and no `args`, and has
no project-directory variable, so the same invocation is written as one line that finds
the repository root itself, with `--codex` after the mode:

| Runtime | `command` in `.codex/hooks.json` |
| --- | --- |
| Node | `node "$(git rev-parse --show-toplevel)/.claude/hooks/check-unit.mjs" --branch --codex` |
| Deno | `deno run --allow-run=git,deno --allow-read --allow-env "$(git rev-parse --show-toplevel)/.claude/hooks/check-unit.mjs" --branch --codex` |
| Bun | `bun run "$(git rev-parse --show-toplevel)/.claude/hooks/check-unit.mjs" --branch --codex` |

That line needs a POSIX shell. Where a developer runs Codex on Windows outside WSL,
Codex takes a separate `commandWindows` for the same handler; write it for the shell
Codex uses there and run step 8 of Phase 6 on that machine, because this document has
not.

## Appendix I — moved

The Azure DevOps listing that stood here, and what is known about running the gate and
the record compiler in CI or a merging tool, is in
`${CLAUDE_PLUGIN_ROOT}/skills/unities-project/RUNNING-THE-GATE.md`. It is read only when
the person asks for something to run them (4.7).

## Appendix J — `.claude/hooks/check-unit.test.mjs`

`files/check-unit.test.mjs` in the skill folder, planted at
`.claude/hooks/check-unit.test.mjs` byte for byte. The tests build throwaway
repositories, so they need git and nothing else, and each carries its own configuration
(`FIXTURE` in the file): the tests pin the behaviour of the script, not the roles of the
repository they run in, which is why nothing in the file is filled in. They pin the
behaviour the practice depended on: the gate at the pull request, free commits in
adapted, refused commits in strict, merges that do not re-check the other branch's
scenes, a target that has not adopted yet, a target that moved on after the branch
forked, tombstones that may be deleted but not edited, the release check, review rounds
whose items must name their cases and be closed before merge, a touched task file that
is not a record, and the compiled record:
numbers that never change, a pull request that may not touch `docs/DECISIONS.md` or
`docs/PLAN.md`, the compile that may, and the strict commit that must carry them up to
date; that the same script called from Codex's hooks (`--codex`, 4.10) checks the same
things and differs only in how a `Stop` reaches the agent; and that the roles
come from the configuration and a planted script edited in place is refused.

Run them with `node --test .claude/hooks/check-unit.test.mjs` in a repository, or
`node --test` at the plugin's root, where they run against the master files and one more
test checks that `manifest.json` holds the hash of every shipped file.

## Appendix K — `scripts/compile-record.mjs`

`files/compile-record.mjs` in the skill folder, planted at `scripts/compile-record.mjs`
byte for byte: `docs/DECISIONS.md` and `docs/PLAN.md` from the task files (4.5). The
paths are fixed, because the gate looks for the compiled files there. Its one per-repo
value is `plan` in the gate's configuration (Appendix A): `false`, and it compiles the
decisions alone. It is a pure
function of the work tree, no git and no clock, so the gate can run it with `--check`
and compare: exit 0 when the compiled files equal its output, 1 when they do not, 3 when
the record itself is invalid (a compiled decision removed or retitled, a duplicate) or
the configuration cannot be read for `plan` (not JSON, or a value that is not true or
false).

## Appendix L — other agents (4.10)

Written from Codex's documentation as of 2026-11-15; not run under Codex when this
version was written (4.10, and step 8 of Phase 6).

`CLAUDE.md`, once the instructions have moved to `AGENTS.md`. The import line is the
whole file unless the person keeps something for Claude Code alone, which goes under it:

```md
@AGENTS.md
```

`.codex/hooks.json`, both stagings, with the `command` for the repo's runtime from
Appendix H. Merge into an existing file as 4.2 does for `.claude/settings.json`; skip if
an entry already references `check-unit.mjs`:

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node \"$(git rev-parse --show-toplevel)/.claude/hooks/check-unit.mjs\" --branch --codex",
        "timeout": 60
      }]
    }]
  }
}
```

Strict adds the refusal at `git commit`. Codex has no `if` filter; the script checks for
itself that the command is a commit and lets anything else through:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "^Bash$",
      "hooks": [{
        "type": "command",
        "command": "node \"$(git rev-parse --show-toplevel)/.claude/hooks/check-unit.mjs\" --staged --codex",
        "timeout": 60
      }]
    }]
  }
}
```

`.codex/agents/unities-reader.toml`, the reader of Appendix G. Its instruction is a
pointer, not a copy: the questions live in `docs/reviewer.md`.

```toml
name = "unities_reader"
description = "Reads a change cold against its task file before the record is committed. Read-only; it has not seen the work."
sandbox_mode = "read-only"
developer_instructions = """
You have not seen this work being done and you change nothing.
Read docs/reviewer.md and carry it out on the diff and the task file you are given.
Answer in the shape that file gives, and nothing else.
"""
```
