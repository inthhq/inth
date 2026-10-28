import { execFileSync, spawnSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflow = parse(
	readFileSync(
		new URL('../.github/workflows/mobile-device.yml', import.meta.url),
		'utf8'
	)
);
const step = workflow.jobs.device.steps.find(
	(entry: { name?: string }) =>
		entry.name === 'Assemble the Android apps against staged binaries'
);

describe('mobile-device Android dependency guards', () => {
	it.each([
		['unresolved dependency', 'com.c15t:c15t-core:missing FAILED', '', 1],
		[
			'native source substitution',
			'com.c15t:c15t-core:resolved',
			'dependencySubstitution {}',
			1,
		],
		['resolved binary dependencies', 'com.c15t:c15t-core:resolved', '', 0],
	] as const)(
		'handles %s without rg on PATH',
		(_label, dependencies, settings, expected) => {
			const root = mkdtempSync(join(tmpdir(), 'c15t-device-guard-'));
			try {
				const bin = join(root, 'bin');
				mkdirSync(bin);
				for (const name of ['sh', 'grep', 'mkdir', 'cat']) {
					const path = execFileSync('/bin/sh', ['-c', `command -v ${name}`], {
						encoding: 'utf8',
					}).trim();
					symlinkSync(path, join(bin, name));
				}
				writeFileSync(join(bin, 'bun'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
				for (const fixture of ['react-native-bare', 'expo-dev']) {
					const android = join(root, 'internals/fixtures', fixture, 'android');
					mkdirSync(android, { recursive: true });
					writeFileSync(join(android, 'settings.gradle'), settings);
					writeFileSync(
						join(android, 'gradlew'),
						'#!/bin/sh\ncase "$*" in *:app:dependencies*) printf "%s\\n" "$DEPENDENCY_REPORT";; *) exit 0;; esac\n'
					);
				}
				const result = spawnSync('/bin/sh', ['-e', '-c', step.run], {
					cwd: root,
					encoding: 'utf8',
					env: { DEPENDENCY_REPORT: dependencies, PATH: bin },
				});
				expect(result.status, result.stderr).toBe(expected);
				expect(result.stderr).not.toContain('not found');
			} finally {
				rmSync(root, { force: true, recursive: true });
			}
		}
	);
});
