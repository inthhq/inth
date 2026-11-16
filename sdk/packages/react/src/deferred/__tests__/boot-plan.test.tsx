/**
 * Boot data feeds the one mount it was rendered for: the first that
 * commits. A render thrown away before then leaves it for the retry.
 */
import { act, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { useConsentBootPlan } from '../boot-plan';

const cleanups: (() => void)[] = [];

const leaveBootData = (): void => {
	const boot = document.createElement('script');
	boot.type = 'application/json';
	boot.setAttribute('data-c15t-boot', '');
	boot.textContent = JSON.stringify({ s: { activeUI: 'none' } });
	document.head.append(boot);
	cleanups.push(() => boot.remove());
};

/** Each committed plan: `true` when it had boot data. */
const plans: boolean[] = [];

const Planned = () => {
	plans.push(useConsentBootPlan((boot) => boot !== null));
	return null;
};

const mount = async (children: ReactNode): Promise<Root> => {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	await act(() => {
		root.render(children);
	});
	cleanups.push(() => {
		root.unmount();
		container.remove();
	});
	return root;
};

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	plans.length = 0;
	leaveBootData();
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

test('a render thrown away before it commits leaves the boot data for the retry', async () => {
	// A sibling suspends with no boundary above it: React drops the whole
	// render and starts again once the promise settles.
	let release: () => void = () => undefined;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	let settled = false;
	void pending.then(() => {
		settled = true;
	});
	const SuspendsOnce = () => {
		if (!settled) {
			throw pending;
		}
		return null;
	};
	await mount(
		<>
			<Planned />
			<SuspendsOnce />
		</>
	);
	await act(async () => {
		release();
		await pending;
	});
	expect(plans.length).toBeGreaterThan(0);
	expect(plans.every(Boolean)).toBe(true);
});

test('a mount after the first one committed gets no boot data', async () => {
	const first = await mount(<Planned />);
	expect(plans.at(-1)).toBe(true);
	await act(() => {
		first.unmount();
	});
	await mount(<Planned />);
	expect(plans.at(-1)).toBe(false);
});

test("StrictMode's mount, unmount and mount count as one mount", async () => {
	await mount(
		<StrictMode>
			<Planned />
		</StrictMode>
	);
	expect(plans.length).toBeGreaterThan(0);
	expect(plans.every(Boolean)).toBe(true);
});
