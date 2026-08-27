// Imported first (before env.ts or anything that reads process.env) by
// both entrypoints (server.ts, worker/run.ts) so a local .env file works
// for `pnpm dev` without every deploy target needing one — a real
// deployment sets env vars directly and this is a no-op there.
import { config } from "dotenv";
config();
