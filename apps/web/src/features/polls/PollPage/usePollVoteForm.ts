import React from 'react';

import { createEmptyScores } from './poll-page-helpers';
import type { PollData } from './poll-page-types';

import { generateClientToken } from 'features/polls/client-token';
import {
    createPendingPollDeviceState,
    createPollDeviceState,
    savePollDeviceState,
} from 'features/polls/poll-device-storage';
import type { StoredCreatorSession } from 'features/polls/poll-session-storage';
import { saveVoterSession } from 'features/polls/poll-session-storage';
import { useRegisterVoterMutation } from 'features/polls/polls-api';
import { renderError } from 'utils/network-errors';

export const usePollVoteForm = ({
    creatorSession,
    poll,
    refetchPoll,
    setLocalError,
    setLocalNotice,
}: {
    creatorSession: StoredCreatorSession | null;
    poll: PollData | undefined;
    refetchPoll: () => Promise<unknown>;
    setLocalError: (message: string | null) => void;
    setLocalNotice: (message: string | null) => void;
}): {
    canSubmitCompleteDraft: boolean;
    draftScores: (number | null)[];
    isSubmittingVote: boolean;
    onScoreChange: (choiceIndex: number, score: number) => void;
    onSubmitVote: (
        event: React.FormEvent<HTMLFormElement>,
        options: { canSubmitVote: boolean },
    ) => Promise<void>;
    setVoterName: (value: string) => void;
    voterName: string;
} => {
    const [registerVoter, registerState] = useRegisterVoterMutation();
    const [voterName, setVoterName] = React.useState('');
    const [draftScores, setDraftScores] = React.useState<(number | null)[]>([]);

    React.useEffect(() => {
        if (!poll) {
            return;
        }

        setDraftScores((currentScores) =>
            currentScores.length === poll.choices.length
                ? currentScores
                : createEmptyScores(poll.choices.length),
        );
    }, [poll]);

    const hasCompleteDraft = draftScores.every((score) => score !== null);
    const canSubmitCompleteDraft =
        !registerState.isLoading && !!voterName.trim() && hasCompleteDraft;

    const onScoreChange = React.useCallback(
        (choiceIndex: number, score: number): void => {
            setDraftScores((currentScores) =>
                currentScores.map((currentScore, index) =>
                    index === choiceIndex ? score : currentScore,
                ),
            );
        },
        [],
    );

    const onSubmitVote = React.useCallback(
        async (
            event: React.FormEvent<HTMLFormElement>,
            { canSubmitVote }: { canSubmitVote: boolean },
        ): Promise<void> => {
            event.preventDefault();

            const normalizedVoterName = voterName.trim();

            if (!canSubmitVote || !poll) {
                return;
            }

            setLocalError(null);
            setLocalNotice(null);

            try {
                const pendingState = await createPendingPollDeviceState();
                const voterToken = generateClientToken();
                const response = await registerVoter({
                    pollId: poll.id,
                    voterData: {
                        authPublicKey: pendingState.authPublicKey,
                        creatorToken:
                            creatorSession?.pollId === poll.id
                                ? creatorSession.creatorToken
                                : undefined,
                        transportPublicKey: pendingState.transportPublicKey,
                        transportSuite: pendingState.transportSuite,
                        voterName: normalizedVoterName,
                        voterToken,
                    },
                }).unwrap();

                const storedScores = draftScores.map((score) => {
                    if (score === null) {
                        throw new Error(
                            'Every choice must have a score before submission.',
                        );
                    }

                    return score;
                });
                const nextDeviceState = await createPollDeviceState({
                    pendingState,
                    pollId: poll.id,
                    pollSlug: poll.slug,
                    storedBallotScores: storedScores,
                    voterIndex: response.voterIndex,
                    voterName: response.voterName,
                    voterToken: response.voterToken,
                    isCreatorParticipant: creatorSession?.pollId === poll.id,
                });

                savePollDeviceState(nextDeviceState);
                saveVoterSession({
                    pollId: poll.id,
                    pollSlug: poll.slug,
                    voterIndex: response.voterIndex,
                    voterName: response.voterName,
                    voterToken: response.voterToken,
                });
                setLocalNotice(
                    'Vote stored on this device. You can close the app and come back after voting closes.',
                );
                await refetchPoll();
            } catch (submissionError) {
                setLocalError(renderError(submissionError));
            }
        },
        [
            creatorSession,
            draftScores,
            poll,
            refetchPoll,
            registerVoter,
            setLocalError,
            setLocalNotice,
            voterName,
        ],
    );

    return {
        canSubmitCompleteDraft,
        draftScores,
        isSubmittingVote: registerState.isLoading,
        onScoreChange,
        onSubmitVote,
        setVoterName,
        voterName,
    };
};
