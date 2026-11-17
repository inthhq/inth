/**
 * The consent client on web, over the browser engine from `@c15t/core`.
 *
 * iOS and Android run consent in the native core, and the client in
 * `native/client.ts` only reads its snapshot. A web build has no native core,
 * so this file runs the same engine the Inth web SDKs run: a `@c15t/core`
 * runtime with persistence, talking to the same Inth project. It implements
 * the {@link ConsentClient} contract, so the provider, the hooks, the headless
 * components and the drawn components are the same code on all three
 * platforms.
 *
 * The kernel snapshot is mapped onto the React Native snapshot shape. Fields
 * that have no web source are said to be absent in the way the native
 * contract defines absence: `iab`, `gppString` and `iabMarketingPurposes`
 * are `null`, because this client does not run IAB TCF or GPP. The features
 * that exist only on a device answer the way a device without them answers:
 * App Tracking Transparency is `unsupported`, as on Android, and there are no
 * native consent screens, as in a build with `nativeUI: false`.
 *
 * Only `*.web.ts` files may import `@c15t/core`, and only web bundles reach
 * them; `src/__tests__/dependency-boundary.test.ts` holds both rules.
 */

import type {
	ConsentSnapshot as KernelSnapshot,
	KernelTransport,
	ProviderTransportFactory,
} from '@c15t/core';
import { createConsentRuntime } from '@c15t/core/runtime';
import type { ConsentRuntime, ConsentRuntimeOptions } from '@c15t/core/runtime';
import { createHostedTransport, custom, hosted } from '@c15t/core/transports';

import { normalizeProjectURL } from '../expo-plugin/project-url';
import { denyAllSnapshot } from '../lib/deny-all-snapshot';
import {
	categoryDecision,
	isCategoryAllowed,
	isPromptOwed,
	isSnapshotReady,
} from '../lib/selectors';
import { isTrackingPermitted } from '../lib/tracking';
import type {
	ConsentClient,
	SnapshotEquality,
	SnapshotSelector,
} from '../native/client';
import { watchWithoutNativeUI } from '../native/without-native-ui';
import type {
	BootstrapPayload,
	CommitIntent,
	CommitResult,
	ConsentSnapshot,
	NativeOverridesInput,
	TrackingAuthorization,
	TrackingRequestPayload,
} from '../protocol';
import { DEFAULT_NATIVE_LANGUAGE } from '../protocol/overrides';
import {
	MAX_SUPPORTED_PROTOCOL_VERSION,
	MIN_SUPPORTED_PROTOCOL_VERSION,
	PROTOCOL_VERSION,
} from '../protocol/version';
import type {
	AllConsentNames,
	OptionalConsentCategory,
} from '../protocol/vocabulary';
import { OPTIONAL_CONSENT_CATEGORIES } from '../protocol/vocabulary';
import type { WebConsentOptions } from './expo-extra.web';

/**
 * Whether this is a production bundle.
 *
 * Reads the literal `process.env.NODE_ENV`, which Expo's bundler replaces
 * at build time, as `isProductionBuild` in `@c15t/core` does. A browser has
 * no `process`, so reading it through `globalThis.process` would hide the
 * value from that replacement and let `dryRun` run in a release. Without a
 * bundler the read throws and counts as development.
 */
const isProduction = (): boolean => {
	try {
		return process.env.NODE_ENV === 'production';
	} catch {
		return false;
	}
};

/** Whether two snapshots owe the same prompt under the same policy. */
const isSamePrompt = function isSamePrompt(
	previous: ConsentSnapshot,
	next: ConsentSnapshot
): boolean {
	const before = previous.promptRequirement;
	const owed = next.promptRequirement;
	return (
		before.kind === owed.kind &&
		('reason' in before ? before.reason : null) ===
			('reason' in owed ? owed.reason : null) &&
		previous.resolution.fingerprint === next.resolution.fingerprint
	);
};

/** The code the snapshot carries when a production bundle refuses `dryRun`. */
export const WEB_CONFIGURATION_DRY_RUN_CODE = 'INTH_CONFIGURATION_DRY_RUN';

/** What {@link createWebConsentClient} needs besides the options. */
export interface WebConsentClientDependencies {
	/**
	 * The transport, in place of the hosted one the options describe. Tests
	 * pass `offline()` with policy rules so nothing touches the network.
	 */
	readonly mode?: ProviderTransportFactory;
	/** Whether this is a production bundle. Defaults to the bundle's flag. */
	readonly production?: boolean;
}

/** One registered consumer and the value it last rendered. */
interface Subscriber<ResultType> {
	readonly selector: SnapshotSelector<ResultType>;
	readonly equals: SnapshotEquality<ResultType>;
	readonly onStoreChange: () => void;
	value: ResultType;
}

/** The fields the client keeps itself rather than reading off the kernel. */
interface ClientState {
	readonly revision: number;
	readonly ready: boolean;
	readonly promptOwedSince: number | null;
}

/**
 * The transport for `dryRun`: the project's real `/init`, and nothing sent.
 *
 * Native dry runs drop each consent record instead of queueing it, and
 * identity calls change local state only. The hosted transport is kept for
 * `init` alone, so the page still shows the project's policy.
 *
 * @param backendURL - The project URL.
 * @param domain - The `domain` a save would carry.
 * @returns A transport factory that never writes.
 */
const dryRunMode = function dryRunMode(
	backendURL: string,
	domain: string | undefined
): ProviderTransportFactory {
	const transport = createHostedTransport({ backendURL, domain });
	const dropping: KernelTransport = {
		identify: () => Promise.resolve(),
		init: (context) =>
			transport.init?.(context) ??
			Promise.reject(new Error('Inth: the hosted transport has no init.')),
		save: (payload) =>
			Promise.resolve({ ok: true, subjectId: payload.subjectId }),
	};
	return custom(dropping);
};

/** The resolution as the snapshot carries it: the kernel's, without the rule. */
const toResolution = function toResolution(
	resolution: KernelSnapshot['resolution']
): ConsentSnapshot['resolution'] {
	if (resolution.status === 'matched') {
		return {
			fingerprint: resolution.fingerprints.policy,
			policyId: resolution.policyId,
			status: 'matched',
		};
	}
	if (resolution.status === 'failed') {
		return {
			fingerprint: null,
			policyId: null,
			reason: resolution.reason,
			status: 'failed',
		};
	}
	return { fingerprint: null, policyId: null, status: resolution.status };
};

/**
 * The React Native snapshot for one kernel snapshot.
 *
 * @param kernel - The kernel snapshot.
 * @param categories - Categories the surfaces list.
 * @param state - The fields this client keeps itself.
 * @returns The snapshot the hooks read.
 * @internal
 */
export const toNativeSnapshot = function toNativeSnapshot(
	kernel: KernelSnapshot,
	categories: readonly AllConsentNames[],
	state: ClientState
): ConsentSnapshot {
	const { overrides, resolution, subject } = kernel;
	const { gpc } = kernel.privacySignals;

	return {
		activeUI: kernel.activeUI,
		consentCategories: categories,
		effectivePermissions: kernel.effectivePermissions,
		error:
			resolution.status === 'failed'
				? {
						code: resolution.reason,
						message: `Inth could not resolve the consent policy from the project (${resolution.reason}). Optional categories stay denied until it can.`,
					}
				: null,
		evaluatedAt: kernel.evaluatedAt,
		explicitChoice: kernel.explicitChoice,
		gppString: null,
		iab: null,
		iabMarketingPurposes: null,
		location: kernel.location,
		model: kernel.model,
		nextDeadline: kernel.nextDeadline,
		overrides: {
			country: overrides.country ?? null,
			gpc: overrides.gpc ?? null,
			language:
				overrides.language ??
				kernel.translations?.language ??
				DEFAULT_NATIVE_LANGUAGE,
			region: overrides.region ?? null,
		},
		policyPending: kernel.policyPending,
		policySnapshotToken: kernel.policySnapshotToken,
		privacySignals: {
			gpc: {
				active: gpc.active,
				detected: gpc.detected,
				override: gpc.override ?? null,
			},
		},
		promptOwedSince: state.promptOwedSince,
		promptRequirement: kernel.promptRequirement,
		ready: state.ready,
		resolution: toResolution(resolution),
		restrictions: kernel.restrictions,
		revision: state.revision,
		// Neither native subject model carries an identity provider, so the
		// snapshot does not either.
		subject:
			subject === null
				? null
				: (Object.fromEntries(
						Object.entries(subject).filter(
							([key]) => key !== 'identityProvider'
						)
					) as unknown as ConsentSnapshot['subject']),
		translations: kernel.translations,
	};
};

/** A failed commit, in the shape the native cores report one. */
const refusedCommit = function refusedCommit(
	reason: NonNullable<CommitResult['reason']>,
	snapshot: ConsentSnapshot,
	detail?: string
): CommitResult {
	const result: CommitResult = {
		confirmed: [],
		ok: false,
		queued: false,
		reason,
		revision: null,
		subjectId: snapshot.subject?.subjectId ?? null,
	};
	return detail === undefined ? result : { ...result, detail };
};

/** The rejection for the App Tracking Transparency request, which web lacks. */
const trackingUnsupported = function trackingUnsupported(): Error {
	return Object.assign(
		new Error(
			'Inth: App Tracking Transparency is an iOS prompt, and a web build has nothing to ask. Consent alone decides tracking on web.'
		),
		{ code: 'INTH_TRACKING_UNSUPPORTED' }
	);
};

/**
 * The save input for a commit intent, or `null` for an intent the web engine
 * cannot honour as written.
 */
const saveInputFor = function saveInputFor(
	intent: CommitIntent
): 'all' | 'none' | Partial<Record<OptionalConsentCategory, boolean>> | null {
	// As the native decoders do, refuse any key the action does not take, so a
	// malformed intent such as `consents` on `all` is never widened.
	const allowed =
		intent.action === 'explicit'
			? ['action', 'consents', 'revision']
			: ['action'];
	if (Object.keys(intent).some((key) => !allowed.includes(key))) {
		return null;
	}
	if (intent.action === 'all') {
		return 'all';
	}
	if (intent.action === 'necessary') {
		return 'none';
	}
	if (intent.action !== 'explicit') {
		return null;
	}
	// Exactly the categories the subject touched, as on native, so a partial
	// save cannot renew a receipt nobody looked at.
	if (
		typeof intent.consents !== 'object' ||
		intent.consents === null ||
		Array.isArray(intent.consents)
	) {
		return null;
	}
	const picked: Partial<Record<OptionalConsentCategory, boolean>> = {};
	for (const [key, value] of Object.entries(intent.consents)) {
		if (
			!(OPTIONAL_CONSENT_CATEGORIES as readonly string[]).includes(key) ||
			typeof value !== 'boolean'
		) {
			return null;
		}
		picked[key as OptionalConsentCategory] = value;
	}
	return picked;
};

/** What an intent the decoder refused carries for diagnostics. */
const intentDetail = (intent: unknown): string =>
	String(JSON.stringify(intent)).slice(0, 200);

/**
 * The refusal an intent earns before anything is saved, or null to go ahead.
 *
 * @param intent - What the caller passed, which untyped callers can get wrong.
 * @param current - The snapshot the intent is checked against.
 * @returns The refusal, or null.
 */
const intentRefusal = function intentRefusal(
	intent: CommitIntent,
	current: ConsentSnapshot
): CommitResult | null {
	// Refuse a non-object like the bridge decoders do, rather than throw.
	if (typeof intent !== 'object' || intent === null) {
		return refusedCommit('invalid-intent', current, intentDetail(intent));
	}
	if (intent.action === 'iab') {
		return refusedCommit(
			'iab-unavailable',
			current,
			'IAB TCF runs in the native cores. The web client records category consent only.'
		);
	}
	if (
		intent.action === 'explicit' &&
		intent.revision !== undefined &&
		intent.revision !== current.revision
	) {
		return refusedCommit('concurrent-change', current);
	}
	return null;
};

/**
 * Build the web consent client.
 *
 * Nothing touches the browser until the first subscriber or the first action.
 * The server render of a statically rendered Expo Router page and the first
 * client render then read the same not-ready snapshot, so hydration matches,
 * and storage and `/init` are read right after.
 *
 * @param options - The project URL and the other plugin values.
 * @param dependencies - Test seams.
 * @returns A client. Call {@link ConsentClient.dispose} to stop the engine.
 * @throws {ProjectURLError} When `backendURL` breaks the project URL rule.
 */
// oxlint-disable-next-line max-lines-per-function, max-statements -- One closure holds the client state, as `createConsentClient` does on native.
export const createWebConsentClient = function createWebConsentClient(
	options: WebConsentOptions,
	dependencies: WebConsentClientDependencies = {}
): ConsentClient {
	const production = dependencies.production ?? isProduction();
	const dryRun = options.dryRun === true;
	const backendURL = normalizeProjectURL(options.backendURL, {
		relaxed: dryRun,
	});
	const domain = options.domain ?? undefined;

	const bootstrap: BootstrapPayload = {
		commitRevision: true,
		// Read before the engine loads storage, so it cannot know yet. The web
		// docs tell apps to wait for a ready snapshot instead.
		hasStoredSnapshot: false,
		maxSupportedProtocolVersion: MAX_SUPPORTED_PROTOCOL_VERSION,
		minSupportedProtocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION,
		nativeSdkVersion: 'web',
		// No native consent screens: the app draws its consent UI in JavaScript.
		nativeUI: false,
		protocolVersion: PROTOCOL_VERSION,
		// There is no native handshake. The browser engine assigns the subject
		// id when it reads storage, and `snapshot.subject` carries it.
		subjectId: null,
	};

	// A production bundle refuses dryRun, as a native release build does: no
	// engine starts and every read answers deny-all.
	const refused = dryRun && production;
	if (refused) {
		// oxlint-disable-next-line no-console -- A consent engine that never starts must be visible in every build.
		console.error(
			`Inth: dryRun is on in a production web bundle, so Inth did not start and every optional category is denied (${WEB_CONFIGURATION_DRY_RUN_CODE}). Remove dryRun, or leave its environment variable unset, before you build a release.`
		);
	}

	const runtimeOptions: ConsentRuntimeOptions & { backendURL: string } = {
		backendURL,
		consentCategories:
			options.consentCategories === null ||
			options.consentCategories === undefined
				? undefined
				: [...options.consentCategories],
		mode:
			dependencies.mode ??
			(dryRun
				? dryRunMode(backendURL, domain)
				: hosted({ backendURL, domain })),
		// A decision input from the first request on, so /init resolves the
		// policy for a GPC visitor; the kernel derives the signal from it.
		...(options.forceGPC === true && { overrides: { gpc: true } }),
		pkg: '@inth/react-native',
		// A native app does not restart when consent is withdrawn, so neither
		// does the page: consumers hear the change through the client.
		reloadOnConsentRevoked: false,
	};
	const runtime: ConsentRuntime | null = refused
		? null
		: createConsentRuntime(runtimeOptions);

	const subscribers = new Set<Subscriber<unknown>>();
	const trackingSubscribers = new Set<() => void>();

	let revision = 0;
	let ready = false;
	let promptOwedSince: number | null = null;
	let mappedFrom: KernelSnapshot | null = null;
	const unstarted = denyAllSnapshot(
		refused
			? `dryRun is on in a production web bundle, so Inth did not start (${WEB_CONFIGURATION_DRY_RUN_CODE}).`
			: 'The web consent engine has not started yet.'
	);
	let snapshot: ConsentSnapshot = refused
		? {
				...unstarted,
				error: {
					code: WEB_CONFIGURATION_DRY_RUN_CODE,
					message: unstarted.error?.message ?? '',
				},
			}
		: unstarted;

	/** The snapshot for the kernel's current state, rebuilt only when it moved. */
	const read = function read(): ConsentSnapshot {
		if (runtime === null) {
			return snapshot;
		}
		const kernel = runtime.kernel.getSnapshot();
		// `ready` latches once storage was read and either a policy resolved or
		// storage held a decision: when a native core is ready after hydration.
		const nextReady =
			ready ||
			(runtime.started &&
				(!kernel.policyPending ||
					kernel.explicitChoice !== null ||
					kernel.noticeDismissal !== null));
		if (kernel === mappedFrom && nextReady === ready) {
			return snapshot;
		}
		const previous = snapshot;
		mappedFrom = kernel;
		ready = nextReady;
		revision += 1;
		const next = toNativeSnapshot(kernel, runtime.consentCategories, {
			promptOwedSince,
			ready,
			revision,
		});
		// The revision at which the prompt owed now became owed, so a new owed
		// prompt can be told from one already shown. As in both cores, the same
		// requirement under the same policy keeps its value; anything else owed
		// starts again.
		if (!isPromptOwed(next)) {
			promptOwedSince = null;
		} else if (
			!isPromptOwed(previous) ||
			promptOwedSince === null ||
			!isSamePrompt(previous, next)
		) {
			promptOwedSince = revision;
		}
		snapshot =
			next.promptOwedSince === promptOwedSince
				? next
				: { ...next, promptOwedSince };
		return snapshot;
	};

	/** Tell each subscriber whose slice moved, and only those. */
	const notify = function notify(): void {
		const current = read();
		for (const subscriber of [...subscribers]) {
			const value = subscriber.selector(current);
			if (subscriber.equals(subscriber.value, value)) {
				continue;
			}
			subscriber.value = value;
			subscriber.onStoreChange();
		}
	};

	const stopKernel =
		runtime?.kernel.subscribe(notify) ?? ((): void => undefined);

	/** Start the engine: storage, `/init` and the debug handle. Idempotent. */
	const start = function start(): void {
		if (runtime === null || runtime.started) {
			return;
		}
		runtime.start();
		// A start with no `document`, a server render, does nothing, and the
		// snapshot stays the not-ready one.
		notify();
	};

	const subscribeInternal = function subscribeInternal<ResultType>(
		selector: SnapshotSelector<ResultType>,
		onStoreChange: () => void,
		equals: SnapshotEquality<ResultType> = Object.is
	): () => void {
		const subscriber: Subscriber<ResultType> = {
			equals,
			onStoreChange,
			selector,
			value: selector(read()),
		};
		subscribers.add(subscriber as Subscriber<unknown>);
		return () => {
			subscribers.delete(subscriber as Subscriber<unknown>);
		};
	};

	const commit = async function commit(
		intent: CommitIntent
	): Promise<CommitResult> {
		start();
		const current = read();
		if (runtime === null) {
			return refusedCommit('not-bootstrapped', current);
		}
		if (current.policyPending) {
			return refusedCommit('policy-pending', current);
		}
		const refusal = intentRefusal(intent, current);
		if (refusal !== null) {
			return refusal;
		}
		const input = saveInputFor(intent);
		if (input === null) {
			return refusedCommit('invalid-intent', current, intentDetail(intent));
		}
		// Core applies the local change before its first await, so the snapshot
		// read right after the call is the one this action produced; reading it
		// after the network wait could pick up another change.
		const pending = runtime.kernel.commands.save(input);
		const produced = read();
		const saved = await pending;
		const after = read();
		if (saved.issues !== undefined && saved.issues.length > 0) {
			return refusedCommit('invalid-intent', after, intentDetail(intent));
		}
		return {
			confirmed: [...(saved.confirmed ?? [])],
			// The transport's answer. A dry run sends nothing; a policy with the
			// none model, or a save that confirms no category, records nothing to
			// send even though core answers ok; and a save the network refused
			// waits in the engine's queue and is retried.
			delivered:
				saved.ok &&
				!dryRun &&
				current.model !== 'none' &&
				(saved.confirmed?.length ?? 0) > 0,
			ok: true,
			queued: !saved.ok,
			// null when the save changed nothing, such as under the none model.
			revision:
				produced.revision === current.revision ? null : produced.revision,
			subjectId: saved.subjectId ?? after.subject?.subjectId ?? null,
		};
	};

	const setOverrides = async function setOverrides(
		overrides: NativeOverridesInput
	): Promise<void> {
		start();
		if (runtime === null) {
			return;
		}
		// `null` clears a value, as on native; an omitted key keeps it.
		const next: Parameters<ConsentRuntime['setOverrides']>[0] = {};
		if ('country' in overrides) {
			next.country = overrides.country ?? undefined;
		}
		if ('region' in overrides) {
			next.region = overrides.region ?? undefined;
		}
		// forceGPC is configuration, not an override the app owns: clearing the
		// app's GPC override falls back to it, as native keeps it as a signal.
		if ('gpc' in overrides) {
			next.gpc =
				overrides.gpc ?? (options.forceGPC === true ? true : undefined);
		}
		if (overrides.language !== undefined) {
			next.language = overrides.language;
		}
		runtime.setOverrides(next);
		await runtime.reinit();
	};

	let stopWatching = (): void => undefined;
	let warnedLogout = false;

	const api: ConsentClient = {
		bootstrap,
		commit,
		decision: (category: AllConsentNames) => categoryDecision(read(), category),
		dismissNotice: (): void => {
			start();
			void runtime?.kernel.commands.dismissNotice();
		},
		dispose: (): void => {
			stopWatching();
			stopKernel();
			subscribers.clear();
			trackingSubscribers.clear();
			runtime?.dispose();
		},
		getSnapshot: read,
		getTrackingAnsweredAt: () => null,
		getTrackingAuthorization: (): TrackingAuthorization => 'unsupported',
		// The WebView bridge carries native consent into a page. On web the app
		// and the page run in one browser, so there is nothing to carry.
		getWebViewConsent: () => null,
		identify: async (externalId: string): Promise<void> => {
			start();
			await runtime?.identify({ externalId });
		},
		isAllowed: (category: AllConsentNames) =>
			isCategoryAllowed(read(), category),
		isReady: () => isSnapshotReady(read()),
		isTrackingAllowed: (category: AllConsentNames): boolean =>
			category === 'necessary' ||
			isTrackingPermitted(categoryDecision(read(), category), 'unsupported'),
		logout: (): Promise<void> => {
			// The browser engine cannot detach an external id: it stays linked
			// until the page reloads. Consent stays with the Inth subject id.
			if (!warnedLogout && !production) {
				warnedLogout = true;
				console.warn(
					'Inth: logout() changes nothing on web. The browser engine keeps the external id linked until the page reloads. Call reset() to drop the consent records on a shared device.'
				);
			}
			return Promise.resolve();
		},
		refresh: async (): Promise<void> => {
			start();
			await runtime?.reinit();
		},
		refreshTrackingAuthorization: (): TrackingAuthorization => 'unsupported',
		requestTracking: (): Promise<TrackingRequestPayload> =>
			Promise.reject(trackingUnsupported()),
		requestTrackingAuthorization: (): Promise<TrackingAuthorization> =>
			Promise.reject(trackingUnsupported()),
		reset: (): Promise<void> => {
			start();
			runtime?.clearRecords();
			return Promise.resolve();
		},
		setOverrides,
		subscribe: <ResultType>(
			selector: SnapshotSelector<ResultType>,
			onStoreChange: () => void,
			equals?: SnapshotEquality<ResultType>
		): (() => void) => {
			const unsubscribe = subscribeInternal(selector, onStoreChange, equals);
			// The first subscriber comes from the first committed render, after
			// hydration, so starting now arrives as an update.
			start();
			return unsubscribe;
		},
		subscribeTracking: (onTrackingChange: () => void): (() => void) => {
			// `unsupported` for the life of the page: nothing moves it.
			trackingSubscribers.add(onTrackingChange);
			return () => {
				trackingSubscribers.delete(onTrackingChange);
			};
		},
	};

	// Web has no stock native screens, so nothing else collects consent: say
	// when an owed prompt has no surface, as a `nativeUI: false` build does.
	// Watching does not start the engine; the first real subscriber does.
	if (runtime !== null) {
		// Surfaces claim the prompt on `api`, so the watcher keys its count on
		// `api` while reading through a view that does not start the engine.
		stopWatching = watchWithoutNativeUI(
			{ getSnapshot: read, subscribe: subscribeInternal },
			production,
			api
		);
	}

	return api;
};
