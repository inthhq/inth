/**
 * `clientEntrypoint` of the `gate` build: registers the consent gate's two
 * gated scripts, as CookieBench's Astro fixture registers its controlled
 * workload from `src/consent-client.ts`.
 */
import type { C15tClientOptionsExtension } from '@c15t/astro';
import {
	gateScripts,
	initializeGateBridge,
} from '@c15t/benchmarking/consent-gate-page';

initializeGateBridge();

export default {
	scripts: gateScripts(),
} satisfies C15tClientOptionsExtension;
