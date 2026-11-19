# Undo under the model core — hand check

This file is the protocol and the document it runs on, in one. Open it in the
app, follow the steps, and type into the paragraphs and lists written for each
one. **Bold** is what you do; *italics* is what should (or should not) happen.

## Before you start

1. **Run the server** (`npm run serve`) and **open
   `http://localhost:9130/?core=model`**. *The toolbar shows a `model core`
   marker.* If it does not, you are testing the old core and none of this
   means anything.
2. **Open the browser console and run `modelVerifySetEnabled(true)`.**
   Throughout, *the console stays free of `[model] render diverged` warnings*.
   One appearing is a failure, whichever step it came in.
3. **File → Open this file** (`tests/fixtures/undo-check.md`). It has to be
   opened from disk rather than restored from autosave, or step 1 below has no
   save point to return to.

**Never save over this file.** It is the pristine copy every run starts from.
To start again, use **File → Reload** and choose to discard.

"Ctrl/Cmd" means Cmd on a Mac and Ctrl elsewhere. Redo is Ctrl/Cmd+Shift+Z, or
Ctrl+Y.

## 1. Enter at the end of a bullet (the case that was TODO 1.6)

Do this one first, while the file has no edits yet.

- The first bullet, which is only here to stand above the second.
- Put the caret at the very end of this bullet.
- A third bullet, below.

**Click at the end of the second bullet, press Enter, then Ctrl/Cmd+Z.**
*The new empty bullet goes, the caret is back at the end of the second
bullet — not at the top of the document — and the tab's edited dot clears.*

## 2. A run of typing is one step

Type a word into the middle of this sentence and then undo it.

**Click between two words above, type a word at a steady pace, then press
Ctrl/Cmd+Z once.** *The whole word goes in one step, and the caret is back
where you started typing.*

## 3. A pause splits the run

A pause is any gap of more than 0.6 seconds between two keystrokes. How long the
word takes does not matter; only stopping does.

**Type a word into this sentence, stop for a full second, type a second word,
then press Ctrl/Cmd+Z twice.** *The first press takes back the second word, the
second press the first.*

## 4. Enter is its own step

No machine can drive this one: automation's keystrokes raise no
`insertParagraph`.

**Click at the end of this sentence, type a word, press Enter, type another
word, then press Ctrl/Cmd+Z three times.** *The second word goes, then the new
paragraph, then the first word — three steps, in that order.*

## 5. Indent and outdent undo whole

Only the item the caret is in moves, both ways. Nothing else changes position
on screen.

- An item that stays where it is.
- Put the caret in this item and press Tab.
- An item that never moves.

**Click in the second item, press Tab, then Ctrl/Cmd+Z.** *The second item
moves in under the first, then back out. The third never moves.* **Then
Ctrl/Cmd+Shift+Z.** *It moves back in.*

- A parent item.
  - Put the caret in this nested item and press Shift+Tab.
  - An item below it, which stays where it is.
  - Another, which stays too.

**Click in the first nested item, press Shift+Tab, then Ctrl/Cmd+Z.** *It moves
out to the top level, then back in. The two items below it stay where they are
throughout.* **Then Ctrl/Cmd+Shift+Z.** *It moves back out.*

(What does change with Shift+Tab is only which item the two below it belong to:
before, the parent item; after, the one that moved out. That is why they stay
put — they go out a level and in a level at the same moment.)

## 6. A paste is one step

**Copy the three paragraphs below this heading's instructions** — from "Alpha"
to the end of "Gamma" — **then click in the middle of this sentence and paste.**
*The sentence splits around what you pasted.* **Press Ctrl/Cmd+Z once.** *The
whole paste goes, and the sentence is one sentence again.*

Alpha, the first paragraph to copy.

Beta, the second.

Gamma, the third.

## 7. A composed character is one step

**Click in this sentence and type an accented letter** — hold a vowel for the
macOS popup, or use a dead key — **then press Ctrl/Cmd+Z once.** *The accented
letter goes, whole, in one step.*

## 8. A fresh edit discards what could have been redone

**Type a word here, press Ctrl/Cmd+Z, type a different word, then press
Ctrl/Cmd+Shift+Z.** *Nothing comes back: the first word is gone for good.*

## 9. Two tabs never reach each other

**Type a word in this sentence. Then File → New, and type a word in the new
tab. Switch back and forth, and press Ctrl/Cmd+Z in each.** *Each tab takes
back its own word only, and never the other tab's.* **Close the new tab when
done, discarding.**

## Not here

The browser's own undo — Edit → Undo in its menu, or the trackpad gesture — is
`front/input-check.html`'s question, and it is answered: no engine raises
`historyUndo` at all, so under the model core Ctrl/Cmd+Z is the only undo there
is.
