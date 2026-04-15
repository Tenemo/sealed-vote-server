import { getForwardedCliArgs, runPnpmSync } from './shared.mts';

const cliArgs = process.argv.slice(2);
const firstArg = cliArgs[0];
const normalizeForwardedCliArgs = (args: string[]): string[] =>
    args[0] === '--' ? args.slice(1) : args;
const mode = firstArg === 'production' ? 'production' : 'compat';
const forwardedCliArgs =
    firstArg === 'compat' || firstArg === 'production'
        ? normalizeForwardedCliArgs(cliArgs.slice(1))
        : getForwardedCliArgs();
const configPath =
    mode === 'production'
        ? 'tests/config/playwright.production.config.mts'
        : 'tests/config/playwright.compat.config.mts';

runPnpmSync([
    'exec',
    'playwright',
    'test',
    '--config',
    configPath,
    ...forwardedCliArgs,
]);
