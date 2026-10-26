# Slice 7 under the model core — hand check

This file is the protocol and the document it runs on, in one. Open it in the
app, follow the steps, and edit the paragraphs written for each one. **Bold** is
what you do; *italics* is what should (or should not) happen.

It grows with TODO 3.1's slice 7: each step that needs a person adds its
section here. Today it holds seven: keeping equations typeset (step 2), typing
one (step 10), bold, italic and strikethrough (step 3), inline code and links
(step 4), paragraphs, headings and the code block (step 5), lists (step 6), the
rule, the table of contents and Clear (step 7), the keys and the clipboard
(step 8), and everything together (step 9). (It held diagrams
too until Mermaid was removed on 2026-10-01.)

Chromium and WebKit run the last seven sections by machine
(`tests/browser/equation-typing.spec.mjs`, `format-marks.spec.mjs`,
`inline-code-links.spec.mjs`, `block-kinds.spec.mjs`, `lists.spec.mjs`,
`insert-clear.spec.mjs` and `keys-clipboard.spec.mjs`), so a hand run of those
is Firefox's. Safari's waits for stage 5.

## Before you start

1. **Run the server** (`npm run serve`) and **open
   `http://localhost:9130/?core=model`**. *The toolbar shows a `model core`
   marker.* If it does not, you are testing the old core and none of this
   means anything.
2. **Open the browser console and run `modelVerifySetEnabled(true)`.**
   Throughout, *the console stays free of `[model] render diverged` warnings*.
   One appearing is a failure, whichever step it came in.
3. **File → Open this file** (`tests/fixtures/format-check.md`). *The console
   shows no errors, here or anywhere in this protocol.* Firefox used to log
   `Error: undefined undefined 1` when **Leave Page** was chosen on the
   unsaved-changes dialog during a reload, under `?core=legacy` too. It has not
   been seen since Mermaid was removed on 2026-10-01 (the user's observation,
   2026-10-26), so it is no longer expected; if it ever comes back it changes
   nothing in the document, and is worth noting rather than failing the run.
   Reloading again straight away shows no dialog at all: browsers only ask once
   you have clicked or typed since the page loaded.

**Never save over this file.** It is the pristine copy every run starts from.
To start again, use **File → Reload** and choose to discard.

"Ctrl/Cmd" means Cmd on a Mac and Ctrl elsewhere. Redo is Ctrl/Cmd+Shift+Z, or
Ctrl+Y.

## Maths survives a render (step 2)

The model core draws the document again after every edit — all of it on Enter,
undo and paste, one block on an ordinary keystroke. Until step 2 that took
every equation back to its TeX. What is checked here is that equations stay
typeset, and never show their source even for an instant.

The display equation this section runs on:

$$\int_0^1 x^2 \, dx = \frac{1}{3}$$

1. **Wait until the equations on this page have been typeset, then click at the
   end of this sentence and press Enter three times.** *The equations stay
   typeset throughout, and you never see a `$` sign, not even as a flicker.*

2. **Press Ctrl/Cmd+Z three times, then Ctrl/Cmd+Shift+Z three times.**
   *Same: every equation stays typeset, and the empty paragraphs come and go.*

3. This paragraph holds an inline equation, $e^{i\pi} + 1 = 0$, in the middle
   of a sentence. **Click just after the equation and type a few letters, then
   press Backspace once.** *The equation stays drawn with every keystroke, and
   the letters appear right after it.*

4. **In the same paragraph, put the caret just after the equation and press
   Left once, then type a letter.** *One press crosses the whole equation, as if
   it were a single character. The caret never disappears, and the letter lands
   just before the equation.* In Firefox the caret used to vanish for several
   presses, walking through MathJax's own elements, and a letter typed then
   was lost. That was fixed on 2026-09-29 by making the equation uneditable.

   **Then put the caret just after the equation and press Backspace once.**
   *The equation turns into its source, `$e^{i\pi} + 1 = 0$`, with the caret
   just before the closing `$`.* That is typing an equation's rule, below; until
   2026-10-03 one press deleted the equation whole. **Ctrl/Cmd+Z brings it
   back, drawn.**

   $x_1$ starts this line, and it ends with one: $y_2$

   **Click just after $x_1$, press Left once, and type a letter. Then click at
   the very end of the line, after $y_2$, and type another.** *A caret shows
   before $x_1$ and after $y_2$, the first letter lands before $x_1$ and the
   second after $y_2$, and nothing else on the line moves.* **Then
   Ctrl/Cmd+Z twice.** *Both letters go, and the caret comes back before
   $x_1$.*

   **Click on the left half of $x_1$ and type a letter; then click on the right
   half of $e^{i\pi} + 1 = 0$, in the paragraph above, and type another.** *A
   click on an equation puts the caret at the edge it is nearer: the first
   letter lands before $x_1$, the second straight after the equation.* Clicking
   *beside* $x_1$, in the margin, may still place nothing in Firefox — the
   engine leaves no room there — which is why clicking the equation itself is
   the way in.

   **Select from the middle of the word before $e^{i\pi} + 1 = 0$ to the middle
   of the word after it, then press on the equation inside the selection and
   drag the selection somewhere else.** *The whole selection moves, equation
   and all, typeset where it lands,* exactly as a drag of plain text does. It
   lands as selected: drop it just before a word and the selection's last word
   runs into it, as plain text would. Until 2026-10-01 the equation was lost on
   the way, in Firefox and Chrome alike.

   **Select the same stretch again, press Ctrl/Cmd+C, click at the end of this
   paragraph and press Ctrl/Cmd+V.** *The copy lands with the equation typeset
   in it.* **Then select it again, press Ctrl/Cmd+X, and paste it somewhere
   else.** *The cut takes the equation out with the words around it, the paste
   brings it back typeset, and one Ctrl/Cmd+Z undoes the paste and a second
   undoes the cut.* Until 2026-10-01 both left the equation out of what they
   carried, and a cut deleted it as well.

   An equation can also start a line in the middle of a paragraph, after a
   hard break:\
   $z_3$ starts this second line.

   **Click just after $z_3$, press Left once, and type a letter.** *A caret
   shows before $z_3$ and the letter lands there.* This is the one edge the
   machine runs did not reach, so if the letter lands anywhere else, or the
   caret is not drawn, note what happened.

5. **Reload the page (not File → Reload — the browser's own), let it finish,
   and run this in the console:**
   `document.querySelectorAll('#editor mjx-container mjx-container').length`
   *It prints `0`.* Anything else means a reload has nested a copy of an
   equation inside itself — fixed twice on `main`, on 2026-09-29 and 2026-10-01.
   **Reload and run it twice more.** *Still `0`, and every equation on the page
   is typeset once the page has settled.* A reload is also the check that maths
   arrives when MathJax has not loaded yet; editing while it is still loading
   is too quick for a person to do on purpose, so a machine run covers that.

## Typing an equation (step 10)

Typed text is literal, so `$x^2$` typed into a paragraph stays text until the
caret leaves it, and then becomes an equation. What counts as an equation is
the same rule that applies when a file is opened: an opening `$` is never
followed by a space, and a closing `$` is never followed by a digit, so prices
stay prose.

This step is on probation. If its hand runs need more than two rounds of fixes,
maths is proposed for removal rather than fixed a third time.

Each step types into a new paragraph at the end of the file. To start one,
click at the end of the file's last line and press Enter.

1. **In a new paragraph, type `Area $x^2$` and stop.** *It stays as text, dollar signs and all,
   while the caret sits straight after the closing `$`* — the next character
   might be a digit. **Type a space.** *The `$x^2$` becomes a typeset equation
   at once, and the caret is after the space, ready for the next word. A toast
   in the corner says it was converted and that Ctrl/Cmd+Z keeps it as text*
   (⌘Z on a Mac). Every conversion below raises the same toast. **Keep
   typing a few words, spaces and all.** *Every space and letter lands where
   you typed it.* Until 2026-10-04, Chrome and Safari put each letter typed
   at a line's end in front of the space before it.

2. **In a new paragraph, type `It cost $5 and $10.`** *It stays text throughout*, including the
   moment after the second `$`, and the `10` arriving settles it as a price.

3. **In a new paragraph, type `Then $y_1$` and press Enter.** *The equation
   forms, and the caret is at the start of the new paragraph.* **Type
   `Also $z$` and click anywhere else in the document.** *It forms when the
   caret leaves.*

4. **Type `$w$ ` (with the space) in a new paragraph, so it forms, then press
   Ctrl/Cmd+Z once.** *The equation turns back into the text you typed, with
   the caret where it was.* **Type a letter.** *It stays text*: an undone
   conversion is not made again until that text changes.

5. **Put the caret just after one of the equations you made and press
   Backspace once.** *It turns into its source, with the caret just before the
   closing `$`.* **Change the TeX — `^2` to `^3`, say — then press Right twice,
   so the caret leaves it.** *It forms again, showing the change.* **Then
   select the equation by dragging across it and press Backspace.** *It goes
   whole, in one press.*

6. **In a new paragraph, type `$$\frac{a}{b}$$` and press Enter.** *It forms
   as a display equation, centred on a line of its own.*

7. **In a new paragraph, type `$q$ starts this line` and press Left until the
   caret is before the equation.** *The equation formed at the space, a caret
   shows before it, and a letter typed there lands before it.* That is the
   caret stop from step 2, now in front of an equation you made.

8. **Save As to a scratch name** (never over this file), **then open the
   scratch file.** *Every equation you made comes back typeset, and the
   paragraphs read as you left them.* One thing does not survive the save yet:
   the `$w$` you undid in 4 comes back as an equation, because the old core's
   save does not escape a typed `$`. That is stage 4's; note it, but it is not
   a failure here. Delete the scratch file afterwards.

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*

## Bold, italic and strikethrough (step 3)

The format bar appears over a selection, and the **Format** menu has the same
three items. Each one toggles: on when anything selected is without it, off
when all of it already has it. There are no keyboard shortcuts yet; they are
step 8's.

The paragraphs to work on:

Alpha beta gamma delta.

One _two_ three.

First para here.

Second para here.

1. **Double-click `beta` in "Alpha beta gamma delta." and press Bold on the
   format bar.** *`beta` turns bold and stays selected.* **Press Bold again.**
   *It goes back to plain and is still selected.*
2. **Double-click `gamma` and choose Format → Italic, then double-click
   `delta` and choose Format → Strikethrough.** *`gamma` is italic and `delta`
   is struck through.*
3. **In "One _two_ three.", double-click `three` and press Italic.** *It turns
   italic.* After a save from stage 4 on it would be written `_three_`, the
   way this file already writes italics; until then nothing on screen shows the
   spelling, so there is nothing to check here beyond the italic.
4. **Click just after `Alpha`, then hold Shift and press Right six times, so
   the selection is ` beta ` with the spaces either side. Press Bold.** *Only
   `beta` turns bold; the spaces do not.* (Undo it with Ctrl/Cmd+Z before the
   next step.)
5. **Double-click `here` in "First para here.", then hold Shift and press Right
   until the selection reaches the end of `Second` in the next paragraph.
   Press Bold.** *`here.` and `Second` turn bold, and nothing else.*
6. **Press Ctrl/Cmd+Z.** *The bold from step 5 goes, in one press.* **Press
   Ctrl/Cmd+Shift+Z.** *It comes back.*
7. **Click at the end of "Alpha beta gamma delta.", type a space, choose
   Format → Bold, type `bold`, choose Format → Bold again, and type ` plain`.**
   *`bold` is bold and ` plain` is not.*
8. **Double-click a bold word and type a new word over it.** *The new word is
   bold.* **Double-click a plain word just after a bold one and type over it.**
   *The new word is plain.*
9. **Click inside a bold word and open the Format menu.** *Bold has a check
   beside it, and Italic and Strikethrough do not.* **Click at the end of a
   plain line, choose Format → Bold, and open the menu again.** *Bold is
   checked, though nothing is typed yet.* **Select a range that is half bold
   and open the menu.** *Bold has a faint check.* Added 2026-10-24, after the
   first Firefox run of this section asked for it.

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*

## Inline code and links (step 4)

Code on the format bar, Insert → Link… and Ctrl/Cmd+K. Here Code acts inside
one block; over a whole block it makes a code block, which is step 5's section.

The paragraphs to work on:

Run npm now.

See the docs now.

Read [the guide](https://a.example) first.

1. **Double-click `npm` and press Code on the format bar.** *It becomes a code
   span and stays selected.* **Press Code again.** *It is plain text again.*
2. **Triple-click "Run npm now." to select the whole paragraph and press
   Code.** *It becomes a code block*, step 5's half of Code. (Undo it.)
3. **Double-click `docs` and choose Insert → Link…. Type `example.com/docs`
   and press Insert.** *`docs` becomes a link.* **Hover it.** *The hint says
   Ctrl/Cmd+click opens it.*
4. **Click inside "the guide" and press Ctrl/Cmd+K.** *The dialog says Edit
   link and holds `https://a.example`.* **Change it to `https://b.example` and
   press Update.** *The link still reads "the guide"; Ctrl/Cmd+click goes to the
   new address.*
5. **Click inside "the guide" again, press Ctrl/Cmd+K, clear the field and press
   Update.** *The link is gone and the words stay.*
6. **Click at the end of "Run npm now.", type a space, press Ctrl/Cmd+K, type
   `https://e.example` and press Insert.** *The address appears as its own
   link.*
7. **Press Ctrl/Cmd+Z after any of the above.** *That one change goes, in one
   press.*
8. **Click inside a code span and open the Format menu.** *The item reads
   Code, not Code block, and has a check beside it.* **Hover the format bar's
   code button.** *Its tooltip says Code.* Added 2026-10-24, after the user
   found both missing.

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*

## Paragraphs, headings and the code block (step 5)

Paragraph and Heading 1–6 act on whole blocks, from the Format menu or from the
bar that appears with the caret at the start of a line. Code over whole blocks,
or at a bare caret, makes a code block.

The paragraphs to work on:

A title to change

A second line

- a bullet
- another bullet

npm test

1. **Click in "A title to change" and choose Format → Heading 2.** *It becomes
   a heading.* **Choose Format → Paragraph.** *It is a paragraph again.*
2. **Put the caret at the very start of "A title to change".** *The short bar
   appears.* **Press H1 on it.** *The line becomes a Heading 1.* (Undo it.)
3. **Select from the start of "A title to change" to the end of "A second
   line" and choose Format → Heading 3.** *Both become Heading 3.* (Undo it.)
4. **Click in "a bullet" and choose Format → Heading 1.** *Nothing changes*:
   a heading inside a bullet is refused.
5. **Put the caret at the start of "npm test" and press Code on the short
   bar.** *It becomes a code block.* **Click in it and choose Format → Code.**
   *It is plain text again.*
6. **Select both bullets and choose Format → Code.** *A message says to select
   inside a single block, and nothing changes.*
7. **Press Ctrl/Cmd+Z after any of the above.** *That change goes, in one
   press.*

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*

## Lists (step 6)

Bullet list and Numbered list, from the Format menu or the bar at a line's
start. What they do depends on where the caret is: paragraphs become a list,
the list's own type takes items out of it, and the other type switches the
whole list.

The paragraphs and list to work on:

Plain line one

Plain line two

- first bullet
- second bullet
- third bullet

1. **Put the caret at the start of "Plain line one" and press the bullet
   button on the short bar.** *It becomes a bullet.* (Undo it.)
2. **Select from "Plain line one" to the end of "Plain line two" and choose
   Format → Numbered list.** *They become one list, numbered 1 and 2.* (Undo
   it.)
3. **Click in "second bullet" and choose Format → Bullet list.** *It leaves
   the list as a plain paragraph, and the bullets above and below it stay
   bullets.* (Undo it.)
4. **Click in "second bullet" and choose Format → Numbered list.** *All three
   become numbered and join the numbered list of steps below them*, because to
   markdown a numbered list right after another one is the same list. (Undo
   it.) Until 2026-10-26 this was refused with a notice instead.
5. **Click in a heading and choose Format → Bullet list.** *A message says to
   select paragraphs or items of one list, and nothing changes.*
6. **Press Ctrl/Cmd+Z after any of the above.** *That change goes, in one
   press.*

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*

## The rule, the table of contents and Clear (step 7)

Insert → Horizontal rule, Insert → Table of contents, and Edit → Clear
document. This section uses the whole file, so undo each step before the next.

The paragraph to work on:

Alpha beta gamma

- a bullet for the rule

1. **Click between `beta` and `gamma` in "Alpha beta gamma" and choose Insert →
   Horizontal rule.** *A rule appears there, splitting the line in two.*
   (Undo it.)
2. **Put the caret at the very start of "a bullet for the rule" and choose
   Insert → Horizontal rule.** *A message says a rule cannot go at the start of
   a list item, and nothing changes.*
3. **Click in this section's heading and choose Insert → Table of contents.**
   *A nested list of this file's headings appears under the heading, and each
   entry Ctrl/Cmd+clicks to its heading.* (Undo it.)
4. **Choose Edit → Clear document.** *The whole document empties.* **Press
   Ctrl/Cmd+Z.** *All of it comes back, in one press.*

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*

## The keys and the clipboard (step 8)

Ctrl/Cmd+B and Ctrl/Cmd+I, and Edit → Cut and Edit → Copy. In Firefox on a Mac
Cmd+B used to open the bookmarks sidebar; under the model core the editor takes
the key.

The paragraphs to work on:

Alpha beta gamma

Paste here:

1. **Double-click `beta` and press Ctrl/Cmd+B.** *`beta` turns bold, stays
   selected, and no bookmarks sidebar opens.* **Press it again.** *It goes
   back to plain.* **Press Ctrl/Cmd+I.** *It turns italic.* (Undo it.)
2. **Click at the end of "Alpha beta gamma", type a space, press Ctrl/Cmd+B,
   type `bold`, press Ctrl/Cmd+B again and type ` plain`.** *`bold` is bold and
   ` plain` is not.* (Undo it.)
3. **Make `beta` bold, double-click it, and choose Edit → Copy.** *Nothing on
   the page changes, and no permission prompt appears.* **Click at the end of
   "Paste here:" and press Ctrl/Cmd+V.** *A bold `beta` appears.* (Undo the
   paste.)
4. **Double-click `gamma` and choose Edit → Cut.** *It disappears.* **Click
   at the end of "Paste here:" and press Ctrl/Cmd+V.** *`gamma` appears there.*
5. **Press Ctrl/Cmd+Z after any of the above.** *That change goes, in one
   press.*

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*

## Everything together (step 9)

The last pass of slice 7. **Run this whole file top to bottom on one open
document first**, undoing only where a step says so, so the formats meet the
way they do in real use. Then this section, for what no section above has done.

The paragraphs to work on:

A word to dress up here.

1. first number
2. second number

Read the [field notes][notes] first.

[notes]: https://example.org/notes

1. **Double-click `dress`, press Ctrl/Cmd+B, then Ctrl/Cmd+I, then choose
   Format → Strikethrough.** *`dress` is bold, italic and struck through at
   once.* **Open the Format menu.** *Bold, Italic and Strikethrough all have
   a check.* (Close the menu with Escape.)
2. **Double-click `word` in the same line and press Code on the format bar.**
   *It becomes a code span, and `dress` keeps all three of its marks.*
3. **Click in "first number" and choose Format → Bullet list.** *Both numbered
   items become bullets.*
4. **Click in "field notes" and press Ctrl/Cmd+K.** *The dialog says Edit link
   and holds `https://example.org/notes`.* **Change it to
   `https://example.org/elsewhere` and press Update.** *The link still reads
   "field notes", and Ctrl/Cmd+click goes to the new address.*
5. **Save As to a scratch name** (never over this file), **then open the
   scratch file.** *Everything you did in this whole pass comes back as you
   left it*: the marks, the code, the lists, the links, the headings, and every
   equation typeset. **Delete the scratch file afterwards.**

Throughout, *the console stays free of `[model] render diverged` warnings and
of errors.*
