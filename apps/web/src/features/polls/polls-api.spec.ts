import { POLL_ROUTES } from '@sealed-vote/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildFetchPollQuery, pollQueryTimeoutMs } from './polls-api';

describe('pollsApi', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the poll fetch timeout low enough for stalled polling to recover', () => {
        expect(pollQueryTimeoutMs).toBe(10_000);
    });

    it.each(['fruit--1234', 'poll-ABC123'])(
        'buildFetchPollQuery uses POLL_ROUTES.fetchPoll for %s',
        (pollReference) => {
            const fetchPollRouteSpy = vi.spyOn(POLL_ROUTES, 'fetchPoll');

            const query = buildFetchPollQuery(pollReference);

            expect(fetchPollRouteSpy).toHaveBeenCalledOnce();
            expect(fetchPollRouteSpy).toHaveBeenCalledWith(pollReference);
            expect(query).toEqual({
                method: 'GET',
                timeout: pollQueryTimeoutMs,
                url: `/api/polls/${pollReference}`,
            });
        },
    );
});
