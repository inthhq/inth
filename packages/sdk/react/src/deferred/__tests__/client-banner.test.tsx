/**
 * `ConsentBanner` as a static-banner build resolves it (`#consent-banner`):
 * the stock banner whose code loads in a chunk of its own. It must render
 * the same banner, act the same, and work under every provider, not only
 * the client root.
 */
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import { policyFixture } from '../../__tests__/policy-fixture';
import { InthProvider as EngineProvider } from '../../provider';
import { testing } from '../../testing';
import { ConsentBanner } from '../client-banner';

const ACCEPT = '[data-testid="consent-banner-accept-button"]';

const mount = () => {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	return {
		cleanup: () => {
			root.unmount();
			container.remove();
		},
		root,
	};
};

test('renders the stock banner, and its accept records the choice, under the engine provider', async () => {
	const { cleanup, root } = mount();
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
		// The banner's own chunk is the first import of this file; cold, it
		// can outlast the default second.
		await vi.waitFor(
			() => expect(document.querySelector(ACCEPT)).not.toBeNull(),
			{ timeout: 5000 }
		);
		document.querySelector<HTMLButtonElement>(ACCEPT)?.click();
		await vi.waitFor(() => expect(document.querySelector(ACCEPT)).toBeNull());
	} finally {
		cleanup();
	}
});
