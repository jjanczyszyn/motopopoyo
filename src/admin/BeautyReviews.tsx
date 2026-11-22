import React from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { EmptyState, btnGhost, btnPrimary, cardStyle, useIsMobile } from "./shared";

const LABEL = { pending: "To check", published: "On the site", hidden: "Hidden" } as const;

// Reviews customers leave on beauty.popoyo.co/review.
export function BeautyReviews({ adminToken }: { adminToken: string }) {
  const data = useQuery(api.beautyReviews.list, { adminToken });
  const setStatus = useMutation(api.beautyReviews.setStatus);
  const mobile = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      {!mobile && <h2 style={{ margin: 0, fontSize: 22 }}>Beauty reviews</h2>}
      <div style={{ fontSize: 13, color: "var(--muted)" }}>
        Send customers <strong>beauty.popoyo.co/review</strong>. Publish every real review, whatever
        the stars. Hide only spam, abuse, or someone who wasn't a customer.
      </div>
      {data && data.rows.length === 0 && <EmptyState message="No reviews yet." />}
      {(data?.rows ?? []).map((r) => (
        <div key={r._id} data-testid="beauty-review" style={{ ...cardStyle, borderColor: r.status === "pending" ? "#f59e0b" : "var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <strong>{r.name}</strong>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{LABEL[r.status]}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", margin: "2px 0 8px" }}>
            <span aria-label={`${r.rating} of 5 stars`} style={{ color: "#b45309" }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
            {" · "}{new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {r.service ? ` · ${r.service}` : ""}
          </div>
          <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 15 }}>{r.text}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {r.status !== "published" && (
              <button style={btnPrimary} onClick={() => setStatus({ adminToken, id: r._id, status: "published" })}>Publish</button>
            )}
            {r.status !== "hidden" && (
              <button style={btnGhost} onClick={() => setStatus({ adminToken, id: r._id, status: "hidden" })}>Hide</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
