/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

const boot = vi.hoisted(() => ({ script: null as Element | null }));
const loadPartFile = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

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
});
