# Design System — Phase 5 UI

Last updated: 2026-07-31 14:01 -0500

The source of truth for the Buyback Agent product UI. Every Phase 5 component
derives its color, type, and layout from this doc. The contrast and
colour-vision evidence quoted below is reproducible with
`npm run validate:palette`, which reads the shipped tokens straight out of
`app/globals.css`.

## Principles

- **Own the system.** Custom tokens, self-hosted type pairing, hand-built SVG
  viz. No component-kit theme shipped untouched. Radix primitives are pulled in
  only where accessibility is hard (dialog, dropdown/menu, toast); Lucide for
  icons.
- **Color means data.** The chrome is a cool blue-grey and `--accent` is ink,
  not a brand color. The only color in the product is the four DRIP quadrant
  hues plus the three status colors. Status red is reserved for
  critical/error only.
- **The chrome runs cool, and that is enforced.** Every neutral carries its blue
  channel at or above red and green. `npm run validate:palette` fails the build
  otherwise. This gate exists because the predecessor palette was documented as
  achromatic and shipped with blue 1-2 points *low* on nine of ten dark
  neutrals: invisible in a hex diff, but `--ink` paints the display headline and
  every light element, so a whole page read as cream. A one-point channel error
  is not catchable by eye on your own monitor.
- **State it once.** A fact gets one visual treatment, not three. A washed cell
  does not also need a colored border and a hue rail; a semantic chip does not
  need a tinted fill behind a word that already says "eliminate". Callouts are
  set with a hairline rule and a mono label, never a tinted box with an accent
  bar down its left edge.
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
| `--paper` | `#F3F5F8` | `#080B10` | Page ground (cool blue-grey) |
| `--panel` | `#FFFFFF` | `#11161F` | Card / surface |
| `--panel-2` | `#E9EDF3` | `#0D121A` | Recessed surface, table header, ladder ground |
| `--inset` | `#DFE4EC` | `#181F2A` | Track / well backgrounds |
| `--line` | `#DBE0E8` | `#262F3B` | Hairline borders |
| `--line-2` | `#BCC5D2` | `#33404F` | Stronger dividers, chip outlines |
| `--ink` | `#0E1621` | `#E6EDF5` | Primary text |
| `--ink-2` | `#4A5666` | `#97A3B2` | Secondary text |
| `--ink-3` | `#778397` | `#6C7786` | Faint labels / captions |
| `--accent` | `#0E1621` | `#E6EDF5` | Ink: interactive, hero figure, hire-first rung, focus |
| `--accent-contrast` | `#FFFFFF` | `#080B10` | Text/icon on accent fills |

**Why the accent is ink and not a hue.** Once the four quadrant colors are
spaced far enough apart to survive red-green color vision deficiency they
necessarily occupy blue (see below). Every chromatic accent then collides with
one of them: a cobalt accent lands ~9 OKLab from Invest, jade ~9 from Delegate,
copper ~8 from Replace. The only non-neutral accent that clears all four plus
reserved red is magenta. Ink was chosen over magenta because it makes the
quadrant hues the sole color on the page, which is what "color means data"
actually requires.

`--accent` is ink, so **any rule that needs to distinguish itself from body text
cannot use it.** `.rchip.r--revenue-adjacent` uses `--drip-delegate` for exactly
this reason.

### DRIP categorical (the data palette)

Validated with `scripts/validate-palette.mjs` (WCAG contrast, OKLab
lightness/chroma, and Viénot–Brettel–Mollon dichromat simulation on every pair).
Both modes pass with no warnings:

| Measure | Light | Dark | Floor |
|---|---|---|---|
| Closest quadrant pair, normal vision | 15.9 | 20.3 | 15 |
| Same pair, deuteranopia / protanopia | 13.3 | 12.4 | 9 |
| `--drip-delegate` as chip text on `--panel` | 4.55:1 | 7.67:1 | 4.5 |
| Every other quadrant hue on `--panel` | ≥3.05:1 | ≥4.44:1 | 3.0 (graphical) |

Color is still never the sole channel — the quadrant is direct-labeled and
spatially bucketed, and every chip pairs the hue with a word.

| Quadrant | Light | Dark | Meaning / action |
|---|---|---|---|
| Delegate | `#0E7FA8` | `#3FB6E0` | Low value, hand off to a person |
| Replace | `#C08A12` | `#E0A331` | Repetitive, automate it away |
| Invest | `#5B2FBF` | `#8F63EF` | High value, build a durable asset |
| Produce | `#17743E` | `#2E9455` | Founder's unique output, protect |

Delegate is cyan-blue rather than teal on purpose. Under deuteranopia the
surviving axis is blue↔yellow: teal and green both collapse toward it and become
confusable, which is what the previous palette did (9.2 normal / 9.3 dichromat
between Delegate and Produce). Pushing Delegate past the blue-green boundary and
holding a lightness gap to Produce separates them in both.

`--drip-delegate` is the one quadrant hue also rendered as text (`.rec.delegate`),
so it alone carries the 4.5:1 small-text floor rather than the 3:1 graphical one.
The previous teal failed this at 2.21:1.

These map 1:1 to `DRIP_QUADRANTS` in `lib/buyback/types.ts` (`Delegate`,
`Replace`, `Invest`, `Produce`). Fixed order, never cycled.

### Sequential ink ramp (magnitude, one hue)

`--seq-1 … --seq-5` (light `#E3E7EE → #1A212B`, dark `#181F2A → #C2CAD4`). Used
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
- **Buyback-rate hero** — the rate as the single display-face figure in `--accent`
  (ink) with a plain-language definition on the left, and the support stats
  (reclaimable hrs/wk, first hire, and the $/hr Buyback Rate when income is
  known) in a divided right column. No arbitrary gauge.
- **Value ladder** — hours per value tier ($10 → $10,000) as sequential-ramp
  bars; the low tiers marked as the offload zone.
- **Replacement Ladder** — the fixed hire order (admin → delivery → marketing →
  sales → leadership) as a vertical ladder; `summary.firstHireRole` lit by
  lifting the rung onto `--panel` over the recessed `--panel-2` ladder ground and
  tagging it in words, with its justification, the rest dimmed. The rungs and the reasoning are ONE
  panel (rungs left, reasoning right), never a card with loose text beneath it.
  The justification renders as prose, not as a mono block — it is the product's
  argument, not a log.
- **Scored audit table** — task / hrs / $per-hr / value tier / DRIP chip
  (dot + label) / revenue chip / keep-delegate-eliminate chip. Mono, tabular,
  column-aligned. Optional columns collapse when no row has the data (the
  revenue column is absent, not a run of "not scored" chips).

All rollup math comes from `lib/buyback` — never recomputed in a component.

## Dashboard page composition

`/demo` and `/app/audit/[id]` render the SAME sequence, and it is a stack of
full-width bands in one column — never a two-column dashboard row:

1. Your reclaimable time (hero) → 2. Where your week goes (DRIP 2×2) →
3. Offload these tasks → 4. Your first hire → 5. Every task, scored →
6. Delegation SOPs (authed only).

Every band spans the same measure so the page has one left edge and one right
edge. Side-by-side sections are banned here: pairing blocks of unequal mass
(a 3-row list against a ladder plus an essay) leaves a dead void beside the
shorter one, which is what made the first cut read as pieced together. Where two
things genuinely belong together, put them in one panel with an internal split
(see the Replacement Ladder), not in two grid columns.

## Touch

- **44px minimum** on every interactive target, keyed to `@media (pointer:
  coarse)` rather than a width breakpoint — a tablet at 900px is still a finger.
- Grow the *hit area*, not the ornament, when the visual size is deliberate: the
  17px `?` explainer keeps its size and gains a transparent 30×44 `::after`.
  Keep that box narrower than the neighbouring gap so it cannot swallow a tap
  meant for the label beside it.
- **Floating layers expand inline on phones.** A popover anchored to a small
  control near the right edge has nowhere to flip on a 320px viewport, and one
  tall enough to matter covers the controls it is explaining. Below 680px the
  help panel joins the label row's flex flow (`display: contents` on the wrapper,
  `flex-basis: 100%` on the panel) and pushes content down. It must be
  `display: none` when closed — `visibility: hidden` still reserves flow space.
- Anything that opens on tap needs a way out that is not the same small button:
  outside-pointer and Escape, since touch has no hover to fall back on.

## State inventory

Every one is a designed surface, keyed to the guard verdicts in
`lib/guard/policy.ts` and the streaming route:

| State | Trigger | Treatment |
|---|---|---|
| Streaming / thinking | live analysis | adaptive-thinking summaries stream as a mono log with an accent caret |
| Loading | pre-stream | shimmer skeleton blocks |
| Empty | first run / no audits | invitation + "Try sample data" (accent button) |
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
