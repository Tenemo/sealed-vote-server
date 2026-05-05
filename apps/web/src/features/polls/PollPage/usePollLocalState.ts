import React from 'react';

import { getLocalCeremonyState } from './automatic-action-state';
import { isPollVoterLocal } from './poll-page-helpers';
import type { PollData } from './poll-page-types';

import {
    clearStoredBallotScores,
    findPollDeviceStateByPollId,
    findPollDeviceStateByPollSlug,
} from 'features/polls/poll-device-storage';
import {
    findCreatorSessionByPollId,
    findCreatorSessionByPollSlug,
    findVoterSessionByPollId,
    findVoterSessionByPollSlug,
} from 'features/polls/poll-session-storage';

export const usePollLocalState = (
    poll: PollData | undefined,
): {
    creatorSession: ReturnType<typeof findCreatorSessionByPollId>;
    deviceState: ReturnType<typeof findPollDeviceStateByPollId>;
    isLocalVoter: boolean;
    localCeremonyState: PollData['voters'][number]['ceremonyState'] | null;
    voterSession: ReturnType<typeof findVoterSessionByPollId>;
} => {
    const creatorSession = React.useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findCreatorSessionByPollId(poll.id) ??
            findCreatorSessionByPollSlug(poll.slug)
        );
    }, [poll]);

    const voterSession = React.useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findVoterSessionByPollId(poll.id) ??
            findVoterSessionByPollSlug(poll.slug)
        );
    }, [poll]);

    const deviceState = React.useMemo(() => {
        if (!poll) {
            return null;
        }

        return (
            findPollDeviceStateByPollId(poll.id) ??
            findPollDeviceStateByPollSlug(poll.slug)
        );
    }, [poll]);

    const localCeremonyState = React.useMemo(
        () =>
            getLocalCeremonyState({
                deviceState,
                poll,
                voterSession,
            }),
        [deviceState, poll, voterSession],
    );

    React.useEffect(() => {
        if (!poll || !deviceState) {
            return;
        }

        if (
            deviceState.storedBallotScores !== null &&
            (poll.phase === 'complete' ||
                poll.phase === 'aborted' ||
                localCeremonyState === 'skipped')
        ) {
            clearStoredBallotScores(poll.id);
        }
    }, [deviceState, localCeremonyState, poll]);

    return {
        creatorSession,
        deviceState,
        isLocalVoter: poll
            ? isPollVoterLocal({
                  devicePollId: deviceState?.pollId,
                  pollId: poll.id,
                  voterPollId: voterSession?.pollId,
              })
            : false,
        localCeremonyState,
        voterSession,
    };
};
