# Sealed Vote Server API Endpoints

## Create Vote

-   **POST** `/polls/create`
    -   **Description**: Create a new poll with given options.
    -   **Request Body**:
        ```json
        {
            "choices": ["Option1", "Option2", "Option3"],
            "pollName": "Poll Name"
        }
        ```
    -   **Response**:
        ```json
        {
            "createdAt": "Timestamp",
            "pollName": "Poll Name",
            "creatorToken": "Creator's Unique Token",
            "choices": ["Option1", "Option2", "Option3"],
            "maxParticipants": 20,
            "id": "Poll Unique ID",
            "publicKeyShares": [],
            "publicKey": null,
            "encryptedVotes": [],
            "encryptedTallies": [],
            "decryptionShares": [],
            "results": []
        }
        ```

## Register Voter

-   **POST** `/polls/{pollId}/register`
    -   **Description**: Register a voter for a poll.
    -   **Request Body**:
        ```json
        {
            "voterName": "Voter Name"
        }
        ```
    -   **Response**: `201 Created` or `409 Conflict`

## Close Vote

-   **POST** `/polls/{pollId}/close`
    -   **Description**: Close the voting period for a poll.
    -   **Request Body**:
        ```json
        {
            "creatorToken": "creatorToken"
        }
        ```
    -   **Response**: Status indicating the poll has been closed.

## Get Poll

-   **GET** `/polls/{pollId}`
    -   **Description**: Retrieve poll details and current state.
    -   **Response**:
        ```json
        {
            "pollName": "Poll Name",
            "createdAt": "Timestamp",
            "choices": ["Option1", "Option2", "Option3"],
            "voters": ["Voter1", "Voter2"],
            "isOpen": false,
            "publicKeyShares": [],
            "commonPublicKey": null,
            "encryptedVotes": [],
            "encryptedTallies": [],
            "decryptionShares": [],
            "results": []
        }
        ```

## Submit Public Key Share

-   **POST** `/polls/{pollId}/public-key-share`
    -   **Description**: Submit a public key share for threshold decryption.
    -   **Request Body**:
        ```json
        {
            "publicKeyShare": "21398178914123...n"
        }
        ```
    -   **Response**: Acknowledgement of submission.

## Vote

-   **POST** `/polls/{pollId}/vote`
    -   **Description**: Submit encrypted votes for a poll.
    -   **Request Body**:
        ```json
        {
            "votes": [
                { "c1": "Encrypted Value", "c2": "Encrypted Value" },
                { "c1": "Encrypted Value", "c2": "Encrypted Value" }
            ]
        }
        ```
    -   **Response**: Acknowledgement of vote submission.

## Submit Decryption Share

-   **POST** `/polls/{pollId}/decryption-shares`
    -   **Description**: Submit decryption shares for tally decryption.
    -   **Request Body**:
        ```json
        {
            "decryptionShares": ["Decryption Share", "Decryption Share"]
        }
        ```
    -   **Response**: Acknowledgement of submission.
