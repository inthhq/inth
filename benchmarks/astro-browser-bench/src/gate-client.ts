import {
	gateScripts,
	initializeGateBridge,
} from '@inth/benchmarking/consent-gate-page';
/**
 * `clientEntrypoint` of the `gate` build: registers the consent gate's two
 * gated scripts, as CookieBench's Astro fixture registers its controlled
 * workload from `src/consent-client.ts`.
 */
import type { InthClientOptionsExtension } from '@inth/astro';

initializeGateBridge();

export default {
	scripts: gateScripts(),
} satisfies InthClientOptionsExtension;
