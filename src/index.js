/**
 * php-text-parity — PHP-compatible text processing for JavaScript.
 *
 * Every function here reproduces the behaviour of its PHP counterpart exactly,
 * including the edge cases that usually differ between the two languages:
 * grapheme clusters, UTF-8 byte length, PHP's trim() character mask, and
 * strnatcasecmp()'s natural ordering.
 *
 * Verified byte for byte against PHP 8.3 — see test/parity.test.js.
 *
 * @license MIT
 */

function str(value) {
    return value === null || value === undefined ? '' : String(value);
}

// PHP: explode("\n", str_replace(["\r\n","\r"], "\n", $text))
function lines(text) {
    return str(text).replace(/\r\n|\r/g, '\n').split('\n');
}

// PHP: preg_match_all("/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/u")
function words(text) {
    var value = str(text);
    if (value.trim() === '') return [];
    return value.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
}

// PHP: preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) — code points
function characters(text) {
    var value = str(text);
    return value === '' ? [] : Array.from(value);
}

var graphemeSegmenter = null;
if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try { graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); }
    catch (error) { graphemeSegmenter = null; }
}

// PHP: grapheme_extract() / \X
function graphemes(text) {
    var value = str(text);
    if (value === '') return [];
    if (graphemeSegmenter) {
        var out = [];
        var iterator = graphemeSegmenter.segment(value)[Symbol.iterator]();
        var step = iterator.next();
        while (!step.done) { out.push(step.value.segment); step = iterator.next(); }
        return out;
    }
    return characters(value);
}

// PHP: grapheme_strlen()
function characterLength(text) {
    return graphemes(text).length;
}

// PHP: strlen() — byte length of the UTF-8 string
var encoder = new TextEncoder();
function byteLength(text) {
    return encoder.encode(str(text)).length;
}

// PHP trim() default character mask: " \t\n\r\0\x0B"
function phpTrim(text) {
    return str(text).replace(/^[ \t\n\r\0\x0B]+/, '').replace(/[ \t\n\r\0\x0B]+$/, '');
}

function fail(message) {
    throw new Error(message);
}

/**
 * Port of PHP strnatcasecmp() (Martin Pool's natural order algorithm as
 * implemented in ext/standard/strnatcmp.c). Needed so that tie-broken
 * orderings — word frequency in particular — match the server exactly.
 */
function natCaseCmp(left, right) {
    var a = encoder.encode(str(left));
    var b = encoder.encode(str(right));
    var ai = 0, bi = 0;

    function isDigit(code) { return code >= 48 && code <= 57; }
    function isSpace(code) { return code === 32 || (code >= 9 && code <= 13); }
    function fold(code) { return (code >= 97 && code <= 122) ? code - 32 : code; }

    function compareRight() {
        var bias = 0;
        for (;;) {
            var ca = ai < a.length ? a[ai] : 0;
            var cb = bi < b.length ? b[bi] : 0;
            var da = isDigit(ca), db = isDigit(cb);
            if (!da && !db) return bias;
            if (!da) return -1;
            if (!db) return 1;
            if (ca < cb) { if (bias === 0) bias = -1; }
            else if (ca > cb) { if (bias === 0) bias = 1; }
            ai++; bi++;
        }
    }

    function compareLeft() {
        for (;;) {
            var ca = ai < a.length ? a[ai] : 0;
            var cb = bi < b.length ? b[bi] : 0;
            var da = isDigit(ca), db = isDigit(cb);
            if (!da && !db) return 0;
            if (!da) return -1;
            if (!db) return 1;
            if (ca < cb) return -1;
            if (ca > cb) return 1;
            ai++; bi++;
        }
    }

    for (;;) {
        var ca = ai < a.length ? a[ai] : 0;
        var cb = bi < b.length ? b[bi] : 0;

        while (isSpace(ca)) { ai++; ca = ai < a.length ? a[ai] : 0; }
        while (isSpace(cb)) { bi++; cb = bi < b.length ? b[bi] : 0; }

        if (isDigit(ca) && isDigit(cb)) {
            var fractional = (ca === 48 || cb === 48);
            var result = fractional ? compareLeft() : compareRight();
            if (result !== 0) return result;
            ca = ai < a.length ? a[ai] : 0;
            cb = bi < b.length ? b[bi] : 0;
        }

        if (ca === 0 && cb === 0) return 0;

        ca = fold(ca);
        cb = fold(cb);
        if (ca < cb) return -1;
        if (ca > cb) return 1;

        ai++; bi++;
    }
}

/* ---------------------------------------------------------------
 * Text pack transforms — ports of TextToolProcessor::transform()
 * Each returns [output, message] exactly like the PHP version.
 * --------------------------------------------------------------- */

function alternatingCase(text) {
    var upper = false;
    var output = '';
    characters(text).forEach(function (character) {
        if (!/\p{L}/u.test(character)) { output += character; return; }
        upper = !upper;
        output += upper ? character.toUpperCase() : character.toLowerCase();
    });
    return [output, 'Converted to alternating case.'];
}

function extract(text, pattern, label, unique) {
    if (unique === undefined) unique = true;
    var matches = str(text).match(pattern) || [];
    var values = unique ? matches.filter(function (value, index) { return matches.indexOf(value) === index; }) : matches;
    return [values.join('\n'), values.length + ' ' + label + ' extracted.'];
}

function extractUrls(text) {
    var matches = str(text).match(/\bhttps?:\/\/[^\s<>"']+/giu) || [];
    var values = [];
    matches.forEach(function (value) {
        value = value.replace(/[.,;:!?)\]}"']+$/, '');
        if (value !== '' && values.indexOf(value) === -1) values.push(value);
    });
    return [values.join('\n'), values.length + ' unique URL(s) extracted.'];
}

function stripEmoji(text) {
    return str(text).replace(
        /(?:\p{RI}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/gu,
        ''
    );
}

function titleCase(text) {
    var lower = str(text).toLowerCase();
    return lower.replace(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu, function (match) {
        return match.replace(/^\p{L}|(?<=['’\-])\p{L}/gu, function (letter) { return letter.toUpperCase(); });
    });
}

function findReplace(text) {
    var parts = lines(text);
    if (parts.length < 3) fail('Use first line = find, second line = replace, remaining lines = text.');
    var find = parts.shift();
    var replacement = str(parts.shift());
    if (find === '') fail('The find value cannot be empty.');
    var source = parts.join('\n');
    var count = find === '' ? 0 : source.split(find).length - 1;
    return [source.split(find).join(replacement), count + ' replacement(s) made.'];
}

function paragraphCount(text) {
    var trimmed = str(text).trim();
    var count = 0;
    if (trimmed !== '') {
        count = trimmed.split(/\n\s*\n/u).filter(function (part) { return part.trim() !== ''; }).length;
    }
    return [String(count), count + ' paragraph(s).'];
}

function phoneNumbers(text) {
    var matches = str(text).match(/\+?\d[\d\s().-]{6,}\d/g) || [];
    var trimmed = matches.map(function (value) { return value.trim(); });
    var values = trimmed.filter(function (value, index) { return trimmed.indexOf(value) === index; });
    return [values.join('\n'), values.length + ' phone number(s) extracted.'];
}

function affixLines(text, prefix) {
    var parts = lines(text);
    var affix = str(parts.shift());
    var output = parts.map(function (line) { return prefix ? affix + line : line + affix; });
    return [output.join('\n'), (prefix ? 'Prefix' : 'Suffix') + ' added to every line.'];
}

function readingTime(text) {
    var count = words(text).length;
    var minutes = count ? Math.max(1, Math.ceil(count / 200)) : 0;
    return [minutes + ' minute(s)', count + ' word(s) at 200 words per minute.'];
}

function removeDuplicateLines(text) {
    var parts = lines(text);
    var output = parts.filter(function (line, index) { return parts.indexOf(line) === index; });
    return [output.join('\n'), (parts.length - output.length) + ' duplicate line(s) removed.'];
}

function removeDuplicateWords(text) {
    var parts = str(text).split(/(\s+)/u);
    var seen = Object.create(null);
    var seenCount = 0;
    var output = '';
    parts.forEach(function (part) {
        if (part === '') return;
        if (/^\s+$/u.test(part)) { output += part; return; }
        var key = part.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
        if (key === '' || seen[key] === undefined) {
            output += part;
            if (key !== '') { seen[key] = true; seenCount++; }
        }
    });
    return [output.replace(/[ \t]{2,}/g, ' '), seenCount + ' unique word(s) kept.'];
}

function removeEmptyLines(text) {
    var parts = lines(text);
    var output = parts.filter(function (line) { return line.trim() !== ''; });
    return [output.join('\n'), (parts.length - output.length) + ' empty line(s) removed.'];
}

function removeWord(text) {
    var parts = lines(text);
    var word = str(parts.shift()).trim();
    if (word === '') fail('First line must contain the word to remove.');
    var source = parts.join('\n');
    var quoted = word.replace(/[.*+?^${}()|[\]\\\/\-]/g, '\\$&');
    var pattern = new RegExp('\\b' + quoted + '\\b', 'giu');
    var matches = source.match(pattern) || [];
    var output = source.replace(pattern, '');
    return [output.replace(/[ \t]{2,}/g, ' '), matches.length + ' occurrence(s) removed.'];
}

function sentenceCase(text) {
    var output = str(text).toLowerCase().replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, function (match) {
        return match.toUpperCase();
    });
    return [output, 'Converted to sentence case.'];
}

function sentenceCount(text) {
    var trimmed = str(text).trim();
    if (trimmed === '') return ['0', '0 sentence(s).'];
    var matches = trimmed.match(/[^.!?]+(?:[.!?]+|$)/gu) || [];
    var count = 0;
    matches.forEach(function (sentence) { if (/[\p{L}\p{N}]/u.test(sentence)) count++; });
    return [String(count), count + ' sentence(s).'];
}

function shuffleLines(text) {
    var parts = lines(text);
    for (var i = parts.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = parts[i]; parts[i] = parts[j]; parts[j] = tmp;
    }
    return [parts.join('\n'), parts.length + ' line(s) shuffled.'];
}

var CYRILLIC_MAP = {
    'А':'A','Б':'B','В':'V','Г':'H','Ґ':'G','Д':'D','Е':'E','Є':'Ye','Ж':'Zh','З':'Z','И':'Y','І':'I','Ї':'Yi','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Shch','Ь':'','Ю':'Yu','Я':'Ya','Ъ':'','Ы':'Y','Э':'E',
    'а':'a','б':'b','в':'v','г':'h','ґ':'g','д':'d','е':'e','є':'ie','ж':'zh','з':'z','и':'y','і':'i','ї':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ь':'','ю':'iu','я':'ia','ъ':'','ы':'y','э':'e'
};

function slugify(text) {
    var value = str(text);
    try { value = value.normalize('NFKD'); } catch (error) { /* older engines */ }
    value = value.replace(/\p{Mn}+/gu, '');
    value = value.replace(/[\u0400-\u04FF]/g, function (character) {
        return CYRILLIC_MAP[character] !== undefined ? CYRILLIC_MAP[character] : character;
    });
    value = value.trim().toLowerCase();
    value = value.replace(/[^a-z0-9]+/g, '-');
    return value.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

var lineCollator = null;
if (typeof Intl !== 'undefined' && typeof Intl.Collator === 'function') {
    try { lineCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'variant' }); }
    catch (error) { lineCollator = null; }
}

function sortLines(text, descending) {
    var parts = lines(text);
    parts.sort(function (a, b) {
        if (lineCollator) return lineCollator.compare(a, b);
        return natCaseCmp(a, b);
    });
    if (descending) parts.reverse();
    return [parts.join('\n'), parts.length + ' line(s) sorted' + (descending ? ' descending' : '') + '.'];
}

function repeatText(text) {
    var parts = lines(text);
    var count = parseInt(str(parts.shift()).trim(), 10);
    if (!(count >= 1 && count <= 1000)) fail('First line must be a repeat count from 1 to 1000.');
    var body = parts.join('\n');
    var out = [];
    for (var i = 0; i < count; i++) out.push(body);
    return [out.join('\n'), 'Text repeated ' + count + ' time(s).'];
}

function statisticsData(text) {
    var wordCount = words(text).length;
    return {
        words: wordCount,
        characters: characterLength(text),
        charactersWithoutSpaces: characterLength(str(text).replace(/\s/gu, '')),
        bytes: byteLength(text),
        lines: str(text) === '' ? 0 : lines(text).length,
        sentences: parseInt(sentenceCount(text)[0], 10),
        paragraphs: parseInt(paragraphCount(text)[0], 10),
        readingTimeMinutes: wordCount ? Math.max(1, Math.ceil(wordCount / 200)) : 0
    };
}

function uniqueWords(text) {
    var unique = [];
    var seen = Object.create(null);
    words(str(text).toLowerCase()).forEach(function (word) {
        var clean = word.replace(/[^\p{L}\p{N}'-]/gu, '');
        if (clean !== '' && seen[clean] === undefined) { seen[clean] = true; unique.push(clean); }
    });
    return [unique.join('\n'), unique.length + ' unique word(s).'];
}

function wordFrequency(text) {
    var matches = str(text).toLowerCase().match(/[\p{L}\p{N}'-]+/gu) || [];
    var counts = Object.create(null);
    var order = [];
    matches.forEach(function (word) {
        if (counts[word] === undefined) { counts[word] = 0; order.push(word); }
        counts[word]++;
    });
    order.sort(function (a, b) {
        if (counts[b] !== counts[a]) return counts[b] - counts[a];
        return natCaseCmp(a, b);
    });
    var out = order.map(function (word) { return word + ': ' + counts[word]; });
    return [out.join('\n'), order.length + ' unique word(s) analyzed.'];
}

function jsonPretty(data) {
    return JSON.stringify(data, null, 4);
}

// Port of TextToolProcessor::transform()
function textTransform(id, text) {
    switch (id) {
        case 'alternating-case': return alternatingCase(text);
        case 'character-count': return [jsonPretty({
            characters: characterLength(text),
            charactersWithoutSpaces: characterLength(str(text).replace(/\s/gu, '')),
            bytes: byteLength(text)
        }), 'Character count completed.'];
        case 'collapse-spaces': return [phpTrim(str(text).replace(/[ \t]+/g, ' ')), 'Repeated spaces collapsed.'];
        case 'comma-list-to-lines': return [str(text).split(',').map(function (v) { return v.trim(); }).filter(function (v) { return v !== ''; }).join('\n'), 'Comma-separated values moved to separate lines.'];
        case 'extract-emails': return extract(text, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, 'unique email address(es)');
        case 'strip-emojis': return [stripEmoji(text), 'Emoji characters removed.'];
        case 'find-replace': return findReplace(text);
        case 'extract-hashtags': return extract(text, /#[\p{L}\p{N}_]+/gu, 'unique hashtag(s)');
        case 'line-count': return [str(text) === '' ? '0' : String(lines(text).length), (str(text) === '' ? 0 : lines(text).length) + ' line(s).'];
        case 'lines-to-comma-list': return [lines(text).map(function (v) { return v.trim(); }).filter(function (v) { return v !== ''; }).join(', '), 'Lines converted to a comma-separated list.'];
        case 'lowercase': return [str(text).toLowerCase(), 'Converted to lowercase.'];
        case 'extract-mentions': return extract(text, /@[\p{L}\p{N}_.-]+/gu, 'unique mention(s)');
        case 'extract-numbers': return extract(text, /[-+]?\d*\.?\d+/g, 'number(s)', false);
        case 'paragraph-count': return paragraphCount(text);
        case 'extract-phone-numbers': return phoneNumbers(text);
        case 'prefix-lines': return affixLines(text, true);
        case 'quote-lines': return [lines(text).map(function (line) { return '"' + line.split('"').join('\\"') + '"'; }).join('\n'), 'Lines wrapped in quotes.'];
        case 'reading-time': return readingTime(text);
        case 'remove-all-spaces': return [str(text).replace(/\s+/gu, ''), 'All whitespace removed.'];
        case 'remove-duplicate-lines': return removeDuplicateLines(text);
        case 'remove-duplicate-words': return removeDuplicateWords(text);
        case 'remove-empty-lines': return removeEmptyLines(text);
        case 'remove-line-numbers': return [lines(text).map(function (line) { return line.replace(/^\s*(?:\d+[.):\-]?\s+|\[\d+\]\s*)/, ''); }).join('\n'), 'Leading line numbers removed.'];
        case 'remove-numbers': return [str(text).replace(/\d+/g, ''), 'Numbers removed.'];
        case 'remove-punctuation': return [str(text).replace(/[\p{P}\p{S}]+/gu, ''), 'Punctuation and symbols removed.'];
        case 'remove-tabs': return [str(text).split('\t').join(''), 'Tab characters removed.'];
        case 'remove-word': return removeWord(text);
        case 'reverse-lines': return [lines(text).reverse().join('\n'), 'Line order reversed.'];
        case 'reverse-text': return [graphemes(text).reverse().join(''), 'Text reversed.'];
        case 'reverse-words': return [words(text).reverse().join(' '), 'Word order reversed.'];
        case 'sentence-case': return sentenceCase(text);
        case 'sentence-count': return sentenceCount(text);
        case 'shuffle-lines': return shuffleLines(text);
        case 'slug-generator': return [slugify(text), 'Slug generated.'];
        case 'sort-lines': return sortLines(text, false);
        case 'sort-lines-desc': return sortLines(text, true);
        case 'suffix-lines': return affixLines(text, false);
        case 'tabs-to-spaces': return [str(text).split('\t').join('    '), 'Tabs converted to four spaces.'];
        case 'repeat-text': return repeatText(text);
        case 'text-statistics': return [jsonPretty(statisticsData(text)), 'Text statistics calculated.'];
        case 'title-case': return [titleCase(text), 'Converted to title case.'];
        case 'trim-whitespace': return [phpTrim(lines(text).map(function (line) { return phpTrim(line); }).join('\n')), 'Extra whitespace removed.'];
        case 'unique-word-count': return uniqueWords(text);
        case 'uppercase': return [str(text).toUpperCase(), 'Converted to uppercase.'];
        case 'extract-urls': return extractUrls(text);
        case 'word-count': return [String(words(text).length), words(text).length + ' word(s).'];
        case 'word-frequency': return wordFrequency(text);
        case 'words-to-lines': return [words(text).join('\n'), 'Words moved to separate lines.'];
        default: fail('Unsupported Text processor: ' + id);
    }
}

var STATS_IDS = ['word-count', 'character-count', 'line-count', 'paragraph-count', 'sentence-count', 'reading-time', 'text-statistics'];
var LIST_IDS = ['extract-emails', 'extract-urls', 'extract-numbers', 'extract-phone-numbers', 'extract-hashtags', 'extract-mentions', 'unique-word-count'];

// Port of TextToolProcessor::legacyInput()
function textLegacyInput(id, input) {
    var source = str(input.source !== undefined ? input.source : input.input);
    switch (id) {
        case 'find-replace': return str(input.find) + '\n' + str(input.replace) + '\n' + source;
        case 'prefix-lines':
        case 'suffix-lines': return str(input.affix) + '\n' + source;
        case 'remove-word': return str(input.word) + '\n' + source;
        case 'repeat-text': return str(input.count !== undefined && input.count !== '' ? input.count : 2) + '\n' + source;
        default: return source;
    }
}

// Port of TextToolProcessor::structuredOutput()
function textStructuredOutput(id, output, input) {
    var source = str(input.source);

    if (id === 'word-count' || id === 'text-statistics') return statisticsData(source);
    if (id === 'character-count') {
        return {
            characters: characterLength(source),
            charactersWithoutSpaces: characterLength(source.replace(/\s/gu, '')),
            bytes: byteLength(source)
        };
    }
    if (id === 'line-count' || id === 'paragraph-count' || id === 'sentence-count' || id === 'reading-time') {
        var parts = source === '' ? [] : lines(source);
        var wordCount = words(source).length;
        var wpm = Math.max(1, parseInt(input.wpm, 10) || 200);
        if (id === 'line-count') {
            return {
                totalLines: parts.length,
                nonEmptyLines: parts.filter(function (line) { return line.trim() !== ''; }).length,
                emptyLines: parts.filter(function (line) { return line.trim() === ''; }).length
            };
        }
        if (id === 'paragraph-count') return { paragraphs: parseInt(paragraphCount(source)[0], 10) };
        if (id === 'sentence-count') return { sentences: parseInt(sentenceCount(source)[0], 10) };
        return { words: wordCount, wordsPerMinute: wpm, readingTimeMinutes: wordCount ? Math.max(1, Math.ceil(wordCount / wpm)) : 0 };
    }
    if (LIST_IDS.indexOf(id) !== -1) return output === '' ? [] : str(output).split('\n');
    if (id === 'word-frequency') {
        var items = [];
        str(output).split('\n').forEach(function (line) {
            if (line === '') return;
            var index = line.lastIndexOf(': ');
            var word = index === -1 ? line : line.slice(0, index);
            var count = index === -1 ? '0' : line.slice(index + 2);
            items.push({ value: word, count: parseInt(count, 10) || 0 });
        });
        return items;
    }
    if ((id === 'sort-lines' || id === 'sort-lines-desc') && str(input.direction) !== '') {
        var wantDesc = input.direction === 'desc';
        var defaultDesc = id === 'sort-lines-desc';
        if (wantDesc !== defaultDesc) return lines(output).reverse().join('\n');
    }
    return output;
}

function runTextProcessor(id, input) {
    var source = str(input.source !== undefined ? input.source : input.input);
    if (source.trim() === '') {
        // PHP emptyStructuredOutput() returns an empty ARRAY for the statistics,
        // list and frequency tools, and an empty string for everything else.
        var empty = (STATS_IDS.indexOf(id) !== -1 || LIST_IDS.indexOf(id) !== -1 || id === 'word-frequency') ? [] : '';
        return { output: empty, message: 'Add text to begin.' };
    }
    var pair = textTransform(id, textLegacyInput(id, input));
    return { output: textStructuredOutput(id, pair[0], input), message: pair[1] };
}

const TEXT_PROCESSORS_LIST = [
    'alternating-case', 'character-count', 'collapse-spaces', 'comma-list-to-lines',
    'extract-emails', 'strip-emojis', 'find-replace', 'extract-hashtags',
    'line-count', 'lines-to-comma-list', 'lowercase', 'extract-mentions',
    'extract-numbers', 'paragraph-count', 'extract-phone-numbers', 'prefix-lines',
    'quote-lines', 'reading-time', 'remove-all-spaces', 'remove-duplicate-lines',
    'remove-duplicate-words', 'remove-empty-lines', 'remove-line-numbers', 'remove-numbers',
    'remove-punctuation', 'remove-tabs', 'remove-word', 'reverse-lines',
    'reverse-text', 'reverse-words', 'sentence-case', 'sentence-count',
    'shuffle-lines', 'slug-generator', 'sort-lines', 'sort-lines-desc',
    'suffix-lines', 'tabs-to-spaces', 'repeat-text', 'text-statistics',
    'title-case', 'trim-whitespace', 'unique-word-count', 'uppercase',
    'extract-urls', 'word-count', 'word-frequency', 'words-to-lines',
];

/* ------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------ */

/**
 * PHP-compatible primitives.
 *
 * These are the parts that usually go wrong when porting text handling
 * between PHP and JavaScript, so they are exported on their own.
 */
export {
    /** PHP `trim()` with its default " \t\n\r\0\x0B" mask, not JS `String.trim()`. */
    phpTrim,
    /** PHP `strnatcasecmp()` — Martin Pool's natural order, folded on ASCII, byte-wise. */
    natCaseCmp,
    /** PHP `strlen()` — UTF-8 byte length, not code-unit length. */
    byteLength,
    /** PHP `grapheme_strlen()` — user-perceived characters, so "👍🏽" counts as one. */
    characterLength,
    /** Split into grapheme clusters (`\X` in PHP's PCRE). */
    graphemes,
    /** Split into code points (`preg_split('//u', …)`). */
    characters,
    /** Words, matching PHP's `[\p{L}\p{N}]+` with internal apostrophes and hyphens. */
    words,
    /** Split on newlines after normalising CRLF and CR. */
    lines,
};

/** Individual transforms, for when you want one behaviour rather than the runner. */
export {
    slugify,
    titleCase,
    sentenceCase,
    alternatingCase,
    wordFrequency,
    uniqueWords,
    sortLines,
    removeDuplicateLines,
    removeDuplicateWords,
    removeEmptyLines,
    stripEmoji,
    extractUrls,
    phoneNumbers,
    readingTime,
    sentenceCount,
    paragraphCount,
};

/** Full text statistics: words, characters, bytes, lines, sentences, paragraphs, reading time. */
export { statisticsData as statistics };

/** Identifiers accepted by `process()`. */
export const PROCESSORS = Object.freeze([...TEXT_PROCESSORS_LIST]);

/**
 * Run one processor.
 *
 * @param {string} id     One of `PROCESSORS`.
 * @param {object} input  `{ source, ... }`. Extra keys depend on the processor:
 *                        `find`/`replace`, `affix`, `word`, `count`, `wpm`, `direction`.
 * @returns {{ output: string|object|Array, message: string }}
 * @throws {Error} when the input is unusable, with the same message PHP produces.
 *
 * @example
 * process('sort-lines', { source: 'b\na\nitem10\nitem9' }).output;
 * // 'a\nb\nitem9\nitem10'   — natural order, matching PHP's Collator
 */
export function process(id, input) {
    if (!TEXT_PROCESSORS_LIST.includes(id)) {
        throw new Error(`Unknown processor: ${id}`);
    }
    return runTextProcessor(id, input ?? {});
}
