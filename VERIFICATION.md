# Verification — 2026-09-16

## Prisma upgrade — 2026-09-17

- Upgraded Prisma CLI, Prisma Client, and the PostgreSQL adapter to the latest stable npm versions verified that day: **7.10.0**. The CLI's `latest` tag pointed to `8.0.0-rc.15`, so the stable versions are pinned explicitly.
- Switched to the generated `prisma-client` provider with CommonJS output, explicit PostgreSQL adapter initialization, and configuration-based datasource URL. Generation without database credentials passed in an isolated configuration, covering the Docker build path.
- Added automatic client generation before backend development and builds. Generated sources are ignored by Git, Docker context, and formatting.
- Existing PostgreSQL migration history remains valid. `prisma validate`, `migrate deploy`, and `migrate diff --exit-code` passed; the diff detected no database changes.
- Verified a clean dependency installation, both production builds, 34 backend tests (including PostgreSQL integration), 3 frontend tests, and the Playwright browser workflow. The compiled CommonJS database service also connected to PostgreSQL successfully.
- Patched vulnerable CLI dependencies with root overrides. The CLI now lives at the monorepo root to avoid npm 11's workspace override resolution issue. `npm install`, `npm ls`, and `npm audit --audit-level=high` pass, with zero reported vulnerabilities.
- Docker Engine remained unavailable. PostgreSQL tests used the isolated local test cluster; Redis was substituted in memory. No live OpenAI calls were made and no database reset was performed.

## Initial MVP verification

- Dependencies installed; npm lockfile committed as a project artifact.
- Prisma Client generated successfully (Prisma 6.12.0, pinned).
- Initial migration applied successfully to a separate PostgreSQL 18 test cluster on port 55439. A second deploy confirmed no pending migrations.
- Backend TypeScript build and frontend TypeScript/Vite production build passed.
- 34 backend tests passed: validation, tenant isolation, SQL ownership constraints, PDF/DOCX extraction, upload limits, sessions, invitation reuse, pipeline stages, AI schema handling, evidence verification, stale results, and mocked AI success/failure flows.
- 3 frontend component tests passed.
- 1 Playwright end-to-end test passed using installed Google Chrome: registration, vacancy/candidate creation, application linking, manual pipeline update, invitation generation, and mobile navigation. No browser runtime errors were recorded.
- Desktop and mobile screenshots were visually inspected. They are in ignored `.local/dashboard-desktop.png` and `.local/candidates-mobile.png`.
- `npm audit --audit-level=high`: zero vulnerabilities reported.
- Both base and development Docker Compose configurations passed validation.

## What was not verified live

- Docker Engine was unavailable on this machine, so image builds and actual Compose startup were not executed. Existing PostgreSQL data was not modified; tests used a separate cluster.
- Local HTTP and browser tests used an in-memory Redis substitute. CI is configured to exercise the same HTTP suite against a real Redis service using `TEST_REDIS_URL`.
- No OpenAI API key was supplied, and no live/paid OpenAI calls were made. Structured AI outputs, refused/incomplete responses, missing-key errors, and orchestration were verified with mocks.
- CI configuration was created but has not run on a remote CI service. No public deployment or production security audit was performed.

Temporary test servers were stopped after verification. Their ignored test data is retained under `.local`; the normal app starts from the root `.env` with Docker PostgreSQL on port 5433 and Redis on port 6379.

See [README.md](README.md) for setup and production deployment requirements. The previous OpenAI setup has been superseded by the Gemini migration below.

## Gemini migration — 2026-09-17

- Root `.env` now uses the existing `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.5-flash`, and `GEMINI_EMBEDDING_MODEL=gemini-embedding-2`. No credentials were printed.
- Replaced OpenAI Responses with Gemini generateContent and validated structured JSON; added embedContent for professional CV summary/skills, persisted with model metadata in parsedResume.
- Model metadata requests succeeded for both configured models. A live synthetic CV smoke test passed through AiService.parse, returning structured resume data and a 768-dimensional embedding. No real candidate data was used, and the smoke test used an in-memory database stub.
- Backend/frontend production builds passed. Unit tests passed; database integration tests were skipped because TEST_DATABASE_URL was not configured.

## Interview generation resilience — 2026-09-17

- Investigated application 1 without saving diagnostic output; Gemini returned six interview questions successfully. The original 502 did not reproduce, so its exact cause remains unconfirmed.
- Added one bounded retry for Gemini HTTP 429/5xx and transient connection failures, sharing the original request timeout. Quota/access/timeout errors now have distinct user messages and sanitized server diagnostics.
- Backend build and 23 tests passed, including transient 503 recovery, persistent quota exhaustion, timeout handling, and lock release. Seventeen database integration tests remain skipped.
- No startTime/reportAllChanges references were found in application source; the anonymous browser script error remains unattributed.

## Application review workflow — 2026-09-17

- Applied additive review fields and stage-history migration to the configured database without resetting existing records.
- Implemented next-stage actions, interviewer answers/notes with optimistic revision checks, and atomic stage history with authenticated actor snapshots. Existing answers survive AI guide/CV/vacancy changes. Historical changes before the migration are not fabricated.
- All 42 backend tests passed against a fresh isolated PostgreSQL schema (including HTTP tests); Redis was substituted in memory. The test schema was removed afterward. Five frontend tests passed.
- Edge browser end-to-end test passed on desktop and mobile: stage transitions, history, note persistence after reload, dirty-state controls, and terminal-stage behavior. Synthetic question fixture avoided paid AI calls. Test candidate and vacancy were deleted afterward.
- Backend/frontend builds passed. Screenshots: `.local/review-workflow-desktop.png` and `.local/review-workflow-mobile.png`.

## AI job description generator — 2026-09-17

- Added authenticated, rate-limited vacancy draft generation using the existing gemini-3.5-flash configuration, with a separate job-writing system prompt, strict output validation, and Uzbek/English/Russian selection. Draft generation does not write to the database.
- Create/edit vacancy forms now preview drafts and apply title, description, and requirements only on Use draft. HR can edit and save through the existing vacancy endpoint; existing status remains unchanged.
- Live Gemini smoke test for “Middle NestJS developer kerak” returned an Uzbek description and six structured requirements; the existing retry recovered one transient HTTP 503. No vacancy was saved by this smoke test.
- All 45 backend tests passed, including isolated PostgreSQL HTTP tests for authentication, malformed input, tenant-field injection, missing-key errors, and no writes during generation. Eight frontend tests passed. Backend and frontend builds passed.
- Edge desktop/mobile end-to-end test passed for preview, apply, edit, and real vacancy save using a deterministic generated-response fixture; the test vacancy was removed afterward. Screenshots: `.local/vacancy-generator-desktop.png` and `.local/vacancy-generator-mobile.png`.
