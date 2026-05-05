import {
    collectListedSpecFiles,
    resolveProductionIsolatedInvocationArgs,
    runProductionIsolatedInvocations,
} from './run-playwright-helpers.mts';
import {
    getForwardedCliArgs,
    runPnpmCaptureSync,
    runPnpmObserved,
    runPnpmSync,
} from './shared.mts';
import { waitForProductionBrowserReadiness } from './wait-for-production-browser-readiness.mts';

const cliArgs = process.argv.slice(2);
const firstArg = cliArgs[0];
const normalizeForwardedCliArgs = (args: string[]): string[] =>
    args[0] === '--' ? args.slice(1) : args;
const mode =
    firstArg === 'production' ? 'production' : 'browser-compatibility';
const forwardedCliArgs =
    firstArg === 'browser-compatibility' || firstArg === 'production'
        ? normalizeForwardedCliArgs(cliArgs.slice(1))
        : getForwardedCliArgs();
const configPath =
    mode === 'production'
        ? 'tests/config/playwright.config.mts'
        : 'tests/config/playwright-browser-compatibility.config.mts';
const defaultProductionNavigationRecoveryIntervalMs = 15_000;
const defaultProductionNavigationRecoveryStableChecks = 2;
const defaultProductionNavigationRecoveryTimeoutMs = 20 * 60 * 1000;

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
        throw new Error(`${label} must be a positive integer.`);
    }

    return parsedValue;
};

if (mode === 'production') {
    process.env.PLAYWRIGHT_CONFIG_PROFILE = 'production';
} else {
    delete process.env.PLAYWRIGHT_CONFIG_PROFILE;
}

const shouldIsolateProductionByFile =
    mode === 'production' &&
    process.env.PLAYWRIGHT_PRODUCTION_ISOLATE_BY_FILE === 'true' &&
    !forwardedCliArgs.includes('--list');

if (!shouldIsolateProductionByFile) {
    runPnpmSync([
        'exec',
        'playwright',
        'test',
        '--config',
        configPath,
        ...forwardedCliArgs,
    ]);
} else {
    const listedFiles = collectListedSpecFiles(
        runPnpmCaptureSync([
            'exec',
            'playwright',
            'test',
            '--config',
            configPath,
            '--list',
            ...forwardedCliArgs,
        ]),
    );

    if (listedFiles.length === 0) {
        throw new Error(
            'Production Playwright isolation could not discover any matching spec files.',
        );
    }

    const productionNavigationRecoveryIntervalMs = parsePositiveInteger(
        process.env.PLAYWRIGHT_PRODUCTION_NAVIGATION_RECOVERY_INTERVAL_MS,
        defaultProductionNavigationRecoveryIntervalMs,
        'PLAYWRIGHT_PRODUCTION_NAVIGATION_RECOVERY_INTERVAL_MS',
    );
    const productionNavigationRecoveryStableChecks = parsePositiveInteger(
        process.env.PLAYWRIGHT_PRODUCTION_NAVIGATION_RECOVERY_STABLE_CHECKS,
        defaultProductionNavigationRecoveryStableChecks,
        'PLAYWRIGHT_PRODUCTION_NAVIGATION_RECOVERY_STABLE_CHECKS',
    );
    const productionNavigationRecoveryTimeoutMs = parsePositiveInteger(
        process.env.PLAYWRIGHT_PRODUCTION_NAVIGATION_RECOVERY_TIMEOUT_MS,
        defaultProductionNavigationRecoveryTimeoutMs,
        'PLAYWRIGHT_PRODUCTION_NAVIGATION_RECOVERY_TIMEOUT_MS',
    );

    const isolatedRunResult = await runProductionIsolatedInvocations({
        forwardedCliArgs,
        listedFiles,
        recoverNavigationTimeout: async ({ listedFile }) => {
            console.error(
                `Production navigation timed out in ${listedFile}; waiting for browser readiness to recover before rerunning this file.`,
            );

            try {
                await waitForProductionBrowserReadiness({
                    forwardedCliArgs,
                    intervalMs: productionNavigationRecoveryIntervalMs,
                    requiredStableChecks:
                        productionNavigationRecoveryStableChecks,
                    timeoutMs: productionNavigationRecoveryTimeoutMs,
                });
            } catch (error) {
                console.error(
                    error instanceof Error ? error.message : String(error),
                );

                return {
                    kind: 'stalled',
                };
            }

            console.error(
                `Production browser readiness recovered; rerunning ${listedFile}.`,
            );

            const rerunResult = await runPnpmObserved([
                'exec',
                'playwright',
                'test',
                '--config',
                configPath,
                ...resolveProductionIsolatedInvocationArgs(
                    listedFile,
                    forwardedCliArgs,
                ),
            ]);

            if (rerunResult.status === 0) {
                return {
                    kind: 'recovered',
                };
            }

            return {
                exitCode: rerunResult.status,
                kind: 'retry-failed',
                output: rerunResult.output,
            };
        },
        onInvocationStart: (listedFile) => {
            console.log(
                `Running production Playwright file in isolation: ${listedFile}`,
            );
        },
        onNavigationStall: (listedFile) => {
            console.error(
                `Production navigation stalled in ${listedFile}; skipping remaining isolated files for this project.`,
            );
        },
        runInvocation: async (invocationArgs) => {
            const result = await runPnpmObserved([
                'exec',
                'playwright',
                'test',
                '--config',
                configPath,
                ...invocationArgs,
            ]);

            return {
                exitCode: result.status,
                output: result.output,
            };
        },
    });

    if (isolatedRunResult.exitCode !== 0) {
        console.error('\nProduction Playwright isolated failures:');

        for (const failedFile of isolatedRunResult.failedFiles) {
            console.error(`- ${failedFile}`);
        }

        process.exit(isolatedRunResult.exitCode);
    }
}
