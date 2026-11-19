import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import type { App } from 'vue';
import { onUnmounted, provide } from 'vue';

// The hosted transport itself, with a fetch that answers from the fixtures.
import { hosted } from '../../../packages/sdk/core/src/transports/mode';
import { mockGVL } from '../../../packages/sdk/react/src/components/iab/__tests__/fixtures/mock-consent-state';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '../../../packages/sdk/schema/src/types';
import { enTranslations } from '../../../packages/sdk/translations/src';
import { consentConfigKey } from '../../../packages/sdk/vue/src/runtime/composables/config';
import type { ConsentConfig } from '../../../packages/sdk/vue/src/runtime/config';
import { createVueConsentKernelContext } from '../../../packages/sdk/vue/src/runtime/kernel';
import type { VueConsentKernelContext } from '../../../packages/sdk/vue/src/runtime/kernel';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../../../packages/sdk/vue/src/runtime/utils/symbols';
import {
	storybookChoiceRecord,
	storybookIABPolicy,
	storybookIABPresentation,
	storybookPolicy,
	storybookPresentation,
} from '../../storybook-consent-policy';

type StoryActiveUI = 'banner' | 'manager' | null;

export const storybookInit: InitOutput = {
	branding: 'inth',
	location: {
		countryCode: 'DE',
		regionCode: null,
	},
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: 'DE',
			regionCode: null,
			rules: [storybookPolicy],
		})
	),
	translations: {
		language: 'en',
		translations: enTranslations,
	},
};

/**
 * The IAB variant of {@link storybookInit}.
 *
 * Same policy shape with `model: 'iab'` and the vendor list the React and
 * Svelte IAB stories mount, so the three surfaces have identical data to
 * render and the parity gate compares content, not fixtures.
 */
export const storybookIABInit: InitOutput = {
	...storybookInit,
	cmpId: 160,
	gvl: mockGVL,
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: 'DE',
			iabEnabled: true,
			regionCode: null,
			rules: [storybookIABPolicy],
		})
	),
} as InitOutput;

/**
 * The backend's answer to a save: the subject ID it went out under, or a
 * UUID for a c15t `sub_` ID, which the backend replaces.
 */
export const storybookRecordAnswer = function storybookRecordAnswer(
	request?: RequestInit
): { recordId: string; subjectId: string } {
	const { subjectId = '' } = JSON.parse(String(request?.body ?? '{}')) as {
		subjectId?: string;
	};
	return {
		recordId: '0193e5a8-8a00-7d3a-9b1c-6e3f8a0b1c2d',
		subjectId: /^[\da-f]{8}-[\da-f]{4}-7/u.test(subjectId)
			? subjectId
			: '0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c',
	};
};

const storybookFetch = function storybookFetch(): typeof fetch {
	return ((input: RequestInfo | URL, request?: RequestInit) => {
		const { pathname } = new URL(String(input), 'http://storybook.test');
		if (pathname.endsWith('/v1/consent/init')) {
			return new Response(JSON.stringify(storybookInit), {
				headers: {
					'content-type': 'application/json',
				},
				status: 200,
			});
		}
		if (pathname.endsWith('/v1/consent/records')) {
			return new Response(JSON.stringify(storybookRecordAnswer(request)), {
				headers: {
					'content-type': 'application/json',
				},
				status: 200,
			});
		}
		return new Response('not found', { status: 404 });
	}) as typeof fetch;
};

export const storybookConsentConfig: ConsentConfig = {
	consentCategories: [
		'necessary',
		'functionality',
		'measurement',
		'experience',
		'marketing',
	],
	hideBranding: false,
	presentation: storybookPresentation,
	projectUrl: 'https://consent.example',

	// Animations left ON to match the React/Svelte storybooks (their fixtures
	// don't disable them) so the Vue stories showcase the real dialog +
	// accordion motion. The parity-runner freezes animations itself via
	// Playwright's `animations: 'disabled'`, so screenshots stay stable.
	// No global `trapFocus`: the default banner is non-blocking in every
	// adapter, and stories that need a blocking banner opt in themselves.
} as ConsentConfig;

/**
 * The stories' `hosted()` mode, answering from the story fixtures instead of
 * a backend.
 *
 * @param fetch - Answers the transport's requests.
 * @returns The mode a story's kernel context runs.
 */
export const storybookMode = (
	fetch: typeof globalThis.fetch = storybookFetch()
) =>
	hosted({
		fetch,
		projectUrl: 'https://consent.example',
		property: 'consent.example',
	});

export const provideStorybookConsentContext =
	function provideStorybookConsentContext(
		app: App | null,
		context: VueConsentKernelContext,
		config: ConsentConfig
	) {
		if (app) {
			app.provide(consentConfigKey, config);
			app.provide(symbolKernelContext, context);
			app.provide(symbolKernel, context.kernel);
			app.provide(symbolSnapshot, context.snapshot);
			app.provide(symbolInit, context.init);
			app.provide(symbolActiveUI, context.activeUI);
			app.provide(symbolConsent, context.storedConsent);
			return;
		}

		provide(consentConfigKey, config);
		provide(symbolKernelContext, context);
		provide(symbolKernel, context.kernel);
		provide(symbolSnapshot, context.snapshot);
		provide(symbolInit, context.init);
		provide(symbolActiveUI, context.activeUI);
		provide(symbolConsent, context.storedConsent);
	};

/**
 * The notice variant of {@link storybookInit}: an opt-out rule whose first
 * layer only informs, so the banner renders dismiss plus the rights links.
 */
const storybookNoticePolicy: PolicyRule = {
	...storybookPolicy,
	id: 'storybook-notice',
	model: 'opt-out',
	prompt: 'notice',
};

export const storybookNoticeInit: InitOutput = {
	...storybookInit,
	location: { countryCode: 'US', regionCode: 'CA' },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: 'US',
			regionCode: 'CA',
			rules: [storybookNoticePolicy],
		})
	),
};

export const useStorybookConsent = function useStorybookConsent(
	activeUI: StoryActiveUI,
	configOverrides?: Partial<ConsentConfig>,
	prefetch: InitOutput = storybookInit,
	storedConsent?: Record<string, boolean>
) {
	const config = configOverrides
		? ({ ...storybookConsentConfig, ...configOverrides } as ConsentConfig)
		: storybookConsentConfig;
	// The story never starts the runtime, so persistence is not read; a
	// stored choice goes in as initial records instead, the way a server
	// prefetch would carry it.
	const context = createVueConsentKernelContext({
		config,
		mode: storybookMode(),
		prefetch,
		producerContract: 1,
		...(storedConsent && {
			initialRecords: {
				choice: storybookChoiceRecord(storedConsent),
				now: Date.now(),
			},
		}),
	});
	context.activeUI.value = activeUI;
	provideStorybookConsentContext(null, context, config);
	onUnmounted(() => context.dispose());
	return context;
};

/**
 * Provide an IAB kernel context to a story.
 *
 * @param activeUI - Which surface to open: `'banner'` or `'manager'`.
 * @param configOverrides - Config fields to override for this story.
 * @returns The kernel context, disposed when the story unmounts.
 */
export const useStorybookIABConsent = function useStorybookIABConsent(
	activeUI: StoryActiveUI,
	configOverrides?: Partial<ConsentConfig>
) {
	const config: ConsentConfig = {
		...storybookConsentConfig,
		iab: { cmpId: 160, gvl: mockGVL },
		presentation: storybookIABPresentation,
		...configOverrides,
	};
	const context = createVueConsentKernelContext({
		config,
		mode: storybookMode(),
		prefetch: storybookIABInit,
	});
	context.activeUI.value = activeUI;
	provideStorybookConsentContext(null, context, config);
	onUnmounted(() => context.dispose());
	return context;
};
