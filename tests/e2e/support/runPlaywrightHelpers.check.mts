import assert from 'node:assert/strict';
import test from 'node:test';

import { collectListedSpecFiles } from '../scripts/runPlaywrightHelpers.mts';

const listedSpecSeparator = '\u203a';

test('collectListedSpecFiles extracts unique spec files from Playwright list output', () => {
    const listedFiles = collectListedSpecFiles(
        `Listing tests:
  [chromium-desktop] ${listedSpecSeparator} duplicate-title-polls.spec.ts:23:5 ${listedSpecSeparator} keeps duplicate-title polls on distinct slug URLs with isolated rosters
  [chromium-desktop] ${listedSpecSeparator} duplicate-voter-name.spec.ts:26:5 ${listedSpecSeparator} shows the duplicate voter-name error and still allows a unique retry
  [chromium-desktop] ${listedSpecSeparator} duplicate-voter-name.spec.ts:26:5 ${listedSpecSeparator} shows the duplicate voter-name error and still allows a unique retry
Total: 3 tests in 2 files
`,
    );

    assert.deepEqual(listedFiles, [
        'duplicate-title-polls.spec.ts',
        'duplicate-voter-name.spec.ts',
    ]);
});

test('collectListedSpecFiles ignores non-test lines in Playwright list output', () => {
    const listedFiles = collectListedSpecFiles(
        `Listing tests:
Some unrelated line
  [webkit-desktop] ${listedSpecSeparator} 00-production-browser-readiness.spec.ts:46:5 ${listedSpecSeparator} browser can commit the homepage and a real production vote page
Total: 1 test in 1 file
`,
    );

    assert.deepEqual(listedFiles, ['00-production-browser-readiness.spec.ts']);
});

test('collectListedSpecFiles keeps Windows absolute paths intact', () => {
    const listedFiles = collectListedSpecFiles(
        `Listing tests:
  [chromium-desktop] ${listedSpecSeparator} C:\\work\\sealed-vote\\tests\\e2e\\duplicate-voter-name.spec.ts:26:5 ${listedSpecSeparator} shows the duplicate voter-name error and still allows a unique retry
Total: 1 test in 1 file
`,
    );

    assert.deepEqual(listedFiles, [
        'C:\\work\\sealed-vote\\tests\\e2e\\duplicate-voter-name.spec.ts',
    ]);
});
