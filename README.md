# Repo Doctor Backend

A production-ready, scalable, and memory-efficient backend service built with **Node.js + Express.js** that performs intelligent, concurrency-controlled static code analysis on GitHub repositories using **Google Gemini**.

---

## Features

- **Intelligent File Filtering**:
  - Automatically skips build artifacts (`node_modules/`, `dist/`, `.next/`, etc.), media/binary files, and lockfiles.
  - Allowlist-based source file detection across 40+ programming languages and essential configuration files (`package.json`, `Cargo.toml`, etc.).
  - Hard file size limit (1 MB) to prevent memory ballooning and runaway AI quotas.
- **Strict Secret Detection & Privacy**:
  - Automatically skips sensitive files (`.env`, `credentials.json`, `*.pem`, `service-account.json`).
  - Scans file contents for secrets (AWS keys, GitHub tokens, Google API keys, private keys, database connection strings) before dispatching to external APIs.
  - Zero logging of source code or API keys.
- **Controlled Concurrency Worker Pool**:
  - Dynamic worker pool / semaphore architecture ensuring a strict maximum of active Gemini requests (default: 5).
  - Continuous streaming: as soon as one file finishes, the next queued file starts immediately without waiting for batches.
- **Resilient Retry & Backoff**:
  - Exponential backoff with full jitter for handling HTTP 429 rate limits and transient network interruptions.
- **Isolated Failure Handling**:
  - If a file fails analysis or exceeds retry budgets, it is captured in `failedFiles` without aborting the rest of the repository.
- **Low Memory Footprint**:
  - Streams repository trees via the GitHub Git Trees API.
  - Downloads eligible files on-demand just in time and discards source contents immediately after analysis.
- **Security & Reliability**:
  - Rate limiting on `/api/analyze` to prevent abuse.
  - `helmet` security headers, CORS protection, and payload size enforcement.
  - Structured JSON logging with `pino`.

---

## Project Architecture

```text
src/
├── app.js                          # Express app configuration & middleware pipeline
├── server.js                       # Server startup, validation & graceful shutdown
│
├── routes/
│   ├── analyze.routes.js           # POST /api/analyze route definition
│   └── health.routes.js            # GET /health health & status check
│
├── controllers/
│   └── analyze.controller.js       # Thin controller delegating to analyzer service
│
├── services/
│   ├── analyzer.service.js         # Core orchestrator pipeline
│   ├── github.service.js           # GitHub REST & Git Trees API client
│   ├── gemini.service.js           # Google Gemini API client & schema validator
│   ├── file-filter.service.js      # Allowlist & denylist filtering engine
│   ├── concurrency.service.js      # Dynamic worker pool / semaphore
│   └── progress.service.js         # Event-driven progress tracker (SSE/WebSocket ready)
│
├── utils/
│   ├── retry.js                    # Exponential backoff with jitter
│   ├── secret-detector.js          # Filename and content secret detection
│   ├── validation.js               # GitHub URL parser and validator
│   └── logger.js                   # Redacted structured JSON logger
│
├── config/
│   ├── env.js                      # Environment parsing & startup validation
│   └── constants.js                # Extension mappings, ignore rules, and schemas
│
└── middleware/
    ├── validation.middleware.js    # Payload and URL validation middleware
    ├── rate-limit.middleware.js    # IP rate limiting
    └── error.middleware.js         # Centralized error and 404 handler
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or later
- **Google Gemini API Key**: [Get an API key](https://aistudio.google.com/)
- **GitHub Personal Access Token** *(Optional, recommended to increase rate limit from 60 to 5,000 req/hr)*

### Installation

1. Clone or navigate to the repository:
   ```bash
   cd repo-doctor-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your `GEMINI_API_KEY`:
   ```env
   PORT=3000
   NODE_ENV=development
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-2.5-flash
   GITHUB_TOKEN=your_github_token_here
   GEMINI_CONCURRENCY=5
   GEMINI_MAX_RETRIES=3
   ```

4. Start the server:
   ```bash
   # Development (with auto-reload)
   npm run dev

   # Production
   npm start
   ```

---

## API Specification

### Health Check

```http
GET /health
```

#### Response (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-10-04T08:30:00.000Z",
  "uptime": 124.5,
  "environment": "development",
  "concurrency": 5,
  "model": "gemini-2.5-flash"
}
```

---

### Analyze Repository

```http
POST /api/analyze
Content-Type: application/json
```

#### Example Request:
```json
{
  "repository": "https://github.com/expressjs/express"
}
```

#### Example Response (200 OK):
```json
{
  "repository": {
    "owner": "expressjs",
    "name": "express"
  },
  "summary": {
    "totalFiles": 183,
    "analyzedFiles": 142,
    "skippedFiles": 41,
    "problems": 4,
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 1
  },
  "problems": [
    {
      "file": "lib/router/index.js",
      "line": 142,
      "severity": "high",
      "category": "security",
      "title": "Unvalidated redirect target",
      "description": "User supplied input from request query is forwarded directly without sanitization.",
      "suggestedFix": "Validate target URL against an allowlist of permitted domain hosts."
    },
    {
      "file": "lib/response.js",
      "line": 88,
      "severity": "medium",
      "category": "error-handling",
      "title": "Unhandled error callback",
      "description": "Callback error parameter is not checked before invoking handler.",
      "suggestedFix": "Add if (err) return next(err); at the start of the callback."
    }
  ],
  "skippedFiles": [
    {
      "file": "dist/bundle.js",
      "reason": "IGNORED_DIRECTORY"
    },
    {
      "file": "package-lock.json",
      "reason": "IGNORED_LOCKFILE"
    },
    {
      "file": "assets/logo.png",
      "reason": "IGNORED_MEDIA_OR_BINARY"
    },
    {
      "file": ".env",
      "reason": "SENSITIVE_FILE"
    }
  ],
  "failedFiles": []
}
```

### Mailer

```http
POST /mail
Content-Type: application/json
```

#### Example Request:
```json
{
  "name": "name of user",
  "subject": "subject user want to discuss",
  "body": "discussion"
}
```

#### Response (200 OK):
```json
{
  "message": "mail sended successfull"
}
```

#### Response (500 SERVER ERROR):
```json
{
  "message": "error.message"
}
```

---

## Configuration Reference

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the Express server listens on | `3000` |
| `NODE_ENV` | Application environment (`development` / `production`) | `development` |
| `GEMINI_API_KEY` | Google Gemini API Key | *Required in production* |
| `GEMINI_MODEL` | Gemini model to use for analysis | `gemini-2.5-flash` |
| `GEMINI_CONCURRENCY` | Maximum concurrent Gemini API requests | `5` |
| `GEMINI_MAX_RETRIES` | Max retries for transient failures / 429 rate limits | `3` |
| `GEMINI_RETRY_BASE_DELAY_MS` | Initial base delay for exponential backoff (ms) | `1000` |
| `GITHUB_TOKEN` | GitHub Personal Access Token (for private repos & higher rate limits) | `null` |
| `MAX_FILES` | Max files permitted in repository tree before rejection | `1000` |
| `MAX_FILE_SIZE` | Max file size in bytes analyzed by Gemini (1 MB) | `1048576` |
| `MAX_TOTAL_SIZE` | Max cumulative repository size allowed (100 MB) | `104857600` |
| `REQUEST_TIMEOUT_MS` | Network timeout for outbound GitHub & Gemini calls | `60000` |
| `RATE_LIMIT_WINDOW_MS` | Window for API rate limiting | `900000` (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per IP in the window | `100` |

---

## Testing & Quality

Run the comprehensive automated test suite (unit tests, worker pool concurrency verification, retry logic, parser tests, API validation, and error isolation):

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Format code
npm run format
```

All 41 tests pass across 6 test suites covering:
1. Allowlist and denylist file filtering.
2. Dynamic worker pool with exact concurrency cap.
3. 429 rate limiting, jittered backoff, and transient error recovery.
4. Gemini structured JSON response parsing and malformed input resilience.
5. GitHub URL validation, malicious path traversal protection, and secret regex detection.
6. End-to-end Express route integration, partial failure isolation, and error handling.
