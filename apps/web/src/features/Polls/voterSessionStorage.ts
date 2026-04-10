const voterSessionsStorageKey = 'sealed-vote.voter-sessions.v1';

export type StoredVoterSession = {
    pollId: string;
    pollSlug: string;
    voterIndex: number;
    voterName: string;
    voterToken: string;
};

type StoredVoterSessions = Record<string, StoredVoterSession>;

const canUseLocalStorage = (): boolean =>
    typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isStoredVoterSession = (value: unknown): value is StoredVoterSession => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<StoredVoterSession>;

    return (
        typeof candidate.pollId === 'string' &&
        candidate.pollId.length > 0 &&
        typeof candidate.pollSlug === 'string' &&
        candidate.pollSlug.length > 0 &&
        typeof candidate.voterIndex === 'number' &&
        Number.isInteger(candidate.voterIndex) &&
        candidate.voterIndex > 0 &&
        typeof candidate.voterName === 'string' &&
        candidate.voterName.length > 0 &&
        typeof candidate.voterToken === 'string' &&
        candidate.voterToken.length > 0
    );
};

const readVoterSessions = (): StoredVoterSessions => {
    if (!canUseLocalStorage()) {
        return {};
    }

    try {
        const rawValue = window.localStorage.getItem(voterSessionsStorageKey);

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
                    isStoredVoterSession(session) && session.pollId === pollId,
            ),
        ) as StoredVoterSessions;
    } catch {
        return {};
    }
};

const writeVoterSessions = (sessions: StoredVoterSessions): void => {
    if (!canUseLocalStorage()) {
        return;
    }

    try {
        if (!Object.keys(sessions).length) {
            window.localStorage.removeItem(voterSessionsStorageKey);
            return;
        }

        window.localStorage.setItem(
            voterSessionsStorageKey,
            JSON.stringify(sessions),
        );
    } catch {
        return;
    }
};

export const saveVoterSession = (session: StoredVoterSession): void => {
    const sessions = readVoterSessions();
    sessions[session.pollId] = session;
    writeVoterSessions(sessions);
};

export const removeVoterSession = (pollId: string): void => {
    const sessions = readVoterSessions();

    if (!sessions[pollId]) {
        return;
    }

    delete sessions[pollId];
    writeVoterSessions(sessions);
};

export const findVoterSessionByPollId = (
    pollId: string,
): StoredVoterSession | null => readVoterSessions()[pollId] ?? null;

export const findVoterSessionByPollSlug = (
    pollSlug: string,
): StoredVoterSession | null =>
    Object.values(readVoterSessions()).find(
        (session) => session.pollSlug === pollSlug,
    ) ?? null;
