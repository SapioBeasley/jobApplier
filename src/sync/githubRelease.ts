import { syncCatalog, type CatalogSyncResult } from "./catalog";

type FetchLike = typeof fetch;

type ReleaseAsset = {
  name?: string;
  url?: string;
};

type ReleaseResponse = {
  assets?: ReleaseAsset[];
};

export type CatalogReleaseAssets = {
  manifestUrl: string;
  databaseUrl: string;
};

function headers(token?: string, accept = "application/vnd.github+json") {
  const result: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) result.Authorization = `Bearer ${token}`;
  return result;
}

export async function discoverCatalogReleaseAssets(args: {
  repository: string;
  tag?: string;
  token?: string;
  fetchImpl?: FetchLike;
}): Promise<CatalogReleaseAssets> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const tag = args.tag ?? "job-catalog";
  const endpoint = `https://api.github.com/repos/${args.repository}/releases/tags/${encodeURIComponent(tag)}`;
  const response = await fetchImpl(endpoint, {
    cache: "no-store",
    headers: headers(args.token),
  });

  if (!response.ok) {
    throw new Error(`Catalog release lookup failed with status ${response.status}`);
  }

  const release = (await response.json()) as ReleaseResponse;
  const manifestUrl = release.assets?.find((asset) => asset.name === "manifest.json")?.url;
  const databaseUrl = release.assets?.find((asset) => asset.name === "catalog.sqlite.gz")?.url;

  if (!manifestUrl || !databaseUrl) {
    throw new Error("Catalog release is missing required assets");
  }

  return { manifestUrl, databaseUrl };
}

async function downloadReleaseAsset(args: {
  url: string;
  token?: string;
  fetchImpl: FetchLike;
}): Promise<Buffer> {
  const response = await args.fetchImpl(args.url, {
    cache: "no-store",
    headers: headers(args.token, "application/octet-stream"),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Catalog asset download failed with status ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function syncCatalogFromGitHubRelease(args: {
  repository?: string;
  tag?: string;
  token?: string;
  catalogPath?: string;
  fetchImpl?: FetchLike;
} = {}): Promise<CatalogSyncResult> {
  const repository =
    args.repository ??
    process.env.CATALOG_GITHUB_REPOSITORY ??
    process.env.GITHUB_REPOSITORY ??
    "SapioBeasley/jobApplier";
  const tag = args.tag ?? process.env.CATALOG_RELEASE_TAG ?? "job-catalog";
  const token =
    args.token ?? process.env.CATALOG_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  const fetchImpl = args.fetchImpl ?? fetch;

  const assets = await discoverCatalogReleaseAssets({
    repository,
    tag,
    token,
    fetchImpl,
  });

  return syncCatalog({
    manifestUrl: assets.manifestUrl,
    databaseUrl: assets.databaseUrl,
    catalogPath: args.catalogPath,
    download: (url) => downloadReleaseAsset({ url, token, fetchImpl }),
  });
}
