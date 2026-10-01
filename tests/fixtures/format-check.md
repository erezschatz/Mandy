# Slice 7 under the model core — hand check

This file is the protocol and the document it runs on, in one. Open it in the
app, follow the steps, and edit the paragraphs written for each one. **Bold** is
what you do; *italics* is what should (or should not) happen.

It grows with TODO 3.1's slice 7: each step that needs a person adds its
section here. Today it holds step 2's, the maths. (It held diagrams too until
Mermaid was removed on 2026-10-01.)

## Before you start

1. **Run the server** (`npm run serve`) and **open
   `http://localhost:9130/?core=model`**. *The toolbar shows a `model core`
   marker.* If it does not, you are testing the old core and none of this
   means anything.
2. **Open the browser console and run `modelVerifySetEnabled(true)`.**
   Throughout, *the console stays free of `[model] render diverged` warnings*.
   One appearing is a failure, whichever step it came in.
3. **File → Open this file** (`tests/fixtures/format-check.md`). *The console
   shows no errors, here or anywhere in this protocol.*

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
   *The whole equation goes in one press.* **Ctrl/Cmd+Z brings it back, drawn.**

   $x_1$ starts this line, and it ends with one: $y_2$

   **Click just after $x_1$, press Left once, and type a letter. Then click at
   the very end of the line, after $y_2$, and type another.** *A caret shows
   before $x_1$ and after $y_2$, the first letter lands before $x_1$ and the
   second after $y_2$, and nothing else on the line moves.* **Then
   Ctrl/Cmd+Z twice.** *Both letters go, and the caret comes back before
   $x_1$.* In Firefox a mouse click before $x_1$ does not place a caret, with or
   without the stop: `tests/caret-guard-check.html` measured that on
   2026-10-01. The keyboard reaching it is what the stop is for.

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
   equation inside itself — the bug fixed on `main` on 2026-09-29. **Reload
   and run it twice more.** *Still `0`.*

6. **Open this file in a second, fresh browser window** (so MathJax has not
   been loaded in it yet), **and press Enter in this sentence as soon as the
   page appears.** *The equations may appear a moment after the rest of the
   page — that is MathJax loading — but they do appear, and stay drawn after
   the Enter.*
