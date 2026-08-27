import { config } from "dotenv";

// Loaded before any test file's imports resolve, so env.ts's eager
// validation (apps/api/src/env.ts) sees these instead of exiting the
// process. Requires a local Postgres reachable at the DATABASE_URL below
// — see apps/api/README.md for setup.
config({ path: ".env.test" });
