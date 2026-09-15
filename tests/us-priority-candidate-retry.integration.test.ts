import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { hasContradictoryNonUsRegion, locationPriority } from "../src/jobs/usPriority";
import { importCandidateFacts } from "../src/codex/candidateFacts";
import { resetNeedsReview } from "../src/codex/retryApplication";

const dirs: string[] = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobapplier-us-priority-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe("US-only handoff and priority", () => {
  it("rejects explicit non-US regional contradictions", () => {
    expect(hasContradictoryNonUsRegion("Project Manager (EU)", "United States")).toBe(true);
    expect(hasContradictoryNonUsRegion("Program Manager - Canada", "United States")).toBe(true);
    expect(hasContradictoryNonUsRegion("Project Manager", "United States")).toBe(false);
  });

  it("prioritizes Houston, then Texas, then nationwide US", () => {
    expect(locationPriority("Houston, TX")).toBeLessThan(locationPriority("Texas, United States"));
    expect(locationPriority("Texas, United States")).toBeLessThan(locationPriority("United States"));
  });
});

describe("private candidate facts", () => {
  it("imports only explicitly supplied facts and preserves unknown authorization fields", () => {
    const userPath = path.join(tempDir(), "data", "user.sqlite");
    importCandidateFacts({
      userPath,
      profileId: "primary",
      firstName: "Rachel",
      lastName: "Beasley",
      email: "Rachelloren00@gmail.com",
      phone: "325.232.2257",
      city: "Houston",
      state: "TX",
      country: "US",
      yearsExperience: 6,
      savedAnswers: [
        { key: "highest_education", questionPattern: "highest.*education|degree", answer: "Bachelor of Science in Criminal Justice (2016)" },
        { key: "scrum_certification", questionPattern: "scrum|certification", answer: "Certified Scrum Master (CSM)" },
      ],
    });

    const db = new Database(userPath, { readonly: true });
    expect(db.prepare("SELECT city, state, years_experience, work_authorized_us, requires_sponsorship FROM candidate_profiles WHERE id='primary'").get()).toEqual({
      city: "Houston", state: "TX", years_experience: 6, work_authorized_us: null, requires_sponsorship: null,
    });
    expect(db.prepare("SELECT key, answer FROM saved_answers ORDER BY key").all()).toEqual([
      { key: "highest_education", answer: "Bachelor of Science in Criminal Justice (2016)" },
      { key: "scrum_certification", answer: "Certified Scrum Master (CSM)" },
    ]);
    db.close();
  });
});

describe("needs_review retry", () => {
  it("explicitly resets needs_review to reviewed and appends history", () => {
    const userPath = path.join(tempDir(), "user.sqlite");
    const db = new Database(userPath);
    db.exec(`CREATE TABLE job_status (job_id TEXT PRIMARY KEY, status TEXT NOT NULL, saved_at INTEGER, reviewed_at INTEGER, applied_at INTEGER, skipped_at INTEGER, notes TEXT, updated_at INTEGER NOT NULL); CREATE TABLE job_status_history (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, previous_status TEXT, new_status TEXT NOT NULL, changed_at INTEGER NOT NULL);`);
    db.prepare("INSERT INTO job_status(job_id,status,notes,updated_at) VALUES ('job-1','needs_review','missing education',1)").run();
    db.close();

    resetNeedsReview({ userPath, jobId: "job-1", now: () => 100, id: () => "history-reset" });
    const verify = new Database(userPath, { readonly: true });
    expect(verify.prepare("SELECT status, notes, reviewed_at FROM job_status WHERE job_id='job-1'").get()).toEqual({ status: "reviewed", notes: null, reviewed_at: 100 });
    expect(verify.prepare("SELECT previous_status,new_status FROM job_status_history WHERE id='history-reset'").get()).toEqual({ previous_status: "needs_review", new_status: "reviewed" });
    verify.close();
  });

  it("refuses to reset applied", () => {
    const userPath = path.join(tempDir(), "user.sqlite");
    const db = new Database(userPath);
    db.exec(`CREATE TABLE job_status (job_id TEXT PRIMARY KEY, status TEXT NOT NULL, saved_at INTEGER, reviewed_at INTEGER, applied_at INTEGER, skipped_at INTEGER, notes TEXT, updated_at INTEGER NOT NULL); CREATE TABLE job_status_history (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, previous_status TEXT, new_status TEXT NOT NULL, changed_at INTEGER NOT NULL); INSERT INTO job_status(job_id,status,updated_at) VALUES ('job-1','applied',1);`);
    db.close();
    expect(() => resetNeedsReview({ userPath, jobId: "job-1" })).toThrow("needs_review");
  });
});
