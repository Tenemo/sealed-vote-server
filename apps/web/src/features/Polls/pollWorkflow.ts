import type { PollResponse } from '@sealed-vote/contracts';

import type { StoredPollDeviceState } from './pollDeviceStorage';

import type { StoredVoterSession } from 'features/Polls/voterSessionStorage';

type ViewerWorkflowState =
    | 'anonymous-waiting-to-join'
    | 'joined-and-waiting-for-start'
    | 'preparing-device'
    | 'ready-to-vote'
    | 'vote-submitted-and-waiting'
    | 'ready-to-help-open-results'
    | 'waiting-for-results'
    | 'complete'
    | 'aborted';

type DerivedPollWorkflow = {
    canAct: boolean;
    currentStep: ViewerWorkflowState;
    hasSubmittedBallot: boolean;
    hasSubmittedDecryptionShare: boolean;
    isCreator: boolean;
    missingLocalState: boolean;
};

const hasAcceptedMessage = (
    poll: PollResponse,
    participantIndex: number,
    messageType: PollResponse['boardEntries'][number]['messageType'],
): boolean =>
    poll.boardEntries.some(
        (entry) =>
            entry.classification === 'accepted' &&
            entry.participantIndex === participantIndex &&
            entry.messageType === messageType,
    );

export const derivePollWorkflow = ({
    creatorSessionPollId,
    deviceState,
    poll,
    voterSession,
}: {
    creatorSessionPollId: string | null;
    deviceState: StoredPollDeviceState | null;
    poll: PollResponse;
    voterSession: StoredVoterSession | null;
}): DerivedPollWorkflow => {
    const isCreator = creatorSessionPollId === poll.id;

    if (poll.phase === 'aborted') {
        return {
            canAct: false,
            currentStep: 'aborted',
            hasSubmittedBallot: false,
            hasSubmittedDecryptionShare: false,
            isCreator,
            missingLocalState: false,
        };
    }

    if (poll.phase === 'complete') {
        return {
            canAct: false,
            currentStep: 'complete',
            hasSubmittedBallot: false,
            hasSubmittedDecryptionShare: false,
            isCreator,
            missingLocalState: false,
        };
    }

    if (!voterSession) {
        return {
            canAct: false,
            currentStep: 'anonymous-waiting-to-join',
            hasSubmittedBallot: false,
            hasSubmittedDecryptionShare: false,
            isCreator,
            missingLocalState: false,
        };
    }

    const participantIndex = voterSession.voterIndex;
    const hasSubmittedBallot = hasAcceptedMessage(
        poll,
        participantIndex,
        'ballot-submission',
    );
    const hasSubmittedDecryptionShare = hasAcceptedMessage(
        poll,
        participantIndex,
        'decryption-share',
    );
    const missingLocalState = deviceState === null;

    if (poll.phase === 'open') {
        return {
            canAct: false,
            currentStep: 'joined-and-waiting-for-start',
            hasSubmittedBallot,
            hasSubmittedDecryptionShare,
            isCreator,
            missingLocalState,
        };
    }

    if (poll.phase === 'preparing') {
        return {
            canAct: !missingLocalState,
            currentStep: 'preparing-device',
            hasSubmittedBallot,
            hasSubmittedDecryptionShare,
            isCreator,
            missingLocalState,
        };
    }

    if (poll.phase === 'voting') {
        return {
            canAct: !missingLocalState && !hasSubmittedBallot,
            currentStep: hasSubmittedBallot
                ? 'vote-submitted-and-waiting'
                : 'ready-to-vote',
            hasSubmittedBallot,
            hasSubmittedDecryptionShare,
            isCreator,
            missingLocalState,
        };
    }

    return {
        canAct: !missingLocalState && !hasSubmittedDecryptionShare,
        currentStep: hasSubmittedDecryptionShare
            ? 'waiting-for-results'
            : 'ready-to-help-open-results',
        hasSubmittedBallot,
        hasSubmittedDecryptionShare,
        isCreator,
        missingLocalState,
    };
};

export type { DerivedPollWorkflow, ViewerWorkflowState };
