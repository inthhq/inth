import { createDevTools as sharedCreateDevTools } from '@inth/sdk/devtools';
import { createConsentRuntime } from '@inth/sdk/runtime';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { GLOBAL_KEY } from '../browser/page-state';
import { createDevTools, mountDevTools } from '../devtools';

const page = window as unknown as Record<string, unknown>;
const cleanups: (() => void)[] = [];

afterEach(() => {
	Reflect.deleteProperty(page, GLOBAL_KEY);
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

const createRuntime = function createRuntime(): ConsentRuntime {
	const runtime = createConsentRuntime({
		pkg: '@inth/astro-devtools-test',
		projectUrl: 'https://consent.example.test',
	});
	cleanups.push(() => runtime.dispose());
	return runtime;
};

describe('@inth/astro/devtools', () => {
	it('re-exports the shared DevTools implementation', () => {
		expect(createDevTools).toBe(sharedCreateDevTools);
	});

	it('mounts the panel on the page runtime once the engine has loaded', async () => {
		const runtime = createRuntime();
		const client: { ready: Promise<void>; runtime?: ConsentRuntime } = {
			ready: Promise.resolve(),
		};
		page[GLOBAL_KEY] = client;
		let loaded = false;
		client.ready = Promise.resolve().then(() => {
			client.runtime = runtime;
			loaded = true;
		});

		const panel = await mountDevTools({ defaultOpen: true });
		cleanups.push(() => panel.destroy());

		expect(loaded).toBe(true);
		expect(panel.element?.isConnected).toBe(true);
		expect(panel.getState().isOpen).toBe(true);
	});

	it('rejects on a page without a consent client', async () => {
		await expect(mountDevTools()).rejects.toThrow(/no consent client/u);
	});
});
