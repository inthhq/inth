import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import { toPublicSpecifier, toPublicSubpath } from '../../shared/sdk-parts';
import {
	computeManifestFields,
	expectedManifest,
	findPrivateNames,
	PACKAGE_ROOT,
} from '../scripts/assemble';

const manifest = JSON.parse(
	readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')
) as Record<string, unknown>;

describe('@inth/sdk manifest', () => {
	test('matches what the private packages export', () => {
		expect(manifest).toEqual(expectedManifest());
	});

	test('depends on no workspace package', () => {
		const { dependencies } = computeManifestFields();
		expect(
			Object.keys(dependencies).filter((name) => name.startsWith('@inth/'))
		).toEqual([]);
		expect(JSON.stringify(manifest)).not.toContain('@inth/sdk-');
	});

	test('keeps the root, engine, translation and IAB entries where documented', () => {
		const exports = manifest.exports as Record<string, unknown>;
		for (const key of [
			'.',
			'./hosted',
			'./inth.js',
			// Script-tag servers such as @c15t/backend import it.
			'./prefetch',
			'./engine',
			'./runtime',
			'./server',
			'./testing',
			'./devtools',
			'./iab-client',
			'./translations/de',
			'./translations/all',
			'./iab',
			'./iab/gpp',
			'./ui/styles.css',
			'./ui/postcss-tailwind3',
		]) {
			expect(exports, key).toHaveProperty([key]);
		}
	});

	test('keeps no path with core or browser in it', () => {
		expect(
			Object.keys(manifest.exports as object).filter((key) =>
				/^\.\/(?:core|browser|dev-tools)(?:\/|$)/u.test(key)
			)
		).toEqual([]);
	});

	test('maps private names to public subpaths', () => {
		expect(toPublicSubpath('browser', '.')).toBe('.');
		expect(toPublicSubpath('browser', './hosted')).toBe('./hosted');
		expect(toPublicSubpath('browser', './iab')).toBe('./iab-client');
		expect(toPublicSubpath('browser', './testing')).toBe('./testing');
		expect(toPublicSubpath('core', '.')).toBe('./engine');
		expect(toPublicSubpath('core', './testing')).toBe('./testing');
		expect(toPublicSubpath('core', './runtime')).toBe('./runtime');
		expect(toPublicSubpath('dev-tools', '.')).toBe('./devtools');
		expect(toPublicSubpath('iab', './gpp')).toBe('./iab/gpp');
		expect(toPublicSubpath('translations', './de')).toBe('./translations/de');
		expect(
			toPublicSpecifier(
				"import { a } from '@inth/sdk-core/runtime';\nimport { b } from '@inth/sdk-core';\nimport c from '@inth/sdk-browser';\nimport '@inth/sdk-ui/styles.css';\nimport { d } from '@inth/sdk-dev-tools';"
			)
		).toBe(
			"import { a } from '@inth/sdk/runtime';\nimport { b } from '@inth/sdk/engine';\nimport c from '@inth/sdk';\nimport '@inth/sdk/ui/styles.css';\nimport { d } from '@inth/sdk/devtools';"
		);
	});
});

describe('assembled lib/', () => {
	test('names no private package', () => {
		expect(findPrivateNames()).toEqual([]);
	});
});
