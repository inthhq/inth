import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vite-plus/test';

const script = new URL('./ci-android-fingerprint.py', import.meta.url).pathname;
const workflow = new URL(
	'../.github/workflows/android-emulator.yml',
	import.meta.url
).pathname;

const roots: string[] = [];

const repo = () => {
	const root = mkdtempSync(join(tmpdir(), 'inth-fingerprint-'));
	roots.push(root);
	const git = (...args: string[]) =>
		execFileSync(
			'git',
			['-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
			{
				cwd: root,
			}
		);
	git('init', '-q');
	const commit = (files: Record<string, string>) => {
		for (const [path, text] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), text);
		}
		git('add', '-A');
		git('commit', '-qm', 'change');
	};
	const fingerprints = () =>
		Object.fromEntries(
			execFileSync('python3', [script], { cwd: root, encoding: 'utf8' })
				.trim()
				.split('\n')
				.map((line) => line.split('='))
		) as { apps: string; native: string };
	return { commit, fingerprints };
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

describe('ci-android-fingerprint.py', () => {
	it('changes a suite only when one of its inputs changes', () => {
		const { commit, fingerprints } = repo();
		commit({
			'docs/guide.md': 'one',
			'examples/native/demo.kt': 'one',
			'internals/fixtures/expo-dev/app.ts': 'one',
			'packages/android/core.kt': 'one',
		});
		const first = fingerprints();

		commit({ 'docs/guide.md': 'two' });
		expect(fingerprints()).toEqual(first);

		commit({ 'internals/fixtures/expo-dev/app.ts': 'two' });
		const afterExpo = fingerprints();
		expect(afterExpo.native).toBe(first.native);
		expect(afterExpo.apps).not.toBe(first.apps);

		commit({ 'examples/native/demo.kt': 'two' });
		const afterDemo = fingerprints();
		expect(afterDemo.native).not.toBe(afterExpo.native);
		expect(afterDemo.apps).toBe(afterExpo.apps);

		// Both suites build packages/android.
		commit({ 'packages/android/core.kt': 'two' });
		const afterAndroid = fingerprints();
		expect(afterAndroid.native).not.toBe(afterDemo.native);
		expect(afterAndroid.apps).not.toBe(afterDemo.apps);
	});

	it('changes every suite when the workflow changes', () => {
		const { commit, fingerprints } = repo();
		commit({ '.github/workflows/android-emulator.yml': 'one' });
		const first = fingerprints();
		commit({ '.github/workflows/android-emulator.yml': 'two' });
		const second = fingerprints();
		expect(second.native).not.toBe(first.native);
		expect(second.apps).not.toBe(first.apps);
	});

	it("accepts this repository's workflow filter", () => {
		expect(
			execFileSync('python3', [script, '--check', workflow], {
				encoding: 'utf8',
			})
		).toContain('covers every suite input');
	});

	it('rejects a filter that misses an input', () => {
		const root = mkdtempSync(join(tmpdir(), 'inth-fingerprint-'));
		roots.push(root);
		const narrowed = join(root, 'workflow.yml');
		writeFileSync(
			narrowed,
			readFileSync(workflow, 'utf8').replace('      - "patches/**"\n', '')
		);
		expect(() =>
			execFileSync('python3', [script, '--check', narrowed], { stdio: 'pipe' })
		).toThrow(/misses suite inputs: patches/u);
	});
});
