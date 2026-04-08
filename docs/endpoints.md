# API endpoints

The backend routes live under `/api`. The request and response payloads below match the shared contracts in `packages/contracts`.

## Create poll

- `POST /api/polls/create`
- request body:

```json
{
    "pollName": "Lunch vote",
    "creatorToken": "creator-token",
    "choices": ["Pizza", "Sushi", "Pasta"]
}
```

- success response: `201 Created`

```json
{
    "id": "poll-id",
    "slug": "lunch-vote--3c4d",
    "creatorToken": "creator-token"
}
```

- failure responses:
- `400` for invalid input such as blank trimmed names, fewer than two choices, duplicate choice names after trimming, or unexpected extra fields
- notes:
  - the participant cap is now server-owned; new polls default to `20` participants

## Fetch poll

- `GET /api/polls/:pollRef`
- `pollRef` accepts either the poll UUID or the canonical public slug
- success response: `200 OK`

```json
{
    "id": "poll-id",
    "slug": "lunch-vote--3c4d",
    "pollName": "Lunch vote",
    "createdAt": "2026-04-04T12:00:00.000Z",
    "choices": ["Pizza", "Sushi", "Pasta"],
    "voters": ["Alice", "Bob"],
    "isOpen": false,
    "publicKeyShareCount": 2,
    "commonPublicKey": "combined-public-key",
    "encryptedVoteCount": 2,
    "encryptedTallies": [
        { "c1": "7", "c2": "8" },
        { "c1": "9", "c2": "10" },
        { "c1": "11", "c2": "12" }
    ],
    "decryptionShareCount": 2,
    "publishedDecryptionShares": [
        ["101", "102", "103"],
        ["201", "202", "203"]
    ],
    "resultTallies": ["12", "19", "7"],
    "resultScores": [3.464102, 4.358899, 2.645751]
}
```

- failure responses:
- `404` when the poll does not exist
- notes:
  - `publishedDecryptionShares`, `resultTallies`, and `resultScores` are empty arrays until the poll reaches `complete`
  - once complete, `publishedDecryptionShares` is ordered by voter index, each inner array is ordered by choice index, and `resultScores` are rounded to 6 fractional digits

## Register voter

- `POST /api/polls/:pollId/register`
- request body:

```json
{
    "voterName": "Alice",
    "voterToken": "voter-token"
}
```

- success response: `201 Created`

```json
{
    "message": "Voter registered successfully",
    "voterIndex": 1,
    "voterName": "Alice",
    "pollId": "poll-id",
    "voterToken": "voter-token"
}
```

- notes:
  - `voterToken` is returned only once and is required for the secured phase endpoints below
  - voter names are unique per poll
- failure responses:
- `400` for invalid poll id, empty voter name, closed poll, or max participants reached
- `404` when the poll does not exist
- `409` when `voterName` is already taken in that poll

## Close poll

- `POST /api/polls/:pollId/close`
- request body:

```json
{
    "creatorToken": "creator-token"
}
```

- success response: `200 OK`

```json
{
    "message": "Poll closed successfully"
}
```

- failure responses:
- `400` for invalid poll id, already closed polls, or fewer than two registered voters
- `403` for an invalid creator token
- `404` when the poll does not exist

## Submit public key share

- `POST /api/polls/:pollId/public-key-share`
- request body:

```json
{
    "publicKeyShare": "public-key-share",
    "voterToken": "voter-token"
}
```

- success response: `201 Created`

```json
{
    "message": "Public key share submitted successfully"
}
```

- failure responses:
- `400` for invalid poll id or wrong protocol phase
- `403` for an invalid voter token
- `404` when the poll does not exist
- `409` when the same voter submits twice

## Submit vote

- `POST /api/polls/:pollId/vote`
- request body:

```json
{
    "voterToken": "voter-token",
    "votes": [
        { "c1": "ciphertext-1-a", "c2": "ciphertext-1-b" },
        { "c1": "ciphertext-2-a", "c2": "ciphertext-2-b" }
    ]
}
```

- success response: `200 OK`

```json
"Vote submitted successfully"
```

- failure responses:
- `400` for invalid poll id, wrong protocol phase, or vote vector length mismatch
- `403` for an invalid voter token
- `404` when the poll does not exist
- `409` when the same voter submits twice

## Submit decryption shares

- `POST /api/polls/:pollId/decryption-shares`
- request body:

```json
{
    "voterToken": "voter-token",
    "decryptionShares": ["share-1", "share-2"]
}
```

- success response: `201 Created`

```json
{
    "message": "Decryption shares submitted successfully."
}
```

- failure responses:
- `400` for invalid poll id, wrong protocol phase, or decryption share vector length mismatch
- `403` for an invalid voter token
- `404` when the poll does not exist
- `409` when the same voter submits twice

## Delete poll

- `DELETE /api/polls/:pollId`
- request body:

```json
{
    "creatorToken": "creator-token"
}
```

- success response: `200 OK`

```json
{
    "message": "Poll deleted successfully"
}
```

- failure responses:
- `400` for invalid poll id
- `403` for an invalid creator token
- `404` when the poll does not exist

## Health check

- `GET /api/health-check`
- success response: `200 OK`

```json
{
    "service": "OK",
    "database": "OK",
    "commitSha": "abcdef1234567890"
}
```

- degraded response: `503 Service Unavailable`

```json
{
    "service": "OK",
    "database": "Failed",
    "commitSha": "abcdef1234567890"
}
```

- notes:
  - `commitSha` is `null` when the runtime does not expose a deployment commit SHA
