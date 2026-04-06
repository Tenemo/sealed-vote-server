import { afterEach, describe, expect, test } from 'vitest';

import { shouldUseDatabaseSsl } from './config';

const originalDatabaseSsl = process.env.DATABASE_SSL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
    if (originalDatabaseSsl === undefined) {
        delete process.env.DATABASE_SSL;
    } else {
        process.env.DATABASE_SSL = originalDatabaseSsl;
    }

    if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
    } else {
        process.env.NODE_ENV = originalNodeEnv;
    }
});

describe('shouldUseDatabaseSsl', () => {
    test('respects an explicit DATABASE_SSL=true override', () => {
        process.env.DATABASE_SSL = 'true';
        process.env.NODE_ENV = 'development';

        expect(
            shouldUseDatabaseSsl(
                'postgres://postgres:postgres@localhost:5432/sv-db',
            ),
        ).toBe(true);
    });

    test('respects an explicit DATABASE_SSL=false override', () => {
        process.env.DATABASE_SSL = 'false';
        process.env.NODE_ENV = 'production';

        expect(
            shouldUseDatabaseSsl(
                'postgres://user:pass@db.example.com:5432/sv-db',
            ),
        ).toBe(false);
    });

    test('defaults to disabled SSL for local development in auto mode', () => {
        process.env.DATABASE_SSL = 'auto';
        process.env.NODE_ENV = 'development';

        expect(
            shouldUseDatabaseSsl(
                'postgres://postgres:postgres@localhost:5432/sv-db',
            ),
        ).toBe(false);
    });

    test('defaults to enabled SSL for configured production databases in auto mode', () => {
        process.env.DATABASE_SSL = 'auto';
        process.env.NODE_ENV = 'production';

        expect(
            shouldUseDatabaseSsl(
                'postgres://user:pass@db.example.com:5432/sv-db',
            ),
        ).toBe(true);
    });

    test('rejects invalid DATABASE_SSL values', () => {
        process.env.DATABASE_SSL = 'sometimes';

        expect(() =>
            shouldUseDatabaseSsl(
                'postgres://user:pass@db.example.com:5432/sv-db',
            ),
        ).toThrow('DATABASE_SSL must be one of: auto, true, false.');
    });
});
