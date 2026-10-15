import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import {
  createWalletClient,
  custom,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import type { Runtime } from './config';
import { exact, fmt, humanError, UserFacingError } from './domain';
import { Modal } from './Wallet';
export interface Action {
  key: string;
  label: string;
  description: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  before?: () => Promise<void>;
}
export interface TxStatus {
  phase: 'checking' | 'review' | 'wallet' | 'confirming' | 'success' | 'error';
  message: string;
  hash?: Hex;
}
export function useTransactions(
  rt: Runtime,
  ready: boolean,
  refresh: () => Promise<void>,
) {
  const { address, chainId, connector } = useAccount();
  const [statuses, setStatuses] = useState<Record<string, TxStatus>>({});
  const [review, setReview] = useState<{
    action: Action;
    fee: bigint;
    account: Address;
  }>();
  const locked = useRef(false);
  const accountRef = useRef(address);
  accountRef.current = address;
  const set = (key: string, value: TxStatus) =>
    setStatuses((s) => ({ ...s, [key]: value }));
  const provider = async () => {
    if (!connector || !address || typeof connector.getProvider !== 'function')
      throw new UserFacingError('Connect your wallet first.');
    const p = (await connector.getProvider()) as EIP1193Provider;
    const [id, accounts] = await Promise.all([
      p.request({ method: 'eth_chainId' }),
      p.request({ method: 'eth_accounts' }),
    ]);
    if (Number(id) !== rt.chain.id)
      throw new UserFacingError(`Switch to ${rt.chain.name} before signing.`);
    if (
      accounts[0]?.toLowerCase() !== address.toLowerCase() ||
      accountRef.current !== address
    )
      throw new UserFacingError(
        'Your wallet account changed. Review the action again.',
      );
    return p;
  };
  useEffect(() => {
    if (review && (review.account !== address || chainId !== rt.chain.id)) {
      set(review.action.key, {
        phase: 'error',
        message: 'Wallet changed. Review the action again.',
      });
      setReview(undefined);
      locked.current = false;
    }
  }, [address, chainId, review, rt.chain.id]);
  const prepare = async (action: Action) => {
    if (locked.current) return;
    locked.current = true;
    set(action.key, {
      phase: 'checking',
      message: 'Checking the current contract state…',
    });
    try {
      if (!ready || !address)
        throw new UserFacingError(
          'Wait for verified live state on the correct network.',
        );
      await provider();
      await action.before?.();
      const call = {
        address: action.address,
        abi: action.abi,
        functionName: action.functionName,
        args: action.args ?? [],
        value: action.value ?? 0n,
        account: address,
      };
      await rt.client.simulateContract(call);
      const [gas, price] = await Promise.all([
        rt.client.estimateContractGas(call),
        rt.client.getGasPrice(),
      ]);
      if (accountRef.current !== address)
        throw new UserFacingError('Your account changed. Review again.');
      setReview({ action, fee: gas * price, account: address });
      set(action.key, {
        phase: 'review',
        message: 'Review the payment before opening your wallet.',
      });
    } catch (e) {
      set(action.key, { phase: 'error', message: humanError(e) });
      locked.current = false;
    }
  };
  const cancel = () => {
    if (review)
      set(review.action.key, {
        phase: 'error',
        message: 'Review cancelled. Nothing was submitted.',
      });
    setReview(undefined);
    locked.current = false;
  };
  const confirm = async () => {
    if (!review) return;
    const { action, account } = review;
    setReview(undefined);
    let hash: Hex | undefined;
    try {
      const p = await provider();
      if (accountRef.current !== account)
        throw new UserFacingError('Your account changed. Review again.');
      await action.before?.();
      const { request } = await rt.client.simulateContract({
        address: action.address,
        abi: action.abi,
        functionName: action.functionName,
        args: action.args ?? [],
        value: action.value ?? 0n,
        account,
      });
      set(action.key, {
        phase: 'wallet',
        message: 'Confirm this action in your wallet.',
      });
      const wallet = createWalletClient({
        chain: rt.chain,
        transport: custom(p),
        account,
      });
      hash = await wallet.writeContract(request);
      set(action.key, {
        phase: 'confirming',
        message: 'Submitted. Waiting for confirmation…',
        hash,
      });
      const receipt = await rt.client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 180000,
        pollingInterval: 2000,
      });
      if (receipt.status !== 'success')
        throw new UserFacingError(
          'The transaction reverted. The network fee may have been spent; contract changes were reverted.',
        );
      await refresh();
      set(action.key, {
        phase: 'success',
        message: 'Confirmed on Ethereum. State refreshed.',
        hash,
      });
    } catch (e) {
      set(action.key, {
        phase: 'error',
        message: hash
          ? `${humanError(e)} Check the transaction before retrying.`
          : humanError(e),
        hash,
      });
    } finally {
      locked.current = false;
    }
  };
  const busy = Object.values(statuses).some((s) =>
    ['checking', 'review', 'wallet', 'confirming'].includes(s.phase),
  );
  return {
    prepare,
    statuses,
    busy,
    review: review ? (
      <Modal title={`Review: ${review.action.label}`} onClose={cancel}>
        <p>{review.action.description}</p>
        <dl className="review-values">
          <div>
            <dt>Payment</dt>
            <dd>{exact(review.action.value ?? 0n)} ETH</dd>
          </div>
          <div>
            <dt>Estimated network fee</dt>
            <dd>≈ {fmt(review.fee, 18, 7)} ETH</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{rt.chain.name}</dd>
          </div>
        </dl>
        <p className="small muted">
          The network fee can change. USD pricing is unavailable.
        </p>
        <p className="small">Contract</p>
        <a
          className="address"
          href={`${rt.deployment.network.explorer}/address/${review.action.address}`}
          target="_blank"
          rel="noreferrer"
        >
          {review.action.address}
        </a>
        <div className="actions">
          <button onClick={cancel}>Cancel</button>
          <button className="primary" onClick={() => void confirm()}>
            Confirm {review.action.label.toLowerCase()}
          </button>
        </div>
      </Modal>
    ) : null,
  };
}
export type Transactions = ReturnType<typeof useTransactions>;
export function TxFeedback({
  tx,
  id,
  rt,
}: {
  tx: Transactions;
  id: string;
  rt: Runtime;
}) {
  const s = tx.statuses[id];
  return s ? (
    <div
      className={`tx-feedback ${s.phase === 'error' ? 'error' : s.phase === 'success' ? 'success' : ''}`}
      role="status"
    >
      <p>{s.message}</p>
      {s.hash && (
        <a
          href={`${rt.deployment.network.explorer}/tx/${s.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
    </div>
  ) : null;
}
export function actionLabel(tx: Transactions, id: string, label: string) {
  const phase = tx.statuses[id]?.phase;
  return phase === 'checking'
    ? 'Checking…'
    : phase === 'wallet'
      ? 'Confirm in wallet…'
      : phase === 'confirming'
        ? 'Confirming…'
        : label;
}
