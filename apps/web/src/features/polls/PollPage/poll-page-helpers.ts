import { fixedScoreRange } from '@sealed-vote/contracts';

import type { PreparedCeremonyAction } from '../poll-board-actions';
import type { DerivedPollWorkflow } from '../poll-workflow';

import type { PollBoardEntry, PollData } from './poll-page-types';

const minimumScore = fixedScoreRange.min;
const maximumScore = fixedScoreRange.max;

export const scoreOptions = Array.from(
    { length: maximumScore - minimumScore + 1 },
    (_value, offset) => minimumScore + offset,
);

const activeCeremonyPhases = new Set<PollData['phase']>([
    'ready-to-reveal',
    'revealing',
    'securing',
]);

export const activeCeremonyPollingIntervalMs = 1_000;
export const steadyStatePollingIntervalMs = 5_000;

export const createEmptyScores = (choiceCount: number): (number | null)[] =>
    Array.from({ length: choiceCount }, () => null);

export const getPollRefreshInterval = (
    poll: Pick<PollData, 'phase'> | null | undefined,
): number =>
    poll && activeCeremonyPhases.has(poll.phase)
        ? activeCeremonyPollingIntervalMs
        : steadyStatePollingIntervalMs;

export const isPollVoterLocal = ({
    devicePollId,
    pollId,
    voterPollId,
}: {
    devicePollId: string | null | undefined;
    pollId: string;
    voterPollId: string | null | undefined;
}): boolean => devicePollId === pollId && voterPollId === pollId;

export const isSamePreparedAction = (
    left: PreparedCeremonyAction | null,
    right: PreparedCeremonyAction,
): boolean =>
    !!left &&
    left.kind === right.kind &&
    left.slotKey === right.slotKey &&
    left.signedPayload.signature === right.signedPayload.signature;

export const findBoardEntryForPreparedAction = ({
    action,
    poll,
}: {
    action: PreparedCeremonyAction | null;
    poll: PollData | undefined;
}): PollBoardEntry | null => {
    if (!action || !poll) {
        return null;
    }

    return (
        poll.boardEntries.find(
            (entry: PollBoardEntry) =>
                entry.slotKey === action.slotKey &&
                entry.signedPayload.signature ===
                    action.signedPayload.signature,
        ) ?? null
    );
};

export const buildPrimaryExplanation = ({
    automaticActionDescription,
    automationError,
    workflow,
}: {
    automaticActionDescription: string | null;
    automationError: string | null;
    workflow: DerivedPollWorkflow;
}): string => {
    switch (workflow.currentStep) {
        case 'anonymous-ready-to-vote':
            return 'Score every choice from 1 to 10, submit once, and come back after the creator closes voting.';
        case 'submitting-vote':
            return 'Saving your final local vote and registering this device for the later ceremony.';
        case 'creator-must-submit-first':
            return 'You still need to submit your own vote from this browser before you can close voting.';
        case 'vote-stored-waiting-for-close':
            return 'Your plaintext scores are stored only on this device until the creator closes voting.';
        case 'creator-can-close':
            return 'Everyone who submitted before you close will be included. Everyone else stays out.';
        case 'securing-auto':
            return (
                automaticActionDescription ??
                'Securing the election in the background.'
            );
        case 'automation-retry-required':
            return (
                automationError ??
                'Automatic ceremony progress needs a retry from this browser.'
            );
        case 'securing-waiting':
            return 'Waiting for the rest of the group to finish the secure setup and encrypted ballot publication.';
        case 'skipped':
            return 'The creator restarted the ceremony without this voter. Your locally stored vote was not counted for this closed poll.';
        case 'revealing-auto':
            return (
                automaticActionDescription ??
                'Starting the reveal and publishing decryption material in the background.'
            );
        case 'revealing-waiting':
            return 'Waiting for threshold decryption shares and final tally publication.';
        case 'waiting-for-results':
            return 'The ceremony is moving without any action needed from this browser.';
        case 'local-vote-missing':
            return 'This browser no longer has the local vote and device state required to continue in this poll.';
        case 'complete':
            return 'Every result shown below was replayed and verified from the public board log.';
        case 'aborted':
            return 'The ceremony could not be verified from the public board log.';
    }
};

export const buildNextStepExplanation = ({
    primaryExplanation,
    workflow,
}: {
    primaryExplanation: string;
    workflow: DerivedPollWorkflow;
}): string =>
    workflow.currentStep === 'skipped'
        ? 'No further action is required on this device.'
        : primaryExplanation;
