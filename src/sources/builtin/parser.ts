import type { ApplicationType, QuickApply, SourceJob } from "../../jobs/types";

const BUILTIN_ORIGIN = "https://builtin.com";
const CARD_LIMIT = 12_000;

interface BuiltInListItem {
  "@type"?: string;
  position?: number;
  name?: string;
  url?: string;
  description?: string;
}

interface CardMetadata {
  company: string;
  companyUrl: string | null;
  location: string;
  workplaceMode: string;
  salaryMin: number | null;
  salaryMax: number | null;
  postedAt: Date | null;
  seniority: string | null;
  quickApply: QuickApply;
  applicationType: ApplicationType;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteBuiltInUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, BUILTIN_ORIGIN).toString();
  } catch {
    return null;
  }
}

function sourceJobIdFromUrl(url: string): string | null {
  const match = /\/(\d+)(?:[/?#]|$)/.exec(url);
  return match?.[1] ?? null;
}

function fieldAfterIcon(segment: string, iconClass: string): string {
  const start = segment.indexOf(iconClass);
  if (start === -1) return "";

  const window = segment.slice(start, start + 600);
  for (const match of window.matchAll(/>([^<>]+)</g)) {
    const text = stripTags(match[1]);
    if (text) return text;
  }

  return "";
}

function parseSalary(value: string): {
  min: number | null;
  max: number | null;
} {
  const match = /^(\d+(?:\.\d+)?)K(?:-(\d+(?:\.\d+)?)K)?\s+Annually$/i.exec(
    value.trim(),
  );

  if (!match) return { min: null, max: null };

  const min = Math.round(Number(match[1]) * 1000);
  const max = Math.round(Number(match[2] ?? match[1]) * 1000);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) {
    return { min: null, max: null };
  }

  return { min, max };
}

function parsePostedAt(value: string, now: Date): Date | null {
  const text = value.replace(/^reposted\s+/i, "").trim();
  if (!text) return null;

  if (/^today$/i.test(text)) return new Date(now.getTime());
  if (/^yesterday$/i.test(text)) {
    return new Date(now.getTime() - 86_400_000);
  }

  const match = /^(\d+|an?)\+?\s+(minute|hour|day|week|month|year)s?\s+ago$/i.exec(
    text,
  );
  if (!match) return null;

  const count = /^an?$/i.test(match[1]) ? 1 : Number(match[1]);
  if (!Number.isFinite(count)) return null;

  const unitMs: Record<string, number> = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };

  const duration = unitMs[match[2].toLowerCase()];
  return duration ? new Date(now.getTime() - count * duration) : null;
}

function classifyRemoteType(
  workplaceMode: string,
): SourceJob["remoteType"] {
  const normalized = workplaceMode.trim().toLowerCase();
  if (normalized === "remote") return "remote";
  if (normalized === "remote or hybrid" || normalized === "hybrid") {
    return "hybrid";
  }
  if (normalized === "in-office" || normalized === "in office") {
    return "onsite";
  }
  return "unknown";
}

function isConfirmedUsLocation(location: string): boolean {
  const normalized = location
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (normalized === "us" || normalized === "usa" || normalized === "united states") {
    return true;
  }

  return (
    /\bunited states\b/.test(normalized) ||
    /(?:^|[,·|])\s*usa\b/.test(normalized) ||
    /(?:^|[,·|])\s*us\b/.test(normalized)
  );
}

function findItemLists(value: unknown, output: BuiltInListItem[][]): void {
  if (Array.isArray(value)) {
    for (const child of value) findItemLists(child, output);
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (
    (type === "ItemList" || (Array.isArray(type) && type.includes("ItemList"))) &&
    Array.isArray(record.itemListElement)
  ) {
    output.push(record.itemListElement as BuiltInListItem[]);
  }

  for (const child of Object.values(record)) {
    findItemLists(child, output);
  }
}

function parseItemList(html: string): BuiltInListItem[] {
  const lists: BuiltInListItem[][] = [];
  const scriptPattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    try {
      const json = JSON.parse(decodeHtml(match[1]).trim()) as unknown;
      findItemLists(json, lists);
    } catch {
      // Ignore malformed JSON-LD blocks; other blocks may still be valid.
    }
  }

  return lists.flat().filter((item) => item?.["@type"] === "ListItem");
}

function parseCards(html: string, now: Date): Map<string, CardMetadata> {
  const output = new Map<string, CardMetadata>();
  const cardPattern = /<a\b[^>]*data-id=["']job-card-title["'][^>]*>/gi;
  const cards = [...html.matchAll(cardPattern)];

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const start = card.index ?? 0;
    const nextStart = cards[index + 1]?.index ?? html.length;
    const end = Math.min(nextStart, start + CARD_LIMIT);
    const segment = html.slice(start, end);
    const anchor = card[0];

    const idMatch = /data-builtin-track-job-id=["'](\d+)["']/i.exec(anchor);
    if (!idMatch) continue;

    const previousStart = cards[index - 1]?.index ?? Math.max(0, start - 2500);
    const before = html.slice(previousStart, start);
    const companyPattern = /<a\b[^>]*href=["'](\/company\/[^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;

    let company = "";
    let companyUrl: string | null = null;
    for (const companyMatch of before.matchAll(companyPattern)) {
      company = stripTags(companyMatch[2]);
      companyUrl = absoluteBuiltInUrl(companyMatch[1]);
    }

    const workplaceMode = fieldAfterIcon(segment, "fa-house-building");
    const location = fieldAfterIcon(segment, "fa-location-dot");
    const salary = parseSalary(fieldAfterIcon(segment, "fa-sack-dollar"));
    const postedAt = parsePostedAt(fieldAfterIcon(segment, "fa-clock"), now);
    const visibleText = stripTags(segment);
    const seniorityMatch = /\b(Entry level|Mid level|Senior level|Expert\/Leader)\b/i.exec(
      visibleText,
    );

    const hasEasyApply = /\bEasy Apply\b/i.test(visibleText);
    const hasQuickApply = /\bQuick Apply\b/i.test(visibleText);

    output.set(idMatch[1], {
      company,
      companyUrl,
      location,
      workplaceMode,
      salaryMin: salary.min,
      salaryMax: salary.max,
      postedAt,
      seniority: seniorityMatch?.[1] ?? null,
      quickApply: hasEasyApply || hasQuickApply ? "yes" : "unknown",
      applicationType: hasEasyApply
        ? "easy_apply"
        : hasQuickApply
          ? "quick_apply"
          : "unknown",
    });
  }

  return output;
}

export function parseBuiltInListPage(
  html: string,
  now: Date = new Date(),
): SourceJob[] {
  if (!html) return [];

  const cards = parseCards(html, now);
  const jobs: SourceJob[] = [];

  for (const item of parseItemList(html)) {
    const title = item.name?.trim();
    const sourceUrl = absoluteBuiltInUrl(item.url);
    if (!title || !sourceUrl) continue;

    const sourceJobId = sourceJobIdFromUrl(sourceUrl);
    const card = sourceJobId ? cards.get(sourceJobId) : undefined;
    const remoteType = classifyRemoteType(card?.workplaceMode ?? "");
    const location = card?.location ?? "";
    const applicationType = card?.applicationType ?? "unknown";
    const quickApply = card?.quickApply ?? "unknown";

    jobs.push({
      source: "builtin",
      sourceJobId,
      sourceUrl,
      title,
      company: card?.company ?? "",
      companyUrl: card?.companyUrl ?? null,
      description: item.description?.trim() || null,
      requirements: null,
      location: location || null,
      remoteType,
      remoteRestrictions: location || null,
      remoteUsEligible: isConfirmedUsLocation(location),
      employmentType: null,
      seniority: card?.seniority ?? null,
      salaryMin: card?.salaryMin ?? null,
      salaryMax: card?.salaryMax ?? null,
      salaryCurrency: null,
      salaryPeriod:
        card?.salaryMin != null || card?.salaryMax != null ? "year" : null,
      applicationType,
      quickApply,
      applyUrl: quickApply === "yes" ? sourceUrl : null,
      postedAt: card?.postedAt ?? null,
      rawData: {
        listPosition: item.position ?? null,
        workplaceMode: card?.workplaceMode ?? null,
      },
    });
  }

  return jobs;
}
