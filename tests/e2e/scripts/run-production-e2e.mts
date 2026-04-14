import { getForwardedCliArgs, runPnpmSync } from './shared.mts';

runPnpmSync([
    'exec',
    'playwright',
    'test',
    '--config',
    'tests/e2e/playwright.production.config.ts',
    ...getForwardedCliArgs(),
]);
