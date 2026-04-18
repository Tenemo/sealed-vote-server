import { connectionLostMessage, renderError } from './network-errors';

describe('renderError', () => {
    it('renders connection errors as a stable reconnect message', () => {
        expect(
            renderError({
                error: 'TypeError: Failed to fetch',
                status: 'FETCH_ERROR',
            }),
        ).toBe(connectionLostMessage);
    });

    it('renders message payloads when the api returns a structured error body', () => {
        expect(
            renderError({
                data: {
                    message: 'Poll is closed.',
                },
                status: 400,
            }),
        ).toBe('Poll is closed.');
    });

    it('does not crash when RTK Query exposes a null error payload', () => {
        expect(
            renderError({
                data: null,
                status: 500,
            }),
        ).toBe('An unknown error occurred.');
    });

    it('treats upstream proxy failures as connection errors', () => {
        expect(
            renderError({
                data: '',
                status: 502,
            }),
        ).toBe(connectionLostMessage);
    });
});
