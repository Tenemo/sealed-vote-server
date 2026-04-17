const listedSpecPattern =
    /^\s*\[[^\]]+\]\s+\u203a\s+(.+):\d+:\d+\s+\u203a\s+/u;
export const productionBrowserReadinessListedFile =
    '00-production-browser-readiness.spec.ts';

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

export const resolveProductionIsolatedInvocationArgs = (
    listedFile: string,
    forwardedCliArgs: string[],
): string[] => [
    ...resolveProductionIsolatedInvocationFiles(listedFile),
    ...forwardedCliArgs,
    // Keep the paired readiness file and target file on the same worker so
    // they share a single browser startup path.
    '--workers',
    '1',
];

export const runProductionIsolatedInvocations = ({
    forwardedCliArgs,
    listedFiles,
    onInvocationStart = () => undefined,
    runInvocation,
}: {
    forwardedCliArgs: string[];
    listedFiles: readonly string[];
    onInvocationStart?: (listedFile: string) => void;
    runInvocation: (invocationArgs: string[]) => number;
}): {
    exitCode: number;
    failedFiles: string[];
} => {
    const failedFiles: string[] = [];
    let exitCode = 0;

    for (const listedFile of listedFiles) {
        onInvocationStart(listedFile);
        const invocationStatus = runInvocation(
            resolveProductionIsolatedInvocationArgs(
                listedFile,
                forwardedCliArgs,
            ),
        );

        if (invocationStatus !== 0) {
            failedFiles.push(listedFile);

            if (exitCode === 0) {
                exitCode = invocationStatus;
            }
        }
    }

    return {
        exitCode,
        failedFiles,
    };
};
