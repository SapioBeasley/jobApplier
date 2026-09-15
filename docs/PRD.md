# JobApplier V1 PRD

## Product statement

JobApplier V1 builds a deterministic catalog of accepted remote-US job opportunities and hands only confirmed supported Quick/Easy Apply jobs to Codex for local browser execution with Ego Lite. The repository owns discovery, normalization, eligibility, catalog refresh, and durable application outcomes; it does not own the browser application flow.

## Primary workflow

```text
GitHub Actions aggregate sources
-> filter accepted positions
-> require confirmed remote-US
-> normalize + dedupe to stable job_id
-> classify supported Quick/Easy Apply
-> publish catalog.sqlite
-> local jobs:next refreshes/verifies catalog
-> Codex + Ego Lite processes one returned job at a time
-> application:result records applied | needs_review | failed | skipped
-> durable status prevents automatic duplicate handoff
```

## V1 goals

- aggregate supported public job sources in GitHub Actions
- retain only explicitly configured accepted positions
- restrict automatic handoff to confirmed remote-US jobs
- conservatively deduplicate jobs with stable canonical `job_id` values
- identify confirmed supported Quick/Easy Apply opportunities
- provide `jobs:next` as the single deterministic Codex-facing retrieval command
- automatically refresh and verify the published catalog inside `jobs:next`
- provide `application:result` as the durable outcome-recording command
- never automatically hand off a canonical job already marked `applied`, `skipped`, `needs_review`, or `failed`
- keep private candidate/browser data local and outside catalog artifacts

## V1 execution boundary

The repository does **not** run browser automation, maintain a required persistent application queue, host a Jobs UI, or manage candidate profile/resume/saved-answer workflows. Codex + Ego Lite owns application-site interaction outside the repository and must use explicit candidate data only.

Unknown or ambiguous required answers, CAPTCHA, assessments, security challenges, and unsupported application structures must become `needs_review`; candidate-specific facts must never be invented.

## Non-goals

- AI job recommendations or scoring
- resume tailoring
- generated application essays or invented answers
- repo-owned browser automation
- local web application / Jobs UI
- multi-user SaaS
- cloud storage of private candidate data

## Definition of done

V1 is complete when GitHub Actions can publish eligible job-market data, `jobs:next` can safely refresh and return deterministic supported opportunities, Codex can process those jobs externally with Ego Lite, and `application:result` durably records outcomes so an applied canonical job is never automatically handed off twice.
