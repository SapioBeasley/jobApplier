/**
 * Expected matching behavior:
 *
 * accepted: "product manager"
 *   ✓ "Product Manager"
 *   ✓ "Senior Product Manager"
 *   ✓ "Principal Product Manager, AI"
 *   ✗ "Product Marketing Manager"
 *
 * accepted: "software engineer"
 *   ✓ "Software Engineer"
 *   ✓ "Senior Software Engineer, Backend"
 *   ✗ "Software Engineering Manager"
 *
 * Note: matching is phrase-based, not token-based, to avoid overly broad matches.
 */
export {};
