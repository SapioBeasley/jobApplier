# JobApplier V1

Personal, local-first job aggregation and deterministic Codex handoff for remote-US Quick/Easy Apply opportunities. The repository stops at verified job handoff and durable outcome recording; browser execution remains external.

## V1 workflow

```text
GitHub Actions aggregate public job sources
-> keep configured accepted positions
-> require confirmed remote-US
-> normalize + dedupe to stable job_id
-> classify supported Quick/Easy Apply
-> publish catalog.sqlite + manifest
-> npm run jobs:next -- --limit N
-> Codex + Ego Lite applies externally, one job at a time
-> npm run application:result -- --job-id <id> --status <outcome>
-> durable status prevents automatic duplicate handoff
```

The repository prepares eligible work and records durable outcomes. It does **not** host a Jobs UI, maintain a required application queue, or drive application-site browser automation in V1.

See [`docs/PRD.md`](docs/PRD.md), [`docs/TECHNICAL_DESIGN.md`](docs/TECHNICAL_DESIGN.md), [`docs/CODEX_RUNBOOK.md`](docs/CODEX_RUNBOOK.md), and [`docs/TDD.md`](docs/TDD.md).

## Architecture

### `catalog.sqlite`: public, replaceable market data

GitHub Actions owns public discovery and publication:

- `SourceAdapter` fetching/parsing
- accepted-position filtering
- confirmed remote-US filtering
- normalization and stable canonical identity
- conservative cross-source dedupe
- Quick/Easy Apply classification
- validation, manifest generation, and release publication

Candidate data, credentials, resumes, saved answers, and application history must never enter catalog artifacts.

### `user.sqlite`: private, durable application state

The current V1 CLI uses durable job status/history to suppress prior outcomes. Replacing `catalog.sqlite` must never erase or modify `user.sqlite`.

`jobs:next` and `application:result` safely initialize the minimal V1 `job_status` / `job_status_history` ledger when it is absent. Existing private tables and rows are preserved. Legacy private tables may remain in an existing `user.sqlite`; cleanup is intentionally non-destructive.

## Accepted positions

Edit the explicit allowlist in:

```text
src/config/acceptedPositions.ts
```

Matching is intentionally conservative. An empty allowlist fails aggregation and must never mean "accept all."

## Primary local commands

Install dependencies:

```bash
npm ci
```

Development/full-schema setup remains available when needed:

```bash
npm run db:catalog:push
npm run db:user:push
```

Get the next deterministic batch:

```bash
npm run jobs:next -- --limit 10
```

`jobs:next` automatically checks the published `job-catalog` release. A newer catalog is downloaded, decompressed, SHA-256 verified, SQLite integrity checked, and atomically installed before selection. Refresh failure preserves the installed catalog and fails closed. The command also returns eligibility diagnostics (`totalEvaluated`, `totalEligible`, `totalReturned`, and `ineligibleReasonCounts`) so a small eligible batch can be explained without weakening safety rules.

Record the result of each external Codex/Ego Lite attempt immediately:

```bash
npm run application:result -- --job-id <job_id> --status applied
npm run application:result -- --job-id <job_id> --status needs_review --reason "unknown required question"
npm run application:result -- --job-id <job_id> --status failed --reason "supported flow changed"
npm run application:result -- --job-id <job_id> --status skipped
```

`applied` is terminal. `applied`, `skipped`, `needs_review`, and `failed` jobs are excluded from automatic handoff until an explicit future reset/retry path exists.

## Eligibility

Automatic handoff requires all of the following:

- active listing
- confirmed remote-US eligibility
- remote work arrangement
- confirmed Quick/Easy Apply metadata
- supported application type
- application URL present
- no durable blocking local outcome

Unknown, hybrid, onsite, or unsupported jobs are not automatically handed to Codex.

## Built In coverage

Built In aggregation searches each accepted position with a bounded maximum of 10 result pages and still stops early on empty or duplicate-tail pages. This increases catalog breadth without changing title matching, remote-US requirements, or Quick/Easy Apply safety rules.

## External application safety

Codex + Ego Lite owns browser interaction outside this repository. Candidate-specific facts must never be invented. Unknown/ambiguous required answers, CAPTCHA, assessments, security challenges, unsupported page structures, or missing required candidate facts must become `needs_review` rather than being bypassed.

## Aggregation and publication

Development commands:

```bash
npm run aggregate
npm run catalog:validate
npm run catalog:manifest
npm run catalog:verify-manifest
```

GitHub Actions publishes:

```text
catalog.sqlite.gz
manifest.json
```

Publication validation fails closed on invalid/unsafe artifacts, including known private user-state tables.

## Development rules

All behavior changes follow red -> green -> refactor under [`AGENTS.md`](AGENTS.md) and [`docs/TDD.md`](docs/TDD.md).

The completion gate is:

```bash
npm run check
```

It must pass the deterministic test suite and TypeScript production check before merge.
