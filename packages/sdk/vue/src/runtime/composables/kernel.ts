import type {
	ConsentSnapshot,
	OptOutResult,
	SaveUISource,
} from '@inth/sdk/engine';
import {
	hasConsentPreferences,
	hasConsentUI,
	hasOptOutConfirmationHost,
	isOptOutConfirmationOpen,
	optOutConsentSurface,
	subscribeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { resolveOptOutState } from '@inth/sdk/surface-state';
import { computed, inject, onScopeDispose, ref } from 'vue';

import {
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../utils/symbols';

export const useConsentKernel = function useConsentKernel() {
	const kernel = inject(symbolKernel);
	if (!kernel) {
		throw new Error('[inth] Kernel not found');
	}
	return kernel;
};

export const useConsentSnapshot = function useConsentSnapshot() {
	const snapshot = inject(symbolSnapshot);
	if (!snapshot) {
		throw new Error('[inth] Kernel snapshot not found');
	}
	return snapshot;
};

export const useConsentKernelContext = function useConsentKernelContext() {
	const context = inject(symbolKernelContext);
	if (!context) {
		throw new Error('[inth] Kernel context not found');
	}
	return context;
};

const useSnapshotField = <Key extends keyof ConsentSnapshot>(key: Key) => {
	const snapshot = useConsentSnapshot();
	return computed(() => snapshot.value[key]);
};
/** Read the explicit receipt without applying permission restrictions. */
export const useExplicitChoice = () => useSnapshotField('explicitChoice');
/** Read the permissions currently available to consent gates. */
export const useEffectivePermissions = () =>
	useSnapshotField('effectivePermissions');
/** Read whether the policy currently requires choice, notice or no prompt. */
export const usePromptRequirement = () => useSnapshotField('promptRequirement');
/** Read the stored notice acknowledgement independently of choices. */
export const useNoticeDismissal = () => useSnapshotField('noticeDismissal');
/** Read the opt-out display state derived from the current snapshot. */
export const useOptOutState = () => {
	const snapshot = useConsentSnapshot();
	return computed(() => resolveOptOutState(snapshot.value));
};
/** Read detected and active user-agent privacy signals. */
export const usePrivacySignals = () => useSnapshotField('privacySignals');
/** Read the canonical policy rule used by the evaluator. */
export const usePolicyRule = () => useSnapshotField('policyRule');
/** Read the authoritative policy resolution and its status. */
export const usePolicyResolution = () => useSnapshotField('resolution');
/**
 * Whether a policy rule is resolved for this visitor. Every Inth consent
 * surface renders nothing until one is: an unconfigured, failed, or
 * unmatched resolution leaves nothing to consent to, and the surfaces
 * appear on their own once a later init supplies a rule.
 */
export const useHasConsentPolicy = () => {
	const resolution = usePolicyResolution();
	return computed(() => resolution.value.status === 'matched');
};
/**
 * Whether the resolved rule owes any consent UI. A prompt owes a banner and
 * a preference center; rights owe a way back to preferences. A `none` rule
 * with no rights owes neither, so every surface stays hidden while the
 * permissions it grants apply. `false` until a rule is resolved.
 */
export const useHasConsentUi = () => {
	const snapshot = useConsentSnapshot();
	return computed(() => hasConsentUI(snapshot.value));
};
/** Whether Inth or an external CMP offers a preferences control. */
export const useHasConsentPreferences = () => {
	const snapshot = useConsentSnapshot();
	return computed(() => hasConsentPreferences(snapshot.value));
};
/** Read the reasons that currently restrict permissions. */
export const useConsentRestrictions = () => useSnapshotField('restrictions');
export const useDismissNotice = () => useConsentKernel().commands.dismissNotice;

/**
 * Record an opt-out in one click and open `OptOutConfirmation` under an
 * opt-out policy. Under other policy models, open the preference dialog.
 */
export const useOptOut = function useOptOut(): (context?: {
	uiSource?: SaveUISource;
}) => Promise<OptOutResult> {
	const kernel = useConsentKernel();
	return (context) => optOutConsentSurface(kernel, context);
};

/**
 * Reactive open state of the opt-out confirmation view for the active kernel.
 *
 * @internal
 */
export const useOptOutConfirmationOpen = function useOptOutConfirmationOpen() {
	const kernel = useConsentKernel();
	const open = ref(isOptOutConfirmationOpen(kernel));
	const stop = subscribeOptOutConfirmation(kernel, () => {
		open.value = isOptOutConfirmationOpen(kernel);
	});
	onScopeDispose(stop);
	return open;
};

/**
 * Whether a standalone `OptOutConfirmation` host is mounted for the active
 * kernel.
 *
 * @internal
 */
export const useHasOptOutConfirmationHost =
	function useHasOptOutConfirmationHost() {
		const kernel = useConsentKernel();
		const hasHost = ref(hasOptOutConfirmationHost(kernel));
		const stop = subscribeOptOutConfirmation(kernel, () => {
			hasHost.value = hasOptOutConfirmationHost(kernel);
		});
		onScopeDispose(stop);
		return hasHost;
	};
