# Sources and notices

The application implements the supplied workflow using the implementation-derived contract ABIs at deployed commit `ce23afeb19cb46efb8fde307d25cebb59801e74b`. The pinned contract documentation remains in `docs/abi/README.md`; it governs contract behavior, including the documented difference between the workflow's tolerance summary and the deployed oracle request schema.

Design work and review used the pinned Better Interface guide from Jakub Krehel, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT), and its documentation adaptation from Paul Bakaus's Impeccable, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0). Both license texts are retained in [better-interface.txt](licenses/better-interface.txt). Sources: [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), [Impeccable document method](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md).

The pinned eth-frontend-ux guidance is adapted from Austin Griffith's ethskills commit `06ea4efa08076ff04f6ca4945ef4a2ca881115b0` (MIT). Its [license](licenses/eth-frontend-ux.txt) is retained. The assignment's dark theme, public network configuration, 15-second refresh and unavailable USD price source take precedence over generic guide defaults.

MetaMask, Rabby and Phantom SVG marks were extracted from `@rainbow-me/rainbowkit` 2.2.11, retaining their official colors. [RainbowKit's MIT license](licenses/rainbowkit.txt) is included. The Coinbase mark came from the pinned wallet-connectors reference. Wallet marks identify their respective wallet products; no affiliation is implied. Space Grotesk is bundled via `@fontsource-variable/space-grotesk` 5.3.0 under the [SIL Open Font License](licenses/space-grotesk.txt).

The eye, favicon and share-card composition are generated locally as SVG/HTML/CSS. `web/scripts/social.mjs` renders the PNG with Playwright; no external image service or image dependency is needed at runtime.

Rabby's mobile link uses `_cmd=open-dapp&dapp=` based on its [native universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts) and [production prefix configuration](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/constant/universalLink.ts), inspected on 2026-10-15. The other wallet-browser links follow the pinned connector reference. Physical app handoff remains untested.

Router error signatures were checked against Uniswap's primary [Universal Router interface](https://github.com/Uniswap/universal-router/blob/main/contracts/interfaces/IUniversalRouter.sol) and [V4 Router interface](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Router.sol). Swap tuple selection follows the supplied network configuration, not the latest upstream tuple by assumption.

Runtime packages and exact transitive versions are fixed in `web/package-lock.json`. Key versions used: React 19.3.1, Vite 8.3.4, TypeScript 5.9.3, wagmi 3.7.7, viem 2.57.7, Coinbase Wallet SDK 4.4.0. Their package license records remain available through the lockfile's packages and installed distributions; no dependency cache is included in the submission.
