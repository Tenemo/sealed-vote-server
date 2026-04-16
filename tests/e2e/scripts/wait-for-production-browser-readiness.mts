import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type WaitOptions = {
    forwardedCliArgs: string[];
    intervalMs: number;
    requiredStableChecks: number;
    timeoutMs: number;
};

type WaitDependencies = {
    log?: (message: string) => void;
    now?: () => number;
    runReadinessCheck?: (
        forwardedCliArgs: string[],
        timeoutMs: number,
    ) => boolean;
    sleep?: (delayMs: number) => Promise<void>;
};

const defaultIntervalMs = 15_000;
const defaultRequiredStableChecks = 2;
const defaultTimeoutMs = 20 * 60 * 1000;
const currentFilePath = fileURLToPath(import.meta.url);
const pnpmExecPath = process.env.npm_execpath;
const repoRoot = path.resolve(path.dirname(currentFilePath), '../../..');

const fail = (message: string): never => {
    throw new Error(message);
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

const splitCliArgs = (
    args: string[],
): {
    forwardedCliArgs: string[];
    scriptArgs: string[];
} => {
    const separatorIndex = args.indexOf('--');

    if (separatorIndex === -1) {
        return {
            forwardedCliArgs: [],
            scriptArgs: args,
        };
    }

    return {
        forwardedCliArgs: args.slice(separatorIndex + 1),
        scriptArgs: args.slice(0, separatorIndex),
    };
};

export const parseWaitCliArgs = (args: string[]): WaitOptions => {
    const { forwardedCliArgs, scriptArgs } = splitCliArgs(args);
    const pendingScriptArgs = [...scriptArgs];
    let rawIntervalMs: string | undefined;
    let rawRequiredStableChecks: string | undefined;
    let rawTimeoutMs: string | undefined;

    while (pendingScriptArgs.length > 0) {
        const arg = pendingScriptArgs.shift();
        const value = pendingScriptArgs.shift();

        if (arg === undefined) {
            break;
        }

        if (value === undefined) {
            fail(`Missing value for "${arg}".`);
        }

        switch (arg) {
            case '--interval-ms':
                rawIntervalMs = value;
                break;
            case '--required-stable-checks':
                rawRequiredStableChecks = value;
                break;
            case '--timeout-ms':
                rawTimeoutMs = value;
                break;
            default:
                fail(
                    `Unexpected argument "${arg}". Pass forwarded arguments after "--".`,
                );
        }
    }

    return {
        forwardedCliArgs,
        intervalMs: parsePositiveInteger(
            rawIntervalMs,
            defaultIntervalMs,
            '--interval-ms',
        ),
        requiredStableChecks: parsePositiveInteger(
            rawRequiredStableChecks,
            defaultRequiredStableChecks,
            '--required-stable-checks',
        ),
        timeoutMs: parsePositiveInteger(
            rawTimeoutMs,
            defaultTimeoutMs,
            '--timeout-ms',
        ),
    };
};

const parseArgs = (): WaitOptions => parseWaitCliArgs(process.argv.slice(2));

const sleep = async (delayMs: number): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
};

const resolvePnpmInvocation = (): {
    command: string;
    args: string[];
} => {
    if (pnpmExecPath) {
        return {
            command: process.execPath,
            args: [pnpmExecPath],
        };
    }

    if (process.platform === 'win32') {
        return {
            command: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', 'pnpm.cmd'],
        };
    }

    return {
        command: 'pnpm',
        args: [],
    };
};

const runReadinessCheck = (
    forwardedCliArgs: string[],
    timeoutMs: number,
): boolean => {
    const pnpmInvocation = resolvePnpmInvocation();

    const result = spawnSync(
        pnpmInvocation.command,
        [
            ...pnpmInvocation.args,
            'exec',
            'playwright',
            'test',
            '--config',
            'tests/config/playwright.production.config.mts',
            'tests/e2e/00-production-browser-readiness.spec.ts',
            '--workers',
            '1',
            ...forwardedCliArgs,
        ],
        {
            cwd: repoRoot,
            env: process.env,
            stdio: 'inherit',
            timeout: timeoutMs,
        },
    );

    if (result.error) {
        if ((result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
            return false;
        }

        throw result.error;
    }

    return result.status === 0;
};

const formatForwardedCliArgs = (forwardedCliArgs: string[]): string =>
    forwardedCliArgs.length > 0 ? forwardedCliArgs.join(' ') : '(default)';

export const waitForProductionBrowserReadiness = async (
    options: WaitOptions,
    dependencies: WaitDependencies = {},
): Promise<void> => {
    const log = dependencies.log ?? console.log;
    const resolveNow = dependencies.now ?? Date.now;
    const runCheck = dependencies.runReadinessCheck ?? runReadinessCheck;
    const wait = dependencies.sleep ?? sleep;
    const deadline = resolveNow() + options.timeoutMs;
    let stableChecks = 0;

    while (resolveNow() <= deadline) {
        const remainingCheckBudgetMs = deadline - resolveNow();

        if (remainingCheckBudgetMs <= 0) {
            break;
        }

        const isSuccessful = runCheck(
            options.forwardedCliArgs,
            remainingCheckBudgetMs,
        );

        if (isSuccessful) {
            stableChecks += 1;
            log(
                `Browser readiness check ${stableChecks}/${options.requiredStableChecks} succeeded for ${formatForwardedCliArgs(options.forwardedCliArgs)}.`,
            );

            if (stableChecks >= options.requiredStableChecks) {
                log(
                    `Production browser readiness is stable for ${formatForwardedCliArgs(options.forwardedCliArgs)}.`,
                );
                return;
            }
        } else {
            stableChecks = 0;
            log(
                `Waiting for stable production browser readiness for ${formatForwardedCliArgs(options.forwardedCliArgs)}.`,
            );
        }

        const remainingSleepBudgetMs = deadline - resolveNow();

        if (remainingSleepBudgetMs <= 0) {
            break;
        }

        await wait(Math.min(options.intervalMs, remainingSleepBudgetMs));
    }

    fail(
        `Timed out waiting for stable production browser readiness for ${formatForwardedCliArgs(options.forwardedCliArgs)}.`,
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
    await waitForProductionBrowserReadiness(parseArgs());
}
