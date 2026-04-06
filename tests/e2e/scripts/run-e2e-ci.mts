import { assertSafeE2EEnv, runPnpmSync } from './shared.mts';

process.env.NODE_ENV = 'test';
process.env.PLAYWRIGHT_USE_BUILT_SERVERS = 'true';

try {
    assertSafeE2EEnv();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : 'Unsafe e2e environment.',
    );
    process.exit(1);
}

runPnpmSync(['exec', 'playwright', 'test', ...process.argv.slice(2)]);
