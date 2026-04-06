type WaitOptions = {
    apiBaseUrl: string;
    expectedCommitSha: string;
    intervalMs: number;
    timeoutMs: number;
    webBaseUrl: string;
};

type DeploymentStatus = {
    commitSha: string | null;
    ok: boolean;
    statusCode: number | null;
    url: string;
};

const commitShaPattern = /^[0-9a-f]{7,40}$/i;
const defaultIntervalMs = 15_000;
const defaultTimeoutMs = 30 * 60 * 1000;

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

    if (
        parsedUrl.protocol !== 'http:' &&
        parsedUrl.protocol !== 'https:'
    ) {
        return fail(`${label} must use the http or https protocol.`);
    }

    return parsedUrl.origin;
};

const normalizeCommitSha = (rawCommitSha: string): string => {
    const normalizedCommitSha = rawCommitSha.trim().toLowerCase();

    if (!commitShaPattern.test(normalizedCommitSha)) {
        return fail(
            'The expected commit SHA must be a hexadecimal Git commit SHA.',
        );
    }

    return normalizedCommitSha;
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

    return {
        apiBaseUrl: normalizeAbsoluteUrl(rawApiBaseUrl!, '--api'),
        expectedCommitSha: normalizeCommitSha(rawExpectedCommitSha!),
        intervalMs: parsePositiveInteger(
            getArgValue('--interval-ms'),
            defaultIntervalMs,
            '--interval-ms',
        ),
        timeoutMs: parsePositiveInteger(
            getArgValue('--timeout-ms'),
            defaultTimeoutMs,
            '--timeout-ms',
        ),
        webBaseUrl: normalizeAbsoluteUrl(rawWebBaseUrl!, '--web'),
    };
};

const getJsonResponse = async (
    url: URL,
): Promise<{ body: unknown; statusCode: number }> => {
    const response = await fetch(url, {
        headers: {
            accept: 'application/json',
            'cache-control': 'no-store',
        },
        cache: 'no-store',
    });
    const statusCode = response.status;
    let body: unknown = null;

    try {
        body = await response.json();
    } catch {
        body = null;
    }

    return {
        body,
        statusCode,
    };
};

const readCommitSha = (body: unknown): string | null => {
    if (typeof body !== 'object' || body === null) {
        return null;
    }

    const commitSha = (body as { commitSha?: unknown }).commitSha;

    if (typeof commitSha !== 'string') {
        return null;
    }

    const normalizedCommitSha = commitSha.trim().toLowerCase();
    return commitShaPattern.test(normalizedCommitSha) ? normalizedCommitSha : null;
};

const loadDeploymentStatus = async (
    baseUrl: string,
    endpointPath: string,
): Promise<DeploymentStatus> => {
    const url = new URL(endpointPath, baseUrl);
    url.searchParams.set('t', `${Date.now()}`);

    try {
        const { body, statusCode } = await getJsonResponse(url);

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

const sleep = async (delayMs: number): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
};

const formatStatus = (label: string, status: DeploymentStatus): string =>
    `${label}: status=${status.statusCode ?? 'unreachable'}, commitSha=${status.commitSha ?? 'missing'}`;

const waitForProductionDeploy = async (): Promise<void> => {
    const {
        apiBaseUrl,
        expectedCommitSha,
        intervalMs,
        timeoutMs,
        webBaseUrl,
    } = parseArgs();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
        const [webStatus, apiStatus] = await Promise.all([
            loadDeploymentStatus(webBaseUrl, '/version.json'),
            loadDeploymentStatus(apiBaseUrl, '/api/health-check'),
        ]);

        if (
            webStatus.ok &&
            apiStatus.ok &&
            webStatus.commitSha === expectedCommitSha &&
            apiStatus.commitSha === expectedCommitSha
        ) {
            console.log(
                `Production frontend and API are serving commit ${expectedCommitSha}.`,
            );
            return;
        }

        console.log(
            [
                `Waiting for production deploy ${expectedCommitSha}.`,
                formatStatus('web', webStatus),
                formatStatus('api', apiStatus),
            ].join(' '),
        );

        await sleep(intervalMs);
    }

    fail(
        `Timed out waiting for production frontend ${webBaseUrl} and API ${apiBaseUrl} to serve commit ${expectedCommitSha}.`,
    );
};

await waitForProductionDeploy();
