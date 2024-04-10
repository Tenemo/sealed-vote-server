import { EncryptedMessage } from 'threshold-elgamal';

export const serializeEncryptedMessage = (
    message: EncryptedMessage,
): {
    c1: string;
    c2: string;
} => ({ c1: message.c1.toString(), c2: message.c2.toString() });

export const deserializeEncryptedMessage = (message: {
    c1: string;
    c2: string;
}): EncryptedMessage => ({ c1: BigInt(message.c1), c2: BigInt(message.c2) });
