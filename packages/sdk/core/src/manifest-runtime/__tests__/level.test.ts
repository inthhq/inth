import { describe, expect, test, vi } from 'vite-plus/test';

import { withLevelThreePart } from '../level';
import { levelThreePart } from '../level-three';
import type { LevelThreePart } from '../part';

const LEVEL_THREE = [{ requires: 3 }];

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

describe('withLevelThreePart', () => {
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
