import assert from 'node:assert/strict';
import test from 'node:test';

import { runPnpmCaptureSync } from '../scripts/shared.mts';

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
