import { availableParallelism } from 'node:os';

import { defineConfig, devices } from '@playwright/test';

const mobileFirefoxAndroidUserAgent =
    'Mozilla/5.0 (Android 14; Mobile; rv:137.0) Gecko/137.0 Firefox/137.0';

const chromiumOnlySpecs = [
    '**/duplicate-title-polls.spec.ts',
    '**/duplicate-voter-name.spec.ts',
    '**/legacy-route.spec.ts',
    '**/mixed-platform-poll.spec.ts',
    '**/refresh-resume.spec.ts',
    '**/share-link.spec.ts',
];

const configuredWorkers = Number.parseInt(
    process.env.PLAYWRIGHT_WORKERS ?? '',
    10,
);
const localWorkers = Math.max(2, Math.min(availableParallelism(), 6));
const workers =
    Number.isFinite(configuredWorkers) && configuredWorkers > 0
        ? configuredWorkers
        : process.env.CI
          ? 1
          : localWorkers;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 180_000,
    expect: {
        timeout: 20_000,
    },
    forbidOnly: !!process.env.CI,
    fullyParallel: false,
    outputDir: 'test-results/playwright',
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : 'list',
    retries: process.env.CI ? 1 : 0,
    use: {
        baseURL: 'http://127.0.0.1:3000',
        screenshot: 'only-on-failure',
        trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
        video: 'retain-on-failure',
    },
    workers,
    projects: [
        {
            name: 'chromium-desktop',
            use: {
                ...devices['Desktop Chrome'],
                browserName: 'chromium',
            },
        },
        {
            name: 'firefox-desktop',
            testIgnore: chromiumOnlySpecs,
            use: {
                ...devices['Desktop Firefox'],
                browserName: 'firefox',
            },
        },
        {
            name: 'webkit-desktop',
            testIgnore: chromiumOnlySpecs,
            use: {
                ...devices['Desktop Safari'],
                browserName: 'webkit',
            },
        },
        {
            name: 'mobile-firefox-android',
            testIgnore: chromiumOnlySpecs,
            use: {
                browserName: 'firefox',
                hasTouch: true,
                userAgent: mobileFirefoxAndroidUserAgent,
                viewport: {
                    width: 412,
                    height: 915,
                },
            },
        },
    ],
    webServer: [
        {
            command: 'node scripts/run-e2e-backend.cjs',
            url: 'http://127.0.0.1:4000/api/health-check',
            reuseExistingServer: false,
            timeout: 120_000,
        },
        {
            command: 'pnpm --filter @sealed-vote/web dev',
            url: 'http://127.0.0.1:3000',
            reuseExistingServer: false,
            timeout: 120_000,
        },
    ],
});
