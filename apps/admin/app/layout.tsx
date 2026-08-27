import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "./Sidebar";

export const metadata: Metadata = {
  title: "Lumi Frame — Platform Admin",
  description: "Internal console: every tenant using Lumi Frame, in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Sidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
