const NON_US_REGION_PATTERNS = [
  /(?:^|[\s(\[\-/])EU(?:$|[\s)\]\-/])/i,
  /\bEurope(?:an)?\b/i,
  /(?:^|[\s(\[\-/])UK(?:$|[\s)\]\-/])/i,
  /\bUnited Kingdom\b/i,
  /\bCanada\b/i,
  /\bEMEA\b/i,
  /\bAPAC\b/i,
  /\bLATAM\b/i,
  /\bAustralia\b/i,
  /\bIndia\b/i,
];

export function hasContradictoryNonUsRegion(
  title: string,
  location?: string | null,
): boolean {
  const evidence = `${title} ${location ?? ""}`;
  return NON_US_REGION_PATTERNS.some((pattern) => pattern.test(evidence));
}

export function locationPriority(location?: string | null): number {
  const normalized = (location ?? "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/\bhouston\b/.test(normalized)) return 0;
  if (/\btexas\b|(?:^|[,\s])tx(?:$|[,\s])/.test(normalized)) return 1;
  if (
    normalized === "us" ||
    normalized === "usa" ||
    normalized === "united states" ||
    normalized === "united states of america"
  ) {
    return 2;
  }
  return 3;
}
