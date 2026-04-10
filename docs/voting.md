# Voting protocol

The shared protocol logic lives in `packages/protocol`. Both apps now treat the board log as the source of truth and derive ceremony state from ordered signed payloads instead of trusting server-owned phase tables.

## Phases

The public read model exposes these phases:

- `registration`
- `setup`
- `ballot`
- `decryption`
- `complete`
- `aborted`

They are derived from the accepted board payloads returned by `GET /api/polls/:pollRef`.

## Flow

1. A creator creates a poll and receives a `creatorToken`.
2. Each participant registers a unique public `voterName` and receives a `voterToken` plus `voterIndex`.
3. The creator closes the poll once at least three participants are registered.
4. Participants append signed protocol payloads to `POST /api/polls/:pollId/board/messages`. The current route accepts board-backed registration and later ceremony payloads signed with the participant auth key.
5. The backend stores every board entry append-only, computes a hash chain, and classifies each slot as accepted, idempotent retransmission, or equivocation.
6. The public read model recomputes manifest state, phase digests, verification status, and threshold summaries from the board log only.
7. Once ballot, decryption-share, and tally-publication payloads are present, clients verify the ceremony locally and present arithmetic means derived from verified additive tallies.

## Integrity and liveness

- Every board submission is tied to a `voterToken`, and the payload `participantIndex` must match the authenticated voter.
- Exact retransmissions are idempotent when the unsigned canonical payload bytes match, even if the signature bytes differ.
- Slot conflicts are treated as equivocation. The route still records the message, but the read model marks the slot as tainted.
- The current app uses configurable strict-majority thresholds with a hard upper bound of 51 participants. The current verified target is 15 participants.
- Token-based enrollment makes the roster publicly auditable, but this version does not claim strong identity binding or Sybil resistance.

## Privacy model

- The roster is public. Ballot contents are intended to remain confidential once the full board-backed threshold flow is exercised.
- The browser stores narrow reconnect metadata locally: creator tokens, voter tokens, voter indices, and poll references.
- The current UI does not use `redux-persist` or a voting-path service worker cache.
- Result presentation uses arithmetic means over verified additive tallies, not geometric means.

## Shared helpers

- `acceptedBoardMessages` and `filterBoardMessagesByType` live in `packages/protocol/src/crypto.ts`
- `derivePollPhase`, `suggestedReconstructionThreshold`, and `canRegister` live in `packages/protocol/src/phases.ts`
- `computeArithmeticMean`, `computePublishedResultScores`, and `hasVerifiedTallies` live in `packages/protocol/src/results.ts`
