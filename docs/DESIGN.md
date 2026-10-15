# Beg the Swarm design system

## Overview

An Ethereum begging game with a near-black canvas, gold actions and jackpot values, and a violet eye built from tiny dots. The compact opening puts the connected-wallet control, live entry price, vault status and plea form before the supporting material. The eye is the single decorative motif; it pulses once when the observed attempt count rises.

The design is intentionally dark-only, as requested. Shared source: `web/src/styles.css`. Application composition: `web/src/App.tsx`. There is no separate theme or component-library dependency.

This document is delivered under `docs/` because the assignment's explicit write budget excludes repository-root `DESIGN.md`.

## Colors

Hex tokens live at the start of `web/src/styles.css`.

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#0c0b10` | Page background and text on gold actions |
| `--surface` | `#17151e` | Beg form, dialogs, secondary buttons |
| `--field` | `#100f16` | Text entry and wallet rows |
| `--hover` | `#24212e` | Hover and selected secondary surfaces |
| `--line` | `#35313f` | Dividers and structural borders |
| `--text` | `#f4f1fa` | Primary text |
| `--muted` | `#b3aebf` | Explanations, captions, labels |
| `--gold` | `#ffc83d` | Main action, jackpot, warning text, focus ring |
| `--gold-hover` | `#ffda7d` | Primary button hover |
| `--violet` | `#8b7bff` | Swarm eye and selected trade outline |
| `--violet-text` | `#b0a5ff` | Swarm labels and Epic tier text |
| `--red` | `#ff8b96` | Nothing tier and errors |
| `--green` | `#a5deb5` | Confirmed status and live dot |

The brief deliberately assigns gold to both the primary action and jackpot. Text labels distinguish states; color is never the only status signal. Field placeholders use `#938b9f`; the Rare tier uses `#c8c2e3`.

Measured solid-token contrasts include 16.18:1 for primary text on the surface, 8.36:1 for muted text on the surface, 8.07:1 for error text on the surface, 5.84:1 for placeholders on fields, and 12.68:1 for dark text on gold. Full calculations are in `docs/frontend/contrast.json`; rendered text was separately checked by the design probe and axe. Decorative eye dots are not text.

## Typography

Space Grotesk Variable, with a `sans-serif` fallback, is bundled locally from `@fontsource-variable/space-grotesk`. It supplies the three weights used: 400 body, 500 labels/section headings, 700 main headline/wordmark. No synthetic weight is requested. There is one font family and no monospace prose.

| Token | Size | Use |
| --- | --- | --- |
| `--sm` | 0.875rem / 14px | Captions, status, compact data |
| `--body` | 1rem / 16px | Body, buttons and inputs |
| `--sub` | 1.25rem / 20px | Subheadings and desktop introduction |
| `--title` | 1.5rem / 24px | Section headings |
| `--large` | 2.25rem / 36px | Mobile headline, jackpot, occasional section heading |
| `--display` | 4rem / 64px | Desktop headline |

Body line-height is 1.5; messages and longer rules use 1.6. Main headline line-height is 1.02 desktop and 1.05 at smaller widths. Display tracking is −0.055em, mobile −0.045em; small headings use −0.02 to −0.025em. Body copy uses natural tracking and case. `text-wrap: balance` applies to headings. Paragraphs cap at 70ch. Changing balances, countdowns, counters and prices use tabular numerals.

Text fields stay at the 16px body size at normal browser settings. Addresses and long values wrap; the account dialog exposes the full checksummed address. The header's short address opens that dialog rather than hiding the full value permanently.

## Layout

`.site-shell` is a centered 1200px maximum-width container with 40px horizontal padding, then 24px at 900px, 20px at 680px and 16px at 360px. Spacing mostly follows 4/8/12/16/20/24/28/32/40/64px steps. Sections use space and a single divider; they are not nested cards.

Desktop uses `.play-grid` and `.content-grid` with `minmax(0, …)` columns. The form and feed lead; live stats and keeper/trade tools sit alongside. The odds comparison has a shared three-column row layout. The rules collapse from three columns to two at 900px and one at 680px.

At 680px, all primary content becomes one column, header navigation hides, and the wallet remains in the header. The eye sits beside the title without overflowing its grid column. At 360px the form title and price stack, and the trade inputs stack. Trade fields also stack whenever enlarged text makes their 10rem minimum width unavailable. Controls remain inset from the viewport edges. At 390×844 the Beg button is on the first screen; rendered reflow was checked at 320, 390, 768 and 1440 widths, including long balances and a full address dialog.

## Elevation & Depth

The interface uses tonal layers and borders, without card shadows. The eye alone uses a violet SVG drop-shadow. Dialogs use a dark native backdrop (`#000a`) and one bordered surface. No fixed or sticky action covers page text. The skip link is fixed only while focused.

## Shapes

Inputs and ordinary buttons use 8px radii. The desktop beg container and dialog use 16px; the mobile beg container uses 14px. The dot is circular. Long user messages remain unclipped and selectable. SVG art does not carry critical text.

## Components

| Component / source | Use and behavior |
| --- | --- |
| `Wallet`, `Modal` in `web/src/Wallet.tsx` | One header connection control; EIP-6963 names/icons, mobile wallet links, Coinbase. Native modal focus containment, Escape/backdrop/Close dismissal and focus restoration. Becomes an address menu or a switch-network control. |
| Beg form in `web/src/App.tsx` | Visible label, UTF-8 counter, inline eligibility hint, full-width gold action. Disabled with a stated reason when prerequisites fail. |
| `Eye` in `web/src/Eye.tsx` | Deterministic SVG dot positions, decorative/aria-hidden, 900ms one-shot pulse on a new attempt. |
| `Message` in `web/src/App.tsx` | Plain-text blockquote, state name, score, historical prize, explorer link and optional refund action. Direction follows message text. Never render HTML from the chain. |
| `.odds-row` in `web/src/styles.css` | Fixed comparison structure: outcome, chance, estimated BEG. Outcome and chance are explicit text. Slider is native and keyboard operable. |
| `useTransactions`, `TxFeedback` in `web/src/transactions.tsx` | Independent per-action states for checking, review, wallet, confirmation, success and error. A shared write lock prevents overlapping submissions. Review exposes payment, estimated gas, network and full contract. Feedback remains near the initiating control with an explorer link. |
| `Keepers` in `web/src/Keepers.tsx` | Current batch eligibility, explicit batch input, close/reveal/expire actions. Native `details` groups distinguish IMD oracle funding from optional ETH/BEG donations. |
| `Swap` in `web/src/Swap.tsx` | Buy/sell toggle with `aria-pressed`, labeled amount/slippage fields, expiring quote, expected/minimum output and rate. Approval and execution appear as ordered steps. |

Buttons have rest, hover, pressed, focus, disabled and pending labels. Interactive transitions name only the changing properties and last 120ms. Press feedback scales to 0.96. Focus uses a 2px gold outline with 4px offset. `prefers-reduced-motion` disables the pulse, transitions, smooth scrolling and press transform. Forced colors restores system focus and button boundaries.

## Do's and Don'ts

- Start a new section with `.section` and a normal-case heading; keep the main action above supplementary explanations.
- Reuse the six type tokens and three weights. Keep the main headline the heaviest type.
- Use `.primary` for the immediate main action or a confirmation inside its modal; keep parallel secondary actions neutral.
- Keep errors specific and next to their control. Preserve action-specific pending states through receipt confirmation and state refresh.
- Reuse the address wrapping and modal patterns. Do not clip financial amounts, messages or full contract addresses to force a layout fit.
- Extend the existing grid and spacing system, rather than introducing another card hierarchy, accent palette or font.
- Keep animation decorative and brief. Every state change must remain understandable with reduced motion.

For another page, reuse the shell, header wallet, section spacing, native form labels and transaction review; expose it through a hash destination or explicitly exported static entry. Deployment addresses and ABI references continue to come from the runtime manifest.
