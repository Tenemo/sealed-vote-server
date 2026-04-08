import type { EncryptedMessage } from '@sealed-vote/contracts';
import { relations, sql } from 'drizzle-orm';
import {
    boolean,
    char,
    check,
    foreignKey,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';

export const polls = pgTable(
    'polls',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        pollName: text('poll_name').notNull(),
        slug: text('slug').notNull(),
        creatorTokenHash: char('creator_token_hash', { length: 64 }).notNull(),
        maxParticipants: integer('max_participants').notNull().default(20),
        isOpen: boolean('is_open').notNull().default(true),
        commonPublicKey: text('common_public_key'),
        encryptedTallies: jsonb('encrypted_tallies')
            .$type<EncryptedMessage[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        results: integer('results')
            .array()
            .notNull()
            .default(sql`'{}'::integer[]`),
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
        check(
            'polls_max_participants_check',
            sql`${table.maxParticipants} >= 2`,
        ),
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

export const encryptedVotes = pgTable(
    'encrypted_votes',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        votes: jsonb('votes').$type<EncryptedMessage[]>().notNull(),
        pollId: uuid('poll_id').notNull(),
        voterId: uuid('voter_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.pollId],
            foreignColumns: [polls.id],
            name: 'fk_encrypted_votes_poll_id',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.voterId],
            foreignColumns: [voters.id],
            name: 'fk_encrypted_votes_voter_id',
        }).onDelete('cascade'),
        unique('unique_vote_per_voter').on(table.pollId, table.voterId),
    ],
);

export const decryptionShares = pgTable(
    'decryption_shares',
    {
        id: uuid('id')
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        shares: jsonb('shares').$type<string[]>().notNull(),
        pollId: uuid('poll_id').notNull(),
        voterId: uuid('voter_id').notNull(),
    },
    (table) => [
        foreignKey({
            columns: [table.pollId],
            foreignColumns: [polls.id],
            name: 'fk_decryption_shares_poll_id',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.voterId],
            foreignColumns: [voters.id],
            name: 'fk_decryption_shares_voter_id',
        }).onDelete('cascade'),
        unique('unique_decryption_shares_per_voter').on(
            table.pollId,
            table.voterId,
        ),
    ],
);

export const pollsRelations = relations(polls, ({ many }) => ({
    choices: many(choices),
    voters: many(voters),
    publicKeyShares: many(publicKeyShares),
    encryptedVotes: many(encryptedVotes),
    decryptionShares: many(decryptionShares),
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
    encryptedVotes: many(encryptedVotes),
    decryptionShares: many(decryptionShares),
}));

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

export const encryptedVotesRelations = relations(encryptedVotes, ({ one }) => ({
    poll: one(polls, {
        fields: [encryptedVotes.pollId],
        references: [polls.id],
    }),
    voter: one(voters, {
        fields: [encryptedVotes.voterId],
        references: [voters.id],
    }),
}));

export const decryptionSharesRelations = relations(
    decryptionShares,
    ({ one }) => ({
        poll: one(polls, {
            fields: [decryptionShares.pollId],
            references: [polls.id],
        }),
        voter: one(voters, {
            fields: [decryptionShares.voterId],
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
    publicKeyShares,
    publicKeySharesRelations,
    encryptedVotes,
    encryptedVotesRelations,
    decryptionShares,
    decryptionSharesRelations,
};

export type DatabaseSchema = typeof schema;
