# JobApplier V1 PRD

## Product statement

JobApplier V1 continuously builds a clean queue of remote US opportunities for a configured set of accepted job titles and processes supported Quick/Easy Apply jobs sequentially using a reusable candidate profile and resume, while escalating unsupported applications for human review and maintaining a permanent local record of every application outcome.

## Primary workflow

```text
Aggregate
-> filter accepted positions
-> remote-US filter
-> dedupe
-> detect supported Quick/Easy Apply
-> queue
-> apply one at a time
-> applied | needs_review | failed
-> continue
```

## V1 goals

- aggregate supported sources on GitHub Actions
- only retain explicit accepted positions
- restrict automated eligibility to remote-US jobs
- conservatively dedupe across sources
- identify supported Quick/Easy Apply flows
- maintain a persistent local application queue
- reuse an explicit candidate profile, resume, and saved answers
- process one application at a time
- submit only when all required answers are known
- record every attempt and outcome
- never automatically apply to the same canonical job twice

## Non-goals

- AI job recommendations or scoring
- resume tailoring
- AI-generated candidate facts or answers
- cover-letter generation
- automatic essay responses
- multi-user SaaS
- cloud storage of candidate data
- interviews/recruiter CRM

## Definition of done

V1 is done when at least one real source and one real Quick/Easy Apply flow work end-to-end, from discovery through successful submission, with local durable status and duplicate-application prevention.
