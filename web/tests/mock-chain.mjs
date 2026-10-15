import { readFile } from 'node:fs/promises';
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  encodeEventTopics,
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  toHex,
  keccak256,
  toBytes,
  zeroAddress,
} from 'viem';
export const manifest = JSON.parse(
  await readFile(
    new URL('../../dist/imd-deployment.json', import.meta.url),
    'utf8',
  ),
);
export const vault = manifest.contracts.find((c) => c.name === 'BegVault');
export const token = manifest.contracts.find((c) => c.name === 'LaunchToken');
export const vaultAbi = JSON.parse(
  await readFile(
    new URL(`../../dist/${vault.abiPath}`, import.meta.url),
    'utf8',
  ),
);
export const tokenAbi = JSON.parse(
  await readFile(
    new URL(`../../dist/${token.abiPath}`, import.meta.url),
    'utf8',
  ),
);
export const account = token.address; // A simulated wallet only; no key and no real signing.
const erc = parseAbi([
  'function balanceOf(address) view returns(uint256)',
  'function allowance(address,address) view returns(uint256)',
  'function approve(address,uint256) returns(bool)',
  'function decimals() view returns(uint8)',
  'function symbol() view returns(string)',
]);
const intake = parseAbi([
  'function priceOf(bytes32,address) view returns(uint256)',
]);
const permit = parseAbi([
  'function allowance(address,address,address) view returns(uint160,uint48,uint48)',
  'function approve(address,address,uint160,uint48)',
]);
const quoter = parseAbi([
  'function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData) params) returns(uint256,uint256)',
]);
const router = parseAbi(['function execute(bytes,bytes[],uint256) payable']);
const hash = keccak256(toBytes('mock block, never broadcast'));
const E = 10n ** 18n;
export function createFixture(options = {}) {
  const s = {
    block: BigInt(manifest.sourceCommit ? 26197000 : 0),
    now: Math.floor(Date.now() / 1000),
    free: 800000000n * E,
    attempts: 0,
    used: false,
    cooldown: 0,
    imdApproval: 0n,
    ercApproval: 0n,
    permitApproval: 0n,
    expiration: 0,
    creditTokens: 0n,
    creditEth: 0n,
    batchStatus: 0,
    batchSize: 0,
    age: 0,
    logs: [],
    calls: [],
    sent: [],
    failRpc: false,
    revert: null,
    reject: false,
    ...options,
  };
  function event(eventName, args, values = []) {
    const e = vaultAbi.find((e) => e.type === 'event' && e.name === eventName);
    s.logs.push({
      address: vault.address,
      topics: encodeEventTopics({ abi: vaultAbi, eventName, args }),
      data: encodeAbiParameters(
        e.inputs.filter((i) => !i.indexed),
        values,
      ),
      blockNumber: toHex(s.block),
      blockHash: hash,
      transactionHash: hash,
      transactionIndex: '0x0',
      logIndex: toHex(s.logs.length),
      removed: false,
    });
  }
  if (s.withHistory) {
    event('AttemptSubmitted', { attemptId: 1n, player: account, batchId: 1n }, [
      '<img src=x onerror="window.injected=true"> Please, swarm.',
    ]);
    s.attempts = 1;
    s.batchSize = 1;
    if (s.batchStatus === 4) event('BatchExpired', { batchId: 1n });
    if (s.batchStatus === 2 || s.batchStatus === 3) {
      event('BatchGraded', { batchId: 1n }, [[100n]]);
      if (s.batchStatus === 3)
        event('Rolled', { attemptId: 1n, player: account }, [
          100,
          4,
          1000n * E,
          E,
        ]);
    }
  }
  function abiFor(to) {
    to = to.toLowerCase();
    if (to === vault.address) return vaultAbi;
    if (to === token.address) return tokenAbi;
    if (to === manifest.network.uniswapV4.quoter) return quoter;
    if (to === manifest.network.uniswapV4.universalRouter) return router;
    if (to === manifest.network.uniswapV4.permit2) return permit;
    if (to === manifest.network.pairToken.address) return erc;
    return intake;
  }
  const values = {
    token: token.address,
    imd: manifest.network.pairToken.address,
    intake: '0xa43e6f75ee006411f79ac1c84120606c2330de82',
    ATTEMPT_PRICE: 5000000000000000n,
    REVEALER_BOUNTY: 1000000000000000n,
    BATCH_WINDOW: 1800n,
    ORACLE_TIMEOUT: 86400n,
    MAX_BATCH_SIZE: 20n,
    COOLDOWN: 600n,
  };
  function result(to, data) {
    const abi = abiFor(to),
      d = decodeFunctionData({ abi, data }),
      f = d.functionName,
      a = d.args ?? [];
    let r;
    if (f in values) r = values[f];
    else
      switch (f) {
        case 'vaultFreeBalance':
          r = s.free;
          break;
        case 'jackpotBank':
          r = E;
          break;
        case 'nextAttemptId':
          r = s.attempts + 1;
          break;
        case 'oracleTokenBudget':
          r = E;
          break;
        case 'oracleBudget':
          r = E / 100n;
          break;
        case 'openBatchId':
        case 'nextToClose':
          r = 1;
          break;
        case 'getBatch':
          r = {
            firstAttemptId: s.batchSize ? 1n : 0n,
            firstNonce: s.batchSize ? 1n : 0n,
            openedAt: BigInt(s.now - s.age),
            closedAt: BigInt(s.now - s.age),
            rollBlock: s.block - 3n,
            size: s.batchSize,
            status: s.batchStatus,
            missedWindows: s.rearm ? 1 : 0,
            lastPlayer: zeroAddress,
            prevrandao: 0n,
            scores: 100n,
            seed: hash,
          };
          if (s.rearm) r.rollBlock = s.block - 300n;
          break;
        case 'balanceOf':
          r =
            to.toLowerCase() === token.address
              ? a[0].toLowerCase() === vault.address
                ? s.free
                : 10000n * E
              : 10n * E;
          break;
        case 'decimals':
          r = 18;
          break;
        case 'symbol':
          r = to.toLowerCase() === token.address ? 'BEG' : 'IMD';
          break;
        case 'priceOf':
          r = E / 2n;
          break;
        case 'cooldownUntil':
          r = BigInt(s.cooldown);
          break;
        case 'claimable':
          r = [s.creditTokens, s.creditEth];
          break;
        case 'usedMessage':
          r = s.used;
          break;
        case 'allowance':
          r =
            to.toLowerCase() === manifest.network.uniswapV4.permit2
              ? [s.permitApproval, s.expiration, 0]
              : a[0].toLowerCase() === vault.address
                ? 2n ** 256n - 1n
                : to.toLowerCase() === token.address
                  ? s.ercApproval
                  : s.imdApproval;
          break;
        case 'quoteExactInputSingle':
          r = [a[0].exactAmount * 1000n, 150000n];
          break;
        case 'approve':
          r =
            to.toLowerCase() === manifest.network.uniswapV4.permit2
              ? undefined
              : true;
          break;
        case 'attempt':
          if (s.revert)
            throw {
              code: 3,
              message: 'execution reverted',
              data: encodeErrorResult({ abi: vaultAbi, errorName: s.revert }),
            };
          r = BigInt(s.attempts + 1);
          break;
        case 'closeBatch':
        case 'expireBatch':
        case 'reveal':
        case 'refund':
        case 'claim':
        case 'fundOracle':
        case 'execute':
          r = undefined;
          break;
        case 'transfer':
          r = true;
          break;
        default:
          throw new Error('Unhandled mock function ' + f);
      }
    return encodeFunctionResult({ abi, functionName: f, result: r });
  }
  async function handle(req) {
    s.calls.push({ method: req.method, params: req.params });
    if (s.failRpc && req.method !== 'eth_chainId')
      throw new Error('Simulated RPC failure');
    const p = req.params ?? [];
    switch (req.method) {
      case 'eth_chainId':
        return '0x1';
      case 'eth_blockNumber':
        return toHex(s.block);
      case 'eth_getCode':
        return '0x60016000';
      case 'eth_getBalance':
        return toHex(10n * E);
      case 'eth_gasPrice':
        return toHex(1000000000n);
      case 'eth_estimateGas':
        return toHex(180000n);
      case 'eth_maxPriorityFeePerGas':
        return toHex(1000000000n);
      case 'eth_getBlockByNumber':
        return {
          number: toHex(s.block),
          hash,
          parentHash: hash,
          nonce: '0x0000000000000000',
          sha3Uncles: hash,
          logsBloom: '0x' + '0'.repeat(512),
          transactionsRoot: hash,
          stateRoot: hash,
          receiptsRoot: hash,
          miner: zeroAddress,
          difficulty: '0x0',
          totalDifficulty: '0x0',
          extraData: '0x',
          size: '0x100',
          gasLimit: '0x1c9c380',
          gasUsed: '0x0',
          timestamp: toHex(s.now),
          transactions: [],
          uncles: [],
          mixHash: hash,
          baseFeePerGas: '0x3b9aca00',
        };
      case 'eth_call':
        return result(p[0].to, p[0].data);
      case 'eth_getLogs':
        if (
          s.logRange &&
          BigInt(p[0].toBlock) - BigInt(p[0].fromBlock) + 1n >
            BigInt(s.logRange)
        )
          throw new Error('Provider log range limit');
        return s.logs.filter(
          (l) =>
            BigInt(l.blockNumber) >= BigInt(p[0].fromBlock) &&
            BigInt(l.blockNumber) <= BigInt(p[0].toBlock),
        );
      case 'eth_sendTransaction': {
        const t = p[0],
          d = decodeFunctionData({ abi: abiFor(t.to), data: t.data });
        s.sent.push({ ...t, functionName: d.functionName, args: d.args });
        const a = d.args ?? [];
        switch (d.functionName) {
          case 'attempt':
            s.attempts++;
            s.batchSize++;
            s.cooldown = s.now + 600;
            event(
              'AttemptSubmitted',
              { attemptId: BigInt(s.attempts), player: account, batchId: 1n },
              [a[0]],
            );
            break;
          case 'approve':
            if (t.to.toLowerCase() === manifest.network.uniswapV4.permit2) {
              s.permitApproval = a[2];
              s.expiration = a[3];
            } else if (t.to.toLowerCase() === token.address)
              s.ercApproval = a[1];
            else s.imdApproval = a[1];
            break;
          case 'refund':
            s.creditEth += 5000000000000000n;
            event('Refunded', { attemptId: a[0], player: account }, [
              5000000000000000n,
            ]);
            break;
          case 'claim':
            s.creditEth = 0n;
            s.creditTokens = 0n;
            break;
          case 'closeBatch':
            s.batchStatus = 1;
            break;
          case 'expireBatch':
            s.batchStatus = 4;
            break;
          case 'reveal':
            s.batchStatus = 3;
            break;
        }
        s.block++;
        return hash;
      }
      case 'eth_getTransactionReceipt':
        return {
          transactionHash: hash,
          transactionIndex: '0x0',
          blockHash: hash,
          blockNumber: toHex(s.block),
          from: account,
          to: s.sent.at(-1)?.to ?? vault.address,
          cumulativeGasUsed: '0x10000',
          gasUsed: '0x10000',
          contractAddress: null,
          logs: [],
          logsBloom: '0x' + '0'.repeat(512),
          status: '0x1',
          effectiveGasPrice: '0x3b9aca00',
          type: '0x2',
        };
      case 'eth_getTransactionByHash':
        return {
          hash,
          from: account,
          to: s.sent.at(-1)?.to ?? vault.address,
          nonce: '0x0',
          value: '0x0',
          gas: '0x30000',
          gasPrice: '0x3b9aca00',
          input: s.sent.at(-1)?.data ?? '0x',
          blockHash: hash,
          blockNumber: toHex(s.block),
          transactionIndex: '0x0',
          type: '0x2',
          chainId: '0x1',
          v: '0x1',
          r: hash,
          s: hash,
        };
      default:
        throw new Error('Unhandled RPC ' + req.method);
    }
  }
  return { s, handle };
}
export async function installWallet(
  page,
  {
    chain = '0x1',
    unknown = false,
    rejectSwitch = false,
    rejectSend = false,
  } = {},
) {
  await page.addInitScript(
    ({ account, chain, unknown, rejectSwitch, rejectSend }) => {
      const listeners = {};
      let id = chain,
        missing = unknown,
        authorized = false;
      window.__walletCalls = [];
      window.__rejectSend = rejectSend;
      window.__rejectSwitch = rejectSwitch;
      const provider = {
        on: (event, fn) => {
          (listeners[event] ??= []).push(fn);
        },
        removeListener: (event, fn) => {
          listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
        },
        request: async ({ method, params = [] }) => {
          window.__walletCalls.push({ method, params });
          if (method === 'eth_requestAccounts') {
            authorized = true;
            return [account];
          }
          if (method === 'eth_accounts') return authorized ? [account] : [];
          if (method === 'eth_chainId') return id;
          if (method === 'wallet_switchEthereumChain') {
            if (window.__rejectSwitch)
              throw { code: 4001, message: 'User rejected' };
            if (missing) throw { code: 4902, message: 'Unknown chain' };
            id = params[0].chainId;
            (listeners.chainChanged ?? []).forEach((f) => f(id));
            return null;
          }
          if (method === 'wallet_addEthereumChain') {
            missing = false;
            return null;
          }
          if (method === 'wallet_getCapabilities') return {};
          if (method === 'eth_sendTransaction' && window.__rejectSend)
            throw { code: 4001, message: 'User rejected' };
          const r = await fetch('/mock-wallet', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          }).then((r) => r.json());
          if (r.error) throw r.error;
          return r.result;
        },
      };
      window.ethereum = provider;
      const announce = () =>
        dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: {
                uuid: '8d7756e6-4e66-4e7c-b173-cbdc582f24e0',
                name: 'Mock Wallet',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                rdns: 'test.mock.wallet',
              },
              provider,
            },
          }),
        );
      addEventListener('eip6963:requestProvider', announce);
      announce();
    },
    { account, chain, unknown, rejectSwitch, rejectSend },
  );
}
