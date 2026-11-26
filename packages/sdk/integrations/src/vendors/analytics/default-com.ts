import type { Script } from '@inth/sdk/engine';
import {
	defaultComFormsScript,
	defaultComPixelScript,
} from '@inth/sdk/manifest-runtime/adapters/default-com';
import type {
	DefaultComAdapterOptions,
	DefaultComAutoDisplayScheduler,
	DefaultComExtras,
	DefaultComFormsAdapterOptions,
	DefaultComFormsSdkInitOptions,
	DefaultComPixelAdapterOptions,
} from '@inth/sdk/manifest-runtime/adapters/default-com';

import { resolvedManifestToScript } from '../../engine/runtime';
import type { IntegrationConsentCondition } from '../../registry';
import { defineRemote } from '../../remote-define';
import type { RemoteOptionValues } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type { ResolvedManifest, VendorManifest } from '../../types';
import { readId, skipMissingId } from '../_shared/required-id';
import { trimToUndefined, withScriptUrl } from '../_shared/script-url';

export type {
	DefaultComAutoDisplayScheduler,
	DefaultComFormsSdkInitOptions,
} from '@inth/sdk/manifest-runtime/adapters/default-com';

/** Options for the current Default Pixel. */
export interface DefaultComPixelOptions {
	/** Scheduler display setting forwarded to Default without modification. */
	autoDisplayScheduler?: DefaultComAutoDisplayScheduler;
	/**
	 * Consent required to permit tracking and, by default, load the Pixel.
	 * @default 'measurement'
	 */
	category?: IntegrationConsentCondition;
	/**
	 * `always` loads before consent and forwards the current consent state.
	 * Default can still fetch its form list, capture forms and show a scheduler.
	 * @default 'after-consent'
	 */
	loadMode?: 'after-consent' | 'always';
	/** Public key from your Default workspace. Whitespace is trimmed. */
	publicKey: string;
	/** Scheduler origins allowed by your Default workspace. */
	schedulerOrigins?: string[];
	/**
	 * Custom or proxied loader for the current Pixel generation.
	 * Blank values use the default URL.
	 * @default 'https://handshake.default.com/index.js'
	 */
	scriptUrl?: string;
}

/** Options for a standalone Default Forms SDK installation. */
export interface DefaultComFormsSdkOptions extends Omit<
	DefaultComPixelOptions,
	'category' | 'loadMode'
> {
	/** Scheduler display setting. Omission restores the default `true`. */
	autoDisplayScheduler?: DefaultComAutoDisplayScheduler;
	/**
	 * Consent required to load and initialize the standalone Forms SDK.
	 * @default 'functionality'
	 */
	category?: IntegrationConsentCondition;
	/** Default API endpoint override, for example a configured same-origin proxy. */
	endpoint?: string;
	/**
	 * Custom or proxied loader for the current Forms SDK generation.
	 * Blank values use the default URL.
	 * @default 'https://handshake.default.com/sdk.js'
	 */
	scriptUrl?: string;
}

interface DefaultComConsent {
	analytics: boolean;
	marketing: boolean;
}

interface DefaultComPixelBootstrap {
	autoDisplayScheduler?: DefaultComAutoDisplayScheduler;
	key?: string;
	q?: unknown[];
	schedulerOrigins?: string[];
	/** Update either or both permissions. Omitted fields retain their value. */
	setConsent?: (consent: Partial<DefaultComConsent>) => void;
}

/** Field values accepted by Default's manual form submission API. */
export type DefaultComFormResponses = Record<
	string,
	string | number | boolean | string[] | null
>;

/** Manual submission to a Pixel form ID, an HTML form ID, or both. */
export type DefaultComSubmitFormOptions = {
	autoDisplayScheduler?: DefaultComAutoDisplayScheduler;
	metadata?: Record<string, unknown>;
	responses: DefaultComFormResponses;
} & (
	| { formId: string; pixelFormId?: string }
	| { formId?: string; pixelFormId: string }
);

/** Result of a submission request, which does not prove workflow delivery. */
export type DefaultComSubmitFormResult =
	| {
			error: string;
			/** HTTP status, or zero when the request never reached Default. */
			status: number;
			success: false;
	  }
	| {
			redirect?: { url: string };
			scheduler?: { url: string };
			status: number;
			success: true;
			/** Unvalidated server response. Narrow before reading workflow fields. */
			workflow?: unknown;
	  };

/** Email-field warmup for hosts without a native form element. */
export interface DefaultComFormInteractionOptions {
	eventType?: string;
	fieldName: string;
	fieldType?: string;
	fieldValue: string;
	formId?: string;
	formName?: string;
	responses?: Record<string, string>;
}

/** Scheduler event payloads documented by Default. */
export interface DefaultComSchedulerEventMap {
	closed: undefined;
	displayed: { bookingParam: string; orgSlug: string };
	meeting_booked: {
		meetingId: string;
		personEmail: string;
		startTime: string;
	};
	meeting_cancelled: { meetingId: string };
	/** Reserved by Default; delivery is not guaranteed. */
	meeting_timeout: { meetingId?: string };
}

/** Subscribe to a scheduler event and receive an unsubscribe function. */
export type DefaultComSchedulerSubscription<
	EventType extends keyof DefaultComSchedulerEventMap,
> = (
	handler: (payload: DefaultComSchedulerEventMap[EventType]) => void
) => () => void;

/** Scheduler display and event helpers available on DefaultPixelSDK. */
export interface DefaultComScheduler {
	/**
	 * Display a scheduler URL using modal, inline or disabled behavior.
	 * @param url - Scheduler URL returned by Default.
	 * @param option - Display configuration. Defaults to a modal.
	 * @returns A function that removes the displayed scheduler.
	 */
	display: (url: string, option?: DefaultComAutoDisplayScheduler) => () => void;
	onClosed: DefaultComSchedulerSubscription<'closed'>;
	onDisplayed: DefaultComSchedulerSubscription<'displayed'>;
	onMeetingBooked: DefaultComSchedulerSubscription<'meeting_booked'>;
	onMeetingCancelled: DefaultComSchedulerSubscription<'meeting_cancelled'>;
	onMeetingTimeout: DefaultComSchedulerSubscription<'meeting_timeout'>;
}

/** Public standalone Forms SDK API, loaded after its configured consent. */
export interface DefaultComFormsSdkClient {
	/** Configure the SDK and start it on the first call. */
	init: (options: DefaultComFormsSdkInitOptions) => void;
	/**
	 * Subscribe to an event from an allowed scheduler origin.
	 * @param eventType - Scheduler event name.
	 * @param handler - Callback receiving that event's payload.
	 * @returns A function that removes the subscription.
	 */
	on: <EventType extends keyof DefaultComSchedulerEventMap>(
		eventType: EventType,
		handler: (payload: DefaultComSchedulerEventMap[EventType]) => void
	) => () => void;
	/** Warm form context for pre-enrichment, swallowing request failures. */
	recordFormInteraction: (
		options: DefaultComFormInteractionOptions
	) => Promise<void>;
	scheduler: DefaultComScheduler;
	/** Update either or both permissions. Omitted fields retain their value. */
	setConsent: (consent: Partial<DefaultComConsent>) => void;
	/** Submit form values and return Default's request result. */
	submitForm: (
		options: DefaultComSubmitFormOptions
	) => Promise<DefaultComSubmitFormResult>;
}

declare global {
	interface Window {
		__defaultPixel__?: DefaultComPixelBootstrap;
		DefaultPixel?: Pick<
			DefaultComFormsSdkClient,
			'on' | 'scheduler' | 'submitForm'
		>;
		DefaultPixelSDK?: DefaultComFormsSdkClient;
	}
}

const vendorDetails = {
	homepageUrl: 'https://www.default.com/',
	legalName: 'Tomo HQ, Inc.',
	name: 'Default',
	privacyPolicyUrl: 'https://www.default.com/legal/privacy',
};

/**
 * Current Default Pixel loader. The Default adapter in `@inth/sdk` queues
 * its configuration and consent before it runs.
 */
export const defaultComPixelManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			async: true,
			src: 'https://handshake.default.com/index.js',
			type: 'loadScript',
		},
	],
	persistAfterConsentRevoked: true,
	vendor: 'default-com',
	vendorDetails,
} as const satisfies VendorManifest;

/**
 * Standalone Forms SDK loader. Shares the Pixel's preference-center vendor.
 * Initially denied owners still gate the shared SDK, and sdk.js keeps
 * document listeners and a page-level module, so running it again on
 * remount would leave capture bound to the disposed client.
 */
export const defaultComFormsSdkManifest = {
	...vendorManifestContract,
	category: '{{category}}',
	install: [
		{
			async: true,
			src: 'https://handshake.default.com/sdk.js',
			type: 'loadScript',
		},
	],
	observeConsentBeforeLoad: true,
	persistAfterConsentRevoked: true,
	persistAfterDispose: true,
	vendor: 'default-com',
	vendorDetails,
} as const satisfies VendorManifest;

/** The adapter field for `options`, as a manifest carries it. */
const adapterField = (
	options: DefaultComAdapterOptions
): NonNullable<ResolvedManifest['adapter']> => ({
	id: 'default-com',
	options: JSON.parse(JSON.stringify(options)) as NonNullable<
		ResolvedManifest['adapter']
	>['options'],
});

/** The scheduler switch a manifest carries; a container is npm-only. */
const displaySwitch = (
	display: DefaultComAutoDisplayScheduler | undefined
): boolean | undefined => (typeof display === 'boolean' ? display : undefined);

/**
 * The manifest for the Default Pixel: index.js from Default's host, and the
 * Default adapter with the workspace key, load mode and scheduler settings.
 * The npm helper and the Inth server both build it here.
 */
export const resolveDefaultComPixelManifest =
	function resolveDefaultComPixelManifest(
		options: Omit<DefaultComPixelOptions, 'scriptUrl'>
	): ResolvedManifest {
		const settings: DefaultComPixelAdapterOptions = {
			autoDisplayScheduler: displaySwitch(options.autoDisplayScheduler),
			loadMode: options.loadMode ?? 'after-consent',
			product: 'pixel',
			publicKey: options.publicKey,
			schedulerOrigins: options.schedulerOrigins?.slice(),
		};
		return {
			...getCompiledManifest(defaultComPixelManifest, {
				category: options.category ?? 'measurement',
			}),
			adapter: adapterField(settings),
			requires: 4,
		};
	};

/**
 * The manifest for the standalone Forms SDK: sdk.js from Default's host,
 * and the Default adapter with the workspace key and scheduler settings.
 */
export const resolveDefaultComFormsSdkManifest =
	function resolveDefaultComFormsSdkManifest(
		options: Omit<DefaultComFormsSdkOptions, 'endpoint' | 'scriptUrl'>
	): ResolvedManifest {
		const settings: DefaultComFormsAdapterOptions = {
			autoDisplayScheduler: displaySwitch(options.autoDisplayScheduler),
			product: 'forms',
			publicKey: options.publicKey,
			schedulerOrigins: options.schedulerOrigins?.slice(),
		};
		return {
			...getCompiledManifest(defaultComFormsSdkManifest, {
				category: options.category ?? 'functionality',
			}),
			adapter: adapterField(settings),
			requires: 4,
		};
	};

const defaultComRemoteOptions = {
	autoDisplayScheduler: {
		default: 'default',
		kind: 'enum',
		label:
			"Show Default's scheduler: Default's own setting, as a modal, or not",
		values: ['default', 'modal', 'off'],
	},
	loadMode: {
		default: 'after-consent',
		kind: 'enum',
		label: 'When the Pixel loads',
		values: ['after-consent', 'always'],
	},
	product: {
		default: 'pixel',
		kind: 'enum',
		label: 'Product',
		values: ['pixel', 'forms'],
	},
	publicKey: {
		example: 'pk_abc123',
		kind: 'id',
		label: 'Public key',
		pattern: '^[0-9A-Za-z_-]{1,128}$',
		required: true,
	},
	schedulerDomains: {
		example: 'example.com',
		kind: 'idList',
		label: 'Scheduler domains, served over https',
		maxItems: 10,
		pattern:
			'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$',
		required: false,
	},
} as const;

/**
 * The manifest for options a dashboard set. Scheduler origins arrive as
 * domain names, so no option holds a URL; `loadMode` is the Pixel's only.
 */
const resolveDefaultComRemote = ({
	autoDisplayScheduler,
	loadMode,
	product,
	publicKey,
	schedulerDomains,
}: RemoteOptionValues<typeof defaultComRemoteOptions>): ResolvedManifest => {
	const shared = {
		autoDisplayScheduler:
			autoDisplayScheduler === 'default'
				? undefined
				: autoDisplayScheduler === 'modal',
		publicKey,
		schedulerOrigins: schedulerDomains?.map((domain) => `https://${domain}`),
	};
	return product === 'pixel'
		? resolveDefaultComPixelManifest({ ...shared, loadMode })
		: resolveDefaultComFormsSdkManifest(shared);
};

/**
 * What the Inth server may set for Default: the Pixel or the Forms SDK,
 * with the workspace key and scheduler settings. Script URLs, the Forms
 * SDK's endpoint, a scheduler container and the consent condition are
 * npm-only. Marked pure so a bundler drops it from an npm bundle that never
 * reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'defaultComPixel',
		defaultComRemoteOptions,
		resolveDefaultComRemote
	);

/** What only the site's code can pass: a scheduler container. */
const extrasOf = (
	display: DefaultComAutoDisplayScheduler | undefined
): DefaultComExtras =>
	typeof display === 'object' ? { autoDisplayScheduler: display } : {};

/**
 * Loads the current Default Pixel after measurement consent by default.
 *
 * @param options - Workspace key, consent gate, load mode and Pixel configuration.
 * @returns A consent-aware script, or a skipped script for an invalid key.
 * @remarks
 * Use one Default helper per page. The first helper to load claims the page.
 * A conflicting helper logs an error and disables its loader before insertion.
 * The claim lasts until navigation, including after withdrawal or disposal.
 * A pre-existing Forms SDK global also prevents the Pixel loader from running.
 *
 * The Pixel receives measurement consent as `analytics` and marketing consent
 * as `marketing`. Effective helper or vendor denial sends both values as false.
 * Keep Inth's default revocation reload enabled. Default's consent API does not
 * stop form capture, scheduler activity or an already loaded Vector script.
 * `loadMode: 'always'` explicitly permits the loader and form-list requests
 * before consent, plus form capture and scheduling while tracking is denied.
 * The helper queues the current mapped state before inserting the loader.
 * After loading starts, configuration changes require a new document.
 * Missing, blank or non-string keys log an error and skip loading.
 * @throws {Error} If the workspace key, loader URL or scheduler settings change
 * after a Pixel helper starts in this document. The loader also rejects
 * pre-created configurations before replacing existing registrations.
 * @example defaultComPixel({ publicKey: 'YOUR_PUBLIC_KEY' });
 * @see https://docs.os.default.com/settings/pixel
 * @see https://docs.os.default.com/forms/privacy
 */
export const defaultComPixel = function defaultComPixel(
	options: DefaultComPixelOptions
): Script {
	const publicKey = readId(
		typeof options?.publicKey === 'string' ? options.publicKey : undefined
	);
	if (publicKey === undefined) {
		return skipMissingId('defaultComPixel', 'publicKey', {
			category: getCompiledManifest(defaultComPixelManifest, {
				category: options?.category ?? 'measurement',
			}).category,
			manifest: defaultComPixelManifest,
		});
	}
	const { adapter, ...manifest } = resolveDefaultComPixelManifest({
		...options,
		publicKey,
	});
	const script = defaultComPixelScript(
		// The site's own index.js URL is npm-only.
		withScriptUrl(resolvedManifestToScript(manifest), options.scriptUrl),
		adapter?.options as unknown as DefaultComPixelAdapterOptions,
		extrasOf(options.autoDisplayScheduler)
	);
	// Another Pixel on the page started with other settings.
	script.validate?.(script);
	return script;
};

/**
 * Loads the standalone Default Forms SDK after functionality consent by default.
 *
 * @param options - Public workspace key, SDK endpoint and scheduler options.
 * @returns A consent-gated SDK script, or a skipped script for an invalid key.
 * @remarks
 * Use one Default helper per page. The first permitted helper claims the page.
 * A conflicting helper logs an error and disables its loader before insertion.
 * The SDK loader is also blocked when `__defaultPixel__.key` already exists,
 * because the SDK would auto-initialize before this helper forwards consent.
 * This helper never clears or sets Pixel configuration. Claims last until
 * navigation, including after withdrawal or disposal.
 *
 * For a standalone installation, the helper calls `setConsent` before `init`
 * and starts each SDK client once per page. Later permitted configuration
 * changes call `init` again without restarting identity or session warmup.
 * Omitted endpoint and scheduler origins restore the SDK defaults; an omitted
 * scheduler display option restores `true`. This does not isolate workspace
 * identities. A load that finishes while denied receives both consent values
 * as false and waits for a later grant before initialization.
 * Removal and disposal withdraw consent from the owned SDK after its final
 * registration leaves. The loaded SDK stays for the page, and a later helper
 * with the same URL reuses it. A changed URL logs an error and does not load.
 * Keep Inth's default revocation reload enabled because
 * Default does not offer a complete form or scheduler shutdown API.
 * Missing, blank or non-string keys log an error and skip loading.
 * @example defaultComFormsSdk({ publicKey: 'YOUR_PUBLIC_KEY' });
 * @see https://docs.os.default.com/pixel-sdk-reference
 * @see https://docs.os.default.com/forms/privacy
 */
export const defaultComFormsSdk = function defaultComFormsSdk(
	options: DefaultComFormsSdkOptions
): Script {
	const publicKey = readId(
		typeof options?.publicKey === 'string' ? options.publicKey : undefined
	);
	if (publicKey === undefined) {
		return {
			...skipMissingId('defaultComFormsSdk', 'publicKey', {
				category: getCompiledManifest(defaultComFormsSdkManifest, {
					category: options?.category ?? 'functionality',
				}).category,
				manifest: defaultComFormsSdkManifest,
			}),
			id: 'default-com-forms-sdk',
		};
	}
	const { adapter, ...manifest } = resolveDefaultComFormsSdkManifest({
		...options,
		publicKey,
	});
	const extras = extrasOf(options.autoDisplayScheduler);
	// The API endpoint, such as a same-origin proxy, is npm-only.
	const endpoint = trimToUndefined(options.endpoint);
	if (endpoint !== undefined) {
		extras.endpoint = endpoint;
	}
	return defaultComFormsScript(
		// The site's own sdk.js URL is npm-only.
		withScriptUrl(resolvedManifestToScript(manifest), options.scriptUrl),
		adapter?.options as unknown as DefaultComFormsAdapterOptions,
		extras
	);
};
