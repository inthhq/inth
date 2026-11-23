import {
	allConsentNames,
	applyExperimentAssignment,
	applyExperimentTheme,
	consentTypes as defaultConsentTypes,
	has as evaluateHas,
	vendorsListedUnder,
} from '@inth/sdk/engine';
import type {
	ActiveUI,
	AllConsentNames,
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	HasCondition,
	KernelActiveUI,
	SaveUISource,
} from '@inth/sdk/engine';
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
import { getContext, setContext } from 'svelte';

import type {
	ConsentContextValue,
	ConsentControllerOptions,
	ConsentManagerState,
	SaveType,
} from './consent-context.model';

const CONSENT_CONTEXT_KEY = Symbol('inth-v3-consent');

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
