import { runLocalE2E } from './shared.mts';

const cliArgs = process.argv.slice(2);
const firstArg = cliArgs[0];
const normalizeForwardedCliArgs = (args: string[]): string[] =>
    args[0] === '--' ? args.slice(1) : args;
const mode =
    firstArg === 'ci' || firstArg === 'local' || firstArg === 'turbo'
        ? firstArg
        : 'local';
const forwardedCliArgs =
    mode === 'local'
        ? normalizeForwardedCliArgs(cliArgs)
        : normalizeForwardedCliArgs(cliArgs.slice(1));

runLocalE2E({
    build: mode !== 'ci',
    forwardedCliArgs,
    turbo: mode === 'turbo',
    useBuiltServers: true,
});
