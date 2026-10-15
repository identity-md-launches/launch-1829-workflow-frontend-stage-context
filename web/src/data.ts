import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeEventLog, toHex, type Address, type Abi, type Hex } from 'viem';
import type { Runtime } from './config';
import type { Batch, ChainState, Entry, WalletState } from './types';
import { erc20Abi, intakeAbi } from './protocol';
import { decodeCache, encodeCache, humanError } from './domain';
export function read<T>(
  rt: Runtime,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
): Promise<T> {
  return rt.client.readContract({
    address,
    abi,
    functionName,
    args,
    blockNumber,
  }) as Promise<T>;
}
export const readVault = <T>(
  rt: Runtime,
  fn: string,
  args: readonly unknown[] = [],
  block?: bigint,
) => read<T>(rt, rt.vault.address, rt.vault.abi, fn, args, block);
export async function readBatch(
  rt: Runtime,
  id: bigint,
  block?: bigint,
): Promise<Batch> {
  return {
    id,
    ...(await readVault<Omit<Batch, 'id'>>(rt, 'getBatch', [id], block)),
  };
}
export async function snapshot(rt: Runtime): Promise<ChainState> {
  const [chainId, block, codes] = await Promise.all([
    rt.client.getChainId(),
    rt.client.getBlock(),
    Promise.all(
      rt.deployment.contracts.map((c) =>
        rt.client.getCode({ address: c.address }),
      ),
    ),
  ]);
  if (chainId !== rt.deployment.chainId || codes.some((c) => !c || c === '0x'))
    throw new Error('Deployed contract verification failed');
  const n = block.number;
  const names = [
    'vaultFreeBalance',
    'jackpotBank',
    'nextAttemptId',
    'oracleTokenBudget',
    'oracleBudget',
    'ATTEMPT_PRICE',
    'openBatchId',
    'nextToClose',
    'imd',
    'intake',
    'token',
    'REVEALER_BOUNTY',
    'BATCH_WINDOW',
    'ORACLE_TIMEOUT',
    'MAX_BATCH_SIZE',
    'COOLDOWN',
  ];
  const v = await Promise.all(
    names.map((fn) => readVault<bigint | Address | number>(rt, fn, [], n)),
  );
  const [
    free,
    jackpot,
    next,
    oracleImd,
    bountyBudget,
    price,
    openBatchId,
    nextToClose,
    imd,
    intake,
    token,
    bounty,
    window,
    timeout,
    maxBatch,
    cooldown,
  ] = v.map((x) => (typeof x === 'number' ? BigInt(x) : x)) as [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    Address,
    Address,
    Address,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
  ];
  if (
    token.toLowerCase() !== rt.token.address.toLowerCase() ||
    imd.toLowerCase() !== rt.deployment.network.pairToken.address.toLowerCase()
  )
    throw new Error('Immutable contract token binding mismatch');
  const [
    batch,
    vaultBalance,
    tokenDecimals,
    imdDecimals,
    oracleFee,
    intakeAllowance,
  ] = await Promise.all([
    readBatch(rt, openBatchId, n),
    read<bigint>(rt, token, rt.token.abi, 'balanceOf', [rt.vault.address], n),
    read<number>(rt, token, rt.token.abi, 'decimals', [], n),
    read<number>(rt, imd, erc20Abi, 'decimals', [], n),
    read<bigint>(
      rt,
      intake,
      intakeAbi,
      'priceOf',
      [toHex('oracle.request@oracle-1', { size: 32 }), imd],
      n,
    ),
    read<bigint>(rt, imd, erc20Abi, 'allowance', [rt.vault.address, intake], n),
  ]);
  return {
    block: n,
    timestamp: Number(block.timestamp),
    fetchedAt: Date.now(),
    verified: true,
    free,
    jackpot,
    attempts: next - 1n,
    oracleImd,
    bountyBudget,
    price,
    openBatchId,
    nextToClose,
    batch,
    imd,
    intake,
    vaultBalance,
    tokenDecimals,
    imdDecimals,
    oracleFee,
    intakeAllowance,
    bounty,
    window: Number(window),
    timeout: Number(timeout),
    maxBatch: Number(maxBatch),
    cooldown: Number(cooldown),
  };
}
export async function walletSnapshot(
  rt: Runtime,
  state: ChainState,
  address: Address,
): Promise<WalletState> {
  const [
    cooldownUntil,
    credit,
    ethBalance,
    begBalance,
    imdBalance,
    imdAllowance,
  ] = await Promise.all([
    readVault<bigint>(rt, 'cooldownUntil', [address]),
    readVault<readonly [bigint, bigint]>(rt, 'claimable', [address]),
    rt.client.getBalance({ address }),
    read<bigint>(rt, rt.token.address, rt.token.abi, 'balanceOf', [address]),
    read<bigint>(rt, state.imd, erc20Abi, 'balanceOf', [address]),
    read<bigint>(rt, state.imd, erc20Abi, 'allowance', [
      address,
      rt.vault.address,
    ]),
  ]);
  return {
    address,
    cooldownUntil: Number(cooldownUntil),
    tokens: credit[0],
    eth: credit[1],
    ethBalance,
    begBalance,
    imdBalance,
    imdAllowance,
  };
}
function cached<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? decodeCache<T>(raw) : undefined;
  } catch {
    return undefined;
  }
}
function cache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, encodeCache(value));
  } catch {
    /* Quota/private-mode failures must not prevent live reads. */
  }
}
export function useChainData(rt: Runtime, address?: Address) {
  const key = `beg:${rt.deployment.launchId}:state`;
  const [state, setState] = useState<ChainState | undefined>(() => {
    const s = cached<ChainState>(key);
    return s ? { ...s, verified: false } : undefined;
  });
  const [wallet, setWallet] = useState<WalletState>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const currentAddress = useRef(address);
  currentAddress.current = address;
  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const work = async () => {
      setLoading(true);
      try {
        const s = await snapshot(rt);
        setState(s);
        cache(key, s);
        const who = currentAddress.current;
        if (who) {
          const w = await walletSnapshot(rt, s, who);
          if (currentAddress.current === who) setWallet(w);
        } else setWallet(undefined);
        setError('');
      } catch (e) {
        setError(humanError(e));
        setState((s) => (s ? { ...s, verified: false } : s));
        setWallet(undefined);
      } finally {
        setLoading(false);
        inFlight.current = undefined;
      }
    };
    inFlight.current = work();
    return inFlight.current;
  }, [rt, key]);
  useEffect(() => {
    setWallet(undefined);
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [address, refresh]);
  return {
    state,
    wallet: wallet?.address === address ? wallet : undefined,
    error,
    loading,
    refresh,
  };
}
export interface IndexedLog {
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  eventName: string;
  args: Record<string, unknown>;
}
export interface IndexCache {
  through: bigint;
  logs: IndexedLog[];
}
export function projectHistory(logs: IndexedLog[]) {
  const entries = new Map<string, Entry>(),
    statuses = new Map<string, number>();
  for (const log of logs) {
    const a = log.args;
    const id = String(a.attemptId),
      batch = String(a.batchId);
    if (log.eventName === 'AttemptSubmitted') {
      entries.set(id, {
        id: a.attemptId as bigint,
        player: a.player as Address,
        batchId: a.batchId as bigint,
        message: a.message as string,
      });
      if (!statuses.has(batch)) statuses.set(batch, 0);
    }
    if (log.eventName === 'BatchClosed') statuses.set(batch, 1);
    if (log.eventName === 'BatchGraded') {
      statuses.set(batch, 2);
      const scores = a.scores as bigint[];
      for (const entry of entries.values())
        if (String(entry.batchId) === batch) {
          const siblings = [...entries.values()]
            .filter((e) => e.batchId === entry.batchId)
            .sort((x, y) => Number(x.id - y.id));
          entry.score = Number(
            scores[siblings.findIndex((e) => e.id === entry.id)],
          );
        }
    }
    if (log.eventName === 'Rolled') {
      const entry = entries.get(id);
      if (entry) {
        Object.assign(entry, {
          score: Number(a.score),
          tier: Number(a.tier),
          tokens: a.tokenAmount,
          eth: a.ethAmount,
        });
        statuses.set(String(entry.batchId), 3);
      }
    }
    if (log.eventName === 'BatchExpired') statuses.set(batch, 4);
    if (log.eventName === 'Refunded') {
      const entry = entries.get(id);
      if (entry) entry.refunded = true;
    }
  }
  return {
    entries: [...entries.values()].sort((a, b) => Number(b.id - a.id)),
    statuses,
  };
}
export function useHistory(rt: Runtime, head?: bigint) {
  const key = `beg:${rt.deployment.launchId}:events`;
  const [index, setIndex] = useState<IndexCache>(
    () =>
      cached<IndexCache>(key) ?? {
        through: BigInt(rt.provenance.deploymentBlock) - 1n,
        logs: [],
      },
  );
  const [error, setError] = useState(''),
    [running, setRunning] = useState(false);
  const latest = useRef(index);
  latest.current = index;
  const busy = useRef(false),
    chunkSize = useRef(2000n);
  const sync = useCallback(async () => {
    if (head === undefined || busy.current) return;
    busy.current = true;
    setRunning(true);
    try {
      const start = BigInt(rt.provenance.deploymentBlock);
      let from = latest.current.through - 12n;
      if (from < start) from = start;
      let logs = latest.current.logs.filter((l) => l.blockNumber < from);
      let chunk = chunkSize.current;
      let steps = 0;
      while (from <= head && steps++ < 20) {
        const to = from + chunk - 1n < head ? from + chunk - 1n : head;
        let result;
        try {
          result = await rt.client.getLogs({
            address: rt.vault.address,
            fromBlock: from,
            toBlock: to,
          });
        } catch (e) {
          if (chunk > 1n) {
            chunk = chunk / 2n;
            chunkSize.current = chunk;
            steps--;
            continue;
          }
          throw e;
        }
        for (const log of result) {
          try {
            const d = decodeEventLog({
              abi: rt.vault.abi,
              data: log.data,
              topics: log.topics,
            });
            logs.push({
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
              transactionHash: log.transactionHash,
              eventName: d.eventName!,
              args: d.args as unknown as Record<string, unknown>,
            });
          } catch {
            /* Unknown events cannot alter known lifecycle state. */
          }
        }
        logs = logs.sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? a.logIndex - b.logIndex
            : Number(a.blockNumber - b.blockNumber),
        );
        const next = { through: to, logs };
        latest.current = next;
        setIndex(next);
        cache(key, next);
        from = to + 1n;
      }
      setError('');
    } catch {
      setError(
        'History could not finish syncing. Displayed messages cover only the indexed blocks. Retry to continue.',
      );
    } finally {
      busy.current = false;
      setRunning(false);
    }
  }, [rt, head, key]);
  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), 15000);
    return () => clearInterval(timer);
  }, [sync]);
  return {
    ...projectHistory(index.logs),
    through: index.through,
    running,
    error,
    sync,
    complete: head !== undefined && index.through >= head,
  };
}
