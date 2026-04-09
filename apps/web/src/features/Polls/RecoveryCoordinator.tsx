import React, { useEffect, useEffectEvent, useRef } from 'react';

import { useAppDispatch, useAppSelector } from 'app/hooks';
import {
    getRecoveryStrategy,
    getResumableVotingIntent,
} from 'features/Polls/votingSession';
import { shouldAttemptRecovery } from 'features/Polls/votingState';
import { recoverSession } from 'features/Polls/votingThunks/recoverSession';
import { vote } from 'features/Polls/votingThunks/vote';

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
            const recoveryStrategy = getRecoveryStrategy(voteState);

            if (
                recoveringPollIdsRef.current.has(pollId) ||
                !shouldAttemptRecovery(voteState) ||
                !recoveryStrategy
            ) {
                continue;
            }

            recoveringPollIdsRef.current.add(pollId);
            const resumableVotingIntent = getResumableVotingIntent(voteState);

            if (recoveryStrategy === 'register' && resumableVotingIntent) {
                void dispatch(
                    vote({
                        pollId,
                        voterName: resumableVotingIntent.voterName,
                        selectedScores: resumableVotingIntent.selectedScores,
                    }),
                ).finally(() => {
                    recoveringPollIdsRef.current.delete(pollId);
                });
                continue;
            }

            if (recoveryStrategy === 'session') {
                void dispatch(recoverSession({ pollId })).finally(() => {
                    recoveringPollIdsRef.current.delete(pollId);
                });
                continue;
            }

            recoveringPollIdsRef.current.delete(pollId);
        }
    });

    useEffect(() => {
        runRecovery();
    }, []);

    useEffect(() => {
        const shouldRunRecovery = Object.values(votingState).some(
            shouldAttemptRecovery,
        );

        if (shouldRunRecovery) {
            runRecovery();
        }
    }, [votingState]);

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
