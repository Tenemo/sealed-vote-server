import {
    assertSafeE2EEnv,
    runApiTsxSync,
    spawnApiTsx,
    wireChildProcess,
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

runApiTsxSync(['scripts/db.ts', 'reset']);

wireChildProcess(spawnApiTsx(['src/server.ts']));
