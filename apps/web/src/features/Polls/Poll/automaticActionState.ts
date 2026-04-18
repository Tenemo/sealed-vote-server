import { ERROR_MESSAGES, type PollResponse } from '@sealed-vote/contracts';

import type { PreparedCeremonyAction } from '../pollBoardActions';
import type { StoredPollDeviceState } from '../pollDeviceStorage';
import type { StoredVoterSession } from '../pollSessionStorage';

export type RecoverableAutomaticActionRetryState = {
    actionKey: string | null;
    attemptCount: number;
};

export const createEmptyRecoverableAutomaticActionRetryState =
    (): RecoverableAutomaticActionRetryState => ({
        actionKey: null,
        attemptCount: 0,
    });

const findRosterEntryForDevice = ({
    deviceState,
    poll,
}: {
    deviceState: StoredPollDeviceState | null;
    poll: PollResponse | undefined;
}): PollResponse['rosterEntries'][number] | null => {
    if (!deviceState || !poll) {
        return null;
    }

    return (
        poll.rosterEntries.find(
            (entry) =>
                entry.authPublicKey === deviceState.authPublicKey &&
                entry.transportPublicKey === deviceState.transportPublicKey &&
                entry.transportSuite === deviceState.transportSuite,
        ) ?? null
    );
};

export const getLocalCeremonyState = ({
    poll,
    voterSession,
}: {
    poll: PollResponse | undefined;
    voterSession: StoredVoterSession | null;
}): PollResponse['voters'][number]['ceremonyState'] | null => {
    if (!poll || !voterSession) {
        return null;
    }

    return (
        poll.voters.find(
            (participant) => participant.voterIndex === voterSession.voterIndex,
        )?.ceremonyState ?? null
    );
};

export const isPreparedAutomaticActionCurrent = ({
    action,
    deviceState,
    poll,
    voterSession,
}: {
    action: PreparedCeremonyAction | null;
    deviceState: StoredPollDeviceState | null;
    poll: PollResponse | undefined;
    voterSession: StoredVoterSession | null;
}): boolean => {
    if (
        !action ||
        !poll ||
        !deviceState ||
        !voterSession ||
        !poll.sessionId ||
        !poll.manifestHash
    ) {
        return false;
    }

    if (
        deviceState.pollId !== poll.id ||
        voterSession.pollId !== poll.id ||
        deviceState.voterIndex !== voterSession.voterIndex
    ) {
        return false;
    }

    const rosterEntry = findRosterEntryForDevice({
        deviceState,
        poll,
    });

    if (!rosterEntry) {
        return false;
    }

    return (
        action.signedPayload.payload.sessionId === poll.sessionId &&
        action.signedPayload.payload.manifestHash === poll.manifestHash &&
        action.signedPayload.payload.participantIndex ===
            rosterEntry.participantIndex
    );
};

const extractAutomaticActionErrorMessage = (error: unknown): string | null => {
    if (typeof error === 'string') {
        return error;
    }

    if (!error || typeof error !== 'object') {
        return null;
    }

    if ('data' in error) {
        const dataField = (error as { data?: unknown }).data;

        if (typeof dataField === 'string') {
            return dataField;
        }

        if (
            dataField &&
            typeof dataField === 'object' &&
            'message' in dataField
        ) {
            const messageField = (dataField as { message?: unknown }).message;

            return typeof messageField === 'string' ? messageField : null;
        }
    }

    if ('message' in error) {
        const messageField = (error as { message?: unknown }).message;

        return typeof messageField === 'string' ? messageField : null;
    }

    return null;
};

export const isRecoverableAutomaticActionSubmissionError = (
    error: unknown,
): boolean => {
    const message = extractAutomaticActionErrorMessage(error);

    return (
        message === ERROR_MESSAGES.boardMessageSessionMismatch ||
        message === ERROR_MESSAGES.boardMessageSkippedParticipant
    );
};

const createRecoverableAutomaticActionRetryKey = (
    action: PreparedCeremonyAction,
): string =>
    [
        action.kind,
        action.slotKey,
        action.signedPayload.payload.sessionId,
        action.signedPayload.payload.manifestHash,
        action.signedPayload.payload.participantIndex,
    ].join(':');

export const getRecoverableAutomaticActionRetryDecision = ({
    action,
    maxAutomaticRetries,
    previousState,
}: {
    action: PreparedCeremonyAction;
    maxAutomaticRetries: number;
    previousState: RecoverableAutomaticActionRetryState;
}): {
    nextState: RecoverableAutomaticActionRetryState;
    shouldRetryAutomatically: boolean;
} => {
    const actionKey = createRecoverableAutomaticActionRetryKey(action);
    const attemptCount =
        previousState.actionKey === actionKey
            ? previousState.attemptCount + 1
            : 1;

    return {
        nextState: {
            actionKey,
            attemptCount,
        },
        shouldRetryAutomatically: attemptCount <= maxAutomaticRetries,
    };
};
