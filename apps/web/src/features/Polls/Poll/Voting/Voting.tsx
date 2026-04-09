import { normalizeTrimmedString } from '@sealed-vote/contracts';
import { canRegister } from '@sealed-vote/protocol';
import React, { useEffect, useState, type FormEvent } from 'react';

import VoteItem from './VoteItem';

import { Button } from '@/components/ui/button';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { Panel } from '@/components/ui/panel';
import { actionButtonClassName, sectionTitleClassName } from '@/lib/uiClasses';
import { cn } from '@/lib/utils';
import { useAppSelector } from 'app/hooks';
import { type PollResponse } from 'features/Polls/pollsApi';
import { selectVotingStateByPollId } from 'features/Polls/votingSlice';

const buildDefaultScores = (choices: string[]): Record<string, number> =>
    Object.fromEntries(choices.map((choiceName) => [choiceName, 1]));

type VotingProps = {
    onVote: (voterName: string, selectedScores: Record<string, number>) => void;
    poll: PollResponse;
    pollId: string;
};

const Voting = ({ onVote, poll, pollId }: VotingProps): React.JSX.Element => {
    const headingId = React.useId();
    const [selectedScores, setSelectedScoresForm] = useState<
        Record<string, number>
    >(buildDefaultScores(poll.choices));
    const {
        pendingVoterName,
        progressMessage,
        selectedScores: persistedSelectedScores,
        voterName: persistedVoterName,
    } = useAppSelector((state) => selectVotingStateByPollId(state, pollId));
    const [voterName, setVoterName] = useState(
        persistedVoterName ?? pendingVoterName ?? '',
    );

    useEffect(() => {
        if (persistedVoterName ?? pendingVoterName) {
            setVoterName(persistedVoterName ?? pendingVoterName ?? '');
        }
    }, [pendingVoterName, persistedVoterName]);

    useEffect(() => {
        setSelectedScoresForm((currentScores) => {
            if (persistedSelectedScores) {
                return persistedSelectedScores;
            }

            const nextScores = buildDefaultScores(poll.choices);
            return Object.keys(currentScores).length
                ? currentScores
                : nextScores;
        });
    }, [persistedSelectedScores, poll.choices]);

    const onVoteSelect = (choiceName: string, score: number): void => {
        setSelectedScoresForm((currentScores) => ({
            ...currentScores,
            [choiceName]: score,
        }));
    };

    const normalizedVoterName = normalizeTrimmedString(voterName);
    const isVoterNameDuplicate =
        !!normalizedVoterName &&
        poll.voters.includes(normalizedVoterName) &&
        normalizedVoterName !== persistedVoterName;

    const isSubmitEnabled =
        !!Object.keys(selectedScores).length &&
        !!normalizedVoterName &&
        !isVoterNameDuplicate;

    const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();

        if (!isSubmitEnabled) {
            return;
        }

        void onVote(normalizedVoterName, selectedScores);
    };

    if (progressMessage || !canRegister(poll)) {
        return <></>;
    }

    return (
        <Panel asChild>
            <section aria-labelledby={headingId}>
                <form className="space-y-6" onSubmit={onSubmit}>
                    <div className="space-y-2">
                        <h2 className={sectionTitleClassName} id={headingId}>
                            Cast your vote
                        </h2>
                        <p className="field-note">
                            Rate choices from 1 to 10. The results will be
                            ordered by geometric mean of all votes per item. All
                            voters need to be present in order to complete the
                            vote.
                        </p>
                    </div>
                    <ul className="space-y-4">
                        {poll.choices.map((choiceName, choiceIndex) => (
                            <VoteItem
                                choiceIndex={choiceIndex}
                                choiceName={choiceName}
                                key={choiceName}
                                onVote={onVoteSelect}
                                selectedScore={selectedScores[choiceName]}
                            />
                        ))}
                    </ul>
                    <div className="grid gap-4 border-t border-border pt-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <OutlinedInputField
                            aria-invalid={isVoterNameDuplicate}
                            errorText={
                                isVoterNameDuplicate
                                    ? 'This voter name already exists'
                                    : undefined
                            }
                            helperText={
                                !isVoterNameDuplicate
                                    ? 'Use a unique name visible to other voters.'
                                    : undefined
                            }
                            id="voterName"
                            label="Voter name"
                            maxLength={32}
                            name="voterName"
                            onChange={({ target: { value } }) =>
                                setVoterName(value)
                            }
                            required
                            value={voterName}
                        />
                        <Button
                            className={cn(
                                actionButtonClassName,
                                'sm:mt-8 sm:min-w-32',
                            )}
                            disabled={!isSubmitEnabled}
                            size="lg"
                            type="submit"
                        >
                            Vote
                        </Button>
                    </div>
                </form>
            </section>
        </Panel>
    );
};

export default Voting;
