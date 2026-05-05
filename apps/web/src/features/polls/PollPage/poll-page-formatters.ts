import { countSignedPayloadsOfType } from '@sealed-vote/protocol';
import type { SignedPayload } from 'threshold-elgamal';

import type { PollBoardEntry, PollData } from './poll-page-types';

export const phaseLabel = (phase: string): string =>
    (
        ({
            aborted: 'Ceremony aborted',
            complete: 'Verified results',
            open: 'Voting open',
            'ready-to-reveal': 'Starting reveal',
            revealing: 'Revealing results',
            securing: 'Securing the election',
        }) satisfies Record<string, string>
    )[phase] ?? phase;

export const formatDateTime = (value: string): string =>
    new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

const acceptedBoardPayloads = (poll: PollData): readonly SignedPayload[] =>
    poll.boardEntries
        .filter(
            (entry: PollBoardEntry) =>
                entry.classification === 'accepted' &&
                entry.signedPayload.payload.sessionId === poll.sessionId,
        )
        .map((entry: PollBoardEntry) => entry.signedPayload);

export const countAcceptedMessages = (
    poll: PollData,
    messageType: SignedPayload['payload']['messageType'],
): number =>
    countSignedPayloadsOfType(acceptedBoardPayloads(poll), messageType);

const humanizeBoardMessageType = (messageType: string): string =>
    messageType.replaceAll('-', ' ');

export const formatBoardEntryTitle = (
    entry: PollBoardEntry,
    poll: PollData,
): string => {
    const payload = entry.signedPayload.payload as Record<string, unknown>;
    const baseTitle = `Participant ${entry.participantIndex}. ${humanizeBoardMessageType(entry.messageType)}`;

    if (
        typeof payload.optionIndex === 'number' &&
        Number.isInteger(payload.optionIndex)
    ) {
        const choiceName = poll.choices[payload.optionIndex - 1];

        return choiceName
            ? `${baseTitle} for ${choiceName}`
            : `${baseTitle} for choice ${payload.optionIndex}`;
    }

    if (
        typeof payload.recipientIndex === 'number' &&
        Number.isInteger(payload.recipientIndex)
    ) {
        return `${baseTitle} for voter ${payload.recipientIndex}`;
    }

    if (Array.isArray(payload.countedParticipantIndices)) {
        return `${baseTitle} counting ${payload.countedParticipantIndices.length} participants`;
    }

    return baseTitle;
};

export const formatBoardEntryStatus = (entry: PollBoardEntry): string => {
    const classification =
        entry.classification.charAt(0).toUpperCase() +
        entry.classification.slice(1);

    return `${classification} | ${formatDateTime(entry.createdAt)}`;
};

export const formatRevealStatus = (poll: PollData): string => {
    if (poll.phase === 'aborted') {
        return 'Aborted';
    }

    if (poll.phase === 'complete') {
        return 'Complete';
    }

    if (poll.phase === 'revealing') {
        return 'Started';
    }

    if (poll.phase === 'ready-to-reveal') {
        return 'Starting';
    }

    if (poll.ceremony.revealReady) {
        return 'Ready';
    }

    return poll.phase === 'open'
        ? 'Pending close'
        : 'Waiting for complete ballots';
};

export const buildSubmittedVoterSummary = ({
    count,
    minimum,
}: {
    count: number;
    minimum: number;
}): string =>
    count >= minimum
        ? `${count} submitted before close`
        : `${count} submitted, ${minimum - count} more needed before close`;
