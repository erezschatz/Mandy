# Plan

What stands between here and a finished 1.0. The steps are the task files, in
file-name order, which here is the `section.item` numbering they kept from the
retired [TODO.md](TODO.md); a task with no number is a fix that never had a
place in it. Milestones and what is not in scope are set by decisions. Everything
below the marker is compiled from `tasks/` by `deno task record`, and a commit
that changes a task file carries its output.

Status is derived from each task file: no `## What was done` is open, one or
more is in progress, and a last one carrying `Status: done` is done.

Two things this list does not hold. **3.1, the editing-core rewrite, is the
spine of 1.0** and its stages are tracked in "Where each stage stands" in
[REWRITE.md](REWRITE.md), not here. **What comes after 1.0** is
[ROADMAP.md](ROADMAP.md), whose sections are design essays nobody has picked
up yet rather than tasks.

<!-- Compiled from tasks/ by scripts/compile-record.mjs. Do not edit below this line by hand. -->

## Steps

- [1.1-formats](../tasks/1.1-formats.md) — 1.1 — Formats the UI does not offer yet · in progress
- [1.2-links-loose-ends](../tasks/1.2-links-loose-ends.md) — 1.2 — Links: two loose ends
- [1.4-invisible-whitespace](../tasks/1.4-invisible-whitespace.md) — 1.4 — Invisible whitespace the cleanup does not reach
- [1.5-search-and-replace](../tasks/1.5-search-and-replace.md) — 1.5 — No search-and-replace
- [1.6-undo-not-clean](../tasks/1.6-undo-not-clean.md) — 1.6 — Undo does not always come back clean · done
- [1.7-format-shortcuts](../tasks/1.7-format-shortcuts.md) — 1.7 — Format keyboard shortcuts
- [1.8-insert-line-break](../tasks/1.8-insert-line-break.md) — 1.8 — Nothing in Mandy inserts a line break
- [2.1-table-reemission](../tasks/2.1-table-reemission.md) — 2.1 — An edited table is re-emitted in house style · done
- [2.3-minority-spellings](../tasks/2.3-minority-spellings.md) — 2.3 — Minority break and emphasis spellings
- [3.1-editing-core-rewrite](../tasks/3.1-editing-core-rewrite.md) — 3.1 — Replace the editing core · in progress
- [4.2-tab-bar-bindings](../tasks/4.2-tab-bar-bindings.md) — 4.2 — Tab bar keyboard bindings are unmeasured
- [4.3-tab-naming](../tasks/4.3-tab-naming.md) — 4.3 — A tab is named by its file's basename
- [4.4-rtl-documents](../tasks/4.4-rtl-documents.md) — 4.4 — Right-to-left documents
- [4.5-pwa-reopen](../tasks/4.5-pwa-reopen.md) — 4.5 — Reopening the installed PWA
- [4.7-open-dialog-start-dir](../tasks/4.7-open-dialog-start-dir.md) — 4.7 — The Open dialog's starting directory
- [4.8-reorder-tabs](../tasks/4.8-reorder-tabs.md) — 4.8 — No way to reorder tabs
- [4.10-browser-scrollbar](../tasks/4.10-browser-scrollbar.md) — 4.10 — The browser's own scrollbar
- [4.11-outline-width](../tasks/4.11-outline-width.md) — 4.11 — The outline sidebar's width
- [4.12-newtab](../tasks/4.12-newtab.md) — 4.12 — newTab() is the only path
- [4.13-tab-switch-position](../tasks/4.13-tab-switch-position.md) — 4.13 — A tab switch always comes back to the top of the document
- [6.1-readme-rewrite](../tasks/6.1-readme-rewrite.md) — 6.1 — Rewrite the README
- [6.3-single-executable](../tasks/6.3-single-executable.md) — 6.3 — Ship Mandy as a single executable
- [6.4-open-html](../tasks/6.4-open-html.md) — 6.4 — Open HTML, save markdown
- [6.5-sw-navigations](../tasks/6.5-sw-navigations.md) — 6.5 — The service worker intercepts navigations
- [6.6-test-routes](../tasks/6.6-test-routes.md) — 6.6 — /tests/:name and /report exist in every deployment
- [6.7-file-handler](../tasks/6.7-file-handler.md) — 6.7 — Register Mandy as a file handler
- [6.8-check-pages-under-machine](../tasks/6.8-check-pages-under-machine.md) — 6.8 — The check pages run under a machine · in progress
- [adopt-unities](../tasks/adopt-unities.md) — Adopt the Unities · done
- [export-equations](../tasks/export-equations.md) — Equations in the PDF and Word exports · done
