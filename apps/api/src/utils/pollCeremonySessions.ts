import { asc, desc, eq } from 'drizzle-orm';
import {
    createElectionManifest,
    deriveSessionId,
    hashElectionManifest,
    hashRosterEntries,
    type EncodedAuthPublicKey,
    type EncodedTransportPublicKey,
    type ElectionManifest,
} from 'threshold-elgamal';

import type { Database, DatabaseTransaction } from '../db/client.js';
import { pollCeremonySessions } from '../db/schema.js';

import { normalizeDatabaseTimestamp } from './db.js';
import { parseParticipantDeviceRecord } from './participantDevices.js';

type ReadOnlyDatabase = Database | DatabaseTransaction;

export type PollCeremonySessionRow = typeof pollCeremonySessions.$inferSelect;
type PollCeremonySessionSnapshot = Pick<
    PollCeremonySessionRow,
    'activeParticipantIndices' | 'createdAt' | 'sequence'
>;

export type CeremonyParticipantRow = {
    id: string;
    voterIndex: number;
    voterName: string;
    publicKeyShares: {
        publicKeyShare: string;
    }[];
};

type ActiveCeremonyParticipant = {
    assignedParticipantIndex: number;
    authPublicKey: string | null;
    deviceReady: boolean;
    originalParticipantIndex: number;
    transportPublicKey: string | null;
    transportSuite: 'X25519' | null;
    voterId: string;
    voterName: string;
};

export type DerivedPollCeremonySession = {
    activeParticipantCount: number;
    activeParticipantIndices: number[];
    activeParticipants: ActiveCeremonyParticipant[];
    assignedParticipantIndexByOriginalParticipantIndex: ReadonlyMap<
        number,
        number
    >;
    currentSequence: number;
    manifest: ElectionManifest | null;
    manifestHash: string | null;
    originalParticipantIndexByAssignedParticipantIndex: ReadonlyMap<
        number,
        number
    >;
    restartCount: number;
    rosterEntries: {
        authPublicKey: string;
        participantIndex: number;
        transportPublicKey: string;
        transportSuite: 'X25519';
        voterName: string;
    }[];
    rosterHash: string | null;
    sessionId: string | null;
    skippedParticipantIndices: number[];
};

const asEncodedAuthPublicKey = (value: string): EncodedAuthPublicKey =>
    value as EncodedAuthPublicKey;

const asEncodedTransportPublicKey = (
    value: string,
): EncodedTransportPublicKey => value as EncodedTransportPublicKey;

export const normalizeCeremonyParticipantIndices = (
    participantIndices: readonly number[],
): number[] =>
    [...new Set(participantIndices)]
        .filter(
            (participantIndex) =>
                Number.isInteger(participantIndex) && participantIndex > 0,
        )
        .sort((left, right) => left - right);

export const getPollCeremonySessions = async (
    db: ReadOnlyDatabase,
    pollId: string,
): Promise<PollCeremonySessionRow[]> =>
    await db
        .select()
        .from(pollCeremonySessions)
        .where(eq(pollCeremonySessions.pollId, pollId))
        .orderBy(asc(pollCeremonySessions.sequence));

const mapActiveParticipants = ({
    activeParticipantIndices,
    participants,
}: {
    activeParticipantIndices: readonly number[];
    participants: readonly CeremonyParticipantRow[];
}): ActiveCeremonyParticipant[] => {
    const participantByOriginalIndex = new Map(
        participants.map((participant) => [
            participant.voterIndex,
            participant,
        ]),
    );

    return activeParticipantIndices.flatMap(
        (
            originalParticipantIndex,
            offset,
        ): ActiveCeremonyParticipant | ActiveCeremonyParticipant[] => {
            const participant = participantByOriginalIndex.get(
                originalParticipantIndex,
            );

            if (!participant) {
                return [];
            }

            const deviceRecord = parseParticipantDeviceRecord(
                participant.publicKeyShares[0]?.publicKeyShare,
            );

            return {
                assignedParticipantIndex: offset + 1,
                authPublicKey: deviceRecord?.authPublicKey ?? null,
                deviceReady: deviceRecord !== null,
                originalParticipantIndex,
                transportPublicKey: deviceRecord?.transportPublicKey ?? null,
                transportSuite: deviceRecord?.transportSuite ?? null,
                voterId: participant.id,
                voterName: participant.voterName,
            };
        },
    );
};

export const derivePollCeremonySession = async ({
    choices,
    isOpen,
    participants,
    persistedSessions,
    pollCreatedAt,
    pollId,
}: {
    choices: readonly string[];
    isOpen: boolean;
    participants: readonly CeremonyParticipantRow[];
    persistedSessions: readonly PollCeremonySessionSnapshot[];
    pollCreatedAt: Date | string;
    pollId: string;
}): Promise<DerivedPollCeremonySession> => {
    const latestSession =
        persistedSessions.length > 0
            ? persistedSessions[persistedSessions.length - 1]
            : null;
    const allParticipantIndices = normalizeCeremonyParticipantIndices(
        participants.map((participant) => participant.voterIndex),
    );
    const activeParticipantIndices = isOpen
        ? allParticipantIndices
        : latestSession
          ? normalizeCeremonyParticipantIndices(
                latestSession.activeParticipantIndices,
            )
          : allParticipantIndices;
    const activeParticipants = mapActiveParticipants({
        activeParticipantIndices,
        participants,
    });
    const skippedParticipantIndices = allParticipantIndices.filter(
        (participantIndex) =>
            !activeParticipantIndices.includes(participantIndex),
    );
    const assignedParticipantIndexByOriginalParticipantIndex = new Map(
        activeParticipants.map((participant) => [
            participant.originalParticipantIndex,
            participant.assignedParticipantIndex,
        ]),
    );
    const originalParticipantIndexByAssignedParticipantIndex = new Map(
        activeParticipants.map((participant) => [
            participant.assignedParticipantIndex,
            participant.originalParticipantIndex,
        ]),
    );
    const rosterEntries = activeParticipants
        .filter(
            (
                participant,
            ): participant is ActiveCeremonyParticipant & {
                authPublicKey: string;
                transportPublicKey: string;
                transportSuite: 'X25519';
            } =>
                participant.authPublicKey !== null &&
                participant.transportPublicKey !== null &&
                participant.transportSuite !== null,
        )
        .map((participant) => ({
            authPublicKey: participant.authPublicKey,
            participantIndex: participant.assignedParticipantIndex,
            transportPublicKey: participant.transportPublicKey,
            transportSuite: participant.transportSuite,
            voterName: participant.voterName,
        }));
    const rosterHash =
        !isOpen && rosterEntries.length === activeParticipants.length
            ? await hashRosterEntries(
                  rosterEntries.map((entry) => ({
                      authPublicKey: asEncodedAuthPublicKey(
                          entry.authPublicKey,
                      ),
                      participantIndex: entry.participantIndex,
                      transportPublicKey: asEncodedTransportPublicKey(
                          entry.transportPublicKey,
                      ),
                  })),
              )
            : null;
    const manifest =
        rosterHash && !isOpen
            ? createElectionManifest({
                  optionList: choices,
                  rosterHash,
              })
            : null;
    const manifestHash = manifest ? await hashElectionManifest(manifest) : null;
    const sessionTimestamp = latestSession
        ? normalizeDatabaseTimestamp(latestSession.createdAt)
        : normalizeDatabaseTimestamp(pollCreatedAt);
    const sessionId =
        manifest && manifestHash && rosterHash
            ? await deriveSessionId(
                  manifestHash,
                  rosterHash,
                  pollId,
                  sessionTimestamp,
              )
            : null;

    return {
        activeParticipantCount: activeParticipants.length,
        activeParticipantIndices,
        activeParticipants,
        assignedParticipantIndexByOriginalParticipantIndex,
        currentSequence: latestSession?.sequence ?? (isOpen ? 0 : 1),
        manifest,
        manifestHash,
        originalParticipantIndexByAssignedParticipantIndex,
        restartCount: latestSession ? latestSession.sequence - 1 : 0,
        rosterEntries,
        rosterHash,
        sessionId,
        skippedParticipantIndices,
    };
};

export const insertPollCeremonySession = async ({
    activeParticipantIndices,
    pollId,
    tx,
}: {
    activeParticipantIndices: readonly number[];
    pollId: string;
    tx: DatabaseTransaction;
}): Promise<PollCeremonySessionRow> => {
    const [latestSession] = await tx
        .select({
            sequence: pollCeremonySessions.sequence,
        })
        .from(pollCeremonySessions)
        .where(eq(pollCeremonySessions.pollId, pollId))
        .orderBy(desc(pollCeremonySessions.sequence))
        .limit(1);

    const [insertedSession] = await tx
        .insert(pollCeremonySessions)
        .values({
            pollId,
            sequence: (latestSession?.sequence ?? 0) + 1,
            activeParticipantIndices: normalizeCeremonyParticipantIndices(
                activeParticipantIndices,
            ),
        })
        .returning();

    if (!insertedSession) {
        throw new Error('The poll ceremony session could not be stored.');
    }

    return insertedSession;
};
