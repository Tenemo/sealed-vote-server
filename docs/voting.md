# Voting protocol

The shared protocol logic lives in `packages/protocol`. Both apps consume the same phase derivation, result computation, and crypto helpers so the frontend and backend no longer reconstruct the state machine independently.

## Phases

The canonical phases are:

- `registration`
- `key-generation`
- `voting`
- `tallying`
- `decryption`
- `complete`

They are derived from the shared `derivePollPhase` helper using the poll state returned by `GET /api/polls/:pollRef`.

## Flow

1. A creator creates a poll and receives a `creatorToken`.
2. Each participant registers with a unique `voterName` and receives a `voterToken` plus `voterIndex`.
3. The creator closes the poll once at least two voters are registered.
4. Each voter generates a keypair with `generateKeys(voterIndex, threshold)`.
5. Each voter submits one public key share authenticated by `voterToken`.
6. Once every share is present, the backend combines them into `commonPublicKey`.
7. Each voter encrypts one score per choice and submits the ciphertext vector authenticated by `voterToken`.
8. Once every voter has submitted, the backend multiplies ciphertexts into encrypted tallies.
9. Each voter generates one decryption share per tally and submits that vector authenticated by `voterToken`.
10. Once every voter has submitted decryption shares, the backend decrypts the tallies into plaintext tally strings, computes rounded geometric-mean scores, and publishes both along with the ordered decryption shares used to reveal them.
11. The frontend verifies the published completed-poll data locally with `verifyPublishedResults({ encryptedTallies, publishedDecryptionShares, resultTallies, resultScores, voterCount })` before showing the final ranking.

## Integrity and liveness

- Submissions are voter-bound. `public-key-share`, `vote`, and `decryption-shares` all require a valid `voterToken`.
- Each voter can submit only once per phase. The database enforces uniqueness per voter for public key shares, votes, and decryption shares.
- The current scheme is `n-of-n`. Every registered voter must participate in every cryptographic phase or the poll will stall before completion.
- The published result model is verifiable. Anyone with the completed poll payload can recompute the plaintext tallies and confirm that the published scores match.

## Privacy model

- The backend stores encrypted votes, encrypted tallies, decryption shares, published plaintext tally strings, and published rounded scores.
- The frontend stores in-progress voting session state in browser local storage so refreshes, reconnects, and offline reopen flows do not destroy an active vote.
- Once a poll reaches `complete`, the persisted frontend state strips `creatorToken`, `voterToken`, `selectedScores`, `privateKey`, and `publicKey`.
- Sentry replay is configured with full text masking and media blocking.

## Shared helpers

- `derivePollPhase`, `canRegister`, `canClose`, `canSubmitPublicKeyShare`, `canVote`, and `canSubmitDecryptionShares` live in `packages/protocol/src/phases.ts`
- `computeGeometricMean`, `computePublishedResultScores`, and `verifyPublishedResults` live in `packages/protocol/src/results.ts`
- `serializeVotes`, `computeEncryptedTallies`, `createDecryptionSharesForTallies`, `decryptTallies`, and `decryptTalliesToStrings` live in `packages/protocol/src/crypto.ts`
