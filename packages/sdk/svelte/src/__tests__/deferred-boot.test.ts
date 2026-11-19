/**
 * The boot data `InthProvider` leaves for the browser, and the rule for when
 * the engine may wait.
 */
import { defaultTranslationConfig } from '@inth/sdk/engine';
import { canDeferEngine } from '@inth/sdk/server';
import { afterEach, describe, expect, test } from 'vitest';

import { readConsentBoot } from '../lib/deferred/boot';
import {
	planServerBoot,
	withCompleteTranslations,
} from '../lib/deferred/boot-server';
import { modulePreloadMarker } from '../lib/module-preload';
import { createOwnedRuntime } from '../lib/owned-runtime';
import { runtimeOptionsFor } from '../lib/provider-options';
import type { ProviderOptionsInput } from '../lib/provider-options';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

// The page's categories: a permissive policy grants the ones it does not
// name, so a page that names none never waits.
const CATEGORIES: ProviderOptionsInput['consentCategories'] = [
	'necessary',
	'measurement',
	'marketing',
];

const runtimeFor = (options: ProviderOptionsInput) =>
	createOwnedRuntime(
		runtimeOptionsFor({
			consentCategories: CATEGORIES,
			...options,
			mode: transportMode({}),
		})
	);

const snapshotFor = (options: ProviderOptionsInput) =>
	runtimeFor(options).kernel.getSnapshot();

afterEach(() => {
	document.body.innerHTML = '';
});

describe('canDeferEngine', () => {
	test('a visitor the banner asks, with nothing granted, may wait', () => {
		const options = {
			consentCategories: CATEGORIES,
			prefetch: policyFixture(),
		};
		expect(canDeferEngine(snapshotFor(options), options)).toBe(true);
	});

	test('a page that names no categories may not, under a permissive policy', () => {
		const options = { prefetch: policyFixture() };
		expect(
			canDeferEngine(
				createOwnedRuntime(
					runtimeOptionsFor({ ...options, mode: transportMode({}) })
				).kernel.getSnapshot(),
				options
			)
		).toBe(false);
	});

	test('a returning visitor, a runnable script or an engine-only option may not', () => {
		const returning = { prefetch: policyFixture({ measurement: true }) };
		expect(canDeferEngine(snapshotFor(returning), returning)).toBe(false);

		const asking = { prefetch: policyFixture() };
		const snapshot = snapshotFor(asking);
		expect(
			canDeferEngine(snapshot, {
				...asking,
				scripts: [{ alwaysLoad: true, category: 'measurement', id: 'a' }],
			})
		).toBe(false);
		expect(canDeferEngine(snapshot, { ...asking, gpp: true })).toBe(false);
		expect(canDeferEngine(snapshot, { ...asking, persistence: false })).toBe(
			false
		);
		expect(
			canDeferEngine(snapshot, { ...asking, networkBlocker: { rules: [] } })
		).toBe(false);
		// Turned off, the blocker asks nothing of the engine.
		expect(
			canDeferEngine(snapshot, {
				...asking,
				networkBlocker: { enabled: false, rules: [] },
			})
		).toBe(true);
	});
});

describe('boot data', () => {
	test('the browser reads what the server wrote, once, as the same markup', () => {
		const options = {
			consentCategories: CATEGORIES,
			prefetch: policyFixture(),
		};
		const planned = planServerBoot(runtimeFor(options), options);
		document.body.innerHTML = planned.html;

		const read = readConsentBoot(undefined);
		expect(planned.defer).toBe(true);
		expect(read?.boot.d).toBe(1);
		expect(read?.boot.s.activeUI).toBe('banner');
		// Hydration renders this over the server's element unchanged.
		expect(read?.html).toBe(planned.html);
		expect(readConsentBoot(undefined)).toBeNull();
	});

	test('completes a partial bundle with the English defaults, but not the IAB copy', () => {
		const snapshot = snapshotFor({ prefetch: policyFixture() });
		const english = defaultTranslationConfig.translations.en;
		const partial = withCompleteTranslations({
			...snapshot,
			translations: {
				language: 'de',
				translations: {
					common: { acceptAll: 'Alle akzeptieren' },
				} as never,
			},
		});

		expect(partial.translations?.language).toBe('de');
		const bundle = partial.translations?.translations as typeof english;
		expect(bundle.common.acceptAll).toBe('Alle akzeptieren');
		expect(bundle.common.rejectAll).toBe(english?.common.rejectAll);
		expect(bundle.cookieBanner).toEqual(english?.cookieBanner);
		expect(bundle).not.toHaveProperty('iab');
		// A snapshot without copy gets the English bundle.
		expect(
			withCompleteTranslations({ ...snapshot, translations: null }).translations
				?.language
		).toBe('en');
	});

	test('escapes markup in the snapshot', () => {
		const options = { prefetch: policyFixture() };
		const planned = planServerBoot(runtimeFor(options), options);
		expect(planned.html.match(/</gu)).toHaveLength(2);
	});
});

describe('modulePreloadMarker', () => {
	test('names the engine first, then the loader', () => {
		expect(
			modulePreloadMarker({ nonce: 'n', scripts: [{}] }, { engine: true })
		).toBe('engine loader-and-blocker nonce=n');
		expect(modulePreloadMarker({}, { engine: true })).toBe('engine');
		expect(modulePreloadMarker({})).toBe('');
	});
});
