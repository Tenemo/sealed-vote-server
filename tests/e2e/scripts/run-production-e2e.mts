import { getForwardedCliArgs, runPnpmSync } from './shared.mts';

runPnpmSync([
    'exec',
    'playwright',
    'test',
    '--config',
    'playwright.production.config.ts',
    ...getForwardedCliArgs(),
]);
