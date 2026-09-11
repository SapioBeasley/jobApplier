import { describe, expect, it, vi } from "vitest";
import { discoverCatalogReleaseAssets } from "../src/sync/githubRelease";

describe("GitHub catalog release discovery", () => {
  it("resolves the manifest and database assets from the configured release tag", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          assets: [
            { name: "catalog.sqlite.gz", url: "https://api.github.test/assets/1" },
            { name: "manifest.json", url: "https://api.github.test/assets/2" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const assets = await discoverCatalogReleaseAssets({
      repository: "SapioBeasley/jobApplier",
      tag: "job-catalog",
      token: "secret-token",
      fetchImpl,
    });

    expect(assets).toEqual({
      manifestUrl: "https://api.github.test/assets/2",
      databaseUrl: "https://api.github.test/assets/1",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/SapioBeasley/jobApplier/releases/tags/job-catalog",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-token" }),
      }),
    );
  });

  it("fails closed when required release assets are missing", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ assets: [{ name: "manifest.json", url: "manifest" }] }), {
        status: 200,
      }),
    );

    await expect(
      discoverCatalogReleaseAssets({
        repository: "SapioBeasley/jobApplier",
        tag: "job-catalog",
        fetchImpl,
      }),
    ).rejects.toThrow("Catalog release is missing required assets");
  });
});
