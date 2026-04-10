# API endpoints

The backend routes live under `/api`. The request and response payloads below match the shared contracts in `packages/contracts`.

## Create poll

- `POST /api/polls/create`
- request body:

```json
{
    "pollName": "Lunch vote",
    "creatorToken": "creator-token",
    "choices": ["Pizza", "Sushi", "Pasta"],
    "reconstructionThreshold": 2,
    "minimumPublishedVoterCount": 3,
    "protocolVersion": "v1"
}
```

- notes:
  - `reconstructionThreshold` and `minimumPublishedVoterCount` are optional
  - the hard participant cap is `51`
  - the current validated target is `15`
  - `protocolVersion` currently accepts only `v1`

## Fetch poll

- `GET /api/polls/:pollRef`
- `pollRef` accepts either the poll UUID or the canonical public slug
- response highlights:
  - public roster
  - manifest and manifest hash
  - session id and human-readable session fingerprint
  - derived phase
  - threshold summary
  - board audit counts and per-phase digests
  - ordered board entries with accepted, idempotent, or equivocation classification
  - local verification status and verified arithmetic-mean results when available

Example response:

```json
{
    "id": "poll-id",
    "slug": "lunch-vote--3c4d",
    "pollName": "Lunch vote",
    "choices": ["Pizza", "Sushi", "Pasta"],
    "voters": [
        { "voterIndex": 1, "voterName": "Alice" },
        { "voterIndex": 2, "voterName": "Bob" }
    ],
    "isOpen": false,
    "phase": "setup",
    "manifest": null,
    "manifestHash": null,
    "sessionId": null,
    "sessionFingerprint": null,
    "boardAudit": {
        "acceptedCount": 1,
        "duplicateCount": 0,
        "equivocationCount": 0,
        "ceremonyDigest": "digest",
        "phaseDigests": [{ "phase": 0, "digest": "phase-digest" }]
    },
    "verification": {
        "status": "not-ready",
        "reason": "Manifest publication has not been accepted yet.",
        "qualParticipantIndices": [],
        "verifiedOptionTallies": []
    },
    "thresholds": {
        "reconstructionThreshold": 2,
        "minimumPublishedVoterCount": 3,
        "suggestedReconstructionThreshold": 2,
        "maxParticipants": 51,
        "validationTarget": 15
    }
}
```

## Register voter

- `POST /api/polls/:pollId/register`
- request body:

```json
{
    "voterName": "Alice",
    "voterToken": "voter-token"
}
```

- notes:
  - voter names are unique within a poll
  - registration is token-only in this version; there is no strong identity binding
  - registration closes permanently once the creator closes the poll

## Close poll

- `POST /api/polls/:pollId/close`
- request body:

```json
{
    "creatorToken": "creator-token"
}
```

- notes:
  - the poll requires at least three registered participants before it can be closed
  - once closed, the roster is frozen and board messages are allowed

## List board messages

- `GET /api/polls/:pollId/board/messages`
- optional query string:

```txt
afterEntryHash=<entry-hash>
```

- response:
  - ordered board message records for the poll
  - if `afterEntryHash` is provided, only entries after that hash are returned

## Post board message

- `POST /api/polls/:pollId/board/messages`
- request body:

```json
{
    "voterToken": "voter-token",
    "signedPayload": {
        "payload": {
            "sessionId": "session-id",
            "manifestHash": "manifest-hash",
            "phase": 0,
            "participantIndex": 1,
            "messageType": "registration",
            "rosterHash": "roster-hash",
            "authPublicKey": "spki-hex",
            "transportPublicKey": "raw-public-key-hex"
        },
        "signature": "p1363-signature-hex"
    }
}
```

- notes:
  - board messages are accepted only after the poll is closed
  - the authenticated voter token must match `signedPayload.payload.participantIndex`
  - registration payloads are verified against the embedded auth public key
  - later payloads are verified against the accepted registration auth key
  - exact retransmissions are stored and classified as idempotent
  - conflicting payloads in the same canonical slot are stored and classified as equivocation

## Recover session

- `POST /api/polls/:pollId/recover-session`
- request body:

```json
{
    "creatorToken": "creator-token"
}
```

or

```json
{
    "voterToken": "voter-token"
}
```

- response:
  - poll id
  - poll phase
  - whether the poll is still open
  - creator or voter session details, depending on the supplied token

## Delete poll

- `DELETE /api/polls/:pollId`
- request body:

```json
{
    "creatorToken": "creator-token"
}
```

## Health check

- `GET /api/health-check`
- returns service health, database health, and the deployment commit SHA when available
