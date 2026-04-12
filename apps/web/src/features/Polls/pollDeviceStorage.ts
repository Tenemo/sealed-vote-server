import {
    exportAuthPublicKey,
    exportTransportPublicKey,
    generateAuthKeyPair,
    generateTransportKeyPair,
    type SignedPayload,
} from 'threshold-elgamal';

type StoredPollDeviceState = {
    authPrivateKeyPkcs8: string;
    authPublicKey: string;
    dkgBlindingSeed: string;
    dkgSecretSeed: string;
    isCreatorParticipant: boolean;
    pendingPayloads: Record<string, SignedPayload>;
    pollId: string;
    pollSlug: string;
    storedBallotScores: number[] | null;
    transportPrivateKeyPkcs8: string;
    transportPublicKey: string;
    transportSuite: 'X25519';
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

const bytesToHex = (bytes: Uint8Array): string =>
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hexValue: string): Uint8Array => {
    const normalized = hexValue.trim();
    const bytes = new Uint8Array(normalized.length / 2);

    for (let index = 0; index < normalized.length; index += 2) {
        bytes[index / 2] = Number.parseInt(
            normalized.slice(index, index + 2),
            16,
        );
    }

    return bytes;
};

const canUseLocalStorage = (): boolean =>
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isTransportSuite = (value: unknown): value is 'X25519' =>
    value === 'X25519';

const isSignedPayloadRecord = (
    value: unknown,
): value is Record<string, SignedPayload> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every(
        (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            'payload' in entry &&
            'signature' in entry,
    );
};

const isStoredBallotScores = (value: unknown): value is number[] | null =>
    value === null ||
    (Array.isArray(value) &&
        value.every(
            (score) =>
                typeof score === 'number' &&
                Number.isInteger(score) &&
                score >= 1 &&
                score <= 10,
        ));

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
        typeof candidate.isCreatorParticipant === 'boolean' &&
        isSignedPayloadRecord(candidate.pendingPayloads) &&
        typeof candidate.pollId === 'string' &&
        candidate.pollId.length > 0 &&
        typeof candidate.pollSlug === 'string' &&
        candidate.pollSlug.length > 0 &&
        isStoredBallotScores(candidate.storedBallotScores) &&
        typeof candidate.transportPrivateKeyPkcs8 === 'string' &&
        candidate.transportPrivateKeyPkcs8.length > 0 &&
        typeof candidate.transportPublicKey === 'string' &&
        candidate.transportPublicKey.length > 0 &&
        isTransportSuite(candidate.transportSuite) &&
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
            name: 'Ed25519',
        },
        false,
        ['sign'],
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
    storedBallotScores,
    voterIndex,
    voterName,
    voterToken,
    isCreatorParticipant = false,
}: {
    pendingState?: PendingPollDeviceState;
    pollId: string;
    pollSlug: string;
    storedBallotScores: number[];
    voterIndex: number;
    voterName: string;
    voterToken: string;
    isCreatorParticipant?: boolean;
}): Promise<StoredPollDeviceState> => {
    const baseState = pendingState ?? (await createPendingPollDeviceState());

    return {
        ...baseState,
        isCreatorParticipant,
        pendingPayloads: {},
        pollId,
        pollSlug,
        storedBallotScores: [...storedBallotScores],
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

export const updatePollDeviceState = (
    pollId: string,
    updater: (state: StoredPollDeviceState) => StoredPollDeviceState,
): StoredPollDeviceState | null => {
    const storedStates = readStoredStates();
    const currentState = storedStates[pollId];

    if (!currentState) {
        return null;
    }

    const nextState = updater(currentState);
    storedStates[pollId] = nextState;
    writeStoredStates(storedStates);
    return nextState;
};

export const savePendingPayloadIfAbsent = ({
    pollId,
    signedPayload,
    slotKey,
}: {
    pollId: string;
    signedPayload: SignedPayload;
    slotKey: string;
}): SignedPayload | null => {
    const nextState = updatePollDeviceState(pollId, (currentState) => {
        if (currentState.pendingPayloads[slotKey]) {
            return currentState;
        }

        return {
            ...currentState,
            pendingPayloads: {
                ...currentState.pendingPayloads,
                [slotKey]: signedPayload,
            },
        };
    });

    return nextState?.pendingPayloads[slotKey] ?? null;
};

export const prunePendingPayloadsForSession = ({
    pollId,
    sessionId,
}: {
    pollId: string;
    sessionId: string;
}): StoredPollDeviceState | null =>
    updatePollDeviceState(pollId, (currentState) => ({
        ...currentState,
        pendingPayloads: Object.fromEntries(
            Object.entries(currentState.pendingPayloads).filter(
                ([, payload]) => payload.payload.sessionId === sessionId,
            ),
        ),
    }));

export const clearStoredBallotScores = (
    pollId: string,
): StoredPollDeviceState | null =>
    updatePollDeviceState(pollId, (currentState) => ({
        ...currentState,
        storedBallotScores: null,
    }));

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
    await window.crypto.subtle.importKey(
        'pkcs8',
        toWebCryptoBuffer(state.transportPrivateKeyPkcs8),
        {
            name: 'X25519',
        },
        false,
        ['deriveBits'],
    );

export type { PendingPollDeviceState, StoredPollDeviceState };
