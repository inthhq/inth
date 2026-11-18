/// <reference types="node" />
/**
 * A client-rendered provider's first render reads `pendingBootSnapshot`
 * from the light `deferred-boot` module; the engine and the other adapters
 * read `pendingSnapshot`, which the kernel's own builder computes. They
 * must be the same snapshot, and the light module must stay free of the
 * kernel's builder and evaluator, or it would carry them into a page's
 * first-load chunk.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { pendingBootSnapshot } from '../deferred-boot';
import type { PendingSnapshotOptions } from '../deferred-boot';
import { pendingSnapshot } from '../deferred-snapshot';

const CASES: [string, PendingSnapshotOptions][] = [
	['no options', {}],
	['empty categories', { consentCategories: [] }],
	['necessary only', { consentCategories: ['necessary'] }],
	[
		'declared categories, unsorted, repeated',
		{
			consentCategories: ['marketing', 'necessary', 'measurement', 'marketing'],
		},
	],
	[
		'every category',
		{
			consentCategories: [
				'necessary',
				'functionality',
				'experience',
				'measurement',
				'marketing',
			],
		},
	],
	['location overrides', { overrides: { country: 'DE', language: 'de' } }],
	[
		'GPC override with categories',
		{ consentCategories: ['measurement'], overrides: { gpc: true } },
	],
	['GPC override off', { overrides: { gpc: false } }],
	['GPC detected', { consentCategories: ['marketing'], gpc: true }],
];

describe('pendingBootSnapshot', () => {
	test.each(CASES)('equals pendingSnapshot: %s', (_name, options) => {
		const light = pendingBootSnapshot(options);
		expect(light).toStrictEqual(pendingSnapshot(options));
		expect(Object.isFrozen(light)).toBe(true);
		expect(Object.isFrozen(light.effectivePermissions)).toBe(true);
		expect(Object.isFrozen(light.privacySignals.gpc)).toBe(true);
	});

	test('does not freeze or share the caller overrides', () => {
		const overrides = { country: 'GB' };
		const snapshot = pendingBootSnapshot({ overrides });
		expect(snapshot.overrides).not.toBe(overrides);
		expect(Object.isFrozen(overrides)).toBe(false);
	});

	test('imports neither the kernel builder, the record evaluator nor the policy code', () => {
		const source = readFileSync(
			join(dirname(fileURLToPath(import.meta.url)), '../deferred-boot.ts'),
			'utf8'
		);
		const imports = [
			...source.matchAll(/^import [^;]*? from '(?<specifier>[^']+)';/gmu),
		]
			.filter(([statement]) => !statement.startsWith('import type'))
			.map((match) => match.groups?.specifier);
		expect(imports.length).toBeGreaterThan(0);
		for (const specifier of imports) {
			expect(specifier).not.toMatch(
				/kernel|consent-record|deferred-snapshot|@inth\/sdk\/schema|translations|\.\.\/policy/u
			);
		}
	});
});
