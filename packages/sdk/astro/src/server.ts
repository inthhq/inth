import {
	seedExperiment,
	applyTranslationOverrides,
	createConsentKernel,
	defaultTranslationConfig,
} from '@inth/sdk/engine';
import type {
	ConsentSnapshot,
	KernelConfig,
	KernelTranslations,
	TranslationOverrides,
	TranslationsResponse,
} from '@inth/sdk/engine';
/**
 * Server helpers for `@inth/astro`.
 *
 * These run inside the Astro middleware and the injected API routes. They
 * read the incoming request, resolve the consent decision for it through
 * `resolveRequestConsent` from `@inth/sdk/server` (shared with every other
 * adapter), and produce the `KernelConfig` the page inlines so the browser
 * boots without a `/v1/consent/init` roundtrip. Translations, the offline vendor
 * list, the snapshot and the banner flags stay Astro's own.
 */
import {
	STORED_NAMES_CHECK,
	storedChoiceNames,
} from '@inth/sdk/modules/persistence';
import { inferConsentCategories, isIABConfigured } from '@inth/sdk/runtime';
import type {
	ConsentRequestHeaderInputs,
	GlobalVendorList,
} from '@inth/sdk/schema/types';
import {
	DEFAULT_RESOLVE_TIMEOUT_MS,
	fetchServerGvl,
	keepAlive,
	readRequestConsent,
	resolveRenderBudgetMs,
	resolveRequestConsent,
	resolveServerMode,
	withResolutionBudget,
} from '@inth/sdk/server';
import type {
	ManifestFetch,
	ResolveRequestConsentOptions,
} from '@inth/sdk/server';
import { hasConsentUI } from '@inth/sdk/surface-actions';
import { baseTranslations } from '@inth/sdk/translations/all';
import { generateThemeCSS } from '@inth/sdk/ui/theme';
import type { Theme } from '@inth/sdk/ui/theme';

import type { InthLocals, InthResolvedOptions } from './inth-options.model';
import { assertIABAvailable } from './libs/iab-unavailable.model';

/** Input for {@link resolveConsentContext}. */
export interface ResolveConsentContextOptions {
	headers: Headers;
	/**
	 * The absolute request URL. Used to resolve a relative `projectUrl` or
	 * `manifestUrl` against this request's own origin and protocol; without
	 * it the shared resolver assumes `https`.
	 */
	url?: string;
	/** The integration options, already normalized. */
	options: InthResolvedOptions;
	/**
	 * This request's experiment arm, resolved by the middleware's
	 * `experimentArm`. Overrides a static `experiment.arm`.
	 */
	experimentArm?: string;
	/** Override fetch, mainly for tests. */
	fetch?: typeof globalThis.fetch;
	/**
	 * Render once for every visitor, as a prerendered route does.
	 *
	 * `headers` is ignored, and the config carries no stored consent, clock
	 * or privacy signal: those belong to whoever is building the site, and
	 * the browser would otherwise prefer them over the visitor's own cookie.
	 * Offline mode still resolves its policy, because it resolves without
	 * request inputs in the browser too. Hosted and manifest mode are left
	 * pending for the browser to resolve.
	 */
	prerendered?: boolean;
	/**
	 * Receives the promise of a background manifest revalidation started by
	 * this render, so the host can keep it alive past the response on
	 * runtimes that stop detached work once a response is sent. The
	 * middleware passes the adapter's `waitUntil` from `locals.cfContext`
	 * (Astro 6 and later) or `locals.runtime.ctx` (Astro 5)
	 * when there is one. The promise never rejects.
	 *
	 * It also receives a manifest request the render stopped waiting for
	 * when {@link ResolveConsentContextOptions.timeoutMs} ran out.
	 */
	onBackgroundRevalidate?: (revalidation: Promise<void>) => void;
	/**
	 * Longest to wait for the backend, in milliseconds. Overrides
	 * `middleware.timeoutMs` from the integration options. `false` (or
	 * `Infinity`) waits however long the backend takes; any other value that
	 * is not a finite, non-negative number uses the default.
	 *
	 * When it runs out, the result is what a failed request gives: no
	 * server decision, `hasPolicy: false`, and the browser resolves the
	 * policy on boot.
	 *
	 * @default 500
	 */
	timeoutMs?: number | false;
}

/**
 * How long a server render waits for the visitor's policy unless
 * `middleware.timeoutMs` says otherwise: core's default.
 */
export { DEFAULT_RESOLVE_TIMEOUT_MS };

/**
 * The integration's `i18n.messages`, typed as overrides. The option is
 * serializable and typed loosely; the shape is the same.
 */
const readTranslationOverrides = function readTranslationOverrides(
	options: InthResolvedOptions
): TranslationOverrides | undefined {
	return options.i18n?.messages as TranslationOverrides | undefined;
};

/**
 * Resolve the language the surfaces should render in.
 *
 * @param inputs - Request inputs from the geo/language headers.
 * @returns The kernel translations for this request.
 */
export const resolveTranslations = function resolveTranslations(
	options: InthResolvedOptions,
	inputs: ConsentRequestHeaderInputs
): KernelTranslations {
	const detect = options.i18n?.detectLanguage !== false;
	const language =
		options.i18n?.locale ??
		(detect ? inputs.language : undefined) ??
		defaultTranslationConfig.defaultLanguage ??
		'en';
	// The server can afford the whole catalogue; only the one negotiated
	// bundle is inlined into the page, so the client pays for one language.
	const catalogue = baseTranslations as unknown as Record<
		string,
		TranslationsResponse
	>;
	// A regional locale such as `de-AT` uses its primary language's bundle,
	// the same fallback the app's messages get.
	const primary = language.split('-')[0]?.toLowerCase();
	const base =
		(Object.hasOwn(catalogue, language) ? catalogue[language] : undefined) ??
		(primary && Object.hasOwn(catalogue, primary)
			? catalogue[primary]
			: undefined) ??
		(defaultTranslationConfig.translations.en as TranslationsResponse);
	return applyTranslationOverrides(
		{ language, translations: base },
		readTranslationOverrides(options)
	);
};

/**
 * How the configured mode resolves through `resolveRequestConsent`, by the
 * rule `resolveServerMode` applies in every adapter. A relative URL
 * resolves against the request URL only, never a forwarded header: the
 * adapter builds `Request.url` from the deployment's own proxy
 * configuration. `testing()` resolves with this request's copy.
 */
const modeOptions = function modeOptions(
	options: InthResolvedOptions,
	translations: KernelTranslations
): Partial<ResolveRequestConsentOptions> {
	const { consent } = resolveServerMode({
		adapter: '@inth/astro',
		iab: isIABConfigured(options.iab),
		mode: options.mode,
		projectUrl: options.projectUrl,
		routePrefix: options.routePrefix,
	});
	return consent.offline
		? { ...consent, offline: { ...consent.offline, translations } }
		: consent;
};

/**
 * Fold a vendor list into the config when the prefetch did not supply one.
 *
 * Hosted and manifest mode get theirs from `/v1/consent/init`. Offline mode has no
 * backend to ask, so a site that wants a server-rendered IAB banner points
 * `iab.gvl` at a list or `iab.gvlUrl` at where one lives — the second goes
 * through the shared in-process cache, so a page render is not a download.
 *
 * A failed fetch is not fatal: the page falls back to the non-IAB banner
 * and the browser retries on boot.
 *
 * @param input - The prefetched config plus the integration options.
 * @returns The config, with `initialIab` populated when a list resolved.
 */
const withResolvedGvl = async function withResolvedGvl(input: {
	config: KernelConfig;
	options: InthResolvedOptions;
	language: string;
	fetch?: typeof globalThis.fetch;
}): Promise<KernelConfig> {
	const { iab } = input.options;
	if (!(isIABConfigured(iab) && iab)) {
		return input.config;
	}
	if (input.config.initialIab?.gvl || input.config.initialIab?.gvlReference) {
		return input.config;
	}

	let gvl: GlobalVendorList | null = iab.gvl ?? null;
	if (!gvl && iab.gvlUrl) {
		try {
			gvl = await fetchServerGvl({
				fetch: input.fetch as ManifestFetch | undefined,
				language: input.language,
				url: iab.gvlUrl,
			});
		} catch {
			gvl = null;
		}
	}
	if (!gvl) {
		return input.config;
	}

	return {
		...input.config,
		initialIab: {
			...(input.config.initialIab ?? {}),
			cmpId: input.config.initialIab?.cmpId ?? iab.cmpId ?? null,
			enabled: true,
			gvl,
		},
	};
};

/**
 * Derive the kernel snapshot the server would hand a freshly booted page.
 *
 * Kernel construction is pure — no DOM, no network, no storage — so this is
 * safe to run per request.
 *
 * @returns The snapshot, including derived `activeUI` and policy UI hints.
 */
export const snapshotFromConfig = function snapshotFromConfig(
	config: KernelConfig
): ConsentSnapshot {
	const kernel = createConsentKernel(config);
	const snapshot = kernel.getServerSnapshot();
	kernel.dispose();
	return snapshot;
};

/**
 * The experiment this request runs. The arm is known on the server, so the
 * inlined config and the first HTML already carry it. The banner is
 * server-rendered, so without an arm for this request no experiment runs
 * rather than holding the prompt. A prerendered page runs none.
 */
const resolveExperiment = function resolveExperiment(
	input: ResolveConsentContextOptions,
	prerendered: boolean
) {
	const { experiment: configured } = input.options;
	const arm = prerendered
		? undefined
		: (input.experimentArm ?? configured?.arm);
	const experiment =
		configured && arm !== undefined ? { ...configured, arm } : undefined;
	return {
		experiment,
		seeded: experiment
			? seedExperiment(experiment).initialExperiment
			: undefined,
	};
};

/**
 * Resolve everything the page needs about consent for one request.
 *
 * Reads the consent cookie and the geo/GPC headers, prefetches the policy
 * decision through the configured mode, and derives whether the banner
 * should render server-side.
 *
 * @param input - Request headers and integration options.
 * @returns The value the middleware stores on `Astro.locals.inth`.
 * @example
 * ```ts
 * const Inth = await resolveConsentContext({ headers: request.headers, options });
 * ```
 */
export const resolveConsentContext = async function resolveConsentContext(
	input: ResolveConsentContextOptions
): Promise<InthLocals> {
	const { options } = input;
	const prerendered = input.prerendered === true;
	const startedAt = Date.now();
	const timeoutMs =
		input.timeoutMs ??
		options.middleware?.timeoutMs ??
		DEFAULT_RESOLVE_TIMEOUT_MS;
	const facts = {
		adapter: '@inth/astro',
		// An explicit `i18n.locale` outranks Accept-Language negotiation.
		overrides: { language: options.i18n?.locale },
		request: { headers: input.headers, url: input.url },
		// A prerendered page is one HTML file for every visitor.
		shared: prerendered,
		storage: options.storageConfig,
	} satisfies ResolveRequestConsentOptions;
	const { inputs } = readRequestConsent(facts);
	const translations = resolveTranslations(options, inputs);
	const { experiment, seeded } = resolveExperiment(input, prerendered);

	const { experiment: _carried, ...resolved } = await resolveRequestConsent({
		...facts,
		...modeOptions(options, translations),
		experiment: seeded ? experiment : undefined,
		fetch: input.fetch,
		request: { ...facts.request, inputs },
		seed: {
			initialPolicyPending: true,
			initialTranslations: translations,
			...(seeded && { initialExperiment: seeded }),
		},
		timeoutMs,
		waitUntil: input.onBackgroundRevalidate,
	});
	let config: KernelConfig = resolved;

	// One deadline for the whole resolution, so a slow policy request and a
	// slow vendor list cannot each spend a full budget.
	const totalMs = resolveRenderBudgetMs(timeoutMs);
	const budgetMs =
		totalMs === undefined
			? undefined
			: Math.max(0, totalMs - (Date.now() - startedAt));
	const withGvl = withResolvedGvl({
		config,
		fetch: input.fetch,
		language: translations.language.split('-')[0] || 'en',
		options,
	});
	try {
		config = await withResolutionBudget(withGvl, budgetMs);
	} catch {
		// The list keeps filling the cache for the next render.
		keepAlive(input.onBackgroundRevalidate, withGvl);
	}

	config.initialPolicyPending = config.initialPolicyResolution === undefined;
	// Hosted and manifest mode replace the copy with the backend's. It is the
	// base for that language; the app's own messages still win key by key.
	if (config.initialTranslations) {
		config.initialTranslations = applyTranslationOverrides(
			config.initialTranslations,
			readTranslationOverrides(options)
		);
	}
	// Judge the visitor against the categories the browser runtime will ask
	// about. The page's config leaves them out: the runtime derives them from
	// the same options.
	const snapshot = snapshotFromConfig({
		...config,
		consentCategories: options.consentCategories,
		// Code-declared vendors make their categories selectable in the
		// browser runtime, so the server asks about them too.
		inferredConsentCategories: inferConsentCategories(options, [
			...(options.vendors ?? []),
			...(config.initialVendors?.declared ?? []),
		]),
	});
	assertIABAvailable(snapshot, options.iab);
	return {
		// A prerendered config carries no stored records, clock or privacy
		// signal: any `initialRecords` at all stop the browser reading the
		// visitor's cookie, and a build-time `now` would age every record.
		// The snapshot is the one a first-time visitor gets.
		config,
		decision: snapshot.resolution,
		hasConsentUi: hasConsentUI(snapshot),
		hasPolicy: snapshot.resolution.status === 'matched',
		inputs,
		options,
		prerendered,
		shouldShowBanner: !snapshot.policyPending && snapshot.activeUI === 'banner',
		snapshot,
	};
};

/**
 * Build the boot payload as JSON for a data block.
 *
 * The components render it as
 * `<script type="application/json" data-inth-config>`, which the browser
 * never runs. A Content Security Policy does not govern a data block, so a
 * policy that allows inline scripts only by hash or nonce still lets the
 * payload through, even though it changes per visitor.
 *
 * @returns JSON safe to place inside a `<script>` element.
 * @example
 * ```astro
 * <script
 *   is:inline
 *   type="application/json"
 *   data-inth-config
 *   set:html={buildConfigJSON(Astro.locals.inth.config)}
 * />
 * ```
 */
export const buildConfigJSON = function buildConfigJSON(
	config: KernelConfig
): string {
	// `<` is escaped so a translation string can never close the script tag.
	return JSON.stringify(config ?? {}).replace(/</gu, '\\u003c');
};

/**
 * Build the inline `<script>` body that hands the browser its boot payload.
 *
 * The payload is the already-resolved `KernelConfig`, not a fetch: the
 * browser starts with the same decision the server rendered, so there is no
 * network init per page and no banner flicker.
 *
 * The components use {@link buildConfigJSON} instead. This form runs, so a
 * Content Security Policy has to allow it; it changes per visitor, so only
 * a nonce or `'unsafe-inline'` can. Put the nonce on the script: the
 * browser runtime reads it from there for the scripts and stylesheets it
 * adds.
 *
 * @returns JavaScript safe for inline `<script>` injection.
 */
export const buildConfigScript = function buildConfigScript(
	config: KernelConfig
): string {
	return `window.__inthAstroConfig=${buildConfigJSON(config)};`;
};

/**
 * Build the theme stylesheet for the configured theme tokens.
 *
 * The banner is server-rendered and the dialog islands no longer generate
 * theme CSS in the browser, so the server writes the `--inth-*` variables
 * once, next to the config script. Dark tokens follow the `inth-dark`
 * class the colour-scheme script sets.
 *
 * @returns CSS for a `<style>` element, or an empty string without a theme.
 * @example
 * ```astro
 * <style is:inline id="inth-theme" set:html={buildThemeCSS(theme)} />
 * ```
 */
export const buildThemeCSS = function buildThemeCSS(
	theme: Theme | undefined
): string {
	return theme ? generateThemeCSS(theme) : '';
};

/**
 * Build the first-paint colour-scheme script: `inth-dark` for `'dark'`, or
 * from `prefers-color-scheme` for `'system'`. `'light'` and `'none'` need
 * none.
 *
 * @example
 * ```astro
 * <script is:inline set:html={buildColorSchemeScript('system')} />
 * ```
 */
export { buildColorSchemeScript } from '@inth/sdk/ui/utils/color-scheme';

/**
 * Build the script that shows a prerendered banner at first paint.
 *
 * A prerendered banner ships hidden, because the same HTML serves visitors
 * who have already chosen. The runtime shows it once it has read the
 * visitor's records, but that waits for the page's module scripts. This
 * runs inline right after the banner: a visitor with nothing stored under
 * any consent key cannot have chosen, so it shows the banner straight away.
 * Anyone with a stored record keeps waiting for the runtime, which
 * validates it.
 *
 * @param testId - The banner's `data-testid` prefix.
 * @returns JavaScript safe for inline `<script>` injection.
 * @example
 * ```astro
 * <script is:inline set:html={buildBannerRevealScript(undefined, 'consent-banner')} />
 * ```
 */
export const buildBannerRevealScript = function buildBannerRevealScript(
	storageConfig: InthResolvedOptions['storageConfig'],
	testId: 'consent-banner' | 'iab-consent-banner'
): string {
	const stored = storedChoiceNames(storageConfig);
	// `<` is escaped so a storage key can never close the script tag.
	const json = JSON.stringify([...stored.choice, ...stored.notice]).replace(
		/</gu,
		'\\u003c'
	);
	// An IIFE keeps its variables out of the page's global scope, and any
	// throw is swallowed so it cannot abort the rest of the document.
	return `(function(){try{if((${STORED_NAMES_CHECK})(${json}))return;var root=document.querySelector('[data-testid="${testId}-root"][hidden]'),overlay=document.querySelector('[data-testid="${testId}-overlay"][hidden]');if(root){root.hidden=false;root.setAttribute('data-inth-visible','true');if(overlay)overlay.hidden=false}}catch(e){}})();`;
};

export { buildPrefetchScript } from '@inth/sdk/engine';
export { resolveBrandingModel } from './banner/branding.model';
export type {
	BrandingModel,
	BrandingModelInput,
} from './banner/branding.model';
export {
	iabPromptClassNames,
	joinClasses,
} from './banner/banner-class-names.model';
export type {
	ClassNameMap,
	IABPromptClassNames,
} from './banner/banner-class-names.model';
export { resolveIABPromptModel } from './banner/iab-prompt.model';
export type {
	IABAction,
	IABPromptButton,
	IABPromptModel,
	IABPromptModelInput,
	IABPromptProps,
} from './banner/iab-prompt.model';
export {
	buildConsentBootJSON,
	buildLocalsBootJSON,
	canDeferEngine,
} from './banner/deferred-boot.model';
// The inline script that records prompt taps before the page script runs,
// for a prompt whose engine loads after the page.
export { EARLY_CONSENT_TAP_SCRIPT } from '@inth/sdk/surface-actions';
export {
	IAB_PROMPT_SLOT_ATTRIBUTE,
	PROMPT_SLOT_ATTRIBUTE,
} from './banner/prompt-slot.model';
export type { KernelConfig } from '@inth/sdk/engine';

/**
 * The per-request identity the emission guard keys off — in practice
 * `Astro.locals`, which Astro creates fresh for every request.
 */
export interface ConfigEmissionScope {
	inth?: InthLocals;
}

const emitted = new WeakSet<ConfigEmissionScope>();
const stylesEmitted = new WeakSet<ConfigEmissionScope>();

/**
 * Claim the one-per-request emission of the base and configured IAB styles.
 *
 * @param locals - The current `Astro.locals`, used as the request identity.
 * @returns `true` for the first style emission on this request.
 * @internal
 */
export const markStylesEmitted = function markStylesEmitted(
	locals: ConfigEmissionScope
): boolean {
	if (stylesEmitted.has(locals)) {
		return false;
	}
	stylesEmitted.add(locals);
	return true;
};

/**
 * Claim the one-per-request emission of the inline config script.
 *
 * `<ConsentScript />` and `<ConsentBanner />` both want to inline the boot
 * payload, and a page may well contain both. The first caller for a given
 * request wins; every later caller renders nothing.
 *
 * @param locals - The current `Astro.locals`, used as the request identity.
 * @returns `true` for the first caller of this request.
 */
export const markConfigEmitted = function markConfigEmitted(
	locals: ConfigEmissionScope
): boolean {
	if (emitted.has(locals)) {
		return false;
	}
	emitted.add(locals);
	return true;
};

// The consent prompt: its model, its markup and its first-paint sheets.
export { promptClassNames } from './prompt/prompt-class-names';
export type { PromptClassNames } from './prompt/prompt-class-names';
export {
	promptContainerType,
	resolvePromptPresentation,
} from './prompt/prompt-presentation.model';
export type { PromptContainerType } from './prompt/prompt-presentation.model';
export { privacyChoicesLinkIconSvg } from './parts/privacy-choices-link-icon.model';
export { resolvePromptModel } from './prompt/prompt.model';
export type {
	PromptModel,
	PromptModelInput,
	PromptProps,
} from './prompt/prompt.model';
export {
	promptFirstPaintSheets,
	renderPromptHTML,
} from './prompt/render-prompt-html';

// The first-paint rules the components inline (see `inline-styles.model.ts`).
export {
	INLINE_IAB_STYLES_CSS,
	INLINE_IAB_STYLES_ID,
	INLINE_PARTS_STYLES_CSS,
	INLINE_PARTS_STYLES_ID,
	INLINE_STYLES_CSS,
	INLINE_STYLES_ID,
} from './inline-styles.model';

// The handlers behind the injected route, for a site that sets
// `routePrefix: false` and mounts them itself. The browser does not call
// such a route for `/v1/consent/init`; see `createConsentRouteHandlers`. The manifest
// cache is in `@inth/sdk/server`, one process cache shared with the other
// framework adapters.
export {
	createConsentRouteHandlers,
	waitUntilFromLocals,
} from './api/create-consent-route-handlers';
export type {
	ConsentRouteHandlerOptions,
	RequestLifetime,
} from './api/create-consent-route-handlers';
