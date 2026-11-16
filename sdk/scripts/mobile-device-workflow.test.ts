import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface Step {
	readonly name?: string;
	readonly env?: Record<string, string>;
	readonly run?: string;
}

const workflow = parse(
	readFileSync(
		join(import.meta.dirname, '../.github/workflows/mobile-device.yml'),
		'utf8'
	)
) as { jobs: { device: { env?: Record<string, string>; steps: Step[] } } };

const noNativeUI = workflow.jobs.device.steps.find((step) =>
	step.name?.includes('without the stock consent screens')
);

describe('the iOS build without the stock consent screens', () => {
	it('exists', () => {
		expect(noNativeUI?.run).toBeDefined();
	});

	// An app's prebuild writes `c15t.nativeUI` to Podfile.properties.json and its
	// `pod install` reads it there. C15T_NATIVE_UI overrides that file in the
	// podspec, so if it reached `pod install` the build would pass even with the
	// plugin-to-podspec path broken.
	it('passes the switch to prebuild only, so the pod reads Podfile.properties.json', () => {
		expect(noNativeUI?.env?.C15T_NATIVE_UI).toBeUndefined();
		expect(workflow.jobs.device.env?.C15T_NATIVE_UI).toBeUndefined();
		const lines = (noNativeUI?.run ?? '')
			.split('\n')
			.filter((line) => !line.trim().startsWith('#'));
		const prebuild = lines.find((line) => line.includes('expo prebuild'));
		const install = lines.find((line) => /\bpod install\b/u.test(line));
		expect(prebuild).toMatch(/C15T_NATIVE_UI=0 bun x expo prebuild/u);
		expect(install).toMatch(/env -u C15T_NATIVE_UI pod install/u);
	});
});
