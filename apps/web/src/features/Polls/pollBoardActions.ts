import type { PollResponse } from '@sealed-vote/contracts';
import {
    canonicalUnsignedPayloadBytes,
    type ManifestAcceptancePayload,
    type ManifestPublicationPayload,
    type ProtocolPayload,
    type RegistrationPayload,
    type SignedPayload,
} from 'threshold-elgamal/protocol';
import {
    signPayloadBytes,
    type EncodedAuthPublicKey,
    type EncodedTransportPublicKey,
} from 'threshold-elgamal/transport';

import type { StoredPollDeviceState } from './pollDeviceStorage';
import type { StoredVoterSession } from './voterSessionStorage';

type AutoBoardSetupAction =
    | {
          kind: 'publish-registration';
          payload: RegistrationPayload;
      }
    | {
          kind: 'publish-manifest';
          payload: ManifestPublicationPayload;
      }
    | {
          kind: 'accept-manifest';
          payload: ManifestAcceptancePayload;
      };

const hasAcceptedMessage = (
    poll: PollResponse,
    participantIndex: number,
    messageType: PollResponse['boardEntries'][number]['messageType'],
): boolean =>
    poll.boardEntries.some(
        (entry) =>
            entry.classification === 'accepted' &&
            entry.participantIndex === participantIndex &&
            entry.messageType === messageType,
    );

const countAcceptedMessages = (
    poll: PollResponse,
    messageType: PollResponse['boardEntries'][number]['messageType'],
): number =>
    poll.boardEntries.filter(
        (entry) =>
            entry.classification === 'accepted' &&
            entry.messageType === messageType,
    ).length;

export const resolveAutoBoardSetupAction = ({
    deviceState,
    poll,
    voterSession,
}: {
    deviceState: StoredPollDeviceState | null;
    poll: PollResponse;
    voterSession: StoredVoterSession | null;
}): AutoBoardSetupAction | null => {
    if (
        poll.isOpen ||
        !deviceState ||
        !voterSession ||
        !poll.manifest ||
        !poll.manifestHash ||
        !poll.sessionId
    ) {
        return null;
    }

    const participantIndex = voterSession.voterIndex;
    const acceptedRegistrationCount = countAcceptedMessages(
        poll,
        'registration',
    );
    const hasAcceptedRegistration = hasAcceptedMessage(
        poll,
        participantIndex,
        'registration',
    );

    if (!hasAcceptedRegistration) {
        return {
            kind: 'publish-registration',
            payload: {
                sessionId: poll.sessionId,
                manifestHash: poll.manifestHash,
                phase: 0,
                participantIndex,
                messageType: 'registration',
                rosterHash: poll.manifest.rosterHash,
                authPublicKey:
                    deviceState.authPublicKey as EncodedAuthPublicKey,
                transportPublicKey:
                    deviceState.transportPublicKey as EncodedTransportPublicKey,
            },
        };
    }

    const manifestPublisherIndex = poll.rosterEntries[0]?.participantIndex ?? 1;
    const hasAcceptedManifestPublication = poll.boardEntries.some(
        (entry) =>
            entry.classification === 'accepted' &&
            entry.messageType === 'manifest-publication',
    );

    if (
        participantIndex === manifestPublisherIndex &&
        acceptedRegistrationCount === poll.joinedParticipantCount &&
        !hasAcceptedManifestPublication
    ) {
        return {
            kind: 'publish-manifest',
            payload: {
                sessionId: poll.sessionId,
                manifestHash: poll.manifestHash,
                phase: 0,
                participantIndex,
                messageType: 'manifest-publication',
                manifest: poll.manifest,
            },
        };
    }

    const hasAcceptedManifestAcceptance = hasAcceptedMessage(
        poll,
        participantIndex,
        'manifest-acceptance',
    );

    if (hasAcceptedManifestPublication && !hasAcceptedManifestAcceptance) {
        return {
            kind: 'accept-manifest',
            payload: {
                sessionId: poll.sessionId,
                manifestHash: poll.manifestHash,
                phase: 0,
                participantIndex,
                messageType: 'manifest-acceptance',
                rosterHash: poll.manifest.rosterHash,
                assignedParticipantIndex: participantIndex,
            },
        };
    }

    return null;
};

export const describeAutoBoardSetupAction = (
    action: AutoBoardSetupAction | null,
): string | null => {
    if (!action) {
        return null;
    }

    switch (action.kind) {
        case 'publish-registration':
            return 'Syncing your device registration to the shared ceremony log.';
        case 'publish-manifest':
            return 'Freezing the shared manifest so every participant signs the same ceremony.';
        case 'accept-manifest':
            return 'Confirming the frozen manifest before private setup continues.';
        default:
            return null;
    }
};

export const signProtocolPayload = async <TPayload extends ProtocolPayload>({
    authPrivateKey,
    payload,
}: {
    authPrivateKey: CryptoKey;
    payload: TPayload;
}): Promise<SignedPayload<TPayload>> => ({
    payload,
    signature: await signPayloadBytes(
        authPrivateKey,
        canonicalUnsignedPayloadBytes(payload),
    ),
});

export type { AutoBoardSetupAction };
