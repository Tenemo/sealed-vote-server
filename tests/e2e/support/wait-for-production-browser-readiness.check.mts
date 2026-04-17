import assert from 'node:assert/strict';
import test from 'node:test';

import {
    detectFatalReadinessFailureMessage,
    parsePositiveInteger,
    parseWaitCliArgs,
    waitForProductionBrowserReadiness,
} from '../scripts/wait-for-production-browser-readiness.mts';

test('parsePositiveInteger rejects invalid browser-readiness wait overrides', () => {
    assert.throws(
        () => parsePositiveInteger('not-a-number', 1, '--timeout-ms'),
        /--timeout-ms must be a positive integer./u,
    );
    assert.throws(
        () => parsePositiveInteger('0', 1, '--interval-ms'),
        /--interval-ms must be a positive integer./u,
    );
});

test('parseWaitCliArgs only parses wrapper flags before the separator', () => {
    assert.deepEqual(
        parseWaitCliArgs([
            '--timeout-ms',
            '1000',
            '--interval-ms',
            '2000',
            '--',
            '--project',
            'mobile-firefox-android',
            '--timeout-ms',
            '9999',
        ]),
        {
            forwardedCliArgs: [
                '--project',
                'mobile-firefox-android',
                '--timeout-ms',
                '9999',
            ],
            intervalMs: 2_000,
            requiredStableChecks: 2,
            timeoutMs: 1_000,
        },
    );
});

test('parseWaitCliArgs rejects unexpected wrapper arguments before the separator', () => {
    assert.throws(
        () => parseWaitCliArgs(['--project', 'mobile-firefox-android']),
        /Unexpected argument "--project". Pass forwarded arguments after "--"./u,
    );
});

test('waitForProductionBrowserReadiness requires consecutive stable checks before returning', async () => {
    const logs: string[] = [];
    const sleeps: number[] = [];
    const checks = [false, true, false, true, true];
    let nowMs = 5_000;

    await waitForProductionBrowserReadiness(
        {
            forwardedCliArgs: ['--project', 'mobile-firefox-android'],
            intervalMs: 1_000,
            requiredStableChecks: 2,
            timeoutMs: 10_000,
        },
        {
            log: (message) => {
                logs.push(message);
            },
            now: () => nowMs,
            runReadinessCheck: () => {
                const result = checks.shift();

                if (result === undefined) {
                    throw new Error('Unexpected extra readiness attempt.');
                }

                return {
                    kind: result ? 'success' : 'retry',
                };
            },
            sleep: async (delayMs) => {
                sleeps.push(delayMs);
                nowMs += delayMs;
            },
        },
    );

    assert.deepEqual(sleeps, [1_000, 1_000, 1_000, 1_000]);
    assert.deepEqual(logs, [
        'Waiting for stable production browser readiness for --project mobile-firefox-android.',
        'Browser readiness check 1/2 succeeded for --project mobile-firefox-android.',
        'Waiting for stable production browser readiness for --project mobile-firefox-android.',
        'Browser readiness check 1/2 succeeded for --project mobile-firefox-android.',
        'Browser readiness check 2/2 succeeded for --project mobile-firefox-android.',
        'Production browser readiness is stable for --project mobile-firefox-android.',
    ]);
});

test('waitForProductionBrowserReadiness times out when browser readiness never stabilizes', async () => {
    let nowMs = 10_000;

    await assert.rejects(
        async () =>
            await waitForProductionBrowserReadiness(
                {
                    forwardedCliArgs: ['--project', 'chromium-desktop'],
                    intervalMs: 2_000,
                    requiredStableChecks: 2,
                    timeoutMs: 4_000,
                },
                {
                    now: () => nowMs,
                    runReadinessCheck: () => ({
                        kind: 'retry',
                    }),
                    sleep: async (delayMs) => {
                        nowMs += delayMs;
                    },
                },
            ),
        /Timed out waiting for stable production browser readiness for --project chromium-desktop./u,
    );
});

test('waitForProductionBrowserReadiness caps each check timeout and the final sleep to the remaining deadline', async () => {
    const sleeps: number[] = [];
    const checkTimeouts: number[] = [];
    let nowMs = 10_000;

    await assert.rejects(
        async () =>
            await waitForProductionBrowserReadiness(
                {
                    forwardedCliArgs: ['--project', 'chromium-desktop'],
                    intervalMs: 2_000,
                    requiredStableChecks: 2,
                    timeoutMs: 3_000,
                },
                {
                    now: () => nowMs,
                    runReadinessCheck: (...args) => {
                        const timeoutMs = args[1];
                        checkTimeouts.push(timeoutMs);
                        return {
                            kind: 'retry',
                        };
                    },
                    sleep: async (delayMs) => {
                        sleeps.push(delayMs);
                        nowMs += delayMs;
                    },
                },
            ),
        /Timed out waiting for stable production browser readiness for --project chromium-desktop./u,
    );

    assert.deepEqual(checkTimeouts, [3_000, 1_000]);
    assert.deepEqual(sleeps, [2_000, 1_000]);
});

test('waitForProductionBrowserReadiness fails immediately on fatal browser launch errors', async () => {
    const sleeps: number[] = [];

    await assert.rejects(
        async () =>
            await waitForProductionBrowserReadiness(
                {
                    forwardedCliArgs: ['--project', 'firefox-desktop'],
                    intervalMs: 2_000,
                    requiredStableChecks: 2,
                    timeoutMs: 20_000,
                },
                {
                    runReadinessCheck: () => ({
                        kind: 'fatal',
                        message:
                            'The Playwright browser could not launch inside the readiness job, so retrying will not make production become ready.',
                    }),
                    sleep: async (delayMs) => {
                        sleeps.push(delayMs);
                    },
                },
            ),
        /Fatal production browser readiness failure for --project firefox-desktop./u,
    );

    assert.deepEqual(sleeps, []);
});

test('detectFatalReadinessFailureMessage recognizes Firefox HOME ownership launch failures', () => {
    assert.match(
        detectFatalReadinessFailureMessage(
            [
                'browserType.launch: Failed to launch the browser process.',
                "Firefox is unable to launch if the $HOME folder isn't owned by the current user.",
                'Running Nightly as root in a regular user\'s session is not supported.  ($HOME is /github/home which is owned by pwuser.)',
            ].join('\n'),
        ) ?? '',
        /Set HOME=\/root/u,
    );
});
