# Shortlist — AI HR Recruiter

A working multi-tenant recruiting MVP built with NestJS, React/Vite, TypeScript, PostgreSQL, Prisma, Redis, and the Google Gemini API. AI organizes CV information, maps evidence to requirements, and proposes interview questions. It never changes an application stage, ranks candidates, or decides hiring/rejection.

## Quick start

Requirements: Node.js 22.12+ (Node 24 also supported), npm, and a running Docker engine.

```sh
npm ci
npm run setup
npm run infra:up
npm run prisma:generate
npm run db:migrate
npm run dev
```

Open **http://localhost:5173**. Create a workspace to register your company and its first administrator. The API runs on port 3000. The Vite proxy keeps browser API requests same-origin. Docker PostgreSQL uses host port **5433** by default to avoid conflicting with an existing PostgreSQL installation; configure `POSTGRES_PORT` and `DATABASE_URL` together to change it.

`npm run setup` creates `.env` only if it does not already exist, generating separate random database, Redis, and JWT secrets. It never overwrites an existing file and leaves `GEMINI_API_KEY=` blank. Alternatively copy `.env.example` to `.env` and configure it yourself. No API key is needed to use non-AI features. Never commit `.env`.

To enable AI, add your key to the root `.env`, confirm `GEMINI_MODEL` is available to your Google AI Studio project, and restart the backend. The default model is configurable (`gemini-3.5-flash`). CV parsing also creates a 768-dimensional embedding with `GEMINI_EMBEDDING_MODEL=gemini-embedding-2` from up to 8,000 characters of the professional summary and skills. It is saved with its model and dimensions in `parsedResume.embedding`; replacing the CV clears it along with the parsed resume. Existing CVs need to be parsed again to create embeddings. These vectors are stored for future semantic retrieval; they do not rank candidates. [Gemini embeddings documentation](https://ai.google.dev/gemini-api/docs/embeddings). The frontend receives only an `aiConfigured` boolean, never a key. AI actions require the user to explicitly authorize sending the CV and vacancy to Google Gemini. Without a key the API returns 503 with an actionable message, and the UI disables AI actions.

## Workflow

1. Register a company and administrator from the sign-in page.
2. In **Team & access**, create a single-use, email-bound invitation link for an HR user or recruiter. Share it yourself. Invitations expire after 24 hours; public registration cannot join an arbitrary company.
3. Create a vacancy with job-related requirements. Mark each as required or optional.
4. Add a candidate, then upload their PDF/DOCX from their profile. Text extraction works without AI.
5. Optionally parse the resume into structured skills, experience, education, and languages.
6. In **Hiring pipeline**, create an application linking a candidate to a vacancy.
7. Open the application to match CV evidence and generate interview questions.
8. Your team manually selects NEW, REVIEWING, INTERVIEW, OFFER, HIRED, or REJECTED.

Evidence statuses mean:

| Status    | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| SUPPORTED | Explicit CV evidence supports the requirement                            |
| PARTIAL   | Some aspects are supported                                               |
| NOT_FOUND | No relevant statement was found; this does not establish lack of ability |
| UNKNOWN   | Ambiguous, unassessable, or unverifiable evidence; human review needed   |

Exact AI quotes are checked against the original extracted CV text. Unsupported quotes are downgraded to UNKNOWN. Responses must contain every requirement exactly once. Replacing a CV or editing a vacancy clears previous analysis/questions. Revision checks prevent stale AI results from being saved during concurrent edits.

## Project layout

### Prisma ORM 7

`prisma`, `@prisma/client`, and `@prisma/adapter-pg` use matching **7.10.0** versions, the newest stable versions verified in the npm registry on 2026-09-17. The CLI's `latest` tag currently points to an 8.0 release candidate, so the project pins the stable versions explicitly.

The client is generated into `apps/backend/src/generated/prisma` with CommonJS output to match NestJS. Imports use that generated client. `Database` uses `PrismaPg`, a five-second connection timeout, and the schema from `DATABASE_URL` (default `public`). The database URL belongs in `prisma.config.ts` and environment variables, not in the Prisma schema. `predev` and `prebuild` regenerate the client automatically; generated code is excluded from Git and formatting.

The Prisma CLI is a root development dependency shared by the workspaces. Keeping it at the root also avoids npm 11's workspace override resolution issue. Patched `deepmerge-ts`, `mysql2`, and `lodash` dependencies are selected through root overrides; both `npm ci` and `npm install` preserve the verified dependency tree. The application still uses PostgreSQL exclusively; MySQL support is a transitive CLI dependency.

These changes follow the [official Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7). Existing database tables and migration history remain compatible; no database reset is needed. CLI generation also works without database credentials, which allows Docker images to build without embedding secrets.

```text
apps/backend/
  prisma/schema.prisma
  prisma/migrations/202609160001_initial/migration.sql
  src/auth.controller.ts       Registration, login, invitations
  src/security.ts              JWT sessions, Redis rate limits, tenant identity
  src/recruiting.*             Tenant-scoped recruiting CRUD
  src/resume.ts                Protected upload, download, extraction
  src/ai.*                    Structured parsing, evidence, questions
  src/integration.test.ts      Real PostgreSQL HTTP integration tests
apps/frontend/
  src/                        React workspace and tests
  e2e/                        Playwright browser flow
scripts/setup.mjs              Non-overwriting environment setup
compose.yaml                  PostgreSQL, Redis, optional application services
```

Candidates are company-owned. Applications use composite foreign keys containing `companyId`, so PostgreSQL itself rejects cross-company candidate/vacancy links. CV files are stored in a private Cloudflare R2 bucket when all `R2_*` variables are configured. PostgreSQL keeps the tenant-scoped object key, original filename, MIME type, size and extracted text; downloads still pass through the authenticated API and the bucket is never public. Legacy PostgreSQL byte records remain readable and can be moved with `npm run storage:migrate` after applying migrations.

## Commands

Use `npm run doctor` to check PostgreSQL and Redis connectivity without displaying credentials. Registration requires both services. The public `GET /api/auth/session` endpoint returns `{ "user": null }` when signed out; protected routes still return 401 without authentication.

| Command                                                | Purpose                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `npm run dev`                                          | Start backend and frontend watchers                                      |
| `npm run build`                                        | Strict TypeScript compilation and Vite production build                  |
| `npm test`                                             | Unit/UI tests; integration suite also runs if `TEST_DATABASE_URL` is set |
| `npm run test:e2e -w apps/frontend`                    | Browser flow against an already-running app                              |
| `npm run format`                                       | Format maintained source/configuration files                             |
| `npm run prisma:generate`                              | Generate Prisma Client                                                   |
| `npm run db:migrate`                                   | Apply committed migrations                                               |
| `npm run db:dev -w apps/backend -- --name your_change` | Create a development migration (use a development DB only)               |
| `npm run infra:stop`                                   | Stop containers, preserving data                                         |

## Testing

Unit tests verify tenant-scoped lookups, quote verification, complete requirement coverage, strict inputs, missing-key behavior, and AI consent UI. Integration tests use a real PostgreSQL database and an in-memory Redis substitute. They cover HTTP auth, cross-tenant access, composite foreign keys, uploads/downloads, status changes, invitations, and stale-result clearing. They create uniquely named test companies; they never wipe a database. Use a dedicated disposable database.

PowerShell example:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/recruiter_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run db:migrate
npm run test -w apps/backend
```

For real Redis integration, set `TEST_REDIS_URL` too. It must point at a dedicated test Redis database. Tests use a unique key prefix, and all session/rate-limit keys expire; no global flush is performed.

Browser tests create an isolated company through the UI and exercise vacancy creation, candidate creation, application linking, stage changes, invitations, and mobile navigation. Start the real app, run `npx playwright install chromium`, then `npm run test:e2e -w apps/frontend`. The default test address is `http://127.0.0.1:5173`; set `FRONTEND_ORIGIN` to this exact origin while running browser tests (or set `E2E_BASE_URL=http://localhost:5173`).

## API

All routes are under `/api`. Sessions use an HttpOnly, SameSite=Lax JWT cookie with an 8-hour lifetime and a Redis-backed revocation record. Production cookies are Secure. There are no browser-localStorage tokens. All POST/PUT/DELETE requests require `X-Requested-With: recruiter-web` and any supplied Origin must match `FRONTEND_ORIGIN`. CORS allows only that exact origin.

| Method and path                                          | Action                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /auth/register`                                    | Create company + administrator (`companyName`, `fullName`, `email`, `password`) |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`  | Session management                                                              |
| `GET /auth/team`, `POST /auth/invitations`               | Administrator-only team listing and invitations (`email`, `role`: HR/RECRUITER) |
| `POST /auth/accept-invitation`                           | HR registration (`token`, `fullName`, `password`)                               |
| `GET/POST /vacancies`, `GET/PUT/DELETE /vacancies/:id`   | Vacancy CRUD; full replacement PUT includes `requirements` array                |
| `GET/POST /candidates`, `GET/PUT/DELETE /candidates/:id` | Candidate CRUD                                                                  |
| `POST /candidates/:id/resume`                            | Multipart upload, field `file`                                                  |
| `GET /candidates/:id/resume`                             | Private CV download                                                             |
| `POST /candidates/:id/parse`                             | Structured resume parsing, JSON `{ "consent": true }`                           |
| `GET/POST /applications`, `GET/DELETE /applications/:id` | Application management                                                          |
| `PUT /applications/:id/status`                           | Human-selected `status`                                                         |
| `POST /applications/:id/analyze`                         | Requirement evidence, JSON `{ "consent": true }`                                |
| `POST /applications/:id/questions`                       | Interview questions, JSON `{ "consent": true }`                                 |
| `GET /dashboard`, `GET /health`                          | Tenant summary and dependency health                                            |

List routes accept `page` (1-based, 20 items/page) and `search`. IDs and company ownership are checked on every operation. All authenticated roles can manage recruiting records; only administrators can invite teammates or view the team list. Error responses contain `statusCode` and `message`, never database credentials or raw provider errors.

## Docker deployment

PostgreSQL and Redis bind to loopback only and persist in named volumes. Compose requires non-empty passwords. Generated setup passwords are URL-safe; if supplying your own, use URL-safe passwords in Compose connection URLs. No containers or volumes are deleted by setup commands.

For a full local Docker preview:

```sh
docker compose -f compose.yaml -f compose.dev.yaml --profile app up --build -d
```

Open **http://localhost:8080**. The override enables localhost HTTP cookies for development only. The backend runs migrations before listening. Nginx forwards `/api` and serves the React SPA.

The bundled Nginx configuration allows CV request bodies up to 6 MB (the application accepts 5 MB files plus multipart overhead), caches hashed frontend assets for one year, applies CSP and browser security headers, limits general API traffic per client IP, and applies a stricter limit to registration, login, and invitation acceptance. Redis-backed application limits remain authoritative for authenticated users, uploads, AI operations, and session validation.

For production, use `docker compose --profile app up --build -d` without the development override. Set `FRONTEND_ORIGIN` to your public **HTTPS** origin and place a TLS reverse proxy in front of the loopback frontend port. Startup refuses production mode with an HTTP origin. Use a secrets manager to inject environment variables; rotate credentials, back up PostgreSQL including CVs, and apply retention/deletion policies appropriate to your organization. Run migrations once per release before scaling backend replicas. Configure proxy rate limits as well as application limits; the app deliberately does not blindly trust forwarded IP headers.

## Scope and operational limits

- This is an MVP, not a claim of a completed production security audit or deployment. Test your infrastructure, backups, restore procedure, monitoring, and organization-specific policies before accepting real candidate data.
- PDF/DOCX maximum: 5 MB; PDFs up to 50 pages; extracted text up to 80,000 characters. Encrypted/scanned PDFs and malformed documents are rejected. No OCR or antivirus service is included.
- AI requests are explicit and synchronous with a configurable timeout (default 60 seconds), per-user limits, and per-record Redis locks. The SDK does not retry automatically. No background job queue is included.
- Gemini structured JSON outputs are validated with Zod before saving. [Official structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).
- Evidence/parsed profiles are advisory and require human verification. Prompts avoid sensitive attributes and hiring recommendations. The application never automatically advances or rejects an application.
- No billing, password-reset email service, email verification, SSO/MFA, automated invitation delivery, calendar integration, or audit-event export is included. An administrator’s email is not verified at initial workspace creation.
- Redis is required for sessions/rate limiting. Failures prevent authenticated operations rather than silently disabling security. Logout revokes the current session.
- Delete controls request confirmation. Deleting a candidate deletes their CV and applications; deleting a vacancy deletes its applications. Production operators should configure backups and retention before enabling deletion for a team.

### Application review workflow

- Use **Move to Reviewing / Interview / Offer / Hired** at the top of an application, then confirm. The current and next stages are displayed together. Hired and Rejected have no automatic next stage; the stage selector remains available for manual changes.
- Under **Interview guide**, record candidate answers, per-question HR notes, and overall interview notes, then click **Save interview notes**. Saved answers keep their original question text when the AI guide or CV/vacancy changes. Save drafts before leaving the page or changing stages. Concurrent edits are rejected rather than silently overwriting another reviewer.
- **Stage history** records the previous/new stage, authenticated reviewer, and timestamp. New applications also record their creation. Earlier changes from before the migration cannot be reconstructed.
- Run `npm run db:migrate` when updating an existing installation; the migration adds review fields and stage history without deleting existing data.

### AI job description generator

In **Create vacancy** or **Edit vacancy**, enter a short brief such as “Middle NestJS developer kerak” and choose Uzbek, English, or Russian. **Generate job description** uses the configured Gemini model to prepare a title, professional description, and structured requirements. Preview the output, click **Use draft** to replace those form fields, edit as needed, and click **Save vacancy**. Generation alone never creates or updates a vacancy, and does not change its status.

The authenticated `POST /api/vacancies/generate-description` endpoint accepts `{ "brief": "Middle NestJS developer kerak", "language": "uz" }`; the brief must contain 5–3000 characters. It shares the existing AI rate limit, request timeout and retry handling. No new API key or database migration is needed.

## Telegram Business CV intake

Set `TELEGRAM_BOT_TOKEN`, a random `TELEGRAM_WEBHOOK_SECRET`, and the full public HTTPS `TELEGRAM_WEBHOOK_URL`, then run `npm run telegram:webhook`. The webhook endpoint is `POST /api/v1/integrations/telegram/webhook`. It accepts Telegram's secret header and is the only state-changing route exempt from the browser CSRF header.

Business connection updates are stored unclaimed because this is a multi-tenant application. Copy the opaque connection ID from the backend log and claim it under **Team & access → Telegram Business**. A connection can belong to only one company. Messages received before it is claimed do not create candidates.

For a claimed connection, an incoming PDF or DOCX up to 10 MB creates or reuses the candidate by company and Telegram user ID, creates a resume history record, and queues processing in BullMQ. The worker downloads from Telegram, verifies the actual PDF/DOCX signature, extracts text, stores the private file in R2, updates the candidate's current CV, and records timeline events. Jobs retry three times with exponential backoff. CV text and contact details are never logged. Gemini processing remains an explicit HR action in the candidate screen; Telegram intake does not automatically send personal data to AI.
