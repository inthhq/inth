/**
 * `ConsentBanner` as a static-banner build resolves it (`#consent-banner`):
 * the stock banner whose code loads in a chunk of its own. It must render
 * the same banner, act the same, and work under every provider, not only
 * the client root.
 */
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import { policyFixture } from '../../__tests__/policy-fixture';
import { ConsentProvider as EngineProvider } from '../../provider';
import { offline } from '../../transports/offline';
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
					mode: offline({ acknowledgeNoRecords: true }),
					persistence: false,
					prefetch: policyFixture(),
				}}
			>
				<ConsentBanner disableAnimation />
			</EngineProvider>
		);
		await vi.waitFor(() =>
			expect(document.querySelector(ACCEPT)).not.toBeNull()
		);
		document.querySelector<HTMLButtonElement>(ACCEPT)?.click();
		await vi.waitFor(() => expect(document.querySelector(ACCEPT)).toBeNull());
	} finally {
		cleanup();
	}
});

test('compound parts render through the same chunk', async () => {
	const { cleanup, root } = mount();
	try {
		root.render(
			<EngineProvider
				options={{
					mode: offline({ acknowledgeNoRecords: true }),
					persistence: false,
					prefetch: policyFixture(),
				}}
			>
				<ConsentBanner.Root disableAnimation>
					<ConsentBanner.Card>
						<ConsentBanner.Footer>
							<ConsentBanner.AcceptButton>Fine</ConsentBanner.AcceptButton>
						</ConsentBanner.Footer>
					</ConsentBanner.Card>
				</ConsentBanner.Root>
			</EngineProvider>
		);
		await vi.waitFor(() =>
			expect(
				[...document.querySelectorAll('button')].some(
					(button) => button.textContent === 'Fine'
				)
			).toBe(true)
		);
	} finally {
		cleanup();
	}
});
