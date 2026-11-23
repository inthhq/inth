/**
 * What the Escape key does on a consent surface, as one pure ladder.
 *
 * @packageDocumentation
 */

import type { ActiveUI } from '../types';

/** What a renderer knows when Escape is pressed. */
export interface SurfaceEscapeInput {
	/** The surface showing. */
	readonly surface: ActiveUI;
	/** Phone sheets above the main dialog card. */
	readonly sheets: number;
	/** A confirmation is open. */
	readonly confirmation: boolean;
	/** The banner's options are expanded in place. */
	readonly expanded: boolean;
	/** The banner blocks the page until a choice (BNR-13). */
	readonly blocking: boolean;
	/** Focus is inside the surface. A blocking banner holds focus, so this only matters when it does not. */
	readonly focusInside: boolean;
	/** The surface is animating out. A leaving surface ignores keys. */
	readonly leaving?: boolean;
}

/**
 * What Escape does:
 *
 * - `'close-sheet'`: close the top phone sheet.
 * - `'close-confirmation'`: close the open confirmation.
 * - `'close-dialog'`: close the dialog.
 * - `'collapse'`: fold the banner's expanded options back.
 * - `'swallow'`: nothing, but the key is handled, so the page does not see
 *   it (a blocking banner: dismissing is not consent).
 * - `'ignore'`: not ours; leave the event alone.
 */
export type SurfaceEscapeOutcome =
	| 'close-sheet'
	| 'close-confirmation'
	| 'close-dialog'
	| 'collapse'
	| 'swallow'
	| 'ignore';

/**
 * The Escape ladder (FOC-04, PERM-03, PERM-15): in the dialog, the top
 * sheet, then an open confirmation, then the dialog. On a banner, an open
 * confirmation, then the expanded options. Escape never dismisses a
 * banner, blocking or not. A banner that does not block the page acts
 * only while focus is inside it, so Escape pressed elsewhere on the page
 * is left to the page.
 */
export const resolveSurfaceEscape = function resolveSurfaceEscape(
	input: SurfaceEscapeInput
): SurfaceEscapeOutcome {
	if (input.leaving === true || input.surface === 'none') {
		return 'ignore';
	}
	if (input.surface === 'dialog') {
		if (input.sheets > 0) {
			return 'close-sheet';
		}
		return input.confirmation ? 'close-confirmation' : 'close-dialog';
	}
	if (!(input.blocking || input.focusInside)) {
		return 'ignore';
	}
	if (input.confirmation) {
		return 'close-confirmation';
	}
	if (input.expanded) {
		return 'collapse';
	}
	return input.blocking ? 'swallow' : 'ignore';
};
