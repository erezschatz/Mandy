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
