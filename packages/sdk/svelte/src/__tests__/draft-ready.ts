import { expect, vi } from 'vitest';

import type { ConsentManagerState } from '../lib/get-consent-context.svelte';

/**
 * Wait until the provider's preference draft has loaded. Headless reads
 * start the load; a rendered `ConsentWidget` makes it immediate.
 */
export const draftReady = async function draftReady(
	state: ConsentManagerState
): Promise<void> {
	await vi.waitFor(() => {
		expect(Object.keys(state.draft.values)).not.toHaveLength(0);
	});
};
