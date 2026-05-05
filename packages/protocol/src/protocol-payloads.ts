import type { ProtocolPayload } from 'threshold-elgamal';

const textEncoder = new TextEncoder();
const maxEncodedElementLength = 0xffff_ffff;

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

const protocolSignatureDomain = 'threshold-elgamal/protocol-signature';

const concatBytes = (...arrays: readonly Uint8Array[]): Uint8Array => {
    const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const array of arrays) {
        result.set(array, offset);
        offset += array.length;
    }

    return result;
};

const encodeLength = (length: number): Uint8Array => {
    if (
        !Number.isInteger(length) ||
        length < 0 ||
        length > maxEncodedElementLength
    ) {
        throw new TypeError(
            'Encoded element length must fit in a 32-bit unsigned integer.',
        );
    }

    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, length, false);
    return bytes;
};

const encodeForChallenge = (...elements: readonly Uint8Array[]): Uint8Array =>
    concatBytes(
        ...elements.map((element) =>
            concatBytes(encodeLength(element.length), element),
        ),
    );

export type ProtocolSlotKeyInput = {
    checkpointPhase?: number;
    complainantIndex?: number;
    dealerIndex?: number;
    envelopeId?: string;
    messageType: ProtocolPayload['messageType'];
    optionIndex?: number;
    participantIndex?: number;
    phase: number;
    recipientIndex?: number;
    sessionId: string;
};

const requireSlotValue = <TValue>(
    value: TValue | null | undefined,
    fieldName: string,
): TValue => {
    if (value === null || value === undefined) {
        throw new TypeError(`Protocol slot key requires ${fieldName}.`);
    }

    return value;
};

export const protocolSlotKey = (slot: ProtocolSlotKeyInput): string => {
    if (slot.messageType === 'ballot-close') {
        return `${slot.sessionId}:${slot.phase}:${slot.messageType}`;
    }

    const participantIndex = requireSlotValue(
        slot.participantIndex,
        'participantIndex',
    );
    const prefix = `${slot.sessionId}:${slot.phase}:${participantIndex}:${slot.messageType}`;

    switch (slot.messageType) {
        case 'encrypted-dual-share':
            return `${prefix}:${requireSlotValue(
                slot.recipientIndex,
                'recipientIndex',
            )}`;
        case 'complaint':
            return `${prefix}:${requireSlotValue(
                slot.dealerIndex,
                'dealerIndex',
            )}:${requireSlotValue(slot.envelopeId, 'envelopeId')}`;
        case 'complaint-resolution':
            return `${prefix}:${requireSlotValue(
                slot.dealerIndex,
                'dealerIndex',
            )}:${requireSlotValue(
                slot.complainantIndex,
                'complainantIndex',
            )}:${requireSlotValue(slot.envelopeId, 'envelopeId')}`;
        case 'phase-checkpoint':
            return `${prefix}:${requireSlotValue(
                slot.checkpointPhase,
                'checkpointPhase',
            )}`;
        case 'ballot-submission':
        case 'decryption-share':
        case 'tally-publication':
            return `${prefix}:${requireSlotValue(
                slot.optionIndex,
                'optionIndex',
            )}`;
        default:
            return prefix;
    }
};

export const protocolPayloadSlotKey = (payload: ProtocolPayload): string =>
    protocolSlotKey(payload);

export const canonicalUnsignedPayloadBytes = (
    payload: ProtocolPayload,
): Uint8Array => textEncoder.encode(canonicalizeJson(payload));

export const signedProtocolPayloadBytes = (
    payload: ProtocolPayload,
): Uint8Array =>
    encodeForChallenge(
        textEncoder.encode(protocolSignatureDomain),
        textEncoder.encode(payload.protocolVersion),
        canonicalUnsignedPayloadBytes(payload),
    );

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

const compareProtocolPayloads = (
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
