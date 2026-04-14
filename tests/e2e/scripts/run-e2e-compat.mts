import { getForwardedCliArgs, runPnpmSync } from './shared.mts';

runPnpmSync([
    'exec',
    'playwright',
    'test',
    '--config',
    'tests/config/playwright.compat.config.mts',
    ...getForwardedCliArgs(),
]);
