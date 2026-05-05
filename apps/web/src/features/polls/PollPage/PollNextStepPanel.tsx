import type React from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { OutlinedInputField } from '@/components/ui/outlined-input-field';
import { Panel } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { Surface } from '@/components/ui/surface';
import LoadingButton from 'components/LoadingButton/LoadingButton';

import { scoreOptions } from './poll-page-helpers';
import type { PollData } from './poll-page-types';
import type {
    PollPageAutomationViewModel,
    PollPageCreatorControlsViewModel,
    PollPageNextStepViewModel,
    PollPageRestartCeremonyViewModel,
    PollPageVoteFormViewModel,
} from './poll-page-view-models';

type PollNextStepPanelProps = {
    nextStep: PollPageNextStepViewModel;
};

const CeremonyRestartAlert = ({
    minimumCloseVoterCount,
    restartCeremony: {
        blockingVoters,
        canRestartCeremony,
        isRestartingCeremony,
        onRestartCeremony,
    },
}: {
    minimumCloseVoterCount: number;
    restartCeremony: PollPageRestartCeremonyViewModel;
}): React.JSX.Element => (
    <Alert announcement="polite" variant="info">
        <AlertDescription>
            <div className="space-y-3">
                <p>
                    Ceremony progress is waiting on{' '}
                    {blockingVoters.map((voter) => voter.voterName).join(', ')}.
                    If you restart the ceremony without them, any votes that
                    those voters have not already advanced through the active
                    ceremony session will be skipped for this closed poll.
                </p>
                {!canRestartCeremony ? (
                    <p className="text-sm text-secondary">
                        You can restart the ceremony only when removing the
                        current blocking voters would still leave at least{' '}
                        {minimumCloseVoterCount} active voters in the ceremony.
                    </p>
                ) : null}
                {canRestartCeremony ? (
                    <div className="flex flex-wrap justify-end gap-3">
                        <LoadingButton
                            className="w-full sm:w-auto"
                            loading={isRestartingCeremony}
                            loadingLabel="Restarting ceremony"
                            onClick={onRestartCeremony}
                            size="lg"
                            variant="outline"
                        >
                            Restart ceremony without blocking voters
                        </LoadingButton>
                    </div>
                ) : null}
            </div>
        </AlertDescription>
    </Alert>
);

const PollVoteForm = ({
    poll,
    voteForm: {
        canSubmitVote,
        draftScores,
        isSubmittingVote,
        onScoreChange,
        onSubmitVote,
        setVoterName,
        voterName,
    },
}: {
    poll: PollData;
    voteForm: PollPageVoteFormViewModel;
}): React.JSX.Element => (
    <form className="space-y-6" noValidate onSubmit={onSubmitVote}>
        <OutlinedInputField
            autoComplete="nickname"
            id="poll-voter-name"
            label="Your public name"
            maxLength={32}
            onChange={(event) => {
                setVoterName(event.target.value);
            }}
            placeholder="How should the roster show you?"
            value={voterName}
        />

        <div className="space-y-4">
            <div className="space-y-2">
                <h3 className="text-base font-semibold">Score every choice</h3>
                <p className="field-note">
                    Every choice must get one score from 1 to 10. You can submit
                    only once.
                </p>
            </div>

            {poll.choices.map((choice, choiceIndex) => (
                <Surface className="space-y-3" key={choice}>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <div className="text-sm font-medium text-foreground">
                                {choice}
                            </div>
                            <div className="text-sm text-secondary">
                                {draftScores[choiceIndex] === null
                                    ? 'Pick a score'
                                    : `Selected score: ${draftScores[choiceIndex]}`}
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                        {scoreOptions.map((score) => (
                            <Button
                                aria-label={`Score ${choice} as ${score}`}
                                className="w-full"
                                key={score}
                                onClick={() => {
                                    onScoreChange(choiceIndex, score);
                                }}
                                type="button"
                                variant={
                                    draftScores[choiceIndex] === score
                                        ? 'default'
                                        : 'outline'
                                }
                            >
                                {score}
                            </Button>
                        ))}
                    </div>
                </Surface>
            ))}
        </div>

        <div className="flex flex-wrap justify-end gap-3">
            <LoadingButton
                className="w-full sm:w-auto"
                disabled={!canSubmitVote}
                loading={isSubmittingVote}
                loadingLabel="Submitting vote"
                size="lg"
                type="submit"
            >
                Submit vote
            </LoadingButton>
        </div>
    </form>
);

const StoredVoteState = ({
    creatorControls: { isClosingVoting, isCreatorParticipant, onCloseVoting },
    poll,
    workflow,
}: {
    creatorControls: PollPageCreatorControlsViewModel;
    poll: PollData;
    workflow: PollPageNextStepViewModel['workflow'];
}): React.JSX.Element => (
    <div className="space-y-4">
        <Surface>
            <div className="text-base font-semibold">
                Vote stored on this device
            </div>
            <p className="field-note mt-2">
                {workflow.currentStep === 'creator-can-close'
                    ? 'Your vote is in. You can close voting when you are ready to freeze the submitted roster.'
                    : 'Your plaintext scores stay on this device until voting closes. You can leave now and come back later.'}
            </p>
        </Surface>

        {workflow.currentStep === 'creator-must-submit-first' ? (
            <Alert announcement="polite" variant="info">
                <AlertDescription>
                    The creator must submit a vote from this browser before
                    close becomes available.
                </AlertDescription>
            </Alert>
        ) : null}

        {workflow.canCloseVoting ? (
            <div className="flex flex-wrap justify-end gap-3">
                <LoadingButton
                    className="w-full sm:w-auto"
                    disabled={!workflow.canCloseVoting}
                    loading={isClosingVoting}
                    loadingLabel="Closing voting"
                    onClick={onCloseVoting}
                    size="lg"
                >
                    Close voting
                </LoadingButton>
            </div>
        ) : isCreatorParticipant ? (
            <p className="field-note">
                {poll.submittedVoterCount < poll.minimumCloseVoterCount
                    ? `At least ${poll.minimumCloseVoterCount} submitted voters are required before closing.`
                    : 'Waiting for you to close the submitted roster.'}
            </p>
        ) : null}
    </div>
);

const WaitingState = ({
    automation: { activeActionSlotKey, isResolvingAutomaticAction },
    nextStepExplanation,
}: {
    automation: PollPageAutomationViewModel;
    nextStepExplanation: string;
}): React.JSX.Element => (
    <Surface className="flex items-center gap-3">
        {isResolvingAutomaticAction || activeActionSlotKey ? (
            <Spinner className="size-5" label={null} />
        ) : null}
        <p className="text-sm text-secondary">{nextStepExplanation}</p>
    </Surface>
);

const PollNextStepPanel = ({
    nextStep: {
        automation,
        creatorControls,
        localViewer,
        nextStepExplanation,
        poll,
        restartCeremony,
        voteForm,
        workflow,
    },
}: PollNextStepPanelProps): React.JSX.Element => (
    <Panel className="space-y-5">
        <div className="space-y-2">
            <h2 className="text-xl font-semibold">Your next step</h2>
            <p className="field-note">{nextStepExplanation}</p>
        </div>

        {workflow.isCreator &&
        poll.phase === 'securing' &&
        restartCeremony.blockingVoters.length > 0 ? (
            <CeremonyRestartAlert
                minimumCloseVoterCount={poll.minimumCloseVoterCount}
                restartCeremony={restartCeremony}
            />
        ) : null}

        {poll.phase === 'open' && !localViewer.isLocalVoter ? (
            <PollVoteForm poll={poll} voteForm={voteForm} />
        ) : poll.phase === 'open' &&
          workflow.currentStep !== 'local-vote-missing' ? (
            <StoredVoteState
                creatorControls={creatorControls}
                poll={poll}
                workflow={workflow}
            />
        ) : workflow.canRetryAutomation ? (
            <div className="flex flex-wrap justify-end gap-3">
                <Button
                    className="w-full sm:w-auto"
                    onClick={automation.onRetryAutomation}
                    size="lg"
                    variant="outline"
                >
                    Retry ceremony
                </Button>
            </div>
        ) : (
            <WaitingState
                automation={automation}
                nextStepExplanation={nextStepExplanation}
            />
        )}
    </Panel>
);

export default PollNextStepPanel;
