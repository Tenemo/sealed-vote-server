const listedSpecPattern =
    /^\s*\[[^\]]+\]\s+\u203a\s+(.+):\d+:\d+\s+\u203a\s+/u;
const productionBrowserReadinessListedFile =
    '00-production-browser-readiness.spec.ts';
const productionReadinessTestTitle =
    'browser can commit the homepage and a real production poll page';
const productionGotoTimeoutPattern =
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
    output.includes(productionBrowserReadinessListedFile) &&
    output.includes(productionReadinessTestTitle) &&
    productionGotoTimeoutPattern.test(output);

export const hasProductionGotoTimeout = (output: string): boolean =>
    productionGotoTimeoutPattern.test(output);

type NavigationTimeoutRecoveryResult =
    | {
          kind: 'recovered';
      }
    | {
          kind: 'retry-failed';
          exitCode?: number;
          output?: string;
      }
    | {
          kind: 'stalled';
      };

export const runProductionIsolatedInvocations = async ({
    forwardedCliArgs,
    listedFiles,
    recoverNavigationTimeout = async () => ({
        kind: 'retry-failed',
    }),
    onInvocationStart = () => undefined,
    onNavigationStall = () => undefined,
    runInvocation,
}: {
    forwardedCliArgs: string[];
    listedFiles: readonly string[];
    recoverNavigationTimeout?: (details: {
        listedFile: string;
        output: string;
    }) => Promise<NavigationTimeoutRecoveryResult>;
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
        let invocationResult = await runInvocation(invocationArgs);

        if (invocationResult.exitCode === 0) {
            continue;
        }

        if (hasProductionGotoTimeout(invocationResult.output)) {
            const recoveryResult = await recoverNavigationTimeout({
                listedFile,
                output: invocationResult.output,
            });

            if (recoveryResult.kind === 'recovered') {
                continue;
            }

            if (recoveryResult.kind === 'stalled') {
                failedFiles.push(listedFile);

                if (exitCode === 0) {
                    exitCode = invocationResult.exitCode;
                }

                stalledFile = listedFile;
                onNavigationStall(listedFile);
                break;
            }

            invocationResult = {
                exitCode:
                    recoveryResult.exitCode ?? invocationResult.exitCode,
                output: recoveryResult.output ?? invocationResult.output,
            };
        }

        failedFiles.push(listedFile);

        if (exitCode === 0) {
            exitCode = invocationResult.exitCode;
        }

        // Once the standalone production readiness spec hits the known 45s
        // goto-timeout stall, every remaining spec in this project is likely
        // to fail the same way. Stop now so the job surfaces that shared
        // infrastructure failure instead of burning the GitHub Actions timeout.
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
