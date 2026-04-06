import { canRegister } from '@sealed-vote/protocol';
import React, { useEffect, useState } from 'react';

import VoteItem from './VoteItem';

import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
    const [selectedScores, setSelectedScoresForm] = useState<
        Record<string, number>
    >(buildDefaultScores(poll.choices));
    const {
        progressMessage,
        selectedScores: persistedSelectedScores,
        voterName: persistedVoterName,
    } = useAppSelector((state) => selectVotingStateByPollId(state, pollId));
    const [voterName, setVoterName] = useState(persistedVoterName ?? '');

    useEffect(() => {
        if (persistedVoterName) {
            setVoterName(persistedVoterName);
        }
    }, [persistedVoterName]);

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

    const onSubmit = (): void => {
        void onVote(voterName.trim(), selectedScores);
    };

    if (progressMessage || !canRegister(poll)) {
        return <></>;
    }

    const normalizedVoterName = voterName.trim();
    const isVoterNameDuplicate =
        !!normalizedVoterName &&
        poll.voters.includes(normalizedVoterName) &&
        normalizedVoterName !== persistedVoterName;

    const isSubmitEnabled =
        !!Object.keys(selectedScores).length &&
        !!normalizedVoterName &&
        !isVoterNameDuplicate;

    return (
        <div className="w-full">
            <p className="px-2 py-1 text-center">
                Rate choices from 1 to 10. The results will be ranked by
                geometric mean of all votes per item. All voters need to be
                present in order to complete the vote.
            </p>
            <ul className="w-full">
                {poll.choices.map((choiceName) => (
                    <VoteItem
                        choiceName={choiceName}
                        key={choiceName}
                        onVote={onVoteSelect}
                        selectedScore={selectedScores[choiceName]}
                    />
                ))}
            </ul>
            <div className="flex flex-wrap items-center justify-center">
                <Field className="m-2 w-full max-w-xs">
                    <FieldLabel htmlFor="voterName">Voter name*</FieldLabel>
                    <Input
                        aria-invalid={isVoterNameDuplicate}
                        id="voterName"
                        maxLength={32}
                        name="voterName"
                        onChange={({ target: { value } }) =>
                            setVoterName(value)
                        }
                        value={voterName}
                    />
                    <FieldError>
                        {isVoterNameDuplicate
                            ? 'This voter name already exists'
                            : undefined}
                    </FieldError>
                </Field>
                <Button
                    className="m-2"
                    disabled={!isSubmitEnabled}
                    onClick={onSubmit}
                    size="lg"
                >
                    Vote
                </Button>
            </div>
        </div>
    );
};

export default Voting;
