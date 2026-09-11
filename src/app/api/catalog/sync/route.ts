import { NextResponse } from "next/server";
import { syncCatalogFromGitHubRelease } from "../../../../sync/githubRelease";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const returnUrl = new URL("/jobs", request.url);

  try {
    const result = await syncCatalogFromGitHubRelease();
    returnUrl.searchParams.set("sync", result.status);
  } catch (error) {
    console.error("Catalog sync failed", error);
    returnUrl.searchParams.set("sync", "failed");
  }

  return NextResponse.redirect(returnUrl, 303);
}
