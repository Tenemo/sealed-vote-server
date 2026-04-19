import path from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
    devices,
    type PlaywrightTestConfig,
    type Project,
    type ReporterDescription,
} from '@playwright/test';

import { mobileFirefoxAndroidContextOptions } from './support/profiles.mts';
import {
    readmeDemoPanelViewport,
    readmeDemoRawVideoDir,
} from './support/readme-demo.mts';

const demoOnlySpecs = ['**/readme-demo.demo.ts'];
const productionOnlySpecs = ['**/00-production-browser-readiness.spec.ts'];
const localIgnoredSpecs = [...productionOnlySpecs, ...demoOnlySpecs];

// The main e2e matrix runs WebKit on Linux, where Ed25519 and X25519 WebCrypto
// support still lags the latest Apple WebKit stack. We probe that support on
// macOS separately, so only non-macOS WebKit runs need these exclusions here.
const webkitUnsupportedModernCryptoSpecs =
    process.platform === 'darwin'
        ? []
        : [
              '**/browser-crypto-compatibility.spec.ts',
              '**/ceremony-persistence.spec.ts',
              '**/duplicate-poll-name.spec.ts',
              '**/duplicate-voter-name.spec.ts',
              '**/multi-participant-counting.spec.ts',
              '**/share-link.spec.ts',
              '**/voting-flow.spec.ts',
          ];

// The mobile-firefox-android project exists to cover mobile UA, viewport, and
// touch behavior. The specs below exercise browser-agnostic application logic
// that firefox-desktop already covers, and each one issues many production
// page.goto / reload calls. Running them on mobile-firefox-android compounds
// edge-stall risk against the live site without adding mobile-specific signal.
const mobileFirefoxAndroidNonMobileSpecs = [
    '**/ceremony-persistence.spec.ts',
    '**/duplicate-poll-name.spec.ts',
    '**/duplicate-voter-name.spec.ts',
    '**/multi-participant-counting.spec.ts',
    '**/refresh-resume.spec.ts',
    '**/voting-flow.spec.ts',
];

const isContinuousIntegration = Boolean(process.env.CI);
const isLocalTurbo = process.env.PLAYWRIGHT_LOCAL_TURBO === 'true';
const shouldUseBlobReporter = process.env.PLAYWRIGHT_BLOB_REPORT === 'true';
const shouldUseBuiltServers =
    process.env.PLAYWRIGHT_USE_BUILT_SERVERS === 'true';
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '..', '..');
const localWorkers = Math.max(2, Math.min(availableParallelism(), 6));
// Keep the turbo profile faster than the default local run without pushing
// Firefox ceremony flows into scheduler starvation on high-core machines.
const localTurboWorkers = Math.max(2, Math.min(availableParallelism(), 8));

const parseWorkerCount = (
    label: string,
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
            `Invalid ${label} value "${rawValue}". Expected a positive integer.`,
        );
    }

    return parsedValue;
};

const reporters: ReporterDescription[] | 'list' = shouldUseBlobReporter
    ? [
          ['dot'],
          [
              'blob',
              { outputDir: path.resolve(repositoryRoot, 'blob-report') },
          ],
      ]
    : isContinuousIntegration
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
        use: {
            ...devices['Desktop Firefox'],
            browserName: 'firefox' as const,
        },
    },
    {
        name: 'webkit-desktop',
        testIgnore: webkitUnsupportedModernCryptoSpecs,
        use: {
            ...devices['Desktop Safari'],
            browserName: 'webkit' as const,
        },
    },
    {
        name: 'mobile-firefox-android',
        testIgnore: mobileFirefoxAndroidNonMobileSpecs,
        use: {
            browserName: 'firefox',
            ...mobileFirefoxAndroidContextOptions,
        },
    },
];

type TestIgnorePattern = string | RegExp;

const toTestIgnoreList = (
    testIgnore: Project['testIgnore'],
): TestIgnorePattern[] => {
    if (!testIgnore) {
        return [];
    }

    return Array.isArray(testIgnore) ? [...testIgnore] : [testIgnore];
};

const mergeProjectTestIgnores = (
    project: Project,
    additionalTestIgnores: readonly TestIgnorePattern[],
): Project => ({
    ...project,
    testIgnore: [
        ...toTestIgnoreList(project.testIgnore),
        ...additionalTestIgnores,
    ],
});

const getCommonConfig = (
    baseURL: string,
    outputDir: string,
    options?: {
        fullyParallel?: boolean;
        workers?: number;
    },
): PlaywrightTestConfig => ({
    testDir: currentDirectory,
    timeout: 180_000,
    expect: {
        timeout: 20_000,
    },
    forbidOnly: isContinuousIntegration,
    fullyParallel: options?.fullyParallel ?? false,
    outputDir: path.resolve(repositoryRoot, outputDir),
    reporter: reporters,
    retries: 0,
    use: {
        baseURL,
        screenshot: 'only-on-failure' as const,
        trace: isContinuousIntegration
            ? ('retain-on-failure' as const)
            : ('off' as const),
        video: isContinuousIntegration
            ? ('retain-on-failure' as const)
            : ('off' as const),
    },
    workers:
        options?.workers ??
        (isContinuousIntegration
            ? parseWorkerCount(
                  'PLAYWRIGHT_CI_WORKERS',
                  process.env.PLAYWRIGHT_CI_WORKERS,
                  4,
              )
            : localWorkers),
    projects,
});

const createLocalWebServers = (): NonNullable<PlaywrightTestConfig['webServer']> =>
    shouldUseBuiltServers
        ? [
              {
                  command: 'pnpm e2e:ci:serve:api',
                  cwd: repositoryRoot,
                  timeout: 120_000,
                  url: `${localApiBaseUrl}/api/health-check`,
                  reuseExistingServer: false,
              },
              {
                  command: 'pnpm e2e:ci:serve:web',
                  cwd: repositoryRoot,
                  timeout: 120_000,
                  url: localWebBaseUrl,
                  reuseExistingServer: false,
              },
          ]
        : [
              {
                  command:
                      'pnpm exec node --experimental-strip-types tests/e2e/scripts/run-e2e-backend.mts',
                  cwd: repositoryRoot,
                  timeout: 120_000,
                  url: `${localApiBaseUrl}/api/health-check`,
                  reuseExistingServer: false,
              },
              {
                  command: `pnpm --filter @sealed-vote/web dev -- --host ${resolvedLocalWebServer.host} --port ${resolvedLocalWebServer.port}`,
                  cwd: repositoryRoot,
                  timeout: 120_000,
                  url: localWebBaseUrl,
                  reuseExistingServer: false,
              },
          ];

export const createLocalE2EConfig = (): PlaywrightTestConfig => ({
    ...getCommonConfig(
        localWebBaseUrl,
        isLocalTurbo
            ? 'test-results/playwright-turbo'
            : 'test-results/playwright',
        isLocalTurbo
            ? {
                  fullyParallel: true,
                  workers: parseWorkerCount(
                      'PLAYWRIGHT_LOCAL_WORKERS',
                      process.env.PLAYWRIGHT_LOCAL_WORKERS,
                      localTurboWorkers,
                  ),
              }
            : undefined,
    ),
    projects: projects.map((project) =>
        mergeProjectTestIgnores(project, localIgnoredSpecs),
    ),
    webServer: createLocalWebServers(),
});

export const createReadmeDemoConfig = (): PlaywrightTestConfig => ({
    ...getCommonConfig(localWebBaseUrl, 'test-results/readme-demo', {
        workers: 1,
    }),
    testMatch: '**/readme-demo.demo.ts',
    use: {
        baseURL: localWebBaseUrl,
        screenshot: 'only-on-failure' as const,
        trace: 'off' as const,
        video: 'off' as const,
    },
    projects: [
        {
            name: 'chromium-readme-demo',
            use: {
                ...devices['Desktop Chrome'],
                browserName: 'chromium' as const,
                recordVideo: {
                    dir: readmeDemoRawVideoDir,
                    size: readmeDemoPanelViewport,
                },
                viewport: readmeDemoPanelViewport,
            } as Project['use'],
        },
    ],
    webServer: createLocalWebServers(),
});

export const createProductionE2EConfig = (): PlaywrightTestConfig => {
    if (!productionBaseUrl) {
        throw new Error(
            'PLAYWRIGHT_BASE_URL must be set before running production e2e tests.',
        );
    }

    if (!process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS?.trim()) {
        // Live production occasionally serves a page that eventually becomes
        // interactable after Playwright times out the initial goto. Production
        // e2e should enable the navigation helper's recovery path by default,
        // while still allowing an explicit env override for debugging.
        process.env.PLAYWRIGHT_NAVIGATION_RETRY_TIMEOUTS = 'true';
    }

    // Production e2e intentionally runs the full browser suite against the live
    // production URL. Manual production dispatches from test-fix branches are
    // also intentional, because production-only navigation behavior is part of
    // what these tests are validating. Do not narrow this to smoke coverage or
    // reroute it to a preview environment.
    return {
        ...getCommonConfig(
            normalizeBaseUrl(productionBaseUrl, 'PLAYWRIGHT_BASE_URL'),
            'test-results/playwright-production',
            { fullyParallel: true },
        ),
        projects: projects.map((project) =>
            mergeProjectTestIgnores(project, demoOnlySpecs),
        ),
    };
};
