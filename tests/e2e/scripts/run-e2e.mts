import {
    assertSafeE2EEnv,
    getForwardedCliArgs,
    runPnpmSync,
} from './shared.mts';

process.env.NODE_ENV = 'test';

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
runPnpmSync(['exec', 'playwright', 'test', ...args]);
