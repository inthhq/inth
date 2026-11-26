/* oxlint-disable unicorn/no-thenable -- `callGlobal` steps have a `then` field. */
import { describe, expect, test, vi } from 'vite-plus/test';

import { STEP_FIELD_LEVELS } from '../features';
import { requiresLevelThree, withLevelThreePart } from '../level';
import { levelThreePart } from '../level-three';
import type { LevelThreePart } from '../part';

const LEVEL_THREE = [
	{
		requires: 3,
		setupSteps: [{ name: 'ready', type: 'setFlag', value: true }],
	},
];

/** A runtime whose level 3 part comes from `load`, with nothing else. */
const runtimeWith = (load: () => Promise<{ levelThreePart: LevelThreePart }>) =>
	withLevelThreePart(
		{
			installLevelThree: vi.fn(),
			parseResolvedManifest: vi.fn(),
			resolvedManifestToScript: vi.fn(),
		},
		load
	);

describe('requiresLevelThree', () => {
	const levels = STEP_FIELD_LEVELS as Readonly<
		Record<string, Readonly<Record<string, number>>>
	>;
	/** Every step type with each field it has, as one step per field. */
	const steps = Object.entries(levels).flatMap(([type, fields]) =>
		Object.entries(fields).map(([field, level]) => ({
			level: Math.max(level, fields.type ?? 1),
			step: { [field]: [], type },
		}))
	);

	test.each(steps)(
		'reads a step $step.type with its field as level $level',
		({ level, step }) => {
			expect(requiresLevelThree([{ requires: 3, setupSteps: [step] }])).toBe(
				level >= 3
			);
		}
	);
});

describe('withLevelThreePart', () => {
	test.each([
		['a level 4 manifest whose steps need level 2 at most', { requires: 4 }],
		[
			'a manifest that requires less than level 3',
			{
				requires: 2,
				setupSteps: [{ name: 'ready', type: 'setFlag', value: true }],
			},
		],
	])('downloads nothing for %s', (_label, manifest) => {
		const load = vi.fn(() => Promise.resolve({ levelThreePart }));

		expect(runtimeWith(load).prepare?.([manifest])).toBeUndefined();
		expect(load).not.toHaveBeenCalled();
	});

	test('downloads the part for a level 4 manifest with a level 3 step nested in another', async () => {
		const load = vi.fn(() => Promise.resolve({ levelThreePart }));

		await runtimeWith(load).prepare?.([
			{
				onLoadGrantedSteps: [
					{
						global: 'vendor',
						method: 'init',
						then: [{ name: 'ready', type: 'setFlag', value: true }],
						type: 'callGlobal',
					},
				],
				requires: 4,
			},
		]);

		expect(load).toHaveBeenCalledOnce();
	});

	test('downloads the part once for lists that ask while it downloads', async () => {
		const part = Promise.withResolvers<{ levelThreePart: LevelThreePart }>();
		const load = vi.fn(() => part.promise);
		const runtime = runtimeWith(load);

		const first = runtime.prepare?.(LEVEL_THREE);
		const second = runtime.prepare?.(LEVEL_THREE);
		part.resolve({ levelThreePart });
		await Promise.all([first, second]);

		expect(load).toHaveBeenCalledOnce();
		expect(runtime.prepare?.(LEVEL_THREE)).toBeUndefined();
	});

	test('downloads the part again for a later list after a download failed', async () => {
		const load = vi
			.fn<() => Promise<{ levelThreePart: LevelThreePart }>>()
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValue({ levelThreePart });
		const runtime = runtimeWith(load);

		await expect(runtime.prepare?.(LEVEL_THREE)).rejects.toThrow('offline');
		await runtime.prepare?.(LEVEL_THREE);

		expect(load).toHaveBeenCalledTimes(2);
		expect(runtime.prepare?.(LEVEL_THREE)).toBeUndefined();
	});
});
