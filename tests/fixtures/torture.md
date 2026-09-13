---
title: The Bexley Valley Survey
author: M. Ardenne
season: 1974
tags: [field-notes, draft, do-not-cite]
---

The Bexley Valley Survey
========================

A deliberately messy document. It is the `model` suite's fidelity oracle, and it
exists because this repo's own prose is a **biased** one: every other markdown
file here was written or reformatted in one voice, so it is uniformly
well-formed and it silently omits whole constructs. This file omits nothing and
is uniform nowhere.

The front matter above is not parsed: `markdownit()` ships no front-matter
plugin, so those five lines read as a rule followed by a setext heading. That is
wrong and it still round-trips, which is the property under test. `model.js`
already carries a `front-matter` kind for the day the plugin arrives.

Read it as a field report. The seams are the point --- mixed bullet characters,
ragged table padding, tabs beside spaces, four kinds of emphasis delimiter, and
at least one of everything in [MARKDOWN.md](../../docs/MARKDOWN.md). Nothing
here is malformed; it is all legal and all inconsistent, which is the hard case.
An editor that opens this and saves it must hand back these exact bytes.

Preliminaries
-------------

### 1. Terms of reference

The survey ran from *March* to _November_. Its remit was **narrow** and its
funding was __narrower__. Three questions were asked, and ***only the third***
was answered; the others remain ___open___ to this day.

We use `sensor` to mean the instrument, `` `sensor` `` to mean the literal
string, and ``a `quoted` run`` where a backtick must survive inside the span.
The span ` padded ` keeps its shoulders. So does `` ` `` on its own.

A line that ends in two spaces breaks here  
and continues on the next line without a new paragraph. A line ending in a
backslash does the same thing\
but says so visibly, which is the argument S3 settled.

Escapes are used throughout: \*not emphasis\*, \_not emphasis\_, a literal
\# hash, a \[bracket\] pair, a backslash \\ alone, and \`not code\`. The
sequence 5 \* 3 \* 2 is arithmetic, not a bullet list.

### 2. Sites

| Site | Grid ref | Depth (m) | Notes |
| --- | :-- | --: | :-: |
| Upper Bexley | `SU 4412 9087` | 12.4 | dry |
| Nether Fold |`SU 4501 8990`| 3.2 |damp|
| Hollow Ash | `SU 4388 9123` |   88.0   | **flooded** |
| The Leat | `SU 4390 9001` | 0.5 | see \| note |

Padding above is ragged on purpose, and the alignment row uses all four
spellings. A cell may hold `code | with a pipe` or an escaped \| character, and
both have to come back as written.

### 3. Method

1. Establish the datum.
2. Walk the transect.
   1. Record at ten-metre intervals.
   2. Note any change in substrate.
      1. Sand.
      2. Clay.
         1. Firm clay.
         2. Soft clay.
            1. Soft clay, waterlogged.
            2. Soft clay, desiccated.
               - And a bullet at the sixth level, under a number.
               - Which is where we stop.
3. Return by the ridge.

The list above is the `1.2.3` case the plan asked for, taken to six. The list
below is the same idea with every marker changed per level, which is a real
convention and one `sniffMarkdownStyle` reads per depth:

- Upper terrace
  * Bracken
    + Young growth
      - Under two years
        * Under one year
          + Seedlings, counted separately
  * Gorse
- Lower terrace
  * Reed

Ordered lists do not have to start at one, and do not have to increment:

4. The fourth observation.
5. The fifth.
6. The sixth.

1. All ones,
1. which is a convention this repo's own `docs/TODO.md` does not use,
1. and which therefore has no oracle anywhere else.

Delimiters vary too:

1) A parenthesis,
2) rather than a period.

### 4. Loose and tight

A tight list has no blank lines between its items:

- One
- Two
- Three

A loose list does, and CommonMark wraps each item in a paragraph as a result:

- One

- Two

- Three

A list whose items hold sub-paragraphs is loose whether or not it looks it:

- The first item opens here.

  It continues in a second paragraph, indented to the content column.

- The second item is flush against the first's continuation, which is the exact
  shape that defeats matching on blank-line-separated blocks.

An item can hold a fence, a quote, or a table:

- Holding a fence:

  ```sh
  bexley --transect 3 --dry-run
  ```

- Holding a quote:

  > The datum was moved in 1969 and nobody wrote it down.

- Holding a table:

  | n | reading |
  | - | ------- |
  | 1 | 12.4    |
  | 2 | 3.2     |

- Holding a heading, which Mandy refuses to *author* but must still *read*:

  #### A heading inside a list item

An item's continuation may be indented with a tab rather than spaces:

-	Tab-marked item, whose continuation line
	sits under a tab as well.

Findings
--------

> The valley is not a valley. It is two valleys that share a name, a fact the
> 1911 survey recorded and the 1953 survey lost.
>
> > A nested quote, for the 1953 surveyors' own marginal note, which reads:
> > "the earlier plate is in error and has been set aside".
> >
> > > And a third level, because the note itself quotes the plate.
>
> Back at the first level, after a blank quote line.

A quote may hold any block at all:

> ### A heading inside a quote
>
> 1. A list inside a quote.
> 2. With two items.
>
> | col | col |
> | --- | --- |
> | a   | b   |
>
> ```python
> def datum(): return 1969
> ```
>
> And a final paragraph, which uses a lazy continuation —
this line has no `>` at all and still belongs to the quote.

### 5. Code

An indented code block, four spaces, which the editor will re-emit as a fence
if it is ever edited and must otherwise be left exactly alone:

    bexley --legacy
      --no-fence
        --indent-only

A fence with no language:

```
raw output, 1974-03-11
```

A fence whose body is markdown, which must not be parsed as markdown:

```markdown
# Not a heading

- Not a list
- | Not | a | table |

> Not a quote

**Not bold**, `not code`, [not a link](nowhere).
```

A fence inside a fence, which needs the outer one to be longer:

````markdown
```sh
echo "the inner fence is three backticks"
```
````

And the tilde spelling, which `sniffMarkdownStyle` does not read yet and S3 says
it should:

~~~
tilde-fenced, and it holds a ``` run that would close a backtick fence
~~~

### 6. References and links

An inline [link](https://example.org/bexley), one [with a title](https://example.org "The Bexley Papers"),
one whose destination needs [angle brackets](<https://example.org/a file.pdf>),
and an autolink: <https://example.org/plain>. An email autolink too:
<ardenne@example.org>.

Reference links come in three spellings, and only the first survives an edit
today: a [full reference][papers], a [collapsed one][], and a [shortcut].

The definitions sit here, in the middle of the document, where the author put
them and where they must stay:

[papers]: https://example.org/papers "The Bexley Papers"
[collapsed one]: https://example.org/collapsed
[shortcut]: https://example.org/shortcut

A definition may also wrap onto a second line, which today's scanner cannot
see at all:

[wrapped]: https://example.org/a-very-long-destination-that-runs-on
    "And a title on the following line"

Links can carry formatting: [**bold link**](https://example.org/b) and
[`code link`](https://example.org/c). A link may point at a heading in this
same file, like [the method section](#3-method).

![An image](https://example.org/plate.png), one ![with a title](https://example.org/p.png "Plate IV"),
and a reference image ![by reference][plate].

[plate]: https://example.org/plate-iv.png

### 7. The rest

Strikethrough is ~~struck~~, which the default preset gives us. Inline maths
reads $d = \sqrt{x^2 + y^2}$ and display maths stands alone:

$$
\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

The `$` in `$HOME` is not maths, and neither is a price of $40 or $5.

Raw HTML is escaped rather than rendered, and must round-trip as the literal
text it is:

<div align="center">
  <strong>Not rendered.</strong>
</div>

An inline <span class="x">span</span> and a self-closing <br/> likewise.

Three rules, three spellings:

---

***

___

And one with spaces in it:

- - -

Setext headings, both levels
----------------------------

A setext h2 sits above. A setext h1 sits below.

Closing hashes are legal too
============================

#### A heading with closing hashes ####

##### The fifth level #####

###### The sixth level, which only the Format menu reaches ######

# An ATX h1, which this file otherwise reaches only by setext

## An ATX h2, likewise

### 8. Not parsed yet, and round-tripping as text until they are

Everything in this section renders as literal text today. Each one is a row in
[MARKDOWN.md](../../docs/MARKDOWN.md) — two settled as 1.0 work, the rest on the
roadmap — and every one of them has to come back byte for byte in the meantime.

Task lists, which are settled as 1.0 work and will need a live checkbox:

- [ ] Re-walk the northern transect
- [x] File the 1953 marginalia
  - [ ] Including the plate that was set aside

A heading id, also settled as 1.0 work:

### A heading with an explicit id {#the-explicit-one}

Footnotes, which are roadmap:[^1] and a second one.[^note]

[^1]: The 1911 survey, plate IV.
[^note]: Ardenne, M., *Field notes*, unpaginated.

A definition list, roadmap:

Datum
: The reference level, moved in 1969.

Transect
: A walked line.

And the small ones: an emoji shortcode :sparkles:, a ==highlight==, H~2~O with a
subscript, and x^2^ with a superscript. An abbreviation too:

*[SU]: Ordnance Survey grid square

Appendix
--------

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
culpa qui officia deserunt mollit anim id est laborum.

The final line of the file carries no trailing newline problem, and the file
ends with a single one.
