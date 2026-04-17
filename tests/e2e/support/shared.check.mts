import assert from 'node:assert/strict';
import test from 'node:test';

import {
    appendOutputTail,
    observedOutputTailMaxLength,
    runPnpmCaptureSync,
} from '../scripts/shared.mts';

test(
    'runPnpmCaptureSync captures output beyond Node sync defaults',
    {
        skip: !process.env.npm_execpath,
    },
    () => {
        const byteCount = 2 * 1024 * 1024 + 321;
        const output = runPnpmCaptureSync([
            'exec',
            'node',
            '-e',
            `process.stdout.write('x'.repeat(${byteCount}))`,
        ]);

        assert.equal(output.length, byteCount);
        assert.equal(output[0], 'x');
        assert.equal(output.at(-1), 'x');
    },
);

test('appendOutputTail keeps only the bounded tail of captured output', () => {
    const prefix = `head${'a'.repeat(observedOutputTailMaxLength - 4)}`;
    const output = appendOutputTail(prefix, 'tail');

    assert.equal(output.length, observedOutputTailMaxLength);
    assert.equal(output.startsWith('a'), true);
    assert.equal(output.endsWith('tail'), true);
    assert.equal(output.includes('head'), false);
});
