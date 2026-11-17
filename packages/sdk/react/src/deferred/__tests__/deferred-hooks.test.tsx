/**
 * c15t hooks in page code under a deferred root's stand-in kernel, before
 * and after the engine attaches: they must not throw before it, must not
 * load it just by mounting, and must end up on the engine's kernel.
 */
import type { ConsentKernel, ConsentSnapshot, Script } from '@c15t/core';
import { getScriptDiagnostics } from '@c15t/core/modules/script-loader';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { policyFixture } from '../../__tests__/policy-fixture';
import { KernelContext, ProviderServicesContext } from '../../context';
import { useEventDispatcher } from '../../event-dispatcher';
import { markIABProviderLoaded } from '../../hooks/use-iab-policy-guard';
import { usePersistence } from '../../module-hooks/persistence';
import { useScriptLoader } from '../../module-hooks/script-loader';
import { testing } from '../../testing';
import { iabProviderLoaded, whenIABProviderLoads } from '../boot';
import { createDeferredKernel } from '../deferred-kernel';
import type { DeferredKernelHandle } from '../deferred-kernel';
import { DeferredEngineHost } from '../engine-host';
import { attachedKernel } from '../registry';

const freshVisitor = {
	activeUI: 'banner',
	effectivePermissions: { measurement: false, necessary: true },
} as unknown as ConsentSnapshot;

const posthog: Script = {
	callbackOnly: true,
	category: 'measurement',
	id: 'posthog',
	vendor: 'posthog',
};

const tick = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 20);
	});

const standIn = function standIn() {
	const requestEngine = vi.fn();
	const handle = createDeferredKernel({
		requestEngine,
		serverSnapshot: freshVisitor,
		snapshot: freshVisitor,
	});
	return { handle, requestEngine };
};

/** What a deferred root puts around the page. */
const Shell = ({
	children,
	handle,
}: {
	children: ReactNode;
	handle: DeferredKernelHandle;
}) => (
	<KernelContext.Provider value={handle.kernel}>
		<ProviderServicesContext.Provider value={handle.services}>
			{children}
		</ProviderServicesContext.Provider>
	</KernelContext.Provider>
);

/** Provider options for the engine, made once per test. */
const engineOptions = (values: Parameters<typeof policyFixture>[0] = {}) => ({
	consentCategories: ['measurement' as const],
	persistence: false as const,
	prefetch: policyFixture(values),
	scripts: [posthog],
	mode: testing(),
});

/** The engine a deferred root loads, attached to the stand-in. */
const Engine = ({
	handle,
	options,
}: {
	handle: DeferredKernelHandle;
	options: ReturnType<typeof engineOptions>;
}) => (
	<DeferredEngineHost
		attach={handle.attach}
		options={options}
	/>
);

afterEach(() => {
	Reflect.deleteProperty(globalThis, Symbol.for('c15t.react.iab-provider'));
});

describe('useEventDispatcher under a stand-in kernel', () => {
	test('events sent before the engine attaches arrive after it, without loading it', async () => {
		const capture = vi.fn();
		const globals = { posthog: { capture } };
		const { handle, requestEngine } = standIn();
		const granted = engineOptions({ measurement: true });
		const Page = () => {
			const events = useEventDispatcher({ globals });
			useEffect(() => events.track('early'), [events]);
			return (
				<button
					type="button"
					onClick={() => events.track('late')}
				>
					track
				</button>
			);
		};
		const screen = await render(
			<Shell handle={handle}>
				<Page />
			</Shell>
		);
		await tick();
		expect(capture).not.toHaveBeenCalled();
		expect(requestEngine).not.toHaveBeenCalled();

		await screen.rerender(
			<>
				<Shell handle={handle}>
					<Page />
				</Shell>
				<Engine
					handle={handle}
					options={granted}
				/>
			</>
		);
		await vi.waitFor(() =>
			expect(capture).toHaveBeenCalledWith('early', expect.anything())
		);
		await screen.getByRole('button', { name: 'track' }).click();
		expect(capture).toHaveBeenLastCalledWith('late', expect.anything());
	});
});

describe('stand-in setters', () => {
	test('registrations queue without loading the engine; other setters load it', () => {
		const { handle, requestEngine } = standIn();
		handle.kernel.set.registerConsentCategories(['measurement']);
		handle.kernel.set.vendors([]);
		expect(requestEngine).not.toHaveBeenCalled();
		handle.kernel.set.activeUI('dialog');
		expect(requestEngine).toHaveBeenCalledTimes(1);

		const set = {
			activeUI: vi.fn(),
			registerConsentCategories: vi.fn(),
			vendors: vi.fn(),
		};
		handle.attach({
			kernel: {
				getSnapshot: () => freshVisitor,
				set,
				subscribe: () => () => undefined,
			} as unknown as ConsentKernel,
			modules: { loadScriptLoader: vi.fn() },
			services: handle.services,
			streamed: undefined,
		});
		expect(set.registerConsentCategories).toHaveBeenCalledWith(['measurement']);
		expect(set.vendors).toHaveBeenCalledWith([]);
		expect(set.activeUI).toHaveBeenCalledWith('dialog');
	});
});

describe('usePersistence under a stand-in kernel', () => {
	test('waits for the engine instead of hydrating into the stand-in', async () => {
		const { handle, requestEngine } = standIn();
		const persisted: { current: ReturnType<typeof usePersistence> | null } = {
			current: null,
		};
		const options = engineOptions();
		const Page = () => {
			const persistence = usePersistence();
			useEffect(() => {
				persisted.current = persistence;
			}, [persistence]);
			return null;
		};
		// Before the fix this threw from the effect: the stand-in has no
		// `hydrate`.
		const screen = await render(
			<Shell handle={handle}>
				<Page />
			</Shell>
		);
		await tick();
		expect(requestEngine).not.toHaveBeenCalled();
		expect(persisted.current?.hydrate()).toBe(false);

		await screen.rerender(
			<>
				<Shell handle={handle}>
					<Page />
				</Shell>
				<Engine
					handle={handle}
					options={options}
				/>
			</>
		);
		await vi.waitFor(() => expect(handle.attached()).toBe(true));
		await tick();
		expect(() => persisted.current?.reconcile()).not.toThrow();
	});
});

describe('useScriptLoader under a stand-in kernel', () => {
	test("registers on the engine's kernel once it attaches", async () => {
		const { handle } = standIn();
		const hooked: Script = {
			category: 'measurement',
			id: 'hooked',
			src: '/never-loaded.js',
		};
		const scripts = [hooked];
		const options = engineOptions();
		const Page = () => {
			useScriptLoader(scripts);
			return null;
		};
		await render(
			<>
				<Shell handle={handle}>
					<Page />
				</Shell>
				<Engine
					handle={handle}
					options={options}
				/>
			</>
		);
		await vi.waitFor(() => {
			const engineKernel = attachedKernel(handle.kernel);
			expect(engineKernel).toBeDefined();
			const ids = getScriptDiagnostics(engineKernel as ConsentKernel).map(
				(entry) => entry.id
			);
			// The provider's own `scripts` and the hook's, on one key.
			expect(ids).toEqual(expect.arrayContaining(['posthog', 'hooked']));
		});
		expect(getScriptDiagnostics(handle.kernel)).toEqual([]);
	});
});

describe('iabProviderLoaded', () => {
	test('reads the mark `@c15t/react/iab` sets, and wakes a waiter when it loads later', () => {
		const waiter = vi.fn();
		expect(iabProviderLoaded()).toBe(false);
		whenIABProviderLoads(waiter);
		expect(waiter).not.toHaveBeenCalled();
		markIABProviderLoaded();
		expect(iabProviderLoaded()).toBe(true);
		expect(waiter).toHaveBeenCalledTimes(1);
		// Once loaded, a new waiter runs at once.
		const late = vi.fn();
		whenIABProviderLoads(late);
		expect(late).toHaveBeenCalledTimes(1);
	});
});
