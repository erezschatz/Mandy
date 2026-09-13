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
  // The kinds only a container's children can be (slice 1b). A table is two
  // levels of them — head or body, then row — and the row is the floor:
  // `td_open` carries no `map`, so a cell is not a sub-block and cannot be
  // made one from the token stream.
  list_item_open: "item",
  thead_open: "table-head",
  tbody_open: "table-body",
  tr_open: "row",
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
    children: null,      // a container's sub-blocks, tiling its own source
    leading: "",         // the container's bytes before its first child
    parent: null,        // set by the tiler; what makes modelTouch able to walk up
    marker: null,        // an item only: see modelItemPrefix
    contentIndent: null,
  };
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
  };
}

// What a list item writes before its content: the indent it sits at, its marker,
// and the pad after it — `"- "`, `"*   "`, `"  - "`, `"1.  "` — exactly as the
// author wrote it.
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
 * `contentIndent` is the marker with every character but a tab replaced by a
 * space, which is one rule rather than two: it is the right width by
 * construction, and a tab in the indent survives as a tab instead of being
 * counted as one column. Measured against this repo's seven markdown files, all
 * 312 items agree with the indent their own continuation lines actually carry.
 */
function modelItemPrefix(firstLine) {
  const match = MODEL_ITEM_MARKER.exec(firstLine);
  if (!match) return null;
  const marker = match[1] + match[2] + match[3];
  return { marker, contentIndent: marker.replace(/[^\t]/g, " ") };
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
function modelTileRange(ctx, spans, from, to) {
  const { markdown, lines, startOf, endOf } = ctx;
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
    pieces.push({ block: modelBlockFromSpan(span), start: span.start, end, span });
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
    if (piece.block.kind === "item") {
      const prefix = modelItemPrefix(lines[piece.start]);
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
        const tiled = modelTileRange(ctx, inner, piece.start, piece.end);
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
    { markdown, lines, startOf, endOf },
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
