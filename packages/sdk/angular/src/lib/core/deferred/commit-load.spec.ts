import type { ConsentSnapshot } from '@inth/sdk/engine';
import { pendingBootSnapshot } from '@inth/sdk/surface-state';
import { describe, expect, test, vi } from 'vitest';

import { createDeferredRuntime } from './deferred-runtime';

// Its own file: the commit module must not have loaded in an earlier test.
let loads = 0;
// oxlint-disable-next-line anti-slop/no-module-mocking -- The property under test is what happens when this chunk fails to load; nothing else can make a dynamic import reject. The factory fails the first load and returns the real module after that.
vi.mock('@inth/sdk/surface-actions/early-commit', async (importActual) => {
	loads += 1;
	if (loads === 1) {
		throw new Error('chunk failed');
	}
	return await importActual();
});

const banner = (): ConsentSnapshot =>
	({ ...pendingBootSnapshot({}), activeUI: 'banner' }) as ConsentSnapshot;

describe('the commit module', () => {
	test('loads again after a failed chunk load', async () => {
		const runtime = createDeferredRuntime({
			boot: { d: 1, s: banner() },
			// The engine never arrives: only the commit path runs.
			loadEngine: () =>
				new Promise<never>(() => {
					/* pending */
				}),
			options: () => ({}),
			schedule: () => () => undefined,
		});
		runtime.start();
		// Each save waits for the engine, which the dispose below rejects.
		const save = (type: 'all' | 'none'): void => {
			runtime.kernel.commands.save(type).catch(() => undefined);
		};

		save('all');
		await vi.waitFor(() => {
			expect(loads).toBe(1);
		});

		save('none');
		await vi.waitFor(() => {
			expect(loads).toBe(2);
		});
		runtime.dispose();
	});
});
