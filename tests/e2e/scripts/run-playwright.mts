import { collectListedSpecFiles } from './runPlaywrightHelpers.mts';
import {
    getForwardedCliArgs,
    runPnpmCaptureSync,
    runPnpmSync,
} from './shared.mts';

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

    for (const listedFile of listedFiles) {
        console.log(`Running production Playwright file in isolation: ${listedFile}`);
        runPnpmSync([
            'exec',
            'playwright',
            'test',
            '--config',
            configPath,
            listedFile,
            ...forwardedCliArgs,
        ]);
    }
}
