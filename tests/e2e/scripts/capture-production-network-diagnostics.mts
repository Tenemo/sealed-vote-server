import { lookup } from 'node:dns/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type DiagnosticsOptions = {
    apiBaseUrl: string;
    intervalMs: number;
    outputDir: string;
    repeat: number;
    requestTimeoutMs: number;
    webBaseUrl: string;
};

type HttpProbe = {
    body?: string;
    headers?: Record<string, string>;
    label: string;
    method?: 'GET' | 'HEAD' | 'OPTIONS' | 'POST';
    slug: string;
    url: string;
};

type ProbeAttemptResult = {
    attempt: number;
    bodyLength: number | null;
    bodyPreview: string | null;
    contentType: string | null;
    durationMs: number;
    error: string | null;
    finalUrl: string;
    headers: Record<string, string>;
    ok: boolean;
    startedAt: string;
    statusCode: number | null;
};

type ProbeResult = {
    label: string;
    slug: string;
    url: string;
    attempts: ProbeAttemptResult[];
};

type PublicIpResult = {
    error: string | null;
    service: string;
    statusCode: number | null;
    value: string | null;
};

type LookupAddress = {
    address: string;
    family: number;
};

type DnsLookupResult = {
    error: string | null;
    hostname: string;
    results: LookupAddress[];
};

const currentFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(currentFilePath), '../../..');
const defaultApiBaseUrl = 'https://api.sealed.vote';
const defaultIntervalMs = 5_000;
const defaultOutputDir = 'production-diagnostics';
const defaultRepeat = 3;
const defaultRequestTimeoutMs = 15_000;
const defaultWebBaseUrl = 'https://sealed.vote';
const bodyPreviewMaxLength = 4_000;
const browserUserAgent =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const publicIpServices = [
    'https://api.ipify.org?format=json',
    'https://ifconfig.me/ip',
] as const;

const fail = (message: string): never => {
    throw new Error(message);
};

const normalizeAbsoluteUrl = (rawUrl: string, label: string): string => {
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

const parsePositiveInteger = (
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

const parseArgs = (args: string[]): DiagnosticsOptions => {
    const pendingArgs = args[0] === '--' ? [...args.slice(1)] : [...args];
    let rawApiBaseUrl: string | undefined;
    let rawIntervalMs: string | undefined;
    let rawOutputDir: string | undefined;
    let rawRepeat: string | undefined;
    let rawRequestTimeoutMs: string | undefined;
    let rawWebBaseUrl: string | undefined;

    while (pendingArgs.length > 0) {
        const arg = pendingArgs.shift();
        const value = pendingArgs.shift();

        if (!arg) {
            break;
        }

        if (!value) {
            fail(`Missing value for "${arg}".`);
        }

        switch (arg) {
            case '--api-base-url':
                rawApiBaseUrl = value;
                break;
            case '--interval-ms':
                rawIntervalMs = value;
                break;
            case '--output-dir':
                rawOutputDir = value;
                break;
            case '--repeat':
                rawRepeat = value;
                break;
            case '--request-timeout-ms':
                rawRequestTimeoutMs = value;
                break;
            case '--web-base-url':
                rawWebBaseUrl = value;
                break;
            default:
                fail(`Unexpected argument "${arg}".`);
        }
    }

    return {
        apiBaseUrl: normalizeAbsoluteUrl(
            rawApiBaseUrl ?? defaultApiBaseUrl,
            '--api-base-url',
        ),
        intervalMs: parsePositiveInteger(
            rawIntervalMs,
            defaultIntervalMs,
            '--interval-ms',
        ),
        outputDir: path.resolve(repoRoot, rawOutputDir ?? defaultOutputDir),
        repeat: parsePositiveInteger(rawRepeat, defaultRepeat, '--repeat'),
        requestTimeoutMs: parsePositiveInteger(
            rawRequestTimeoutMs,
            defaultRequestTimeoutMs,
            '--request-timeout-ms',
        ),
        webBaseUrl: normalizeAbsoluteUrl(
            rawWebBaseUrl ?? defaultWebBaseUrl,
            '--web-base-url',
        ),
    };
};

const sleep = async (delayMs: number): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
};

const truncateText = (
    value: string,
    maxLength: number = bodyPreviewMaxLength,
): string => (value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`);

const serializeError = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const headersToObject = (headers: Headers): Record<string, string> =>
    Object.fromEntries([...headers.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
    ));

const extractPublicIpValue = (responseText: string): string | null => {
    const trimmedResponseText = responseText.trim();

    if (!trimmedResponseText) {
        return null;
    }

    try {
        const parsedResponse = JSON.parse(trimmedResponseText) as {
            ip?: unknown;
        };

        if (typeof parsedResponse.ip === 'string') {
            const trimmedIp = parsedResponse.ip.trim();

            return trimmedIp || null;
        }
    } catch {
        return trimmedResponseText;
    }

    return trimmedResponseText;
};

const runProbeAttempt = async (
    probe: HttpProbe,
    requestTimeoutMs: number,
    attempt: number,
): Promise<ProbeAttemptResult> => {
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();

    try {
        const response = await fetch(probe.url, {
            method: probe.method ?? 'GET',
            headers: probe.headers,
            body: probe.body,
            redirect: 'follow',
            signal: AbortSignal.timeout(requestTimeoutMs),
        });
        const responseText = await response.text();

        return {
            attempt,
            bodyLength: responseText.length,
            bodyPreview: responseText ? truncateText(responseText) : null,
            contentType: response.headers.get('content-type'),
            durationMs: Date.now() - startedAtMs,
            error: null,
            finalUrl: response.url,
            headers: headersToObject(response.headers),
            ok: response.ok,
            startedAt,
            statusCode: response.status,
        };
    } catch (error) {
        return {
            attempt,
            bodyLength: null,
            bodyPreview: null,
            contentType: null,
            durationMs: Date.now() - startedAtMs,
            error: serializeError(error),
            finalUrl: probe.url,
            headers: {},
            ok: false,
            startedAt,
            statusCode: null,
        };
    }
};

const captureProbe = async (
    probe: HttpProbe,
    options: DiagnosticsOptions,
): Promise<ProbeResult> => {
    const attempts: ProbeAttemptResult[] = [];

    for (let attempt = 1; attempt <= options.repeat; attempt += 1) {
        const result = await runProbeAttempt(
            probe,
            options.requestTimeoutMs,
            attempt,
        );
        attempts.push(result);
        console.log(
            [
                `${probe.slug} attempt ${attempt}/${options.repeat}`,
                `status=${result.statusCode ?? 'unreachable'}`,
                `durationMs=${result.durationMs}`,
                result.error ? `error=${result.error}` : null,
            ]
                .filter(Boolean)
                .join(' '),
        );

        if (attempt < options.repeat) {
            await sleep(options.intervalMs);
        }
    }

    return {
        attempts,
        label: probe.label,
        slug: probe.slug,
        url: probe.url,
    };
};

const capturePublicIp = async (
    service: string,
    requestTimeoutMs: number,
): Promise<PublicIpResult> => {
    try {
        const response = await fetch(service, {
            headers: {
                accept: 'application/json, text/plain',
                'cache-control': 'no-store',
                pragma: 'no-cache',
            },
            cache: 'no-store',
            redirect: 'follow',
            signal: AbortSignal.timeout(requestTimeoutMs),
        });
        const responseText = await response.text();

        return {
            error: response.ok ? null : `HTTP ${response.status}`,
            service,
            statusCode: response.status,
            value: extractPublicIpValue(responseText),
        };
    } catch (error) {
        return {
            error: serializeError(error),
            service,
            statusCode: null,
            value: null,
        };
    }
};

const captureDnsLookup = async (hostname: string): Promise<DnsLookupResult> => {
    try {
        const results = await lookup(hostname, {
            all: true,
            verbatim: true,
        });

        return {
            error: null,
            hostname,
            results: results.map((result) => ({
                address: result.address,
                family: result.family,
            })),
        };
    } catch (error) {
        return {
            error: serializeError(error),
            hostname,
            results: [],
        };
    }
};

const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const createHttpProbes = (options: DiagnosticsOptions): HttpProbe[] => [
    {
        label: 'Homepage HTML',
        slug: 'homepage-default',
        url: `${options.webBaseUrl}/`,
    },
    {
        headers: {
            'user-agent': browserUserAgent,
        },
        label: 'Homepage HTML with browser user agent',
        slug: 'homepage-browser-ua',
        url: `${options.webBaseUrl}/`,
    },
    {
        label: 'Web version JSON',
        slug: 'web-version',
        url: `${options.webBaseUrl}/version.json`,
    },
    {
        label: 'API health JSON',
        slug: 'api-health-default',
        url: `${options.apiBaseUrl}/api/health-check`,
    },
    {
        headers: {
            'user-agent': browserUserAgent,
        },
        label: 'API health JSON with browser user agent',
        slug: 'api-health-browser-ua',
        url: `${options.apiBaseUrl}/api/health-check`,
    },
    {
        headers: {
            'access-control-request-headers': 'content-type',
            'access-control-request-method': 'POST',
            origin: options.webBaseUrl,
        },
        label: 'API create-poll CORS preflight',
        method: 'OPTIONS',
        slug: 'api-create-preflight',
        url: `${options.apiBaseUrl}/api/polls/create`,
    },
];

const captureEnvironmentSummary = (): Record<string, string | null> => ({
    CI: process.env.CI ?? null,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS ?? null,
    GITHUB_JOB: process.env.GITHUB_JOB ?? null,
    GITHUB_REF: process.env.GITHUB_REF ?? null,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY ?? null,
    GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT ?? null,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID ?? null,
    NODE_VERSION: process.version,
    RUNNER_ARCH: process.env.RUNNER_ARCH ?? null,
    RUNNER_OS: process.env.RUNNER_OS ?? null,
});

const run = async (): Promise<void> => {
    const options = parseArgs(process.argv.slice(2));

    await fs.mkdir(options.outputDir, {
        recursive: true,
    });

    const probes = createHttpProbes(options);
    const probeResults: ProbeResult[] = [];

    for (const probe of probes) {
        const result = await captureProbe(probe, options);
        probeResults.push(result);
        await writeJsonFile(
            path.join(options.outputDir, `${probe.slug}.json`),
            result,
        );
    }

    const [publicIpResults, dnsResults] = await Promise.all([
        Promise.all(
            publicIpServices.map(async (service) =>
                await capturePublicIp(service, options.requestTimeoutMs),
            ),
        ),
        Promise.all(
            [new URL(options.webBaseUrl).hostname, new URL(options.apiBaseUrl).hostname].map(
                async (hostname) => await captureDnsLookup(hostname),
            ),
        ),
    ]);

    await writeJsonFile(
        path.join(options.outputDir, 'public-ip.json'),
        publicIpResults,
    );
    await writeJsonFile(path.join(options.outputDir, 'dns.json'), dnsResults);
    await writeJsonFile(
        path.join(options.outputDir, 'env.json'),
        captureEnvironmentSummary(),
    );

    await writeJsonFile(path.join(options.outputDir, 'summary.json'), {
        apiBaseUrl: options.apiBaseUrl,
        capturedAt: new Date().toISOString(),
        dns: dnsResults,
        env: captureEnvironmentSummary(),
        probes: probeResults.map((result) => ({
            attempts: result.attempts.map((attempt) => ({
                durationMs: attempt.durationMs,
                error: attempt.error,
                ok: attempt.ok,
                statusCode: attempt.statusCode,
            })),
            label: result.label,
            slug: result.slug,
            url: result.url,
        })),
        publicIp: publicIpResults,
        requestTimeoutMs: options.requestTimeoutMs,
        repeat: options.repeat,
        webBaseUrl: options.webBaseUrl,
    });
};

void run();
