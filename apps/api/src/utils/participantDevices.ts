import type { KeyAgreementSuite } from 'threshold-elgamal';

export type ParticipantDeviceRecord = {
    authPublicKey: string;
    transportPublicKey: string;
    transportSuite: KeyAgreementSuite;
};

export const serializeParticipantDeviceRecord = (
    value: ParticipantDeviceRecord,
): string => JSON.stringify(value);

const isKeyAgreementSuite = (value: unknown): value is KeyAgreementSuite =>
    value === 'X25519' || value === 'P-256';

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
            !isKeyAgreementSuite(parsed.transportSuite)
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
