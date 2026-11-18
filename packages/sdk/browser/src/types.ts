import type {
	AllConsentNames,
	Callbacks,
	ClearOnRevocationConfig,
	ConsentExperiment,
	ConsentPresentation,
	SaveResult,
	NoticeDismissResult,
	ConsentKernel,
	ConsentSnapshot,
	ConsentState,
	HasCondition,
	I18nConfig,
	KernelActiveUI,
	KernelConfig,
	KernelOverrides,
	KernelUser,
	LegalLinks,
	OnSurfaceShownPayload,
	PolicyRule,
	policyRulePresets,
	ProviderTransportFactory,
	ResolvedVendor,
	Script,
	StorageConfig,
	Unsubscribe,
	VendorChoice,
} from '@inth/sdk-core';
import type { HostedMode } from '@inth/sdk-core/modes';
import type {
	ConsentRuntime,
	ConsentRuntimeOptions,
	RuntimeNetworkBlockerOptions,
} from '@inth/sdk-core/runtime';
import type { ConsentTesting } from '@inth/sdk-core/testing';
import type { ConsentDialogTriggerVisibility } from '@inth/sdk-schema/config';
import type { ConsentManifest } from '@inth/sdk-schema/types';
import type { Theme } from '@inth/sdk-ui/theme';

/**
 * The transports a script-tag site can name without importing anything.
 * `init()` from `@inth/sdk` takes `hosted()` or a factory instead.
 *
 * - `hosted` — `GET /init` and `POST /subjects` against `projectUrl`.
 * - `manifest` — the backend's cacheable `/manifest` inlined or fetched,
 *   resolved locally so the banner can render without waiting on `/init`.
 *   Falls back to `/init` with a warning when the manifest is unavailable.
 *
 * Tests load `c15t.testing.js` instead, which resolves a policy with no
 * backend.
 */
export type ConsentModeName = 'hosted' | 'manifest';

/** A built-in policy pack, by the name `policyRulePresets` exports it under. */
export type PolicyPresetName = keyof typeof policyRulePresets;

/** Corner the floating preferences button docks to. */
export type TriggerPosition =
	| 'bottom-right'
	| 'bottom-left'
	| 'top-right'
	| 'top-left';

/** Copy and behaviour overrides for the cookie banner. */
export interface ConsentBannerOptions {
	/** Heading. Defaults to the resolved translation. */
	title?: string;
	/** Body copy. Defaults to the resolved translation. */
	description?: string;
	/** "Accept all" label. */
	acceptButtonText?: string;
	/** "Reject all" label. */
	rejectButtonText?: string;
	/** "Customize" label. */
	customizeButtonText?: string;
	/** Drop the "Secured by" tag. */
	hideBranding?: boolean;
	/** Which legal links to render inline. `null` renders none. */
	legalLinks?: (keyof LegalLinks)[] | null;
	/** Dim the page and stop it scrolling while the banner is up. */
	scrollLock?: boolean;
	/** Legacy blocking override. Prefer `presentation.prompt.blocking`. */
	trapFocus?: boolean;
	/** Skip the enter and exit transitions. Defaults to the UI option. */
	disableAnimation?: boolean;
}

/** Overrides for the preference centre dialog. */
export interface ConsentDialogOptions {
	/** Drop the "Secured by" tag. */
	hideBranding?: boolean;
	/** Which legal links to render inline. `null` renders none. */
	legalLinks?: (keyof LegalLinks)[] | null;
	/** Skip the enter and exit transitions. Defaults to the UI option. */
	disableAnimation?: boolean;
}

/** The floating button that reopens the preference centre. */
export interface ConsentTriggerOptions {
	/** Corner to dock to. Defaults to `bottom-right`. */
	position?: TriggerPosition;
	/** Button size. Defaults to `md`. */
	size?: 'sm' | 'md' | 'lg';
	/**
	 * When to show it, by the framework triggers' rule. `always` (default)
	 * whenever the dialog is closed, beside an open banner too;
	 * `after-consent` only once no prompt is owed (a choice saved or a
	 * notice dismissed); `never` not at all. It stays hidden while the
	 * policy leaves nothing to manage.
	 */
	showWhen?: ConsentDialogTriggerVisibility;
	/** Accessible name. Defaults to the `trigger.label` translation. */
	ariaLabel?: string;
	/** Remember a dragged-to corner in localStorage. Defaults to `true`. */
	persistPosition?: boolean;
}

/** How and where the prebuilt UI mounts. */
export interface ConsentUIOptions {
	/** Copy for browser-specific IAB loading, saving, and pagination states. */
	iab?: {
		loadErrorText?: string;
		saveErrorText?: string;
		moreVendorsText?: string;
	};
	/**
	 * Element (or selector) to append the UI host to. Defaults to
	 * `document.body`.
	 */
	container?: HTMLElement | string;
	/**
	 * Render inside a shadow root so the host page's CSS cannot restyle the
	 * banner and vice versa. Defaults to `true`; set `false` when you want
	 * to override the styles with your own stylesheet.
	 *
	 * In the shadow root, page CSS still reaches each part through
	 * `::part()`: every element `theme.slots` can name carries its slot key
	 * as a part, as in `[data-inth-ui]::part(consentBannerCard)`.
	 */
	shadow?: boolean;
	/**
	 * Colour scheme. `'system'` follows `prefers-color-scheme`. `null`
	 * leaves the scheme to the page: the UI is dark while `<html>` has a
	 * `dark` or `inth-dark` class, and follows it as it changes. The script
	 * tag reads `data-color-scheme`, with `none` for `null`.
	 *
	 * @default 'system'
	 */
	colorScheme?: 'light' | 'dark' | 'system' | null;
	/**
	 * Theme tokens, consent action styles and per-part `slots`, the
	 * `@inth/sdk/ui` theme shape `@inth/svelte` also accepts.
	 *
	 * A slot adds classes (a string, or `className`) and inline `style` to
	 * one part, keyed like `consentBannerCard` or `buttonPrimary`. The
	 * classes' rules must reach the part: with `shadow: false` the page's
	 * stylesheets do; in the shadow root, link them with `stylesheetUrls` or
	 * pass their text in `css`.
	 */
	theme?: Theme;
	/** Extra CSS appended after the bundled stylesheet. */
	css?: string;
	/**
	 * Stylesheets to link inside the UI root, after the bundled stylesheet,
	 * with the client's `nonce`. Use it to bring the rules behind
	 * `theme.slots` classes (a Tailwind build, a CSS Modules or
	 * vanilla-extract bundle) into the shadow root. They load
	 * asynchronously, so the first frame can render without them.
	 *
	 * Keep loading the same sheet in the page too: `@property` rules, which
	 * Tailwind 4 uses for utilities such as `border-4` and `shadow-lg`, only
	 * register at document level. Unlayered element rules in a linked sheet
	 * reach the UI as well, which is what the shadow root otherwise
	 * prevents.
	 *
	 * @example ['/assets/site.css']
	 */
	stylesheetUrls?: string[];
	/**
	 * Include the bundled stylesheet. Defaults to `true`. With `shadow: false`,
	 * set `false` when the page loads `@inth/sdk/styles.css`.
	 */
	styles?: boolean;
	/** Ship the DOM without any class names, for fully custom CSS. */
	noStyle?: boolean;
	/**
	 * Skip enter and exit transitions. Defaults to whether the visitor asks
	 * for reduced motion when the UI mounts. `banner` and `dialog` take the
	 * same option for one surface. The script tag reads
	 * `data-disable-animation`.
	 */
	disableAnimation?: boolean;
	/** Render the banner. Defaults to `true`. */
	banner?: boolean | ConsentBannerOptions;
	/** Render the preference centre. Defaults to `true`. */
	dialog?: boolean | ConsentDialogOptions;
	/** Render the floating reopen button. Defaults to `false`. */
	trigger?: boolean | ConsentTriggerOptions;
}

/**
 * What {@link ConsentClient.save} records: categories to grant or deny, and
 * optionally per-vendor grants keyed by vendor id.
 *
 * @example
 * ```ts
 * client.save({ measurement: true, vendors: { posthog: false } });
 * ```
 */
export type ConsentSaveInput = Partial<ConsentState> & {
	/**
	 * Per-vendor grants, keyed by the ids declared in `vendors`. `false`
	 * turns a vendor off inside a granted category. Vendors left out keep
	 * their recorded state. Ignored under an IAB policy.
	 */
	vendors?: Record<string, boolean>;
};

/**
 * Options every client accepts, whichever entry point picks its mode. See
 * {@link ConsentClientOptions} for `init()` from `@inth/sdk` and
 * {@link ScriptTagClientOptions} for the script-tag builds.
 */
export interface ConsentClientBaseOptions extends Pick<
	ConsentRuntimeOptions,
	'consentSource' | 'persistence' | 'scriptLoader' | 'vendors'
> {
	/**
	 * Content Security Policy nonce for the elements Inth adds to the page:
	 * the stock UI's `<style>` element and every `<script>` the `scripts`
	 * option loads. Set it when your CSP allows styles or scripts by nonce
	 * instead of `'unsafe-inline'`. A script's own `nonce` takes precedence.
	 *
	 * The script-tag build reads `data-nonce`, then the tag's own `nonce`, so
	 * `<script nonce="…" src=".../c15t.js">` needs nothing else.
	 *
	 * With a nonce set, inert `<script type="text/plain" data-inth-category>`
	 * tags run only when they carry the same nonce; others are skipped with
	 * a warning and marked `data-inth-activated="untrusted"`. Activation
	 * creates a new script, which a `'strict-dynamic'` policy runs without a
	 * nonce, so injected markup would otherwise run once consent is granted.
	 * The configured nonce is never copied onto an inert tag.
	 */
	nonce?: string;
	/** IAB configuration. Requires the `@inth/sdk/iab-client` entry. */
	iab?: ConsentRuntimeOptions['iab'];
	/**
	 * IAB GPP options for `c15t.gpp.js` on a script-tag page: an object sets
	 * `usApproach`, `usFallback`, `mspaMode`, `optOutCategories`, `cmpId`
	 * or `tcf`, and `false` keeps GPP off although the script loaded. In a
	 * bundled app, call `mountGPP()` from `@inth/sdk/gpp` instead.
	 */
	gpp?: ConsentRuntimeOptions['gpp'];
	/** Categories the UI offers. Defaults to every category the policy allows. */
	consentCategories?: AllConsentNames[];
	/** Third-party scripts to load once their category is granted. */
	scripts?: Script[];
	/** Browser data to remove when its consent category is denied. Initial-only. */
	clearOnRevocation?: ClearOnRevocationConfig;
	/**
	 * Load `@inth/integrations` scripts from the Inth script registry: each
	 * script the consent manifest lists loads from the registry's URL with an
	 * integrity hash the browser checks. Initial-only. Experimental: its name
	 * and behaviour can change in a minor release.
	 * @default false
	 */
	experimentalScriptRegistry?: boolean;
	/**
	 * Reload the page after an accept, reject or save turns off a category or
	 * vendor that was granted, or after a `consentSource` withdraws one.
	 * Removing a script cannot stop code that already ran, so the reload
	 * starts a document with only permitted code. Waits for the save request.
	 * Set `false` to handle revocation yourself.
	 * @default true
	 */
	reloadOnConsentRevoked?: boolean;
	/** Lifecycle callbacks. */
	callbacks?: Callbacks;
	/** Cookie and storage settings. */
	storageConfig?: StorageConfig;
	/** Known country, region, language or GPC signal. */
	overrides?: KernelOverrides;
	/**
	 * A server-resolved init answer. When it carries a policy and a
	 * decision the runtime renders from it and never calls `/init`.
	 */
	prefetch?: KernelConfig;
	/** Identified visitor. */
	user?: KernelUser;
	/** Locale and custom messages. */
	i18n?: Partial<I18nConfig>;
	/** Privacy policy, cookie policy and terms links. */
	legalLinks?: LegalLinks;
	/** Block network requests by URL until consent. */
	networkBlocker?: RuntimeNetworkBlockerOptions | false;
	/**
	 * Gate iframes by category. On by default. With
	 * `disableAutomaticBlocking`, frames are only checked when you call
	 * {@link ConsentClient.processIframes}.
	 */
	iframeBlocker?: ConsentRuntimeOptions['iframeBlocker'];
	/** `false` grants every category and mounts nothing. */
	enabled?: boolean;
	/** Host layout and behavior, resolved under the active policy constraints. */
	presentation?: ConsentPresentation;
	/**
	 * A/B experiment on prompt/preferences presentation. The assigned arm is
	 * merged over `presentation` (read it from `client.presentation`),
	 * exposed as `snapshot.experiment`, and recorded with every impression
	 * and choice.
	 */
	experiment?: ConsentExperiment;
	/** UI options, or `false` for headless use. */
	ui?: ConsentUIOptions | false;
	/** Package name reported on `window.inth`. */
	pkg?: string;
}

/**
 * What `init()` and `createConsentClient()` from `@inth/sdk`,
 * `@inth/sdk/headless` and `@inth/sdk/iab-client` accept.
 *
 * @example
 * ```ts
 * import { init } from '@inth/sdk-browser';
 *
 * init({ projectUrl: 'https://your-project.inth.app' });
 * ```
 */
export interface ConsentClientOptions extends ConsentClientBaseOptions {
	/**
	 * Backend URL: your Inth project URL. Required unless `mode` is
	 * `testing()` or `enabled` is `false`.
	 */
	projectUrl?: string;
	/**
	 * How the visitor's policy is resolved.
	 *
	 * - Omitted, or `hosted()`: ask `${projectUrl}/init`.
	 * - `manifest()`: resolve from the backend's consent manifest in the
	 *   browser, falling back to `/init` with a warning when it is
	 *   unavailable. Import it only if you use it, so the bundler leaves
	 *   it out otherwise.
	 * - `testing()` from `@inth/sdk/testing`: resolve a policy with no
	 *   backend, for tests. It throws in production builds.
	 */
	mode?: ProviderTransportFactory | HostedMode | ConsentTesting;
}

/**
 * What the script-tag builds accept, from the tag's `data-*` attributes
 * and `inth.push(['config', {...}])`. A no-code site can queue
 * serializable options, transport factories, callbacks, and DOM
 * containers that way.
 */
export interface ScriptTagClientOptions extends ConsentClientBaseOptions {
	/**
	 * Transport. A name picks one of the built-in modes; a factory from
	 * `inth.manifest()` is used as is. Defaults to `manifest` when a
	 * manifest is given, otherwise `hosted`.
	 */
	mode?: ProviderTransportFactory | ConsentModeName;
	/**
	 * Backend origin: your Inth project URL. Required, except in
	 * `c15t.testing.js`.
	 */
	projectUrl?: string;
	/** Inline consent manifest for `manifest` mode. */
	manifest?: ConsentManifest;
	/**
	 * Manifest URL for `manifest` mode. URLs other than the backend's
	 * `/manifest` endpoint require an explicit `projectUrl`.
	 */
	manifestUrl?: string;
}

/** Options for `@inth/sdk/hosted` and the default `c15t.js` bundle. */
export interface HostedConsentClientOptions extends Omit<
	ScriptTagClientOptions,
	'mode' | 'manifest' | 'manifestUrl'
> {
	/** Defaults to hosted. Factories must have `kind: 'hosted'`. */
	mode?: 'hosted' | HostedMode | ProviderTransportFactory;
	/** Hosted bundles do not resolve manifests in the browser. */
	manifest?: never;
	/** Hosted bundles do not fetch manifests in the browser. */
	manifestUrl?: never;
}

/** Options for `c15t.testing.js`. */
export interface TestingScriptTagOptions extends Omit<
	ScriptTagClientOptions,
	'mode' | 'projectUrl' | 'manifest' | 'manifestUrl'
> {
	/**
	 * Always `testing()`: a value from `c15t.testing()`, or a transport
	 * factory a test stands in for the backend with, is used as is.
	 */
	mode?: ConsentTesting | ProviderTransportFactory;
	/**
	 * Policy rules to resolve instead of the recommended pack. A preset name
	 * such as `'europeOptIn'` stands in for
	 * `policyRulePresets.europeOptIn()`, so a JSON config or a
	 * `data-policy` attribute can name them.
	 */
	policy?: (PolicyRule | PolicyPresetName)[];
	/** The testing file needs no backend. */
	projectUrl?: never;
	/** The testing file resolves rules, not manifests. */
	manifest?: never;
	/** The testing file does not fetch manifests. */
	manifestUrl?: never;
}

/** Handle on a mounted UI. */
export interface ConsentUIHandle {
	/** The element appended to the container. */
	readonly host: HTMLElement;
	/** Where the surfaces render: the shadow root, or the host itself. */
	readonly root: ShadowRoot | HTMLElement;
	/** Re-render against the current snapshot. */
	update: () => void;
	/** Remove every surface and the host. */
	destroy: () => void;
}

/** Mounts the prebuilt UI for a client. */
export type ConsentUIMounter = (
	client: ConsentClient,
	options?: ConsentUIOptions
) => ConsentUIHandle;

/** Events a client emits, and their payloads. */
export interface ConsentClientEventMap {
	/** The policy resolved and the runtime is ready to render. */
	ready: ConsentSnapshot;
	/** A consent value changed. */
	consent: ConsentSnapshot;
	/** The surface the runtime wants shown changed. */
	ui: KernelActiveUI;
	/** The banner or the dialog became visible. Count it as an impression. */
	surfaceShown: OnSurfaceShownPayload;
	/** A transport call failed. */
	error: unknown;
}

/** The page's consent client. */
export interface ConsentClient {
	/** The runtime that owns this page's kernel. */
	readonly runtime: ConsentRuntime;
	/** The kernel: snapshot, commands and events. */
	readonly kernel: ConsentKernel;
	/** The options the client was created with. */
	readonly options: ScriptTagClientOptions;
	/**
	 * `options.presentation` with the assigned experiment arm merged over it.
	 * Equal to `options.presentation` while no experiment is configured or
	 * assigned. Surfaces render from this, not from `options.presentation`.
	 */
	readonly presentation: ConsentPresentation | undefined;
	/**
	 * `options.ui.theme` with the assigned experiment arm's `theme` merged
	 * over it. Equal to `options.ui.theme` while no experiment is configured
	 * or assigned, and `undefined` for a headless client.
	 */
	readonly theme: Theme | undefined;
	/** Which transport is in use. */
	readonly mode: ConsentModeName | 'testing' | 'custom';
	/** Categories the UI should offer, after policy filtering. */
	readonly consentCategories: AllConsentNames[];
	/** The mounted UI, if any. */
	readonly ui: ConsentUIHandle | null;
	/** Whether `start()` has run. */
	readonly started: boolean;
	/** The current consent snapshot. */
	getSnapshot: () => ConsentSnapshot;
	/**
	 * Observe every snapshot change.
	 *
	 * @param listener - Called with each new snapshot.
	 * @returns An unsubscribe function.
	 */
	subscribe: (listener: (snapshot: ConsentSnapshot) => void) => Unsubscribe;
	/**
	 * Resolves once the policy is resolved and the UI can render. A
	 * returning visitor with stored consent resolves as soon as init lands
	 * too, so callers can rely on `hasConsented()` afterwards.
	 */
	ready: () => Promise<ConsentSnapshot>;
	/**
	 * Whether the given category (or condition) is granted.
	 *
	 * @param condition - A category name or a `has()` condition.
	 */
	has: (condition: HasCondition<AllConsentNames>) => boolean;
	/**
	 * Whether the visitor has already made a choice, or acknowledged a
	 * banner that had only strictly necessary to show.
	 */
	hasConsented: () => boolean;
	/** Grant every offered category and close the UI. */
	acceptAll: () => Promise<SaveResult>;
	/** Grant only strictly necessary and close the UI. */
	rejectAll: () => Promise<SaveResult>;
	/**
	 * Persist a specific set of consents and close the UI.
	 *
	 * @param consents - Categories to grant or deny, and optionally
	 * per-vendor grants under `vendors`.
	 */
	save: (consents: ConsentSaveInput) => Promise<SaveResult>;
	/**
	 * Vendors declared for vendor-level consent: from the `vendors` option,
	 * the backend, and the slugs on scripts, gated tags and iframes. Empty
	 * under an IAB policy, where the TC string decides.
	 */
	getDeclaredVendors: () => readonly ResolvedVendor[];
	/**
	 * The visitor's recorded vendor decision: the ids they turned off.
	 *
	 * @returns The decision, whose `denied` list is empty after a bulk action
	 * lifted every denial, or `null` when no vendor decision was recorded.
	 */
	getVendorChoice: () => Readonly<VendorChoice> | null;
	/**
	 * Whether a vendor may load: it is declared, its category condition
	 * passes, and outside an IAB policy the visitor has not turned it off.
	 *
	 * @param vendorId - Vendor id as declared in `vendors`, on a script or by
	 * the backend.
	 * @returns `true` while the vendor may load. An id nothing declares, such
	 * as a typo, returns `false` and logs a development warning.
	 */
	isVendorAllowed: (vendorId: string) => boolean;
	/** Confirm the current IAB vendor/purpose draft through the CMP. */
	saveIAB: () => Promise<SaveResult>;
	/** Acknowledge a notice without recording category choices. */
	dismissNotice: () => Promise<NoticeDismissResult>;
	/** Show the banner. */
	showBanner: () => void;
	/** Open the preference centre. */
	openDialog: () => void;
	/** Close the preference centre (or banner). */
	closeDialog: () => void;
	/**
	 * Switch language and re-resolve translations.
	 *
	 * @param code - A BCP 47 language tag.
	 */
	setLanguage: (code: string) => void;
	/**
	 * Merge into the geo, language and GPC context: a key you pass replaces
	 * its value, `undefined` clears it, and a key you leave out stays.
	 *
	 * @param overrides - The keys to change.
	 */
	setOverrides: (overrides: KernelOverrides) => void;
	/**
	 * Associate the consent record with an external identity.
	 *
	 * @param user - The external user.
	 */
	identify: (user: KernelUser) => Promise<void>;
	/**
	 * Listen for a client event.
	 *
	 * Once the policy is resolved, a new `ready` listener runs at once and
	 * a new `ui` listener receives the surface currently up, so wiring
	 * attached after a fast init misses nothing. A listener that throws is
	 * reported with `console.error`; the listeners after it and the matching
	 * `inth:*` document event still run.
	 *
	 * @param event - The event name.
	 * @param listener - Called with the event payload.
	 * @returns An unsubscribe function.
	 */
	on: <EventName extends keyof ConsentClientEventMap>(
		event: EventName,
		listener: (payload: ConsentClientEventMap[EventName]) => void
	) => Unsubscribe;
	/**
	 * Mount the prebuilt UI. Throws in the headless build.
	 *
	 * @param options - UI options; defaults to `options.ui`.
	 */
	mountUI: (options?: ConsentUIOptions) => ConsentUIHandle;
	/**
	 * Scan every iframe on the page and apply the current consent: pause
	 * gated frames (`data-category`, `data-vendor`) that are not allowed and
	 * restore the ones that are. The blocker does this on its own; call it
	 * yourself when `iframeBlocker.disableAutomaticBlocking` is set, after
	 * adding frames and after consent changes. A no-op before `start()`,
	 * after `dispose()`, and when `iframeBlocker` is `false`.
	 *
	 * @example
	 * ```ts
	 * const client = init({ iframeBlocker: { disableAutomaticBlocking: true } });
	 * client.on('consent', () => client.processIframes());
	 * container.append(embed);
	 * client.processIframes();
	 * ```
	 */
	processIframes: () => void;
	/** Start the runtime and mount the UI. Idempotent. */
	start: () => void;
	/** Tear everything down. */
	dispose: () => void;
}
