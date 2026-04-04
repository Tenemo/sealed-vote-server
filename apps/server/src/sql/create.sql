BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE polls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_name text NOT NULL,
    creator_token char(64) NOT NULL,
    max_participants integer NOT NULL DEFAULT 20 CHECK (max_participants >= 2),
    is_open boolean NOT NULL DEFAULT true,
    common_public_key text,
    encrypted_tallies jsonb NOT NULL DEFAULT '[]',
    results integer[] NOT NULL DEFAULT '{}',
    created_at timestamp NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_poll_name UNIQUE (poll_name)
);

CREATE TABLE choices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    choice_name text NOT NULL,
    poll_id uuid NOT NULL,
    index integer NOT NULL,
    CONSTRAINT fk_choices_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
    CONSTRAINT unique_choice_name_per_poll UNIQUE (poll_id, choice_name),
    CONSTRAINT unique_choice_index_per_poll UNIQUE (poll_id, index)
);

CREATE TABLE voters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voter_name text NOT NULL,
    voter_index integer NOT NULL,
    poll_id uuid NOT NULL,
    voter_token_hash char(64) NOT NULL,
    has_submitted_public_key_share boolean NOT NULL DEFAULT false,
    has_voted boolean NOT NULL DEFAULT false,
    has_submitted_decryption_shares boolean NOT NULL DEFAULT false,
    CONSTRAINT fk_voters_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
    CONSTRAINT unique_voter_name_per_poll UNIQUE (poll_id, voter_name),
    CONSTRAINT unique_voter_index_per_poll UNIQUE (poll_id, voter_index),
    CONSTRAINT unique_voter_token_hash_per_poll UNIQUE (poll_id, voter_token_hash)
);

CREATE TABLE public_key_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    public_key_share text NOT NULL,
    CONSTRAINT fk_public_key_shares_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
    CONSTRAINT fk_public_key_shares_voter_id FOREIGN KEY (voter_id) REFERENCES voters (id) ON DELETE CASCADE,
    CONSTRAINT unique_public_key_share_per_voter UNIQUE (poll_id, voter_id)
);

CREATE TABLE encrypted_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    votes jsonb NOT NULL,
    poll_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    CONSTRAINT fk_encrypted_votes_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
    CONSTRAINT fk_encrypted_votes_voter_id FOREIGN KEY (voter_id) REFERENCES voters (id) ON DELETE CASCADE,
    CONSTRAINT unique_vote_per_voter UNIQUE (poll_id, voter_id)
);

CREATE TABLE decryption_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shares jsonb NOT NULL,
    poll_id uuid NOT NULL,
    voter_id uuid NOT NULL,
    CONSTRAINT fk_decryption_shares_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
    CONSTRAINT fk_decryption_shares_voter_id FOREIGN KEY (voter_id) REFERENCES voters (id) ON DELETE CASCADE,
    CONSTRAINT unique_decryption_shares_per_voter UNIQUE (poll_id, voter_id)
);

COMMIT;
