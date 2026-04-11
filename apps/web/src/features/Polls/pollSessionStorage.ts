type StoredPollSession = {
    pollId: string;
    pollSlug: string;
};

type StoredSessions<TSession extends StoredPollSession> = Record<
    string,
    TSession
>;

type PollSessionStorageOptions<TSession extends StoredPollSession> = {
    isStoredSession: (value: unknown) => value is TSession;
    storageKey: string;
};

type PollSessionStorage<TSession extends StoredPollSession> = {
    saveSession: (session: TSession) => void;
    removeSession: (pollId: string) => void;
    findSessionByPollId: (pollId: string) => TSession | null;
    findSessionByPollSlug: (pollSlug: string) => TSession | null;
};

export type StoredCreatorSession = {
    creatorToken: string;
    pollId: string;
    pollSlug: string;
};

export type StoredVoterSession = {
    pollId: string;
    pollSlug: string;
    voterIndex: number;
    voterName: string;
    voterToken: string;
};

const creatorSessionsStorageKey = 'sealed-vote.creator-sessions.v1';
const voterSessionsStorageKey = 'sealed-vote.voter-sessions.v1';

const canUseLocalStorage = (): boolean =>
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0;

const readStoredSessions = <TSession extends StoredPollSession>({
    isStoredSession,
    storageKey,
}: PollSessionStorageOptions<TSession>): StoredSessions<TSession> => {
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
                ([pollId, session]) =>
                    isStoredSession(session) && session.pollId === pollId,
            ),
        ) as StoredSessions<TSession>;
    } catch {
        return {};
    }
};

const writeStoredSessions = <TSession extends StoredPollSession>(
    storageKey: string,
    sessions: StoredSessions<TSession>,
): void => {
    if (!canUseLocalStorage()) {
        return;
    }

    try {
        if (!Object.keys(sessions).length) {
            window.localStorage.removeItem(storageKey);
            return;
        }

        window.localStorage.setItem(storageKey, JSON.stringify(sessions));
    } catch {
        return;
    }
};

const createPollSessionStorage = <TSession extends StoredPollSession>(
    options: PollSessionStorageOptions<TSession>,
): PollSessionStorage<TSession> => ({
    saveSession: (session: TSession): void => {
        const sessions = readStoredSessions(options);
        sessions[session.pollId] = session;
        writeStoredSessions(options.storageKey, sessions);
    },
    removeSession: (pollId: string): void => {
        const sessions = readStoredSessions(options);

        if (!sessions[pollId]) {
            return;
        }

        delete sessions[pollId];
        writeStoredSessions(options.storageKey, sessions);
    },
    findSessionByPollId: (pollId: string): TSession | null =>
        readStoredSessions(options)[pollId] ?? null,
    findSessionByPollSlug: (pollSlug: string): TSession | null =>
        Object.values(readStoredSessions(options)).find(
            (session) => session.pollSlug === pollSlug,
        ) ?? null,
});

const isStoredCreatorSession = (
    value: unknown,
): value is StoredCreatorSession => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoredCreatorSession>;

    return (
        isNonEmptyString(candidate.creatorToken) &&
        isNonEmptyString(candidate.pollId) &&
        isNonEmptyString(candidate.pollSlug)
    );
};

const isStoredVoterSession = (value: unknown): value is StoredVoterSession => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoredVoterSession>;

    return (
        isNonEmptyString(candidate.pollId) &&
        isNonEmptyString(candidate.pollSlug) &&
        typeof candidate.voterIndex === 'number' &&
        Number.isInteger(candidate.voterIndex) &&
        candidate.voterIndex > 0 &&
        isNonEmptyString(candidate.voterName) &&
        isNonEmptyString(candidate.voterToken)
    );
};

const creatorSessionStorage = createPollSessionStorage({
    isStoredSession: isStoredCreatorSession,
    storageKey: creatorSessionsStorageKey,
});

const voterSessionStorage = createPollSessionStorage({
    isStoredSession: isStoredVoterSession,
    storageKey: voterSessionsStorageKey,
});

export const {
    findSessionByPollId: findCreatorSessionByPollId,
    findSessionByPollSlug: findCreatorSessionByPollSlug,
    removeSession: removeCreatorSession,
    saveSession: saveCreatorSession,
} = creatorSessionStorage;

export const {
    findSessionByPollId: findVoterSessionByPollId,
    findSessionByPollSlug: findVoterSessionByPollSlug,
    removeSession: removeVoterSession,
    saveSession: saveVoterSession,
} = voterSessionStorage;
