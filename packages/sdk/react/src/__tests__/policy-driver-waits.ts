import type { ConsentKernel } from '@inth/sdk/engine';
import { hasConsentUI } from '@inth/sdk/surface-actions';
import { vi } from 'vite-plus/test';

import { queuedWrites } from '../../../core/src/modules/persistence/mount';

/** The models the stock `ConsentBanner` the policy drivers render answers. */
const BANNER_MODELS: readonly string[] = ['opt-in', 'opt-out'];

/**
 * Persistence loads its write code on the first write, so a choice reaches
 * storage once that chunk is in: on a cold or busy page, later than a
 * settle. Waits for every write queued for it to land, before storage is
 * observed and before the next scenario clears it: a handle mounted while
 * a write waits starts from the waiting kernel's records, so a scenario
 * would otherwise begin with the previous visitor's choice.
 */
export const writesLanded = (): Promise<void> =>
	vi.waitFor(
		() => {
			if (queuedWrites.size > 0) {
				throw new Error('A consent write still waits for the write code');
			}
		},
		{ interval: 50, timeout: 5000 }
	);

/**
 * The banner loads its container's chunk and stylesheets once the kernel
 * owes a choice, so it shows a while after the kernel asks for it: on a
 * cold or busy page, later than a settle. Waits for it while the kernel
 * owes the stock banner one. A banner that never shows is left for the
 * scenario's first-layer assertion to report.
 *
 * @param kernel - The provider's kernel.
 * @param shown - Whether the page shows the banner.
 */
export const bannerLoaded = async (
	kernel: ConsentKernel,
	shown: () => boolean
): Promise<void> => {
	const owed = () => {
		const snapshot = kernel.getSnapshot();
		return (
			snapshot.activeUI === 'banner' &&
			hasConsentUI(snapshot) &&
			BANNER_MODELS.includes(snapshot.model)
		);
	};
	try {
		await vi.waitFor(
			() => {
				if (owed() && !shown()) {
					throw new Error('The owed banner is still loading');
				}
			},
			{ interval: 50, timeout: 5000 }
		);
	} catch {
		// Observed as is: the assertion names what the page shows.
	}
};
