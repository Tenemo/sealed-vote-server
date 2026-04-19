import { describe, expect, test } from 'vitest';
import { POLL_ROUTES } from '@sealed-vote/contracts';

import { buildFetchPollQuery, pollQueryTimeoutMs } from './polls-api';

describe('pollsApi', () => {
    test('sets a timeout for poll fetches so polling can recover from wedged requests', () => {
        expect(pollQueryTimeoutMs).toBe(10_000);
        expect(buildFetchPollQuery('fruit--1234')).toEqual({
            method: 'GET',
            timeout: pollQueryTimeoutMs,
            url: POLL_ROUTES.fetchPoll('fruit--1234'),
        });
    });
});
