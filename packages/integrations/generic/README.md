# packages/integrations/generic — Phase 1 (adapter interface), Phase 3 (full)

`OrderTrackingAdapter` interface (`identifyCart`, `identifyOrder`,
`subscribeToCartEvents`, `subscribeToOrderEvents`) plus the generic
implementation for platforms with no dedicated integration: JS callbacks,
a server-side API, or webhooks the merchant configures manually. See
product spec §14/§28 and `ARCHITECTURE.md` §10.

Not yet implemented — this is a placeholder for Phase 1/3.
