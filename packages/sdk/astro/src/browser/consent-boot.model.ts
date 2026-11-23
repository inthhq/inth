/**
 * The boot data block the Astro server leaves beside the config: its
 * attribute and shape. The Svelte port's `deferred/consent-boot.model.ts`.
 *
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';

/** Attribute on the boot data block. @internal */
export const CONSENT_BOOT_ATTRIBUTE = 'data-inth-boot';

/** What the server leaves in the boot data block. @internal */
export interface ConsentBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
	/**
	 * Whether the engine may load after the page, as far as the server can
	 * tell (see `canDeferEngine` in `../banner/deferred-boot.model`).
	 */
	d: boolean;
}
