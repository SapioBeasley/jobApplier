import crypto from "node:crypto";

const COMPANY_SUFFIXES =
  /\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co)\b/g;

export function normalizeText(input?: string | null): string {
  return (input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompany(input: string): string {
  return normalizeText(input)
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeUrl(input?: string | null): string | null {
  if (!input) return null;

  try {
    const url = new URL(input);
    url.hash = "";

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
    ];

    for (const key of trackingParams) url.searchParams.delete(key);

    const sorted = [...url.searchParams.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );

    url.search = "";
    for (const [key, value] of sorted) {
      url.searchParams.append(key, value);
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return input.trim();
  }
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function makeDedupeKey(args: {
  company: string;
  title: string;
  location?: string | null;
}): string {
  return sha256(
    [
      normalizeCompany(args.company),
      normalizeText(args.title),
      normalizeText(args.location),
    ].join("|"),
  );
}

export function makeSourceRecordId(
  source: string,
  sourceJobId: string | null | undefined,
  sourceUrl: string,
): string {
  return `src_${sha256(
    `${normalizeText(source)}|${sourceJobId ?? canonicalizeUrl(sourceUrl) ?? sourceUrl}`,
  ).slice(0, 24)}`;
}

export function makeNewCanonicalJobId(args: {
  canonicalApplyUrl?: string | null;
  source: string;
  sourceJobId?: string | null;
  company: string;
  title: string;
  location?: string | null;
}): string {
  // Used only for genuinely new jobs. Existing jobs MUST be matched first so an
  // improved identity signal discovered later does not change the user's job ID.
  const identity =
    canonicalizeUrl(args.canonicalApplyUrl) ??
    (args.sourceJobId
      ? `source:${normalizeText(args.source)}:${args.sourceJobId}`
      : `fingerprint:${makeDedupeKey(args)}`);

  return `job_${sha256(identity).slice(0, 24)}`;
}
