import {
    type PublishedResultVerification,
    verifyPublishedResults,
} from '@sealed-vote/protocol';

import {
    hasPublishedResults,
    normalizePollResponse,
} from 'features/Polls/pollData';
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
    poll.choices
        .map((choiceName, index) => ({
            choiceName,
            score: poll.resultScores[index] ?? 0,
        }))
        .sort((left, right) => right.score - left.score)
        .map(({ choiceName, score }) => ({
            choiceName,
            scoreLabel: score.toFixed(2),
        }));

export const buildVoteResultsViewModel = (
    poll: PollResponse,
): VoteResultsViewModel | null => {
    const normalizedPoll = normalizePollResponse(poll) ?? poll;

    if (!hasPublishedResults(normalizedPoll)) {
        return null;
    }

    try {
        return {
            results: buildResultEntries(normalizedPoll),
            verification: verifyPublishedResults({
                encryptedTallies: normalizedPoll.encryptedTallies,
                publishedDecryptionShares:
                    normalizedPoll.publishedDecryptionShares,
                resultTallies: normalizedPoll.resultTallies,
                resultScores: normalizedPoll.resultScores,
                voterCount: normalizedPoll.voters.length,
            }),
            verificationError: null,
        };
    } catch (verificationError) {
        return {
            results: buildResultEntries(normalizedPoll),
            verification: null,
            verificationError,
        };
    }
};
