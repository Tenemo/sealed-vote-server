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
    '**/mixed-platform-poll.spec.ts',
    '**/share-link.spec.ts',
];

const webkitUnsupportedCeremonySpecs = [
    '**/ceremony-persistence.spec.ts',
    '**/ceremony-rescue.spec.ts',
    '**/multi-participant-counting.spec.ts',
    '**/refresh-resume.spec.ts',
    '**/setup-phase.spec.ts',
    '**/voting-flow.spec.ts',
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

const parseBaseUrl = (baseUrl: string, label: string): URL => {
    try {
        return new URL(baseUrl);
    } catch {
        throw new TypeError(`${label} must be a valid absolute URL.`);
    }
};

const normalizeBaseUrl = (baseUrl: string, label: string): string => {
    const parsedBaseUrl = parseBaseUrl(baseUrl, label);

    if (
        parsedBaseUrl.protocol !== 'http:' &&
        parsedBaseUrl.protocol !== 'https:'
    ) {
        throw new TypeError(`${label} must use the http or https protocol.`);
    }

    return parsedBaseUrl.origin;
};

const resolveLocalWebBaseUrl = (
    baseUrl: string,
    label: string,
): {
    baseUrl: string;
    host: string;
    port: string;
} => {
    const parsedBaseUrl = parseBaseUrl(baseUrl, label);

    if (
        parsedBaseUrl.protocol !== 'http:' &&
        parsedBaseUrl.protocol !== 'https:'
    ) {
        throw new TypeError(`${label} must use the http or https protocol.`);
    }

    const port =
        parsedBaseUrl.port ||
        (parsedBaseUrl.protocol === 'https:' ? '443' : '3000');
    const normalizedBaseUrl =
        parsedBaseUrl.port || parsedBaseUrl.protocol === 'https:'
            ? parsedBaseUrl.origin
            : `${parsedBaseUrl.protocol}//${parsedBaseUrl.hostname}:${port}`;

    return {
        baseUrl: normalizedBaseUrl,
        host: parsedBaseUrl.hostname,
        port,
    };
};

const localApiBaseUrl = normalizeBaseUrl(
    process.env.VITE_API_BASE_URL?.trim() || 'http://127.0.0.1:4000',
    'VITE_API_BASE_URL',
);
const resolvedLocalWebServer = resolveLocalWebBaseUrl(
    process.env.PLAYWRIGHT_WEB_BASE_URL?.trim() || 'http://127.0.0.1:3000',
    'PLAYWRIGHT_WEB_BASE_URL',
);
const localWebBaseUrl = resolvedLocalWebServer.baseUrl;

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
        testIgnore: [...chromiumOnlySpecs, ...webkitUnsupportedCeremonySpecs],
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
        trace: isCi ? ('retain-on-failure' as const) : ('off' as const),
        video: isCi ? ('retain-on-failure' as const) : ('off' as const),
    },
    workers: isCi
        ? parseWorkerCount(process.env.PLAYWRIGHT_CI_WORKERS, 4)
        : localWorkers,
    projects,
});

export const createLocalE2EConfig = (): PlaywrightTestConfig => ({
    ...getCommonConfig(localWebBaseUrl, 'test-results/playwright'),
    webServer: shouldUseBuiltServers
        ? [
              {
                  command: 'pnpm e2e:ci:serve:api',
                  timeout: 120_000,
                  url: `${localApiBaseUrl}/api/health-check`,
                  reuseExistingServer: false,
              },
              {
                  command: 'pnpm e2e:ci:serve:web',
                  timeout: 120_000,
                  url: localWebBaseUrl,
                  reuseExistingServer: false,
              },
          ]
        : [
              {
                  command:
                      'pnpm exec node --experimental-strip-types tests/e2e/scripts/run-e2e-backend.mts',
                  timeout: 120_000,
                  url: `${localApiBaseUrl}/api/health-check`,
                  reuseExistingServer: false,
              },
              {
                  command: `pnpm --filter @sealed-vote/web dev -- --host ${resolvedLocalWebServer.host} --port ${resolvedLocalWebServer.port}`,
                  timeout: 120_000,
                  url: localWebBaseUrl,
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
        normalizeBaseUrl(productionBaseUrl, 'PLAYWRIGHT_BASE_URL'),
        'test-results/playwright-production',
    );
};
