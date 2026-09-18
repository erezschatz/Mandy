// The markdown-it configuration: the two rules that decide what this project's
// markdown *means*, kept apart from the app that renders through it.
//
// Both were in app.js until 2026-09-14, in among the Turndown rules, the editor
// bootstrap and the keyboard handling, by accident of history rather than by
// design. The model is defined as "markdown parsed by this parser", so the
// parser's configuration belongs to the model layer — and the practical half of
// that is TODO 3.1's stage 1 slice 2: the model suite builds its own markdown-it
// and so could see neither a `math` token nor a `data-ref-label` stamp, which
// are exactly the two things slice 2's re-emission and link steps are about. The
// alternatives were a copy of the rules for the suite (a test carrying its own
// copy of the logic is not a test) and having the suite assemble the app's rules
// itself (honest, but leaves the configuration in the wrong file). See
// docs/REWRITE.md, and D7 in docs/DECISIONS.md for why a branch that has not
// replaced the core may still move code the app loads.
//
// `configureMarkdownParser(md)` at the bottom is the only door. Nothing here
// touches the DOM or reaches for a parser of its own: the instance is handed in,
// which is what lets the app pass the one it built from the CDN and the suite
// pass `npm:markdown-it@13.0.1`, with both getting the same rules.

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
function referenceAwareLink(state, silent) {
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
}

// Register both rules on a markdown-it instance. Called by app.js on the CDN
// parser it builds, and by the model suite on the npm one — the same
// configuration either way, which is the entire point of the file.
function configureMarkdownParser(md) {
  md.inline.ruler.before("escape", "math", mathRule);
  md.renderer.rules.math = function (tokens, idx) {
    const token = tokens[idx];
    return token.markup + md.utils.escapeHtml(token.content) + token.markup;
  };
  md.inline.ruler.at("link", referenceAwareLink);
  return md;
}
