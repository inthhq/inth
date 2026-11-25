import { readStoredRecordsFromCookieHeader } from '@inth/sdk/modules/persistence';
import { expect, it } from 'vite-plus/test';

import {
	assertRepeatVisitor,
	createRepeatVisitorCookie,
} from './nuxt-repeat-visitor';

it.each([Date.UTC(2025, 0, 1), Date.UTC(2030, 0, 1)])(
	'restores the real repeat-visitor cookie at %s',
	(now) => {
		const records = readStoredRecordsFromCookieHeader(
			`inth=${createRepeatVisitorCookie(now)}`,
			undefined,
			now
		);
		expect(records.choice).not.toBeNull();
		expect(records.subject?.subjectId).toBe('sub_2VZxR7YmNpKq3WfLs8TgHd');
		expect(records.choice?.categories).toEqual(
			Object.fromEntries(
				['functionality', 'experience', 'measurement', 'marketing'].map(
					(category) => [
						category,
						{
							basis: { kind: 'legacy-v2' },
							confirmedAt: now - 60_000,
							value: true,
						},
					]
				)
			)
		);
	}
);

const restored = {
	bannerCount: 0,
	bannerInServerHtml: false,
	hasStoredChoice: true,
};

it('accepts a restored visitor without a banner', () => {
	expect(() => assertRepeatVisitor(restored)).not.toThrow();
});

it.each([
	{ hasStoredChoice: false },
	{ hasStoredChoice: undefined },
	{ bannerInServerHtml: true },
	{ bannerCount: 1 },
])('rejects a repeat measurement with invalid state: %j', (observation) => {
	expect(() => assertRepeatVisitor({ ...restored, ...observation })).toThrow(
		'Repeat visitor did not restore a stored choice without a banner'
	);
});
