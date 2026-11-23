import type { ConsentKernel, KernelActiveUI } from '@inth/sdk/engine';
import { useContext } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { renderHook } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { KernelContext } from '~/context';

import { testing } from '../../testing';
import { useConsentDialogTrigger } from '../use-panel-trigger';

interface WrapperOptions {
	activeUI: Exclude<KernelActiveUI, null | undefined>;
	hasConsented: boolean;
}

const createWrapper = function createWrapper({
	activeUI,
	hasConsented,
}: WrapperOptions) {
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return (
			<InthProvider
				options={{
					initialUI: activeUI,
					mode: testing(),
					persistence: false,
					prefetch: {
						...policyFixture(
							hasConsented
								? {
										experience: false,
										functionality: false,
										marketing: false,
										measurement: false,
									}
								: undefined,
							{
								categories: undefined,
								id: 'trigger-test',
								model: 'opt-in',
								prompt: 'choice',
								scopeMode: 'strict',
							}
						),
					},
				}}
			>
				{children}
			</InthProvider>
		);
	};
};

const useTriggerWithKernel = function useTriggerWithKernel(
	options: Parameters<typeof useConsentDialogTrigger>[0]
) {
	const kernel = useContext(KernelContext) as ConsentKernel;
	const trigger = useConsentDialogTrigger(options);
	return { kernel, trigger };
};

describe('useConsentDialogTrigger', () => {
	test('shows trigger before any consent exists', async () => {
		const { result } = await renderHook(
			() => useConsentDialogTrigger({ showWhen: 'always' }),
			{ wrapper: createWrapper({ activeUI: 'none', hasConsented: false }) }
		);

		expect(result.current.isVisible).toBe(true);
	});

	test('shows trigger after consent when active UI is none', async () => {
		const { result } = await renderHook(
			() => useConsentDialogTrigger({ showWhen: 'always' }),
			{ wrapper: createWrapper({ activeUI: 'none', hasConsented: true }) }
		);

		await vi.waitFor(() => {
			expect(result.current.isVisible).toBe(true);
		});
	});

	test('hides trigger while its dialog is open', async () => {
		const { result } = await renderHook(
			() => useConsentDialogTrigger({ showWhen: 'always' }),
			{ wrapper: createWrapper({ activeUI: 'dialog', hasConsented: false }) }
		);

		await vi.waitFor(() => {
			expect(result.current.isVisible).toBe(false);
		});
	});

	test('opens dialog and invokes callback when openDialog is called', async () => {
		const onClick = vi.fn();

		const { result } = await renderHook(
			() => useTriggerWithKernel({ onClick, showWhen: 'always' }),
			{ wrapper: createWrapper({ activeUI: 'none', hasConsented: true }) }
		);

		result.current.trigger.openDialog();

		expect(onClick).toHaveBeenCalledOnce();
		await vi.waitFor(() => {
			expect(result.current.kernel.getSnapshot().activeUI).toBe('dialog');
			expect(result.current.trigger.isVisible).toBe(false);
		});
		result.current.kernel.set.activeUI('none');
		await vi.waitFor(() => {
			expect(result.current.trigger.isVisible).toBe(true);
		});
	});
});
