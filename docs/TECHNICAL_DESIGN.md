# JobApplier V1 Technical Design

## Objective

JobApplier has two independent responsibilities:

1. **Discover opportunities** remotely using GitHub Actions.
2. **Process applications** locally using the candidate's private data and browser session.

The durable contract between those systems is the canonical `job_id`.

## System boundary

```text
GitHub Actions
  source adapters
    -> normalize
    -> acceptedPositions
    -> remote-US
    -> stable ID / dedupe
    -> Quick/Easy Apply classification
    -> catalog.sqlite
    -> GitHub Release

Local Next.js app
  catalog sync
    -> catalog.sqlite (replaceable/read-only)
  user.sqlite (private/durable)
    -> candidate profile
    -> resume
    -> saved answers
    -> application queue
    -> attempts / outcomes
  application runner
    -> one queued job at a time
    -> application adapter
    -> submitted | needs_review | failed
```

## Catalog ownership

`catalog.sqlite` contains public job-market data only. It is safe to regenerate and replace.

The application must never write candidate data or application history into this database.

## User database ownership

`user.sqlite` is the local application ledger. It must never be overwritten by catalog sync.

V1 tables:

- `candidate_profiles`
- `resumes`
- `saved_answers`
- `job_status`
- `job_status_history`
- `application_queue`
- `application_attempts`
- `application_answers`
- `settings`

## Application eligibility

A job is automatically queueable only when:

- catalog lifecycle status is active
- remote-US eligibility is confirmed
- work arrangement is remote
- `quick_apply = yes`
- application type is currently supported (`quick_apply` or `easy_apply` in V1)
- application URL exists
- local status is not `applied`
- local status is not `skipped`

The queue builder is deterministic and idempotent.

## Queue semantics

States:

```text
queued -> applying -> applied
                  -> needs_review
                  -> failed
queued -> skipped
```

Only one job is processed at a time.

`applied` is terminal for automatic execution. A canonical job in this state must not automatically enter the queue again.

## Application adapters

Application automation is platform-specific and must be implemented behind:

```ts
interface ApplicationAdapter {
  name: string;
  canHandle(url: string): boolean | Promise<boolean>;
  apply(context: ApplicationContext): Promise<ApplicationResult>;
}
```

Adapters own DOM selectors and navigation. The runner owns lifecycle, logging, and duplicate prevention.

This keeps LinkedIn-style Easy Apply, a board-specific Quick Apply flow, or an ATS-specific flow isolated from one another.

## Submission rule

Adapters must not invent candidate-specific facts.

They may submit only if all required information can be resolved from:

- candidate profile
- active resume
- explicit saved answer
- deterministic form values that do not require a candidate claim

If a required answer is unknown or ambiguous, return `needs_review`.

Other automatic `needs_review` conditions include:

- CAPTCHA
- assessment
- free-response essay without an explicit stored answer
- unexpected authentication or security challenge
- unsupported page structure
- missing required local candidate data

## Attempts and auditing

Every automation attempt is recorded before the adapter runs.

Final outcomes:

- `submitted`
- `needs_review`
- `failed`

Where useful, adapter implementations should also persist each answer used into `application_answers` with its source (`candidate_profile`, `saved_answer`, `resume`, `manual`). Avoid unnecessary storage of sensitive values.

## Failure isolation

A failed or review-required job does not stop the queue. The runner records the result, releases the active slot, and continues with the next queued job.

The user can stop a run only between jobs in V1.

## Browser execution

Browser automation runs locally, not in GitHub Actions.

A future concrete adapter may use Puppeteer with a persistent local browser profile when authentication is required. Credentials must not be placed in source control or `catalog.sqlite`.

## V1 implementation order

1. Complete one source adapter and produce real catalog rows.
2. Build jobs + queue views.
3. Build candidate profile/resume/settings UI.
4. Run queue builder against real catalog data.
5. Choose one Quick/Easy Apply platform.
6. Implement one application adapter end-to-end.
7. Add `needs_review` UI and saved-answer capture.
8. Add additional application adapters one at a time.

## First vertical slice acceptance test

The first application adapter is considered complete when one real supported listing can traverse:

```text
source discovery
-> catalog.sqlite
-> eligibility
-> queued
-> applying
-> candidate fields populated
-> resume uploaded if required
-> submitted
-> application_attempts recorded
-> job_status = applied
```

and the same canonical job cannot be automatically submitted a second time.
