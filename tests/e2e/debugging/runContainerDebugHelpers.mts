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
