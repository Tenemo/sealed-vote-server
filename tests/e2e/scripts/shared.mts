import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);

const defaultDatabaseUrl = 'postgres://postgres:postgres@localhost:5432/sv-db';
const safeDatabaseHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const safeApiHosts = new Set(['localhost', '127.0.0.1', '::1']);
const requiredDatabaseName = 'sv-db';
const pnpmExecPath = process.env.npm_execpath;

export const repoRoot = path.resolve(currentDirectory, '../../..');
const apiWorkspaceRoot = path.resolve(repoRoot, 'apps', 'api');

const apiTsxCliPath = path.resolve(
    apiWorkspaceRoot,
    'node_modules',
    'tsx',
    'dist',
    'cli.mjs',
);

const fail = (message: string): never => {
    throw new Error(`Unsafe e2e environment: ${message}`);
};

const parseUrl = (value: string, label: string): URL => {
    try {
        return new URL(value);
    } catch {
        return fail(`${label} is not a valid URL.`);
    }
};

const validateDatabaseUrl = (): void => {
    const databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl;
    const parsedDatabaseUrl = parseUrl(databaseUrl, 'DATABASE_URL');
    const databaseName = parsedDatabaseUrl.pathname.replace(/^\/+/, '');

    if (!safeDatabaseHosts.has(parsedDatabaseUrl.hostname)) {
        fail(
            `DATABASE_URL host must be one of: ${Array.from(safeDatabaseHosts).join(', ')}.`,
        );
    }

    if (databaseName !== requiredDatabaseName) {
        fail(`DATABASE_URL database name must be ${requiredDatabaseName}.`);
    }
};

const validateApiBaseUrl = (): void => {
    const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim();

    if (!apiBaseUrl) {
        return;
    }

    const parsedApiBaseUrl = parseUrl(apiBaseUrl, 'VITE_API_BASE_URL');

    if (
        parsedApiBaseUrl.protocol !== 'http:' ||
        !safeApiHosts.has(parsedApiBaseUrl.hostname)
    ) {
        fail('VITE_API_BASE_URL must target a local HTTP origin for e2e runs.');
    }
};

const validateNodeEnv = (): void => {
    if ((process.env.NODE_ENV ?? '').trim().toLowerCase() !== 'test') {
        fail('NODE_ENV must be set to test.');
    }
};

const getPnpmCommand = (): [string, string[]] => {
    if (!pnpmExecPath) {
        console.error('Missing npm_execpath for pnpm execution.');
        process.exit(1);
    }

    return [process.execPath, [pnpmExecPath]];
};

const assertFileExists = (filePath: string, label: string): void => {
    if (!fs.existsSync(filePath)) {
        console.error(`Missing ${label} at ${filePath}.`);
        process.exit(1);
    }
};

export const assertSafeE2EEnv = (): void => {
    validateNodeEnv();
    validateDatabaseUrl();
    validateApiBaseUrl();
};

export const runPnpmSync = (args: string[]): void => {
    const [command, commandPrefix] = getPnpmCommand();
    const result = spawnSync(command, [...commandPrefix, ...args], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    });

    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

export const getForwardedCliArgs = (): string[] => {
    const args = process.argv.slice(2);

    if (args[0] === '--') {
        return args.slice(1);
    }

    return args;
};

export const runLocalE2E = ({
    build = true,
    forwardedCliArgs = getForwardedCliArgs(),
    turbo = false,
    useBuiltServers = true,
}: {
    build?: boolean;
    forwardedCliArgs?: string[];
    turbo?: boolean;
    useBuiltServers?: boolean;
} = {}): void => {
    process.env.NODE_ENV = 'test';

    if (turbo) {
        process.env.PLAYWRIGHT_LOCAL_TURBO = 'true';
    } else {
        delete process.env.PLAYWRIGHT_LOCAL_TURBO;
    }

    if (useBuiltServers) {
        process.env.PLAYWRIGHT_USE_BUILT_SERVERS = 'true';
    } else {
        delete process.env.PLAYWRIGHT_USE_BUILT_SERVERS;
    }

    process.env.VITE_API_BASE_URL =
        process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:4000';

    try {
        assertSafeE2EEnv();
    } catch (error) {
        console.error(
            error instanceof Error
                ? error.message
                : 'Unsafe e2e environment.',
        );
        process.exit(1);
    }

    if (build) {
        runPnpmSync(['build']);
    }

    runPnpmSync([
        'exec',
        'playwright',
        'test',
        '--config',
        'tests/config/playwright.local.config.mts',
        ...forwardedCliArgs,
    ]);
};

export const spawnPnpm = (args: string[]): ChildProcess => {
    const [command, commandPrefix] = getPnpmCommand();

    return spawn(command, [...commandPrefix, ...args], {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    });
};

export const runApiTsxSync = (args: string[]): void => {
    assertFileExists(apiTsxCliPath, 'tsx CLI');

    const result = spawnSync(process.execPath, [apiTsxCliPath, ...args], {
        cwd: apiWorkspaceRoot,
        env: process.env,
        stdio: 'inherit',
    });

    if (result.error) {
        console.error(result.error);
        process.exit(1);
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
};

export const spawnApiTsx = (args: string[]): ChildProcess => {
    assertFileExists(apiTsxCliPath, 'tsx CLI');

    return spawn(process.execPath, [apiTsxCliPath, ...args], {
        cwd: apiWorkspaceRoot,
        env: process.env,
        stdio: 'inherit',
    });
};

export const wireChildProcess = (childProcess: ChildProcess): void => {
    const forwardSignal = (signal: NodeJS.Signals): void => {
        childProcess.kill(signal);
    };

    process.on('SIGINT', forwardSignal);
    process.on('SIGTERM', forwardSignal);

    childProcess.on('error', (error: Error) => {
        console.error(error);
        process.exit(1);
    });

    childProcess.on('exit', (code: number | null) => {
        process.exit(code ?? 0);
    });
};
