import { gateScripts } from '@c15t/benchmarking/consent-gate-page';

/**
 * The two gated scripts every gate page registers, one `measurement` and one
 * `marketing`, in the quickstart's `src/scripts.ts` place.
 */
export const scripts = gateScripts();
