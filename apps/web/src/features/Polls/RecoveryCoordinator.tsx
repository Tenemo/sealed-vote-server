import React, { useEffect, useEffectEvent, useRef } from 'react';

import { useAppDispatch, useAppSelector } from 'app/hooks';
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
            if (
                voteState.pollSnapshot?.resultScores.length ||
                voteState.isVotingInProgress ||
                recoveringPollIdsRef.current.has(pollId)
            ) {
                continue;
            }

            recoveringPollIdsRef.current.add(pollId);
            if (voteState.voterToken) {
                void dispatch(recoverSession({ pollId })).finally(() => {
                    recoveringPollIdsRef.current.delete(pollId);
                });
                continue;
            }

            if (
                voteState.pendingVoterToken &&
                voteState.pendingVoterName &&
                voteState.selectedScores
            ) {
                void dispatch(
                    vote({
                        pollId,
                        voterName: voteState.pendingVoterName,
                        selectedScores: voteState.selectedScores,
                    }),
                ).finally(() => {
                    recoveringPollIdsRef.current.delete(pollId);
                });
                continue;
            }

            if (voteState.creatorToken) {
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
            (voteState) => {
                if (
                    voteState.pollSnapshot?.resultScores.length ||
                    voteState.isVotingInProgress
                ) {
                    return false;
                }

                if (
                    voteState.pendingVoterToken &&
                    voteState.pendingVoterName &&
                    voteState.selectedScores
                ) {
                    return true;
                }

                return Boolean(
                    voteState.shouldResumeWorkflow &&
                    (voteState.voterToken || voteState.creatorToken),
                );
            },
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
