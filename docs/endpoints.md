# Sealed Vote Server API Endpoints

## Create Poll

-   **POST** `/api/polls/create`
    -   **Description**: Create a new poll with the specified options.
    -   **Request Body**:
        ```json
        {
            "choices": ["Option1", "Option2", "Option3"],
            "pollName": "Poll Name",
            "maxParticipants": 20
        }
        ```
    -   **Response**:
        ```json
        {
            "pollName": "Poll Name",
            "creatorToken": "Creator's Unique Token",
            "choices": ["Option1", "Option2", "Option3"],
            "maxParticipants": 20,
            "id": "Poll Unique ID",
            "createdAt": "Timestamp",
            "publicKeyShares": [],
            "commonPublicKey": null,
            "encryptedVotes": [],
            "encryptedTallies": [],
            "decryptionShares": [],
            "results": []
        }
        ```

## Register Voter

-   **POST** `/api/polls/:pollId/register`
    -   **Description**: Register a voter for the specified poll.
    -   **Request Body**:
        ```json
        {
            "voterName": "Voter Name"
        }
        ```
    -   **Response**: `201 Created` on success.

## Close Poll

-   **POST** `/api/polls/:pollId/close`
    -   **Description**: Close the poll for new votes.
    -   **Request Body**:
        ```json
        {
            "creatorToken": "Creator's Unique Token"
        }
        ```
    -   **Response**: `200 OK` on success.

## Fetch Poll Details

-   **GET** `/api/polls/:pollId`
    -   **Description**: Retrieve details of a specific poll.
    -   **Response**:
        ```json
        {
            "pollName": "Poll Name",
            "createdAt": "Timestamp",
            "choices": ["Option1", "Option2", "Option3"],
            "voters": ["Alice", "Bob"],
            "isOpen": false,
            "publicKeyShares": ["PublicKeyShare1", "PublicKeyShare2"],
            "commonPublicKey": "CommonPublicKey",
            "encryptedVotes": [["Vote1", "Vote2"]],
            "encryptedTallies": ["Tally1", "Tally2"],
            "decryptionShares": [["Share1", "Share2"]],
            "results": [10, 20, 30]
        }
        ```

## Submit Public Key Share

-   **POST** `/api/polls/:pollId/public-key-share`
    -   **Description**: Submit a public key share for the poll.
    -   **Request Body**:
        ```json
        {
            "publicKeyShare": "PublicKeyShare"
        }
        ```
    -   **Response**: `201 Created` on success.

## Vote

-   **POST** `/api/polls/:pollId/vote`
    -   **Description**: Submit encrypted votes for a poll.
    -   **Request Body**:
        ```json
        {
            "votes": [
                { "c1": "EncryptedValue1", "c2": "EncryptedValue2" },
                { "c1": "EncryptedValue3", "c2": "EncryptedValue4" }
            ]
        }
        ```
    -   **Response**: `200 OK` on success.

## Submit Decryption Shares

-   **POST** `/api/polls/:pollId/decryption-shares`
    -   **Description**: Submit decryption shares for vote tallying.
    -   **Request Body**:
        ```json
        {
            "decryptionShares": [
                ["Share1", "Share2"],
                ["Share3", "Share4"]
            ]
        }
        ```
    -   **Response**: `201 Created` on success.
