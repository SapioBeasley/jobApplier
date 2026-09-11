import { acceptedPositions } from "../config/acceptedPositions";
import { normalizeText } from "./identity";

function containsTokenPhrase(title: string, position: string): boolean {
  const titleTokens = title.split(" ").filter(Boolean);
  const positionTokens = position.split(" ").filter(Boolean);

  if (positionTokens.length === 0 || positionTokens.length > titleTokens.length) {
    return false;
  }

  for (let start = 0; start <= titleTokens.length - positionTokens.length; start += 1) {
    const matches = positionTokens.every(
      (token, offset) => titleTokens[start + offset] === token,
    );

    if (matches) return true;
  }

  return false;
}

export function matchesAnyAcceptedPosition(
  title: string,
  positions: readonly string[],
): boolean {
  const normalizedTitle = normalizeText(title);
  const normalizedPositions = positions.map(normalizeText).filter(Boolean);

  return normalizedPositions.some((position) =>
    containsTokenPhrase(normalizedTitle, position),
  );
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
