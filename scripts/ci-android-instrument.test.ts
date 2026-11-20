import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const runner = new URL('./ci-android-instrument.py', import.meta.url).pathname;

const status = (fields: Record<string, string>, code: number): string =>
	`${Object.entries(fields)
		.map(([key, value]) => `INSTRUMENTATION_STATUS: ${key}=${value}`)
		.join('\n')}\nINSTRUMENTATION_STATUS_CODE: ${code}\n`;

const test = (
	className: string,
	name: string,
	numtests: number,
	end: number,
	stack?: string
): string => {
	const fields: Record<string, string> = {
		class: className,
		numtests: String(numtests),
		test: name,
	};
	const started = status(fields, 1);
	if (stack) {
		fields.stack = stack;
	}
	return `${started}${status(fields, end)}`;
};

const okResult =
	'INSTRUMENTATION_RESULT: stream=\nOK (3 tests)\nINSTRUMENTATION_CODE: -1\n';

const roots: string[] = [];

/** Run the script against a fake adb that prints `output` for `am instrument`. */
const run = (output: string) => {
	const root = mkdtempSync(join(tmpdir(), 'inth-instrument-'));
	roots.push(root);
	const tools = join(root, 'sdk/platform-tools');
	mkdirSync(tools, { recursive: true });
	writeFileSync(join(root, 'instrument.txt'), output);
	writeFileSync(
		join(tools, 'adb'),
		`#!/usr/bin/env bash
echo "$*" >> "${root}/calls.txt"
case "$*" in
  *"am instrument"*) cat "${root}/instrument.txt" ;;
esac
`
	);
	chmodSync(join(tools, 'adb'), 0o755);
	const out = join(root, 'out');
	const result = spawnSync(
		'python3',
		[
			runner,
			'--apk',
			'app.apk',
			'--test-apk',
			'test.apk',
			'--instrumentation',
			'com.example.test/androidx.test.runner.AndroidJUnitRunner',
			'--arg',
			'inthVendorCapture=http://localhost:39874',
			'--out',
			out,
		],
		{
			encoding: 'utf8',
			env: {
				...process.env,
				ANDROID_HOME: join(root, 'sdk'),
				ANDROID_SERIAL: 'emulator-5554',
			},
		}
	);
	return {
		calls: readFileSync(join(root, 'calls.txt'), 'utf8').trim().split('\n'),
		junit: readFileSync(join(out, 'junit.xml'), 'utf8'),
		result,
	};
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { force: true, recursive: true });
	}
});

describe('ci-android-instrument.py', () => {
	it('installs the APKs with permissions, then reports every class', () => {
		const { calls, junit, result } = run(
			test('com.example.A', 'one', 3, 0) +
				test('com.example.A', 'two', 3, 0) +
				test('com.example.B', 'three', 3, 0) +
				okResult
		);

		expect(result.status).toBe(0);
		expect(calls).toEqual([
			'-s emulator-5554 install -r -t -g app.apk',
			'-s emulator-5554 install -r -t -g test.apk',
			'-s emulator-5554 shell am instrument -w -r -e inthVendorCapture http://localhost:39874 com.example.test/androidx.test.runner.AndroidJUnitRunner',
		]);
		expect(junit).toContain('name="com.example.A" tests="2" failures="0"');
		expect(junit).toContain('name="com.example.B" tests="1" failures="0"');
		expect(result.stdout).toContain('3 of 3 tests passed');
	});

	it('fails with the stack trace when a test fails', () => {
		const { junit, result } = run(
			[
				test('com.example.A', 'one', 2, 0),
				test(
					'com.example.A',
					'two',
					2,
					-2,
					'java.lang.AssertionError: expected saved\n\tat com.example.A.two(A.kt:9)'
				),
				'INSTRUMENTATION_RESULT: stream=\nFAILURES!!!\nINSTRUMENTATION_CODE: -1\n',
			].join('')
		);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('1 of 2 tests failed: com.example.A#two');
		expect(junit).toContain(
			'<failure message="java.lang.AssertionError: expected saved">'
		);
		expect(junit).toContain('at com.example.A.two(A.kt:9)');
	});

	it('fails when the app crashes before every announced test ran', () => {
		const { junit, result } = run(
			[
				test('com.example.A', 'one', 3, 0),
				status({ class: 'com.example.A', numtests: '3', test: 'two' }, 1),
				'INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0\n',
			].join('')
		);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			'The runner announced 3 tests but 1 finished'
		);
		expect(junit).toContain('name="instrumentation"');
	});

	it('fails when the instrumentation is missing', () => {
		const { result } = run(
			'INSTRUMENTATION_FAILED: com.example.test/androidx.test.runner.AndroidJUnitRunner\nINSTRUMENTATION_CODE: 0\n'
		);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('INSTRUMENTATION_FAILED');
	});
});
