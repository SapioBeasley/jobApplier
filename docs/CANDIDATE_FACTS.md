# Candidate Facts and Review Retry

Candidate-specific facts are private durable state and belong only in `user.sqlite`. They must never be written to `catalog.sqlite`, generated catalog artifacts, or committed resume/source files.

## Import explicit facts

Create a temporary local JSON file containing only facts explicitly supported by the user or an attached source such as a resume, then run:

```bash
npm run candidate:import -- --file <temporary-candidate-facts.json>
```

Example shape:

```json
{
  "firstName": "Example",
  "lastName": "Candidate",
  "email": "candidate@example.com",
  "city": "Houston",
  "state": "TX",
  "country": "US",
  "yearsExperience": 6,
  "savedAnswers": [
    {
      "key": "highest_education",
      "questionPattern": "highest.*education|degree",
      "answer": "Bachelor of Science in Example Field (2016)"
    }
  ]
}
```

Omit unknown fields. In particular, do not infer work authorization, sponsorship, language fluency, salary expectations, or other screening facts from location, name, education, or employment history.

The import is non-destructive: omitted optional profile fields remain unchanged on an existing profile, and saved answers are upserted by explicit key.

Temporary JSON files and resumes must not be committed.

## Retry a reviewed job

When a job is marked `needs_review`, it remains excluded from automatic handoff. After the user supplies the missing factual answer and that fact is imported, explicitly reset only that job:

```bash
npm run application:retry -- --job-id <canonical-job-id>
```

The command only accepts jobs currently in `needs_review`, moves the job to the retryable `reviewed` state, clears the review note, and appends immutable history. It does not reset `applied` jobs.

Then rerun:

```bash
npm run jobs:next -- --limit 10
```

The job can be returned again only if all normal remote-US and supported Quick/Easy Apply eligibility rules still pass.
