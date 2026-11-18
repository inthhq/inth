/**
 * A banner whose chunk failed to download once loads it again while the
 * banner still waits.
 */
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import { policyFixture } from '../../__tests__/policy-fixture';
import { ConsentProvider as EngineProvider } from '../../provider';
import { testing } from '../../testing';
import { bannerChunk, ConsentBanner } from '../client-banner';

test('the banner renders after one failed import of its chunk', async () => {
	const load = vi
		.spyOn(bannerChunk, 'load')
		.mockRejectedValueOnce(new TypeError('Failed to fetch chunk'));
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
		expect(load).toHaveBeenCalledTimes(2);
	} finally {
		root.unmount();
		container.remove();
		load.mockRestore();
	}
});
