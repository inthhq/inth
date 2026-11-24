import { describe, expect, test, vi } from 'vite-plus/test';

import type { ConsentKernel, ConsentSnapshot } from '../../types';
import { pendingBootSnapshot } from '../pending-snapshot';
import { createStandInKernel } from '../stand-in-kernel';

const banner: ConsentSnapshot = Object.freeze({
	...pendingBootSnapshot({}),
	activeUI: 'banner',
});

/** An engine kernel whose save resolves with `ok`. */
const engineKernel = (): ConsentKernel => {
	let snapshot: ConsentSnapshot = banner;
	return {
		commands: {
			save: vi.fn(() => {
				snapshot = { ...snapshot, activeUI: 'none' };
				return Promise.resolve({ ok: true });
			}),
		},
		events: { on: () => () => undefined },
		getSnapshot: () => snapshot,
		set: { activeUI: vi.fn() },
		subscribe: () => () => undefined,
	} as unknown as ConsentKernel;
};

describe('createStandInKernel', () => {
	test('a save before the engine rejects when the engine fails to load', async () => {
		const requestEngine = vi.fn();
		const handle = createStandInKernel({ requestEngine, snapshot: banner });

		const save = handle.kernel.commands.save('all');
		// The answer hides the banner while it runs.
		expect(handle.kernel.getSnapshot().activeUI).toBe('none');
		expect(requestEngine).toHaveBeenCalledTimes(1);

		const error = new Error('chunk failed');
		handle.fail(error);

		await expect(save).rejects.toBe(error);
		// The banner shows again, so the visitor can answer again.
		expect(handle.kernel.getSnapshot().activeUI).toBe('banner');
	});

	test('the next command after a failure asks for the engine again and runs on it', async () => {
		const requestEngine = vi.fn();
		const handle = createStandInKernel({ requestEngine, snapshot: banner });

		const first = handle.kernel.commands.save('all');
		handle.fail(new Error('offline'));
		await expect(first).rejects.toThrow('offline');

		const second = handle.kernel.commands.save('none');
		expect(requestEngine).toHaveBeenCalledTimes(2);
		const engine = engineKernel();
		handle.attach(engine);

		await expect(second).resolves.toEqual({ ok: true });
		expect(engine.commands.save).toHaveBeenCalledWith('none');
	});

	test('dispose rejects the commands still waiting for the engine', async () => {
		const handle = createStandInKernel({
			requestEngine: () => undefined,
			snapshot: banner,
		});
		const save = handle.kernel.commands.save('all');
		handle.dispose();
		await expect(save).rejects.toThrow('disposed');
	});

	test('a surface shown before the engine passes to the engine when it attaches', () => {
		const onSurface = vi.fn();
		const requestEngine = vi.fn();
		const handle = createStandInKernel({
			onSurface,
			requestEngine,
			snapshot: banner,
		});
		handle.kernel.set.activeUI('dialog');
		expect(handle.kernel.getSnapshot().activeUI).toBe('dialog');
		expect(onSurface).toHaveBeenCalledWith('dialog');
		expect(requestEngine).not.toHaveBeenCalled();

		const engine = engineKernel();
		handle.attach(engine);
		expect(engine.set.activeUI).toHaveBeenCalledWith('dialog');
	});

	test('every commit puts back the surface its snapshot shows, even an unchanged one', () => {
		const handle = createStandInKernel({
			onSurface: vi.fn(),
			requestEngine: vi.fn(),
			snapshot: banner,
		});
		for (let round = 0; round < 2; round += 1) {
			handle.kernel.set.activeUI('dialog');
			expect(handle.kernel.getSnapshot().activeUI).toBe('dialog');
			handle.commit(banner, []);
			expect(handle.kernel.getSnapshot().activeUI).toBe('banner');
		}
	});

	test('a surface queues for the engine without local surfaces', () => {
		const requestEngine = vi.fn();
		const handle = createStandInKernel({
			localSurfaces: false,
			requestEngine,
			snapshot: banner,
		});
		handle.kernel.set.activeUI('dialog');
		expect(handle.kernel.getSnapshot().activeUI).toBe('banner');
		expect(requestEngine).toHaveBeenCalledTimes(1);
		expect(handle.pending()).toEqual([{ args: ['dialog'], name: 'activeUI' }]);
	});
});
