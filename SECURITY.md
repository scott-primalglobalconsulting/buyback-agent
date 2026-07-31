# Security

Last reviewed: 2026-07-31 15:46 -0500

## Reporting

Open a GitHub issue, or contact the maintainer through the repository. This is an
independent demo, not a commercial service; there is no bug bounty.

## Design

Three boundaries carry the security properties, and they are enforced by tests
rather than convention:

- **`lib/db` is the only module that touches Supabase.** Every query runs under
  Row Level Security. The service-role key is confined to the deny-all
  abuse-guard tables and never reaches the client.
- **The Anthropic key is server-side only.** Client components reach the agent
  through `fetch` to a route handler, never the SDK.
- **Demo IPs are hashed** with `sha256(ip + SERVER_SALT)` before they reach the
  abuse-guard tables. Raw IPs do not leave the analyze route.

The cross-workspace isolation proof is `supabase/tests/rls-isolation.sql`, with a
captured transcript in `docs/ARCHITECTURE.md`.

`Referrer-Policy: no-referrer` is set in `next.config.ts` because the magic-link
callback carries a single-use auth code in its query string.

## Verified, 2026-07-31

Audited against the public repository, the full git history, and the live
deployment:

- All 297 blobs across every branch scanned for API keys, JWTs, AWS keys, PEM
  private keys, and Resend/SendGrid/Slack/GitHub tokens. No credential has ever
  been committed.
- The only JWT in the public client bundle decodes to `role=anon`, which is
  public by design. No service-role key, Anthropic key, SMTP credential, or
  `SERVER_SALT` in the bundle.
- Unauthenticated reads and writes rejected on all eight tables via the public
  anon key. The abuse-guard tables deny at the grant level.
- `/api/export/[id]`, `/api/sop` return 401 without a session; `/app` redirects
  to `/sign-in`. Error bodies carry no stack traces or internals.
- No source maps served.

## Known advisories, accepted with reasoning

`npm audit` reports three high-severity advisories. **All three are inside
`next` and none has a released fix** — the advisory range for `next` extends to
`16.3.0-preview.7`, and the newest published release is `16.2.12`, which this
project is pinned to. npm's suggested remediation is a downgrade to Next 9,
which is not a serious option.

They are not reachable in this deployment:

| Advisory | Why it does not apply here |
|---|---|
| `sharp` < 0.35.0 (libvips CVEs) | `next/image` is not used anywhere in this codebase, so the image-optimization path that invokes sharp is never entered. |
| `postcss` <= 8.5.17 (sourceMappingURL path traversal, `</style>` XSS) | Build-time only, and requires attacker-controlled CSS. All CSS in this project is authored in-repo; no user or remote stylesheet is ever processed. |
| `next` 9.3.4-canary.0 - 16.3.0-preview.7 | No released fix. Pinned to the newest published release. |

This is re-evaluated whenever `next` publishes a release. When 16.3.0 ships, bump
and delete this section.

`brace-expansion` (< 1.1.17, DoS) was reported in the same audit and **has been
fixed** — it reached the tree through ESLint tooling and never shipped to
production.
