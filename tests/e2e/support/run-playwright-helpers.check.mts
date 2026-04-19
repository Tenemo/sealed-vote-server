import assert from 'node:assert/strict';
import test from 'node:test';

import {
    collectListedSpecFiles,
    isProductionNavigationStall,
    resolveProductionIsolatedInvocationArgs,
    runProductionIsolatedInvocations,
    stripPlaywrightPositionalTestSelectors,
} from '../scripts/run-playwright-helpers.mts';

const listedSpecSeparator = '\u203a';

test('collectListedSpecFiles extracts unique spec files from Playwright list output', () => {
    const listedFiles = collectListedSpecFiles(
        `Listing tests:
  [chromium-desktop] ${listedSpecSeparator} duplicate-poll-name.spec.ts:23:5 ${listedSpecSeparator} keeps duplicate poll names on distinct slug URLs with isolated rosters
  [chromium-desktop] ${listedSpecSeparator} duplicate-voter-name.spec.ts:26:5 ${listedSpecSeparator} shows the duplicate voter-name error and still allows a unique retry
  [chromium-desktop] ${listedSpecSeparator} duplicate-voter-name.spec.ts:26:5 ${listedSpecSeparator} shows the duplicate voter-name error and still allows a unique retry
Total: 3 tests in 2 files
`,
    );

    assert.deepEqual(listedFiles, [
        'duplicate-poll-name.spec.ts',
        'duplicate-voter-name.spec.ts',
    ]);
});

test('collectListedSpecFiles ignores non-test lines in Playwright list output', () => {
    const listedFiles = collectListedSpecFiles(
        `Listing tests:
Some unrelated line
  [webkit-desktop] ${listedSpecSeparator} 00-production-browser-readiness.spec.ts:46:5 ${listedSpecSeparator} browser can commit the homepage and a real production poll page
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

test('resolveProductionIsolatedInvocationArgs runs a single file with one worker and forwarded args', () => {
    assert.deepEqual(
        resolveProductionIsolatedInvocationArgs('share-link.spec.ts', [
            '--project',
            'mobile-firefox-android',
        ]),
        [
            'share-link.spec.ts',
            '--project',
            'mobile-firefox-android',
            '--workers',
            '1',
        ],
    );
});

test('stripPlaywrightPositionalTestSelectors removes explicit spec selectors while preserving option values', () => {
    assert.deepEqual(
        stripPlaywrightPositionalTestSelectors([
            'tests/e2e/ceremony-persistence.spec.ts',
            'tests/e2e/share-link.spec.ts',
            '--project',
            'mobile-firefox-android',
            '--grep',
            'happy path',
            '--reporter=line',
            '--trace',
            'retain-on-failure',
        ]),
        [
            '--project',
            'mobile-firefox-android',
            '--grep',
            'happy path',
            '--reporter=line',
            '--trace',
            'retain-on-failure',
        ],
    );
});

test('resolveProductionIsolatedInvocationArgs ignores forwarded spec filters from the original selection', () => {
    assert.deepEqual(
        resolveProductionIsolatedInvocationArgs('share-link.spec.ts', [
            'tests/e2e/ceremony-persistence.spec.ts',
            'tests/e2e/share-link.spec.ts',
            '--project',
            'mobile-firefox-android',
            '--grep',
            'happy path',
        ]),
        [
            'share-link.spec.ts',
            '--project',
            'mobile-firefox-android',
            '--grep',
            'happy path',
            '--workers',
            '1',
        ],
    );
});

test('isProductionNavigationStall matches the page.goto timeout signature', () => {
    assert.equal(
        isProductionNavigationStall(`Running 1 test using 1 worker
F

  1) [mobile-firefox-android] ${listedSpecSeparator} tests/e2e/00-production-browser-readiness.spec.ts:46:5 ${listedSpecSeparator} browser can commit the homepage and a real production poll page

    Error: page.goto: Timeout 45000ms exceeded.
`),
        true,
    );
});

test('isProductionNavigationStall ignores output without a goto timeout', () => {
    assert.equal(
        isProductionNavigationStall(`Running 1 test using 1 worker
F

  1) [firefox-desktop] ${listedSpecSeparator} tests/e2e/share-link.spec.ts:12:5 ${listedSpecSeparator} copies the share link

    Error: expect(received).toBe(expected)
`),
        false,
    );
});

test('isProductionNavigationStall ignores goto timeouts outside the readiness spec', () => {
    assert.equal(
        isProductionNavigationStall(`Running 1 test using 1 worker
F

  1) [firefox-desktop] ${listedSpecSeparator} tests/e2e/share-link.spec.ts:12:5 ${listedSpecSeparator} copies the share link

    Error: page.goto: Timeout 45000ms exceeded.
`),
        false,
    );
});

test('runProductionIsolatedInvocations runs each listed file alone and continues after unrelated failures', async () => {
    const startedFiles: string[] = [];
    const invocationArgs: string[][] = [];

    const result = await runProductionIsolatedInvocations({
        forwardedCliArgs: ['--project', 'firefox-desktop'],
        listedFiles: [
            '00-production-browser-readiness.spec.ts',
            'ceremony-persistence.spec.ts',
            'share-link.spec.ts',
        ],
        onInvocationStart: (listedFile) => {
            startedFiles.push(listedFile);
        },
        runInvocation: async (args) => {
            invocationArgs.push(args);

            if (args.includes('ceremony-persistence.spec.ts')) {
                return {
                    exitCode: 1,
                    output: 'Error: expected 3 votes, received 2',
                };
            }

            return {
                exitCode: 0,
                output: '',
            };
        },
    });

    assert.deepEqual(startedFiles, [
        '00-production-browser-readiness.spec.ts',
        'ceremony-persistence.spec.ts',
        'share-link.spec.ts',
    ]);
    assert.deepEqual(invocationArgs, [
        [
            '00-production-browser-readiness.spec.ts',
            '--project',
            'firefox-desktop',
            '--workers',
            '1',
        ],
        [
            'ceremony-persistence.spec.ts',
            '--project',
            'firefox-desktop',
            '--workers',
            '1',
        ],
        [
            'share-link.spec.ts',
            '--project',
            'firefox-desktop',
            '--workers',
            '1',
        ],
    ]);
    assert.deepEqual(result, {
        exitCode: 1,
        failedFiles: ['ceremony-persistence.spec.ts'],
        stalledFile: null,
    });
});

test('runProductionIsolatedInvocations stops after a navigation stall and skips remaining files', async () => {
    const startedFiles: string[] = [];
    const stalledFiles: string[] = [];

    const result = await runProductionIsolatedInvocations({
        forwardedCliArgs: ['--project', 'mobile-firefox-android'],
        listedFiles: [
            '00-production-browser-readiness.spec.ts',
            'ceremony-persistence.spec.ts',
            'share-link.spec.ts',
        ],
        onInvocationStart: (listedFile) => {
            startedFiles.push(listedFile);
        },
        onNavigationStall: (listedFile) => {
            stalledFiles.push(listedFile);
        },
        runInvocation: async (args) => {
            if (args.includes('00-production-browser-readiness.spec.ts')) {
                return {
                    exitCode: 1,
                    output: `  1) [mobile-firefox-android] ${listedSpecSeparator} tests/e2e/00-production-browser-readiness.spec.ts:46:5 ${listedSpecSeparator} browser can commit the homepage and a real production poll page

    Error: page.goto: Timeout 45000ms exceeded.
`,
                };
            }

            return {
                exitCode: 0,
                output: '',
            };
        },
    });

    assert.deepEqual(startedFiles, [
        '00-production-browser-readiness.spec.ts',
    ]);
    assert.deepEqual(stalledFiles, [
        '00-production-browser-readiness.spec.ts',
    ]);
    assert.deepEqual(result, {
        exitCode: 1,
        failedFiles: ['00-production-browser-readiness.spec.ts'],
        stalledFile: '00-production-browser-readiness.spec.ts',
    });
});

test('runProductionIsolatedInvocations keeps going after a generic goto timeout in a non-readiness spec', async () => {
    const startedFiles: string[] = [];
    const stalledFiles: string[] = [];

    const result = await runProductionIsolatedInvocations({
        forwardedCliArgs: ['--project', 'mobile-firefox-android'],
        listedFiles: [
            '00-production-browser-readiness.spec.ts',
            'ceremony-persistence.spec.ts',
            'share-link.spec.ts',
        ],
        onInvocationStart: (listedFile) => {
            startedFiles.push(listedFile);
        },
        onNavigationStall: (listedFile) => {
            stalledFiles.push(listedFile);
        },
        runInvocation: async (args) => {
            if (args.includes('ceremony-persistence.spec.ts')) {
                return {
                    exitCode: 1,
                    output: 'Error: expected 3 votes, received 2',
                };
            }

            if (args.includes('share-link.spec.ts')) {
                return {
                    exitCode: 1,
                    output: `  1) [mobile-firefox-android] ${listedSpecSeparator} tests/e2e/share-link.spec.ts:12:5 ${listedSpecSeparator} copies the share link

    Error: page.goto: Timeout 45000ms exceeded.
`,
                };
            }

            return {
                exitCode: 0,
                output: '',
            };
        },
    });

    assert.deepEqual(startedFiles, [
        '00-production-browser-readiness.spec.ts',
        'ceremony-persistence.spec.ts',
        'share-link.spec.ts',
    ]);
    assert.deepEqual(stalledFiles, []);
    assert.deepEqual(result, {
        exitCode: 1,
        failedFiles: ['ceremony-persistence.spec.ts', 'share-link.spec.ts'],
        stalledFile: null,
    });
});
