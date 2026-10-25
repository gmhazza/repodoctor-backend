# Build a Scalable GitHub Repository Code Analyzer Backend

Build a production-ready, scalable, and performance-efficient backend for a GitHub repository code analysis platform.

The backend must be built with **Node.js + Express.js** and use **Google Gemini / Google Generative AI** for code analysis.

The goal is to accept a GitHub repository, retrieve its files, intelligently filter them, analyze eligible files using Gemini, collect structured findings, and return a clean final JSON response.

---

## 1. Core Technology Stack

Use:

* Node.js
* Express.js
* JavaScript
* Google Gemini API
* GitHub REST API
* Native `fetch`
* `dotenv` for environment configuration
* A proper logging solution
* ESLint + Prettier
* Jest/Vitest for testing

Do not introduce unnecessary frameworks or dependencies.

Keep the architecture modular so components can later be replaced or scaled independently.

---

# 2. Main API

Create an endpoint:

```http
POST /api/analyze
```

Request:

```json
{
  "repository": "https://github.com/owner/repository"
}
```

The backend should:

1. Validate the repository URL.
2. Extract owner and repository name.
3. Retrieve the repository file tree from GitHub.
4. Filter irrelevant files.
5. Retrieve eligible source/config files.
6. Analyze files using Gemini.
7. Maintain a controlled concurrency limit.
8. Collect all findings.
9. Return structured JSON.

---

# 3. Repository File Filtering

Do NOT send the entire repository to Gemini.

Only analyze relevant source-code and useful project/configuration files.

### Ignore directories

At minimum:

```text
node_modules/
.git/
dist/
build/
target/
vendor/
__pycache__/
.venv/
venv/
coverage/
.cache/
.next/
.nuxt/
out/
```

The filtering system should be configurable rather than hardcoded throughout the application.

---

# 4. Supported Source Files

Support common programming languages including:

```text
.js
.jsx
.mjs
.cjs
.ts
.tsx
.py
.c
.h
.cpp
.cc
.cxx
.hpp
.java
.kt
.kts
.scala
.cs
.go
.rs
.php
.rb
.swift
.m
.mm
.dart
.lua
.sh
.bash
.zsh
.fish
.html
.htm
.css
.scss
.sass
.less
.sql
.r
.pl
.pm
.asm
.s
.ex
.exs
.hs
.fs
.fsx
.vb
```

Use an allowlist rather than trying to blacklist every possible non-code extension.

---

# 5. Project Configuration Files

Some non-source files are still useful for analysis.

Allow useful project/configuration files such as:

```text
package.json
requirements.txt
pyproject.toml
Cargo.toml
go.mod
pom.xml
build.gradle
settings.gradle
Makefile
CMakeLists.txt
tsconfig.json
webpack.config.js
vite.config.js
eslint.config.js
```

Do not automatically treat every `.json`, `.yaml`, or `.xml` file as analyzable.

Only include known useful configuration files.

---

# 6. Files That Must Be Ignored

Ignore media and binary files:

```text
.png
.jpg
.jpeg
.webp
.gif
.bmp
.ico
.svg
.mp3
.mp4
.ogg
.wav
.mov
.avi
.zip
.rar
.7z
.pdf
.exe
.dll
.so
.dylib
.log
```

Also ignore dependency lockfiles unless there is a specific reason to analyze them:

```text
package-lock.json
yarn.lock
pnpm-lock.yaml
composer.lock
Cargo.lock
```

---

# 7. Secrets and Sensitive Files

NEVER send secrets to Gemini.

Ignore files such as:

```text
.env
.env.*
*.pem
*.key
*.p12
*.pfx
credentials.json
service-account.json
```

Also implement basic secret detection before sending file contents to an external AI API.

The system should avoid logging source-code contents, secrets, API keys, or Gemini prompts.

---

# 8. File Size Limit

Set a hard maximum file size of:

```text
1 MB
```

Example:

```js
const MAX_FILE_SIZE = 1 * 1024 * 1024;
```

Files larger than 1 MB should **not be analyzed**.

Do not automatically split files larger than 1 MB.

The final response should report skipped files and the reason:

```json
{
  "path": "src/generated.js",
  "reason": "FILE_TOO_LARGE"
}
```

This is intentional to protect performance, memory usage, Gemini usage, and response time.

---

# 9. Gemini Analysis

Every eligible file should be analyzed independently.

Do NOT send the entire repository to Gemini.

Each request should contain:

* File path
* Programming language
* File contents
* Clear analysis instructions

Gemini must return structured JSON.

Use Gemini's JSON response capability / response schema where supported.

Expected structure:

```json
{
  "problems": [
    {
      "line": 42,
      "severity": "high",
      "category": "security",
      "title": "Missing authentication check",
      "description": "The endpoint does not verify the user's authentication status.",
      "suggestedFix": "Add an authentication middleware before accessing the endpoint."
    }
  ]
}
```

If there are no issues:

```json
{
  "problems": []
}
```

Never rely on parsing Markdown or code fences.

The backend must safely parse and validate Gemini's JSON response.

---

# 10. Gemini Prompt

Use a strong system-level analysis prompt.

The model should be instructed to:

* Find real bugs.
* Find security vulnerabilities.
* Find logic errors.
* Find obvious performance problems.
* Find unsafe practices.
* Find incorrect error handling.
* Find problematic resource usage.
* Avoid reporting harmless stylistic preferences as bugs.
* Avoid speculative findings.
* Avoid duplicate findings.
* Include accurate line numbers.
* Explain why something is a problem.
* Provide a practical suggested fix.
* Return ONLY the required JSON structure.

Do not ask Gemini to rewrite the entire file.

The purpose is code review and problem detection.

---

# 11. Concurrency

Do NOT analyze files sequentially.

Do NOT launch unlimited requests using:

```js
Promise.all(files.map(...))
```

Implement a configurable concurrency limiter.

Default:

```text
5 concurrent Gemini requests
```

Example behavior:

```text
File 1 ────────✓
File 2 ─────────────✓
File 3 ───✓
File 4 ─────────✓
File 5 ───────────────✓
                 ↓
As soon as one finishes,
another file starts.
```

There must always be a maximum of 5 active Gemini requests.

Do not use fixed batches where the system waits for all 5 requests before starting new work.

Use a worker-pool or semaphore-style implementation.

Make the concurrency configurable through environment variables:

```env
GEMINI_CONCURRENCY=5
```

---

# 12. Rate Limit Handling

Gemini APIs can return rate-limit errors.

Implement:

* HTTP 429 handling
* Exponential backoff
* Retry limits
* Jitter
* Retry only appropriate transient errors

Example:

```text
Attempt 1 → failure
wait
Attempt 2 → failure
wait longer
Attempt 3 → failure
mark file as failed
```

Do not retry indefinitely.

Make retry configuration configurable:

```env
GEMINI_MAX_RETRIES=3
```

---

# 13. GitHub API Handling

Use GitHub's repository tree API where appropriate instead of recursively making an API request for every directory.

The backend should:

1. Retrieve repository metadata.
2. Retrieve the repository tree.
3. Filter paths before downloading file contents.
4. Download only eligible files.

Do not download files that will immediately be discarded.

Respect GitHub API rate limits.

Handle:

* Repository not found
* Private repository
* Invalid repository
* GitHub rate limits
* Large repositories
* Missing permissions
* Network errors

---

# 14. Memory Efficiency

Do not unnecessarily store the entire repository in memory.

Avoid:

```js
const entireRepository = files.join("\n");
```

Instead:

```text
GitHub
 ↓
file metadata
 ↓
filter
 ↓
download one eligible file
 ↓
analyze
 ↓
discard source content
 ↓
store only findings
```

The system should primarily keep:

```text
file metadata
analysis result
errors
summary
```

rather than the complete source code of the repository.

---

# 15. Result Aggregation

Maintain a single final collection:

```js
const allProblems = [];
```

When a file finishes:

```js
allProblems.push(...result.problems);
```

Add the filename to every finding:

```json
{
  "file": "src/auth.js",
  "line": 42,
  "severity": "high",
  "category": "security",
  "title": "Missing authentication check",
  "description": "...",
  "suggestedFix": "..."
}
```

---

# 16. Final Response

Return a structure similar to:

```json
{
  "repository": {
    "owner": "example",
    "name": "project"
  },
  "summary": {
    "totalFiles": 183,
    "analyzedFiles": 142,
    "skippedFiles": 41,
    "problems": 27,
    "critical": 2,
    "high": 8,
    "medium": 12,
    "low": 5
  },
  "problems": [
    {
      "file": "src/auth.js",
      "line": 42,
      "severity": "high",
      "category": "security",
      "title": "Missing authentication check",
      "description": "...",
      "suggestedFix": "..."
    }
  ],
  "skippedFiles": [
    {
      "file": "dist/bundle.js",
      "reason": "IGNORED_DIRECTORY"
    },
    {
      "file": "large-file.js",
      "reason": "FILE_TOO_LARGE"
    }
  ],
  "failedFiles": []
}
```

---

# 17. Error Isolation

One failed file must NOT terminate the entire repository analysis.

Bad:

```js
await Promise.all(files.map(analyzeFile));
```

where one rejected promise terminates the entire operation.

Instead, each worker should isolate failures.

For example:

```json
{
  "file": "src/example.js",
  "error": "GEMINI_RATE_LIMIT"
}
```

The remaining files should continue processing.

---

# 18. Progress Tracking

Design the backend so progress can later be exposed through WebSockets or Server-Sent Events.

Internally maintain:

```text
total
queued
processing
completed
failed
skipped
```

For example:

```json
{
  "total": 150,
  "completed": 87,
  "processing": 5,
  "failed": 2,
  "skipped": 56
}
```

Do not implement WebSockets unless necessary for the first version, but structure the analysis service so it can support them later.

---

# 19. Large Repository Protection

Implement repository-level limits to prevent abuse.

Configurable values:

```env
MAX_FILES=1000
MAX_TOTAL_SIZE=100MB
MAX_FILE_SIZE=1MB
GEMINI_CONCURRENCY=5
GEMINI_MAX_RETRIES=3
```

If a repository exceeds the configured limits, handle it gracefully.

Do not allow a single request to consume unlimited CPU, memory, GitHub API requests, or Gemini requests.

---

# 20. API Security

Implement:

* Input validation
* Repository URL validation
* Request body size limits
* Rate limiting on `/api/analyze`
* Proper CORS configuration
* Helmet/security headers
* No secret leakage in logs
* Safe error messages
* Request timeout handling

Never expose:

```text
GITHUB_TOKEN
GEMINI_API_KEY
```

to the client.

All API keys must remain server-side.

---

# 21. Project Architecture

Use a clean modular architecture similar to:

```text
src/
├── app.js
├── server.js
│
├── routes/
│   └── analyze.routes.js
│
├── controllers/
│   └── analyze.controller.js
│
├── services/
│   ├── github.service.js
│   ├── gemini.service.js
│   ├── analyzer.service.js
│   ├── file-filter.service.js
│   └── concurrency.service.js
│
├── utils/
│   ├── retry.js
│   ├── logger.js
│   └── validation.js
│
├── config/
│   └── env.js
│
├── middleware/
│   ├── error.middleware.js
│   ├── rate-limit.middleware.js
│   └── validation.middleware.js
│
└── types/
```

Keep business logic out of Express controllers.

Controllers should remain thin.

---

# 22. Configuration

Use environment variables:

```env
PORT=3000

GITHUB_TOKEN=

GEMINI_API_KEY=
GEMINI_MODEL=

GEMINI_CONCURRENCY=5
GEMINI_MAX_RETRIES=3

MAX_FILES=1000
MAX_FILE_SIZE=1048576
MAX_TOTAL_SIZE=104857600
```

Validate required environment variables when the application starts.

---

# 23. Logging

Use structured logging.

Log:

```text
request started
repository discovered
file filtering completed
analysis started
analysis completed
analysis failed
rate limit encountered
repository analysis completed
```

Never log:

```text
source code
API keys
tokens
.env contents
Gemini prompts containing sensitive source
```

---

# 24. Testing

Write tests for:

### File filtering

* `.js` → accepted
* `.py` → accepted
* `.png` → rejected
* `.mp4` → rejected
* `node_modules/` → rejected
* `.env` → rejected
* `package-lock.json` → rejected
* file > 1 MB → rejected
* `package.json` → accepted

### Concurrency

Verify that no more than 5 Gemini requests are active simultaneously.

### Retry

Verify:

* 429 → retry
* transient network error → retry
* successful response → no retry
* maximum retries reached → failure

### Gemini parsing

Test:

* valid JSON
* empty problems
* malformed JSON
* unexpected schema

### API

Test:

* invalid repository URL
* repository not found
* successful analysis
* partial file failures
* GitHub API errors

---

# 25. Performance Requirements

The implementation should prioritize:

1. Low memory usage
2. Controlled concurrency
3. Minimal GitHub API calls
4. Minimal Gemini calls
5. No unnecessary data copying
6. No unlimited Promise creation
7. Efficient file filtering
8. Proper timeout handling
9. Graceful failure
10. Horizontal scalability

Do not prematurely introduce Redis, Kafka, RabbitMQ, Kubernetes, microservices, or a database unless there is a concrete requirement.

Start with a well-designed modular monolith that can later be split into workers if traffic requires it.

---

# 26. Important Implementation Principle

The backend should **never depend on Gemini behaving perfectly**.

Every external API call must be treated as unreliable.

Handle:

```text
timeout
429
500
502
503
network failure
malformed JSON
unexpected response
authentication failure
```

without crashing the entire application.

---

# 27. Deliverables

Build the complete backend, not just pseudocode.

Provide:

1. Complete project structure
2. All source files
3. `package.json`
4. `.env.example`
5. Express server
6. GitHub service
7. Gemini service
8. File filtering service
9. Concurrency worker pool
10. Retry/backoff implementation
11. Validation
12. Error handling
13. Logging
14. Rate limiting
15. Tests
16. README with setup instructions
17. Example API request
18. Example API response

Use clean, maintainable production-quality code.

Before implementing, reason about the architecture and identify potential bottlenecks or failure points. Then implement the solution.

Do not create unnecessary abstractions or dependencies. Keep the system simple, modular, scalable, and performance-focused.
