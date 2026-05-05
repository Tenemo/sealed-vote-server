import type { SignedPayload } from 'threshold-elgamal';

export type TypedSignedPayload<
    TMessageType extends SignedPayload['payload']['messageType'],
> = SignedPayload<
    Extract<SignedPayload['payload'], { messageType: TMessageType }>
>;

export const isSignedPayloadOfType = <
    TMessageType extends SignedPayload['payload']['messageType'],
>(
    signedPayload: SignedPayload,
    messageType: TMessageType,
): signedPayload is TypedSignedPayload<TMessageType> =>
    signedPayload.payload.messageType === messageType;

export const getSignedPayloadsOfType = <
    TMessageType extends SignedPayload['payload']['messageType'],
>(
    signedPayloads: readonly SignedPayload[],
    messageType: TMessageType,
): readonly TypedSignedPayload<TMessageType>[] =>
    signedPayloads.filter(
        (signedPayload): signedPayload is TypedSignedPayload<TMessageType> =>
            isSignedPayloadOfType(signedPayload, messageType),
    );

export const countSignedPayloadsOfType = (
    signedPayloads: readonly SignedPayload[],
    messageType: SignedPayload['payload']['messageType'],
): number => getSignedPayloadsOfType(signedPayloads, messageType).length;

export const filterSignedPayloadsBySession = ({
    sessionId,
    signedPayloads,
}: {
    sessionId: string | null;
    signedPayloads: readonly SignedPayload[];
}): SignedPayload[] =>
    sessionId
        ? signedPayloads.filter(
              (signedPayload) => signedPayload.payload.sessionId === sessionId,
          )
        : [];
