# Beg the Swarm frontend

A static React + TypeScript app for the deployed BEG token, BegVault and attested ETH/BEG Uniswap v4 pool on Ethereum. The production files are delivered in **`../dist/`**. The page works at `/` or a gateway subpath without a backend or routing rewrites. Contract source and root build configuration are unchanged.

## Install, build and preview

Node 24 and npm 11 were used. Install from the committed lockfile:

```sh
npm ci --prefix web
npm --prefix web run typecheck
npm --prefix web test
npm --prefix web run build
npm --prefix web run verify
npm --prefix web run preview -- --port 4173
```

For development: `npm --prefix web run dev`. The checked-in `web/public/` deployment inputs support development; `build` regenerates them. The preview serves the already built production export. The export includes its fonts, wallet marks, favicon and PNG share card locally.

`build` runs three stages: verify and extract pinned ABIs; Vite export with `base: './'`; inventory all final files into `dist/imd-deployment.json`. Always run the entire build after a source or public-asset change. Do not edit exported files independently. `verify` checks the exact handoff, network, pool key, canonical Keccak ABI hashes and every asset SHA-256, including `index.html`. The manifest excludes itself.

The ABI extraction requires the deployed source commit to exist in the repository's Git history. It reads `docs/abi/<Contract>.json` from that exact commit using `git show`; it does not compile or modify Solidity. A source checkout without that commit cannot silently substitute a different ABI.

## Configuration and provenance

`config/deployment.json` and `config/network.json` are preserved build inputs from the supplied handoff. `src/config.ts` does not contain a second address map: the running app fetches **the exported `imd-deployment.json`** and each contract's referenced ABI, verifies each ABI's canonical Keccak hash, and constructs its chain and RPC transports from that manifest. Uniswap quoter, router, Permit2 and the entire pool key come from the same runtime object.

The only supplemental runtime file, `provenance.json`, is generated from the handoff's deployment block and repository URL. It contains no contract addresses, ABI map, chain ID or RPC settings, and is covered by the manifest asset inventory. The source commit and attestation identifiers stay in the deployment manifest.

The network and optional add-chain blocks are copied unchanged. No keys, private RPC URLs, WalletConnect project ID or relay service are required. Browser wallets use wagmi's EIP-6963 discovery; mobile links open this page in a wallet browser; Coinbase's SDK provides Coinbase Wallet/Smart Wallet. A missing chain triggers the supplied `wallet_addEthereumChain` parameters after switch error 4902, then switches again.

## Runtime behavior

- Public RPCs are tried in their configured order with a four-second timeout per transport. A connected wallet's RPC is the final fallback, also time bounded and checked for the required chain. Signing always belongs to the visitor's wallet.
- Live reads verify chain ID, nonempty application contract code and the vault's token bindings. State refreshes every 15 seconds. Cached state renders immediately but cannot enable writes until a successful live refresh. Read failures or state older than 45 seconds disable actions.
- BEG and IMD decimals come from their contracts. No USD conversion is invented; the UI reports that USD pricing is unavailable.
- Before entering, the page checks UTF-8 byte length, escaped-message length, exact-message duplication, cooldown, vault funding, chain and balance. The twentieth entry also checks oracle funds and Intake allowance. A fresh simulation remains the final eligibility check.
- Each transaction has its own status. Controls lock during simulation, review, wallet signing and receipt confirmation. Review shows the expected action, exact contract, payment, gas estimate and network. Confirmation rechecks account/chain, prerequisites and simulation. Receipt failure or timeout keeps an explorer link visible; check it before retrying.
- The message index starts at the actual deployment block, reads bounded chunks, and shrinks the range on provider errors down to one block. Up to 20 successful chunks are processed per refresh; catch-up progress is displayed. Every refresh rewinds twelve blocks and replaces the recent log suffix for short reorganizations. Full message text comes from events, including after the contract stops returning closed messages.
- History and public state are cached per launch in local storage. A storage quota failure only disables persistence; reads continue. Feed pagination and the top-three score/jackpot lists use indexed chain events, never seeded messages. Partial history is labeled. A deep reorganization beyond twelve blocks or a previously corrupted cache requires clearing site storage and reindexing.

## Actions and accounting

| Control | Contract action |
| --- | --- |
| Beg | `BegVault.attempt(string)`, exact live entry price |
| Close batch / Close oldest batch | Both `closeBatch(uint256)` and `closeBatch()` overloads |
| Reveal / Rearm reveal | `reveal(uint256)`; missed windows disclose tier forfeiture and no rearm bounty |
| Expire | `expireBatch(uint256)` when the open/pending deadline is reached |
| Refund entry, then Claim | `refund(uint256)` creates credit; `claim()` withdraws aggregate credits |
| Approve IMD, then Fund oracle | Exact IMD approval to BegVault, then `fundOracle(uint256)` |
| Activate oracle allowance | `fundOracle(0)` if direct IMD funding lacks the immutable Intake allowance |
| Donate bounty ETH | The payable, zero-argument `fundOracle()` overload |
| Donate BEG | Token `transfer` to the deployed vault |
| Buy / Sell BEG | Read-only Quoter simulation, required Permit2 approvals, Universal Router simulation and `execute` |

All donations are permanent. The IMD fee budget and ETH revealer budget are different ledgers. Historical awards in the feed are never presented as currently claimable; current credit is read from `claimable(address)`. The oracle callback is restricted to Intake and has no visitor control. There are no owner settings to configure.

Swaps use exact input, 0.5% default slippage (editable from 0.1–5%), a 60-second quote lifetime and a 20-minute execution deadline. Native ETH input needs no approval. ERC-20 input requires exact approval to Permit2 and a separate amount-limited, 30-minute Permit2 approval to the configured Universal Router. The router payload uses `0x10` and `0x060c0f`, preserving the complete attested pool key. The optional six-field swap tuple is selected only by the network's `extendedSwapParams` flag. Both directions and tuple formats have encoding tests.

## Validation

```sh
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run verify
npm --prefix web run test:browser
```

Browser tests require Playwright Chromium and WebKit, plus their OS libraries. Install browser runtimes outside the submitted source (for example with `PLAYWRIGHT_BROWSERS_PATH` pointing to a temporary directory). The suite owns a bounded local server, uses the final export under `/preview/`, mocks wallets and RPC responses, never signs real transactions, and writes evidence under `docs/frontend/`.

Optional read-only checks accept an authorized RPC endpoint as a command argument. It is not embedded in the app or recorded in the reports:

```sh
node web/scripts/live-check.mjs '<authorized RPC URL>'
web/node_modules/.bin/tsx web/scripts/check-state.ts '<authorized RPC URL>'
node web/tests/live-browser.mjs '<authorized RPC URL>'
```

The assigned design probe is run from the repository root while its pinned input is present:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
  node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste --offline
```

Its `--offline` mode tests static rendering and failure states, not live RPC availability. The separate live-browser check verifies actual chain reads and quoting. See [validation evidence](../docs/frontend/VALIDATION.md), [design system](../docs/DESIGN.md) and [third-party notices](../docs/frontend/THIRD_PARTY.md).

## Delivery boundaries

The stricter assignment allows writes only in `web/`, `dist/`, and `docs/`, with an explicit `web/.gitignore` budget. The requested root design document is therefore delivered as **`docs/DESIGN.md`**. No other ignore file, root build configuration or deployed contract source was changed. `web/.gitignore` excludes dependency/cache directories at every nested level; no dependencies or registry archives are vendored.

Physical wallet-app launches, real Coinbase passkey enrollment, real transactions, real oracle delivery, full screen-reader sessions and native browser zoom are not certified by these checks. Published URLs, IPFS pinning and named-site checks belong to the subsequent publisher stage. Relative Open Graph paths must be resolved by the final hosting gateway; no live URL is fabricated.
