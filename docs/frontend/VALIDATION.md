# Frontend validation

Scope: the frontend worker stage for **Beg the Swarm / imd-beg**, Ethereum chain 1. Source is under `web/`; the committed static export is under `dist/`. Deployed contract source, root build configuration, original ABI exports and existing contract documentation were preserved.

This is worker-produced evidence, not an independent certification. No real transaction was signed or broadcast. Publication, IPFS naming and the control-plane HTTP/RPC checks occur after this delivery.

## Requirements and implementation

| Approved requirement | Result and evidence |
| --- | --- |
| Dark, playful page; gold `#FFC83D`, violet `#8B7BFF`, red Nothing tier | Implemented semantic tokens, dot eye, outcome rows; `web/src/styles.css`, `Eye.tsx` |
| “Beg the Swarm.” and specified subline | Present verbatim; mobile main action above the fold |
| Live UTF-8 counter, exact price, cooldown/duplicate/chain/length prechecks | Beg form and fresh read/simulation; unit and browser cases |
| “Vault opening soon” while unfunded | Main action disabled; browser case with zero vault balance |
| Human explanation for every custom error | Unit test enumerates both implementation ABIs against `ERRORS` |
| Free vault, ETH jackpot, attempts, batch fill/countdown, IMD budget | Live runtime reads verified against Ethereum; separate ETH bounty budget also shown |
| Score 0–100 odds slider, all five tiers and prizes | Native keyboard slider; every integer score checked against contract formulas |
| Public plain-text lifecycle feed | Escaped React text; event-based waiting/judging/graded/rolled/expired states, scores and historical awards |
| Hall of fame | Top three indexed scores and recent jackpot winners; partial sync is disclosed |
| My attempts, current credits, Claim and Refund | Address-filtered history, aggregate on-chain credits; separate refund/claim browser test |
| Close, Reveal with bounty, Expire only when valid | Boundary tests, selected-batch reads and fresh simulation; rearm consequences are explicit |
| Approve IMD, then fund, default 0.5 IMD | Separate exact-amount approval and funding transactions; tested with mocks |
| Other primary deployed actions | Both close overloads; payable ETH bounty funding; BEG transfer to vault; allowance activation for direct IMD donations |
| Five short rule steps | Entry, grading, reveal, claim and refund timing; actual ETH split and immutable behavior |
| RPC fallback, four-second timeouts, immediate cache, 15-second refresh | Config/data modules; cache/reload/failure regression; stale data cannot enable signing |
| Chunked events from deployment | Handoff-derived block 26196859; adaptive ranges down to one block; live and constrained-provider tests |
| EIP-6963, phone wallet browsers, Coinbase Smart Wallet | One picker; named extensions; four phone links; Coinbase SDK. Actual native-app/passkey handoff remains untested |
| Missing-chain addition after switch failure | Exact supplied add-chain object tested after error 4902, followed by another switch |
| ETH/BEG swap, quotes, approvals and observability | Live read-only quote; mock buys/sells; configured router/Permit2 addresses and exact pool key decoded in tests |
| Runtime manifest and implementation-derived ABIs | App loads `imd-deployment.json` and referenced JSON; canonical ABI hashes checked at build/runtime |
| Every exported asset hashed | `npm --prefix web run verify` compares the complete inventory and final SHA-256 bytes |
| Relative static export and metadata | `/preview/` browser validation; local favicon/fonts/share image; title, description and OG metadata |
| Footer X, contract and repository | Given X URL, explorer from runtime network, repository URL from handoff-derived provenance |
| Design documentation | `docs/DESIGN.md`, inside the explicit allowed scope; root placement was superseded by the path restriction |

No owner setup panel is needed: the deployed vault has no owner, admin or configuration setters. Restricted oracle callback/attestation functions are not exposed as visitor actions. The frontend follows the deployed request schema; the original contract documentation explains why the workflow summary's `toleranceBps: 1000` is not a deployed field.

## Build and automated evidence

Commands were run from the repository root unless noted:

| Command | Evidence |
| --- | --- |
| `npm ci --prefix web` | Passed clean install; audit reported zero vulnerabilities; rebuilt export was byte-identical to the browser-tested export. [Build evidence](build-results.json) |
| `npm --prefix web run typecheck` | TypeScript strict check |
| `npm --prefix web test` | 11 logic tests: UTF-8/escape limits, exact amount precision, all odds, keeper boundaries, complete error mappings, router tuples, chain addition, wallet rejection, mobile links and event projection |
| `npm --prefix web run build` | Vite production build, preceded by pinned ABI verification and followed by manifest generation |
| `npm --prefix web run verify` | Exact handoff identifiers/contract set/network/pool key, both canonical Keccak ABI hashes, every exported SHA-256 |
| `npm --prefix web run test:browser` | 22/22 scenarios passed; final individual outcomes in [browser-results.json](browser-results.json); mocked wallet/RPC responses, no real funds |
| Pinned `taste.mjs --out test/scratch/taste --offline` | [taste.json](taste.json); 16 checks covering the final export and offline/error state |
| Read-only contract audit | [live-chain.json](live-chain.json): chain ID, both contract code sizes, metadata, vault reads and Uniswap code |
| Read-only production-browser audit | [live-browser.json](live-browser.json): actual contract state, event sync, quote, resource/script checks and measured responsive bounds |

The design probe also notes seven inline links below its comfortable 44px target size; each passes its minimum-size/spacing check. Primary actions and form controls are at least 44px.

The browser suite serves the final static bytes under `/preview/`. Chromium covers primary entry and transaction states, duplicate/cooldown/unfunded gates, rejection/revert handling, separate funding approvals, refund then claim, keeper eligibility, both swap directions, stale quotes, RPC failure/cache reload, adaptive event ranges, wallet-sheet focus, keyboard entry, large values and text enlargement. WebKit covers the primary connect/submit flow. Runtime libraries needed for WebKit were installed in temporary storage; no browser or OS dependency archive is included in the submission.

The live audit used the assignment's authorized provider routing. Public sources recorded in evidence are `https://ethereum-rpc.publicnode.com` and `https://eth.drpc.org`, as supplied in the network input. No machine-private RPC address is embedded in source, export or reports. The audit observed a funded vault, 0.5 IMD oracle budget and a successful native-ETH quote for this exact pool. Values and block numbers are observations at the report timestamp, not promises of future state.

## Better Interface review

One visual idea: a compact on-chain begging game watched by a violet eye made of dots, with gold reserved for the plea and possible jackpot.

| Domain | Coverage | Evidence / limitation |
| --- | --- | --- |
| Accessibility | Checked | Native controls/labels, skip link, keyboard slider, native modal containment and Escape/focus return, disabled reasons, live transaction feedback, reduced-motion CSS. axe has zero automated violations; see its explicit manual items in [accessibility.json](accessibility.json). No full screen-reader session or physical-device assistive technology test. |
| Layout | Checked | Production renders at 320, 390, 768, 1440; long balance/address stress; the action stays within the first 390×844 viewport; no horizontal overflow. Text enlargement is distinct from native browser zoom. |
| Writing | Checked | Exact requested headline/subline; action verbs; plain errors; public/permanent message and irreversible donation disclosures; refunds distinguished from withdrawal; indexed-history limits visible. |
| Typography | Checked | Locally loaded font; six-size maximum scale, three weights; headline heaviest; 16px inputs; tabular figures; long addresses/amounts wrap. |
| Colors | Checked | Required palette retained; measured solid pairs in [contrast.json](contrast.json); rendered text probe passes. Gold's dual action/jackpot role follows the brief. Decorative hidden glyph is not meaningful text. |
| UI | Checked | Hover/focus/pressed/disabled and action-specific pending/success/error states, empty history, stale data, modal transitions, short dot-eye pulse, no nested cards or `transition: all`. Native app handoff and slow-motion animation-panel playback were not tested. |

Representative screenshots:

- [Live 390px](screenshots/live-390.png) and [live 1440px](screenshots/live-1440.png): real read-only chain state.
- [Fixture 390px](screenshots/390.png) and [fixture 1440px](screenshots/1440.png): deterministic validation state, not live balances.
- [Mobile wallet sheet](screenshots/wallet-390.png): mobile links and Coinbase Smart Wallet row.
- [Keyboard focus](screenshots/keyboard-focus.png) and [WebKit primary flow](screenshots/webkit-390.png): interaction evidence.

## Findings, fixes and rechecks

| Severity / domain | Source and observed problem | Fix and verification |
| --- | --- | --- |
| High / layout | `web/src/styles.css:899`, mobile `.swarm-eye` initially used 130% width; probe measured a 392px page in a 390px viewport | Restrict the SVG to its grid width. Rechecked 320/390/1440 probe and long-value scenarios; no overflow. |
| Medium / writing | `web/src/App.tsx:315`, repeated short slogan fragments; initial probe counted five two-beat lines | Use one normal phrase by the field, shorten the fame empty state, and use data separators in trade metadata. Final slogan check passes. |
| High / behavior | `web/src/data.ts:90`, small ABI integers decoded as JavaScript numbers but used with bigint arithmetic | Normalize numeric counters to bigint. Runtime snapshot and actual browser chain reads pass. |
| High / behavior | `web/src/Wallet.tsx:144`, reload briefly exposed a hydrated connector without `getProvider`; offline reload blanked the page | Wait for a connected, callable provider; keep signing gated during reconnection. Cached-state reload regression passes. |
| Medium / observability | `web/src/data.ts:364`, a provider rejected log ranges above ten blocks; initial minimum chunk was too large | Shrink down to one block, remember the working size, and continue catch-up on a 15-second timer even when the head block is unchanged. Live history and constrained-provider regression pass. |
| Medium / transaction UI | `web/src/Swap.tsx:81`, asynchronous allowance/quote replies could arrive after direction or input changed | Generation counters discard old replies; quote validity binds to amount, slippage, direction and wallet. Expiry prevents stale signing. |
| Medium / accessibility | `web/src/Swap.tsx`, labeled trade-selector `div` had no group role | Add native group semantics with `role="group"`; recheck with axe. |
| Medium / layout | `web/src/styles.css:651`, the fixed-ratio slippage column overflowed by 3px at 390px with 200% text | Use an auto-fitting grid with a font-relative minimum; fields stack at enlarged text sizes. Reflow and reduced-motion regression pass. |
| Medium / numerical display | `web/src/domain.ts:37`, large integer formatting passed through `Number` | Use bigint formatting; exact base-unit conversions in irreversible-action reviews. Dedicated large/tiny-amount regression passes. |

These source locations refer to the final formatted implementation. Findings describe defects observed during this worker pass; all applicable fixes are included in the final export.

## Packaging and Git status

The source, lockfile, export and evidence are present within the allowed paths. The attempted `git add` failed with `Unable to create .git/index.lock: Read-only file system`; this worker therefore could not create a commit. Creating a Git bundle also failed because partial-clone history needs objects fetched into the read-only object store. No protected tracked file changed. The submitting system must stage/commit these files and check its final bundle size. [Packaging evidence](package-report.json) records the path audit and complete working-tree payload size, which is below 8 MiB. Caches and installed dependencies are excluded.

## Limitations and completion boundary

- No mainnet entry, approval, swap, donation, refund or claim was broadcast. Mock receipt tests establish frontend control flow, not future transaction success, oracle availability or economic fairness.
- Block-based randomness, keeper timing, irreversible donations and immutable protocol dependencies retain the deployed contract's risks; no economic rules were changed.
- Historical prizes remain distinct from current claimable credit. Indexing has a twelve-block reorganization rewind, partial catch-up labeling and browser-storage capacity limits. A deeper reorganization requires clearing the cached history.
- Physical MetaMask/Coinbase/Rabby/Phantom app launching, Coinbase passkey enrollment, ENS reverse naming, screen-reader sessions, browser-native zoom, RTL localization and forced-colors rendering were not certified. Full checksummed addresses, copy controls and explorer links are available without ENS.
- The Open Graph image is local and relative because the final public gateway/name is assigned later. Social unfurling against that future URL is a publisher-stage check.
- The pinned design probe was run offline to inspect failure-state rendering; its recorded external host names are attempted RPC destinations, not proof of network access. Live behavior has separate read-only evidence.
- The root design-document requirement conflicts with the stricter explicit path budget; the complete document is provided at `docs/DESIGN.md`.

Implementation and local validation are complete; Git staging remains blocked by the read-only repository metadata. Validation results: clean dependency installation, typecheck, 11 logic tests, 22 browser scenarios, all 16 pinned design checks, read-only chain/browser checks and final manifest verification passed. The export contains 17 assets (896,168 bytes before the manifest). Publication URLs and CIDs are not worker deliverables; publication verification remains separate.
