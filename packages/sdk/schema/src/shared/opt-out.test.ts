import { describe, expect, test } from 'vitest';

import { OPT_OUT_RIGHTS, resolveOptOutRights } from './opt-out';

const SALE_AND_TARGETED_ADS_STATES =
	'CO CT DE FL IA IN KY MD MN MT NE NH NJ OR RI TN TX UT VA'.split(' ');

describe('resolveOptOutRights', () => {
	test('maps California to sale and share', () => {
		expect(resolveOptOutRights({ country: 'US', region: 'CA' })).toEqual([
			'sale',
			'share',
		]);
		expect(resolveOptOutRights({ country: 'us', region: 'us-ca' })).toEqual([
			'sale',
			'share',
		]);
		expect(resolveOptOutRights({ country: ' US ', region: ' US-CA ' })).toEqual(
			['sale', 'share']
		);
	});

	test('maps Nevada to sale only', () => {
		expect(resolveOptOutRights({ country: 'US', region: 'NV' })).toEqual([
			'sale',
		]);
		expect(resolveOptOutRights({ country: 'us', region: 'US-nv' })).toEqual([
			'sale',
		]);
	});

	test.each(SALE_AND_TARGETED_ADS_STATES)(
		'maps US-%s to sale and targeted_ads',
		(region) => {
			expect(resolveOptOutRights({ country: 'US', region })).toEqual([
				'sale',
				'targeted_ads',
			]);
			expect(
				resolveOptOutRights({
					country: 'us',
					region: `us-${region.toLowerCase()}`,
				})
			).toEqual(['sale', 'targeted_ads']);
		}
	);

	test.each([
		['missing location', undefined],
		['null location', null],
		['US with unknown region', { country: 'US', region: null }],
		['US with empty region', { country: 'US', region: '' }],
		['US with unmapped state', { country: 'US', region: 'NY' }],
		['mismatched prefix', { country: 'US', region: 'CA-CA' }],
		['non-US country', { country: 'DE', region: null }],
		['non-US region matching US state code', { country: 'GB', region: 'CA' }],
	])('falls back to every right for %s', (_label, location) => {
		expect(resolveOptOutRights(location)).toEqual([...OPT_OUT_RIGHTS]);
	});

	test('returns a fresh array on each call', () => {
		const first = resolveOptOutRights({ country: 'US', region: 'CA' });
		first.push('targeted_ads');
		expect(resolveOptOutRights({ country: 'US', region: 'CA' })).toEqual([
			'sale',
			'share',
		]);
	});
});
