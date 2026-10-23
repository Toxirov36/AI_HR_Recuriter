# Shortlist Design Language

Extracted from the reference "Sales Report" dashboard (one deep forest green on a warm grey ground, white rounded bento cards, pill deltas). It governs the whole product: the app, the sign-in page and the landing page.

## Visual Theme

Calm, rounded, green-led. A large white shell sits on a warm grey ground; inside it a sidebar and a bento grid of flat white cards. One deep forest green carries the emphasis, one bright green marks growth, red marks decline and nothing else. No gradients, no resting shadows: separation comes from tone (white on grey) and from radius.

## Color Palette

| Token | Light | Dark | Role |
|-------|-------|------|------|
| `--ground` | `#dedbd8` | `#0b120f` | Page background behind the shell |
| `--shell` | `#f7f6f4` | `#111a15` | The large rounded frame |
| `--card` | `#ffffff` | `#18231d` | Every card and panel |
| `--ink` | `#101814` | `#e8efea` | Text, figures |
| `--muted` | `#6a7570` | `#9aaaa2` | Secondary text, captions |
| `--line` | `#e6e4e1` | `#26352d` | Inputs and rare dividers |
| `--brand` | `#0b4a2e` | `#1f7a4d` | Filled card, active nav, primary button |
| `--brand-ink` | `#ffffff` | `#ffffff` | Text on `--brand` |
| `--brand-bright` | `#1fbf5b` | `#37d374` | Chart bars, bright accents |
| `--brand-soft` | `#9ad9b0` | `#2c6b4a` | Second chart tone, soft fills |
| `--up` | `#2bd45a` | `#2bd45a` | Positive delta pill (ink text) |
| `--down` | `#e53935` | `#ef5350` | Negative delta pill (white text) |
| `--promo` | `#0f1613` | `#050806` | The dark promo block in the sidebar |

## Typography

One geometric sans (Onest), weights 400 / 500 / 600 / 700. Display figures and page titles are 700.

| Role | Size | Weight |
|------|------|--------|
| Page title | 24–28 | 700 |
| Card figure | 32–40 | 700 |
| Card title | 17–20 | 600 |
| Label / nav | 14–15 | 500 |
| Caption | 12–13 | 400 |

## Components

| Component | Purpose | Variants |
|-----------|---------|----------|
| Shell | Rounded outer frame on the grey ground | light, dark |
| Sidebar | Logo, grouped nav (menu / financial / tools), promo block | active = `--brand` pill |
| Stat card | Icon disc, delta pill, figure, caption | filled (`--brand`) and plain; one filled card per view |
| Delta pill | `+20.9%` change | up (bright green), down (red) |
| Chart card | Title, subtitle, period select, legend, chart | bars, pie, bubbles |
| Period select | "This year", "Today" | pill with chevron |
| Progress row | Label, value, thin bar | per category |
| Button | Primary action | primary (`--brand`), ghost, promo (dark) |
| Input | Form field | filled, no border, focus ring in `--brand` |

## Layout

Outer shell radius 28px, cards 22px, controls 12px, pills 999px. Gap between cards 16–20px. Base unit 4px, steps 4 / 8 / 12 / 16 / 24 / 32. The shell keeps a 12–16px margin on the grey ground. Bento grid of 12 columns; the hero card is filled with `--brand`.

## Depth

Flat. Cards are white on grey with no border and no shadow. Only floating layers (menus, dialogs, toasts) carry a soft shadow.

## Do's and Don'ts

### Do
- One filled `--brand` card per view; everything else white.
- Show change as a pill (green up, red down).
- Use the radius tokens (12 / 22 / 28 / pill).
- Keep charts to the two greens; red only for decline.
- Keep figures large and captions small.

### Don't
- Add borders or resting shadows to cards.
- Use gradients, glows or a second accent hue.
- Use more than two greens in one chart.
- Use raw hex values in components; reference tokens.
- Mix square and round corners in one view.

## Responsive

Sidebar collapses to a top bar below 1000px. The bento grid goes 12 → 2 → 1 columns. The shell margin shrinks to 0 on phones and the shell becomes full-bleed.

## Agent Prompt Guide

- Always reference the tokens above; never hard-code a color, radius or space.
- A view has at most one filled `--brand` card.
- Deltas are always pills; positive uses `--up`, negative uses `--down`.
- Cards are flat: no border, no resting shadow.
- Tap targets are at least 44px; charts never rely on color alone.
