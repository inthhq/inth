/**
 * A deferred `InthProvider` whose engine chunk fails to download once loads
 * it again a second later. The root loads its engine once per page, and the
 * browser setup already did: this test imports a fresh copy of the root.
 */
import { ServerBootData } from '@inth/react/deferred/engine';
import { InthProvider as ReactProvider } from '@inth/react/provider';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import type * as RootModule from '../inth-provider';
import type { ConsentState } from '../consent-client-options.model';
import { transportMode } from './fixtures/transport-mode';
import { policyFixture } from './policy-fixture';

const mode = transportMode({
	init: () => Promise.resolve({}),
	save: () => Promise.resolve({ ok: true as const }),
});
const consentCategories = ['necessary', 'marketing'] as const;
const rule = { categories: ['marketing'], scopeMode: 'permissive' } as const;

test('a deferred root loads its engine a second after one failed import', async () => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	// A query makes Vite evaluate the module again, with its own engine
	// loader.
	const fresh = '../root?engine-retry';
	const { InthProvider, engineChunk } = (await import(
		// oxlint-disable-next-line no-inline-comments -- Vite reads it here.
		/* @vite-ignore */ fresh
	)) as typeof RootModule;
	const { load } = engineChunk;
	const loads: number[] = [];
	const spy = vi.spyOn(engineChunk, 'load').mockImplementation(() => {
		loads.push(Date.now());
		return loads.length === 1
			? Promise.reject(new TypeError('Failed to fetch chunk'))
			: load();
	});
	// A visitor who chose, without a confirmed stored choice: the root
	// loads its engine at once.
	const now = Date.now();
	const state = {
		...policyFixture({ marketing: true }, rule, now),
		now,
	} as ConsentState;
	const boot = document.createElement('div');
	boot.innerHTML = renderToString(
		<ReactProvider
			options={{
				consentCategories: [...consentCategories],
				mode,
				prefetch: state,
			}}
		>
			<ServerBootData renderId="test-render" />
		</ReactProvider>
	);
	const bootScript = boot.querySelector('script[data-inth-boot]');
	if (!bootScript) {
		throw new Error('the server render left no boot data');
	}
	document.head.append(bootScript);
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	try {
		await act(() => {
			root.render(
				<InthProvider
					options={{ consentCategories: [...consentCategories], mode }}
					persistence
					state={state}
				>
					<main />
				</InthProvider>
			);
		});
		// The engine marks its arrival by rendering the boot data's slot.
		await vi.waitFor(
			() =>
				expect(container.querySelector('script[data-inth-boot]')).not.toBe(
					null
				),
			{ timeout: 5000 }
		);
		expect(loads).toHaveLength(2);
		// One backoff, not one per layer that wraps the import.
		const gap = (loads[1] ?? 0) - (loads[0] ?? 0);
		expect(gap).toBeGreaterThanOrEqual(900);
		expect(gap).toBeLessThan(1900);
	} finally {
		act(() => root.unmount());
		container.remove();
		bootScript.remove();
		spy.mockRestore();
	}
});
