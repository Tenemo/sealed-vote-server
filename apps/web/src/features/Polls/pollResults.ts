import type { PollResponse } from '@sealed-vote/contracts';

import {
    hasPublishedResultScores,
    orderPublishedPollResults,
    type OrderedPublishedPollResult,
} from '../../../config/pollResults.mts';

export {
    hasPublishedResultScores,
    orderPublishedPollResults,
    type OrderedPublishedPollResult,
};

export const hasPublishedResults = (
    poll: Pick<PollResponse, 'resultScores'> | null | undefined,
): boolean => hasPublishedResultScores(poll?.resultScores);
