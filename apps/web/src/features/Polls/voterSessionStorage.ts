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

        return typeof parsedValue === 'object' && parsedValue !== null
            ? (parsedValue as StoredVoterSessions)
            : {};
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
