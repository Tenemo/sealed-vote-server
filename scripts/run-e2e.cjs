const { spawnSync } = require('node:child_process');

const { assertSafeE2EEnv } = require('./assert-safe-e2e-env.cjs');

process.env.NODE_ENV = 'test';

try {
    assertSafeE2EEnv();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : 'Unsafe e2e environment.',
    );
    process.exit(1);
}

const runSync = (command) => {
    const result = spawnSync(command, {
        env: process.env,
        shell: true,
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

runSync('pnpm build');
runSync('pnpm exec playwright test');
