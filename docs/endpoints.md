# API endpoints

The backend routes live under `/api`. The payloads below match the shared contracts in `packages/contracts`.

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
  - public submitted roster
  - manifest and manifest hash after close
  - session id and human-readable session fingerprint after close
  - derived poll phase
  - honest-majority threshold summary
  - board audit counts and per-phase digests
  - ordered board entries with accepted, idempotent, or equivocation classification
  - verification status and verified arithmetic-mean results when available

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
    "submittedParticipantCount": 2,
    "minimumCloseParticipantCount": 3,
    "boardAudit": {
        "acceptedCount": 0,
        "duplicateCount": 0,
        "equivocationCount": 0,
        "ceremonyDigest": null,
        "phaseDigests": []
    },
    "verification": {
        "status": "not-ready",
        "reason": "Voting is still open. The ceremony transcript will begin after the organizer closes the vote.",
        "qualParticipantIndices": [],
        "verifiedOptionTallies": []
    },
    "rosterEntries": [],
    "thresholds": {
        "reconstructionThreshold": null,
        "minimumPublishedVoterCount": null,
        "strictMajorityFloor": null,
        "maxParticipants": 51,
        "validationTarget": 15
    },
    "ceremony": {
        "acceptedRegistrationCount": 0,
        "acceptedEncryptedBallotCount": 0,
        "acceptedDecryptionShareCount": 0,
        "completeEncryptedBallotParticipantCount": 0,
        "revealReady": false
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

Optional creator-participant registration:

```json
{
    "authPublicKey": "spki-hex",
    "creatorToken": "creator-token",
    "transportPublicKey": "raw-public-key-hex",
    "transportSuite": "X25519",
    "voterName": "Alice",
    "voterToken": "voter-token"
}
```

- notes:
  - voter names are unique within a poll
  - registration is token-only in this version; there is no strong identity binding
  - the app uses this route when a participant submits their final pre-close vote
  - registration closes permanently once the organizer closes voting
  - the app stores the participant auth and transport public keys during submit so the post-close board ceremony can verify the frozen roster

## Close voting

- `POST /api/polls/:pollId/close`
- request body:

```json
{
    "creatorToken": "creator-token"
}
```

- notes:
  - the poll requires at least three submitted participants before it can be closed
  - closing freezes the submitted roster
  - the app derives the honest-majority reconstruction threshold from the frozen roster; the UI does not expose a threshold picker

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
  - board messages are accepted only after voting is closed
  - the normal product UI posts these payloads in the background; it does not expose a raw signed-payload form
  - the authenticated voter token must match `signedPayload.payload.participantIndex`
  - the payload must include a valid base protocol shape before signature checks or participant checks run
  - registration payloads are verified against the embedded auth public key and the stored pre-close device record
  - manifest-publication payloads are verified against the accepted registration roster without requiring a previously published manifest
  - later payloads are verified against the accepted registration auth key and the accepted manifest publication
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
