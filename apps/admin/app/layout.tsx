import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./Sidebar";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Lumi Frame — Platform Admin",
  description: "Internal console: every tenant using Lumi Frame, in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <I18nProvider>
          <div className="shell">
            <Sidebar />
            <main className="main">{children}</main>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
