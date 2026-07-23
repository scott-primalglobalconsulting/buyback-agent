# Design System — Phase 5 UI

Last updated: 2026-07-23 16:59 EST

The source of truth for the Buyback Agent product UI. Every Phase 5 component
derives its color, type, and layout from this doc. Design-direction proof
(internal, private Artifact): `https://claude.ai/code/artifact/d855a59d-493a-469f-b27a-1f507eae68b9`.

## Principles

- **Own the system.** Custom tokens, self-hosted type pairing, hand-built SVG
  viz. No component-kit theme shipped untouched. Radix primitives are pulled in
  only where accessibility is hard (dialog, dropdown/menu, toast); Lucide for
  icons.
- **Color means data.** The chrome is monochrome ink plus one cobalt accent. The
  only categorical color in the product is the four DRIP quadrant hues. Cobalt
  never labels a quadrant; status red is reserved for critical/error only.
- **Independent demo.** Nothing tracks Martell brand trade dress. The
  non-affiliation disclaimer stands on every public surface.
- **Every state designed.** Streaming, loading, empty, and each guard verdict
  have real UX (see State inventory).

## Color tokens

Defined as CSS custom properties. Light is the default `:root`; dark is set via
`@media (prefers-color-scheme: dark)` **and** `:root[data-theme="dark"]` /
`:root[data-theme="light"]` so a viewer toggle overrides the OS preference in
both directions. Style components through the tokens, never hard-code a hex.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--paper` | `#FAF7F1` | `#131210` | Page ground (warm-biased neutral) |
| `--panel` | `#FEFDFB` | `#1B1815` | Card / surface |
| `--panel-2` | `#F2EEE6` | `#171410` | Recessed surface, table header |
| `--inset` | `#ECE7DD` | `#221E18` | Track / well backgrounds |
| `--line` | `#E6E0D5` | `#2B2620` | Hairline borders |
| `--line-2` | `#D6CFC1` | `#39332A` | Stronger dividers |
| `--ink` | `#1A1711` | `#EDEAE2` | Primary text |
| `--ink-2` | `#615B4E` | `#A29B8D` | Secondary text |
| `--ink-3` | `#8D887A` | `#746D60` | Faint labels / captions |
| `--accent` | `#2F5FE0` | `#5B84F0` | Cobalt: interactive, section rules, hero figure, hire-first rung, focus |
| `--accent-contrast` | `#FFFFFF` | `#0B1020` | Text/icon on accent fills |

Accent contrast verified AA on its ground (5.2:1 light, 4.9:1 dark). Focus ring
uses `--accent`.

### DRIP categorical (the data palette)

Validated with the dataviz skill's `validate_palette.js` — both modes pass
lightness-band, chroma floor, adjacent-pair CVD separation, and contrast/relief.
The worst adjacent pair sits in the 6–8 CVD floor band, which is legal **only**
with secondary encoding: the quadrant is always direct-labeled and spatially
bucketed, and every chip pairs the color with a text label. Color is never the
sole channel.

| Quadrant | Light | Dark | Meaning / action |
|---|---|---|---|
| Delegate | `#1FA8A0` | `#20A69D` | Low value, hand off to a person |
| Replace | `#E0A419` | `#BC8218` | Repetitive, automate it away |
| Invest | `#6E62E6` | `#7C6EEE` | High value, build a durable asset |
| Produce | `#3E9E5A` | `#3E9C5C` | Founder's unique output, protect |

These map 1:1 to `DRIP_QUADRANTS` in `lib/buyback/types.ts` (`Delegate`,
`Replace`, `Invest`, `Produce`). Fixed order, never cycled.

### Sequential ink ramp (magnitude, one hue)

`--seq-1 … --seq-5` (light `#E9E3D7 → #282419`, dark `#24201A → #C6C0B2`). Used
for single-measure magnitude only — e.g. the value-ladder hour bars. Never used
where identity/category matters (that's the DRIP palette).

### Status (reserved)

`--good` (green), `--warn` (amber), `--crit` (red). Ship with an icon + label,
never color alone. `--crit` red is reserved for critical/error and is never the
brand accent.

## Typography

Three roles, self-hosted via `next/font/google` in the app (subset latin,
`display: swap`), exposed as CSS variables. In the Artifact proof the same faces
are inlined as base64 `@font-face` (CSP blocks font CDNs).

| Role | Face | Var | Use |
|---|---|---|---|
| Display | Instrument Serif (400) | `--f-display` | Mastheads, section titles, the one hero figure ($ buyback rate). Restraint — the only headline numerals in serif. |
| Body / UI | IBM Plex Sans (400/500/600) | `--f-body` | All running text and UI. Deliberately not Inter. |
| Data / mono | IBM Plex Mono (400/500) | `--f-mono` | Every figure, table cell, eyebrow, chip, label. Tabular-nums where digits align. The ledger voice. |

Type scale (px): 11 · 13 · 15 (body) · 16 · 21 · 28 · 40 · 56 · hero clamp
72–120. Uppercase mono labels get `letter-spacing: .08–.16em`. Headings get
`text-wrap: balance`; body stays near 60–65ch.

## Viz treatments (hand-built, no chart lib)

- **DRIP allocation grid** — the signature. A 4-bucket allocation from
  `quadrantHourRollup` (hours + % of week per quadrant), grouped under **Shed**
  (Delegate + Replace) and **Keep** (Invest + Produce) brackets, each cell washed
  with its hue and listing the tasks that landed there. Not a scatter with
  fabricated axes — the model stores a categorical quadrant per task, not
  coordinates.
- **Buyback-rate hero** — the rate as the single display-face figure in cobalt,
  with a plain-language definition and two support stats (reclaimable hrs/wk,
  first hire). No arbitrary gauge.
- **Value ladder** — hours per value tier ($10 → $10,000) as sequential-ramp
  bars; the low tiers marked as the offload zone.
- **Replacement Ladder** — the fixed hire order (admin → delivery → marketing →
  sales → leadership) as a vertical ladder; `summary.firstHireRole` lit in cobalt
  with its justification, the rest dimmed.
- **Scored audit table** — task / hrs / $per-hr / value tier / DRIP chip
  (dot + label) / keep-delegate-eliminate chip. Mono, tabular, column-aligned.

All rollup math comes from `lib/buyback` — never recomputed in a component.

## State inventory

Every one is a designed surface, keyed to the guard verdicts in
`lib/guard/policy.ts` and the streaming route:

| State | Trigger | Treatment |
|---|---|---|
| Streaming / thinking | live analysis | adaptive-thinking summaries stream as a mono log with a cobalt caret |
| Loading | pre-stream | shimmer skeleton blocks |
| Empty | first run / no audits | invitation + "Try sample data" (cobalt button) |
| Rate limited (429) | `rate_limited` | amber badge, "demo limit reached, sign in for unlimited" |
| Cache served | `serve_cache` / `breaker_serve_cache` | info badge, "serving today's cached result, no live call" |
| Unavailable (503) | `unavailable` | crit badge, "briefly paused, try again shortly" |
| Error | stream/validation failure | crit badge, what broke + retry |

## Build constraints

- **Tailwind v4 + tokens.** External CSS only — no inline styles (project rule).
- **Isolation holds.** Components consume `lib/agent` / `lib/db` / `lib/buyback`
  only; never call Anthropic or Supabase directly.
- **Accessibility floor.** Visible keyboard focus (`--accent` ring), reduced
  motion respected, color never the sole encoding, a table view for the data.
- **Dependencies (pending approval gate at Task 5.2):** `@radix-ui/react-dialog`,
  `@radix-ui/react-dropdown-menu`, `@radix-ui/react-toast` (as needed),
  `lucide-react`. No install before explicit operator approval.
