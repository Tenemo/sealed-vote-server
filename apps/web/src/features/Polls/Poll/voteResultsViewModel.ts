import {
    type PublishedResultVerification,
    verifyPublishedResults,
} from '@sealed-vote/protocol';

import {
    hasPublishedResults,
    orderPublishedPollResults,
} from 'features/Polls/pollResults';
import { type PollResponse } from 'features/Polls/pollsApi';

type VoteResultEntry = {
    choiceName: string;
    scoreLabel: string;
};

type VoteResultsViewModel = {
    results: VoteResultEntry[];
    verification: PublishedResultVerification | null;
    verificationError: unknown;
};

const buildResultEntries = (poll: PollResponse): VoteResultEntry[] =>
    orderPublishedPollResults(poll).map(({ choiceName, score }) => ({
        choiceName,
        scoreLabel: score.toFixed(2),
    }));

export const buildVoteResultsViewModel = (
    poll: PollResponse,
): VoteResultsViewModel | null => {
    if (!hasPublishedResults(poll)) {
        return null;
    }

    try {
        return {
            results: buildResultEntries(poll),
            verification: verifyPublishedResults({
                encryptedTallies: poll.encryptedTallies,
                publishedDecryptionShares: poll.publishedDecryptionShares,
                resultTallies: poll.resultTallies,
                resultScores: poll.resultScores,
                voterCount: poll.voters.length,
            }),
            verificationError: null,
        };
    } catch (verificationError) {
        return {
            results: buildResultEntries(poll),
            verification: null,
            verificationError,
        };
    }
};
