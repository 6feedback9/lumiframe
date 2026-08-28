"use client";

import { useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function IntegrationSnippet({ storeId }: { storeId: string }) {
  const [copied, setCopied] = useState(false);

  const snippet = `<script src="${API_BASE_URL}/sdk.js"></script>
<script>
  TryOn.init({ storeId: "${storeId}" });
  // Optional: on an unknown platform, tell it exactly what to read —
  // otherwise it tries JSON-LD, then OpenGraph, automatically.
  // TryOn.attach({ productId: "...", productImageUrl: "...", ... });
</script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — the snippet is still selectable/copyable by hand
    }
  }

  return (
    <div>
      <pre
        style={{
          background: "rgba(173,201,255,0.05)",
          border: "1px solid var(--line)",
          borderRadius: 10,
          padding: 14,
          fontSize: 12,
          overflowX: "auto",
          color: "var(--paper)",
          margin: 0,
        }}
      >
        {snippet}
      </pre>
      <button type="button" className="btn" style={{ marginTop: 10 }} onClick={copy}>
        {copied ? "Copied" : "Copy snippet"}
      </button>
      <p style={{ fontSize: 12, color: "var(--mist)", marginTop: 10, lineHeight: 1.6 }}>
        Paste this once, near the bottom of your product page template. It
        detects the current product automatically (JSON-LD → OpenGraph → DOM
        selectors you configure) and inserts a &ldquo;Try on&rdquo; button next
        to your add-to-cart button as soon as a product is detected — no
        theme editing beyond this one snippet. If your theme needs the
        button somewhere specific, pass{" "}
        <code style={{ fontSize: 11 }}>buttonAnchorSelector</code> to{" "}
        <code style={{ fontSize: 11 }}>TryOn.init(...)</code>. See the{" "}
        <a href="/integration" style={{ color: "var(--sky)" }}>
          Integration page
        </a>{" "}
        to check it&rsquo;s wired up correctly.
      </p>
    </div>
  );
}
