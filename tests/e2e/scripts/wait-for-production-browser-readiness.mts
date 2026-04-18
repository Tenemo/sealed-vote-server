import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendOutputTail } from './shared.mts';

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
    ) => ReadinessCheckResult | Promise<ReadinessCheckResult>;
    sleep?: (delayMs: number) => Promise<void>;
};

const defaultIntervalMs = 15_000;
const defaultRequiredStableChecks = 2;
const defaultTimeoutMs = 20 * 60 * 1000;
const readinessOutputTailMaxLength = 16 * 1024 * 1024;
const firefoxHomeOwnershipFailureMessage =
    'Firefox cannot launch in the Playwright container because HOME is not owned by the current user. Set HOME=/root or run the container as a non-root user.';
const currentFilePath = fileURLToPath(import.meta.url);
const pnpmExecPath = process.env.npm_execpath;
const repoRoot = path.resolve(path.dirname(currentFilePath), '../../..');

export type ReadinessCheckResult =
    | {
          kind: 'success';
      }
    | {
          kind: 'retry';
      }
    | {
          kind: 'fatal';
          message: string;
      };

type ReadinessProcessError = Error & {
    code?: string;
};

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

export const detectFatalReadinessFailureMessage = (
    output: string,
): string | null => {
    if (
        output.includes(
            "Firefox is unable to launch if the $HOME folder isn't owned by the current user.",
        ) ||
        output.includes(
            'Running Nightly as root in a regular user\'s session is not supported.',
        )
    ) {
        return firefoxHomeOwnershipFailureMessage;
    }

    if (
        output.includes(
            'browserType.launch: Failed to launch the browser process.',
        ) ||
        output.includes('Error: browserType.launch: Failed to launch the browser process.')
    ) {
        return 'The Playwright browser could not launch inside the readiness job, so retrying will not make production become ready.';
    }

    return null;
};

export const classifyReadinessProcessFailure = ({
    error,
    output,
}: {
    error: ReadinessProcessError | undefined;
    output: string;
}): ReadinessCheckResult | null => {
    if (!error) {
        return null;
    }

    if (error.code === 'ETIMEDOUT') {
        return {
            kind: 'retry',
        };
    }

    if (
        error.code === 'ENOBUFS' ||
        error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ||
        error.message.includes('maxBuffer')
    ) {
        const fatalFailureMessage = detectFatalReadinessFailureMessage(output);

        if (fatalFailureMessage) {
            return {
                kind: 'fatal',
                message: fatalFailureMessage,
            };
        }

        return {
            kind: 'retry',
        };
    }

    throw error;
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

const runReadinessCheck = async (
    forwardedCliArgs: string[],
    timeoutMs: number,
): Promise<ReadinessCheckResult> => {
    const pnpmInvocation = resolvePnpmInvocation();
    const result = await new Promise<{
        error: ReadinessProcessError | undefined;
        output: string;
        status: number;
    }>((resolve) => {
        const childProcess = spawn(
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
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        let capturedOutput = '';
        let processError: ReadinessProcessError | undefined;
        let settled = false;
        let killTimer: NodeJS.Timeout | undefined;

        const settle = (status: number): void => {
            if (settled) {
                return;
            }

            settled = true;

            if (killTimer) {
                clearTimeout(killTimer);
            }

            resolve({
                error: processError,
                output: capturedOutput,
                status,
            });
        };

        const observeChunk = (
            chunk: Buffer | string,
            stream: NodeJS.WriteStream,
        ): void => {
            const text = chunk.toString();
            capturedOutput = appendOutputTail(
                capturedOutput,
                text,
                readinessOutputTailMaxLength,
            );
            stream.write(text);
        };

        childProcess.stdout?.on('data', (chunk: Buffer | string) => {
            observeChunk(chunk, process.stdout);
        });

        childProcess.stderr?.on('data', (chunk: Buffer | string) => {
            observeChunk(chunk, process.stderr);
        });

        childProcess.on('error', (error: Error) => {
            processError = error as ReadinessProcessError;
            capturedOutput = appendOutputTail(
                capturedOutput,
                `${error.stack ?? error.message}\n`,
                readinessOutputTailMaxLength,
            );
            settle(1);
        });

        childProcess.on('close', (code: number | null) => {
            settle(code ?? 1);
        });

        killTimer = setTimeout(() => {
            const timeoutError = Object.assign(
                new Error(
                    `Production browser readiness check timed out after ${timeoutMs}ms.`,
                ),
                {
                    code: 'ETIMEDOUT',
                },
            ) as ReadinessProcessError;

            processError = timeoutError;
            childProcess.kill('SIGTERM');

            setTimeout(() => {
                if (!settled) {
                    childProcess.kill('SIGKILL');
                }
            }, 5_000).unref();
        }, timeoutMs);
    });
    const processFailure = classifyReadinessProcessFailure({
        error: result.error,
        output: result.output,
    });

    if (processFailure) {
        return processFailure;
    }

    if (result.status === 0) {
        return {
            kind: 'success',
        };
    }

    const fatalFailureMessage = detectFatalReadinessFailureMessage(
        result.output,
    );

    if (fatalFailureMessage) {
        return {
            kind: 'fatal',
            message: fatalFailureMessage,
        };
    }

    return {
        kind: 'retry',
    };
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

        const checkResult = await runCheck(
            options.forwardedCliArgs,
            remainingCheckBudgetMs,
        );

        if (checkResult.kind === 'success') {
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
        } else if (checkResult.kind === 'retry') {
            stableChecks = 0;
            log(
                `Waiting for stable production browser readiness for ${formatForwardedCliArgs(options.forwardedCliArgs)}.`,
            );
        } else {
            fail(
                `Fatal production browser readiness failure for ${formatForwardedCliArgs(options.forwardedCliArgs)}. ${checkResult.message}`,
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
