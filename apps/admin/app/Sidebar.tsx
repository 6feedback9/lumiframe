"use client";

import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="sidebar">
      <div className="logo">
        Lumi Frame
        <span className="tag">Platform Admin</span>
      </div>
      <nav>
        <a href="/" className={pathname === "/" || pathname.startsWith("/tenants") ? "active" : ""}>
          Tenants
        </a>
      </nav>
    </aside>
  );
}
