import type { EncryptedMessage, PollResponse } from '@sealed-vote/contracts';

type LegacyPollResponse = PollResponse & {
    results?: unknown;
};

const isString = (value: unknown): value is string => typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const isEncryptedMessage = (value: unknown): value is EncryptedMessage =>
    typeof value === 'object' &&
    value !== null &&
    isString((value as { c1?: unknown }).c1) &&
    isString((value as { c2?: unknown }).c2);

const normalizeStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter(isString) : [];

const normalizeNumberArray = (value: unknown): number[] =>
    Array.isArray(value) ? value.filter(isFiniteNumber) : [];

const normalizeEncryptedTallies = (value: unknown): EncryptedMessage[] =>
    Array.isArray(value) ? value.filter(isEncryptedMessage) : [];

const normalizeStringMatrix = (value: unknown): string[][] =>
    Array.isArray(value) ? value.map(normalizeStringArray) : [];

export const normalizePollResponse = (
    poll: PollResponse | null | undefined,
): PollResponse | null => {
    if (!poll) {
        return null;
    }

    const legacyPoll = poll as LegacyPollResponse;

    return {
        id: poll.id,
        slug: poll.slug,
        pollName: poll.pollName,
        createdAt: poll.createdAt,
        choices: normalizeStringArray(legacyPoll.choices),
        voters: normalizeStringArray(legacyPoll.voters),
        isOpen: poll.isOpen,
        publicKeyShareCount: poll.publicKeyShareCount,
        encryptedVoteCount: poll.encryptedVoteCount,
        decryptionShareCount: poll.decryptionShareCount,
        commonPublicKey: poll.commonPublicKey,
        encryptedTallies: normalizeEncryptedTallies(
            legacyPoll.encryptedTallies,
        ),
        publishedDecryptionShares: normalizeStringMatrix(
            legacyPoll.publishedDecryptionShares,
        ),
        resultTallies: normalizeStringArray(legacyPoll.resultTallies),
        resultScores: normalizeNumberArray(
            Array.isArray(legacyPoll.resultScores)
                ? legacyPoll.resultScores
                : legacyPoll.results,
        ),
    };
};

export const hasPublishedResults = (
    poll: Pick<PollResponse, 'resultScores'> | null | undefined,
): boolean => Array.isArray(poll?.resultScores) && poll.resultScores.length > 0;
