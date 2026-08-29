"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "../../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

interface GenerationAttempt {
  id: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  resultUrl: string | null;
  customerImageUrl: string | null;
  generationDurationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface TryOnDetail {
  id: string;
  storeId: string;
  product: { id: string; title: string | null; url: string | null; imageUrl: string; price?: number; currency?: string };
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  customerImageUrl: string | null;
  resultUrl: string | null;
  generationDurationMs: number | null;
  createdAt: string;
  // Newest first — every attempt made within this try-on, not just the
  // latest one the fields above reflect. "Спробувати інше фото" reuses
  // this same try-on rather than starting a new one, so an earlier
  // attempt can be COMPLETED even while the latest one (and so the
  // fields above) show FAILED — this is where that earlier result stays
  // reachable instead of getting buried by the retry.
  generations: GenerationAttempt[];
}

function badgeClass(status: string): string {
  return `badge badge-${status.toLowerCase()}`;
}

function PhotoCard({ title, url, placeholder }: { title: string; url: string | null; placeholder: string }) {
  return (
    <div className="panel" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 10, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {title}
      </div>
      <div
        style={{
          aspectRatio: "3 / 4",
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(173,201,255,0.05)",
          border: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {url ? (
          <img src={url} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 12, color: "var(--mist-dim)", padding: 16, textAlign: "center" }}>{placeholder}</span>
        )}
      </div>
    </div>
  );
}

function TryOnDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [data, setData] = useState<TryOnDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TryOnDetail>(`/api/v1/admin/tryons/${params.id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [params.id]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="empty-state">{t("common.loading")}</div>;

  return (
    <>
      <button className="btn" style={{ width: "auto", padding: "6px 12px", fontSize: 12, marginBottom: 8 }} onClick={() => router.back()}>
        {t("detail.back")}
      </button>
      <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {data.product.title ?? data.id}
        <span className={badgeClass(data.status)}>{data.status}</span>
      </div>

      {data.status === "FAILED" && (data.errorMessage || data.errorCode) && (
        <div className="empty-state" style={{ color: "var(--danger, #ff6b6b)", textAlign: "left", marginBottom: 16 }}>
          {data.errorCode ? `${data.errorCode}: ` : ""}
          {data.errorMessage}
        </div>
      )}

      {/* Original customer photo, then the catalog photo, then the result
          — the platform admin is the one place all three are shown
          (apps/dashboard's own detail view deliberately omits the raw
          customer photo — see apps/api/src/routes/tryons.ts). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
        <PhotoCard title={t("detail.customerPhoto")} url={data.customerImageUrl} placeholder={t("detail.noPhoto")} />
        <PhotoCard title={t("detail.productPhoto")} url={data.product.imageUrl} placeholder={t("detail.noPhoto")} />
        <PhotoCard
          title={t("detail.resultPhoto")}
          url={data.resultUrl}
          placeholder={data.status === "COMPLETED" ? t("detail.noPhoto") : t("detail.notAvailable")}
        />
      </div>

      <div className="panel" style={{ padding: 20, fontSize: 13, color: "var(--mist)" }}>
        <div>
          {t("tryons.createdAt")}: {new Date(data.createdAt).toLocaleString()}
        </div>
        {data.generationDurationMs != null && <div>{(data.generationDurationMs / 1000).toFixed(1)}s</div>}
      </div>

      {/* Only when "Спробувати інше фото" was actually used on this
          try-on (more than one attempt) — otherwise this would just
          repeat the single photo grid above for no reason. */}
      {data.generations.length > 1 && (
        <div className="panel" style={{ padding: 20, marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".06em" }}>
            {t("detail.allAttempts")} ({data.generations.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.generations.map((g, i) => (
              <div
                key={g.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: i === 0 ? "rgba(173,201,255,0.05)" : "transparent",
                  border: "1px solid var(--line)",
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "rgba(173,201,255,0.05)" }}>
                  {g.resultUrl ? (
                    <img src={g.resultUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%" }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--mist)" }}>{new Date(g.createdAt).toLocaleString()}</div>
                  {g.status === "FAILED" && (g.errorMessage || g.errorCode) && (
                    <div style={{ fontSize: 12, color: "var(--danger, #ff6b6b)", marginTop: 2 }}>
                      {g.errorCode ? `${g.errorCode}: ` : ""}
                      {g.errorMessage}
                    </div>
                  )}
                  {g.generationDurationMs != null && <div style={{ fontSize: 12, color: "var(--mist-dim)", marginTop: 2 }}>{(g.generationDurationMs / 1000).toFixed(1)}s</div>}
                </div>
                <span className={badgeClass(g.status)}>{g.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function TryOnDetailPage() {
  return (
    <AuthGuard>
      <TryOnDetailContent />
    </AuthGuard>
  );
}
