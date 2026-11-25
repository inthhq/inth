/**
 * A consent chunk that failed to download loads again on the same page.
 *
 * Older Chromium and Firefox keep a failed `import()` for the life of the
 * document, so the chunk loads again from its URL with `inth-retry` added;
 * and a surface that stays mounted asks for its chunk again on the next
 * snapshot instead of keeping the failure.
 */
import { setChunkImportForTest } from '@inth/sdk/runtime/import-chunk';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import { defineComponent, h } from 'vue';

import { loadConsentDialog } from '../runtime/components/dialog/load-panel';
import ConsentManager from '../runtime/components/dialog/manager.vue';
import {
	promptContainers,
	promptContainersKey,
} from '../runtime/components/prompt/prompt-containers';
import {
	$,
	mountConsentUI,
	settle,
	unmountConsentUI,
	waitFor,
} from './consent-ui-fixture';

vi.mock('../runtime/components/dialog/load-panel', async (importOriginal) => {
	const actual = await importOriginal<{
		loadConsentDialog: typeof loadConsentDialog;
	}>();
	return { loadConsentDialog: vi.fn(actual.loadConsentDialog) };
});

const CARD_URL = 'http://localhost/assets/card.js';

afterEach(async () => {
	await unmountConsentUI();
	setChunkImportForTest();
	vi.mocked(loadConsentDialog).mockClear();
	vi.restoreAllMocks();
});

describe('a browser that keeps a failed import', () => {
	test('the banner loads its container again from the chunk URL on the same try', async () => {
		const importUrl = vi.fn(
			() => import('../runtime/components/prompt/chunks/card')
		);
		setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
		let attempts = 0;
		const card = () => {
			attempts += 1;
			return Promise.reject(
				new TypeError(
					`Failed to fetch dynamically imported module: ${CARD_URL}`
				)
			);
		};
		await mountConsentUI({
			provide: {
				[promptContainersKey as symbol]: { ...promptContainers, card },
			},
		});
		await waitFor(() => expect($('consent-banner-root')).not.toBeNull());
		expect(attempts).toBe(1);
		expect(importUrl).toHaveBeenCalledExactlyOnceWith(
			`${CARD_URL}?inth-retry=1`
		);
	});
});

describe('a dialog kept mounted', () => {
	test('imports its chunk again on the next snapshot after a failed load, and opens', async () => {
		// Vue reports the failed load; it is expected here.
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.mocked(loadConsentDialog).mockRejectedValueOnce(
			new Error('The dialog chunk failed.')
		);
		const context = await mountConsentUI({
			region: 'us-opt-out',
			// `ConsentManager` on its own, mounted for the life of the page.
			root: defineComponent({
				setup: () => () => h(ConsentManager, { disableAnimation: true }),
			}),
		});
		context.kernel.set.activeUI('dialog');
		await settle();
		expect(loadConsentDialog).toHaveBeenCalledOnce();
		expect($('consent-dialog-root')).toBeNull();

		context.kernel.set.activeUI('none');
		await settle();
		context.kernel.set.activeUI('dialog');
		await waitFor(() => expect($('consent-dialog-title')).not.toBeNull());
		expect(loadConsentDialog).toHaveBeenCalledTimes(2);
	});
});
