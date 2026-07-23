// Public surface of the abuse-guard PURE core. Re-exports the decision
// function, payload validator, and constants. The DB-backed counters/cache
// (service-role only) live in lib/db/guard.ts and are imported separately by
// server code — never re-exported here, so this module stays I/O-free.
export { GUARD_LIMITS, decideDemo, validatePayloadSize } from './policy';
export type { DemoVerdict } from './policy';
