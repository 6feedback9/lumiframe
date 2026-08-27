"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/tryons", label: "Try-ons" },
  { href: "/integration", label: "Integration" },
];

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="mark">Ú</span>
        <span>
          <span className="word">Lumi Frame</span>
          <span className="tag">by Lumi Web Agency</span>
        </span>
      </div>
      <nav>
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className={pathname === link.href ? "active" : ""}>
            {link.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
