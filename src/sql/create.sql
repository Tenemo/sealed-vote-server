BEGIN;

CREATE EXTENSION pgcrypto;

CREATE TABLE polls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_name text NOT NULL UNIQUE,
    creator_token text NOT NULL,
    max_participants integer NOT NULL DEFAULT 100,
    created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE choices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    choice_name text NOT NULL,
    created_at timestamp NOT NULL DEFAULT NOW(),
    poll_id uuid NOT NULL,
    CONSTRAINT fk_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id),
    UNIQUE (poll_id, choice_name)
);

CREATE TABLE votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voter_name text NOT NULL,
    score integer NOT NULL,
    CHECK (
        score BETWEEN 1
        AND 10
    ),
    created_at timestamp NOT NULL DEFAULT NOW(),
    poll_id uuid NOT NULL,
    CONSTRAINT fk_poll_id FOREIGN KEY (poll_id) REFERENCES polls (id),
    choice_id uuid NOT NULL,
    CONSTRAINT fk_choice_id FOREIGN KEY (choice_id) REFERENCES choices (id),
    UNIQUE (poll_id, choice_id, voter_name)
);

COMMIT;
