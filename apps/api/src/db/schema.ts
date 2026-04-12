import { relations, sql } from 'drizzle-orm';
import {
    boolean,
    char,
    foreignKey,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import type { SignedPayload } from 'threshold-elgamal';

export const polls = pgTable(
    'polls',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        pollName: text('poll_name').notNull(),
        slug: text('slug').notNull(),
        creatorTokenHash: char('creator_token_hash', { length: 64 }).notNull(),
        isOpen: boolean('is_open').notNull().default(true),
        protocolVersion: text('protocol_version').notNull().default('v1'),
        createdAt: timestamp('created_at', {
            mode: 'date',
            withTimezone: false,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique('unique_poll_slug').on(table.slug),
        unique('unique_creator_token_hash').on(table.creatorTokenHash),
    ],
);

export const choices = pgTable(
    'choices',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        choiceName: text('choice_name').notNull(),
        pollId: uuid('poll_id').notNull(),
        choiceIndex: integer('index').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.pollId],
            foreignColumns: [polls.id],
            name: 'fk_choices_poll_id',
        }).onDelete('cascade'),
        unique('unique_choice_name_per_poll').on(
            table.pollId,
            table.choiceName,
        ),
        unique('unique_choice_index_per_poll').on(
            table.pollId,
            table.choiceIndex,
        ),
    ],
);

export const voters = pgTable(
    'voters',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        voterName: text('voter_name').notNull(),
        voterIndex: integer('voter_index').notNull(),
        pollId: uuid('poll_id').notNull(),
        voterTokenHash: char('voter_token_hash', { length: 64 }).notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.pollId],
            foreignColumns: [polls.id],
            name: 'fk_voters_poll_id',
        }).onDelete('cascade'),
        unique('unique_voter_name_per_poll').on(table.pollId, table.voterName),
        unique('unique_voter_index_per_poll').on(
            table.pollId,
            table.voterIndex,
        ),
        unique('unique_voter_token_hash_per_poll').on(
            table.pollId,
            table.voterTokenHash,
        ),
    ],
);

export const boardMessages = pgTable(
    'board_messages',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        pollId: uuid('poll_id').notNull(),
        participantIndex: integer('participant_index').notNull(),
        phase: integer('phase').notNull(),
        messageType: text('message_type').notNull(),
        slotKey: text('slot_key').notNull(),
        unsignedHash: char('unsigned_hash', { length: 64 }).notNull(),
        previousEntryHash: char('previous_entry_hash', { length: 64 }),
        entryHash: char('entry_hash', { length: 64 }).notNull(),
        signedPayload: jsonb('signed_payload').$type<SignedPayload>().notNull(),
        createdAt: timestamp('created_at', {
            mode: 'date',
            withTimezone: false,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        foreignKey({
            columns: [table.pollId],
            foreignColumns: [polls.id],
            name: 'fk_board_messages_poll_id',
        }).onDelete('cascade'),
        unique('unique_board_message_entry_hash').on(table.entryHash),
    ],
);

export const pollCeremonySessions = pgTable(
    'poll_ceremony_sessions',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        pollId: uuid('poll_id').notNull(),
        sequence: integer('sequence').notNull(),
        activeParticipantIndices: jsonb('active_participant_indices')
            .$type<number[]>()
            .notNull(),
        createdAt: timestamp('created_at', {
            mode: 'date',
            withTimezone: false,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        foreignKey({
            columns: [table.pollId],
            foreignColumns: [polls.id],
            name: 'fk_poll_ceremony_sessions_poll_id',
        }).onDelete('cascade'),
        unique('unique_poll_ceremony_session_sequence').on(
            table.pollId,
            table.sequence,
        ),
    ],
);

export const publicKeyShares = pgTable(
    'public_key_shares',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        pollId: uuid('poll_id').notNull(),
        voterId: uuid('voter_id').notNull(),
        publicKeyShare: text('public_key_share').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.pollId],
            foreignColumns: [polls.id],
            name: 'fk_public_key_shares_poll_id',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.voterId],
            foreignColumns: [voters.id],
            name: 'fk_public_key_shares_voter_id',
        }).onDelete('cascade'),
        unique('unique_public_key_share_per_voter').on(
            table.pollId,
            table.voterId,
        ),
    ],
);

export const pollsRelations = relations(polls, ({ many }) => ({
    choices: many(choices),
    voters: many(voters),
    boardMessages: many(boardMessages),
    pollCeremonySessions: many(pollCeremonySessions),
    publicKeyShares: many(publicKeyShares),
}));

export const choicesRelations = relations(choices, ({ one }) => ({
    poll: one(polls, {
        fields: [choices.pollId],
        references: [polls.id],
    }),
}));

export const votersRelations = relations(voters, ({ many, one }) => ({
    poll: one(polls, {
        fields: [voters.pollId],
        references: [polls.id],
    }),
    publicKeyShares: many(publicKeyShares),
}));

export const boardMessagesRelations = relations(boardMessages, ({ one }) => ({
    poll: one(polls, {
        fields: [boardMessages.pollId],
        references: [polls.id],
    }),
}));

export const pollCeremonySessionsRelations = relations(
    pollCeremonySessions,
    ({ one }) => ({
        poll: one(polls, {
            fields: [pollCeremonySessions.pollId],
            references: [polls.id],
        }),
    }),
);

export const publicKeySharesRelations = relations(
    publicKeyShares,
    ({ one }) => ({
        poll: one(polls, {
            fields: [publicKeyShares.pollId],
            references: [polls.id],
        }),
        voter: one(voters, {
            fields: [publicKeyShares.voterId],
            references: [voters.id],
        }),
    }),
);

export const schema = {
    polls,
    pollsRelations,
    choices,
    choicesRelations,
    voters,
    votersRelations,
    boardMessages,
    boardMessagesRelations,
    pollCeremonySessions,
    pollCeremonySessionsRelations,
    publicKeyShares,
    publicKeySharesRelations,
};

export type DatabaseSchema = typeof schema;
