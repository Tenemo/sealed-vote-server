import {
    assertSafeE2EEnv,
    getForwardedCliArgs,
    runPnpmSync,
} from './shared.mts';

process.env.NODE_ENV = 'test';
process.env.PLAYWRIGHT_USE_BUILT_SERVERS =
    process.env.PLAYWRIGHT_USE_BUILT_SERVERS ?? 'true';
process.env.VITE_API_BASE_URL =
    process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000';
process.env.VITE_POLLING_INTERVAL_MS =
    process.env.VITE_POLLING_INTERVAL_MS ?? '500';

try {
    assertSafeE2EEnv();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : 'Unsafe e2e environment.',
    );
    process.exit(1);
}

const args = getForwardedCliArgs();

runPnpmSync(['build']);
runPnpmSync([
    'exec',
    'playwright',
    'test',
    '--config',
    'tests/e2e/playwright.local.config.ts',
    ...args,
]);
