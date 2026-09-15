# Codex Job Application Runbook

## Purpose

JobApplier prepares a small deterministic set of jobs so Codex can spend its expensive work on the application itself instead of job discovery, deduplication, eligibility classification, catalog freshness, or prior-application research.

The responsibility boundary is:

```text
GitHub Actions
-> fetch configured job sources
-> normalize / accepted-title filter / remote-US filter
-> classify Easy/Quick Apply
-> dedupe with stable canonical job_id
-> publish catalog.sqlite

jobs:next
-> check the published job-catalog release
-> refresh local catalog.sqlite only when newer
-> verify SHA-256 + SQLite integrity before replacement
-> consult durable user.sqlite status
-> return only the next eligible jobs

Codex + Ego Lite
-> process one returned job at a time
-> use the existing application workflow
-> record the outcome immediately with application:result
```

Codex must not perform broad job-board discovery during an application session.

## One-time local setup

Install dependencies and initialize the private local ledger schema:

```bash
npm ci
npm run db:user:push
```

For this private repository/release, set `CATALOG_GITHUB_TOKEN` in a local environment file or shell environment. Never commit the token.

No Next.js UI, manual catalog-sync step, or persistent application queue is required for the Codex workflow.

## Retrieve prepared jobs

Run:

```bash
npm run jobs:next -- --limit 10
```

`jobs:next` automatically checks the published `job-catalog` release before selecting jobs. A newer valid catalog is installed atomically. If refresh verification fails, the command fails closed and returns no job batch.

The limit must be an integer from 1 through 100. The default is 10.

### Success JSON contract

```json
{
  "catalogStatus": "updated",
  "jobs": [
    {
      "jobId": "canonical-job-id",
      "title": "Project Manager",
      "company": "Example Co",
      "location": "Remote",
      "applicationUrl": "https://example.com/apply/123",
      "applicationType": "easy_apply",
      "sources": ["builtin"],
      "postedAt": 1789401600000
    }
  ]
}
```

`catalogStatus` is either `updated` or `current`.

An empty eligible set is successful:

```json
{
  "catalogStatus": "current",
  "jobs": []
}
```

The command returns only jobs that are active, confirmed remote-US, confirmed remote, confirmed Easy/Quick Apply, have a supported application type and application URL, and are not durably marked `applied`, `skipped`, `needs_review`, or `failed`. Review/failed jobs require an explicit future retry/reset path instead of being automatically handed back to Codex and consuming more browser credits.

### Error contract

The CLI writes JSON to stderr and exits non-zero:

```json
{"error":"reason"}
```

Codex must stop rather than bypass a catalog-refresh or database error.

## Record each application outcome

Immediately after each Ego Lite attempt, run exactly one durable result command before opening another job.

Applied:

```bash
npm run application:result -- \
  --job-id <canonical-job-id> \
  --status applied
```

Needs review:

```bash
npm run application:result -- \
  --job-id <canonical-job-id> \
  --status needs_review \
  --reason "unknown required question"
```

Failed:

```bash
npm run application:result -- \
  --job-id <canonical-job-id> \
  --status failed \
  --reason "application form changed"
```

Skipped:

```bash
npm run application:result -- \
  --job-id <canonical-job-id> \
  --status skipped
```

Supported statuses are `applied`, `needs_review`, `failed`, and `skipped`. `needs_review` and `failed` require a non-empty reason.

The command validates that the canonical job exists in the local catalog before changing `user.sqlite`, updates the current durable status, and appends immutable status history in one transaction. Repeating the same durable status is idempotent. `applied` is terminal. `needs_review`, `failed`, and `skipped` require an explicit future reset before another application result can replace them.

On success, stdout is stable JSON such as:

```json
{"jobId":"canonical-job-id","status":"applied","changed":true}
```

On failure, stderr is JSON and the command exits non-zero:

```json
{"error":"reason"}
```

Do not substitute direct SQLite writes or another state-tracking format if the command fails.

## Codex execution rules

For every session:

1. Read `AGENTS.md` and `prompts/APPLY_JOBS.md`.
2. Run `npm run jobs:next -- --limit <N>`.
3. Do not search job boards or broaden the returned batch.
4. Process one returned job at a time with Ego Lite.
5. Use only explicit candidate facts available to the established application workflow. Never invent candidate-specific answers.
6. CAPTCHA, assessments, security challenges, unknown required questions, ambiguous facts, or unsupported forms are `needs_review`; do not bypass them.
7. Immediately persist the outcome with `application:result` before moving to another job.
8. Do not automatically retry a job with any durable terminal/review outcome.
9. Stop when the requested success target is reached, the supplied batch is exhausted, or the user asks to stop.

## What Codex should not do

Do not:

- search Google, LinkedIn, Built In, Remote.co, GlobalWork, or other job boards for additional openings during the run;
- re-evaluate accepted-position matching;
- reclassify remote-US eligibility;
- deduplicate jobs manually;
- inspect the whole catalog to choose alternatives;
- maintain an in-prompt list of prior applications as the source of truth;
- write ad-hoc SQL to mark outcomes;
- bypass CAPTCHA, assessments, authentication/security challenges, or unsupported forms.

The repository owns those deterministic preparation/state concerns so Codex can remain focused on browser execution.
