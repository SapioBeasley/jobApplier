# JobApplier V1

Personal, local-first job discovery and Quick/Easy Apply automation.

## End goal

JobApplier is not just a job browser. It is a pipeline:

```text
Aggregate open jobs
  -> keep accepted positions
  -> keep remote-US opportunities
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
- remote-US filtering
- stable canonical IDs
- deduplication
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

Candidate information must not be pushed into the GitHub Actions catalog.

## Development rules

Coding agents and contributors must follow [`AGENTS.md`](./AGENTS.md) and the test-driven development policy in [`docs/TDD.md`](./docs/TDD.md). Behavior changes follow red -> green -> refactor, and `npm run check` is the local completion gate.

## Accepted positions

Edit only the allowlist in:

```text
src/config/acceptedPositions.ts
```

Example:

```ts
export const acceptedPositions = [
  "product manager",
  "technical program manager",
] as const;
```

Matching is intentionally conservative. Titles and configured positions are normalized, then the accepted position must appear as a contiguous sequence of whole words in the job title.

For an accepted position of `product manager`:

```text
MATCH     Product Manager
MATCH     Senior Product Manager
MATCH     Principal Product-Manager, AI
NO MATCH  Product Marketing Manager
NO MATCH  Product Managerial Lead
```

A more-specific accepted position does not broaden downward. For example, `senior product manager` does not accept the title `Product Manager`.

To add or remove a target role, edit the array only; matching behavior belongs in `src/jobs/acceptedPosition.ts` and should change only with tests first.

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
- remote-US
- remote work arrangement
- confirmed Quick/Easy Apply
- supported application type
- application URL present
- not previously applied
- not skipped

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

- Built In — stub, disabled until implemented
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

## Setup

```bash
cp .env.example .env.local
npm ci
npm run db:catalog:push
npm run db:user:push
npm run dev
```

## Aggregation

```bash
npm run aggregate
npm run catalog:validate
npm run catalog:manifest
```

`.github/workflows/aggregate-jobs.yml` is scheduled every four hours and can also be manually dispatched.

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

Once a canonical job is locally `applied`, it must never automatically be submitted again even if the catalog refreshes or another source discovers it.

## Next vertical slice

The architecture is now sufficient to stop designing and build one end-to-end path:

```text
1 real source adapter
-> real catalog rows
-> queue eligibility
-> candidate profile + resume
-> 1 real Quick/Easy Apply adapter
-> successful submission
-> application attempt recorded
-> duplicate re-application blocked
```

That is the next milestone.
