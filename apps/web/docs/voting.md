Vote organizer (also a voter):

-   Alice

Voters:

-   Bob
-   Charlie

### 1.Vote organizer, Alice, chooses possible options and clicks "Create vote".

The options are sent over to the backend to POST `/polls/create` like so:

```json
{
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "pollName": "Which animal should we get?"
}
```

They are saved to their respective tables in the database, `choices` and `polls`. No functions from `threshold-elgamal` are run anywhere at this point. The vote organizer gets back the following response:

```json
{
    "createdAt": "2024-04-09T09:53:33.461Z",
    "pollName": "poll_123",
    "creatorToken": "48533cdb31b678b18de96e1bfb11768758d630bb1f88440dbb05c0116ec7843c",
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "maxParticipants": 20,
    "id": "f846a9e2-8cac-4356-ad51-a916138e70d7",
    "publicKeyShares": [],
    "publicKey": null,
    "encryptedVotes": [],
    "encryptedTallies": [],
    "decryptionShares": [],
    "results": []
}
```

The vote organizer sees the voting interface now and becomes a normal votes like any other, except for holding the creatorToken that allows him to end the voting period for this vote.

### 2. Vote participant accesses the page, invited via a link.

Upon opening the page, they make a GET call to `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7`. The vote organizer makes the same call and enters the same flow. The participant then receives the following:

```json
{
    "pollName": "Which animal should we get?",
    "createdAt": "2024-04-09T09:53:33.461Z",
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "voters": [],
    "isOpen": true,
    "publicKeyShares": [],
    "publicKey": null,
    "encryptedVotes": [],
    "encryptedTallies": [],
    "decryptionShares": [],
    "results": []
}
```

This results in every participant seeing a UI with the four animals and tiles from 1 to 10 below them. They click the tiles to select their votes. After selecting the numbers, the participant then makes a POST call to `/polls/00b95b8a-681a-426d-bf10-2d8427cc6423/register` with the following content:

```json
{
    "voterName": "Bob"
}
```

If the name is already used for that vote, the participant receives an error from the server, 409 Conflict with the following message: `Voter name "Bob" has already been taken for this vote`. If the name isn't taken, then, as a response, the participant receives 201 Created.

Important: the participant doesn't send their choices yet. No functions from `threshold-elgamal` have been run at this point.

On the backend, Bob is inserted as a new entry to the `voters` table in the database that's related by `pollId` to the vote. From now on, all calls to GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` start publicly including Bob's `voterName` in `voters`, like so: `"voters": ["Bob"]` that is always `SELECT`ed from oldest to newest. All subsequent voters registering for the vote are also added to the same array and inserted to the `voters` table.

### 3. Vote organizer, Alice, seeing that there are enough voters, closes the vote by clicking "Begin vote" button and confirming his choice in a modal.

When the modal opens, one last call is made to GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` to get the latest state of the vote. All voters are listed in the modal, warning that no more people will be able to vote.
He makes a call to the backend to POST `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7/close` with the following body:

```json
{
    "creatorToken": "48533cdb31b678b18de96e1bfb11768758d630bb1f88440dbb05c0116ec7843c"
}
```

This closes the vote. The backend updates the `polls` table and switches `isOpen` from `true` to `false`.

### 4. All participants should be constantly re-fetching the the vote in the background. When the response they receive contains `"isOpen": false`, the actual voting process kicks off.

The GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` response after closing the vote looks like this:

```json
{
    "pollName": "Which animal should we get?",
    "createdAt": "2024-04-09T09:53:33.461Z",
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "voters": ["Bob", "Alice", "Charlie"],
    "isOpen": false,
    "publicKeyShares": [],
    "commonPublicKey": null,
    "encryptedVotes": [],
    "encryptedTallies": [],
    "decryptionShares": [],
    "results": []
}
```

### 5. Every participant generates their public key share and private key.

First, they need to grab their `voterIndex` from the voters array. It's 1-based, so for Bob his index is 1, for Alice 2 and for Charlie 3.

Now is the first time anybody will be using the `threshold-elgamal` library.

Each voter runs `generateKeys` with the appropriate parameters. `threshold` is always the length of the `voters` array. Every single voter is required to participate in decrypting the votes.

```ts
const { privateKey, publicKey } = generateKeys(voterIndex, threshold); // (1,3) for Bob, (2,3) for Alice, (3,3) for Charlie
```

### 6. Every participant calls POST `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7/public-key-share` with their `publicKey`

```json
{
	"publicKeyShare": "8012737894298498723423...n"
```

After the call, participants should see a message on the vote screen "Public key share submitted. Waiting for other participants..." with a loader. Every participant after this call should keep polling GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` until `commonPublicKey` is non-null.

### 7. As soon as all participants submit their `publicKeyShare` and `publicKeyShares.length` is equal `voters.length`, on the backend publicKey generation is triggered.

Example response:

```ts
const commonPublicKey = combinePublicKeys(publicKeyShares);
```

The backend then inserts that into the `polls` database table and the GET /polls/{pollId} endpoint now starts returning the public key as the value for the `commonPublicKey` property.

### 8. As soon as participants receive `commonPublicKey` in the GET poll response, they encrypt their votes with it.

Example GET poll response at this point:

```json
{
    "pollName": "Which animal should we get?",
    "createdAt": "2024-04-09T09:53:33.461Z",
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "voters": ["Bob", "Alice", "Charlie"],
    "isOpen": false,
    "publicKeyShares": [
        "801273788498723423...n",
        "9785923499324...n",
        "412393289753...n",
        "4975242397...n"
    ],
    "commonPublicKey": "7540984986028734...n",
    "encryptedVotes": [],
    "encryptedTallies": [],
    "decryptionShares": [],
    "results": []
}
```

Bob wants to rate Dog 3, Cat 10, Cow 1 and Goat 7.
He would then do the following:

```ts
const votes: {
    c1: bigint;
    c2: bigint;
}[] = [
    encrypt(3, commonPublicKey),
    encrypt(10, commonPublicKey),
    encrypt(1, commonPublicKey),
    encrypt(7, commonPublicKey),
];
```

This, of course, would be done dynamically and the `votes` array size would always match the size of the `choices` array. Then a request would be made to POST `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7/vote`

```json
	"votes": [
		{"c1": "c1_value_for_Dog", "c2": "c2_value_for_Dog"},
		{"c1": "c1_value_for_Cat", "c2": "c2_value_for_Cat"},
		{"c1": "c1_value_for_Cow", "c2": "c2_value_for_Cow"},
		{"c1": "c1_value_for_Goat", "c2": "c2_value_for_Goat"}
	]
```

After casting the vote, the participant goes back to polling GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7`, this time until `encryptedTallies` returns as non-empty array. This would be repeated by every participant.

Backend, when receiving such a request, inserts the array of votes into the `votes` table. The votes are related to the poll by `pollId`. No information about who cast the vote is stored - although cryptographically, that wouldn't make a difference.

The GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` response is then updated with the `votes` array containing arrays of votes.

Example of how the GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` response would look like when all votes have been submitted:

```json
{
    "pollName": "Which animal should we get?",
    "createdAt": "2024-04-09T09:53:33.461Z",
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "voters": ["Bob", "Alice", "Charlie"],
    "isOpen": false,
    "publicKeyShares": [
        "801273788498723423...n",
        "9785923499324...n",
        "412393289753...n",
        "4975242397...n"
    ],
    "commonPublicKey": "7540984986028734...n",
    "encryptedVotes": [
        [
            { "c1": "5420456237325...n", "c2": "345645604...n" },
            { "c1": "3456054636...n", "c2": "72045757...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "66243053245...n", "c2": "320453245...n" }
        ],
        [
            { "c1": "453063456346...n", "c2": "30456436...n" },
            { "c1": "5420456237325...n", "c2": "345645604...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "2344637814...n", "c2": "18513051345...n" }
        ],
        [
            { "c1": "40321364033256...n", "c2": "67340564356...n" },
            { "c1": "34650456...n", "c2": "13230412412...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "320453245...n", "c2": "2344637814...n" }
        ]
    ],
    "encryptedTallies": [],
    "decryptionShares": [],
    "results": []
}
```

### 9. Upon receiving the last set of votes, when `votes.length` is equal to `voters.length`, backend calculates the encrypted tallies.

```ts
const encryptedTallies: { "c1": bigint; "c2": bigint }[] = encryptedVotes.map(choiceVotes =>
	choiceVotes.reduce((encryptedTally, currentEncryptedVote) => multiplyEncryptedValues(encryptedTally, currentEncryptedVote), { c1: 1n, c2: 1n });
);
```

The backend then inserts that into the `polls` table as an array into the encrypted_tallies column. GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` now starts returning that array in the response. Example response after this step:

```json
{
    "pollName": "Which animal should we get?",
    "createdAt": "2024-04-09T09:53:33.461Z",
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "voters": ["Bob", "Alice", "Charlie"],
    "isOpen": false,
    "publicKeyShares": [
        "801273788498723423...n",
        "9785923499324...n",
        "412393289753...n",
        "4975242397...n"
    ],
    "commonPublicKey": "7540984986028734...n",
    "encryptedVotes": [
        [
            { "c1": "5420456237325...n", "c2": "345645604...n" },
            { "c1": "3456054636...n", "c2": "72045757...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "66243053245...n", "c2": "320453245...n" }
        ],
        [
            { "c1": "453063456346...n", "c2": "30456436...n" },
            { "c1": "5420456237325...n", "c2": "345645604...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "2344637814...n", "c2": "18513051345...n" }
        ],
        [
            { "c1": "40321364033256...n", "c2": "67340564356...n" },
            { "c1": "34650456...n", "c2": "13230412412...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "320453245...n", "c2": "2344637814...n" }
        ]
    ],
    "encryptedTallies": [
        { "c1": "40321364033256...n", "c2": "67340564356...n" },
        { "c1": "5420456237325...n", "c2": "345645604...n" },
        { "c1": "5420456237325...n", "c2": "345645604...n" }
    ],
    "decryptionShares": [],
    "results": []
}
```

### 10. Participants, upon receiving `encryptedTallies`, generate `decryptionShares` for each tally.

```ts
const decryptionShares = encryptedTallies.map((encryptedTally) =>
    createDecryptionShare(encryptedTally, privateKey),
);
```

Each participant then calls POST `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7/decryptionShares` with their `decryptionShares`, one per each choice/tally:

```json
{
    "decryptionShares": [
        "2344637814...n",
        "8656405657...n",
        "13230412412...n",
        "8012737884987...n"
    ]
}
```

Backend, after receiving each `decryptionShares`, inserts that into the `decryption_shares` table, related by `pollId` to the poll. Insert order, and later select order, don't matter.

Each participant then keeps polling GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` until the `results` array is non-empty.

### 11. Backend, when `encryptedTallies.length` is equal to `choices.length` calculates the results

```ts
const results = encryptedTallies.map((encryptedTally, index) =>
    thresholdDecrypt(encryptedTally, combineDecryptionShares(decryptionShares)),
);
```

Backend then inserts the results, into the `polls` table. This is the end of the voting process. GET `/polls/f846a9e2-8cac-4356-ad51-a916138e70d7` response would look like this in the example:

```json
{
    "pollName": "Which animal should we get?",
    "createdAt": "2024-04-09T09:53:33.461Z",
    "choices": ["Dog", "Cat", "Cow", "Goat"],
    "voters": ["Bob", "Alice", "Charlie"],
    "isOpen": false,
    "publicKeyShares": [
        "801273788498723423...n",
        "9785923499324...n",
        "412393289753...n",
        "4975242397...n"
    ],
    "commonPublicKey": "7540984986028734...n",
    "encryptedVotes": [
        [
            { "c1": "5420456237325...n", "c2": "345645604...n" },
            { "c1": "3456054636...n", "c2": "72045757...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "66243053245...n", "c2": "320453245...n" }
        ],
        [
            { "c1": "453063456346...n", "c2": "30456436...n" },
            { "c1": "5420456237325...n", "c2": "345645604...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "2344637814...n", "c2": "18513051345...n" }
        ],
        [
            { "c1": "40321364033256...n", "c2": "67340564356...n" },
            { "c1": "34650456...n", "c2": "13230412412...n" },
            { "c1": "8656405657...n", "c2": "49752042397...n" },
            { "c1": "320453245...n", "c2": "2344637814...n" }
        ]
    ],
    "encryptedTallies": [
        { "c1": "40321364033256...n", "c2": "67340564356...n" },
        { "c1": "5420456237325...n", "c2": "345645604...n" },
        { "c1": "8656405657...n", "c2": "345645604...n" }
    ],
    "decryptionShares": [
        [
            "2344637814...n",
            "8656405657...n",
            "13230412412...n",
            "9785923499324...n"
        ],
        [
            "66243053245...n",
            "49752042397...n",
            "67340564356...n",
            "7984986028734...n"
        ],
        [
            "67340564356...n",
            "2344637814...n",
            "18513051345...n",
            "8656405657...n"
        ]
    ],
    "results": [480, 800, 6, 49]
}
```

The results display for all voters on their screens, with geometric mean displaying instead of the tallied results.

```ts
const geometricMeanResults = results.map((result) =>
    Math.pow(result, 1 / voters.length),
);
```
