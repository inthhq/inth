import type {
	ConsentSnapshot,
	LegalLinks,
	ResolvedOptOutLink,
	SaveResult,
} from '@inth/sdk-core';

import type { ConsentClient } from '../consent-client.model';
import type { SlotApplier } from './create-slot-applier';

/** What every surface renders against. */
export interface SurfaceContext {
	/** The client whose kernel drives the surface. */
	client: ConsentClient;
	/** The `.inth-theme-root` element surfaces append to. */
	root: HTMLElement;
	/** Ship the DOM without class names. */
	noStyle: boolean;
	/** Skip enter and exit transitions. */
	disableAnimation: boolean;
	/** The site's legal links, if configured. */
	legalLinks: LegalLinks | undefined;
	/** Marks an element as a `theme.slots` part and applies its overrides. */
	slot: SlotApplier;
	/** Banner Accept All handler that enforces two-step opt-in confirmation. */
	acceptFromBanner?: () => Promise<SaveResult>;
	/** Handles an opt-out link click according to its resolved link variant. */
	onOptOutLink?: (variant: ResolvedOptOutLink['variant']) => void;
	/**
	 * Add `@inth/sdk-ui` sheets the stock stylesheet leaves out, once each,
	 * after it. The prompt and the dialog add their own rules
	 * this way. Does nothing when the mount ships no stock styles.
	 */
	addSheets?: (sheets: readonly { id: string; css: string }[]) => void;
}

/** A mounted surface. */
export interface Surface {
	/** Reconcile the DOM with a snapshot. */
	sync: (snapshot: ConsentSnapshot) => void;
	/** Remove the surface and release listeners. */
	destroy: () => void;
}
