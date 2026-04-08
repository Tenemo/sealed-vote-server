import React, { useEffect, useEffectEvent, useRef } from 'react';

import { useAppDispatch, useAppSelector } from 'app/hooks';
import { recoverSession } from 'features/Polls/votingThunks/recoverSession';

const getBrowserOnlineState = (): boolean =>
    typeof navigator === 'undefined' ? true : navigator.onLine;

const RecoveryCoordinator = (): React.JSX.Element => {
    const dispatch = useAppDispatch();
    const votingState = useAppSelector((state) => state.voting);
    const latestVotingStateRef = useRef(votingState);
    const recoveringPollIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        latestVotingStateRef.current = votingState;
    }, [votingState]);

    const runRecovery = useEffectEvent((): void => {
        if (!getBrowserOnlineState()) {
            return;
        }

        for (const [pollId, voteState] of Object.entries(
            latestVotingStateRef.current,
        )) {
            if (
                (!voteState.voterToken && !voteState.creatorToken) ||
                voteState.isVotingInProgress ||
                recoveringPollIdsRef.current.has(pollId)
            ) {
                continue;
            }

            recoveringPollIdsRef.current.add(pollId);
            void dispatch(recoverSession({ pollId })).finally(() => {
                recoveringPollIdsRef.current.delete(pollId);
            });
        }
    });

    useEffect(() => {
        runRecovery();
    }, []);

    useEffect(() => {
        const handleOnline = (): void => {
            runRecovery();
        };
        const handleFocus = (): void => {
            runRecovery();
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('focus', handleFocus);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    return <></>;
};

export default RecoveryCoordinator;
