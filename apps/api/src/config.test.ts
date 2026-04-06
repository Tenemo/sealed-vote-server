import { describe, expect, test } from 'vitest';

import { shouldUseDatabaseSsl } from './config';

describe('shouldUseDatabaseSsl', () => {
    test('disables SSL for the default local database URL', () => {
        expect(
            shouldUseDatabaseSsl(
                'postgres://postgres:postgres@localhost:5432/sv-db',
            ),
        ).toBe(false);
    });

    test('disables SSL for loopback database URLs', () => {
        expect(
            shouldUseDatabaseSsl(
                'postgres://postgres:postgres@127.0.0.1:5432/sv-db',
            ),
        ).toBe(false);
    });

    test('disables SSL for docker-network local database URLs', () => {
        expect(
            shouldUseDatabaseSsl(
                'postgres://postgres:postgres@postgres:5432/sv-db',
            ),
        ).toBe(false);
    });

    test('enables SSL for remote database URLs', () => {
        expect(
            shouldUseDatabaseSsl(
                'postgres://user:pass@db.example.com:5432/sv-db',
            ),
        ).toBe(true);
    });
});
