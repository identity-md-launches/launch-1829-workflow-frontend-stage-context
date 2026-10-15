import { useEffect, useState } from 'react';
import type { Runtime } from './config';
import type { Batch, ChainState, WalletState } from './types';
import { readBatch } from './data';
import {
  amount,
  batchActions,
  exact,
  fmt,
  humanError,
  remaining,
  STATUS,
} from './domain';
import { erc20Abi } from './protocol';
import { actionLabel, TxFeedback, type Transactions } from './transactions';
export function Keepers({
  rt,
  state,
  wallet,
  ready,
  tx,
  now,
}: {
  rt: Runtime;
  state?: ChainState;
  wallet?: WalletState;
  ready: boolean;
  tx: Transactions;
  now: number;
}) {
  const [id, setId] = useState(''),
    [batch, setBatch] = useState<Batch>(),
    [batchError, setBatchError] = useState('');
  const [imd, setImd] = useState('0.5'),
    [eth, setEth] = useState('0.001'),
    [beg, setBeg] = useState('');
  const number = id
    ? /^[1-9]\d*$/.test(id)
      ? BigInt(id)
      : undefined
    : state?.nextToClose;
  useEffect(() => {
    let cancelled = false;
    setBatch(undefined);
    if (number && state)
      void readBatch(rt, number)
        .then((b) => {
          if (!cancelled) {
            setBatch(b);
            setBatchError('');
          }
        })
        .catch((e) => {
          if (!cancelled) setBatchError(humanError(e));
        });
    return () => {
      cancelled = true;
    };
  }, [rt, number, state?.block]);
  const valid = batchActions(
    batch,
    now,
    state?.block ?? 0n,
    state?.window,
    state?.timeout,
  );
  const feeReady =
    !!state &&
    state.oracleFee > 0n &&
    state.oracleImd >= state.oracleFee &&
    state.intakeAllowance >= state.oracleFee;
  const imdAmount = state ? amount(imd, state.imdDecimals) : undefined,
    ethAmount = amount(eth, 18),
    begAmount = state ? amount(beg, state.tokenDecimals) : undefined;
  const needsApproval =
    !!imdAmount && !!wallet && wallet.imdAllowance < imdAmount;
  const fundId = needsApproval ? 'approve-imd' : 'fund-imd';
  const vaultAction = (
    key: string,
    label: string,
    fn: string,
    args: readonly unknown[],
    description: string,
  ) =>
    void tx.prepare({
      key,
      label,
      description,
      address: rt.vault.address,
      abi: rt.vault.abi,
      functionName: fn,
      args,
    });
  return (
    <section className="section" id="keepers">
      <h2>Keep the swarm moving</h2>
      <p className="muted">
        Anyone can settle a batch. Each action costs network gas.
      </p>
      <label className="batch-input">
        Batch number
        <input
          inputMode="numeric"
          name="batchNumber"
          value={id}
          placeholder={state?.nextToClose.toString() ?? 'Batch ID'}
          onChange={(e) => setId(e.target.value)}
        />
      </label>
      {id && !/^[1-9]\d*$/.test(id) && (
        <p className="error">Enter a positive whole batch number.</p>
      )}
      {batch && (
        <div className="batch-state">
          <p>
            Batch #{batch.id.toString()} · {STATUS[batch.status]} · {batch.size}
            /{state?.maxBatch ?? 20} entries
          </p>
          {batch.status === 0 && batch.size > 0 && (
            <p className="small muted">
              Close in{' '}
              {remaining(
                Number(batch.openedAt) + (state?.window ?? 1800) - now,
              )}
              . Refund eligibility in {remaining(valid.deadline - now)}.
            </p>
          )}
          {batch.status === 1 && (
            <p className="small muted">
              Expire in {remaining(valid.deadline - now)} if the oracle does not
              answer.
            </p>
          )}
          {batch.status === 2 && (
            <p className="small muted">
              Reveal after block {batch.rollBlock.toString()}.{' '}
              {valid.rearm
                ? 'The window was missed. This call rearms the roll and removes the highest remaining tier. No bounty.'
                : `Bounty: ${fmt(state && state.bountyBudget >= state.bounty ? state.bounty : 0n)} ETH, credited for a later claim.`}{' '}
              Missed windows: {batch.missedWindows}.
            </p>
          )}
        </div>
      )}
      <div className="actions keeper-actions">
        <button
          disabled={!ready || tx.busy || !valid.close || !feeReady}
          onClick={() =>
            vaultAction(
              'close',
              'Close batch',
              'closeBatch',
              [batch!.id],
              `Request grading for batch #${batch!.id}. The vault pays ${fmt(state?.oracleFee, state?.imdDecimals)} IMD from donated funds.`,
            )
          }
        >
          {actionLabel(tx, 'close', 'Close batch')}
        </button>
        <button
          disabled={!ready || tx.busy || !valid.reveal}
          onClick={() =>
            vaultAction(
              'reveal',
              'Reveal batch',
              'reveal',
              [batch!.id],
              valid.rearm
                ? 'Rearm the missed reveal window. The highest remaining prize tier will be forfeited, with no bounty.'
                : `Settle batch #${batch!.id}. Prizes and any available revealer bounty become claimable credits.`,
            )
          }
        >
          {actionLabel(tx, 'reveal', valid.rearm ? 'Rearm reveal' : 'Reveal')}
        </button>
        <button
          disabled={!ready || tx.busy || !valid.expire}
          onClick={() =>
            vaultAction(
              'expire',
              'Expire batch',
              'expireBatch',
              [batch!.id],
              `Expire batch #${batch!.id} so entrants can request their full entry fee as refund credits.`,
            )
          }
        >
          {actionLabel(tx, 'expire', 'Expire')}
        </button>
      </div>
      {state && batch?.id === state.nextToClose && valid.close && (
        <button
          disabled={!ready || tx.busy || !feeReady}
          onClick={() =>
            vaultAction(
              'close-oldest',
              'Close oldest batch',
              'closeBatch',
              [],
              `Close the oldest eligible batch, currently #${state.nextToClose}. The vault pays the oracle fee.`,
            )
          }
        >
          Close oldest batch
        </button>
      )}
      {valid.close && !feeReady && (
        <p className="small warning">
          Closing needs a funded oracle fee and Intake allowance. Donate IMD
          below; direct IMD transfers may need allowance activation.
        </p>
      )}
      {batchError && (
        <p className="error" role="alert">
          {batchError}
        </p>
      )}
      {['close', 'close-oldest', 'reveal', 'expire'].map((id) => (
        <TxFeedback key={id} id={id} rt={rt} tx={tx} />
      ))}
      <details className="funding" open>
        <summary>Fund the oracle</summary>
        <p className="small muted">
          IMD donations pay for grading and cannot be withdrawn. Current fee:{' '}
          {fmt(state?.oracleFee, state?.imdDecimals)} IMD per batch.
        </p>
        <label>
          Donation (IMD)
          <input
            value={imd}
            onChange={(e) => setImd(e.target.value)}
            inputMode="decimal"
            name="imdDonation"
          />
        </label>
        <p className="small muted">
          Your balance: {fmt(wallet?.imdBalance, state?.imdDecimals)} IMD.
          Approve the exact amount, then donate.
        </p>
        <button
          className="wide"
          disabled={
            !ready ||
            tx.busy ||
            !imdAmount ||
            !wallet ||
            wallet.imdBalance < imdAmount
          }
          onClick={() => {
            if (!state || !imdAmount) return;
            if (needsApproval)
              void tx.prepare({
                key: 'approve-imd',
                label: 'Approve IMD',
                description: `Allow BegVault to spend exactly ${exact(imdAmount, state.imdDecimals)} IMD. Funding is a separate transaction.`,
                address: state.imd,
                abi: erc20Abi,
                functionName: 'approve',
                args: [rt.vault.address, imdAmount],
              });
            else
              vaultAction(
                'fund-imd',
                'Fund oracle',
                'fundOracle',
                [imdAmount],
                `Donate ${exact(imdAmount, state.imdDecimals)} IMD to grading. Donations are irreversible. This also establishes the vault’s standing Intake allowance.`,
              );
          }}
        >
          {actionLabel(
            tx,
            fundId,
            needsApproval ? 'Approve IMD' : 'Fund oracle',
          )}
        </button>
        {['approve-imd', 'fund-imd'].map((id) => (
          <TxFeedback key={id} id={id} tx={tx} rt={rt} />
        ))}
        {state &&
          state.oracleImd > 0n &&
          state.intakeAllowance < state.oracleFee && (
            <>
              <p className="small warning">
                IMD is in the vault, but Intake needs permission to spend it.
              </p>
              <button
                disabled={!ready || tx.busy}
                onClick={() =>
                  vaultAction(
                    'activate-intake',
                    'Activate oracle allowance',
                    'fundOracle',
                    [0n],
                    'Establish the vault’s standing unlimited allowance to its immutable Intake. No IMD is transferred from you.',
                  )
                }
              >
                Activate oracle allowance
              </button>
              <TxFeedback id="activate-intake" tx={tx} rt={rt} />
            </>
          )}
      </details>
      <details className="funding">
        <summary>Fund prizes or revealer bounties</summary>
        <p className="small muted">
          These are permanent donations. ETH funds revealer bounties; it cannot
          pay the IMD grading fee.
        </p>
        <label>
          Bounty donation (ETH)
          <input
            inputMode="decimal"
            value={eth}
            onChange={(e) => setEth(e.target.value)}
            name="ethDonation"
          />
        </label>
        <button
          disabled={
            !ready ||
            tx.busy ||
            !ethAmount ||
            !wallet ||
            wallet.ethBalance <= ethAmount
          }
          onClick={() =>
            void tx.prepare({
              key: 'fund-eth',
              label: 'Donate bounty ETH',
              description: `Permanently donate ${exact(ethAmount)} ETH to the revealer budget.`,
              address: rt.vault.address,
              abi: rt.vault.abi,
              functionName: 'fundOracle',
              args: [],
              value: ethAmount,
            })
          }
        >
          {actionLabel(tx, 'fund-eth', 'Donate bounty ETH')}
        </button>
        <TxFeedback id="fund-eth" tx={tx} rt={rt} />
        <label>
          Prize donation (BEG)
          <input
            inputMode="decimal"
            value={beg}
            onChange={(e) => setBeg(e.target.value)}
            placeholder="0.00"
            name="begDonation"
          />
        </label>
        <button
          disabled={
            !ready ||
            tx.busy ||
            !begAmount ||
            !wallet ||
            wallet.begBalance < begAmount
          }
          onClick={() =>
            void tx.prepare({
              key: 'fund-beg',
              label: 'Donate BEG',
              description: `Permanently transfer ${exact(begAmount, state?.tokenDecimals)} BEG to the prize vault. This can open an unfunded vault.`,
              address: rt.token.address,
              abi: rt.token.abi,
              functionName: 'transfer',
              args: [rt.vault.address, begAmount],
            })
          }
        >
          {actionLabel(tx, 'fund-beg', 'Donate BEG')}
        </button>
        <TxFeedback id="fund-beg" tx={tx} rt={rt} />
      </details>
    </section>
  );
}
