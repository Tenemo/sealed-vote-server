const creatorSessionsStorageKey = 'sealed-vote.creator-sessions.v1';

type StoredCreatorSession = {
    creatorToken: string;
    pollId: string;
    pollSlug: string;
};

type StoredCreatorSessions = Record<string, StoredCreatorSession>;

const canUseLocalStorage = (): boolean =>
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

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

        return typeof parsedValue === 'object' && parsedValue !== null
            ? (parsedValue as StoredCreatorSessions)
            : {};
    } catch {
        return {};
    }
};

const writeCreatorSessions = (sessions: StoredCreatorSessions): void => {
    if (!canUseLocalStorage()) {
        return;
    }

    if (!Object.keys(sessions).length) {
        window.localStorage.removeItem(creatorSessionsStorageKey);
        return;
    }

    window.localStorage.setItem(
        creatorSessionsStorageKey,
        JSON.stringify(sessions),
    );
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
