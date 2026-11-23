import type { ConsentKernel } from '@inth/sdk/engine';
import { optInConsentSurface } from '@inth/sdk/surface-actions';
import { useContext, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';

import { ConsentDialog } from '../aggregate-components';
import { ConsentBanner } from '../components/prompt';
import { KernelContext } from '../context';
import { useSetActiveUI } from '../hooks';
import { InthProvider } from '../provider';
import { testing } from '../testing';
import { policyFixture } from './policy-fixture';

const Controls = () => {
	const setActiveUI = useSetActiveUI();
	return (
		<button
			id="reopen"
			onClick={() => setActiveUI('dialog')}
			type="button"
		>
			Reopen
		</button>
	);
};

test('reveals a cold aggregate dialog as soon as its module is ready', async () => {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	const dialog = () =>
		document.querySelector('[data-testid="consent-dialog-root"]');
	try {
		// Deliberately avoid act(): it bypasses React's Suspense retry throttle.
		root.render(
			<InthProvider
				options={{
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(),
				}}
			>
				<ConsentBanner disableAnimation />
				<ConsentDialog disableAnimation />
				<Controls />
			</InthProvider>
		);
		await vi.waitFor(() =>
			expect(
				document.querySelector(
					'[data-testid="consent-banner-customize-button"]'
				)
			).not.toBeNull()
		);
		expect(dialog()).toBeNull();
		// A DOM click opens the dialog without hover/focus chunk warming.
		container.querySelector<HTMLButtonElement>('#reopen')?.click();
		await import('../components/dialog/consent-dialog-body');
		// Allow effects and a browser paint, without waiting out Suspense's 300ms.
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		expect(dialog()).not.toBeNull();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await vi.waitFor(() => expect(dialog()).toBeNull());
		container.querySelector<HTMLButtonElement>('#reopen')?.click();
		await new Promise(requestAnimationFrame);
		expect(dialog()).not.toBeNull();
	} finally {
		root.unmount();
		container.remove();
	}
});

test('shows opt-in confirmation when only the lazy ConsentDialog is mounted', async () => {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	let kernel: ConsentKernel | undefined;
	const Capture = () => {
		const value = useContext(KernelContext);
		useEffect(() => {
			if (value) {
				kernel = value;
			}
		}, [value]);
		return null;
	};
	const rule = {
		categories: ['functionality', 'marketing', 'measurement'] as const,
		id: 'us-opt-out-notice',
		model: 'opt-out' as const,
		prompt: 'notice' as const,
		rights: ['disclosure', 'preferences', 'opt-out'] as const,
	};
	const fixture = policyFixture(undefined, rule);
	const now = fixture.now ?? Date.now();
	try {
		root.render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing({ policy: [rule] }),
					overrides: { country: 'US', gpc: false, region: 'CA' },
					persistence: false,
					prefetch: {
						...fixture,
						initialRecords: {
							optOut: {
								heldBy: 'device',
								method: 'button',
								recordedAt: now - 1000,
								rights: ['sale', 'share'],
							},
						},
						now,
					},
				}}
			>
				<Capture />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);
		await vi.waitFor(() => {
			expect(kernel).toBeDefined();
			expect(kernel?.getSnapshot().optOut).not.toBeNull();
		});
		if (!kernel) {
			throw new Error('Expected kernel to be captured');
		}
		expect(
			document.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		optInConsentSurface(kernel);
		await vi.waitFor(() =>
			expect(
				document.querySelector('[data-testid="opt-in-confirmation-root"]')
			).not.toBeNull()
		);
		document
			.querySelector<HTMLButtonElement>(
				'[data-testid="opt-in-confirmation-confirm-button"]'
			)
			?.click();
		await vi.waitFor(() => expect(kernel?.getSnapshot().optOut).toBeNull());
	} finally {
		root.unmount();
		container.remove();
	}
});
