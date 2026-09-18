# Hard break test

Open this in Mandy, edit the four labelled paragraphs at the bottom, save, and
run the checker. The long filler below is load-bearing: it is what gives the
width sniffer enough ordinary lines to report a real number.

The width sniffer takes the ninety-fifth percentile of every prose line in
the file, which is why this section runs as long as it does. Three long
lines live at the bottom of this document, and the percentile has to land
below all of them or it returns zero and nothing wraps. Zero would make
every check here pass for entirely the wrong reason, so the filler is not
padding; it is the thing that makes the test mean anything. It also wants at

least three wrapped paragraphs and ten prose lines before it will commit to
a number at all. Greedy wrapping means the width has to be exact: guess two
columns wide and every break in the document moves. That is why the sniffer
measures rather than assumes, and why it gives up entirely rather than
guessing badly. A file that mixes one sentence per line with wrapped prose
has no single width, and gets whichever convention wins the count. The cost

of a bad guess is bounded by the restore layer, which only lets the measured
width near blocks that actually changed. An untouched paragraph never
reaches the wrapper at all; its original bytes come back from the index
instead. So the only way to exercise the wrapper is to edit the paragraph
you care about, which is what the instructions below ask for. The width
sniffer takes the ninety-fifth percentile of every prose line in the file,

which is why this section runs as long as it does. Three long lines live at
the bottom of this document, and the percentile has to land below all of
them or it returns zero and nothing wraps. Zero would make every check here
pass for entirely the wrong reason, so the filler is not padding; it is the
thing that makes the test mean anything. It also wants at least three
wrapped paragraphs and ten prose lines before it will commit to a number at

all. Greedy wrapping means the width has to be exact: guess two columns wide
and every break in the document moves. That is why the sniffer measures
rather than assumes, and why it gives up entirely rather than guessing
badly. A file that mixes one sentence per line with wrapped prose has no
single width, and gets whichever convention wins the count. The cost of a
bad guess is bounded by the restore layer, which only lets the measured

width near blocks that actually changed. An untouched paragraph never
reaches the wrapper at all; its original bytes come back from the index
instead. So the only way to exercise the wrapper is to edit the paragraph
you care about, which is what the instructions below ask for. The width
sniffer takes the ninety-fifth percentile of every prose line in the file,
which is why this section runs as long as it does. Three long lines live at

the bottom of this document, and the percentile has to land below all of
them or it returns zero and nothing wraps. Zero would make every check here
pass for entirely the wrong reason, so the filler is not padding; it is the
thing that makes the test mean anything. It also wants at least three
wrapped paragraphs and ten prose lines before it will commit to a number at
all. Greedy wrapping means the width has to be exact: guess two columns wide

and every break in the document moves. That is why the sniffer measures
rather than assumes, and why it gives up entirely rather than guessing
badly. A file that mixes one sentence per line with wrapped prose has no
single width, and gets whichever convention wins the count. The cost of a
bad guess is bounded by the restore layer, which only lets the measured
width near blocks that actually changed. An untouched paragraph never

reaches the wrapper at all; its original bytes come back from the index
instead. So the only way to exercise the wrapper is to edit the paragraph
you care about, which is what the instructions below ask for.

ALPHA is the bug case. This line runs well past the sniffed width and ends in two invisible trailing spaces, so the re-wrapper has to take it apart and put the break back  
and this is the line that follows ALPHA's break.

BRAVO is the control that always worked  
because its line is short enough that the re-wrapper never touches it.

CHARLIE uses the other spelling. This line is also far longer than the sniffed width and it ends in a backslash, which survived by construction and must keep doing so\
and this is the line that follows CHARLIE's break.

DELTA has no break at all, and this line is long enough that it must be re-wrapped, which is what proves the wrapper actually ran instead of the file passing by untouched.

ECHO is left untouched and must come back byte-identical, which is what the
restore layer is for.
