import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { keccak256, toBytes, getAddress } from 'viem';
import type { Runtime } from './config';
import type { Entry } from './types';
import { useChainData, useHistory, readVault, readBatch } from './data';
import {
  bytes,
  messageIssue,
  exact,
  fmt,
  odds,
  remaining,
  STATUS,
  TIERS,
  UserFacingError,
} from './domain';
import { Wallet } from './Wallet';
import { Eye } from './Eye';
import { Keepers } from './Keepers';
import { Swap } from './Swap';
import { useTransactions, TxFeedback, actionLabel } from './transactions';
function AddressLink({ address, rt }: { address: string; rt: Runtime }) {
  return (
    <a
      className="address"
      href={`${rt.deployment.network.explorer}/address/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      {getAddress(address)}
    </a>
  );
}
function Message({
  entry,
  status,
  rt,
  refund,
}: {
  entry: Entry;
  status: number;
  rt: Runtime;
  refund?: React.ReactNode;
}) {
  return (
    <article className="message">
      <div className="message-meta">
        <span>
          #{entry.id.toString()} · batch {entry.batchId.toString()}
        </span>
        <span className={`status tier-${entry.tier ?? 'none'}`}>
          {status === 3 ? TIERS[entry.tier ?? 0] : STATUS[status]}
          {entry.score !== undefined ? ` · ${entry.score}/100` : ''}
        </span>
      </div>
      <blockquote dir="auto">{entry.message}</blockquote>
      <div className="message-foot">
        <a
          href={`${rt.deployment.network.explorer}/address/${entry.player}`}
          target="_blank"
          rel="noreferrer"
          title={getAddress(entry.player)}
        >
          {entry.player.slice(0, 6)}…{entry.player.slice(-4)} ↗
        </a>
        {status === 3 && (
          <span>
            {fmt(entry.tokens)} BEG{entry.eth ? ` + ${fmt(entry.eth)} ETH` : ''}{' '}
            awarded
          </span>
        )}
        {entry.refunded && <span>Refund credited</span>}
      </div>
      {refund}
    </article>
  );
}
export function App({ rt }: { rt: Runtime }) {
  const { address, chainId, isConnected } = useAccount();
  const { state, wallet, error, loading, refresh } = useChainData(rt, address);
  const history = useHistory(rt, state?.block);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const fresh =
    !!state && state.verified && Date.now() - state.fetchedAt < 45000;
  const ready =
    fresh &&
    isConnected &&
    !!address &&
    chainId === rt.chain.id &&
    !!wallet &&
    !error;
  const tx = useTransactions(rt, ready, refresh);
  const [message, setMessage] = useState(''),
    [duplicate, setDuplicate] = useState<
      'idle' | 'checking' | 'used' | 'free' | 'error'
    >('idle');
  const [score, setScore] = useState(50),
    [feedLimit, setFeedLimit] = useState(20),
    [mineLimit, setMineLimit] = useState(10);
  const previous = useRef<bigint | undefined>(undefined);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (
      previous.current !== undefined &&
      state &&
      state.attempts > previous.current
    ) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 900);
      previous.current = state.attempts;
      return () => clearTimeout(t);
    }
    previous.current = state?.attempts;
  }, [state?.attempts]);
  const issue = messageIssue(message),
    count = bytes(message);
  useEffect(() => {
    let cancelled = false;
    setDuplicate('idle');
    if (issue || !fresh) return;
    setDuplicate('checking');
    const t = setTimeout(() => {
      void readVault<boolean>(rt, 'usedMessage', [keccak256(toBytes(message))])
        .then((used) => {
          if (!cancelled) setDuplicate(used ? 'used' : 'free');
        })
        .catch(() => {
          if (!cancelled) setDuplicate('error');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [message, issue, fresh, rt, state?.block]);
  const chainNow = state
    ? state.timestamp + Math.floor((Date.now() - state.fetchedAt) / 1000)
    : now;
  const cool = wallet ? Math.max(0, wallet.cooldownUntil - chainNow) : 0;
  const funded = state && state.vaultBalance > 0n;
  const closingEntry =
    state &&
    state.batch.size === state.maxBatch - 1 &&
    chainNow < Number(state.batch.openedAt) + state.window;
  const oracleReady =
    state &&
    state.oracleFee > 0n &&
    state.oracleImd >= state.oracleFee &&
    state.intakeAllowance >= state.oracleFee;
  const reason = !address
    ? 'Connect above to send your plea.'
    : chainId !== rt.chain.id
      ? `Switch to ${rt.chain.name} above.`
      : !fresh
        ? 'Waiting for verified live state.'
        : !funded
          ? 'Vault opening soon'
          : cool
            ? `You can beg again in ${remaining(cool)}.`
            : wallet && state && wallet.ethBalance <= state.price
              ? 'Add ETH for the entry and network fee.'
              : closingEntry && !oracleReady
                ? 'This entry closes the batch. Fund the oracle first.'
                : duplicate === 'used'
                  ? 'This exact message has already been used.'
                  : duplicate === 'error'
                    ? 'Duplicate check unavailable. Refresh to retry.'
                    : message && issue
                      ? issue
                      : duplicate === 'checking'
                        ? 'Checking this plea…'
                        : 'Your message stays public. Make it count.';
  const canBeg =
    ready &&
    funded &&
    !cool &&
    !issue &&
    duplicate === 'free' &&
    (!closingEntry || oracleReady) &&
    wallet &&
    state &&
    wallet.ethBalance > state.price;
  const beg = () => {
    if (!state || !address) return;
    void tx.prepare({
      key: 'beg',
      label: 'Beg',
      description: `Submit this public message for ${fmt(state.price)} ETH plus gas. Prizes are not guaranteed. A successful entry starts a ten-minute cooldown.`,
      address: rt.vault.address,
      abi: rt.vault.abi,
      functionName: 'attempt',
      args: [message],
      value: state.price,
      before: async () => {
        const [used, until] = await Promise.all([
          readVault<boolean>(rt, 'usedMessage', [keccak256(toBytes(message))]),
          readVault<bigint>(rt, 'cooldownUntil', [address]),
        ]);
        if (used)
          throw new UserFacingError(
            'This exact message has already been used. Write a new plea.',
          );
        if (Number(until) > Math.floor(Date.now() / 1000))
          throw new UserFacingError(
            'Your cooldown is still active. Wait before begging again.',
          );
        if (messageIssue(message))
          throw new UserFacingError(messageIssue(message));
      },
    });
  };
  const mine = history.entries.filter(
    (e) => e.player.toLowerCase() === address?.toLowerCase(),
  );
  const top = [...history.entries]
    .filter((e) => e.score !== undefined)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || Number(a.id - b.id))
    .slice(0, 3);
  const jackpots = history.entries.filter((e) => e.tier === 4).slice(0, 3);
  const chance = odds(score);
  const refund = (e: Entry) =>
    void tx.prepare({
      key: `refund-${e.id}`,
      label: 'Refund entry',
      description: `Move the full ${fmt(state?.price)} ETH entry fee for attempt #${e.id} to your claimable balance. Claim it in a separate transaction.`,
      address: rt.vault.address,
      abi: rt.vault.abi,
      functionName: 'refund',
      args: [e.id],
      before: async () => {
        const b = await readBatch(rt, e.batchId);
        if (b.status !== 4)
          throw new UserFacingError(
            'This batch is not expired. Refresh before requesting a refund.',
          );
      },
    });
  return (
    <>
      <a className="skip" href="#beg">
        Skip to begging
      </a>
      <div className="site-shell">
        <header>
          <a className="wordmark" href="#" aria-label="Beg the Swarm home">
            <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true">
              <path
                d="M2 11Q15-5 28 11Q15 27 2 11Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="15" cy="11" r="4" fill="currentColor" />
            </svg>
            <span>
              beg<span className="wordmark-dot">.</span>
            </span>
          </a>
          <nav aria-label="Main">
            <a href="#feed">The feed</a>
            <a href="#how">The rules</a>
          </nav>
          <Wallet rt={rt} />
        </header>
        <main>
          <section className="hero" aria-labelledby="headline">
            <div>
              <h1 id="headline">
                Beg the
                <br className="desktop-break" /> <span>Swarm.</span>
              </h1>
              <p>
                Convince the IMD swarm to give you tokens. It reads everything.
              </p>
            </div>
            <div className="eye-wrap">
              <Eye pulse={pulse} />
              <span className="eye-caption" aria-hidden="true">
                {pulse ? 'A new plea has landed.' : 'The swarm is watching.'}
              </span>
            </div>
          </section>
          <div className="play-grid">
            <section id="beg" className="beg-box" aria-labelledby="beg-title">
              <div className="section-title">
                <h2 id="beg-title">Make your case</h2>
                <span className="price">{fmt(state?.price)} ETH / plea</span>
              </div>
              <p
                className={`vault-status ${state && !funded ? 'warning' : ''}`}
              >
                {state
                  ? funded
                    ? `${fmt(state.free, state.tokenDecimals, 2)} BEG in the free vault`
                    : 'Vault opening soon'
                  : 'Reading the vault…'}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canBeg && !tx.busy) beg();
                }}
              >
                <label htmlFor="plea">Your plea to the swarm</label>
                <textarea
                  id="plea"
                  name="plea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Dear all-seeing swarm, my houseplant has a better portfolio than I do…"
                  aria-describedby="byte-count beg-help"
                  aria-invalid={!!message && (!!issue || duplicate === 'used')}
                  spellCheck
                  rows={4}
                />
                <div className="field-meta">
                  <span>Persuasive, original or funny.</span>
                  <span id="byte-count" className={count > 280 ? 'error' : ''}>
                    {count} / 280 bytes
                  </span>
                </div>
                <button
                  className="primary beg-button"
                  type="submit"
                  disabled={!canBeg || tx.busy}
                >
                  {actionLabel(
                    tx,
                    'beg',
                    state && !funded ? 'Vault opening soon' : 'Beg',
                  )}
                  <span aria-hidden="true">↗</span>
                </button>
                <p
                  id="beg-help"
                  className={`small ${duplicate === 'used' || (message && issue) ? 'error' : 'muted'}`}
                  role="status"
                >
                  {reason}
                </p>
              </form>
              <TxFeedback tx={tx} id="beg" rt={rt} />
            </section>
            <aside className="live-stats" aria-label="Live contract state">
              <div className="section-title">
                <h2>The pot, right now</h2>
                <span className="live-label">
                  <i className={fresh ? 'live-dot' : ''} />
                  {fresh ? 'Live' : state ? 'Cached' : 'Connecting'}
                </span>
              </div>
              <div className="jackpot">
                <span>Jackpot bank</span>
                <strong>
                  {fmt(state?.jackpot)} <span>ETH</span>
                </strong>
                <p className="small muted">A jackpot wins half the bank.</p>
              </div>
              <dl className="stats-grid">
                <div>
                  <dt>Free vault</dt>
                  <dd>{fmt(state?.free, state?.tokenDecimals, 2)} BEG</dd>
                </div>
                <div>
                  <dt>Total attempts</dt>
                  <dd>{state?.attempts.toLocaleString() ?? '…'}</dd>
                </div>
                <div>
                  <dt>Current batch</dt>
                  <dd>
                    #{state?.openBatchId.toString() ?? '…'} ·{' '}
                    {state?.batch.size ?? '…'}/{state?.maxBatch ?? 20}
                  </dd>
                </div>
                <div>
                  <dt>Batch countdown</dt>
                  <dd>
                    {!state
                      ? '…'
                      : state.batch.size === 0
                        ? 'Starts with a plea'
                        : remaining(
                            Number(state.batch.openedAt) +
                              state.window -
                              chainNow,
                          )}
                  </dd>
                </div>
                <div>
                  <dt>Oracle budget</dt>
                  <dd>{fmt(state?.oracleImd, state?.imdDecimals)} IMD</dd>
                </div>
                <div>
                  <dt>Bounty budget</dt>
                  <dd>{fmt(state?.bountyBudget)} ETH</dd>
                </div>
              </dl>
              <div className="sync-line">
                <span className="small muted">
                  {state
                    ? `Block ${state.block.toString()} · every 15s`
                    : 'Reading Ethereum'}
                </span>
                <button
                  className="text-button"
                  disabled={loading}
                  onClick={() => void refresh()}
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              {error && (
                <p className="error small" role="alert">
                  Live reads unavailable. Cached figures cannot enable
                  transactions. Refresh to retry.
                </p>
              )}
            </aside>
          </div>
          <section className="odds section" id="odds">
            <div className="odds-intro">
              <h2>
                Better begging.
                <br />
                Better odds.
              </h2>
              <p className="muted">
                Explore a score. The swarm gives the real one.
              </p>
              <label htmlFor="score">
                Swarm score <output htmlFor="score">{score} / 100</output>
              </label>
              <input
                type="range"
                id="score"
                min="0"
                max="100"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
              />
              <div className="range-labels small muted">
                <span>No effort</span>
                <span>Artful desperation</span>
              </div>
            </div>
            <div
              className="odds-table"
              role="table"
              aria-label="Prize odds at selected score"
            >
              <div className="odds-row table-head" role="row">
                <span role="columnheader">Outcome</span>
                <span role="columnheader">Chance</span>
                <span role="columnheader">BEG prize*</span>
              </div>
              {[4, 3, 2, 1, 0].map((tier) => (
                <div className={`odds-row tier-${tier}`} role="row" key={tier}>
                  <span role="cell">{TIERS[tier]}</span>
                  <span role="cell">{(chance[tier] / 100).toFixed(2)}%</span>
                  <span role="cell">
                    {state
                      ? fmt(
                          tier
                            ? state.free /
                                [1n, 50000n, 10000n, 2000n, 100n][tier]
                            : 0n,
                          state.tokenDecimals,
                          2,
                        )
                      : '…'}
                  </span>
                </div>
              ))}
              <p className="small muted">
                *At today’s free balance. Prizes shrink as earlier entries win.
                Jackpot adds 50% of the ETH bank. Missed reveal windows remove
                the highest remaining tier.
              </p>
            </div>
          </section>
          <div className="content-grid">
            <div>
              <section id="feed" className="section feed">
                <div className="section-title">
                  <h2>The begging feed</h2>
                  <span className="small muted">Public, forever</span>
                </div>
                <p className="small muted">
                  {history.running
                    ? 'Syncing events…'
                    : history.complete
                      ? 'Synced from deployment'
                      : `Syncing from block ${rt.provenance.deploymentBlock}`}{' '}
                  · through {history.through.toString()}
                </p>
                {history.error && (
                  <div role="alert">
                    <p className="error">{history.error}</p>
                    <button onClick={() => void history.sync()}>
                      Retry history
                    </button>
                  </div>
                )}
                {!history.entries.length ? (
                  <div className="empty">
                    <span className="empty-eye" aria-hidden="true">
                      ◉
                    </span>
                    <h3>No pleas in this history yet.</h3>
                    <p className="muted">
                      The swarm has an excellent memory. Give it something to
                      remember.
                    </p>
                    <a href="#beg">Write the first plea ↗</a>
                  </div>
                ) : (
                  history.entries
                    .slice(0, feedLimit)
                    .map((e) => (
                      <Message
                        key={String(e.id)}
                        entry={e}
                        status={history.statuses.get(String(e.batchId)) ?? 0}
                        rt={rt}
                      />
                    ))
                )}
                {history.entries.length > feedLimit && (
                  <button
                    className="wide"
                    onClick={() => setFeedLimit((n) => n + 20)}
                  >
                    Show older pleas
                  </button>
                )}
              </section>
              <section className="section" id="fame">
                <h2>Hall of fame</h2>
                <p className="muted small">
                  Highest scores and jackpot winners in the indexed history
                  {history.complete
                    ? '.'
                    : ' so far. History is still syncing.'}
                </p>
                <h3>Silver tongues</h3>
                {top.length ? (
                  top.map((e) => (
                    <Message
                      key={String(e.id)}
                      entry={e}
                      status={history.statuses.get(String(e.batchId)) ?? 0}
                      rt={rt}
                    />
                  ))
                ) : (
                  <p className="muted">No graded pleas yet.</p>
                )}
                <h3>Jackpot winners</h3>
                {jackpots.length ? (
                  jackpots.map((e) => (
                    <Message key={String(e.id)} entry={e} status={3} rt={rt} />
                  ))
                ) : (
                  <p className="muted">
                    No jackpot winners in the indexed history.
                  </p>
                )}
              </section>
              <section className="section" id="mine">
                <div className="section-title">
                  <h2>My stuff</h2>
                  {address && (
                    <span className="small muted">Connected wallet</span>
                  )}
                </div>
                {!address ? (
                  <p className="muted">
                    Connect above to see your pleas, prizes and refunds.
                  </p>
                ) : (
                  <>
                    <p className="small">
                      <AddressLink address={address} rt={rt} />
                    </p>
                    <dl className="claim-balances">
                      <div>
                        <dt>Claimable BEG</dt>
                        <dd>{exact(wallet?.tokens, state?.tokenDecimals)}</dd>
                      </div>
                      <div>
                        <dt>Claimable ETH</dt>
                        <dd>{exact(wallet?.eth)}</dd>
                      </div>
                    </dl>
                    <button
                      disabled={
                        !ready ||
                        tx.busy ||
                        !wallet ||
                        !(wallet.tokens || wallet.eth)
                      }
                      onClick={() =>
                        void tx.prepare({
                          key: 'claim',
                          label: 'Claim prizes and credits',
                          description: `Withdraw all available credit: ${exact(wallet?.tokens, state?.tokenDecimals)} BEG and ${exact(wallet?.eth)} ETH to your connected wallet.`,
                          address: rt.vault.address,
                          abi: rt.vault.abi,
                          functionName: 'claim',
                        })
                      }
                    >
                      {actionLabel(tx, 'claim', 'Claim prizes and credits')}
                    </button>
                    <TxFeedback id="claim" tx={tx} rt={rt} />
                    <p className="small muted">
                      Refund first credits your account; Claim sends the funds.
                      Prizes shown in the feed are historical awards.
                    </p>
                    {mine.length ? (
                      mine.slice(0, mineLimit).map((e) => (
                        <Message
                          key={String(e.id)}
                          entry={e}
                          status={history.statuses.get(String(e.batchId)) ?? 0}
                          rt={rt}
                          refund={
                            <>
                              {history.statuses.get(String(e.batchId)) === 4 &&
                                !e.refunded && (
                                  <button
                                    disabled={!ready || tx.busy}
                                    onClick={() => refund(e)}
                                  >
                                    {actionLabel(
                                      tx,
                                      `refund-${e.id}`,
                                      `Refund entry #${e.id}`,
                                    )}
                                  </button>
                                )}
                              <TxFeedback
                                id={`refund-${e.id}`}
                                tx={tx}
                                rt={rt}
                              />
                            </>
                          }
                        />
                      ))
                    ) : (
                      <p className="muted">
                        No pleas from this wallet in the indexed history.
                      </p>
                    )}
                    {mine.length > mineLimit && (
                      <button onClick={() => setMineLimit((n) => n + 10)}>
                        Show more of my pleas
                      </button>
                    )}
                  </>
                )}
              </section>
            </div>
            <div>
              <Keepers
                rt={rt}
                state={state}
                wallet={wallet}
                ready={ready}
                tx={tx}
                now={chainNow}
              />
              <Swap rt={rt} state={state} ready={ready} tx={tx} now={now} />
            </div>
          </div>
          <section className="section how" id="how">
            <h2>Five steps to possible glory.</h2>
            <ol>
              <li>
                <h3>Make a plea</h3>
                <p>
                  Pay {fmt(state?.price)} ETH plus gas for 1–280 UTF-8 bytes.
                  Exact messages cannot repeat. Wait ten minutes between
                  successful entries.
                </p>
              </li>
              <li>
                <h3>Face the swarm</h3>
                <p>
                  Twenty entries or 30 minutes form a batch. Anyone closes it.
                  Five oracle panelists judge persuasion, originality and humor;
                  at least three must agree. Instruction tricks score zero.
                </p>
              </li>
              <li>
                <h3>Roll your luck</h3>
                <p>
                  A score improves your odds, never guarantees a prize. Anyone
                  reveals after the target block. Block randomness can be
                  influenced; this is not verifiable random sampling.
                </p>
              </li>
              <li>
                <h3>Collect the spoils</h3>
                <p>
                  Claim BEG and ETH credits. On grading, 10% of entry ETH goes
                  to the immutable team recipient, up to 10% (capped at 0.001
                  ETH per batch) funds bounties, and the rest fills the jackpot.
                </p>
              </li>
              <li>
                <h3>Or get your entry back</h3>
                <p>
                  If grading fails, anyone expires the batch after 24 hours from
                  closing, or 24 hours after an unclosed batch’s 30-minute
                  window. Refund your entry, then Claim. Gas and donated IMD are
                  not refunded.
                </p>
              </li>
            </ol>
            <p className="rules-note">
              Immutable rules. No owner controls, upgrades or pause. Messages
              stay public. Play only with ETH you can afford to lose.
            </p>
          </section>
          <section className="contracts section">
            <h2>Check the machinery</h2>
            <p className="small muted">
              Runtime deployment and ABI binding are verified before play.
              Explorer links let you inspect the contracts.
            </p>
            {rt.deployment.contracts.map((c) => (
              <div className="contract-line" key={c.name}>
                <span>{c.name}</span>
                <AddressLink address={c.address} rt={rt} />
                <button
                  className="text-button"
                  onClick={(e) => {
                    const button = e.currentTarget;
                    void navigator.clipboard
                      .writeText(getAddress(c.address))
                      .then(() => {
                        button.textContent = 'Copied';
                      })
                      .catch(() => {
                        button.textContent = 'Select address to copy';
                      });
                  }}
                >
                  Copy
                </button>
              </div>
            ))}
            <a className="small" href="./imd-deployment.json">
              View deployment manifest ↗
            </a>
          </section>
        </main>
        <footer>
          <a className="wordmark" href="#">
            beg.
          </a>
          <p>At the mercy of the swarm.</p>
          <div>
            <a href="https://x.com/imdplace" target="_blank" rel="noreferrer">
              X ↗
            </a>
            <a
              href={`${rt.deployment.network.explorer}/address/${rt.vault.address}`}
              target="_blank"
              rel="noreferrer"
            >
              Contract ↗
            </a>
            <a href={rt.provenance.repoUrl} target="_blank" rel="noreferrer">
              Source ↗
            </a>
          </div>
        </footer>
      </div>
      {tx.review}
    </>
  );
}
