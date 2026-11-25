import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vite-plus/test';

const script = new URL('./vendor-firebase-log.py', import.meta.url).pathname;
const runner = '/data/InthConsentDemoUITests-Runner';
const app = '/data/InthConsentDemo';

/** One unified-log row as `log stream --style ndjson` prints it. */
const row = (second: number, process: string, eventMessage: string) =>
	JSON.stringify({
		eventMessage,
		processImagePath: process,
		timestamp: `2026-11-04 15:00:${String(second).padStart(2, '0')}.000000+0000`,
	});

const disabled =
	'[FirebaseAnalytics][I-ACS023013] Analytics collection disabled';
const enabled = '[FirebaseAnalytics][I-ACS023012] Analytics collection enabled';
const refused =
	'[FirebaseAnalytics][I-ACS023049] Analytics is disabled. Event not logged';
const logged =
	'[FirebaseAnalytics][I-ACS023051] Logging event: origin, name, params: app, inth_probe, { probe = 3; }';
const consent = (storage: string) =>
	`[FirebaseAnalytics][I-ACS025055] ad_storage is denied. analytics_storage is ${storage}. ad_user_data is denied. ad_personalization is denied.`;

/** A journey as Firebase logs it. `withdrawn` is the outcome of the post-withdrawal probe. */
const journey = (withdrawn: string) => [
	row(1, runner, 'inth-vendor-step 1-fresh seq=0'),
	row(2, app, 'probe 1 sent'),
	// On a fresh install Firebase's logging starts after the first probe.
	row(3, app, disabled),
	row(4, app, refused),
	row(5, runner, 'inth-vendor-step 2-reject seq=0'),
	row(6, app, 'probe 2 sent'),
	row(7, app, refused),
	// The grant lands before the next marker: the state belongs to step 3.
	row(8, app, consent('granted')),
	row(9, app, enabled),
	row(10, runner, 'inth-vendor-step 3-grant seq=0'),
	row(11, app, 'probe 3 sent'),
	row(12, app, logged),
	row(13, app, consent('denied')),
	row(14, app, disabled),
	row(15, runner, 'inth-vendor-step 4-withdraw seq=4'),
	row(16, app, 'probe 4 sent'),
	row(17, app, withdrawn),
	row(18, app, consent('denied')),
	row(19, app, disabled),
	row(20, runner, 'inth-vendor-step 5-relaunch seq=4'),
	row(21, app, 'probe 1 sent'),
	row(22, app, refused),
];

const check = (lines: string[], expectApps: string[] = []) => {
	const directory = mkdtempSync(join(tmpdir(), 'inth-firebase-log-'));
	const log = join(directory, 'device-log.ndjson');
	const evidence = join(directory, 'evidence.json');
	// Shuffle two lines: the stream does not promise order across processes.
	const [first, second, ...rest] = lines;
	writeFileSync(log, `${[second, first, ...rest, 'not json'].join('\n')}\n`);
	const expectArgs =
		expectApps.length > 0 ? ['--expect', expectApps.join(',')] : [];
	const result = spawnSync('python3', [script, log, evidence, ...expectArgs], {
		encoding: 'utf8',
	});
	return {
		evidence: JSON.parse(readFileSync(evidence, 'utf8')),
		status: result.status,
		stderr: result.stderr,
	};
};

it('reads collection, analytics_storage and the probe outcome per step', () => {
	const result = check(journey(refused));
	expect(result.status, result.stderr).toBe(0);
	const steps = result.evidence.apps.InthConsentDemo.map(
		(step: Record<string, unknown>) => [
			step.step,
			step.collection,
			step.storage,
			step.logged,
			step.refused,
		]
	);
	expect(steps).toEqual([
		['1-fresh', 'disabled', null, 0, 1],
		['2-reject', 'disabled', null, 0, 1],
		['3-grant', 'enabled', 'granted', 1, 0],
		['4-withdraw', 'disabled', 'denied', 0, 1],
		['5-relaunch', 'disabled', 'denied', 0, 1],
	]);
});

it('fails when Firebase logs the probe after withdrawal', () => {
	const result = check(journey(logged));
	expect(result.status).toBe(1);
	expect(result.evidence.failures).toEqual([
		'InthConsentDemo 4-withdraw: probe logged 1 time(s), refused 0 time(s) (plus 0 refusal(s) not tied to the probe)',
	]);
});

it('fails when the log has no step markers', () => {
	const result = check([row(1, app, disabled), row(2, app, refused)]);
	expect(result.status).toBe(1);
	expect(result.evidence.failures).toEqual([
		'No step markers in the device log.',
	]);
});

it('does not count a refusal of another event as the probe refusal', () => {
	// Firebase refuses its own automatic event before the probe is sent, and the
	// probe itself never reaches Firebase. The refusal line names no event.
	const lines = journey(refused);
	lines.splice(15, 2, row(16, app, refused), row(17, app, 'probe 4 sent'));
	const result = check(lines);
	expect(result.status).toBe(1);
	expect(result.evidence.failures).toEqual([
		'InthConsentDemo 4-withdraw: probe logged 0 time(s), refused 0 time(s) (plus 1 refusal(s) not tied to the probe)',
	]);
});

it('fails when an expected app produced no step markers', () => {
	const result = check(journey(refused), ['InthConsentDemo', 'InthUIKitDemo']);
	expect(result.status).toBe(1);
	expect(result.evidence.failures).toEqual([
		'InthUIKitDemo: no step markers in the device log',
	]);
});
