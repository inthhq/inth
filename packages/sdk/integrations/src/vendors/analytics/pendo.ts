/* oxlint-disable unicorn/no-thenable -- `if` and `callGlobal` steps have a `then` field. */
import type { AllConsentNames, Script } from '@inth/sdk/engine';
import type { ManifestCondition } from '@inth/sdk/manifest-runtime';

import { defineRemote } from '../../remote-define';
import { getCompiledManifest } from '../../resolve';
import { vendorManifestContract } from '../../types';
import type {
	ManifestStep,
	ResolvedManifest,
	VendorManifest,
} from '../../types';
import { levelThreeScript } from '../_shared/level-three';
import { readId, skipMissingId } from '../_shared/required-id';
import { createScriptReuse } from '../_shared/reuse-script';
import { withScriptUrl } from '../_shared/script-url';

declare global {
	interface Window {
		pendo?: {
			_q?: unknown[][];
			initialize: (options: Record<string, unknown>) => void;
			stopSendingEvents: () => void;
			startSendingEvents: () => void;
			isSendingEvents?: () => boolean;
		};
	}
}

/**
 * The script's own consent condition, filled in from the `category` config
 * value like the manifest's `category`. The vendor switch counts too: a
 * vendor the visitor turned off reads as every category denied.
 */
const categoryHolds = {
	consent: '{{category}}' as AllConsentNames,
} as const satisfies ManifestCondition;

const hasApi = {
	global: ['pendo'],
	is: 'defined',
} as const satisfies ManifestCondition;

/**
 * Flags: `initialized` once `initialize` ran; `on` while events are sent;
 * `off` once they were stopped; `granting` while an activation runs, cleared
 * by a withdrawal, even one inside `initialize`; `resume` when an activation
 * restarts events stopped before.
 */
const stopSending = [
	{
		then: [
			{ name: 'off', type: 'setFlag', value: true },
			{ name: 'on', type: 'setFlag', value: false },
			{ name: 'granting', type: 'setFlag', value: false },
			{ global: 'pendo', method: 'stopSendingEvents', type: 'callGlobal' },
		],
		type: 'if',
		when: {
			all: [{ loaded: true }, { not: { flag: 'off' } }, hasApi],
		},
	},
] as const satisfies ManifestStep[];

/** Runs a microtask after a grant, with consent read again then. */
const activate = [
	{
		then: [
			{ name: 'granting', type: 'setFlag', value: true },
			{ name: 'resume', type: 'setFlag', value: false },
		],
		type: 'if',
		when: {
			all: [{ loaded: true }, categoryHolds, { not: { flag: 'on' } }, hasApi],
		},
	},
	{
		then: [{ name: 'resume', type: 'setFlag', value: true }],
		type: 'if',
		when: { all: [{ flag: 'granting' }, { flag: 'off' }] },
	},
	{
		then: [
			{ name: 'initialized', type: 'setFlag', value: true },
			{ name: 'off', type: 'setFlag', value: false },
			{
				args: ['{{initializeOptions}}'],
				global: 'pendo',
				method: 'initialize',
				type: 'callGlobal',
			},
		],
		type: 'if',
		when: { all: [{ flag: 'granting' }, { not: { flag: 'initialized' } }] },
	},
	{
		then: [
			{ global: 'pendo', method: 'startSendingEvents', type: 'callGlobal' },
		],
		type: 'if',
		when: { all: [{ flag: 'granting' }, { flag: 'resume' }] },
	},
	{
		then: [
			{ name: 'on', type: 'setFlag', value: true },
			{ name: 'off', type: 'setFlag', value: false },
			{ name: 'granting', type: 'setFlag', value: false },
		],
		type: 'if',
		when: { flag: 'granting' },
	},
] as const satisfies ManifestStep[];

/** Stops or starts sending events to match consent, once the agent loaded. */
const applyConsent = [
	{
		then: stopSending,
		type: 'if',
		when: { not: categoryHolds },
	},
	{
		// Activation waits a microtask, so a grant withdrawn in the same
		// task never starts Pendo.
		then: [{ steps: activate, type: 'defer' }],
		type: 'if',
		when: { all: [{ loaded: true }, categoryHolds, { not: { flag: 'on' } }] },
	},
] as const satisfies ManifestStep[];

/** Pendo's agent, without initialization before consent. */
export const pendoManifest: VendorManifest = {
	...vendorManifestContract,
	afterLoad: applyConsent,
	category: '{{category}}',
	install: [
		{
			async: true,
			src: 'https://cdn.pendo.io/agent/static/{{apiKeyPath}}/pendo.js',
			type: 'loadScript',
		},
	],
	onConsentChange: applyConsent,
	onDispose: stopSending,
	persistAfterConsentRevoked: true,
	vendor: 'pendo',
	vendorDetails: {
		homepageUrl: 'https://www.pendo.io/',
		legalName: 'Pendo.io, Inc.',
		name: 'Pendo',
		privacyPolicyUrl: 'https://www.pendo.io/legal/privacy-policy/',
	},
};

export interface PendoOptions {
	/** Public Pendo application key. */
	apiKey: string;
	/** Visitor metadata passed to initialize. */
	visitor?: Record<string, unknown>;
	/** Account metadata passed to initialize. */
	account?: Record<string, unknown>;
	/** SDK initialization options, including disableCookies and excludeAllText. */
	initializeOptions?: Record<string, unknown>;
	/** Consent condition required before loading. @default 'measurement' */
	category?: Script['category'];
	/** Custom, regional or proxied agent URL. */
	scriptUrl?: string;
}

/**
 * Builds the serializable manifest behind {@link pendo}. The API key must
 * already be trimmed and non-empty.
 */
export const resolvePendoManifest = function resolvePendoManifest({
	account,
	apiKey,
	category = 'measurement',
	initializeOptions,
	visitor,
}: Omit<PendoOptions, 'scriptUrl'>): ResolvedManifest {
	const options: Record<string, unknown> = { ...initializeOptions };
	if (visitor) {
		options.visitor = visitor;
	}
	if (account) {
		options.account = account;
	}
	return getCompiledManifest(pendoManifest, {
		apiKeyPath: encodeURIComponent(apiKey),
		category,
		initializeOptions: options,
	});
};

/**
 * What the Inth server may set for this vendor. The npm helper calls the same
 * resolver; visitor and account identity stay in the site's code, and
 * `initializeOptions`, a custom consent condition and `scriptUrl` stay
 * npm-only. Marked pure so a bundler drops it from an npm bundle that never
 * reads it.
 */
export const remote =
	/* @__PURE__ */
	defineRemote(
		'pendo',
		{
			apiKey: {
				example: '0123abcd-4567-89ef-0123-456789abcdef',
				kind: 'id',
				label: 'API key',
				pattern: '^[A-Za-z0-9_-]{1,64}$',
				required: true,
			},
		},
		resolvePendoManifest
	);

const reusePendo = createScriptReuse<PendoOptions>();

/**
 * Logs a loaded agent that installed no `window.pendo`, after each
 * callback that would have started or stopped it. A manifest cannot log:
 * `console` is a browser global, so the remote form stays silent.
 */
const logMissingApi = function logMissingApi(script: Script): Script {
	const loaded = new WeakSet<HTMLScriptElement>();
	const report = (element: HTMLScriptElement | undefined) => {
		if (element && loaded.has(element) && !window.pendo) {
			console.error('pendo: loader did not install the Pendo API');
		}
	};
	const { onConsentChange, onDispose, onError, onLoad } = script;
	/* oxlint-disable integrations/no-vendor-callbacks -- npm-only: logs a loader that installed no Pendo API, which a manifest cannot */
	script.onError = (info) => {
		if (info.element) {
			loaded.delete(info.element);
		}
		onError?.(info);
	};
	script.onLoad = (info) => {
		if (info.element) {
			loaded.add(info.element);
		}
		onLoad?.(info);
		report(info.element);
	};
	script.onConsentChange = (info) => {
		onConsentChange?.(info);
		report(info.element);
	};
	script.onDispose = (info) => {
		onDispose?.(info);
		report(info.element);
	};
	/* oxlint-enable integrations/no-vendor-callbacks */
	return script;
};

/**
 * Initializes Pendo only after consent, then stops/resumes event sending.
 * The helper preserves identity on revoke. clearSession creates an anonymous
 * identity and can send identification events; it is not a shutdown API.
 * @param options - Application key, identity metadata and agent options.
 * @returns A gated script, or an inactive script for a missing API key.
 * @example pendo({ apiKey: 'YOUR_API_KEY', visitor: { id: 'VISITOR_ID' } });
 * @see https://web-sdk.pendo.io/public/events
 */
export const pendo = function pendo(options: PendoOptions): Script {
	const apiKey = readId(options?.apiKey);
	if (!apiKey) {
		return skipMissingId('pendo', 'apiKey', {
			category: options?.category ?? 'measurement',
			manifest: pendoManifest,
		});
	}
	return reusePendo(options, ({ scriptUrl, ...saved }) =>
		logMissingApi(
			withScriptUrl(
				levelThreeScript(resolvePendoManifest({ ...saved, apiKey })),
				scriptUrl
			)
		)
	);
};
