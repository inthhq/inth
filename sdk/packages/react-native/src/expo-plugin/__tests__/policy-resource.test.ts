import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { embedPolicyResource } from '../policy-resource';

const endpoint = 'https://demo.example.test';
describe('Expo native policy embedding', () => {
	it('copies exact bytes to assets and refuses wrong project or expired authority', async () => {
		const root = await mkdtemp(join(tmpdir(), 'c15t-policy-'));
		try {
			const payload = JSON.stringify({
				disclosures: { atp: { fetchedAt: 123 } },
				endpoint,
				expiresAt: Date.now() + 60000,
				issuedAt: Date.now() - 1000,
				schemaVersion: 1,
			});
			const source = JSON.stringify({
				payload,
				sha256: createHash('sha256').update(payload).digest('hex'),
			});
			await writeFile(join(root, 'input.json'), source);
			const output = join(root, 'android/app/src/main/assets/c15t-policy.json');
			await embedPolicyResource(root, 'input.json', endpoint, output);
			expect(await readFile(output, 'utf8')).toBe(source);
			await expect(
				embedPolicyResource(
					root,
					'input.json',
					'https://wrong.example.test',
					output
				)
			).rejects.toThrow('different backendURL');
			await Promise.all(
				[
					{ expiresAt: Date.now() - 1 },
					{ issuedAt: Date.now() + 60000 },
					{ schemaVersion: 2 },
				].map(async (patch, index) => {
					const invalidPayload = JSON.stringify({
						...JSON.parse(payload),
						...patch,
					});
					const name = `invalid-${index}.json`;
					await writeFile(
						join(root, name),
						JSON.stringify({
							payload: invalidPayload,
							sha256: createHash('sha256').update(invalidPayload).digest('hex'),
						})
					);
					await expect(
						embedPolicyResource(root, name, endpoint, output)
					).rejects.toThrow('invalid, expired');
				})
			);
			await writeFile(
				join(root, 'input.json'),
				source.replace('sha256', 'corrupt')
			);
			await expect(
				embedPolicyResource(root, 'input.json', endpoint, output)
			).rejects.toThrow();
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
