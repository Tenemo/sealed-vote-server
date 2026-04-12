import type { PollResponse } from '@sealed-vote/contracts';

import type { PreparedCeremonyAction } from '../pollBoardActions';
import type { StoredPollDeviceState } from '../pollDeviceStorage';
import type { StoredVoterSession } from '../pollSessionStorage';

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
                entry.transportPublicKey === deviceState.transportPublicKey,
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
