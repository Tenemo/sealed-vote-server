const creatorSessionsStorageKey = 'sealed-vote.creator-sessions.v1';

export type StoredCreatorSession = {
    creatorToken: string;
    pollId: string;
    pollSlug: string;
};

type StoredCreatorSessions = Record<string, StoredCreatorSession>;

const canUseLocalStorage = (): boolean =>
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isStoredCreatorSession = (
    value: unknown,
): value is StoredCreatorSession => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoredCreatorSession>;

    return (
        typeof candidate.creatorToken === 'string' &&
        candidate.creatorToken.length > 0 &&
        typeof candidate.pollId === 'string' &&
        candidate.pollId.length > 0 &&
        typeof candidate.pollSlug === 'string' &&
        candidate.pollSlug.length > 0
    );
};

const readCreatorSessions = (): StoredCreatorSessions => {
    if (!canUseLocalStorage()) {
        return {};
    }

    try {
        const rawValue = window.localStorage.getItem(creatorSessionsStorageKey);

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
                    isStoredCreatorSession(session) &&
                    session.pollId === pollId,
            ),
        ) as StoredCreatorSessions;
    } catch {
        return {};
    }
};

const writeCreatorSessions = (sessions: StoredCreatorSessions): void => {
    if (!canUseLocalStorage()) {
        return;
    }

    try {
        if (!Object.keys(sessions).length) {
            window.localStorage.removeItem(creatorSessionsStorageKey);
            return;
        }

        window.localStorage.setItem(
            creatorSessionsStorageKey,
            JSON.stringify(sessions),
        );
    } catch {
        return;
    }
};

export const saveCreatorSession = (session: StoredCreatorSession): void => {
    const sessions = readCreatorSessions();
    sessions[session.pollId] = session;
    writeCreatorSessions(sessions);
};

export const removeCreatorSession = (pollId: string): void => {
    const sessions = readCreatorSessions();

    if (!sessions[pollId]) {
        return;
    }

    delete sessions[pollId];
    writeCreatorSessions(sessions);
};

export const findCreatorSessionByPollId = (
    pollId: string,
): StoredCreatorSession | null => readCreatorSessions()[pollId] ?? null;

export const findCreatorSessionByPollSlug = (
    pollSlug: string,
): StoredCreatorSession | null =>
    Object.values(readCreatorSessions()).find(
        (session) => session.pollSlug === pollSlug,
    ) ?? null;
