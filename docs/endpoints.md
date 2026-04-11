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
    "protocolVersion": "v1"
}
```

- notes:
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
        { "voterIndex": 1, "voterName": "Alice", "deviceReady": true },
        { "voterIndex": 2, "voterName": "Bob", "deviceReady": true }
    ],
    "isOpen": true,
    "phase": "open",
    "manifest": null,
    "manifestHash": null,
    "sessionId": null,
    "sessionFingerprint": null,
    "joinedParticipantCount": 2,
    "minimumStartParticipantCount": 3,
    "boardAudit": {
        "acceptedCount": 0,
        "duplicateCount": 0,
        "equivocationCount": 0,
        "ceremonyDigest": null,
        "phaseDigests": []
    },
    "verification": {
        "status": "not-ready",
        "reason": "Manifest publication has not been accepted yet.",
        "qualParticipantIndices": [],
        "verifiedOptionTallies": []
    },
    "rosterEntries": [],
    "thresholds": {
        "reconstructionThreshold": null,
        "minimumPublishedVoterCount": null,
        "suggestedReconstructionThreshold": 2,
        "strictMajorityFloor": 2,
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
    "authPublicKey": "spki-hex",
    "transportPublicKey": "raw-public-key-hex",
    "transportSuite": "X25519",
    "voterName": "Alice",
    "voterToken": "voter-token"
}
```

- notes:
  - voter names are unique within a poll
  - registration is token-only in this version; there is no strong identity binding
  - registration closes permanently once the creator starts voting
  - the app stores the participant auth and transport public keys during join so the later board-backed ceremony can verify that roster

## Start voting

- `POST /api/polls/:pollId/start`
- request body:

```json
{
    "creatorToken": "creator-token",
    "thresholdPercent": 60
}
```

- notes:
  - the poll requires at least three registered participants before it can be started
  - starting voting freezes the roster and resolves the exact integer reconstruction threshold from the current joined participant count
  - `minimumPublishedVoterCount` is derived automatically from the frozen threshold
  - `POST /api/polls/:pollId/close` remains as a compatibility alias, but the normal UI and tests use `/start`

## List board messages

- `GET /api/polls/:pollId/board/messages`
- optional query string:

```txt
afterEntryHash=<entry-hash>
```

- response:
  - ordered board message records for the poll
  - if `afterEntryHash` is provided, only entries after that hash are returned
  - if `afterEntryHash` does not exist in the current board log, the route returns `400`

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
  - board messages are accepted only after voting has started
  - the normal product UI posts these payloads in the background; it does not expose a raw signed-payload form
  - the authenticated voter token must match `signedPayload.payload.participantIndex`
  - the payload must include a valid base protocol shape before signature checks or participant checks run
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
