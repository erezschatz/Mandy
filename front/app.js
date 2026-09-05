const md = window.markdownit();

// markdown-it has never heard of maths. `$…$` reaches MathJax only because it
// passes through as text, which means every inline rule runs *inside* the
// equation on the way past. CommonMark's backslash escapes are the ones that
// bite: `$$\mathbb{N} = \{ a \}$$` arrives as `\mathbb{N} = { a }`, renders
// without the braces and is then saved that way. Emphasis and links do it too,
// verified against markdown-it 13: `$x = a*b*c$` loses both asterisks and
// italicises `b`, and `$[x](y)$` becomes a link. Spacing decides it, which is
// why this looks intermittent — `$a * b * c$` survives untouched.
//
// So claim the span before any other rule can see it. `mathSpan` finds the
// delimiters, a rule ahead of `escape` consumes them, and the renderer writes
// the source back out verbatim. Nothing downstream moves: the document still
// carries `$…$` as text for MathJax to typeset, `containsLatex` still matches
// it, and `data-tex` still carries the TeX back through a save.
//
// Display maths broken across a blank line is not handled and does not need to
// be — a blank line inside `$$…$$` is an error in TeX itself, and markdown-it
// has split the paragraph in two long before any inline rule runs.

// The maths span opening at `start`, or null. Apart from the markdown-it
// plumbing below because the delimiters are the part with judgement in them:
// this is what tells an equation from a price, and it is testable on its own.
function mathSpan(src, start) {
  if (src[start] !== "$") return null;

  const display = src[start + 1] === "$";
  let pos = start + (display ? 2 : 1);

  // `$5 and $10` is prose. Two rules keep it prose: an opening delimiter is
  // never followed by whitespace, and a closing one is never followed by a
  // digit. Display maths needs neither -- `$$` does not occur in prices.
  if (!display && (pos >= src.length || /\s/.test(src[pos]))) return null;

  while (pos < src.length) {
    if (src[pos] === "\\") {
      pos += 2; // `\$` is a literal dollar and does not close the span
      continue;
    }
    if (src[pos] !== "$") {
      pos++;
      continue;
    }
    if (display) {
      if (src[pos + 1] === "$") {
        return { content: src.slice(start + 2, pos), end: pos + 2, display: true };
      }
      pos++; // a lone `$` inside display maths
      continue;
    }
    if (/\d/.test(src[pos + 1] || "")) {
      pos++;
      continue;
    }
    if (pos === start + 1) return null; // `$$` is not an empty inline equation
    return { content: src.slice(start + 1, pos), end: pos + 1, display: false };
  }
  return null; // unterminated: leave it as the prose it probably is
}

function mathRule(state, silent) {
  if (state.src[state.pos] !== "$") return false;

  const span = mathSpan(state.src, state.pos);
  if (!span) return false;

  if (!silent) {
    const token = state.push("math", "", 0);
    token.markup = span.display ? "$$" : "$";
    token.content = span.content;
  }
  state.pos = span.end;
  return true;
}

md.inline.ruler.before("escape", "math", mathRule);
md.renderer.rules.math = function (tokens, idx) {
  const token = tokens[idx];
  return token.markup + md.utils.escapeHtml(token.content) + token.markup;
};

// [text][label] and [text](url) resolve to the identical link_open token --
// same href, same title, nothing left to say which syntax the author wrote --
// so by the time the HTML exists there is no way to tell a reference link
// from an inline one, and a save silently rewrote every reference as inline
// and dropped its [label]: url definition on the floor.
//
// This is markdown-it 13.0.1's own inline "link" rule
// (lib/rules_inline/link.js), copied rather than wrapped because the two
// paths -- inline and reference -- share one function with no seam to hook,
// and reimplementing link-label matching by hand is exactly the kind of
// fragile hand-rolled parsing this codebase avoids elsewhere (see D4 on
// execCommand). The only change from upstream is the one marked below; an
// upgrade of the CDN version needs this diffed against the new source, not
// just dropped in.
//
// The stamp records the raw label text, not markdown-it's normalised form --
// app.js does its own normalising (normalizeReferenceLabel) to look it back
// up, so this half never has to match markdown-it's exact Unicode case-folding
// for the two to agree with each other.
md.inline.ruler.at("link", function referenceAwareLink(state, silent) {
  var attrs, code, label, labelEnd, labelStart, pos, res, ref, token,
    href = "", title = "",
    oldPos = state.pos, max = state.posMax, start = state.pos,
    parseReference = true;

  if (state.src.charCodeAt(state.pos) !== 0x5b /* [ */) return false;

  labelStart = state.pos + 1;
  labelEnd = state.md.helpers.parseLinkLabel(state, state.pos, true);
  if (labelEnd < 0) return false;

  pos = labelEnd + 1;
  if (pos < max && state.src.charCodeAt(pos) === 0x28 /* ( */) {
    // Inline link: might have found a valid shortcut link, disable reference
    // parsing.
    parseReference = false;
    pos++;
    for (; pos < max; pos++) {
      code = state.src.charCodeAt(pos);
      if (!state.md.utils.isSpace(code) && code !== 0x0a) break;
    }
    if (pos >= max) return false;

    start = pos;
    res = state.md.helpers.parseLinkDestination(state.src, pos, state.posMax);
    if (res.ok) {
      href = state.md.normalizeLink(res.str);
      if (state.md.validateLink(href)) {
        pos = res.pos;
      } else {
        href = "";
      }

      start = pos;
      for (; pos < max; pos++) {
        code = state.src.charCodeAt(pos);
        if (!state.md.utils.isSpace(code) && code !== 0x0a) break;
      }

      res = state.md.helpers.parseLinkTitle(state.src, pos, state.posMax);
      if (pos < max && start !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        for (; pos < max; pos++) {
          code = state.src.charCodeAt(pos);
          if (!state.md.utils.isSpace(code) && code !== 0x0a) break;
        }
      }
    }

    if (pos >= max || state.src.charCodeAt(pos) !== 0x29 /* ) */) {
      // Parsing a valid shortcut link failed, fallback to reference.
      parseReference = true;
    }
    pos++;
  }

  if (parseReference) {
    if (typeof state.env.references === "undefined") return false;

    if (pos < max && state.src.charCodeAt(pos) === 0x5b /* [ */) {
      start = pos + 1;
      pos = state.md.helpers.parseLinkLabel(state, pos);
      if (pos >= 0) {
        label = state.src.slice(start, pos++);
      } else {
        pos = labelEnd + 1;
      }
    } else {
      pos = labelEnd + 1;
    }

    // Covers label === '' and label === undefined (collapsed reference link
    // and shortcut reference link respectively).
    if (!label) label = state.src.slice(labelStart, labelEnd);

    ref = state.env.references[state.md.utils.normalizeReference(label)];
    if (!ref) {
      state.pos = oldPos;
      return false;
    }
    href = ref.href;
    title = ref.title;
  }

  if (!silent) {
    state.pos = labelStart;
    state.posMax = labelEnd;

    token = state.push("link_open", "a", 1);
    token.attrs = attrs = [["href", href]];
    if (title) attrs.push(["title", title]);
    // The one addition to upstream: stamp which label a reference link
    // resolved through, so the DOM can say what the token stream cannot.
    if (parseReference) attrs.push(["data-ref-label", label]);

    state.linkLevel++;
    state.md.inline.tokenize(state);
    state.linkLevel--;

    token = state.push("link_close", "a", -1);
  }

  state.pos = pos;
  state.posMax = max;
  return true;
});

// The conventions of the document currently open. Replaced wholesale every time
// a document arrives with markdown to read; until then these are Turndown's own
// defaults, so a session that never opens a file serialises exactly as it did
// before markdown-style.js existed.
let markdownStyle = Object.assign({}, MARKDOWN_STYLE_DEFAULTS);

// The blocks of the document as it arrived, so an untouched one can be saved
// back as the bytes it came in as rather than as Turndown's rendering of it.
let markdownSource = new Map();

// A reference definition has no representation in the parsed document at all
// -- markdown-it consumes the line silently, so unlike everything else
// Turndown serialises, there is nothing left to read it back from. Stashed
// here the same way Mermaid and LaTeX stash what their own rendering destroys
// (see renderers.js), except a definition has no element to stash onto, so
// this keeps the raw line text keyed by its label instead. referenceAwareLink
// above is the other half: it stamps which label a reference link resolved
// through, so the referenceLink Turndown rule below can look the line back up
// by that label and know whether to bother.
let referenceDefinitions = new Map();

// CommonMark's own label matching: trim, collapse internal whitespace, fold
// case. Deliberately not markdown-it's normalizeReference -- that lives on
// the parser instance and only matters for resolving href/title correctly,
// which referenceAwareLink already does. This one only has to agree with
// itself between the scan below and the Turndown rule that reads its output,
// so it does not need to reproduce markdown-it's exact Unicode case-folding,
// and staying independent of the parser keeps both testable without one.
function normalizeReferenceLabel(label) {
  return (label || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// Reads the raw markdown for reference definitions and keys their exact
// source lines by label, so the Turndown rule below can hand one back
// byte-for-byte rather than re-deriving "[label]: url" in some house style
// that would not match what the author wrote. Deliberately narrow: this
// catches the common single-line "[label]: destination" / '"title"' form and
// nothing that spans lines. A definition markdown-it parses but this misses
// simply never finds a match at save time, so the link that used it saves as
// a plain inline link instead of losing its target outright.
function scanReferenceDefinitions(markdown) {
  const definitions = new Map();
  let fence = null;

  for (const line of (markdown || "").split("\n")) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }

    if (!isReferenceDefinitionLine(line)) continue;
    const label = line.match(/^ {0,3}\[([^\]]+)\]:/)[1];
    const key = normalizeReferenceLabel(label);
    // First definition wins: CommonMark's own precedence when a label is
    // defined more than once.
    if (!definitions.has(key)) definitions.set(key, line);
  }

  return definitions;
}

// The labels a given save actually used, so appendReferenceDefinitions only
// brings back the ones still pointed at -- an edit that removed the last link
// to a label drops its definition too, rather than leaving an orphan nobody
// references. Reset at the top of every htmlToMarkdown call; the Turndown
// rule below fills it in as it runs.
let usedReferenceLabels = new Set();

// Appended after Turndown and before the reflow/restore pass, so a
// reference's destination is exactly as immune to re-wrapping as every other
// definition line (see isReferenceDefinitionLine in markdown-style.js) and so
// an unedited definition that happens to still be present as its own block in
// the source is eligible for the same byte-restore every other segment gets.
//
// Always at the end of the document, regardless of where the source placed
// it. Mid-document definitions do not survive this -- markdown-it gives them
// no DOM node to track a position with -- so "collected once at the end" is
// the deliberate answer to a question that was otherwise open, rather than
// a gap.
function appendReferenceDefinitions(markdown, usedLabels) {
  const lines = [];
  for (const key of usedLabels) {
    const line = referenceDefinitions.get(key);
    if (line) lines.push(line);
  }
  if (!lines.length) return markdown;
  return markdown.replace(/\n*$/, "\n") + "\n" + lines.join("\n") + "\n";
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  hr: markdownStyle.hr,
  bulletListMarker: markdownStyle.bulletListMarker,
  emDelimiter: markdownStyle.emDelimiter,
  strongDelimiter: markdownStyle.strongDelimiter,
});

// Turndown reads its options object on each replacement rather than closing
// over it, so the serialiser can be re-styled in place. It has to be: the rules
// below are registered against this instance, and rebuilding it to change an
// option would drop them.
// Persisted next to the autosave because the autosave is HTML: a reload
// restores the document but carries no markdown to re-read, so without this the
// style and the source index are gone and the first save after any reload
// rewrites the whole file in the defaults. Stored as the source rather than as
// the derived style so both come back from one string.
function adoptMarkdownStyle(markdown, remember = true) {
  markdownStyle = sniffMarkdownStyle(markdown);
  markdownSource = indexMarkdownBlocks(markdown);
  referenceDefinitions = scanReferenceDefinitions(markdown);
  if (remember) {
    try {
      localStorage.setItem("markdownSource", markdown);
    } catch (error) {
      // A document too big for the quota still edits and saves; it just loses
      // byte fidelity across a reload.
      console.warn("[Style] Could not persist the source document:", error);
    }
  }
  turndownService.options.hr = markdownStyle.hr;
  turndownService.options.bulletListMarker = markdownStyle.bulletListMarker;
  turndownService.options.emDelimiter = markdownStyle.emDelimiter;
  turndownService.options.strongDelimiter = markdownStyle.strongDelimiter;
}

// Turndown rule to convert mermaid wrappers back to markdown code blocks
turndownService.addRule("mermaid", {
  filter: function (node) {
    return node.classList && node.classList.contains("mermaid-wrapper");
  },
  replacement: function (content, node) {
    const sourceElement = node.querySelector(".mermaid-source");
    if (sourceElement) {
      const source = sourceElement.textContent.trim();
      return "\n\n```mermaid\n" + source + "\n```\n\n";
    }
    return "";
  },
});

// The LaTeX counterpart of the mermaid rule above. MathJax renders the source
// away, so without this a save writes the rendered glyphs back to the file:
// $$\frac{a}{b}$$ returns as "ab", and there is no getting it back.
// renderers.js stamps data-tex while the TeX is still recoverable.
turndownService.addRule("mathjax", {
  filter: function (node) {
    return node.nodeName === "MJX-CONTAINER" && node.hasAttribute("data-tex");
  },
  // No surrounding newlines for display maths: an equation that was its own
  // paragraph is the only child of its <p>, so Turndown's own block handling
  // gives it the blank lines. Forcing them here would instead split a sentence
  // that happened to contain $$…$$ into three paragraphs.
  replacement: function (content, node) {
    const delimiter = node.getAttribute("data-display") === "block" ? "$$" : "$";
    return delimiter + node.getAttribute("data-tex") + delimiter;
  },
});

// Turndown ships no strikethrough rule either -- that one lives in
// turndown-plugin-gfm too -- so execCommand("strikeThrough")'s <s> or <del>
// fell through to the default and the markup round-tripped as plain text,
// silently, with the document still looking struck-through on screen right up
// until save. markdown-it's own strikethrough rule is a core rule, not a
// plugin, so parsing `~~text~~` back in already worked; only the way out was
// missing.
turndownService.addRule("strikethrough", {
  filter: function (node) {
    return node.nodeName === "S" || node.nodeName === "DEL" || node.nodeName === "STRIKE";
  },
  replacement: function (content) {
    return "~~" + content + "~~";
  },
});

// Turndown 7 ships no table rule -- GFM tables live in turndown-plugin-gfm,
// which this project does not carry -- so a <table> fell through to the default
// and every cell came back as its own paragraph. Opening a document containing
// a table and saving it destroyed the table outright, unrecoverably, and the
// editor showed nothing wrong either side of the save. markdown-it parses pipe
// tables on the way in, so they have to come back out.
function tableCellContent(content) {
  // A newline inside a cell ends the row, and a bare pipe starts a new cell.
  return content.trim().replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
}

// Read off the style attribute rather than cell.style, which the exported
// document and the test stub do not both implement the same way. markdown-it
// writes alignment there and nowhere else.
function tableColumnRule(cell) {
  const style = cell.getAttribute("style") || "";
  const align = (cell.getAttribute("align") || "").toLowerCase() ||
    (style.match(/text-align:\s*(left|center|right)/) || [])[1] ||
    "";
  if (align === "center") return ":-:";
  if (align === "right") return "--:";
  if (align === "left") return ":--";
  return "---";
}

// GFM has no table without a delimiter row, so whichever row comes first is the
// header whether or not it is made of <th> -- pasted HTML often is not.
function isFirstTableRow(node) {
  if (node.previousElementSibling) return false;
  const section = node.parentNode;
  if (!section || section.nodeName === "TABLE") return true;
  return !section.previousElementSibling;
}

turndownService.addRule("tableCell", {
  filter: ["th", "td"],
  replacement: function (content) {
    return " " + tableCellContent(content) + " |";
  },
});

turndownService.addRule("tableRow", {
  filter: "tr",
  replacement: function (content, node) {
    const row = "|" + content;
    if (!isFirstTableRow(node)) return "\n" + row;
    const rule = Array.prototype.map
      .call(node.children, (cell) => " " + tableColumnRule(cell) + " |")
      .join("");
    return "\n" + row + "\n|" + rule;
  },
});

turndownService.addRule("tableSection", {
  filter: ["thead", "tbody", "tfoot"],
  replacement: function (content) {
    return content;
  },
});

turndownService.addRule("table", {
  filter: "table",
  replacement: function (content) {
    return "\n\n" + content.trim() + "\n\n";
  },
});

// Turndown has no autolink output, so `<http://example.com>` came back as the
// four-times-longer [http://example.com](http://example.com). Only offered to
// documents that already write them, since the expansion is otherwise the form
// the author chose.
turndownService.addRule("autolink", {
  filter: function (node) {
    if (!markdownStyle.autolinks || node.nodeName !== "A") return false;
    const href = node.getAttribute("href");
    // A scheme is what makes an autolink an autolink. Without this check
    // [notes](notes.md) -- whose text and href also match -- becomes
    // <notes.md>, which CommonMark renders as literal text, not a link.
    if (!href || !/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
    return href === node.textContent && !node.getAttribute("title");
  },
  replacement: function (content, node) {
    return "<" + node.getAttribute("href") + ">";
  },
});

// Reference links are inlined by default the way every un-styled Turndown
// link is, which loses the whole point of writing one: a source that cites
// the same URL twenty times over arrives with one definition and would leave
// with twenty copies. referenceAwareLink stamps which label a link resolved
// through; this rule reads the stamp back and only trusts it if the
// definition survived the scan in scanReferenceDefinitions, so a label
// markdown-it resolved but the scan could not find (a definition spanning
// more than one line, say) falls through to Turndown's own default and saves
// as a plain inline link rather than as a reference with nothing to point at.
turndownService.addRule("referenceLink", {
  filter: function (node) {
    if (node.nodeName !== "A") return false;
    const label = node.getAttribute("data-ref-label");
    return Boolean(label) && referenceDefinitions.has(normalizeReferenceLabel(label));
  },
  replacement: function (content, node) {
    const label = node.getAttribute("data-ref-label");
    usedReferenceLabels.add(normalizeReferenceLabel(label));
    return "[" + content + "][" + label + "]";
  },
});

// Turndown hardcodes "*   one" and "1.  one" -- marker plus three or two spaces
// -- which is legal, uncommon, and enough on its own to touch every list line
// in the file. The pad and the numbering come from the document instead.
turndownService.addRule("listItem", {
  filter: "li",
  replacement: function (content, node, options) {
    const parent = node.parentNode;
    let marker;
    if (parent.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      const number = markdownStyle.orderedAllOnes
        ? 1
        : start
          ? Number(start) + index
          : index + 1;
      marker = number + markdownStyle.orderedDelimiter + " ".repeat(markdownStyle.orderedPad);
    } else {
      let depth = -1;
      for (let up = node; up; up = up.parentNode) {
        if (up.nodeName === "UL" || up.nodeName === "OL") depth++;
      }
      const level = markdownStyle.bulletsByDepth[depth];
      marker = (level ? level.marker : options.bulletListMarker) +
        " ".repeat(level ? level.pad : markdownStyle.bulletPad);
    }

    // Continuations align with the content, not the marker, or a nested block
    // falls out of its item.
    const body = content
      .replace(/^\n+/, "")
      .replace(/\n+$/, "\n")
      .replace(/\n/gm, "\n" + " ".repeat(marker.length));

    return marker + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
  },
});

// One slug for every export filename. Kept here rather than in any one export
// module because app.js loads before all three of them, in index.html and in
// the editable export's bundle alike.
//
// The trims are load-bearing, not tidiness: a title starting with an emoji
// ("👋 Welcome to Mandy") strips to a leading space, which then becomes a
// leading hyphen in the filename.
function slugifyTitle(text, fallback) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .substring(0, 50)
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

const editor = document.getElementById("editor");
// fileInput only exists in exported HTML files, which have no server behind
// them; the app itself uses the file API instead.
const fileInput = document.getElementById("fileInput");
const formatBar = document.getElementById("formatBar");

// Turndown decides how much leading/trailing whitespace to pull out of an
// inline element before any rule's filter or replacement runs -- it is baked
// into the node during Turndown's own upfront tree walk -- so an addRule
// override cannot intercept a real space at the edge of a code span; Turndown
// always moves it outside the backticks and drops it, saving `` `> ` `` as
// `` `>` ``. Swapping the edge space for a placeholder before Turndown ever
// parses the string sidesteps that: the placeholder is not whitespace, so
// Turndown leaves it exactly where it is, and htmlToMarkdown decodes it back
// once Turndown is done. A code span shielded on both edges gets two
// placeholders per edge rather than one, because CommonMark itself strips a
// single leading-and-trailing space pair from a code span's content -- the
// escape hatch for a span that needs to start with a backtick -- so a lone
// placeholder on each side would come back stripped on the next parse.
const CODE_EDGE_SPACE = String.fromCharCode(0xe000);

// U+00A0 is the one invisible character a user cannot get rid of from inside
// the app. Browsers write it in place of a trailing space in an edited
// contenteditable text node, so it arrives without ever being typed; it renders
// as a space and copies into other documents as one; and find-in-page matches
// it *against* a plain space, so searching "hello world" cheerfully finds the
// "hello\u00a0world" the user is then unable to locate and delete. There is no
// move available to them: the character is invisible, unsearchable, and comes
// from the editor rather than from anything they wrote.
//
// So it is normalised rather than preserved, and this is the one place the file
// deliberately does not come back byte-identical.
//
// It runs before Turndown, and on the HTML rather than on the markdown, for two
// separate reasons. The markdown has already been through
// restoreSourceWrapping by then, which hands back the original bytes of every
// block that still matches -- normalising there would strip a U+00A0 the author
// really did write, out of a paragraph nobody touched. Doing it here means only
// text that was actually edited is normalised, which is the boundary we want
// anyway. And the shield below tests for a literal space, so converting first
// is also what lets it see a trailing one at the edge of a code span: Turndown
// treats U+00A0 as whitespace (JS \s matches it) and moves it outside the
// backticks, so an unconverted one escaped the span *and* landed in the file.
//
// Both spellings, because innerHTML serialises U+00A0 back out as the entity.
// A literal "&amp;nbsp;" in the document is safe: it has no "&nbsp;" substring.
function normaliseNbsp(html) {
  return html.replace(/\u00a0|&nbsp;/g, " ");
}

function shieldCodeEdgeSpaces(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("code").forEach((node) => {
    const hasSiblings = node.previousSibling || node.nextSibling;
    const isCodeBlock = node.parentNode.nodeName === "PRE" && !hasSiblings;
    if (isCodeBlock) return;
    const text = node.textContent;
    if (!text || text.trim() === "") return;
    const leading = /^ /.test(text);
    const trailing = / $/.test(text);
    if (!leading && !trailing) return;
    const pad = leading && trailing ? CODE_EDGE_SPACE + CODE_EDGE_SPACE : CODE_EDGE_SPACE;
    let next = text;
    if (leading) next = pad + next.slice(1);
    if (trailing) next = next.slice(0, -1) + pad;
    node.textContent = next;
  });
  return container.innerHTML;
}

// Turndown's output never ends in a newline, so every saved file was one git
// reports as "\ No newline at end of file". Normalised here rather than in
// saveFile because Download MD writes a file too, and a copied document that
// ends in a newline is what the clipboard's consumers expect anyway.
function htmlToMarkdown(html) {
  usedReferenceLabels = new Set();
  const markdown = turndownService.turndown(shieldCodeEdgeSpaces(normaliseNbsp(html)))
    .replace(new RegExp(CODE_EDGE_SPACE, "g"), " ")
    .replace(/\n*$/, "\n");
  const withReferences = appendReferenceDefinitions(markdown, usedReferenceLabels);
  // Re-wrap first, restore second: restoring puts back original bytes, and the
  // re-wrap must not then take a hand-broken line back apart.
  const wrapped = reflowMarkdown(withReferences, markdownStyle.wrapWidth);
  return restoreSourceWrapping(wrapped, markdownSource);
}

// The only place markdown enters the document, which is why the sniff lives
// here rather than at the four call sites -- open, upload, paste and the
// welcome document all route through it, and a fifth would be easy to forget.
function markdownToHtml(markdown) {
  adoptMarkdownStyle(markdown);
  return md.render(markdown);
}

// ── Button handlers ──────────────────────────────────────────────────────────

// Registered by action name, not bound to an element: download and upload only
// exist in exported documents, and registering an action nothing renders is
// harmless.
onToolbarAction("download-md", () => {
  const markdown = htmlToMarkdown(editor.innerHTML);

  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "document.md";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

onToolbarAction("upload-md", () => {
  if (fileInput) fileInput.click();
});

onToolbarAction("copy-md", async (button) => {
  const markdown = htmlToMarkdown(editor.innerHTML);

  try {
    await navigator.clipboard.writeText(markdown);
    // Was a flash on the button. The button is a menu item now and the menu has
    // closed behind the click, so the confirmation has to happen somewhere the
    // user is still looking.
    notify("Markdown copied to clipboard.", { severity: "success" });
  } catch (err) {
    notify("Unable to copy to clipboard. Please grant clipboard permissions.", {
      severity: "error",
    });
  }
});

// New is what "no baggage" means: a document with no more history than the
// one Mandy opens with. This used to be what Clear did — see the comment on
// the "clear" handler below for why the two split (CHANGELOG.md, "New and
// Clear are two different weights now").
onToolbarAction("new", async () => {
  // Two different questions wearing one dialog until now. Starting fresh over
  // an untouched welcome document costs nothing; starting fresh over an hour
  // of unsaved work costs the hour — and the old wording read identically
  // either way, which made the dialog useless as a signal about what was at
  // stake.
  //
  // So the dirty case goes through file-api.js's shared guard, which knows the
  // filename and can offer Save. The guard does not exist in an exported
  // document, which ships no file-api.js and has no file to be dirty against:
  // that is the honest absence rather than a second implementation, and the
  // plain question below is what an export gets.
  // One dialog or the other, never both. The guard's question already covers
  // everything the plain one says and adds the filename and a Save button, so
  // asking twice would only teach the user to click through the first.
  const guarded =
    typeof confirmDiscard === "function" &&
    typeof documentIsDirty === "function" &&
    documentIsDirty();

  if (guarded) {
    const proceed = await confirmDiscard({
      title: "Start a new document?",
      detail: "The auto-saved copy goes too.",
      discardLabel: "Discard and start new",
    });
    if (!proceed) return;
  } else {
    // Cancel is the default action, so Enter and Escape both do the safe thing.
    const confirmed = await ask(
      "This removes all content and the auto-saved copy.",
      {
        title: "Start a new document?",
        severity: "warn",
        actions: [
          { label: "Cancel", value: false, variant: "quiet", default: true },
          { label: "New", value: true, variant: "danger" },
        ],
      },
    );
    if (!confirmed) return;
  }

  editor.innerHTML = "<p><br></p>";
  localStorage.removeItem("markdownContent");
  localStorage.removeItem("markdownSource");
  // Or a block of the old document could come back on the next save.
  markdownStyle = Object.assign({}, MARKDOWN_STYLE_DEFAULTS);
  markdownSource = new Map();
  referenceDefinitions = new Map();

  editor.focus();
  const range = document.createRange();
  const sel = window.getSelection();
  range.setStart(editor.firstChild, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);

  // Replaced, not edited: New also drops the autosave, the sniffed style and
  // (via file-api.js) the file association, so an undo that brought the text
  // back would restore it into a document that no longer knows where it came
  // from. The ask() dialog is what stands in for undo here.
  undoReset();
});

// Clear used to carry New's weight above — dialog, full reset, file
// association drop — under the theory that an empty document should not
// still claim to be notes.md. That is right for starting over, and wrong for
// emptying the document you have open: this reads like Ctrl+A then Delete
// instead. The content goes; the file you're editing, its undo history and
// its autosave don't. `runCommand` raises `input` the same as typing would,
// so it undoes as one ordinary step and needs no dialog of its own — Ctrl+Z
// already covers it.
//
// The selection is built directly rather than via execCommand("selectAll"),
// because a menu click can land here with the caret nowhere near the editor
// — selectAll scopes to wherever focus already is, and this document has no
// guarantee focus was ever inside #editor this session. selectNodeContents
// pins the range to the editor regardless.
onToolbarAction("clear", () => {
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  runCommand("delete");
});

// Cross-browser identical per D4 / TODO 1.1's measurements — including the
// id="null" Chrome leaves on it, which normaliseEditorMarkup already strips
// for any <hr> regardless of how it got there — so this needs nothing beyond
// the command itself. execCommand raises input for free.
onToolbarAction("insert-hr", () => runCommand("insertHorizontalRule"));

// Insert / edit a link. Four cases, and only the first has an execCommand:
//
//   - text selected, not already a link   createLink, which the browser check
//                                         measured identical in both engines
//   - a bare caret                        insert the address as its own link
//   - the caret is inside a link          retarget it by setting href directly
//   - the caret is inside a link,         unlink it
//     address left empty
//
// createLink inside an existing <a> is the one combination the browser check
// does not cover and the engines disagree on — Chrome nests a second anchor —
// so the retarget and unlink cases are done by hand. The direct-mutation ones
// dispatch a synthetic `input`, the same convention insertToc and the format
// bar's Code branch already follow, so undo, autosave and the dirty flag hear
// them. createLink and insertHTML raise it themselves through runCommand.
function linkAncestor(node) {
  let el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== editor) {
    if (el.tagName === "A") return el;
    el = el.parentElement;
  }
  return null;
}

function attrEscape(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A bare "example.com" is almost never meant as a relative path, so give it a
// scheme. Anything already carrying one, an #anchor, or a path is left exactly
// as typed — markdown puts no other constraint on an href.
function normaliseLinkHref(value) {
  const href = value.trim();
  if (!href) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  if (/^[#/]|^\.\.?\//.test(href)) return href;
  if (/^[^\s/]+\.[^\s/]/.test(href)) return `https://${href}`;
  return href;
}

async function insertLink() {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const live = selection.getRangeAt(0);
  if (!editor.contains(live.commonAncestorContainer)) return;

  const range = live.cloneRange();
  const existing = linkAncestor(range.commonAncestorContainer);
  const answer = await askForInput("Link address", {
    title: existing ? "Edit link" : "Insert link",
    placeholder: "https://example.com",
    value: existing ? existing.getAttribute("href") || "" : "",
    confirmLabel: existing ? "Update" : "Insert",
  });
  if (answer === null) return; // backed out — leave the link alone

  const href = normaliseLinkHref(answer);

  if (existing) {
    if (href) existing.setAttribute("href", href);
    else unwrapLink(existing);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  if (!href) return;

  // The dialog took focus, and the selection went with it.
  editor.focus();
  selection.removeAllRanges();
  selection.addRange(range);

  if (range.collapsed) {
    runCommand("insertHTML", `<a href="${attrEscape(href)}">${attrEscape(href)}</a>`);
    return;
  }
  runCommand("createLink", href);
}

function unwrapLink(link) {
  const parent = link.parentNode;
  while (link.firstChild) parent.insertBefore(link.firstChild, link);
  parent.removeChild(link);
}

onToolbarAction("insert-link", insertLink);

onToolbarAction("paste-md", async () => {
  try {
    const clipboardText = await navigator.clipboard.readText();
    if (clipboardText && clipboardText.trim()) {
      const html = markdownToHtml(clipboardText);
      // Caret insertion, not a document replacement — there is a real Open
      // now, and wanting the replacement is New followed by this. runCommand
      // raises `input` for free, so undo, autosave and the dirty flag pick it
      // up the same way a real paste does, and this is no longer an
      // editor.innerHTML assignment site for undo.js to know about.
      runCommand("insertHTML", html);
      await renderMermaidDiagrams(editor);
      await renderLatex(editor);
      // The two renderers run after the `input` event above already scheduled
      // a debounced autosave, so without this an immediate reload could still
      // catch the pre-render markup.
      localStorage.setItem("markdownContent", editor.innerHTML);
    }
  } catch (err) {
    notify("Unable to access clipboard. Please grant clipboard permissions.", {
      severity: "error",
    });
  }
});

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const markdown = event.target.result;
      const html = markdownToHtml(markdown);
      editor.innerHTML = html;
      await renderMermaidDiagrams(editor);
      await renderLatex(editor);
      localStorage.setItem("markdownContent", editor.innerHTML);
      // This is Open, for the variant with no file server behind it.
      undoReset();
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}

// --- Links -----------------------------------------------------------------
//
// Two problems, and the anchors are the bigger one. Inside a contenteditable
// the browser treats a link as text to put the caret in and will not navigate
// on a modifier either, so nothing here is free. And markdown-it does not slug
// headings — heading ids are GitHub's extension, not part of the spec — so a
// table of contents arrives with every link pointing at an element that does
// not exist. Making the destination exist is most of the work.

// Deliberately NOT slugifyTitle: that one strips non-ASCII (so "Ünïcode
// Heading" becomes "ncode-heading" while the href markdown-it wrote is
// "#ünïcode-heading") and truncates at 50 characters, and it is shared by all
// four export filenames, so it must not be bent to fit this.
function anchorSlug(text) {
  return (text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

// Slugs are resolved against the live document on every click rather than
// stamped onto the headings once, because an id assigned at render time goes
// stale the moment someone edits the heading. `stamp` is for the static export,
// which has no JS to resolve anything and needs real id attributes.
//
// Duplicate headings get GitHub's -1, -2 suffixes, so a document with two
// "Notes" sections still addresses both.
function headingAnchors(root, stamp = false) {
  const counts = new Map();
  const anchors = new Map();

  for (const heading of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const base = anchorSlug(heading.textContent);
    if (!base) continue;

    const seen = counts.get(base) || 0;
    counts.set(base, seen + 1);
    const slug = seen ? `${base}-${seen}` : base;

    anchors.set(slug, heading);
    if (stamp) heading.id = slug;
  }

  return anchors;
}

// An href out of a document Mandy did not write — a file off disk, or an
// editable export that arrived by mail. `javascript:` through window.open would
// run in the app's own origin, next to the file API, so this is an allowlist
// rather than a blocklist.
const LINK_SCHEMES = ["http:", "https:", "mailto:"];

// scrollIntoView would park the heading under the toolbar, which is sticky at
// top: 0 — so the jump lands on a heading the reader cannot see. Measured from
// the live element rather than repeating the 69px min-height from app.css,
// which is a magic number already and wrong once the toolbar wraps to two rows.
function scrollToAnchor(target) {
  const toolbar = document.querySelector(".toolbar");
  const clearance = toolbar ? toolbar.getBoundingClientRect().height + 12 : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - clearance;

  window.scrollTo({
    top: Math.max(top, 0),
    // Setting location.hash instead would pile up history entries and, in an
    // exported file opened from file://, rewrite the URL for no benefit.
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
}

function openExternalLink(href) {
  let url;
  try {
    // No base, so a relative href throws and is left inert. That is the
    // documented first cut: resolving ./notes.md against the origin just 404s
    // off the static handler, and opening it in Mandy is a bigger feature. See
    // docs/TODO.md before making relative links do something.
    url = new URL(href);
  } catch {
    return;
  }

  if (!LINK_SCHEMES.includes(url.protocol)) return;
  window.open(url.href, "_blank", "noopener");
}

editor.addEventListener("click", (e) => {
  // Plain click has to keep placing the caret, or link text becomes uneditable.
  if (!e.metaKey && !e.ctrlKey) return;

  const link = e.target.closest && e.target.closest("a");
  const href = link && link.getAttribute("href");
  if (!href) return;

  e.preventDefault();

  if (href.startsWith("#")) {
    // markdown-it percent-encodes non-ASCII in the attribute, so decode before
    // matching against a slug that kept its unicode.
    let wanted = href.slice(1);
    try {
      wanted = decodeURIComponent(wanted);
    } catch {
      // A malformed escape is not worth failing over; match it raw.
    }
    const target = headingAnchors(editor).get(wanted);
    if (target) scrollToAnchor(target);
    return;
  }

  openExternalLink(href);
});

// The hint is a CSS variable rather than a title attribute on each link:
// Turndown serialises a title into the markdown as [text](href "title"), so
// stamping one would write the tooltip into the user's file. app.css draws it
// from a :hover pseudo-element, which never enters the DOM at all.
document.documentElement.style.setProperty(
  "--link-hint",
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '"Cmd+Click to open link"'
    : '"Ctrl+Click to open link"',
);

// Pasted HTML arrives carrying two kinds of junk that are invisible in the
// document and impossible to find from inside it: elements the source page's
// styling left behind with nothing in them, and blank <p>/<div> blocks that
// render as a ~1px line and space bullets unevenly. The blanks are the ones
// that stick: Turndown serialises them, so they survive a save and a reload and
// travel on into whatever the file is opened with next.
//
// Deliberately targeted rather than a round-trip through markdown. Pasting a
// web page should keep its bold, its links and its tables -- what gets dropped
// is only what nobody can see and nobody asked for.
const GHOST_INLINE_TAGS = new Set([
  "SPAN", "B", "I", "EM", "STRONG", "U", "S", "STRIKE", "FONT",
  "SMALL", "BIG", "SUB", "SUP", "MARK", "ABBR",
]);
const GHOST_BLOCK_TAGS = new Set(["P", "DIV"]);

// Elements that are content in themselves, so an ancestor holding one is not
// empty however empty its text looks.
const REPLACED_TAGS = new Set([
  "IMG", "TABLE", "HR", "SVG", "VIDEO", "AUDIO", "IFRAME",
  "INPUT", "CANVAS", "OBJECT", "EMBED", "PICTURE",
]);

// Walked rather than queried because the check has to run inside the DOM stub
// too, where querySelectorAll answers with nothing.
function holdsTag(node, tags) {
  for (const child of node.childNodes || []) {
    if (child.nodeType !== 1) continue;
    if (tags.has(child.tagName)) return true;
    if (holdsTag(child, tags)) return true;
  }
  return false;
}

const BR_TAG = new Set(["BR"]);

/**
 * Whether this element is junk: no text, nothing in it that counts as content.
 *
 * The asymmetry over <br> is the point and not an oversight. A <p> or <div>
 * whose only content is a line break *is* the ghost line -- that is the exact
 * markup Word and Docs emit for a blank one. Inside an inline element the same
 * <br> is a real break in a real line, so it saves its parent.
 */
function isGhostElement(node) {
  if (!node || node.nodeType !== 1) return false;
  const inline = GHOST_INLINE_TAGS.has(node.tagName);
  if (!inline && !GHOST_BLOCK_TAGS.has(node.tagName)) return false;
  if ((node.textContent || "").trim() !== "") return false;
  if (holdsTag(node, REPLACED_TAGS)) return false;
  return inline ? !holdsTag(node, BR_TAG) : true;
}

function sanitisePastedHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = normaliseNbsp(html);

  // Repeated because emptying a ghost can expose its parent as one: the wrapper
  // chains these pastes carry are often several deep with nothing at the bottom
  // of them. Each pass removes at least one node, so it terminates.
  for (;;) {
    const ghosts = Array.from(container.querySelectorAll("*")).filter(isGhostElement);
    if (!ghosts.length) break;
    ghosts.forEach((node) => node.remove());
  }

  return container.innerHTML;
}

// The plain half of a paste, and the whole of Paste without formatting.
//
// This is what Ctrl/Cmd+Shift+V lands in: Chrome 152 and Firefox 154 both strip
// text/html for that binding (measured by tests/paste-check.html), so a plain
// paste arrives here rather than in the branch above. execCommand raises it as
// `insertText`, which is exactly what a keystroke raises, so without the break
// a paste in the middle of a sentence would be undone together with the
// sentence.
//
// The character only, never the entity: in text/plain an "&nbsp;" is six
// characters somebody actually copied.
function insertPlainText(text) {
  if (!text || !text.trim()) return;
  undoBreak();
  runCommand("insertText", text.replace(/\u00a0/g, " "));
}

// Shared by the paste event and the Edit menu's Paste, so the two cannot
// disagree about what a paste does — the menu reads the clipboard through the
// async API instead of an event, and that is the only difference between them.
function insertPastedContent(html, text) {
  if (html && html.trim()) {
    const clean = sanitisePastedHtml(html);
    // A fragment that was nothing but wrappers sanitises to nothing. Falling
    // through to the plain text is better than inserting an empty string and
    // leaving the user to wonder where their paste went.
    if (clean.trim()) {
      runCommand("insertHTML", clean);
      return;
    }
  }
  insertPlainText(text);
}

editor.addEventListener("paste", (e) => {
  e.preventDefault();
  insertPastedContent(
    e.clipboardData.getData("text/html"),
    e.clipboardData.getData("text/plain"),
  );
});

// Cut and Copy go through execCommand, which is enough on its own: it acts on
// the editor's live selection, and `mousedown` is prevented over the toolbar so
// clicking the menu item does not blur the editor and take that selection with
// it. Cut raises `input` for free, so undo, autosave and the dirty flag pick it
// up the way any other edit is picked up.
onToolbarAction("cut", () => runCommand("cut"));
onToolbarAction("copy", () => runCommand("copy"));

// Paste cannot: execCommand("paste") is refused in web content in every engine,
// so the menu has to read the clipboard itself. That is a permission the app
// may not have — paste-md has always had the same problem and reports it the
// same way — and the keyboard route works regardless, which is what the message
// points at.
onToolbarAction("paste", async () => {
  try {
    const items = await navigator.clipboard.read();
    let html = "";
    let text = "";
    for (const item of items) {
      if (!html && item.types.includes("text/html")) {
        html = await (await item.getType("text/html")).text();
      }
      if (!text && item.types.includes("text/plain")) {
        text = await (await item.getType("text/plain")).text();
      }
    }
    insertPastedContent(html, text);
  } catch (err) {
    notify("Unable to read the clipboard. Press Ctrl+V to paste instead.", {
      severity: "error",
    });
  }
});

onToolbarAction("paste-plain", async () => {
  try {
    insertPlainText(await navigator.clipboard.readText());
  } catch (err) {
    notify("Unable to read the clipboard. Press Ctrl+Shift+V to paste instead.", {
      severity: "error",
    });
  }
});

let saveTimer;
editor.addEventListener("input", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem("markdownContent", editor.innerHTML);
  }, 1000);
});

function isBlankContent(html) {
  const trimmed = (html || "").trim();
  return trimmed === "" || trimmed === "<p><br></p>" || trimmed === "<p></p>";
}

// The welcome document is markdown like any other, not markup baked into the
// page. Returns false if it cannot be fetched so startup can carry on with an
// empty editor rather than dying on the welcome text.
async function loadWelcomeDocument() {
  try {
    const res = await fetch("/welcome.md");
    if (!res.ok) throw new Error(res.statusText);
    editor.innerHTML = markdownToHtml(await res.text());
    return true;
  } catch (error) {
    console.error("[Welcome] Could not load welcome.md:", error);
    editor.innerHTML = "<p><br></p>";
    return false;
  }
}

window.addEventListener("load", () => {
  const saved = localStorage.getItem("markdownContent");
  const isExported = editor.hasAttribute("data-exported");

  (async () => {
    if (isExported) {
      // Exported HTML file: keep the embedded content, ignore localStorage
      editor.removeAttribute("data-exported");
    } else if (saved && !isBlankContent(saved)) {
      editor.innerHTML = saved;
      // Re-adopt rather than re-render: the document is already restored, and
      // this only needs the style and the block index the markdown carries.
      const source = localStorage.getItem("markdownSource");
      if (source) adoptMarkdownStyle(source, false);
    } else {
      if (saved) localStorage.removeItem("markdownContent");
      localStorage.removeItem("markdownSource");
      await loadWelcomeDocument();
    }

    try {
      await renderMermaidDiagrams(editor);
    } catch (error) {
      console.error("[Mermaid] Startup render error:", error);
    }
    try {
      await renderLatex(editor);
    } catch (error) {
      console.error("[MathJax] Startup render error:", error);
    }

    // One baseline for all three branches above — exported, restored and
    // welcome — and deliberately after the renderers, so the first snapshot is
    // the document as it will actually be seen rather than the markup before
    // Mermaid and MathJax rewrote parts of it.
    undoReset();
    // Only file-api.js knows whether this session's restored document is
    // dirty, and an exported document has no file-api.js at all.
    if (typeof initUndoBaseline === "function") initUndoBaseline();
  })();
});

window.addEventListener("beforeunload", (e) => {
  const currentContent = editor.innerHTML.trim();
  // Check if content is empty or just the empty paragraph placeholder
  const willSave =
    currentContent &&
    currentContent !== "<p><br></p>" &&
    currentContent !== "<p></p>" &&
    currentContent !== "";

  // Only save if content is not essentially empty
  if (willSave) {
    localStorage.setItem("markdownContent", editor.innerHTML);
  }

  // The one guard that cannot use ask(): the browser will not wait on a
  // Promise, so this gets returnValue and the browser's own wording, with no
  // say in what it says. Autosave means the work is usually still there when
  // you come back, which is exactly why nobody notices this is missing until
  // the one time it is not — a cleared cache, another browser, a private
  // window. documentIsDirty lives in file-api.js, which an exported document
  // does not ship and which has no file to be dirty against anyway.
  if (typeof documentIsDirty === "function" && documentIsDirty()) {
    e.preventDefault();
    e.returnValue = "";
    return "";
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

// Returns the <li> the caret is in, or null. Scoped to the editor: a selection
// in a list somewhere else on the page is not ours to indent.
function listItemAtCaret() {
  const anchor = window.getSelection().anchorNode;
  const element = anchor && (anchor.closest ? anchor : anchor.parentElement);
  const item = element && element.closest && element.closest("li");
  return item && editor.contains(item) ? item : null;
}

// execCommand puts the nested list beside the item it belongs to rather than
// inside it — in Chrome and in Firefox both, measured, not folklore — so the
// parent list can be one hop further up than the spec shape suggests. Look for
// either: execcommand.js normalises the markup after every command, but this
// also runs against lists that arrived by paste or from a file.
function isNested(item) {
  const list = item.parentElement;
  return !!(list && list.parentElement && list.parentElement.closest("ul, ol"));
}

// execCommand's outdent isn't trustworthy here in either engine: Firefox
// merges the item into the one above it (<li>one<br>two</li>) instead of
// unnesting it, silently losing a bullet with no way back, and that markup is
// indistinguishable from a deliberate hard break so normaliseEditorMarkup
// cannot repair it after the fact — see tests/list-indent-check.html, which
// still measures all three engines doing it. So this does the move by
// hand instead of asking execCommand for it, in both browsers: `item` leaves
// its list and becomes a sibling of the <li> it was nested under, and any
// items that followed it in that list move with it, becoming its own nested
// sublist rather than being left behind under the old parent.
function outdentListItem(item) {
  const innerList = item.parentElement;

  // execCommand's own indent leaves the nested list beside the item it
  // belongs to rather than inside it (see isNested above), and
  // normaliseEditorMarkup folds that back into the spec shape after every
  // execCommand — but this bypasses execCommand, and a list pasted in from
  // elsewhere can still arrive in the sibling shape. Fold it here too, rather
  // than teach every step below both shapes.
  if (innerList.parentElement && innerList.parentElement.tagName !== "LI") {
    const owner = innerList.previousElementSibling;
    if (owner && owner.tagName === "LI") {
      innerList.parentElement.removeChild(innerList);
      owner.appendChild(innerList);
    }
  }

  const parentItem = innerList.parentElement;
  const outerList = parentItem.closest("ul, ol");

  const selection = window.getSelection();
  const anchorNode = selection.anchorNode;
  const anchorOffset = selection.anchorOffset;

  const following = [];
  for (let sibling = item.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
    following.push(sibling);
  }

  if (following.length) {
    let subList = item.querySelector(":scope > ul, :scope > ol");
    if (!subList) {
      subList = document.createElement(innerList.tagName);
      item.appendChild(subList);
    }
    // Appended in document order, and after whatever the item already had
    // nested under it: `following` were siblings of `item`, so they sit below
    // it on screen, and below its own sublist with it. Prepending each in turn
    // got both of those backwards — it reversed the run, which needs two
    // followers to be visible at all and so had no test until a real browser
    // showed it.
    for (const node of following) {
      innerList.removeChild(node);
      subList.appendChild(node);
    }
  }

  innerList.removeChild(item);
  if (!innerList.children.length) parentItem.removeChild(innerList);

  outerList.insertBefore(item, parentItem.nextSibling);

  // Moving nodes rather than replacing them keeps the Range's endpoints
  // valid, but contenteditable doesn't always keep the visible caret in sync
  // with that — so put it back explicitly rather than trust the browser.
  if (anchorNode && editor.contains(anchorNode)) {
    const range = document.createRange();
    const max = anchorNode.nodeType === 3 ? anchorNode.length : anchorNode.childNodes.length;
    range.setStart(anchorNode, Math.min(anchorOffset, max));
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
}

// Same two guards Tab and Shift+Tab use below, pulled out so the toolbar
// control (TODO 1.1.3) can ask the identical question a keypress does rather
// than re-deriving it: a first item can't nest under nothing (markdown has no
// way to write it, and Turndown would emit an indent that parses back as a
// code block), and outdent only applies where there is a level to leave.
function canIndentListItem(item) {
  return !!(item && item.previousElementSibling);
}

function canOutdentListItem(item) {
  return !!(item && isNested(item));
}

// Tab indents a bullet instead of moving focus — but only inside a list, and
// only where the nesting is expressible: markdown cannot write a first item
// nested under nothing, and Turndown would emit an indent that parses back as
// a code block. Shift+Tab only unnests; plain outdent turns a top-level item
// into a paragraph, which is a formatting change, not an indent. Everywhere
// else Tab keeps its default job of leaving the editor, which is a keyboard
// user's only way out.
editor.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) return;

  const item = listItemAtCaret();
  if (!item) return;

  if (e.shiftKey) {
    if (!canOutdentListItem(item)) return;
    e.preventDefault();
    outdentListItem(item);
    return;
  }

  if (!canIndentListItem(item)) return;
  e.preventDefault();
  runCommand("indent");
});

// TODO 1.1.3: the engine-side move above had no control reaching it outside
// Tab / Shift+Tab, so touch had no way to nest a bullet at all. These are that
// control's handlers — same guards, same calls, just reached from the Format
// menu instead of a keypress. A caret outside a list, or one a guard rejects,
// is a silent no-op, the same as pressing Tab does in either of those cases.
onToolbarAction("indent-list-item", () => {
  const item = listItemAtCaret();
  if (canIndentListItem(item)) runCommand("indent");
});

onToolbarAction("outdent-list-item", () => {
  const item = listItemAtCaret();
  if (canOutdentListItem(item)) outdentListItem(item);
});

// Whether the caret's <li> holds nothing — no text, no nested list, no image.
// The <br> a browser parks in an otherwise empty block does not count.
function listItemIsEmpty(item) {
  if ((item.textContent || "").trim()) return false;
  for (const child of item.children || []) {
    if (child.nodeType === 1 && child.tagName !== "BR") return false;
  }
  return true;
}

function listHasItem(list) {
  for (const child of list.children || []) {
    if (child.nodeType === 1 && child.tagName === "LI") return true;
  }
  return false;
}

// Same explicit-Range dance outdentListItem uses: contenteditable does not
// reliably keep the visible caret with nodes that have just moved, so it is put
// back by hand rather than trusted.
function caretToStartOf(target) {
  const selection = window.getSelection();
  if (!selection || !document.createRange) return;
  const range = document.createRange();
  range.setStart(target, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretToEndOf(target) {
  const selection = window.getSelection();
  if (!selection || !document.createRange) return;
  const kids = target.childNodes || target.children || [];
  const last = kids[kids.length - 1];
  const range = document.createRange();
  if (last && last.nodeType === 3) range.setStart(last, (last.textContent || "").length);
  else range.setStart(target, kids.length);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

// Enter and Backspace on an empty bullet, done by hand.
//
// Left to contenteditable, both are a lottery: Chrome splits the <ul> and
// strands blank <p><br></p> blocks between the halves, Backspace drops the
// caret at the start of the *next* item instead of the end of the one before,
// and a single Enter can move the caret two rows down — every one of those was
// a bug report. execCommand has no clean primitive for it, so this is the call
// outdentListItem already made for Shift+Tab: do the move ourselves in one
// deterministic shape, and raise `input` so autosave, the dirty flag, undo and
// the outline all hear it.
editor.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== "Backspace") return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return;

  const item = listItemAtCaret();
  if (!item || !listItemIsEmpty(item)) return;

  const list = item.parentElement;
  if (!list || (list.tagName !== "UL" && list.tagName !== "OL")) return;

  // Backspace with a bullet directly above: the empty item just goes, and the
  // caret lands at the end of that bullet — where the user expected it, and
  // where contenteditable would not have put it.
  const prev = item.previousElementSibling;
  if (e.key === "Backspace" && prev && prev.tagName === "LI") {
    e.preventDefault();
    list.removeChild(item);
    caretToEndOf(prev);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  // A nested empty item outdents one level rather than leaving the list
  // outright — Enter and a first-item Backspace both. outdentListItem is
  // exactly that move, and already raises `input` and restores the caret.
  if (isNested(item)) {
    e.preventDefault();
    outdentListItem(item);
    return;
  }

  // Top level: leave the list for a paragraph. Enter splits the list at the
  // caret — items above stay, items below become a fresh list after the new
  // paragraph. Backspace (only reached on the first item) puts the paragraph
  // before the list and leaves the rest of it intact.
  e.preventDefault();
  const para = document.createElement("p");
  para.appendChild(document.createElement("br"));

  const followers = [];
  for (let s = item.nextElementSibling; s; s = s.nextElementSibling) followers.push(s);

  list.removeChild(item);

  if (e.key === "Backspace") {
    list.parentNode.insertBefore(para, list);
  } else {
    list.insertAdjacentElement("afterend", para);
    if (followers.length) {
      const rest = document.createElement(list.tagName === "OL" ? "ol" : "ul");
      for (const s of followers) {
        list.removeChild(s);
        rest.appendChild(s);
      }
      para.insertAdjacentElement("afterend", rest);
    }
  }

  if (!listHasItem(list)) list.parentNode.removeChild(list);

  caretToStartOf(para);
  editor.dispatchEvent(new Event("input", { bubbles: true }));
});

document.addEventListener("keydown", (e) => {
  // Save/open bind to the blob fallbacks only where those buttons are rendered,
  // i.e. in exported documents. In the app itself file-api.js owns Ctrl+S and
  // Ctrl+O, and talks to the server instead.
  if ((e.ctrlKey || e.metaKey) && e.key === "s" && toolbarButton("download-md")) {
    e.preventDefault();
    runToolbarAction("download-md");
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "o" && toolbarButton("upload-md")) {
    e.preventDefault();
    runToolbarAction("upload-md");
  }
  // Gated the way Ctrl+S and Ctrl+O are: an exported document renders no PDF
  // item and ships no pdf-export.js, so without this the shortcut swallows the
  // browser's own Ctrl+Shift+P to do nothing.
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P" && toolbarButton("export-pdf")) {
    e.preventDefault();
    runToolbarAction("export-pdf");
  }
  // Ctrl/Cmd+K for a link, the way every editor binds it. insertLink is a
  // no-op unless the selection is in the editor, so an unfocused window just
  // loses the keystroke rather than acting on nothing.
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key === "k") {
    e.preventDefault();
    runToolbarAction("insert-link");
  }
  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y live in undo.js: execCommand's stack is
  // discarded by every innerHTML assignment in this file.
});
