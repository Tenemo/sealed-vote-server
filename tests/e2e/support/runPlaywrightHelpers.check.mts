import assert from 'node:assert/strict';
import test from 'node:test';

import {
    collectListedSpecFiles,
    isRecoverableProductionReadinessFailure,
    resolveProductionIsolatedInvocationArgs,
    resolveProductionIsolatedInvocationFiles,
    runProductionIsolatedInvocations,
    stripPlaywrightPositionalTestSelectors,
} from '../scripts/runPlaywrightHelpers.mts';

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

test('resolveProductionIsolatedInvocationFiles prepends readiness for non-readiness files', () => {
    assert.deepEqual(
        resolveProductionIsolatedInvocationFiles('share-link.spec.ts'),
        ['00-production-browser-readiness.spec.ts', 'share-link.spec.ts'],
    );
});

test('resolveProductionIsolatedInvocationFiles keeps the readiness file standalone', () => {
    assert.deepEqual(
        resolveProductionIsolatedInvocationFiles(
            '00-production-browser-readiness.spec.ts',
        ),
        ['00-production-browser-readiness.spec.ts'],
    );
});

test('resolveProductionIsolatedInvocationFiles recognizes absolute readiness paths', () => {
    assert.deepEqual(
        resolveProductionIsolatedInvocationFiles(
            'C:\\work\\sealed-vote\\tests\\e2e\\00-production-browser-readiness.spec.ts',
        ),
        ['C:\\work\\sealed-vote\\tests\\e2e\\00-production-browser-readiness.spec.ts'],
    );
});

test('resolveProductionIsolatedInvocationArgs forces a single worker for isolated production runs', () => {
    assert.deepEqual(
        resolveProductionIsolatedInvocationArgs('share-link.spec.ts', [
            '--project',
            'mobile-firefox-android',
        ]),
        [
            '00-production-browser-readiness.spec.ts',
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
            '00-production-browser-readiness.spec.ts',
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

test('isRecoverableProductionReadinessFailure matches the GitHub readiness timeout signature', () => {
    assert.equal(
        isRecoverableProductionReadinessFailure(`Running 2 tests using 1 worker
F°

  1) [firefox-desktop] › tests/e2e/00-production-browser-readiness.spec.ts:46:5 › browser can commit the homepage and a real production vote page

    Error: page.goto: Timeout 45000ms exceeded.
`),
        true,
    );
});

test('isRecoverableProductionReadinessFailure ignores target-spec failures', () => {
    assert.equal(
        isRecoverableProductionReadinessFailure(`Running 2 tests using 1 worker
F

  1) [firefox-desktop] › tests/e2e/recovery-network-cuts.spec.ts:31:5 › retries network cuts

    Error: page.goto: Timeout 45000ms exceeded.
`),
        false,
    );
});

test('runProductionIsolatedInvocations continues after failures and reports every failed file', async () => {
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
            return {
                exitCode:
                    args.includes('ceremony-persistence.spec.ts') ||
                    args.includes('share-link.spec.ts')
                        ? 1
                        : 0,
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
            '00-production-browser-readiness.spec.ts',
            'ceremony-persistence.spec.ts',
            '--project',
            'firefox-desktop',
            '--workers',
            '1',
        ],
        [
            '00-production-browser-readiness.spec.ts',
            'share-link.spec.ts',
            '--project',
            'firefox-desktop',
            '--workers',
            '1',
        ],
    ]);
    assert.deepEqual(result, {
        exitCode: 1,
        failedFiles: ['ceremony-persistence.spec.ts', 'share-link.spec.ts'],
    });
});

test('runProductionIsolatedInvocations re-runs a readiness-timeout failure once', async () => {
    const invocationArgs: string[][] = [];
    const retriedFiles: string[] = [];
    let invocationCount = 0;

    const result = await runProductionIsolatedInvocations({
        forwardedCliArgs: ['--project', 'firefox-desktop'],
        listedFiles: ['recovery-network-cuts.spec.ts'],
        logRetry: (listedFile) => {
            retriedFiles.push(listedFile);
        },
        runInvocation: async (args) => {
            invocationArgs.push(args);
            invocationCount += 1;

            if (invocationCount === 1) {
                return {
                    exitCode: 1,
                    output: `  1) [firefox-desktop] › tests/e2e/00-production-browser-readiness.spec.ts:46:5 › browser can commit the homepage and a real production vote page

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

    assert.deepEqual(retriedFiles, ['recovery-network-cuts.spec.ts']);
    assert.deepEqual(invocationArgs, [
        [
            '00-production-browser-readiness.spec.ts',
            'recovery-network-cuts.spec.ts',
            '--project',
            'firefox-desktop',
            '--workers',
            '1',
        ],
        [
            '00-production-browser-readiness.spec.ts',
            'recovery-network-cuts.spec.ts',
            '--project',
            'firefox-desktop',
            '--workers',
            '1',
        ],
    ]);
    assert.deepEqual(result, {
        exitCode: 0,
        failedFiles: [],
    });
});

test('runProductionIsolatedInvocations still fails when the readiness-timeout retry also fails', async () => {
    const retriedFiles: string[] = [];

    const result = await runProductionIsolatedInvocations({
        forwardedCliArgs: ['--project', 'firefox-desktop'],
        listedFiles: ['recovery-network-cuts.spec.ts'],
        logRetry: (listedFile) => {
            retriedFiles.push(listedFile);
        },
        runInvocation: async () => ({
            exitCode: 1,
            output: `  1) [firefox-desktop] › tests/e2e/00-production-browser-readiness.spec.ts:46:5 › browser can commit the homepage and a real production vote page

    Error: page.goto: Timeout 45000ms exceeded.
`,
        }),
    });

    assert.deepEqual(retriedFiles, ['recovery-network-cuts.spec.ts']);
    assert.deepEqual(result, {
        exitCode: 1,
        failedFiles: ['recovery-network-cuts.spec.ts'],
    });
});
