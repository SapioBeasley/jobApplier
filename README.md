# JobApplier V1

Personal, local-first job discovery and Quick/Easy Apply automation.

## End goal

JobApplier is not just a job browser. It is a pipeline:

```text
Aggregate open jobs
  -> keep accepted positions
  -> keep confirmed remote-US opportunities
  -> dedupe
  -> identify supported Quick/Easy Apply jobs
  -> build application queue
  -> process one job at a time
  -> submit when every required answer is known
  -> record applied / needs_review / failed
  -> continue
```

See [docs/PRD.md](docs/PRD.md) and [docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md).

## Core architecture

### GitHub Actions: public market data

GitHub Actions aggregates job-market data into `catalog.sqlite`.

It owns:

- source adapters
- normalization
- accepted-position filtering
- confirmed remote-US filtering
- stable canonical IDs
- conservative deduplication
- Quick/Easy Apply classification
- catalog validation/publication

### Local Next.js app: private application state

The local app owns `user.sqlite` and browser automation.

It owns:

- candidate profile
- resume
- explicit saved answers
- application queue
- application runner
- attempts and outcomes
- durable `applied` protection

Candidate information must not be pushed into the GitHub Actions catalog. Catalog validation explicitly rejects known private user-state tables before publication.

## Development rules

Coding agents and contributors must follow [`AGENTS.md`](./AGENTS.md) and the test-driven development policy in [`docs/TDD.md`](./docs/TDD.md). Behavior changes follow red -> green -> refactor, and `npm run check` is the local completion gate.

## Accepted positions

Edit only the allowlist in:

```text
src/config/acceptedPositions.ts
```

Matching is intentionally conservative. Titles and configured positions are normalized, then the accepted position must appear as a contiguous sequence of whole words in the job title.

For an accepted position of `project manager`:

```text
MATCH     Project Manager
MATCH     Senior Project Manager
MATCH     Technical Project Manager
NO MATCH  Product Manager
NO MATCH  Project Managerial Lead
```

A more-specific accepted position does not broaden downward. To add or remove a target role, edit the array only; matching behavior belongs in `src/jobs/acceptedPosition.ts` and should change only with tests first.

An empty allowlist fails aggregation intentionally and must never mean "accept all."

## Two SQLite databases

```text
data/
  catalog.sqlite   # generated remotely; replaceable/read-only locally
  user.sqlite      # private local ledger; never overwritten by catalog sync
```

The stable canonical `job_id` links them.

## Application queue

Only jobs that meet all eligibility rules enter the queue:

- active catalog listing
- confirmed remote-US eligibility
- confirmed `remote` work arrangement
- confirmed Quick/Easy Apply
- supported application type
- application URL present
- not previously applied
- not skipped

Hybrid, onsite, and unknown work arrangements do not enter automatic processing.

Queue states:

```text
queued
applying
applied
needs_review
failed
skipped
```

The runner is sequential: one job at a time.

## Application adapters

Each supported application platform implements:

```ts
interface ApplicationAdapter {
  name: string;
  canHandle(url: string): boolean | Promise<boolean>;
  apply(context: ApplicationContext): Promise<ApplicationResult>;
}
```

The adapter registry intentionally starts empty. Unsupported flows are marked `needs_review` rather than guessed through.

## Human-review rule

Do not invent candidate-specific answers.

Unknown required questions, essays, assessments, CAPTCHAs, authentication/security challenges, missing candidate data, or unrecognized flows must stop that job with `needs_review` while allowing the queue to continue.

## Initial job sources

- Built In — enabled. Uses server-rendered HTTP pages, structured `ItemList` data, and rendered card metadata. CI uses captured local fixtures; source failures surface to the source runner rather than fabricating data.
- GlobalWork.ai — stub, disabled until implemented
- Remote.co — disabled until an appropriate programmatic ingestion path is established

Each source should prefer:

```text
API
-> feed
-> structured page data
-> HTTP
-> Puppeteer
```

Built In currently uses structured server-rendered data over normal HTTP; Puppeteer is not required for this source.

## Setup

```bash
cp .env.example .env.local
npm ci
npm run db:user:push
npm run dev
```

Because the repository and `job-catalog` release are private, set `CATALOG_GITHUB_TOKEN` in `.env.local` to a GitHub token that can read this repository. Never commit that token.

Open the Jobs screen at:

```text
http://localhost:3000/jobs
```

Use **Sync catalog** to pull the latest published catalog before browsing jobs.

## Aggregation and catalog publication

Local catalog commands for aggregation-development work:

```bash
npm run db:catalog:push
npm run aggregate
npm run catalog:validate
npm run catalog:manifest
npm run catalog:verify-manifest
```

The GitHub Actions publication sequence is:

```text
restore last published catalog if present
-> apply catalog schema
-> aggregate enabled sources
-> validate SQLite integrity and publication invariants
-> generate manifest from the exact database
-> verify manifest SHA-256 and metadata against the database
-> gzip catalog.sqlite
-> publish catalog.sqlite.gz + manifest.json to the job-catalog release
```

Publication validation fails closed when the catalog is empty, contains non-remote/non-US rows, contains orphaned source rows, has no successful source in the latest run, or contains known private user-state tables.

`.github/workflows/aggregate-jobs.yml` can always be run with `workflow_dispatch`. Scheduled execution is configured every four hours at minute 17 in `America/Chicago` and runs when the repository variable is set:

```text
ENABLE_AGGREGATION=true
```

## Local catalog sync and Jobs UI

The local app consumes the published `job-catalog` GitHub Release through a server-only sync path:

```text
GitHub Release metadata
-> resolve manifest.json + catalog.sqlite.gz assets
-> download with optional private-repo token
-> compare generatedAt with local catalog
-> decompress to a temporary file
-> verify SHA-256 of the exact uncompressed database
-> verify SQLite integrity
-> atomically replace data/catalog.sqlite
```

If the remote catalog is not newer, the database asset is not downloaded. If download, hash, decompression, or SQLite validation fails, the existing local catalog is preserved. The sync path never opens or modifies `user.sqlite`.

The Jobs screen reads `catalog.sqlite` with SQLite read-only/query-only mode and supports:

- text search across title, company, location, and description
- accepted-position filter
- source filter
- lifecycle filter
- Quick/Easy Apply filter
- normalized job detail view
- source links and preferred apply link

Private GitHub credentials stay server-side and are never rendered into the browser.

## Queue commands

After real catalog data, candidate data, and an active resume exist:

```bash
npm run queue:sync
npm run queue:run
```

`queue:sync` adds newly eligible canonical jobs to the local queue.

`queue:run` processes jobs sequentially. Until a concrete application adapter is registered, eligible jobs will safely become `needs_review` with `unsupported_application_flow`.

## Stable identity / duplicate protection

When ingesting a posting, identity resolution checks:

1. existing source + source job ID
2. existing exact canonical application URL
3. one exact normalized company/title/location match
4. deterministic fingerprint for a genuinely new job

Repeated source runs update existing rows rather than duplicating them. If multiple existing jobs share the same normalized fingerprint, the aggregator does not guess which one to merge; the incoming job remains separate.

Once a canonical job is locally `applied`, it must never automatically be submitted again even if the catalog refreshes or another source discovers it.

## Current catalog artifact

The `job-catalog` GitHub Release contains:

```text
catalog.sqlite.gz
manifest.json
```

The manifest hashes the uncompressed `catalog.sqlite`. Local synchronization verifies that hash and SQLite integrity before replacing the local catalog without touching `user.sqlite`.

## Next vertical slice

With catalog publication, local sync, and Jobs browsing in place, the next vertical slice is private candidate state:

```text
candidate profile
-> active resume
-> saved reusable answers
-> local user.sqlite persistence
-> queue eligibility context
```

That work is tracked by issue #6.
