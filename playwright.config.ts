import { availableParallelism } from 'node:os';

import {
    defineConfig,
    devices,
    type ReporterDescription,
} from '@playwright/test';

import {
    mobileFirefoxAndroidContextOptions,
} from './tests/e2e/support/profiles';

const chromiumOnlySpecs = [
    '**/duplicate-title-polls.spec.ts',
    '**/duplicate-voter-name.spec.ts',
    '**/legacy-route.spec.ts',
    '**/mixed-platform-poll.spec.ts',
    '**/refresh-resume.spec.ts',
    '**/share-link.spec.ts',
];

const isCi = Boolean(process.env.CI);
const shouldUseBlobReporter = process.env.PLAYWRIGHT_BLOB_REPORT === 'true';
const shouldUseBuiltServers =
    process.env.PLAYWRIGHT_USE_BUILT_SERVERS === 'true';
const localWorkers = Math.max(2, Math.min(availableParallelism(), 6));
const reporters: ReporterDescription[] | 'list' = shouldUseBlobReporter
    ? [['dot'], ['blob', { outputDir: 'blob-report' }]]
    : isCi
      ? [['dot'], ['github'], ['html', { open: 'never' }]]
      : 'list';

const parseWorkerCount = (
    rawValue: string | undefined,
    fallback: number,
): number => {
    if (!rawValue) {
        return fallback;
    }

    const parsedValue = Number(rawValue);

    if (
        !Number.isFinite(parsedValue) ||
        !Number.isInteger(parsedValue) ||
        parsedValue < 1
    ) {
        throw new Error(
            `Invalid PLAYWRIGHT_CI_WORKERS value "${rawValue}". Expected a positive integer.`,
        );
    }

    return parsedValue;
};

const workers = isCi
    ? parseWorkerCount(process.env.PLAYWRIGHT_CI_WORKERS, 4)
    : localWorkers;

const webServers = shouldUseBuiltServers
    ? [
          {
              command: 'pnpm e2e:ci:serve:api',
              timeout: 120_000,
              url: 'http://127.0.0.1:4000/api/health-check',
              reuseExistingServer: false,
          },
          {
              command: 'pnpm e2e:ci:serve:web',
              timeout: 120_000,
              url: 'http://127.0.0.1:3000',
              reuseExistingServer: false,
          },
      ]
    : [
          {
              command: 'pnpm exec node --experimental-strip-types tests/e2e/scripts/run-e2e-backend.mts',
              timeout: 120_000,
              url: 'http://127.0.0.1:4000/api/health-check',
              reuseExistingServer: false,
          },
          {
              command: 'pnpm --filter @sealed-vote/web dev',
              timeout: 120_000,
              url: 'http://127.0.0.1:3000',
              reuseExistingServer: false,
          },
      ];

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 180_000,
    expect: {
        timeout: 20_000,
    },
    forbidOnly: isCi,
    fullyParallel: false,
    outputDir: 'test-results/playwright',
    reporter: reporters,
    retries: isCi ? 1 : 0,
    use: {
        baseURL: 'http://127.0.0.1:3000',
        screenshot: 'only-on-failure',
        trace: isCi ? 'retain-on-failure' : 'on-first-retry',
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
                ...mobileFirefoxAndroidContextOptions,
            },
        },
    ],
    webServer: webServers,
});
