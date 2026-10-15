import { decodeErrorResult, formatUnits, parseUnits, type Hex } from 'viem';
import { routerErrors } from './protocol';
import type { Batch } from './types';
export const TIERS = ['Nothing', 'Common', 'Rare', 'Epic', 'Jackpot'] as const;
export const STATUS = [
  'Waiting',
  'Judging',
  'Graded',
  'Rolled',
  'Expired',
] as const;
export function bytes(text: string) {
  return new TextEncoder().encode(text).length;
}
export function messageIssue(text: string) {
  if (!text.length) return 'Write your plea first.';
  if (bytes(text) > 280) return 'Keep your plea within 280 UTF-8 bytes.';
  if (
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      text,
    )
  )
    return 'Remove the incomplete Unicode character.';
  if (bytes(JSON.stringify(text).slice(1, -1)) > 400)
    return 'Too many escaped characters. Use fewer quotes, slashes or control characters.';
  return '';
}
export function amount(text: string, decimals: number): bigint | undefined {
  if (
    !/^(?:0|[1-9]\d*)(?:\.\d*)?$/.test(text) ||
    (text.split('.')[1]?.length ?? 0) > decimals
  )
    return undefined;
  try {
    const n = parseUnits(text, decimals);
    return n > 0n ? n : undefined;
  } catch {
    return undefined;
  }
}
export function fmt(n: bigint | undefined, decimals = 18, max = 5) {
  if (n === undefined) return '…';
  const [i, f = ''] = formatUnits(n, decimals).split('.');
  const fraction = f.slice(0, max).replace(/0+$/, '');
  if (n > 0n && i === '0' && !fraction && f.length)
    return `<0.${'0'.repeat(max - 1)}1`;
  return BigInt(i).toLocaleString('en-US') + (fraction ? '.' + fraction : '');
}
export const exact = (n: bigint | undefined, decimals = 18) =>
  n === undefined ? '…' : formatUnits(n, decimals);
export function odds(score: number) {
  const s = Math.max(0, Math.min(100, Math.floor(score)));
  const jackpot = 1 + Math.floor((199 * s) / 100),
    epic = 200 + 11 * s,
    rare = 800 + 22 * s,
    common = 2000 + 15 * s;
  return [10000 - jackpot - epic - rare - common, common, rare, epic, jackpot];
}
export function batchActions(
  batch: Batch | undefined,
  now: number,
  block: bigint,
  window = 1800,
  timeout = 86400,
) {
  if (!batch || !batch.size)
    return {
      close: false,
      reveal: false,
      expire: false,
      rearm: false,
      deadline: 0,
    };
  const opened = Number(batch.openedAt),
    closed = Number(batch.closedAt);
  const deadline =
    batch.status === 0 ? opened + window + timeout : closed + timeout;
  return {
    close: batch.status === 0 && now >= opened + window && now < deadline,
    reveal: batch.status === 2 && block > batch.rollBlock,
    expire: (batch.status === 0 || batch.status === 1) && now >= deadline,
    rearm: batch.status === 2 && block > batch.rollBlock + 256n,
    deadline,
  };
}
export function remaining(seconds: number) {
  const n = Math.max(0, Math.ceil(seconds));
  return n >= 3600
    ? `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`
    : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
export const ERRORS: Record<string, string> = {
  V4TooLittleReceived:
    'The pool would return less than your minimum. Get a fresh quote or lower the amount.',
  V4TooMuchRequested:
    'The pool requires more input than allowed. Get a fresh quote.',
  TransactionDeadlinePassed: 'The swap deadline has passed. Get a new quote.',
  AllowanceExpired: 'The Permit2 approval expired. Authorize the router again.',
  InsufficientAllowance:
    'The Permit2 allowance is too low. Approve the required amount.',
  VaultEmpty: 'Vault opening soon. BEG funding has not arrived.',
  WrongPayment:
    'The payment must match the current entry price. Refresh and try again.',
  InvalidMessageLength: 'Use 1–280 UTF-8 bytes.',
  InvalidUTF8:
    'The message contains invalid text encoding. Retype the affected characters.',
  BodyTooLarge: 'Use fewer escaped characters, quotes or control characters.',
  DuplicateMessage:
    'This exact message has already been used. Write a new plea.',
  CooldownActive:
    'Your ten-minute cooldown is still active. Wait for the countdown.',
  BatchNotReady:
    'This batch is empty, closed or still accepting entries. Refresh its state.',
  BatchTimedOut:
    'The deadline has passed. Expire this batch to enable refunds.',
  OracleUnfunded:
    'The oracle request could not be paid or accepted. Check the IMD budget and try again later.',
  UnknownBatch: 'This batch does not exist. Check the batch number.',
  UnknownAttempt: 'This attempt does not exist. Refresh the feed.',
  InvalidBatchState:
    'This action is unavailable in the current batch state. Refresh.',
  TooEarly: 'Wait for the displayed reveal block or expiry deadline.',
  NotPlayer:
    'Only the wallet that submitted this entry can request its refund.',
  AlreadyRefunded: 'This entry was already refunded. Check your claimable ETH.',
  NothingToClaim: 'This wallet has no outstanding credit to claim.',
  ETHTransferFailed:
    'Your wallet contract rejected ETH. Claim credit is preserved.',
  ReentrancyGuardReentrantCall:
    'A nested contract call was rejected. Credits are preserved.',
  NotIntake: 'Only the configured Intake can deliver grades.',
  InvalidQuestionId: 'The oracle request ID is missing, unknown or reused.',
  InvalidPanel: 'The oracle panel did not meet the agreement requirement.',
  WrongChain: 'The oracle result is for a different chain.',
  StaleAnswer: 'The result predates this request.',
  AttestationExpired: 'The signed oracle result has expired.',
  AttestationNotYetValid: 'The signed oracle result is not valid yet.',
  BadSignature: 'The oracle signature could not be verified.',
  AlreadyConsumed: 'This signed result has already been used.',
  WrongAnswerType: 'The oracle returned an unexpected answer format.',
  WrongScoreCount: 'The oracle returned the wrong number of scores.',
  InvalidConfiguration:
    'The deployment configuration is invalid. Signing is unavailable.',
  ZeroSigner: 'The oracle signer is invalid. Signing is unavailable.',
  MessageStoreFailed:
    'Message storage failed. The entry payment was not retained.',
  MalformedEscape:
    'Stored message decoding failed. Refresh and report the attempt number.',
  SafeERC20FailedOperation:
    'A token transfer or approval failed. Check balances and allowances.',
  StringTooLong:
    'An internal text encoding limit was exceeded. Shorten the message.',
  InvalidShortString:
    'An internal text encoding error occurred. Refresh and retry.',
  ERC20InsufficientBalance: 'Your token balance is too low for this amount.',
  ERC20InsufficientAllowance:
    'Token approval is too low. Approve the required amount first.',
  ERC20InvalidSender: 'The sending address is invalid.',
  ERC20InvalidReceiver: 'The receiving address is invalid.',
  ERC20InvalidApprover: 'The approval owner is invalid.',
  ERC20InvalidSpender: 'The approval spender is invalid.',
};
export function humanError(error: unknown): string {
  const seen = new Set<unknown>();
  let e = error as {
    code?: number;
    data?: { errorName?: string; args?: unknown[] };
    shortMessage?: string;
    message?: string;
    reason?: string;
    cause?: unknown;
  };
  let raw = '',
    reason = '',
    decodedName = '';
  while (e && !seen.has(e)) {
    seen.add(e);
    if (e.code === 4001 || e.code === 5000)
      return 'Request declined in your wallet. Nothing was submitted.';
    const name = e.data?.errorName;
    if (name === 'ExecutionFailed' && typeof e.data?.args?.[1] === 'string') {
      try {
        const nested = decodeErrorResult({
          abi: routerErrors,
          data: e.data.args[1] as Hex,
        });
        return humanError({ data: nested });
      } catch {
        reason =
          'A router command failed. Check approval, pool liquidity and your minimum output.';
      }
    }
    if (name === 'Error' && e.data?.args?.[0]) reason = String(e.data.args[0]);
    if (name) decodedName = name;
    if (e.reason) reason = e.reason;
    if (name && ERRORS[name])
      return name === 'CooldownActive' && e.data?.args?.[0]
        ? `You can beg again at ${new Date(Number(e.data.args[0]) * 1000).toLocaleTimeString()}.`
        : ERRORS[name];
    raw += ' ' + (e.shortMessage ?? e.message ?? '');
    e = e.cause as typeof e;
  }
  for (const [name, message] of Object.entries(ERRORS))
    if (raw.includes(name)) return message;
  if (/reject|denied/i.test(raw))
    return 'Request declined in your wallet. Nothing was submitted.';
  if (/provider.*not found|connector.*not found/i.test(raw))
    return 'No browser wallet found. Open this page in a wallet app or choose Coinbase Wallet.';
  if (/insufficient funds/i.test(raw))
    return 'Not enough ETH for the payment and network fee.';
  if (/chain|network mismatch/i.test(raw))
    return 'Switch your wallet to the required network and retry.';
  if (error instanceof Error && error.name === 'UserFacingError')
    return error.message;
  if (reason) return `Contract rejected the action: ${reason.slice(0, 300)}`;
  if (decodedName)
    return `Contract rejected the action (${decodedName}). Refresh the quote and check the amount and allowance.`;
  return 'The request could not complete. Refresh your connection and try again. Any submitted transaction is linked below.';
}
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}
export const encodeCache = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    typeof v === 'bigint' ? { $bigint: v.toString() } : v,
  );
export const decodeCache = <T>(value: string): T =>
  JSON.parse(value, (_, v) =>
    v && typeof v === 'object' && Object.keys(v).length === 1 && '$bigint' in v
      ? BigInt(v.$bigint)
      : v,
  );
