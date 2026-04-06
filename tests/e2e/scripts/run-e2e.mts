import { assertSafeE2EEnv, runPnpmSync } from './shared.mts';

process.env.NODE_ENV = 'test';

try {
    assertSafeE2EEnv();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : 'Unsafe e2e environment.',
    );
    process.exit(1);
}

const args = process.argv.slice(2);

runPnpmSync(['build']);
runPnpmSync(['exec', 'playwright', 'test', ...args]);
