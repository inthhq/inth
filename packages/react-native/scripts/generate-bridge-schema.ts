/**
 * Writes `packages/native-protocol/bridge/payloads.json` from `src/protocol/bridge-schema.ts`.
 *
 * The Kotlin and Swift binding tests read that file to check every bridge
 * encoder and decoder against the key names TypeScript declares.
 * `src/protocol/__tests__/bridge-schema.test.ts` fails when the file is stale.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderBridgeSchema } from '../src/protocol/bridge-schema';

const repoRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..'
);
const target = resolve(
	repoRoot,
	'packages',
	'native-protocol',
	'bridge',
	'payloads.json'
);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(renderBridgeSchema(), null, '\t')}\n`);

const format = spawnSync(
	'pnpm',
	[
		'exec',
		'vp',
		'fmt',
		'-c',
		resolve(repoRoot, 'oxfmt.sdk.config.ts'),
		'--ignore-path',
		resolve(repoRoot, '.gitignore'),
		target,
	],
	{
		cwd: repoRoot,
		stdio: 'inherit',
	}
);
if (format.status !== 0) {
	throw new Error(`Oxfmt failed on ${target}`);
}
console.log(`Wrote ${target}`);
