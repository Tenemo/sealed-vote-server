import type { EncryptedMessage } from '@sealed-vote/contracts';

export const areStringArraysEqual = (
    left: readonly string[],
    right: readonly string[],
): boolean =>
    left.length === right.length &&
    left.every((value, index) => value === right[index]);

export const areEncryptedMessagesEqual = (
    left: readonly EncryptedMessage[],
    right: readonly EncryptedMessage[],
): boolean =>
    left.length === right.length &&
    left.every(
        (value, index) =>
            value.c1 === right[index]?.c1 && value.c2 === right[index]?.c2,
    );
