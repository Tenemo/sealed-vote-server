const listedSpecPattern =
    /^\s*\[[^\]]+\]\s+\u203a\s+(.+):\d+:\d+\s+\u203a\s+/u;
const productionNavigationStallPattern =
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
    listedFile,
    ...stripPlaywrightPositionalTestSelectors(forwardedCliArgs),
    '--workers',
    '1',
];

export const isProductionNavigationStall = (output: string): boolean =>
    productionNavigationStallPattern.test(output);

export const runProductionIsolatedInvocations = async ({
    forwardedCliArgs,
    listedFiles,
    onInvocationStart = () => undefined,
    onNavigationStall = () => undefined,
    runInvocation,
}: {
    forwardedCliArgs: string[];
    listedFiles: readonly string[];
    onInvocationStart?: (listedFile: string) => void;
    onNavigationStall?: (listedFile: string) => void;
    runInvocation: (invocationArgs: string[]) => Promise<{
        exitCode: number;
        output: string;
    }>;
}): Promise<{
    exitCode: number;
    failedFiles: string[];
    stalledFile: string | null;
}> => {
    const failedFiles: string[] = [];
    let exitCode = 0;
    let stalledFile: string | null = null;

    for (const listedFile of listedFiles) {
        onInvocationStart(listedFile);
        const invocationArgs = resolveProductionIsolatedInvocationArgs(
            listedFile,
            forwardedCliArgs,
        );
        const invocationResult = await runInvocation(invocationArgs);

        if (invocationResult.exitCode === 0) {
            continue;
        }

        failedFiles.push(listedFile);

        if (exitCode === 0) {
            exitCode = invocationResult.exitCode;
        }

        // Once a production goto stalls at the edge (same signature as
        // readiness hitting the 45s timeout with no response bytes), every
        // remaining spec in this project will fail the same way. Stop now so
        // the job surfaces a real failure instead of burning the GitHub
        // Actions timeout and getting cancelled.
        if (isProductionNavigationStall(invocationResult.output)) {
            stalledFile = listedFile;
            onNavigationStall(listedFile);
            break;
        }
    }

    return {
        exitCode,
        failedFiles,
        stalledFile,
    };
};
