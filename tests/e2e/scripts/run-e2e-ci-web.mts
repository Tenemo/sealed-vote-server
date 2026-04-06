import fs from 'node:fs';
import path from 'node:path';

import {
    assertSafeE2EEnv,
    repoRoot,
    spawnPnpm,
    wireChildProcess,
} from './shared.mts';

const builtIndexPath = path.resolve(
    repoRoot,
    'apps',
    'web',
    'dist',
    'index.html',
);

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

try {
    assertSafeE2EEnv();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : 'Unsafe e2e environment.',
    );
    process.exit(1);
}

if (!fs.existsSync(builtIndexPath)) {
    console.error(
        `Missing built web artifact at ${builtIndexPath}. Run pnpm e2e:ci:build first.`,
    );
    process.exit(1);
}

wireChildProcess(
    spawnPnpm([
        '--filter',
        '@sealed-vote/web',
        'run',
        'serve:dist',
        '--',
        '--host',
        '127.0.0.1',
        '--port',
        '3000',
    ]),
);
