// The document model. TODO 3.1, stage 1 — docs/REWRITE.md is the design.
//
// Nothing loads this file yet. It is in none of the three registries
// (index.html, sw.js's SHELL_ASSETS, html-export.js's ASSETS) and will not be
// until stage 4, so `main`'s editor is untouched by everything here. What it
// is: the thing that will own the document once contenteditable stops owning
// it — an ordered list of blocks, each holding the exact bytes it arrived with
// and the exact bytes that followed it.
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
// The parser is passed in rather than reached for: in the app it will be the
// same configured instance app.js already builds, carrying the `math` and
// `referenceAwareLink` rules, and in the Deno suite it is a bare markdown-it.
// A module that fetched its own parser could not be tested without a browser,
// which is the whole point of doing this stage first.

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

// markdown-it's top-level block tokens, in source order, with the line span
// each covers. A container (a list, a quote) is one span: its children are
// inside it, and editing inside one is stage 2 and 3 work. Only the outermost
// level is asked for its `map`, because only the outermost level tiles the
// file without overlapping.
function modelTopLevelSpans(tokens) {
  const spans = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.level !== 0 || !token.map) {
      i += 1;
      continue;
    }
    if (token.nesting === 1) {
      let j = i + 1;
      while (j < tokens.length && !(tokens[j].level === 0 && tokens[j].nesting === -1)) j += 1;
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

// A block, before its source and separator are attached. `inline` is the token
// a paragraph or heading carries its content in — the editable structure once
// stage 2 converts it. Every other kind keeps its token slice and is edited as
// a whole for now.
function modelBlockFromSpan(span) {
  const kind = MODEL_BLOCK_KINDS[span.open.type] || "unknown";
  const inline = span.tokens.find((t) => t.type === "inline") || null;
  return {
    kind,
    level: kind === "heading" ? Number(span.open.tag.slice(1)) : 0,
    inline: kind === "paragraph" || kind === "heading" ? inline : null,
    tokens: span.tokens,
    inlines: null,       // stage 2 fills this from `inline`
    source: null,        // set by the caller, from the span
    separator: "",
  };
}

/**
 * Parse markdown into the block model.
 *
 * Returns `{ prefix, blocks }`, where every character of the input is in
 * exactly one of `prefix`, a block's `source`, or a block's `separator` — so
 * `modelSerialise` of an unedited model is the input, character for character.
 *
 * Lines no top-level token covers become blocks of kind `"gap"`. That is where
 * **reference definitions** live: markdown-it consumes a `[label]: url` line
 * and emits no token at all, which is why today they have no DOM node to
 * survive on and `appendReferenceDefinitions` has to collect them at the end
 * of the file regardless of where the author put them. Here the line simply
 * stays where it is, in its own block, rendered to nothing — and a definition
 * spanning several lines, which `scanReferenceDefinitions` cannot see today,
 * is just a taller gap.
 */
function modelParse(markdown, md) {
  const offsets = modelLineOffsets(markdown);
  const lines = markdown.split("\n");
  const spans = modelTopLevelSpans(md.parse(markdown, {}));

  // Where a line starts, and where a block ending before `line` ends — the
  // newline that terminates a block's last line belongs to the separator, not
  // to the block, or every block would carry one and the two could not be told
  // apart when a block is re-emitted.
  const startOf = (line) => (line < offsets.length ? offsets[line] : markdown.length);
  const endOf = (line) => (line < offsets.length ? Math.min(offsets[line] - 1, markdown.length) : markdown.length);

  const pieces = [];
  let line = 0;

  const takeGap = (from, to) => {
    // Blank lines between blocks are separator, not content. Anything else —
    // a reference definition, a stray line markdown-it swallowed — is a block.
    let first = from;
    while (first < to && modelIsBlankLine(lines[first])) first += 1;
    if (first >= to) return;
    let last = to - 1;
    while (last > first && modelIsBlankLine(lines[last])) last -= 1;
    pieces.push({
      block: { kind: "gap", level: 0, inline: null, tokens: [], inlines: null, source: null, separator: "" },
      start: first,
      end: last + 1,
    });
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
    pieces.push({ block: modelBlockFromSpan(span), start: span.start, end });
    line = Math.max(line, span.end);
  }
  if (line < lines.length) takeGap(line, lines.length);

  const blocks = pieces.map((piece) => piece.block);
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const from = startOf(piece.start);
    const to = endOf(piece.end);
    piece.block.source = markdown.slice(from, to);
    const nextFrom = i + 1 < pieces.length ? startOf(pieces[i + 1].start) : markdown.length;
    piece.block.separator = markdown.slice(to, nextFrom);
  }

  return {
    prefix: pieces.length ? markdown.slice(0, startOf(pieces[0].start)) : markdown,
    blocks,
  };
}

/**
 * The model back to markdown.
 *
 * Two cases per block, and that is the whole design: a block still carrying its
 * `source` emits those bytes, and an edited block (`source === null`) is
 * emitted by `emit`, which stage 3 fills in with the sniffed-style serialiser
 * and `reflowMarkdown`. Until then an edited block with no emitter throws
 * rather than quietly writing something else into the user's file.
 */
function modelSerialise(doc, emit) {
  let out = doc.prefix;
  for (const block of doc.blocks) {
    if (block.source !== null) {
      out += block.source;
    } else {
      if (typeof emit !== "function") {
        throw new Error(`edited ${block.kind} block with no serialiser`);
      }
      out += emit(block);
    }
    out += block.separator;
  }
  return out;
}

// Mark a block edited. One function rather than an assignment at each call
// site, because "source goes to null" is the entire contract between the model
// and D1: every path that changes a block's content has to pass through here,
// and one that forgets leaves the old bytes on disk under new content.
function modelTouch(block) {
  block.source = null;
  return block;
}
