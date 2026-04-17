import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { repoRoot } from '../scripts/shared.mts';
import {
    buildDebugContainerCommand,
    parseDebugContainerCliArgs,
} from './runContainerDebugHelpers.mts';

const composeFilePath = path.resolve(
    repoRoot,
    'tests/e2e/debugging/docker-compose.yml',
);

const { forwardedArgs, mode } = parseDebugContainerCliArgs(process.argv.slice(2));
const debugCommand = buildDebugContainerCommand({
    forwardedArgs,
    mode,
});

const result = spawnSync(
    'docker',
    [
        'compose',
        '-f',
        composeFilePath,
        'run',
        '--rm',
        'playwright-debug',
        ...debugCommand,
    ],
    {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    },
);

if (result.error) {
    console.error(result.error);
    process.exit(1);
}

process.exit(result.status ?? 1);
