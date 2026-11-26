/**
 * @vitest-environment jsdom
 *
 * The marketing tracking adapters: each loads through `importAdapter` by
 * its ID, and its closed validator refuses any option the Inth server may
 * not send. Their consent behaviour is held to the npm helpers' golden
 * traces in `@inth/integrations`.
 */
import { describe, expect, it } from 'vite-plus/test';

import type { AdapterId } from '../adapter';
import { importAdapter } from '../adapters';
import { ADAPTER_LEVELS } from '../features';

/** Why `adapter` refuses `options`, or `undefined`. */
const problem = async (id: AdapterId, options: Record<string, unknown>) =>
	(await importAdapter(id)).problem(options);

describe('the ActiveCampaign adapter', () => {
	it('ships at level 4 and loads by its ID', async () => {
		expect(ADAPTER_LEVELS.activecampaign).toBe(4);
		expect((await importAdapter('activecampaign')).id).toBe('activecampaign');
	});

	it('takes an account ID and nothing else', async () => {
		expect(await problem('activecampaign', { accountId: '123456' })).toBe(
			undefined
		);
		expect(
			await problem('activecampaign', {
				accountId: '123456',
				email: 'person@example.com',
			})
		).toBe('it has the unknown option email');
		expect(
			await problem('activecampaign', {
				accountId: '123456',
				scriptUrl: 'https://evil.example/diffuser.js',
			})
		).toBe('it has the unknown option scriptUrl');
		const adapter = await importAdapter('activecampaign');
		for (const accountId of [123_456, '', '../x', 'https://x.example']) {
			expect(adapter.problem({ accountId })).toBe(
				'its accountId is not an account ID'
			);
		}
	});
});
