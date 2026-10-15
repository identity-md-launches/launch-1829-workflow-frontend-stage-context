import { createConfig, http, fallback, custom } from 'wagmi';
import { injected, coinbaseWallet } from '@wagmi/connectors';
import {
  createPublicClient,
  defineChain,
  keccak256,
  toBytes,
  isAddress,
  type Abi,
  type EIP1193Provider,
} from 'viem';
import type { Deployment, ContractRef } from './types';

export const canonical = (v: unknown): string => JSON.stringify(sort(v));
function sort(v: unknown): unknown {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
        )
      : v;
}
async function jsonFile(path: string) {
  if (path.includes('..') || path.startsWith('/') || path.includes(':'))
    throw new Error('Unsafe configuration path.');
  const r = await fetch(new URL(path, document.baseURI), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Unable to load ${path}. Reload to retry.`);
  return r.json();
}
export async function loadRuntime() {
  const deployment = (await jsonFile('imd-deployment.json')) as Deployment;
  if (
    deployment.version !== 1 ||
    deployment.network?.chainId !== deployment.chainId ||
    !deployment.poolKey
  )
    throw new Error('Deployment configuration is invalid.');
  const refs: Record<string, ContractRef> = {};
  for (const c of deployment.contracts) {
    const abi = (await jsonFile(c.abiPath)) as Abi;
    if (
      !isAddress(c.address) ||
      !Array.isArray(abi) ||
      keccak256(toBytes(canonical(abi))).slice(2) !== c.abiHash
    )
      throw new Error(`${c.name} ABI verification failed.`);
    refs[c.name] = { address: c.address, abi };
  }
  if (!refs.BegVault || !refs.LaunchToken)
    throw new Error('Application contracts are missing.');
  const provenance = (await jsonFile('provenance.json')) as {
    deploymentBlock: number;
    repoUrl: string;
  };
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.network.name,
    nativeCurrency: deployment.network.nativeCurrency,
    rpcUrls: { default: { http: deployment.network.rpcUrls } },
    blockExplorers: {
      default: { name: 'Explorer', url: deployment.network.explorer },
    },
    testnet: deployment.network.testnet,
  });
  let walletProvider: EIP1193Provider | undefined;
  const transport = fallback(
    [
      ...deployment.network.rpcUrls.map((url) =>
        http(url, { timeout: 4000, retryCount: 0, batch: { wait: 30 } }),
      ),
      custom(
        {
          request: async (args) => {
            if (!walletProvider)
              throw new Error(
                'Public RPCs unavailable. Connect a wallet to try its RPC.',
              );
            const provider = walletProvider;
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              return await Promise.race([
                (async () => {
                  const id = await provider.request({ method: 'eth_chainId' });
                  if (Number(id) !== deployment.chainId)
                    throw new Error('Wallet is on the wrong network.');
                  return provider.request(args as never);
                })(),
                new Promise<never>((_, reject) => {
                  timer = setTimeout(
                    () => reject(new Error('Wallet RPC timed out.')),
                    4000,
                  );
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          },
        },
        { retryCount: 0 },
      ),
    ],
    { rank: false, retryCount: 0 },
  );
  const client = createPublicClient({
    chain,
    transport,
    pollingInterval: 15000,
  });
  const wagmi = createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({
        appName: 'Beg the Swarm',
        preference: { options: 'all' },
      }),
    ],
    transports: { [chain.id]: transport },
  });
  return {
    deployment,
    provenance,
    chain,
    client,
    wagmi,
    vault: refs.BegVault,
    token: refs.LaunchToken,
    setWalletProvider: (p: EIP1193Provider | undefined) => {
      walletProvider = p;
    },
  };
}
export type Runtime = Awaited<ReturnType<typeof loadRuntime>>;
