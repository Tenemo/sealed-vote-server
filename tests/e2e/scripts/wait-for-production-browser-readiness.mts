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
    runReadinessCheck?: (forwardedCliArgs: string[]) => boolean;
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

const getForwardedCliArgs = (args: string[]): string[] => {
    const separatorIndex = args.indexOf('--');

    if (separatorIndex === -1) {
        return [];
    }

    return args.slice(separatorIndex + 1);
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

    return {
        forwardedCliArgs: getForwardedCliArgs(args),
        intervalMs: parsePositiveInteger(
            getArgValue('--interval-ms'),
            defaultIntervalMs,
            '--interval-ms',
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
    };
};

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

const runReadinessCheck = (forwardedCliArgs: string[]): boolean => {
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
        },
    );

    if (result.error) {
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
        const isSuccessful = runCheck(options.forwardedCliArgs);

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

        await wait(options.intervalMs);
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
