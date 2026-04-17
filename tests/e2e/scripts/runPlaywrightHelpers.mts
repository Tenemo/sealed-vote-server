const listedSpecPattern =
    /^\s*\[[^\]]+\]\s+\u203a\s+(.+):\d+:\d+\s+\u203a\s+/u;
export const productionBrowserReadinessListedFile =
    '00-production-browser-readiness.spec.ts';
const productionReadinessTestTitle =
    'browser can commit the homepage and a real production vote page';
const productionReadinessGotoTimeoutPattern =
    /Error:\s+page\.goto: Timeout \d+ms exceeded\./u;
const playwrightOptionsWithSeparateValues = new Set([
    '-c',
    '-g',
    '-j',
    '--browser',
    '--config',
    '--global-timeout',
    '--grep',
    '--grep-invert',
    '--max-failures',
    '--output',
    '--project',
    '--repeat-each',
    '--reporter',
    '--retries',
    '--shard',
    '--timeout',
    '--trace',
    '--tsconfig',
    '--ui-host',
    '--ui-port',
    '--workers',
]);

const normalizeListedSpecFile = (listedFile: string): string =>
    listedFile.replaceAll('\\', '/');

const isProductionReadinessListedFile = (listedFile: string): boolean => {
    const normalizedListedFile = normalizeListedSpecFile(listedFile);

    return (
        normalizedListedFile === productionBrowserReadinessListedFile ||
        normalizedListedFile.endsWith(
            `/${productionBrowserReadinessListedFile}`,
        )
    );
};

export const collectListedSpecFiles = (listOutput: string): string[] => {
    const listedFiles = new Set<string>();

    for (const line of listOutput.split(/\r?\n/u)) {
        const match = line.match(listedSpecPattern);

        if (!match) {
            continue;
        }

        listedFiles.add(match[1]);
    }

    return [...listedFiles];
};

export const resolveProductionIsolatedInvocationFiles = (
    listedFile: string,
): string[] =>
    // Production file isolation launches a fresh Playwright process per file,
    // so each non-readiness file needs the readiness spec in the same
    // invocation to validate that exact worker/browser startup path.
    isProductionReadinessListedFile(listedFile)
        ? [listedFile]
        : [productionBrowserReadinessListedFile, listedFile];

export const stripPlaywrightPositionalTestSelectors = (
    forwardedCliArgs: readonly string[],
): string[] => {
    const sanitizedArgs: string[] = [];
    let nextArgIsOptionValue = false;

    for (const arg of forwardedCliArgs) {
        if (nextArgIsOptionValue) {
            sanitizedArgs.push(arg);
            nextArgIsOptionValue = false;
            continue;
        }

        if (arg === '--') {
            continue;
        }

        if (arg.startsWith('-')) {
            sanitizedArgs.push(arg);

            if (
                !arg.includes('=') &&
                playwrightOptionsWithSeparateValues.has(arg)
            ) {
                nextArgIsOptionValue = true;
            }

            continue;
        }
    }

    return sanitizedArgs;
};

export const resolveProductionIsolatedInvocationArgs = (
    listedFile: string,
    forwardedCliArgs: string[],
): string[] => [
    ...resolveProductionIsolatedInvocationFiles(listedFile),
    ...stripPlaywrightPositionalTestSelectors(forwardedCliArgs),
    // Keep the paired readiness file and target file on the same worker so
    // they share a single browser startup path.
    '--workers',
    '1',
];

export const isRecoverableProductionReadinessFailure = (
    output: string,
): boolean =>
    output.includes(productionBrowserReadinessListedFile) &&
    output.includes(productionReadinessTestTitle) &&
    productionReadinessGotoTimeoutPattern.test(output);

export const runProductionIsolatedInvocations = async ({
    logRetry = () => undefined,
    forwardedCliArgs,
    listedFiles,
    onInvocationStart = () => undefined,
    runInvocation,
}: {
    logRetry?: (listedFile: string) => void;
    forwardedCliArgs: string[];
    listedFiles: readonly string[];
    onInvocationStart?: (listedFile: string) => void;
    runInvocation: (invocationArgs: string[]) => Promise<{
        exitCode: number;
        output: string;
    }>;
}): Promise<{
    exitCode: number;
    failedFiles: string[];
}> => {
    const failedFiles: string[] = [];
    let exitCode = 0;

    for (const listedFile of listedFiles) {
        onInvocationStart(listedFile);
        const invocationArgs = resolveProductionIsolatedInvocationArgs(
            listedFile,
            forwardedCliArgs,
        );
        let invocationResult = await runInvocation(invocationArgs);

        // GitHub production artifacts showed Firefox sometimes timing out on
        // the paired readiness spec before any app page loaded, while curl in
        // the same container still reached the site. That failure survived the
        // page-level recovery inside a single Playwright process, so recover by
        // restarting the isolated invocation once in a fresh process.
        if (
            invocationResult.exitCode !== 0 &&
            isRecoverableProductionReadinessFailure(invocationResult.output)
        ) {
            logRetry(listedFile);
            invocationResult = await runInvocation(invocationArgs);
        }

        if (invocationResult.exitCode !== 0) {
            failedFiles.push(listedFile);

            if (exitCode === 0) {
                exitCode = invocationResult.exitCode;
            }
        }
    }

    return {
        exitCode,
        failedFiles,
    };
};
