const { spawn, spawnSync } = require('node:child_process');

const { assertSafeE2EEnv } = require('./assert-safe-e2e-env.cjs');

process.env.NODE_ENV = 'test';

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

try {
    assertSafeE2EEnv();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : 'Unsafe e2e environment.',
    );
    process.exit(1);
}

runSync('pnpm db:reset');

const backendProcess = spawn(
    'pnpm --filter @sealed-vote/api dev',
    {
        env: process.env,
        shell: true,
        stdio: 'inherit',
    },
);

const forwardSignal = (signal) => {
    backendProcess.kill(signal);
};

process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

backendProcess.on('exit', (code) => {
    process.exit(code ?? 0);
});
