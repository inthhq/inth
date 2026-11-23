/**
 * Which visitors the Nuxt plugin starts from the server's snapshot, and the
 * names the first-load chunk copies from the build.
 */
import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations } from '@inth/sdk/translations/en';
import { describe, expect, test } from 'vitest';

import { canDeferEngine } from '../../../core/src/surface-actions/can-defer-engine';
import { createVueConsentKernelContext } from '../../../vue/src/__tests__/test-kernel';
import { DEFERRED_ENGINE_MANIFEST_KEY } from '../../../vue/src/runtime/deferred/boot';
import { isDeferredBannerModule } from '../../../vue/src/runtime/deferred/lazy-modules';
import type { RuntimeConsentConfig } from '../../../vue/src/runtime/kernel';
import {
	DEFERRED_ENGINE_MANIFEST_KEY as BUILD_KEY,
	preloadDeferredEngine,
} from '../prefetch';
import type { ClientManifestChunk } from '../prefetch';

const initFor = (rule: Partial<PolicyRule>): InitOutput => ({
	branding: 'inth',
	location: { countryCode: 'GB', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: null,
			regionCode: null,
			rules: [
				{
					categories: ['measurement', 'marketing'],
					id: 'nuxt_boot',
					match: { fallback: true },
					model: 'opt-in',
					prompt: 'choice',
					scopeMode: 'permissive',
					...rule,
				} as PolicyRule,
			],
		})
	),
	translations: { language: 'en', translations },
});

const snapshotFor = (
	rule: Partial<PolicyRule> = {},
	options: Parameters<typeof createVueConsentKernelContext>[0] extends infer O
		? Partial<O>
		: never = {}
): ConsentSnapshot => {
	const context = createVueConsentKernelContext({
		config: {
			consentCategories: ['necessary', 'measurement', 'marketing'],
			projectUrl: 'https://consent.example',
		},
		prefetch: initFor(rule),
		...options,
	});
	const snapshot = context.kernel.getSnapshot();
	context.dispose();
	return snapshot;
};

describe('canDeferEngine', () => {
	test('defers a fresh visitor under a choice banner', () => {
		expect(canDeferEngine(snapshotFor(), {})).toBe(true);
	});

	test('loads at once when the visitor has nothing to choose', () => {
		// A stored choice: no banner.
		const fresh = snapshotFor();
		const returning: ConsentSnapshot = { ...fresh, activeUI: 'none' };
		expect(canDeferEngine(returning, {})).toBe(false);
		// Opt-out grants categories before any choice.
		expect(canDeferEngine(snapshotFor({ model: 'opt-out' }), {})).toBe(false);
	});

	test('loads at once for a prompt the first load cannot record', () => {
		expect(canDeferEngine(snapshotFor({ prompt: 'notice' }), {})).toBe(false);
	});

	test('loads at once for options only the engine serves', () => {
		const snapshot = snapshotFor();
		const options: Partial<RuntimeConsentConfig>[] = [
			{ iab: { cmpId: 1 } } as Partial<RuntimeConsentConfig>,
			{ gpp: true },
			{ networkBlocker: { rules: [] } },
			{
				experiment: { arms: {}, id: 'test' },
			} as unknown as Partial<RuntimeConsentConfig>,
			{
				consentSource: {
					getPermissions: () => ({}),
					subscribe: () => () => undefined,
				},
			} as unknown as Partial<RuntimeConsentConfig>,
		];
		for (const config of options) {
			expect(canDeferEngine(snapshot, config)).toBe(false);
		}
	});

	test('a network blocker turned off keeps the deferred path', () => {
		expect(
			canDeferEngine(snapshotFor(), {
				networkBlocker: { enabled: false, rules: [] },
			})
		).toBe(true);
	});

	test('loads at once for a configured script that may run now, unless the server started it', () => {
		const snapshot = snapshotFor();
		const necessary = {
			category: 'necessary' as const,
			id: 'ops',
			src: '/ops.js',
		};
		const serverStart = () => undefined;
		expect(canDeferEngine(snapshot, { scripts: [necessary] })).toBe(false);
		expect(
			canDeferEngine(snapshot, {
				scripts: [{ ...necessary, serverStart }],
			})
		).toBe(true);
		expect(
			canDeferEngine(snapshot, {
				scriptLoader: { serverStart: false },
				scripts: [{ ...necessary, serverStart }],
			})
		).toBe(false);
		expect(
			canDeferEngine(snapshot, {
				scripts: [{ category: 'measurement' as const, id: 'm', src: '/m.js' }],
			})
		).toBe(true);
	});
});

describe('preloadDeferredEngine', () => {
	const ENGINE =
		'node_modules/@inth/vue/dist/runtime/deferred/engine.js' as const;
	const BANNER =
		'node_modules/@inth/vue/dist/runtime/components/prompt/prompt.vue' as const;
	const manifest = (): Record<string, ClientManifestChunk> => ({
		[BANNER]: { file: 'banner.js', isDynamicEntry: true, src: BANNER },
		[ENGINE]: {
			css: ['engine.css'],
			file: 'engine.js',
			imports: ['_shared.js'],
			isDynamicEntry: true,
			src: ENGINE,
		},
		'_shared.js': { file: 'shared.js' },
		'entry.js': { file: 'entry.js', imports: [], isEntry: true },
	});

	test('names the engine chunk under the key the server render adds', () => {
		expect(BUILD_KEY).toBe(DEFERRED_ENGINE_MANIFEST_KEY);
		const edited = manifest();
		preloadDeferredEngine(edited, '/app', () => true, true);
		expect(edited[DEFERRED_ENGINE_MANIFEST_KEY]).toMatchObject({
			css: ['engine.css'],
			file: 'engine.js',
			imports: ['_shared.js'],
			isDynamicEntry: false,
			prefetch: false,
		});
		// Server-rendered pages decide per visitor: the entry preloads neither.
		expect(edited['entry.js']?.imports).toEqual([]);
	});

	test('preloads the engine and the banner with the entry without SSR', () => {
		const edited = manifest();
		preloadDeferredEngine(edited, '/app', () => true, false);
		expect(edited['entry.js']?.imports).toEqual([BANNER, ENGINE]);
	});

	test('leaves a manifest without the inth engine alone', () => {
		const edited = manifest();
		preloadDeferredEngine(edited, '/app', () => false, true);
		expect(edited[DEFERRED_ENGINE_MANIFEST_KEY]).toBeUndefined();
	});
});

describe('isDeferredBannerModule', () => {
	test('matches the banner from an installed, a workspace and a source build', () => {
		for (const id of [
			'../node_modules/.pnpm/@inth+vue@3.3.0/node_modules/@inth/vue/dist/runtime/components/prompt/prompt.vue',
			// A workspace or linked install: Vite names the real path.
			'../../../packages/sdk/vue/dist/runtime/components/prompt/prompt.vue',
			'/repo/packages/sdk/vue/src/runtime/components/button.vue',
		]) {
			expect(isDeferredBannerModule(id)).toBe(true);
		}
	});

	test('leaves the global components and other packages alone', () => {
		for (const id of [
			'../../../packages/sdk/vue/dist/runtime/components/nuxt-inth-provider.vue',
			'../node_modules/@inth/vue/dist/runtime/components/consent-gate.vue',
			'../../../packages/sdk/react/dist/components/prompt.js',
			'app/components/prompt.vue',
		]) {
			expect(isDeferredBannerModule(id)).toBe(false);
		}
	});
});
