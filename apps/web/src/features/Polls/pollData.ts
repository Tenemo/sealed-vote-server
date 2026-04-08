import type { PollResponse } from '@sealed-vote/contracts';

export const normalizePollResponse = (
    poll: PollResponse | null | undefined,
): PollResponse | null => poll ?? null;

export const hasPublishedResults = (
    poll: Pick<PollResponse, 'resultScores'> | null | undefined,
): boolean => Array.isArray(poll?.resultScores) && poll.resultScores.length > 0;
