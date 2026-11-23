/**
 * The boot data the SvelteKit `InthProvider` leaves in the server HTML: its
 * attribute, shape and markup, which the server writer
 * (`plan-server-boot.ts`) and the browser reader (`read-consent-boot.ts`)
 * share.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentExperiment, ConsentSnapshot } from '@inth/sdk/engine';

/** Attribute on the `<script type="application/json">` element. @internal */
export const CONSENT_BOOT_ATTRIBUTE = 'data-inth-boot';

/** What the server leaves. Short keys: it travels in every page. @internal */
export interface RootBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
	/** `1` when the engine may wait for the page (see `plan-server-boot.ts`). */
	d?: 1;
	/** The experiment the server's runtime assigned from, when there is one. */
	x?: ConsentExperiment;
	/**
	 * `1` when `s.iab.gvl` was left out because it is the state's
	 * `initialIab.gvl`, which the page already carries.
	 */
	g?: 1;
}

/**
 * The element's markup: what the server renders after the root's children,
 * and what the browser renders over it, so hydration adopts it unchanged.
 *
 * @param json - The boot, as JSON with `<` escaped.
 * @internal
 */
export const bootMarkup = (json: string): string =>
	`<script type="application/json" ${CONSENT_BOOT_ATTRIBUTE}>${json}</script>`;
