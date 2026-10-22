import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTurkishNumber, parseChangePercent } from '../market-sources.ts';

test('parseTurkishNumber handles Truncgil formats', () => {
    assert.equal(parseTurkishNumber('6.523,07'), 6523.07);
    assert.equal(parseTurkishNumber('$4.091,30'), 4091.3);
    assert.equal(parseTurkishNumber('49,6312'), 49.6312);
    assert.equal(parseTurkishNumber('6.523'), 6523);
    assert.equal(parseTurkishNumber('1.234.567'), 1234567);
    assert.equal(parseTurkishNumber('49.63'), 49.63);
    assert.equal(parseTurkishNumber(6523.07), 6523.07);
    assert.equal(parseTurkishNumber(''), 0);
    assert.equal(parseTurkishNumber(undefined), 0);
    assert.equal(parseTurkishNumber('abc'), 0);
});

test('parseChangePercent', () => {
    assert.equal(parseChangePercent('%0,42'), 0.42);
    assert.equal(parseChangePercent('-1,25'), -1.25);
    assert.equal(parseChangePercent(-0.3), -0.3);
    assert.equal(parseChangePercent(null), 0);
});
