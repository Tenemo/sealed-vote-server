# Sealed Vote Server

This is the backend server for the [sealed.vote](https://sealed.vote) application, built using Fastify. It is designed to handle the creation and management of polls, where users can vote on various options, and the results are calculated using geometric mean for fairness and anonymity.

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

## Project structure

-   `src/`: Source code for the entire application.
    -   `routes/`: Contains Fastify routes for handling different API endpoints.
        -   `create-poll.ts`: Endpoint for creating new polls.
        -   `poll.ts`: Endpoint for retrieving poll details and results.
        -   `vote.ts`: Endpoint for submitting votes to a poll.
    -   `server.ts`: The main entry point for the Fastify server.
    -   `sql/`: SQL scripts for setting up the database schema.
        -   `create.sql`: Contains SQL commands to create the database tables.
        -   `drop.sql`: Contains SQL commands to drop the database tables if necessary.
    -   `typings/`: Custom type definitions.
        -   `gmean.d.ts`: Type definitions for the `gmean` package.
-   `config/`: Configuration files for various tools used in the project.
    -   `.babelrc.js`: Babel configuration for transpiling TypeScript.
    -   `.editorconfig`: Maintains consistent coding styles for various editors and IDEs.
    -   `.eslintrc.js`: ESLint configuration for linting and code quality checks.
    -   `.eslintignore`: Specifies files and directories that ESLint should ignore.
    -   `tsconfig.json`: Configuration for TypeScript compiler options.
-   `.env`: Environment variables for local development (not tracked by Git).
-   `.env.sample`: Sample file for setting up environment variables.
-   `docker-compose.yml`: Docker Compose configuration for local development, setting up services like PostgreSQL.
-   `.gitignore`: Specifies intentionally untracked files to ignore.
-   `nodemon.json`: Configuration for Nodemon, to automatically restart the node application when file changes are detected.
-   `package.json`: Contains metadata about the project and lists the project's dependencies.
-   `README.md`: A detailed guide about the project, setup instructions, and other useful information.
-   `.vscode/`: Recommended settings and extensions for Visual Studio Code.
    -   `extensions.json`: Suggests useful extensions to install.
    -   `settings.json`: Recommended settings for a consistent development environment.

## Contribution

Contributions are welcome! Please feel free to submit a pull request.

## License

This project is unlicensed and free for use and modification.
