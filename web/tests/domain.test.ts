import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeAbiParameters, parseAbiParameters, zeroAddress } from 'viem';
import {
  amount,
  fmt,
  exact,
  batchActions,
  bytes,
  ERRORS,
  messageIssue,
  odds,
  humanError,
} from '../src/domain';
import { swapInput } from '../src/protocol';
import { switchNetwork, OPEN_IN } from '../src/Wallet';
import { projectHistory } from '../src/data';
import type { Batch, Deployment } from '../src/types';
import type { EIP1193Provider } from 'viem';
const deploy = JSON.parse(
  readFileSync(
    new URL('../../dist/imd-deployment.json', import.meta.url),
    'utf8',
  ),
) as Deployment;
test('UTF-8 counts and exact message boundaries', () => {
  assert.equal(bytes('😀'), 4);
  assert.equal(messageIssue('a'.repeat(280)), '');
  assert.match(messageIssue('a'.repeat(281)), /280/);
  assert.equal(messageIssue('😀'.repeat(70)), '');
  assert.match(messageIssue('😀'.repeat(71)), /280/);
  assert.match(messageIssue('"'.repeat(201)), /escaped/);
  assert.match(messageIssue('\uD800'), /Unicode/);
  assert.ok(messageIssue(''));
});
test('amounts refuse rounding, negatives, exponent notation and zero', () => {
  assert.equal(amount('0.5', 18), 500000000000000000n);
  for (const s of ['1e3', '-1', '0', '0.0000001', '1.2345678'])
    assert.equal(amount(s, 6), undefined);
});
test('all score odds match integer contract formula and sum to 100%', () => {
  for (let s = 0; s <= 100; s++) {
    const o = odds(s);
    assert.equal(
      o.reduce((a, b) => a + b, 0),
      10000,
    );
    assert.equal(o[4], 1 + Math.floor((199 * s) / 100));
    assert.equal(o[3], 200 + 11 * s);
    assert.equal(o[2], 800 + 22 * s);
    assert.equal(o[1], 2000 + 15 * s);
  }
  assert.deepEqual(odds(0), [6999, 2000, 800, 200, 1]);
  assert.deepEqual(odds(100), [2000, 3500, 3000, 1300, 200]);
});
test('keeper boundaries: close, expire, reveal, rearm', () => {
  const b = {
    size: 1,
    status: 0,
    openedAt: 1000n,
    closedAt: 3000n,
    rollBlock: 200n,
  } as Batch;
  assert.equal(batchActions(b, 2799, 1n).close, false);
  assert.equal(batchActions(b, 2800, 1n).close, true);
  assert.equal(batchActions(b, 89200, 1n).close, false);
  assert.equal(batchActions(b, 89200, 1n).expire, true);
  assert.equal(batchActions({ ...b, status: 1 }, 89399, 1n).expire, false);
  assert.equal(batchActions({ ...b, status: 1 }, 89400, 1n).expire, true);
  assert.equal(batchActions({ ...b, status: 2 }, 0, 200n).reveal, false);
  assert.equal(batchActions({ ...b, status: 2 }, 0, 201n).reveal, true);
  assert.equal(batchActions({ ...b, status: 2 }, 0, 456n).rearm, false);
  assert.equal(batchActions({ ...b, status: 2 }, 0, 457n).rearm, true);
  assert.equal(batchActions({ ...b, size: 0 }, 90000, 1n).expire, false);
});
test('every implementation custom error has human copy', () => {
  for (const c of deploy.contracts) {
    const abi = JSON.parse(
      readFileSync(new URL(`../../dist/${c.abiPath}`, import.meta.url), 'utf8'),
    );
    for (const e of abi.filter((x: { type: string }) => x.type === 'error'))
      assert.ok(ERRORS[e.name], e.name);
  }
  assert.match(humanError({ cause: { code: 4001 } }), /declined/);
});
test('router payload preserves exact pool and minimum; native and ERC20 ordering', () => {
  for (const input of [deploy.poolKey.currency0, deploy.poolKey.currency1])
    for (const extended of [false, true]) {
      const payload = swapInput(deploy.poolKey, input, 1000n, 990n, extended);
      assert.equal(payload.commands, '0x10');
      assert.equal(payload.value, input === zeroAddress ? 1000n : 0n);
      const [actions, params] = decodeAbiParameters(
        parseAbiParameters('bytes,bytes[]'),
        payload.inputs[0],
      );
      assert.equal(actions, '0x060c0f');
      const fields = extended
        ? '((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),bool,uint128,uint128,uint256,bytes)'
        : '((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),bool,uint128,uint128,bytes)';
      const [tuple] = decodeAbiParameters(
        parseAbiParameters(fields),
        params[0],
      ) as unknown as [
        [
          {
            hooks: string;
            currency0: string;
            currency1: string;
            fee: number;
            tickSpacing: number;
          },
          boolean,
          bigint,
          bigint,
          ...unknown[],
        ],
      ];
      assert.equal(tuple[0].hooks.toLowerCase(), deploy.poolKey.hooks);
      assert.equal(tuple[0].fee, deploy.poolKey.fee);
      assert.equal(tuple[1], input === deploy.poolKey.currency0);
      assert.equal(tuple[2], 1000n);
      assert.equal(tuple[3], 990n);
      assert.deepEqual(
        decodeAbiParameters(parseAbiParameters('address,uint256'), params[1])
          .map(String)
          .map((s) => s.toLowerCase()),
        [input.toLowerCase(), '1000'],
      );
    }
});
test('unknown chain adds exact supplied chain then switches again', async () => {
  const calls: { method: string; params?: unknown }[] = [];
  const p = {
    request: async (args: { method: string; params: unknown }) => {
      calls.push(args);
      if (calls.length === 1) throw { code: 4902 };
      return null;
    },
  } as unknown as EIP1193Provider;
  await switchNetwork(p, deploy);
  assert.deepEqual(
    calls.map((c) => c.method),
    [
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_switchEthereumChain',
    ],
  );
  assert.deepEqual(calls[1].params, [deploy.walletAddChain]);
});
test('wallet rejection never offers chain addition', async () => {
  const calls: string[] = [];
  await assert.rejects(
    switchNetwork(
      {
        request: async ({ method }: { method: string }) => {
          calls.push(method);
          throw { code: 4001 };
        },
      } as unknown as EIP1193Provider,
      deploy,
    ),
  );
  assert.deepEqual(calls, ['wallet_switchEthereumChain']);
});
test('mobile links preserve the gateway subpath', () => {
  for (const w of OPEN_IN) {
    const link = w.href('https://example.com/ipfs/abc/?hello=world#beg');
    assert.ok(link.startsWith('https://'));
    assert.ok(decodeURIComponent(link).includes('/ipfs/abc/'));
  }
});
test('event history retains plain text and separates refunds from historical awards', () => {
  const base = {
    blockNumber: 10n,
    logIndex: 0,
    transactionHash: '0x' as const,
  };
  const a = deploy.contracts[0].address;
  const result = projectHistory([
    {
      ...base,
      eventName: 'AttemptSubmitted',
      args: {
        attemptId: 1n,
        player: a,
        batchId: 1n,
        message: '<img src=x onerror=alert(1)>',
      },
    },
    {
      ...base,
      eventName: 'BatchGraded',
      args: { batchId: 1n, scores: [100n] },
    },
    {
      ...base,
      eventName: 'Rolled',
      args: {
        attemptId: 1n,
        player: a,
        score: 100,
        tier: 4,
        tokenAmount: 100n,
        ethAmount: 5n,
      },
    },
    {
      ...base,
      eventName: 'Claimed',
      args: { player: a, tokenAmount: 100n, ethAmount: 5n },
    },
  ]);
  assert.equal(result.entries[0].message, '<img src=x onerror=alert(1)>');
  assert.equal(result.entries[0].tokens, 100n);
  assert.equal(result.statuses.get('1'), 3);
});

test('large integers and tiny signed amounts retain exact precision', () => {
  assert.equal(fmt(1000000000000000001n, 0), '1,000,000,000,000,000,001');
  assert.equal(exact(1n, 18), '0.000000000000000001');
});
