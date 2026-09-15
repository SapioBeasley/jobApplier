import crypto from "node:crypto";
import Database from "better-sqlite3";
import { ensureUserLedger } from "../db/user/ledger";

export type SavedAnswerInput = {
  key: string;
  questionPattern: string;
  answer: string;
};

export type CandidateFactsInput = {
  userPath?: string;
  profileId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  workAuthorizedUs?: boolean;
  requiresSponsorship?: boolean;
  yearsExperience?: number;
  desiredSalary?: number;
  savedAnswers?: SavedAnswerInput[];
  now?: () => number;
  id?: () => string;
};

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

export function importCandidateFacts(input: CandidateFactsInput) {
  const userPath = input.userPath ?? process.env.USER_DB_PATH ?? "./data/user.sqlite";
  const profileId = input.profileId ?? "primary";
  const now = input.now ?? Date.now;
  const id = input.id ?? (() => `answer_${crypto.randomUUID()}`);
  const firstName = required(input.firstName, "firstName");
  const lastName = required(input.lastName, "lastName");
  const email = required(input.email, "email");
  const timestamp = now();

  ensureUserLedger(userPath);
  const db = new Database(userPath);
  try {
    const tx = db.transaction(() => {
      const existing = db.prepare("SELECT id FROM candidate_profiles WHERE id = ?").get(profileId);
      if (!existing) {
        db.prepare(`INSERT INTO candidate_profiles(
          id, first_name, last_name, email, phone, city, state, country,
          linkedin_url, portfolio_url, work_authorized_us, requires_sponsorship,
          years_experience, desired_salary, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`)
          .run(
            profileId, firstName, lastName, email,
            input.phone ?? null, input.city ?? null, input.state ?? null,
            input.country ?? "US", input.linkedinUrl ?? null, input.portfolioUrl ?? null,
            input.workAuthorizedUs === undefined ? null : Number(input.workAuthorizedUs),
            input.requiresSponsorship === undefined ? null : Number(input.requiresSponsorship),
            input.yearsExperience ?? null, input.desiredSalary ?? null,
            timestamp, timestamp,
          );
      } else {
        const fields: Array<[string, unknown]> = [
          ["first_name", firstName], ["last_name", lastName], ["email", email],
        ];
        const optional: Array<[string, unknown]> = [
          ["phone", input.phone], ["city", input.city], ["state", input.state],
          ["country", input.country], ["linkedin_url", input.linkedinUrl],
          ["portfolio_url", input.portfolioUrl], ["work_authorized_us", input.workAuthorizedUs === undefined ? undefined : Number(input.workAuthorizedUs)],
          ["requires_sponsorship", input.requiresSponsorship === undefined ? undefined : Number(input.requiresSponsorship)],
          ["years_experience", input.yearsExperience], ["desired_salary", input.desiredSalary],
        ];
        for (const entry of optional) if (entry[1] !== undefined) fields.push(entry);
        const set = fields.map(([column]) => `${column} = ?`).join(", ");
        db.prepare(`UPDATE candidate_profiles SET ${set}, updated_at = ? WHERE id = ?`)
          .run(...fields.map(([, value]) => value), timestamp, profileId);
      }

      for (const answer of input.savedAnswers ?? []) {
        const key = required(answer.key, "saved answer key");
        const pattern = required(answer.questionPattern, "saved answer questionPattern");
        const value = required(answer.answer, "saved answer answer");
        const existingAnswer = db.prepare("SELECT id, created_at FROM saved_answers WHERE key = ?").get(key) as { id: string; created_at: number } | undefined;
        if (existingAnswer) {
          db.prepare("UPDATE saved_answers SET question_pattern = ?, answer = ?, updated_at = ? WHERE key = ?")
            .run(pattern, value, timestamp, key);
        } else {
          db.prepare("INSERT INTO saved_answers(id, key, question_pattern, answer, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
            .run(id(), key, pattern, value, timestamp, timestamp);
        }
      }
    });
    tx();
    return { profileId, savedAnswerCount: input.savedAnswers?.length ?? 0 };
  } finally {
    db.close();
  }
}
