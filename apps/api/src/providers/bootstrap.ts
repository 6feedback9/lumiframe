// Registers every TryOnProvider this deployment knows how to construct.
// getTryOnProvider(env.AI_PROVIDER) (packages/tryon) resolves against
// whatever was registered here — nothing else in the app imports a
// concrete provider package directly (ARCHITECTURE.md §6).
//
// Both are always registered — registering is cheap (just adds a factory
// to a Map; GeminiTryOnProvider itself isn't constructed, and GEMINI_API_KEY
// isn't read, until something actually sets AI_PROVIDER=gemini and a job
// requests it). Only one is ever used per deployment, via AI_PROVIDER.

import { registerMockProvider } from "@lumiframe/provider-mock";
import { registerGeminiProvider } from "@lumiframe/provider-real";

export function bootstrapProviders(): void {
  registerMockProvider();
  registerGeminiProvider();
}
