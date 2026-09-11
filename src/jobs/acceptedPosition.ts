import { acceptedPositions } from "../config/acceptedPositions";
import { normalizeText } from "./identity";

export function matchesAnyAcceptedPosition(
  title: string,
  positions: readonly string[],
): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedPositions = positions.map(normalizeText).filter(Boolean);

  return normalizedPositions.some((position) => {
    return (
      normalizedTitle === position ||
      normalizedTitle.includes(position) ||
      position.includes(normalizedTitle)
    );
  });
}

const normalizedAcceptedPositions = acceptedPositions
  .map((position) => normalizeText(position))
  .filter(Boolean);

export function assertAcceptedPositionsConfigured() {
  if (normalizedAcceptedPositions.length === 0) {
    throw new Error(
      "acceptedPositions is empty. Add at least one title in src/config/acceptedPositions.ts before running aggregation.",
    );
  }
}

export function matchesAcceptedPosition(title: string): boolean {
  return matchesAnyAcceptedPosition(title, normalizedAcceptedPositions);
}

export function getAcceptedPositions(): readonly string[] {
  return normalizedAcceptedPositions;
}
