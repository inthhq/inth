/**
 * @vitest-environment jsdom
 *
 * The Dynamic Yield adapter's options check: the Inth server sends only a
 * section ID and a data center, which the adapter builds `api_static.js`'s
 * URL from on Dynamic Yield's CDN. Its lifecycle runs in
 * `@inth/integrations`' Dynamic Yield e2e suite and traces.
 */
import { describe, expect, it } from 'vite-plus/test';

import {
	dynamicYieldAdapter,
	dynamicYieldBase,
} from '../adapters/dynamic-yield';

describe('the Dynamic Yield adapter options', () => {
	it('accepts a section ID and a data center', () => {
		expect(
			dynamicYieldAdapter.problem({ region: 'eu', sectionId: '8765432' })
		).toBeUndefined();
		expect(dynamicYieldBase({ region: 'eu', sectionId: '8765432' })).toBe(
			'https://cdn-eu.dynamicyield.com/api/8765432'
		);
		expect(dynamicYieldBase({ region: 'us', sectionId: '8765432' })).toBe(
			'https://cdn.dynamicyield.com/api/8765432'
		);
	});

	it.each([
		[{ region: 'us' }, 'its sectionId is not a section ID'],
		[
			{ region: 'us', sectionId: '1/../x' },
			'its sectionId is not a section ID',
		],
		[{ region: 'apac', sectionId: '1' }, 'its region is not us or eu'],
		[{ sectionId: '1' }, 'its region is not us or eu'],
		[
			{ nonce: 'n', region: 'us', sectionId: '1' },
			'it has the unknown option nonce',
		],
	])('refuses %j', (options, reason) => {
		expect(dynamicYieldAdapter.problem(options)).toBe(reason);
	});

	it('drops the base script server start', () => {
		const script = dynamicYieldAdapter.script(
			{
				category: 'experience',
				id: 'dynamic-yield',
				serverStart: () => undefined,
			},
			{ region: 'us', sectionId: '1' }
		);

		expect(script.serverStart).toBeUndefined();
	});
});
