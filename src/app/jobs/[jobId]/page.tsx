import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getCatalogJob } from "../../../catalog/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JobDetailPageProps = {
  params: Promise<{ jobId: string }>;
};

function displaySource(source: string) {
  if (source === "builtin") return "Built In";
  return source;
}

const shell: CSSProperties = {
  maxWidth: 980,
  margin: "0 auto",
  padding: "36px 24px 64px",
  fontFamily: "Arial, Helvetica, sans-serif",
  color: "#172033",
};

const panel: CSSProperties = {
  border: "1px solid #dce2ea",
  borderRadius: 14,
  background: "#fff",
  padding: 22,
  boxShadow: "0 6px 20px rgba(23,32,51,0.05)",
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { jobId } = await params;

  let job;
  try {
    job = getCatalogJob(jobId);
  } catch {
    job = null;
  }

  if (!job) notFound();

  return (
    <main style={shell}>
      <p style={{ marginTop: 0 }}>
        <a href="/jobs" style={{ color: "#163f8c" }}>
          ← Back to jobs
        </a>
      </p>

      <section style={{ ...panel, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "start" }}>
          <div>
            <p style={{ margin: 0, color: "#617087", fontWeight: 700 }}>{job.company}</p>
            <h1 style={{ margin: "6px 0 8px", fontSize: 34 }}>{job.title}</h1>
            <p style={{ margin: 0, color: "#526078" }}>
              {job.location ?? "Location not provided"} · {job.remoteType}
            </p>
          </div>
          <span
            style={{
              borderRadius: 999,
              padding: "7px 11px",
              background: job.quickApply === "yes" ? "#e9f7ef" : "#f1f4f8",
              color: job.quickApply === "yes" ? "#22633b" : "#526078",
              fontWeight: 700,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {job.quickApply === "yes" ? "Quick / Easy Apply" : `Quick Apply: ${job.quickApply}`}
          </span>
        </div>

        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 14,
            margin: "22px 0 0",
          }}
        >
          <div>
            <dt style={{ color: "#617087", fontSize: 12, fontWeight: 700 }}>Application type</dt>
            <dd style={{ margin: "4px 0 0" }}>{job.applicationType}</dd>
          </div>
          <div>
            <dt style={{ color: "#617087", fontSize: 12, fontWeight: 700 }}>Lifecycle</dt>
            <dd style={{ margin: "4px 0 0" }}>{job.lifecycleStatus}</dd>
          </div>
          <div>
            <dt style={{ color: "#617087", fontSize: 12, fontWeight: 700 }}>Remote US</dt>
            <dd style={{ margin: "4px 0 0" }}>{job.remoteUsEligible ? "Confirmed" : "Unknown"}</dd>
          </div>
        </dl>

        {job.preferredApplyUrl ? (
          <p style={{ margin: "22px 0 0" }}>
            <a
              href={job.preferredApplyUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                background: "#172033",
                color: "#fff",
                padding: "11px 16px",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Apply
            </a>
          </p>
        ) : null}
      </section>

      <section style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>Description</h2>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#36445a" }}>
          {job.description ?? "No description was provided by the source."}
        </p>
      </section>

      <section style={{ ...panel, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0 }}>Requirements</h2>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#36445a" }}>
          {job.requirements ?? "No separate requirements field was provided by the source."}
        </p>
      </section>

      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>Sources</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {job.sources.map((source) => (
            <div key={`${source.source}:${source.sourceUrl}`}>
              <a href={source.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#163f8c", fontWeight: 700 }}>
                {displaySource(source.source)} source
              </a>
              {source.applyUrl && source.applyUrl !== job.preferredApplyUrl ? (
                <> · <a href={source.applyUrl} target="_blank" rel="noreferrer">Apply link</a></>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
