import path from 'node:path';
import { fileURLToPath } from 'node:url';

type WaitOptions = {
    apiBaseUrl: string;
    expectedCommitSha: string;
    intervalMs: number;
    requestTimeoutMs: number;
    requiredStableChecks: number;
    timeoutMs: number;
    webBaseUrl: string;
};

type JsonProbeStatus = {
    commitSha: string | null;
    ok: boolean;
    statusCode: number | null;
    url: string;
};

type HtmlProbeStatus = {
    contentType: string | null;
    missingSnippetLabel: string | null;
    ok: boolean;
    statusCode: number | null;
    url: string;
};

type ReadinessStatus = {
    apiHealth: JsonProbeStatus;
    homepage: HtmlProbeStatus;
    pollPage: HtmlProbeStatus;
    webVersion: JsonProbeStatus;
};

type WaitDependencies = {
    loadReadinessStatus?: (options: WaitOptions) => Promise<ReadinessStatus>;
    log?: (message: string) => void;
    now?: () => number;
    sleep?: (delayMs: number) => Promise<void>;
};

type HtmlProbeExpectation = {
    label: string;
    snippet: string;
};

const commitShaPattern = /^[0-9a-f]{7,40}$/i;
const defaultIntervalMs = 15_000;
const defaultRequestTimeoutMs = 10_000;
const defaultRequiredStableChecks = 2;
const defaultTimeoutMs = 30 * 60 * 1000;
const syntheticPollSlugPrefix = 'production-readiness-';
const homepageExpectedTitle =
    '<title>sealed.vote | 1-10 score voting app</title>';
const homepageExpectedSiteName =
    '<meta property="og:site_name" content="sealed.vote" />';
const now = (): number => Date.now();
const currentFilePath = fileURLToPath(import.meta.url);

const fail = (message: string): never => {
    throw new Error(message);
};

export const normalizeAbsoluteUrl = (rawUrl: string, label: string): string => {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(rawUrl);
    } catch {
        return fail(`${label} must be a valid absolute URL.`);
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return fail(`${label} must use the http or https protocol.`);
    }

    return parsedUrl.origin;
};

export const normalizeCommitSha = (rawCommitSha: string): string => {
    const normalizedCommitSha = rawCommitSha.trim().toLowerCase();

    if (!commitShaPattern.test(normalizedCommitSha)) {
        return fail(
            'The expected commit SHA must be a hexadecimal Git commit SHA.',
        );
    }

    return normalizedCommitSha;
};

export const parsePositiveInteger = (
    rawValue: string | undefined,
    fallback: number,
    label: string,
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
        return fail(`${label} must be a positive integer.`);
    }

    return parsedValue;
};

export const createSyntheticPollPath = (expectedCommitSha: string): string => {
    const normalizedCommitSha = normalizeCommitSha(expectedCommitSha);
    const readableCommitSha = normalizedCommitSha.slice(0, 12);
    return `/polls/${syntheticPollSlugPrefix}${readableCommitSha}`;
};

const createHtmlProbeExpectations = (
    webBaseUrl: string,
    expectedCommitSha: string,
): {
    homepage: HtmlProbeExpectation[];
    pollPage: HtmlProbeExpectation[];
} => {
    const syntheticPollPath = createSyntheticPollPath(expectedCommitSha);
    const syntheticPollCanonicalUrl = new URL(
        syntheticPollPath,
        webBaseUrl,
    ).toString();

    return {
        homepage: [
            {
                label: 'homepage title',
                snippet: homepageExpectedTitle,
            },
            {
                label: 'homepage og site name',
                snippet: homepageExpectedSiteName,
            },
        ],
        pollPage: [
            {
                label: 'poll page canonical',
                snippet: `<link data-rh="true" rel="canonical" href="${syntheticPollCanonicalUrl}"`,
            },
            {
                label: 'poll page robots',
                snippet:
                    '<meta data-rh="true" name="robots" content="noindex, nofollow, noarchive, max-image-preview:large" />',
            },
            {
                label: 'poll page title',
                snippet: '<title data-rh="true">Poll | sealed.vote</title>',
            },
        ],
    };
};

const parseArgs = (): WaitOptions => {
    const args = process.argv.slice(2);
    const getArgValue = (flag: string): string | undefined => {
        const flagIndex = args.indexOf(flag);

        if (flagIndex === -1) {
            return undefined;
        }

        return args[flagIndex + 1];
    };

    const rawExpectedCommitSha = getArgValue('--commit');
    const rawWebBaseUrl = getArgValue('--web');
    const rawApiBaseUrl = getArgValue('--api');

    if (!rawExpectedCommitSha) {
        fail('Missing required --commit argument.');
    }

    if (!rawWebBaseUrl) {
        fail('Missing required --web argument.');
    }

    if (!rawApiBaseUrl) {
        fail('Missing required --api argument.');
    }

    const apiBaseUrl = normalizeAbsoluteUrl(rawApiBaseUrl!, '--api');
    const expectedCommitSha = normalizeCommitSha(rawExpectedCommitSha!);
    const webBaseUrl = normalizeAbsoluteUrl(rawWebBaseUrl!, '--web');

    return {
        apiBaseUrl,
        expectedCommitSha,
        intervalMs: parsePositiveInteger(
            getArgValue('--interval-ms'),
            defaultIntervalMs,
            '--interval-ms',
        ),
        requestTimeoutMs: parsePositiveInteger(
            getArgValue('--request-timeout-ms'),
            defaultRequestTimeoutMs,
            '--request-timeout-ms',
        ),
        requiredStableChecks: parsePositiveInteger(
            getArgValue('--required-stable-checks'),
            defaultRequiredStableChecks,
            '--required-stable-checks',
        ),
        timeoutMs: parsePositiveInteger(
            getArgValue('--timeout-ms'),
            defaultTimeoutMs,
            '--timeout-ms',
        ),
        webBaseUrl,
    };
};

const createNoStoreUrl = (baseUrl: string, endpointPath: string): URL => {
    const url = new URL(endpointPath, baseUrl);
    url.searchParams.set('t', `${now()}`);
    return url;
};

const getJsonResponse = async (
    url: URL,
    requestTimeoutMs: number,
): Promise<{ body: unknown; statusCode: number }> => {
    const response = await fetch(url, {
        headers: {
            accept: 'application/json',
            'cache-control': 'no-store',
            pragma: 'no-cache',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const statusCode = response.status;
    let body: unknown;

    try {
        body = await response.json();
    } catch {
        body = null;
    }

    return { body, statusCode };
};

const getHtmlResponse = async (
    url: URL,
    requestTimeoutMs: number,
): Promise<{
    body: string;
    contentType: string | null;
    statusCode: number;
}> => {
    const response = await fetch(url, {
        headers: {
            accept: 'text/html,application/xhtml+xml',
            'cache-control': 'no-store',
            pragma: 'no-cache',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(requestTimeoutMs),
    });

    return {
        body: await response.text(),
        contentType: response.headers.get('content-type'),
        statusCode: response.status,
    };
};

export const readCommitSha = (body: unknown): string | null => {
    if (typeof body !== 'object' || body === null) {
        return null;
    }

    const commitSha = (body as { commitSha?: unknown }).commitSha;

    if (typeof commitSha !== 'string') {
        return null;
    }

    const normalizedCommitSha = commitSha.trim().toLowerCase();
    return commitShaPattern.test(normalizedCommitSha)
        ? normalizedCommitSha
        : null;
};

const loadJsonProbeStatus = async (
    baseUrl: string,
    endpointPath: string,
    requestTimeoutMs: number,
): Promise<JsonProbeStatus> => {
    const url = createNoStoreUrl(baseUrl, endpointPath);

    try {
        const { body, statusCode } = await getJsonResponse(
            url,
            requestTimeoutMs,
        );

        return {
            commitSha: readCommitSha(body),
            ok: statusCode >= 200 && statusCode < 300,
            statusCode,
            url: url.toString(),
        };
    } catch {
        return {
            commitSha: null,
            ok: false,
            statusCode: null,
            url: url.toString(),
        };
    }
};

const loadHtmlProbeStatus = async (
    baseUrl: string,
    endpointPath: string,
    requestTimeoutMs: number,
    expectations: HtmlProbeExpectation[],
): Promise<HtmlProbeStatus> => {
    const url = createNoStoreUrl(baseUrl, endpointPath);

    try {
        const { body, contentType, statusCode } = await getHtmlResponse(
            url,
            requestTimeoutMs,
        );
        const missingExpectation =
            expectations.find(({ snippet }) => !body.includes(snippet)) ?? null;
        const isHtmlResponse = (contentType || '').includes('text/html');

        return {
            contentType,
            missingSnippetLabel: missingExpectation?.label ?? null,
            ok:
                statusCode >= 200 &&
                statusCode < 300 &&
                isHtmlResponse &&
                missingExpectation === null,
            statusCode,
            url: url.toString(),
        };
    } catch {
        return {
            contentType: null,
            missingSnippetLabel: null,
            ok: false,
            statusCode: null,
            url: url.toString(),
        };
    }
};

export const loadReadinessStatus = async (
    options: WaitOptions,
): Promise<ReadinessStatus> => {
    const expectations = createHtmlProbeExpectations(
        options.webBaseUrl,
        options.expectedCommitSha,
    );
    const syntheticPollPath = createSyntheticPollPath(
        options.expectedCommitSha,
    );

    const [webVersion, apiHealth, homepage, pollPage] = await Promise.all([
            loadJsonProbeStatus(
                options.webBaseUrl,
                '/version.json',
                options.requestTimeoutMs,
            ),
            loadJsonProbeStatus(
                options.apiBaseUrl,
                '/api/health-check',
                options.requestTimeoutMs,
            ),
            loadHtmlProbeStatus(
                options.webBaseUrl,
                '/',
                options.requestTimeoutMs,
                expectations.homepage,
            ),
            loadHtmlProbeStatus(
                options.webBaseUrl,
                syntheticPollPath,
                options.requestTimeoutMs,
                expectations.pollPage,
            ),
        ]);

    return {
        apiHealth,
        homepage,
        pollPage,
        webVersion,
    };
};

export const isReadinessStatusSuccessful = (
    status: ReadinessStatus,
    expectedCommitSha: string,
): boolean =>
    status.webVersion.ok &&
    status.apiHealth.ok &&
    status.homepage.ok &&
    status.pollPage.ok &&
    status.webVersion.commitSha === expectedCommitSha &&
    status.apiHealth.commitSha === expectedCommitSha;

const sleep = async (delayMs: number): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
};

const formatJsonStatus = (label: string, status: JsonProbeStatus): string =>
    `${label}: status=${status.statusCode ?? 'unreachable'}, commitSha=${status.commitSha ?? 'missing'}`;

const formatHtmlStatus = (label: string, status: HtmlProbeStatus): string => {
    const contentType = status.contentType ?? 'missing';
    const markerStatus =
        status.statusCode == null
            ? 'markers=unreachable'
            : status.missingSnippetLabel
              ? `markers=missing ${status.missingSnippetLabel}`
              : status.ok
                ? 'markers=ok'
                : 'markers=unknown';

    return `${label}: status=${status.statusCode ?? 'unreachable'}, contentType=${contentType}, ${markerStatus}`;
};

export const formatReadinessStatus = (status: ReadinessStatus): string =>
    [
        formatJsonStatus('web version', status.webVersion),
        formatJsonStatus('api health', status.apiHealth),
        formatHtmlStatus('homepage', status.homepage),
        formatHtmlStatus('poll page', status.pollPage),
    ].join(' ');

export const waitForProductionDeploy = async (
    options: WaitOptions,
    dependencies: WaitDependencies = {},
): Promise<void> => {
    const loadStatus = dependencies.loadReadinessStatus ?? loadReadinessStatus;
    const log = dependencies.log ?? console.log;
    const resolveNow = dependencies.now ?? now;
    const wait = dependencies.sleep ?? sleep;
    const deadline = resolveNow() + options.timeoutMs;
    let stableChecks = 0;

    while (resolveNow() <= deadline) {
        const readinessStatus = await loadStatus(options);
        const isSuccessful = isReadinessStatusSuccessful(
            readinessStatus,
            options.expectedCommitSha,
        );

        if (isSuccessful) {
            stableChecks += 1;
            log(
                `Production readiness check ${stableChecks}/${options.requiredStableChecks} succeeded. ${formatReadinessStatus(readinessStatus)}`,
            );

            if (stableChecks >= options.requiredStableChecks) {
                log(
                    `Production frontend and API are stably serving commit ${options.expectedCommitSha}.`,
                );
                return;
            }
        } else {
            stableChecks = 0;
            log(
                [
                    `Waiting for stable production deploy ${options.expectedCommitSha}.`,
                    formatReadinessStatus(readinessStatus),
                ].join(' '),
            );
        }

        await wait(options.intervalMs);
    }

    fail(
        `Timed out waiting for production frontend ${options.webBaseUrl} and API ${options.apiBaseUrl} to stably serve commit ${options.expectedCommitSha}.`,
    );
};

const shouldRunAsCli = (): boolean => {
    const rawEntryPoint = process.argv[1];

    if (!rawEntryPoint) {
        return false;
    }

    return path.resolve(rawEntryPoint) === currentFilePath;
};

if (shouldRunAsCli()) {
    await waitForProductionDeploy(parseArgs());
}
