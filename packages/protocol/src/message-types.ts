import type { ProtocolMessageType } from 'threshold-elgamal';

export const protocolMessageTypes = [
    'manifest-publication',
    'registration',
    'manifest-acceptance',
    'phase-checkpoint',
    'pedersen-commitment',
    'encrypted-dual-share',
    'complaint',
    'complaint-resolution',
    'feldman-commitment',
    'key-derivation-confirmation',
    'ballot-submission',
    'ballot-close',
    'decryption-share',
    'tally-publication',
] as const satisfies readonly ProtocolMessageType[];

type AssertTrue<T extends true> = T;

const protocolMessageTypesAreExhaustive: AssertTrue<
    ProtocolMessageType extends (typeof protocolMessageTypes)[number]
        ? true
        : false
> = true;
void protocolMessageTypesAreExhaustive;

const protocolMessageTypeSet = new Set<string>(protocolMessageTypes);

export const isProtocolMessageType = (
    value: unknown,
): value is ProtocolMessageType =>
    typeof value === 'string' && protocolMessageTypeSet.has(value);
