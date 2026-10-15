import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { getAddress, numberToHex, type EIP1193Provider } from 'viem';
import type { Runtime } from './config';
import type { Deployment } from './types';
import { humanError } from './domain';
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const focus = document.activeElement as HTMLElement;
    dialog.showModal();
    return () => {
      dialog.close();
      focus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current!.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function unknownChain(error: unknown) {
  let e = error as { code?: number; message?: string; cause?: unknown };
  for (let i = 0; e && i < 8; i++, e = e.cause as typeof e)
    if (
      e.code === 4902 ||
      /unknown chain|unrecognized chain|chain.*not.*add/i.test(e.message ?? '')
    )
      return true;
  return false;
}
export async function switchNetwork(
  provider: EIP1193Provider,
  deployment: Deployment,
) {
  const chainId = numberToHex(deployment.chainId);
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (e) {
    if (!unknownChain(e) || !deployment.walletAddChain) throw e;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [deployment.walletAddChain],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  }
}
export const OPEN_IN = [
  {
    name: 'MetaMask',
    icon: 'metaMask',
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, '')}`,
  },
  {
    name: 'Coinbase Wallet',
    icon: 'coinbase',
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    name: 'Rabby',
    icon: 'rabby',
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    name: 'Phantom',
    icon: 'phantom',
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export function Wallet({ rt }: { rt: Runtime }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false),
    [accountOpen, setAccountOpen] = useState(false),
    [error, setError] = useState(''),
    [switching, setSwitching] = useState(false),
    [copied, setCopied] = useState(false);
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !connectors.some((c) => c.type === 'injected' && c.id !== 'injected') &&
    !(window as unknown as { ethereum?: unknown }).ethereum;
  const named = connectors.some(
    (c) => c.type === 'injected' && c.id !== 'injected',
  );
  const listed = connectors
    .filter(
      (c) =>
        !(c.id === 'injected' && named) && (!mobile || c.type !== 'injected'),
    )
    .sort(
      (a, b) => Number(b.type === 'injected') - Number(a.type === 'injected'),
    );
  useEffect(() => {
    let active = true;
    if (isConnected && connector && typeof connector.getProvider === 'function')
      void connector
        .getProvider()
        .then((p) => {
          if (active) rt.setWalletProvider(p as EIP1193Provider);
        })
        .catch(() => {
          if (active) rt.setWalletProvider(undefined);
        });
    else rt.setWalletProvider(undefined);
    return () => {
      active = false;
      rt.setWalletProvider(undefined);
    };
  }, [rt, connector, isConnected]);
  const switchChain = async () => {
    if (!connector || typeof connector.getProvider !== 'function') return;
    setSwitching(true);
    setError('');
    try {
      await switchNetwork(
        (await connector.getProvider()) as EIP1193Provider,
        rt.deployment,
      );
    } catch (e) {
      setError(humanError(e));
    } finally {
      setSwitching(false);
    }
  };
  return (
    <div className="wallet-control">
      <button
        type="button"
        className="wallet-button"
        onClick={() => {
          setError('');
          if (isConnected && chainId !== rt.chain.id) void switchChain();
          else if (isConnected) setAccountOpen(true);
          else setOpen(true);
        }}
        disabled={switching}
      >
        {switching
          ? 'Switching…'
          : isConnected && chainId !== rt.chain.id
            ? `Switch to ${rt.chain.name}`
            : address
              ? `${address.slice(0, 6)}…${address.slice(-4)}`
              : 'Connect'}
      </button>
      {error && !open && (
        <p className="wallet-error" role="alert">
          {error}
        </p>
      )}
      {open && (
        <Modal title="Connect a wallet" onClose={() => setOpen(false)}>
          <p className="muted">Your wallet signs on {rt.chain.name}.</p>
          {mobile &&
            OPEN_IN.map((w) => (
              <a
                className="wallet-row"
                key={w.name}
                href={w.href(location.href)}
              >
                <img
                  src={`./wallets/${w.icon}.svg`}
                  width="28"
                  height="28"
                  alt=""
                />
                Open in {w.name}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          {listed.map((c) => (
            <button
              type="button"
              className="wallet-row"
              disabled={isPending}
              key={c.uid}
              onClick={async () => {
                setError('');
                try {
                  await connectAsync({ connector: c });
                  setOpen(false);
                  try {
                    await switchNetwork(
                      (await c.getProvider()) as EIP1193Provider,
                      rt.deployment,
                    );
                  } catch (e) {
                    setError(humanError(e));
                  }
                } catch (e) {
                  setError(humanError(e));
                }
              }}
            >
              {c.icon ? (
                <img src={c.icon} alt="" width="28" height="28" />
              ) : c.id === 'coinbaseWalletSDK' ? (
                <img
                  src="./wallets/coinbase.svg"
                  alt=""
                  width="28"
                  height="28"
                />
              ) : (
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  aria-hidden="true"
                >
                  <rect
                    x="3"
                    y="6"
                    width="22"
                    height="17"
                    rx="3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path d="M18 12h7v6h-7z" fill="currentColor" />
                </svg>
              )}
              <span>
                {c.id === 'injected'
                  ? 'Browser wallet'
                  : c.id === 'coinbaseWalletSDK' && mobile
                    ? 'Coinbase Smart Wallet'
                    : c.name}
                {isPending && variables?.connector === c ? ' · opening…' : ''}
              </span>
            </button>
          ))}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {mobile && (
            <p className="small muted">
              If a link opens the wallet home screen, paste this page’s URL into
              its browser.
            </p>
          )}
        </Modal>
      )}
      {accountOpen && address && (
        <Modal title="Your wallet" onClose={() => setAccountOpen(false)}>
          <p className="address">{getAddress(address)}</p>
          <div className="actions">
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(getAddress(address))
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError('Copy unavailable. Select the address above.'),
                  )
              }
            >
              {copied ? 'Copied' : 'Copy address'}
            </button>
            <a
              className="button"
              href={`${rt.deployment.network.explorer}/address/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer ↗
            </a>
          </div>
          <button
            className="wide"
            onClick={() => {
              disconnect();
              setAccountOpen(false);
            }}
          >
            Disconnect
          </button>
        </Modal>
      )}
    </div>
  );
}
