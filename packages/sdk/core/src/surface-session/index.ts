/**
 * The surface session: transient consent-surface UI state per kernel, and
 * the rights decisions every renderer shares.
 *
 * @packageDocumentation
 */

// oxlint-disable-next-line oxc/no-barrel-file -- The module's public interface; each file stays separately placeable.
export {
	applyDialogCategories,
	commitBannerChoice,
	commitDialogChoice,
	confirmSaleRight,
	copySurfaceReference,
	pressSaleRight,
} from './commands';
export type {
	BannerCommitOptions,
	BannerCommitOutcome,
	RightCommandOptions,
	RightPressResult,
} from './commands';
export { resolveSurfaceEscape } from './resolve-surface-escape';
export type {
	SurfaceEscapeInput,
	SurfaceEscapeOutcome,
} from './resolve-surface-escape';
export {
	resolveBannerCommit,
	resolveRightPress,
	resolveSaleRight,
} from './surface-rights.model';
export type {
	BannerCommitAction,
	BannerCommitPlan,
	BannerCommitSnapshot,
	BannerKeptOff,
	RightOption,
	RightPressInput,
	RightPressOutcome,
	RightSource,
	RightsSnapshot,
	SaleRightState,
} from './surface-rights.model';
export { planCategorySwitch, planVendorSwitch } from './category-switch.model';
export type {
	CategorySwitchPlan,
	CategorySwitchState,
} from './category-switch.model';
export { resolveRightsReceipt } from './resolve-rights-receipt';
export type { ReceiptSnapshot, RightsReceipt } from './resolve-rights-receipt';
export { getSurfaceSession } from './session';
export type {
	SurfaceCopyFinish,
	SurfaceCopyOptions,
	SurfaceEscapeContext,
	SurfaceSession,
} from './session';
export {
	announcementText,
	initialSurfaceSession,
	isCurrentSurface,
	MAIN_LAYER,
	MAX_SURFACE_LAYERS,
	reduceSurfaceSession,
	topLayer,
} from './surface-session-state.model';
export type {
	SurfaceAnnouncement,
	SurfaceConfirmation,
	SurfaceCopy,
	SurfaceCopyStatus,
	SurfaceRight,
	SurfaceSessionAction,
	SurfaceSessionState,
	SurfaceSheet,
} from './surface-session-state.model';
