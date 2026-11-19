# A file written on Windows

This fixture is held with CRLF line endings, every one of them, and
`.gitattributes` marks it `-text` so no checkout or commit converts it. It is
the oracle's sweep run once more over a file whose bytes are not LF (TODO 1.13).

Setext heading
--------------

A paragraph with a hard break  
spelled with two spaces, and another\
spelled with a backslash, then *emphasis*, __strong__, `code` and a
[reference link][ref] beside an [inline one](https://example.com "title").

- a bullet
- a bullet with a second line
  under its continuation indent
  1. a nested ordered item
  2. and another

     with a second paragraph

> A quote, two lines
> long.
>
> - with a list inside it
> - of two items

```js
const fenced = "kept as source";
```

    indented code

| a | b |
| --- | --- |
| 1 | 2 |

---

<div>
  raw html
</div>

[ref]: https://example.com/ref

The last paragraph.
