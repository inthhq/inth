import { MANIFEST_RUNTIME_LEVEL } from '@inth/sdk-core/manifest-runtime';
import type { SSRInitialData } from '@inth/sdk-core/runtime/deferred-snapshot';
import { describe, expect, test } from 'vite-plus/test';

import { readRemoteStandIns, withCachedRegistry } from '../init/remote-entries';

const entry = (id: string, manifest: Record<string, unknown> = {}) => ({
	id,
	integration: id,
	manifest: { category: 'marketing', vendor: id, ...manifest },
});
const answer = (scriptRegistry: unknown) =>
	({ init: { scriptRegistry } }) as unknown as SSRInitialData;

describe('readRemoteStandIns', () => {
	test('reads each entry the engine would load, with its categories', () => {
		const read = readRemoteStandIns(
			answer({
				load: [
					entry('meta-pixel'),
					entry('google-tag-manager', {
						alwaysLoad: true,
						category: { or: ['measurement', 'marketing'] },
					}),
				],
			}),
			[]
		);

		expect(read.scripts).toEqual([
			expect.objectContaining({
				alwaysLoad: false,
				category: 'marketing',
				id: 'meta-pixel',
			}),
			expect.objectContaining({
				alwaysLoad: true,
				id: 'google-tag-manager',
			}),
		]);
		expect(read.categories.toSorted()).toEqual([
			'marketing',
			'marketing',
			'measurement',
		]);
	});

	test('skips an entry a code script claims, and malformed ones', () => {
		const read = readRemoteStandIns(
			answer({
				load: [
					entry('meta-pixel'),
					entry('posthog', { category: 'advertising' }),
					entry('tiktok-pixel', { vendor: 'other' }),
					{ id: 'clarity' },
					{ id: 'acme', manifest: { category: 'marketing', vendor: 'acme' } },
					'junk',
				],
			}),
			[{ category: 'marketing', id: 'pixel', integration: 'meta-pixel' }]
		);

		expect(read).toEqual({ categories: [], scripts: [] });
	});

	test('skips an entry whose manifest requires a later runtime level, and asks for none of its categories', () => {
		const read = readRemoteStandIns(
			answer({
				load: [
					entry('meta-pixel', { requires: MANIFEST_RUNTIME_LEVEL }),
					entry('posthog', {
						category: 'measurement',
						requires: MANIFEST_RUNTIME_LEVEL + 1,
					}),
				],
			}),
			[]
		);

		expect(read.scripts.map(({ id }) => id)).toEqual(['meta-pixel']);
		expect(read.categories).toEqual(['marketing']);
	});

	test('skips an entry whose id a code script uses, whatever its vendor', () => {
		const read = readRemoteStandIns(answer({ load: [entry('acme-pixel')] }), [
			{ category: 'marketing', id: 'acme-pixel', vendor: 'acme-legacy' },
		]);

		expect(read).toEqual({ categories: [], scripts: [] });
	});

	test('reads nothing without a list', () => {
		expect(readRemoteStandIns(answer({ sources: {} }), [])).toEqual({
			categories: [],
			scripts: [],
		});
		expect(readRemoteStandIns(undefined, [])).toEqual({
			categories: [],
			scripts: [],
		});
	});
});

describe('withCachedRegistry', () => {
	const cached = answer({ load: [entry('meta-pixel')] });

	test('carries the cached list in place of an unavailable registry', () => {
		const filled = withCachedRegistry(answer({ unavailable: true }), cached);

		expect(filled?.init?.scriptRegistry).toEqual(cached.init?.scriptRegistry);
	});

	test('keeps an answer with a list, or with nothing cached', () => {
		const live = answer({ load: [] });
		const unavailable = answer({ unavailable: true });

		expect(withCachedRegistry(live, cached)).toBe(live);
		expect(withCachedRegistry(unavailable, undefined)).toBe(unavailable);
	});
});
