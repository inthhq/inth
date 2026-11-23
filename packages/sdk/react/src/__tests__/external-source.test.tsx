import type { ConsentKernel, ConsentState } from '@inth/sdk/engine';
import { useContext, useEffect, StrictMode } from 'react';
import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ConsentDialogLink } from '../components/consent-dialog-link';
import { KernelContext } from '../context';
import { useHasConsentUI, useSetActiveUI } from '../hooks';
import { IABProvider, useIAB } from '../iab-provider';
import { InthProvider } from '../provider';
import { transportMode } from './fixtures/transport-mode';

let kernel: ConsentKernel;
const Controls = () => {
	const value = useContext(KernelContext);
	useEffect(() => {
		if (value) {
			kernel = value;
		}
	}, [value]);
	const setActiveUI = useSetActiveUI();
	const hasUi = useHasConsentUI();
	return (
		<button
			type="button"
			data-native-ui={String(hasUi)}
			onClick={() => setActiveUI('dialog')}
		>
			External preferences
		</button>
	);
};

test('standard React options share external authority, scripts and preferences under StrictMode', async () => {
	let permissions: Partial<ConsentState> | null = null;
	let notify = () => {};
	const detach = vi.fn();
	const openPreferences = vi.fn();
	const source = {
		getPermissions: () => permissions,
		openPreferences,
		subscribe: (listener: () => void) => {
			notify = listener;
			return detach;
		},
	};
	const loaded = vi.fn();
	const removed = vi.fn();
	const script = {
		callbackOnly: true as const,
		category: 'measurement' as const,
		id: 'external-tracker',
		onConsentChange: removed,
		onLoad: loaded,
	};

	const init = vi.fn();
	const recorded = vi.fn();
	const view = await render(
		<StrictMode>
			<InthProvider
				options={{
					callbacks: { onChoiceRecorded: recorded },
					consentSource: source,
					iframeBlocker: false,
					mode: transportMode({ init }),
					scripts: [script],
				}}
			>
				<Controls />
			</InthProvider>
		</StrictMode>
	);
	await vi.dynamicImportSettled();
	expect(init).not.toHaveBeenCalled();
	expect(loaded).not.toHaveBeenCalled();
	expect(kernel.getSnapshot().activeUI).toBe('none');
	expect(
		document.querySelector('[data-native-ui]')?.getAttribute('data-native-ui')
	).toBe('false');
	permissions = { measurement: true };
	notify();
	await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
	await view.getByRole('button', { name: 'External preferences' }).click();
	expect(openPreferences).toHaveBeenCalledTimes(1);
	expect(kernel.getSnapshot().activeUI).toBe('none');
	await expect(kernel.commands.save('all')).rejects.toThrow('external CMP');
	permissions = null;
	notify();
	expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(false);
	expect(removed).toHaveBeenLastCalledWith(
		expect.objectContaining({ hasConsent: false })
	);
	expect(recorded).not.toHaveBeenCalled();
	expect(kernel.getSnapshot().explicitChoice).toBeNull();
	const before = detach.mock.calls.length;
	await view.unmount();
	expect(detach).toHaveBeenCalledTimes(before + 1);
});

test('external IAB saves reject instead of waiting for a handle that cannot mount', async () => {
	const settled = vi.fn();
	const SaveIAB = () => {
		const iab = useIAB();
		return (
			<button
				type="button"
				onClick={async () => {
					try {
						await iab?.save();
						settled('saved');
					} catch (error) {
						settled(error);
					}
				}}
			>
				Save IAB
			</button>
		);
	};
	const view = await render(
		<InthProvider
			options={{
				consentSource: {
					getPermissions: () => ({}),
					openPreferences: () => {},
					subscribe: () => () => {},
				},
				iframeBlocker: false,
				mode: transportMode({ init: vi.fn() }),
				prefetch: { initialIab: { cmpId: 42, enabled: true } },
			}}
		>
			<IABProvider cmpId={42}>
				<SaveIAB />
			</IABProvider>
		</InthProvider>
	);
	await view.getByRole('button', { name: 'Save IAB' }).click();
	await vi.waitFor(() =>
		expect(settled).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining('external CMP'),
			})
		)
	);
	await view.unmount();
});

test('the opt-out link under an external source opens that source and records nothing here', async () => {
	const openPreferences = vi.fn();
	const unhandled = vi.fn();
	window.addEventListener('unhandledrejection', unhandled);
	const view = await render(
		<InthProvider
			options={{
				consentSource: {
					getPermissions: () => ({ marketing: true }),
					openPreferences,
					subscribe: () => () => {},
				},
				iframeBlocker: false,
				mode: transportMode({ init: vi.fn() }),
			}}
		>
			<Controls />
			<ConsentDialogLink right="opt-out">Do not sell</ConsentDialogLink>
		</InthProvider>
	);
	await vi.dynamicImportSettled();

	await view.getByRole('button', { name: 'Do not sell' }).click();
	await vi.waitFor(() => expect(openPreferences).toHaveBeenCalledTimes(1));
	// The link discards the action's promise, so a rejection would surface here.
	await new Promise((resolve) => {
		setTimeout(resolve, 50);
	});

	expect(unhandled).not.toHaveBeenCalled();
	expect(openPreferences).toHaveBeenCalledTimes(1);
	expect(kernel.getSnapshot().optOut).toBeNull();
	expect(kernel.getSnapshot().activeUI).toBe('none');
	window.removeEventListener('unhandledrejection', unhandled);
	await view.unmount();
});
