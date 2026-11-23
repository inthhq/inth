import type {
	ActiveUI,
	AllConsentNames,
	ConsentExperiment,
	ConsentKernel,
	ConsentPresentation,
	ExperimentAssignment,
	ResolvedConsentPresentation,
	ConsentSnapshot,
	ConsentState,
	ConsentType,
	HasCondition,
	KernelIABState,
	Model,
	OptOutResult,
	ResolvedVendor,
	SaveResult,
	SaveUISource,
} from '@inth/sdk/engine';
import type { createPreferenceDraft } from '@inth/sdk/preference-draft';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import type { OptOutReceiptData, OptOutState } from '@inth/sdk/surface-state';
import type { CompleteTranslations } from '@inth/sdk/translations';
import type { Theme, UIOptions } from '@inth/sdk/ui/theme';

import type { ConsentManagerOptions } from './manager-options.model';
import type { DialogPreload } from './warm-dialog';

export type SaveType = 'all' | 'custom' | 'necessary';

export interface SvelteIABState extends KernelIABState {
	config: {
		enabled: boolean;
		cmpId: number | null;
	};
	isLoadingGVL: boolean;
	nonIABVendors: KernelIABState['customVendors'];
	preferenceCenterTab: 'purposes' | 'vendors';
	setPreferenceCenterTab: (tab: 'purposes' | 'vendors') => void;
	setVendorConsent: (vendorId: string | number, value: boolean) => void;
	setVendorLegitimateInterest: (
		vendorId: string | number,
		value: boolean
	) => void;
	setPurposeConsent: (purposeId: number, value: boolean) => void;
	setPurposeLegitimateInterest: (purposeId: number, value: boolean) => void;
	/** Object to a purpose's legitimate interest, for it and its vendors. */
	setPurposeObjection: (purposeId: number, objected: boolean) => void;
	setSpecialFeatureOptIn: (featureId: number, value: boolean) => void;
	/** Set consent for a Google ad tech provider (Additional Consent). */
	setAdTechProviderConsent: (providerId: number, value: boolean) => void;
	acceptAll: () => void;
	rejectAll: () => void;
	save: () => Promise<void>;
}

export interface ConsentDraftState {
	readonly values: Partial<ConsentState>;
	/**
	 * Granted flag per declared vendor. Seeded from the denials the gate
	 * honors, so a vendor declared `disabled` reads `true` whatever an older
	 * record says; every vendor not denied is `true`. Empty under an `iab`
	 * policy.
	 */
	readonly vendors: Readonly<Record<string, boolean>>;
	readonly isStale: boolean;
	set: (name: AllConsentNames, value: boolean) => void;
	/**
	 * Stage one vendor's grant. Recorded by the next save. Ignored for a
	 * vendor that is not declared or is declared `disabled`, since the kernel
	 * would drop the grant on save.
	 *
	 * @param vendorId - Vendor slug as declared in `vendors` or on a script.
	 * @param granted - Whether the vendor may load once the draft is saved.
	 */
	setVendor: (vendorId: string, granted: boolean) => void;
	reset: () => void;
	save: (categories: readonly AllConsentNames[]) => Promise<void>;
	/**
	 * Record a bulk choice (`'all'` or `'none'`), skipping GPC-locked
	 * categories on `'all'`.
	 *
	 * @internal
	 */
	saveBulk?: (input: 'all' | 'none') => Promise<SaveResult>;
}

export interface ConsentManagerState extends Pick<
	ConsentSnapshot,
	| 'explicitChoice'
	| 'effectivePermissions'
	| 'promptRequirement'
	| 'noticeDismissal'
	| 'optOut'
	| 'privacySignals'
	| 'resolution'
	| 'policyRule'
	| 'restrictions'
	| 'nextDeadline'
	| 'subject'
	| 'evaluatedAt'
	| 'evaluationPolicy'
	| 'policyPending'
	| 'location'
	| 'overrides'
	| 'revision'
	| 'translations'
	| 'user'
	| 'vendors'
	| 'vendorChoice'
> {
	activeUI: ActiveUI;
	branding: ConsentSnapshot['branding'];

	selectedConsents: Partial<ConsentState>;
	selectedConsentTypes: Partial<ConsentState>;
	/** Granted flag per declared vendor in the draft. */
	selectedVendors: Readonly<Record<string, boolean>>;
	/** The configured presentation with the assigned experiment arm merged over it. */
	presentation?: ConsentPresentation;
	/** The presentation experiment arm this visitor runs, or `null`. */
	experiment: Readonly<ExperimentAssignment> | null;
	/** The configured theme with the assigned experiment arm's theme merged over it. */
	theme?: Theme;
	readonly draft: ConsentDraftState;
	consentCategories: AllConsentNames[];
	consentTypes: ConsentType[];
	iab: SvelteIABState | null;
	manager: null;
	model: Model;
	/**
	 * Whether a policy rule is resolved for this visitor. Every Inth consent
	 * surface renders nothing until one is: an unconfigured, failed, or
	 * unmatched resolution leaves nothing to consent to, and the surfaces
	 * appear on their own once a later init supplies a rule.
	 */
	hasPolicy: boolean;
	/**
	 * Whether the resolved rule owes any consent UI. A prompt owes a banner
	 * and a preference center; rights owe a way back to preferences. A `none`
	 * rule with no rights owes neither, so every surface stays hidden while
	 * the permissions it grants apply. `false` until a rule is resolved.
	 */
	hasConsentUi: boolean;
	/** Whether Inth or an external CMP offers a preferences control. */
	hasConsentPreferences: boolean;
	/** Merged opt-out display state and receipt derived from the current snapshot and local receipt data. */
	readonly optOutState: OptOutState;
	legalLinks: ConsentManagerOptions['legalLinks'];
	/**
	 * The copy the surfaces render: the active language bundle with English
	 * filling every key it leaves out.
	 */
	copy: CompleteTranslations;
	getDisplayedConsents: () => ConsentType[];
	/**
	 * The vendors listed under one category: presentable, naming that
	 * category, without a negation. Empty under an `iab` policy, where the
	 * TC string decides and vendor rows are not shown.
	 *
	 * @returns The vendors to list, in declared order.
	 */
	getDisplayedVendors: (category: AllConsentNames) => ResolvedVendor[];
	has: (condition: HasCondition<AllConsentNames>) => boolean;
	/**
	 * Whether one vendor may load: it is declared, its category condition
	 * passes, and outside IAB the visitor has not turned it off.
	 *
	 * @param vendorId - Vendor id as declared in `vendors`, on a script or by
	 * the backend.
	 * @returns `true` while the vendor may load. An id nothing declares, such
	 * as a typo, returns `false` and logs a development warning.
	 */
	isVendorAllowed: (vendorId: string) => boolean;
	dismissNotice: () => Promise<unknown>;
	/**
	 * Record an opt-out in one click and open `OptOutConfirmation` under an
	 * opt-out policy. Under other policy models, open the preference dialog.
	 */
	requestOptOut: (context?: {
		uiSource?: SaveUISource;
	}) => Promise<OptOutResult>;
	saveConsents: (type: SaveType) => Promise<void>;
	setActiveUI: (ui: ActiveUI, options?: { force?: boolean }) => void;
	setConsent: (name: AllConsentNames, value: boolean) => void;
	setLanguage: (code: string) => void;
	setSelectedConsent: (name: AllConsentNames, value: boolean) => void;
	/**
	 * Stage one vendor's grant on the draft. Recorded by the next save.
	 *
	 * @param vendorId - Vendor slug as declared in `vendors` or on a script.
	 * @param granted - Whether the vendor may load once the draft is saved.
	 */
	setSelectedVendor: (vendorId: string, granted: boolean) => void;
	subscribeToConsentChanges: (
		listener: (state: ConsentState) => void
	) => () => void;
}

export interface ConsentContextValue {
	readonly clearRecords: () => void;
	/**
	 * Start the provider's draft with the draft module a preference surface
	 * imported, so it renders seeded values in its first render.
	 *
	 * @internal
	 */
	readonly provideDraft: (create: typeof createPreferenceDraft) => void;
	readonly kernel: ConsentKernel;
	/** The runtime the provider renders, owned or borrowed. */
	readonly runtime: ConsentRuntime;
	readonly snapshot: ConsentSnapshot;
	readonly state: ConsentManagerState;
	readonly manager: ConsentKernel;
}

export interface ThemeContextValue {
	readonly theme?: Theme;
	readonly noStyle?: boolean;
	readonly disableAnimation?: boolean;
	/**
	 * Locks page scroll while a modal surface other than the stock banner
	 * and dialog is open: the IAB banner and dialog, and the opt-in
	 * confirmation (standalone, or hosted by the dialog). The stock banner
	 * blocks only with `presentation.prompt.blockUntilChoice` (or a policy
	 * that requires it); the stock dialog always blocks.
	 */
	readonly scrollLock?: boolean;
	/**
	 * Traps focus in a modal surface other than the stock banner and
	 * dialog: the IAB banner and dialog, and the opt-in confirmation
	 * (standalone, or hosted by the dialog). The stock banner traps focus
	 * only when it blocks (`blockUntilChoice`); the stock dialog always
	 * does.
	 */
	readonly trapFocus?: boolean;
	readonly colorScheme?: UIOptions['colorScheme'];
	readonly legalLinks?: ConsentManagerOptions['legalLinks'];
	readonly preloadDialog?: DialogPreload;
	/** `false` when the app imports `styles.css` itself. */
	readonly styles?: boolean;
	/** CSP nonce for the `<style>` elements the surfaces add. */
	readonly nonce?: string;
}

export interface ConsentControllerOptions {
	/** The runtime's one clear sequence. */
	clearRecords: () => void;
	setLanguage: (code: string) => void;
	getSnapshot: () => ConsentSnapshot;
	getOptOutReceiptData?: () => Readonly<OptOutReceiptData>;
	getDraft: () => ConsentDraftState;
	getIAB: () => SvelteIABState | null;
	getConsentCategories: () => AllConsentNames[];
	getLegalLinks: () => ConsentManagerOptions['legalLinks'];
	getPresentation: () => ConsentPresentation | undefined;
	getExperiment?: () => ConsentExperiment | undefined;
	getTheme?: () => Theme | undefined;
	/** See {@link ConsentContextValue.provideDraft}. */
	provideDraft: (create: typeof createPreferenceDraft) => void;
	/** See {@link ConsentContextValue.runtime}. */
	runtime: ConsentRuntime;
}

export interface HeadlessConsentSurfaceState extends ResolvedConsentPresentation {
	isVisible: boolean;
}
