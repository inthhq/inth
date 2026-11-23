import {
	allConsentNames,
	applyExperimentAssignment,
	applyExperimentTheme,
	consentTypes as defaultConsentTypes,
	has as evaluateHas,
	resolveConsentPresentation,
	vendorsListedUnder,
} from '@inth/sdk/engine';
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
	KernelActiveUI,
	KernelIABState,
	Model,
	OptOutResult,
	ResolvedVendor,
	SaveResult,
	SaveUISource,
} from '@inth/sdk/engine';
import type { createPreferenceDraft } from '@inth/sdk/preference-draft';
import type { ConsentRuntime } from '@inth/sdk/runtime';
import {
	getOptOutReceiptData,
	hasConsentPreferences,
	hasConsentUI,
	isSnapshotVendorAllowed,
	optOutConsentSurface,
	saveConsentSurface,
	saveConsentSurfaceWithOptInCheck,
	showConsentSurface,
} from '@inth/sdk/surface-actions';
import {
	resolveOptOut,
	resolveSurfaceTranslations,
} from '@inth/sdk/surface-state';
import type { OptOutReceiptData, OptOutState } from '@inth/sdk/surface-state';
import type { CompleteTranslations } from '@inth/sdk/translations';
import type { Theme, UIOptions } from '@inth/sdk/ui/theme';
import { getContext, setContext } from 'svelte';

import type { DialogPreload } from './dialog-warming';
import type { ConsentManagerOptions } from './types';

const CONSENT_CONTEXT_KEY = Symbol('inth-v3-consent');
const THEME_CONTEXT_KEY = Symbol('inth-v3-theme');

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

const toActiveUI = function toActiveUI(ui: KernelActiveUI): ActiveUI {
	return (ui ?? 'none') as ActiveUI;
};

/** Metadata for the displayed categories, in the draft's order. */
const displayedConsentTypes = function displayedConsentTypes(
	categories: readonly AllConsentNames[]
) {
	const names =
		categories.length > 0
			? categories
			: (allConsentNames as readonly AllConsentNames[]);
	return names.flatMap((name) =>
		defaultConsentTypes
			.filter((type) => type.name === name)
			.map((type) => ({ ...type, display: true }))
	);
};

const createConsentState = function createConsentState(
	getKernel: () => ConsentKernel,
	options: ConsentControllerOptions
): ConsentManagerState {
	const getSnapshotLocal = options.getSnapshot;

	// oxlint-disable-next-line sort-keys -- Preserve declaration order, interface shape, and public compatibility.
	const controller: ConsentManagerState = {
		get activeUI() {
			return toActiveUI(getSnapshotLocal().activeUI);
		},
		get branding() {
			return getSnapshotLocal().branding;
		},
		// The draft's displayed categories: `necessary` plus the choice scope.
		get consentCategories(): AllConsentNames[] {
			return options.getConsentCategories();
		},
		get draft() {
			return options.getDraft();
		},
		get presentation() {
			return applyExperimentAssignment(
				options.getPresentation(),
				options.getExperiment?.(),
				getSnapshotLocal().experiment
			);
		},
		get experiment() {
			return getSnapshotLocal().experiment;
		},
		get theme() {
			return applyExperimentTheme(
				options.getTheme?.(),
				options.getExperiment?.(),
				getSnapshotLocal().experiment
			);
		},
		get consentTypes() {
			return displayedConsentTypes(controller.consentCategories);
		},

		getDisplayedConsents() {
			return displayedConsentTypes(controller.consentCategories);
		},
		getDisplayedVendors(category: AllConsentNames) {
			return vendorsListedUnder(getSnapshotLocal(), category);
		},
		has(condition: HasCondition<AllConsentNames>) {
			const snapshot = getSnapshotLocal();
			return evaluateHas(
				condition,
				snapshot.effectivePermissions as ConsentState
			);
		},
		isVendorAllowed(vendorId: string) {
			return isSnapshotVendorAllowed(getSnapshotLocal(), vendorId);
		},
		dismissNotice() {
			return getKernel().commands.dismissNotice();
		},
		requestOptOut(context?: { uiSource?: SaveUISource }) {
			return optOutConsentSurface(getKernel(), context);
		},
		get iab() {
			return options.getIAB();
		},
		get legalLinks() {
			return options.getLegalLinks();
		},
		get location() {
			return getSnapshotLocal().location;
		},
		get manager() {
			return null;
		},
		get model() {
			return getSnapshotLocal().iab?.enabled
				? 'iab'
				: getSnapshotLocal().policyRule.model;
		},
		get hasPolicy() {
			return getSnapshotLocal().resolution.status === 'matched';
		},
		get hasConsentPreferences() {
			return hasConsentPreferences(getSnapshotLocal());
		},
		get hasConsentUi() {
			return hasConsentUI(getSnapshotLocal());
		},

		get explicitChoice() {
			return getSnapshotLocal().explicitChoice;
		},
		get effectivePermissions() {
			return getSnapshotLocal().effectivePermissions;
		},
		get promptRequirement() {
			return getSnapshotLocal().promptRequirement;
		},
		get noticeDismissal() {
			return getSnapshotLocal().noticeDismissal;
		},
		get optOut() {
			return getSnapshotLocal().optOut;
		},
		get optOutState() {
			const local =
				options.getOptOutReceiptData?.() ?? getOptOutReceiptData(getKernel());
			return resolveOptOut(getSnapshotLocal(), local);
		},
		get privacySignals() {
			return getSnapshotLocal().privacySignals;
		},
		get resolution() {
			return getSnapshotLocal().resolution;
		},
		get policyRule() {
			return getSnapshotLocal().policyRule;
		},
		get restrictions() {
			return getSnapshotLocal().restrictions;
		},
		get nextDeadline() {
			return getSnapshotLocal().nextDeadline;
		},
		get subject() {
			return getSnapshotLocal().subject;
		},
		get evaluatedAt() {
			return getSnapshotLocal().evaluatedAt;
		},
		get evaluationPolicy() {
			return getSnapshotLocal().evaluationPolicy;
		},
		get overrides() {
			return getSnapshotLocal().overrides;
		},

		get policyPending() {
			return getSnapshotLocal().policyPending;
		},

		get revision() {
			return getSnapshotLocal().revision;
		},
		async saveConsents(type: SaveType) {
			// The kernel this action started on, even if `enabled` swaps it.
			const kernel = getKernel();
			const draft = options.getDraft();
			// The surface closes in this task once the kernel has recorded the
			// choice; see `saveConsentSurface`. The draft follows the record,
			// so edits staged while the request runs stay staged. A stale
			// draft rejects before recording and leaves the surface open.
			if (type !== 'custom') {
				const input = type === 'all' ? 'all' : 'none';
				const categories =
					controller.consentCategories.length > 0
						? controller.consentCategories
						: undefined;
				const result = draft.saveBulk
					? await draft.saveBulk(input)
					: await saveConsentSurfaceWithOptInCheck(
							kernel,
							input,
							() => {
								// No category list: the kernel narrows a bulk choice to its own
								// choice scope, the categories the draft displays.
								const pending = kernel.commands.save(input);
								// A bulk choice supersedes every staged edit, even one that
								// records nothing new.
								draft.reset();
								return pending;
							},
							{ categories }
						);
				if (!result.ok) {
					throw new Error('Unable to save preferences.');
				}
				return;
			}
			const result = await saveConsentSurface(kernel, async () => {
				await draft.save(controller.consentCategories);
				return { ok: true };
			});
			if (!result.ok) {
				throw new Error('Unable to save preferences.');
			}
		},
		get selectedConsents() {
			return options.getDraft().values;
		},
		get selectedConsentTypes() {
			return options.getDraft().values;
		},
		get selectedVendors() {
			return options.getDraft().vendors;
		},
		setActiveUI(ui: ActiveUI) {
			showConsentSurface(getKernel(), ui as KernelActiveUI);
		},
		setConsent(name: AllConsentNames, value: boolean) {
			options.getDraft().set(name, value);
		},
		setLanguage(code: string) {
			options.setLanguage(code);
		},
		setSelectedConsent(name: AllConsentNames, value: boolean) {
			options.getDraft().set(name, value);
		},
		setSelectedVendor(vendorId: string, granted: boolean) {
			options.getDraft().setVendor(vendorId, granted);
		},

		subscribeToConsentChanges(listener: (state: ConsentState) => void) {
			return getKernel().subscribe((snapshot: ConsentSnapshot) =>
				listener(snapshot.effectivePermissions as ConsentState)
			);
		},

		get copy() {
			return resolveSurfaceTranslations(getSnapshotLocal());
		},
		get translations() {
			return getSnapshotLocal().translations;
		},
		get vendorChoice() {
			return getSnapshotLocal().vendorChoice;
		},
		get vendors() {
			return getSnapshotLocal().vendors;
		},
		get user() {
			return getSnapshotLocal().user;
		},
	};

	return controller;
};

/**
 * @param getKernel - The kernel the provider renders now. It changes when
 * the runtime's `enabled` toggles.
 */
export const setConsentContext = function setConsentContext(
	getKernel: () => ConsentKernel,
	options: ConsentControllerOptions
): void {
	const consentState = createConsentState(getKernel, options);
	setContext(CONSENT_CONTEXT_KEY, {
		clearRecords: options.clearRecords,
		get kernel() {
			return getKernel();
		},
		get manager() {
			return getKernel();
		},
		provideDraft: options.provideDraft,
		runtime: options.runtime,
		get snapshot() {
			return options.getSnapshot();
		},
		get state() {
			return consentState;
		},
	} satisfies ConsentContextValue);
};

export const getConsentContext =
	function getConsentContext(): ConsentContextValue {
		const context = getContext<ConsentContextValue | undefined>(
			CONSENT_CONTEXT_KEY
		);
		if (!context) {
			throw new Error(
				'inth: no v3 consent context. Wrap your app with <InthProvider options={...}> from @inth/svelte.'
			);
		}
		return context;
	};

export const getConsentKernel = function getConsentKernel(): ConsentKernel {
	return getConsentContext().kernel;
};

export const getSnapshot = function getSnapshot(): ConsentSnapshot {
	return getConsentContext().snapshot;
};

/**
 * Returns the reactive consent manager controller for the current component.
 *
 * Exposes both readable state (`consents`, `activeUI`, `model`, …) and
 * mutators (`setConsent`, `saveConsents`, `setActiveUI`, `setLanguage`, …).
 * This is the primary API for reading and writing consent from inside your
 * own components. React has no single equivalent; it reads each field
 * through its own hook, such as `useConsent()` or `useActiveUI()`.
 *
 * Must be called inside a component tree wrapped in `<InthProvider>`.
 */
export const getConsentManager =
	function getConsentManager(): ConsentManagerState {
		return getConsentContext().state;
	};

export interface HeadlessConsentSurfaceState extends ResolvedConsentPresentation {
	isVisible: boolean;
}
const resolveHeadlessSurface = (
	consent: ConsentManagerState,
	surface: 'banner' | 'dialog'
): HeadlessConsentSurfaceState => ({
	...resolveConsentPresentation({
		policy: consent.policyRule,
		presentation: consent.presentation,
		surface: surface === 'banner' ? 'prompt' : 'preferences',
	}),
	isVisible: consent.activeUI === surface,
});

export const getHeadlessConsent = function getHeadlessConsent() {
	const consent = getConsentManager();
	return {
		get activeUI() {
			return consent.activeUI;
		},
		get banner() {
			return resolveHeadlessSurface(consent, 'banner');
		},
		closeUI() {
			consent.setActiveUI('none');
		},
		get dialog() {
			return resolveHeadlessSurface(consent, 'dialog');
		},
		openBanner() {
			consent.setActiveUI('banner');
		},
		openDialog() {
			consent.setActiveUI('dialog');
		},
		optOut(context?: { uiSource?: SaveUISource }) {
			return consent.requestOptOut(context);
		},
		async performAction(
			action: 'accept' | 'reject' | 'customize' | 'dismiss' | 'save'
		) {
			if (action === 'dismiss') {
				await consent.dismissNotice();
				return;
			}
			if (action === 'save') {
				await consent.saveConsents('custom');
				return;
			}
			if (action === 'accept') {
				await consent.saveConsents('all');
				return;
			}
			if (action === 'reject') {
				await consent.saveConsents('necessary');
				return;
			}
			consent.setActiveUI('dialog');
		},
		async saveCustomPreferences() {
			await consent.saveConsents('custom');
		},
	};
};

export const getIAB = function getIAB(): SvelteIABState | null {
	return getConsentContext().state.iab;
};

export const setThemeContext = function setThemeContext(
	value: ThemeContextValue
): void {
	setContext(THEME_CONTEXT_KEY, value);
};

export const getThemeContext = function getThemeContext(): ThemeContextValue {
	return (
		getContext<ThemeContextValue | undefined>(THEME_CONTEXT_KEY) ?? {
			colorScheme: 'system',
			disableAnimation: false,
			noStyle: false,
			scrollLock: undefined,
			trapFocus: undefined,
		}
	);
};
