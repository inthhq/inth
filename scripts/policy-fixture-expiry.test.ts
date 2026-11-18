/**
 * The example apps embed a policy resource with an expiry. Once it passes,
 * Expo prebuild rejects it and every mobile device build fails. This fails
 * a month earlier, so the fixtures get re-exported before CI breaks.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const WARNING_DAYS = 30;
const DAY_MS = 86_400_000;
const REEXPORT =
	'bunx tsx scripts/export-mobile-policy.ts --endpoint <endpoint> --expires-at <ISO date> --out <file>';

const fixtures = execFileSync('git', ['ls-files', '*inth-policy.json'], {
	cwd: REPO_ROOT,
	encoding: 'utf8',
})
	.split('\n')
	.filter(Boolean);

describe('embedded policy fixtures', () => {
	it('finds the example app fixtures', () => {
		expect(fixtures.length).toBeGreaterThan(0);
	});

	it.each(fixtures)(
		`%s stays valid for at least ${WARNING_DAYS} days`,
		(file) => {
			const resource = JSON.parse(
				readFileSync(join(REPO_ROOT, file), 'utf8')
			) as { payload: string };
			const { endpoint, expiresAt } = JSON.parse(resource.payload) as {
				endpoint: string;
				expiresAt: number;
			};
			const daysLeft = Math.floor((expiresAt - Date.now()) / DAY_MS);
			expect(
				daysLeft,
				`${file} expires on ${new Date(expiresAt).toISOString()}. Re-export it from ${endpoint}: ${REEXPORT}`
			).toBeGreaterThanOrEqual(WARNING_DAYS);
		}
	);
});
