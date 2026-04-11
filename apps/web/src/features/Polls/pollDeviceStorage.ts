import { bytesToHex, hexToBytes } from 'threshold-elgamal';
import {
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateAuthKeyPair,
    generateTransportKeyPair,
    type KeyAgreementSuite,
} from 'threshold-elgamal';

type StoredPollDeviceState = {
    authPrivateKeyPkcs8: string;
    authPublicKey: string;
    dkgBlindingSeed: string;
    dkgSecretSeed: string;
    pollId: string;
    pollSlug: string;
    transportPrivateKeyPkcs8: string;
    transportPublicKey: string;
    transportSuite: KeyAgreementSuite;
    voterIndex: number;
    voterName: string;
    voterToken: string;
};

type PendingPollDeviceState = Pick<
    StoredPollDeviceState,
    | 'authPrivateKeyPkcs8'
    | 'authPublicKey'
    | 'dkgBlindingSeed'
    | 'dkgSecretSeed'
    | 'transportPrivateKeyPkcs8'
    | 'transportPublicKey'
    | 'transportSuite'
>;

type StoredPollDeviceStates = Record<string, StoredPollDeviceState>;

const storageKey = 'sealed-vote.poll-device-state.v1';

const canUseLocalStorage = (): boolean =>
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isKeyAgreementSuite = (value: unknown): value is KeyAgreementSuite =>
    value === 'X25519' || value === 'P-256';

const isStoredPollDeviceState = (
    value: unknown,
): value is StoredPollDeviceState => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoredPollDeviceState>;

    return (
        typeof candidate.authPrivateKeyPkcs8 === 'string' &&
        candidate.authPrivateKeyPkcs8.length > 0 &&
        typeof candidate.authPublicKey === 'string' &&
        candidate.authPublicKey.length > 0 &&
        typeof candidate.dkgBlindingSeed === 'string' &&
        candidate.dkgBlindingSeed.length > 0 &&
        typeof candidate.dkgSecretSeed === 'string' &&
        candidate.dkgSecretSeed.length > 0 &&
        typeof candidate.pollId === 'string' &&
        candidate.pollId.length > 0 &&
        typeof candidate.pollSlug === 'string' &&
        candidate.pollSlug.length > 0 &&
        typeof candidate.transportPrivateKeyPkcs8 === 'string' &&
        candidate.transportPrivateKeyPkcs8.length > 0 &&
        typeof candidate.transportPublicKey === 'string' &&
        candidate.transportPublicKey.length > 0 &&
        isKeyAgreementSuite(candidate.transportSuite) &&
        typeof candidate.voterIndex === 'number' &&
        Number.isInteger(candidate.voterIndex) &&
        candidate.voterIndex > 0 &&
        typeof candidate.voterName === 'string' &&
        candidate.voterName.length > 0 &&
        typeof candidate.voterToken === 'string' &&
        candidate.voterToken.length > 0
    );
};

const readStoredStates = (): StoredPollDeviceStates => {
    if (!canUseLocalStorage()) {
        return {};
    }

    try {
        const rawValue = window.localStorage.getItem(storageKey);

        if (!rawValue) {
            return {};
        }

        const parsedValue = JSON.parse(rawValue);

        if (
            typeof parsedValue !== 'object' ||
            parsedValue === null ||
            Array.isArray(parsedValue)
        ) {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsedValue).filter(
                ([pollId, value]) =>
                    isStoredPollDeviceState(value) && value.pollId === pollId,
            ),
        ) as StoredPollDeviceStates;
    } catch {
        return {};
    }
};

const writeStoredStates = (states: StoredPollDeviceStates): void => {
    if (!canUseLocalStorage()) {
        return;
    }

    try {
        if (Object.keys(states).length === 0) {
            window.localStorage.removeItem(storageKey);
            return;
        }

        window.localStorage.setItem(storageKey, JSON.stringify(states));
    } catch {
        return;
    }
};

const exportAuthPrivateKey = async (privateKey: CryptoKey): Promise<string> => {
    const exportedKey = await window.crypto.subtle.exportKey(
        'pkcs8',
        privateKey,
    );

    return bytesToHex(new Uint8Array(exportedKey));
};

const exportTransportPrivateKey = async (
    privateKey: CryptoKey,
): Promise<string> => {
    const exportedKey = await window.crypto.subtle.exportKey(
        'pkcs8',
        privateKey,
    );

    return bytesToHex(new Uint8Array(exportedKey));
};

const toWebCryptoBuffer = (hexValue: string): ArrayBuffer => {
    const bytes = Uint8Array.from(hexToBytes(hexValue));

    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    );
};

export const importStoredAuthPrivateKey = async (
    authPrivateKeyPkcs8: string,
): Promise<CryptoKey> =>
    await window.crypto.subtle.importKey(
        'pkcs8',
        toWebCryptoBuffer(authPrivateKeyPkcs8),
        {
            name: 'ECDSA',
            namedCurve: 'P-256',
        },
        false,
        ['sign'],
    );

const importTransportPrivateKey = async (
    transportPrivateKeyPkcs8: string,
    suite: KeyAgreementSuite,
): Promise<CryptoKey> =>
    await window.crypto.subtle.importKey(
        'pkcs8',
        toWebCryptoBuffer(transportPrivateKeyPkcs8),
        suite === 'X25519'
            ? {
                  name: 'X25519',
              }
            : {
                  name: 'ECDH',
                  namedCurve: 'P-256',
              },
        false,
        ['deriveBits'],
    );

const generateSeedHex = (): string => {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
};

export const createPendingPollDeviceState =
    async (): Promise<PendingPollDeviceState> => {
        const authKeyPair = await generateAuthKeyPair({
            extractable: true,
        });
        const transportKeyPair = await generateTransportKeyPair({
            extractable: true,
        });

        return {
            authPrivateKeyPkcs8: await exportAuthPrivateKey(
                authKeyPair.privateKey,
            ),
            authPublicKey: await exportAuthPublicKey(authKeyPair.publicKey),
            dkgBlindingSeed: generateSeedHex(),
            dkgSecretSeed: generateSeedHex(),
            transportPrivateKeyPkcs8: await exportTransportPrivateKey(
                transportKeyPair.privateKey,
            ),
            transportPublicKey: await exportTransportPublicKey(
                transportKeyPair.publicKey,
            ),
            transportSuite: transportKeyPair.suite,
        };
    };

export const createPollDeviceState = async ({
    pendingState,
    pollId,
    pollSlug,
    voterIndex,
    voterName,
    voterToken,
}: {
    pendingState?: PendingPollDeviceState;
    pollId: string;
    pollSlug: string;
    voterIndex: number;
    voterName: string;
    voterToken: string;
}): Promise<StoredPollDeviceState> => {
    const baseState = pendingState ?? (await createPendingPollDeviceState());

    return {
        ...baseState,
        pollId,
        pollSlug,
        voterIndex,
        voterName,
        voterToken,
    };
};

export const savePollDeviceState = (state: StoredPollDeviceState): void => {
    const storedStates = readStoredStates();
    storedStates[state.pollId] = state;
    writeStoredStates(storedStates);
};

export const findPollDeviceStateByPollId = (
    pollId: string,
): StoredPollDeviceState | null => readStoredStates()[pollId] ?? null;

export const findPollDeviceStateByPollSlug = (
    pollSlug: string,
): StoredPollDeviceState | null =>
    Object.values(readStoredStates()).find(
        (state) => state.pollSlug === pollSlug,
    ) ?? null;

export const removePollDeviceState = (pollId: string): void => {
    const storedStates = readStoredStates();

    if (!storedStates[pollId]) {
        return;
    }

    delete storedStates[pollId];
    writeStoredStates(storedStates);
};

export const restoreStoredTransportPrivateKey = async (
    state: StoredPollDeviceState,
): Promise<CryptoKey> =>
    await importTransportPrivateKey(
        state.transportPrivateKeyPkcs8,
        state.transportSuite,
    );

export type { PendingPollDeviceState, StoredPollDeviceState };
