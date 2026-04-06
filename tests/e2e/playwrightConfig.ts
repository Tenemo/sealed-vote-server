import { availableParallelism } from 'node:os';

import {
    devices,
    type PlaywrightTestConfig,
    type Project,
    type ReporterDescription,
} from '@playwright/test';

import { mobileFirefoxAndroidContextOptions } from './support/profiles';

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

const reporters: ReporterDescription[] | 'list' = shouldUseBlobReporter
    ? [['dot'], ['blob', { outputDir: 'blob-report' }]]
    : isCi
      ? [['dot'], ['github'], ['html', { open: 'never' }]]
      : 'list';

const productionBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();

const normalizeBaseUrl = (baseUrl: string): string => {
    let parsedBaseUrl: URL;

    try {
        parsedBaseUrl = new URL(baseUrl);
    } catch {
        throw new TypeError('PLAYWRIGHT_BASE_URL must be a valid absolute URL.');
    }

    if (
        parsedBaseUrl.protocol !== 'http:' &&
        parsedBaseUrl.protocol !== 'https:'
    ) {
        throw new TypeError(
            'PLAYWRIGHT_BASE_URL must use the http or https protocol.',
        );
    }

    return parsedBaseUrl.origin;
};

const projects: Project[] = [
    {
        name: 'chromium-desktop',
        use: {
            ...devices['Desktop Chrome'],
            browserName: 'chromium' as const,
        },
    },
    {
        name: 'firefox-desktop',
        testIgnore: chromiumOnlySpecs,
        use: {
            ...devices['Desktop Firefox'],
            browserName: 'firefox' as const,
        },
    },
    {
        name: 'webkit-desktop',
        testIgnore: chromiumOnlySpecs,
        use: {
            ...devices['Desktop Safari'],
            browserName: 'webkit' as const,
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
];

const getCommonConfig = (
    baseURL: string,
    outputDir: string,
): PlaywrightTestConfig => ({
    testDir: './tests/e2e',
    timeout: 180_000,
    expect: {
        timeout: 20_000,
    },
    forbidOnly: isCi,
    fullyParallel: false,
    outputDir,
    reporter: reporters,
    retries: isCi ? 1 : 0,
    use: {
        baseURL,
        screenshot: 'only-on-failure' as const,
        trace: isCi ? ('retain-on-failure' as const) : ('on-first-retry' as const),
        video: 'retain-on-failure' as const,
    },
    workers: isCi
        ? parseWorkerCount(process.env.PLAYWRIGHT_CI_WORKERS, 4)
        : localWorkers,
    projects,
});

export const createLocalE2EConfig = (): PlaywrightTestConfig => ({
    ...getCommonConfig('http://127.0.0.1:3000', 'test-results/playwright'),
    webServer: shouldUseBuiltServers
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
          ],
});

export const createProductionE2EConfig = (): PlaywrightTestConfig => {
    if (!productionBaseUrl) {
        throw new Error(
            'PLAYWRIGHT_BASE_URL must be set before running production e2e tests.',
        );
    }

    return getCommonConfig(
        normalizeBaseUrl(productionBaseUrl),
        'test-results/playwright-production',
    );
};
