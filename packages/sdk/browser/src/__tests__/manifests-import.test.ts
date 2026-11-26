/**
 * @vitest-environment jsdom
 */
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
	loadPartFile.mockClear();
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

	const levelThree = [{ requires: 3 }];
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
		expect(runtime).toEqual({ key: '__inthManifests3' });
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
		await expect(runtime.prepare?.([{ requires: 3 }])).resolves.toEqual({
			key: '__inthManifests3',
		});
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
		await expect(runtime.prepare?.(levelThree)).resolves.toEqual({
			key: '__inthManifests3',
		});
		expect(loadPartFile).toHaveBeenLastCalledWith(
			'__inthManifests3',
			expect.stringMatching(/\/sdk\/inth\.manifests3\.js\?v=/u),
			'abc123'
		);
	});
});
