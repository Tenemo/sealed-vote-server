BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE polls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_name text NOT NULL,
    creator_token char(64) NOT NULL,
    max_participants integer NOT NULL DEFAULT 20,
    is_open boolean NOT NULL DEFAULT true,
    common_public_key text,
    encrypted_tallies jsonb DEFAULT '[]',
    results integer[] DEFAULT '{}',
    created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE public_key_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id uuid NOT NULL,
    public_key_share text NOT NULL,
    CONSTRAINT fk_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
);

CREATE TABLE choices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    choice_name text NOT NULL,
    poll_id uuid NOT NULL,
    index integer NOT NULL,
    CONSTRAINT fk_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
    UNIQUE (poll_id, choice_name),
    UNIQUE (poll_id, index)
);

CREATE TABLE voters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voter_name text NOT NULL,
    voter_index integer NOT NULL,
    poll_id uuid NOT NULL,
    CONSTRAINT fk_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE,
    UNIQUE (poll_id, voter_name)
);

CREATE TABLE encrypted_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    votes jsonb NOT NULL,
    poll_id uuid NOT NULL,
    CONSTRAINT fk_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
);

CREATE TABLE decryption_shares (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    decryption_share text NOT NULL,
    poll_id uuid NOT NULL,
    CONSTRAINT fk_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
);

COMMIT;
