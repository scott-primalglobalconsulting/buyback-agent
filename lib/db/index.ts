// Public surface of lib/db. Re-exports the row/domain types and the RLS-aware
// query modules that routes and server components consume.
//
// BUNDLE SAFETY: the query modules are server-only (they import ./client, which
// is `import 'server-only'`), so this barrel is server-only by transitivity —
// importing it from a client component is a build-time error. Deliberately does
// NOT re-export the server client, the service-role client, or the browser
// client. Client components import types from './types' and the anon client
// from './browser-client' directly.
export * from './types';
export * from './workspaces';
export * from './audits';
export * from './sops';
export * from './session';
