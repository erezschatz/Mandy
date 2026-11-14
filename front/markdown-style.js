// Mandy's answer to "does a save owe the file the bytes it arrived with?".
//
// Turndown serialises to its own house style, so opening a document and
// changing one word rewrote every list, rule and emphasis in it -- a diff that
// is spec-legal on both sides and completely unmergeable. Measured against this
// repo's own files, the damage split in two: line wrapping accounted for
// essentially every changed line, and the rest came down to a handful of
// serialiser options.
//
// So this file reads the conventions a document already follows, driven by the
// source rather than by a house style: the model writes an edited block in them
// and wraps it to the file's width with `wrapMarkdownLine`, and Turndown is
// configured from them for what it still converts — a paste, and the table of
// contents. The old core's other two layers, the re-wrap of a whole serialised
// document and the restore of the opened file's bytes, are legacy-storage.js's
// since stage 4's slice 5, which converts the old autosave and is their one
// caller.
//
// Every default here is Turndown's own, so a document that sniffs to nothing --
// a blank editor -- keeps exactly the behaviour it had before any of this
// existed.

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
  // Which of markdown's two hard-break spellings the source used: two or more
  // trailing spaces, or a trailing backslash. Turndown's own default is the
  // spaces, and it stays the default here for the reason every other one does
  // -- a document that sniffs to nothing serialises exactly as it did before
  // any of this. MARKDOWN.md's S3 is the decision to read it at all.
  hardBreak: "  ",
  orderedDelimiter: ".",
  // Whether every ordered item in the source was numbered "1.". CommonMark
  // renumbers on render either way, so both forms look identical on screen and
  // only the file can say which the author meant.
  orderedAllOnes: false,
  // 0 means "leave paragraphs on one line" -- the file was not hard-wrapped, so
  // imposing a width would be its own kind of damage.
  wrapWidth: 0,
  // How the source wrote its pipe tables: the commonest convention among the
  // tables that keep to one (sniffTableConvention, below). null is the table
  // rule's own default, TABLE_CONVENTION_DEFAULT, which is what it wrote before
  // a convention was ever read.
  table: null,
};

// Blank out anything that must not vote in a sniff: a fenced block full of
// shell examples is not evidence about bullet markers, and `*not emphasis*`
// inside a code span is not evidence about delimiters.
// `spans` false keeps code spans: a table's cells hold them, and blanking one
// takes the cell's width -- and the table's vote -- with it.
function markdownStyleLines(markdown, spans = true) {
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
    lines.push(spans ? line.replace(/`[^`\n]*`/g, "") : line);
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

  // Which hard-break spelling the source used (MARKDOWN.md's S3). Both forms
  // only mean a break when a line of the same paragraph follows, so a run of
  // trailing spaces before a blank line -- which is ordinary untidiness rather
  // than an intention -- is not counted as evidence of anything. `lines` has
  // already had fenced code blanked out, so trailing whitespace inside a code
  // block cannot vote either.
  let spaceBreaks = 0;
  let slashBreaks = 0;
  lines.forEach((line, i) => {
    const next = lines[i + 1];
    if (next === undefined || !next.trim()) return;
    if (/ {2,}$/.test(line) && line.trim()) spaceBreaks++;
    else if (/[^\\]\\$/.test(line)) slashBreaks++;
  });
  if (spaceBreaks || slashBreaks) {
    style.hardBreak = slashBreaks > spaceBreaks ? "\\" : "  ";
  }

  // Per document, because Turndown sees the DOM and cannot tell one table's
  // source from another's. A file whose tables disagree has the minority's
  // edited tables written the majority's way, the same compromise the emphasis
  // delimiter makes; an untouched table restores its own bytes regardless.
  const tableConventions = {};
  for (const table of markdownTables(markdownStyleLines(markdown, false))) {
    const convention = sniffTableConvention(table);
    if (!convention) continue;
    const key = JSON.stringify(convention);
    tableConventions[key] = (tableConventions[key] || 0) + 1;
  }
  const tableWinner = commonest(tableConventions, null);
  style.table = tableWinner ? JSON.parse(tableWinner) : null;

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

// What goes in front of a wrapped line: the prefix its first line keeps, and
// the one every line the wrap produces after it has to carry instead.
//
// **Read back off the line, which is a guess, and the only one available on
// that path.** reflowMarkdown, in legacy-storage.js, is handed a whole document
// as text -- Turndown's output -- so there is nothing to consult but the
// characters themselves. The
// model has all three recorded at parse (a quote's chain per line, an item's
// marker and its content indent), which is why wrapMarkdownLine now takes them
// instead, and this stays as the fallback for the caller that has nothing to
// pass. See TODO 3.1's slice 3 step 5 in docs/REWRITE.md.
//
// One consequence is worth naming, because it looks like a bug and is not
// reachable as one: the continuation indent is spaces, so an item marked with a
// tab would have its continuation rewritten to spaces of the same width --
// different bytes at the same column. The model measured that disagreement at 1
// item in 343 across its oracle. It cannot happen here, because a marker only
// ever arrives on this path from Turndown's own listItem rule, whose pad comes
// from a sniff that matches spaces alone (`/^(\s*)([-*+])( +)\S/`). It took
// reading a file's own bytes to see it at all, which is the whole reason the
// model records rather than derives.
function wrapMarkdownPrefixes(line) {
  // A blockquote's `> ` chain has to be re-applied to every continuation line
  // or the tail of the quote falls out of it.
  const quoted = line.match(/^(\s*(?:>\s?)+)/);
  const quote = quoted ? quoted[1] : "";
  const rest = line.slice(quote.length);
  const hardBreak = (rest.match(/ {2,}$/) || [""])[0];
  const body = hardBreak ? rest.slice(0, -hardBreak.length) : rest;

  // A list item's continuations have to align with its content, not its marker.
  const item = body.match(/^(\s*)([-*+]|\d+[.)])(\s+)/);
  return {
    first: quote + (item ? item[0] : body.match(/^\s*/)[0]),
    continuation: item
      ? quote + " ".repeat(item[0].length)
      : quote + body.match(/^\s*/)[0],
  };
}

// `prefixes` is `{ first, continuation }`, and defaults to reading them back off
// the line. A caller that knows them -- the model, which recorded them at parse
// -- passes them in rather than letting this guess a second time.
function wrapMarkdownLine(line, width, prefixes = wrapMarkdownPrefixes(line)) {
  // Two or more trailing spaces are a hard line break -- the whole meaning of
  // the line is in characters that look like nothing. The split below is on
  // whitespace, so they would be swallowed as ordinary spacing between words
  // and the break would be gone from the file with the paragraph still reading
  // correctly on screen (TODO 2.2). Held back here and re-applied to the last
  // line out, which is where the break belongs however many lines the wrap
  // produces. The backslash spelling needs none of this: it is a non-space
  // character, so it stays attached to the word in front of it and rides
  // through the split already.
  const hardBreak = (line.match(/ {2,}$/) || [""])[0];
  const body = hardBreak ? line.slice(0, -hardBreak.length) : line;

  const firstPrefix = prefixes.first;
  const contPrefix = prefixes.continuation;

  const words = body.slice(firstPrefix.length).split(/\s+/).filter(Boolean);
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
  if (current) wrapped.push(prefix + current + hardBreak);
  return wrapped;
}

// Only spaces, pipes, colons and dashes, and at least one of each of the last
// two: a table cannot have a delimiter row without a pipe, and `---` on its own
// is a rule or a setext underline.
function isTableDelimiterRow(line) {
  return /^[\s|:-]*$/.test(line) && line.includes("|") && line.includes("-");
}

// ── The table formatter (TODO 2.1, 3.1's stage 3 slice 3) ────────────────────
//
// An edited table cannot have its bytes restored, because widening one cell of
// a table padded to width moves every other cell in that column with it. So it
// is laid out afresh, from its cells, in the convention its source used. A
// convention is what varies between the ways people write a pipe table:
//
//   lead, trail  the pipe at each end of a row, which GFM makes optional
//   pad          spaces either side of a cell's content, 0 or 1
//   delimPad     the same for the delimiter row, which a compact writer and a
//                padded one do not always agree with themselves about
//   aligned      every cell of a column padded to the column's width
//   justify      in an aligned table, content set right or centred by its
//                column's alignment rather than always left
//   minWidth     in an aligned table, the narrowest a column is padded to:
//                Prettier's 3, or 1 where a one-letter column stays one wide
//   delimiter    the dash run: { total } characters per delimiter cell colons
//                included (`---`, `:--`), { dashes } between the colons
//                (`:---:`), or { fill }, the column's width
//
// The default is what the Turndown rule wrote before this existed, so a
// document with no table, or with none that keeps to a convention, saves its
// tables exactly as it did.
const TABLE_CONVENTION_DEFAULT = {
  lead: true,
  trail: true,
  pad: 1,
  delimPad: 1,
  aligned: false,
  justify: false,
  delimiter: { total: 3 },
};

// Widths are counted in code points, so `é` is one and an emoji is one. An
// editor that counts an East Asian wide character as two pads such a table
// differently, and re-padding it here moves its columns. Accepted rather than
// solved: there is no width every editor agrees on.
function tableTextWidth(text) {
  return Array.from(text).length;
}

// A row's cells as written, split on the pipes that are not escaped, with the
// edge pipes taken off. The cells are untrimmed: padding is the evidence the
// sniff reads. GFM splits on an unescaped pipe even inside a code span, which is
// why this does not look for backticks.
// A row's cells as written, with the edge pipes taken off and the cells left
// untrimmed, since padding is the evidence the sniff reads. **A pipe splits
// unless a backslash is right before it**, which is markdown-it 13's rule,
// measured: it counts no parity, so `\\|` does not split either, and it looks
// for no backticks, so a pipe in a code span splits like any other.
function splitTableRow(line) {
  const cells = [];
  let current = "";
  let lastPipe = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "|" && line[i - 1] !== "\\") {
      cells.push(current);
      current = "";
      lastPipe = i;
    } else {
      current += ch;
    }
  }
  cells.push(current);
  const lead = /^\s*\|/.test(line);
  const trail = lastPipe >= 0 && !line.slice(lastPipe + 1).trim() && !(lead && cells.length === 2);
  if (lead) cells.shift();
  if (trail) cells.pop();
  return { cells, lead, trail };
}

// "left", "right", "center" or "" from one delimiter cell.
function tableCellAlignment(cell) {
  const rule = cell.trim();
  const left = rule.startsWith(":");
  const right = rule.endsWith(":") && rule.length > 1;
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

function tableDelimiterCell(align, width, convention) {
  const colons = (align === "left" || align === "right" ? 1 : 0) + (align === "center" ? 2 : 0);
  const rule = convention.delimiter;
  let dashes;
  if (rule.dashes) dashes = rule.dashes;
  else if (rule.total) dashes = rule.total - colons;
  else dashes = width + 2 * (convention.pad - convention.delimPad) - colons;
  dashes = Math.max(1, dashes);
  const run = "-".repeat(dashes);
  if (align === "center") return ":" + run + ":";
  if (align === "left") return ":" + run;
  if (align === "right") return run + ":";
  return run;
}

// An empty cell takes one pad rather than two -- `| |`, which is how a
// one-space table writes one, not `|  |`. In an aligned table no cell is empty,
// since each is padded to its column.
function tableRowText(cells, convention) {
  const space = " ".repeat(convention.pad);
  let text = cells.map((cell) => (cell === "" ? space : space + cell + space)).join("|");
  // Without its leading pipe a row whose first cell is empty would start with
  // the pipe after that cell, which GFM reads as a leading pipe -- the empty
  // cell would vanish and every cell move left one column. So that row keeps
  // its leading pipe, which is the one way to write it.
  if (convention.lead || (cells.length && !cells[0].trim())) text = "|" + text;
  else text = text.slice(convention.pad);
  if (convention.trail) text += "|";
  else text = text.replace(/\s+$/, "");
  return text;
}

function justifyTableCell(text, width, align, justify) {
  const gap = Math.max(0, width - tableTextWidth(text));
  if (justify && align === "right") return " ".repeat(gap) + text;
  if (justify && align === "center") {
    const before = Math.floor(gap / 2);
    return " ".repeat(before) + text + " ".repeat(gap - before);
  }
  return text + " ".repeat(gap);
}

// A table as text, from its rows of cell sources — header first — and one
// alignment per column. The cells are markdown as it goes in the file, so a
// pipe in one is already escaped; nothing here escapes anything. No trailing
// newline. A row shorter than the header is written as short as it is: the
// formatter lays out what it was given and invents no cells.
function formatMarkdownTable(rows, aligns, convention = TABLE_CONVENTION_DEFAULT) {
  const columns = Math.max(aligns.length, ...rows.map((row) => row.length));
  const widths = [];
  for (let c = 0; c < columns; c++) {
    let width = convention.aligned ? (convention.minWidth || 3) : 0;
    for (const row of rows) {
      if (c < row.length) width = Math.max(width, tableTextWidth(row[c]));
    }
    widths.push(width);
  }
  const layout = (row) =>
    row.map((cell, c) =>
      convention.aligned ? justifyTableCell(cell, widths[c], aligns[c] || "", convention.justify) : cell
    );
  const delimiter = aligns.map((align, c) => tableDelimiterCell(align, widths[c], convention));
  const delimiterConvention = Object.assign({}, convention, { pad: convention.delimPad });
  const lines = [tableRowText(layout(rows[0] || []), convention), tableRowText(delimiter, delimiterConvention)];
  for (const row of rows.slice(1)) lines.push(tableRowText(layout(row), convention));
  return lines.join("\n");
}

// The convention a table's own lines keep to, or null for one that keeps to
// none. Decided by reproduction rather than by reading the padding: every
// candidate convention lays the table's own cells out again, and the first that
// gives back the lines exactly is the answer. So "keeps to a convention" means
// precisely that the formatter can write this table, and a table nothing
// reproduces — hand-padded, one cell out of step — is null rather than the
// nearest guess. Candidates run plainest first, so a one-space table whose
// columns happen to line up is read as one-space rather than as aligned.
function sniffTableConvention(lines) {
  if (lines.length < 2 || !isTableDelimiterRow(lines[1])) return null;
  const split = lines.map(splitTableRow);
  const lead = split[0].lead;
  const trail = split[0].trail;
  if (split.some((row) => row.lead !== lead || row.trail !== trail)) return null;
  const rows = split.filter((_, i) => i !== 1).map((row) => row.cells.map((cell) => cell.trim()));
  const ruleCells = split[1].cells.map((cell) => cell.trim());
  const aligns = ruleCells.map(tableCellAlignment);
  const totals = new Set(ruleCells.map((cell) => cell.length));
  const dashes = new Set(ruleCells.map((cell) => cell.replace(/:/g, "").length));
  const delimiters = [];
  if (totals.size === 1) delimiters.push({ total: [...totals][0] });
  if (dashes.size === 1) delimiters.push({ dashes: [...dashes][0] });
  delimiters.push({ fill: true });
  const candidates = [];
  for (const aligned of [false, true]) {
    for (const justify of aligned ? [true, false] : [false]) {
      for (const minWidth of aligned ? [3, 1] : [0]) {
        for (const pad of [1, 0]) {
          for (const delimPad of [pad, 1 - pad]) {
            // In a table padded to width the delimiter filling its column is
            // the reading that keeps doing so when a column widens, so it goes
            // ahead of a fixed count that happens to match today.
            const order = aligned ? [...delimiters].reverse() : delimiters;
            for (const delimiter of order) {
              if (delimiter.fill && !aligned) continue;
              const convention = { lead, trail, pad, delimPad, aligned, justify, delimiter };
              if (aligned) convention.minWidth = minWidth;
              candidates.push(convention);
            }
          }
        }
      }
    }
  }
  const want = lines.join("\n");
  return candidates.find((convention) => formatMarkdownTable(rows, aligns, convention) === want) || null;
}

// The pipe tables in a document's lines, each as its own lines. A delimiter row
// with a row holding a pipe above it starts one, and it runs until a blank line
// or a line with no pipe. A table's indent and a quote's `>` chain are taken
// off first: where a table sits is not how it is written.
function tableLine(line) {
  return line.replace(/^(\s*>)+ ?/, "").trim();
}

function markdownTables(lines) {
  const tables = [];
  for (let i = 1; i < lines.length; i++) {
    const head = tableLine(lines[i - 1]);
    const rule = tableLine(lines[i]);
    if (!isTableDelimiterRow(rule) || !head.includes("|")) continue;
    const table = [head, rule];
    let j = i + 1;
    while (j < lines.length && tableLine(lines[j]) && tableLine(lines[j]).includes("|")) {
      table.push(tableLine(lines[j++]));
    }
    tables.push(table);
    i = j;
  }
  return tables;
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
