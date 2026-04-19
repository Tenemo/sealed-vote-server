import type { PollResponse } from '@sealed-vote/contracts';

import type { StoredPollDeviceState } from './poll-device-storage';
import type { StoredVoterSession } from './poll-session-storage';

export type ViewerWorkflowState =
    | 'anonymous-ready-to-vote'
    | 'submitting-vote'
    | 'vote-stored-waiting-for-close'
    | 'creator-must-submit-first'
    | 'creator-can-close'
    | 'securing-auto'
    | 'automation-retry-required'
    | 'securing-waiting'
    | 'revealing-auto'
    | 'revealing-waiting'
    | 'waiting-for-results'
    | 'skipped'
    | 'local-vote-missing'
    | 'complete'
    | 'aborted';

export type DerivedPollWorkflow = {
    canCloseVoting: boolean;
    canRetryAutomation: boolean;
    canSubmitVote: boolean;
    currentStep: ViewerWorkflowState;
    hasLocalVote: boolean;
    hasSubmittedVote: boolean;
    isCreator: boolean;
    missingLocalState: boolean;
};

const isLocalVoter = (
    deviceState: StoredPollDeviceState | null,
    voterSession: StoredVoterSession | null,
): boolean =>
    !!deviceState &&
    !!voterSession &&
    deviceState.pollId === voterSession.pollId &&
    deviceState.voterIndex === voterSession.voterIndex;

export const derivePollWorkflow = ({
    creatorSessionPollId,
    deviceState,
    hasAutomaticCeremonyAction,
    hasAutomationFailure,
    isSubmittingVote,
    poll,
    voterSession,
}: {
    creatorSessionPollId: string | null;
    deviceState: StoredPollDeviceState | null;
    hasAutomaticCeremonyAction: boolean;
    hasAutomationFailure: boolean;
    isSubmittingVote: boolean;
    poll: PollResponse;
    voterSession: StoredVoterSession | null;
}): DerivedPollWorkflow => {
    const isCreator = creatorSessionPollId === poll.id;
    const localVoter = isLocalVoter(deviceState, voterSession);
    const storedBallotScores = deviceState?.storedBallotScores ?? null;
    const hasSubmittedVote = localVoter;
    const hasLocalVote =
        localVoter &&
        Array.isArray(storedBallotScores) &&
        storedBallotScores.length === poll.choices.length;
    const missingRecoverableLocalVote = localVoter && !hasLocalVote;
    const missingLocalState = !!voterSession && !localVoter;
    const localCeremonyState = voterSession
        ? (poll.voters.find(
              (participant) =>
                  participant.voterIndex === voterSession.voterIndex,
          )?.ceremonyState ?? null)
        : null;
    const creatorHasLocalVoter =
        isCreator && localVoter && deviceState?.isCreatorParticipant === true;

    if (poll.phase === 'open') {
        if (missingLocalState) {
            return {
                canCloseVoting: false,
                canRetryAutomation: false,
                canSubmitVote: false,
                currentStep: 'local-vote-missing',
                hasLocalVote: false,
                hasSubmittedVote,
                isCreator,
                missingLocalState: true,
            };
        }

        if (!localVoter) {
            return {
                canCloseVoting: false,
                canRetryAutomation: false,
                canSubmitVote: !isSubmittingVote,
                currentStep: isSubmittingVote
                    ? 'submitting-vote'
                    : isCreator
                      ? 'creator-must-submit-first'
                      : 'anonymous-ready-to-vote',
                hasLocalVote: false,
                hasSubmittedVote: false,
                isCreator,
                missingLocalState: false,
            };
        }

        if (missingRecoverableLocalVote) {
            return {
                canCloseVoting: false,
                canRetryAutomation: false,
                canSubmitVote: false,
                currentStep: 'local-vote-missing',
                hasLocalVote: false,
                hasSubmittedVote,
                isCreator,
                missingLocalState: true,
            };
        }

        return {
            canCloseVoting:
                creatorHasLocalVoter &&
                poll.submittedVoterCount >= poll.minimumCloseVoterCount,
            canRetryAutomation: false,
            canSubmitVote: false,
            currentStep:
                creatorHasLocalVoter &&
                poll.submittedVoterCount >= poll.minimumCloseVoterCount
                    ? 'creator-can-close'
                    : 'vote-stored-waiting-for-close',
            hasLocalVote,
            hasSubmittedVote,
            isCreator,
            missingLocalState: false,
        };
    }

    if (localCeremonyState === 'skipped') {
        return {
            canCloseVoting: false,
            canRetryAutomation: false,
            canSubmitVote: false,
            currentStep: 'skipped',
            hasLocalVote,
            hasSubmittedVote,
            isCreator,
            missingLocalState: false,
        };
    }

    if (poll.phase === 'aborted') {
        return {
            canCloseVoting: false,
            canRetryAutomation: false,
            canSubmitVote: false,
            currentStep: 'aborted',
            hasLocalVote,
            hasSubmittedVote,
            isCreator,
            missingLocalState: false,
        };
    }

    if (poll.phase === 'complete') {
        return {
            canCloseVoting: false,
            canRetryAutomation: false,
            canSubmitVote: false,
            currentStep: 'complete',
            hasLocalVote,
            hasSubmittedVote,
            isCreator,
            missingLocalState: false,
        };
    }

    if (missingLocalState) {
        return {
            canCloseVoting: false,
            canRetryAutomation: false,
            canSubmitVote: false,
            currentStep: 'local-vote-missing',
            hasLocalVote: false,
            hasSubmittedVote,
            isCreator,
            missingLocalState: true,
        };
    }

    if (poll.phase === 'securing') {
        const currentStep = hasAutomationFailure
            ? 'automation-retry-required'
            : hasAutomaticCeremonyAction
              ? 'securing-auto'
              : 'securing-waiting';

        return {
            canCloseVoting: false,
            canRetryAutomation: hasAutomationFailure,
            canSubmitVote: false,
            currentStep,
            hasLocalVote,
            hasSubmittedVote,
            isCreator,
            missingLocalState: false,
        };
    }

    if (poll.phase === 'ready-to-reveal') {
        return {
            canCloseVoting: false,
            canRetryAutomation: hasAutomationFailure,
            canSubmitVote: false,
            currentStep: hasAutomationFailure
                ? 'automation-retry-required'
                : hasAutomaticCeremonyAction
                  ? 'revealing-auto'
                  : 'waiting-for-results',
            hasLocalVote,
            hasSubmittedVote,
            isCreator,
            missingLocalState: false,
        };
    }

    const currentStep = hasAutomationFailure
        ? 'automation-retry-required'
        : hasAutomaticCeremonyAction
          ? 'revealing-auto'
          : 'revealing-waiting';

    return {
        canCloseVoting: false,
        canRetryAutomation: hasAutomationFailure,
        canSubmitVote: false,
        currentStep,
        hasLocalVote,
        hasSubmittedVote,
        isCreator,
        missingLocalState: false,
    };
};
