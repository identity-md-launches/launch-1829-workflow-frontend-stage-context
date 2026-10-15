import { readFile } from 'node:fs/promises';
import { createPublicClient, http } from 'viem';
import { snapshot } from '../src/data';
import type { Runtime } from '../src/config';
const deployment = JSON.parse(
  await readFile(
    new URL('../../dist/imd-deployment.json', import.meta.url),
    'utf8',
  ),
);
const refs = await Promise.all(
  deployment.contracts.map(
    async (c: { abiPath: string; address: string; name: string }) => ({
      ...c,
      abi: JSON.parse(
        await readFile(
          new URL('../../dist/' + c.abiPath, import.meta.url),
          'utf8',
        ),
      ),
    }),
  ),
);
const rt = {
  deployment,
  client: createPublicClient({
    transport: http(process.argv[2], { batch: true, timeout: 15000 }),
  }),
  vault: refs.find((c) => c.name === 'BegVault'),
  token: refs.find((c) => c.name === 'LaunchToken'),
} as unknown as Runtime;
console.log(await snapshot(rt));
