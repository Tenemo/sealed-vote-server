import { runPnpmSync } from './shared.mts';

process.env.VITE_API_BASE_URL =
    process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000';

runPnpmSync([
    'exec',
    'turbo',
    'run',
    'build',
    '--force',
    '--filter=@sealed-vote/contracts',
    '--filter=@sealed-vote/protocol',
    '--filter=@sealed-vote/api',
    '--filter=@sealed-vote/web',
]);
