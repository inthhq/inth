import { loadConsent } from '@inth/svelte/kit';

import type { LayoutServerLoad } from './$types';

/**
 * Resolves the consent decision on the server so the banner is in the first
 * HTML rather than appearing a frame after hydration.
 *
 * `src/hooks.server.ts` gives the showcase the local transport, which
 * resolves the policy in this process with no backend. The geo pin matches
 * the provider's `overrides` in `+layout.svelte`, so the server and the
 * client resolve the same policy.
 */
export const load: LayoutServerLoad = (event) =>
	loadConsent(event, { country: 'CA', region: 'QC' });
