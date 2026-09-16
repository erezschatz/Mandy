# Handoff: Mandy chrome & document restyle

## Overview

A visual restyle of Mandy's chrome and document surface. No feature changes: every
control that exists today still exists, in the same place in the information
architecture, driven by the same code (`toolbar.js`'s `TOOLBAR_MENUS` spec,
`tabs.js`'s tab bar, `format-bar.js`'s two bar modes, `notify.js`'s toast/dialog
builders, `file-api.js`'s browse dialog). What changes is `front/app.css` plus a
handful of markup/DOM details called out under **Structural changes** below.

Goal, in the user's words: keep the simple, specific vibe; make it say "we have
given this tool a lot of thought."

## Amendments (2026-09-16)

Five notes against the spec below. The first three are from an implementation
review done before any code landed; the fourth was found while building stage 3
itself; the fifth is user feedback given after the redesign had already shipped
and closed out. Nothing else in this document changed.

- **Fonts stay a remote dependency, not self-hosted.** "Document typography"
  says to add `front/fonts/` and self-host Source Serif 4 as `@font-face` woff2
  files. That is deliberately not what gets built: the font loads from a Google
  Fonts `<link>` instead, so swapping typefaces later is a one-line change
  rather than a repo carrying font files to replace. The tradeoff the original
  recommendation was guarding against is accepted, not solved: offline PWA boot
  and the editable export both lose the serif face with no network reachable,
  falling back to `Georgia, "Times New Roman", serif` — the stack `app.css`
  already names. Revisit self-hosting if that fallback turns out to matter in
  practice; CHANGELOG.md's 2026-09-16 stage 1 entry carries the decision.
- **A real layout bug in the tab-strip move, caught before it shipped.**
  "Structural changes" item 1 moves the tab bar out of `.toolbar` to a sibling
  inside `.container`. `.container` is a CSS grid only while the outline
  sidebar is open, with `.toolbar { grid-column: 1 / -1 }` spanning both
  columns; the tab bar sibling has no such rule, so it lands in the outline's
  own grid cell — `.outline` and `#editor` are each pushed one cell out of
  place, and the editor renders at the sidebar's column width, wrapped onto a
  third row, for as long as the outline is open. Stage 3 must add
  `:root[data-outline="open"] .tab-bar { grid-column: 1 / -1; }` alongside the
  existing `.toolbar` rule, or the outline and the tab strip conflict visibly
  every time both are on screen.
- **The open file's directory in the chrome (§01, the `.toolbar-path` element)
  is a priority, not a decoration.** It was not asked for, but it is the fix
  for the case in TODO 4.3 where two open tabs share a filename — the active
  tab's full-enough location is now visible without hovering for the tooltip.
  Do not let it fall out in a pass that trims the menu row for space; TODO 4.3
  is cross-referenced so it is not lost twice.
- **§01's one-row menu bar does not fit six triggers at 375px next to the
  toggle, measured while building stage 3.** The app's old two-row bar never
  had to: the menus had the whole row to themselves, and CLAUDE.md's claim
  that six words "fit one line at 375px" was true of that layout, not this
  one. Sharing a row with the toggle costs the menu row about 80px it did not
  use to have to give up, and the base `.menu-trigger` padding this doc gives
  (`5px 10px`, 13px font) overflows the six triggers by roughly 50px once
  that space is gone — with `justify-content: center` on `.menubar` (kept
  from the old narrow-width override on the assumption it was now vestigial)
  making it worse, not better: it clipped "File" and "Export" symmetrically
  rather than just the last item. `.menu-trigger` keeps a real narrow-width
  override below 768px (`padding: 5px 4px; font-size: 12px`), measured
  against the real six labels rather than guessed, and `justify-content:
  center` is gone from `.menubar` — there is nothing left to center once the
  row fits.
- **The outline's section label and the tab strip's full height, both asked
  to change after the redesign had already closed out.** The "Outline"
  section label §03 added (`.outline-label`) is gone — `outlineNav.innerHTML`
  no longer builds one, and the CSS rule went with it. `.tab`'s padding drops
  from the doc's `7px 11px 8px` to `3px 11px 4px`, trimming roughly 2mm
  (~7.5px at 96dpi) off the tab strip's overall height; `--tab-bar-height`
  moved from `44px` to the newly measured `36px` to match, and `.outline`'s
  sticky offset, which reads that variable, follows automatically.

## About the design files

`Mandy Redesign.dc.html` and `Mandy Current UI.dc.html` are **design references
written in HTML** — static prototypes of the intended look, not production code
to copy. They use inline styles and fixed-size frames because they are canvas
mockups; the real implementation is CSS custom properties and rules in
`front/app.css`, following the file's existing structure and comment style.

Mandy's target environment already exists and is unambiguous: vanilla JS, no build
step, one stylesheet, DOM built in JS. Implement there. Do not introduce a
framework, a CSS preprocessor, utility classes, or a component library.

Two consumers share the stylesheet: the app and the **editable HTML export**
(`html-export.js` hand-writes its own page shell and inlines the CSS/JS listed in
`ASSETS`; `static-export.js` writes the document-only export). Any new rule must
survive both. The export variant is stamped `:root[data-variant="export"]`, has
no tab bar and no theme toggle, and its reserved toolbar height is computed
separately — see the `--toolbar-height` block in `app.css`.

## Fidelity

**High-fidelity.** Colors, type sizes, weights, radii, paddings and shadows below
are final and exact. Recreate them precisely. Where a value is not listed, keep
what `app.css` does today.

## Screens / views

Frame numbers refer to `Mandy Redesign.dc.html`; the same frame numbers in
`Mandy Current UI.dc.html` are the before state, recreated from source.

### 01 — App shell, light

Purpose: the normal editing view.

Layout, top to bottom:

1. **Menu row** — `.toolbar`, sticky `top: 0`, `height: 40px` (fixed, not
   padding-derived), `background: #0c4c4a`, `padding: 0 14px 0 12px`,
   `display: flex; align-items: center; justify-content: space-between`.
   *This is now one row.* The tab bar moves out of `.toolbar` (see
   **Structural changes**).
   - Left group, `display: flex; align-items: center; gap: 10px`:
     - App mark: `favicon.svg` at `17 × 17`, rendered white
       (`filter: brightness(0) invert(1); opacity: .95`). Decorative,
       `alt=""`/`aria-hidden`.
     - `.menubar`: `display: flex; gap: 1px`. `.menu-trigger`:
       `padding: 5px 10px`, `font-size: 13px`, `font-weight: 500`,
       `line-height: 1.4`, `border-radius: 5px`,
       `color: rgba(255,255,255,.92)`, no border, no background.
       Hover: `background: rgba(255,255,255,.11); color: #fff`.
       Open (`.menu[data-open] > .menu-trigger`): `background: rgba(255,255,255,.16); color: #fff`.
       Focus-visible: `outline: 2px solid rgba(255,255,255,.7); outline-offset: 1px`
       (was `--accent-blue`, which no longer exists).
   - Right group, `gap: 12px`:
     - **Directory of the open file** (new element): the open file's parent
       directory, tilde-collapsed, `font: 500 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace`,
       `letter-spacing: .04em`, `color: rgba(255,255,255,.55)`.
       Truncate with `text-overflow: ellipsis` from the left if needed; full path
       stays on the `title`. Empty string when there is no file. `file-api.js`
       already tracks the path — this is a second render target for it.
     - **Theme toggle**, now a two-state segmented switch rather than an
       unlabelled pill: track `height: 22px`, `padding: 2px`,
       `border-radius: 999px`, `background: rgba(0,0,0,.22)`;
       two `26 × 18` `border-radius: 999px` segments holding a 12px sun and a
       12px moon glyph (`stroke-width: 2`, `stroke-linecap: round`). Selected
       segment: `background: rgba(255,255,255,.92); color: #0c4c4a`. Unselected:
       `color: rgba(255,255,255,.6)`, transparent. Keep `role="switch"`,
       `aria-checked`, the title/aria-label text and the `tabindex="0"` behavior
       that `theme-manager.js` maintains — only the visuals change.
2. **Tab strip** — on the page, not on the teal: `background: var(--bg-page)`,
   `padding: 8px 20px 0`, `display: flex; align-items: flex-end; gap: 2px`,
   `overflow-x: auto` with hidden scrollbars (keep today's rules).
   - `.tab`: `padding: 7px 11px 8px`, `border-radius: 7px 7px 0 0`,
     `font-size: 13px`, `color: var(--ink-muted)`, transparent background,
     `gap: 7px`, `white-space: nowrap`.
   - `.tab[aria-selected="true"]`: `background: var(--paper)`,
     `color: var(--ink)`, `font-weight: 500`. Its bottom edge is flush with the
     editor sheet below — no divider, no shadow between them. Do not add a
     bottom border to the strip.
   - Hover on an inactive tab: `background: rgba(255,255,255,.55)` (light) /
     `rgba(255,255,255,.04)` (dark), `color: var(--ink)`.
   - `.tab-dot`: `5px` (was 7px), `border-radius: 50%`, reserved even when
     transparent. `dirty` → `#b3382b` light / `#ff7a6d` dark;
     `stale` → `#8b9794` light / `#7d8a87` dark. The full sentence stays on
     `title`/`aria-label`, as today.
   - `.tab-close`: `color: var(--ink-faint)`, `font-size: 14px`,
     `padding: 1px 3px`, `border-radius: 4px`; hover
     `background: var(--tint); color: var(--ink)`.
   - Focus-visible on a tab: `outline: 2px solid var(--accent); outline-offset: 1px`.
3. **Editor sheet** — `#editor`: `background: var(--paper)`, **no border, no
   margin, no border-radius**, and **no `:focus` background change** (delete the
   `--bg-editor-focus` flash; `outline: none` stays). Inside it, one measured
   column: `max-width: 68ch; margin: 0 auto; padding: 56px 32px 80px`.
   Under 768px: `padding: 32px 20px 56px`.

#### Document typography (inside `#editor`)

Family: `"Source Serif 4", Georgia, "Times New Roman", serif`.
Chrome stays on the system sans stack already in `body`.

| Element | Value |
| --- | --- |
| body text | `18px` / `1.7`, `color: var(--ink)` |
| `h1` | `35px` / `1.2`, `600`, `letter-spacing: -.012em`, `color: var(--ink-strong)`, `margin: 0 0 20px`. **Remove the `border-bottom`** and its `padding-bottom` |
| `h2` | `25px` / `1.3`, `600`, `letter-spacing: -.008em`, `margin: 40px 0 14px` |
| `h3` | `20px` / `1.35`, `600`, `margin: 36px 0 12px` |
| `h4`–`h6` | `18px` / `17px` / `16px`, `600`, `margin: 28px 0 10px` |
| `p` | `margin: 0 0 20px` |
| `ul`, `ol` | `margin: 0 0 20px; padding-left: 24px`; `li { margin: 0 0 8px }` |
| `strong` | `600` (not `bold`) |
| `blockquote` | `margin: 28px 0`, `padding: 2px 0 2px 20px`, `border-left: 2px solid var(--rule-strong)`, `color: var(--ink-soft)`, **not italic** |
| inline `code` | mono `15px`, `background: var(--tint)`, `border-radius: 4px`, `padding: 2px 5px` |
| `pre` | `margin: 0 0 24px`, `padding: 16px 18px`, `background: var(--code-bg)`, `border-radius: 8px`; `pre code` mono `14.5px` / `1.6` |
| `hr` | `border-top: 1px solid var(--rule)`, `margin: 40px 0` |
| `table` | `100%`, `font-size: 16px`, `border-collapse: collapse`, `margin: 0 0 24px`. **Hairlines only, no cell borders and no zebra striping:** `th` `text-align: left; padding: 0 12px 8px 0; border-bottom: 1px solid var(--rule-strong)`, and in the chrome sans at `font: 600 11px/1; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-muted)`; `td` `padding: 10px 12px 10px 0; border-bottom: 1px solid var(--rule-faint)`. Drop `tr:nth-child(even)` |
| `a` | `color: var(--accent)`, no underline; hover underline. The `Ctrl+Click` hint pseudo-element stays exactly as it is, recolored to `background: var(--ink); color: var(--paper)` |
| `img` | unchanged (`max-width: 100%`, block, `margin: 1rem 0`) |

Load Source Serif 4 with a `@font-face` block in `app.css` pointing at
self-hosted woff2 files under `front/fonts/` — **not** a Google Fonts `<link>`.
Reasons: the service worker caches `front/` for offline boot, and the editable
export must render the same type on a machine with no network. Ship weights 400,
600 and italic 400, `font-display: swap`, `unicode-range` left default. The
mockup uses the Google-hosted copy only because it is a mockup.

### 02 — Menu dropdown, and the format bar in both modes

- `.menu-panel`: `min-width: 244px`, `padding: 6px`,
  `border: 1px solid var(--rule)`, `border-radius: 10px`,
  `background: var(--paper)`,
  `box-shadow: 0 14px 36px rgba(12,32,30,.14), 0 1px 2px rgba(12,32,30,.08)`,
  offset `top: calc(100% + 7px)`, `left: -4px`. Keep `display: none` /
  `[data-open]` and the right-edge flip for the last two menus.
- `.menu-item`: `padding: 7px 10px`, `border-radius: 6px`, `font-size: 13.5px`,
  `gap: 10px`, `color: var(--ink)`. Hover/focus: `background: var(--tint-accent)`
  (no color change). Disabled: `opacity: .45`, as today.
- `.menu-check`: `width: 13px`, `color: var(--accent)`, still reserved on every
  item and revealed by `aria-pressed="true"`.
- `.menu-shortcut`: `padding-left: 28px`,
  `font: 400 11.5px ui-monospace, SFMono-Regular, Menlo, monospace`,
  `letter-spacing: .04em`, `color: var(--ink-faint)`. Keep
  `shortcutLabel()`'s ⌘/⇧ substitution.
- `.menu-separator`: `height: 1px`, `margin: 5px 10px`,
  `background: var(--rule-faint)`.
- **`.format-bar`** — paper, not dark: `background: var(--paper)`,
  `border: 1px solid var(--rule)`, `border-radius: 9px`, `padding: 5px`,
  `gap: 2px`,
  `box-shadow: 0 12px 30px rgba(12,32,30,.14), 0 1px 2px rgba(12,32,30,.07)`.
  Positioning logic is untouched: `BAR_GAP = 10` above the selection rect,
  `BAR_EDGE = 8`, toolbar clearance measured live.
  - `.format-btn`: `30 × 30` (`min-width: 30px` for the text ones,
    `padding: 0 8px`), **no border**, `border-radius: 6px`,
    `background: none`, `color: var(--ink-soft)`; text buttons
    `font-size: 12.5px; font-weight: 600`; icon buttons carry the existing 24-box
    SVGs at `15 × 15`. Hover: `background: var(--tint); color: var(--ink-strong)`.
  - `.format-btn.active`: `background: var(--accent)`, `color: var(--paper)`,
    no border.
  - `.format-btn.mixed`: `background: none`, `color: var(--accent)`,
    `border: 1px solid var(--accent)`, `box-sizing: border-box` (so the ring
    does not resize the button).
  - `.separator`: `width: 1px; height: 18px; background: var(--rule);
    margin: 0 4px`.
  - `[hidden]` still needs the explicit `display: none` override for caret mode.
  - Under 480px keep today's behavior (`font-size: 0`, 18px icons, 40px min
    width) — the icon-only collapse is still correct.

### 03 — Dark theme, outline sidebar open

Same geometry; the dark token column applies. The menu row is
`#0b1214` with a `1px solid #1e2729` bottom border (the teal is too dark to
carry the row at this size — this is the one place the teal steps back), the app
mark drops to `opacity: .8`, and the toggle track is `rgba(255,255,255,.07)`
with the selected segment `background: #2f7f76; color: #eafcf8`.

Outline sidebar (`.outline`, grid column stays `16rem` → `248px`):
`padding: 28px 14px 28px 24px`, `border-right: 1px solid var(--rule)`, no margin,
sticky offset becomes `40px` (the new toolbar height). It gains a section label:
`font: 600 11px/1` sans, `letter-spacing: .1em`, `text-transform: uppercase`,
`color: var(--ink-muted)`, `padding: 0 8px 12px`.
`.outline-list` `gap: 1px`. `.outline-item a`: `padding: 5px 8px`,
`border-radius: 5px`, depth indent `calc(8px + var(--outline-depth,0) * 14px)`.
Hover: `background: var(--tint)`. The current heading (if you keep the existing
active marking) is `background: var(--tint)`, `color: var(--accent-bright)`.
Level type scale: `13.5px/600`, `13px/500`, `13px/500`, `12.5px`, `12.5px`,
`12px` — the depth/level split in the current CSS is correct, keep it.

### 04 — Open / Save dialog (`.file-dialog`)

Backdrop `rgba(12,32,30,.45)`. Card: `width: min(580px, 92vw)`,
`max-height: 80vh`, `border-radius: 12px`, `background: var(--paper)`,
`box-shadow: 0 24px 60px rgba(12,32,30,.22), 0 2px 6px rgba(12,32,30,.1)`,
`overflow: hidden`.

- **Header is no longer a teal band.** `padding: 16px 18px 12px`, paper
  background, then a `1px solid var(--rule-faint)` divider. Title `h2`
  `15px/600`, `color: var(--ink-strong)`. Under it, the current directory as
  mono `11.5px/1.4`, `letter-spacing: .02em`, `color: var(--ink-muted)`,
  truncated — this replaces `.file-dialog-path`'s separate strip and its
  `direction: rtl` hack; tilde-collapse in JS instead and keep the full path on
  `title`.
- **Entries**: container `padding: 6px`, rows `padding: 7px 12px`,
  `border-radius: 7px`, `font-size: 13.5px`, **no row borders**. Hover:
  `background: var(--tint)`. Selected: `background: var(--tint-accent); color: var(--ink)`.
  Directories: `color: var(--accent)`, `font-weight: 500`, and the name renders
  with a trailing `/` — no icons. Parent entry reads `↑ parent directory`.
  Modified column: mono `11.5px`, `color: var(--ink-faint)`, `flex: none`.
  Empty state keeps `.dialog-empty`, recolored to `var(--ink-muted)`.
- **Save row**: `padding: 12px 14px`, `border-top: 1px solid var(--rule-faint)`,
  `background: var(--paper-sunken)`. Input: `padding: 8px 11px`,
  `border: 1px solid var(--field-border)`, `border-radius: 7px`,
  `font-size: 13.5px`; focus `border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring)`. A **Cancel** button joins the row
  (quiet style) to the left of **Save** (primary).

### 05 — Confirm dialog, text prompt, toasts (`notify.js`)

Dialog (`.notify-dialog`): `width: min(456px, 100%)`, `padding: 20px`,
`border-radius: 12px`, `box-shadow: 0 24px 60px rgba(12,32,30,.22)`.
Header row `gap: 12px`, `align-items: flex-start`:

- Severity icon moves into a `28 × 28` `border-radius: 50%` tinted disc, icon
  `15px`, `stroke-width: 2.2`: warn `background: #fbeedd; color: #8a5a12` ·
  error `#fbeceb` / `#9c2f24` · success `#e3f2ec` / `#15705f` ·
  info `#e4efed` / `#0c4c4a`. Dark theme: warn `#3a2f1b`/`#f0b429`,
  error `#3a221f`/`#ff7a6d`, success `#1b2f2a`/`#5dd39e`, info `#16292c`/`#7fd3c6`.
- Title `h2` `15px/600`, `color: var(--ink-strong)`, `margin: 4px 0 0`.
- Message `13.5px/1.55`, `color: var(--ink-soft)`, `margin: 6px 0 0`,
  `overflow-wrap: anywhere`.
- Close `×`: `color: var(--ink-faint)`, `border-radius: 6px`, `padding: 4px 6px`,
  hover `background: var(--tint)`.
- Input (`askForInput`): full width, `margin-top: 8px`, `padding: 8px 11px`,
  `border-radius: 7px`, **mono `13.5px`** (it holds URLs and filenames),
  same focus ring as the save row.

Buttons (`.notify-btn`), `margin-top: 20px`, right-aligned, `gap: 8px`,
`padding: 8px 14px` (primary `8px 16px`), `border-radius: 7px`,
`font-size: 13.5px`:

| Variant | Light | Dark |
| --- | --- | --- |
| `primary` | `background: #0c4c4a`, `border: 1px solid #0c4c4a`, `color: #fff`, `600`; hover `#0a3e3c` | `background: #2f7f76`, `color: #eafcf8`; hover `#37948a` |
| `quiet` | `background: var(--paper)`, `border: 1px solid var(--field-border)`, `color: var(--ink)`, `500`; hover `background: var(--tint)` | same with dark tokens |
| `danger` | **outlined, not filled**: `background: var(--paper)`, `border: 1px solid var(--field-border)`, `color: #b3382b`, `600`; hover `background: #fdf2f0; border-color: #e6b5ae` | `color: #ff7a6d`; hover `background: #2a1e1c; border-color: #5c3530` |

Danger going outlined matters: in the unsaved-changes dialog the safe action
(Save) is the primary and Discard must not out-shout it. Keep `ask()`'s
`default: true` focus rule and the Tab trap as they are.

Toasts (`.notify-toast`): `border-radius: 10px`,
`border: 1px solid var(--rule)`, **no left accent bar** — the severity reads from
the `16px` icon at `stroke-width: 2.2` in the severity color;
`padding: 12px 13px`, `gap: 10px`, `font-size: 13.5px`/`1.5`,
`box-shadow: 0 8px 24px rgba(12,32,30,.1)`. `.notify-stack` keeps
`right: 1rem; bottom: 1rem`, `gap: 10px`, `width: min(28rem, calc(100vw - 2rem))`,
`pointer-events: none` with `auto` on the toasts.
`.notify-toast-action`: `padding: 5px 11px`, `border-radius: 6px`,
`border: 1px solid var(--field-border)`, `background: var(--paper)`,
`color: var(--accent)`, `12.5px/600`; hover `background: var(--tint)`.
`.notify-close`: `15px`, `color: var(--ink-faint)`, `border-radius: 5px`,
hover `background: var(--tint); color: var(--ink)`.
Timeouts, hover-to-hold, `role`/`aria-live` and the `is-in` transition are
unchanged.

## Structural changes (JS, not CSS)

Small and enumerable. Everything else is stylesheet-only.

1. **`toolbar.js` — one row.** `buildToolbarContent()` no longer returns the
   tab-bar + toggle row inside `.toolbar`. Instead:
   - `buildToolbar()` appends, into `.toolbar`: a left group (app mark +
     `.menubar`) and a right group (the new `.toolbar-path` span + the theme
     toggle). Export variant: no path, no toggle — menus and mark only.
   - `buildTabBar()` still returns the same `#tabBar[role="tablist"]` element,
     but it is appended **after** `.toolbar`, as a sibling, in the app variant
     only. `tabs.js` looks it up by id and does not care where it lives.
   - `buildThemeToggle()` emits the two segments (sun, moon) inside the track
     instead of one `.theme-toggle-slider`. `theme-manager.js` keeps writing
     `data-theme`, `aria-checked`, `title` and `aria-label` on the same element;
     CSS picks the lit segment off `data-theme`.
2. **New element `.toolbar-path`.** Rendered by whatever in `file-api.js`
   already calls `renderCurrentFile()`: parent directory of the open file,
   tilde-collapsed, full path on `title`, empty when no file. One line, no
   wrapping.
3. **Height reservation.** The `--toolbar-height` arithmetic block collapses to
   `--toolbar-height: 40px` for both variants (the row is a fixed height now).
   Keep the `min-height` on `.toolbar` and the `:root[data-outline="open"]
   .outline { top: var(--toolbar-height) }` sticky offset reading from it, and
   keep the `.toolbar { grid-column: 1 / -1 }` span. The tab strip is outside
   the sticky toolbar, so it scrolls away with the document — intended.
   `format-bar.js`'s `toolbarClearance()` measures live and needs no change.
4. **Fonts.** Add `front/fonts/` + `@font-face` rules; add the font files to the
   service worker's cache list and to `html-export.js`'s `ASSETS` so the
   editable export stays self-contained. If embedding the woff2 in the export is
   too heavy, the export may fall back to `Georgia, serif` — the stack already
   allows it.
5. **Delete, don't repoint:** `--accent-blue`, `--accent-blue-hover`,
   `--bg-editor-focus` (and the `#editor:focus` rule), `--bg-format-bar`,
   `--bg-tooltip`/`--text-tooltip` (fold into ink/paper), `--notify-info`'s use
   as a blue. `--notify-error/warn/success` stay — severity is not decoration.

## Interactions & behavior

Unchanged from today, and that is the point. For completeness:

- Menu bar: click to open, hover to slide between open menus, ←/→ between
  triggers, ↑/↓ within a panel, Home/End, Escape closes and refocuses the
  trigger, outside click dismisses, `mousedown` on `.menubar` is prevented so
  the editor keeps its selection.
- Format bar: appears on a non-empty selection (full bar) or at a bare caret at
  the start of a line (block formats only, inline ones `hidden`); 10px above the
  selection rect, clamped 8px from the window edges and below the sticky toolbar;
  `.active` / `.mixed` reflect the selection's state.
- Tabs: click to switch, ←/→ move along the strip (roving `tabindex`),
  Ctrl+Tab / Ctrl+1–9, closing a dirty tab raises the unsaved-changes dialog.
- Dialogs: modal, Tab-trapped, Escape dismisses to the `dismiss` value, backdrop
  click dismisses only when the target is the backdrop itself, focus returns to
  the previously focused element.
- Transitions: keep `--transition-speed: 250ms` and the existing global
  color/background/border transition, the toast `opacity`/`translateY(.5rem)`
  entrance, and the `prefers-reduced-motion` opt-out. The theme toggle's segment
  highlight animates on the same 250ms. No new animation.

## State management

No new state. The one new *rendered* value is the open file's directory, which
`file-api.js` already holds. The tab strip's move out of `.toolbar` does not
change `tabs.js`'s model (`openTabs`, `activeTabId`, per-tab storage keys).

## Design tokens

Replaces the `:root` / `[data-theme="dark"]` blocks in `app.css`. Names are
suggestions; the values are not.

### Light

| Token | Value | Use |
| --- | --- | --- |
| `--paper` | `#ffffff` | editor sheet, panels, cards, active tab |
| `--paper-sunken` | `#fafbfb` | dialog footer rows |
| `--bg-page` | `#eef1f0` | page behind the sheet, tab strip bed |
| `--tint` | `#f1f4f3` | hover fills, inline code, `pre` (`#f5f7f6`) |
| `--tint-accent` | `#eaf1f0` | menu-item hover, selected dialog row |
| `--ink-strong` | `#111917` | headings, dialog titles |
| `--ink` | `#1b2422` | body text, primary labels |
| `--ink-soft` | `#41514e` | dialog body, blockquote, format-bar glyphs |
| `--ink-muted` | `#5d6b68` | secondary labels, table headers |
| `--ink-faint` | `#8b9794` | timestamps, close glyphs, shortcuts |
| `--rule` | `#dfe5e3` | panel borders, format-bar border, separators |
| `--rule-faint` | `#eaefed` | table rows, dialog dividers |
| `--rule-strong` | `#c9d2cf` | table header rule; blockquote uses `#b8cdca` |
| `--field-border` | `#d6dedc` | inputs, quiet buttons |
| `--accent` | `#0c4c4a` | links, active format, checkmarks, primary fill, directories |
| `--accent-hover` | `#0a3e3c` | primary hover |
| `--accent-ring` | `rgba(12,76,74,.12)` | focus rings |
| `--code-bg` | `#f5f7f6` | `pre` |
| `--selection` | `#cfe3e0` | text selection highlight |
| `--notify-error` | `#b3382b` | dirty dot, error icon, danger text |
| `--notify-warn` | `#8a5a12` | warn icon |
| `--notify-success` | `#15705f` | success icon |

### Dark

| Token | Value |
| --- | --- |
| `--paper` | `#181f21` |
| `--paper-sunken` | `#151b1d` |
| `--bg-page` | `#101517` |
| `--bg-menubar` | `#0b1214` (+ `1px solid #1e2729` bottom border) |
| `--tint` | `#1f2729` |
| `--tint-accent` | `#1c2a29` |
| `--ink-strong` | `#f2f7f5` |
| `--ink` | `#dfe6e4` |
| `--ink-soft` | `#a9b6b3` |
| `--ink-muted` | `#98a5a2` |
| `--ink-faint` | `#7d8a87` |
| `--rule` | `#2d3739` |
| `--rule-faint` | `#232c2e` |
| `--rule-strong` | `#2d3739` |
| `--field-border` | `#323d3f` |
| `--accent` | `#2f7f76` (fills) |
| `--accent-bright` | `#7fd3c6` (links, active outline-state text) |
| `--accent-ring` | `rgba(127,211,198,.18)` |
| `--code-bg` | `#212a2c` |
| `--selection` | `#1f4a45` |
| `--notify-error` | `#ff7a6d` · `--notify-warn` `#f0b429` · `--notify-success` `#5dd39e` |

Light-mode teal `#0c4c4a` on `#ffffff` is 9.8:1; `#2f7f76` fills in dark mode
carry `#eafcf8` text. Menu-row labels are `rgba(255,255,255,.92)` on `#0c4c4a`
(≈9:1). Keep `#0c4c4a` itself untouched — it is the brand, and it still owns the
menu row, links, primary buttons and the icon.

### Scales

- **Spacing** (chrome): 2, 4, 5, 6, 7, 8, 10, 12, 14, 18, 20, 24, 28.
  Document rhythm: 8, 12, 14, 20, 24, 28, 36, 40, 56, 80.
- **Radius**: 4 (dot-scale chrome) · 5 (menu trigger, outline row) · 6 (menu
  item, format button) · 7 (tab top corners, inputs, buttons, dialog rows) ·
  9 (format bar) · 10 (menu panel, toast) · 12 (dialogs) · 999 (toggle track).
- **Type — chrome** (system sans): 11 `600` uppercase `.09em` (section labels) ·
  11.5 mono `.04em` (paths, shortcuts) · 12.5 `600` (format-bar text buttons,
  toast actions) · 13 `500` (menu triggers, tabs) · 13.5 (menu items, dialog
  body, dialog rows) · 15 `600` (dialog titles).
- **Type — document** (Source Serif 4): 16 (tables) · 18/1.7 (body) · 20 · 25 ·
  35. Mono in the document: 14.5 (`pre`) · 15 (inline code).
- **Shadows**: `0 1px 2px rgba(20,40,38,.06)` sheet ·
  `0 8px 24px rgba(12,32,30,.1)` toast ·
  `0 12px 30px rgba(12,32,30,.14), 0 1px 2px rgba(12,32,30,.07)` format bar ·
  `0 14px 36px rgba(20,40,38,.14), 0 1px 2px rgba(20,40,38,.08)` menu panel ·
  `0 24px 60px rgba(12,32,30,.22), 0 2px 6px rgba(12,32,30,.1)` dialogs.
  Dark theme: same geometry, `rgba(0,0,0,.45)` / `.6`.

## Print / PDF

The `@media print` block still forces light values — update its literals to the
new tokens (`#1b2422` ink, `#111917` headings, `#0c4c4a` links and blockquote
rule, `#f5f7f6` code, `var(--rule-faint)` table rules) and keep the
`#editor { border: none; margin: 0; padding: 2rem }` reset plus the
`.file-dialog, .notify-stack, .notify-backdrop, .tab-bar { display: none }`
rule — the tab strip's new position does not change the fact that it must not
print.

## Assets

- `assets/favicon.svg` — the existing Mandy mark, unchanged, copied from
  `front/favicon.svg`. In the menu row it is rendered white via
  `filter: brightness(0) invert(1)`; everywhere else it keeps its teal `#0c4c4a`
  and gold `#e8a82d`. The gold appears **only** in the icon — do not promote it
  to a UI accent.
- `assets/welcome-banner.png`, `assets/welcome-banner-dark.png` — existing,
  unchanged, and the `content: url(...)` dark-mode swap keyed on the `src` stays.
- No new icons. Every glyph in the mockups is either an existing SVG from
  `index.html` / `toolbar.js` / `notify.js`, or the two new 24-box strokes for
  the theme toggle (sun: circle `r=4.5` + four 2.5px ticks; moon: one crescent
  path) and one for the link dialog (the existing chain glyph).

## Files in this bundle

| File | What it is |
| --- | --- |
| `Mandy Redesign.dc.html` | The target design. Six frames: 01 light shell · 02 menu dropdown + format bar (selection and caret modes) · 03 dark + outline sidebar · 04 open/save dialog · 05 confirm / prompt / toasts · 06 token, type and change summary |
| `Mandy Current UI.dc.html` | Today's UI recreated from `front/` — the before state, for diffing |
| `assets/` | The three existing image assets referenced by both files |
| `support.js` | Runtime the two HTML files need in order to open in a browser. Not part of the design |

Source of truth for current behavior: `front/app.css`, `front/toolbar.js`,
`front/tabs.js`, `front/format-bar.js`, `front/notify.js`, `front/file-api.js`,
`front/outline.js`, `front/theme-manager.js`, `front/index.html`,
`front/html-export.js`.

## Suggested order of work

1. Token blocks + `@font-face`; delete the dead variables. The app will look
   half-changed and that is expected.
2. `#editor` typography and the measured column (biggest visual payoff, zero
   structural risk).
3. Menu row → 40px single row; move the tab strip out; `--toolbar-height: 40px`.
   Check the outline's sticky offset and the format bar's clearance.
4. Tab shapes.
5. Format bar, menu panel.
6. Dialogs, toasts, file dialog.
7. Print block, then re-run `npm test` — `toolbar`, `tabs`, `format-bar` and
   `notify` all assert against real DOM structure, and step 3 is the one that can
   break them.
