/**
 * What every UI part renders against: the render environment, the
 * surface's session and translations, and the rights bundle. Mirrors
 * `@inth/react`'s `components/privacy-choices`.
 *
 * @packageDocumentation
 * @internal
 */

import {
	resolveOptOutReceipt,
	resolveRightsBundle,
	resolveSurfaceTranslations,
} from '@inth/sdk-core';
import type {
	ConsentKernel,
	ConsentSnapshot,
	OptOutReceiptData,
	RightsBundle,
	SurfaceSession,
	SurfaceSessionState,
	Translations,
} from '@inth/sdk-core';
import type { PreferenceDraft } from '@inth/sdk-core/preference-draft';

import type { SurfaceContext } from '../surface.model';
import { getSurfaceSession } from './engine';

/** What a UI part renders against, refreshed on every render. */
export interface PartEnv {
	ctx: SurfaceContext;
	kernel: ConsentKernel;
	snapshot: ConsentSnapshot;
	/** The resolved bundle, bundled English filling any gaps. */
	t: Translations;
	session: SurfaceSession;
	state: SurfaceSessionState;
	/** The surface's own preference draft. */
	draft: PreferenceDraft;
	noStyle: boolean;
	/** The phone layout applies (`PHONE_LAYOUT_QUERY`). */
	phone: boolean;
	/** Render the surface again, after a part's own state changed. */
	rerender: () => void;
}

/** The kernel's surface session and the translations for a snapshot. */
export const surfaceBasics = function surfaceBasics(
	kernel: ConsentKernel,
	snapshot: ConsentSnapshot
): { session: SurfaceSession; t: Translations } {
	return {
		session: getSurfaceSession(kernel),
		t: resolveSurfaceTranslations(snapshot) as Translations,
	};
};

/**
 * The rights bundle the sale row names (COPY-01, SR-04): the confirmed
 * rights of a held opt-out, else sale, sharing and targeted ads, which
 * every US preset covers. The rights count as confirmed only through this
 * browser's local receipt data (`getOptOutReceiptData`), so it must be
 * passed.
 */
export const rightsBundleOf = function rightsBundleOf(
	snapshot: Pick<ConsentSnapshot, 'optOut'>,
	local: Partial<OptOutReceiptData> | null
): RightsBundle {
	return (
		resolveRightsBundle(resolveOptOutReceipt(snapshot, local).rights) ?? 'all'
	);
};
