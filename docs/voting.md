# Voting protocol

The shared protocol logic lives in `packages/protocol`. The app uses a fast pre-close product flow and then derives the full post-close ceremony from the bulletin board log.

## Phases

The public poll read model exposes these phases:

- `open`
- `securing`
- `ready-to-reveal`
- `revealing`
- `complete`
- `aborted`

They are derived from accepted board payloads plus local ceremony verification.

## Product flow

1. The organizer creates a vote and lands on the live public page immediately.
2. Each participant opens the link, scores every option from `1` to `10`, and submits one final vote.
3. The browser stores those plaintext scores locally on-device and registers the participant with the backend for the later ceremony.
4. The organizer closes voting once at least three submitted participants exist. That freezes the roster.
5. After close, the app automatically runs manifest publication, board registrations, manifest acceptances, DKG, ballot encryption, and ballot publication in the background.
6. Once every submitted participant has a complete encrypted ballot, the creator browser automatically publishes one `ballot-close` payload.
7. Decryption shares and tally publications arrive asynchronously after the counted ballot set is frozen.
8. Every client replays the ceremony from the board log and shows verified arithmetic means.

## Integrity and liveness

- Every board submission is tied to a `voterToken`, and the payload `participantIndex` must match the authenticated voter.
- Exact retransmissions are idempotent when the unsigned canonical payload bytes match.
- Slot conflicts are treated as equivocation and remain visible in the board audit.
- The cryptographic threshold is honest-majority only and is derived from the frozen roster with `majorityThreshold`.
- The hard participant cap is `51`. The current validation target remains `15`.
- Token-based enrollment makes the roster public and auditable, but this version does not claim strong identity binding or Sybil resistance.

## Privacy model

- The pre-close roster is public.
- Plaintext scores stay only on the submitting device until voting closes.
- Once encrypted ballot payloads are accepted on the board, the local plaintext ballot is deleted.
- The browser stores only narrow reconnect metadata in local storage. Private device state and post-close ceremony state live in indexed storage.
- The UI does not expose protocol JSON or manual board posting in the normal flow.

## Shared helpers

- `acceptedBoardMessages` and `filterBoardMessagesByType` live in `packages/protocol/src/boardMessages.ts`
- `derivePollPhase` and `canRegister` live in `packages/protocol/src/phases.ts`
- `computeArithmeticMean`, `computePublishedResultScores`, and `hasVerifiedTallies` live in `packages/protocol/src/results.ts`
- `canonicalUnsignedPayloadBytes`, `protocolPayloadSlotKey`, and `sortProtocolPayloads` live in `packages/protocol/src/protocolPayloads.ts`
