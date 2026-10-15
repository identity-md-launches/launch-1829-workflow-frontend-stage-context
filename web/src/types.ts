import type { Abi, Address, Hex } from 'viem';
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}
export interface Deployment {
  version: 1;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  poolKey: PoolKey;
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
      extendedSwapParams?: boolean;
    };
    pairToken: {
      address: Address;
      symbol: string;
      name: string;
      decimals: number;
    };
    otherPairTokens?: {
      address: Address;
      symbol: string;
      name: string;
      decimals: number;
    }[];
  };
  walletAddChain?: {
    chainId: Hex;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
}
export interface Batch {
  id: bigint;
  firstAttemptId: bigint;
  firstNonce: bigint;
  openedAt: bigint;
  closedAt: bigint;
  rollBlock: bigint;
  size: number;
  status: number;
  missedWindows: number;
  lastPlayer: Address;
  prevrandao: bigint;
  scores: bigint;
  seed: Hex;
}
export interface Entry {
  id: bigint;
  player: Address;
  batchId: bigint;
  message: string;
  score?: number;
  tier?: number;
  tokens?: bigint;
  eth?: bigint;
  refunded?: boolean;
}
export interface ChainState {
  block: bigint;
  timestamp: number;
  fetchedAt: number;
  verified: boolean;
  free: bigint;
  vaultBalance: bigint;
  jackpot: bigint;
  attempts: bigint;
  oracleImd: bigint;
  bountyBudget: bigint;
  price: bigint;
  openBatchId: bigint;
  nextToClose: bigint;
  batch: Batch;
  imd: Address;
  intake: Address;
  imdDecimals: number;
  tokenDecimals: number;
  oracleFee: bigint;
  intakeAllowance: bigint;
  bounty: bigint;
  window: number;
  timeout: number;
  maxBatch: number;
  cooldown: number;
}
export interface WalletState {
  address: Address;
  cooldownUntil: number;
  tokens: bigint;
  eth: bigint;
  ethBalance: bigint;
  begBalance: bigint;
  imdBalance: bigint;
  imdAllowance: bigint;
}
export type ContractRef = { address: Address; abi: Abi };
