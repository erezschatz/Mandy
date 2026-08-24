// Marky's answer to "does a save owe the file the bytes it arrived with?".
//
// Turndown serialises to its own house style, so opening a document and
// changing one word rewrote every list, rule and emphasis in it -- a diff that
// is spec-legal on both sides and completely unmergeable. Measured against this
// repo's own files, the damage split in two: line wrapping accounted for
// essentially every changed line, and the rest came down to a handful of
// serialiser options.
//
// So this file does two things, both driven by the source rather than by a
// house style: sniff the conventions a document already follows so the
// serialiser can be configured per file, and re-wrap the serialiser's output
// back to the width the file was written at.
//
// Every default here is Turndown's own, so a document that sniffs to nothing --
// a blank editor, a restore from localStorage with no source to read -- keeps
// exactly the behaviour it had before any of this existed.

const MARKDOWN_STYLE_DEFAULTS = {
  hr: "---",
  bulletListMarker: "*",
  emDelimiter: "_",
  strongDelimiter: "**",
  // Spaces between the marker and the content. Turndown hardcodes 3 for bullets
  // and 2 for ordered items ("*   one", "1.  one"), which almost nobody writes.
  bulletPad: 3,
  orderedPad: 2,
  // Marker and pad per nesting depth. Alternating the marker by level is a
  // common enough convention that a single document-wide choice rewrites every
  // nested list in a file that follows it. Indexed by depth; a depth the source
  // never reached falls back to the document-wide values above.
  bulletsByDepth: [],
  // Whether the source wrote bare URLs as <http://x> rather than as links.
  // Turndown has no autolink output at all, so without this every one of them
  // comes back as [http://x](http://x).
  autolinks: false,
  orderedDelimiter: ".",
  // Whether every ordered item in the source was numbered "1.". CommonMark
  // renumbers on render either way, so both forms look identical on screen and
  // only the file can say which the author meant.
  orderedAllOnes: false,
  // 0 means "leave paragraphs on one line" -- the file was not hard-wrapped, so
  // imposing a width would be its own kind of damage.
  wrapWidth: 0,
};

// Blank out anything that must not vote in a sniff: a fenced block full of
// shell examples is not evidence about bullet markers, and `*not emphasis*`
// inside a code span is not evidence about delimiters.
function markdownStyleLines(markdown) {
  const lines = [];
  let fence = null;
  for (const line of (markdown || "").split("\n")) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) {
        fence = null;
      }
      lines.push("");
      continue;
    }
    if (match) {
      fence = match[1];
      lines.push("");
      continue;
    }
    lines.push(line.replace(/`[^`\n]*`/g, ""));
  }
  return lines;
}

// A setext underline is also three dashes on a line of its own, and the only
// thing separating it from a horizontal rule is whether text precedes it.
// Miss this and every "Heading\n-------" in the file votes for `hr: "---"`.
function isHorizontalRule(line, previous) {
  if (/^ {0,3}(\*[ \t]*){3,}$/.test(line)) return "***";
  if (/^ {0,3}(_[ \t]*){3,}$/.test(line)) return "___";
  if (/^ {0,3}(-[ \t]*){3,}$/.test(line) && !(previous || "").trim()) return "---";
  return null;
}

// A reference link's definition: "[label]: destination". Loose on purpose —
// this only has to stop reflowMarkdown tearing a long URL across two lines,
// so a false positive costs nothing (a line that is not really a definition
// just does not get wrapped either) while a false negative would corrupt one.
// app.js's own scan for the definitions themselves reuses this same check
// rather than a second regex, so the two cannot silently disagree about what
// counts as one.
function isReferenceDefinitionLine(line) {
  return /^ {0,3}\[[^\]]+\]:\s*\S/.test(line);
}

function commonest(counts, fallback) {
  let best = fallback;
  let bestCount = 0;
  for (const key of Object.keys(counts)) {
    if (counts[key] > bestCount) {
      best = key;
      bestCount = counts[key];
    }
  }
  return bestCount ? best : fallback;
}

function sniffMarkdownStyle(markdown) {
  const style = Object.assign({}, MARKDOWN_STYLE_DEFAULTS);
  const lines = markdownStyleLines(markdown);
  const text = lines.join("\n");

  const rules = {};
  const bullets = {};
  const bulletPads = {};
  const byIndent = {};
  const orderedPads = {};
  const orderedDelimiters = {};
  let orderedRuns = 0;
  let orderedAllOnesRuns = 0;
  let run = null;

  const closeRun = () => {
    if (run && run.items > 1) {
      orderedRuns++;
      if (run.allOnes) orderedAllOnesRuns++;
    }
    run = null;
  };

  lines.forEach((line, i) => {
    const rule = isHorizontalRule(line, lines[i - 1]);
    if (rule) {
      rules[rule] = (rules[rule] || 0) + 1;
      closeRun();
      return;
    }

    const bullet = line.match(/^(\s*)([-*+])( +)\S/);
    if (bullet) {
      bullets[bullet[2]] = (bullets[bullet[2]] || 0) + 1;
      const pad = bullet[2] + bullet[3].length;
      bulletPads[pad] = (bulletPads[pad] || 0) + 1;
      const indent = bullet[1].length;
      byIndent[indent] = byIndent[indent] || {};
      const at = byIndent[indent];
      at[pad] = (at[pad] || 0) + 1;
      closeRun();
      return;
    }

    const ordered = line.match(/^(\s*)(\d+)([.)])( +)\S/);
    if (ordered) {
      orderedPads[ordered[4].length] = (orderedPads[ordered[4].length] || 0) + 1;
      orderedDelimiters[ordered[3]] = (orderedDelimiters[ordered[3]] || 0) + 1;
      if (!run || run.indent !== ordered[1].length) {
        closeRun();
        run = { indent: ordered[1].length, items: 0, allOnes: true };
      }
      run.items++;
      if (ordered[2] !== "1") run.allOnes = false;
      return;
    }

    // Neither a blank line nor an indented continuation line ends an ordered
    // list -- loose lists and multi-line items are still one list -- but
    // anything back at the margin does. Without the indent test a list whose
    // items wrap is read as a series of one-item lists, and a run of one can
    // never show that the author numbered them all "1.".
    if (line.trim() && !/^\s/.test(line)) closeRun();
  });
  closeRun();

  style.hr = commonest(rules, style.hr);
  style.bulletListMarker = commonest(bullets, style.bulletListMarker);
  style.orderedDelimiter = commonest(orderedDelimiters, style.orderedDelimiter);
  style.orderedAllOnes = orderedRuns > 0 && orderedAllOnesRuns * 2 > orderedRuns;

  // The pad is recorded per marker so a file mixing "- one" and "*   two" pads
  // the marker it actually settled on rather than averaging the two.
  const winningPads = {};
  for (const key of Object.keys(bulletPads)) {
    if (key[0] === style.bulletListMarker) winningPads[key.slice(1)] = bulletPads[key];
  }
  style.bulletPad = Number(commonest(winningPads, String(style.bulletPad)));
  style.orderedPad = Number(commonest(orderedPads, String(style.orderedPad)));

  // Nesting depth is not the indent column -- the column depends on the pad of
  // the level above -- so the distinct indents are ranked and their order taken
  // as the depth.
  style.bulletsByDepth = Object.keys(byIndent)
    .map(Number)
    .sort((a, b) => a - b)
    .map((indent) => {
      const winner = commonest(byIndent[indent], style.bulletListMarker + style.bulletPad);
      return { marker: winner[0], pad: Number(winner.slice(1)) };
    });

  // Strong first, then strip it, or every `**bold**` also reads as a `*em*`.
  const strong = {
    "**": (text.match(/\*\*[^*\n]+\*\*/g) || []).length,
    __: (text.match(/__[^_\n]+__/g) || []).length,
  };
  style.strongDelimiter = commonest(strong, style.strongDelimiter);

  const noStrong = text.replace(/\*\*[^*\n]+\*\*/g, "").replace(/__[^_\n]+__/g, "");
  const em = {
    "*": (noStrong.match(/\*[^*\n]+\*/g) || []).length,
    // Intraword underscores are not emphasis in CommonMark, and snake_case
    // identifiers are common enough in these documents to swamp the count.
    _: (noStrong.match(/(^|[^\w_])_[^_\n]+_($|[^\w_])/gm) || []).length,
  };
  style.emDelimiter = commonest(em, style.emDelimiter);

  style.autolinks = /<https?:\/\/[^>\s]+>/.test(text);
  style.wrapWidth = sniffWrapWidth(lines);
  return style;
}

// A file is hard-wrapped if paragraphs span more than one line. One-sentence-
// per-line files also match that shape, which is why the width is measured
// rather than assumed: re-wrapping them to their own width leaves every line
// that already fits exactly where it was.
//
// The width has to be exact or this makes things worse, not better. Wrapping is
// greedy, so a file wrapped at 80 reproduces its own breaks only if 80 is what
// comes back; guess 82 and every break in every paragraph moves. That rules out
// the longest line as the estimate -- one unbreakable URL, or the single
// overlong line every hand-wrapped file turns out to contain, and the whole
// document rewraps. The 95th percentile discards those and lands on the shoulder
// of the distribution, which is the width the author was actually typing to.
function sniffWrapWidth(lines) {
  const lengths = [];
  let continuations = 0;
  let previousWasProse = false;

  for (const line of lines) {
    const prose =
      line.trim() !== "" &&
      !/^\s*[|#>]/.test(line) &&
      !/^\s*([-*+]|\d+[.)])\s/.test(line) &&
      !isHorizontalRule(line, "");
    if (prose) {
      if (previousWasProse) continuations++;
      lengths.push(line.length);
    }
    previousWasProse = prose;
  }

  // Three wrapped paragraphs is the point where this stops being a document
  // that happens to have two long adjacent lines.
  if (continuations < 3 || lengths.length < 10) return 0;

  lengths.sort((a, b) => a - b);
  const width = lengths[Math.floor(lengths.length * 0.95)];
  if (width < 40 || width > 120) return 0;
  return width;
}

// A word that would reparse as a block marker if a wrap put it first on a line.
// Getting this wrong writes a heading, bullet or blockquote into the middle of
// the user's paragraph, so the list errs towards refusing to break.
function startsBlockMarker(word) {
  if (word[0] === ">") return true;
  return /^(#{1,6}|[-*+]|\d+[.)]|={2,}|-{2,}|_{2,})$/.test(word);
}

function wrapMarkdownLine(line, width) {
  // A blockquote's `> ` chain has to be re-applied to every continuation line
  // or the tail of the quote falls out of it.
  const quoted = line.match(/^(\s*(?:>\s?)+)/);
  const quote = quoted ? quoted[1] : "";
  const rest = line.slice(quote.length);

  // A list item's continuations have to align with its content, not its marker.
  const item = rest.match(/^(\s*)([-*+]|\d+[.)])(\s+)/);
  const firstPrefix = quote + (item ? item[0] : rest.match(/^\s*/)[0]);
  const contPrefix = item
    ? quote + " ".repeat(item[0].length)
    : quote + rest.match(/^\s*/)[0];

  const words = rest.slice(firstPrefix.length - quote.length).split(/\s+/).filter(Boolean);
  if (!words.length) return [line];

  const wrapped = [];
  let prefix = firstPrefix;
  let current = "";

  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (current && prefix.length + candidate.length > width) {
      // Overflowing by one short marker beats corrupting the document, so a
      // break that would strand a block marker at the start of the next line
      // simply does not happen.
      if (startsBlockMarker(word)) {
        current = candidate;
        continue;
      }
      wrapped.push(prefix + current);
      prefix = contPrefix;
      current = word;
      continue;
    }
    current = candidate;
  }
  if (current) wrapped.push(prefix + current);
  return wrapped;
}

// Re-wrapping is a guess at how the author broke their lines, and measured
// against this repo's own files it is a poor one: they break after a sentence,
// or let a line run long rather than split a link, and no width reproduces that.
// So rather than guess harder, keep the answer. Every run of non-blank lines in
// the opened file is indexed under a whitespace-insensitive key, and on save any
// block whose text still matches comes back as the bytes it arrived as.
//
// The index is keyed on content rather than position, which is what makes it
// affordable: there is no mapping into the DOM to keep correct, so none of the
// ways contenteditable rewrites the document -- splitting a node on Enter,
// merging two on Backspace, restoring stale markup on undo -- can invalidate it.
// A block that was edited simply misses, and falls back to the re-wrap below.
// The unit is one list item or one paragraph, not one blank-line-separated
// block, because the two sides disagree about blank lines: a tight list whose
// items contain sub-paragraphs is loose by CommonMark's definition, so
// markdown-it wraps each item in <p> and Turndown puts a blank line back
// between items the author wrote flush. Matching whole blocks would fail on
// every such list -- which in this repo's own TODO.md is most of the file.
//
// Each segment therefore also carries the separator that followed it in its own
// document, so a restored run of items comes back as tight or loose the way the
// author had it rather than the way Turndown re-derived it.
function markdownSegments(markdown) {
  const segments = [];
  const lines = markdown.split("\n");
  let current = [];
  let fence = null;

  const push = (gap) => {
    if (current.length) segments.push({ text: current.join("\n"), gap });
    current = [];
  };

  // Every construct Turndown emits as its own block has to be its own segment
  // here too, or a source that ran two of them together -- a heading with the
  // fence directly under it, no blank line -- is one segment on this side and
  // two on the serialiser's, and neither can ever match the other.
  let closedFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);

    if (fence) {
      current.push(line);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) {
        fence = null;
        closedFence = true;
      }
      continue;
    }

    if (!line.trim()) {
      let end = i;
      while (end + 1 < lines.length && !lines[end + 1].trim()) end++;
      push("\n".repeat(end - i + 2));
      closedFence = false;
      i = end;
      continue;
    }

    if (
      current.length &&
      (closedFence ||
        match ||
        /^\s*([-*+]|\d+[.)])\s/.test(line) ||
        /^\s{0,3}#{1,6}\s/.test(line))
    ) {
      push("\n");
    }
    closedFence = false;

    if (match) fence = match[1];
    current.push(line);
  }
  push("");

  return segments;
}

// Only spaces, pipes, colons and dashes, and at least one of each of the last
// two: a table cannot have a delimiter row without a pipe, and `---` on its own
// is a rule or a setext underline.
function isTableDelimiterRow(line) {
  return /^[\s|:-]*$/.test(line) && line.includes("|") && line.includes("-");
}

// A pipe table is the one construct whose spacing is not the author's to keep:
// the `table` rule in app.js writes its own cell padding and its own three-dash
// delimiter, so `|---|---|` and `| --- | --- |` are the same table and never the
// same key. Normalising both sides to one shape is what lets a table the author
// did not touch restore like every other block.
function normaliseTableRows(block) {
  const lines = block.split("\n");
  if (!lines.some(isTableDelimiterRow)) return block;
  return lines
    .map((line) => {
      const row = line.trim().replace(/\s*\|\s*/g, "|");
      // The dash run is a width, not a meaning -- only the colons around it say
      // anything -- and ours is always three however wide the author's was.
      return isTableDelimiterRow(row) ? row.replace(/-+/g, "-") : row;
    })
    .join("\n");
}

// Turndown escapes punctuation that could reparse as markup ("1\." mid
// sentence), so the key has to ignore that too or a block that changed in no
// other way stops matching itself.
function markdownBlockKey(block) {
  return normaliseTableRows(block)
    .replace(/\\([^\w\s])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Split off the document's own trailing newlines first: the last element of a
// split on "\n" is the terminator, not a blank line, and counting it as one
// grows the file by a line on every save.
function markdownBody(markdown) {
  const trailing = markdown.match(/\n*$/)[0];
  return [markdown.slice(0, markdown.length - trailing.length), trailing];
}

function indexMarkdownBlocks(markdown) {
  const index = new Map();
  for (const segment of markdownSegments(markdownBody(markdown)[0])) {
    const key = markdownBlockKey(segment.text);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(segment);
  }
  return index;
}

// Segments are consumed as they are matched, so a document repeating the same
// paragraph twice gets each original back in turn rather than the first twice.
function restoreSourceWrapping(markdown, index) {
  if (!index || !index.size) return markdown;

  const used = new Map();
  const [body, trailing] = markdownBody(markdown);
  const segments = markdownSegments(body);
  let out = "";

  segments.forEach((segment, i) => {
    const key = markdownBlockKey(segment.text);
    const bucket = index.get(key);
    const taken = used.get(key) || 0;
    const original = bucket && taken < bucket.length ? bucket[taken] : null;
    if (original) used.set(key, taken + 1);

    out += original ? original.text : segment.text;
    if (i === segments.length - 1) return;
    // A segment that ended its document carries no separator, so fall back to
    // the one the serialiser produced rather than running two segments together.
    out += (original && original.gap) || segment.gap;
  });

  return out + trailing;
}

// A line carrying maths. Breaking inside `$...$` does not always damage it --
// markdown-it reads a span across a newline within one paragraph -- but the
// break lands wherever the width says, which in TeX means between `\frac` and
// its arguments or after a lone `\`, and the other guards only know about
// markdown's own block markers. An equation is one token to the eye anyway.
//
// The two heuristics are `mathSpan`'s in app.js, deliberately: an opening `$`
// is never followed by whitespace and a closing one never by a digit, so
// `it cost $5 and then $10` stays the prose the parser also reads it as. The
// duplication buys markdown-style.js its independence -- it loads before app.js
// and its suite drives it with nothing else present.
function hasMathSpan(line) {
  return line.includes("$$") || /\$[^\s$][^$]*\$(?!\d)/.test(line);
}

// Turndown emits each paragraph, list item and blockquote line as a single
// line however long it is, so this never has to join anything -- only break.
function reflowMarkdown(markdown, width) {
  if (!width) return markdown;

  const out = [];
  let fence = null;
  let displayMath = false;

  for (const line of markdown.split("\n")) {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      out.push(line);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (match) {
      fence = match[1];
      out.push(line);
      continue;
    }

    // A `$$` alone on its line opens or closes a display block, and everything
    // between the two is TeX rather than prose whatever it looks like. After
    // the fence check, so `$$` inside a code block is just code.
    if (line.trim() === "$$") {
      displayMath = !displayMath;
      out.push(line);
      continue;
    }
    if (displayMath) {
      out.push(line);
      continue;
    }

    // A wrapped `|` row stops being a table, and a wrapped heading turns its
    // own tail into a paragraph. Both are silent -- the file still parses. A
    // wrapped reference definition is worse: the destination is one word with
    // nowhere to break, so wrapping would either leave it overlong anyway or
    // fold it onto a continuation line indented by an amount CommonMark never
    // promised meant anything -- simplest to leave the whole line alone.
    if (
      line.length <= width ||
      !line.trim() ||
      /^\s*[|#]/.test(line) ||
      hasMathSpan(line) ||
      isHorizontalRule(line, "") ||
      isReferenceDefinitionLine(line)
    ) {
      out.push(line);
      continue;
    }

    out.push(...wrapMarkdownLine(line, width));
  }

  return out.join("\n");
}
