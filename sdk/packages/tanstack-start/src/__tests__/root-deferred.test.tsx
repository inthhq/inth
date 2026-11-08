/**
 * In the browser, `ConsentRoot` reads the snapshot the server left in the
 * page and decides when its engine loads: after the page's priority images
 * for a visitor the banner asks to choose, at once for one it must serve.
 * The engine marks its arrival by rendering the boot data's slot.
 *
 * The banner tap before the engine is covered by `@c15t/react`'s
 * `deferred/__tests__/commit-path.test.tsx` and the example app journeys.
 */
import { custom } from '@c15t/react';
import { ServerBootData } from '@c15t/react/deferred/engine';
import { useSnapshot } from '@c15t/react/hooks';
import { ConsentProvider } from '@c15t/react/provider';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, test } from 'vitest';

import { ConsentRoot } from '../root';
import type { ConsentState } from '../server';
import { policyFixture } from './policy-fixture';

const mode = custom({
	init: () => Promise.resolve({}),
	save: () => Promise.resolve({ ok: true as const }),
});
const consentCategories = ['necessary', 'marketing'] as const;
const rule = { categories: ['marketing'], scopeMode: 'permissive' } as const;

const cleanups: (() => void)[] = [];

/** A hero image that is still loading and never loads by itself. */
const loadingHero = (): HTMLImageElement => {
	const image = document.createElement('img');
	image.setAttribute('fetchpriority', 'high');
	Object.defineProperty(image, 'complete', { value: false });
	document.body.append(image);
	cleanups.push(() => image.remove());
	return image;
};

/** Leaves the boot data a server render of `state` would in the page. */
const leaveBootData = (state: ConsentState): void => {
	const holder = document.createElement('div');
	holder.innerHTML = renderToString(
		<ConsentProvider
			options={{
				consentCategories: [...consentCategories],
				mode,
				prefetch: state,
			}}
		>
			<ServerBootData />
		</ConsentProvider>
	);
	const boot = holder.querySelector('script[data-c15t-boot]');
	if (!boot) {
		throw new Error('the server render left no boot data');
	}
	document.head.append(boot);
	cleanups.push(() => boot.remove());
};

const Probe = () => {
	const snapshot = useSnapshot();
	return (
		<main
			data-active-ui={snapshot.activeUI}
			data-marketing={String(snapshot.effectivePermissions.marketing)}
		/>
	);
};

const mount = async (state: ConsentState) => {
	const container = document.createElement('div');
	document.body.append(container);
	let root: Root | undefined;
	await act(() => {
		root = createRoot(container);
		root.render(
			<ConsentRoot
				options={{ consentCategories: [...consentCategories], mode }}
				state={state}
			>
				<Probe />
			</ConsentRoot>
		);
	});
	cleanups.push(() => {
		root?.unmount();
		container.remove();
	});
	return {
		engineIn: () => container.querySelector('script[data-c15t-boot]') !== null,
		main: () => container.querySelector('main'),
	};
};

const settle = () =>
	act(
		() =>
			new Promise<void>((resolve) => {
				setTimeout(resolve, 100);
			})
	);

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	localStorage.clear();
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	localStorage.clear();
});

test('a visitor the banner asks waits for the hero before the engine loads', async () => {
	const state = { ...policyFixture({}, rule), now: Date.now() } as ConsentState;
	const hero = loadingHero();
	leaveBootData(state);

	const page = await mount(state);
	// The page renders from the server's snapshot, without the engine.
	expect(page.main()?.dataset.activeUi).toBe('banner');
	expect(page.main()?.dataset.marketing).toBe('false');
	await settle();
	expect(page.engineIn()).toBe(false);

	await act(() => {
		hero.dispatchEvent(new Event('load'));
	});
	await settle();
	expect(page.engineIn()).toBe(true);
	expect(page.main()?.dataset.activeUi).toBe('banner');
});

test('a visitor who already chose gets the engine at once', async () => {
	const state = {
		...policyFixture({ marketing: true }, rule),
		now: Date.now(),
	} as ConsentState;
	loadingHero();
	leaveBootData(state);

	const page = await mount(state);
	expect(page.main()?.dataset.marketing).toBe('true');
	await settle();
	// The hero is still loading: only an engine started at once is in.
	expect(page.engineIn()).toBe(true);
});

test('a page with no boot data renders the whole root at once', async () => {
	// Shared HTML, such as the static root's, leaves no snapshot: the
	// provider is the engine from the first render.
	const { now: _now, ...shared } = policyFixture({}, rule) as ConsentState;
	const page = await mount(shared as ConsentState);
	await settle();
	expect(page.main()?.dataset.activeUi).toBe('banner');
	expect(page.engineIn()).toBe(false);
});
