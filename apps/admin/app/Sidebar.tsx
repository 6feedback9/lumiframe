"use client";

import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="mark">Ú</span>
        <span>
          <span className="word">Lumi Frame</span>
          <span className="tag">Platform Admin</span>
        </span>
      </div>
      <nav>
        <a href="/" className={pathname === "/" || pathname.startsWith("/tenants") ? "active" : ""}>
          Tenants
        </a>
      </nav>
    </aside>
  );
}
