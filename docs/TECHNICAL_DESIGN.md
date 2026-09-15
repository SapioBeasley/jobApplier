# JobApplier V1 Technical Design

## Objective

JobApplier V1 separates public job-market preparation from private browser execution:

1. **GitHub Actions** discovers, normalizes, filters, deduplicates, validates, and publishes public job data.
2. **Local CLI state** refreshes that catalog, deterministically selects eligible jobs, and records durable outcomes.
3. **Codex + Ego Lite** performs application-site interaction externally, one job at a time, using explicit candidate data.

The canonical `job_id` is the durable identity across refreshes and application history.

## System boundary

```text
GitHub Actions
  SourceAdapter implementations
    -> normalize
    -> acceptedPositions
    -> confirmed remote-US
    -> stable identity / conservative dedupe
    -> Quick/Easy Apply classification
    -> catalog.sqlite
    -> manifest + GitHub Release

Local CLI
  jobs:next
    -> inspect published job-catalog release
    -> verify manifest / SHA-256 / SQLite integrity
    -> atomically replace catalog.sqlite when newer
    -> read public catalog + durable status filters
    -> return deterministic eligible jobs only

  application:result
    -> validate canonical job exists
    -> update user.sqlite status transactionally
    -> append immutable job_status_history

External execution
  Codex + Ego Lite
    -> open one returned application URL at a time
    -> use explicit candidate facts only
    -> record outcome immediately through application:result
```

## Catalog ownership

`catalog.sqlite` contains replaceable public job-market data only. Candidate data, resumes, credentials, saved answers, application history, and other private state must never be written into the catalog or publication artifacts.

Catalog refresh is whole-file replacement only after verification. It must never open, migrate, replace, or mutate `user.sqlite`.

## Catalog sync contract

The `job-catalog` release contains `catalog.sqlite.gz` and `manifest.json`.

`jobs:next` owns refresh. There is no standalone user-facing catalog-sync command or UI in V1.

Refresh behavior:

1. Resolve release assets through the GitHub API.
2. Compare the published `generatedAt` with the installed catalog when present.
3. Avoid database replacement when the local catalog is current or newer.
4. Download and decompress a newer catalog into a temporary file.
5. Verify the SHA-256 of the exact uncompressed database.
6. Run SQLite `integrity_check`.
7. Atomically replace `catalog.sqlite`.
8. On any failure, preserve the existing catalog and fail closed without returning jobs from a failed refresh attempt.

## Private durable state

`user.sqlite` is private and durable. V1 actively depends on `job_status` and `job_status_history` for automatic handoff suppression and auditability.

Legacy candidate, resume, answer, queue, or attempt tables may remain in an existing database for migration safety, but V1 does not require those tables or destructive cleanup of user data.

`applied` is terminal. `needs_review`, `failed`, and `skipped` are also excluded from automatic `jobs:next` handoff until a separate explicit reset/retry mechanism exists.

## Eligibility and handoff

A job can be returned by `jobs:next` only when all required public facts are confirmed:

- active lifecycle
- `remote_us_eligible = true`
- remote work arrangement
- confirmed Quick/Easy Apply metadata
- supported application type
- application URL present
- no durable blocking local outcome

Selection and ordering are deterministic. No persistent application queue is required.

## Browser execution

The repository contains no production application-site DOM/navigation runner in V1. Codex + Ego Lite performs browser interaction externally. Application-site automation details must not be embedded into aggregation code or catalog artifacts.

Codex must never invent candidate-specific facts. Unknown required questions, ambiguous candidate data, CAPTCHA, assessments, security challenges, unsupported structures, or missing required information result in `needs_review` and must not be bypassed.

## Failure isolation

Every application outcome is recorded before moving to another job. A `needs_review`, `failed`, or `skipped` result for one canonical job must not block unrelated eligible jobs.

## Testing boundary

CI uses temporary SQLite databases and local fixtures/test doubles only. It must not depend on live job boards, live GitHub release downloads, or live application sites.

The end-to-end regression contract is:

```text
published catalog fixture
-> verified refresh
-> jobs:next eligible handoff
-> application:result durable outcome
-> jobs:next duplicate/outcome suppression
```

`npm run check` must pass before merge.
