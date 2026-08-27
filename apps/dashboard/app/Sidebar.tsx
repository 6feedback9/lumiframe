"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/tryons", label: "Try-ons" },
];

export function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="sidebar">
      <div className="logo">Lumi Frame</div>
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
