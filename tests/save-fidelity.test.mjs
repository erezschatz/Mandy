// Cover for the ways a saved file differs from the one that was opened.
//
// Both invariants here are invisible in the app: the document looks identical
// on screen either way, and the damage only shows up in `git diff` — which is
// exactly the class of bug the rest of this suite exists for.
//
// Neither is enforced by anything in front/ but the two lines under test, and
// both are one careless edit from regressing: drop the `.replace` in
// `htmlToMarkdown` and every save goes back to "\ No newline at end of file",
// drop the `hr` option and every horizontal rule in every file becomes "* * *".
//
// The serialiser is a pass-through stub (see dom.mjs), so these assert what
// app.js *asks for* rather than what Turndown does with it. The real output was
// checked against the running app when the options were set.

import { loadApp } from "./dom.mjs";

export default function run(check) {
  const { options, htmlToMarkdown } = loadApp();

  check(
    "horizontal rules serialise as --- , not Turndown's * * *",
    options.hr === "---",
  );

  // The two settings that were already deliberate. They are the reason a file
  // does not come back with setext headings or indented code blocks.
  check("headings stay atx", options.headingStyle === "atx");
  check("code blocks stay fenced", options.codeBlockStyle === "fenced");

  check("output ends with a newline", htmlToMarkdown("hello") === "hello\n");

  check(
    "an output that already ends in a newline does not gain a second",
    htmlToMarkdown("hello\n") === "hello\n",
  );

  check(
    "trailing blank lines collapse to exactly one newline",
    htmlToMarkdown("hello\n\n\n") === "hello\n",
  );

  // Guards the `\n*$` anchor: a newline in the middle of the document is
  // content, and a greedy or unanchored replace would eat it.
  check(
    "newlines inside the document are left alone",
    htmlToMarkdown("a\n\nb") === "a\n\nb\n",
  );
}
