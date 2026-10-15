import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, http, parseAbi, toHex } from 'viem';
const rpc = process.argv[2];
if (!rpc)
  throw new Error(
    'Pass an authorized RPC endpoint as the first argument. It is not recorded.',
  );
const root = new URL('../../', import.meta.url),
  manifest = JSON.parse(
    await readFile(new URL('dist/imd-deployment.json', root), 'utf8'),
  );
const client = createPublicClient({
  transport: http(rpc, { timeout: 15000, batch: true, retryCount: 0 }),
});
const report = {
  checkedAt: new Date().toISOString(),
  publicSources: manifest.network.rpcUrls,
  chainId: await client.getChainId(),
  block: Number(await client.getBlockNumber()),
  contracts: [],
  reads: {},
  uniswap: {},
  transactionsBroadcast: 0,
};
if (report.chainId !== manifest.chainId) throw new Error('Chain mismatch');
const refs = {};
for (const c of manifest.contracts) {
  const abi = JSON.parse(
    await readFile(new URL(`dist/${c.abiPath}`, root), 'utf8'),
  );
  refs[c.name] = { address: c.address, abi };
  const code = await client.getCode({ address: c.address });
  if (!code || code === '0x') throw new Error('Missing code');
  report.contracts.push({
    name: c.name,
    address: c.address,
    codeBytes: (code.length - 2) / 2,
  });
}
for (const fn of [
  'token',
  'imd',
  'intake',
  'ATTEMPT_PRICE',
  'vaultFreeBalance',
  'jackpotBank',
  'oracleTokenBudget',
  'oracleBudget',
  'openBatchId',
  'nextAttemptId',
  'nextToClose',
])
  report.reads[fn] = await client.readContract({
    ...refs.BegVault,
    functionName: fn,
  });
report.reads.batch = await client.readContract({
  ...refs.BegVault,
  functionName: 'getBatch',
  args: [report.reads.openBatchId],
});
report.reads.tokenDecimals = await client.readContract({
  ...refs.LaunchToken,
  functionName: 'decimals',
});
report.reads.symbol = await client.readContract({
  ...refs.LaunchToken,
  functionName: 'symbol',
});
report.reads.oracleFee = await client.readContract({
  address: report.reads.intake,
  abi: parseAbi(['function priceOf(bytes32,address) view returns (uint256)']),
  functionName: 'priceOf',
  args: [toHex('oracle.request@oracle-1', { size: 32 }), report.reads.imd],
});
for (const [name, address] of Object.entries(manifest.network.uniswapV4)) {
  if (typeof address !== 'string') continue;
  const code = await client.getCode({ address });
  report.uniswap[name] = {
    address,
    codeBytes: code ? (code.length - 2) / 2 : 0,
  };
}
const output =
  JSON.stringify(
    report,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  ) + '\n';
await writeFile(new URL('docs/frontend/live-chain.json', root), output);
console.log(output);
