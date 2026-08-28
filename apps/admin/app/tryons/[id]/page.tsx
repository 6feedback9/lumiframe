"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "../../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginBottom: 20 }}>
        <PhotoCard title={t("detail.productPhoto")} url={data.product.imageUrl} placeholder={t("detail.noPhoto")} />
        <PhotoCard title={t("detail.customerPhoto")} url={data.customerImageUrl} placeholder={t("detail.noPhoto")} />
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
