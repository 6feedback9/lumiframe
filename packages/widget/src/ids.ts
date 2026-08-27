// visitorId persists across the browser (anonymous, no account —
// ARCHITECTURE.md §10/§30). browserSessionId is per-tab. Both survive
// localStorage/sessionStorage being unavailable (private browsing, etc.)
// by falling back to an in-memory value for that page load.

const VISITOR_KEY = "lumiframe_visitor_id";
const SESSION_KEY = "lumiframe_browser_session_id";

function readOrCreate(storage: Storage | null, key: string): string {
  if (storage) {
    try {
      const existing = storage.getItem(key);
      if (existing) return existing;
      const created = crypto.randomUUID();
      storage.setItem(key, created);
      return created;
    } catch {
      // storage disabled/full — fall through to an ephemeral id
    }
  }
  return crypto.randomUUID();
}

function safeStorage(get: () => Storage): Storage | null {
  try {
    return get();
  } catch {
    return null;
  }
}

let cachedVisitorId: string | null = null;
let cachedSessionId: string | null = null;

export function getVisitorId(): string {
  if (!cachedVisitorId) cachedVisitorId = readOrCreate(safeStorage(() => window.localStorage), VISITOR_KEY);
  return cachedVisitorId;
}

export function getBrowserSessionId(): string {
  if (!cachedSessionId) cachedSessionId = readOrCreate(safeStorage(() => window.sessionStorage), SESSION_KEY);
  return cachedSessionId;
}
