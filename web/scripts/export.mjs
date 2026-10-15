import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { keccak256, toBytes, isAddress } from 'viem';
const root = resolve(import.meta.dirname, '../..');
const web = resolve(root, 'web'),
  dist = resolve(root, 'dist');
const handoff = JSON.parse(
  await readFile(resolve(web, 'config/deployment.json'), 'utf8'),
);
const chain = JSON.parse(
  await readFile(resolve(web, 'config/network.json'), 'utf8'),
);
export const canonical = (value) => JSON.stringify(sort(value));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
const abiHash = (abi) => keccak256(toBytes(canonical(abi))).slice(2);
assert.equal(handoff.chainId, chain.network.chainId);
assert.equal(handoff.chainId, Number(BigInt(chain.walletAddChain.chainId)));
assert(handoff.contracts.length > 0);
for (const c of handoff.contracts) {
  assert(isAddress(c.address));
  assert(/^[a-f0-9]{64}$/.test(c.abiHash));
}
const contracts = handoff.contracts.map(({ name, address, abiHash }) => ({
  name,
  address,
  abiHash,
  abiPath: `abi/${name}.json`,
}));
const base = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  network: chain.network,
  ...(chain.walletAddChain ? { walletAddChain: chain.walletAddChain } : {}),
};
async function files(dir) {
  const out = [];
  for (const name of (await readdir(dir)).sort()) {
    const p = resolve(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await files(p)));
    else out.push(p);
  }
  return out;
}
async function inventory() {
  const assets = [];
  let size = 0;
  for (const file of await files(dist)) {
    const path = relative(dist, file);
    if (path === 'imd-deployment.json') continue;
    const bytes = await readFile(file);
    assert(bytes.length <= 8388608);
    assert(!/(^|\/)(node_modules|\.cache|\.vite)(\/|$)/.test(path));
    assets.push({
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    size += bytes.length;
  }
  assert(assets.length <= 128);
  assert(size < 8 * 1024 * 1024, 'Keep export below submission budget');
  return { assets, size };
}
const command = process.argv[2];
if (command === 'prepare') {
  await mkdir(resolve(web, 'public/abi'), { recursive: true });
  for (const c of contracts) {
    const bytes = execFileSync(
      'git',
      ['show', `${handoff.sourceCommit}:docs/abi/${c.name}.json`],
      { cwd: root },
    );
    const abi = JSON.parse(bytes.toString());
    assert(Array.isArray(abi));
    assert.equal(abiHash(abi), c.abiHash, `${c.name}: pinned ABI hash`);
    await writeFile(resolve(web, 'public', c.abiPath), bytes);
  }
  const provenance = {
    deploymentBlock: Math.min(...handoff.contracts.map((c) => c.blockNumber)),
    repoUrl: handoff.repoUrl,
  };
  await writeFile(
    resolve(web, 'public/provenance.json'),
    JSON.stringify(provenance, null, 2) + '\n',
  );
  // Vite dev also loads the same manifest; final production inventory is written after Vite.
  await writeFile(
    resolve(web, 'public/imd-deployment.json'),
    JSON.stringify({ ...base, assets: [] }, null, 2) + '\n',
  );
  console.log('Pinned implementation ABIs verified; runtime inputs prepared.');
} else if (command === 'manifest') {
  const { assets, size } = await inventory();
  await writeFile(
    resolve(dist, 'imd-deployment.json'),
    JSON.stringify({ ...base, assets }, null, 2) + '\n',
  );
  console.log(`Manifest written: ${assets.length} assets, ${size} bytes.`);
} else if (command === 'verify') {
  const manifest = JSON.parse(
    await readFile(resolve(dist, 'imd-deployment.json'), 'utf8'),
  );
  const { assets, size } = await inventory();
  assert.deepEqual(manifest, { ...base, assets });
  for (const c of manifest.contracts) {
    assert(!c.abiPath.includes('..') && !c.abiPath.startsWith('/'));
    const abi = JSON.parse(await readFile(resolve(dist, c.abiPath), 'utf8'));
    assert(Array.isArray(abi));
    assert.equal(abiHash(abi), c.abiHash);
    const pinned = JSON.parse(
      execFileSync(
        'git',
        ['show', `${handoff.sourceCommit}:docs/abi/${c.name}.json`],
        { cwd: root },
      ).toString(),
    );
    assert.deepEqual(abi, pinned);
  }
  for (const a of assets)
    assert(!a.path.includes('..') && !a.path.includes('://'));
  assert(assets.some((a) => a.path === 'index.html'));
  console.log(
    `PASS: exact handoff, network, pool key, ${contracts.length} pinned ABI hashes, ${assets.length} SHA-256 assets; ${size} exported bytes.`,
  );
} else throw new Error('Use prepare, manifest or verify');
