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
export { resolveSurfaceEscape } from './escape';
export type { SurfaceEscapeInput, SurfaceEscapeOutcome } from './escape';
export {
	resolveBannerCommit,
	resolveRightPress,
	resolveSaleRight,
} from './rights';
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
} from './rights';
export { planCategorySwitch, planVendorSwitch } from './categories';
export type { CategorySwitchPlan, CategorySwitchState } from './categories';
export { resolveRightsReceipt } from './receipt';
export type { ReceiptSnapshot, RightsReceipt } from './receipt';
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
} from './state';
export type {
	SurfaceAnnouncement,
	SurfaceConfirmation,
	SurfaceCopy,
	SurfaceCopyStatus,
	SurfaceRight,
	SurfaceSessionAction,
	SurfaceSessionState,
	SurfaceSheet,
} from './state';
