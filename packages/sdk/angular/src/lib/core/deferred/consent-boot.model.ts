/**
 * The boot a server render leaves for the browser: the snapshot it rendered
 * with, so the browser hydrates against it before the consent engine loads.
 * It travels in `TransferState`, next to the server-resolved state
 * (`../server-state-gate.ts`), under the key in `boot-state-key.ts`. The
 * writer is in `plan-server-boot.ts`, so the first-load chunk carries only
 * the key.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentExperiment, ConsentSnapshot } from '@inth/sdk/engine';

/** What the server leaves. Short keys: it travels in every page. @internal */
export interface ConsentBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
	/** `1` when the engine may wait for the page (see `plan-server-boot.ts`). */
	d?: 1;
	/** The experiment the server's runtime assigned from, when there is one. */
	x?: ConsentExperiment;
	/**
	 * `1` when `s.iab.gvl` was left out because it is the server state's
	 * `initialIab.gvl`, which the page already carries.
	 */
	g?: 1;
}

/**
 * The boot with the vendor list put back, when the server left it out.
 *
 * @param boot - The boot read from `TransferState`.
 * @param gvl - The server state's `initialIab.gvl`.
 * @internal
 */
export const restoreBoot = function restoreBoot(
	boot: ConsentBoot,
	gvl: unknown
): ConsentBoot {
	if (!(boot.g && boot.s.iab)) {
		return boot;
	}
	return {
		...boot,
		s: { ...boot.s, iab: { ...boot.s.iab, gvl: (gvl ?? null) as never } },
	};
};
