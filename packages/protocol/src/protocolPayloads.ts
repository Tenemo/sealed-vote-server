import type { ProtocolPayload } from 'threshold-elgamal';

const textEncoder = new TextEncoder();

const canonicalizeJson = (value: unknown): string => {
    if (
        value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string'
    ) {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
    }

    if (typeof value === 'object') {
        const objectValue = value as Record<string, unknown>;
        return `{${Object.keys(objectValue)
            .sort()
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${canonicalizeJson(objectValue[key])}`,
            )
            .join(',')}}`;
    }

    throw new TypeError(
        'Unsupported value encountered during canonical JSON serialization.',
    );
};

export const protocolPayloadSlotKey = (payload: ProtocolPayload): string => {
    const prefix = `${payload.sessionId}:${payload.phase}:${payload.participantIndex}:${payload.messageType}`;

    switch (payload.messageType) {
        case 'ballot-close':
            return `${payload.sessionId}:${payload.phase}:${payload.messageType}`;
        case 'encrypted-dual-share':
            return `${prefix}:${payload.recipientIndex}`;
        case 'complaint':
            return `${prefix}:${payload.dealerIndex}:${payload.envelopeId}`;
        case 'complaint-resolution':
            return `${prefix}:${payload.dealerIndex}:${payload.complainantIndex}:${payload.envelopeId}`;
        case 'phase-checkpoint':
            return `${prefix}:${payload.checkpointPhase}`;
        case 'feldman-share-reveal':
            return `${prefix}:${payload.dealerIndex}`;
        case 'ballot-submission':
        case 'decryption-share':
        case 'tally-publication':
            return `${prefix}:${payload.optionIndex}`;
        case 'ceremony-restart':
            return `${prefix}:${payload.previousSessionId}`;
        default:
            return prefix;
    }
};

export const canonicalUnsignedPayloadBytes = (
    payload: ProtocolPayload,
): Uint8Array => textEncoder.encode(canonicalizeJson(payload));

const compareStrings = (left: string, right: string): number => {
    if (left < right) {
        return -1;
    }

    if (left > right) {
        return 1;
    }

    return 0;
};

const bytesToHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export const compareProtocolPayloads = (
    left: ProtocolPayload,
    right: ProtocolPayload,
): number => {
    if (left.sessionId !== right.sessionId) {
        return compareStrings(left.sessionId, right.sessionId);
    }

    if (left.phase !== right.phase) {
        return left.phase - right.phase;
    }

    if (left.participantIndex !== right.participantIndex) {
        return left.participantIndex - right.participantIndex;
    }

    if (left.messageType !== right.messageType) {
        return compareStrings(left.messageType, right.messageType);
    }

    const leftSlotKey = protocolPayloadSlotKey(left);
    const rightSlotKey = protocolPayloadSlotKey(right);

    if (leftSlotKey !== rightSlotKey) {
        return compareStrings(leftSlotKey, rightSlotKey);
    }

    return compareStrings(
        bytesToHex(canonicalUnsignedPayloadBytes(left)),
        bytesToHex(canonicalUnsignedPayloadBytes(right)),
    );
};

export const sortProtocolPayloads = (
    payloads: readonly ProtocolPayload[],
): ProtocolPayload[] => [...payloads].sort(compareProtocolPayloads);
