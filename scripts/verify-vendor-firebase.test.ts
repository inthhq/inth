import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const checker = new URL(
	'../internals/fixtures/react-native-bare/scripts/verify-vendor-firebase.py',
	import.meta.url
).pathname;
const start = 1_793_812_592.937;

/** One Android `logcat -v epoch` line from Firebase's FA tag. */
const fa = (at: number, text: string): string =>
	`         ${at.toFixed(3)}  2823  2881 D FA      : ${text}`;

/** Check one fresh-install probe, refused unless `granted`, against the given Firebase log. */
const check = (log: string[], granted = false) => {
	const out = mkdtempSync(join(tmpdir(), 'inth-firebase-log-'));
	try {
		writeFileSync(
			join(out, 'vendor-steps.jsonl'),
			`${JSON.stringify({ granted, probe: 'inth_probe_1', step: 'vendor-1-fresh-install' })}\n`
		);
		writeFileSync(
			join(out, 'vendor-probes.json'),
			JSON.stringify([
				{
					finishedAt: start * 1000 + 28,
					name: 'inth_probe_1',
					startedAt: start * 1000,
				},
			])
		);
		writeFileSync(join(out, 'firebase.log'), `${log.join('\n')}\n`);
		return spawnSync('python3', [checker, out, 'android'], {
			encoding: 'utf8',
		});
	} finally {
		rmSync(out, { force: true, recursive: true });
	}
};

const storageDenied = fa(
	start - 1,
	'Setting storage consent(FE): source=MANIFEST,ad_storage=denied,analytics_storage=denied'
);

describe('verify-vendor-firebase.py', () => {
	it('reads the state Firebase logs just after a launch probe starts', () => {
		// Expo 58 on Android: Firebase logged the applied state 0.46 s after the probe.
		const result = check([
			storageDenied,
			fa(start + 0.457, 'Setting app measurement enabled (FE): false'),
		]);
		expect(result.stdout).toContain('Firebase followed every Inth decision');
		expect(result.status).toBe(0);
	});

	it('fails a refusal when Firebase enables collection in that window', () => {
		const result = check([
			storageDenied,
			fa(start + 0.4, 'Setting app measurement enabled (FE): true'),
		]);
		expect(result.stdout).toContain('Firebase collection does not match');
		expect(result.status).toBe(1);
	});

	it('fails when Firebase logs no state until long after the probe', () => {
		const result = check([
			storageDenied,
			fa(start + 3, 'Setting app measurement enabled (FE): false'),
		]);
		expect(result.status).toBe(1);
	});
	it('reads a granted probe at the moment Firebase logged it', () => {
		// Before each probe the journey re-syncs, and the Firebase helper turns
		// collection off, applies consent, then turns it on. Expo 57 on Android
		// logged the off line 3 ms before the probe started and the on line after.
		const result = check(
			[
				fa(start - 0.003, 'Setting app measurement enabled (FE): false'),
				fa(
					start,
					'Setting storage consent(FE): source=API,ad_storage=denied,analytics_storage=granted'
				),
				fa(start + 0.001, 'Setting app measurement enabled (FE): true'),
				fa(
					start + 0.015,
					'Logging event: origin=app,name=inth_probe_1,params=Bundle[{ga_event_origin(_o)=app}]'
				),
			],
			true
		);
		expect(result.stdout).toContain('Firebase followed every Inth decision');
		expect(result.status).toBe(0);
	});
	it('reads a refusal that Firebase logs just after the probe, over an earlier grant', () => {
		// A refusal after a granted step: the enabled state is already in the log,
		// and Firebase logs the new disabled state a moment after the probe starts.
		const result = check([
			fa(start - 5, 'Setting app measurement enabled (FE): true'),
			fa(
				start - 5,
				'Setting storage consent(FE): source=API,ad_storage=denied,analytics_storage=granted'
			),
			fa(start + 0.3, 'Setting app measurement enabled (FE): false'),
			fa(
				start + 0.3,
				'Setting storage consent(FE): source=API,ad_storage=denied,analytics_storage=denied'
			),
		]);
		expect(result.stdout).toContain('Firebase followed every Inth decision');
		expect(result.status).toBe(0);
	});
});
