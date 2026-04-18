import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
    assertSafeE2EEnv,
    repoRoot,
    runApiTsxSync,
    wireChildProcess,
} from './shared.mts';

const builtServerPath = path.resolve(
    repoRoot,
    'apps',
    'api',
    'dist',
    'server.js',
);

process.env.NODE_ENV = 'test';

try {
    assertSafeE2EEnv();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : 'Unsafe e2e environment.',
    );
    process.exit(1);
}

if (!fs.existsSync(builtServerPath)) {
    console.error(
        `Missing built API artifact at ${builtServerPath}. Run pnpm e2e:ci:build first.`,
    );
    process.exit(1);
}

    runApiTsxSync(['scripts/database.ts', 'reset']);

wireChildProcess(
    spawn(process.execPath, [builtServerPath], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    }),
);
