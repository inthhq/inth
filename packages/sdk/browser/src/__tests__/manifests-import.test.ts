/**
 * @vitest-environment jsdom
 */
import type { Script } from '@inth/sdk-core';
import type { ResolvedManifest } from '@inth/sdk-core/manifest-runtime';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

const boot = vi.hoisted(() => ({ script: null as Element | null }));
const loadPartFile = vi.hoisted(() =>
	vi.fn((key: string) => Promise.resolve({ key }))
);

vi.mock('../init/adopt', () => ({
	adoptedBoot: () => (boot.script ? { script: boot.script } : null),
}));
vi.mock('../init/part-file', () => ({ loadPartFile }));

const { loadManifestsFile } = await import('../init/manifests-import');

afterEach(() => {
	boot.script = null;
	loadPartFile.mockReset();
	loadPartFile.mockImplementation((key: string) => Promise.resolve({ key }));
});

describe('loadManifestsFile', () => {
	test('loads inth.manifests.js beside inth.js, wherever the engine is', async () => {
		const tag = document.createElement('script');
		tag.setAttribute('src', '/sdk/inth.js');
		tag.setAttribute('data-hosted-src', '/other/engine.js');
		boot.script = tag;

		await loadManifestsFile();

		expect(loadPartFile).toHaveBeenCalledWith(
			'__inthManifests',
			expect.stringMatching(/\/sdk\/inth\.manifests\.js\?v=/u),
			undefined
		);
	});

	test('loads it with the nonce the init tag names in data-nonce', async () => {
		const tag = document.createElement('script');
		tag.setAttribute('src', '/sdk/inth.js');
		tag.setAttribute('data-nonce', 'abc123');
		boot.script = tag;

		await loadManifestsFile();

		expect(loadPartFile).toHaveBeenCalledWith(
			'__inthManifests',
			expect.any(String),
			'abc123'
		);
	});

	test('uses data-manifests-src from the init tag', async () => {
		const tag = document.createElement('script');
		tag.setAttribute('src', '/sdk/inth.js');
		tag.setAttribute('data-manifests-src', '/files/manifests.js');
		boot.script = tag;

		await loadManifestsFile();

		expect(loadPartFile).toHaveBeenCalledWith(
			'__inthManifests',
			'/files/manifests.js',
			undefined
		);
	});

	/** A manifest whose steps use level 3, as `requires: 3` says. */
	const levelThreeManifest = () => ({
		requires: 3,
		setupSteps: [{ name: 'ready', type: 'setFlag', value: true }],
	});
	const levelThree = [levelThreeManifest()];
	const initTag = (attributes: Record<string, string> = {}) => {
		const tag = document.createElement('script');
		tag.setAttribute('src', '/sdk/inth.js');
		for (const [name, value] of Object.entries(attributes)) {
			tag.setAttribute(name, value);
		}
		boot.script = tag;
	};

	test('loads inth.manifests3.js in its place for a manifest that requires level 3', async () => {
		initTag({ 'data-nonce': 'abc123' });

		const runtime = await loadManifestsFile([{ requires: 2 }, ...levelThree]);

		expect(loadPartFile).toHaveBeenCalledExactlyOnceWith(
			'__inthManifests3',
			expect.stringMatching(/\/sdk\/inth\.manifests3\.js\?v=/u),
			'abc123'
		);
		expect(runtime).toMatchObject({ key: '__inthManifests3' });
	});

	test('falls back to inth.manifests.js for the first list when inth.manifests3.js fails', async () => {
		initTag();
		loadPartFile.mockImplementationOnce(() =>
			Promise.resolve(undefined as never)
		);

		const first = [{ requires: 2 }, ...levelThree];
		const runtime = await loadManifestsFile(first);

		// The level 1 and 2 entries run; the parser refuses each level 3 one.
		expect(loadPartFile).toHaveBeenLastCalledWith(
			'__inthManifests',
			expect.stringMatching(/\/sdk\/inth\.manifests\.js\?v=/u),
			undefined
		);
		expect(runtime).toMatchObject({ key: '__inthManifests' });
		expect(runtime.prepare?.([...first])).toBeUndefined();
		// A later list that needs level 3 tries the file again.
		await expect(
			runtime.prepare?.([levelThreeManifest()])
		).resolves.toMatchObject({ key: '__inthManifests3' });
	});

	test('uses data-manifests3-src from the init tag', async () => {
		initTag({ 'data-manifests3-src': '/files/manifests3.js' });

		await loadManifestsFile(levelThree);

		expect(loadPartFile).toHaveBeenCalledWith(
			'__inthManifests3',
			'/files/manifests3.js',
			undefined
		);
	});

	test('moves to inth.manifests3.js for a later list that requires level 3', async () => {
		initTag({ 'data-nonce': 'abc123' });

		const runtime = await loadManifestsFile([{ requires: 2 }]);

		expect(loadPartFile).toHaveBeenCalledExactlyOnceWith(
			'__inthManifests',
			expect.any(String),
			'abc123'
		);
		expect(runtime.prepare?.([{ requires: 2 }, {}])).toBeUndefined();
		await expect(runtime.prepare?.(levelThree)).resolves.toMatchObject({
			key: '__inthManifests3',
		});
		expect(loadPartFile).toHaveBeenLastCalledWith(
			'__inthManifests3',
			expect.stringMatching(/\/sdk\/inth\.manifests3\.js\?v=/u),
			'abc123'
		);
	});

	describe('adapters', () => {
		const sentryAdapter = {
			id: 'sentry',
			problem: () => undefined,
			script: (base: Script) => ({ ...base, adapted: true }),
		};
		const manifest = {
			adapter: { id: 'sentry', options: {} },
			category: 'measurement',
			requires: 4,
			vendor: 'sentry',
		};
		/** A runtime file whose own parser accepts the rest of any manifest. */
		const runtimeFile = (key: string) => ({
			key,
			parseResolvedManifest: (value: unknown) => ({
				manifest: value,
				ok: true,
			}),
			resolvedManifestToScript: (value: ResolvedManifest): Script => ({
				category: value.category,
				id: value.vendor,
				vendor: value.vendor,
			}),
		});

		afterEach(() => {
			delete (window as { __inthAdapterSentrySrc?: unknown })
				.__inthAdapterSentrySrc;
		});

		test('loads inth.adapter-sentry.js beside inth.js, with the nonce, for a list that names it', async () => {
			initTag({ 'data-nonce': 'abc123' });
			loadPartFile.mockImplementation(
				(key: string) =>
					Promise.resolve(
						key === '__inthAdapterSentry'
							? { adapter: sentryAdapter, key }
							: runtimeFile(key)
					) as never
			);

			const runtime = await loadManifestsFile([manifest]);
			await runtime.prepare?.([manifest]);

			expect(loadPartFile).toHaveBeenLastCalledWith(
				'__inthAdapterSentry',
				expect.stringMatching(/\/sdk\/inth\.adapter-sentry\.js\?v=/u),
				'abc123'
			);
			const parsed = runtime.parseResolvedManifest(manifest);
			expect(parsed.ok).toBe(true);
			expect(runtime.resolvedManifestToScript(manifest as never)).toMatchObject(
				{ adapted: true, vendor: 'sentry' }
			);
		});

		test('loads inth.manifests.js for a level 4 manifest whose own steps need level 2 at most', async () => {
			initTag();

			await loadManifestsFile([manifest]);

			expect(loadPartFile).toHaveBeenCalledExactlyOnceWith(
				'__inthManifests',
				expect.stringMatching(/\/sdk\/inth\.manifests\.js\?v=/u),
				undefined
			);
		});

		test('runs adapters in inth.manifests.js when inth.manifests3.js fails for the first list', async () => {
			const withLevelThree = {
				...manifest,
				...levelThreeManifest(),
				requires: 4,
			};
			initTag();
			loadPartFile.mockImplementation((key: string) => {
				if (key === '__inthManifests3') {
					return Promise.resolve(undefined) as never;
				}
				return Promise.resolve(
					key === '__inthAdapterSentry'
						? { adapter: sentryAdapter, key }
						: runtimeFile(key)
				) as never;
			});

			const runtime = await loadManifestsFile([withLevelThree]);
			await runtime.prepare?.([withLevelThree]);

			expect(loadPartFile).toHaveBeenCalledWith(
				'__inthManifests3',
				expect.any(String),
				undefined
			);
			expect(runtime).toMatchObject({ key: '__inthManifests' });
			expect(runtime.resolvedManifestToScript(manifest as never)).toMatchObject(
				{ adapted: true, vendor: 'sentry' }
			);
		});

		test('loads no adapter for a list that names none', async () => {
			initTag();

			const runtime = await loadManifestsFile([{ requires: 2 }]);

			expect(runtime.prepare?.([{ requires: 2 }])).toBeUndefined();
			expect(loadPartFile).toHaveBeenCalledExactlyOnceWith(
				'__inthManifests',
				expect.any(String),
				undefined
			);
		});

		test('uses data-adapter-sentry-src from the init tag, then the backend global', async () => {
			initTag({ 'data-adapter-sentry-src': '/files/sentry.js' });
			loadPartFile.mockImplementation(
				(key: string) =>
					Promise.resolve(
						key === '__inthAdapterSentry'
							? { adapter: sentryAdapter, key }
							: runtimeFile(key)
					) as never
			);

			await (await loadManifestsFile([manifest])).prepare?.([manifest]);
			expect(loadPartFile).toHaveBeenLastCalledWith(
				'__inthAdapterSentry',
				'/files/sentry.js',
				undefined
			);

			(window as { __inthAdapterSentrySrc?: string }).__inthAdapterSentrySrc =
				'https://backend.example/sentry.js';
			await (await loadManifestsFile([manifest])).prepare?.([manifest]);
			expect(loadPartFile).toHaveBeenLastCalledWith(
				'__inthAdapterSentry',
				'https://backend.example/sentry.js',
				undefined
			);
		});

		test('refuses a manifest whose adapter file did not load, saying where it looked', async () => {
			initTag({ 'data-adapter-sentry-src': '/files/sentry.js' });
			loadPartFile.mockImplementation(
				(key: string) =>
					Promise.resolve(
						key === '__inthAdapterSentry' ? undefined : runtimeFile(key)
					) as never
			);

			const runtime = await loadManifestsFile([manifest]);
			await runtime.prepare?.([manifest]);

			expect(runtime.parseResolvedManifest(manifest)).toEqual({
				// A later list tries the file again.
				needsCode: true,
				ok: false,
				reason:
					'its sentry adapter did not load: inth.adapter-sentry.js did not load from /files/sentry.js, or is from another release',
			});
		});

		test.each([
			['ada', '__inthAdapterAda'],
			['dynamic-yield', '__inthAdapterDynamicYield'],
			['gainsight-px', '__inthAdapterGainsightPx'],
			['gorgias', '__inthAdapterGorgias'],
			['lucky-orange', '__inthAdapterLuckyOrange'],
			['oracle-eloqua', '__inthAdapterOracleEloqua'],
			['salesforce-pardot', '__inthAdapterSalesforcePardot'],
			['zendesk', '__inthAdapterZendesk'],
		] as const)(
			'loads inth.adapter-%s.js with the nonce, from its data attribute, then the backend global',
			async (id, key) => {
				const named = { ...manifest, adapter: { id, options: {} } };
				const adapter = { ...sentryAdapter, id };
				const backend = `${key}Src`;
				loadPartFile.mockImplementation(
					(file: string) =>
						Promise.resolve(
							file === key ? { adapter, key: file } : runtimeFile(file)
						) as never
				);
				try {
					initTag({ 'data-nonce': 'abc123' });
					await (await loadManifestsFile([named])).prepare?.([named]);
					expect(loadPartFile).toHaveBeenLastCalledWith(
						key,
						expect.stringMatching(
							new RegExp(`/sdk/inth\\.adapter-${id}\\.js\\?v=`, 'u')
						),
						'abc123'
					);

					initTag({ [`data-adapter-${id}-src`]: `/files/${id}.js` });
					await (await loadManifestsFile([named])).prepare?.([named]);
					expect(loadPartFile).toHaveBeenLastCalledWith(
						key,
						`/files/${id}.js`,
						undefined
					);

					(window as unknown as Record<string, string>)[backend] =
						`https://backend.example/${id}.js`;
					const runtime = await loadManifestsFile([named]);
					await runtime.prepare?.([named]);
					expect(loadPartFile).toHaveBeenLastCalledWith(
						key,
						`https://backend.example/${id}.js`,
						undefined
					);
					expect(
						runtime.resolvedManifestToScript(named as never)
					).toMatchObject({ adapted: true });
				} finally {
					Reflect.deleteProperty(window, backend);
				}
			}
		);
	});
});
