"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthGuard } from "../../AuthGuard";
import { apiFetch } from "@/lib/api";
import { useI18n, type TranslationKey } from "@/lib/i18n";

interface GenerationAttempt {
  id: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  resultUrl: string | null;
  generationDurationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface TryOnDetail {
  id: string;
  product: { id: string; title: string | null; url: string | null; imageUrl: string; price?: number; currency?: string };
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  // Deliberately no customerImageUrl here — the API's merchant-facing
  // detail route never returns it (apps/api/src/routes/tryons.ts). Only
  // the platform admin sees the customer's raw uploaded photo
  // (apps/admin/app/tryons/[id]).
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
  // Captured once when this try-on's widget opened (ARCHITECTURE.md §10)
  // — the API always sends this object, individual fields are null when
  // absent, never the whole object.
  utm: { source: string | null; medium: string | null; campaign: string | null; term: string | null; content: string | null };
  // Set only if an Order matched this session within the attribution
  // window — product ask: UTM on its own (a browse event) says little;
  // it matters once there's a real order to tie it to, so both live in
  // one panel together rather than UTM floating alone in the list.
  attribution: { orderId: string; revenue: number; currency: string; minutesBetween: number } | null;
}

/** minutesBetween -> "45 хв" / "3 год" / "2 дн" — a plain elapsed-time
 * duration (try-on to order), not a relative-to-now time, so this builds
 * its own string from the three unit-label keys rather than reaching for
 * Intl.RelativeTimeFormat (that API's "in X"/"X ago" framing doesn't fit
 * a duration between two past events). */
function formatTimeToOrder(minutes: number, t: (key: TranslationKey) => string): string {
  if (minutes < 60) return `${minutes} ${t("detail.minutesUnit")}`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} ${t("detail.hoursUnit")}`;
  return `${Math.round(minutes / 1440)} ${t("detail.daysUnit")}`;
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
          background: "rgba(255,255,255,0.05)",
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
    apiFetch<TryOnDetail>(`/api/v1/tryons/${params.id}/detail`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [params.id]);

  if (error) return <div className="empty-state">{error}</div>;
  if (!data) return <div className="empty-state">{t("common.loading")}</div>;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <button className="btn" style={{ width: "auto", padding: "6px 12px", fontSize: 12 }} onClick={() => router.push("/tryons")}>
          ← {t("detail.back")}
        </button>
      </div>
      <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {data.product.title ?? t("detail.title")}
        <span className={badgeClass(data.status)}>{data.status}</span>
      </div>

      {data.status === "FAILED" && (data.errorMessage || data.errorCode) && (
        <div className="empty-state" style={{ color: "var(--danger, #ff6b6b)", textAlign: "left", marginBottom: 16 }}>
          {data.errorCode ? `${data.errorCode}: ` : ""}
          {data.errorMessage}
        </div>
      )}

      {/* Customer wearing the product, then the catalog photo it came from
          — no raw customer photo here by design (see the TryOnDetail
          comment above). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, marginBottom: 20, maxWidth: 640 }}>
        <PhotoCard
          title={t("detail.resultPhoto")}
          url={data.resultUrl}
          placeholder={data.status === "COMPLETED" ? t("detail.noPhoto") : t("detail.notAvailable")}
        />
        <PhotoCard title={t("detail.productPhoto")} url={data.product.imageUrl} placeholder={t("detail.noPhoto")} />
      </div>

      <div className="panel" style={{ padding: 20, fontSize: 13, color: "var(--mist)" }}>
        <div>
          {t("tryons.createdAt")}: {new Date(data.createdAt).toLocaleString()}
        </div>
        {data.generationDurationMs != null && <div>{t("detail.duration")}: {(data.generationDurationMs / 1000).toFixed(1)}s</div>}
        {data.product.price != null && (
          <div>
            {data.product.title}: {data.product.price} {data.product.currency}
          </div>
        )}
      </div>

      {/* UTM together with the order it converted to (product ask) —
          a UTM tag on its own, on a session that never bought anything,
          isn't worth a panel; this only renders once there's something
          to say, either the tags themselves or a confirmed sale. */}
      {(data.utm.source || data.utm.medium || data.utm.campaign || data.attribution) && (
        <div className="panel" style={{ padding: 20, marginTop: 16, maxWidth: 640, fontSize: 13 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--mist-dim)", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".06em" }}>
            {t("detail.attributionTitle")}
          </div>

          {data.attribution ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              <div style={{ color: "var(--good)", fontWeight: 600 }}>✓ {t("detail.convertedToOrder")}</div>
              <div style={{ color: "var(--mist)" }}>
                {t("detail.orderId")}: <span style={{ color: "var(--paper)" }}>{data.attribution.orderId}</span>
              </div>
              <div style={{ color: "var(--mist)" }}>
                {t("detail.revenue")}: <span style={{ color: "var(--paper)" }}>{data.attribution.revenue} {data.attribution.currency}</span>
              </div>
              <div style={{ color: "var(--mist)" }}>
                {t("detail.timeToOrder")}: <span style={{ color: "var(--paper)" }}>{formatTimeToOrder(data.attribution.minutesBetween, t)}</span>
              </div>
            </div>
          ) : null}

          {data.utm.source || data.utm.medium || data.utm.campaign ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, color: "var(--mist)" }}>
              {data.utm.source && (
                <div>
                  {t("detail.utmSource")}: <span style={{ color: "var(--paper)" }}>{data.utm.source}</span>
                </div>
              )}
              {data.utm.medium && (
                <div>
                  {t("detail.utmMedium")}: <span style={{ color: "var(--paper)" }}>{data.utm.medium}</span>
                </div>
              )}
              {data.utm.campaign && (
                <div>
                  {t("detail.utmCampaign")}: <span style={{ color: "var(--paper)" }}>{data.utm.campaign}</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Only when "Спробувати інше фото" was actually used on this
          try-on (more than one attempt) — otherwise this would just
          repeat the single photo card above for no reason. */}
      {data.generations.length > 1 && (
        <div className="panel" style={{ padding: 20, marginTop: 16, maxWidth: 640 }}>
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
                  background: i === 0 ? "rgba(255,255,255,0.05)" : "transparent",
                  border: "1px solid var(--line)",
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)" }}>
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
