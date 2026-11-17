import { execFileSync } from 'node:child_process';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { measureAndroidBytes } from '../measure/bundle';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

const archive = function archive(
	root: string,
	name: string,
	bytes: number,
	aar = false
) {
	const work = join(root, 'seeds', name);
	mkdirSync(work, { recursive: true });
	writeFileSync(join(work, `${name}.class`), Buffer.alloc(bytes));
	writeFileSync(join(work, 'ignored.txt'), 'not class bytes');
	execFileSync('zip', ['-q', 'classes.jar', `${name}.class`, 'ignored.txt'], {
		cwd: work,
	});
	if (!aar) {
		return join(work, 'classes.jar');
	}
	execFileSync('zip', ['-q', `${name}.aar`, 'classes.jar'], { cwd: work });
	return join(work, `${name}.aar`);
};

const fixture = function fixture(
	options: { bridgeRequiresUi?: boolean; omitUi?: boolean } = {}
) {
	const root = mkdtempSync(join(tmpdir(), 'c15t-android-bytes-'));
	roots.push(root);
	const core = join(root, 'packages', 'android');
	const bridge = join(root, 'packages', 'react-native', 'android');
	mkdirSync(core, { recursive: true });
	mkdirSync(bridge, { recursive: true });
	const outputs = [
		['c15t-core', join(core, 'c15t-core/build/libs/c15t-core.jar'), 17],
		[
			'c15t-android',
			join(core, 'c15t-android/build/outputs/aar/c15t-android-release.aar'),
			19,
		],
		[
			'c15t-consent-ui',
			join(
				core,
				'c15t-consent-ui/build/outputs/aar/c15t-consent-ui-release.aar'
			),
			23,
		],
	] as const;
	const builds = outputs.map(([name, output, bytes]) => ({
		name,
		output,
		seed: archive(root, name, bytes, name !== 'c15t-core'),
	}));
	const [, , [, ui]] = outputs;
	if (!options.omitUi) {
		mkdirSync(dirname(ui), { recursive: true });
		copyFileSync(archive(root, 'stale-ui', 2, true), ui);
	}
	const marker = join(core, 'ui-staged');
	writeFileSync(
		join(core, 'gradlew'),
		`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
for (const artifact of ${JSON.stringify(builds)}) {
  if (!process.argv.includes(':' + artifact.name + ':publishAllPublicationsToStagingRepository')) continue;
  if (${Boolean(options.omitUi)} && artifact.name === 'c15t-consent-ui') continue;
  fs.mkdirSync(path.dirname(artifact.output), { recursive: true });
  fs.copyFileSync(artifact.seed, artifact.output);
  if (artifact.name === 'c15t-consent-ui') fs.writeFileSync(${JSON.stringify(marker)}, 'current');
}
`,
		{ mode: 0o755 }
	);
	const bridgeSeed = archive(root, 'bridge', 29, true);
	writeFileSync(
		join(bridge, 'gradlew'),
		`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (${Boolean(options.bridgeRequiresUi)} && !fs.existsSync(${JSON.stringify(marker)})) process.exit(41);
const output = path.join(process.cwd(), 'c15t-react-native/build/outputs/aar/c15t-react-native-release.aar');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(${JSON.stringify(bridgeSeed)}, output);
`,
		{ mode: 0o755 }
	);
	return root;
};

describe('Android raw class bytes', () => {
	it('counts the current consent UI alongside the core, adapter and bridge', () => {
		expect(measureAndroidBytes(fixture()).value).toBe(17 + 19 + 23 + 29);
	});

	it('stages the current UI before a bridge that requires it can build', () => {
		expect(measureAndroidBytes(fixture({ bridgeRequiresUi: true })).value).toBe(
			17 + 19 + 23 + 29
		);
	});

	it('does not report a partial total when the UI artifact is missing', () => {
		const measured = measureAndroidBytes(fixture({ omitUi: true }));
		expect(measured.value).toBeNull();
		expect(measured.reason).toContain('consent UI aar');
	});
});
