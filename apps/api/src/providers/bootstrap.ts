// Registers every TryOnProvider this deployment knows how to construct.
// getTryOnProvider(env.AI_PROVIDER) (packages/tryon) resolves against
// whatever was registered here — nothing else in the app imports a
// concrete provider package directly (ARCHITECTURE.md §6).
//
// Phase 2 adds: if env.AI_PROVIDER !== "mock", dynamically import and
// register @lumiframe/provider-real here. Nothing else changes.

import { registerMockProvider } from "@lumiframe/provider-mock";

export function bootstrapProviders(): void {
  registerMockProvider();
}
