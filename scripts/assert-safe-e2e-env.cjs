const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/sv-db';
const SAFE_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
const SAFE_API_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REQUIRED_DATABASE_NAME = 'sv-db';

const fail = (message) => {
    throw new Error(`Unsafe e2e environment: ${message}`);
};

const parseUrl = (value, label) => {
    try {
        return new URL(value);
    } catch {
        fail(`${label} is not a valid URL.`);
    }
};

const validateDatabaseUrl = () => {
    const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
    const parsedDatabaseUrl = parseUrl(databaseUrl, 'DATABASE_URL');
    const databaseName = parsedDatabaseUrl.pathname.replace(/^\/+/, '');

    if (!SAFE_DATABASE_HOSTS.has(parsedDatabaseUrl.hostname)) {
        fail(
            `DATABASE_URL host must be one of: ${Array.from(SAFE_DATABASE_HOSTS).join(', ')}.`,
        );
    }

    if (databaseName !== REQUIRED_DATABASE_NAME) {
        fail(`DATABASE_URL database name must be ${REQUIRED_DATABASE_NAME}.`);
    }
};

const validateApiBaseUrl = () => {
    const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim();
    if (!apiBaseUrl) {
        return;
    }

    const parsedApiBaseUrl = parseUrl(apiBaseUrl, 'VITE_API_BASE_URL');
    if (
        parsedApiBaseUrl.protocol !== 'http:' ||
        !SAFE_API_HOSTS.has(parsedApiBaseUrl.hostname)
    ) {
        fail('VITE_API_BASE_URL must target a local HTTP origin for e2e runs.');
    }
};

const validateNodeEnv = () => {
    if ((process.env.NODE_ENV ?? '').trim().toLowerCase() !== 'test') {
        fail('NODE_ENV must be set to test.');
    }
};

const assertSafeE2EEnv = () => {
    validateNodeEnv();
    validateDatabaseUrl();
    validateApiBaseUrl();
};

if (require.main === module) {
    try {
        assertSafeE2EEnv();
    } catch (error) {
        console.error(
            error instanceof Error ? error.message : 'Unsafe e2e environment.',
        );
        process.exit(1);
    }
}

module.exports = {
    assertSafeE2EEnv,
};
