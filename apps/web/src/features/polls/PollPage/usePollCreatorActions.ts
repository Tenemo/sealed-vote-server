import React from 'react';

import type { PollData } from './poll-page-types';

import type { StoredCreatorSession } from 'features/polls/poll-session-storage';
import {
    useCloseVotingMutation,
    useRestartCeremonyMutation,
} from 'features/polls/polls-api';
import { renderError } from 'utils/network-errors';

export const usePollCreatorActions = ({
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
    isClosingVoting: boolean;
    isRestartingCeremony: boolean;
    onCloseVoting: (options: { canCloseVoting: boolean }) => Promise<void>;
    onRestartCeremony: (options: {
        blockingVoters: PollData['voters'];
        canRestartCeremony: boolean;
    }) => Promise<void>;
} => {
    const [closeVoting, closeState] = useCloseVotingMutation();
    const [restartCeremony, restartState] = useRestartCeremonyMutation();

    const onCloseVoting = React.useCallback(
        async ({
            canCloseVoting,
        }: {
            canCloseVoting: boolean;
        }): Promise<void> => {
            if (!poll || !creatorSession || !canCloseVoting) {
                return;
            }

            setLocalError(null);
            setLocalNotice(null);

            try {
                await closeVoting({
                    pollId: poll.id,
                    closeData: {
                        creatorToken: creatorSession.creatorToken,
                    },
                }).unwrap();
                setLocalNotice(
                    'Voting closed. The submitted roster is now being secured.',
                );
                await refetchPoll();
            } catch (closeError) {
                setLocalError(renderError(closeError));
            }
        },
        [
            closeVoting,
            creatorSession,
            poll,
            refetchPoll,
            setLocalError,
            setLocalNotice,
        ],
    );

    const onRestartCeremony = React.useCallback(
        async ({
            blockingVoters,
            canRestartCeremony,
        }: {
            blockingVoters: PollData['voters'];
            canRestartCeremony: boolean;
        }): Promise<void> => {
            if (
                !poll ||
                !creatorSession ||
                poll.phase !== 'securing' ||
                blockingVoters.length === 0 ||
                !canRestartCeremony
            ) {
                return;
            }

            const blockingVoterNames = blockingVoters
                .map((voter) => voter.voterName)
                .join(', ');
            const confirmed =
                typeof window === 'undefined' ||
                window.confirm(
                    `Restart the ceremony without ${blockingVoterNames}? Their locally stored votes will not be counted for this closed poll.`,
                );

            if (!confirmed) {
                return;
            }

            setLocalError(null);
            setLocalNotice(null);

            try {
                await restartCeremony({
                    pollId: poll.id,
                    restartData: {
                        creatorToken: creatorSession.creatorToken,
                    },
                }).unwrap();
                setLocalNotice(
                    `Restarted the ceremony without ${blockingVoterNames}. Those votes will not be counted unless those voters had already finished the active ceremony session before the restart.`,
                );
                await refetchPoll();
            } catch (restartError) {
                setLocalError(renderError(restartError));
            }
        },
        [
            creatorSession,
            poll,
            refetchPoll,
            restartCeremony,
            setLocalError,
            setLocalNotice,
        ],
    );

    return {
        isClosingVoting: closeState.isLoading,
        isRestartingCeremony: restartState.isLoading,
        onCloseVoting,
        onRestartCeremony,
    };
};
