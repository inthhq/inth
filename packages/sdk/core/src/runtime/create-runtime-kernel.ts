/**
 * How a runtime turns its options into a consent kernel.
 *
 * Construction only: no DOM, no storage, no network. A server builds the
 * same kernel a browser runtime would and serializes its snapshot, so every
 * rule here (vendor merging, inferred categories, the disabled policy, the
 * experiment seed) applies identically on both sides.
 */
import { deepMergeTranslations } from '@inth/sdk-translations';
import type { I18nConfig } from '@inth/sdk-translations';

import type {
	KernelConfig,
	KernelTranslations,
	KernelTransport,
	KernelUser,
	ResolvedVendor,
	TranslationsResponse,
} from '../consent-kernel.model';
import type { AllConsentNames } from '../consent/consent-types';
import { createKernel } from '../kernel';
import type { InternalKernel } from '../kernel/kernel-internals.model';
import { hostExperiment, seedExperiment } from '../libs/experiment';
import { extractConsentNamesFromCondition } from '../libs/has';
import { warnInDevelopment } from '../libs/is-production';
import { resolveVendors } from '../libs/vendors';
import type { User } from '../options/user-options.model';
import { disabledPolicyResolution } from '../policy';
import {
	defaultTranslationConfig,
	resolveLocalTranslations,
} from '../translations';
import type {
	ProviderTransportContext,
	ProviderTransportFactory,
} from '../transports/mode';
import type { ConsentRuntimeOptions } from './consent-runtime.model';
import { isIABConfigured } from './is-iab-configured';

const DEFAULT_TRANSLATIONS: KernelTranslations = {
	language: 'en',
	translations: defaultTranslationConfig.translations.en as never,
};

/**
 * Normalizes the two accepted subject shapes into the kernel's `KernelUser`.
 *
 * v2 callers pass `{ id, identityProvider }`; v3 callers pass
 * `{ externalId, identityProvider }`.
 *
 * @returns The kernel-shaped user, or `undefined` when none was supplied.
 */
export const normalizeKernelUser = function normalizeKernelUser(
	user: User | KernelUser | undefined
): KernelUser | undefined {
	if (!user) {
		return undefined;
	}
	if ('externalId' in user) {
		return user;
	}
	const legacy = user as User;
	return {
		externalId: legacy.id,
		identityProvider: legacy.identityProvider,
	};
};

/**
 * Resolves `i18n` into the kernel's initial translations.
 *
 * The selected locale's bundled translations are the base; the caller's
 * `messages` for that locale are merged over them, so a partial override
 * keeps every default it did not mention. A locale on its own selects the
 * bundled translations for that locale — `i18n` is documented as locale
 * *and* message overrides, and a caller who names a locale means it.
 *
 * @param i18n - Locale and message overrides, if any.
 * @returns Kernel translations, or `undefined` when `i18n` says nothing.
 */
const resolveRuntimeTranslations = function resolveRuntimeTranslations(
	i18n: Partial<I18nConfig> | undefined
): KernelTranslations | undefined {
	if (!(i18n?.messages || i18n?.locale)) {
		return undefined;
	}
	const language =
		i18n.locale ?? defaultTranslationConfig.defaultLanguage ?? 'en';
	const fallbackTranslations = defaultTranslationConfig.translations
		.en as TranslationsResponse;
	const base = (defaultTranslationConfig.translations[
		language as keyof typeof defaultTranslationConfig.translations
	] ?? fallbackTranslations) as TranslationsResponse;
	if (!i18n.messages) {
		return { language, translations: base };
	}
	const selected =
		i18n.messages[language] ?? i18n.messages.en ?? fallbackTranslations;
	return {
		language,
		translations: deepMergeTranslations(
			base as never,
			selected as never
		) as TranslationsResponse,
	};
};

/**
 * Whether a prefetch already carries a server-resolved policy.
 *
 * A resolved prefetch is what `/v1/consent/init` would have returned: the policy, the
 * decision that produced it, and no provisional marker. The kernel is
 * built from it, so calling `init()` again on `start()` would re-fetch the
 * same answer and cost every SSR page one request. Frameworks that render
 * with a prefetch (SvelteKit `loadConsent`, the Astro middleware, Nuxt)
 * therefore skip the initial call; `reinit()`, a language or override
 * change, and any app without a prefetch still go to the backend.
 *
 * @param prefetch - The runtime's `prefetch` option, if any.
 * @returns `true` when init would be redundant.
 */
export const hasResolvedPrefetch = function hasResolvedPrefetch(
	prefetch: KernelConfig | undefined
): boolean {
	return Boolean(
		prefetch?.initialPolicyResolution && prefetch.initialPolicyPending !== true
	);
};

// Typed here so core needs no Node types; see `libs/is-production.ts`.
declare const process: { env: { NODE_ENV?: string } };

/**
 * The API the app passed its options to, named from the runtime's `pkg`:
 * the component or function a developer would look for in their code.
 */
const runtimeOwner = function runtimeOwner(pkg: string): string {
	if (pkg === '@inth/sdk/engine') {
		return 'createConsentRuntime()';
	}
	if (pkg.startsWith('@inth/sdk')) {
		return 'init()';
	}
	if (pkg === '@inth/vue') {
		return 'the inth plugin';
	}
	return 'InthProvider';
};

/**
 * The transport factory the runtime's options select: `mode` when it is a
 * factory or a `testing()` value, else the hosted backend at `projectUrl`.
 *
 * @param hostedMode - Builds the factory for `projectUrl`.
 * @returns The factory, or `undefined` when the options select none.
 * @internal
 */
const selectTransportFactory = function selectTransportFactory(
	options: Pick<ConsentRuntimeOptions, 'projectUrl' | 'mode'>,
	hostedMode?: (projectUrl: string) => ProviderTransportFactory
): ProviderTransportFactory | undefined {
	const { mode } = options;
	if (typeof mode === 'function') {
		return mode;
	}
	// A `testing()` value carries its transport, not enumerable. One that
	// crossed a serialization boundary is data only; the browser side
	// builds its transport.
	if (mode && 'transport' in mode && mode.transport) {
		return mode.transport;
	}
	if (options.projectUrl !== undefined && hostedMode) {
		return hostedMode(options.projectUrl);
	}
	return undefined;
};

/**
 * The error for a runtime with no backend, naming the package and, outside
 * production, the API that got no backend. `process.env.NODE_ENV` is read
 * inline, so bundlers drop the API names from production builds.
 */
const missingBackendError = function missingBackendError(
	pkg: string | undefined
): Error {
	let caller = pkg ?? '@inth/sdk/engine';
	let hint = '';
	try {
		if (process.env.NODE_ENV !== 'production') {
			caller = `${caller} ${runtimeOwner(caller)}`;
			hint =
				' Set it to your Inth project URL, or use `mode: testing()` from a /testing entry in tests.';
		}
	} catch {
		// No bundler and no `process`: the package name has to do.
	}
	return new Error(`${caller}: \`projectUrl\` is required.${hint}`);
};

/**
 * The runtime's transport factory, or an error naming the package and the
 * API that got no backend.
 *
 * A runtime created with `enabled: false` needs no backend while it stays
 * disabled: it gets a transport whose init rejects with the same error,
 * which only runs if the runtime is enabled later.
 *
 * @internal
 */
export const requireTransportFactory = function requireTransportFactory(
	options: Pick<
		ConsentRuntimeOptions,
		'projectUrl' | 'enabled' | 'mode' | 'pkg'
	>,
	hostedMode?: (projectUrl: string) => ProviderTransportFactory
): ProviderTransportFactory {
	const factory = selectTransportFactory(options, hostedMode);
	if (factory) {
		return factory;
	}
	const error = missingBackendError(options.pkg);
	if (options.enabled === false) {
		return Object.assign(
			(): KernelTransport => ({
				init: () => Promise.reject(error),
			}),
			{ kind: 'hosted' as const }
		);
	}
	throw error;
};

/**
 * Categories a site declares through what it runs: its gated scripts, its
 * network blocker rules and its declared vendors.
 *
 * The runtime registers these with its kernel. A server that builds its own
 * kernel for the same page passes the same result as
 * `inferredConsentCategories`, so it asks about the same categories as the
 * browser and judges a returning visitor's stored choice the same way.
 *
 * @param options - The scripts and network blocker the page declares.
 * @param vendors - Vendors the page declares, from code or a prefetch.
 * @returns Every category those declarations name, possibly repeated.
 */
export const inferConsentCategories = function inferConsentCategories(
	options: Pick<ConsentRuntimeOptions, 'networkBlocker' | 'scripts'>,
	vendors: readonly Pick<ResolvedVendor, 'category'>[] = []
): AllConsentNames[] {
	return [
		...(options.scripts ?? []),
		...(options.networkBlocker ? (options.networkBlocker.rules ?? []) : []),
		...vendors,
	].flatMap((declaration) =>
		extractConsentNamesFromCondition(declaration.category)
	);
};

/**
 * Builds the runtime's kernel without touching the DOM.
 *
 * Exported so servers can construct the same kernel a browser runtime
 * would and serialize its snapshot.
 *
 * @param wrapTransport - Wraps the transport `mode` builds before the kernel
 *   gets it. The browser runtime adds its consent journey this way.
 * @param mode - The transport factory. Defaults to the one the options
 *   select without a hosted builder: a factory or `testing()` in `mode`.
 * @returns A fresh, unstarted consent kernel.
 * @throws {Error} When the options select no transport factory.
 */
// oxlint-disable-next-line complexity -- Preserve established branch order and control flow.
export const createRuntimeKernel = function createRuntimeKernel(
	options: ConsentRuntimeOptions,
	wrapTransport?: (transport: KernelTransport) => KernelTransport,
	mode: ProviderTransportFactory = requireTransportFactory(options)
): InternalKernel {
	const enabled = options.enabled ?? true;
	// The server's experiment and journey are runtime inputs, not kernel
	// configuration.
	const {
		experiment: serverExperiment,
		journey: _serverJourney,
		...prefetch
	} = options.prefetch ?? {};
	const i18nTranslations =
		resolveRuntimeTranslations(options.i18n) ?? DEFAULT_TRANSLATIONS;

	const transportContext: ProviderTransportContext = {
		consentCategories: options.consentCategories,
		// The same test `start()` uses to mount GPP.
		gppEnabled:
			enabled &&
			!options.consentSource &&
			Boolean(options.gpp) &&
			options.loadGPP !== undefined,
		iabEnabled: isIABConfigured(options.iab),
		prefetch,
		translations: i18nTranslations,
		translationsFor: (language) =>
			resolveLocalTranslations(language, options.i18n?.messages),
	};
	const built = mode(transportContext);
	const transport = wrapTransport ? wrapTransport(built) : built;

	const integrations = [
		...(options.scripts ?? []),
		...(options.networkBlocker ? (options.networkBlocker.rules ?? []) : []),
	];
	// Backend vendors a server prefetch already resolved are kept: a resolved
	// prefetch skips the initial `init()`, so nothing would merge them later.
	const declaredVendors = resolveVendors({
		config: options.vendors,
		existing: prefetch.initialVendors?.declared,
		onWarn: warnInDevelopment,
		owners: integrations,
	});
	const vendorListVersion = prefetch.initialVendors?.listVersion ?? null;
	// A prefetched or host-resolved arm is known before any render, so the
	// server snapshot and the first paint already use it. Built-in
	// assignment holds the prompt until the browser has picked the arm.
	const experimentSeed = enabled
		? seedExperiment(
				hostExperiment(options.experiment, { experiment: serverExperiment }),
				prefetch.initialExperiment,
				hasResolvedPrefetch(options.prefetch)
			)
		: {};

	return createKernel({
		...prefetch,
		consentCategories: options.consentCategories,
		// Every declared vendor, from code or a resolved prefetch, makes its
		// category selectable at construction, so the server snapshot and the
		// hydrated one evaluate the same scope.
		inferredConsentCategories: inferConsentCategories(options, declaredVendors),
		initialExperiment: experimentSeed.initialExperiment,
		initialExperimentPending: experimentSeed.initialExperimentPending,
		initialExternalPermissions:
			enabled && options.consentSource ? {} : undefined,
		initialIab:
			prefetch.initialIab?.gvlReference &&
			options.iab &&
			options.iab.vendors?.length
				? {
						...prefetch.initialIab,
						gvlReference: {
							...prefetch.initialIab.gvlReference,
							summary: undefined,
						},
					}
				: prefetch.initialIab,
		initialOverrides: {
			...(prefetch.initialOverrides ?? {}),
			...(options.overrides ?? {}),
		},
		initialPolicyPending: options.consentSource
			? false
			: (prefetch.initialPolicyPending ??
				(enabled && !prefetch.initialPolicyResolution)),
		initialPolicyResolution: enabled
			? prefetch.initialPolicyResolution
			: disabledPolicyResolution(),
		// A disabled runtime grants everything, so stored records, including a
		// vendor denial list, must not narrow what loads.
		initialRecords:
			enabled && !options.consentSource ? prefetch.initialRecords : undefined,
		initialTranslations: prefetch.initialTranslations ?? i18nTranslations,
		initialUser: normalizeKernelUser(options.user) ?? prefetch.initialUser,
		initialVendors:
			declaredVendors.length > 0 || vendorListVersion !== null
				? { declared: declaredVendors, listVersion: vendorListVersion }
				: undefined,
		// An empty shell has no expiring records to evaluate. A stable seed
		// avoids reading the clock during a static prerender; init takes the
		// real clock after mount. Prepared records retain their clock.
		now:
			prefetch.now ??
			prefetch.initialRecords?.now ??
			(prefetch.initialRecords ? undefined : 0),
		// A backend, manifest or prefetch supplies the base copy; the app's
		// own messages for the active language win key by key.
		translationOverrides: options.i18n?.messages,
		transport,
	});
};
