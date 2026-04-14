import { getForwardedCliArgs, runPnpmSync } from './shared.mts';

runPnpmSync([
    'exec',
    'playwright',
    'test',
    '--config',
    'tests/config/playwright.production.config.mts',
    ...getForwardedCliArgs(),
]);
