import type { AllConsentNames, HasCondition, Script } from '@inth/sdk/engine';
import {
	SENTRY_DEFAULT_VERSION,
	sentryCdnFile,
	sentryCdnScript,
	sentrySdkScript,
} from '@inth/sdk/manifest-runtime/adapters/sentry';
import type {
	SentryAdapterOptions,
	SentryClient,
	SentryInitOptions,
	SentryLoadMode,
	SentryReplay,
	SentryUser,
} from '@inth/sdk/manifest-runtime/adapters/sentry';

import { resolvedManifestToScript } from '../../engine/runtime';
import { defineRemote } from '../../remote-define';
import type { RemoteOptionValues } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import {
	createScriptReuse,
	getScriptRegistrations,
} from '../_shared/reuse-script';
import { trimToUndefined } from '../_shared/script-url';

export type {
	SentryClient,
	SentryEnvelope,
	SentryEvent,
	SentryInitOptions,
	SentryLoadMode,
	SentryReplay,
	SentryReplayRecordingMode,
	SentrySession,
	SentryUser,
} from '@inth/sdk/manifest-runtime/adapters/sentry';

export interface SentryReplayOptions {
	/**
	 * Permission Replay needs before it loads or records. The PII permission
	 * must also be allowed because Replay records page URLs.
	 * @default 'measurement'
	 */
	category?: HasCondition<AllConsentNames>;
	/**
	 * Returns a new `replayIntegration()`. Called at most once per Sentry
	 * client, the first time Replay is allowed. Keep `replayIntegration` in a
	 * module of its own and import it dynamically here, so the recorder
	 * downloads only after consent.
	 */
	load: () => SentryReplay | Promise<SentryReplay>;
}

export interface SentryCdnReplayOptions {
	/**
	 * Permission Replay needs before it loads or records. The PII permission
	 * must also be allowed because Replay records page URLs.
	 * @default 'measurement'
	 */
	category?: HasCondition<AllConsentNames>;
	/**
	 * Options for the page's first `replayIntegration()`, such as `maskAllText`.
	 * CDN client replacements reuse that recorder and retain these options.
	 */
	options?: Record<string, unknown>;
}

export interface SentryPiiOptions {
	/**
	 * Permission Sentry needs for SDK data collection, including user data,
	 * cookies, headers, bodies, query parameters and IP inference.
	 * @default 'measurement'
	 */
	category?: HasCondition<AllConsentNames>;
	/** Returns the user to pass to `setUser` when the permission is allowed. */
	user?: () => SentryUser | null | undefined;
}

interface SentrySharedOptions {
	/**
	 * When Sentry runs. With `after-consent` and your own SDK, pass `init`.
	 * @default 'always'
	 */
	loadMode?: SentryLoadMode;
	/** Gate SDK data collection, user fields and IP inference. */
	pii?: SentryPiiOptions;
	/**
	 * Receives Sentry CDN load and start failures, and Replay load, start
	 * and stop failures. Without it, the adapter reports them to an
	 * available Sentry client with the tag
	 * `inth.integration: sentry`.
	 */
	onError?: (error: unknown) => void;
}

/** Inth loads Sentry from Sentry's CDN and calls `Sentry.init`. */
export interface SentryCdnOptions extends SentrySharedOptions {
	/** Your project's DSN, from Sentry's project settings. */
	dsn: string;
	/**
	 * Options for `Sentry.init`, such as `release`, `environment`,
	 * `tracesSampleRate` and the Replay sample rates. `integrations` runs
	 * after Sentry loads, so it can read `window.Sentry`.
	 */
	initOptions?: Record<string, unknown>;
	/**
	 * Sentry SDK version to load. The default version loads with subresource
	 * integrity; another version loads without it.
	 * @default '11.4.0'
	 */
	version?: string;
	/**
	 * Load the bundle with tracing and add `browserTracingIntegration()`.
	 * @default true when `initOptions` sets `tracesSampleRate` or `tracesSampler`
	 */
	tracing?: boolean;
	/**
	 * Session Replay. Loads `replay.min.js` once Replay is allowed and the
	 * Replay sample rates in `initOptions` are above 0. `false` never loads it.
	 */
	replay?: SentryCdnReplayOptions | false;
	getClient?: never;
}

/** Your app runs the Sentry SDK, from npm or a script tag. */
export interface SentrySdkOptions extends SentrySharedOptions {
	/**
	 * Returns the app's Sentry client. Pass `getClient` from your Sentry SDK.
	 * It is read on every consent change, so the adapter also works when
	 * Inth starts before `Sentry.init`.
	 */
	getClient: () => SentryClient | undefined;
	/**
	 * `setUser` from your Sentry SDK. Called with `null` while user data is
	 * not allowed, and with `pii.user()` when it becomes allowed.
	 */
	setUser?: (user: SentryUser | null) => void;
	/**
	 * Starts Sentry with the supplied options, including the consent integration.
	 * Pass your SDK's `init`, or a callback that forwards these options to it.
	 * Inth calls it once, when `loadMode` allows Sentry to run. Required with
	 * `loadMode: 'after-consent'`. Ignoring the supplied options leaves startup
	 * captures unprotected.
	 */
	init?: (options: SentryInitOptions) => unknown;
	/** Options passed to the SDK's `init`, including its DSN and sample rates. */
	initOptions?: Record<string, unknown>;
	/** Gate Session Replay. Without it, the adapter only stops a Replay the app added itself. */
	replay?: SentryReplayOptions;
	dsn?: never;
}

export type SentryOptions = SentryCdnOptions | SentrySdkOptions;

const scriptId = 'sentry';
const defaultCategory: AllConsentNames = 'measurement';
const errorsCategory: AllConsentNames = 'measurement';

/**
 * Loads the Sentry browser SDK from Sentry's CDN. The Sentry adapter in
 * `@inth/sdk` calls `Sentry.init` and handles consent.
 */
export const sentryManifest = {
	...vendorManifestContract,
	alwaysLoad: true,
	category: 'necessary',
	install: [
		{
			async: true,
			attributes: {
				crossorigin: 'anonymous',
				integrity: '{{integrity}}',
			},
			src: 'https://browser.sentry-cdn.com/{{version}}/{{bundle}}',
			type: 'loadScript',
		},
	],
	observeConsentBeforeLoad: true,
	// Independent loaders may select different versions or bundle types.
	// Share only the physical resource that matches this configuration.
	resourceKey: 'sentry-{{version}}-{{bundle}}',
	vendor: 'sentry',
	vendorDetails: {
		homepageUrl: 'https://sentry.io/',
		legalName: 'Functional Software, Inc.',
		name: 'Sentry',
		privacyPolicyUrl: 'https://sentry.io/privacy/',
	},
} as const satisfies VendorManifest;

const hasPositiveRate = (value: unknown): boolean =>
	typeof value === 'number' && value > 0;

const hasReplayLoader = (options: SentryOptions): boolean => {
	if (options.dsn === undefined) {
		return options.replay !== undefined;
	}
	return (
		options.replay !== false &&
		(hasPositiveRate(options.initOptions?.replaysSessionSampleRate) ||
			hasPositiveRate(options.initOptions?.replaysOnErrorSampleRate))
	);
};

const replayCategoryOf = (
	options: SentryOptions
): HasCondition<AllConsentNames> =>
	(options.replay ? options.replay.category : undefined) ?? defaultCategory;

const getScriptCategory = (
	options: SentryOptions
): HasCondition<AllConsentNames> => {
	const afterConsent = options.loadMode === 'after-consent';
	// The loader registers the categories a script names. Naming the feature
	// categories here lets Inth offer them; `necessary` keeps it always true.
	const features: HasCondition<AllConsentNames> = {
		or: [
			...new Set<HasCondition<AllConsentNames>>([
				'necessary',
				...(afterConsent ? [errorsCategory] : []),
				...(hasReplayLoader(options) ? [replayCategoryOf(options)] : []),
				options.pii?.category ?? defaultCategory,
			]),
		],
	};
	// Sentry from the CDN loads only once error monitoring may run.
	if (afterConsent && options.dsn !== undefined) {
		return { and: [errorsCategory, features] };
	}
	return features;
};

/** What the Sentry adapter needs for the CDN options a site passes. */
const adapterOptions = (options: SentryCdnOptions): SentryAdapterOptions => {
	const initOptions = options.initOptions ?? {};
	const replay: SentryAdapterOptions['replay'] = {
		category: replayCategoryOf(options),
		load: hasReplayLoader(options),
	};
	if (options.replay && options.replay.options !== undefined) {
		replay.options = options.replay.options;
	}
	return {
		// `sentry()` skips a blank DSN before this runs.
		dsn: readId(options.dsn) ?? '',
		initOptions,
		loadMode: options.loadMode ?? 'always',
		piiCategory: options.pii?.category ?? defaultCategory,
		replay,
		tracing:
			options.tracing ??
			(initOptions.tracesSampleRate !== undefined ||
				initOptions.tracesSampler !== undefined),
		version: trimToUndefined(options.version) ?? SENTRY_DEFAULT_VERSION,
	};
};

/**
 * The manifest for Sentry from its CDN: the bundle the options select,
 * pinned with subresource integrity at the default version, and the Sentry
 * adapter with the options it runs with. The npm helper and the Inth
 * server both build it here.
 */
export const resolveSentryManifest = function resolveSentryManifest(
	options: SentryCdnOptions
): ResolvedManifest {
	const settings = adapterOptions(options);
	const bundle = settings.tracing ? 'bundle.tracing.min.js' : 'bundle.min.js';
	return {
		...getCompiledManifest(sentryManifest, {
			bundle,
			integrity: sentryCdnFile(settings.version, bundle).integrity,
			version: settings.version,
		}),
		adapter: {
			id: 'sentry',
			options: settings as unknown as NonNullable<
				ResolvedManifest['adapter']
			>['options'],
		},
		alwaysLoad: options.loadMode === 'after-consent' ? undefined : true,
		category: getScriptCategory(options),
		requires: 4,
	};
};

/** A sample rate a dashboard may set: a number from 0 to 1. */
const rate = (label: string, example: number) =>
	({
		example,
		kind: 'number',
		label,
		max: 1,
		min: 0,
		required: false,
	}) as const;

/** The DSN parts and other options a dashboard sets. */
type SentryRemoteOptions = RemoteOptionValues<typeof sentryRemoteOptions>;

/**
 * What the Inth server may set for Sentry. A dashboard takes the parts of a
 * sentry.io DSN, not the DSN itself: no option holds a URL, so the DSN is
 * built on Sentry's own ingest host. A self-hosted Sentry stays npm-only,
 * as do function options, a user, an error handler and the app-SDK mode.
 */
const sentryRemoteOptions = {
	ingestRegion: {
		default: 'none',
		kind: 'enum',
		label: 'Region in the DSN host (o0.ingest.<region>.sentry.io)',
		values: ['none', 'us', 'de'],
	},
	initOptions: {
		fields: {
			environment: {
				example: 'production',
				kind: 'id',
				label: 'Environment',
				pattern: '^[A-Za-z0-9_.-]{1,64}$',
				required: false,
			},
			release: {
				example: 'my-app@1.0.0',
				kind: 'id',
				label: 'Release',
				pattern: '^[A-Za-z0-9_.+@-]{1,200}$',
				required: false,
			},
			replaysOnErrorSampleRate: rate('Replay sample rate on error', 1),
			replaysSessionSampleRate: rate('Replay session sample rate', 0.1),
			sampleRate: rate('Error sample rate', 1),
			tracesSampleRate: rate('Traces sample rate', 0.1),
		},
		kind: 'object',
		label: 'Sentry.init options',
		required: false,
	},
	loadMode: {
		default: 'always',
		kind: 'enum',
		label: 'When Sentry runs',
		values: ['always', 'after-consent'],
	},
	organizationId: {
		example: '123456',
		kind: 'id',
		label: 'Organization ID (the number after o in the DSN host)',
		pattern: '^[0-9]{1,20}$',
		required: true,
	},
	projectId: {
		example: '7890',
		kind: 'id',
		label: 'Project ID (the end of the DSN)',
		pattern: '^[0-9]{1,20}$',
		required: true,
	},
	publicKey: {
		example: 'examplePublicKey',
		kind: 'id',
		label: 'Public key (the DSN before @)',
		pattern: '^[0-9A-Za-z]{1,64}$',
		required: true,
	},
	version: {
		example: '11.4.0',
		kind: 'id',
		label: 'Sentry SDK version',
		pattern: '^[0-9]{1,4}\\.[0-9]{1,4}\\.[0-9]{1,4}$',
		required: false,
	},
} as const;

/** The manifest for options a dashboard set: their DSN on Sentry's host. */
const resolveSentryRemote = ({
	ingestRegion,
	organizationId,
	projectId,
	publicKey,
	...options
}: SentryRemoteOptions): ResolvedManifest =>
	resolveSentryManifest({
		...options,
		dsn: `https://${publicKey}@o${organizationId}.ingest${ingestRegion === 'none' ? '' : `.${ingestRegion}`}.sentry.io/${projectId}`,
	});

/**
 * Marked pure so a bundler drops it from an npm bundle that never reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote('sentry', sentryRemoteOptions, resolveSentryRemote);

/** Build the SDK or CDN script and its consent gate. */
const createSentryScript = (options: SentryOptions): Script => {
	if (options.dsn !== undefined) {
		const { adapter, ...manifest } = resolveSentryManifest(options);
		return sentryCdnScript(
			resolvedManifestToScript(manifest),
			adapter?.options as unknown as SentryAdapterOptions,
			{
				// oxlint-disable-next-line integrations/no-vendor-callbacks -- npm-only: passes the site's onError option to the consent gate, not a script callback
				onError: options.onError,
				registrations: getScriptRegistrations,
				user: options.pii?.user,
			}
		);
	}

	if (options.pii?.user && !options.setUser) {
		throw new Error('sentry: pass setUser with pii.user');
	}
	const errorsGated = options.loadMode === 'after-consent';
	if (errorsGated && !options.init) {
		throw new Error(
			"sentry: pass init with loadMode 'after-consent', so Inth can start Sentry after consent"
		);
	}
	// The site's own Sentry SDK is code only the site can pass: npm-only.
	return sentrySdkScript(
		{
			alwaysLoad: true,
			callbackOnly: true,
			category: getScriptCategory(options),
			id: scriptId,
			// Like the manifest helpers, the script ID doubles as the vendor slug,
			// so visitors can turn Sentry off inside a granted category. The
			// details let the preference surface list it by name.
			vendor: scriptId,
			vendorDetails: sentryManifest.vendorDetails,
		},
		{
			errorsGated,
			getClient: options.getClient,
			init: options.init,
			initOptions: options.initOptions,
			loadReplay: options.replay?.load,
			// oxlint-disable-next-line integrations/no-vendor-callbacks -- npm-only: passes the site's onError option to the consent gate, not a script callback
			onError: options.onError,
			piiCategory: options.pii?.category ?? defaultCategory,
			registrations: getScriptRegistrations,
			replayCategory: replayCategoryOf(options),
			setUser: options.setUser,
			user: options.pii?.user,
		}
	);
};

const reuseSentryScript = createScriptReuse<SentryOptions>();

/**
 * Run Sentry with Inth consent: error monitoring, Session Replay and user
 * data.
 *
 * Pass `dsn` and Inth loads Sentry from Sentry's CDN, pinned and with
 * subresource integrity, then calls `Sentry.init`. Pass `getClient` instead
 * when your app runs the Sentry SDK itself.
 *
 * Error monitoring runs for every visitor unless `loadMode` is
 * `after-consent`. Replay loads and records only once its permission is
 * allowed, and stops on withdrawal. While user data is not allowed, events
 * and sessions carry no user and Sentry infers no IP address.
 *
 * The script's vendor slug is `sentry`; while a visitor has that vendor
 * turned off, Replay and user data are treated as denied, as is error
 * monitoring with `loadMode: 'after-consent'`.
 *
 * Equal configurations share a script before mounting and across remounts,
 * without interrupting an active Replay recording.
 * Keep callback functions stable when recreating the options object.
 * Distinct configurations targeting the same client also share consent:
 * every active configuration must allow each feature before it can run.
 *
 * @param options - A DSN for Inth to load Sentry, or your Sentry SDK functions.
 * @throws {Error} If `pii.user` is set without `setUser`, or
 *   `loadMode: 'after-consent'` is set with `getClient` but without `init`.
 * @remarks When `dsn` is blank, or neither `dsn` nor `getClient` is passed,
 *   the helper logs `sentry: missing or invalid dsn` with `console.error`
 *   and returns a script that never loads.
 * @example
 * ```ts
 * sentry({
 * 	dsn: 'https://your-key@o0.ingest.sentry.io/0',
 * 	initOptions: {
 * 		replaysSessionSampleRate: 0.1,
 * 		replaysOnErrorSampleRate: 1,
 * 	},
 * });
 * ```
 * @example
 * ```ts
 * import { getClient, setUser } from '@sentry/browser';
 *
 * sentry({
 * 	getClient,
 * 	setUser,
 * 	replay: {
 * 		load: () => import('./sentry-replay').then((m) => m.createReplay()),
 * 	},
 * });
 * ```
 */
export const sentry = (options: SentryOptions): Script => {
	// Without a DSN or `getClient` there is nothing to load or adapt to.
	const missingDsn =
		options.dsn === undefined
			? typeof options.getClient !== 'function'
			: readId(options.dsn) === undefined;
	if (missingDsn) {
		return skipMissingId('sentry', 'dsn', {
			category: getScriptCategory(options),
			manifest: sentryManifest,
		});
	}
	return reuseSentryScript(options, createSentryScript);
};
