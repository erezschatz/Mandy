// The document model. TODO 3.1, stage 1 — docs/REWRITE.md is the design.
//
// Nothing loads this file yet. It is in none of the three registries
// (index.html, sw.js's SHELL_ASSETS, html-export.js's ASSETS), because until
// the model can render and be edited there is nothing for the app to call.
// That is how far this has got, not a quarantine: D7 in docs/DECISIONS.md is
// there because this comment used to say the branch's job was to leave the
// running editor alone, which is not and never was the goal. What it is: the
// thing that will own the document once contenteditable stops owning it — an
// ordered list of blocks, each holding the exact bytes it arrived with and the
// exact bytes that followed it.
//
// The one property this stage exists to prove: a file that is opened and saved
// with nothing edited comes back byte for byte. That is D1, and here it is
// structural rather than earned. `modelSerialise` concatenates each block's
// source with the separator that followed it, so a round trip is an identity
// unless a block says it was edited — which is the opposite of the current
// design, where Turndown rewrites everything and `restoreSourceWrapping` puts
// most of it back by matching content.
//
// It also means the block index nothing can key on position is gone. A
// content-keyed index was a way to find a block's source without a source map;
// markdown-it's `map` is the source map, so two identical paragraphs can no
// longer be confused for one another, which `indexMarkdownBlocks` could be.

// There is no export statement: front/ has no modules, and this will be a
// plain <script> like every other. Every name below is a global, prefixed
// `model` for the reason `saveFileAs` is not `saveAs` — see CLAUDE.md's
// load-order section on collisions in the shared scope.
//
// Everything here is a pure function over a string and markdown-it's tokens.
// The parser is passed in rather than reached for, and since slice 2's step 0
// both callers configure it the same way — `configureMarkdownParser` in
// markdown-parser.js, carrying the `math` and `referenceAwareLink` rules — so
// the app hands over its CDN instance, the suite its `npm:` one, and the two
// parse alike. A module that fetched its own parser could not be tested without
// a browser, which is the whole point of doing this stage first.

const MODEL_BLOCK_KINDS = {
  paragraph_open: "paragraph",
  heading_open: "heading",
  bullet_list_open: "list",
  ordered_list_open: "list",
  blockquote_open: "quote",
  table_open: "table",
  fence: "fence",
  code_block: "code",
  hr: "hr",
  html_block: "html",
  front_matter: "front-matter",
  // The kinds only a container's children can be (slice 1b). A table is two
  // levels of them — head or body, then row — and the row is the floor:
  // `td_open` carries no `map`, so a cell is not a sub-block and cannot be
  // made one from the token stream.
  list_item_open: "item",
  thead_open: "table-head",
  tbody_open: "table-body",
  tr_open: "row",
};

// The same table one level down: an inline node's kind, by the token that opens
// it. Slice 2's step 1. Two of the names differ from the token deliberately —
// `code-span` because `code` is already a *block* kind here (an indented code
// block), and `strike` because that is what docs/MARKDOWN.md calls it.
//
// `html_inline` is in the table and never occurs: the app builds its parser
// with markdown-it's defaults, so `html` is off and `<b>x</b>` arrives as text.
// It is listed because the fallback for an unmapped token is `"unknown"`, and a
// construct that turned up later should be named rather than silently sharing a
// bucket with every other surprise.
const MODEL_INLINE_KINDS = {
  text: "text",
  code_inline: "code-span",
  image: "image",
  math: "math",
  softbreak: "softbreak",
  hardbreak: "hardbreak",
  html_inline: "html",
  strong_open: "strong",
  em_open: "em",
  s_open: "strike",
  link_open: "link",
};

// Line index to character offset, so a block's span can be taken out of the
// original string rather than rebuilt by joining lines. Rebuilding would be
// one `\n` away from wrong at the end of a file, in the direction that adds a
// newline nobody wrote.
function modelLineOffsets(markdown) {
  const offsets = [0];
  for (let i = 0; i < markdown.length; i++) {
    if (markdown[i] === "\n") offsets.push(i + 1);
  }
  return offsets;
}

// markdown-it's block tokens at one nesting level, in source order, with the
// line span each covers. At level 0 over the whole stream those are the file's
// top-level blocks, which is what `modelParse` asks for and all this function
// did when it was `modelTopLevelSpans`. At a container's own level plus one,
// over that container's token slice, they are its children — a list's items, a
// quote's blocks, a table's head and body. That is slice 1b, and it is why
// this takes a level rather than hardcoding the outermost one.
//
// One level at a time, because only one level tiles without overlapping: a
// container's `map` covers everything inside it, so a span one level down sits
// *inside* a span at this level rather than beside it. Recursion is the caller's
// business (slice 1b's step 2); what is promised here is the tiling at the
// level asked for.
//
// **A `map` is an absolute line range in the file at every depth**, which is
// what makes that recursion nearly free: `modelLineOffsets`, `startOf` and
// `endOf` read a child's bytes out of the same string the file arrived in, and
// there is no coordinate translation anywhere to get wrong.
function modelSpansAtLevel(tokens, level) {
  const spans = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    // `inline` is the one mapped token that is not a block, and markdown-it
    // puts it one level below the paragraph or heading carrying it — so a
    // container's children are never inlines and this clause never fires
    // today. It is here because if that ever stopped being true, an inline's
    // span would overlap its own parent's and those bytes would be emitted
    // twice; skipped, the worst case is a `gap` block that still holds them
    // exactly once.
    if (token.level !== level || !token.map || token.type === "inline") {
      i += 1;
      continue;
    }
    if (token.nesting === 1) {
      let j = i + 1;
      while (j < tokens.length && !(tokens[j].level === level && tokens[j].nesting === -1)) j += 1;
      spans.push({ open: token, tokens: tokens.slice(i, j + 1), start: token.map[0], end: token.map[1] });
      i = j + 1;
      continue;
    }
    if (token.nesting === 0) {
      spans.push({ open: token, tokens: [token], start: token.map[0], end: token.map[1] });
      i += 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

const modelIsBlankLine = (line) => line.trim() === "";

// A block, before its source, separator and children are attached. `inline` is
// the token a paragraph or heading carries its content in — the editable
// structure once stage 2 converts it. Every other kind keeps its token slice
// and is edited as a whole for now.
function modelBlockFromSpan(span, md) {
  const kind = MODEL_BLOCK_KINDS[span.open.type] || "unknown";
  const inline = span.tokens.find((t) => t.type === "inline") || null;
  const block = {
    kind,
    level: kind === "heading" ? Number(span.open.tag.slice(1)) : 0,
    inline: kind === "paragraph" || kind === "heading" ? inline : null,
    tokens: span.tokens,
    inlines: null,       // filled below, from `inline`
    source: null,        // set by the caller, from the span
    separator: "",
    children: null,      // a container's sub-blocks, tiling its own source
    leading: "",         // the container's bytes before its first child
    parent: null,        // set by the tiler; what makes modelTouch able to walk up
    marker: null,        // an item only: see modelItemPrefix
    contentIndent: null,
    quotePrefixes: null,  // inside a quote only: see modelQuotePrefix
  };
  // Eagerly rather than on first edit: the fold is a walk over tokens the
  // parser has already produced — 980 blocks and ~11,000 tokens across the
  // files the suite drives — and a field that is filled at exactly one moment
  // cannot be half-filled when the emitter reads it.
  block.inlines = modelInlines(block, md);
  return block;
}

// A line no token claimed. Same shape as any other block, with nothing to parse
// and nothing to render — see `modelParse` for what lives here and why.
function modelGapBlock() {
  return {
    kind: "gap",
    level: 0,
    inline: null,
    tokens: [],
    inlines: null,
    source: null,
    separator: "",
    children: null,
    leading: "",
    parent: null,
    marker: null,
    contentIndent: null,
    quotePrefixes: null,  // inside a quote only: see modelQuotePrefix
  };
}

/**
 * A block's inline content as a tree. Slice 2's step 1.
 *
 * markdown-it hands inline content over as a **flat** list of tokens with
 * `nesting` on each — `+1` opens, `-1` closes, `0` is a leaf — so `**a [b](c)**`
 * arrives as six tokens in a row rather than as a mark holding a link. This
 * folds that list back into the tree the structure describes, which is what an
 * edited block is re-emitted from (step 3) and what stage 2's format commands
 * act on.
 *
 * **The fold is on `nesting`, never on a list of mark kinds** — the same rule
 * the block tiler follows one level up, and for the same reason: a construct
 * this file has never heard of still nests correctly, and the kinds table only
 * names it. An unmapped token comes back as kind `"unknown"` holding its own
 * markup and content, which is a thing to look at rather than a thing lost.
 *
 * **A mark carries the delimiter as the author wrote it.** `_a_` and `*a*` are
 * both em and are told apart by `markup`; so are `__a__` and `**a**`, and a
 * code span's backtick run. That is per-node fidelity, where
 * `sniffMarkdownStyle` can only make one guess for a whole document — strictly
 * better, and it costs nothing to keep, because the parser already recorded it.
 *
 * **The token stays on the node.** Everything the parser kept that this shape
 * does not name — a link's href, title and `data-ref-label` stamp, an image's
 * `src` — is read off it by steps 3 and 5 rather than re-derived from the
 * source, which would be a second parser free to disagree with the first.
 *
 * **An image is one node, not its alt text.** markdown-it parses the alt into
 * `token.children`, and those are deliberately not folded in: the alt is one
 * atom in step 2's offset space, and its source is already on `token.content`.
 *
 * Leaves carry `children: null` rather than `[]`, the same convention blocks
 * use, because "has children" is the test the emitter switches on.
 *
 * **One kind of token is dropped**, and only one: a zero-length text token, of
 * which markdown-it leaves one on each side of every mark it converts. See the
 * comment in the loop.
 *
 * Returns null for a block with no inline token at all — a fence, a rule, a
 * gap, and every container, whose text lives in its own children. A table row
 * is the one place that is a limit rather than a fact: its cells hold inline
 * tokens, but `td_open` carries no `map`, so a cell is not a block for them to
 * hang off. That is 1b's floor and is unchanged here.
 */
function modelInlines(block, md) {
  if (!block.inline) return null;
  const content = block.inline.content;

  const root = [];
  const stack = [root];
  // The node currently open at each level of `stack`, parallel to it and one
  // longer than deep — `opens[0]` is null, standing for the root, which has no
  // closing delimiter to consume. Needed because a close token carries none of
  // the information consuming its delimiter needs (which mark, which link):
  // that lives on the node the matching open token built, and this is how the
  // loop still has it by the time nesting === -1 arrives.
  const opens = [null];
  // The cursor into `content` — this block's raw markdown, marker and
  // continuation indent already stripped (see the fold's own doc comment) —
  // that step 3's raw-source tracking advances token by token. Token order is
  // source order, so this is a single left-to-right pass, the same shape as
  // `modelTileRange`'s over lines rather than characters.
  let pos = 0;

  for (const token of block.inline.children || []) {
    // markdown-it's emphasis rule leaves a zero-length text token on each side
    // of a mark it converted — `**a**` arrives as text("") strong text("") —
    // and 410 of the 6,303 text tokens in the files the suite drives are these.
    // They are the parser's bookkeeping rather than anything the author wrote:
    // they hold no bytes, so dropping them cannot lose one, and keeping them
    // would put positions in step 2's offset space that no caret can tell from
    // their neighbours. This is the fold's one omission, and it is checked as
    // one — the suite asserts that every token it does not carry is an empty
    // text token.
    if (token.type === "text" && token.content === "") continue;

    if (token.nesting === -1) {
      // A close carries nothing an open did not: same markup, no content. An
      // unmatched one cannot happen from markdown-it, and if it ever did,
      // popping the root would strand everything after it outside the tree —
      // so the guard drops the token rather than the rest of the block.
      const open = opens[opens.length - 1];
      if (open) pos = modelCloseInline(open, content, pos, md);
      if (stack.length > 1) { stack.pop(); opens.pop(); }
      continue;
    }

    const node = {
      kind: MODEL_INLINE_KINDS[token.type] || "unknown",
      markup: token.markup,
      content: token.content,
      token,
      children: null,
    };
    stack[stack.length - 1].push(node);

    if (token.nesting === 1) {
      pos = modelOpenInline(node, pos);
      node.children = [];
      stack.push(node.children);
      opens.push(node);
    } else {
      pos = modelLeafInline(node, content, pos, md);
    }
  }
  return root;
}

// CommonMark's escapable set — the only characters a backslash can neutralise.
// `\q` is not one of these and is not an escape at all: both the backslash and
// the `q` reach the text token, so the plain-character branch below already
// handles it without this table's help.
const MODEL_ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/;

/**
 * A leaf's rendered text, matched back onto the raw bytes it came from.
 *
 * markdown-it decodes a backslash escape before the text token ever exists —
 * `\*not em\*` arrives as the single token `*not em*`, with no per-character
 * record of which asterisk had a backslash in front of it — so the only way
 * back is to walk `content` and `plain` together and notice where they part
 * company for exactly the two characters an escape costs.
 *
 * Returns `{ raw, length }` on a clean match — `raw` is the exact source text,
 * escapes included, and `length` is how much of `content` it consumed, which is
 * this block's contribution to keeping every later node's cursor in sync.
 * Returns `null` when it cannot resolve the next character at all, which today
 * means an HTML entity or numeric character reference: markdown-it decodes
 * those too, and unlike an escape there is no fixed-width pattern to match
 * back to. Unmeasured and accepted — none of this repo's own markdown files
 * carry a live one, `docs/MARKDOWN.md` does not track entities as a construct,
 * and the one literal `&nbsp;` in CLAUDE.md sits inside a code span, which
 * never reaches this function at all.
 */
function modelScanEscaped(content, pos, plain) {
  let i = pos;
  let j = 0;
  let raw = "";
  while (j < plain.length) {
    if (content[i] === "\\" && MODEL_ESCAPABLE.test(content[i + 1] || "") && content[i + 1] === plain[j]) {
      raw += content.slice(i, i + 2);
      i += 2;
      j += 1;
      continue;
    }
    if (content[i] === plain[j]) {
      raw += content[i];
      i += 1;
      j += 1;
      continue;
    }
    return null;
  }
  return { raw, length: i - pos };
}

// The whitespace CommonMark strips from the start of a paragraph's
// continuation line. Both breaks below read it the same way, immediately
// after their own newline: a hard break's raw span is its spelling plus the
// newline plus this, and a soft break's is the newline plus this, because the
// indent is invisible to rendering but is still bytes the source spent —
// **`raw` is the *inverse* of rendering, not of what CommonMark keeps**, and an
// untouched break sitting next to an edited sibling has to give every one of
// those bytes back or D1 stops being true one line into the next one.
function modelContinuationIndent(content, pos) {
  return /^[ \t]*/.exec(content.slice(pos))[0];
}

// The closing backtick run for a code span opened by `markup` at `pos`: the
// first occurrence of that exact run that is not itself part of a longer one.
// CommonMark's own rule — an opening and closing run must match in length, and
// a run one backtick longer on either side does not count as a delimiter at
// all — so `` ``a` `` ` `` has to skip the lone backtick inside it rather than
// closing there. Returns -1 for an unterminated span, which cannot happen for
// a code-span token markdown-it already committed to; kept as a return value
// rather than an assumption because nothing here re-validates the parser's
// own decision.
function modelCodeSpanClose(content, pos, markup) {
  let search = pos;
  for (;;) {
    const idx = content.indexOf(markup, search);
    if (idx < 0) return -1;
    const before = idx > 0 ? content[idx - 1] : "";
    const after = content[idx + markup.length] || "";
    if (before !== "`" && after !== "`") return idx;
    search = idx + 1;
  }
}

/**
 * The raw text after a link's or image's closing `]`: `(dest "title")`,
 * `[label]`, or nothing at all for a shortcut reference. One function for
 * both constructs because the grammar is one function upstream too — a link
 * and an image differ only in the `!` before the `[`, which the caller has
 * already consumed by the time this runs — and because which of the three
 * forms is in front of the cursor is answered by looking at one character
 * rather than by being told: `(` is inline, `[` is a reference (empty for the
 * collapsed form), anything else is a shortcut with nothing left to read.
 *
 * The inline branch calls `md.helpers.parseLinkDestination` and
 * `parseLinkTitle` rather than re-deriving the grammar by hand — the same
 * reuse `referenceAwareLink` in markdown-parser.js already argues for, and for
 * the same reason: an angle-bracket destination, an escaped paren inside a
 * bare one, and a quoted-versus-parenthesised title all have escaping and
 * nesting rules a hand-rolled version would have to get right a second time.
 * It mirrors that rule's own skip-parse-skip-parse-skip loop exactly, which is
 * what makes the returned raw span include the destination's brackets and the
 * title's quotes verbatim rather than a value already stripped of them.
 *
 * The reference branch does not use `md.helpers.parseLinkLabel`, which needs a
 * live inline-parser state to skip nested tokens correctly — this repo's own
 * files nest nothing inside a reference label, so a plain search for the next
 * `]` is the measured-sufficient version rather than the fully general one.
 */
function modelLinkOrImageTail(content, pos, md) {
  if (content[pos] === "[") {
    const end = content.indexOf("]", pos + 1);
    if (end < 0) return { raw: "", length: 0 };
    return { raw: content.slice(pos, end + 1), length: end + 1 - pos };
  }
  if (content[pos] === "(") {
    let cursor = pos + 1;
    const skipWs = () => {
      while (cursor < content.length && /[ \t\n]/.test(content[cursor])) cursor += 1;
    };
    skipWs();
    const dest = md.helpers.parseLinkDestination(content, cursor, content.length);
    if (dest.ok) cursor = dest.pos;
    skipWs();
    const title = md.helpers.parseLinkTitle(content, cursor, content.length);
    if (title.ok) cursor = title.pos;
    skipWs();
    if (content[cursor] === ")") cursor += 1;
    return { raw: content.slice(pos, cursor), length: cursor - pos };
  }
  return { raw: "", length: 0 }; // a shortcut: `![alt]` or `[text]`, nothing after it
}

// The raw markup a mark's or a link's *open* token consumes: a mark's own
// delimiter, exactly as written (`markup` already carries it, per-node, which
// is slice 2 step 1's whole point); `[` for a link's opening bracket, whose
// token carries no markup of its own except to say "autolink" instead of the
// text `<` it actually wrote.
function modelOpenInline(node, pos) {
  if (node.kind === "link") return pos + 1; // "<" or "[" — both one character
  return pos + node.markup.length;
}

// The raw markup a mark's or a link's *close* token consumes: a mark's own
// closing delimiter, or a link's `]` (`>` for an autolink) plus whatever
// `modelLinkOrImageTail` finds after it — recorded on the node here rather
// than by the caller, since the close token is the only place in the loop
// that still has the node once its children are done.
function modelCloseInline(node, content, pos, md) {
  if (node.kind === "link") {
    if (node.markup === "autolink") return pos + 1; // ">"
    const cursor = pos + 1; // "]"
    const tail = modelLinkOrImageTail(content, cursor, md);
    node.tail = tail.raw;
    return cursor + tail.length;
  }
  return pos + node.markup.length;
}

/**
 * A leaf token's raw span, and — for the four kinds step 3 exists for — the
 * bytes markdown-it's own token discarded, recorded on the node the way 1b's
 * step 5 records a list item's marker: at parse, where the bytes are in hand,
 * because re-deriving them at emit time would be a second place free to
 * disagree with this one.
 *
 * - **`code-span`** keeps its padding (or the absence of it) in `raw`, the
 *   exact text between the backtick runs — markdown-it's `content` has already
 *   had a required single space stripped from each side when the span opens or
 *   closes on a backtick itself.
 * - **`hardbreak`** keeps which spelling in `raw`: markdown-it hands back a
 *   bare token for both a trailing backslash and two-or-more trailing spaces,
 *   which is the one divergence measured across this repo's own files that
 *   drove TODO 2.3 under the current design and is closed here by construction
 *   instead of by a document-wide sniff.
 * - **`image`** keeps its alt text's raw spelling in `raw` and its destination
 *   tail in `tail` — not one of the plan's four named spellings, but needed for
 *   the same reason a mark needs its delimiters recorded: an image sitting
 *   untouched next to an edited sibling still has to reconstruct exactly, and
 *   nothing else on the node says how.
 * - **`text`** and the `unknown` fallback keep their raw spelling, escapes
 *   included, in `raw` — this is the "an escape" item in the plan's list of
 *   four, folded into the same field text already needed reconstructed.
 * - **`softbreak`** keeps the whole separator CommonMark discards as
 *   insignificant — a trailing run of spaces before the newline, if any, and
 *   the next line's own leading indent — in `raw`. A fifth thing the plan does
 *   not name, and it is not optional the way it might look: this is invisible
 *   to rendering, not to the file, and an untouched break the emitter has to
 *   reproduce next to an edited sibling needs every one of those bytes back or
 *   D1 is only true until the next line.
 * - **`math`** needs nothing recorded: `mathSpan` in markdown-parser.js takes
 *   its content as a verbatim slice with no escaping applied at all, so
 *   `markup + content + markup` already is the raw span.
 */
function modelLeafInline(node, content, pos, md) {
  switch (node.kind) {
    case "code-span": {
      const start = pos + node.markup.length;
      const close = modelCodeSpanClose(content, start, node.markup);
      node.raw = content.slice(start, close);
      return close + node.markup.length;
    }
    case "hardbreak": {
      const spelling = content[pos] === "\\" ? "\\" : /^ {2,}(?=\n)/.exec(content.slice(pos))[0];
      const after = pos + spelling.length + 1; // past the spelling and the newline
      const indent = modelContinuationIndent(content, after);
      node.raw = spelling + "\n" + indent;
      return after + indent.length;
    }
    case "softbreak": {
      // A paragraph's continuation line loses its own leading indentation to
      // CommonMark before inline parsing ever runs — not only a break's own
      // trailing spaces, which is why `raw` carries both: the trailing run (if
      // any), the newline, and the next line's stripped indent. Miss the
      // second half and the cursor lands inside that indent instead of at the
      // line's first real character, and every node after the break reads
      // short by however wide it was.
      const trailing = /^[ \t]*(?=\n)/.exec(content.slice(pos))[0];
      const after = pos + trailing.length + 1; // past the trailing run and the newline
      const indent = modelContinuationIndent(content, after);
      node.raw = trailing + "\n" + indent;
      return after + indent.length;
    }
    case "math":
      return pos + node.markup.length + node.content.length + node.markup.length;
    case "image": {
      let cursor = pos + 2; // "!["
      const scan = modelScanEscaped(content, cursor, node.content);
      if (!scan) throw modelUnresolvedSpelling(node);
      node.raw = scan.raw;
      cursor += scan.length + 1; // the scanned alt text, then "]"
      const tail = modelLinkOrImageTail(content, cursor, md);
      node.tail = tail.raw;
      return cursor + tail.length;
    }
    default: {
      const scan = modelScanEscaped(content, pos, node.content);
      if (!scan) throw modelUnresolvedSpelling(node);
      node.raw = scan.raw;
      return pos + scan.length;
    }
  }
}

// `modelScanEscaped` gives up on exactly one thing today: an HTML entity or a
// numeric character reference, which markdown-it decodes the same way it
// decodes a backslash escape and with the same total loss of the original
// spelling — but with no fixed-width pattern to scan back through, unlike an
// escape's "backslash plus one character". Thrown rather than papered over
// with a guess: a wrong guess here does not just misrender this one node, it
// leaves the cursor short for every sibling after it, which is the exact
// silent-wrong-file failure `modelEmitBlock`'s own throw exists to prevent one
// level up. Unmeasured and accepted for now — none of this repo's own markdown
// files carry a live entity, `docs/MARKDOWN.md` does not track them as a
// construct at all, and the one literal `&nbsp;` in CLAUDE.md sits inside a
// code span, which never reaches this function. Whoever gives entities a
// spelling of their own — plausibly step 4, which is already about characters
// that need special handling — replaces this throw rather than working around
// it.
function modelUnresolvedSpelling(node) {
  return new Error(`cannot recover the raw spelling of a ${node.kind} node: ${JSON.stringify(node.content)}`);
}

// A literal backslash immediately before a CommonMark-escapable character, or
// an `&` that starts a run shaped like a real HTML entity or numeric
// character reference — the two things markdown-it decodes on its own, with
// no delimiter pair to find and remove the way a mark's or a link's has.
// Fixed here rather than by reparsing and searching, unlike everything else
// `modelEscapeText` handles: a literal backslash before punctuation always
// needs a second one in front of it to stay literal, and an entity-shaped run
// always needs its `&` escaped, regardless of anything else in the string —
// there is no context that changes either answer, which is exactly what makes
// them safe to fix in one static pass before the construct search below ever
// runs. Left alone, both are invisible to that search: a self-decoding run
// still reparses to exactly one flat `text` token, just not the one the
// caller meant, and hunting for *which* backslash to blame by re-parsing
// forwards from the start of the string never converges — escaping the wrong
// one only grows a longer run of backslashes in the same place forever.
function modelEscapeSilentTriggers(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\" && MODEL_ESCAPABLE.test(text[i + 1] || "")) {
      out += "\\\\";
    } else if (ch === "&" && /^&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/i.test(text.slice(i))) {
      out += "\\&";
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Where, in a candidate that has already been through
 * `modelEscapeSilentTriggers` but is *not yet* flat, the first remaining
 * construct begins — the position `modelEscapeText` should slip a backslash
 * in front of.
 *
 * A naive version of this search asks one global question per character —
 * *does everything from here on reparse as plain text?* — and it is wrong:
 * that question is blind to which construct is actually responsible, so one
 * real pair anywhere in the string fails the check for every character to its
 * left, including punctuation with nothing to do with it. Measured against
 * `tests/fixtures/torture.md`'s own deliberately adversarial prose, that
 * version escaped a colon and a comma in front of two unrelated emphasis
 * pairs later in the same sentence — safe, since escaping never adds a
 * meaning, but not minimal, and minimal is the entire point (see
 * `modelEscapeText`).
 *
 * So this asks a narrower question instead, using the same token-consumption
 * arithmetic step 3 already built for `modelLeafInline`: walk the candidate's
 * own reparse in source order, consuming each text token's raw span with
 * `modelScanEscaped` exactly as an unedited leaf would, and stop at the first
 * token that is not a plain top-level `text` — the position where a mark
 * opens, a code span's backticks start, a link's `[`, or wherever a stray `$`
 * paired into maths. That position depends on nothing to its right, which is
 * what makes it safe to escape and move on rather than re-deriving the whole
 * string's flanking rules from scratch.
 *
 * Assumes there is nothing left for `modelScanEscaped` to fail on — no
 * unescaped backslash-before-punctuation, no entity — which is exactly what
 * the pre-pass guarantees, so a failure here is this function's own bug
 * rather than a case to recover from, and it throws rather than guessing at
 * one.
 *
 * Returns -1 on a candidate that is already flat, which callers use as the
 * stopping condition rather than a special case.
 */
function modelFirstConstruct(md, candidate) {
  const children = md.parseInline(candidate, {})[0]?.children || [];
  if (children.length === 1 && children[0].type === "text") return -1;

  let pos = 0;
  for (const token of children) {
    if (token.nesting === -1) continue; // a closer's position was fixed by its opener
    if (token.type !== "text") return pos;
    const scan = modelScanEscaped(candidate, pos, token.content);
    if (!scan) throw new Error(`modelEscapeSilentTriggers left something unresolved: ${JSON.stringify(candidate)}`);
    pos += scan.length;
  }
  return pos; // defensive: children.length > 1 with every token "text" cannot happen (text_collapse merges adjacent text)
}

/**
 * The minimal backslash-escaping of a run of plain text — content with
 * nothing recorded to put back, because it is genuinely new: typed fresh, or
 * built by an editing command rather than folded from a parse. 1.0% of this
 * repo's own text tokens hold a character that would re-parse as something
 * else if handed back plain, which is narrow enough that a rash of escapes
 * nobody wrote would be a worse failure than the one this fixes — MARKDOWN.md's
 * **S3** already settled this as the sniffer's whole argument extended one
 * level down: record first (step 3), sniff second, house style never, and
 * "escape everything that could possibly be markup" is exactly the house
 * style this refuses to have an opinion of its own.
 *
 * **Verified by asking the real parser, not by re-deriving CommonMark's
 * flanking rules by hand** — the same reuse step 3's link-tail parsing already
 * argues for, and for a sharper reason here: whether `*a*` is emphasis depends
 * on what is on both sides of each delimiter, which is exactly the kind of
 * rule a hand-rolled version is most likely to get subtly wrong in a case
 * nobody thought to write down.
 *
 * Two passes. `modelEscapeSilentTriggers` first, for the two things markdown-it
 * decodes with no delimiter of their own — a backslash already in the plain
 * text, an entity-shaped run — because those have no position a reparse can
 * blame; then `modelFirstConstruct`, repeated: find the first real construct
 * left, escape its opening character, reparse, repeat. Each escape can only
 * unblock the parser (never introduce a new pairing that was not already
 * possible from characters already present), so the loop always terminates,
 * and it terminates having touched only the characters that were actually
 * responsible. `*a*` escapes only its opening delimiter, because once it is
 * gone the second `*` has no partner left to pair with and the very next
 * check already comes back flat.
 *
 * The guard bound is generous rather than exact — one escape can, in the
 * pathological case, only ever remove one construct's worth of tokens, so the
 * number of iterations is bounded by how many independent constructs `text`
 * could possibly contain, which is at most its length. Thrown rather than
 * returned if that bound is ever hit, the same call `modelUnresolvedSpelling`
 * makes one level up: silently handing back a candidate that still is not
 * flat would write a file that does not say what the editor thinks it does.
 *
 * What this does not reach: a character that is only ambiguous alongside a
 * *sibling* node's content (two texts either side of an untouched mark, say)
 * is judged on this node's own text alone, and a leading block marker (`#`,
 * `>`, a list marker) is not this function's question at all — only the
 * block emitter that places a leaf at a block's true start can answer that,
 * and it does not exist yet.
 */
function modelEscapeText(md, text) {
  let candidate = modelEscapeSilentTriggers(text);
  for (let guard = 0; guard <= text.length; guard++) {
    const at = modelFirstConstruct(md, candidate);
    if (at < 0) return candidate;
    candidate = candidate.slice(0, at) + "\\" + candidate.slice(at);
  }
  throw new Error(`could not escape to a flat reparse: ${JSON.stringify(text)}`);
}

// A link destination as CommonMark accepts it plain — no whitespace, no
// unescaped parenthesis, no control character — which the `<...>` form below
// exists precisely to hold whatever this can't: something already normalised
// by `normalizeLink` (a %-encoded space, say) almost always lands here, since
// encoding is what removed the characters that would have forced the other
// form in the first place.
const MODEL_BARE_DESTINATION = /^[^\s()<>\x00-\x1f]*$/;

/**
 * A link or image destination, as markdown rather than as the resolved string
 * `href` on the token — `attrGet("href")` is already what `normalizeLink`
 * made of whatever was typed, not what a fresh command would type, so this is
 * new markdown built from it rather than a spelling put back.
 *
 * Bare whenever nothing forces the alternative — the common case, since a
 * normalised URL rarely still carries a raw space or paren. Wrapped in
 * `<...>` otherwise, with `\` escaped first so the two escapes it adds for
 * `<` and `>` are never themselves mistaken for one the destination already
 * had — order matters here the way it does in `modelEscapeSilentTriggers`.
 */
function modelEscapeLinkDestination(href) {
  if (MODEL_BARE_DESTINATION.test(href)) return href;
  return "<" + href.replace(/\\/g, "\\\\").replace(/</g, "\\<").replace(/>/g, "\\>") + ">";
}

// A link or image title as markdown: double-quoted, with a literal backslash
// or double quote escaped first-then-second for the same reason the
// destination above orders its two escapes — inserting `\"` for an existing
// quote must not itself look like an existing escaped backslash.
function modelEscapeLinkTitle(title) {
  return '"' + title.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * The `(dest "title")` or `[label]` tail `modelInlineSource` falls back to for
 * a link or an image with no `tail` recorded — one built fresh by a command,
 * or one whose destination a command changed, rather than one carried
 * untouched from a parse. Reference-versus-inline is read off `data-ref-label`
 * exactly as step 3's own tail-parsing does, not re-decided here: a link
 * still stamped with a label re-emits as a reference, in the label's
 * **explicit** form regardless of whatever shortcut or collapsed form the
 * source might once have used — CLAUDE.md's own accepted loss for an edited
 * reference link, unchanged and needing no new argument here.
 *
 * What this does not reach, on purpose: whether the label still resolves to a
 * definition anywhere in the document is a question about the whole document,
 * which a single node's own `token` cannot answer, and belongs to whatever
 * block-level emitter eventually calls this — the same boundary
 * `scanReferenceDefinitions` already draws on the running app.
 */
function modelRebuildTail(token, destAttr) {
  const label = token.attrGet("data-ref-label");
  if (label !== null) return "[" + label + "]";
  const dest = modelEscapeLinkDestination(token.attrGet(destAttr) || "");
  const title = token.attrGet("title");
  return title === null ? "(" + dest + ")" : "(" + dest + " " + modelEscapeLinkTitle(title) + ")";
}

/**
 * An inline tree back to the raw text it was folded from — the inverse of
 * `modelInlines`, for the nodes it recorded a spelling on. On a tree nothing
 * has touched, this reproduces `block.inline.content` exactly, which is what
 * lets an untouched leaf sitting beside an edited one still come back
 * byte-identical once slice 3 gives a container-level emitter something to
 * call this from.
 *
 * `node.raw ?? modelEscapeText(md, node.content)` is the fallback that makes
 * genuinely new content fall through cleanly: a mark or a text run built by an
 * editing command rather than folded from a parse has no `raw` at all, and
 * step 4 is what makes rendering it from plain content safe rather than
 * merely convenient. `node.tail ?? modelRebuildTail(...)` is step 5's version
 * of the same fallback, one level up: a link or image whose destination
 * changed, or one built fresh, has no `tail` either, and is rebuilt from its
 * token's `attrs` instead of the bytes nobody wrote yet.
 */
function modelInlineSource(nodes, md) {
  let out = "";
  for (const node of nodes || []) {
    switch (node.kind) {
      case "text":
        out += node.raw ?? modelEscapeText(md, node.content);
        break;
      case "code-span":
        out += node.markup + (node.raw ?? node.content) + node.markup;
        break;
      case "softbreak":
        out += node.raw ?? "\n";
        break;
      case "hardbreak":
        out += node.raw ?? "  \n";
        break;
      case "math":
        out += node.markup + node.content + node.markup;
        break;
      case "image":
        out += "![" + (node.raw ?? modelEscapeText(md, node.content)) + "]" +
          (node.tail ?? modelRebuildTail(node.token, "src"));
        break;
      case "link":
        if (node.markup === "autolink") out += "<" + modelInlineSource(node.children, md) + ">";
        else {
          out += "[" + modelInlineSource(node.children, md) + "]" +
            (node.tail ?? modelRebuildTail(node.token, "href"));
        }
        break;
      default:
        if (node.children) out += node.markup + modelInlineSource(node.children, md) + node.markup;
        else out += node.raw ?? modelEscapeText(md, node.content);
    }
  }
  return out;
}

// The one character an atom occupies in the offset space below: U+FFFC OBJECT
// REPLACEMENT CHARACTER, which is what it is for. An image and a rendered
// equation are the two, and they are atoms for the same reason — what the
// reader sees is not the characters the model holds, so counting those
// characters would put the model's offsets and the DOM's out of step by the
// length of some TeX.
const MODEL_ATOM = "\uFFFC";

/**
 * The text a block's inline tree renders to, and the space its offsets count.
 * Slice 2's step 2, along with the two functions below it.
 *
 * *Selection* in docs/REWRITE.md names a model position as
 * `(blockIndex, offset)`, offset counted in characters of the block's rendered
 * text. This is that text. **Characters means UTF-16 code units**, because a
 * DOM `Range` counts those and mapping to one is the whole purpose — an astral
 * character is two, here and there alike, and the two directions agree.
 *
 * Four rules, each a decision rather than a discovery:
 *
 * - **A code span's content counts and its backticks do not.** The delimiters
 *   are markup; the content is text the caret moves through.
 * - **A mark's delimiters are zero-width.** `**a**` is one character. The marks
 *   are carried by the tree, not by the text.
 * - **A break is one character, and that character is a newline** — both
 *   spellings of a hard break and every soft one. Which spelling it was is on
 *   the node for step 3 to put back; here it is one position the caret can be
 *   on either side of.
 * - **An atom is one character.** An image and an equation each occupy exactly
 *   one, so a caret can sit before or against it and a delete over it is one
 *   character wide. Zero would make those two positions the same offset, and
 *   counting the alt text or the TeX would count characters nobody can see.
 *
 * An unknown leaf counts its own content, which is the safe direction: the text
 * is then at least as long as what it renders, rather than a caret position
 * short of it.
 */
function modelInlineText(nodes) {
  let out = "";
  for (const node of nodes || []) {
    if (node.children) {
      out += modelInlineText(node.children);
      continue;
    }
    if (node.kind === "image" || node.kind === "math") out += MODEL_ATOM;
    else if (node.kind === "softbreak" || node.kind === "hardbreak") out += "\n";
    else out += node.content;
  }
  return out;
}

/**
 * A node and a position inside it, as an offset into the block's text.
 *
 * The inverse of `modelInlineAt`. `within` counts characters into the node's
 * own text — into its whole subtree when it is a mark, so `within: 0` on a
 * `strong` is the position just before the first character it marks — and is
 * clamped to that node's length. Returns null when the node is not in this
 * tree, the way `undoTextOffset` does when a node is not under its root, so a
 * caller with a stale node hears about it rather than being handed a 0.
 */
function modelInlineOffset(nodes, node, within = 0) {
  let total = 0;
  let found = null;

  (function walk(list) {
    for (const current of list || []) {
      if (found !== null) return;
      const length = modelInlineText([current]).length;
      if (current === node) {
        found = total + Math.max(0, Math.min(within, length));
        return;
      }
      if (current.children) walk(current.children);
      if (found !== null) return;
      if (!current.children) total += length;
    }
  })(nodes);

  return found;
}

/**
 * The node an offset falls in, how far into it, and the marks around it.
 *
 * The inverse of `modelInlineOffset`. Returns `{ node, offset, path }`, where
 * `path` is the chain of marks and links the position sits inside, outermost
 * first — which is how the tree answers *what marks does this position carry*,
 * the question stage 2's typing-inheritance rule is asked on every keystroke.
 *
 * **A boundary belongs to the node that ends there**, not to the one that
 * starts: in `**a**b`, offset 1 is the end of the text inside the mark rather
 * than the start of the text after it. That is `undoLocateOffset`'s own
 * `remaining <= length`, kept deliberately — the two have to agree for stage
 * 2 to port the caret behaviour rather than re-decide it — and it is the same
 * left bias as "a new run inherits the marks to its left".
 *
 * Out of range clamps: past the end lands at the end of the last leaf, which is
 * what a restore after the text got shorter needs, and a negative offset lands
 * at the start. An empty tree, or none at all, is `{ node: null, offset: 0 }`
 * with an empty path — an empty block is a real place for a caret to be.
 */
function modelInlineAt(nodes, offset) {
  let remaining = Math.max(0, offset);
  let result = null;
  let last = { node: null, offset: 0, path: [] };

  (function walk(list, path) {
    for (const current of list || []) {
      if (result) return;
      if (current.children) {
        walk(current.children, path.concat(current));
        continue;
      }
      const length = modelInlineText([current]).length;
      last = { node: current, offset: length, path };
      if (remaining <= length) {
        result = { node: current, offset: remaining, path };
        return;
      }
      remaining -= length;
    }
  })(nodes, []);

  return result || last;
}

// What a list item writes before its content: the indent it sits at, its marker,
// and the pad after it — `"- "`, `"*   "`, `"  - "`, `"1.  "` — exactly as the
// author wrote it.
// One level of a blockquote's chain: up to three spaces of indent, the `>`,
// and the one optional space or tab after it that CommonMark does not count as
// content. A chain is this applied once per level of nesting.
const MODEL_QUOTE_MARKER = /^ {0,3}>[ \t]?/;

/**
 * The blockquote chain each line of a block carries, recorded at parse.
 *
 * Slice 3's step 1, and the same rule as `modelItemPrefix` below it: the
 * parser strips the chain off `inline.content`, the bytes still have it, so
 * the model records what was written rather than reconstructing it at emit
 * time. 1b's step 5 left the choice open between recording and
 * strip-and-re-apply for want of anything to measure — this repo held no
 * blockquote at all — and `tests/fixtures/torture.md` settled it for recording,
 * twice over: `inline.content` has the chain stripped exactly as it has a list
 * marker stripped, so the two are one problem; and an item behind a `> ` gets
 * no marker at all until something claims the chain first, which is a thing
 * parse can do and emit cannot.
 *
 * **The unit is a line, not a block**, which is the part the measurement
 * decided rather than the plan. A quoted paragraph in the fixture carries
 * `["> ", ""]` — its second line is a lazy continuation with no `>` on it at
 * all — and another starts at `"  > "`, two columns in. One prefix for the
 * whole block would rewrite both into something the same width and different
 * bytes, which is exactly the mistake 1b's step 5 made for a day with a tab.
 *
 * `depth` is the number of quote containers a block sits inside, so a block
 * records the chain of the quotes it is *in* and never its own: a quote block
 * is a container and re-emits from its children, which each carry the chain
 * including that quote's level. A line that runs out of chain before `depth`
 * levels is a lazy continuation and keeps what it had.
 *
 * Only the literal bytes matter here — whatever this claims as prefix, the rest
 * of the line is the remainder, and prefix plus remainder is the line — so the
 * split is answerable to one thing: that the remainder is what markdown-it
 * called content. The suite checks exactly that, against `inline.content`.
 */
function modelQuotePrefix(line, depth) {
  let prefix = "";
  let rest = line;
  for (let level = 0; level < depth; level += 1) {
    const match = MODEL_QUOTE_MARKER.exec(rest);
    if (!match) break;
    prefix += match[0];
    rest = rest.slice(match[0].length);
  }
  return prefix;
}

const MODEL_ITEM_MARKER = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)/;

/**
 * An item's marker and the indent its continuation lines carry, read off the
 * item's first line at parse time.
 *
 * **Byte-exactness needs neither**: an item's `source` is its lines whole and
 * already includes its own marker, so an untouched item comes back without this
 * (slice 1b's steps 1 to 4). It is here for slice 3's emitter, which has to put
 * both back when the item is edited, and reading them off the source at emit
 * time would be a second place that can disagree with this one — about the pad
 * above all, which is a document's own convention (`sniffMarkdownStyle` reads it
 * for exactly that reason) and not something to regenerate.
 *
 * `contentIndent` is **read off the item's own continuation line** when it has
 * one, and only derived from the marker when it does not. Deriving alone was
 * the rule until 2026-09-13, and it was wrong in exactly one place: the marker
 * with every character but a tab replaced by a space turns `"-\t"` into
 * `" \t"`, while a file that indents with tabs continues under a bare `"\t"`.
 * Both land on column 4, so nothing looks wrong on screen — and they are
 * different bytes, which is the only currency this model deals in. An edited
 * item would have been written back under an indent its author never used.
 *
 * The fix is not a cleverer derivation, it is not deriving: an item that has a
 * continuation line has already stated its indent, and reading a fact beats
 * reconstructing it. That is the same rule the rest of the model runs on —
 * a thing goes back into the file the way it came out of it.
 *
 * **Only a column-equivalent line is believed.** If the continuation sits on a
 * different column from the marker's own content column it is not a plainer
 * spelling of the same indent, it is a different indent — a lazy continuation
 * carrying none at all, or a line the author pushed further in — and the
 * derived value stays, because that is the column the item's content actually
 * starts at. So this can only ever swap one indent for another of the same
 * width, which is the whole of the bug it fixes.
 *
 * Tab stops are four columns, per CommonMark.
 */
function modelIndentColumn(indent) {
  let column = 0;
  for (const character of indent) column = character === "\t" ? column + 4 - (column % 4) : column + 1;
  return column;
}

function modelItemPrefix(firstLine, continuationLine) {
  const match = MODEL_ITEM_MARKER.exec(firstLine);
  if (!match) return null;
  const marker = match[1] + match[2] + match[3];
  const derived = marker.replace(/[^\t]/g, " ");
  const written = continuationLine === undefined ? null : /^[ \t]*/.exec(continuationLine)[0];
  const believable = written !== null && modelIndentColumn(written) === modelIndentColumn(derived);
  return { marker, contentIndent: believable ? written : derived };
}

/**
 * Tile one line range with the spans at one level: the blocks in it, each
 * carrying its exact bytes and the exact bytes that followed it, plus the text
 * before the first of them.
 *
 * The invariant, and the only reason any of this reproduces a file: **`leading`
 * plus every block's `source` and `separator`, in order, is the range's own
 * bytes.** At level 0 over the whole file that is `prefix` plus the document;
 * one level down, over a container's span, it is that container's `source` —
 * which is what lets an edited child be re-emitted while its siblings are
 * handed back untouched (slice 1b's step 3).
 *
 * It is one function for both because a `map` is an absolute line range at
 * every depth: `startOf` and `endOf` read a child's bytes out of the same
 * string the file arrived in, so a container is the same problem with a
 * narrower range and no coordinate translation anywhere.
 */
function modelTileRange(ctx, spans, from, to, quoteDepth = 0) {
  const { markdown, lines, startOf, endOf, md } = ctx;
  const pieces = [];
  let line = from;

  const takeGap = (gapFrom, gapTo) => {
    // Blank lines between blocks are separator, not content. Anything else —
    // a reference definition, a table's delimiter row, a blockquote's bare
    // `>`, a stray line markdown-it swallowed — is a block.
    let first = gapFrom;
    while (first < gapTo && modelIsBlankLine(lines[first])) first += 1;
    if (first >= gapTo) return;
    let last = gapTo - 1;
    while (last > first && modelIsBlankLine(lines[last])) last -= 1;
    pieces.push({ block: modelGapBlock(), start: first, end: last + 1, span: null });
  };

  for (const span of spans) {
    if (span.start > line) takeGap(line, span.start);
    // A container's `map` runs to the blank line after it rather than to its
    // last line of content, so the trailing blanks are handed back to the
    // separator. Without this a list's source carries the blank line that
    // follows it, and re-emitting an edited list would either lose it or
    // double it depending on which side of the seam the emitter thought it was
    // on. CommonMark strips trailing blanks from an indented code block too,
    // so there is no kind here where a blank last line is content.
    let end = span.end;
    while (end > span.start + 1 && modelIsBlankLine(lines[end - 1])) end -= 1;
    pieces.push({ block: modelBlockFromSpan(span, md), start: span.start, end, span });
    line = Math.max(line, span.end);
  }
  if (line < to) takeGap(line, to);

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const blockFrom = startOf(piece.start);
    const blockTo = endOf(piece.end);
    piece.block.source = markdown.slice(blockFrom, blockTo);
    // The last block in the range runs to the range's end, not to the file's:
    // at level 0 those are the same place, and inside a container they are not.
    const nextFrom = i + 1 < pieces.length ? startOf(pieces[i + 1].start) : endOf(to);
    piece.block.separator = markdown.slice(blockTo, nextFrom);

    // Here rather than in `modelBlockFromSpan`, because this is where the bytes
    // are: the span alone does not say what the author wrote in front of the
    // content. A `null` means the line markdown-it called a list item does not
    // start with a marker this recognises, which would be a bug in the pattern
    // — so the fields stay null and slice 3 has nothing to emit from, rather
    // than the model inventing a marker the file never had.
    // The chain each of this block's own lines carries (slice 3's step 1),
    // per line rather than per block because a lazy continuation carries none
    // and a quote can start indented. `quoteDepth` is how many quotes this
    // block is inside, so a quote container records its parents' chain and its
    // children record it including this quote's own level.
    const unquote = (line) => line.slice(modelQuotePrefix(line, quoteDepth).length);
    if (quoteDepth > 0) {
      piece.block.quotePrefixes = [];
      for (let line = piece.start; line < piece.end; line += 1) {
        piece.block.quotePrefixes.push(modelQuotePrefix(lines[line], quoteDepth));
      }
    }

    if (piece.block.kind === "item") {
      // The item's own first non-blank continuation line, which is what states
      // the indent rather than leaving it to be reconstructed from the marker.
      let continuation;
      for (let line = piece.start + 1; line < piece.end; line += 1) {
        if (!modelIsBlankLine(lines[line])) {
          continuation = unquote(lines[line]);
          break;
        }
      }
      // Past the chain, which is what makes an item inside a quote an ordinary
      // item: its marker sits behind a `> `, so the scan found nothing and both
      // fields stayed null until step 1 claimed the chain first.
      const prefix = modelItemPrefix(unquote(lines[piece.start]), continuation);
      if (prefix) {
        piece.block.marker = prefix.marker;
        piece.block.contentIndent = prefix.contentIndent;
      }
    }

    // Then the same thing one level down, over the span this block just took.
    // Recursing on whatever has children rather than on a list of container
    // kinds is deliberate: a paragraph's only child token is its `inline`,
    // which `modelSpansAtLevel` skips, so leaves fall out instead of being
    // enumerated — and a kind list would be a second place to update when a
    // construct gains a level.
    if (piece.span) {
      const inner = modelSpansAtLevel(piece.span.tokens, piece.span.open.level + 1);
      if (inner.length) {
        const tiled = modelTileRange(
          ctx,
          inner,
          piece.start,
          piece.end,
          quoteDepth + (piece.block.kind === "quote" ? 1 : 0),
        );
        piece.block.leading = tiled.leading;
        piece.block.children = tiled.blocks;
        // Upwards as well as downwards, which is what `modelTouch` walks. It
        // makes the model cyclic and so not `JSON.stringify`-able — see that
        // function for why that is the cheaper of the two costs.
        for (const child of tiled.blocks) child.parent = piece.block;
      }
    }
  }

  return {
    // With no blocks in it the whole range is leading text, which is how an
    // empty document, a run of blank lines and an empty list item all come
    // back whole without being special cases.
    leading: pieces.length
      ? markdown.slice(startOf(from), startOf(pieces[0].start))
      : markdown.slice(startOf(from), endOf(to)),
    blocks: pieces.map((piece) => piece.block),
  };
}

/**
 * Parse markdown into the block model.
 *
 * Returns `{ prefix, blocks }`, where every character of the input is in
 * exactly one of `prefix`, a block's `source`, or a block's `separator` — so
 * `modelSerialise` of an unedited model is the input, character for character.
 *
 * A container — a list, a blockquote, a table — also gets `children`, which
 * tile its own `source` the same way its blocks tile the file, recursively, to
 * the item or the table row. That is slice 1b, and it is not a refinement: a
 * whole list as one block means editing one item re-serialises the list, and on
 * this repo's own planning documents that is a third of the file at a time,
 * which is the unmergeable diff D1 exists to prevent. The floor is the row —
 * `td_open` carries no `map`, so a cell is not a sub-block.
 *
 * A child's `source` is its lines, whole, which means it carries its own
 * container's marker: a paragraph inside a bullet starts at `- `, and a
 * paragraph inside a quote starts at `> `. Byte-exactness wants exactly that,
 * since the marker is part of the range no one else claims; what the emitter
 * needs instead is the marker and the content indent as data, which is step 5.
 *
 * Lines no token covers become blocks of kind `"gap"`, at any depth. That is
 * where **reference definitions** live: markdown-it consumes a `[label]: url`
 * line and emits no token at all, which is why today they have no DOM node to
 * survive on and `appendReferenceDefinitions` has to collect them at the end
 * of the file regardless of where the author put them. Here the line simply
 * stays where it is, in its own block, rendered to nothing — and a definition
 * spanning several lines, which `scanReferenceDefinitions` cannot see today,
 * is just a taller gap. Inside a container the same mechanism catches the two
 * lines that belong to a container and to none of its children: a table's
 * delimiter row, and a blockquote's bare `>`.
 */
function modelParse(markdown, md) {
  const offsets = modelLineOffsets(markdown);
  const lines = markdown.split("\n");

  // Where a line starts, and where a block ending before `line` ends — the
  // newline that terminates a block's last line belongs to the separator, not
  // to the block, or every block would carry one and the two could not be told
  // apart when a block is re-emitted.
  const startOf = (line) => (line < offsets.length ? offsets[line] : markdown.length);
  const endOf = (line) => (line < offsets.length ? Math.min(offsets[line] - 1, markdown.length) : markdown.length);

  const tiled = modelTileRange(
    { markdown, lines, startOf, endOf, md },
    modelSpansAtLevel(md.parse(markdown, {}), 0),
    0,
    lines.length,
  );

  return { prefix: tiled.leading, blocks: tiled.blocks };
}

/**
 * One block back to markdown.
 *
 * Three cases, in this order, and the order is the contract:
 *
 * 1. **It still has its `source`** — emit those bytes. An untouched block is
 *    handed back, which is why a file that was opened and saved is the file
 *    that was read.
 * 2. **It is edited and has children** — emit `leading` and then each child,
 *    with the separator that followed it. That is the inverse of the tiling
 *    invariant, so an untouched child is handed back by case 1 on the way
 *    down: **no sibling of an edited block is ever re-serialised**, at any
 *    depth. This is the whole point of slice 1b, and it falls out of the
 *    invariant rather than being arranged on top of it.
 * 3. **It is edited and is a leaf** — `emit` turns it into markdown, which is
 *    stage 1's slice 3. Until that exists an edited leaf with no emitter
 *    throws, rather than quietly writing something else into the user's file.
 *
 * `leading` is in case 2 because the invariant includes it, not because any
 * document produces one: a container's first child starts on the container's
 * own first line, so across this repo's seven markdown files all 420
 * containers have `leading === ""`. A shape that did produce one would lose
 * those bytes if the emitter left it out, and that is not a thing to discover
 * from a diff.
 */
function modelEmitBlock(block, emit) {
  if (block.source !== null) return block.source;
  if (block.children) {
    return block.leading + block.children.map((child) => modelEmitBlock(child, emit) + child.separator).join("");
  }
  if (typeof emit !== "function") {
    throw new Error(`edited ${block.kind} block with no serialiser`);
  }
  return emit(block);
}

/**
 * The model back to markdown.
 *
 * The prefix, then every block and the separator that followed it. Everything
 * interesting is one level down in `modelEmitBlock`; what is here is that a
 * document is its blocks in order, and nothing else.
 */
function modelSerialise(doc, emit) {
  let out = doc.prefix;
  for (const block of doc.blocks) {
    out += modelEmitBlock(block, emit) + block.separator;
  }
  return out;
}

/**
 * Mark a block edited — it, and every container above it.
 *
 * One function rather than an assignment at each call site, because "source goes
 * to null" is the entire contract between the model and D1: every path that
 * changes a block's content has to pass through here, and one that forgets
 * leaves the old bytes on disk under new content.
 *
 * **The walk up is the same rule one level out** (slice 1b's step 4). A
 * container still holding its own `source` is emitted from those bytes by
 * `modelEmitBlock`'s first case, which never looks at its children — so an
 * edited item under an untouched list re-emits into nothing and the edit is
 * silently lost, with the document looking right on screen and the old bullet in
 * the file. Clearing the ancestors is what makes the recursion in step 3 reach
 * the block that changed.
 *
 * It walks the whole chain rather than stopping at the first ancestor already
 * cleared. Depth is five on this repo's deepest document, and a stop condition
 * is a second rule about when an ancestor may keep its bytes — there is no such
 * case, and inviting one costs the file.
 *
 * **The cost is a cyclic model**: `parent` points back up, so the model is not
 * `JSON.stringify`-able any more. Named rather than hidden, and the cheaper of
 * the two — nothing has ever needed to serialise the model as JSON, and the
 * alternative is searching the tree for a block's parent on every keystroke.
 */
function modelTouch(block) {
  for (let node = block; node; node = node.parent) {
    node.source = null;
  }
  return block;
}
