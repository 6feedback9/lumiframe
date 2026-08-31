// ARCHITECTURE.md §11 / product spec's "important API security rule":
// a store may only submit productImageUrl (and productUrl) values that
// resolve to a domain it owns, so /api/v1/tryons can never be used as a
// free image-fetching proxy for arbitrary URLs.
//
// Patterns are stored per-store as origins, optionally with a trailing
// wildcard path (`https://glasses.ua/*`) which is accepted for
// readability but not treated as a path constraint — only the hostname
// is actually checked. A bare hostname (`cdn.glasses.ua`) is also
// accepted. A pattern's own protocol (if it has one, e.g. copy-pasted
// straight from a browser address bar — the expected way a merchant
// fills this in, per apps/dashboard's Allowed domains editor) is
// deliberately ignored for matching purposes, not just for parsing: it
// used to be compared against the candidate's protocol, which rejected
// a real product photo over something that isn't a meaningful security
// boundary here — a theme or a third-party image/CDN app can emit an
// absolute `http://` URL for an image on an otherwise-`https:` store
// (confirmed on a real Shopify store this session: a variant photo's
// JSON-LD `image` came back as `http://`, plain, while the allowed
// pattern had been saved as `https://` because that's what the address
// bar showed) — same hostname, same trust boundary, just a scheme
// mismatch that has nothing to do with which domain owns the image.
function parsePattern(pattern: string): { hostname: string } | null {
  const trimmed = pattern.trim().replace(/\/\*$/, "").replace(/\/$/, "");
  if (!trimmed) return null;

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      return { hostname: new URL(trimmed).hostname.toLowerCase() };
    } catch {
      return null;
    }
  }

  return { hostname: trimmed.toLowerCase() };
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

  return allowedDomains.some((pattern) => parsePattern(pattern)?.hostname === hostname);
}
