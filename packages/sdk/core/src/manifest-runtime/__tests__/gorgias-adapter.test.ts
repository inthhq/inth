/**
 * @vitest-environment jsdom
 *
 * The Gorgias adapter takes no options: the manifest carries the app key
 * in its loader URL. Its lifecycle runs in `@inth/integrations`' Gorgias
 * e2e suite and traces, the old-promise and pending-init ones too.
 */
import { describe, expect, it } from 'vite-plus/test';

import { gorgiasAdapter } from '../adapters/gorgias';

describe('the Gorgias adapter', () => {
	it('accepts no options', () => {
		expect(gorgiasAdapter.problem({})).toBeUndefined();
		expect(gorgiasAdapter.problem({ appKey: 'key' })).toBe(
			'it has the unknown option appKey'
		);
	});

	it('drops the base script server start and keeps its fields', () => {
		const script = gorgiasAdapter.script(
			{
				category: 'functionality',
				id: 'gorgias',
				serverStart: () => undefined,
				target: 'body',
			},
			{}
		);

		expect(script.serverStart).toBeUndefined();
		expect(script.target).toBe('body');
	});
});
