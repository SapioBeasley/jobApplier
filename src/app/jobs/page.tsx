import type { CSSProperties } from "react";
import { getAcceptedPositions } from "../../jobs/acceptedPosition";
import {
  listCatalogJobs,
  type CatalogJobFilters,
  type CatalogJobListItem,
} from "../../catalog/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Record<string, string | string[] | undefined>;

type JobsPageProps = {
  searchParams?: Promise<SearchParams>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function displaySource(source: string) {
  if (source === "builtin") return "Built In";
  return source;
}

function formatDate(value: number | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const shell: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  padding: "36px 24px 64px",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#172033",
};

const panel: CSSProperties = {
  border: "1px solid #dce2ea",
  borderRadius: 14,
  background: "#fff",
  padding: 20,
  boxShadow: "0 6px 20px rgba(23,32,51,0.05)",
};

const input: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #c8d0dc",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#fff",
  color: "#172033",
};

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = (await searchParams) ?? {};
  const filters: CatalogJobFilters = {
    text: first(params.q),
    acceptedPosition: first(params.position),
    source: first(params.source),
    lifecycleStatus: first(params.status),
    quickApply: first(params.quickApply),
  };
  const syncStatus = first(params.sync);

  let jobs: CatalogJobListItem[];
  let allJobs: CatalogJobListItem[];
  let catalogError: string | null = null;

  try {
    jobs = listCatalogJobs({ filters });
    allJobs = listCatalogJobs({});
  } catch (error) {
    jobs = [];
    allJobs = [];
    catalogError = error instanceof Error ? error.message : "Catalog unavailable";
  }

  const sources = [...new Set(allJobs.flatMap((job) => job.sources))].sort();
  const statuses = [...new Set(allJobs.map((job) => job.lifecycleStatus))].sort();
  const acceptedPositions = getAcceptedPositions();

  return (
    <main style={shell}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "start" }}>
          <div>
            <p style={{ margin: 0, color: "#617087", fontWeight: 700, letterSpacing: 0.5 }}>
              JOBAPPLIER
            </p>
            <h1 style={{ fontSize: 36, margin: "8px 0 8px" }}>Jobs</h1>
            <p style={{ margin: 0, color: "#617087", maxWidth: 760 }}>
              Remote US opportunities from the local read-only catalog. Filtering here never changes candidate or application history.
            </p>
          </div>

          <form action="/api/catalog/sync" method="post">
            <button
              type="submit"
              style={{
                border: "1px solid #b9c4d3",
                borderRadius: 8,
                padding: "10px 14px",
                background: "#fff",
                color: "#172033",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Sync catalog
            </button>
          </form>
        </div>

        {syncStatus === "updated" ? (
          <p style={{ margin: "12px 0 0", color: "#22633b", fontWeight: 700 }}>
            Catalog updated from GitHub Release.
          </p>
        ) : null}
        {syncStatus === "current" ? (
          <p style={{ margin: "12px 0 0", color: "#526078", fontWeight: 700 }}>
            Local catalog is already current.
          </p>
        ) : null}
        {syncStatus === "failed" ? (
          <p style={{ margin: "12px 0 0", color: "#9b2c2c", fontWeight: 700 }}>
            Catalog sync failed. The existing local catalog was preserved.
          </p>
        ) : null}
      </header>

      <section style={{ ...panel, marginBottom: 24 }} aria-label="Job filters">
        <form method="get" action="/jobs">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              alignItems: "end",
            }}
          >
            <label>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Search
              </span>
              <input style={input} name="q" defaultValue={filters.text ?? ""} placeholder="Title, company, location" />
            </label>

            <label>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Position
              </span>
              <select style={input} name="position" defaultValue={filters.acceptedPosition ?? ""}>
                <option value="">All accepted positions</option>
                {acceptedPositions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Source
              </span>
              <select style={input} name="source" defaultValue={filters.source ?? ""}>
                <option value="">All sources</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {displaySource(source)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Status
              </span>
              <select style={input} name="status" defaultValue={filters.lifecycleStatus ?? ""}>
                <option value="">All lifecycle states</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Apply type
              </span>
              <select style={input} name="quickApply" defaultValue={filters.quickApply ?? ""}>
                <option value="">Any</option>
                <option value="yes">Quick / Easy Apply</option>
                <option value="no">Not Quick / Easy Apply</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button
              type="submit"
              style={{
                border: 0,
                borderRadius: 8,
                padding: "10px 16px",
                background: "#172033",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Apply filters
            </button>
            <a href="/jobs" style={{ padding: "10px 4px", color: "#43536c" }}>
              Clear
            </a>
          </div>
        </form>
      </section>

      {catalogError ? (
        <section style={panel}>
          <h2 style={{ marginTop: 0 }}>No local catalog available</h2>
          <p style={{ color: "#617087" }}>
            Sync a published job catalog before browsing jobs. Catalog reads are server-only and read-only.
          </p>
          <code style={{ fontSize: 12 }}>{catalogError}</code>
        </section>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <strong>{jobs.length} jobs</strong>
            <span style={{ color: "#617087", fontSize: 14 }}>Newest postings first</span>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {jobs.map((job) => {
              const posted = formatDate(job.postedAt);
              return (
                <article key={job.id} style={panel}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "start" }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 21 }}>{job.title}</h2>
                      <p style={{ margin: "6px 0 0", color: "#46566f" }}>
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </p>
                    </div>
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        borderRadius: 999,
                        padding: "6px 10px",
                        background: job.quickApply === "yes" ? "#e9f7ef" : "#f1f4f8",
                        color: job.quickApply === "yes" ? "#22633b" : "#526078",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {job.quickApply === "yes" ? "Quick / Easy Apply" : `Quick Apply: ${job.quickApply}`}
                    </span>
                  </div>

                  <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, color: "#617087", fontSize: 13 }}>
                    <span>{job.lifecycleStatus}</span>
                    <span>·</span>
                    <span>{job.applicationType}</span>
                    {posted ? <span>· Posted {posted}</span> : null}
                    {job.sources.length > 0 ? <span>· {job.sources.map(displaySource).join(", ")}</span> : null}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <a href={`/jobs/${encodeURIComponent(job.id)}`} style={{ color: "#163f8c", fontWeight: 700 }}>
                      View job
                    </a>
                  </div>
                </article>
              );
            })}

            {jobs.length === 0 ? (
              <section style={panel}>
                <strong>No jobs match these filters.</strong>
              </section>
            ) : null}
          </div>
        </>
      )}
    </main>
  );
}
