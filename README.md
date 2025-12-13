# AWS SST Telegram Bot

[![SST](https://img.shields.io/badge/SST-v3-orange)](https://sst.dev)
[![Tanstack Start](https://img.shields.io/badge/Tanstack_Start-v1-blue)](https://tanstack.com/start)

This project has been migrated from Serverless Framework v4 to **SST (Serverless Stack)**. It includes a backend Telegram bot and a frontend built with **Tanstack Start**.

## Architecture

*   **Backend**: SST (AWS Lambda, DynamoDB, EventBridge)
*   **Frontend**: Tanstack Start (deployed via SST)
*   **Language**: TypeScript

## Getting Started

### Prerequisites

*   Node.js (v20+)
*   Bun (optional, but recommended for package management)
*   AWS Credentials configured

### Installation

1.  Install dependencies:
    ```bash
    bun install
    ```

2.  Initialize the frontend:
    ```bash
    cd web
    bun install
    cd ..
    ```

### Development

Start the local development environment (SST Ion):

```bash
bun run dev
```

This will start the SST Live Lambda environment and the Tanstack Start development server.

### Deployment

Deploy to AWS:

```bash
bun run deploy
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your secrets. SST will load these automatically in development. For production, use `sst secret set` or configured environment variables in your CI/CD.

## Project Structure

*   `src/`: Backend Lambda functions (Telegram bot, schedulers, image processing)
*   `web/`: Tanstack Start frontend application
*   `sst.config.ts`: Infrastructure as Code (SST configuration)
