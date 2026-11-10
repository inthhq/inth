/**
 * The bridge payload table, its generated JSON and its runtime check.
 *
 * `native/protocol/bridge/payloads.json` is what the Kotlin and Swift binding
 * tests read, so a stale copy would let a native rename pass. The validator
 * cases prove each kind of drift is named, and the fixture case proves the
 * snapshot entry agrees with what the TypeScript kernel produces.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	createFakeNativeModule,
	FAKE_BOOTSTRAP,
} from '../../__tests__/helpers/fake-native';
import { createConsentClient } from '../../native/client';
import { getNativeC15tEvents } from '../../native/module';
import {
	BRIDGE_PAYLOADS,
	describeBridgePayloadDrift,
	normalizeBridgeField,
	renderBridgeSchema,
} from '../bridge-schema';

const PROTOCOL_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../native/protocol'
);

describe('native/protocol/bridge/payloads.json', () => {
	test('matches the table it is generated from', () => {
		const onDisk: unknown = JSON.parse(
			readFileSync(resolve(PROTOCOL_DIR, 'bridge/payloads.json'), 'utf8')
		);

		// Stale means a native test is checking yesterday's names. Regenerate with
		// `bun run --cwd packages/react-native generate:bridge-schema`.
		expect(onDisk).toEqual(renderBridgeSchema());
	});

	test('marks the two payloads JavaScript sends', () => {
		const { payloads } = renderBridgeSchema();

		expect(
			Object.entries(payloads)
				.filter(([, payload]) => payload.direction === 'js-to-native')
				.map(([name]) => name)
		).toEqual(['commitIntent', 'overridesInput']);
	});
});

describe('normalizeBridgeField', () => {
	test('reads optional and nullable markers from the shorthand', () => {
		expect(normalizeBridgeField('string')).toEqual({
			nullable: false,
			required: true,
			type: 'string',
		});
		expect(normalizeBridgeField('boolean? | null')).toEqual({
			nullable: true,
			required: false,
			type: 'boolean',
		});
		expect(
			normalizeBridgeField({ enum: ['a'], nullable: true, optional: true })
		).toEqual({
			nullable: true,
			required: false,
			type: 'string',
			values: ['a'],
		});
	});
});

describe('describeBridgePayloadDrift', () => {
	test('accepts a payload that matches', () => {
		expect(describeBridgePayloadDrift('bootstrap', FAKE_BOOTSTRAP)).toEqual([]);
	});

	test('names both halves of a renamed key', () => {
		const { nativeSdkVersion, ...rest } = FAKE_BOOTSTRAP;

		expect(
			describeBridgePayloadDrift('bootstrap', {
				...rest,
				sdkVersion: nativeSdkVersion,
			})
		).toEqual([
			'nativeSdkVersion: required, absent from the payload',
			'sdkVersion: not a key this payload declares',
		]);
	});

	test('still names the missing half when unknown keys are allowed', () => {
		const { nativeSdkVersion, ...rest } = FAKE_BOOTSTRAP;

		expect(
			describeBridgePayloadDrift(
				'bootstrap',
				{ ...rest, sdkVersion: nativeSdkVersion },
				{ allowUnknownKeys: true }
			)
		).toEqual(['nativeSdkVersion: required, absent from the payload']);
	});

	test('names a null, a wrong kind and an unknown enum value', () => {
		expect(
			describeBridgePayloadDrift('presenterOutcome', {
				kind: 'closed',
				revision: '3',
				sessionId: null,
			})
		).toEqual([
			'kind: "closed" is not one of committed, acknowledged, dismissed, unavailable',
			'revision: expected number, found string',
			'sessionId: null where a string is required',
		]);
	});

	test('walks into nested objects', () => {
		const snapshot = JSON.parse(
			readFileSync(resolve(PROTOCOL_DIR, 'evaluation-eu-opt-in.json'), 'utf8')
		).expected.snapshot as Record<string, unknown>;

		expect(
			describeBridgePayloadDrift('snapshot', {
				...snapshot,
				location: { country: 'DE', regionCode: null },
			})
		).toEqual([
			'location.countryCode: required, absent from the payload',
			'location.country: not a key this payload declares',
		]);
	});

	test('refuses a payload that is not an object', () => {
		expect(describeBridgePayloadDrift('commitResult', [])).toEqual([
			'commitResult: the payload is not a JSON object',
		]);
	});

	test('accepts every snapshot the kernel fixtures pin', () => {
		const index = JSON.parse(
			readFileSync(resolve(PROTOCOL_DIR, 'index.json'), 'utf8')
		) as { fixtures: { file: string }[] };
		const snapshots = index.fixtures.flatMap(({ file }) => {
			const { expected } = JSON.parse(
				readFileSync(resolve(PROTOCOL_DIR, file), 'utf8')
			) as { expected: Record<string, unknown> };
			return ['snapshot', 'snapshotAfter', 'snapshotBefore']
				.filter((when) => typeof expected[when] === 'object' && expected[when])
				.map((when) => ({
					label: `${file} ${when}`,
					snapshot: expected[when],
				}));
		});
		const drifted = snapshots
			.map(({ label, snapshot }) => ({
				label,
				problems: describeBridgePayloadDrift('snapshot', snapshot),
			}))
			.filter(({ problems }) => problems.length > 0);

		expect(snapshots.length).toBeGreaterThan(20);
		expect(drifted).toEqual([]);
	});

	test('covers every payload in the table', () => {
		expect(Object.keys(BRIDGE_PAYLOADS).sort()).toEqual([
			'bootstrap',
			'commitIntent',
			'commitResult',
			'errorEvent',
			'initializedEvent',
			'overridesInput',
			'presenterOutcome',
			'presenterSession',
			'snapshot',
			'snapshotEvent',
			'trackingAuthorization',
			'trackingRequest',
		]);
	});
});

describe('commitResult.reason', () => {
	const REPO = resolve(PROTOCOL_DIR, '..', '..');
	const read = (path: string): string =>
		readFileSync(resolve(REPO, path), 'utf8');

	/** The body of the first `func <name>(` in a Swift source, braces balanced. */
	const swiftFunction = (source: string, name: string): string => {
		const start = source.indexOf(`func ${name}(`);
		let index = source.indexOf('{', start);
		let depth = 0;
		const begin = index;
		do {
			if (source[index] === '{') {
				depth += 1;
			} else if (source[index] === '}') {
				depth -= 1;
			}
			index += 1;
		} while (depth > 0 && index < source.length);
		return source.slice(begin, index);
	};

	test('declares every refusal code a native save can return', () => {
		const kotlin = [
			...read(
				'native/core-android/c15t-core/src/main/kotlin/com/c15t/core/ConsentCore.kt'
			).matchAll(/refusedCommit\(\s*"(?<code>[a-z-]+)"/gu),
		].map((match) => match.groups?.code);
		const swiftSave = swiftFunction(
			read('native/core-swift/Sources/C15tCore/ConsentCore.swift'),
			'save'
		);
		// Rejections are `.failure(CoreErrorInfo(code: ...))` or the `let info`
		// written before a refused queue write. Codes passed to `events.emit` report
		// delivery, not the commit, so they are left out.
		const swift = [
			...swiftSave.matchAll(
				/(?:\.failure\(\s*CoreErrorInfo\(|let info = CoreErrorInfo\()\s*code:\s*(?:\w+\s*\?\s*)?"(?<first>[a-z-]+)"(?:\s*:\s*"(?<second>[a-z-]+)")?/gu
			),
		].flatMap((match) => [match.groups?.first, match.groups?.second]);
		const bridge = ['invalid-intent', 'not-bootstrapped'];
		const declared = new Set<string>(BRIDGE_PAYLOADS.commitResult.reason.enum);

		// Floors, so a pattern that stops matching cannot pass by finding nothing.
		expect(new Set(kotlin).size).toBeGreaterThanOrEqual(10);
		expect(new Set(swift).size).toBeGreaterThanOrEqual(14);
		const undeclared = [...new Set([...kotlin, ...swift, ...bridge])]
			.filter((code): code is string => code !== undefined)
			.filter((code) => !declared.has(code))
			.sort();
		expect(undeclared).toEqual([]);
	});

	test('a legitimate IAB refusal is not reported as drift', () => {
		expect(
			describeBridgePayloadDrift('commitResult', {
				confirmed: [],
				ok: false,
				queued: false,
				reason: 'bundled-policy-expired',
				revision: null,
				subjectId: null,
			})
		).toEqual([]);
	});
});

describe('the consent client at the boundary', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('warns once, by key, about a renamed bootstrap field', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { subjectId, ...rest } = FAKE_BOOTSTRAP;
		const bootstrap = { ...rest, subject: subjectId };

		createConsentClient(
			createFakeNativeModule({ bootstrap }),
			getNativeC15tEvents()
		).dispose();
		createConsentClient(
			createFakeNativeModule({ bootstrap }),
			getNativeC15tEvents()
		).dispose();

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			'c15t ConsentClient: the native bootstrap payload does not match the declared wire shape.',
			['subjectId: required, absent from the payload']
		);
	});

	test('warns about a commit result with a renamed key', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fake = createFakeNativeModule();
		const client = createConsentClient(fake, getNativeC15tEvents());
		fake.failCommitWith(
			JSON.stringify({
				confirmed: [],
				isQueued: false,
				ok: false,
				reason: 'policy-pending',
				revision: null,
				subjectId: null,
			})
		);

		await client.commit({ action: 'all' });
		client.dispose();

		expect(warn).toHaveBeenCalledWith(
			'c15t ConsentClient: the native commitResult payload does not match the declared wire shape.',
			['queued: required, absent from the payload']
		);
	});

	test('stays quiet in production', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubEnv('NODE_ENV', 'production');
		const { hasStoredSnapshot, ...rest } = FAKE_BOOTSTRAP;

		createConsentClient(
			createFakeNativeModule({
				bootstrap: { ...rest, stored: hasStoredSnapshot },
			}),
			getNativeC15tEvents()
		).dispose();
		vi.unstubAllEnvs();

		expect(warn).not.toHaveBeenCalled();
	});
});
