# Mandy — specification

The *what*, kept short on purpose. **When this file and the code disagree, fix
one of them in the same commit.** How the code works — the load order, the model,
the save path, every decision about a mechanism — is [CLAUDE.md](../CLAUDE.md)'s
Architecture section, and the editing-core rewrite is designed in
[REWRITE.md](REWRITE.md). This file points at them rather than repeating them.

## Why this project exists

People should not be writing markup, and markdown is markup
([D0](DECISIONS.md)). Mandy is a WYSIWYG editor that runs on your own machine
and edits your own markdown files — and gives a file back **exactly as it found
it** except where you changed it ([D1](DECISIONS.md)), so a document edited here
diffs cleanly in git against one edited anywhere else. That second half is what
separates it from the editor it was forked from (Tommertom/marky, 2026-03-13)
and from rich-text editors generally, which re-serialise the whole file in a
house style on every save.

The person it is for is one author working on markdown that lives in a
repository — specs, plans, notes — beside tools and agents that write the same
files.

## Scope

**1.0 is:**

- Open, edit and save local `.md`, `.markdown` and `.txt` files through a local
  server, with Save As, Reload from disk, a disk-changed mark and an
  unsaved-work guard; several documents at once, one tab each.
- WYSIWYG editing of CommonMark plus GFM tables and strikethrough, and `$…$` /
  `$$…$$` maths: marks, inline code, links, images, headings, lists, quotes,
  fences, rules, tables, a table of contents, with an outline sidebar.
- Byte-faithful saving: an untouched block comes back byte for byte, an edited
  one in the conventions its own bytes recorded. Whitespace nobody can see is
  exempt ([D3](DECISIONS.md)).
- Exports: markdown, a standalone HTML page, PDF, Word, and **Editable** — one
  self-contained HTML file with the editor inside, which a recipient can edit and
  export again.
- An editing core that owns the document as a markdown model and renders the DOM
  from it: TODO 3.1, [tasks/3.1-editing-core-rewrite.md](../tasks/3.1-editing-core-rewrite.md).
  Its stages and where each stands are in REWRITE.md, "Where each stage stands";
  1.0 is that rewrite on `main` ([D6](DECISIONS.md), [D8](DECISIONS.md)), plus
  the open task files in [PLAN.md](PLAN.md).

**1.0 is not:**

- A page or layout editor. Mandy holds a document, never a page
  ([D9](DECISIONS.md)); HTML that arrives for its layout is out of scope.
- Hosted, multi-user or networked. The server binds `127.0.0.1` and nothing
  else; there is no account, sync or collaboration beyond the Editable export.
- Mermaid diagrams, removed 2026-10-01 — a ```` ```mermaid ```` fence is an
  ordinary code block.
- What [ROADMAP.md](ROADMAP.md) holds: markdown constructs and features held for
  after 1.0.

## Architecture

Two halves, no build step and no bundler:

- `front/` — the editor, vanilla JavaScript in one shared global scope, every
  file a plain `<script>` tag in `index.html`. Installable as a PWA, and it boots
  offline from the service worker's cache.
- `server/` — Deno and Hono. Serves `front/` and exposes the local file API
  (`/api/home`, `/api/browse`, `/api/file`). Without it the editor still runs,
  with Open and Save disabled.

The rest is CLAUDE.md, which is long because it records why each mechanism is
the way it is.

## Stack

Every dependency, what it does here, and why it is not ours to write. Adding one
is flagged before it is added (CLAUDE.md, Commands).

| Dependency | Where | What it replaces | Why it is rote |
| --- | --- | --- | --- |
| markdown-it 13.0.1 | CDN in the app; `npm:` in the root `deno.json` for the model suite | a markdown parser | CommonMark is a specification with a reference implementation; the one inline rule copied from it is `referenceAwareLink` |
| Turndown 7.1.2 | CDN | an HTML-to-markdown converter | used only for HTML from outside — a paste, a drop, and the old core's save path until stage 4 retires it |
| MathJax 3 | CDN, loaded on first use | a TeX typesetter | typesetting TeX is its own field |
| html2pdf.js 0.10.1, docx 7.1.0, FileSaver.js 2.0.5 | CDN, loaded on first use | PDF, Word and file-download writers | file formats with nothing project-specific in them |
| Hono 4 | `server/deno.json` | an HTTP router | a handful of routes and a static handler |
| Deno | runtime | Node and npm | runs the server, the suites and the hooks with no `node_modules` at the root |
| Playwright 1.64.1 | `tests/browser/` only | a person at a keyboard in three browsers | the one `node_modules` in the tree, agreed in TODO 6.8 |
