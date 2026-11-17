import { testing } from '@c15t/angular/testing';
import type { ApplicationConfig } from '@angular/core';
import { provideC15t } from '@c15t/angular';
import type { C15tOptions, C15tProviderOptions } from '@c15t/angular';

import {
	seedStorybookChoice,
	storybookPolicy,
	storybookPolicyResolution,
	storybookPresentation,
} from '../../storybook-consent-policy';

type ConsentRecord = Record<string, boolean>;

const clearCookies = function clearCookies() {
	for (const cookie of document.cookie.split(';')) {
		const name = cookie.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
		}
	}
};

export const resetStorybookConsentState =
	function resetStorybookConsentState() {
		if (typeof window === 'undefined') {
			return;
		}

		window.localStorage.clear();
		clearCookies();
	};

export const seedStoredConsent = seedStorybookChoice;

export const seedTCString = function seedTCString(tcString: string | null) {
	if (!tcString) {
		window.localStorage.removeItem('euconsent-v2');
		return;
	}

	window.localStorage.setItem('euconsent-v2', tcString);
};

export const defaultConsentOptions: C15tOptions = {
	mode: testing({ policy: [storybookPolicy] }),
	presentation: storybookPresentation,
};

/**
 * The default policy, already resolved, for stories that keep the default
 * `mode`, as the React fixture passes it. Stories that bring their own
 * `mode` (a notice rule) must not receive it: it would override their rule
 * with the default choice policy.
 */
const defaultPrefetch: C15tOptions['prefetch'] = {
	initialPolicyResolution: storybookPolicyResolution,
};

export const editableConsentOptions: Partial<C15tOptions> = {
	consentCategories: [
		'necessary',
		'functionality',
		'measurement',
		'experience',
		'marketing',
	],
};

export const editableStoredConsent: ConsentRecord = {
	experience: false,
	functionality: false,
	marketing: false,
	measurement: false,
	necessary: true,
};

/** What a story's application is created with. */
export interface StorybookConsentSetup {
	options?: Partial<C15tOptions>;
	storedConsent?: ConsentRecord;
	tcString?: string | null;
}

/**
 * The application config a story renders under: `provideC15t()` with the
 * shared Storybook options, created after the stored state is reset and
 * seeded. Angular's provider is application-wide, so this is the
 * counterpart of the other Storybooks' `StorybookConsentProvider`.
 *
 * @param setup - Options merged over the defaults, and the state to seed.
 * @returns The story's `applicationConfig`.
 */
export const consentApplication = function consentApplication({
	options,
	storedConsent,
	tcString = null,
}: StorybookConsentSetup = {}): ApplicationConfig {
	resetStorybookConsentState();
	if (storedConsent) {
		seedStoredConsent(storedConsent);
	}
	seedTCString(tcString);

	const merged = { ...defaultConsentOptions, ...options } as C15tOptions;
	const prefetch =
		merged.prefetch ??
		(merged.mode === defaultConsentOptions.mode ? defaultPrefetch : undefined);

	return {
		providers: [provideC15t({ ...merged, prefetch } as C15tProviderOptions)],
	};
};

export type { ConsentRecord };
