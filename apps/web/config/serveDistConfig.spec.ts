import { describe, expect, test } from 'vitest';

import { distDirectory, resolveServeDistOptions } from './serveDistConfig';

describe('resolveServeDistOptions', () => {
    test('uses defaults when no overrides are provided', () => {
        expect(resolveServeDistOptions([], {})).toEqual({
            distDirectory,
            host: '0.0.0.0',
            port: 3000,
        });
    });

    test('uses PORT from the environment', () => {
        expect(resolveServeDistOptions([], { PORT: '4123' })).toEqual({
            distDirectory,
            host: '0.0.0.0',
            port: 4123,
        });
    });

    test('lets CLI arguments override the environment', () => {
        expect(
            resolveServeDistOptions(['--host', '127.0.0.1', '--port', '3999'], {
                PORT: '4123',
            }),
        ).toEqual({
            distDirectory,
            host: '127.0.0.1',
            port: 3999,
        });
    });

    test('rejects non-numeric ports', () => {
        expect(() =>
            resolveServeDistOptions(['--port', '3000abc'], {}),
        ).toThrowError('PORT must be a valid integer.');
    });

    test('rejects ports outside the valid range', () => {
        expect(() => resolveServeDistOptions(['--port', '70000'], {})).toThrow(
            'PORT must be between 1 and 65535.',
        );
    });
});
