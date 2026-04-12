export type ParticipantDeviceRecord = {
    authPublicKey: string;
    transportPublicKey: string;
    transportSuite: 'X25519';
};

export const serializeParticipantDeviceRecord = (
    value: ParticipantDeviceRecord,
): string => JSON.stringify(value);

const isTransportSuite = (value: unknown): value is 'X25519' =>
    value === 'X25519';

export const parseParticipantDeviceRecord = (
    value: string | null | undefined,
): ParticipantDeviceRecord | null => {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value) as Partial<ParticipantDeviceRecord>;

        if (
            typeof parsed.authPublicKey !== 'string' ||
            parsed.authPublicKey.length < 1 ||
            typeof parsed.transportPublicKey !== 'string' ||
            parsed.transportPublicKey.length < 1 ||
            !isTransportSuite(parsed.transportSuite)
        ) {
            return null;
        }

        return {
            authPublicKey: parsed.authPublicKey,
            transportPublicKey: parsed.transportPublicKey,
            transportSuite: parsed.transportSuite,
        };
    } catch {
        return null;
    }
};
