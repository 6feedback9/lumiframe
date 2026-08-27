// ARCHITECTURE.md §11 / product spec's "important API security rule":
// a store may only submit productImageUrl (and productUrl) values that
// resolve to a domain it owns, so /api/v1/tryons can never be used as a
// free image-fetching proxy for arbitrary URLs.
//
// Patterns are stored per-store as origins, optionally with a trailing
// wildcard path (`https://glasses.ua/*`) which is accepted for
// readability but not treated as a path constraint — only the hostname
// (and, if the pattern specifies one, the protocol) is actually checked.
// A bare hostname (`cdn.glasses.ua`) is also accepted and matches any
// protocol.

function parsePattern(pattern: string): { protocol: string | null; hostname: string } | null {
  const trimmed = pattern.trim().replace(/\/\*$/, "").replace(/\/$/, "");
  if (!trimmed) return null;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return { protocol: url.protocol, hostname: url.hostname.toLowerCase() };
    } catch {
      return null;
    }
  }

  return { protocol: null, hostname: trimmed.toLowerCase() };
}

export function isAllowedProductUrl(allowedDomains: readonly string[], candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const hostname = url.hostname.toLowerCase();

  return allowedDomains.some((pattern) => {
    const parsed = parsePattern(pattern);
    if (!parsed) return false;
    if (parsed.protocol && parsed.protocol !== url.protocol) return false;
    return hostname === parsed.hostname;
  });
}
