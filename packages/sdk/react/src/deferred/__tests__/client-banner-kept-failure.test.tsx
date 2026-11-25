/**
 * A browser that keeps a failed import (Chromium before 156, Firefox before
 * 155) fails every later `import()` of the banner's chunk at once, without
 * a request. The banner loads its chunk again from the URL the error names.
 */
import { setChunkImportForTest } from '@inth/sdk/runtime/import-chunk';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { policyFixture } from '../../__tests__/policy-fixture';
import { InthProvider as EngineProvider } from '../../provider';
import { testing } from '../../testing';
import { bannerChunk, ConsentBanner } from '../client-banner';

afterEach(() => {
	setChunkImportForTest();
	vi.restoreAllMocks();
});

test('the banner renders on the first try when the browser keeps its failed chunk', async () => {
	const load = vi
		.spyOn(bannerChunk, 'load')
		.mockRejectedValue(
			new TypeError(
				'Failed to fetch dynamically imported module: http://localhost/assets/strip.js'
			)
		);
	const importUrl = vi.fn(
		(_url: string) => import('../../components/prompt/index')
	);
	setChunkImportForTest({ importUrl, keepsFailedImports: () => true });
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	try {
		root.render(
			<EngineProvider
				options={{
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(),
				}}
			>
				<ConsentBanner disableAnimation />
			</EngineProvider>
		);
		await vi.waitFor(
			() =>
				expect(
					document.querySelector('[data-testid="consent-banner-accept-button"]')
				).not.toBeNull(),
			{ timeout: 5000 }
		);
		expect(load).toHaveBeenCalledOnce();
		expect(importUrl).toHaveBeenCalledExactlyOnceWith(
			'http://localhost/assets/strip.js?inth-retry=1'
		);
	} finally {
		root.unmount();
		container.remove();
	}
});
