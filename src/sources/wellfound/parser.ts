import type { SourceJob } from "../../jobs/types";

const WELLFOUND_ORIGIN = "https://wellfound.com";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&bull;|&#8226;|&#x2022;/gi, "•")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try { return new URL(raw, WELLFOUND_ORIGIN).toString(); } catch { return null; }
}

function collectJobPostings(value: unknown, output: JsonRecord[]): void {
  if (Array.isArray(value)) {
    for (const child of value) collectJobPostings(child, output);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  if (record["@type"] === "JobPosting") output.push(record);
  for (const child of Object.values(record)) collectJobPostings(child, output);
}

function structuredJobs(html: string): JsonRecord[] {
  const jobs: JsonRecord[] = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try { collectJobPostings(JSON.parse(match[1].trim()), jobs); } catch { /* fail closed per block */ }
  }
  return jobs;
}

function sourceJobId(job: JsonRecord, url: string): string | null {
  const identifier = asRecord(job.identifier);
  const explicit = text(identifier?.value) ?? text(job.identifier);
  if (explicit) return explicit;
  return /\/jobs\/(\d+)(?:-|\/|$)/.exec(url)?.[1] ?? null;
}

function organizationName(job: JsonRecord): string | null {
  return text(asRecord(job.hiringOrganization)?.name);
}

function remoteEligibility(job: JsonRecord): { remoteType: SourceJob["remoteType"]; remoteUsEligible: boolean; restrictions: string | null } {
  const remote = text(job.jobLocationType)?.toUpperCase() === "TELECOMMUTE";
  if (!remote) {
    const hasPhysicalLocation = Boolean(job.jobLocation);
    return { remoteType: hasPhysicalLocation ? "onsite" : "unknown", remoteUsEligible: false, restrictions: null };
  }
  const requirements = Array.isArray(job.applicantLocationRequirements) ? job.applicantLocationRequirements : [job.applicantLocationRequirements];
  const names = requirements.map((entry) => text(asRecord(entry)?.name)).filter((value): value is string => Boolean(value));
  const normalized = names.map((name) => name.toLowerCase().replace(/\./g, "").trim());
  const confirmedUs = normalized.some((name) => name === "united states" || name === "us" || name === "usa");
  return { remoteType: "remote", remoteUsEligible: confirmedUs, restrictions: names.length ? names.join(", ") : null };
}

function salary(job: JsonRecord): Pick<SourceJob, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod"> {
  const base = asRecord(job.baseSalary);
  const value = asRecord(base?.value);
  const min = typeof value?.minValue === "number" ? value.minValue : null;
  const max = typeof value?.maxValue === "number" ? value.maxValue : null;
  const unit = text(value?.unitText)?.toLowerCase() ?? null;
  return { salaryMin: min, salaryMax: max, salaryCurrency: text(base?.currency), salaryPeriod: unit === "year" ? "year" : unit };
}

function hasApplyEvidence(html: string, id: string | null): boolean {
  if (!id) return false;
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const card = new RegExp(`<[^>]+data-job-id=["']${escaped}["'][^>]*>[\\s\\S]{0,3000}?(?=<[^>]+data-job-id=|$)`, "i").exec(html)?.[0] ?? "";
  return /<button\b[^>]*>\s*Apply\s*<\/button>/i.test(card) && !/Apply\s+on\s+website/i.test(decodeHtml(card));
}

function parseStructuredJobs(html: string): SourceJob[] {
  const output: SourceJob[] = [];
  for (const job of structuredJobs(html)) {
    const url = absoluteUrl(job.url);
    const title = text(job.title);
    const company = organizationName(job);
    if (!url || !title || !company || !url.startsWith(`${WELLFOUND_ORIGIN}/jobs/`)) continue;
    const id = sourceJobId(job, url);
    const remote = remoteEligibility(job);
    const quickApply = remote.remoteUsEligible && hasApplyEvidence(html, id);
    const datePosted = text(job.datePosted);
    const postedAt = datePosted ? new Date(datePosted) : null;
    output.push({
      source: "wellfound",
      sourceJobId: id,
      sourceUrl: url,
      title,
      company,
      description: text(job.description),
      location: remote.restrictions,
      remoteType: remote.remoteType,
      remoteRestrictions: remote.restrictions,
      remoteUsEligible: remote.remoteUsEligible,
      employmentType: text(job.employmentType),
      ...salary(job),
      applicationType: quickApply ? "quick_apply" : "unknown",
      quickApply: quickApply ? "yes" : "unknown",
      applyUrl: quickApply ? url : null,
      postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    });
  }
  return output;
}

interface LinkMatch {
  index: number;
  end: number;
  href: string;
  label: string;
}

function linksMatching(html: string, pathPattern: RegExp): LinkMatch[] {
  const links: LinkMatch[] = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    if (!pathPattern.test(match[1])) continue;
    links.push({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, href: match[1], label: decodeHtml(match[2]) });
  }
  return links;
}

function renderedRemoteEvidence(segment: string): { remoteType: SourceJob["remoteType"]; remoteUsEligible: boolean; restrictions: string | null } {
  const plain = decodeHtml(segment);
  const match = /\b(Remote only|Remote)\s*•\s*([^|<>]+?)(?=\s{2,}|\b\d+\s+years? of exp\b|\b(?:today|yesterday|\d+\s+(?:days?|weeks?|months?|years?)\s+ago)\b|$)/i.exec(plain);
  if (!match) return { remoteType: "unknown", remoteUsEligible: false, restrictions: null };
  const restriction = match[2].trim().replace(/\s+/g, " ");
  const normalized = restriction.toLowerCase().replace(/\./g, "").trim();
  const confirmedUs = normalized === "united states" || normalized === "us" || normalized === "usa";
  return { remoteType: "remote", remoteUsEligible: confirmedUs, restrictions: restriction };
}

function renderedApplicationEvidence(segment: string): "quick_apply" | "external" | "unknown" {
  const plain = decodeHtml(segment);
  if (/\bApply\s+on\s+website\b/i.test(plain)) return "external";
  if (/<button\b[^>]*>\s*Apply\s*<\/button>/i.test(segment)) return "quick_apply";
  return "unknown";
}

function parseRenderedJobs(html: string): SourceJob[] {
  const jobLinks = linksMatching(html, /^\/jobs\/\d+(?:-|\/|$)/);
  const companyLinks = linksMatching(html, /^\/company\//);
  const output: SourceJob[] = [];

  for (let index = 0; index < jobLinks.length; index += 1) {
    const jobLink = jobLinks[index];
    if (!jobLink.label) continue;
    const companyLink = companyLinks.filter((link) => link.index < jobLink.index).at(-1);
    if (!companyLink?.label) continue;

    const nextJobIndex = jobLinks[index + 1]?.index ?? html.length;
    const segment = html.slice(jobLink.end, nextJobIndex);
    const remote = renderedRemoteEvidence(segment);
    const applicationEvidence = renderedApplicationEvidence(segment);
    const url = absoluteUrl(jobLink.href);
    if (!url) continue;
    const quickApply = remote.remoteUsEligible && applicationEvidence === "quick_apply";

    output.push({
      source: "wellfound",
      sourceJobId: /\/jobs\/(\d+)/.exec(jobLink.href)?.[1] ?? null,
      sourceUrl: url,
      title: jobLink.label,
      company: companyLink.label,
      location: remote.restrictions,
      remoteType: remote.remoteType,
      remoteRestrictions: remote.restrictions,
      remoteUsEligible: remote.remoteUsEligible,
      applicationType: quickApply ? "quick_apply" : "unknown",
      quickApply: quickApply ? "yes" : "unknown",
      applyUrl: quickApply ? url : null,
    });
  }

  return output;
}

export function parseWellfoundListPage(html: string): SourceJob[] {
  const byUrl = new Map<string, SourceJob>();
  for (const job of parseRenderedJobs(html)) byUrl.set(job.sourceUrl, job);
  for (const job of parseStructuredJobs(html)) byUrl.set(job.sourceUrl, job);
  return [...byUrl.values()];
}
