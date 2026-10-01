// The document model. TODO 3.1 — docs/REWRITE.md is the design. Stage 1 built
// it; stage 2's slice 1 gave it a renderer and put it in all three registries
// (index.html, sw.js's SHELL_ASSETS, html-export.js's ASSETS), because for the
// editor to draw from the model the app has to load the model.
//
// **It draws nothing by default.** modelCoreEnabled() at the bottom of this
// file is off until the stage 4 merge, so the running editor is still the one
// CLAUDE.md describes and this is still the thing that will own the document
// once contenteditable stops owning it — an ordered list of blocks, each
// holding the exact bytes it arrived with and the exact bytes that followed it.
// What the flag buys is an A/B of the same document by hand, which is the only
// way a rendering divergence gets seen rather than inferred.
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

// There is no export statement: front/ has no modules, and this is a plain
// <script> like every other. It must load **after markdown-style.js**, which is
// a real dependency rather than tidiness: slice 3's step 5 calls
// wrapMarkdownLine and hasMathSpan rather than carrying a second copy of
// either. Every name below is a global, prefixed
// `model` for the reason `saveFileAs` is not `saveAs` — see CLAUDE.md's
// load-order section on collisions in the shared scope.
//
// Everything down to the rendering section is a pure function over a string and
// markdown-it's tokens, which is what lets the model suite drive it with no DOM
// anywhere; the rendering section at the bottom is the half that needs one, and
// says so.
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
      spans.push({ open: token, tokens: tokens.slice(i, j + 1), before: tokens[i - 1] || null, start: token.map[0], end: token.map[1] });
      i = j + 1;
      continue;
    }
    if (token.nesting === 0) {
      spans.push({ open: token, tokens: [token], before: tokens[i - 1] || null, start: token.map[0], end: token.map[1] });
      i += 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

const modelIsBlankLine = (line) => line.trim() === "";

/**
 * Every field a block has, in one place.
 *
 * Three things build blocks — the tiler, the gap, and (since slice 4) the
 * editor itself — and a field one of them forgot is a field that reads
 * `undefined` where the emitter expects a `null`. The list lives here so there
 * is one of it, and so the comments describing what each field means sit beside
 * the field rather than in whichever copy happened to be written first.
 */
function modelBlockShape(id, kind) {
  return {
    id,                  // minted, never reused: see modelParse
    kind,
    level: 0,            // a heading only: 1 to 6
    inline: null,        // the parser's inline token, for a leaf that has one
    tokens: [],          // the parser's own tokens, which the renderer walks
    hiddenBefore: null,  // see modelRenderBlock
    inlines: null,       // the inline tree, folded out of `inline` by modelInlines
    source: null,        // the block's exact bytes, or null once it is edited
    separator: "",       // the bytes between this block and the next
    children: null,      // a container's sub-blocks, tiling its own source
    leading: "",         // the container's bytes before its first child
    parent: null,        // set by the tiler; what makes modelTouch able to walk up
    marker: null,        // an item only: see modelItemPrefix
    contentIndent: null,
    quotePrefixes: null,  // inside a quote only: see modelQuotePrefix
    headingShape: null,   // a heading only: see modelHeadingShape
    leadingAffix: null,   // everything markdown-it took off the first line: see below
    // Whether an undo state also points at this block's contents — its inline
    // tree and its tokens. Set by modelForkDocument, cleared by modelUnshare,
    // and the whole of slice 6's step 7. See the History section.
    shared: false,
  };
}

// A block, before its source, separator and children are attached. `inline` is
// the token a paragraph or heading carries its content in — the editable
// structure once stage 2 converts it. Every other kind keeps its token slice
// and is edited as a whole for now.
function modelBlockFromSpan(span, md, id) {
  const kind = MODEL_BLOCK_KINDS[span.open.type] || "unknown";
  const inline = span.tokens.find((t) => t.type === "inline") || null;
  const block = modelBlockShape(id, kind);
  block.level = kind === "heading" ? Number(span.open.tag.slice(1)) : 0;
  block.inline = kind === "paragraph" || kind === "heading" ? inline : null;
  block.tokens = span.tokens;
  // The token immediately before this block's own in the parser's stream, but
  // only when it is a hidden one — which markdown-it's renderer looks back at,
  // and which a block rendered from its own slice cannot see. See the rendering
  // section at the bottom of this file.
  block.hiddenBefore = span.before && span.before.hidden ? span.before : null;
  // Eagerly rather than on first edit: the fold is a walk over tokens the
  // parser has already produced — 980 blocks and ~11,000 tokens across the
  // files the suite drives — and a field that is filled at exactly one moment
  // cannot be half-filled when the emitter reads it.
  block.inlines = modelInlines(block, md);
  return block;
}

// A line no token claimed. Same shape as any other block, with nothing to parse
// and nothing to render — see `modelParse` for what lives here and why.
function modelGapBlock(id) {
  return modelBlockShape(id, "gap");
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
      // Kept, not discarded, since slice 3: rendering an edited block means
      // handing markdown-it's renderer a token list built back out of this
      // tree, and a mark needs the close the parser wrote rather than one this
      // file invented. It carries nothing an open did not, which is why it was
      // dropped before there was anything to hand it to.
      if (open) { open.closeToken = token; pos = modelCloseInline(open, content, pos, md); }
      if (stack.length > 1) { stack.pop(); opens.pop(); }
      continue;
    }

    const node = {
      kind: MODEL_INLINE_KINDS[token.type] || "unknown",
      markup: token.markup,
      content: token.content,
      token,
      closeToken: null,   // a mark only, filled when its close arrives
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
 * **Whether that label still resolves is slice 3's step 4**, and `defines` is
 * how the answer gets here: step 5 declined the question because a single
 * node's `token` cannot answer one about the whole document, and named
 * whichever block-level emitter eventually called this as the owner.
 * `modelEmitLeaf` is that emitter. A label the document no longer defines
 * falls through to the inline form instead of writing a reference that renders
 * as literal text — the href on the token being the last thing the label
 * resolved to, which is the best answer available and strictly better than a
 * dangling one.
 *
 * With no resolver it answers yes, which is step 5's behaviour unchanged: a
 * caller emitting one block in isolation has handed over no document and so
 * cannot be told the label is gone, and inventing an inline link out of a
 * possibly stale href on that basis would be worse than leaving the spelling
 * the stamp asked for.
 */
function modelRebuildTail(token, destAttr, defines = () => true) {
  const label = token.attrGet("data-ref-label");
  if (label !== null && defines(label)) return "[" + label + "]";
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
function modelInlineSource(nodes, md, defines) {
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
          (node.tail ?? modelRebuildTail(node.token, "src", defines));
        break;
      case "link":
        if (node.markup === "autolink") out += "<" + modelInlineSource(node.children, md, defines) + ">";
        else {
          out += "[" + modelInlineSource(node.children, md, defines) + "]" +
            (node.tail ?? modelRebuildTail(node.token, "href", defines));
        }
        break;
      default:
        if (node.children) out += node.markup + modelInlineSource(node.children, md, defines) + node.markup;
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

// What counts as one character rather than as its own content. Named rather
// than spelled out at each test because slice 2's DOM walk has to agree with
// this exactly — the two directions disagreeing by the length of some TeX is
// the failure that list exists to prevent — and the render verify below needs
// the same answer.
const MODEL_ATOM_KINDS = new Set(["image", "math"]);

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
    if (MODEL_ATOM_KINDS.has(node.kind)) out += MODEL_ATOM;
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

// An ATX heading's opening run: up to three spaces of indent, one to six
// hashes, and the whitespace that separates them from the content.
const MODEL_ATX_OPEN = /^[ \t]{0,3}#{1,6}[ \t]*/;

/**
 * Which of markdown's three heading spellings wrote this heading, recorded at
 * parse. Slice 3's step 2.
 *
 * A heading's `level` has been on the block since slice 1 and says nothing
 * about how it was written: `# Title`, `# Title #` and `Title` over `=====`
 * are all level 1, and `======` and `===` are the same heading in different
 * bytes. So this is recorded rather than derived, for the reason everything in
 * this model is — the file said it, and reconstructing it at emit time would
 * be a second place free to disagree.
 *
 * It is the one affix in the model that is a **suffix**. Every other thing
 * markdown-it strips is in front of the content — a list marker, a quote's
 * chain, an indent — and a closing hash run and a setext underline are both
 * behind it, which is why the ten blocks in the oracle whose source is *not* a
 * per-line prefix plus their inline source are all headings.
 *
 * `markup` is the parser's own statement of which spelling it read — a hash run
 * for ATX, `-` or `=` for setext — so the branch is taken on what markdown-it
 * recorded rather than on a guess about line counts.
 *
 * Returns `{ open, close, underline }`: what precedes the content, what follows
 * it, and the setext underline as written, `null` for ATX. **Verified against
 * `inline.content` rather than trusted**, and `null` when it does not line up,
 * the same safe direction `modelItemPrefix` takes — step 3 then has nothing to
 * emit from rather than the model inventing a spelling the file never had. The
 * case that reaches it is an indented multi-line setext body, which no file
 * here has; a single-line one is handled, and an indented ATX is what `open`
 * already carries.
 */
function modelHeadingShape(lines, content, markup) {
  if (markup === "=" || markup === "-") {
    const body = lines.slice(0, -1).join("\n");
    const open = /^[ \t]*/.exec(body)[0];
    if (body.slice(open.length) !== content) return null;
    return { open, close: "", underline: lines[lines.length - 1] };
  }
  if (lines.length !== 1) return null;
  const match = MODEL_ATX_OPEN.exec(lines[0]);
  if (!match) return null;
  const rest = lines[0].slice(match[0].length);
  if (!rest.startsWith(content)) return null;
  // Whatever is left after the content is the closing run and the whitespace
  // around it, taken whole: `### x ###` and `### x #` differ only in bytes the
  // renderer throws away, which is exactly the kind of difference this records.
  return { open: match[0], close: rest.slice(content.length), underline: null };
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
    pieces.push({ block: modelGapBlock(ctx.mint()), start: first, end: last + 1, span: null });
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
    pieces.push({ block: modelBlockFromSpan(span, md, ctx.mint()), start: span.start, end, span });
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

    // Everything markdown-it took off the front of the first line, taken whole
    // rather than named: the item marker if there is one, the continuation
    // indent if this block is not the one opening its item, and **a paragraph's
    // own leading indent**, which is the piece none of the recorded affixes
    // carried and which slice 3's step 3 therefore dropped. A paragraph indented
    // one to three spaces is still a paragraph, and `inline.content` has that
    // indent stripped exactly as it has a marker stripped — the oracle happens
    // to hold no such paragraph, which is why 861 of 861 passed with it missing.
    //
    // Whole rather than named because the pieces are already named: the emitter
    // subtracts the item prefix it is putting back and keeps the remainder, so
    // there is one subtraction in one place rather than a second derivation
    // here. Verified against `inline.content` rather than trusted, the same way
    // `modelHeadingShape` is — a first line that does not end with its own
    // content's first line is a shape this does not understand, and a null
    // leaves the emitter with nothing to work from rather than a guess.
    //
    // Not for a heading: `modelHeadingShape`'s `open` already runs from the
    // chain-stripped column 0 and so carries the indent with it.
    if (piece.block.inline && piece.block.kind !== "heading") {
      const first = unquote(lines[piece.start]);
      const content = piece.block.inline.content.split("\n")[0];
      if (first.endsWith(content)) {
        piece.block.leadingAffix = first.slice(0, first.length - content.length);
      }
    }

    // The same thing for a heading, and the only affix in the model that is a
    // suffix: a closing hash run and a setext underline both sit behind the
    // content. Read off the chain-stripped lines, since a heading inside a
    // quote has both markers in front of it and step 1 has claimed the outer.
    if (piece.block.kind === "heading" && piece.block.inline) {
      const stripped = [];
      for (let line = piece.start; line < piece.end; line += 1) stripped.push(unquote(lines[line]));
      piece.block.headingShape = modelHeadingShape(
        stripped,
        piece.block.inline.content,
        piece.block.tokens[0].markup,
      );
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

  // Identity is a minted id, never an index path. A path goes stale on every
  // splice and stage 2 splices constantly, so inserting a block would mean
  // re-stamping every element after it. Ids are never reused, for modelTouch's
  // reason one level along: a recycled id inherits whatever of the previous
  // block's state the DOM had not finished forgetting.
  let nextId = 1;
  const tiled = modelTileRange(
    { markdown, lines, startOf, endOf, md, mint: () => nextId++ },
    modelSpansAtLevel(md.parse(markdown, {}), 0),
    0,
    lines.length,
  );

  return { prefix: tiled.leading, blocks: tiled.blocks, nextId };
}

// The next free id on a document, for a block the editor creates rather than
// the parser. One function rather than `doc.nextId++` at each call site, for
// the reason modelTouch is one function: the counter only works if nothing
// ever hands out an id twice.
function modelMintId(doc) {
  return doc.nextId++;
}

/**
 * The reference labels the document defines **as it now stands**, normalised
 * the way markdown-it normalises them. Slice 3's step 4.
 *
 * The model can answer this where `main` cannot, and that is the whole reason
 * the step exists. On the running editor a definition has no DOM node to
 * survive on, so `scanReferenceDefinitions` reads the markdown the document
 * *arrived* with and `appendReferenceDefinitions` collects every definition at
 * the end of the file; here a definition is an ordinary block in its own
 * position (slice 1), so the document is a list that can be searched and one
 * that is still there stays where the author put it.
 *
 * **Where a definition can be, measured rather than assumed**: in a leaf with
 * no inline tree, and nowhere else. markdown-it consumes a definition line and
 * emits no token, so nothing at any depth claims those bytes as content — they
 * end up in a `gap` block, or in a container that turned out to have no
 * children at all and so is a leaf itself. That second case is real and is why
 * this is not simply a scan of the gaps: `> [b]: u` parses to a **quote** whose
 * only content is the definition, so it has no child tokens and never becomes
 * a gap. Scanning gaps alone misses it, and misses `> > [h]: deep` with it.
 *
 * It is the same set step 3 refuses to emit, which is not a coincidence: a leaf
 * with no inline tree is one whose content *is* source, and a definition is
 * content no inline tree ever held.
 *
 * **The parser answers, rather than a regex here.** Each candidate's bytes go
 * back through `md.parse`, whose `env.references` is markdown-it's own record
 * of what it just defined — the same reuse `modelFirstConstruct` and the link
 * tail parsing already argue for, and it costs nothing to keep: label
 * normalisation, the destination and title grammar, and a definition wrapped
 * onto a second line all come for free. That last one is the accepted loss this
 * retires — `scanReferenceDefinitions`'s single-line regex cannot see a wrapped
 * definition at all, and `tests/fixtures/torture.md` carries one for exactly
 * that reason.
 *
 * Measured against the parser's answer for the whole file, on all six oracle
 * files and on hand-written cases either side of the line: a definition inside
 * a list item, one in a quote and one two quotes deep, two in one block, one
 * wrapped, and the four places a definition-shaped line is **not** one — inside
 * a fence, inside indented code, inside a table cell, and lazily continuing a
 * paragraph. Parsing a leaf's bytes on their own gets every one of them right,
 * because the bytes carry their own indent and their own chain.
 */
function modelReferenceLabels(doc, md) {
  const labels = new Set();
  const visit = (block) => {
    if (block.children) {
      block.children.forEach(visit);
      return;
    }
    if (block.inlines) return;
    const env = {};
    md.parse(block.source, env);
    for (const label of Object.keys(env.references || {})) labels.add(label);
  };
  doc.blocks.forEach(visit);
  return labels;
}

/**
 * The item affix a leaf's lines carry: the marker its first line opens with and
 * the indent the rest sit under, taken off the **nearest** item ancestor.
 *
 * Nearest, and not a stack of every item above it, because a child's `source`
 * is its lines **whole** (slice 1b's step 2): the marker `modelItemPrefix` read
 * off `    *   **1.1.6**` already carries the four columns the item outside it
 * contributed. The affixes in this model are absolute, from the line's own
 * column 0, and stacking them would indent a nested item by the sum of the
 * indents it already had. Measured: doing it that way reproduces 707 of the
 * oracle's 861 inline-bearing leaves, and every one of the 154 it misses is a
 * bullet nested inside another.
 *
 * `first` is whether this block opens the item's content, which is what decides
 * marker-or-indent for line 0. It reads `leading === ""` as well as first-child,
 * because a container's leading bytes are emitted by `modelEmitBlock`'s case 2
 * before any child is reached — every one of the oracle's containers has none,
 * and a shape that grew one would otherwise have its marker written twice.
 *
 * **A quote between the two suppresses it entirely**, which is the one rule here
 * that is not arithmetic. `modelQuotePrefix` matches ` {0,3}>` from the raw
 * line's column 0, so for `  > quoted` inside a bullet it claims `"  > "` — the
 * item's own indent included. Adding the indent again on top of that writes
 * `  >   quoted`, the same column count and different bytes, which is the exact
 * failure 1b's step 5 had for a day with a tab. The reverse nesting is not
 * affected and must not be: in `> - item` the item sits at the quote's own
 * depth, `modelItemPrefix` read its marker off the chain-stripped line, and both
 * affixes are needed.
 */
function modelItemAffix(block) {
  let node = block;
  for (let parent = block.parent; parent; node = parent, parent = parent.parent) {
    if (parent.kind === "quote") return null;
    if (parent.kind !== "item") continue;
    return {
      first: parent.leading === "" && parent.children !== null && parent.children[0] === node,
      marker: parent.marker,
      contentIndent: parent.contentIndent,
    };
  }
  return null;
}

/**
 * One edited leaf back to markdown. Slice 3's step 3, and what
 * `modelEmitBlock`'s `emit` argument has been standing in for since slice 1b's
 * step 3 gave it somewhere to be called from.
 *
 * **This is an affix problem rather than a serialisation problem**, which is
 * what the measurement behind slice 3 found and what makes the step small.
 * Slice 2's `modelInlineSource` already reconstructs `inline.content` byte for
 * byte; a block's `source` is that content with something glued to the front of
 * each of its lines — 851 of the oracle's 861 inline-bearing leaves exactly, the
 * other ten being the headings whose spelling is a **suffix**. So the job here
 * is not *turn a tree into markdown*, which is done, but **put back what
 * markdown-it stripped off `inline.content` on the way in** — the same sentence
 * 1b's step 5 and slice 2's step 3 are each an instance of, arriving a third
 * time one level up.
 *
 * The affixes go back **in the order markdown-it took them off**, measured
 * rather than assumed: the quote chain sits outside the item marker, because
 * `> 1. A list inside a quote.` has the content `A list inside a quote.` and
 * both were stripped to get there. So, per line: the chain, then the marker or
 * the continuation indent, then the content. A line an edit added past the end
 * of the recorded chain takes the last one recorded, which is step 1's own rule.
 *
 * A heading is the exception at both ends. Its `open` was recorded off the
 * chain-stripped line from *that* line's column 0, so it already carries any
 * indent an enclosing item contributed — step 2 pinned exactly this, that the
 * shape plus the chain reassembles the heading's own source — and the item
 * affix is therefore suppressed rather than added on top. Its `close` and its
 * setext `underline` are the only bytes in this model that go *behind* the
 * content.
 *
 * **The document is the third argument, and it is the one piece of new
 * plumbing slice 3 has** (its step 4). Slice 2's step 5 rebuilds `[text][label]`
 * from the `data-ref-label` stamp and explicitly declines to ask whether the
 * label still resolves, because a single node's token cannot answer a question
 * about the whole document; this is the emitter it named as the owner. Handed a
 * document, a label it no longer defines falls back to the inline form rather
 * than writing a reference that renders as literal text. Handed none — emitting
 * one block in isolation — it answers as step 5 did and keeps the stamp's
 * spelling. `modelReferenceLabels` above is where the searching happens, and
 * why the model can do this at all where the running editor cannot.
 *
 * **Three refusals, and every one of them is a spelling the model does not
 * have rather than one it could guess at.** A leaf with no inline tree is a
 * fence, an indented code block, a rule, a gap or a table row: their content
 * *is* source, so a command edits `source` rather than nulling it and this is
 * never reached — five of the seven leaf kinds, right rather than missing. A
 * heading whose shape did not line up against `inline.content` recorded `null`
 * instead of a guess (step 2), and an item whose first line did not start with
 * a marker this model recognises recorded `null` too (1b's step 5). In each
 * case the throw is the same one `modelEmitBlock` already makes for a leaf with
 * no serialiser at all, and for the same reason: writing something else into
 * the user's file is the one outcome here worth crashing to avoid.
 */
function modelEmitLeaf(block, md, doc, width = 0) {
  if (!block.inlines) {
    throw new Error(`edited ${block.kind} block has no inline tree`);
  }

  // Scanned at most once per emitted block, and not at all unless a link in it
  // actually needs rebuilding — which is the overwhelmingly common case, since
  // step 3 records every parsed link's tail as written and only a command that
  // built or changed one leaves none. Not cached across blocks on purpose: the
  // answer is about the document as it now stands, and an edit to a definition
  // is exactly the thing a cache would go stale on.
  let labels = null;
  const defines = (label) => {
    if (!doc) return true;
    if (labels === null) labels = modelReferenceLabels(doc, md);
    return labels.has(md.utils.normalizeReference(label));
  };

  let content = modelInlineSource(block.inlines, md, defines);
  let item = modelItemAffix(block);

  if (block.kind === "heading") {
    if (!block.headingShape) throw new Error("edited heading with no recorded shape");
    const { open, close, underline } = block.headingShape;
    // **The one place a recorded spelling is not enough on its own.** An ATX
    // heading's `open` is the hashes plus whatever followed them, and an *empty*
    // heading is written `#` with nothing after it — so re-emitting it with
    // content gives `#Title`, which CommonMark reads as a paragraph, not a
    // heading. Found by the suite on 2026-09-20, and it is a silent one: the
    // document looks right on screen and the file has stopped holding a
    // heading. So the separator is supplied when content needs one and the
    // recorded bytes do not have it, and taken back off when the content goes
    // away again, which is the same rule read in both directions. Never for a
    // setext heading, whose `open` is an indent and whose marker is underneath.
    const atx = underline === null && /#$/.test(open);
    const opened = atx && content ? open + " " : open;
    const closed = atx && !content ? close.replace(/^[ \t]+/, "") : close;
    content = underline === null
      ? (content ? opened + content + closed : (opened + closed).replace(/[ \t]+$/, ""))
      : open + content + "\n" + underline;
    item = null;
  }

  if (item && item.marker === null) {
    throw new Error("edited block inside an item with no recorded marker");
  }

  // What the item puts back on the first line, and what every line after it
  // carries instead.
  const opener = item ? (item.first ? item.marker : item.contentIndent) : "";
  const indent = item ? item.contentIndent : "";

  // A paragraph's own leading indent is whatever markdown-it took off the first
  // line beyond that — see `leadingAffix` in the tiler. One subtraction, here,
  // rather than a second thing recorded at parse: the pieces the model names
  // are named, and this is the rest. A heading never asks, because its `open`
  // carries the indent already.
  let extra = "";
  if (block.kind !== "heading") {
    if (block.leadingAffix === null || !block.leadingAffix.startsWith(opener)) {
      throw new Error(`edited ${block.kind} block whose first line does not start with its own affix`);
    }
    extra = block.leadingAffix.slice(opener.length);
  }

  const chain = block.quotePrefixes;
  const last = chain && chain.length ? chain[chain.length - 1] : "";
  const lines = content.split("\n");
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const quote = chain ? chain[i] ?? last : "";
    const first = quote + (i === 0 ? opener + extra : indent);
    // **An affix with nothing behind it loses its trailing whitespace**, which
    // is the heading rule two paragraphs up read one level out: a spelling is
    // put back when content needs it and taken off when the content goes. An
    // empty item is `-` and not `- `, an empty quoted line is `>` and not
    // `> `, and a continuation indent on an empty line is nothing at all —
    // because the alternative is writing trailing whitespace into the user's
    // file, which is the one thing every rule in markdown-style.js agrees on.
    const composed = lines[i] === "" ? first.replace(/[ \t]+$/, "") : first + lines[i];

    // Slice 3's step 5, and everything it does not do is the point. **A
    // heading is never re-wrapped**, because a wrap turns its tail into a
    // paragraph — `reflowMarkdown` refuses one by looking for a `#`, which
    // misses a setext heading entirely, and the model simply knows. **A line
    // holding maths is never re-wrapped**, the one guard the model cannot
    // replace with structure, since an equation is inline and can be anywhere
    // in a paragraph. And a line already inside the width is left exactly as it
    // is: `inline.content` keeps the author's own breaks, so only a line the
    // edit made too long is touched. That is the whole of "only where the
    // content moved" — the block that moved is the only one re-emitted at all,
    // and inside it only the lines that outgrew the width.
    if (!width || block.kind === "heading" || composed.length <= width || hasMathSpan(composed)) {
      out.push(composed);
      continue;
    }
    // The prefixes are handed over rather than left to be read back off the
    // line. That is this step's change to `markdown-style.js`, and the reason
    // is the tab: `wrapMarkdownPrefixes` computes a continuation indent of
    // spaces, which for the marker `"-\t"` is the same column and different
    // bytes from the file's own bare tab. Measured at 1 item in 343 across the
    // oracle — the same bug 1b's step 5 fixed at parse, sitting unfixed one
    // layer along, and invisible until something read a file's own bytes.
    out.push(...wrapMarkdownLine(composed, width, { first, continuation: quote + indent }));
  }

  // **The last line never goes into the file carrying trailing whitespace.**
  // The model holds it and should — delete a word with Option+Backspace and the
  // space before it is still there, which is what the engine's target range
  // said and what every editor does — but markdown strips it on the next parse,
  // so writing it out puts bytes in the file that mean nothing and show up in
  // a diff. The *last* line only: a hard break's spelling is two trailing
  // spaces, and it never sits on the last line, since a block ending in one
  // leaves an empty line behind it.
  if (out.length) out[out.length - 1] = out[out.length - 1].replace(/[ \t]+$/, "");

  return out.join("\n");
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
 *    `modelEmitLeaf` above. It stays an argument rather than a call: a caller
 *    has to hand over the parser anyway (the escaper reparses), and a
 *    serialiser that reached for its own would be the module-fetches-its-own-
 *    parser mistake the top of this file rules out. A caller that passes none
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
  if (block.children) return modelJoinBlocks(block.children, emit, block.leading);
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
  return modelJoinBlocks(doc.blocks, emit, doc.prefix);
}

/**
 * A run of blocks and the separators between them, which is both what a
 * document is and what a container is — the tiling invariant read backwards, in
 * the one place that does the reading.
 *
 * **A block that emits nothing takes the separator before it with it**, and
 * that is slice 4's, because slice 4 is what first produces one. Markdown has
 * no empty paragraph: the user presses Enter at the end of a line, the model
 * holds a block for the caret to be in, and the file has nothing to say about
 * it. Emitting its separator anyway would put a blank line into the document
 * for every Enter that has not been typed into yet — diff noise in a file
 * nobody edited, which is the thing this whole layer exists to prevent.
 *
 * Handing *its* separator on rather than keeping the one before it is what
 * makes an Enter at the end of a document cost nothing at all: the bytes that
 * followed the block it split are the bytes that still follow it. An empty
 * block at the very start keeps no separator, since there is nothing in front
 * of it for one to sit between.
 *
 * Nothing the parser produces emits empty — every block spans at least one
 * non-blank line — so this is exactly as it was for a document that was opened
 * and saved.
 */
function modelJoinBlocks(blocks, emit, leading) {
  let out = leading;
  let separator = "";
  let started = leading !== "";
  for (const block of blocks) {
    const bytes = modelEmitBlock(block, emit);
    if (bytes === "") {
      if (started) separator = block.separator;
      continue;
    }
    out += separator + bytes;
    separator = block.separator;
    started = true;
  }
  return out + separator;
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
  // Slice 6's step 7's barrier, on the door that already exists: this function
  // is where every content change is supposed to pass, so putting it here makes
  // the rule ride on D1's contract rather than on a list of functions somebody
  // had to go and find.
  //
  // **It is the only one of the seven the suite does not need**, because the six
  // sites that write to a block's contents *before* calling this each carry
  // their own — removing any of those six fails the sweep, and removing this
  // one fails nothing. It stays for the path nobody has written yet, the one
  // that touches before it writes and so is covered by the rule rather than by
  // a list. The better fix is to make those six touch first and leave this the
  // only barrier; that reorders six edit paths that were hand-verified in three
  // engines, so it is a separate change with its own argument.
  modelUnshare(block);
  for (let node = block; node; node = node.parent) {
    node.source = null;
  }
  return block;
}

// ── Rendering ────────────────────────────────────────────────────────────────
//
// Stage 2's slice 1. Two halves, and the line between them is the line between
// what a suite can check and what only a browser can.
//
// The first half is a **string**: a block's HTML, out of markdown-it's own
// renderer over the block's own tokens. That half needs no DOM at all, which is
// not luck — markdown-it's renderer produces a string, so "every block rendered
// and concatenated is `md.render(file)`" is string equality over the oracle,
// the same move stage 1's slice 1 made when byte-identical fell out of a
// concatenation.
//
// The second half builds the DOM from those strings and stamps each block's id
// on the element it produced. **Nothing in that half can be checked by the Deno
// suite**: tests/dom.mjs has no HTML parser, so a stub could only agree with
// whatever it was told. front/render-scratch.html is the harness, untracked and
// temporary by design — see docs/REWRITE.md's slice 1, which says why that is a
// harness rather than a check page.
//
// **Never a hand-written HTML emitter.** Everything below goes through
// `md.renderer`, for two reasons and the second is the load-bearing one: the
// output is then identical to what `markdownToHtml` produces today, which is
// what keeps outline.js's observer, `headingAnchors`, the format bar's
// geometry, the static export's clone and renderers.js reading a DOM that still
// looks the same — and a second renderer would be a second thing free to
// disagree with the parser, which is the mistake `modelInlines` already refuses
// to make by keeping the token on the node.

// The attribute carrying a block's id. `data-`, never `id`: ids are what
// headingAnchors stamps on the static export's clone, and the two must not
// collide.
const MODEL_BLOCK_ATTR = "data-block";

// The mark on a <br> the parser never produced. On the <br> rather than on the
// block, which is the plan's own spelling corrected: <p>foo<br><br></p> is an
// ordinary shape — type, Shift+Enter, and the model holds four characters while
// the DOM holds one break and one filler for the caret to sit on — so the
// parent cannot say which of the two it means. Slice 2's isFillerBreak(node)
// reads this, and a walk that counted both would report every edit after it in
// that block one character out.
const MODEL_FILLER_ATTR = "data-filler";

/**
 * One token, rendered.
 *
 * This is the body of markdown-it's own `Renderer.prototype.render` loop for a
 * single index, and that duplication is deliberate and bounded: what is copied
 * is the **dispatch** — inline children, a registered rule, or the generic
 * `renderToken` — and never any decision about what HTML to produce. Rendering
 * one token at a time is what a block needs, and markdown-it offers no entry
 * point for it.
 *
 * `tokens` is the array the token sits in, not a bare token, because two of
 * markdown-it's rules look at its neighbours: `renderToken` reads the next one
 * to decide whether to break the line after an opening tag, and the previous
 * one to decide whether to open on a new line at all. Hand it a one-token array
 * and both answers change.
 */
function modelRenderToken(md, tokens, idx, env) {
  const token = tokens[idx];
  if (token.type === "inline") return md.renderer.renderInline(token.children, md.options, env);
  const rule = md.renderer.rules[token.type];
  if (rule) return rule(tokens, idx, md.options, env, md.renderer);
  return md.renderer.renderToken(tokens, idx, md.options, env);
}

/**
 * A block's HTML.
 *
 * Three cases, the same three `modelEmitBlock` has one layer down, and for the
 * same reason: a container is its own open and close with its children between,
 * so **a touched child re-renders alone** and its siblings are never re-built.
 * A `gap` renders to nothing and keeps its place in the model while occupying
 * none in the DOM — which is why the block-to-element correspondence cannot be
 * a positional index into `#editor.children`.
 *
 * **`hiddenBefore` is prepended, and it is the one thing this needs that a
 * block's own tokens do not carry.** markdown-it opens a block-level tag on a
 * new line when the token before it is a hidden one — the tight list item
 * `<li>Walk the transect.\n<ol>` — and a slice starting at its own open token
 * cannot see that. Prepending costs nothing, because a hidden token renders to
 * the empty string by markdown-it's own rule: it supplies the context and emits
 * no output, so no rule of markdown-it's is re-derived here. Without it,
 * tests/fixtures/torture.md is the one oracle file whose blocks do not
 * concatenate to `md.render` of itself.
 *
 * No filler is emitted here, and that is what keeps the check exact rather than
 * approximate: `md.render("#\n")` is `<h1></h1>`, so an empty block is
 * parseable and not only editable, and a renderer that filled one in would
 * diverge from `md.render(file)` on any file holding a bare `#`. The filler is
 * the DOM builder's, below, where its only consumer is.
 */
function modelRenderBlock(block, md, env = {}) {
  if (block.kind === "gap") return "";
  const tokens = block.hiddenBefore ? [block.hiddenBefore, ...block.tokens] : block.tokens;
  const first = block.hiddenBefore ? 1 : 0;

  if (block.children) {
    return modelRenderToken(md, tokens, first, env)
      + block.children.map((child) => modelRenderBlock(child, md, env)).join("")
      + modelRenderToken(md, block.tokens, block.tokens.length - 1, env);
  }

  let out = "";
  for (let i = first; i < tokens.length; i++) out += modelRenderToken(md, tokens, i, env);
  return out;
}

/**
 * The whole document's HTML — the blocks in order, and nothing else.
 *
 * Not `prefix` and not the separators: those are source bytes between blocks,
 * and markdown-it renders neither. This is the function the suite compares
 * against `md.render(file)`, and the comparison is exact.
 */
function modelRenderDocument(doc, md, env = {}) {
  return doc.blocks.map((block) => modelRenderBlock(block, md, env)).join("");
}

// ── Rendering: the DOM half ──────────────────────────────────────────────────

/**
 * Whether a block wants a filler <br>, decided from the model rather than by
 * sniffing the HTML back.
 *
 * Two cases, and both are what a `contenteditable` does with a block holding no
 * text: it has no height, takes no caret, and is not there at all — which is
 * why BLANK_DOCUMENT has always been `<p><br></p>`. An empty block is the first
 * case; a block ending in a hard break is the second, since the line after the
 * break is as empty as an empty block is.
 *
 * Only a block with an inline tree can want one. A fence, a rule, a table row
 * and a gap have none, and their content is source rather than text.
 */
function modelNeedsFiller(block) {
  // An empty item is a childless leaf holding nothing but its own marker
  // (slice 1b), so it renders as a bare `<li></li>` with no height and no
  // caret — the same problem an empty paragraph has, one kind along. Slice 4
  // gives it a filler for the same reason, and `modelFillItem` turns it into a
  // container the moment somebody types in it.
  if (block.kind === "item" && !block.children && !block.inlines) return true;
  if (!block.inlines) return false;
  if (!block.inlines.length) return true;
  return block.inlines[block.inlines.length - 1].kind === "hardbreak";
}

function modelFillerBreak(document) {
  const br = document.createElement("br");
  br.setAttribute(MODEL_FILLER_ATTR, "");
  return br;
}

/**
 * The single element a block's rendering produced, or null when it produced
 * anything else.
 *
 * **A block owns an element only when its rendering is exactly one**, ignoring
 * whitespace either side, and that is not always: markdown-it hides a tight
 * list item's paragraph, so it renders to bare text with no element of its own.
 * Such a block has nothing to stamp and nothing to replace, and re-rendering it
 * goes through the nearest ancestor that does own one — its `<li>`, which is
 * cheap.
 *
 * The rule is not a heuristic, it is the definition of what makes a re-render
 * correct: replacing an element with the block's rendering is right exactly
 * when that rendering *is* the element.
 */
function modelOwnedElement(parent, from) {
  let found = null;
  for (let i = from; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === 1) {
      if (found) return null;
      found = node;
    } else if (node.nodeType !== 3 || node.textContent.trim() !== "") {
      return null;
    }
  }
  return found;
}

/**
 * Build one block's DOM at the end of `parent`, and hand back the nodes it
 * added there.
 *
 * Built a block at a time, into the real parent, rather than as one string
 * assigned to `#editor`. That is what makes the block-to-element map fall out
 * rather than having to be reconstructed — and it is also what gets the
 * fragment parsing context right everywhere for free: an `<li>` is inserted
 * into its `<ul>` and a `<tr>` into its `<tbody>`, where the same markup
 * assigned to a detached `<div>` would be thrown away by the HTML parser.
 *
 * **The rendering is trimmed, so a block's DOM is exactly its own element.**
 * What goes is markdown-it's pretty-printing — the newline after a closing tag,
 * the one between two siblings, and the one `hiddenBefore` puts in front of an
 * opening one. Whitespace between block elements belongs to no block, so
 * leaving it in would mean a re-render either stranding the old copy or adding
 * a second — and, since slice 2, that a container's DOM text would not be its
 * children's, which is what a child's offset inside its owner is measured
 * against.
 *
 * **It is `modelTrimRendering` rather than `trim()`, and that cost a character
 * of the document.** A `trim()` is right exactly while a block's rendering
 * begins and ends with a tag, which is not always: markdown-it hides a tight
 * list item's paragraph, so that block renders as **bare text** and its edges
 * are its own content. Delete the last word of a bullet with Option+Backspace
 * and the model holds the space before it — correctly, since the engine's
 * target range covered the word and not the space — and the trim ate it, in
 * all three engines. Found by hand on 2026-09-21. So the trim keeps back
 * exactly the edge whitespace the block's own text has, which is not a
 * heuristic: it is the invariant `modelVerifyRender` checks, applied where the
 * markup is built instead of being asserted about afterwards.
 */
/**
 * Strip markdown-it's own edge whitespace from a rendering, and not a character
 * more.
 *
 * `keep` is the block's text as the model holds it. Whatever whitespace that
 * text carries at an edge is content and stays; the rest is the parser's
 * pretty-printing and goes. For a block whose rendering is tags at both ends
 * — which is most of them — `keep` has no edge whitespace and this is exactly
 * a `trim()`. For a hidden tight-item paragraph, whose rendering is bare text,
 * it is exactly a no-op. The two cases need no telling apart.
 *
 * It also settles a second one nobody had hit: a hidden paragraph ending in a
 * hard break renders `a<br>\n`, and that final newline **is** the break's one
 * character by `modelInlineText`'s own rule, so a `trim()` would have lost it
 * the same way.
 */
function modelTrimRendering(html, keep) {
  const keepLead = keep === null ? 0 : /^\s*/.exec(keep)[0].length;
  const keepTail = keep === null ? 0 : /\s*$/.exec(keep)[0].length;
  const lead = /^\s*/.exec(html)[0].length;
  let out = html.slice(Math.max(0, lead - keepLead));
  const tail = /\s*$/.exec(out)[0].length;
  const cut = Math.max(0, tail - keepTail);
  return cut ? out.slice(0, out.length - cut) : out;
}

function modelBuildBlock(parent, block, md, env) {
  if (block.kind === "gap") return [];
  const from = parent.childNodes.length;

  if (block.children) {
    const tokens = block.hiddenBefore ? [block.hiddenBefore, ...block.tokens] : block.tokens;
    const open = modelRenderToken(md, tokens, block.hiddenBefore ? 1 : 0, env);
    const close = modelRenderToken(md, block.tokens, block.tokens.length - 1, env);
    // Each half trimmed, not the pair: `<ul>\n</ul>\n` trimmed as one string
    // keeps the newline *inside* the tags, as a text node no block owns. That
    // survived slice 1 because nothing counted characters yet; slice 2 counts,
    // and a container's text has to be exactly its children's or a child's
    // offset inside its owner is out by every stray newline before it.
    parent.insertAdjacentHTML("beforeend", open.trim() + close.trim());
  } else {
    parent.insertAdjacentHTML(
      "beforeend",
      modelTrimRendering(modelRenderBlock(block, md, env), block.inlines ? modelInlineText(block.inlines) : null),
    );
  }

  // Before the children go in, so a container's own nodes are the wrapper alone.
  const nodes = Array.prototype.slice.call(parent.childNodes, from);
  const el = modelOwnedElement(parent, from);
  if (el) el.setAttribute(MODEL_BLOCK_ATTR, String(block.id));
  // **A table refuses edits, and the rendering is how it says so** (slice 4's
  // step 7). The refusal itself is an absence — the input layer cancels every
  // `beforeinput` whether it handles it or not, so a table needs no code there
  // at all — but a keystroke that silently does nothing reads as a broken
  // editor rather than as a closed door. `contenteditable="false"` means the
  // engine will not put a caret inside it, so nobody is ever in the position of
  // typing into something that ignores them. Lifted at stage 3, as TODO 1.1.8.
  if (el && block.kind === "table") el.setAttribute("contenteditable", "false");

  if (block.children) {
    for (const child of block.children) modelBuildBlock(el || parent, child, md, env);
  } else if (modelNeedsFiller(block)) {
    (el || parent).appendChild(modelFillerBreak(parent.ownerDocument));
  } else if (block.inlines) {
    modelPlaceStops(el ? [el] : nodes, parent.ownerDocument);
  }
  return nodes;
}

/**
 * Caret stops beside an equation at the edge of a line — slice 7's step 2,
 * measured on `tests/caret-guard-check.html` in Firefox on 2026-10-01.
 *
 * Every typeset equation is uneditable, and Gecko leaves no caret position
 * beside an uneditable inline at a line's edge: after one that ends a line the
 * caret cannot go at all, and before one that starts a line even the keyboard
 * cannot reach. A `<br>` behind gives the first back; a zero-width character in
 * front gives the keyboard the second (the mouse reaches it with no stop at
 * all). The character is wrapped in a marked `<span>` because a bare text node
 * cannot carry the mark, and the mark is what lets every walk below count the
 * stop as nothing — measured that the wrapping does not cost Firefox the
 * position.
 *
 * Here rather than in the renderer, the way the empty-block filler is, so
 * `md.render`'s output stays exactly slice 1's. "A line" is the block's own
 * start or end, or a hard break: markdown-it renders one as `<br>\n`, so an
 * equation after it — whitespace aside — starts a line, and one right before it
 * already has the `<br>` it needs.
 */
function modelPlaceStops(roots, document) {
  const leaves = [];
  (function collect(node) {
    if (node.nodeType === 3) {
      if (node.textContent !== "") leaves.push(node);
      return;
    }
    if (node.nodeType !== 1 || node.hasAttribute(MODEL_FILLER_ATTR)) return;
    if (modelIsAtomNode(node) || node.tagName === "BR") {
      leaves.push(node);
      return;
    }
    for (const child of node.childNodes) collect(child);
  })({ nodeType: 1, hasAttribute: () => false, childNodes: roots });

  const blank = (leaf) => leaf && leaf.nodeType === 3 && !leaf.textContent.trim();
  const breakOrNone = (leaf) => !leaf || leaf.nodeType === 1 && leaf.tagName === "BR";

  leaves.forEach((leaf, i) => {
    if (!(leaf.nodeType === 1 && leaf.hasAttribute(MATH_SPAN_ATTR))) return;
    // **The wrapper is uneditable too, not only MathJax's container inside it.**
    // Measured in Firefox on 2026-10-01: with the wrapper editable, a click after
    // an equation that ends a line put the caret *inside* MathJax's output, on a
    // glyph element (`MJX-C`, offset 0), and the model, which reads any position
    // inside an atom as its front edge, typed the letter before the equation.
    // The check page that measured the stops had no wrapper — the uneditable
    // container sat directly in the line — and there the same click worked. The
    // wrapper is an atom to the model, one character never edited inside, so
    // nothing is lost by telling the engine so.
    leaf.setAttribute("contenteditable", "false");
    let before = i - 1;
    while (blank(leaves[before])) before--;
    let after = i + 1;
    while (blank(leaves[after])) after++;

    if (breakOrNone(leaves[before])) {
      const stop = document.createElement("span");
      stop.setAttribute(MODEL_FILLER_ATTR, "");
      stop.appendChild(document.createTextNode("\u200B"));
      leaf.parentNode.insertBefore(stop, leaf);
    }
    if (!leaves[after]) leaf.parentNode.insertBefore(modelFillerBreak(document), leaf.nextSibling);
  });
}

// A node the DOM builder added and the model knows nothing of: the empty-block
// `<br>` and the caret stops above. Every walk between the DOM and the model
// counts one as nothing.
function modelIsFiller(node) {
  return node.nodeType === 1 && node.hasAttribute(MODEL_FILLER_ATTR);
}

// The element carrying a block's id, or null when that block owns none.
function modelElementFor(root, block) {
  return root.querySelector(`[${MODEL_BLOCK_ATTR}="${block.id}"]`);
}

/**
 * Build the whole document under `root`.
 *
 * **It tells the outline rather than letting it infer.** `scheduleOutline`
 * skips its debounce on a `childList` record targeting `#editor`, which is the
 * fingerprint of an `editor.innerHTML` assignment — and from slice 4 onward it
 * is also what every Enter in a top-level paragraph produces, so the commonest
 * structural keystroke there is would rebuild the whole sidebar synchronously.
 * A whole-document signal is not a new kind of thing here; the disk-changed
 * check and the file descriptor are the same shape. The guard is for the two
 * bundles that ship no outline.js: the suites, and nothing else today.
 *
 * A document with no blocks at all gets one filler paragraph belonging to no
 * block, which is the empty editor. Whether deleting everything should instead
 * leave the model holding an empty paragraph block is slice 4's, where there is
 * an edit to decide it from.
 */
function modelRender(root, doc, md, selection = null) {
  const env = {};
  root.innerHTML = "";
  for (const block of doc.blocks) modelBuildBlock(root, block, md, env);
  if (!root.firstChild) {
    const paragraph = root.ownerDocument.createElement("p");
    paragraph.appendChild(modelFillerBreak(root.ownerDocument));
    root.appendChild(paragraph);
  }
  modelDecorate(root);
  // Applied here, by the render step, because nothing may hold a Range across
  // one: every node the old selection pointed at has just been thrown away.
  if (selection) modelApplySelection(root, selection);
  if (typeof renderOutline === "function") renderOutline();
  if (modelVerifyEnabled) modelVerifyLog(modelVerifyRender(root, doc));
  return root;
}

/**
 * Re-render one block in place, and hand back the element that now stands for
 * it.
 *
 * Climbs to the nearest ancestor owning an element, per `modelOwnedElement`, so
 * a tight list item's paragraph re-renders through its `<li>`. Returns null
 * when nothing in the chain owns one, which the caller has to handle rather
 * than assume away — an `html_block` whose markup has two roots is the shape
 * that gets there.
 *
 * The rebuild happens at the end of the parent and is then moved into place,
 * rather than being parsed anywhere detached: moving nodes already parsed is
 * context-free, where re-parsing them is exactly the thing that loses a `<tr>`.
 */
function modelRerenderBlock(root, block, md, selection = null, env = {}) {
  let owner = block;
  let el = null;
  while (owner && !(el = modelElementFor(root, owner))) owner = owner.parent;
  if (!el) return null;

  const parent = el.parentNode;
  const anchor = el.nextSibling;
  parent.removeChild(el);
  const nodes = modelBuildBlock(parent, owner, md, env);
  for (const node of nodes) parent.insertBefore(node, anchor);
  for (const node of nodes) modelDecorate(node);
  if (selection) modelApplySelection(root, selection);
  return modelElementFor(root, owner);
}

/**
 * Hand what a render just built to Mermaid and MathJax, which draw over
 * markdown-it's fence and `<span data-math>` — slice 7's step 2.
 *
 * **After the build and before the selection**, so the caret is mapped onto the
 * DOM the reader will see rather than onto a `<pre>` about to be replaced. An
 * equation is one atom in both states, so a caret beside one maps the same
 * either way; a diagram's wrapper keeps its fence's `data-block`, so the block
 * is still found.
 *
 * Feature-tested, the way `renderOutline` is: `renderers.js` is the app's, and
 * `front/input-check.html` loads the model without it, as does every suite.
 */
function modelDecorate(node) {
  if (node && node.nodeType === 1 && typeof renderAfterModel === "function") renderAfterModel(node);
}

// ── Rendering: the verify ────────────────────────────────────────────────────
//
// The spike's step 6, kept as a permanent assertion rather than as a thing that
// answered its question and retired. After a render, each block's DOM text is
// compared against the text its tree says it holds; a divergence is the exact
// failure this design can have, so it is reported rather than left to be felt.
//
// Off by default — it walks the document — and on in the harness.

let modelVerifyEnabled = false;

function modelVerifySetEnabled(on) {
  modelVerifyEnabled = !!on;
}

/**
 * Every block whose DOM text disagrees with its model text.
 *
 * **Slice 2 made this exact**, where slice 1 had to skip two kinds of block and
 * count the skips. It compares `modelDomText(el)` — which counts an atom as one
 * character, the same as the model does — against `modelBlockText(block)`, so a
 * block holding an image or an equation is *checked* rather than excused. And
 * it checks at every block that owns an element rather than only at leaves, so
 * a block owning none is covered by the container it is inside rather than
 * skipped: a container's text is its children's concatenated, which is the
 * tiling invariant in text space.
 *
 * What is left unmeasured is a block whose content is source rather than text —
 * a fence, a rule, a table row, a gap. `modelBlockText` is empty for those by
 * definition, and their second text space is slice 4's. **A table is the case
 * where that reaches a container**: 1b's floor is the row, because `td_open`
 * carries no `map`, so a table's whole subtree bears no inline tree and its
 * text here is empty while its cells plainly hold some. Skipping it is the same
 * statement slice 4 makes out loud — a table is not editable as text — rather
 * than an exception carved for the verify.
 *
 * The test is *bears any inline tree at all*, not *has empty text*: an edited
 * paragraph really can be empty, and that one is checked.
 */
function modelBearsInlines(block) {
  if (block.inlines) return true;
  return block.children ? block.children.some(modelBearsInlines) : false;
}

function modelVerifyRender(root, doc) {
  const problems = [];
  let compared = 0;

  const walk = (block) => {
    const el = modelElementFor(root, block);
    if (el && modelBearsInlines(block)) {
      const want = modelBlockText(block);
      const got = modelDomText(el);
      compared += 1;
      if (got !== want) problems.push({ id: block.id, kind: block.kind, want, got });
    }
    if (block.children) block.children.forEach(walk);
  };

  doc.blocks.forEach(walk);
  return { problems, compared };
}

function modelVerifyLog(report) {
  if (report.problems.length) console.warn("[model] render diverged from the model", report.problems);
}

// ── The core's flag ──────────────────────────────────────────────────────────
//
// Default off until the stage 4 merge. Two reasons, and neither of them is
// `main`: the branch stays usable while the input layer is half-built, and an
// A/B of the same document by hand is the only way a rendering divergence gets
// *seen* rather than inferred. `?core=model` and `?core=legacy` set it and it
// sticks; if both cores are wanted running at once the answer is MANDY_PORT,
// since the two share one localStorage on one origin.
//
// Resolved once per page load rather than read per call, so a session cannot
// half-switch, and behind a try/catch so the Deno suites — which have no
// location and no localStorage — load this file and get a plain no.

const MODEL_CORE_KEY = "mandy-model-core";

let modelCoreFlag = null;

function modelCoreResolveFlag() {
  try {
    const choice = new URLSearchParams(window.location.search).get("core");
    if (choice === "model" || choice === "legacy") {
      localStorage.setItem(MODEL_CORE_KEY, choice === "model" ? "on" : "off");
    }
    return localStorage.getItem(MODEL_CORE_KEY) === "on";
  } catch {
    return false;
  }
}

function modelCoreEnabled() {
  if (modelCoreFlag === null) modelCoreFlag = modelCoreResolveFlag();
  return modelCoreFlag;
}

// ── The open document ────────────────────────────────────────────────────────
//
// One document, held here, because this stage has exactly one: a tab switch
// re-parses on adopt rather than carrying a model bundle, which is what the
// preamble decided and what keeps tabs.js out of this stage. Stage 4 is where
// that becomes per-tab, along with the autosave it shares a lifecycle with.

/**
 * Say, on screen, which core drew the document.
 *
 * **The flag's whole purpose is a hand A/B**, and without this you cannot tell
 * which half of it you are looking at — which is worse than not having the
 * comparison, because it invites reporting a difference between two runs of the
 * same core. Slice 1's rule is that the model renders *identically* to
 * `markdownToHtml`, so "it looks the same" is the expected answer and not
 * evidence of anything.
 *
 * It is a link back to `?core=legacy`, because one click is what makes the
 * comparison worth doing and the autosave carries unsaved edits across the
 * reload — so the switch costs nothing. Its `title` names what is missing
 * rather than making the reader look it up: under the flag the formats and undo
 * do nothing, and those are slices 6 and 7.
 *
 * **It goes at stage 4 with the flag**, which is why it is one function, one
 * call site and one CSS rule rather than a spec entry in `toolbar.js`. It is
 * not an action and has no handler; it is a status, like the open file's
 * directory beside it.
 */
function modelCoreMarkRender(document) {
  const toolbar = document.querySelector(".toolbar-right") || document.querySelector(".toolbar");
  if (!toolbar || toolbar.querySelector(".model-core-mark")) return null;
  const mark = document.createElement("a");
  mark.className = "model-core-mark";
  mark.textContent = "model core";
  mark.href = "?core=legacy";  // relative: the current page, other core
  mark.title = "TODO 3.1's editing core is drawing this document. " +
    "The formats, Clear, and Insert's link, rule and table of contents do " +
    "nothing here — they are slice 7 — and a table refuses the caret until " +
    "stage 3. " +
    "Click to switch back to the running core.";
  // Before the theme toggle rather than at the head of the group, so its place
  // is the same whatever the open file's path is — the directory beside it is
  // as wide as the path is deep, and a marker that moved with it would be a
  // marker you have to look for. The toggle stays last, where every variant has
  // always had it.
  toolbar.insertBefore(mark, toolbar.querySelector("#themeToggle"));
  return mark;
}

// At load, because `toolbar.js` fills the bar at load and comes first in both
// bundles. Wrapped because the suites load this file with no `document` at all,
// which is the property that lets them drive the model with no browser.
if (typeof document !== "undefined" && document.querySelector && modelCoreEnabled()) {
  modelCoreMarkRender(document);
}

let modelDocument = null;

function modelCurrentDocument() {
  return modelDocument;
}

function modelLoad(root, markdown, md) {
  modelDocument = modelParse(markdown, md);
  // Every document ends somewhere the caret can go — see modelEnsureBlock. It
  // is here rather than in `modelParse` because it is about editing rather than
  // about the file: a document parsed to be serialised has no caret in it, and
  // the `model` suite's oracle must come back exactly as it went in.
  modelEnsureBlock(modelDocument, md);
  modelRender(root, modelDocument, md);
  return modelDocument;
}

// ── Selection ────────────────────────────────────────────────────────────────
//
// Stage 2's slice 2: `(block, offset)` to a DOM position and back. Slice 2 of
// stage 1 built the model half on purpose — `modelInlineText`,
// `modelInlineOffset`, `modelInlineAt` — with `undo.js`'s boundary rule kept
// deliberately so this ports the caret behaviour rather than re-deciding it.
// What is here is the DOM walk, which is `undoTextOffset` / `undoLocateOffset`
// over a smaller root, plus the two things that walk does not have to know
// about: atoms, and a block with no element of its own.
//
// **Nothing holds a `Range` across a render.** Every model edit records the
// selection it means to leave in model coordinates and the render step applies
// it — `modelRender` and `modelRerenderBlock` both take one. A `getSelection()`
// cached across a re-render points at nodes that no longer exist, and it breaks
// silently, which is why the rule is stated rather than left to be inferred.

/**
 * Whether a DOM node stands for one character rather than for its own text.
 *
 * **This is the DOM half of `MODEL_ATOM_KINDS` and the two have to agree**, or
 * the two directions disagree by exactly the length of some TeX. An image is
 * `<img>`, which contributes nothing to `textContent` and one character here.
 * An equation is `<span data-math>`, which markdown-parser.js emits for the
 * mapping's sake — see the comment there. Before MathJax runs it holds the
 * source text; after, it holds an `<mjx-container>` of glyphs; it is one
 * character throughout, which is the whole reason it exists.
 *
 * A `<br>` is deliberately not here. Measured 2026-09-20: markdown-it renders a
 * hard break as `<br>\n`, so the newline is the text node *after* it and the
 * `<br>` itself is zero characters — which is what `undoTextOffset` has always
 * counted. The filler `<br>` slice 1 renders is zero characters for the same
 * reason, so the two cannot be confused and there is nothing to tell apart.
 */
function modelIsAtomNode(node) {
  return node.nodeType === 1 && (node.tagName === "IMG" || node.hasAttribute(MATH_SPAN_ATTR));
}

// A DOM subtree's text in the model's offset space: an atom is one `￼`
// and is never descended into, and everything else is its own characters. This
// is `modelInlineText` read off the DOM instead of off the tree, and the render
// verify is the two of them compared.
function modelDomText(node) {
  if (node.nodeType === 3) return node.textContent;
  if (modelIsFiller(node)) return "";
  if (modelIsAtomNode(node)) return MODEL_ATOM;
  let out = "";
  for (const child of node.childNodes) out += modelDomText(child);
  return out;
}

/**
 * A DOM position inside `root`, as an offset into `modelDomText(root)`.
 *
 * `undoTextOffset` with two additions: an atom counts one and is not descended
 * into, and a position *inside* an atom is not a position the model has, so it
 * clamps to one of the atom's own edges.
 *
 * **Which edge is `bias`, and it is not a detail.** An equation renders as a
 * span with text or MathJax markup inside it, and a browser normalising a
 * selection will happily put an endpoint in there — so a user who selects an
 * equation and types over it hands us a range whose *end* is inside the atom.
 * Clamp that to the atom's start, as the start of a range rightly clamps, and
 * the range comes back collapsed: measured 2026-09-20 on the check page, where
 * typing over a selected equation inserted beside it and left it standing.
 * So a start biases to the atom's start and an end to its end, and a selection
 * covering an atom goes on covering it.
 *
 * Null when the node is not under `root`, the way `undoTextOffset` does it, so
 * a caller holding a stale node hears about it instead of being handed a 0.
 */
function modelDomOffset(root, node, offset, bias = -1) {
  let total = 0;
  let found = false;

  (function walk(current) {
    if (found) return;
    if (current === node) {
      if (current.nodeType === 3) total += offset;
      else if (modelIsFiller(current)) {
        // A stop is nothing to the model: any offset on it is where it stands.
      } else if (modelIsAtomNode(current)) {
        // **The atom itself as the container**: offset 0 is its front edge and
        // its last child offset its back edge, so the two ends of a range that
        // covers it name the two sides. Firefox describes a Backspace after an
        // equation exactly this way, (span, 0) to (span, 1), and while both
        // ends counted as the front the deletion was zero-wide: nothing went
        // and the caret jumped before the equation. Measured by hand on
        // 2026-10-01. Strictly between, the position is inside the atom and
        // clamps the way the case below does.
        const last = current.childNodes.length;
        if (offset >= last && last > 0) total += 1;
        else if (offset > 0 && bias > 0) total += 1;
      } else {
        // An element container: `offset` counts child nodes, not characters.
        const children = current.childNodes;
        for (let i = 0; i < offset && i < children.length; i++) total += modelDomText(children[i]).length;
      }
      found = true;
      return;
    }
    if (current.nodeType === 3) {
      total += current.textContent.length;
      return;
    }
    // A caret stop is nothing to the model, so a position inside one is the
    // position where the stop stands.
    if (modelIsFiller(current)) {
      if (current.contains(node)) found = true;
      return;
    }
    if (modelIsAtomNode(current)) {
      // A position under an atom is not one the model can name — a caret is
      // never half-way through an equation — so it clamps to whichever edge
      // the caller is asking about.
      if (current.contains(node)) {
        if (bias > 0) total += 1;
        found = true;
        return;
      }
      total += 1;
      return;
    }
    for (const child of current.childNodes) {
      walk(child);
      if (found) return;
    }
  })(root);

  return found ? total : null;
}

/**
 * The DOM position an offset into `modelDomText(root)` names.
 *
 * `undoLocateOffset` with the same two additions, and its boundary rule kept
 * exactly: **a position at a boundary belongs to the node that ends there**
 * (`remaining <= length`), and past the end clamps to the last position rather
 * than returning nothing. `modelInlineAt` was written to that rule in stage 1
 * so the two agree without either having to know about the other.
 *
 * An atom is addressed from its parent — `{node: parent, offset: index}` before
 * it and `index + 1` after — because there is no text node to land in. That is
 * the one shape this returns that `undoLocateOffset` never does, and a caller
 * building a `Range` needs no special case for it: both forms are valid
 * container positions.
 *
 * A block holding no text at all — the empty one slice 1 renders as
 * `<p><br data-filler></p>` — has no text node to offer, so this answers with
 * the root itself at offset 0, which is where a caret in an empty paragraph
 * goes.
 */
function modelDomLocate(root, offset) {
  let remaining = Math.max(0, offset);
  let result = null;
  let last = null;

  (function walk(current) {
    if (result) return;
    if (modelIsFiller(current)) {
      // A caret that belongs where a start stop stands goes *inside* it, after
      // its character: that is the one place there Firefox will draw a caret.
      if (remaining === 0 && current.firstChild) result = { node: current.firstChild, offset: current.firstChild.textContent.length };
      return;
    }
    if (current.nodeType === 3) {
      const length = current.textContent.length;
      last = { node: current, offset: length };
      if (remaining <= length) result = { node: current, offset: remaining };
      else remaining -= length;
      return;
    }
    if (modelIsAtomNode(current)) {
      const parent = current.parentNode;
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      last = { node: parent, offset: index + 1 };
      if (remaining === 0) result = { node: parent, offset: index };
      else if (remaining <= 1) result = last;
      else remaining -= 1;
      return;
    }
    for (const child of current.childNodes) {
      walk(child);
      if (result) return;
    }
  })(root);

  return result || last || { node: root, offset: 0 };
}

/**
 * A block's own text, in the model's offset space.
 *
 * A leaf's is its inline tree's. **A container's is its children's,
 * concatenated** — which is the tiling invariant one more level down, in text
 * rather than in bytes, and it is what makes the next function possible. A leaf
 * with no inline tree at all (a fence, a rule, a table row, a gap) has no text
 * in this space: its content is source and is edited as source, which is slice
 * 4's second text space and not this one.
 */
function modelBlockText(block) {
  if (block.inlines) return modelInlineText(block.inlines);
  if (block.children) return block.children.map(modelBlockText).join("");
  return "";
}

/**
 * The element a block's positions are measured in, and how far into that
 * element the block's own text starts.
 *
 * **Not every block owns an element.** markdown-it hides a tight list item's
 * paragraph, so it renders as bare text inside its `<li>` with nothing to stamp
 * `data-block` on — and since most of this repo's documents are tight lists,
 * "the caret cannot go there" would not be an edge case. So such a block is
 * addressed through the nearest ancestor that does own one, shifted by the text
 * of the siblings in front of it, which is exactly what `modelBlockText` makes
 * available.
 *
 * Returns null when nothing in the chain owns an element — an `html_block`
 * whose markup has two roots gets there — rather than guessing at a root.
 */
function modelBlockAnchor(root, block) {
  let shift = 0;
  for (let node = block; node; node = node.parent) {
    const el = modelElementFor(root, node);
    if (el) return { el, shift };
    const siblings = node.parent && node.parent.children;
    if (!siblings) return null;
    for (const sibling of siblings) {
      if (sibling === node) break;
      shift += modelBlockText(sibling).length;
    }
  }
  return null;
}

// `(block, offset)` to a DOM position. Null when the block is not on screen.
function modelDomPosition(root, block, offset) {
  const anchor = modelBlockAnchor(root, block);
  if (!anchor) return null;
  return modelDomLocate(anchor.el, anchor.shift + Math.max(0, offset));
}

/**
 * A DOM position back to `(block, offset)`.
 *
 * Walks down from the innermost stamped element the position is inside, then
 * down the model with it: a container's text is its children's, so the offset
 * picks a child by subtracting the ones before it. The boundary rule is the
 * same one going down as coming up — a position at a child's end belongs to
 * that child rather than to the start of the next — so a caret at the end of a
 * tight item's paragraph does not report as the start of the nested list
 * underneath it.
 *
 * Null when the position is not inside any block the document owns, which is a
 * caller's problem to handle rather than this one's to paper over.
 */
function modelDomBlockAt(root, doc, node, offset, bias = -1) {
  let el = node.nodeType === 1 ? node : node.parentNode;
  while (el && el !== root && !el.hasAttribute(MODEL_BLOCK_ATTR)) el = el.parentNode;
  if (!el || el === root || !el.hasAttribute(MODEL_BLOCK_ATTR)) return null;

  const id = el.getAttribute(MODEL_BLOCK_ATTR);
  let block = null;
  (function find(list) {
    for (const candidate of list) {
      if (block) return;
      if (String(candidate.id) === id) { block = candidate; return; }
      if (candidate.children) find(candidate.children);
    }
  })(doc.blocks);
  if (!block) return null;

  let remaining = modelDomOffset(el, node, offset, bias);
  if (remaining === null) return null;

  while (block.children) {
    let next = null;
    for (const child of block.children) {
      const length = modelBlockText(child).length;
      if (remaining <= length) { next = child; break; }
      remaining -= length;
    }
    if (!next) return { block, offset: remaining };
    block = next;
  }
  return { block, offset: remaining };
}

// ── Selection: the browser's ─────────────────────────────────────────────────

// Put the caret, or a range, where the model says. A collapsed selection is one
// position; `to` extends it. Returns whether it could be placed.
function modelApplySelection(root, selection) {
  if (!selection || !selection.block) return false;
  const from = modelDomPosition(root, selection.block, selection.offset);
  if (!from) return false;
  const to = selection.to ? modelDomPosition(root, selection.to.block, selection.to.offset) : from;
  if (!to) return false;

  const range = root.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const live = root.ownerDocument.defaultView.getSelection();
  live.removeAllRanges();
  live.addRange(range);
  return true;
}

// And the way back: what the browser's selection is, in model coordinates.
// Null when there is none, or when it is not inside this document.
function modelReadSelection(root, doc) {
  const live = root.ownerDocument.defaultView.getSelection();
  if (!live || !live.rangeCount) return null;
  const range = live.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const from = modelDomBlockAt(root, doc, range.startContainer, range.startOffset, -1);
  if (!from) return null;
  if (range.collapsed) return from;
  const to = modelDomBlockAt(root, doc, range.endContainer, range.endOffset, 1);
  return to ? { ...from, to } : from;
}

// ── Editing the inline tree ──────────────────────────────────────────────────
//
// Stage 2's slice 3, and the plan is right that it is the real work: stage 1
// only ever *read* this tree. It can be walked, measured, located in and
// emitted from, and until now there was no way to change it.
//
// **The contract a mutation has to keep is already written down, in
// `modelInlineSource`**: every leaf emits `node.raw ?? <rebuilt from content>`,
// so `raw` is the author's exact bytes and the fallback is what the model would
// write itself. An edit therefore sets `content` and **clears `raw`** — which is
// `modelTouch`'s rule one level down, and means exactly the same thing: these
// bytes no longer describe this content. Nothing else has to be kept in step,
// because nothing else is read on the way out.

const MODEL_NBSP = /[ ]/g;

/**
 * What the model accepts as typed text.
 *
 * U+00A0 is normalised **here, once, at the boundary**, which is TODO 1.4
 * closed by construction rather than by the caret-preserving text-node rewrite
 * that item describes. The other half of 1.4 goes more quietly still: the
 * browser rewriting a trailing space to an NBSP behind our back cannot happen
 * when the browser is not the one writing. D3 in docs/DECISIONS.md is why
 * whitespace nobody can see is not fidelity worth keeping.
 */
function modelNormaliseTyped(text) {
  return String(text == null ? "" : text).replace(MODEL_NBSP, " ");
}

// Every leaf in an inline tree with the span it occupies and the array holding
// it. The array rather than an index, because an index goes stale the moment
// anything is spliced out and the list is what a splice needs anyway.
function modelInlineLeafSpans(nodes) {
  const spans = [];
  let offset = 0;
  (function walk(list, path) {
    for (const node of list) {
      if (node.children) {
        walk(node.children, path.concat(node));
        continue;
      }
      const length = modelInlineText([node]).length;
      spans.push({ node, list, start: offset, end: offset + length, path });
      offset += length;
    }
  })(nodes || [], []);
  return spans;
}

// A leaf the model wrote rather than the parser. No token and no `raw`: the
// emitter escapes `content` itself, which is the whole point of the `??`.
function modelTextNode(content) {
  return { kind: "text", content, raw: null, markup: "", children: null, token: null, closeToken: null };
}

/**
 * The inline tree back to a token list — `modelInlines`'s fold, run backwards.
 *
 * **This is what makes an edited block render.** `modelRenderBlock` goes
 * through markdown-it's own renderer over the block's tokens, which is the rule
 * that keeps the output identical to what the app produces today; an edit,
 * though, changes the *tree*, and until slice 3 nothing put the two back in
 * step. Found on 2026-09-20 by the check page's own divergence line, on the
 * first character ever typed into the model core: the model held the new text
 * and the DOM still showed the old, because the tokens had not moved.
 *
 * **Re-parsing was the other candidate and it is worse.** Emitting the block's
 * inline source and handing it back to `md.parseInline` would keep one source
 * of truth and needs no code at all — but the source of a reference link is
 * `[text][label]`, and resolving that needs the whole document's definitions in
 * the parser's env. Get it wrong, or hand over an empty env, and the first
 * keystroke in a paragraph turns every reference link in it into literal text.
 * The tokens are already on the nodes, kept there since slice 2 precisely so
 * that a link's href and `data-ref-label` never have to be re-derived, so
 * using them is the cheaper and the safer answer.
 *
 * A token is synthesised for the kinds an edit can change the content of, and
 * for a leaf the model itself created. Everything else is handed back the
 * parser's own token untouched — which is the same rule the tree follows, one
 * layer along.
 *
 * **A break the model created has no token, and dropping it was a real bug.**
 * Found in Gecko on 2026-09-21, by a human at `front/input-check.html` and by
 * nothing else: `modelInsertBreak` builds a `hardbreak` node with `token: null`
 * — correctly, since there is no parse behind it — and the `else if
 * (node.token)` below then left it out of the token list altogether. The
 * *markdown* was right, because `modelEmitLeaf` composes from the tree and the
 * node carries its own `raw`; the **rendering** is what goes through
 * markdown-it, so Shift+Enter put a newline in the model and no `<br>` on
 * screen. That is precisely the divergence `modelVerifyRender` exists to
 * report, and the suite could not see it — it measured the emitted bytes,
 * where the node is fine.
 *
 * markdown-it's own `hardbreak` and `softbreak` rules read nothing off the
 * token but its type, so a bare `{ type }` is the whole of what they need.
 */
function modelInlineTokens(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.children) {
      if (node.token) out.push(node.token);
      modelInlineTokens(node.children, out);
      if (node.closeToken) out.push(node.closeToken);
      continue;
    }
    if (node.kind === "text") out.push({ type: "text", content: node.content });
    else if (node.kind === "code-span") out.push({ type: "code_inline", content: node.content, markup: node.markup });
    else if (node.token) out.push(node.token);
    else if (node.kind === "hardbreak" || node.kind === "softbreak") out.push({ type: node.kind, content: "" });
    // **Anything else with no token is a crash rather than a disappearance.**
    // An atom is the case: an image's rendering is its `src`, its alt and its
    // title, and an equation's is its delimiters and its TeX — all of which
    // live on the parser's token, which is why slice 2 kept the token on the
    // node instead of re-deriving them. So there is no honest way to
    // synthesise one here, and a command that wants to *create* an image or an
    // equation has to get its token from the parser (`md.parseInline`) rather
    // than hand-build one. That rule is for slices 5 and 7; until then this is
    // unreachable. It throws because the alternative is what the hard break
    // just did — the model holds a node, the screen does not show it, and the
    // only thing that notices is a divergence line in front of a human.
    else throw new Error(`inline ${node.kind} node with no token to render from`);
  }
  return out;
}

/**
 * Every leaf of an inline tree that stands for something on screen.
 *
 * The companion to `modelInlineTokens`, and it exists so the suite can assert
 * the one thing that check cannot assert about itself: **no leaf is silently
 * dropped on the way to the renderer**. A leaf with no token and no synthesis
 * disappears, the model goes on holding it, and the only thing that notices is
 * `modelVerifyRender` in front of a human.
 *
 * Empty text leaves are excluded, because the fold drops those on purpose and
 * always has — they hold no bytes and no position.
 */
function modelInlineLeaves(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.children) modelInlineLeaves(node.children, out);
    else if (!(node.kind === "text" && node.content === "")) out.push(node);
  }
  return out;
}

// Drop what an edit emptied: a leaf with no text left, and then any mark whose
// children have all gone. Leaves rather than marks first, and repeatedly,
// because emptying the last leaf inside nested marks empties both of them.
function modelInlinePrune(nodes) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (node.children) {
      modelInlinePrune(node.children);
      if (!node.children.length) nodes.splice(i, 1);
      continue;
    }
    // Only the kinds whose text *is* their content can be emptied. A break and
    // an atom have no content to lose, and an empty one is not a thing.
    if ((node.kind === "text" || node.kind === "code-span") && node.content === "") nodes.splice(i, 1);
  }
}

/**
 * Replace `[from, to)` in a block's inline tree with `text`, and hand back the
 * offset the caret lands on.
 *
 * Returns null for a block with no inline tree — a fence, a rule, a table row,
 * a gap — whose content *is* source and whose second text space is slice 4's.
 * A caller that gets null has to refuse rather than fall through, which is why
 * it is a null and not a 0.
 *
 * **An atom is all or nothing.** An image and an equation are one character
 * each, so a range can only cover one whole or not at all — there is no partial
 * overlap to define, which is the offset space paying for itself.
 *
 * **Text typed at a mark's edge goes inside when the caret was inside**, which
 * was decided on 2026-09-19 and needs no code of its own: `modelInlineAt`'s
 * boundary rule already says a position belongs to the node that *ends* there,
 * so the caret after `**bold**` is inside the mark and the one before it is
 * not. Typing continues the bold in the first case and does not in the second,
 * which is what every editor people arrive from does. The rule that ships is
 * the rule stage 1 wrote for the caret, reused rather than restated.
 */
function modelInlineSplice(block, from, to, text) {
  modelUnshare(block);
  if (!block.inlines) return null;
  const typed = modelNormaliseTyped(text);
  const length = modelInlineText(block.inlines).length;
  const start = Math.max(0, Math.min(from, length));
  const end = Math.max(start, Math.min(to, length));

  if (start !== end) {
    // In reverse, so a splice cannot move a span this loop has still to reach.
    for (const span of modelInlineLeafSpans(block.inlines).reverse()) {
      if (span.end <= start || span.start >= end) continue;
      const node = span.node;
      const covered = span.start >= start && span.end <= end;
      if (covered || !(node.kind === "text" || node.kind === "code-span")) {
        const at = span.list.indexOf(node);
        if (at >= 0) span.list.splice(at, 1);
        continue;
      }
      const head = node.content.slice(0, Math.max(0, start - span.start));
      const tail = node.content.slice(Math.max(0, end - span.start));
      node.content = head + tail;
      node.raw = null;
    }
    modelInlinePrune(block.inlines);
  }

  if (typed) {
    const at = modelInlineAt(block.inlines, start);
    const node = at.node;
    if (node && (node.kind === "text" || node.kind === "code-span")) {
      node.content = node.content.slice(0, at.offset) + typed + node.content.slice(at.offset);
      node.raw = null;
    } else if (node) {
      // A break or an atom: there is no content to land in, so a new leaf goes
      // beside it, in the list that holds it so it carries the same marks.
      const span = modelInlineLeafSpans(block.inlines).find((candidate) => candidate.node === node);
      const list = span ? span.list : block.inlines;
      const index = list.indexOf(node);
      list.splice(index < 0 ? list.length : index + (at.offset > 0 ? 1 : 0), 0, modelTextNode(typed));
    } else {
      // An empty block. The tree is the empty array the fold leaves behind.
      block.inlines.push(modelTextNode(typed));
    }
  }

  // The tokens the renderer walks, rebuilt from the tree it does not. Without
  // this the model changes and the DOM does not, which is the one failure the
  // render verify exists to catch — and did, on the first keystroke.
  //
  // `block.inline.content` is deliberately left alone: it is the parser's
  // record of what it was handed, read at parse time by the fold and by the
  // affix checks and by nothing afterwards. `modelEmitLeaf` composes from the
  // tree, not from it.
  if (block.inline) block.inline.children = modelInlineTokens(block.inlines);

  modelTouch(block);
  return start + typed.length;
}

// ── Structure ────────────────────────────────────────────────────────────────
//
// Stage 2's slice 4. Stage 1 built the tree and only ever read it; slice 3's
// `modelInlineSplice` changes what is *inside* a block and cannot change how
// many blocks there are. What is here is the other half — put a block in, take
// one out, split one in two, join two into one — with the tiling invariant left
// true on both sides of every one of them.
//
// **Everything here is a pure function over the model**, which is what lets the
// suite drive it against the oracle with no browser anywhere. The input layer
// decides *when*; this decides *what*.

/**
 * The array a block lives in: its container's children, or the document's own
 * list.
 *
 * One function rather than the ternary at each site, because every structural
 * edit needs it and a site that reached for `doc.blocks` on a nested block
 * would splice the wrong list — silently, since both are arrays of blocks.
 */
function modelSiblings(doc, block) {
  return block.parent ? block.parent.children : doc.blocks;
}

/**
 * A blank line in a block's own quote chain: `"\n\n"` at top level and
 * `"\n>\n"` inside a quote.
 *
 * A separator is bytes, and inside a quote those bytes carry the chain or the
 * block after it stops being quoted. The chain's trailing whitespace is
 * trimmed, because `"> "` on an otherwise blank line is a trailing space nobody
 * wrote — the same thing D3's rules already refuse to put into a file.
 */
function modelBlankSeparator(block) {
  const chain = block.quotePrefixes;
  const last = chain && chain.length ? chain[chain.length - 1] : "";
  return "\n" + last.replace(/[ \t]+$/, "") + "\n";
}

/**
 * The separator this block's own list already uses between its members, or
 * null when the list has only this one and has therefore said nothing.
 *
 * **This is what keeps a tight list tight.** Two paragraphs inside one item
 * must be separated by a blank line or they are one paragraph; two *items* may
 * be separated by one or not, and which it is decides whether CommonMark calls
 * the list loose. So a split that promotes to the item level cannot reuse the
 * blank line the paragraph split needed — it has to ask the list what the
 * author already does, which is the same per-document convention
 * `sniffMarkdownStyle` reads for markers and this model reads one level finer.
 */
function modelSiblingSeparator(doc, block) {
  const list = modelSiblings(doc, block);
  const at = list.indexOf(block);
  if (at < 0) return null;
  if (at + 1 < list.length) return block.separator;
  if (at > 0) return list[at - 1].separator;
  return null;
}

/**
 * What a block's `leadingAffix` holds beyond the opener its position gives it.
 *
 * `modelEmitLeaf` composes a line as the quote chain, then the item's marker or
 * continuation indent, then the rest of `leadingAffix` — a paragraph's own one-
 * to-three-space indent, usually nothing. For a block the parser produced those
 * two agree by construction. For one the editor moves they cannot: a split's
 * second half is never its item's first child, so it takes the continuation
 * indent where the block it came from took the marker, and copying the affix
 * across would write a second bullet into the file.
 *
 * So the opener is recomputed from where the block now sits and this is the
 * part that travels. It is `modelEmitLeaf`'s one subtraction read backwards, in
 * the one place that needs it — and it must be read **before** the move, since
 * afterwards the block's position no longer describes the bytes it recorded.
 */
function modelBlockExtra(block) {
  if (block.kind === "heading" || block.leadingAffix === null) return "";
  const item = modelItemAffix(block);
  const opener = (item ? (item.first ? item.marker : item.contentIndent) : "") ?? "";
  return block.leadingAffix.startsWith(opener) ? block.leadingAffix.slice(opener.length) : "";
}

// The other end of the same subtraction: the affix a block's *current* position
// gives it, plus whatever `modelBlockExtra` carried across. A heading records
// none — its `open` runs from the chain-stripped column 0 and carries the
// indent already, which is why `modelEmitLeaf` never asks one for a
// `leadingAffix` at all.
function modelSetLeadingAffix(block, extra) {
  if (block.kind === "heading") {
    block.leadingAffix = null;
    return block;
  }
  const item = modelItemAffix(block);
  const opener = (item ? (item.first ? item.marker : item.contentIndent) : "") ?? "";
  block.leadingAffix = opener + extra;
  return block;
}

/**
 * A copy of one of the parser's tokens that this file may write to.
 *
 * Only the `inline` token is ever cloned *here*, and it has to be:
 * `modelInlineSplice` and everything below assign `inline.children`, so two
 * blocks sharing one inline token would each render the other's content. The
 * block-level tokens are shared deliberately — that is what keeps a split's two
 * halves agreeing about their own tag.
 *
 * **Shared, not read-only**, which this comment used to claim and which slice 4
 * stopped being true: `modelSourceSplice` writes `token.content` on a fence.
 * The sharing is still right, because the callers here only ever share between
 * blocks of one live document, where a later write is meant to reach both — and
 * no caller hands a fence to one of them, since a fence is never split. What
 * cannot share those tokens across an edit is a *state*, which is why
 * `modelUnshare` copies every one of them before a write and does not reuse
 * this function alone.
 *
 * The prototype comes across rather than being flattened to a plain object,
 * because markdown-it's own renderer rules call methods on a Token — `attrGet`
 * above all — and a flattened copy would throw inside the renderer, which is
 * the worst place to find out.
 */
function modelCloneToken(token) {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(token)), token);
  if (Array.isArray(token.attrs)) copy.attrs = token.attrs.map((pair) => pair.slice());
  return copy;
}

/**
 * A new leaf of the same kind as `like`, holding `inlines`.
 *
 * Cloned rather than built, because the tokens are already there: a split's two
 * halves are the same kind of block with the same tag, the same heading shape
 * and the same quote chain, and the only thing that differs is the content.
 * **Its `source` is null from birth**, which is the whole point — a block the
 * editor created has no bytes in the file to hand back, so it goes through the
 * emitter and is written in the conventions its affixes record.
 *
 * `inline.content` is left holding the original's, and deliberately: slice 3
 * settled that it is the parser's record of what it was handed, read at parse
 * time and by nothing afterwards, and the emitter composes from the tree. A
 * copy that zeroed it would be inventing a second meaning for the field.
 */
function modelLeafLike(doc, like, inlines) {
  const block = modelBlockShape(modelMintId(doc), like.kind);
  block.level = like.level;
  block.tokens = like.tokens.map((token) => (token.type === "inline" ? modelCloneToken(token) : token));
  block.inline = block.tokens.find((token) => token.type === "inline") || null;
  block.hiddenBefore = like.hiddenBefore;
  block.inlines = inlines;
  block.quotePrefixes = like.quotePrefixes ? like.quotePrefixes.slice() : null;
  block.headingShape = like.headingShape ? Object.assign({}, like.headingShape) : null;
  if (block.inline) block.inline.children = modelInlineTokens(inlines);
  return block;
}

/**
 * A new, empty container of the same kind as `like`.
 *
 * Its tokens are shared, because a container renders only its own open and
 * close and neither is ever written to. Its marker is the next one its list
 * uses — see `modelNextMarker` — and its children start empty for the caller to
 * fill.
 */
function modelContainerLike(doc, like) {
  const block = modelBlockShape(modelMintId(doc), like.kind);
  block.level = like.level;
  block.tokens = like.tokens;
  block.hiddenBefore = like.hiddenBefore;
  block.children = [];
  block.quotePrefixes = like.quotePrefixes ? like.quotePrefixes.slice() : null;
  block.marker = like.marker;
  block.contentIndent = like.contentIndent;
  return block;
}

/**
 * A fresh, empty paragraph, whose tokens come from the parser.
 *
 * **Never hand-built**, which is the exact twin of the rule that keeps
 * `modelRenderBlock` honest: a block renders through markdown-it's own renderer
 * over its own tokens, so a token this file invented would be this file
 * deciding what markdown-it produces — a second renderer wearing a different
 * hat. `md.parse` of a one-character document gives the three tokens a
 * paragraph is, and the content is then emptied.
 *
 * It is the one block kind the editor creates out of nothing. Everything else
 * is cloned off a block that already exists, which is where the tokens are.
 */
function modelParagraphBlock(doc, md) {
  const tokens = md.parse("x", {}).map((token) => modelCloneToken(token));
  const block = modelBlockShape(modelMintId(doc), "paragraph");
  block.tokens = tokens;
  block.inline = tokens.find((token) => token.type === "inline") || null;
  if (block.inline) {
    block.inline.content = "";
    block.inline.children = [];
  }
  block.inlines = [];
  block.leadingAffix = "";
  return block;
}

const MODEL_ORDERED_MARKER = /^([ \t]*)(\d{1,9})([.)][ \t]*)$/;

/**
 * The marker a new item takes, read off its own list rather than off a
 * document-wide sniff.
 *
 * A bullet is copied outright. An ordered marker asks the item before this one:
 * **two items in a row carrying the same number is a document written all-`1.`**
 * and the new one copies it, and anything else takes the next number. That is
 * the list's own convention, which is strictly better than
 * `sniffMarkdownStyle`'s one answer per document — the same argument slice 2
 * made for recording a mark's delimiter per node.
 *
 * **Siblings are never renumbered**, and that is refused on D1's own grounds
 * rather than left undone: renumbering what follows would re-emit every sibling
 * of an edited block, which is exactly what slice 1b exists to prevent, and
 * CommonMark numbers a rendered list off its first marker regardless. The bytes
 * after an insert are untidy; the document is not wrong, and nobody's diff is
 * the length of the list.
 *
 * The content indent follows the marker's width when it was the marker's width
 * to begin with — `9. ` becoming `10. ` moves the column its continuation lines
 * have to reach, and an indent left one short stops being a continuation at
 * all.
 */
function modelNextMarker(doc, item) {
  if (item.marker === null) return { marker: null, contentIndent: item.contentIndent };
  const digits = MODEL_ORDERED_MARKER.exec(item.marker);
  if (!digits) return { marker: item.marker, contentIndent: item.contentIndent };

  const list = modelSiblings(doc, item);
  const at = list.indexOf(item);
  const before = at > 0 ? list[at - 1] : null;
  const prior = before && before.marker ? MODEL_ORDERED_MARKER.exec(before.marker) : null;
  const marker = prior && prior[2] === digits[2]
    ? item.marker
    : digits[1] + String(Number(digits[2]) + 1) + digits[3];

  let contentIndent = item.contentIndent;
  if (contentIndent !== null && contentIndent.length === item.marker.length && marker.length !== item.marker.length) {
    contentIndent = marker.length > contentIndent.length
      ? contentIndent + " ".repeat(marker.length - contentIndent.length)
      : contentIndent.slice(0, marker.length);
  }
  return { marker, contentIndent };
}

/**
 * Put `fresh` into the tree immediately after `after`, as its sibling.
 *
 * The separator that followed `after` now follows `fresh`, because it is what
 * followed the bytes that are now on the far side of both — and `after` takes a
 * blank line in its own quote chain, which is the only separator two leaves can
 * have and still parse as two.
 *
 * **The parent link is set before the affix**, because `modelItemAffix` walks
 * it, and **the container is touched** rather than the blocks: `after`'s own
 * bytes may not have changed at all (Enter at the end of a heading), but its
 * container's description of its children has, and a container still holding
 * its own `source` re-emits from those bytes and never asks. Whoever changed a
 * block's content touches that block; this touches what the *shape* change
 * invalidated.
 */
function modelInsertBlockAfter(doc, after, fresh, extra = "") {
  const list = modelSiblings(doc, after);
  const at = list.indexOf(after);
  if (at < 0) return null;
  fresh.parent = after.parent;
  fresh.separator = after.separator;
  after.separator = modelBlankSeparator(after);
  list.splice(at + 1, 0, fresh);
  modelSetLeadingAffix(fresh, extra);
  if (after.parent) modelTouch(after.parent);
  return fresh;
}

/**
 * Take a block out of the tree.
 *
 * Its separator goes to the sibling before it, because those are the bytes that
 * followed the block and something has to carry them or a removal at the end of
 * a container eats the blank line after it. Removing the **first** child is the
 * case with teeth: the next one becomes the container's first, so it now takes
 * the item's marker where it took the continuation indent, and its affix has to
 * be recomputed before it re-emits — which is a byte change, so it is touched.
 */
function modelRemoveBlock(doc, block) {
  const list = modelSiblings(doc, block);
  const at = list.indexOf(block);
  if (at < 0) return false;

  const heir = at === 0 && list.length > 1 ? list[1] : null;
  const extra = heir ? modelBlockExtra(heir) : "";
  list.splice(at, 1);
  if (at > 0) list[at - 1].separator = block.separator;
  // **A container's last child always has an empty separator**, which is the
  // tiler's own shape — a container's `map` runs into the blank line after it,
  // so the trailing blanks were handed back to the container's separator at
  // parse. A removal that left a stale one behind would emit that blank line
  // twice: once inside the container and once after it.
  if (block.parent && list.length) list[list.length - 1].separator = "";
  if (heir) {
    modelSetLeadingAffix(heir, extra);
    modelTouch(heir);
  }
  if (block.parent) modelTouch(block.parent);
  block.parent = null;
  return true;
}

/**
 * Take a block out, and take every container the removal emptied with it.
 *
 * **The unwinding is the point.** A list holding no items serialises to nothing
 * and renders to an empty `<ul>` the caret can sit inside — a document that
 * looks broken rather than one that is — so an item whose last child left goes,
 * and then the list whose last item left, all the way up. It recurses rather
 * than stopping at one level for `modelTouch`'s reason: there is no case where
 * an empty container should survive, so a stop condition would be a second rule
 * with nothing behind it.
 */
function modelPruneBlock(doc, block) {
  const parent = block.parent;
  if (!modelRemoveBlock(doc, block)) return false;
  if (parent && parent.children && parent.children.length === 0) modelPruneBlock(doc, parent);
  return true;
}

/**
 * Split an inline tree at `offset` into the part before and the part after,
 * with every mark the split landed inside reopened on the far side.
 *
 * `**one two**` cut between the words is `**one **` and `**two**` — the mark is
 * a node, so reopening it is copying the node rather than anything to do with
 * delimiters. The same goes for a link, which keeps its href on both halves,
 * and for a code span.
 *
 * An atom and a break are one character each, so neither can straddle: the
 * offset is an integer and the two branches above catch every case. The third
 * branch is there because a leaf that somehow reached it should go whole to one
 * side rather than be torn in half.
 */
function modelInlineSplit(nodes, offset) {
  const head = [];
  const tail = [];
  let seen = 0;
  for (const node of nodes || []) {
    const length = modelInlineText([node]).length;
    if (seen >= offset) {
      tail.push(node);
    } else if (seen + length <= offset) {
      head.push(node);
    } else if (node.children) {
      const inner = modelInlineSplit(node.children, offset - seen);
      node.children = inner.head;
      head.push(node);
      tail.push(Object.assign({}, node, { children: inner.tail }));
    } else if (node.kind === "text" || node.kind === "code-span") {
      const rest = node.content.slice(offset - seen);
      node.content = node.content.slice(0, offset - seen);
      node.raw = null;
      head.push(node);
      tail.push(Object.assign({}, node, { content: rest, raw: null }));
    } else {
      tail.push(node);
    }
    seen += length;
  }
  return { head, tail };
}

/**
 * Trim the whitespace a markdown block cannot carry off one edge of an inline
 * tree — the front when `side` is negative, the back when it is positive.
 *
 * **This is not tidying, it is the difference between a document and a broken
 * one.** markdown-it strips a block's leading and trailing whitespace before
 * inline parsing ever runs, so a split that left it there would put bytes in
 * the file that the next parse throws away, and the model and the file would
 * disagree the moment the document was reloaded. Three of those disagreements
 * are worse than invisible: four leading spaces make the tail an **indented
 * code block**, a space before a closing `**` stops it being emphasis at all,
 * and a paragraph indented three spaces plus one from the split is the first of
 * those again.
 *
 * It reaches into marks, because that is where the space is — cutting
 * `**one two**` after the space leaves `**one **`, whose closing delimiter is
 * no longer right-flanking. A mark emptied by the trim goes with it.
 *
 * Only `text` leaves are trimmed. A code span's own spaces are content that
 * survives a round trip, and an atom and a break have no whitespace to lose.
 */
function modelInlineTrimEdge(nodes, side) {
  while (nodes && nodes.length) {
    const index = side < 0 ? 0 : nodes.length - 1;
    const node = nodes[index];
    if (node.children) {
      modelInlineTrimEdge(node.children, side);
      if (node.children.length) return nodes;
      nodes.splice(index, 1);
      continue;
    }
    if (node.kind !== "text") return nodes;
    const trimmed = side < 0
      ? node.content.replace(/^[ \t]+/, "")
      : node.content.replace(/[ \t]+$/, "");
    if (trimmed === node.content) return nodes;
    node.content = trimmed;
    node.raw = null;
    if (trimmed !== "") return nodes;
    nodes.splice(index, 1);
  }
  return nodes;
}

/**
 * Split a leaf in two at `offset`, and hand back the new second half.
 *
 * Both halves are edited by definition — the first lost its tail and the second
 * has no bytes at all — so both are touched, which clears the containers above
 * them on the way. Returns null for a block with no inline tree, the way
 * `modelInlineSplice` does and for the same reason: their content is source,
 * and a caller that gets a null has to refuse rather than fall through.
 *
 * **`trim` is false for a paste, and only for a paste** (slice 5). The trim is
 * there because a markdown block cannot carry whitespace at its own edge, which
 * is true of a split that *stays* split — Enter. A paste splits only to put
 * something in the gap and then rejoins both sides, so the whitespace at the
 * cut ends up in the middle of a line, where it is ordinary text and trimming
 * it eats the space between two words.
 */
function modelSplitLeaf(doc, block, offset, trim = true) {
  modelUnshare(block);
  if (!block.inlines) return null;
  const extra = modelBlockExtra(block);
  const cut = modelInlineSplit(block.inlines, offset);
  block.inlines = trim ? modelInlineTrimEdge(cut.head, 1) : cut.head;
  if (block.inline) block.inline.children = modelInlineTokens(block.inlines);
  const fresh = modelLeafLike(doc, block, trim ? modelInlineTrimEdge(cut.tail, -1) : cut.tail);
  modelInsertBlockAfter(doc, block, fresh, extra);
  modelTouch(block);
  modelTouch(fresh);
  return fresh;
}

/**
 * Split a container after one of its children: that child and everything before
 * it stay, everything after it moves into a new container beside this one.
 *
 * **The separator between the two halves is the list's own**, not the one the
 * child split needed — `modelSiblingSeparator` above is the whole argument. A
 * tight list stays tight, a loose one loose, and an only-child list with no
 * convention recorded gets `"\n"`, which is the tight spelling and the one a
 * new bullet reads as.
 *
 * The first moved child becomes its new container's first, so it takes the
 * marker where it took the continuation indent — the same recomputation
 * `modelRemoveBlock` does, for the same reason.
 */
function modelSplitContainer(doc, container, after) {
  const kids = container.children;
  if (!kids) return null;
  const at = kids.indexOf(after);
  if (at < 0) return null;

  const list = modelSiblings(doc, container);
  const index = list.indexOf(container);
  if (index < 0) return null;
  const between = modelSiblingSeparator(doc, container) ?? "\n";

  const moved = kids.splice(at + 1);
  const fresh = modelContainerLike(doc, container);
  const next = modelNextMarker(doc, container);
  fresh.marker = next.marker;
  fresh.contentIndent = next.contentIndent;
  fresh.children = moved;

  const extras = moved.map((child) => modelBlockExtra(child));
  for (const child of moved) child.parent = fresh;
  if (moved.length) {
    modelSetLeadingAffix(moved[0], extras[0]);
    modelTouch(moved[0]);
  }

  fresh.parent = container.parent;
  fresh.separator = container.separator;
  container.separator = between;
  after.separator = "";
  list.splice(index + 1, 0, fresh);

  modelTouch(container);
  modelTouch(fresh);
  if (container.parent) modelTouch(container.parent);
  return fresh;
}

/**
 * Enter. Slice 4's step 2.
 *
 * **What splits is the block, and then its container when that container is an
 * item.** Enter in a top-level paragraph makes a paragraph; Enter in a quoted
 * paragraph makes a second quoted paragraph, because a quote is not an item and
 * the walk stops there; Enter in a bullet makes a bullet, because splitting the
 * paragraph alone would put two paragraphs inside one bullet — a thing to be
 * able to do, and not what Enter means.
 *
 * **Enter at the end of a heading opens a paragraph**, which is the one place
 * the new block's kind is not the old one's. Anywhere else in a heading it
 * splits into two headings of the same level: the text after the caret is still
 * heading text, and the alternative silently demotes it.
 *
 * Hands back the model position the caret lands on, or null when the block
 * cannot be split at all.
 */
function modelInsertParagraph(doc, block, offset, md) {
  if (!block.inlines) return null;

  let fresh;
  if (block.kind === "heading" && offset >= modelInlineText(block.inlines).length) {
    fresh = modelParagraphBlock(doc, md);
    modelInsertBlockAfter(doc, block, fresh);
    if (block.parent) modelTouch(block.parent);
  } else {
    fresh = modelSplitLeaf(doc, block, offset);
  }
  if (!fresh) return null;

  if (fresh.parent && fresh.parent.kind === "item") {
    modelSplitContainer(doc, fresh.parent, block);
  }
  return { block: fresh, offset: 0 };
}

/**
 * Shift+Enter. Slice 4's step 4.
 *
 * **A new break has no recorded spelling**, so it takes the one the caller was
 * handed — `sniffMarkdownStyle`'s `hardBreak`, read in `model-input.js` and
 * passed in rather than reached for here, which is the same boundary the parser
 * injection draws. That is the residue TODO 2.3 left behind, answered from two
 * directions at once: an existing break keeps the spelling its own node
 * recorded, and only a new one asks the document.
 *
 * The node carries `raw`, because for a break `raw` *is* the spelling and the
 * node now has one. It is written rather than left null so the round trip says
 * what the file says, instead of defaulting to two spaces in a document that
 * writes backslashes.
 */
function modelInsertBreak(block, offset, spelling = "  ") {
  modelUnshare(block);
  if (!block.inlines) return null;
  const cut = modelInlineSplit(block.inlines, offset);
  const node = {
    kind: "hardbreak",
    content: "",
    raw: (spelling === "\\" ? "\\" : "  ") + "\n",
    markup: "",
    children: null,
    token: null,
    closeToken: null,
  };
  block.inlines = modelInlineTrimEdge(cut.head, 1).concat([node], modelInlineTrimEdge(cut.tail, -1));
  if (block.inline) block.inline.children = modelInlineTokens(block.inlines);
  modelTouch(block);
  return offset + 1;
}

/**
 * Join `second` onto the end of `first`, and take `second` out of the tree.
 * Slice 4's step 3.
 *
 * This is what a deletion whose target range spans two blocks means, and it
 * falls out of `getTargetRanges()` rather than being special-cased — slice 3
 * already refuses exactly this case, in exactly this place, so what lands here
 * is the handling behind a refusal that was already correctly located.
 *
 * **Two leaves with no common text space cannot merge.** A paragraph and a
 * fence have none — one is an inline tree, the other is source — so this
 * refuses rather than approximating, the way every other refusal in this file
 * does. Hands back the offset the caret lands on: the join.
 */
function modelMergeBlocks(doc, first, second) {
  modelUnshare(first);
  modelUnshare(second);
  if (!first.inlines || !second.inlines) return null;
  const at = modelInlineText(first.inlines).length;
  for (const node of second.inlines) first.inlines.push(node);
  if (first.inline) first.inline.children = modelInlineTokens(first.inlines);
  modelTouch(first);
  modelPruneBlock(doc, second);
  return at;
}

/**
 * The document's blocks in reading order, containers and all.
 *
 * The order a caret moves through, which is what a merge needs to know: the
 * block before the one Backspace is at the start of is the one it joins onto,
 * and that block may be three containers away in the tree and next door on the
 * screen.
 */
function modelFlatten(doc) {
  const out = [];
  (function walk(blocks) {
    for (const block of blocks) {
      out.push(block);
      if (block.children) walk(block.children);
    }
  })(doc.blocks);
  return out;
}

// The leaf before or after this one in reading order, skipping the containers
// and the gaps — a gap renders to nothing, so it is not a place a caret can be
// and not a block anything can merge with.
function modelLeafBeside(doc, block, step) {
  const flat = modelFlatten(doc).filter((b) => !b.children && b.kind !== "gap");
  const at = flat.indexOf(block);
  if (at < 0) return null;
  return flat[at + step] || null;
}


// ── Structure: lists ─────────────────────────────────────────────────────────
//
// Slice 4's step 5. The two hand-rolled clusters move here and stop depending
// on an engine: `app.js`'s keydown handler for Enter and Backspace on an empty
// `<li>`, which exists because contenteditable splits the list and strands
// `<p><br></p>` blocks, and `outdentListItem`, which exists because Firefox
// merges a bullet into the item above and that markup is indistinguishable from
// a deliberate hard break.
//
// **As model rules they are one implementation with no engine in it**, which is
// what retires tests/list-indent-check.html and tests/list-empty-item-check.html
// as open questions — what those pages watch is three engines doing our surgery
// to their DOM, and there is no surgery left to watch.

/**
 * Whether a block holds no text at all.
 *
 * A container is empty when all of its children are; a leaf with an inline tree
 * is empty when that tree renders to nothing. **A leaf with no inline tree is
 * never empty**, because its content is source — a fence with an empty body is
 * still three lines of markdown, and deleting it is deleting a block rather
 * than emptying one.
 */
function modelIsEmptyBlock(block) {
  if (block.children) return block.children.every(modelIsEmptyBlock);
  if (!block.inlines) return false;
  return modelInlineText(block.inlines).length === 0;
}

// An indent, moved by a number of columns, in units of whatever it is made of.
// A tab-indented file keeps its tabs, which is 1b's step 5 arriving in the one
// other place that writes an indent: the same column in different bytes is a
// file the author did not write.
function modelShiftIndent(indent, columns) {
  if (!columns) return indent;
  if (columns > 0) {
    const tabbed = indent.includes("\t");
    const unit = tabbed ? "\t" : " ";
    const width = tabbed ? 4 : 1;
    return unit.repeat(Math.max(1, Math.round(columns / width))) + indent;
  }
  let out = indent;
  let left = -columns;
  while (left > 0 && out.length) {
    const width = out[0] === "\t" ? 4 : 1;
    if (width > left) break;
    out = out.slice(1);
    left -= width;
  }
  return out;
}

// An item's marker with its indent replaced, keeping the marker itself and its
// pad exactly as the author wrote them. `"  - "` moved out two columns is
// `"- "`, and the bullet character, the pad and a tab's worth of anything else
// are untouched.
function modelReindentMarker(marker, columns) {
  if (marker === null) return null;
  const lead = /^[ \t]*/.exec(marker)[0];
  return modelShiftIndent(lead, columns) + marker.slice(lead.length);
}

/**
 * Move an item into another list, and take everything under it along.
 *
 * **The indent is absolute in this model**, which is what makes this the whole
 * of an indent or an outdent: `modelItemPrefix` records `"    - "` with its
 * columns in it, and `modelEmitLeaf` notes that only the nearest item ancestor
 * contributes because a nested item's marker already carries every outer one.
 * So moving an item means shifting every marker and continuation indent beneath
 * it by the same number of columns, and there is no relative form to recompute
 * from.
 *
 * Every leaf under the item is re-affixed and touched, because every one of
 * their lines genuinely changes. That is the one operation in this file that
 * re-emits a subtree rather than a block, and it is not a slip: an outdented
 * bullet's bytes all move.
 */
function modelMoveItem(doc, item, list, index, marker, contentIndent) {
  const leaves = modelFlatten({ blocks: [item] }).filter((block) => !block.children);
  const extras = leaves.map((leaf) => modelBlockExtra(leaf));
  const source = new Map(leaves.filter((leaf) => !leaf.inlines).map((leaf) => [leaf, leaf.source]));
  const columns = modelMarkerColumn(marker) - modelMarkerColumn(item.marker);
  const between = (list.children.length ? modelSiblingSeparator(doc, list.children[0]) : null) ?? "\n";

  modelPruneBlock(doc, item);
  item.marker = marker;
  item.contentIndent = contentIndent;

  // **The indent is absolute**, so every marker beneath this one moves with it.
  for (const block of columns ? modelFlatten({ blocks: [item] }) : []) {
    if (block === item || block.kind !== "item") continue;
    block.marker = modelReindentMarker(block.marker, columns);
    if (block.contentIndent !== null) block.contentIndent = modelShiftIndent(block.contentIndent, columns);
  }

  const before = index > 0 ? list.children[index - 1] : null;
  item.parent = list;
  item.separator = before ? before.separator : (list.children.length ? between : "");
  if (before) before.separator = between;
  list.children.splice(index, 0, item);

  // Before the loop below, not after it: the loop *writes* a source for every
  // leaf that has no inline tree, and a touch afterwards would clear exactly
  // those bytes again.
  modelTouch(item);
  modelTouch(list);

  leaves.forEach((leaf, at) => {
    // **A leaf with no inline tree has its bytes rewritten rather than
    // composed**, which is step 6's inversion reaching back into step 5. Two
    // kinds get here: an *empty item*, which 1b records as a childless leaf
    // holding nothing but its own marker, and a fence or an indented code
    // block inside the item being moved, every line of which has just changed
    // column. The emitter refuses both — correctly, since it has nothing to
    // compose from — so the move writes the source itself.
    if (!leaf.inlines) {
      modelTouch(leaf);
      leaf.source = leaf === item
        ? ((leaf.quotePrefixes && leaf.quotePrefixes[0]) || "") + (marker ?? "")
        : modelShiftSource(source.get(leaf), columns);
      if (leaf === item) leaf.source = leaf.source.replace(/[ \t]+$/, "");
      return;
    }
    modelSetLeadingAffix(leaf, extras[at]);
    modelTouch(leaf);
  });
  return item;
}

// Every line of a block's source, moved by a number of columns. What an indent
// or an outdent does to a fence: its body is source, so nothing composes it
// back and the bytes have to be moved directly.
function modelShiftSource(text, columns) {
  if (!text || !columns) return text ?? "";
  return text.split("\n").map((line) => {
    const lead = /^[ \t]*/.exec(line)[0];
    return modelShiftIndent(lead, columns) + line.slice(lead.length);
  }).join("\n");
}

// The column an item's own marker starts at, which is the only part of it that
// an indent or an outdent moves.
function modelMarkerColumn(marker) {
  return modelIndentColumn(/^[ \t]*/.exec(marker || "")[0]);
}

/**
 * Shift+Tab, and a nested empty item's Enter. Move an item out one level, to
 * sit after the item it was nested under.
 *
 * **Its followers come with it, nested under it**, which is the shape
 * `outdentListItem` settled on in a real browser: they were below it on screen
 * and they stay below it, and appending them in document order is what that
 * function had to learn the hard way — prepending each in turn reversed the run,
 * which needs two followers to be visible at all and so had no test until an
 * engine showed it.
 *
 * Refuses an item that is not nested inside another item, which is the same
 * guard `canOutdentListItem` makes today: markdown has no way to write a first
 * item nested under nothing.
 */
function modelOutdentItem(doc, item) {
  const inner = item.parent;
  if (!inner || inner.kind !== "list") return null;
  const owner = inner.parent;
  if (!owner || owner.kind !== "item") return null;
  const outer = owner.parent;
  if (!outer || outer.kind !== "list") return null;

  const at = inner.children.indexOf(item);
  const followers = inner.children.splice(at + 1);

  const next = modelNextMarker(doc, owner);
  modelMoveItem(doc, item, outer, outer.children.indexOf(owner) + 1, next.marker, next.contentIndent);

  // **After the move, never before it.** The followers were the item's
  // siblings at one column and become its children at the column its content
  // now starts at, which on an ordinary outdent is the same column — so they
  // do not move at all. Attached first, `modelMoveItem`'s shift would have
  // caught them in the item's subtree and moved them twice.
  if (followers.length) modelAdoptItems(doc, item, followers);
  return item;
}

/**
 * Take a run of items in under `item`, into its own sublist.
 *
 * They are shifted to the column the item's content starts at rather than by
 * the item's own delta, which is the difference between where they were and
 * where they now are — and on an outdent that difference is zero, because a
 * follower goes out one level and down one level at the same time.
 */
function modelAdoptItems(doc, item, items) {
  if (!items.length) return null;
  let sub = item.children && item.children.length
    ? item.children[item.children.length - 1]
    : null;
  if (!sub || sub.kind !== "list") {
    sub = modelContainerLike(doc, items[0].parent || item);
    sub.marker = null;
    sub.contentIndent = null;
    // `"\n"` rather than a blank line: a sublist follows its item's own
    // paragraph on the very next line, and a blank one between them is what
    // makes a tight list loose.
    modelAppendChild(doc, item, sub, "\n");
  }

  const columns = modelIndentColumn(item.contentIndent ?? "") - modelMarkerColumn(items[0].marker);
  const last = sub.children.length ? sub.children[sub.children.length - 1] : null;
  if (last) last.separator = modelSiblingSeparator(doc, last) ?? "\n";
  for (const follower of items) {
    follower.parent = sub;
    sub.children.push(follower);
    if (!columns) continue;
    for (const block of modelFlatten({ blocks: [follower] })) {
      if (block.kind !== "item") continue;
      block.marker = modelReindentMarker(block.marker, columns);
      if (block.contentIndent !== null) block.contentIndent = modelShiftIndent(block.contentIndent, columns);
    }
  }
  sub.children[sub.children.length - 1].separator = "";
  modelTouch(sub);
  return sub;
}

/**
 * Tab. Nest an item under the one before it.
 *
 * **A first item cannot be indented**, and that is markdown's rule rather than
 * a preference: there is nothing for it to nest under, and an indent written
 * anyway reparses as a continuation of whatever came before the list. The same
 * guard `canIndentListItem` makes today.
 *
 * It joins the previous item's existing sublist when there is one, so two Tabs
 * on two consecutive items give one nested list rather than two — and it takes
 * that list's own marker, which is the document's convention read from the
 * place it is written.
 */
function modelIndentItem(doc, item) {
  const list = item.parent;
  if (!list || list.kind !== "list") return null;
  const at = list.children.indexOf(item);
  if (at <= 0) return null;
  const owner = list.children[at - 1];

  let sub = owner.children && owner.children.length
    ? owner.children[owner.children.length - 1]
    : null;
  if (!sub || sub.kind !== "list") {
    sub = modelContainerLike(doc, list);
    sub.marker = null;
    sub.contentIndent = null;
    modelAppendChild(doc, owner, sub, "\n");
  }

  const model = sub.children.length ? sub.children[sub.children.length - 1] : null;
  let marker = null;
  let contentIndent = null;
  if (model) {
    const next = modelNextMarker(doc, model);
    marker = next.marker;
    contentIndent = next.contentIndent;
  } else {
    // A sublist with nothing in it yet has no convention of its own, so the
    // item's own marker moves right — **except for its number**, which starts
    // again at one. An ordered list opening at `2.` is legal CommonMark and is
    // not what anybody writing one means; the digits belong to the list, and
    // this is a new list.
    const columns = modelIndentColumn(owner.contentIndent ?? "") - modelMarkerColumn(item.marker);
    marker = modelReindentMarker(item.marker, columns);
    const digits = MODEL_ORDERED_MARKER.exec(marker || "");
    if (digits) marker = digits[1] + "1" + digits[3];
    contentIndent = item.contentIndent === null ? null : modelShiftIndent(item.contentIndent, columns);
    if (contentIndent !== null && marker !== null && contentIndent.length !== marker.length &&
        item.contentIndent.length === item.marker.length) {
      contentIndent = marker.length > contentIndent.length
        ? contentIndent + " ".repeat(marker.length - contentIndent.length)
        : contentIndent.slice(0, marker.length);
    }
  }
  return modelMoveItem(doc, item, sub, sub.children.length, marker, contentIndent);
}

/**
 * Append a block as a container's last child.
 *
 * The separator goes on the child it displaces from that position, because a
 * separator describes what follows a block rather than what precedes it, and
 * the new last child has nothing after it.
 */
function modelAppendChild(doc, container, child, separator) {
  if (!container.children) container.children = [];
  const extra = modelBlockExtra(child);
  const kids = container.children;
  if (kids.length) kids[kids.length - 1].separator = separator ?? modelBlankSeparator(container);
  child.parent = container;
  child.separator = "";
  kids.push(child);
  modelSetLeadingAffix(child, extra);
  modelTouch(container);
  return child;
}

/**
 * Lift an item out of its list altogether, as a paragraph after it.
 *
 * The top-level half of the empty-item rules: Enter splits the list at the item
 * — what was above stays, what was below becomes a fresh list after the new
 * paragraph — and Backspace, which only reaches this on a first item, puts the
 * paragraph before the list and leaves the rest of it intact. Both are
 * `app.js`'s handler, which is the specification because it is what users have.
 */
function modelLiftItem(doc, item, md, before = false) {
  const list = item.parent;
  if (!list || list.kind !== "list") return null;
  const at = list.children.indexOf(item);
  const paragraph = modelParagraphBlock(doc, md);
  paragraph.quotePrefixes = item.quotePrefixes ? item.quotePrefixes.slice() : null;

  if (before) {
    modelRemoveBlock(doc, item);
    const outer = modelSiblings(doc, list);
    paragraph.parent = list.parent;
    paragraph.separator = modelBlankSeparator(list);
    outer.splice(outer.indexOf(list), 0, paragraph);
    modelSetLeadingAffix(paragraph, "");
    if (list.parent) modelTouch(list.parent);
    if (!list.children.length) modelPruneBlock(doc, list);
    return paragraph;
  }

  const followers = list.children.slice(at + 1);
  for (const child of followers) list.children.splice(list.children.indexOf(child), 1);
  if (list.children.length) list.children[list.children.length - 1].separator = "";
  const extras = followers.map((child) => modelBlockExtra(child));
  modelRemoveBlock(doc, item);
  modelInsertBlockAfter(doc, list, paragraph);

  if (followers.length) {
    const rest = modelContainerLike(doc, list);
    rest.children = followers;
    for (const child of followers) child.parent = rest;
    followers[followers.length - 1].separator = "";
    modelSetLeadingAffix(followers[0], extras[0]);
    modelTouch(followers[0]);
    modelInsertBlockAfter(doc, paragraph, rest);
    modelTouch(rest);
  }
  if (!list.children.length) modelPruneBlock(doc, list);
  return paragraph;
}

/**
 * Enter or Backspace on an empty item. Slice 4's step 5, and it is `app.js`'s
 * keydown handler with the engine taken out.
 *
 * Four behaviours, in the order that handler tests them: Backspace with a
 * bullet directly above removes the item and puts the caret at the end of that
 * bullet — where the user expected it, and where contenteditable would not have
 * put it; a nested empty item outdents one level rather than leaving the list
 * outright, for Enter and a first-item Backspace alike; and a top-level one
 * leaves the list for a paragraph.
 */
function modelEmptyItemKey(doc, item, md, backspace) {
  const list = item.parent;
  if (!list || list.kind !== "list") return null;
  const at = list.children.indexOf(item);

  if (backspace && at > 0) {
    const above = list.children[at - 1];
    const tail = modelLeafBeside(doc, modelFlatten({ blocks: [item] }).find((b) => !b.children), -1);
    modelPruneBlock(doc, item);
    const target = tail && modelFlatten({ blocks: [above] }).includes(tail) ? tail : null;
    return target ? { block: target, offset: modelInlineText(target.inlines || []).length } : null;
  }

  const outdented = modelOutdentItem(doc, item);
  if (outdented) {
    const first = modelFlatten({ blocks: [outdented] }).find((block) => !block.children);
    return first ? { block: first, offset: 0 } : null;
  }

  const paragraph = modelLiftItem(doc, item, md, backspace);
  return paragraph ? { block: paragraph, offset: 0 } : null;
}

// ── Structure: leaves edited as source ───────────────────────────────────────
//
// Slice 4's step 6. A fence and an indented code block are the two leaves whose
// rendering is a `<pre><code>` a caret can enter, so they are the two that need
// a second text space: offsets into the block's own body rather than into an
// inline tree. A gap renders to nothing and has no DOM to be edited through, an
// `html_block`'s text is not its source, and a table row refuses — step 7.

// Whether this block is edited as source rather than as an inline tree.
function modelBearsSource(block) {
  return !block.children && !block.inlines && (block.kind === "fence" || block.kind === "code");
}

// The body a fence or an indented code block renders, which is also what the
// parser recorded. markdown-it's own `content` for both is the body with every
// line's prefix already taken off, which is exactly the text the `<pre>` holds.
function modelSourceText(block) {
  const token = block.tokens.find((candidate) => candidate.type === "fence" || candidate.type === "code_block");
  return token ? token.content : "";
}

/**
 * What the file put in front of each of a source-bearing block's body lines.
 *
 * Read off the block's own bytes rather than recomposed from the affixes it
 * recorded, because for these kinds there is nothing recorded: `leadingAffix`
 * is only ever set for a block with an inline token, and a fence has none. The
 * subtraction is the same one the tiler makes — a source line ends with its own
 * content line, and everything before that is the prefix.
 *
 * A line the edit added past the end takes the last prefix recorded, which is
 * `modelEmitLeaf`'s rule for a quote chain one construct along.
 */
function modelSourcePrefixes(block) {
  const lines = block.source === null ? [] : block.source.split("\n");
  const body = modelSourceText(block).split("\n");
  if (body.length && body[body.length - 1] === "") body.pop();
  const first = block.kind === "fence" ? 1 : 0;
  const out = [];
  for (let i = 0; i < body.length; i += 1) {
    const line = lines[first + i];
    out.push(line !== undefined && line.endsWith(body[i]) ? line.slice(0, line.length - body[i].length) : "");
  }
  return out;
}

/**
 * Replace `[from, to)` in a source-bearing block's body, and hand back the
 * offset the caret lands on.
 *
 * **The block keeps a `source`, and it is the new bytes.** That is `modelTouch`
 * read inverted, and it is the honest shape rather than an exception carved out
 * of it: the contract is that a block whose content changed must not re-emit
 * its old bytes, and for a leaf whose content *is* source the new bytes satisfy
 * it directly. Its ancestors are cleared exactly as any other edit clears them,
 * so the recursion still reaches it — `modelEmitBlock`'s first case then hands
 * back bytes that are true.
 *
 * The parser's own `content` is updated alongside, because that is what
 * markdown-it's fence rule renders from. Updating the token the parser produced
 * is not the same thing as inventing one.
 */
function modelSourceSplice(block, from, to, text, md) {
  modelUnshare(block);
  if (!modelBearsSource(block)) return null;
  const body = modelSourceText(block);
  const start = Math.max(0, Math.min(from, body.length));
  const end = Math.max(start, Math.min(to, body.length));
  const typed = modelNormaliseTyped(text);
  const next = body.slice(0, start) + typed + body.slice(end);

  const prefixes = modelSourcePrefixes(block);
  const last = prefixes.length ? prefixes[prefixes.length - 1] : "";
  const lines = block.source === null ? [] : block.source.split("\n");
  const head = block.kind === "fence" ? lines.slice(0, 1) : [];
  const foot = block.kind === "fence" && lines.length > 1 ? lines.slice(-1) : [];

  const bodyLines = next.split("\n");
  if (bodyLines.length && bodyLines[bodyLines.length - 1] === "") bodyLines.pop();
  const composed = bodyLines.map((line, i) => (line === "" ? (prefixes[i] ?? last).replace(/[ \t]+$/, "") : (prefixes[i] ?? last) + line));

  const token = block.tokens.find((candidate) => candidate.type === "fence" || candidate.type === "code_block");
  if (token) token.content = next;
  modelTouch(block);
  block.source = head.concat(composed, foot).join("\n");
  return start + typed.length;
}

/**
 * The document always has a block the caret can be in, and it is never a table.
 *
 * Two rules in one function because they are one question. `modelRender` draws
 * a filler paragraph belonging to no block when a document has none, which was
 * slice 1's placeholder for the first: deleting everything leaves **one empty
 * paragraph block**, so the caret is always inside something the model knows
 * the name of.
 *
 * The second is the `contenteditable="false"` trap slice 4 was warned about
 * before it was built. A table's subtree refuses the caret, so a table as the
 * last block leaves nowhere to go and the document becomes un-appendable — new
 * here, because today everything is editable. An empty paragraph after it is
 * the answer, and it is **free**: an empty block emits nothing and takes the
 * separator before it, so the file is byte for byte what it was.
 */
function modelEnsureBlock(doc, md) {
  const last = doc.blocks.length ? doc.blocks[doc.blocks.length - 1] : null;
  if (last && last.kind !== "table") return null;
  const block = modelParagraphBlock(doc, md);
  if (last) {
    modelInsertBlockAfter(doc, last, block);
    last.separator = modelBlankSeparator(last);
  } else {
    doc.blocks.push(block);
  }
  return block;
}

// The nearest item a block sits in, or null. What Tab, Shift+Tab and the
// empty-item rules all ask first.
function modelItemAncestor(block) {
  for (let node = block; node; node = node.parent) {
    if (node.kind === "item") return node;
  }
  return null;
}

/**
 * Give an empty item somewhere to type.
 *
 * 1b records an empty item as a **leaf** holding nothing but its own marker,
 * which is right for the file — there is no paragraph there for a span to be
 * taken from — and useless for a caret, which has to be inside a block that can
 * hold text. So the first keystroke in one turns it into the container it is
 * about to be.
 *
 * The paragraph's tokens are hidden when a sibling item's are, which is what
 * keeps a tight list tight: markdown-it hides a tight item's paragraph, so a
 * visible one would render `<p>` inside the `<li>` and the list would go loose
 * on screen without a byte of the file changing.
 *
 * The bytes do not change either way — an empty item emitted from an empty
 * paragraph is the same trimmed marker it was — so this costs nothing until
 * something is typed.
 */
function modelFillItem(doc, item, md) {
  if (item.children || item.inlines) return null;
  const paragraph = modelParagraphBlock(doc, md);
  paragraph.quotePrefixes = item.quotePrefixes ? item.quotePrefixes.slice() : null;

  const list = item.parent;
  const sibling = list && list.children
    ? list.children.find((child) => child !== item && child.children && child.children[0])
    : null;
  const model = sibling ? sibling.children[0] : null;
  if (model && model.tokens[0] && model.tokens[0].hidden) {
    paragraph.tokens[0].hidden = true;
    paragraph.tokens[paragraph.tokens.length - 1].hidden = true;
  }

  // **An empty item's marker has no pad**, because there was nothing after it
  // to pad from — `modelItemPrefix` records `-` where a written item records
  // `- `. So an item that has just been given somewhere to type needs the
  // separator its own bytes never had, which is the empty-heading rule in
  // `modelEmitLeaf` one construct along and fails the same way without it: the
  // file stops holding a list and the document looks right on screen.
  if (item.marker !== null && !/[ \t]$/.test(item.marker)) {
    item.marker += " ";
    item.contentIndent = " ".repeat(item.marker.length);
  }

  item.children = [paragraph];
  item.leading = "";
  paragraph.parent = item;
  paragraph.separator = "";
  modelSetLeadingAffix(paragraph, "");
  modelTouch(paragraph);
  return paragraph;
}

// ── Structure: splicing in a second document ─────────────────────────────────
//
// Slice 5's step 1. A paste parses to a **second document**, and nothing in it
// is safe to put into the first as it stands: its ids were minted from 1 and
// collide, and its bytes were written flush left with none of the affixes the
// place it lands needs. Both failures are silent — one hands `modelElementFor`
// the wrong element, the other writes lines into a quote that carry no `> `.

/**
 * Make a second document's blocks fit this one, in place.
 *
 * `like` is the block they land beside, and everything positional is taken from
 * it: the quote chain a block inside a quote has to carry on every line, and
 * the column an item's marker has to start at. Everything identifying is taken
 * from `doc`: a fresh id per block, from the counter that exists so that a
 * block the editor creates can never wear a block the parser created's name.
 *
 * **Every adopted block loses its `source`.** That looks like throwing bytes
 * away and is the opposite: the bytes it has describe a document that no longer
 * exists, written at column 0 with no chain and no indent, so re-emitting them
 * is how a paste into a blockquote stops being quoted. Cleared, the block goes
 * through `modelEmitLeaf`, which is what composes an affix from a position —
 * the one thing the emitter is for.
 */
function modelAdoptBlocks(doc, blocks, like) {
  const chain = like.quotePrefixes;
  const item = modelItemAncestor(like);
  const column = item && item.contentIndent !== null ? modelIndentColumn(item.contentIndent) : 0;

  const quote = chain && chain.length ? chain[0] : "";

  const walk = (list, parent) => {
    for (const block of list) {
      const bytes = block.source;
      block.id = modelMintId(doc);
      block.source = null;
      block.parent = parent;
      block.quotePrefixes = chain ? chain.slice() : null;
      // An item's marker is absolute in this model (slice 4), so a list pasted
      // into an indented context has every marker beneath it moved by the same
      // number of columns — the shift `modelMoveItem` does, arriving at the one
      // other place a block changes container.
      if (block.kind === "item" && column) {
        block.marker = modelReindentMarker(block.marker, column);
        if (block.contentIndent !== null) block.contentIndent = modelShiftIndent(block.contentIndent, column);
      }
      if (block.children) {
        walk(block.children, block);
      } else if (block.inlines) {
        modelSetLeadingAffix(block, "");
      } else {
        // **A leaf with no inline tree keeps its bytes**, which is slice 4's
        // inversion arriving here: its content *is* source, the emitter refuses
        // it, and clearing the source would leave nothing able to write a fence
        // back at all. So the bytes are moved rather than dropped — every line
        // shifted to its new column and given the quote chain it now sits
        // behind.
        block.source = quote
          ? modelShiftSource(bytes, column).split("\n").map((line) => (line === "" ? quote.replace(/[ \t]+$/, "") : quote + line)).join("\n")
          : modelShiftSource(bytes, column);
      }
    }
  };
  walk(blocks, like.parent);
  return blocks;
}

/**
 * Put a run of blocks into the document at a position inside `block`.
 *
 * **The splice rule is the conventional one**, and it is written here rather
 * than in the caller because it is where pasting feels wrong when it is wrong:
 * the block is split at the offset, the first pasted block merges into the
 * head, the last merges into the tail, and whole blocks land between. A
 * one-block paste is that with nothing in the middle, which is the common case
 * and reduces to an inline splice — so it is taken first, and never reaches the
 * structural path at all.
 *
 * **They land as siblings of the block the caret was in.** Enter promotes to
 * the nearest item; this does not, so pasting three paragraphs into a bullet
 * gives one bullet holding three paragraphs rather than three bullets. Nothing
 * is lifted out of the container the caret was in, which is the direction worth
 * being cowardly in: a paste that moved content *out* of a list would be a
 * structural edit nobody asked for.
 *
 * Returns the model position the caret lands on — the end of what was pasted —
 * or null when the target cannot take it.
 */
function modelInsertBlocks(doc, block, offset, blocks) {
  modelUnshare(block);
  if (!blocks.length) return { block, offset };
  if (!block.inlines) return null;
  modelAdoptBlocks(doc, blocks, block);

  const first = blocks[0];
  const last = blocks[blocks.length - 1];

  // One leaf, merged straight in: the whole of an ordinary paste of a few
  // words, and it must not split anything.
  if (blocks.length === 1 && first.inlines && !first.children) {
    const cut = modelInlineSplit(block.inlines, offset);
    block.inlines = cut.head.concat(first.inlines, cut.tail);
    if (block.inline) block.inline.children = modelInlineTokens(block.inlines);
    modelTouch(block);
    return { block, offset: offset + modelInlineText(first.inlines).length };
  }

  // Never trimmed: the two halves are about to be rejoined around what is
  // pasted, so the whitespace at the cut is in the middle of a line.
  const tail = modelSplitLeaf(doc, block, offset, false);
  if (!tail) return null;

  let after = block;
  for (const pasted of blocks) {
    modelInsertBlockAfter(doc, after, pasted);
    after = pasted;
  }

  // The first and last pasted blocks join the two halves of what was split
  // rather than sitting beside them, which is what makes a paste in the middle
  // of a sentence read as one sentence and not as three paragraphs. A pasted
  // *container* — a whole list — joins neither, and sits between them.
  //
  // The caret goes where the tail rejoins, which is the end of what was
  // pasted. `modelMergeBlocks` hands back exactly that offset.
  let at = { block: tail, offset: 0 };
  if (last.inlines && !last.children && tail.inlines) {
    const join = modelMergeBlocks(doc, last, tail);
    if (join !== null) at = { block: last, offset: join };
  } else {
    // Nothing joined the tail, so it is a block in its own right again and the
    // whitespace at the cut is at its own edge after all — where markdown
    // cannot carry it. This is the one case the untrimmed split above has to
    // hand back, and it is exactly Enter's rule applying because the two halves
    // stayed apart.
    modelInlineTrimEdge(tail.inlines, -1);
    if (tail.inline) tail.inline.children = modelInlineTokens(tail.inlines);
    modelTouch(tail);
  }
  // `first === last` cannot reach here: a single mergeable leaf took the fast
  // path above, and a single container fails this test as it fails the one
  // before it.
  if (first !== last && first.inlines && !first.children && block.inlines) {
    modelMergeBlocks(doc, block, first);
  }
  return at;
}

/**
 * Plain text as blocks, with nothing parsed.
 *
 * **Never markdown**, which is today's behaviour and the reason Insert →
 * *Paste markdown* is a separate action. In the model that is stronger than it
 * is today: a pasted `*foo*` becomes a text node whose `raw` is null, so
 * `modelEmitLeaf` escapes it on the way out and it stays literal in the file
 * rather than becoming emphasis the moment it is saved.
 *
 * A blank line starts a paragraph and a single newline is a softbreak inside
 * one, which is what the text itself says and what markdown means by the same
 * two shapes. U+00A0 is normalised here for the reason slice 3 gives: this is
 * the boundary, and it is the only place the character can be caught before it
 * is in the document.
 */
function modelTextBlocks(doc, md, text) {
  const out = [];
  for (const chunk of String(text).replace(/\r\n?/g, "\n").split(/\n[ \t]*\n+/)) {
    if (!chunk.length) continue;
    const block = modelParagraphBlock(doc, md);
    const lines = chunk.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (i) block.inlines.push({ kind: "softbreak", content: "", raw: null, markup: "", children: null, token: null, closeToken: null });
      if (lines[i]) block.inlines.push(modelTextNode(modelNormaliseTyped(lines[i])));
    }
    if (block.inline) block.inline.children = modelInlineTokens(block.inlines);
    out.push(block);
  }
  return out;
}

// ── History ──────────────────────────────────────────────────────────────────
//
// Stage 2's slice 6, step 1. An undo state is a **clone of the document**,
// decided against copy-on-write on 2026-09-19: blocks are mutable and the tree
// is cyclic through `parent`, so a state had to be either a clone or a sharing
// scheme, and the clone leaves `modelTouch` and the `parent` link it walks up
// exactly as they are. It is also strictly cheaper than what ships, which
// snapshots the entire document as an HTML string on the same cadence and has
// never been complained about.
//
// **Not `structuredClone`, and the cycle was never why.** It handles the cycle
// perfectly well, and then hands back markdown-it's `Token` as a bare object —
// which is what the structured clone algorithm does with a class instance — so
// the renderer throws `token.attrIndex is not a function` on the first image or
// fence in the document. Measured against the pinned markdown-it 13.0.1 rather
// than assumed, which is how the decision came to be written down wrong.
//
// **Every token is cloned and none is shared. Settled 2026-09-21, measured.**
// The inline tokens were never in question — `modelInlineTokens` reassigns
// `inline.children` after every edit, so two states sharing one inline token
// share one edit. The block-level ones look shareable and are not:
// `modelSourceSplice` writes `token.content` on a fence, so a shared fence
// token would give back an undo whose `source` holds the old bytes and whose
// token holds the new ones — the screen rendering the code the undo was meant
// to take back while a save files the code it did. **And nothing would report
// it**: `modelVerifyRender` skips exactly the blocks with no inline tree. The
// saving was 0.19ms on `docs/TODO.md` and 0.23ms on `CLAUDE.md` per step,
// against a full render at 16.8ms — so what sharing bought was a rule ("no
// command may mutate a token in place") that every future command would have to
// remember and that the shipped code has already broken once.
//
// **Aliases are preserved rather than flattened**, which is what `seen` is for.
// A block's `inline` *is* one of its own `tokens` — all 861 inline-bearing
// leaves in the oracle — and a `hiddenBefore` is a token out of the block
// before it, all 12 of them. Copy those twice and the two copies can disagree:
// `modelFillItem` sets `hidden` on a token one block reads through `tokens` and
// another through `hiddenBefore`. A map keyed on the original token makes the
// clone's token graph isomorphic to the original's instead of merely
// equivalent, which is a stronger property and costs one `Map`.

/**
 * One token, and everything under it, copied once per clone.
 *
 * `children` is followed because the `inline` token's are the block's inline
 * tokens, and a state that shared that array would share every edit made
 * through it. `map` is copied for the same reason nothing else here is shared:
 * a state has no business holding a reference into a document that is still
 * being edited, and it is two numbers.
 *
 * `meta` is the one thing carried by reference. markdown-it leaves it null and
 * no rule this project configures writes one — asserted in the `model` suite
 * across all 17,946 tokens of the oracle, so a parser upgrade that starts using
 * it fails a check rather than quietly sharing whatever it holds.
 */
function modelCloneTokenInto(token, seen) {
  const already = seen.get(token);
  if (already) return already;
  const copy = modelCloneToken(token);
  seen.set(token, copy);
  if (Array.isArray(token.map)) copy.map = token.map.slice();
  if (Array.isArray(token.children)) {
    copy.children = token.children.map((child) => modelCloneTokenInto(child, seen));
  }
  return copy;
}

// An inline node holds two token references, its children, and otherwise
// strings — `kind`, `markup`, `content`, `raw`, `tail`. So the copy is the
// object plus those three fields, and modelUnshare below is its only caller:
// it is what gives one block its contents back before an edit writes to them.
function modelCloneInlinesInto(nodes, seen) {
  return nodes.map((node) => {
    const copy = Object.assign({}, node);
    if (node.token) copy.token = modelCloneTokenInto(node.token, seen);
    if (node.closeToken) copy.closeToken = modelCloneTokenInto(node.closeToken, seen);
    if (node.children) copy.children = modelCloneInlinesInto(node.children, seen);
    return copy;
  });
}

function modelForkBlock(block, parent) {
  block.shared = true;
  const copy = Object.assign({}, block);
  copy.parent = parent;
  copy.quotePrefixes = block.quotePrefixes ? block.quotePrefixes.slice() : null;
  copy.headingShape = block.headingShape ? Object.assign({}, block.headingShape) : null;
  copy.children = block.children
    ? block.children.map((child) => modelForkBlock(child, copy))
    : null;
  return copy;
}

function modelForkDocument(doc) {
  return { ...doc, blocks: doc.blocks.map((block) => modelForkBlock(block, null)) };
}

/**
 * Give a block its own contents back, before anything writes to them.
 *
 * The write half of copy-on-write, and the reason sharing is safe here where
 * step 1 refused it: step 1 weighed sharing with *nothing protecting it*, where
 * an edit reaches backwards into a state nobody is looking at — and
 * `modelVerifyRender` skips exactly the blocks where that shows. A copy before
 * the write removes the hazard rather than accepting it.
 *
 * Idempotent, and cheap when it is a no-op, because it is called on paths that
 * run per keystroke. The deep copy is the one the whole-document clone used to
 * do, over one block instead of the document: prototypes preserved, and the
 * aliases inside the block kept, since `inline` *is* one of `tokens`.
 */
function modelUnshare(block) {
  if (!block || !block.shared) return block;
  const seen = new Map();
  block.tokens = block.tokens.map((token) => modelCloneTokenInto(token, seen));
  block.inline = block.inline ? modelCloneTokenInto(block.inline, seen) : null;
  block.hiddenBefore = block.hiddenBefore ? modelCloneTokenInto(block.hiddenBefore, seen) : null;
  block.inlines = block.inlines ? modelCloneInlinesInto(block.inlines, seen) : null;
  block.shared = false;
  return block;
}

/**
 * Put a state back: install a document and draw it.
 *
 * The other half of `modelForkDocument`, and it is here rather than in
 * `undo.js` because `modelDocument` is this file's variable and reaching into
 * it from outside would make "which document is open" a question with two
 * answers. What `undo.js` owns is the stack; what it asks for is this.
 *
 * `modelEnsureBlock` is deliberately **not** called. Every state was taken from
 * a document that had already been through it — `modelLoad` ensures before it
 * renders and `undoReset` runs after that — so calling it again could only
 * append a block the state never had, which is a document the user never saw
 * and cannot undo back out of.
 *
 * The caller passes a clone rather than the state it is holding, for the
 * reason the whole slice exists: the next keystroke mutates what this installs,
 * and a history entry that can be edited in place is not a history entry.
 */
function modelRestoreDocument(root, doc, md, selection = null) {
  modelDocument = doc;
  modelRender(root, doc, md, selection);
  return doc;
}

/**
 * A selection with block *ids* where the block references were.
 *
 * A state holds one of these rather than what `modelReadSelection` hands back,
 * because that carries references into the live document — the very document
 * the state exists to be independent of. Keep them and the caret is pinned to
 * blocks the restore is about to throw away, so the render would put it
 * nowhere; and the state would hold the live tree alive besides.
 *
 * Ids survive the clone, so the way back is a lookup rather than a search for
 * something that looks the same.
 */
function modelRecordSelection(selection) {
  if (!selection || !selection.block) return null;
  const at = { block: selection.block.id, offset: selection.offset };
  if (selection.to && selection.to.block) {
    at.to = { block: selection.to.block.id, offset: selection.to.offset };
  }
  return at;
}

// One block by id. A walk rather than `modelFlatten`, because this wants one
// block and that builds an array of every block in the document to find it.
function modelBlockById(doc, id) {
  let found = null;
  (function walk(blocks) {
    for (const block of blocks) {
      if (found) return;
      if (block.id === id) { found = block; return; }
      if (block.children) walk(block.children);
    }
  })(doc.blocks);
  return found;
}

/**
 * And the way back, **against the document being installed** rather than
 * against the one the state was taken from. That is the whole point of the
 * detour through ids: `undoApplyState` clones the stored state and resolves
 * into the clone, so the caret lands in the tree that is about to be rendered.
 *
 * A block this document does not have gives null rather than a guess — better
 * no caret than one in a place the document never had. It cannot normally
 * happen, since a state's selection is read at the same moment its clone is
 * taken, and it is answered rather than thrown because "cannot normally" is not
 * "cannot". An offset past the end of a block needs no such care:
 * `modelDomLocate` has clamped to the end since stage 1, which is `undo.js`'s
 * own rule kept on purpose.
 */
function modelResolveSelection(doc, at) {
  if (!at) return null;
  const block = modelBlockById(doc, at.block);
  if (!block) return null;
  const out = { block, offset: at.offset };
  if (at.to) {
    const to = modelBlockById(doc, at.to.block);
    if (to) out.to = { block: to, offset: at.to.offset };
  }
  return out;
}
