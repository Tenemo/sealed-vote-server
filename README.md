# sealed.vote server

This is the backend for the [sealed.vote](https://sealed.vote) application, built using Fastify. Uses the [threshold-elgamal](https://www.npmjs.com/package/threshold-elgamal) package to provide REST API endpoints for managing a homomorphic encryption-based vote.

[Endpoint documentation](docs/endpoints.md)

## Features

-   Creation of polls with a customizable number of choices.
-   Voting on polls with a simple, user-friendly API.
-   Retrieval of poll results, including the geometric mean of scores for each choice.
-   Basic setup with PostgreSQL for data persistence.
-   Environmental variable-based configuration for database connections and server settings.
-   Integrated eslint and prettier for code quality and consistency.
-   Docker support for easy deployment and development.
-   Comprehensive typescript support for strong typing across the project.

## TODO:

-   restrict the amount of participants
-   allow creator to update the polls
-   allow creator to close polls
-   rate limiting
-   tests
-   fix 500 when a voter already voted

## Installation and running

First, clone the repository and install the dependencies:

```bash
git clone https://github.com/Tenemo/sealed-vote-server.git
cd sealed-vote-server
npm install
```

Create a `.env` file at the root of the project based on `.env.sample` for local development:

```.env
NODE_ENV=development
PORT=4000
DATABASE_URL=<your_database_url>
```

To start the server locally:

```bash
npm run dev
```

For production, build the project and then start it:

```bash
npm run build
npm start
```

## Local database in Docker

To run the database for the project using Docker, ensure you have Docker installed, then use:

```bash
npm run docker:up
```

This will set up the PostgreSQL database and the application in containers.
