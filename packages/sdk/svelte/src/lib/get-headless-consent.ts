import { resolveConsentPresentation } from '@inth/sdk/engine';
import type {
	ConsentKernel,
	ConsentSnapshot,
	SaveUISource,
} from '@inth/sdk/engine';

import type {
	ConsentManagerState,
	HeadlessConsentSurfaceState,
	SvelteIABState,
} from './consent-context.model';
import { getConsentContext } from './get-consent-context.svelte';

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
