import { spawnSync } from 'node:child_process';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const verifier = new URL(
	'../packages/android/consumer-smoke/verify.py',
	import.meta.url
).pathname;

const install = `#!/usr/bin/env python3
import json
import os
from pathlib import Path

root = Path.cwd()
manifest = json.loads((root / 'package.json').read_text())
for name in ['react-native', 'react']:
    package = root / 'node_modules' / name
    package.mkdir(parents=True)
    version = manifest['dependencies'][name]
    if name == 'react-native':
        version = os.environ.get('INSTALLED_RN_VERSION', version)
    (package / 'package.json').write_text(json.dumps({'version': version}))
packed = root / 'node_modules/@inth/react-native'
packed.mkdir(parents=True)
spec = packed / 'android/inth-react-native/build/generated/source/codegen/java/com/inth/reactnative/NativeInthSpec.java'
spec.parent.mkdir(parents=True)
spec.write_text('generated')
`;

const build = `#!/usr/bin/env python3
from pathlib import Path

root = Path.cwd()
for relative, content in [
    ('app/build/outputs/apk/release/app-release-unsigned.apk', 'apk'),
    ('app/build/outputs/mapping/release/mapping.txt', 'mapping'),
    ('app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml', 'com.inth.reactnative.InthReactNativeInitializer'),
]:
    output = root / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(content)
`;

const runConsumer = function runConsumer(options?: {
	installedRN?: string;
	versions?: string[];
}) {
	const directory = mkdtempSync(join(tmpdir(), 'inth-consumer-flags-'));
	const bin = join(directory, 'bin');
	mkdirSync(bin);
	writeFileSync(join(bin, 'bun'), install, { mode: 0o755 });
	writeFileSync(join(bin, 'java'), build, { mode: 0o755 });
	const tarball = join(directory, 'sdk.tgz');
	writeFileSync(tarball, 'transport stub');
	const output = join(directory, 'result');
	const result = spawnSync(
		'python3',
		[
			verifier,
			'--repository',
			'https://maven.example.com/releases',
			'--version',
			'3.0.0-alpha.1',
			'--rn-package',
			tarball,
			'--output',
			output,
			...(options?.versions ?? []),
		],
		{
			encoding: 'utf8',
			env: {
				...process.env,
				INSTALLED_RN_VERSION: options?.installedRN ?? '',
				JAVA_HOME: '',
				PATH: `${bin}:${process.env.PATH}`,
			},
		}
	);
	return { directory, output, result };
};

describe('isolated Android consumer version selection', () => {
	it.each([
		['0.86.3', '19.2.7', 36, []],
		[
			'0.88.1',
			'19.3.0',
			37,
			[
				'--react-native-version',
				'0.88.1',
				'--react-version',
				'19.3.0',
				'--compile-sdk',
				'37',
			],
		],
	])(
		'passes installed RN %s and React %s to the consumer build at API %i',
		(reactNative, react, compileSdk, versions) => {
			const { directory, output, result } = runConsumer({
				installedRN: reactNative,
				versions,
			});
			try {
				expect(result.status, result.stderr).toBe(0);
				const manifest = JSON.parse(
					readFileSync(join(output, 'consumer/package.json'), 'utf8')
				);
				expect(manifest.dependencies).toMatchObject({
					react,
					'react-native': reactNative,
				});
				const evidence = JSON.parse(
					readFileSync(join(output, 'result.json'), 'utf8')
				);
				expect(evidence).toMatchObject({
					reactNativeVersion: reactNative,
					reactVersion: react,
					toolchain: { compileSdk, minSdk: 24 },
				});
				expect(evidence.commands.at(-1)).toEqual(
					expect.arrayContaining([
						`-Pinth.reactNativeVersion=${reactNative}`,
						`-PcompileSdkVersion=${compileSdk}`,
						':headless:test',
						':app:assembleRelease',
					])
				);
			} finally {
				rmSync(directory, { force: true, recursive: true });
			}
		}
	);

	it('refuses to report the requested RN version when a different version installed', () => {
		const { directory, result } = runConsumer({ installedRN: '0.87.1' });
		try {
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('Installed react-native 0.87.1');
			expect(result.stderr).toContain('expected 0.86.3');
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});

	it('requires an exact host version before preparing the consumer', () => {
		const { directory, result } = runConsumer({
			versions: ['--react-native-version', '^0.88.0'],
		});
		try {
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('must be an exact package version');
		} finally {
			rmSync(directory, { force: true, recursive: true });
		}
	});
});
