import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumière Eyewear — Demo Store",
  description: "A fake eyewear store used to test the Lumi Frame integration end-to-end.",
};

const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID ?? "";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a className="brand" href="/">
            Lumière Eyewear
          </a>
          <nav>
            <a href="/">Shop</a>
            <a href="/cart">Cart</a>
          </nav>
        </header>
        {!STORE_ID && (
          <div style={{ background: "#fff3cd", color: "#664d03", padding: "10px 32px", fontSize: 13 }}>
            NEXT_PUBLIC_STORE_ID is not set — the Try-On button will not work. See apps/demo-store/README.md.
          </div>
        )}
        {children}

        {/* The one integration line a real merchant adds: load the SDK,
            then tell it which store this page belongs to. Everything else
            (per-product attach/open) happens in ProductClient.tsx, exactly
            like packages/sdk/README.md documents. */}
        <Script src="/sdk.js" strategy="beforeInteractive" />
        <Script id="lumiframe-init" strategy="afterInteractive">
          {`window.TryOn && window.TryOn.init({ storeId: ${JSON.stringify(STORE_ID)}, apiBaseUrl: ${JSON.stringify(API_BASE_URL)} });`}
        </Script>
      </body>
    </html>
  );
}
