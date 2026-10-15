import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { zeroAddress, type Address } from 'viem';
import type { Runtime } from './config';
import type { ChainState } from './types';
import { amount, exact, fmt, humanError, UserFacingError } from './domain';
import { read } from './data';
import {
  erc20Abi,
  permit2Abi,
  quoterAbi,
  routerAbi,
  swapInput,
} from './protocol';
import { actionLabel, TxFeedback, type Transactions } from './transactions';
interface Quote {
  input: bigint;
  output: bigint;
  minimum: bigint;
  at: number;
  key: string;
}
export function Swap({
  rt,
  state,
  ready,
  tx,
  now,
}: {
  rt: Runtime;
  state?: ChainState;
  ready: boolean;
  tx: Transactions;
  now: number;
}) {
  const { address } = useAccount();
  const [side, setSide] = useState<'buy' | 'sell'>('buy'),
    [text, setText] = useState(''),
    [slippage, setSlippage] = useState('0.5'),
    [quote, setQuote] = useState<Quote>(),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [allowances, setAllowances] = useState<{
    erc: bigint;
    permit: bigint;
    expiration: number;
    balance: bigint;
  }>();
  const [verified, setVerified] = useState(false);
  const readId = useRef(0),
    quoteId = useRef(0);
  const pool = rt.deployment.poolKey,
    uniswap = rt.deployment.network.uniswapV4;
  const pair =
    pool.currency0.toLowerCase() === rt.token.address.toLowerCase()
      ? pool.currency1
      : pool.currency0;
  const pairMeta =
    pair === zeroAddress
      ? rt.deployment.network.nativeCurrency
      : [
          rt.deployment.network.pairToken,
          ...(rt.deployment.network.otherPairTokens ?? []),
        ].find((t) => t.address.toLowerCase() === pair.toLowerCase());
  const input: Address = side === 'buy' ? pair : rt.token.address,
    output = side === 'buy' ? rt.token.address : pair;
  const inputSymbol = side === 'buy' ? pairMeta?.symbol : 'BEG',
    outputSymbol = side === 'buy' ? 'BEG' : pairMeta?.symbol;
  const inputDecimals =
      side === 'buy' ? pairMeta?.decimals : state?.tokenDecimals,
    outputDecimals = side === 'buy' ? state?.tokenDecimals : pairMeta?.decimals;
  const n =
    inputDecimals !== undefined ? amount(text, inputDecimals) : undefined;
  const bps = /^\d+(\.\d{1,2})?$/.test(slippage)
    ? Math.round(Number(slippage) * 100)
    : 0;
  const validSlip = bps >= 10 && bps <= 500;
  const key = `${side}:${text}:${slippage}:${address ?? ''}`;
  const usable = quote && quote.key === key && now - quote.at < 60;
  const refresh = useCallback(async () => {
    const request = ++readId.current;
    setAllowances(undefined);
    try {
      const codes = await Promise.all(
        [uniswap.quoter, uniswap.universalRouter, uniswap.permit2].map((a) =>
          rt.client.getCode({ address: a }),
        ),
      );
      if (codes.some((c) => !c || c === '0x'))
        throw new Error('Router verification failed');
      if (request !== readId.current) return;
      setVerified(true);
      if (!address) return;
      if (input === zeroAddress) {
        const balance = await rt.client.getBalance({ address });
        if (request === readId.current)
          setAllowances({ erc: 0n, permit: 0n, expiration: 0, balance });
        return;
      }
      const [erc, permit, balance] = await Promise.all([
        read<bigint>(rt, input, erc20Abi, 'allowance', [
          address,
          uniswap.permit2,
        ]),
        read<readonly [bigint, number, number]>(
          rt,
          uniswap.permit2,
          permit2Abi,
          'allowance',
          [address, input, uniswap.universalRouter],
        ),
        read<bigint>(rt, input, erc20Abi, 'balanceOf', [address]),
      ]);
      if (request === readId.current)
        setAllowances({
          erc,
          permit: permit[0],
          expiration: Number(permit[1]),
          balance,
        });
    } catch (e) {
      if (request === readId.current) {
        setVerified(false);
        setError(humanError(e));
      }
    }
  }, [rt, input, address, uniswap]);
  useEffect(() => {
    void refresh();
  }, [
    refresh,
    state?.block,
    tx.statuses['swap-erc']?.phase,
    tx.statuses['swap-permit']?.phase,
    tx.statuses.swap?.phase,
  ]);
  useEffect(() => {
    quoteId.current++;
    setQuote(undefined);
    setError('');
    setLoading(false);
  }, [key]);
  const getQuote = async () => {
    if (!n || !validSlip || !pairMeta || !verified) return;
    const request = ++quoteId.current;
    setLoading(true);
    setError('');
    setQuote(undefined);
    try {
      if (n >= 2n ** 128n)
        throw new UserFacingError('This amount is too large.');
      const { result } = await rt.client.simulateContract({
        address: uniswap.quoter,
        abi: quoterAbi,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            poolKey: pool,
            zeroForOne: input.toLowerCase() === pool.currency0.toLowerCase(),
            exactAmount: n,
            hookData: '0x',
          },
        ],
        ...(address ? { account: address } : {}),
      });
      const out = result[0];
      if (out <= 0n)
        throw new UserFacingError(
          'No output is available for this amount. Try a smaller trade.',
        );
      const minimum = (out * BigInt(10000 - bps)) / 10000n;
      if (!minimum)
        throw new UserFacingError(
          'The minimum output rounds to zero. Increase the amount.',
        );
      if (request === quoteId.current)
        setQuote({
          input: n,
          output: out,
          minimum,
          at: Math.floor(Date.now() / 1000),
          key,
        });
    } catch (e) {
      if (request === quoteId.current) setError(humanError(e));
    } finally {
      if (request === quoteId.current) setLoading(false);
    }
  };
  const native = input === zeroAddress;
  const step =
    !native && allowances && n && allowances.erc < n
      ? 'erc'
      : !native &&
          allowances &&
          n &&
          (allowances.permit < n || allowances.expiration < now + 120)
        ? 'permit'
        : 'swap';
  const id =
    step === 'erc' ? 'swap-erc' : step === 'permit' ? 'swap-permit' : 'swap';
  const run = async () => {
    if (!address || !n || !usable || !quote) return;
    if (step === 'erc')
      await tx.prepare({
        key: id,
        label: `Approve ${inputSymbol}`,
        description: `Allow Permit2 to spend exactly ${exact(n, inputDecimals)} ${inputSymbol}. The swap needs a separate router permission next.`,
        address: input,
        abi: erc20Abi,
        functionName: 'approve',
        args: [uniswap.permit2, n],
      });
    else if (step === 'permit')
      await tx.prepare({
        key: id,
        label: 'Authorize router',
        description: `Allow the Universal Router to spend ${exact(n, inputDecimals)} ${inputSymbol} through Permit2 for 30 minutes.`,
        address: uniswap.permit2,
        abi: permit2Abi,
        functionName: 'approve',
        args: [input, uniswap.universalRouter, n, now + 1800],
      });
    else {
      const encoded = swapInput(
        pool,
        input,
        n,
        quote.minimum,
        uniswap.extendedSwapParams,
      );
      const deadline = BigInt(now + 1200);
      await tx.prepare({
        key: id,
        label: `Swap ${inputSymbol} for ${outputSymbol}`,
        description: `Spend ${exact(n, inputDecimals)} ${inputSymbol} for at least ${exact(quote.minimum, outputDecimals)} ${outputSymbol}. Slippage ${slippage}%. Deadline 20 minutes.`,
        address: uniswap.universalRouter,
        abi: routerAbi,
        functionName: 'execute',
        args: [encoded.commands, encoded.inputs, deadline],
        value: encoded.value,
        before: async () => {
          if (Math.floor(Date.now() / 1000) - quote.at >= 60)
            throw new UserFacingError(
              'This quote expired. Request a fresh quote before swapping.',
            );
        },
      });
    }
  };
  return (
    <section id="trade" className="section trade">
      <div className="section-title">
        <h2>Get more BEG</h2>
        <span className="muted small">Uniswap v4</span>
      </div>
      <p className="muted">
        Trade the deployed {pairMeta?.symbol ?? 'paired token'}/BEG pool.
      </p>
      <div className="segmented" role="group" aria-label="Trade direction">
        <button aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
          Buy BEG
        </button>
        <button aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>
          Sell BEG
        </button>
      </div>
      <div className="form-grid">
        <label>
          Spend ({inputSymbol})
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            name="swapAmount"
            autoComplete="off"
          />
        </label>
        <label>
          Slippage (%)
          <input
            value={slippage}
            onChange={(e) => setSlippage(e.target.value)}
            inputMode="decimal"
            name="slippage"
          />
        </label>
      </div>
      <p className="small muted">
        Balance: {fmt(allowances?.balance, inputDecimals)} {inputSymbol} · Pool
        fee: {pool.fee / 10000}% · USD pricing unavailable.
      </p>
      {!validSlip && <p className="error">Choose slippage from 0.1% to 5%.</p>}
      <button
        className="wide"
        onClick={() => void getQuote()}
        disabled={!n || !validSlip || loading || !verified || tx.busy}
      >
        {loading ? 'Quoting…' : 'Get quote'}
      </button>
      {quote && (
        <div className="quote">
          <dl>
            <div>
              <dt>Expected output</dt>
              <dd>
                {fmt(quote.output, outputDecimals)} {outputSymbol}
              </dd>
            </div>
            <div>
              <dt>Minimum received</dt>
              <dd>
                {fmt(quote.minimum, outputDecimals)} {outputSymbol}
              </dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>
                {quote.input &&
                outputDecimals !== undefined &&
                inputDecimals !== undefined
                  ? fmt(
                      (quote.output * 10n ** BigInt(inputDecimals)) /
                        quote.input,
                      outputDecimals,
                      5,
                    )
                  : '…'}{' '}
                {outputSymbol}/{inputSymbol}
              </dd>
            </div>
          </dl>
          <p className="small muted">
            {usable
              ? `Quote expires in ${Math.max(0, Math.min(60, 60 - (now - quote.at)))}s.`
              : 'Quote expired. Get a fresh quote.'}
          </p>
          {!native && (
            <ol className="small steps-inline">
              <li>Approve {inputSymbol} to Permit2</li>
              <li>Authorize the router</li>
              <li>Swap</li>
            </ol>
          )}
          <button
            className="wide"
            disabled={
              !ready ||
              tx.busy ||
              !usable ||
              !allowances ||
              !n ||
              allowances.balance < n ||
              !verified
            }
            onClick={() => void run()}
          >
            {actionLabel(
              tx,
              id,
              step === 'erc'
                ? `Approve ${inputSymbol}`
                : step === 'permit'
                  ? 'Authorize router'
                  : `Swap ${inputSymbol} for ${outputSymbol}`,
            )}
          </button>
          {allowances && n && allowances.balance < n && (
            <p className="error">Insufficient {inputSymbol} balance.</p>
          )}
        </div>
      )}
      {!address && (
        <p className="small muted">Connect your wallet above to trade.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {['swap-erc', 'swap-permit', 'swap'].map((id) => (
        <TxFeedback tx={tx} id={id} rt={rt} key={id} />
      ))}
    </section>
  );
}
