/**
 * Parity suite.
 *
 * Every case in the fixture file was produced by running the original PHP
 * implementation and recording its exact output. The assertions below check
 * that this library returns the same bytes, the same structured values and
 * the same error messages.
 *
 * If a case fails, the JavaScript diverged from PHP — that is the bug.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { process as run, phpTrim, natCaseCmp, byteLength, characterLength } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(path.join(here, 'fixtures/php-reference.json'), 'utf8'));

test(`matches PHP on all ${fixture.cases.length} recorded cases`, async (t) => {
    for (const item of fixture.cases) {
        await t.test(`${item.id} — ${item.name}`, () => {
            if (Object.hasOwn(item, 'error')) {
                assert.throws(() => run(item.id, item.input), (error) => {
                    assert.equal(error.message, item.error);
                    return true;
                });
                return;
            }

            const result = run(item.id, item.input);
            assert.deepEqual(result.output, item.output);
            assert.equal(result.message, item.message);
        });
    }
});

test('phpTrim uses PHP\u2019s mask, not String.prototype.trim', () => {
    // The masks overlap but are not the same. PHP strips NUL; JavaScript
    // does not. JavaScript strips every Unicode space; PHP does not.
    assert.equal(phpTrim('\u000B x \u0000'), 'x');
    assert.equal('\u000B x \u0000'.trim(), 'x \u0000');

    // U+00A0 no-break space: trimmed by JavaScript, kept by PHP.
    assert.equal(phpTrim('\u00A0x\u00A0'), '\u00A0x\u00A0');
    assert.equal('\u00A0x\u00A0'.trim(), 'x');
});

test('natCaseCmp orders numerically inside strings', () => {
    assert.equal(natCaseCmp('file9', 'file10'), -1);
    assert.equal(natCaseCmp('File10', 'file9'), 1);
    assert.equal(natCaseCmp('a', 'A'), 0);
});

test('byteLength counts UTF-8 bytes, characterLength counts graphemes', () => {
    assert.equal(byteLength('Привіт'), 12);
    assert.equal('Привіт'.length, 6);
    assert.equal(characterLength('\u{1F44D}\u{1F3FD}'), 1);
    assert.equal('\u{1F44D}\u{1F3FD}'.length, 4);
});
