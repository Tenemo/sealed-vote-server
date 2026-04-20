import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryRoot } from '../scripts/shared.mts';

export type DebugContainerMode = 'command' | 'production' | 'shell';

const supportedModes = new Set<DebugContainerMode>([
    'command',
    'production',
    'shell',
]);

export const defaultProductionDebugArgs = ['--project', 'firefox-desktop'];

const stripLeadingSeparator = (args: readonly string[]): string[] =>
    args[0] === '--' ? [...args.slice(1)] : [...args];

export const parseDebugContainerCliArgs = (
    cliArgs: readonly string[],
): {
    forwardedArgs: string[];
    mode: DebugContainerMode;
} => {
    const [firstArg, ...rest] = cliArgs;

    if (!firstArg) {
        return {
            forwardedArgs: [],
            mode: 'production',
        };
    }

    if (!supportedModes.has(firstArg as DebugContainerMode)) {
        throw new Error(
            `Unsupported e2e debug mode "${firstArg}". Expected one of: ${[...supportedModes].join(', ')}.`,
        );
    }

    return {
        forwardedArgs: stripLeadingSeparator(rest),
        mode: firstArg as DebugContainerMode,
    };
};

export const buildDebugContainerCommand = ({
    forwardedArgs,
    mode,
}: {
    forwardedArgs: readonly string[];
    mode: DebugContainerMode;
}): string[] => {
    switch (mode) {
        case 'production':
            return [
                'pnpm',
                'e2e:production:test',
                '--',
                ...(forwardedArgs.length > 0
                    ? forwardedArgs
                    : defaultProductionDebugArgs),
            ];
        case 'shell':
            return ['bash'];
        case 'command':
            if (forwardedArgs.length === 0) {
                throw new Error(
                    'The command mode requires a command after "--".',
                );
            }

            return [...forwardedArgs];
    }
};

const composeFilePath = path.resolve(
    repositoryRoot,
    'tests/e2e/debugging/docker-compose.yml',
);
const currentFilePath = fileURLToPath(import.meta.url);

const shouldRunAsCli = (): boolean => {
    const rawEntryPoint = process.argv[1];

    if (!rawEntryPoint) {
        return false;
    }

    return path.resolve(rawEntryPoint) === currentFilePath;
};

if (shouldRunAsCli()) {
    const { forwardedArgs, mode } = parseDebugContainerCliArgs(
        process.argv.slice(2),
    );
    const debugCommand = buildDebugContainerCommand({
        forwardedArgs,
        mode,
    });
    const result = spawnSync(
        'docker',
        [
            'compose',
            '-f',
            composeFilePath,
            'run',
            '--rm',
            'playwright-debug',
            ...debugCommand,
        ],
        {
            cwd: repositoryRoot,
            env: process.env,
            stdio: 'inherit',
        },
    );

    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }

    process.exit(result.status ?? 1);
}
