// Ctrl/Cmd+click on a link, and the anchor slugs a table of contents needs.
//
// The parts that fail quietly:
//   - the scheme allowlist. An href arrives from a file on disk or an editable
//     export that came by mail, and `javascript:` through window.open would run
//     in the app's own origin, next to the file API. A regression here looks
//     like nothing at all until someone opens a hostile document.
//   - the slug algorithm. It has to agree with the href markdown-it wrote, and
//     the tempting reuse -- slugifyTitle, right there in the same file -- is
//     wrong in a way that only shows on non-English headings.
//   - the tooltip's delivery. It must not be a title attribute, because
//     Turndown writes those into the markdown as [text](href "title").

import { loadApp, makeEl } from "./dom.mjs";

// A heading list for headingAnchors to walk. textContent is all it reads.
function withHeadings(editor, headings) {
  const nodes = headings.map(([tag, text]) => makeEl(tag, { text }));
  editor.querySelectorAll = (sel) => (sel.startsWith("h1") ? nodes : []);
  return nodes;
}

function clickEvent(link, modifier = "meta") {
  let defaultPrevented = false;
  return {
    metaKey: modifier === "meta",
    ctrlKey: modifier === "ctrl",
    target: link,
    preventDefault() {
      defaultPrevented = true;
    },
    get prevented() {
      return defaultPrevented;
    },
  };
}

function makeLink(href) {
  const link = makeEl("a");
  link.setAttribute("href", href);
  return link;
}

export default function run(check) {
  const app = loadApp();
  const { anchorSlug, headingAnchors, openExternalLink, opened, byId } = app;
  const editor = byId.get("editor");
  const onClick = editor.listeners.click[0];

  // --- slugs ---------------------------------------------------------------

  check("spaces become hyphens", anchorSlug("First Section") === "first-section");
  check("punctuation is dropped", anchorSlug("What's New?") === "whats-new");
  check("surrounding space is trimmed", anchorSlug("  Padded  ") === "padded");

  // The reason slugifyTitle cannot be reused: it strips non-ASCII, so this
  // heading would slug to "ncode-heading" and never match its own link.
  check("unicode survives", anchorSlug("Ünïcode Heading") === "ünïcode-heading");
  check(
    "slugifyTitle is genuinely unsuitable here",
    app.slugifyTitle("Ünïcode Heading", "x") !== anchorSlug("Ünïcode Heading"),
  );

  // --- anchors -------------------------------------------------------------

  const headings = withHeadings(editor, [
    ["h1", "Table of Contents"],
    ["h2", "First Section"],
    ["h2", "Notes"],
    ["h3", "Notes"],
    ["h2", "🎉"],
    ["h2", "Ünïcode Heading"],
  ]);
  const anchors = headingAnchors(editor);

  check("a heading is addressable by its slug",
    anchors.get("first-section") === headings[1]);
  check("the first duplicate keeps the bare slug",
    anchors.get("notes") === headings[2]);
  check("later duplicates get GitHub's -1 suffix",
    anchors.get("notes-1") === headings[3]);
  check("a heading with no slugworthy text is skipped", anchors.size === 5);

  check("resolving does not stamp ids on the document",
    headings.every((h) => !h.id));
  check("stamping is opt-in, for the static export",
    (headingAnchors(editor, true), headings[1].id === "first-section"));

  // --- jumping to an anchor ------------------------------------------------

  // The toolbar is sticky at top: 0, so scrolling the heading to the very top
  // of the viewport hides it behind the toolbar — the jump appears to land in
  // the wrong place, or on a blank strip, and nothing else gives it away.
  headings[1].getBoundingClientRect = () => ({ top: 500, left: 0, width: 0, height: 0 });

  const tocLink = makeLink("#first-section");
  onClick(clickEvent(tocLink, "meta"));

  check("a #anchor scrolls rather than opening a tab",
    app.scrolled.length === 1 && opened.length === 0);
  check("the jump clears the sticky toolbar (500 - 69 - 12)",
    app.scrolled[0].top === 419);
  check("and animates", app.scrolled[0].behavior === "smooth");

  // markdown-it percent-encodes non-ASCII in the href, so the handler has to
  // decode before matching a slug that kept its unicode. This is the case that
  // breaks if slugifyTitle is ever reused here.
  headings[5].getBoundingClientRect = () => ({ top: 900, left: 0, width: 0, height: 0 });
  onClick(clickEvent(makeLink("#%C3%BCn%C3%AFcode-heading"), "meta"));
  check("percent-encoded anchors are decoded before matching",
    app.scrolled.length === 2 && app.scrolled[1].top === 819);

  const scrollsBeforeMiss = app.scrolled.length;
  onClick(clickEvent(makeLink("#no-such-heading"), "meta"));
  check("an anchor with no heading does nothing",
    app.scrolled.length === scrollsBeforeMiss);

  // --- clicking ------------------------------------------------------------

  const external = makeLink("https://example.com/page");

  const plain = clickEvent(external, "none");
  onClick(plain);
  check("a plain click is left to place the caret", !plain.prevented);
  check("and opens nothing", opened.length === 0);

  onClick(clickEvent(external, "meta"));
  check("cmd+click opens the link", opened.length === 1);
  check("in a new tab", opened[0].target === "_blank");
  check("with noopener", opened[0].features === "noopener");

  onClick(clickEvent(external, "ctrl"));
  check("ctrl+click does the same", opened.length === 2);

  // Everything below must leave `opened` where it is.
  const before = opened.length;

  openExternalLink("javascript:alert(document.cookie)");
  check("javascript: urls are refused", opened.length === before);

  openExternalLink("file:///etc/passwd");
  check("file: urls are refused", opened.length === before);

  openExternalLink("data:text/html,<script>x</script>");
  check("data: urls are refused", opened.length === before);

  openExternalLink("./notes.md");
  check("relative links stay inert for now", opened.length === before);

  openExternalLink("mailto:erez@example.com");
  check("mailto is allowed", opened.length === before + 1);

  // --- the tooltip ---------------------------------------------------------

  check(
    "the hint is a CSS variable, not a title attribute Turndown would serialise",
    app.documentElement.style["--link-hint"] === '"Cmd+Click to open link"',
  );
}
