# php-text-parity

PHP-compatible text processing for JavaScript, verified byte for byte against PHP 8.3.

If you are porting a PHP application to JavaScript, or running a JavaScript front end against a PHP back end, text handling is where the two quietly disagree. `trim()` uses a different character set. `strlen()` counts bytes, not characters. `grapheme_strlen()` counts something else again. And `strnatcasecmp()` has an ordering that no JavaScript comparator reproduces by default.

This library implements those semantics, plus 48 text transforms built on top of them. Every behaviour is checked against recorded output from the PHP implementation it was ported from.

```bash
npm install php-text-parity
```

## Why this exists

Four differences cause most of the bugs.

```js
import { phpTrim, byteLength, characterLength, natCaseCmp } from 'php-text-parity';

// 1. trim() masks differ in both directions
phpTrim('\u000B x \u0000');        // 'x'          — PHP strips NUL
'\u000B x \u0000'.trim();          // 'x \u0000'   — JavaScript does not
phpTrim('\u00A0x\u00A0');          // '\u00A0x\u00A0' — PHP keeps NBSP
'\u00A0x\u00A0'.trim();            // 'x'          — JavaScript strips it

// 2. strlen() is bytes
byteLength('Привіт');              // 12
'Привіт'.length;                   // 6

// 3. grapheme_strlen() is user-perceived characters
characterLength('👍🏽');             // 1
'👍🏽'.length;                      // 4

// 4. strnatcasecmp() sorts numerically inside strings
['file10', 'file9'].sort(natCaseCmp);   // ['file9', 'file10']
['file10', 'file9'].sort();             // ['file10', 'file9']
```

## Transforms

48 processors share one entry point.

```js
import { process } from 'php-text-parity';

process('sort-lines', { source: 'b\na\nitem10\nitem9' }).output;
// 'a\nb\nitem9\nitem10'

process('slug-generator', { source: 'Привіт, Світ! Café naïve' }).output;
// 'pryvit-svit-cafe-naive'

process('word-count', { source: 'Привіт світ 🎉' }).output;
// { words: 2, characters: 13, charactersWithoutSpaces: 11, bytes: 26,
//   lines: 1, sentences: 1, paragraphs: 1, readingTimeMinutes: 1 }

process('find-replace', { source: 'one two one', find: 'one', replace: '1' });
// { output: '1 two 1', message: '2 replacement(s) made.' }
```

Each call returns `{ output, message }`. `output` is a string for transforms, an object for counters, an array for extractors. Invalid input throws, with the same message PHP produces.

<details>
<summary>All 48 processors</summary>

**Case** — `lowercase`, `uppercase`, `title-case`, `sentence-case`, `alternating-case`

**Lines** — `sort-lines`, `sort-lines-desc`, `reverse-lines`, `shuffle-lines`, `remove-duplicate-lines`, `remove-empty-lines`, `remove-line-numbers`, `prefix-lines`, `suffix-lines`, `quote-lines`, `lines-to-comma-list`, `comma-list-to-lines`, `words-to-lines`

**Whitespace** — `collapse-spaces`, `trim-whitespace`, `remove-all-spaces`, `remove-tabs`, `tabs-to-spaces`

**Content** — `find-replace`, `remove-word`, `remove-numbers`, `remove-punctuation`, `remove-duplicate-words`, `strip-emojis`, `repeat-text`, `reverse-text`, `reverse-words`, `slug-generator`

**Extraction** — `extract-emails`, `extract-urls`, `extract-numbers`, `extract-phone-numbers`, `extract-hashtags`, `extract-mentions`, `unique-word-count`, `word-frequency`

**Counting** — `word-count`, `character-count`, `line-count`, `paragraph-count`, `sentence-count`, `reading-time`, `text-statistics`

</details>

Individual transforms are also exported directly: `slugify`, `titleCase`, `sentenceCase`, `wordFrequency`, `sortLines`, `statistics`, and others.

## How parity is verified

The test suite is not a set of hand-written expectations. Each case was produced by running the original PHP implementation and recording its exact output, including error messages. The fixture file ships with the package.

```bash
npm test
# 95 tests, 95 pass
```

Two divergences were found and fixed this way, and they are the reason the library exists rather than a handful of utility functions:

- **Empty input.** PHP's structured output returns an empty array for counters and extractors, not an empty object. A naive port returns `{}` and breaks anything iterating the result.
- **Tie-breaking in word frequency.** PHP sorts equal-frequency words with `strnatcasecmp()`. Replacing it with a lexicographic comparison produces a different order for anything containing digits.

The `strnatcasecmp()` implementation is a port of Martin Pool's natural-order algorithm as it appears in PHP's `ext/standard/strnatcmp.c`, operating on UTF-8 bytes with ASCII case folding, so it matches PHP rather than approximating it.

## Where it came from

Extracted from [Trexmi](https://trexmi.com), where these processors run client-side so that text never leaves the browser. The server-side originals are PHP; the parity suite is what makes it safe to run either one and get the same answer.

## Notes

- ES module, Node 18+, no dependencies.
- Grapheme segmentation uses `Intl.Segmenter` where available and falls back to code points otherwise. Every current runtime has it.
- `shuffle-lines` is random by design and is excluded from the parity fixture.
- Locale-sensitive ordering in `sort-lines` uses `Intl.Collator` with numeric collation, matching PHP's `Collator` with numeric ordering enabled. Results can differ from PHP built without `intl`.

## License

MIT
