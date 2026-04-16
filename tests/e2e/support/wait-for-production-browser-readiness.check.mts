import assert from 'node:assert/strict';
import test from 'node:test';

import {
    parsePositiveInteger,
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

                return result;
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
                    runReadinessCheck: () => false,
                    sleep: async (delayMs) => {
                        nowMs += delayMs;
                    },
                },
            ),
        /Timed out waiting for stable production browser readiness for --project chromium-desktop./u,
    );
});
