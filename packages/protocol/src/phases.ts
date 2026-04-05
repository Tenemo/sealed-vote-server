import type { PollResponse } from '@sealed-vote/contracts';

export type PollPhase =
    | 'registration'
    | 'key-generation'
    | 'voting'
    | 'tallying'
    | 'decryption'
    | 'complete';

export type PollPhaseState = {
    isOpen: boolean;
    commonPublicKey: string | null;
    voterCount: number;
    encryptedVoteCount: number;
    encryptedTallyCount: number;
    resultCount: number;
};

type PollPhaseInput =
    | PollPhaseState
    | Pick<
          PollResponse,
          | 'isOpen'
          | 'commonPublicKey'
          | 'voters'
          | 'encryptedVotes'
          | 'encryptedTallies'
          | 'results'
      >;

export const toPollPhaseState = (
    poll: Pick<
        PollResponse,
        | 'isOpen'
        | 'commonPublicKey'
        | 'voters'
        | 'encryptedVotes'
        | 'encryptedTallies'
        | 'results'
    >,
): PollPhaseState => ({
    isOpen: poll.isOpen,
    commonPublicKey: poll.commonPublicKey,
    voterCount: poll.voters.length,
    encryptedVoteCount: poll.encryptedVotes.length,
    encryptedTallyCount: poll.encryptedTallies.length,
    resultCount: poll.results.length,
});

const normalizePollPhaseState = (poll: PollPhaseInput): PollPhaseState =>
    'voterCount' in poll ? poll : toPollPhaseState(poll);

export const derivePollPhase = (poll: PollPhaseInput): PollPhase => {
    const state = normalizePollPhaseState(poll);

    if (state.isOpen) {
        return 'registration';
    }

    if (!state.commonPublicKey) {
        return 'key-generation';
    }

    if (state.resultCount > 0) {
        return 'complete';
    }

    if (state.encryptedTallyCount > 0) {
        return 'decryption';
    }

    if (
        state.encryptedVoteCount > 0 &&
        state.encryptedVoteCount >= state.voterCount
    ) {
        return 'tallying';
    }

    return 'voting';
};

export const canRegister = (poll: PollPhaseInput): boolean =>
    derivePollPhase(poll) === 'registration';

export const canClose = (poll: PollPhaseInput): boolean => {
    const state = normalizePollPhaseState(poll);
    return state.isOpen && state.voterCount > 1;
};

export const canSubmitPublicKeyShare = (poll: PollPhaseInput): boolean =>
    derivePollPhase(poll) === 'key-generation';

export const canVote = (poll: PollPhaseInput): boolean =>
    derivePollPhase(poll) === 'voting';

export const canSubmitDecryptionShares = (poll: PollPhaseInput): boolean =>
    derivePollPhase(poll) === 'decryption';
